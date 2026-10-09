/**
 * EncartShop — Edge Function: mp-webhook
 * Etapa 4: Webhook dedicado ao Mercado Pago
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ISOLAMENTO CRÍTICO — NUNCA VIOLAR ESTAS REGRAS                ║
 * ║                                                                  ║
 * ║  Esta função processa APENAS notificações do MERCADO PAGO.     ║
 * ║  É COMPLETAMENTE SEPARADA de:                                   ║
 * ║    • store-payment-webhook  (Asaas — INTOCADO)                  ║
 * ║    • asaas-webhook          (mensalidades — INTOCADO)           ║
 * ║                                                                  ║
 * ║  Esta função NUNCA:                                             ║
 * ║    ❌ Toca em stores.status ou stores.expires_at                ║
 * ║    ❌ Lê ou usa ASAAS_API_KEY ou MP_ACCESS_TOKEN de ambiente    ║
 * ║    ❌ Salva QR Code, PIX Copia e Cola, Access Token, tokens     ║
 * ║    ❌ Loga informações sensíveis (CPF, Access Token)            ║
 * ║    ❌ Confia cegamente no payload — sempre valida na API do MP  ║
 * ║                                                                  ║
 * ║  SEGURANÇA (dupla verificação):                                 ║
 * ║    1. Autenticidade — valida assinatura x-signature do MP       ║
 * ║    2. Fonte da verdade — busca o status real via GET /v1/payments/{id}║
 * ║    3. Idempotência   — bloqueia event_id e status terminal      ║
 * ║    4. Valor pago     — compara com o esperado em order_payments ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * COMO O MERCADO PAGO ENTREGA WEBHOOKS:
 *   - POST com body: { "action": "payment.updated", "data": { "id": "123" } }
 *   - Headers de assinatura: x-signature e x-request-id
 *   - O payload NÃO contém o status final — devemos consultar a API
 *
 * FLUXO:
 *   1. Recebe notificação do MP (só tem o ID do payment)
 *   2. Valida assinatura x-signature (HMAC-SHA256)
 *   3. Consulta API do MP → GET /v1/payments/{id} (fonte da verdade)
 *   4. Mapeia status do MP para status interno
 *   5. Verifica idempotência (event_id + status terminal)
 *   6. Valida valor pago vs esperado
 *   7. Atualiza order_payments
 *
 * Realtime: o UPDATE em order_payments propaga automaticamente via
 * Supabase Realtime (postgres_changes) — sem polling, sem F5.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Tipos ────────────────────────────────────────────────────────

interface MPNotification {
  action?:       string           // ex: "payment.updated", "payment.created"
  api_version?:  string
  data?: {
    id?: string | number         // ID do payment no MP
  }
  date_created?: string
  id?:           number           // ID da notificação
  live_mode?:    boolean
  type?:         string           // ex: "payment"
  user_id?:      string
}

interface MPPaymentDetail {
  id:                   number
  status:               string    // pending, approved, rejected, cancelled, refunded
  status_detail?:       string    // ex: accredited, by_merchant, by_admin
  transaction_amount:   number
  payment_method_id?:   string
  date_approved?:       string | null
  date_last_updated?:   string | null
  net_received_amount?: number
  external_reference?:  string
}

interface EventMapping {
  internalStatus:  string
  requiresPayment: boolean
}

// ── Mapeamento de status do Mercado Pago → status interno ────────
// Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/payment-management/payment-status-change

const MP_STATUS_MAP: Record<string, EventMapping> = {
  approved:   { internalStatus: 'confirmed', requiresPayment: true  },
  refunded:   { internalStatus: 'refunded',  requiresPayment: false },
  cancelled:  { internalStatus: 'cancelled', requiresPayment: false },
  // "rejected" não é terminal — o cliente pode tentar de novo.
  // Mantemos como 'pending' para não bloquear nova tentativa.
  rejected:   { internalStatus: 'pending',   requiresPayment: false },
}

// Qualquer status terminal bloqueia reprocessamento
const TERMINAL_STATUSES = new Set(['confirmed', 'refunded', 'cancelled'])

// Tolerância para divergência de valor (centavos de arredondamento)
const AMOUNT_TOLERANCE = 0.01

// Timeout para consulta à API do Mercado Pago
const MP_API_TIMEOUT_MS = 10_000

// ── Helpers ──────────────────────────────────────────────────────

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Logger de webhook ────────────────────────────────────────────
async function writeLog(
  db: ReturnType<typeof createClient>,
  params: {
    eventId?:       string | null
    gateway:        string
    paymentId?:     string | null
    eventType?:     string
    statusMapped?:  string | null
    processed:      boolean
    skipReason?:    string | null
    processingTime: number
  }
): Promise<void> {
  try {
    await db.from('payment_webhook_logs').insert([{
      event_id:        params.eventId        ?? null,
      gateway:         params.gateway,
      payment_id:      params.paymentId      ?? null,
      event_type:      params.eventType      ?? null,
      status_mapped:   params.statusMapped   ?? null,
      processed:       params.processed,
      skip_reason:     params.skipReason     ?? null,
      processing_time: params.processingTime,
    }])
  } catch (e: unknown) {
    console.error(`[mp-webhook] writeLog falhou: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── Idempotência ─────────────────────────────────────────────────
async function isDuplicateEvent(
  db: ReturnType<typeof createClient>,
  eventId: string
): Promise<boolean> {
  try {
    const { data } = await db
      .from('payment_webhook_logs')
      .select('id')
      .eq('event_id', eventId)
      .eq('processed', true)
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

// ── Validação de assinatura x-signature ─────────────────────────
/**
 * Valida a assinatura HMAC-SHA256 enviada pelo Mercado Pago.
 *
 * O MP envia no header 'x-signature' o valor no formato:
 *   ts=TIMESTAMP,v1=HASH
 *
 * A mensagem assinada é: "id:{payment_id};request-id:{x-request-id};ts:{ts};"
 *
 * O segredo é o "Secret" configurado no painel do MP em
 *   Suas Integrações → Webhooks → Configurar notificações → Secret
 *
 * Este segredo é armazenado em store_payment_secrets.webhook_token.
 * Se não estiver configurado, o webhook é aceito com aviso (onboarding gradual).
 */
async function validateMPSignature(
  db: ReturnType<typeof createClient>,
  storeId: string,
  paymentId: string,
  xSignature: string | null,
  xRequestId: string | null
): Promise<{ valid: boolean; reason: string }> {
  try {
    const { data } = await db
      .from('store_payment_secrets')
      .select('webhook_token')
      .eq('store_id', storeId)
      .eq('payment_provider', 'mercadopago')
      .maybeSingle()

    if (!data) {
      return { valid: false, reason: 'store_not_configured' }
    }

    // Se não há secret configurado: aceita com aviso (onboarding gradual)
    if (!data.webhook_token) {
      console.warn(
        `[mp-webhook] webhook_token (MP Secret) não configurado para store_id=${storeId}. ` +
        `Configure em Suas Integrações → Webhooks → Secret para maior segurança.`
      )
      return { valid: true, reason: 'no_secret_configured' }
    }

    if (!xSignature || !xRequestId) {
      return { valid: false, reason: 'missing_signature_headers' }
    }

    // Extrai ts e v1 do header x-signature
    const parts: Record<string, string> = {}
    for (const part of xSignature.split(',')) {
      const [key, val] = part.trim().split('=')
      if (key && val) parts[key] = val
    }

    const ts = parts['ts']
    const v1 = parts['v1']
    if (!ts || !v1) {
      return { valid: false, reason: 'malformed_signature' }
    }

    // Monta a mensagem que o MP assinou
    const message = `id:${paymentId};request-id:${xRequestId};ts:${ts};`

    // Calcula HMAC-SHA256
    const encoder    = new TextEncoder()
    const keyData    = encoder.encode(data.webhook_token)
    const msgData    = encoder.encode(message)
    const cryptoKey  = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature  = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const hashHex    = Array.from(new Uint8Array(signature))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('')

    if (hashHex !== v1) {
      return { valid: false, reason: 'signature_mismatch' }
    }

    return { valid: true, reason: 'signature_verified' }

  } catch (e: unknown) {
    console.error(`[mp-webhook] validateMPSignature error: ${e instanceof Error ? e.message : String(e)}`)
    return { valid: false, reason: 'validation_error' }
  }
}

// ── Consulta à API do Mercado Pago (fonte da verdade) ────────────
/**
 * O MP envia apenas o ID do payment na notificação.
 * Precisamos consultar a API para obter o status real.
 * Esta é a "fonte da verdade" — não confiamos no payload.
 *
 * Usa o access_token da loja (service_role → store_payment_secrets).
 */
async function fetchMPPaymentDetail(
  db: ReturnType<typeof createClient>,
  storeId: string,
  paymentId: string
): Promise<MPPaymentDetail | null> {
  // Busca o access_token da loja
  const { data: secretData, error: secretError } = await db
    .from('store_payment_secrets')
    .select('mp_access_token')
    .eq('store_id', storeId)
    .eq('payment_provider', 'mercadopago')
    .maybeSingle()

  if (secretError || !secretData?.mp_access_token) {
    console.error(`[mp-webhook] Access Token não encontrado | store_id=${storeId}`)
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MP_API_TIMEOUT_MS)

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${secretData.mp_access_token}`, // nunca logado
        'User-Agent':    'EncartShop/1.0',
      },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.error(`[mp-webhook] API MP retornou ${res.status} para payment_id=${paymentId}`)
      return null
    }

    return await res.json() as MPPaymentDetail

  } catch (e: unknown) {
    clearTimeout(timer)
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    console.error(`[mp-webhook] fetchMPPaymentDetail ${isTimeout ? 'timeout' : 'error'} | payment_id=${paymentId}`)
    return null
  }
}


// ── Handler principal ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const startTime = Date.now()

  // ── 1. Validação do método HTTP ───────────────────────────
  if (req.method !== 'POST') {
    return respond({ error: 'Método não permitido.' }, 405)
  }

  // ── 2. Cliente Supabase com service_role ──────────────────
  const db = createClient(
    Deno.env.get('SUPABASE_URL')              ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Lê headers de assinatura antes de consumir o body
  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  // ── 3. Parse e validação do payload ──────────────────────
  let notification: MPNotification
  try {
    const rawBody = await req.text()
    notification = JSON.parse(rawBody) as MPNotification
  } catch {
    console.warn('[mp-webhook] Payload inválido — não é JSON válido.')
    await writeLog(db, {
      gateway:        'mercadopago',
      processed:      false,
      skipReason:     'invalid_payload',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Payload inválido.' }, 400)
  }

  const action    = notification.action  ?? ''
  const paymentId = String(notification.data?.id ?? '')
  const eventType = action || (notification.type ?? '')
  // event_id: combina action + id da notificação para garantir unicidade
  const eventId   = `mp:${eventType}:${paymentId}`

  console.log(`[mp-webhook] Notificação recebida | action=${action} | payment_id=${paymentId}`)

  // ── 4. Aceita somente events de pagamento ────────────────
  // MP também envia eventos de 'merchant_order', 'plan', etc.
  // Ignoramos tudo que não seja de pagamento.
  if (!paymentId || !action.startsWith('payment.')) {
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'non_payment_event',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Evento não relacionado a pagamento — ignorado.' })
  }

  // ── 5. Idempotência: event_id duplicado ──────────────────
  if (await isDuplicateEvent(db, eventId)) {
    console.log(`[mp-webhook] Evento duplicado | action=${action} | payment_id=${paymentId}`)
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'duplicate',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Evento já processado anteriormente.' })
  }

  // ── 6. Localiza order_payment pelo gateway_payment_id ────
  const { data: orderPayment, error: opErr } = await db
    .from('order_payments')
    .select('id, store_id, order_id, status, amount, gateway')
    .eq('gateway_payment_id', paymentId)
    .eq('gateway', 'mercadopago')
    .maybeSingle()

  if (opErr) {
    console.error(`[mp-webhook] Erro ao buscar order_payment | payment_id=${paymentId} | ${opErr.message}`)
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'db_error',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Erro interno ao processar evento.' }, 500)
  }

  if (!orderPayment) {
    // Pode ser de outra integração MP (loja diferente, plataforma)
    console.log(`[mp-webhook] payment_id=${paymentId} não encontrado em order_payments.`)
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'payment_not_found',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Pagamento não encontrado no sistema.' })
  }

  // ── 7. Validação de assinatura HMAC-SHA256 ───────────────
  const authResult = await validateMPSignature(
    db, orderPayment.store_id, paymentId, xSignature, xRequestId
  )

  if (!authResult.valid) {
    console.warn(
      `[mp-webhook] Assinatura inválida | store_id=${orderPayment.store_id}` +
      ` | reason=${authResult.reason}`
    )
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: `auth_failed:${authResult.reason}`,
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Não autorizado.' }, 401)
  }

  // ── 8. Idempotência de status terminal ───────────────────
  if (TERMINAL_STATUSES.has(orderPayment.status)) {
    console.log(
      `[mp-webhook] Status já terminal — skip | ` +
      `order_payment_id=${orderPayment.id} | status=${orderPayment.status}`
    )
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'already_terminal',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Pagamento já processado.' })
  }

  // ── 9. Consulta API do MP — FONTE DA VERDADE ─────────────
  // Não confiamos no payload: buscamos o status real diretamente na API.
  const mpDetail = await fetchMPPaymentDetail(db, orderPayment.store_id, paymentId)

  if (!mpDetail) {
    console.error(`[mp-webhook] Falha ao obter detalhes do payment_id=${paymentId} na API do MP.`)
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: 'mp_api_error',
      processingTime: Date.now() - startTime,
    })
    // Retorna 500 para que o MP retente a entrega
    return respond({ error: 'Não foi possível verificar o pagamento no Mercado Pago.' }, 500)
  }

  // ── 10. Mapeamento de status ──────────────────────────────
  const mpStatus = mpDetail.status ?? ''
  const mapping  = MP_STATUS_MAP[mpStatus]

  if (!mapping) {
    // Status desconhecido (ex: 'in_process', 'charged_back') — loga e ignora
    console.log(`[mp-webhook] Status MP desconhecido ou não mapeado | status=${mpStatus} | payment_id=${paymentId}`)
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      processed: false, skipReason: `unknown_mp_status:${mpStatus}`,
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: `Status "${mpStatus}" não requer atualização.` })
  }

  // ── 11. Validação do valor recebido ──────────────────────
  if (mapping.requiresPayment) {
    const amountPaid     = Number(mpDetail.transaction_amount ?? 0)
    const amountExpected = Number(orderPayment.amount)
    const amountDiff     = Math.abs(amountPaid - amountExpected)

    if (amountPaid <= 0) {
      console.warn(`[mp-webhook] Valor pago inválido (≤ 0) | order_payment_id=${orderPayment.id} | value=${amountPaid}`)
      await writeLog(db, {
        eventId, gateway: 'mercadopago', paymentId, eventType,
        processed: false, skipReason: 'invalid_amount',
        processingTime: Date.now() - startTime,
      })
      return respond({ error: 'Valor inválido no evento de pagamento.' }, 400)
    }

    if (amountDiff > AMOUNT_TOLERANCE) {
      console.warn(
        `[mp-webhook] Valor divergente | order_payment_id=${orderPayment.id} | ` +
        `expected=${amountExpected} | received=${amountPaid} | diff=${amountDiff}`
      )
      await writeLog(db, {
        eventId, gateway: 'mercadopago', paymentId, eventType,
        statusMapped: 'amount_mismatch',
        processed: false, skipReason: `amount_mismatch:expected=${amountExpected}:received=${amountPaid}`,
        processingTime: Date.now() - startTime,
      })
      // Retorna 200 para o MP não re-tentar (divergência é permanente)
      return respond({ success: true, message: 'Valor divergente. Aguardando revisão manual.' })
    }
  }

  // ── 12. Atualiza order_payments ──────────────────────────
  const isPaid = mapping.internalStatus === 'confirmed'

  const updateData: Record<string, unknown> = {
    status:     mapping.internalStatus,
    updated_at: new Date().toISOString(),
    metadata: {
      last_webhook_event:  eventType,
      last_webhook_at:     new Date().toISOString(),
      mp_status:           mpDetail.status,
      mp_status_detail:    mpDetail.status_detail          ?? null,
      mp_date_approved:    mpDetail.date_approved          ?? null,
      mp_date_updated:     mpDetail.date_last_updated      ?? null,
      mp_net_amount:       mpDetail.net_received_amount    ?? null,
      mp_payment_method:   mpDetail.payment_method_id      ?? null,
      value_received:      mpDetail.transaction_amount     ?? null,
    },
  }

  if (isPaid) {
    updateData.paid_at = new Date().toISOString()
  }

  const { error: updateErr } = await db
    .from('order_payments')
    .update(updateData)
    .eq('id', orderPayment.id)

  if (updateErr) {
    console.error(
      `[mp-webhook] Erro ao atualizar order_payment | ` +
      `order_payment_id=${orderPayment.id} | ${updateErr.message}`
    )
    await writeLog(db, {
      eventId, gateway: 'mercadopago', paymentId, eventType,
      statusMapped: mapping.internalStatus,
      processed: false, skipReason: 'db_update_error',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Erro ao atualizar status do pagamento.' }, 500)
  }

  // ── 13. Log de sucesso ───────────────────────────────────
  const elapsed = Date.now() - startTime
  await writeLog(db, {
    eventId, gateway: 'mercadopago', paymentId, eventType,
    statusMapped: mapping.internalStatus,
    processed: true,
    processingTime: elapsed,
  })

  console.log(
    `[mp-webhook] Processado com sucesso | action=${action}` +
    ` | order_payment_id=${orderPayment.id} | status=${mapping.internalStatus}` +
    ` | mp_status=${mpStatus} | elapsed=${elapsed}ms`
  )

  return respond({ success: true, action, statusMapped: mapping.internalStatus })
})
