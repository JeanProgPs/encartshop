import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // O Asaas envia um POST com as informações do evento
    const body = await req.json()
    console.log('Webhook Asaas recebido:', body.event)
    
    // Verifica se o evento é de confirmação ou recebimento de pagamento
    if (body.event === 'PAYMENT_RECEIVED' || body.event === 'PAYMENT_CONFIRMED') {
      const paymentId = body.payment?.id

      if (paymentId) {
        // 1. Busca a loja atual para ver se já tem um vencimento
        const { data: store, error: fetchErr } = await supabaseClient
          .from('stores')
          .select('id, expires_at')
          .eq('asaas_payment_id', paymentId)
          .single()

        if (fetchErr || !store) {
          console.error('Loja não encontrada para paymentId:', paymentId)
          return new Response(JSON.stringify({ error: 'Loja não encontrada' }), { status: 404 })
        }

        // 2. Calcula o novo vencimento
        const now = new Date()
        let newExpiresAt = new Date(now)
        newExpiresAt.setDate(now.getDate() + 30)

        // Se a loja já tiver um vencimento futuro, soma 30 dias a ele (renovação antecipada)
        if (store.expires_at) {
          const currentExpires = new Date(store.expires_at)
          if (currentExpires > now) {
            newExpiresAt = new Date(currentExpires)
            newExpiresAt.setDate(currentExpires.getDate() + 30)
          }
        }

        // 3. Atualiza a loja
        const { error: updateErr } = await supabaseClient
          .from('stores')
          .update({ 
            status: 'active', 
            expires_at: newExpiresAt.toISOString() 
          })
          .eq('id', store.id)

        if (updateErr) {
          console.error('Erro ao atualizar status e vencimento da loja:', updateErr)
          return new Response(JSON.stringify({ error: 'Erro ao atualizar banco' }), { status: 500 })
        }
        
        console.log(`Loja ${store.id} ativada até ${newExpiresAt.toISOString()}.`)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err) {
    console.error('Erro no processamento do webhook:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
