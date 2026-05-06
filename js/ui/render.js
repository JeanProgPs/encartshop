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
    const defaultImg = 'https://placehold.co/300x300/1a1a2e/888?text=?';
    const img = p.image || defaultImg;
    const price = p.promo_price ? p.promo_price : p.price;
    const hasPromo = !!p.promo_price;
    
    return `
      <div class="product-card" id="prod-${p.id}" onclick="addToCart('${p.id}')">
        ${hasPromo ? `<div class="promo-badge">PROMO</div>` : ''}
        <div class="product-image-wrap">
          <img src="${img}" alt="${p.name}" loading="lazy" onerror="this.src='${defaultImg}'">
        </div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-unit">${p.unit ? p.unit : 'unid.'}</div>
          <div class="product-price-row">
            ${hasPromo 
              ? `<div class="price-normal">${fmtPrice(p.price)}</div><div class="price-promo">${fmtPrice(p.promo_price)}</div>`
              : `<div class="price-regular">${fmtPrice(p.price)}</div>`
            }
          </div>
          <button class="btn-add-cart">
            ${cartQty > 0 
              ? `<span>Adicionado (${p.unit?.toLowerCase() === 'kg' ? cartQty.toFixed(1).replace('.',',') + 'kg' : cartQty})</span>` 
              : `<span>Adicionar</span>`}
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  return { emptyState, fmtPrice, fmtDateShort, productAdminCard, productStoreCard };
})();

window.UIRender = UIRender;
