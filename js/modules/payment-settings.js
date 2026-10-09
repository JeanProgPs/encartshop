/**
 * EncartShop — PaymentSettingsModule
 * Fase 2: Configuração do Gateway no Painel do Lojista
 *
 * Responsabilidade:
 *   Renderizar e gerenciar a seção "Pagamentos Online" em configuracoes.html.
 *   Operações sobre store_payment_settings (criada na Fase 1).
 *
 * REGRAS INVIOLÁVEIS:
 *   ✅ Não altera nenhum fluxo existente (WhatsApp, pedidos, mensalidades)
 *   ✅ Não modifica a tabela stores
 *   ✅ A API Key nunca aparece em logs ou é retornada ao frontend após salva
 *   ✅ payment_enabled = false por padrão até ativação explícita
 *   ✅ Apenas planos pro/enterprise têm acesso ao módulo
 */

const PaymentSettingsModule = (() => {

  // ── Constantes ──────────────────────────────────────────────
  const CONTAINER_ID = 'payment-settings-card';
  const PLANS_WITH_ACCESS = ['pro', 'enterprise'];

  const GATEWAYS = [
    { value: 'asaas',       label: 'Asaas',        enabled: true  },
    { value: 'mercadopago', label: 'Mercado Pago',  enabled: true },
    { value: 'pagbank',     label: 'PagBank',       enabled: false },
    { value: 'stripe',      label: 'Stripe',        enabled: false },
  ];

  const PAYMENT_METHODS = [
    { value: 'PIX',         label: 'PIX',              enabled: true,  icon: '💠' },
    { value: 'CREDIT_CARD', label: 'Cartão de Crédito', enabled: false, icon: '💳' },
    { value: 'BOLETO',      label: 'Boleto',            enabled: false, icon: '📄' },
  ];

  // ── Estado interno ───────────────────────────────────────────
  let _store         = null;
  let _settings      = null;   // dados de store_payment_settings
  let _apiKeyChanged = false;  // controla se a chave foi alterada nesta sessão


  // ── StorePaymentAPI ─────────────────────────────────────────
  // Operações sobre a tabela store_payment_settings.
  // A API Key é tratada com cuidado especial:
  //   - nunca é retornada pelo SELECT (apenas indicador de existência)
  //   - o campo é enviado ao banco somente quando o usuário digita uma nova chave
  const StorePaymentAPI = {

    /**
     * Busca as configurações sem retornar a asaas_api_key.
     * Retorna apenas metadados seguros para o frontend.
     */
    async getByStore(storeId, provider = null) {
      if (!storeId) return null;
      try {
        let query = window.sb
          .from('store_payment_settings')
          .select('id, store_id, payment_provider, environment, payment_enabled, payment_methods, created_at, updated_at')
          .eq('store_id', storeId)
          .order('payment_enabled', { ascending: false })
          .order('updated_at', { ascending: false });
        
        if (provider) {
           query = query.eq('payment_provider', provider);
        }
        
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) { console.error('[PaymentSettings] getByStore:', error.message); return null; }
        return data || null;
      } catch (e) {
        console.error('[PaymentSettings] getByStore exception:', e.message);
        return null;
      }
    },

    /**
     * Verifica apenas se existe uma API Key salva (sem retornar o valor).
     * Retorna boolean.
     */
    async hasApiKey(storeId, provider = 'asaas') {
      if (!storeId) return false;
      try {
        const { data, error } = await window.sb
          .from('store_payment_settings')
          .select('has_asaas_key, has_mp_key')
          .eq('store_id', storeId)
          .eq('payment_provider', provider)
          .maybeSingle();
        if (error || !data) return false;
        return provider === 'asaas' ? data.has_asaas_key : data.has_mp_key;
      } catch { return false; }
    },

    /**
     * Salva (upsert) as configurações.
     * A asaas_api_key só é incluída no payload se foi alterada nesta sessão.
     */
    async saveSettings(storeId, payload) {
      if (!storeId) return { success: false, error: 'store_id obrigatório' };
      try {
        const rpcPayload = {
          store_id:         storeId,
          payment_provider: payload.payment_provider || 'asaas',
          environment:      payload.environment      || 'sandbox',
          payment_enabled:  payload.payment_enabled  ?? false,
          payment_methods:  payload.payment_methods  || ['PIX'],
        };

        if (rpcPayload.payment_provider === 'asaas') {
          if (payload.asaas_api_key && payload.asaas_api_key.trim()) {
            rpcPayload.asaas_api_key = payload.asaas_api_key.trim();
          }
        } else if (rpcPayload.payment_provider === 'mercadopago') {
          if (payload.mp_access_token && payload.mp_access_token.trim()) {
            rpcPayload.mp_access_token = payload.mp_access_token.trim();
          }
          if (payload.mp_public_key && payload.mp_public_key.trim()) {
            rpcPayload.mp_public_key = payload.mp_public_key.trim();
          }
        }

        const { error } = await window.sb.rpc('save_store_payment_settings', { payload: rpcPayload });

        if (error) {
          console.error('[PaymentSettings] saveSettings:', error.message);
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message || 'Erro ao salvar' };
      }
    },

    /**
     * Remove as configurações de pagamento da loja.
     * Desativa o módulo e apaga a API Key.
     */
    async removeSettings(storeId, provider = 'asaas') {
      if (!storeId) return { success: false, error: 'store_id obrigatório' };
      try {
        const { error } = await window.sb.rpc('delete_store_payment_settings', { p_store_id: storeId, p_provider: provider });
        if (error) {
          console.error('[PaymentSettings] removeSettings:', error.message);
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message || 'Erro ao remover' };
      }
    },

    /**
     * Valida a API Key da loja chamando a Edge Function store-payment.
     * Implementado na Fase 3A. Não cria cobranças nem altera dados.
     *
     * @param {string} storeId - UUID da loja
     * @param {string} environment - 'sandbox' | 'production'
     * @returns {Promise<{success: boolean, gateway?: string, environment?: string, message: string, code?: string}>}
     */
    async testConnection(storeId, environment) {
      if (!storeId) return { success: false, message: 'store_id obrigatório.' };
      try {
        const { data, error } = await window.sb.functions.invoke('store-payment', {
          body: { action: 'validateApiKey', storeId, environment }
        });
        if (error) {
          // Erro de invocação da função (ex: função não deployada ainda)
          console.error('[PaymentSettings] testConnection invoke error:', error.message);
          return { success: false, message: 'Não foi possível contatar o servidor. Tente novamente.' };
        }
        return data;
      } catch (e) {
        console.error('[PaymentSettings] testConnection exception:', e.message);
        return { success: false, message: 'Erro inesperado ao testar conexão.' };
      }
    },
  };


  // ── Helpers de plan ─────────────────────────────────────────

  function _hasAccess(store) {
    if (!store) return false;
    const plan = (store.plan || '').toLowerCase();
    return PLANS_WITH_ACCESS.includes(plan);
  }

  // ── Renderizadores ───────────────────────────────────────────

  /**
   * Card mostrado para lojas sem acesso ao módulo (Start/Básico).
   */
  function _renderUpgradeCard(container) {
    container.innerHTML = `
      <div class="flex items-start gap-3 mb-4">
        <div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <i data-lucide="credit-card" class="w-5 h-5 text-accent"></i>
        </div>
        <div>
          <h3 class="text-base font-semibold text-textPrimary">Pagamentos Online</h3>
          <p class="text-sm text-textSecondary mt-0.5">Receba pagamentos diretamente na sua loja.</p>
        </div>
      </div>
      <div class="bg-accent/5 border border-accent/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1">
          <p class="text-sm font-semibold text-textPrimary">Disponível no Plano Profissional</p>
          <p class="text-xs text-textSecondary mt-1 leading-relaxed">
            Aceite PIX, cartão e boleto diretamente no carrinho. O dinheiro cai na sua conta automaticamente.
          </p>
        </div>
        <a href="pagamento.html" class="flex-shrink-0 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors text-center whitespace-nowrap">
          Conhecer Plano Pro
        </a>
      </div>
    `;
    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ nodes: [container] }); }, 10);
  }

  /**
   * Card completo para lojas Pro/Enterprise.
   */
  function _renderSettingsCard(container, settings, hasKey) {
    const isEnabled   = settings?.payment_enabled ?? false;
    const environment = settings?.environment     ?? 'sandbox';
    const provider    = settings?.payment_provider ?? 'asaas';
    const methods     = settings?.payment_methods  ?? ['PIX'];

    const statusBadge = isEnabled
      ? `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
           <span class="w-1.5 h-1.5 rounded-full bg-success"></span> Ativo
         </span>`
      : `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-textSecondary bg-bgPrimary border border-borderColor px-2.5 py-1 rounded-full">
           <span class="w-1.5 h-1.5 rounded-full bg-textSecondary/40"></span> Desativado
         </span>`;

    const gatewayOptions = GATEWAYS.map(g => `
      <option value="${g.value}" ${g.value === provider ? 'selected' : ''} ${!g.enabled ? 'disabled' : ''}>
        ${g.label}${!g.enabled ? ' (Em breve)' : ''}
      </option>`).join('');

    const keyPlaceholder = hasKey ? '••••••••••••••••ABCD' : 'aact_XXXXXXXXXXXXXXXXXXXXXXXX';
    const keyHint = hasKey
      ? `<p class="text-xs text-textSecondary mt-1.5 flex items-center gap-1.5">
           <i data-lucide="lock" class="w-3 h-3"></i>
           Chave salva. Digite uma nova para substituir, ou clique em Remover Chave.
         </p>`
      : `<p class="text-xs text-textSecondary mt-1.5">Encontre sua chave em: Asaas → Minha Conta → Integrações → API Key</p>`;

    const methodsHtml = PAYMENT_METHODS.map(m => {
      const checked  = methods.includes(m.value);
      const disabled = !m.enabled;
      return `
        <label class="flex items-center gap-3 p-3 rounded-lg border ${checked && m.enabled ? 'border-accent/30 bg-accent/5' : 'border-borderColor'} cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bgPrimary'} transition-colors">
          <input type="checkbox"
            id="pm-method-${m.value}"
            value="${m.value}"
            ${checked ? 'checked' : ''}
            ${disabled ? 'disabled' : ''}
            onchange="PaymentSettingsModule._onMethodChange()"
            class="w-4 h-4 rounded border-borderColor text-accent focus:ring-accent accent-accent">
          <span class="text-base leading-none">${m.icon}</span>
          <span class="text-sm font-medium text-textPrimary flex-1">${m.label}</span>
          ${disabled ? '<span class="text-xs text-textSecondary bg-bgPrimary px-2 py-0.5 rounded-full border border-borderColor">Em breve</span>' : ''}
        </label>`;
    }).join('');

    container.innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-5">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <i data-lucide="credit-card" class="w-5 h-5 text-accent"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-textPrimary">Pagamentos Online</h3>
            <p class="text-sm text-textSecondary mt-0.5">Configure o gateway para aceitar pagamentos no carrinho.</p>
          </div>
        </div>
        ${statusBadge}
      </div>

      <div class="flex flex-col gap-5">

        <!-- Gateway -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-textPrimary">Gateway de Pagamento</label>
          <select id="pm-provider"
            onchange="PaymentSettingsModule._onProviderChange()"
            class="w-full bg-bgPrimary border border-borderColor rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent appearance-none"
            style="background-image:url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\");background-repeat:no-repeat;background-position:right 12px center;background-size:16px;">
            ${gatewayOptions}
          </select>
          
        </div>

        <!-- Ambiente -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-textPrimary">Ambiente</label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" id="pm-env-sandbox" name="pm-environment" value="sandbox"
                ${environment === 'sandbox' ? 'checked' : ''}
                class="w-4 h-4 text-accent border-borderColor focus:ring-accent accent-accent">
              <span class="text-sm text-textPrimary">Sandbox <span class="text-xs text-textSecondary">(testes)</span></span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" id="pm-env-production" name="pm-environment" value="production"
                ${environment === 'production' ? 'checked' : ''}
                class="w-4 h-4 text-accent border-borderColor focus:ring-accent accent-accent">
              <span class="text-sm text-textPrimary">Produção</span>
            </label>
          </div>
        </div>

        <!-- Chaves de API (Dinâmico por provedor) -->
        <div class="flex flex-col gap-3 mb-5">
          ${provider === 'asaas' ? `
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-textPrimary flex items-center gap-1.5">
                API Key Asaas
                <i data-lucide="lock" class="w-3.5 h-3.5 text-textSecondary"></i>
              </label>
              <div class="flex gap-2">
                <input type="password" id="pm-api-key" autocomplete="new-password"
                  placeholder="${hasKey ? '••••••••••••••••ABCD' : 'aact_XXXXXXXXXXXXXXXXXXXXXXXX'}"
                  oninput="PaymentSettingsModule._onApiKeyInput()"
                  class="flex-1 bg-bgPrimary border border-borderColor rounded-lg px-3 py-2 text-sm font-mono text-textPrimary focus:outline-none focus:border-accent">
                <button type="button" onclick="PaymentSettingsModule._toggleKeyVisibility('pm-api-key', 'pm-eye-icon')" class="w-9 h-9 flex items-center justify-center border border-borderColor rounded-lg text-textSecondary hover:text-textPrimary hover:bg-bgPrimary transition-colors flex-shrink-0">
                  <i data-lucide="eye" class="w-4 h-4" id="pm-eye-icon"></i>
                </button>
              </div>
              <p class="text-xs text-textSecondary mt-1.5">${hasKey ? 'Chave salva.' : 'Encontre sua chave em: Asaas → Minha Conta → Integrações → API Key'}</p>
            </div>
          ` : `
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-textPrimary flex items-center gap-1.5">Access Token (Mercado Pago) <i data-lucide="lock" class="w-3.5 h-3.5 text-textSecondary"></i></label>
              <div class="flex gap-2">
                <input type="password" id="pm-mp-access" autocomplete="new-password"
                  placeholder="${hasKey ? '••••••••••••••••ABCD' : 'APP_USR-XXXXXXXXXXXXXXXXX'}"
                  oninput="PaymentSettingsModule._onApiKeyInput()"
                  class="flex-1 bg-bgPrimary border border-borderColor rounded-lg px-3 py-2 text-sm font-mono text-textPrimary focus:outline-none focus:border-accent">
                <button type="button" onclick="PaymentSettingsModule._toggleKeyVisibility('pm-mp-access', 'pm-eye-icon-access')" class="w-9 h-9 flex items-center justify-center border border-borderColor rounded-lg text-textSecondary hover:text-textPrimary hover:bg-bgPrimary transition-colors flex-shrink-0">
                  <i data-lucide="eye" class="w-4 h-4" id="pm-eye-icon-access"></i>
                </button>
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-textPrimary flex items-center gap-1.5">Public Key (Mercado Pago)</label>
              <div class="flex gap-2">
                <input type="password" id="pm-mp-public" autocomplete="new-password"
                  placeholder="${hasKey ? '••••••••••••••••ABCD' : 'APP_USR-XXXXX'}"
                  oninput="PaymentSettingsModule._onApiKeyInput()"
                  class="flex-1 bg-bgPrimary border border-borderColor rounded-lg px-3 py-2 text-sm font-mono text-textPrimary focus:outline-none focus:border-accent">
                <button type="button" onclick="PaymentSettingsModule._toggleKeyVisibility('pm-mp-public', 'pm-eye-icon-public')" class="w-9 h-9 flex items-center justify-center border border-borderColor rounded-lg text-textSecondary hover:text-textPrimary hover:bg-bgPrimary transition-colors flex-shrink-0">
                  <i data-lucide="eye" class="w-4 h-4" id="pm-eye-icon-public"></i>
                </button>
              </div>
              <p class="text-xs text-textSecondary mt-1.5">${hasKey ? 'Chaves salvas.' : 'No painel do MP, acesse Suas Integrações → Credenciais de Produção.'}</p>
            </div>
          `}
          
          <div class="flex items-center gap-3 mt-1">
            ${hasKey ? `<button type="button" id="pm-remove-key" onclick="PaymentSettingsModule._confirmRemoveKey()" class="px-3 py-2 border border-danger/30 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition-colors">Remover Chave(s)</button>` : ''}
            <div id="pm-key-changed-notice" class="hidden text-xs text-warning flex items-center gap-1.5"><i data-lucide="alert-circle" class="w-3 h-3"></i>Nova chave digitada. Salve para aplicar.</div>
          </div>
        </div>

        <!-- Métodos aceitos -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-textPrimary">Métodos de Pagamento</label>
          <div class="flex flex-col gap-2">
            ${methodsHtml}
          </div>
        </div>

        <!-- Módulo ativo -->
        <div class="flex items-center justify-between p-4 bg-bgPrimary border border-borderColor rounded-xl">
          <div>
            <p class="text-sm font-semibold text-textPrimary">Ativar Módulo de Pagamentos</p>
            <p class="text-xs text-textSecondary mt-0.5" id="pm-enable-hint">
              ${!hasKey ? 'Salve uma API Key válida antes de ativar.' : 'O botão de pagamento aparecerá no carrinho da sua loja.'}
            </p>
          </div>
          <label class="switch flex-shrink-0">
            <input type="checkbox" id="pm-enabled"
              ${isEnabled ? 'checked' : ''}
              ${!hasKey ? 'disabled' : ''}
              onchange="PaymentSettingsModule._onEnabledChange(this)">
            <span class="slider"></span>
          </label>
        </div>

        <!-- Ações -->
        <div class="flex flex-col sm:flex-row gap-3 pt-1">
          <button type="button" id="pm-btn-test"
            onclick="PaymentSettingsModule._testConnection()"
            class="flex items-center justify-center gap-2 px-4 py-2 border border-borderColor rounded-lg text-sm font-medium text-textSecondary hover:text-textPrimary hover:bg-bgPrimary transition-colors">
            <i data-lucide="zap" class="w-4 h-4"></i>
            Testar Conexão
          </button>
          <button type="button" id="pm-btn-save"
            onclick="PaymentSettingsModule.save()"
            class="flex items-center justify-center gap-2 px-5 py-2 bg-textPrimary text-white rounded-lg text-sm font-semibold hover:bg-black transition-colors">
            <i data-lucide="save" class="w-4 h-4"></i>
            Salvar Configuração
          </button>
        </div>

      </div>
    `;

    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ nodes: [container] }); }, 10);
  }


  // ── Handlers de interação ────────────────────────────────────

  async function _onProviderChange() {
    const select = document.getElementById('pm-provider');
    if (!select || !_store) return;
    const newProvider = select.value;
    
    const container = document.getElementById(CONTAINER_ID);
    if(container) container.style.opacity = '0.5';

    _settings = await StorePaymentAPI.getByStore(_store.id, newProvider);
    if (!_settings) {
       _settings = { payment_provider: newProvider, environment: 'sandbox', payment_enabled: false, payment_methods: ['PIX'] };
    }
    const hasKey = await StorePaymentAPI.hasApiKey(_store.id, newProvider);
    
    _apiKeyChanged = false;
    _renderSettingsCard(document.getElementById(CONTAINER_ID), _settings, hasKey);
    if(container) container.style.opacity = '1';
  }

  function _onApiKeyInput() {
    _apiKeyChanged = true;
    const notice = document.getElementById('pm-key-changed-notice');
    if (notice) notice.classList.remove('hidden');
    // Quando o usuário digita uma nova chave, desabilita o toggle enquanto não salva
    const enableToggle = document.getElementById('pm-enabled');
    if (enableToggle) {
      enableToggle.disabled = true;
      const hint = document.getElementById('pm-enable-hint');
      if (hint) hint.textContent = 'Salve a nova chave antes de ativar.';
    }
  }

  function _onMethodChange() {
    // Garante que PIX nunca seja desmarcado (único método disponível agora)
    const pixCheck = document.getElementById('pm-method-PIX');
    if (pixCheck && !pixCheck.checked) {
      pixCheck.checked = true;
      if (window.showToast) showToast('PIX é obrigatório. Outros métodos disponíveis em breve.', 'info');
    }
  }

  function _onEnabledChange(checkbox) {
    const badge = document.querySelector(`#${CONTAINER_ID} .inline-flex.items-center.gap-1\\.5`);
    if (!badge) return;
    if (checkbox.checked) {
      badge.className = 'inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-success"></span> Ativo';
    } else {
      badge.className = 'inline-flex items-center gap-1.5 text-xs font-semibold text-textSecondary bg-bgPrimary border border-borderColor px-2.5 py-1 rounded-full';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-textSecondary/40"></span> Desativado';
    }
  }

  function _toggleKeyVisibility(inputId = 'pm-api-key', iconId = 'pm-eye-icon') {
    const input   = document.getElementById(inputId);
    const icon    = document.getElementById(iconId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    if (icon) {
      icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
      if (window.lucide) window.lucide.createIcons({ nodes: [icon.parentElement] });
    }
  }

  async function _confirmRemoveKey() {
    if (!confirm('Remover a chave API?\n\nIsso desativará o módulo de pagamentos e apagará a configuração salva.\n\nEsta ação não pode ser desfeita.')) return;

    const btn = document.getElementById('pm-remove-key');
    if (btn) { btn.disabled = true; btn.textContent = 'Removendo...'; }

    const provider = _settings ? _settings.payment_provider : 'asaas';
    const result = await StorePaymentAPI.removeSettings(_store.id, provider);
    if (result.success) {
      _settings      = null;
      _apiKeyChanged = false;
      showToast('Configurações de pagamento removidas.', 'info');
      await init(_store); // Re-renderiza a seção
    } else {
      showToast('Erro ao remover: ' + result.error, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Remover'; }
    }
  }

  async function _testConnection() {
    const btn = document.getElementById('pm-btn-test');
    if (btn) UIComponents.setLoading(btn, true, 'Testando...');

    try {
      const result = await StorePaymentAPI.testConnection(_store?.id, _getEnvironment());

      if (result && result.success) {
        showToast('✅ ' + (result.message || 'Conexão realizada com sucesso!'), 'success');
      } else {
        // Mensagens de erro específicas por código
        const code = result?.code;
        if (code === 'NO_SETTINGS' || code === 'NO_API_KEY') {
          showToast('Salve uma API Key antes de testar a conexão.', 'warning');
        } else if (code === 'INVALID_API_KEY') {
          showToast('API Key inválida. Verifique a chave no painel Asaas.', 'error');
        } else if (code === 'ASAAS_TIMEOUT') {
          showToast('Tempo limite excedido. Verifique sua conexão.', 'warning');
        } else if (code === 'INVALID_ENVIRONMENT') {
          showToast('Ambiente inválido. Selecione Sandbox ou Produção.', 'warning');
        } else {
          showToast(result?.message || 'Falha na conexão. Verifique a API Key.', 'error');
        }
      }
    } catch (e) {
      showToast('Erro ao testar conexão. Tente novamente.', 'error');
    } finally {
      if (btn) UIComponents.setLoading(btn, false);
    }
  }

  function _getEnvironment() {
    const radios = document.querySelectorAll('input[name="pm-environment"]');
    for (const r of radios) { if (r.checked) return r.value; }
    return 'sandbox';
  }

  function _getSelectedMethods() {
    return PAYMENT_METHODS
      .filter(m => {
        const el = document.getElementById(`pm-method-${m.value}`);
        return el && el.checked && !el.disabled;
      })
      .map(m => m.value);
  }


  // ── API Pública do módulo ────────────────────────────────────

  /**
   * Inicializa e renderiza a seção no container.
   * Chamado uma vez após a loja ser carregada em configuracoes.html.
   *
   * @param {Object} store - objeto da loja carregado por StoreModule.getActive()
   */
  async function init(store) {
    _store = store;
    _apiKeyChanged = false;

    const container = document.getElementById(CONTAINER_ID);
    if (!container) return; // Container ausente = página não suporta o módulo

    if (!_hasAccess(store)) {
      _renderUpgradeCard(container);
      return;
    }

    // Carrega configurações existentes (sem expor a chave)
    _settings = await StorePaymentAPI.getByStore(store.id);
    const provider = _settings ? _settings.payment_provider : 'asaas';
    const hasKey = await StorePaymentAPI.hasApiKey(store.id, provider);

    _renderSettingsCard(container, _settings, hasKey);
  }

  /**
   * Salva as configurações do formulário.
   * Chamado pelo botão "Salvar Configuração" (independente do saveAll da página).
   */
  async function save() {
    if (!_store) return;
    if (!_hasAccess(_store)) return;

    const btn = document.getElementById('pm-btn-save');
    if (btn) UIComponents.setLoading(btn, true, 'Salvando...');

    try {
      const enableToggle  = document.getElementById('pm-enabled');
      const provider      = document.getElementById('pm-provider')?.value || 'asaas';
      const environment   = _getEnvironment();
      const methods       = _getSelectedMethods();
      const paymentEnabled = enableToggle?.checked ?? false;
      
      const apiKeyInput   = document.getElementById('pm-api-key');
      const mpAccessInput = document.getElementById('pm-mp-access');
      const mpPublicInput = document.getElementById('pm-mp-public');

      const hasKey = await StorePaymentAPI.hasApiKey(_store.id, provider);
      
      let newKeysProvided = false;
      if (provider === 'asaas') {
        newKeysProvided = !!(apiKeyInput?.value?.trim());
      } else if (provider === 'mercadopago') {
        newKeysProvided = !!(mpAccessInput?.value?.trim() && mpPublicInput?.value?.trim());
      }

      if (paymentEnabled && !hasKey && (!_apiKeyChanged || !newKeysProvided)) {
        showToast('Informe as credenciais do provedor antes de ativar.', 'warning');
        if (btn) UIComponents.setLoading(btn, false);
        return;
      }

      const payload = {
        payment_provider: provider,
        environment,
        payment_enabled:  paymentEnabled,
        payment_methods:  methods.length > 0 ? methods : ['PIX'],
      };

      if (provider === 'asaas') {
        if (_apiKeyChanged && apiKeyInput?.value?.trim()) payload.asaas_api_key = apiKeyInput.value.trim();
      } else if (provider === 'mercadopago') {
        if (_apiKeyChanged) {
          if (mpAccessInput?.value?.trim()) payload.mp_access_token = mpAccessInput.value.trim();
          if (mpPublicInput?.value?.trim()) payload.mp_public_key = mpPublicInput.value.trim();
        }
      }

      const result = await StorePaymentAPI.saveSettings(_store.id, payload);

      if (result.success) {
        _apiKeyChanged = false;
        // Limpa o campo de chave após salvar (segurança: não manter em DOM)
        if (apiKeyInput) apiKeyInput.value = '';
        showToast('Configurações de pagamento salvas!', 'success');
        // Re-renderiza para refletir novo estado (especialmente o indicador de chave)
        _settings = await StorePaymentAPI.getByStore(_store.id, provider);
        const hasKeyNow = await StorePaymentAPI.hasApiKey(_store.id, provider);
        _renderSettingsCard(document.getElementById(CONTAINER_ID), _settings, hasKeyNow);
      } else {
        showToast('Erro ao salvar: ' + (result.error || 'tente novamente'), 'error');
      }
    } catch (e) {
      console.error('[PaymentSettings] save error:', e);
      showToast('Erro inesperado ao salvar configurações.', 'error');
    } finally {
      if (btn) UIComponents.setLoading(btn, false);
    }
  }

  // Expõe handlers que o HTML chama diretamente
  return {
    init,
    save,
    _onProviderChange,
    _onApiKeyInput,
    _onMethodChange,
    _onEnabledChange,
    _toggleKeyVisibility,
    _confirmRemoveKey,
    _testConnection,
  };

})();

window.PaymentSettingsModule = PaymentSettingsModule;
