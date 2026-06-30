/**
 * EncartShop — Módulo de Pagamentos Online
 * Fase 1: Interfaces de API (sem implementação real)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ATENÇÃO — FASE 1                                               ║
 * ║                                                                  ║
 * ║  Este arquivo existe apenas para reservar o namespace e         ║
 * ║  definir as interfaces que serão implementadas nas fases         ║
 * ║  seguintes.                                                      ║
 * ║                                                                  ║
 * ║  Nenhuma função deste arquivo é chamada por nenhum              ║
 * ║  módulo existente.                                               ║
 * ║                                                                  ║
 * ║  O fluxo atual (WhatsApp) permanece 100% inalterado.            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Responsabilidade futura:
 *   - StorePaymentAPI: configurações de pagamento da loja
 *   - OrderPaymentAPI: criação e consulta de cobranças
 */

// ──────────────────────────────────────────────────────────────────
// StorePaymentAPI
// Gerencia as configurações do módulo de pagamento de uma loja.
// Operações sobre a tabela store_payment_settings.
// ──────────────────────────────────────────────────────────────────

const StorePaymentAPI = {
  /**
   * Busca as configurações de pagamento de uma loja.
   * Retorna null se a loja não tiver pagamento configurado.
   *
   * @param {string} storeId - UUID da loja
   * @returns {Promise<Object|null>} configurações ou null
   *
   * NOTA: A coluna asaas_api_key NÃO é retornada por esta função.
   * Apenas metadados não-sensíveis (payment_enabled, methods, etc.)
   */
  async getByStore(storeId) {
    // TODO: Implementar na Fase 2
    // const { data, error } = await window.sb
    //   .from('store_payment_settings')
    //   .select('id, store_id, payment_provider, environment, payment_enabled, payment_methods, created_at, updated_at')
    //   .eq('store_id', storeId)
    //   .maybeSingle();
    // if (error) { console.error('StorePaymentAPI.getByStore:', error); return null; }
    // return data;
    return null;
  },

  /**
   * Verifica se uma loja tem o módulo de pagamento ativo.
   * Método auxiliar de baixo custo para uso no checkout.
   *
   * @param {string} storeId - UUID da loja
   * @returns {Promise<boolean>} true se pagamento online está ativo
   */
  async isEnabled(storeId) {
    // TODO: Implementar na Fase 2
    // const settings = await StorePaymentAPI.getByStore(storeId);
    // return settings?.payment_enabled === true;
    return false; // Sempre false na Fase 1 — módulo inativo
  },

  /**
   * Salva ou atualiza as configurações de pagamento da loja.
   * A asaas_api_key é validada antes de salvar via Edge Function.
   *
   * @param {string} storeId - UUID da loja
   * @param {Object} settings - Configurações a salvar
   * @param {string} settings.payment_provider - 'asaas' | 'mercadopago' | etc.
   * @param {string} settings.asaas_api_key - API Key (enviada à Edge Function, nunca salva direto)
   * @param {string} settings.environment - 'sandbox' | 'production'
   * @param {boolean} settings.payment_enabled - Ativar/desativar módulo
   * @param {string[]} settings.payment_methods - ['PIX', 'BOLETO', etc.]
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async save(storeId, settings) {
    // TODO: Implementar na Fase 2
    // A API Key não é salva diretamente pelo frontend.
    // Fluxo: frontend → Edge Function (validateApiKey) → banco (service_role)
    return { success: false, error: 'Não implementado na Fase 1' };
  },

  /**
   * Valida uma API Key Asaas antes de salvar.
   * Chama a Edge Function store-payment com action: 'validateApiKey'.
   *
   * @param {string} storeId - UUID da loja
   * @param {string} apiKey - Chave a validar
   * @param {string} environment - 'sandbox' | 'production'
   * @returns {Promise<{valid: boolean, accountName?: string, error?: string}>}
   */
  async validateApiKey(storeId, apiKey, environment) {
    // TODO: Implementar na Fase 2
    // return await window.sb.functions.invoke('store-payment', {
    //   body: { action: 'validateApiKey', storeId, apiKey, environment }
    // });
    return { valid: false, error: 'Não implementado na Fase 1' };
  }
};


// ──────────────────────────────────────────────────────────────────
// OrderPaymentAPI
// Gerencia cobranças individuais dos pedidos.
// Operações sobre a tabela order_payments via Edge Functions.
// ──────────────────────────────────────────────────────────────────

const OrderPaymentAPI = {
  /**
   * Cria uma cobrança PIX para um pedido.
   * Chama a Edge Function store-payment com action: 'createPixCharge'.
   * Implementado na Fase 3B. Persiste em order_payments automaticamente.
   *
   * @param {Object} params
   * @param {string} params.storeId - UUID da loja
   * @param {string} [params.orderId] - UUID do pedido (opcional)
   * @param {Object} params.customer - Dados do comprador
   * @param {string} params.customer.name - Nome obrigatório
   * @param {string} [params.customer.document] - CPF/CNPJ
   * @param {string} [params.customer.email] - Email
   * @param {string} [params.customer.phone] - Telefone
   * @param {number} params.amount - Valor em reais (> 0)
   * @param {string} [params.description] - Descrição da cobrança
   * @param {string} [params.dueDate] - Vencimento YYYY-MM-DD (padrão: D+1)
   * @returns {Promise<{success: boolean, orderPaymentId?: string, paymentId?: string, pixCode?: string, qrCode?: string, invoiceUrl?: string, expirationDate?: string, status?: string, amount?: number, billingType?: string, message?: string, code?: string}>}
   */
  async createCharge(params) {
    if (!params.storeId) return { success: false, message: 'storeId obrigatório.' };
    if (!params.customer?.name) return { success: false, message: 'customer.name obrigatório.' };
    if (!params.amount || params.amount <= 0) return { success: false, message: 'amount deve ser positivo.' };
    try {
      const { data, error } = await window.sb.functions.invoke('store-payment', {
        body: {
          action:      'createPixCharge',
          storeId:     params.storeId,
          orderId:     params.orderId    ?? null,
          customer:    params.customer,
          amount:      params.amount,
          description: params.description ?? null,
          dueDate:     params.dueDate     ?? null,
        }
      });
      if (error) {
        console.error('[OrderPaymentAPI] createCharge invoke error:', error.message);
        return { success: false, message: 'Não foi possível criar a cobrança. Tente novamente.' };
      }
      return data;
    } catch (e) {
      console.error('[OrderPaymentAPI] createCharge exception:', e.message);
      return { success: false, message: 'Erro inesperado ao criar cobrança.' };
    }
  },

  /**
   * Consulta o status atual de uma cobrança.
   * Chama a Edge Function store-payment com action: 'getChargeStatus'.
   *
   * @param {string} storeId - UUID da loja
   * @param {string} orderPaymentId - UUID do registro em order_payments
   * @returns {Promise<{success: boolean, status?: string, paidAt?: string, error?: string}>}
   */
  async getStatus(storeId, orderPaymentId) {
    // TODO: Implementar na Fase 2
    // const { data, error } = await window.sb.functions.invoke('store-payment', {
    //   body: { action: 'getChargeStatus', storeId, orderPaymentId }
    // });
    // if (error) { console.error('OrderPaymentAPI.getStatus:', error); return null; }
    // return data;
    return null;
  },

  /**
   * Cancela uma cobrança em aberto.
   * Chama a Edge Function store-payment com action: 'cancelCharge'.
   *
   * @param {string} storeId - UUID da loja
   * @param {string} orderPaymentId - UUID do registro em order_payments
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancelCharge(storeId, orderPaymentId) {
    // TODO: Implementar na Fase 2
    // const { data, error } = await window.sb.functions.invoke('store-payment', {
    //   body: { action: 'cancelCharge', storeId, orderPaymentId }
    // });
    // if (error) throw error;
    // return data;
    return { success: false, error: 'Não implementado na Fase 1' };
  },

  /**
   * Busca o histórico de cobranças de um pedido.
   * Leitura direta da tabela order_payments (via RLS).
   *
   * @param {string} storeId - UUID da loja
   * @param {string} orderId - UUID do pedido
   * @returns {Promise<Array>} lista de cobranças ou array vazio
   */
  async getByOrder(storeId, orderId) {
    // TODO: Implementar na Fase 2
    // const { data, error } = await window.sb
    //   .from('order_payments')
    //   .select('id, gateway, billing_type, amount, status, payment_url, created_at, paid_at')
    //   .eq('store_id', storeId)
    //   .eq('order_id', orderId)
    //   .order('created_at', { ascending: false });
    // if (error) { console.error('OrderPaymentAPI.getByOrder:', error); return []; }
    // return data || [];
    return [];
  },

  /**
   * Busca todas as cobranças de uma loja com filtros opcionais.
   *
   * @param {string} storeId - UUID da loja
   * @param {Object} [options]
   * @param {string} [options.status] - Filtrar por status
   * @param {string} [options.startDate] - Data inicial (YYYY-MM-DD)
   * @param {string} [options.endDate] - Data final (YYYY-MM-DD)
   * @param {number} [options.limit=50] - Limite de registros
   * @returns {Promise<Array>} lista de cobranças ou array vazio
   */
  async getByStore(storeId, options = {}) {
    // TODO: Implementar na Fase 2
    return [];
  }
};


// ──────────────────────────────────────────────────────────────────
// Exportação global
// Adicionado ao namespace EncartAPI na Fase 3, quando as
// Edge Functions e implementações estiverem prontas.
//
// NÃO adicionado ao EncartAPI agora para não interferir
// com o objeto existente em api.js.
//
// NOTA (Fase 2): StorePaymentAPI foi implementado em
// payment-settings.js como parte do PaymentSettingsModule.
// Este arquivo mantém as interfaces de OrderPaymentAPI para
// uso futuro no checkout (Fase 4).
// ──────────────────────────────────────────────────────────────────

// Expõe OrderPaymentAPI globalmente para uso futuro (não referenciado por nenhum módulo atual)
window.OrderPaymentAPI = OrderPaymentAPI;
