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
        // Atualiza a loja que possui esse asaas_payment_id
        const { data, error } = await supabaseClient
          .from('stores')
          .update({ status: 'active' })
          .eq('asaas_payment_id', paymentId)
          .select()

        if (error) {
          console.error('Erro ao atualizar status da loja:', error)
          return new Response(JSON.stringify({ error: 'Erro ao atualizar banco' }), { status: 500 })
        }
        
        console.log(`Loja com paymentId ${paymentId} ativada com sucesso.`)
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