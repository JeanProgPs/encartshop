// Supabase Edge Function: asaas-payment
// Instruções:
// 1. Crie uma conta no Asaas e obtenha sua API Key.
// 2. No terminal: supabase secrets set ASAAS_API_KEY=sua_chave
// 3. Implante: supabase functions deploy asaas-payment
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") || ""
const ASAAS_URL = "https://sandbox.asaas.com/v3" // Use https://api.asaas.com/v3 para produção
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
    const { action, storeId, paymentId } = await req.json()
    if (action === 'createPayment') {
      // 1. Busca dados da loja e do dono
      const { data: store, error: storeErr } = await supabaseClient
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single()
      if (storeErr || !store) throw new Error('Loja não encontrada')
      // 2. Cria cliente no Asaas (ou busca se já existir)
      let asaasCustomerId = store.asaas_customer_id
      if (!asaasCustomerId) {
        const custRes = await fetch(`${ASAAS_URL}/customers`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: store.name,
            email: store.owner_email,
            externalReference: store.id
          })
        })
        const custData = await custRes.json()
        asaasCustomerId = custData.id
        
        await supabaseClient.from('stores').update({ asaas_customer_id: asaasCustomerId }).eq('id', storeId)
      }
      // 3. Cria cobrança PIX
      const payRes = await fetch(`${ASAAS_URL}/payments`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: 49.90, // Valor do plano (exemplo)
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          description: `Ativação EncartShop - ${store.name}`,
          externalReference: store.id
        })
      })
      const payData = await payRes.json()
      // 4. Busca QR Code do PIX
      const qrRes = await fetch(`${ASAAS_URL}/payments/${payData.id}/pixQrCode`, {
        headers: { 'access_token': ASAAS_API_KEY }
      })
      const qrData = await qrRes.json()
      // 5. Atualiza a loja com os dados do pagamento
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})