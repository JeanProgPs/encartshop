/**
 * EncartShop — Loja Pública / CartManager
 * Gerencia estado do carrinho, persistência e envio de pedido.
 */

window.CartManager = (() => {
  let cart = [];
  let store = null;
  let storeZip = null;
  let currentZip = '';
  let selectedCorreios = null;

  async function init() {
    EventBus.log('CartManager', 'Aguardando StoreContext...');
    
    EventBus.on(EventBus.EVENTS.STORE_LOADED, (data) => {
      store = data.store;
      storeZip = store.origin_zip || null;
      if (storeZip) {
        const area = document.getElementById('correios-module-area');
        if (area) area.style.display = 'block';
      }

      try {
        cart = _loadCart();
        EventBus.log('CartManager', 'Carrinho recuperado', { items: cart.length });
        EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
      } catch (err) {
        EventBus.log('CartManager', 'Erro ao recuperar carrinho', err.message, true);
        cart = [];
      }
    });
  }

  function getCart() { return cart; }

  // ── Retrocompatibilidade: Métodos chamados pelo HTML ──────────
  window.addToCart = function(id) {
    if (!window.ProductCatalog) return;
    const allProducts = window.ProductCatalog.getProducts();
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const isKg  = product.unit?.toLowerCase() === 'kg';
    const step  = isKg ? 0.5 : 1;
    const price = Number(product.promo_price) || Number(product.price) || 0;
    const existing = cart.find(c => c.id === id);

    if (existing) {
      existing.qty += step;
    } else {
      cart.push({
        id: product.id, name: product.name, price,
        image: product.image, unit: product.unit, qty: step
      });
    }

    _saveCart();
    EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
  };

  window.changeQty = function(id, delta) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    const isKg = item.unit?.toLowerCase() === 'kg';
    const step = isKg ? 0.5 : 1;
    item.qty  += delta * step;
    if (isKg) item.qty = Math.round(item.qty * 100) / 100;
    if (item.qty <= 0) cart.splice(cart.indexOf(item), 1);
    
    _saveCart();
    EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
  };

  window.checkout = function() {
    const storeObj = store || (window.StoreContext && window.StoreContext.getStore());
    if (!storeObj) {
      if (window.showToast) window.showToast('Aguarde o carregamento dos dados da loja.', 'warning');
      return;
    }
    if (!store) store = storeObj;

    const currentCart = (cart && cart.length > 0) ? cart : _loadCart();
    if (!currentCart || currentCart.length === 0) {
      if (window.showToast) window.showToast('Seu carrinho está vazio. Adicione produtos para continuar.', 'warning');
      return;
    }

    const nameInput = document.getElementById('customer-name');
    const name      = nameInput?.value.trim() || '';
    if (!name) {
      nameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInput?.focus();
      nameInput?.style.setProperty('border-color', 'var(--danger, #ef4444)');
      setTimeout(() => nameInput?.style.removeProperty('border-color'), 2000);
      if (window.showToast) window.showToast('Informe seu nome para continuar.', 'warning');
      return;
    }

    const waRaw = storeObj.whatsapp || storeObj.phone || storeObj.whatsapp_phone || '';
    let wa = waRaw.replace(/\D/g, '');
    if (wa.length >= 10 && wa.length <= 11 && !wa.startsWith('55')) {
      wa = '55' + wa;
    }

    if (!wa) { 
      if (window.showToast) window.showToast('Esta loja ainda não tem WhatsApp configurado.', 'error'); 
      return; 
    }

    // ── Campos opcionais de identificação do cliente ──────────────────────
    const phoneRaw   = document.getElementById('customer-whatsapp')?.value?.trim() || '';
    const addressRaw = document.getElementById('customer-address')?.value?.trim() || '';

    // ── DeliveryModule PRO Integration ──
    let deliveryMsg = '';
    let finalTotal = currentCart.reduce((s, i) => s + i.price * i.qty, 0);
    const subtotal = finalTotal;

    if (selectedCorreios) {
      finalTotal += selectedCorreios.price;
      deliveryMsg = `\n*Entrega:* Correios (${selectedCorreios.type})\n*Taxa:* ${UIRender.fmtPrice(selectedCorreios.price)}\n*Prazo:* Aprox. ${selectedCorreios.days} dias úteis\n`;
    } else if (window.DeliveryModule) {
      const state = window.DeliveryModule.getState();
      if (state && state.active) {
        if (!state.canCheckout) {
          const delArea = document.getElementById('delivery-module-area');
          if (delArea) delArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (state.reason === 'region_missing') {
            if (window.showToast) window.showToast('Selecione uma região de entrega ou calcule o frete.', 'warning');
            return;
          }
          if (state.reason === 'minimum_not_met') {
            if (window.showToast) window.showToast(`O pedido mínimo para esta região é ${UIRender.fmtPrice(state.minimum_order)}.`, 'warning');
            return;
          }
        }
        finalTotal = state.total;
        deliveryMsg = `\n*Entrega:* ${state.selectedZone.region_name}\n*Taxa:* ${state.fee > 0 ? UIRender.fmtPrice(state.fee) : 'Grátis'}\n${state.selectedZone.estimated_time ? `*Prazo:* ${state.selectedZone.estimated_time}\n` : ''}`;
      } else {
        // Lógica de fallback para Lojas Básicas (taxa fixa do store)
        const dFee = Number(storeObj.delivery_fee) || 0;
        const dFree = Number(storeObj.delivery_free) || 0;
        const isCombine = dFee === -1;
        const hasFreeShip = dFree > 0 && subtotal >= dFree;
        const feeCharged = isCombine ? 0 : (hasFreeShip ? 0 : dFee);
        if (!isCombine) finalTotal += feeCharged;
        deliveryMsg = isCombine ? '\n*Entrega:* A combinar\n' : (feeCharged > 0 ? `\n*Taxa de Entrega:* ${UIRender.fmtPrice(feeCharged)}\n` : (hasFreeShip ? '\n*Entrega:* Grátis\n' : '\n'));
      }
    }

    const btn = document.getElementById('whatsapp-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando pedido...'; }

    try {
      const orderRef = Math.random().toString(36).substring(2, 7).toUpperCase();
      const finalCustomerName = `${name} [#${orderRef}]`;

      const itemsText = currentCart.map(i =>
        `• ${i.qty}${i.unit === 'kg' ? 'kg' : 'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`
      ).join('\n');

      const logoLink = storeObj.logo_url ? `\n🖼 *Sua Loja:* ${storeObj.logo_url}\n` : '';

      // Linhas opcionais na mensagem do WhatsApp (só aparecem se preenchidas)
      const phoneMsg   = phoneRaw   ? `\n*WhatsApp:* ${phoneRaw}`   : '';
      const addressMsg = addressRaw ? `\n*Endereço:* ${addressRaw}` : '';

      const msg = `🛒 *Novo Pedido — ${storeObj.name}*\n\n*Ref:* #${orderRef}\n*Cliente:* ${name}${phoneMsg}${addressMsg}\n\n*Itens:*\n${itemsText}\n${deliveryMsg}\n*Subtotal:* ${UIRender.fmtPrice(subtotal)}\n*Total:* ${UIRender.fmtPrice(finalTotal)}\n${logoLink}\n🔗 *Gerenciar no Painel:* ${window.location.origin}/admin/pedidos.html?ref=${orderRef}\n\n_Enviado via EncartShop_`;

      // Monta dados do pedido
      const orderPayload = {
        customer_name: finalCustomerName,
        items: currentCart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
        total: finalTotal,
        status: 'novo'
      };
      if (phoneRaw)   orderPayload.customer_phone   = phoneRaw;
      if (addressRaw) orderPayload.customer_address = addressRaw;

      if (window.EncartAPI && window.EncartAPI.OrderAPI) {
        window.EncartAPI.OrderAPI.create(storeObj.id, orderPayload)
          .catch(e => EventBus.log('CartManager', 'Pedido não salvo na base', e.message, true));
      }

      cart = []; 
      _saveCart(); 
      EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
      if (window.closeCart) window.closeCart();

      const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
      window.location.href = waUrl;
    } catch (err) {
      console.error('[Checkout Error]', err);
      if (window.showToast) window.showToast('Erro ao preparar pedido. Tente novamente.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Enviar Pedido pelo WhatsApp`;
      }
    }

  function _saveCart() {
    if (!store || !store.id) return;
    try { localStorage.setItem(`encart_cart_${store.id}`, JSON.stringify(cart)); } catch { }
  }
  function _loadCart() {
    if (!store || !store.id) return [];
    try { return JSON.parse(localStorage.getItem(`encart_cart_${store.id}`) || '[]'); } catch { return []; }
  }

  // Correios methods
  window.CartManager.handleZipChange = async function(val) {
    val = val.replace(/\D/g, '');
    if (val.length === 8 && val !== currentZip) {
      currentZip = val;
      const optsDiv = document.getElementById('correios-options');
      if (optsDiv) optsDiv.innerHTML = '<span style="font-size: 0.8rem">Calculando frete...</span>';
      try {
        const res = await fetch(`/api/shipping?origin=${storeZip}&dest=${val}`);
        const data = await res.json();
        if (data.options && data.options.length > 0) {
          if (optsDiv) optsDiv.innerHTML = data.options.map(o => `
            <label style="font-size:0.85rem; display:flex; align-items:center; gap:6px;">
              <input type="radio" name="correios_opt" value='${JSON.stringify(o)}' onchange="window.CartManager.selectCorreios(this.value)">
              ${o.type} - R$ ${o.price.toFixed(2).replace('.', ',')} (Aprox. ${o.days} dias)
            </label>
          `).join('');
        } else {
          if (optsDiv) optsDiv.innerHTML = '<span style="font-size: 0.8rem; color: #ef4444">CEP inválido ou sem opções de entrega.</span>';
        }
      } catch (e) {
        if (optsDiv) optsDiv.innerHTML = '<span style="font-size: 0.8rem; color: #ef4444">Erro ao calcular frete.</span>';
      }
    } else if (val.length < 8) {
      currentZip = '';
      selectedCorreios = null;
      const optsDiv = document.getElementById('correios-options');
      if (optsDiv) optsDiv.innerHTML = '';
      EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
    }
  };

  window.CartManager.selectCorreios = function(valStr) {
    selectedCorreios = JSON.parse(valStr);
    if (window.DeliveryModule) window.DeliveryModule.clearZone();
    EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
  };

  window.CartManager.clearCorreios = function() {
    selectedCorreios = null;
    const radios = document.querySelectorAll('input[name="correios_opt"]');
    radios.forEach(r => r.checked = false);
    EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
  };

  window.CartManager.getSelectedCorreios = function() {
    return selectedCorreios;
  };

  return { init, getCart };
})();
