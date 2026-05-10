// Supabase Edge Function: asaas-payment
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") || ""
const ASAAS_URL = "https://api.asaas.com/v3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { action, storeId, cpfCnpj } = await req.json()

    if (action === 'createPayment') {
      const { data: store, error: storeErr } = await supabaseClient
        .from('stores').select('*').eq('id', storeId).single()
      if (storeErr || !store) throw new Error('Loja não encontrada')

      console.log('Loja:', store.name, '| API Key OK:', ASAAS_API_KEY.length > 10)
      console.log('CPF/CNPJ:', cpfCnpj)

      // Sempre cria um novo customer se não tiver ID válido
      let asaasCustomerId = store.asaas_customer_id
      if (!asaasCustomerId) {
        const custRes = await fetch(`${ASAAS_URL}/customers`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: store.name,
            email: store.owner_email || 'contato@encartshop.com.br',
            cpfCnpj: cpfCnpj,
            externalReference: store.id
          })
        })
        const custData = await custRes.json()
        console.log('Asaas customer response status:', custRes.status)
        console.log('Asaas customer response:', JSON.stringify(custData))

        if (!custRes.ok || custData.errors) {
          const errMsg = custData.errors?.[0]?.description || custData.message || `HTTP ${custRes.status}`
          throw new Error(`Erro Asaas (cliente): ${errMsg}`)
        }

        asaasCustomerId = custData.id
        await supabaseClient.from('stores').update({ asaas_customer_id: asaasCustomerId }).eq('id', storeId)
      }

      // Cria cobrança PIX
      const payRes = await fetch(`${ASAAS_URL}/payments`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: 5.00,
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          description: `Ativação EncartShop - ${store.name}`,
          externalReference: store.id
        })
      })
      const payData = await payRes.json()
      console.log('Asaas payment response status:', payRes.status)
      console.log('Asaas payment response:', JSON.stringify(payData))

      if (!payRes.ok || payData.errors) {
        const errMsg = payData.errors?.[0]?.description || payData.message || `HTTP ${payRes.status}`
        throw new Error(`Erro Asaas (cobrança): ${errMsg}`)
      }

      // Busca QR Code
      const qrRes = await fetch(`${ASAAS_URL}/payments/${payData.id}/pixQrCode`, {
        headers: { 'access_token': ASAAS_API_KEY }
      })
      const qrData = await qrRes.json()

      // Salva no banco
      await supabaseClient.from('stores').update({
        asaas_payment_id: payData.id,
        asaas_pix_code: qrData.payload,
        asaas_pix_qr_code: qrData.encodedImage
      }).eq('id', storeId)

      return new Response(JSON.stringify({ success: true, paymentId: payData.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    console.error('ERRO:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})