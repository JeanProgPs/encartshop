/**
 * EncartShop — Loja Pública / DeliveryModule (PRO)
 * Gerencia zonas de entrega, cálculo de taxas e pedido mínimo.
 */

window.DeliveryModule = (() => {
  let activeStore = null;
  let zones = [];
  let selectedZone = null;
  let isActive = false;
  let currentSubtotal = 0;

  async function init() {
    EventBus.log('DeliveryModule', 'Aguardando inicialização...');

    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      activeStore = store;
      const plan = (store.plan || '').toLowerCase();
      
      if (plan !== 'pro' && plan !== 'enterprise') {
        EventBus.log('DeliveryModule', 'Plano não-PRO. Módulo desativado silenciosamente.');
        return;
      }

      try {
        zones = await EncartAPI.DeliveryAPI.getActiveByStore(store.id);
        if (!zones || zones.length === 0) {
          EventBus.log('DeliveryModule', 'Loja PRO, mas sem zonas configuradas. Desativando...');
          return;
        }

        isActive = true;
        EventBus.log('DeliveryModule', 'Zonas carregadas com sucesso', { count: zones.length });
        EventBus.emit('loja:delivery_updated', { active: true, zones });
        
        _renderDeliveryUI();
      } catch (err) {
        EventBus.log('DeliveryModule', 'Falha ao carregar zonas de entrega', err.message, true);
        EventBus.emit('loja:delivery_failed', { error: err.message });
      }
    });

    EventBus.on(EventBus.EVENTS.CART_UPDATED, ({ cart }) => {
      if (!isActive) return;
      currentSubtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
      _renderDeliveryUI();
    });
  }

  // ── Calculator & State ───────────────────────────────────────
  function getState() {
    if (!isActive) return { active: false };

    const subtotal = currentSubtotal;
    const fee = selectedZone ? Number(selectedZone.delivery_fee || 0) : 0;
    const total = subtotal + fee;
    const minOrder = selectedZone ? Number(selectedZone.minimum_order || 0) : 0;
    const canCheckout = !!selectedZone && subtotal >= minOrder;

    return {
      active: true,
      selectedZone,
      subtotal,
      fee,
      total,
      minimum_order: minOrder,
      canCheckout,
      reason: !selectedZone ? 'region_missing' : (subtotal < minOrder ? 'minimum_not_met' : null)
    };
  }

  function setZone(zoneId) {
    if (!isActive) return;
    selectedZone = zones.find(z => z.id === zoneId) || null;
    EventBus.log('DeliveryModule', 'Região alterada', { zoneId });
    EventBus.emit('loja:delivery_region_changed', { selectedZone });
    _renderDeliveryUI();
  }

  // ── Renderer UI ──────────────────────────────────────────────
  function _renderDeliveryUI() {
    const area = document.getElementById('delivery-module-area');
    if (!area) return;

    if (currentSubtotal === 0) {
      area.innerHTML = '';
      return;
    }

    const state = getState();
    const fmt = v => UIRender.fmtPrice(v);

    let selectorHTML = `
      <div class="delivery-module-wrap">
        <label class="delivery-module-label">Bairro / Região de Entrega</label>
        <select class="delivery-module-select" onchange="window.DeliveryModule.setZone(this.value)">
          <option value="" disabled ${!selectedZone ? 'selected' : ''}>Selecione sua região...</option>
          ${zones.map(z => `<option value="${z.id}" ${selectedZone && selectedZone.id === z.id ? 'selected' : ''}>${escapeHTML(z.region_name)}</option>`).join('')}
        </select>
      </div>
    `;

    let infoHTML = '';
    if (selectedZone) {
      const isFree = state.fee === 0;
      const minOrderMet = state.subtotal >= state.minimum_order;
      
      let alertHTML = '';
      if (!minOrderMet && state.minimum_order > 0) {
        alertHTML = `
          <div class="delivery-module-alert">
            Pedido mínimo para <b>${escapeHTML(selectedZone.region_name)}</b> é de ${fmt(state.minimum_order)}.
            Faltam ${fmt(state.minimum_order - state.subtotal)}.
          </div>
        `;
      } else if (selectedZone.estimated_time) {
        alertHTML = `<div class="delivery-module-time">⏱️ Previsão: ${escapeHTML(selectedZone.estimated_time)}</div>`;
      }

      infoHTML = `
        ${alertHTML}
        <div class="delivery-module-summary">
          <div class="cart-summary-row"><span>Subtotal</span><span>${fmt(state.subtotal)}</span></div>
          <div class="cart-summary-row"><span>Taxa de Entrega</span><span style="${isFree ? 'color:#10b981;font-weight:600' : ''}">${isFree ? 'Grátis 🎉' : fmt(state.fee)}</span></div>
          <div class="cart-summary-total"><span>Total Final</span><span class="cart-total-value">${fmt(state.total)}</span></div>
        </div>
      `;
    }

    area.innerHTML = selectorHTML + infoHTML;
    _injectStyles();
  }

  function _injectStyles() {
    if (document.getElementById('delivery-module-styles')) return;
    const style = document.createElement('style');
    style.id = 'delivery-module-styles';
    style.innerHTML = `
      .delivery-module-wrap { margin-top: 16px; margin-bottom: 12px; }
      .delivery-module-label { display: block; font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
      .delivery-module-select { width: 100%; padding: 12px; border: 2px solid var(--border); border-radius: 8px; font-size: 1rem; color: var(--text-dark); background: #fff; appearance: none; outline: none; transition: border-color 0.2s; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; }
      .delivery-module-select:focus { border-color: var(--brand); }
      .delivery-module-alert { background: #fee2e2; color: #b91c1c; padding: 10px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 12px; border-left: 4px solid #ef4444; }
      .delivery-module-time { background: #f0fdf4; color: #15803d; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; margin-bottom: 12px; display: inline-block; }
      .delivery-module-summary { padding-top: 12px; border-top: 1px dashed var(--border); }
    `;
    document.head.appendChild(style);
  }

  return { init, getState, setZone };
})();
