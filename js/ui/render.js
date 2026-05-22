/**
 * EncartShop — UI Render Helpers
 */

const UIRender = (() => {
  function emptyState(icon, title, desc) {
    return `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <div style="font-size:3rem; margin-bottom:16px; opacity:0.8;">${escapeHTML(icon)}</div>
        <h4 style="font-size:1.1rem; font-weight:700; color:var(--text); margin-bottom:8px;">${escapeHTML(title)}</h4>
        <p style="font-size:0.9rem; max-width:300px; margin:0 auto; line-height:1.5;">${escapeHTML(desc)}</p>
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
    const img = escapeHTML(p.image) || defaultImg;
    const priceStr = fmtPrice(p.price);
    const promoStr = p.promo_price ? `<span style="font-size:0.8rem;color:var(--danger);font-weight:700;">${fmtPrice(p.promo_price)}</span> <span style="font-size:0.7rem;text-decoration:line-through;color:var(--text-muted);">${priceStr}</span>` : `<span style="font-weight:700;">${priceStr}</span>`;
    const opacity = p.active ? '1' : '0.5';

    return `
      <div class="prod-admin-card" style="opacity:${opacity}">
        <div class="img-wrap">
          <img src="${img}" alt="${escapeHTML(p.name)}">
          ${!p.active ? `<div style="position:absolute;top:8px;right:8px;background:var(--danger);color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:bold;">Inativo</div>` : ''}
          ${p.promo_price && p.active ? `<div style="position:absolute;top:8px;left:8px;background:var(--accent);color:white;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:bold;">Promoção</div>` : ''}
        </div>
        <div class="card-body">
          <div class="card-name">${escapeHTML(p.name)}</div>
          <div class="card-cat">${escapeHTML(p.category || 'Sem categoria')}</div>
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
    const qtyLabel = isKg ? (cartQty < 1 && cartQty > 0 ? `${cartQty * 1000}g` : `${cartQty.toFixed(1).replace('.',',')}kg`) : `${cartQty}x`;
    const defaultImg = 'https://images.placeholders.dev/?width=400&height=400&text=Sem%20Imagem&bgColor=%23f1f5f9&textColor=%2364748b';
    const img = escapeHTML(p.image) || defaultImg;

    return `
      <div class="product-card" id="prod-${p.id}">
        <div class="product-image-wrap">
          <img src="${img}" alt="${escapeHTML(p.name)}" loading="lazy" onerror="this.src='${defaultImg}'">
          ${isPromo ? `<div class="promo-badge">🔥 OFERTA</div>` : ''}
        </div>
        <div class="product-info">
          <div class="product-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div>
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
    
    // Mapeamento de Cores para Status Premium
    const getStatusColor = (status) => {
      const s = status.toLowerCase();
      if(s === 'novo' || s === 'pendente') return 'bg-warning/15 text-warning border-warning/20';
      if(s === 'entregue' || s === 'concluido' || s === 'finalizado') return 'bg-success/15 text-success border-success/20';
      if(s === 'cancelado') return 'bg-danger/15 text-danger border-danger/20';
      return 'bg-info/15 text-info border-info/20';
    };

    const statusClass = getStatusColor(o.status);
    const dateStr = fmtDateShort(o.created_at);
    const totalStr = fmtPrice(o.total);
    const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
    
    const nextActions = OrderModule.STATUS_FLOW[o.status] || [];
    const actionButtons = nextActions.map(next => {
      const label = OrderModule.getStatusLabel(next);
      return `<button class="px-3 py-1.5 border border-borderColor rounded-lg bg-bgPrimary text-xs font-semibold hover:bg-cardBg hover:text-textPrimary transition-colors" 
                data-order-id="${o.id}" 
                data-current-status="${o.status}" 
                data-new-status="${next}" 
                onclick="handleOrderStatus(this)">${label}</button>`;
    }).join('');

    return `
      <div class="bg-cardBg border border-borderColor rounded-xl p-5 mb-4 hover-scale shadow-card transition-all" id="order-${o.id}">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-bgPrimary flex items-center justify-center flex-shrink-0">
               <span class="text-sm font-bold text-textSecondary">${String(o.customer_name).charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-bold text-textPrimary">${escapeHTML(o.customer_name || 'Cliente')}</h4>
                <span class="text-xs font-mono text-textSecondary bg-bgPrimary px-1.5 py-0.5 rounded">#${String(o.id).slice(-5).toUpperCase()}</span>
              </div>
              <div class="text-xs text-textSecondary mt-1 flex items-center gap-1.5">
                <i data-lucide="clock" class="w-3 h-3"></i> ${dateStr}
                <span class="w-1 h-1 bg-borderColor rounded-full mx-1"></span>
                <i data-lucide="package" class="w-3 h-3"></i> ${itemsCount} item(s)
              </div>
            </div>
          </div>
          <div class="flex items-center sm:flex-col sm:items-end justify-between w-full sm:w-auto">
            <span class="text-lg font-extrabold text-textPrimary tracking-tight">${totalStr}</span>
            <span class="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider mt-1 ${statusClass}">
              ${statusLabel}
            </span>
          </div>
        </div>
        
        <div class="border-t border-borderColor pt-4 pb-2 mb-2">
          <h5 class="text-xs font-bold text-textSecondary uppercase tracking-wider mb-3">Itens do Pedido</h5>
          <div class="flex flex-col gap-2">
            ${(o.items || []).map(item => `
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded bg-bgPrimary flex items-center justify-center text-xs font-semibold text-textSecondary">${item.qty || item.quantity}x</span>
                  <span class="font-medium text-textPrimary">${escapeHTML(item.name)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="border-t border-borderColor pt-4 mt-2 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            ${actionButtons}
          </div>
          <button class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-danger/10 text-textSecondary hover:text-danger transition-colors ml-auto" onclick="handleDeleteOrder('${o.id}')" title="Excluir Pedido">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }

  return { emptyState, fmtPrice, fmtDateShort, productAdminCard, productStoreCard, orderAdminCard };
})();

window.UIRender = UIRender;
