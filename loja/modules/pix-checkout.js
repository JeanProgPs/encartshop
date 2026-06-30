/**
 * EncartShop — Loja Pública / PixCheckoutModule
 * Fase 4A: Integração do checkout PIX sem remover o WhatsApp
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  REGRA ABSOLUTA                                                 ║
 * ║                                                                  ║
 * ║  Este módulo NUNCA altera o comportamento existente.            ║
 * ║  cart.js e checkout() permanecem intocados.                     ║
 * ║                                                                  ║
 * ║  Condições para ativar o PIX (TODAS devem ser verdadeiras):     ║
 * ║    1. store.plan === 'pro' ou 'enterprise'                      ║
 * ║    2. payment_enabled === true  (store_payment_settings)        ║
 * ║    3. 'PIX' está em payment_methods                             ║
 * ║    4. asaas_api_key está configurada                            ║
 * ║                                                                  ║
 * ║  Se qualquer condição falhar → botão PIX invisível              ║
 * ║  → comportamento 100% idêntico ao atual                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Ponto de integração com o cart existente:
 *   O módulo intercepta o clique no botão PIX (novo),
 *   chama o mesmo EncartAPI.OrderAPI.create() que o checkout()
 *   original usa, depois chama OrderPaymentAPI.createCharge().
 *   O botão WhatsApp original permanece visível e funcional.
 */

window.PixCheckoutModule = (() => {

  // ── Estado ───────────────────────────────────────────────────
  let _store          = null;
  let _pixEnabled     = false;   // true somente quando TODOS os requisitos OK
  let _pixSettings    = null;    // cache dos settings (sem api_key)
  let _currentOrderId = null;    // UUID do pedido criado
  let _isProcessing   = false;   // lock para evitar duplo clique

  // ── Constantes ───────────────────────────────────────────────
  const PLANS_WITH_PIX = ['pro', 'enterprise'];
  const PIX_BTN_ID     = 'pix-checkout-btn';
  const PIX_BLOCK_ID   = 'pix-payment-block';
  const PIX_LOADER_ID  = 'pix-loading-block';

  // ── Inicialização ────────────────────────────────────────────

  async function init() {
    EventBus.log('PixCheckoutModule', 'Aguardando StoreContext...');

    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      _store = store;
      await _checkEligibility(store);
      _renderPixButton();
    });

    // Re-avalia quando o carrinho muda (pode esconder/mostrar o botão PIX
    // se o carrinho ficar vazio)
    EventBus.on(EventBus.EVENTS.CART_UPDATED, ({ cart }) => {
      const btn = document.getElementById(PIX_BTN_ID);
      if (!btn) return;
      const hasItems = Array.isArray(cart) && cart.length > 0;
      btn.style.display = _pixEnabled && hasItems ? '' : 'none';
      // Garante que o bloco PIX seja ocultado se o carrinho esvaziar
      if (!hasItems) _hidePix();
    });
  }

  // ── Verificação de elegibilidade ─────────────────────────────
  /**
   * Verifica se a loja pode usar PIX online.
   * Consulta store_payment_settings (campos não-sensíveis).
   * Nunca retorna a asaas_api_key ao frontend.
   */
  async function _checkEligibility(store) {
    _pixEnabled = false;
    _pixSettings = null;

    try {
      // Condição 1: plano com acesso
      const plan = (store.plan || '').toLowerCase();
      if (!PLANS_WITH_PIX.includes(plan)) {
        EventBus.log('PixCheckoutModule', `Plano ${plan} sem acesso ao PIX.`);
        return;
      }

      // Condição 2-4: busca configurações (sem api_key)
      const { data, error } = await window.sb
        .from('store_payment_settings')
        .select('id, payment_enabled, payment_methods, payment_provider, environment')
        .eq('store_id', store.id)
        .eq('payment_provider', 'asaas')
        .maybeSingle();

      if (error || !data) {
        EventBus.log('PixCheckoutModule', 'Sem configurações de pagamento.');
        return;
      }

      if (!data.payment_enabled) {
        EventBus.log('PixCheckoutModule', 'Módulo de pagamento desativado pela loja.');
        return;
      }

      if (!Array.isArray(data.payment_methods) || !data.payment_methods.includes('PIX')) {
        EventBus.log('PixCheckoutModule', 'PIX não habilitado nos métodos da loja.');
        return;
      }

      // Condição 4: verifica existência da API Key (sem ler o valor)
      const { data: keyCheck } = await window.sb
        .from('store_payment_settings')
        .select('id')
        .eq('store_id', store.id)
        .eq('payment_provider', 'asaas')
        .not('asaas_api_key', 'is', null)
        .maybeSingle();

      if (!keyCheck) {
        EventBus.log('PixCheckoutModule', 'API Key não configurada.');
        return;
      }

      _pixSettings = data;
      _pixEnabled  = true;
      EventBus.log('PixCheckoutModule', 'PIX habilitado para esta loja.', {
        provider:    data.payment_provider,
        environment: data.environment,
      });

    } catch (e) {
      // Falha silenciosa: não quebra o checkout WhatsApp em nenhum cenário
      EventBus.log('PixCheckoutModule', 'Erro ao verificar elegibilidade PIX.', e.message, true);
      _pixEnabled = false;
    }
  }

  // ── Renderização do botão PIX ────────────────────────────────
  /**
   * Insere o botão "Pagar com PIX" abaixo do botão WhatsApp no drawer.
   * Se o PIX não estiver elegível, o container permanece vazio
   * e o layout do drawer não muda.
   */
  function _renderPixButton() {
    const container = document.getElementById('pix-btn-container');
    if (!container) return;

    if (!_pixEnabled) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div id="${PIX_BTN_ID}" style="margin-top:10px;">
        <button
          onclick="PixCheckoutModule.startPixFlow()"
          style="
            width:100%; padding:15px;
            background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);
            color:#fff; border:none; border-radius:12px;
            font-size:1rem; font-weight:800; cursor:pointer;
            display:flex; align-items:center; justify-content:center; gap:10px;
            transition:all 0.2s ease;
            box-shadow:0 4px 16px rgba(79,70,229,0.35);
            font-family:inherit;
          "
          onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 8px 24px rgba(79,70,229,0.45)'"
          onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(79,70,229,0.35)'"
          onmousedown="this.style.transform='scale(0.99)'"
          onmouseup="this.style.transform=''"
          aria-label="Pagar com PIX">
          <svg width="22" height="22" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
            <path d="M242.4 292.5C247.8 287.1 255.1 284.3 262.5 284.3C269.8 284.3 277.1 287.1 282.5 292.5L371.7 381.7C376.6 386.6 383.2 389.3 390.1 389.3H416.2L310.2 495.3C280 525.5 231.6 525.5 201.3 495.3L95.3 389.3H116.6C123.5 389.3 130.2 386.6 135 381.7L242.4 292.5zM269.5 219.5L370.5 118.6C375.3 113.7 381.1 111 388.9 111H416.2L310.2 4.98C280-25.23 231.6-25.23 201.3 4.98L95.34 111H120.7C127.6 111 134.2 113.7 139.1 118.6L242.4 219.5C247.8 224.9 255.1 227.7 262.5 227.7C269.8 227.7 277.1 224.9 282.5 219.5z"/>
          </svg>
          Pagar com PIX
        </button>
        <p style="text-align:center;font-size:0.7rem;color:var(--text-muted,#64748b);margin-top:6px;">
          Pagamento instantâneo • Aprovação automática
        </p>
      </div>
    `;
  }


  // ── Fluxo principal do PIX ───────────────────────────────────
  /**
   * Disparado quando o cliente clica em "Pagar com PIX".
   * 1. Valida o formulário (mesma lógica do checkout WhatsApp)
   * 2. Cria o pedido via EncartAPI.OrderAPI.create() (MESMO fluxo atual)
   * 3. Gera a cobrança PIX via OrderPaymentAPI.createCharge()
   * 4. Exibe o QR Code
   * Em caso de erro: exibe fallback com botão WhatsApp
   */
  async function startPixFlow() {
    if (_isProcessing) return;
    if (!_store || !_pixEnabled) return;

    // ── Mesma validação do checkout() original ───────────────
    const nameInput = document.getElementById('customer-name');
    const name = nameInput?.value.trim() || '';
    if (!name) {
      nameInput?.focus();
      nameInput?.style.setProperty('border-color', 'var(--danger,#ef4444)');
      setTimeout(() => nameInput?.style.removeProperty('border-color'), 2000);
      if (window.showToast) window.showToast('Informe seu nome para continuar.', 'warning');
      return;
    }

    // Validação DeliveryModule (mesma do checkout WhatsApp)
    if (window.DeliveryModule) {
      const state = window.DeliveryModule.getState();
      if (state && state.active && !state.canCheckout) {
        if (state.reason === 'region_missing') {
          if (window.showToast) window.showToast('Selecione uma região de entrega.', 'warning');
          return;
        }
        if (state.reason === 'minimum_not_met') {
          if (window.showToast) window.showToast(
            `O pedido mínimo para esta região é ${UIRender.fmtPrice(state.minimum_order)}.`, 'warning'
          );
          return;
        }
      }
    }

    // ── Coleta do carrinho ───────────────────────────────────
    const cartItems = window.CartManager?.getCart() || [];
    if (!cartItems.length) {
      if (window.showToast) window.showToast('Seu carrinho está vazio.', 'warning');
      return;
    }

    _isProcessing = true;
    _showPixLoading();

    try {
      // ── Calcula total (mesma lógica do checkout() original) ──
      let finalTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
      const subtotal = finalTotal;

      if (window.DeliveryModule) {
        const state = window.DeliveryModule.getState();
        if (state && state.active) {
          finalTotal = state.total;
        } else {
          const dFee  = Number(_store.delivery_fee)  || 0;
          const dFree = Number(_store.delivery_free) || 0;
          const isCombine  = dFee === -1;
          const hasFreeShip = dFree > 0 && subtotal >= dFree;
          const feeCharged  = isCombine ? 0 : (hasFreeShip ? 0 : dFee);
          if (!isCombine) finalTotal += feeCharged;
        }
      }

      // ── Campos opcionais (mesmos do checkout() original) ────
      const phoneRaw   = document.getElementById('customer-whatsapp')?.value?.trim() || '';
      const addressRaw = document.getElementById('customer-address')?.value?.trim() || '';

      // ── Gera referência do pedido (mesmo padrão do checkout()) ──
      const orderRef = Math.random().toString(36).substring(2, 7).toUpperCase();
      const finalCustomerName = `${name} [#${orderRef}]`;

      // ── Cria pedido na tabela orders ─────────────────────────
      // EXATAMENTE o mesmo payload do checkout() original
      const orderPayload = {
        customer_name: finalCustomerName,
        items: cartItems.map(i => ({
          id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit
        })),
        total: finalTotal,
        status: 'novo',
      };
      if (phoneRaw)   orderPayload.customer_phone   = phoneRaw;
      if (addressRaw) orderPayload.customer_address = addressRaw;

      let createdOrder = null;
      try {
        // Tenta salvar o pedido — falha silenciosa igual ao checkout original
        await EncartAPI.OrderAPI.create(_store.id, orderPayload);
        // Busca o pedido criado para obter o UUID (necessário para vincular ao order_payment)
        const recentOrders = await window.sb
          .from('orders')
          .select('id')
          .eq('store_id', _store.id)
          .ilike('customer_name', `%[#${orderRef}]%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        createdOrder = recentOrders?.data || null;
      } catch (e) {
        EventBus.log('PixCheckoutModule', 'Pedido não salvo na base (não-bloqueante)', e.message, true);
        // Continua mesmo sem salvar o pedido — o PIX pode ser gerado sem FK
      }

      _currentOrderId = createdOrder?.id || null;

      // ── Gera cobrança PIX via Edge Function ──────────────────
      const pixResult = await window.OrderPaymentAPI.createCharge({
        storeId:     _store.id,
        orderId:     _currentOrderId,
        customer: {
          name:     name,
          phone:    phoneRaw || undefined,
        },
        amount:      finalTotal,
        description: `Pedido #${orderRef} — ${_store.name}`,
      });

      if (!pixResult || !pixResult.success) {
        throw new Error(pixResult?.message || 'Não foi possível gerar o pagamento PIX.');
      }

      // ── Exibe QR Code ────────────────────────────────────────
      _showPixQrCode({
        pixCode:        pixResult.pixCode,
        qrCode:         pixResult.qrCode,
        amount:         pixResult.amount ?? finalTotal,
        expirationDate: pixResult.expirationDate,
        orderRef,
        name,
        finalTotal,
        // Guardar o WhatsApp URL como fallback
        whatsappFallbackUrl: _buildWhatsAppUrl(name, phoneRaw, addressRaw, cartItems, finalTotal, subtotal, orderRef),
      });

    } catch (err) {
      EventBus.log('PixCheckoutModule', 'Erro na geração do PIX', err.message, true);
      _showPixError(err.message);
    } finally {
      _isProcessing = false;
    }
  }

  // ── Builder da URL WhatsApp (para fallback) ──────────────────
  /**
   * Reconstrói a URL do WhatsApp para uso no fallback.
   * Mesmo formato do checkout() original.
   */
  function _buildWhatsAppUrl(name, phoneRaw, addressRaw, cartItems, finalTotal, subtotal, orderRef) {
    try {
      const wa = (_store.whatsapp || '').replace(/\D/g, '');
      if (!wa) return null;

      const itemsText = cartItems.map(i =>
        `• ${i.qty}${i.unit === 'kg' ? 'kg' : 'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`
      ).join('\n');

      const phoneMsg   = phoneRaw   ? `\n*WhatsApp:* ${phoneRaw}`   : '';
      const addressMsg = addressRaw ? `\n*Endereço:* ${addressRaw}` : '';
      const logoLink   = _store.logo_url ? `\n🖼 *Sua Loja:* ${_store.logo_url}\n` : '';

      const msg = `🛒 *Novo Pedido — ${_store.name}*\n\n*Ref:* #${orderRef}\n*Cliente:* ${name}${phoneMsg}${addressMsg}\n\n*Itens:*\n${itemsText}\n\n*Subtotal:* ${UIRender.fmtPrice(subtotal)}\n*Total:* ${UIRender.fmtPrice(finalTotal)}\n${logoLink}\n🔗 *Gerenciar no Painel:* ${window.location.origin}/admin/pedidos.html?ref=${orderRef}\n\n_Enviado via EncartShop_`;

      return `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`;
    } catch { return null; }
  }


  // ── Renderizadores de estado ─────────────────────────────────

  function _showPixLoading() {
    const block = document.getElementById(PIX_BLOCK_ID);
    if (!block) return;
    block.innerHTML = `
      <div id="${PIX_LOADER_ID}" style="
        padding:24px; text-align:center; border-radius:16px;
        background:var(--bg-card,#fff); border:1px solid var(--border,#e2e8f0);
        margin-top:14px;
      ">
        <div style="
          width:36px;height:36px;border:3px solid #e2e8f0;
          border-top-color:#4f46e5;border-radius:50%;
          animation:encart-spin 0.8s linear infinite;
          margin:0 auto 12px;
        "></div>
        <p style="font-size:0.9rem;font-weight:600;color:var(--text,#0f172a);margin:0 0 4px;">
          Gerando seu PIX...
        </p>
        <p style="font-size:0.78rem;color:var(--text-muted,#64748b);margin:0;">
          Aguarde um instante.
        </p>
      </div>`;
    block.style.display = 'block';
    // Oculta o botão PIX enquanto processa
    const btn = document.getElementById(PIX_BTN_ID);
    if (btn) btn.style.display = 'none';
  }

  function _showPixQrCode({ pixCode, qrCode, amount, expirationDate, orderRef, name, finalTotal, whatsappFallbackUrl }) {
    const block = document.getElementById(PIX_BLOCK_ID);
    if (!block) return;

    const fmtAmount = UIRender?.fmtPrice?.(amount) ?? `R$ ${Number(amount).toFixed(2).replace('.', ',')}`;

    // Formata a data de expiração se disponível
    let expiryStr = '';
    if (expirationDate) {
      try {
        const d = new Date(expirationDate);
        if (!isNaN(d)) {
          expiryStr = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        }
      } catch { /* ignora */ }
    }

    const qrImgHtml = qrCode
      ? `<img src="data:image/png;base64,${escapeHTML(qrCode)}" alt="QR Code PIX" style="width:180px;height:180px;display:block;margin:0 auto;" />`
      : `<div style="width:180px;height:180px;margin:0 auto;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.8rem;">QR Code indisponível</div>`;

    const pixCodeSafe = escapeHTML(pixCode || '');

    block.innerHTML = `
      <div style="
        border-radius:16px; border:2px solid #4f46e5;
        background:var(--bg-card,#fff); margin-top:14px;
        overflow:hidden;
      ">
        <!-- Cabeçalho -->
        <div style="
          background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);
          padding:14px 16px; display:flex; align-items:center; gap:10px;
        ">
          <svg width="20" height="20" viewBox="0 0 512 512" fill="#fff" aria-hidden="true">
            <path d="M242.4 292.5C247.8 287.1 255.1 284.3 262.5 284.3C269.8 284.3 277.1 287.1 282.5 292.5L371.7 381.7C376.6 386.6 383.2 389.3 390.1 389.3H416.2L310.2 495.3C280 525.5 231.6 525.5 201.3 495.3L95.3 389.3H116.6C123.5 389.3 130.2 386.6 135 381.7L242.4 292.5zM269.5 219.5L370.5 118.6C375.3 113.7 381.1 111 388.9 111H416.2L310.2 4.98C280-25.23 231.6-25.23 201.3 4.98L95.34 111H120.7C127.6 111 134.2 113.7 139.1 118.6L242.4 219.5C247.8 224.9 255.1 227.7 262.5 227.7C269.8 227.7 277.1 224.9 282.5 219.5z"/>
          </svg>
          <div>
            <p style="margin:0;font-weight:800;color:#fff;font-size:0.95rem;">Pagamento PIX</p>
            <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.8);">Pedido #${escapeHTML(orderRef)}</p>
          </div>
          <div style="margin-left:auto;text-align:right;">
            <p style="margin:0;font-weight:900;color:#fff;font-size:1.1rem;">${fmtAmount}</p>
            ${expiryStr ? `<p style="margin:0;font-size:0.7rem;color:rgba(255,255,255,0.75);">Expira: ${expiryStr}</p>` : ''}
          </div>
        </div>

        <!-- QR Code -->
        <div style="padding:20px 16px 16px; text-align:center;">
          <div style="background:#fff;padding:12px;border-radius:12px;border:1px solid #e2e8f0;display:inline-block;margin-bottom:14px;">
            ${qrImgHtml}
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted,#64748b);margin:0 0 12px;">
            Escaneie o QR Code com o app do seu banco
          </p>

          <!-- Copia e Cola -->
          ${pixCodeSafe ? `
          <div style="
            background:#f8fafc; border:1px solid #e2e8f0;
            border-radius:10px; padding:10px 12px;
            font-family:monospace; font-size:0.72rem;
            color:#475569; word-break:break-all;
            text-align:left; margin-bottom:12px;
            max-height:60px; overflow:hidden;
          ">
            ${pixCodeSafe}
          </div>
          <button
            onclick="PixCheckoutModule.copyPixCode()"
            id="pix-copy-btn"
            style="
              width:100%; padding:12px;
              background:#0f172a; color:#fff;
              border:none; border-radius:10px;
              font-size:0.9rem; font-weight:700;
              cursor:pointer; display:flex;
              align-items:center; justify-content:center; gap:8px;
              transition:all 0.2s; font-family:inherit;
              margin-bottom:10px;
            "
            onmouseover="this.style.background='#1e293b'"
            onmouseout="this.style.background='#0f172a'">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copiar Código PIX
          </button>` : ''}

          <!-- Info de aguardo -->
          <div style="
            background:#f0fdf4; border:1px solid #bbf7d0;
            border-radius:10px; padding:10px 12px;
            font-size:0.78rem; color:#15803d;
            display:flex; align-items:flex-start; gap:8px;
            text-align:left; margin-bottom:12px;
          ">
            <span style="flex-shrink:0;font-size:1rem;">ℹ️</span>
            <span>Após o pagamento, o lojista receberá seu pedido automaticamente. Você pode fechar este painel.</span>
          </div>

          <!-- Separador -->
          <div style="display:flex;align-items:center;gap:8px;margin:12px 0;">
            <div style="flex:1;height:1px;background:var(--border,#e2e8f0);"></div>
            <span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);font-weight:500;">ou prefere</span>
            <div style="flex:1;height:1px;background:var(--border,#e2e8f0);"></div>
          </div>

          <!-- Fallback WhatsApp sempre visível -->
          <button
            onclick="PixCheckoutModule.fallbackToWhatsApp()"
            style="
              width:100%; padding:12px;
              background:transparent;
              color:#16a34a; border:1.5px solid #16a34a;
              border-radius:10px; font-size:0.85rem; font-weight:700;
              cursor:pointer; display:flex;
              align-items:center; justify-content:center; gap:8px;
              transition:all 0.2s; font-family:inherit;
            "
            onmouseover="this.style.background='#f0fdf4'"
            onmouseout="this.style.background='transparent'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Finalizar pelo WhatsApp
          </button>
        </div>
      </div>`;

    block.style.display = 'block';
    // Oculta o botão PIX (QR Code já está visível)
    const btn = document.getElementById(PIX_BTN_ID);
    if (btn) btn.style.display = 'none';

    // Scroll suave para o QR Code
    setTimeout(() => block.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

    // Armazena o código PIX e URL de fallback para uso nos handlers
    block.dataset.pixCode         = pixCode || '';
    block.dataset.whatsappFallback = whatsappFallbackUrl || '';
  }

  function _showPixError(message) {
    const block = document.getElementById(PIX_BLOCK_ID);
    if (!block) return;

    const safeMsg = escapeHTML(
      message && message.length < 200
        ? message
        : 'Não foi possível gerar o pagamento online.'
    );

    block.innerHTML = `
      <div style="
        border-radius:16px; border:1.5px solid #fca5a5;
        background:#fff5f5; margin-top:14px; padding:18px 16px;
        text-align:center;
      ">
        <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
        <p style="font-weight:700;color:#dc2626;font-size:0.9rem;margin:0 0 4px;">
          Não foi possível gerar o pagamento online.
        </p>
        <p style="font-size:0.78rem;color:#64748b;margin:0 0 14px;">${safeMsg}</p>
        <button
          onclick="checkout()"
          style="
            width:100%; padding:13px;
            background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);
            color:#fff; border:none; border-radius:10px;
            font-size:0.9rem; font-weight:800;
            cursor:pointer; display:flex;
            align-items:center; justify-content:center; gap:8px;
            font-family:inherit;
          ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Finalizar pelo WhatsApp
        </button>
      </div>`;
    block.style.display = 'block';
    // Restaura o botão PIX
    const btn = document.getElementById(PIX_BTN_ID);
    if (btn) btn.style.display = '';
  }

  function _hidePix() {
    const block = document.getElementById(PIX_BLOCK_ID);
    if (block) { block.innerHTML = ''; block.style.display = 'none'; }
  }

  // ── Ações públicas ───────────────────────────────────────────

  /** Copia o código PIX para a área de transferência */
  function copyPixCode() {
    const block = document.getElementById(PIX_BLOCK_ID);
    const code  = block?.dataset?.pixCode || '';
    if (!code) { if (window.showToast) window.showToast('Código PIX não disponível.', 'error'); return; }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        if (window.showToast) window.showToast('Código PIX copiado!', 'success');
        const btn = document.getElementById('pix-copy-btn');
        if (btn) {
          btn.textContent = '✅ Código copiado!';
          setTimeout(() => { btn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copiar Código PIX'; }, 2500);
        }
      }).catch(() => _copyFallback(code));
    } else {
      _copyFallback(code);
    }
  }

  function _copyFallback(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      if (window.showToast) window.showToast('Código PIX copiado!', 'success');
    } catch {
      if (window.showToast) window.showToast('Não foi possível copiar automaticamente. Copie manualmente.', 'warning');
    }
  }

  /** Redireciona para o WhatsApp (fallback ou preferência do cliente) */
  function fallbackToWhatsApp() {
    const block = document.getElementById(PIX_BLOCK_ID);
    const url   = block?.dataset?.whatsappFallback || '';
    if (url) {
      window.location.href = url;
    } else {
      // Fallback de último recurso: chama o checkout() original
      if (window.checkout) window.checkout();
    }
  }

  // ── API Pública ──────────────────────────────────────────────

  return {
    init,
    startPixFlow,
    copyPixCode,
    fallbackToWhatsApp,
    // Exposto para testes
    _checkEligibility,
  };

})();
