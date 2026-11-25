// Supabase Edge Function: whatsapp-notify
// Gerencia conexão com Evolution API e disparo automático de mensagens de status de pedidos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function cleanPhone(rawPhone: string): string {
  let phone = String(rawPhone || '').replace(/\D/g, '')
  if (phone.length === 10 || phone.length === 11) {
    phone = '55' + phone
  }
  return phone
}

function getStatusMessage(status: string, customerName: string, orderRef: string, trackingUrl: string): string {
  const firstName = customerName ? customerName.split(' ')[0] : 'Cliente'
  const ref = orderRef ? `#${orderRef}` : ''

  switch (status) {
    case 'confirmado':
      return `Olá, *${firstName}*! 👋\n\nSeu pedido *${ref}* foi confirmado e já está sendo preparado com muito carinho! 👨‍🍳📦\n\n📍 *Acompanhe o status em tempo real:*\n${trackingUrl}`
    
    case 'em_entrega':
      return `Temos uma ótima notícia, *${firstName}*! 🛵💨\n\nO seu pedido *${ref}* acabou de sair para entrega e logo chegará até você!\n\n📍 *Acompanhe em tempo real:*\n${trackingUrl}`

    case 'finalizado':
    case 'entregue':
      return `Pedido entregue com sucesso! 🎉✅\n\nEsperamos que você adore sua compra, *${firstName}*! Muito obrigado pela preferência e conte sempre conosco. 😊`

    case 'cancelado':
      return `Olá, *${firstName}*.\n\nInformamos que o seu pedido *${ref}* foi cancelado. Se tiver qualquer dúvida, fique à vontade para falar conosco respondendo a esta mensagem.`

    default:
      return `Olá, *${firstName}*! Atualização sobre seu pedido *${ref}*:\nStatus atual: *${status}*.\n\n📍 *Acompanhe aqui:*\n${trackingUrl}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { action, storeId } = body

    if (!storeId) throw new Error('storeId é obrigatório')

    // 1. Busca dados da loja
    const { data: store, error: storeErr } = await supabaseClient
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single()

    if (storeErr || !store) throw new Error('Loja não encontrada')

    const globalApiUrl = Deno.env.get('EVOLUTION_API_URL') || ''
    const globalApiKey = Deno.env.get('EVOLUTION_API_KEY') || ''

    const apiUrl = (store.evolution_api_url || globalApiUrl || '').replace(/\/+$/, '')
    const apiKey = store.evolution_api_key || globalApiKey || ''

    if (!apiUrl || !apiKey) {
      if (action === 'send-order-notification') {
        // Encerra graciosamente se a loja ainda não configurou Evolution API
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true, 
          reason: 'Evolution API não configurada na loja ou variáveis de ambiente ausentes.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }
      throw new Error('URL da Evolution API ou Chave API não configuradas.')
    }

    const instanceName = store.evolution_instance_name || `loja_${store.id.replace(/-/g, '').slice(0, 12)}`

    // ── AÇÃO: Obter QR Code de Conexão ────────────────────────────
    if (action === 'get-qr') {
      console.log(`[Evolution API] Conectando instância: ${instanceName} em ${apiUrl}`)

      // 1. Tenta verificar se instância já existe, se não, cria
      try {
        const createRes = await fetch(`${apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          })
        })
        const createData = await createRes.json()
        console.log('[Evolution API] create result:', createData)
      } catch (err) {
        console.warn('[Evolution API] create instance notice:', err)
      }

      // 2. Conecta para pegar o QR code
      const connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { 'apikey': apiKey }
      })
      const connectData = await connectRes.json()

      // Atualiza nome da instância na loja caso ainda não estivesse salvo
      if (!store.evolution_instance_name) {
        await supabaseClient
          .from('stores')
          .update({ evolution_instance_name: instanceName })
          .eq('id', storeId)
      }

      let qrBase64 = connectData?.qrcode?.base64 || connectData?.base64 || ''
      let code = connectData?.qrcode?.code || connectData?.code || ''
      let state = connectData?.instance?.state || connectData?.state || 'connecting'

      return new Response(JSON.stringify({
        success: true,
        instanceName,
        state,
        qrcode: qrBase64,
        code
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // ── AÇÃO: Checar Status da Conexão ────────────────────────────
    if (action === 'check-status') {
      const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: { 'apikey': apiKey }
      })
      const stateData = await stateRes.json()
      
      const rawState = stateData?.instance?.state || stateData?.state || 'close'
      const isConnected = rawState === 'open'

      await supabaseClient
        .from('stores')
        .update({
          whatsapp_connected: isConnected,
          whatsapp_last_sync: new Date().toISOString()
        })
        .eq('id', storeId)

      return new Response(JSON.stringify({
        success: true,
        instanceName,
        state: rawState,
        connected: isConnected
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // ── AÇÃO: Desconectar Instância ───────────────────────────────
    if (action === 'disconnect') {
      try {
        await fetch(`${apiUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { 'apikey': apiKey }
        })
      } catch (_) {}

      await supabaseClient
        .from('stores')
        .update({
          whatsapp_connected: false,
          whatsapp_last_sync: new Date().toISOString()
        })
        .eq('id', storeId)

      return new Response(JSON.stringify({ success: true, connected: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // ── AÇÃO: Disparar Notificação de Pedido ───────────────────────
    if (action === 'send-order-notification') {
      const { orderId, newStatus, customMsg } = body
      if (!orderId || !newStatus) throw new Error('orderId e newStatus são obrigatórios')

      // Se a loja desativou envios automáticos, não dispara
      if (store.whatsapp_auto_notify === false) {
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true, 
          reason: 'Envio automático desativado pelo lojista.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }

      // Busca dados do pedido
      const { data: order, error: orderErr } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (orderErr || !order) throw new Error('Pedido não encontrado')

      const rawPhone = order.customer_phone || ''
      const targetPhone = cleanPhone(rawPhone)

      if (!targetPhone || targetPhone.length < 10) {
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true, 
          reason: 'Pedido não possui número de telefone válido para o WhatsApp.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }

      const orderRef = String(order.id).slice(-5).toUpperCase()
      const origin = req.headers.get('origin') || 'https://encartshop.com'
      const trackingUrl = `${origin}/loja/pedido.html?ref=${orderRef}`

      const messageText = customMsg || getStatusMessage(newStatus, order.customer_name || 'Cliente', orderRef, trackingUrl)

      console.log(`[Evolution API] Enviando mensagem de status [${newStatus}] para ${targetPhone} via ${instanceName}`)

      // Disparo para Evolution API
      const sendRes = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          number: targetPhone,
          text: messageText,
          textMessage: { text: messageText } // compatibilidade v1 e v2
        })
      })

      const sendData = await sendRes.json()
      console.log('[Evolution API] Resposta de envio:', sendData)

      return new Response(JSON.stringify({
        success: true,
        targetPhone,
        status: newStatus,
        evolutionResponse: sendData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    throw new Error(`Ação desconhecida: ${action}`)

  } catch (err) {
    console.error('[whatsapp-notify Error]', err)
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
