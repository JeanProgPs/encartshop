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
    const body = await req.json()
    const { action } = body

    if (action === 'createPayment') {
      const { storeId, cpfCnpj, planValue } = body
      console.log('Recebido planValue:', planValue)
      const paymentValue = parseFloat(planValue) || 59.90
      console.log('Valor final do pagamento:', paymentValue)
      const { data: store, error: storeErr } = await supabaseClient
        .from('stores').select('*').eq('id', storeId).single()
      if (storeErr || !store) throw new Error('Loja não encontrada')

      console.log('Loja:', store.name, '| API Key OK:', ASAAS_API_KEY.length > 10)
      console.log('CPF/CNPJ:', cpfCnpj)

      // Cria ou atualiza customer no Asaas com CPF/CNPJ
      let asaasCustomerId = store.asaas_customer_id
      if (!asaasCustomerId) {
        if (!cpfCnpj) throw new Error('CPF/CNPJ é necessário para o primeiro pagamento');
        const ownerEmail = store.owner_email && store.owner_email.includes('@')
          ? store.owner_email
          : `loja${storeId.slice(0, 8)}@encartshop.com.br`

        const custRes = await fetch(`${ASAAS_URL}/customers`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: store.name,
            email: ownerEmail,
            cpfCnpj: cpfCnpj,
            externalReference: store.id
          })
        })
        const custData = await custRes.json()
        console.log('Asaas customer response status:', custRes.status)
        console.log('Asaas customer response:', JSON.stringify(custData))

        if (!custRes.ok || custData.errors) {
          // Se o CPF já existe no Asaas, busca o customer existente
          const errDesc = custData.errors?.[0]?.description || ''
          if (custRes.status === 400 && errDesc.toLowerCase().includes('cpf')) {
            console.log('CPF já cadastrado, buscando customer existente...')
            const searchRes = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${cpfCnpj}`, {
              headers: { 'access_token': ASAAS_API_KEY }
            })
            const searchData = await searchRes.json()
            console.log('Busca por CPF:', JSON.stringify(searchData))
            if (searchData.data && searchData.data.length > 0) {
              asaasCustomerId = searchData.data[0].id
              console.log('Customer existente encontrado:', asaasCustomerId)
            } else {
              throw new Error(`Erro Asaas (cliente): ${errDesc}`)
            }
          } else {
            const errMsg = errDesc || custData.message || `HTTP ${custRes.status}`
            throw new Error(`Erro Asaas (cliente): ${errMsg}`)
          }
        } else {
          asaasCustomerId = custData.id
        }

        await supabaseClient.from('stores').update({ asaas_customer_id: asaasCustomerId }).eq('id', storeId)
      } else {
        // Atualiza o cliente existente com CPF (pode ter sido criado sem CPF antes)
        console.log('Atualizando customer existente com CPF:', asaasCustomerId)
        await fetch(`${ASAAS_URL}/customers/${asaasCustomerId}`, {
          method: 'PUT',
          headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpfCnpj: cpfCnpj })
        })
      }

      // Cria cobrança PIX
      const payRes = await fetch(`${ASAAS_URL}/payments`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: paymentValue,
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
        asaas_payment_url: payData.invoiceUrl,
        asaas_pix_code: qrData.payload,
        asaas_pix_qr_code: qrData.encodedImage
      }).eq('id', storeId)

      return new Response(JSON.stringify({ 
        success: true, 
        paymentId: payData.id,
        paymentUrl: payData.invoiceUrl 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    console.error('ERRO:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})