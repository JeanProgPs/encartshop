/**
 * EncartShop — Loja Pública / CartManager
 * Gerencia estado do carrinho, persistência e envio de pedido.
 */

window.CartManager = (() => {
  let cart = [];
  let store = null;

  async function init() {
    EventBus.log('CartManager', 'Aguardando StoreContext...');
    
    EventBus.on(EventBus.EVENTS.STORE_LOADED, (data) => {
      store = data.store;
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
    if (!store) return;
    const nameInput = document.getElementById('customer-name');
    const name      = nameInput?.value.trim() || '';
    if (!name) {
      nameInput?.focus();
      nameInput?.style.setProperty('border-color', 'var(--danger, #ef4444)');
      setTimeout(() => nameInput?.style.removeProperty('border-color'), 2000);
      if (window.showToast) window.showToast('Informe seu nome para continuar.', 'warning');
      return;
    }

    const wa = (store.whatsapp || '').replace(/\D/g, '');
    if (!wa) { 
      if (window.showToast) window.showToast('Esta loja ainda não tem WhatsApp configurado.', 'error'); 
      return; 
    }

    // ── DeliveryModule PRO Integration ──
    let deliveryMsg = '';
    let finalTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const subtotal = finalTotal;

    if (window.DeliveryModule) {
      const state = window.DeliveryModule.getState();
      if (state && state.active) {
        if (!state.canCheckout) {
          if (state.reason === 'region_missing') {
            if (window.showToast) window.showToast('Selecione uma região de entrega.', 'warning');
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
        const dFee = Number(store.delivery_fee) || 0;
        const dFree = Number(store.delivery_free) || 0;
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

      const itemsText = cart.map(i =>
        `• ${i.qty}${i.unit === 'kg' ? 'kg' : 'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`
      ).join('\n');

      const msg = `🛒 *Novo Pedido — ${store.name}*\n\n*Ref:* #${orderRef}\n*Cliente:* ${name}\n\n*Itens:*\n${itemsText}\n${deliveryMsg}\n*Subtotal:* ${UIRender.fmtPrice(subtotal)}\n*Total:* ${UIRender.fmtPrice(finalTotal)}\n\n🔗 *Gerenciar no Painel:* ${window.location.origin}/admin/pedidos.html?ref=${orderRef}\n\n_Enviado via EncartShop_`;

      EncartAPI.OrderAPI.create(store.id, {
        customer_name: finalCustomerName,
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
        total: finalTotal,
        status: 'novo'
      }).catch(e => EventBus.log('CartManager', 'Pedido não salvo na base', e.message, true));

      cart = []; 
      _saveCart(); 
      EventBus.emit(EventBus.EVENTS.CART_UPDATED, { cart });
      if (window.closeCart) window.closeCart();

      window.location.href = `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Enviar Pedido pelo WhatsApp`;
      }
    }
  };

  function _saveCart() {
    try { localStorage.setItem(`encart_cart_${store.id}`, JSON.stringify(cart)); } catch { }
  }
  function _loadCart() {
    try { return JSON.parse(localStorage.getItem(`encart_cart_${store.id}`) || '[]'); } catch { return []; }
  }

  return { init, getCart };
})();
