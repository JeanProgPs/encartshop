// Supabase Edge Function: whatsapp-notify
// Gerencia conexão com Evolution API (configuração global em global_config)
// e disparo automático de mensagens de status de pedidos com segurança e idempotência.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  })
}

export function cleanPhone(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '')
  if (!digits) return ''

  // Remove zero à esquerda comum em discagem nacional (ex: 011999999999)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1)
  }

  // Já possui DDI 55 com tamanho válido (12 = fixo, 13 = celular com 9)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  // Número brasileiro sem DDI (DDD + 8 ou 9 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits
  }

  // Outros formatos internacionais válidos (ex: 12 a 15 dígitos)
  if (digits.length >= 12 && digits.length <= 15) {
    return digits
  }

  return ''
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'confirmado': return 'Confirmado'
    case 'em_entrega': return 'Saiu para entrega'
    case 'finalizado':
    case 'entregue': return 'Finalizado'
    case 'cancelado': return 'Cancelado'
    default: return status
  }
}

export function getStatusMessage(
  status: string,
  storeName: string,
  customerName: string,
  orderRef: string,
  trackingUrl: string
): string {
  const firstName = customerName ? customerName.trim().split(/\s+/)[0] : 'Cliente'
  const loja = storeName ? `*${storeName}*` : 'nossa loja'
  const ref = orderRef ? `#${orderRef}` : ''
  const statusLabel = getStatusLabel(status)

  switch (status) {
    case 'confirmado':
      return `Olá, *${firstName}*! 👋\n\nSeu pedido *${ref}* na ${loja} foi *confirmado* e já está em preparação!\n\n📌 *Status:* ${statusLabel}\n📍 *Acompanhe seu pedido:*\n${trackingUrl}`

    case 'em_entrega':
      return `Olá, *${firstName}*! 🛵\n\nBoas notícias: seu pedido *${ref}* da ${loja} *saiu para entrega* e logo chegará até você.\n\n📌 *Status:* ${statusLabel}\n📍 *Acompanhe em tempo real:*\n${trackingUrl}`

    case 'finalizado':
    case 'entregue':
      return `Olá, *${firstName}*! ✅\n\nSeu pedido *${ref}* da ${loja} foi *concluído* com sucesso.\n\n📌 *Status:* ${statusLabel}\n📍 *Detalhes do pedido:*\n${trackingUrl}\n\nObrigado pela preferência!`

    case 'cancelado':
      return `Olá, *${firstName}*.\n\nInformamos que o seu pedido *${ref}* na ${loja} foi *cancelado*.\n\n📌 *Status:* ${statusLabel}\n📍 *Detalhes:*\n${trackingUrl}\n\nSe precisar de ajuda, responda a esta mensagem.`

    default:
      return `Olá, *${firstName}*!\n\nAtualização do seu pedido *${ref}* na ${loja}:\n📌 *Status:* ${statusLabel}\n\n📍 *Acompanhe aqui:*\n${trackingUrl}`
  }
}

function sanitizeError(err: unknown, apiKey?: string): string {
  let msg = err instanceof Error ? err.message : String(err || 'Erro desconhecido')
  if (apiKey && apiKey.length > 3) {
    msg = msg.split(apiKey).join('***')
  }
  return msg
}

async function fetchEvolution(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
  apiKeyForSanitize?: string
): Promise<{ ok: boolean; status: number; data: any }> {
  const { timeoutMs = 12000, ...fetchOpts } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal })
    const rawText = await res.text()
    let data: any = null
    try {
      data = rawText ? JSON.parse(rawText) : {}
    } catch {
      data = { raw: rawText }
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error('API Key da Evolution API inválida ou sem autorização.')
    }

    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao comunicar com a Evolution API.')
    }
    if (err instanceof TypeError) {
      throw new Error('Evolution API indisponível ou URL incorreta.')
    }
    throw new Error(sanitizeError(err, apiKeyForSanitize))
  } finally {
    clearTimeout(timer)
  }
}

function extractConnectedPhone(payload: any): string | null {
  const candidates = [
    payload?.instance?.ownerJid,
    payload?.instance?.owner,
    payload?.ownerJid,
    payload?.owner,
    Array.isArray(payload) ? payload[0]?.ownerJid || payload[0]?.owner : null
  ]
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.includes('@')) {
      const digits = raw.split('@')[0].replace(/\D/g, '')
      if (digits.length >= 10) return digits
    }
  }
  return null
}

async function logNotification(
  supabaseAdmin: any,
  storeId: string,
  orderId: string,
  eventStatus: string,
  status: 'sent' | 'failed' | 'skipped',
  errorMessage: string | null = null
) {
  try {
    await supabaseAdmin.from('whatsapp_notification_logs').insert({
      store_id: storeId,
      order_id: orderId,
      event_status: eventStatus,
      status,
      error_message: errorMessage
    })
  } catch (e) {
    console.warn('[whatsapp-notify] Falha ao gravar log de notificação:', e instanceof Error ? e.message : e)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let currentApiKey = ''

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Não autenticado. Token ausente.' }, 401)
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Autenticação obrigatória do usuário
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Sessão inválida ou expirada.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const { action, storeId } = body

    if (!storeId || typeof storeId !== 'string') {
      return jsonResponse({ success: false, error: 'storeId é obrigatório.' }, 400)
    }

    // 2. Busca dados da loja e valida permissão (dono da loja ou SUPER_ADMIN)
    const { data: store, error: storeErr } = await supabaseAdmin
      .from('stores')
      .select('id, user_id, name, whatsapp_auto_notify, evolution_instance_name, whatsapp_connected, whatsapp_connected_phone')
      .eq('id', storeId)
      .single()

    if (storeErr || !store) {
      return jsonResponse({ success: false, error: 'Loja não encontrada.' }, 404)
    }

    const isSuperAdmin = user.app_metadata?.role === 'SUPER_ADMIN'
    if (store.user_id !== user.id && !isSuperAdmin) {
      return jsonResponse({ success: false, error: 'Sem permissão para operar esta loja.' }, 403)
    }

    // 3. Prioridade de configuração: 1) global_config -> 2) variáveis de ambiente
    const { data: globalCfg } = await supabaseAdmin
      .from('global_config')
      .select('evolution_api_url, evolution_api_key')
      .limit(1)
      .maybeSingle()

    const envUrl = Deno.env.get('EVOLUTION_API_URL') || ''
    const envKey = Deno.env.get('EVOLUTION_API_KEY') || ''

    const apiUrl = String(globalCfg?.evolution_api_url || envUrl || '').trim().replace(/\/+$/, '')
    const apiKey = String(globalCfg?.evolution_api_key || envKey || '').trim()
    currentApiKey = apiKey

    if (!apiUrl || !apiKey) {
      if (action === 'send-order-notification') {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'Integração Evolution API não configurada pela plataforma.'
        }, 200)
      }
      return jsonResponse({
        success: false,
        error: 'Evolution API não configurada. Solicite ao administrador da plataforma.'
      }, 400)
    }

    const instanceName = store.evolution_instance_name || `loja_${store.id.replace(/-/g, '').slice(0, 12)}`

    // ── AÇÃO: Obter QR Code de Conexão ────────────────────────────
    if (action === 'get-qr') {
      console.log(`[whatsapp-notify] get-qr para instância ${instanceName}`)

      // Verifica primeiro se a instância já existe e está conectada
      const stateCheck = await fetchEvolution(
        `${apiUrl}/instance/connectionState/${instanceName}`,
        { method: 'GET', headers: { 'apikey': apiKey } },
        apiKey
      )

      const existingState = stateCheck.data?.instance?.state || stateCheck.data?.state
      if (stateCheck.ok && existingState === 'open') {
        await supabaseAdmin
          .from('stores')
          .update({
            evolution_instance_name: instanceName,
            whatsapp_connected: true,
            whatsapp_last_sync: new Date().toISOString()
          })
          .eq('id', storeId)

        return jsonResponse({
          success: true,
          instanceName,
          state: 'open',
          connected: true
        })
      }

      // Cria a instância apenas se não existir (404 no connectionState ou erro de inexistência)
      if (!stateCheck.ok || stateCheck.status === 404) {
        const createRes = await fetchEvolution(
          `${apiUrl}/instance/create`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({
              instanceName,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS'
            })
          },
          apiKey
        )

        // 403/409 geralmente indica instância já existente na Evolution API
        if (!createRes.ok && createRes.status !== 403 && createRes.status !== 409) {
          const apiMsg = createRes.data?.message || createRes.data?.error || 'Falha ao criar instância na Evolution API.'
          throw new Error(String(apiMsg))
        }
      }

      // Solicita o QR Code
      const connectRes = await fetchEvolution(
        `${apiUrl}/instance/connect/${instanceName}`,
        { method: 'GET', headers: { 'apikey': apiKey } },
        apiKey
      )

      if (!connectRes.ok) {
        throw new Error(connectRes.data?.message || 'Não foi possível gerar o QR Code na Evolution API.')
      }

      if (!store.evolution_instance_name) {
        await supabaseAdmin
          .from('stores')
          .update({ evolution_instance_name: instanceName })
          .eq('id', storeId)
      }

      const qrBase64 = connectRes.data?.qrcode?.base64 || connectRes.data?.base64 || ''
      const code = connectRes.data?.qrcode?.code || connectRes.data?.code || ''
      const state = connectRes.data?.instance?.state || connectRes.data?.state || 'connecting'

      return jsonResponse({
        success: true,
        instanceName,
        state,
        qrcode: qrBase64,
        code
      })
    }

    // ── AÇÃO: Checar Status Real da Conexão ───────────────────────
    if (action === 'check-status') {
      const stateRes = await fetchEvolution(
        `${apiUrl}/instance/connectionState/${instanceName}`,
        { method: 'GET', headers: { 'apikey': apiKey } },
        apiKey
      )

      if (stateRes.status === 404) {
        await supabaseAdmin
          .from('stores')
          .update({
            whatsapp_connected: false,
            whatsapp_connected_phone: null,
            whatsapp_last_sync: new Date().toISOString()
          })
          .eq('id', storeId)

        return jsonResponse({
          success: true,
          instanceName,
          state: 'close',
          connected: false,
          connectedPhone: null
        })
      }

      if (!stateRes.ok) {
        throw new Error(stateRes.data?.message || 'Erro ao consultar status na Evolution API.')
      }

      const rawState = stateRes.data?.instance?.state || stateRes.data?.state || 'close'
      const isConnected = rawState === 'open'

      let connectedPhone: string | null = store.whatsapp_connected_phone || null
      if (isConnected) {
        connectedPhone = extractConnectedPhone(stateRes.data) || connectedPhone
        if (!connectedPhone) {
          try {
            const infoRes = await fetchEvolution(
              `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
              { method: 'GET', headers: { 'apikey': apiKey } },
              apiKey
            )
            if (infoRes.ok) {
              connectedPhone = extractConnectedPhone(infoRes.data) || connectedPhone
            }
          } catch {
            // Não impede o check-status se fetchInstances falhar
          }
        }
      } else {
        connectedPhone = null
      }

      await supabaseAdmin
        .from('stores')
        .update({
          whatsapp_connected: isConnected,
          whatsapp_connected_phone: connectedPhone,
          whatsapp_last_sync: new Date().toISOString()
        })
        .eq('id', storeId)

      return jsonResponse({
        success: true,
        instanceName,
        state: rawState,
        connected: isConnected,
        connectedPhone
      })
    }

    // ── AÇÃO: Desconectar Instância ───────────────────────────────
    if (action === 'disconnect') {
      try {
        await fetchEvolution(
          `${apiUrl}/instance/logout/${instanceName}`,
          { method: 'DELETE', headers: { 'apikey': apiKey } },
          apiKey
        )
      } catch (err) {
        console.warn(`[whatsapp-notify] Aviso ao fazer logout de ${instanceName}:`, sanitizeError(err, apiKey))
      }

      await supabaseAdmin
        .from('stores')
        .update({
          whatsapp_connected: false,
          whatsapp_connected_phone: null,
          whatsapp_last_sync: new Date().toISOString()
        })
        .eq('id', storeId)

      return jsonResponse({ success: true, connected: false, connectedPhone: null })
    }

    // ── AÇÃO: Disparar Notificação de Pedido ──────────────────────
    if (action === 'send-order-notification') {
      const { orderId, newStatus, previousStatus, customMsg } = body
      if (!orderId || !newStatus) {
        return jsonResponse({ success: false, error: 'orderId e newStatus são obrigatórios.' }, 400)
      }

      if (previousStatus && previousStatus === newStatus) {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'Status do pedido não sofreu alteração.'
        })
      }

      if (store.whatsapp_auto_notify === false) {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'Envio automático desativado pelo lojista.'
        })
      }

      if (!store.whatsapp_connected) {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'WhatsApp da loja está desconectado.'
        })
      }

      // Busca pedido garantindo isolamento por store_id
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('id, store_id, customer_name, customer_phone, status')
        .eq('id', orderId)
        .eq('store_id', storeId)
        .single()

      if (orderErr || !order) {
        return jsonResponse({ success: false, error: 'Pedido não encontrado nesta loja.' }, 404)
      }

      // Idempotência: evita envio duplicado para o mesmo pedido e status
      if (!customMsg) {
        const { data: alreadySent } = await supabaseAdmin
          .from('whatsapp_notification_logs')
          .select('id')
          .eq('order_id', orderId)
          .eq('event_status', newStatus)
          .eq('status', 'sent')
          .limit(1)
          .maybeSingle()

        if (alreadySent) {
          return jsonResponse({
            success: false,
            skipped: true,
            duplicate: true,
            reason: 'Notificação já enviada anteriormente para este pedido e status.'
          })
        }
      }

      const targetPhone = cleanPhone(order.customer_phone || '')
      if (!targetPhone) {
        await logNotification(supabaseAdmin, storeId, orderId, newStatus, 'skipped', 'Telefone inválido ou ausente')
        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'Pedido não possui número de telefone válido para o WhatsApp.'
        })
      }

      const orderRef = String(order.id).slice(-5).toUpperCase()
      const origin = req.headers.get('origin') || 'https://www.encartshop.com'
      const trackingUrl = `${origin}/loja/pedido.html?ref=${orderRef}`

      const messageText = customMsg || getStatusMessage(
        newStatus,
        store.name || 'Loja',
        order.customer_name || 'Cliente',
        orderRef,
        trackingUrl
      )

      console.log(`[whatsapp-notify] Enviando status=${newStatus} pedido=${orderRef} instancia=${instanceName}`)

      const sendRes = await fetchEvolution(
        `${apiUrl}/message/sendText/${instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          },
          body: JSON.stringify({
            number: targetPhone,
            text: messageText,
            textMessage: { text: messageText }
          })
        },
        apiKey
      )

      if (!sendRes.ok) {
        const errMsg = sendRes.data?.message || sendRes.data?.error || `Falha HTTP ${sendRes.status} ao enviar mensagem.`
        await logNotification(supabaseAdmin, storeId, orderId, newStatus, 'failed', sanitizeError(errMsg, apiKey))
        return jsonResponse({
          success: false,
          error: sanitizeError(errMsg, apiKey)
        }, 502)
      }

      await logNotification(supabaseAdmin, storeId, orderId, newStatus, 'sent', null)

      return jsonResponse({
        success: true,
        targetPhone,
        status: newStatus,
        evolutionResponse: sendRes.data
      })
    }

    return jsonResponse({ success: false, error: `Ação desconhecida: ${action}` }, 400)

  } catch (err) {
    const safeMsg = sanitizeError(err, currentApiKey)
    console.error('[whatsapp-notify Error]', safeMsg)
    return jsonResponse({ success: false, error: safeMsg }, 400)
  }
})
