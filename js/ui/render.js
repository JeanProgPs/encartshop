/**
 * EncartShop — UI Render Helpers
 */

const UIRender = (() => {
  function emptyState(icon, title, desc) {
    return `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <div style="font-size:3rem; margin-bottom:16px; opacity:0.8;">${icon}</div>
        <h4 style="font-size:1.1rem; font-weight:700; color:var(--text); margin-bottom:8px;">${title}</h4>
        <p style="font-size:0.9rem; max-width:300px; margin:0 auto; line-height:1.5;">${desc}</p>
      </div>
    `;
  }

  function fmtPrice(v) {
    if (v === undefined || v === null) return 'R$ 0,00';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtDateShort(dStr) {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function productAdminCard(p, callbacks) {
    const defaultImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="%23eee"><rect width="100%" height="100%"/><text x="50%" y="50%" fill="%23999" font-family="sans-serif" font-size="20" text-anchor="middle" dy=".3em">Sem Imagem</text></svg>';
    const img = p.image || defaultImg;
    const priceStr = fmtPrice(p.price);
    const promoStr = p.promo_price ? `<span style="font-size:0.8rem;color:var(--danger);font-weight:700;">${fmtPrice(p.promo_price)}</span> <span style="font-size:0.7rem;text-decoration:line-through;color:var(--text-muted);">${priceStr}</span>` : `<span style="font-weight:700;">${priceStr}</span>`;
    const opacity = p.active ? '1' : '0.5';

    return `
      <div class="prod-admin-card" style="opacity:${opacity}">
        <div class="img-wrap">
          <img src="${img}" alt="${p.name}">
          ${!p.active ? `<div style="position:absolute;top:8px;right:8px;background:var(--danger);color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:bold;">Inativo</div>` : ''}
          ${p.promo_price && p.active ? `<div style="position:absolute;top:8px;left:8px;background:var(--accent);color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:bold;">Promoção</div>` : ''}
        </div>
        <div class="card-body">
          <div class="card-name">${p.name}</div>
          <div class="card-cat">${p.category || 'Sem categoria'}</div>
          <div class="prices">${promoStr}</div>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="${callbacks.onEdit}('${p.id}')">Editar</button>
            <button class="btn btn-ghost btn-icon" onclick="${callbacks.onToggle}('${p.id}', ${p.active})" title="${p.active?'Desativar':'Ativar'}">
              ${p.active ? '👁️' : '🙈'}
            </button>
            <button class="btn btn-ghost btn-icon" style="color:var(--danger);" onclick="${callbacks.onDelete}('${p.id}')" title="Excluir">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  function productStoreCard(p, cartQty = 0) {
    const isPromo = !!p.promo_price;
    const price = isPromo ? p.promo_price : p.price;
    const unit = p.unit || 'un';
    const isKg = unit.toLowerCase() === 'kg';
    const qtyLabel = isKg ? `${cartQty.toFixed(1).replace('.',',')}kg` : `${cartQty}x`;
    const defaultImg = 'https://images.placeholders.dev/?width=400&height=400&text=Sem%20Imagem&bgColor=%23f1f5f9&textColor=%2364748b';
    const img = p.image || defaultImg;

    return `
      <div class="product-card" id="prod-${p.id}">
        <div class="product-image-wrap">
          <img src="${img}" alt="${p.name}" loading="lazy" onerror="this.src='${defaultImg}'">
          ${isPromo ? `<div class="promo-badge">🔥 OFERTA</div>` : ''}
        </div>
        <div class="product-info">
          <div class="product-name" title="${p.name}">${p.name}</div>
          <div class="product-price-row">
            ${isPromo 
              ? `<div class="price-normal">${fmtPrice(p.price)}</div><div class="price-promo">${fmtPrice(p.promo_price)}</div>`
              : `<div class="price-regular">${fmtPrice(p.price)}</div>`
            }
            <span class="product-unit-label">/${unit}</span>
          </div>
          
          <div class="product-card-actions">
            ${cartQty > 0 
              ? `
                <div class="qty-selector-card">
                  <button class="qty-btn-card" onclick="event.stopPropagation(); changeQty('${p.id}', -1)">−</button>
                  <span class="qty-num-card">${qtyLabel}</span>
                  <button class="qty-btn-card" onclick="event.stopPropagation(); changeQty('${p.id}', 1)">+</button>
                </div>
              `
              : `
                <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart('${p.id}')">
                  <span>Adicionar</span>
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              `
            }
          </div>
        </div>
      </div>
    `;
  }

  function orderAdminCard(o) {
    const statusLabel = OrderModule.getStatusLabel(o.status);
    const statusClass = OrderModule.getStatusClass(o.status);
    const dateStr = fmtDateShort(o.created_at);
    const totalStr = fmtPrice(o.total);
    const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
    
    // Determine next actions based on status flow
    const nextActions = OrderModule.STATUS_FLOW[o.status] || [];
    const actionButtons = nextActions.map(next => {
      const label = OrderModule.getStatusLabel(next);
      return `<button class="btn btn-outline btn-sm order-action-btn" 
                data-order-id="${o.id}" 
                data-current-status="${o.status}" 
                data-new-status="${next}" 
                onclick="handleOrderStatus(this)">${label}</button>`;
    }).join('');

    return `
      <div class="order-card" id="order-${o.id}">
        <div class="order-header">
          <div>
            <div class="order-id">#${String(o.id).slice(-5).toUpperCase()}</div>
            <div class="order-customer">${o.customer_name || 'Cliente'}</div>
            <div class="order-meta">${dateStr} · ${itemsCount} item(s)</div>
          </div>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="order-items">
          ${(o.items || []).map(item => `
            <div class="order-item">
              <span class="item-name">${item.name}</span>
              <span class="item-qty">${item.qty || item.quantity}x</span>
            </div>
          `).join('')}
        </div>
        <div class="order-total">
          <span class="order-total-label">Total</span>
          <span class="order-total-value">${totalStr}</span>
        </div>
        <div class="order-actions">
          ${actionButtons}
          <button class="btn btn-ghost btn-icon" style="color:var(--danger);margin-left:auto;" onclick="handleDeleteOrder('${o.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `;
  }

  return { emptyState, fmtPrice, fmtDateShort, productAdminCard, productStoreCard, orderAdminCard };
})();

window.UIRender = UIRender;
