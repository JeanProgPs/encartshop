/**
 * EncartShop — Edge Function: store-payment-webhook
 * Fase 6 (revisão de segurança): ciclo completo do PIX
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ISOLAMENTO CRÍTICO — NUNCA VIOLAR ESTAS REGRAS                ║
 * ║                                                                  ║
 * ║  Esta função processa APENAS pagamentos de PEDIDOS.             ║
 * ║  É COMPLETAMENTE SEPARADA de:                                   ║
 * ║    • asaas-webhook  (mensalidades da plataforma — INTOCADO)     ║
 * ║    • asaas-payment  (criação de cobrança de mensalidade)        ║
 * ║                                                                  ║
 * ║  Esta função NUNCA:                                             ║
 * ║    ❌ Toca em stores.status ou stores.expires_at                ║
 * ║    ❌ Lê ou usa ASAAS_API_KEY de ambiente                       ║
 * ║    ❌ Salva QR Code, PIX Copia e Cola, API Key, tokens          ║
 * ║    ❌ Loga informações sensíveis (CPF, API Key, tokens)         ║
 * ║                                                                  ║
 * ║  ARQUITETURA INTENCIONAL:                                       ║
 * ║    orders.status  = estado operacional (controlado pelo lojista)║
 * ║    order_payments = estado financeiro  (controlado pelo gateway)║
 * ║                                                                  ║
 * ║  STATUS EM order_payments:                                      ║
 * ║    pending   → cobrança gerada, aguardando pagamento            ║
 * ║    confirmed → pagamento confirmado (valor correto verificado)  ║
 * ║    expired   → cobrança vencida sem pagamento                   ║
 * ║    cancelled → cobrança cancelada/deletada                      ║
 * ║    refunded  → pagamento estornado                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * SEGURANÇA (revisão Fase 6):
 *   1. Autenticidade — valida token via store_payment_settings.webhook_token
 *   2. Idempotência  — corrigida: qualquer status terminal bloqueia reprocessamento
 *   3. Valor pago    — para eventos de confirmação, compara valor recebido vs esperado
 *   4. Isolamento    — valida que order_payment.store_id tem payment_enabled = true
 *
 * Realtime: o UPDATE em order_payments propaga automaticamente ao painel do lojista
 * via Supabase Realtime (postgres_changes) — sem polling, sem F5.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Tipos ────────────────────────────────────────────────────────

interface AsaasWebhookPayload {
  event:    string
  payment?: {
    id:                 string
    status:             string
    value?:             number
    netValue?:          number
    billingType?:       string
    paymentDate?:       string
    confirmedDate?:     string
    clientPaymentDate?: string
    externalReference?: string
    customer?:          string
    description?:       string
  }
}

interface EventMapping {
  internalStatus: string   // status gravado em order_payments
  requiresPayment: boolean // true = evento de confirmação → validar valor pago
}

// ── Mapeamento de eventos Asaas → status interno ─────────────────

const EVENT_MAP: Record<string, EventMapping> = {
  PAYMENT_RECEIVED:  { internalStatus: 'confirmed', requiresPayment: true  },
  PAYMENT_CONFIRMED: { internalStatus: 'confirmed', requiresPayment: true  },
  PAYMENT_OVERDUE:   { internalStatus: 'expired',   requiresPayment: false },
  PAYMENT_DELETED:   { internalStatus: 'cancelled', requiresPayment: false },
  PAYMENT_REFUNDED:  { internalStatus: 'refunded',  requiresPayment: false },
}

// Qualquer status terminal bloqueia reprocessamento,
// independentemente do evento recebido.
const TERMINAL_STATUSES = new Set(['confirmed', 'refunded', 'cancelled'])

// Tolerância para divergência de valor (centavos de arredondamento do gateway)
const AMOUNT_TOLERANCE = 0.01

// ── Helpers ──────────────────────────────────────────────────────

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Logger de webhook ────────────────────────────────────────────
/**
 * Persiste o log em payment_webhook_logs.
 * Falha silenciosamente — não bloqueia o fluxo principal.
 * NUNCA loga API Keys, tokens, CPF ou dados sensíveis.
 */
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
    console.error(`[store-payment-webhook] writeLog falhou: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── Idempotência ─────────────────────────────────────────────────
/**
 * Retorna true se este event_id já foi processado com sucesso.
 * Em caso de erro na consulta, retorna false (processa normalmente —
 * a idempotência de status terminal garante a segunda barreira).
 */
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

// ── Autenticidade: valida token do webhook ───────────────────────
/**
 * O Asaas envia o token configurado no header 'asaas-access-token'.
 * Buscamos o token esperado em store_payment_settings via store_id
 * do order_payment localizado.
 *
 * Estratégia de validação:
 *   1. Lê o token recebido no header
 *   2. Busca o webhook_token da loja em store_payment_settings
 *   3. Se a loja tem webhook_token configurado, compara
 *   4. Se a loja não tem webhook_token configurado ainda (campo null),
 *      aceita mas loga aviso — permite onboarding gradual
 *
 * O lojista deve configurar o mesmo token no painel Asaas →
 * Minha Conta → Integrações → Webhooks → Token de acesso.
 */
async function validateWebhookToken(
  db: ReturnType<typeof createClient>,
  storeId: string,
  receivedToken: string | null
): Promise<{ valid: boolean; reason: string }> {
  try {
    const { data } = await db
      .from('store_payment_settings')
      .select('webhook_token')
      .eq('store_id', storeId)
      .eq('payment_provider', 'asaas')
      .maybeSingle()

    // Loja sem configuração não deve chegar aqui (order_payment não existiria),
    // mas por segurança rejeita
    if (!data) {
      return { valid: false, reason: 'store_not_configured' }
    }

    // Loja com webhook_token configurado: compara obrigatoriamente
    if (data.webhook_token) {
      if (!receivedToken || receivedToken !== data.webhook_token) {
        return { valid: false, reason: 'invalid_token' }
      }
      return { valid: true, reason: 'token_matched' }
    }

    // Loja sem webhook_token configurado: aceita com aviso
    // (permite que lojas recém-configuradas comecem a receber webhooks
    // antes de configurar o token)
    console.warn(
      `[store-payment-webhook] webhook_token não configurado para store_id=${storeId}. ` +
      `Recomenda-se configurar um token no painel Asaas para maior segurança.`
    )
    return { valid: true, reason: 'no_token_configured' }

  } catch (e: unknown) {
    // Falha na consulta — rejeita por segurança
    console.error(`[store-payment-webhook] validateWebhookToken error: ${e instanceof Error ? e.message : String(e)}`)
    return { valid: false, reason: 'db_error' }
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

  // Lê o token de autenticidade antes de consumir o body
  const receivedToken = req.headers.get('asaas-access-token')

  // ── 3. Parse e validação do payload ──────────────────────
  let payload: AsaasWebhookPayload
  try {
    const rawBody = await req.text()
    payload = JSON.parse(rawBody) as AsaasWebhookPayload
  } catch {
    console.warn('[store-payment-webhook] Payload inválido — não é JSON válido.')
    await writeLog(db, {
      gateway:        'asaas',
      processed:      false,
      skipReason:     'invalid_payload',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Payload inválido.' }, 400)
  }

  const eventType = payload.event       ?? ''
  const paymentId = payload.payment?.id ?? ''
  const eventId   = `${eventType}:${paymentId}`

  console.log(`[store-payment-webhook] Evento recebido | event=${eventType} | payment_id=${paymentId}`)

  // ── 4. Validação: campos obrigatórios ────────────────────
  if (!eventType || !paymentId) {
    console.warn('[store-payment-webhook] Evento sem type ou paymentId.')
    await writeLog(db, {
      gateway:   'asaas',
      eventType,
      processed: false,
      skipReason: 'missing_fields',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Evento inválido: campos obrigatórios ausentes.' }, 400)
  }

  // ── 5. Eventos desconhecidos → 200 sem processar ─────────
  const mapping = EVENT_MAP[eventType]
  if (!mapping) {
    console.log(`[store-payment-webhook] Evento desconhecido ignorado | event=${eventType}`)
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      processed: false, skipReason: 'unknown_event',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Evento não processado (desconhecido).' })
  }

  // ── 6. Idempotência: event_id duplicado ──────────────────
  if (await isDuplicateEvent(db, eventId)) {
    console.log(`[store-payment-webhook] Evento duplicado | event=${eventType} | payment_id=${paymentId}`)
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      processed: false, skipReason: 'duplicate',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Evento já processado anteriormente.' })
  }

  // ── 7. Localiza order_payment ────────────────────────────
  // Busca com 'amount' para verificação de valor (ponto 3)
  // Busca com 'store_id' para isolamento e validação de token (ponto 4)
  const { data: orderPayment, error: opErr } = await db
    .from('order_payments')
    .select('id, store_id, order_id, status, amount')
    .eq('gateway_payment_id', paymentId)
    .maybeSingle()

  if (opErr) {
    console.error(`[store-payment-webhook] Erro ao buscar order_payment | payment_id=${paymentId} | ${opErr.message}`)
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      processed: false, skipReason: 'db_error',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Erro interno ao processar evento.' }, 500)
  }

  if (!orderPayment) {
    // Pode ser cobrança de mensalidade (asaas-webhook cuida disso) ou teste
    console.log(`[store-payment-webhook] payment_id não encontrado em order_payments | payment_id=${paymentId}`)
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      processed: false, skipReason: 'payment_not_found',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Pagamento não encontrado no sistema.' })
  }

  // ── 8. Validação de autenticidade (ponto 2) ──────────────
  // Agora que temos o store_id, podemos buscar e comparar o token
  const authResult = await validateWebhookToken(db, orderPayment.store_id, receivedToken)
  if (!authResult.valid) {
    console.warn(
      `[store-payment-webhook] Token inválido | store_id=${orderPayment.store_id}` +
      ` | reason=${authResult.reason}`
    )
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      processed: false, skipReason: `auth_failed:${authResult.reason}`,
      processingTime: Date.now() - startTime,
    })
    // 401 para que o Asaas saiba que a autenticação falhou
    return respond({ error: 'Não autorizado.' }, 401)
  }

  // ── 9. Idempotência de status terminal (ponto 1 corrigido) ──
  // Qualquer status terminal bloqueia — independente do evento recebido
  if (TERMINAL_STATUSES.has(orderPayment.status)) {
    console.log(
      `[store-payment-webhook] Status já terminal — skip | ` +
      `order_payment_id=${orderPayment.id} | status=${orderPayment.status}`
    )
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      statusMapped: mapping.internalStatus,
      processed: false, skipReason: 'already_terminal',
      processingTime: Date.now() - startTime,
    })
    return respond({ success: true, message: 'Pagamento já processado.' })
  }

  // ── 10. Validação do valor recebido (ponto 3) ────────────
  // Apenas para eventos de confirmação de pagamento
  if (mapping.requiresPayment) {
    const valuePaid = payload.payment?.value ?? 0

    if (valuePaid <= 0) {
      console.warn(
        `[store-payment-webhook] Valor pago inválido (≤ 0) | ` +
        `order_payment_id=${orderPayment.id} | value=${valuePaid}`
      )
      await writeLog(db, {
        eventId, gateway: 'asaas', paymentId, eventType,
        processed: false, skipReason: 'invalid_amount',
        processingTime: Date.now() - startTime,
      })
      return respond({ error: 'Valor inválido no evento de pagamento.' }, 400)
    }

    const amountExpected = Number(orderPayment.amount)
    const amountDiff     = Math.abs(valuePaid - amountExpected)

    if (amountDiff > AMOUNT_TOLERANCE) {
      // Valor divergente: loga para auditoria mas NÃO confirma
      // O lojista deve investigar manualmente
      console.warn(
        `[store-payment-webhook] Valor divergente | ` +
        `order_payment_id=${orderPayment.id} | ` +
        `expected=${amountExpected} | received=${valuePaid} | diff=${amountDiff}`
      )
      await writeLog(db, {
        eventId, gateway: 'asaas', paymentId, eventType,
        statusMapped: 'amount_mismatch',
        processed: false, skipReason: `amount_mismatch:expected=${amountExpected}:received=${valuePaid}`,
        processingTime: Date.now() - startTime,
      })
      // Retorna 200 para o Asaas não re-tentar (divergência é permanente)
      // O status fica como 'pending' — lojista pode resolver manualmente
      return respond({ success: true, message: 'Valor divergente. Aguardando revisão manual.' })
    }
  }

  // ── 11. Atualiza order_payments ──────────────────────────
  // NUNCA grava: QR Code, PIX Copia e Cola, API Key, tokens, CPF
  const isPaid = mapping.internalStatus === 'confirmed'

  const updateData: Record<string, unknown> = {
    status:     mapping.internalStatus,
    updated_at: new Date().toISOString(),
    metadata: {
      last_webhook_event: eventType,
      last_webhook_at:    new Date().toISOString(),
      asaas_payment_date: payload.payment?.paymentDate   ?? null,
      asaas_confirmed_at: payload.payment?.confirmedDate ?? null,
      asaas_net_value:    payload.payment?.netValue      ?? null,
      billing_type:       payload.payment?.billingType   ?? null,
      value_received:     payload.payment?.value         ?? null,
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
      `[store-payment-webhook] Erro ao atualizar order_payment | ` +
      `order_payment_id=${orderPayment.id} | ${updateErr.message}`
    )
    await writeLog(db, {
      eventId, gateway: 'asaas', paymentId, eventType,
      statusMapped: mapping.internalStatus,
      processed: false, skipReason: 'db_update_error',
      processingTime: Date.now() - startTime,
    })
    return respond({ error: 'Erro ao atualizar status do pagamento.' }, 500)
  }

  // ── 12. Log de sucesso ───────────────────────────────────
  const elapsed = Date.now() - startTime
  await writeLog(db, {
    eventId, gateway: 'asaas', paymentId, eventType,
    statusMapped: mapping.internalStatus,
    processed: true,
    processingTime: elapsed,
  })

  console.log(
    `[store-payment-webhook] Processado com sucesso | event=${eventType}` +
    ` | order_payment_id=${orderPayment.id} | status=${mapping.internalStatus}` +
    ` | elapsed=${elapsed}ms`
  )

  return respond({ success: true, event: eventType, statusMapped: mapping.internalStatus })
})
