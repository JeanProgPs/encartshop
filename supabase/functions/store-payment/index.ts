/**
 * EncartShop — Edge Function: store-payment
 * Fase 3B: createPixCharge + camada de abstração PaymentProvider
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ISOLAMENTO CRÍTICO — NUNCA ALTERAR ESTAS REGRAS               ║
 * ║                                                                  ║
 * ║  Esta função é COMPLETAMENTE SEPARADA de:                       ║
 * ║    • asaas-payment  (mensalidades da plataforma)                ║
 * ║    • asaas-webhook  (confirmação de mensalidades)               ║
 * ║                                                                  ║
 * ║  Esta função:                                                    ║
 * ║    ✅ Usa API Key do LOJISTA (banco, via service_role)          ║
 * ║    ✅ Dinheiro vai para a conta do LOJISTA                      ║
 * ║    ❌ Nunca toca em stores.status / stores.expires_at           ║
 * ║    ❌ Nunca usa ASAAS_API_KEY de ambiente (da plataforma)       ║
 * ║    ❌ Nunca altera a tabela orders                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Arquitetura:
 *   interface PaymentProvider   — contrato genérico de gateway
 *   class AsaasProvider         — implementação Asaas do contrato
 *   Deno.serve / switch(action) — router de actions HTTP
 *
 * Actions disponíveis:
 *   • validateApiKey    (Fase 3A) — valida se a API Key é válida
 *   • createPixCharge   (Fase 3B) — cria cobrança PIX e salva em order_payments
 *
 * Actions futuras:
 *   • getChargeStatus   (Fase 3C) — consulta status de cobrança
 *   • cancelCharge      (Fase 3C) — cancela cobrança em aberto
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── CORS & constantes ────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ASAAS_TIMEOUT_MS = 10_000
const MP_TIMEOUT_MS    = 12_000

const ASAAS_BASE_URLS: Record<string, string> = {
  sandbox:    'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3',
}

// Mercado Pago não tem base URL distinta por ambiente —
// sandbox é controlado pelo prefixo TEST- no Access Token.
const MP_BASE_URL = 'https://api.mercadopago.com'

// ── Tipos ────────────────────────────────────────────────────────

interface StoreSettings {
  id:               string
  payment_provider: string
  environment:      string
  // Credenciais — preenchidas conforme o provider ativo
  asaas_api_key:    string          // Asaas
  mp_access_token:  string          // Mercado Pago
  mp_public_key:    string          // Mercado Pago
  payment_enabled:  boolean
  payment_methods:  string[]
}

interface CustomerInput {
  name:      string
  document?: string   // CPF ou CNPJ — opcional
  email?:    string
  phone?:    string
}

interface PixChargeInput {
  customerId:  string   // ID do customer no gateway (ou nome para MP)
  amount:      number
  description: string
  orderId?:    string   // externalReference / idempotency_key
  dueDate?:    string   // YYYY-MM-DD; padrão D+1
}

interface PixChargeResult {
  gatewayPaymentId: string
  status:           string
  invoiceUrl:       string
  pixCode:          string
  qrCode:           string       // base64
  expirationDate:   string
  amount:           number
  billingType:      string
}

// ── Interface PaymentProvider ────────────────────────────────────
/**
 * Contrato genérico de gateway de pagamento.
 * Toda comunicação com gateways externos DEVE passar por esta interface.
 * Nenhuma outra parte do sistema pode chamar APIs externas diretamente.
 *
 * Implementações disponíveis:
 *   - AsaasProvider (Fase 3A/3B)
 *
 * Implementações futuras:
 *   - MercadoPagoProvider
 *   - PagBankProvider
 *   - StripeProvider
 */
interface PaymentProvider {
  /**
   * Verifica se as credenciais são válidas no gateway.
   * @returns nome da conta se válido, lança erro se inválido
   */
  validateCredentials(): Promise<string>

  /**
   * Cria ou localiza um customer no gateway.
   * @returns ID do customer no gateway
   */
  ensureCustomer(customer: CustomerInput): Promise<string>

  /**
   * Cria uma cobrança PIX.
   * @returns dados da cobrança criada
   */
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>
}


// ── AsaasProvider ────────────────────────────────────────────────
/**
 * Implementação do PaymentProvider para o gateway Asaas.
 * Toda comunicação com a API Asaas DEVE passar por esta classe.
 *
 * Regras de segurança:
 *   - apiKey nunca é logada nem retornada
 *   - Toda resposta bruta do Asaas vai para metadata (não para logs)
 *   - Erros HTTP do Asaas são convertidos em erros tipados
 */
class AsaasProvider implements PaymentProvider {
  private readonly baseUrl: string
  private readonly apiKey:  string
  private readonly storeId: string   // apenas para logs

  constructor(apiKey: string, environment: string, storeId: string) {
    const url = ASAAS_BASE_URLS[environment]
    if (!url) throw new AsaasError(`Ambiente inválido: ${environment}`, 'INVALID_ENVIRONMENT')
    this.baseUrl = url
    this.apiKey  = apiKey
    this.storeId = storeId
  }

  // ── fetch interno ──────────────────────────────────────────
  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ASAAS_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'access_token':  this.apiKey,   // valor nunca logado
          'Content-Type':  'application/json',
          'User-Agent':    'EncartShop/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timer)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      throw new AsaasError(
        isTimeout ? 'Tempo limite excedido ao contatar o Asaas.' : 'Erro de rede ao contatar o Asaas.',
        isTimeout ? 'ASAAS_TIMEOUT' : 'NETWORK_ERROR'
      )
    } finally {
      clearTimeout(timer)
    }

    // Tenta ler JSON; se não conseguir, retorna objeto com status
    let data: unknown
    try { data = await res.json() } catch { data = {} }

    if (!res.ok) {
      this._handleHttpError(res.status, data)
    }

    return data
  }

  // ── tratamento de erros HTTP do Asaas ─────────────────────
  private _handleHttpError(status: number, body: unknown): never {
    // Extrai a primeira mensagem de erro do array errors do Asaas
    const errMsg = Array.isArray((body as Record<string,unknown>)?.errors)
      ? ((body as Record<string,unknown[]>).errors[0] as Record<string,string>)?.description ?? ''
      : ((body as Record<string,string>)?.message ?? '')

    if (status === 401 || status === 403) {
      throw new AsaasError('API Key inválida ou sem permissão.', 'INVALID_API_KEY')
    }
    if (status === 429) {
      throw new AsaasError('Limite de requisições excedido no Asaas.', 'RATE_LIMIT')
    }
    if (status === 400) {
      throw new AsaasError(
        errMsg || 'Dados inválidos enviados ao Asaas.',
        'ASAAS_VALIDATION_ERROR'
      )
    }
    if (status >= 500) {
      throw new AsaasError('O Asaas está temporariamente indisponível.', 'ASAAS_UNAVAILABLE')
    }
    throw new AsaasError(
      errMsg || `Erro inesperado no Asaas (HTTP ${status}).`,
      `ASAAS_HTTP_${status}`
    )
  }

  // ── validateCredentials ────────────────────────────────────
  async validateCredentials(): Promise<string> {
    const data = await this.request('GET', '/myAccount') as Record<string, unknown>
    return String(data?.name ?? 'conta Asaas')
  }

  // ── ensureCustomer ─────────────────────────────────────────
  /**
   * Cria um customer no Asaas ou localiza existente pelo CPF/CNPJ.
   * O Asaas não permite dois customers com o mesmo CPF — por isso
   * buscamos antes de criar.
   */
  async ensureCustomer(customer: CustomerInput): Promise<string> {
    // Se tiver documento, tenta encontrar customer existente
    if (customer.document) {
      const cleanDoc = customer.document.replace(/\D/g, '')
      const search = await this.request(
        'GET',
        `/customers?cpfCnpj=${encodeURIComponent(cleanDoc)}`
      ) as Record<string, unknown>

      const list = search?.data as Record<string, unknown>[] | undefined
      if (list && list.length > 0) {
        const existing = list[0]
        console.log(`[store-payment] customer existente reutilizado | store_id=${this.storeId}`)
        return String(existing.id)
      }
    }

    // Cria novo customer
    const payload: Record<string, string> = { name: customer.name }
    if (customer.document) payload.cpfCnpj = customer.document.replace(/\D/g, '')
    if (customer.email)    payload.email    = customer.email
    if (customer.phone)    payload.phone    = customer.phone.replace(/\D/g, '')

    const created = await this.request('POST', '/customers', payload) as Record<string, unknown>
    console.log(`[store-payment] customer criado | store_id=${this.storeId}`)
    return String(created.id)
  }

  // ── createPixCharge ────────────────────────────────────────
  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    // Vencimento: D+1 se não informado
    const dueDate = input.dueDate ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      return d.toISOString().split('T')[0]
    })()

    // Cria cobrança PIX
    const chargePayload: Record<string, unknown> = {
      customer:          input.customerId,
      billingType:       'PIX',
      value:             input.amount,
      dueDate,
      description:       input.description,
      externalReference: input.orderId ?? '',
    }

    const charge = await this.request('POST', '/payments', chargePayload) as Record<string, unknown>
    const paymentId = String(charge.id)

    console.log(
      `[store-payment] cobrança PIX criada | store_id=${this.storeId}` +
      ` | payment_id=${paymentId} | amount=${input.amount} | status=${charge.status}`
    )

    // Busca QR Code PIX
    const qrData = await this.request('GET', `/payments/${paymentId}/pixQrCode`) as Record<string, unknown>

    return {
      gatewayPaymentId: paymentId,
      status:           String(charge.status ?? 'PENDING'),
      invoiceUrl:       String(charge.invoiceUrl ?? ''),
      pixCode:          String(qrData?.payload       ?? ''),
      qrCode:           String(qrData?.encodedImage  ?? ''),
      expirationDate:   String(qrData?.expirationDate ?? dueDate),
      amount:           Number(charge.value  ?? input.amount),
      billingType:      'PIX',
    }
  }
}

// ── AsaasError ───────────────────────────────────────────────────
/** Erro tipado para falhas do gateway Asaas. */
class AsaasError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'AsaasError'
    this.code = code
  }
}

// ── GatewayError ─────────────────────────────────────────────────
/** Erro tipado genérico — usado pelo MercadoPagoProvider e futuros gateways. */
class GatewayError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'GatewayError'
    this.code = code
  }
}


// ── MercadoPagoProvider ──────────────────────────────────────────
/**
 * Implementação do PaymentProvider para o gateway Mercado Pago.
 *
 * Regras de segurança:
 *   - accessToken nunca é logado nem retornado
 *   - publicKey nunca é logada nem retornada
 *   - Erros HTTP do MP são convertidos em GatewayError tipado
 *
 * Nota sobre ambientes:
 *   - Sandbox: usar Access Token que começa com TEST-
 *   - Produção: usar Access Token que começa com APP_USR-
 *   O sistema não valida o prefixo — responsabilidade do lojista.
 */
class MercadoPagoProvider implements PaymentProvider {
  private readonly accessToken: string
  private readonly storeId:     string   // apenas para logs

  constructor(accessToken: string, _publicKey: string, storeId: string) {
    if (!accessToken) throw new GatewayError('Access Token do Mercado Pago não configurado.', 'NO_API_KEY')
    this.accessToken = accessToken
    this.storeId     = storeId
  }

  // ── fetch interno ──────────────────────────────────────────
  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${MP_BASE_URL}${path}`, {
        method,
        headers: {
          'Authorization':  `Bearer ${this.accessToken}`,  // nunca logado
          'Content-Type':   'application/json',
          'User-Agent':     'EncartShop/1.0',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timer)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      throw new GatewayError(
        isTimeout ? 'Tempo limite excedido ao contatar o Mercado Pago.' : 'Erro de rede ao contatar o Mercado Pago.',
        isTimeout ? 'MP_TIMEOUT' : 'NETWORK_ERROR'
      )
    } finally {
      clearTimeout(timer)
    }

    let data: unknown
    try { data = await res.json() } catch { data = {} }

    if (!res.ok) {
      this._handleHttpError(res.status, data)
    }

    return data
  }

  // ── tratamento de erros HTTP do Mercado Pago ───────────────
  private _handleHttpError(status: number, body: unknown): never {
    const b = body as Record<string, unknown>
    const cause = (b?.cause as Record<string, unknown>[])?.[0]
    const errMsg = cause
      ? String(cause.description ?? cause.code ?? '')
      : String(b?.message ?? b?.error ?? '')

    if (status === 401 || status === 403) {
      throw new GatewayError('Access Token inválido ou sem permissão.', 'INVALID_API_KEY')
    }
    if (status === 429) {
      throw new GatewayError('Limite de requisições excedido no Mercado Pago.', 'RATE_LIMIT')
    }
    if (status === 400 || status === 422) {
      throw new GatewayError(
        errMsg || 'Dados inválidos enviados ao Mercado Pago.',
        'MP_VALIDATION_ERROR'
      )
    }
    if (status >= 500) {
      throw new GatewayError('O Mercado Pago está temporariamente indisponível.', 'MP_UNAVAILABLE')
    }
    throw new GatewayError(
      errMsg || `Erro inesperado no Mercado Pago (HTTP ${status}).`,
      `MP_HTTP_${status}`
    )
  }

  // ── validateCredentials ────────────────────────────────────
  async validateCredentials(): Promise<string> {
    // Mercado Pago não tem endpoint /users/me simples em api.mercadopago.com.
    // Usamos /v1/payment_methods para testar se o token é válido (retorna 401 se inválido).
    await this.request('GET', '/v1/payment_methods')
    return 'conta Mercado Pago (Autenticada)'
  }

  // ── ensureCustomer ─────────────────────────────────────────
  /**
   * O Mercado Pago embute os dados do pagador (payer) direto na
   * criação do payment — não precisa de um objeto Customer separado.
   * Este método apenas retorna o nome do cliente para ser usado
   * como referência no payer block.
   */
  async ensureCustomer(customer: CustomerInput): Promise<string> {
    // No MP o "customer" é o payer embutido no payment.
    // Retornamos o nome como identificador local.
    return customer.name
  }

  // ── createPixCharge ────────────────────────────────────────
  /**
   * Cria uma cobrança PIX via POST /v1/payments.
   * A API do Mercado Pago retorna o QR Code e o código Copia e Cola
   * dentro do próprio response de criação do payment.
   */
  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    // Vencimento: D+1 se não informado
    const dueDate = input.dueDate ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      return d.toISOString().split('T')[0]
    })()

    // Monta payload conforme API v1 do Mercado Pago
    const chargePayload: Record<string, unknown> = {
      transaction_amount: input.amount,
      description:        input.description.slice(0, 255), // MP limita a 255 chars
      payment_method_id:  'pix',
      date_of_expiration: `${dueDate}T23:59:59.000-03:00`,
      external_reference: input.orderId ?? '',
      payer: {
        // O MP exige pelo menos o email ou nome. Usamos o nome como fallback.
        first_name: input.customerId.trim().split(' ')[0] ?? 'Cliente',
        last_name:  input.customerId.trim().split(' ').slice(1).join(' ') || 'EncartShop',
        // email é opcional mas melhora a UX na notificação do MP:
        // será adicionado quando o frontend enviar customer.email
      },
    }

    const charge = await this.request('POST', '/v1/payments', chargePayload) as Record<string, unknown>
    const paymentId = String(charge.id)

    // O QR Code vem em point_of_interaction.transaction_data
    const txData = (charge.point_of_interaction as Record<string, unknown>)
                    ?.transaction_data as Record<string, unknown> | undefined

    const pixCode = String(txData?.qr_code        ?? '')
    const qrCode  = String(txData?.qr_code_base64 ?? '')

    console.log(
      `[store-payment] MP cobrança PIX criada | store_id=${this.storeId}` +
      ` | payment_id=${paymentId} | amount=${input.amount} | status=${charge.status}`
    )

    return {
      gatewayPaymentId: paymentId,
      status:           String(charge.status ?? 'pending'),
      invoiceUrl:       String(charge.transaction_details
                          ? (charge.transaction_details as Record<string,string>).external_resource_url ?? ''
                          : ''),
      pixCode,
      qrCode,
      expirationDate:   `${dueDate}T23:59:59.000-03:00`,
      amount:           Number(charge.transaction_amount ?? input.amount),
      billingType:      'PIX',
    }
  }
}


// ── Helpers HTTP ─────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Sempre retorna HTTP 200 — o cliente lê o campo success para saber o resultado. */
function errorResponse(message: string, code?: string): Response {
  return jsonResponse({ success: false, message, ...(code ? { code } : {}) })
}

function sanitizeEnvironment(env: unknown): 'sandbox' | 'production' | null {
  if (env === 'sandbox' || env === 'production') return env
  return null
}

// ── Factory de provider ──────────────────────────────────────────
/**
 * Cria a instância correta do PaymentProvider com base no gateway configurado.
 * Ponto único de extensão: para adicionar PagBank ou Stripe,
 * basta adicionar um case aqui e criar a respectiva classe.
 */
function createProvider(settings: StoreSettings): PaymentProvider {
  const env = sanitizeEnvironment(settings.environment)
  if (!env) throw new GatewayError(
    'Ambiente inválido. Configure "sandbox" ou "production".',
    'INVALID_ENVIRONMENT'
  )

  switch (settings.payment_provider) {
    case 'asaas':
      return new AsaasProvider(settings.asaas_api_key, env, settings.id)

    case 'mercadopago':
      return new MercadoPagoProvider(
        settings.mp_access_token,
        settings.mp_public_key,
        settings.id
      )

    // Futuros gateways:
    // case 'pagbank': return new PagBankProvider(settings, env)
    // case 'stripe':  return new StripeProvider(settings, env)

    default:
      throw new GatewayError(
        `Gateway "${settings.payment_provider}" não suportado.`,
        'UNSUPPORTED_GATEWAY'
      )
  }
}

// ── Busca de configurações (service_role) ────────────────────────
/**
 * Busca store_payment_settings e as credenciais do provider ativo na tabela de segredos.
 * Agnostico de gateway — retorna o provider habilitado (payment_enabled=true) ou o mais recente.
 * Único ponto do sistema que acessa credenciais — nunca retorna ao frontend.
 */
async function fetchSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
  storeId: string
): Promise<StoreSettings | null> {
  // Busca o provider ativo (ou o mais recentemente atualizado)
  const { data: settingsData, error: settingsError } = await supabaseAdmin
    .from('store_payment_settings')
    .select('id, payment_provider, environment, payment_enabled, payment_methods')
    .eq('store_id', storeId)
    .eq('payment_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (settingsError || !settingsData) {
    if (settingsError) console.error(`[store-payment] fetchSettings error | store_id=${storeId} | msg=${settingsError.message}`)
    return null
  }

  const provider = settingsData.payment_provider

  const { data: secretData } = await supabaseAdmin
    .from('store_payment_secrets')
    .select('asaas_api_key, mp_access_token, mp_public_key')
    .eq('store_id', storeId)
    .eq('payment_provider', provider)
    .maybeSingle()

  return {
    ...settingsData,
    asaas_api_key:   secretData?.asaas_api_key   || '',
    mp_access_token: secretData?.mp_access_token || '',
    mp_public_key:   secretData?.mp_public_key   || '',
  } as StoreSettings
}


// ── Router principal ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 'METHOD_NOT_ALLOWED')
  }

  const startTime = Date.now()

  // ── Autenticação JWT ───────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Autenticação necessária.', 'UNAUTHORIZED')
  }
  const token = authHeader.replace('Bearer ', '').trim()

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) {
    return errorResponse('Token inválido ou expirado.', 'UNAUTHORIZED')
  }

  // ── Parse body ─────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Body inválido. Esperado JSON.', 'INVALID_BODY')
  }

  const { action, storeId } = body
  if (!action || typeof action !== 'string') {
    return errorResponse('Campo "action" obrigatório.', 'MISSING_ACTION')
  }
  if (!storeId || typeof storeId !== 'string') {
    return errorResponse('Campo "storeId" obrigatório.', 'MISSING_STORE_ID')
  }

  // ── Verifica dono da loja via RLS ──────────────────────────
  const { data: store, error: storeError } = await supabaseUser
    .from('stores')
    .select('id, name, plan')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError || !store) {
    console.error(`[store-payment] acesso negado | store_id=${storeId} | user=${user.id}`)
    return errorResponse('Loja não encontrada.', 'STORE_NOT_FOUND')
  }

  // ── Roteamento ─────────────────────────────────────────────
  try {
    switch (action) {
      case 'validateApiKey':
        return await handleValidateApiKey(supabaseAdmin, store, startTime)

      case 'createPixCharge':
        return await handleCreatePixCharge(supabaseAdmin, store, body, startTime)

      default:
        return errorResponse(`Action "${action}" não reconhecida.`, 'UNKNOWN_ACTION')
    }
  } catch (err: unknown) {
    // Erros não tratados — loga sem expor detalhes internos
    const msg  = err instanceof Error ? err.message : 'Erro interno.'
    const code = (err instanceof AsaasError || err instanceof GatewayError) ? err.code : 'INTERNAL_ERROR'
    console.error(`[store-payment] unhandled error | action=${action} | store_id=${storeId} | code=${code}`)
    return errorResponse(msg, code)
  }
})


// ── Action: validateApiKey ────────────────────────────────────────

async function handleValidateApiKey(
  supabaseAdmin: ReturnType<typeof createClient>,
  store: { id: string; name: string; plan: string },
  startTime: number
): Promise<Response> {

  const settings = await fetchSettings(supabaseAdmin, store.id)

  if (!settings) {
    console.log(`[store-payment] validateApiKey | store_id=${store.id} | result=no_settings`)
    return jsonResponse({ success: false, message: 'Credenciais não configuradas.', code: 'NO_SETTINGS' })
  }

  const hasCredentials = settings.payment_provider === 'asaas'
    ? !!settings.asaas_api_key
    : settings.payment_provider === 'mercadopago'
      ? !!settings.mp_access_token
      : false

  if (!hasCredentials) {
    console.log(`[store-payment] validateApiKey | store_id=${store.id} | provider=${settings.payment_provider} | result=no_api_key`)
    return jsonResponse({ success: false, message: 'Credenciais do gateway não configuradas.', code: 'NO_API_KEY' })
  }

  const env = sanitizeEnvironment(settings.environment)
  if (!env) {
    console.error(`[store-payment] ambiente inválido | store_id=${store.id}`)
    return errorResponse('Ambiente inválido. Configure "sandbox" ou "production".', 'INVALID_ENVIRONMENT')
  }

  try {
    const provider   = createProvider(settings)
    const accountName = await provider.validateCredentials()
    const elapsed     = Date.now() - startTime

    console.log(
      `[store-payment] validateApiKey | store_id=${store.id} | gateway=${settings.payment_provider}` +
      ` | environment=${env} | result=success | elapsed=${elapsed}ms`
    )
    return jsonResponse({
      success:     true,
      gateway:     settings.payment_provider,
      environment: env,
      message:     `Conexão realizada com sucesso. Conta: ${accountName}`,
    })
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime
    const code    = (err instanceof AsaasError || err instanceof GatewayError) ? err.code : 'UNKNOWN'
    const msg     = err instanceof Error ? err.message : 'Erro desconhecido.'

    console.log(
      `[store-payment] validateApiKey | store_id=${store.id} | gateway=${settings.payment_provider}` +
      ` | environment=${env} | result=error | code=${code} | elapsed=${elapsed}ms`
    )
    return jsonResponse({ success: false, message: msg, code })
  }
}


// ── Action: createPixCharge ───────────────────────────────────────
/**
 * Cria uma cobrança PIX usando a conta Asaas do lojista.
 *
 * Fluxo:
 *   1. Valida campos obrigatórios
 *   2. Busca configurações da loja (gateway + env + api_key)
 *   3. Verifica payment_enabled
 *   4. Instancia o PaymentProvider correto
 *   5. Cria/localiza customer no Asaas
 *   6. Cria cobrança PIX e busca QR Code
 *   7. Persiste em order_payments via service_role
 *   8. Retorna dados para o frontend (sem expor api_key)
 *
 * IMPORTANTE: Esta action NÃO altera a tabela orders.
 * A atualização de orders.status acontecerá no webhook (Fase 3D).
 */
async function handleCreatePixCharge(
  supabaseAdmin: ReturnType<typeof createClient>,
  store: { id: string; name: string; plan: string },
  body:  Record<string, unknown>,
  startTime: number
): Promise<Response> {

  // ── Validação de entrada ───────────────────────────────────
  const { orderId, customer, amount, description } = body

  if (!customer || typeof customer !== 'object') {
    return errorResponse('Campo "customer" obrigatório (objeto com name).', 'MISSING_CUSTOMER')
  }
  const cust = customer as Record<string, unknown>
  if (!cust.name || typeof cust.name !== 'string' || !cust.name.trim()) {
    return errorResponse('customer.name obrigatório.', 'MISSING_CUSTOMER_NAME')
  }

  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(String(amount))
  if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
    return errorResponse('Campo "amount" deve ser um número positivo.', 'INVALID_AMOUNT')
  }
  // Asaas exige mínimo de R$ 1,00
  if (parsedAmount < 1) {
    return errorResponse('Valor mínimo para cobrança é R$ 1,00.', 'AMOUNT_TOO_LOW')
  }

  const descStr = typeof description === 'string' && description.trim()
    ? description.trim()
    : `Pedido ${store.name}`

  const orderIdStr = typeof orderId === 'string' && orderId ? orderId : undefined

  // ── Busca configurações da loja ────────────────────────────
  const settings = await fetchSettings(supabaseAdmin, store.id)

  if (!settings) {
    console.log(`[store-payment] createPixCharge | store_id=${store.id} | result=no_settings`)
    return jsonResponse({ success: false, message: 'Pagamento online não configurado para esta loja.', code: 'NO_SETTINGS' })
  }

  // ── Verifica credenciais do provider ativo ─────────────────
  const hasCredentials = settings.payment_provider === 'asaas'
    ? !!settings.asaas_api_key
    : settings.payment_provider === 'mercadopago'
      ? !!settings.mp_access_token
      : false

  if (!hasCredentials) {
    console.log(`[store-payment] createPixCharge | store_id=${store.id} | provider=${settings.payment_provider} | result=no_api_key`)
    return jsonResponse({ success: false, message: 'Credenciais do gateway não configuradas.', code: 'NO_API_KEY' })
  }

  // ── Verifica se gateway está habilitado ────────────────────
  if (!settings.payment_enabled) {
    console.log(`[store-payment] createPixCharge | store_id=${store.id} | result=gateway_disabled`)
    return jsonResponse({ success: false, message: 'Pagamento online está desabilitado para esta loja.', code: 'GATEWAY_DISABLED' })
  }

  // ── Verifica se PIX está nos métodos aceitos ───────────────
  if (!settings.payment_methods?.includes('PIX')) {
    return jsonResponse({ success: false, message: 'PIX não está habilitado para esta loja.', code: 'PIX_NOT_ENABLED' })
  }

  // ── Instancia provider e executa operações ─────────────────
  let chargeResult: PixChargeResult
  let asaasCustomerId: string

  try {
    const provider = createProvider(settings)

    // Cria ou localiza customer
    const customerInput: CustomerInput = {
      name:     String(cust.name).trim(),
      document: typeof cust.document === 'string' ? cust.document : undefined,
      email:    typeof cust.email    === 'string' ? cust.email    : undefined,
      phone:    typeof cust.phone    === 'string' ? cust.phone    : undefined,
    }
    asaasCustomerId = await provider.ensureCustomer(customerInput)

    // Cria cobrança PIX
    chargeResult = await provider.createPixCharge({
      customerId:  asaasCustomerId,
      amount:      parsedAmount,
      description: descStr,
      orderId:     orderIdStr,
      dueDate:     typeof body.dueDate === 'string' ? body.dueDate : undefined,
    })

  } catch (err: unknown) {
    const elapsed = Date.now() - startTime
    const code    = (err instanceof AsaasError || err instanceof GatewayError) ? err.code : 'PROVIDER_ERROR'
    const msg     = err instanceof Error ? err.message : 'Erro ao processar pagamento.'

    console.error(
      `[store-payment] createPixCharge | store_id=${store.id} | provider=${settings.payment_provider} | result=error` +
      ` | code=${code} | elapsed=${elapsed}ms`
    )
    return jsonResponse({ success: false, message: msg, code })
  }

  // ── Persiste em order_payments ─────────────────────────────
  // Status inicial: 'pending' (aguardando pagamento)
  // O webhook atualizará para 'confirmed', 'expired', 'cancelled' ou 'refunded'
  const orderPaymentRecord = {
    store_id:           store.id,
    order_id:           orderIdStr ?? null,
    gateway:            settings.payment_provider,
    gateway_payment_id: chargeResult.gatewayPaymentId,
    billing_type:       'pix',
    amount:             chargeResult.amount,
    status:             'pending',      // sempre 'pending' na criação — webhook atualiza
    payment_url:        chargeResult.invoiceUrl,
    pix_code:           chargeResult.pixCode,
    qr_code:            chargeResult.qrCode,
    due_date:           chargeResult.expirationDate?.split('T')[0] ?? null,
    customer_name:      String(cust.name).trim(),
    customer_document:  typeof cust.document === 'string' ? cust.document.replace(/\D/g, '') : null,
    customer_email:     typeof cust.email === 'string' ? cust.email : null,
    customer_phone:     typeof cust.phone === 'string' ? cust.phone : null,
    // metadata: dados de auditoria — sem api_key, sem credenciais, sem dados sensíveis
    metadata: {
      gateway_payment_id: chargeResult.gatewayPaymentId,
      gateway_customer_id: asaasCustomerId,    // nome do customer (MP) ou ID (Asaas)
      environment:         settings.environment,
      created_at:          new Date().toISOString(),
    },
  }

  const { data: savedPayment, error: insertError } = await supabaseAdmin
    .from('order_payments')
    .insert([orderPaymentRecord])
    .select('id')
    .single()

  if (insertError) {
    // Cobrança foi criada no Asaas mas não salva no banco — log crítico
    console.error(
      `[store-payment] createPixCharge | CRITICAL: cobrança criada no Asaas mas falhou ao salvar` +
      ` | store_id=${store.id} | gateway_payment_id=${chargeResult.gatewayPaymentId}` +
      ` | db_error=${insertError.message}`
    )
    // Retorna sucesso parcial: o cliente pode pagar, mas o status pode não ser rastreado automaticamente
    return jsonResponse({
      success:        true,
      warning:        'Cobrança criada, mas houve um problema ao registrar internamente. Contate o suporte se necessário.',
      orderPaymentId: null,
      paymentId:      chargeResult.gatewayPaymentId,
      invoiceUrl:     chargeResult.invoiceUrl,
      pixCode:        chargeResult.pixCode,
      qrCode:         chargeResult.qrCode,
      expirationDate: chargeResult.expirationDate,
      status:         chargeResult.status,
      amount:         chargeResult.amount,
      billingType:    'PIX',
    })
  }

  const elapsed = Date.now() - startTime
  console.log(
    `[store-payment] createPixCharge | store_id=${store.id} | gateway=${settings.payment_provider}` +
    ` | environment=${settings.environment} | order_payment_id=${savedPayment.id}` +
    ` | gateway_payment_id=${chargeResult.gatewayPaymentId}` +
    ` | amount=${chargeResult.amount} | elapsed=${elapsed}ms`
  )

  // ── Resposta ao frontend ───────────────────────────────────
  // Nunca inclui api_key, access_token ou qualquer credencial
  return jsonResponse({
    success:        true,
    orderPaymentId: savedPayment.id,
    paymentId:      chargeResult.gatewayPaymentId,
    invoiceUrl:     chargeResult.invoiceUrl,
    pixCode:        chargeResult.pixCode,
    qrCode:         chargeResult.qrCode,
    expirationDate: chargeResult.expirationDate,
    status:         chargeResult.status,
    amount:         chargeResult.amount,
    billingType:    'PIX',
  })
}
