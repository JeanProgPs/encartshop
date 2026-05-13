/**
 * EncartShop — Premium UI Render Helpers
 */

const UIRender = (() => {
  function fmtPrice(v) {
    if (v === undefined || v === null) return 'R$ 0,00';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function emptyState(icon, title, desc) {
    return `
      <div style="text-align:center; padding:60px 24px; color:var(--text-muted);">
        <div style="font-size:4rem; margin-bottom:20px; opacity:0.6;">${icon}</div>
        <h3 style="font-size:1.25rem; font-weight:800; color:var(--text); margin-bottom:10px;">${title}</h3>
        <p style="font-size:0.9375rem; max-width:280px; margin:0 auto; line-height:1.6;">${desc}</p>
      </div>
    `;
  }

  /**
   * Card de Produto — Estilo Marketplace Premium
   */
  function productStoreCard(p, cartQty = 0) {
    const isPromo = !!p.promo_price;
    const price = isPromo ? p.promo_price : p.price;
    const unit = p.unit || 'un';
    const isKg = unit.toLowerCase() === 'kg';
    const defaultImg = 'https://images.placeholders.dev/?width=400&height=400&text=Sem%20Imagem&bgColor=%23f1f5f9&textColor=%2364748b';
    const img = p.image || defaultImg;
    
    // Qty labels
    const qtyLabel = isKg 
      ? (cartQty < 1 && cartQty > 0 ? `${cartQty * 1000}g` : `${cartQty.toFixed(1).replace('.',',')}kg`) 
      : `${cartQty}x`;

    return `
      <article class="product-card" id="prod-${p.id}">
        <div class="product-image-wrap">
          <img src="${img}" alt="${p.name}" class="product-image" loading="lazy" onerror="this.src='${defaultImg}'">
          ${isPromo ? `<div class="promo-badge">Oferta</div>` : ''}
        </div>
        
        <div class="product-content">
          <h3 class="product-name" title="${p.name}">${p.name}</h3>
          
          <div class="product-price-area">
            ${isPromo ? `<span class="price-old">${fmtPrice(p.price)}</span>` : ''}
            <span class="price-current">${fmtPrice(price)}</span>
            <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">/${unit}</span>
          </div>

          <div class="card-actions">
            ${cartQty > 0 
              ? `
                <div class="qty-control">
                  <button class="qty-btn" onclick="event.stopPropagation(); changeQty('${p.id}', -1)">−</button>
                  <span class="qty-val">${qtyLabel}</span>
                  <button class="qty-btn" onclick="event.stopPropagation(); changeQty('${p.id}', 1)">+</button>
                </div>
              `
              : `
                <button class="btn-add" onclick="event.stopPropagation(); addToCart('${p.id}')">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                  <span>Adicionar</span>
                </button>
              `
            }
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Item do Carrinho — Estilo App Delivery
   */
  function cartItemRow(item) {
    const isKg = item.unit?.toLowerCase() === 'kg';
    const qtyLabel = isKg 
      ? (item.qty < 1 ? `${item.qty * 1000}g` : `${item.qty.toFixed(1).replace('.',',')}kg`) 
      : `${item.qty}x`;
    const defaultImg = 'https://images.placeholders.dev/?width=100&height=100&text=...&bgColor=%23f1f5f9&textColor=%2364748b';
    const img = item.image || defaultImg;

    return `
      <div class="cart-item-row" id="cart-row-${item.id}" style="display:flex; gap:16px; align-items:center; padding:16px 0; border-bottom:1px solid var(--border);">
        <img src="${img}" alt="${item.name}" style="width:64px; height:64px; border-radius:12px; object-fit:cover; background:var(--bg);" onerror="this.src='${defaultImg}'">
        
        <div style="flex:1;">
          <h4 style="font-size:0.9375rem; font-weight:700; color:var(--text); margin-bottom:4px; display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${item.name}</h4>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:800; color:var(--brand); font-size:0.9375rem;">${fmtPrice(item.price * item.qty)}</span>
            
            <div class="qty-control" style="margin-top:0; transform: scale(0.9); transform-origin: right;">
              <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
              <span class="qty-val" style="min-width:30px; text-align:center;">${qtyLabel}</span>
              <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Card de Confiança / Info da Loja
   */
  function storeTrustCard(store) {
    const wa = store.whatsapp || 'Não informado';
    return `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h2 style="font-size:1.125rem; margin-bottom:4px;">${store.name}</h2>
            <div style="display:flex; gap:12px; font-size:0.8rem; color:var(--text-light); font-weight:600;">
              <span>📍 ${store.city || 'Entrega Local'}</span>
              <span>🕒 ${store.hours || 'Consulte o horário'}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <a href="tel:${wa.replace(/\D/g,'')}" style="width:36px; height:36px; background:var(--bg); border-radius:50%; display:flex; align-items:center; justify-content:center; text-decoration:none;">📞</a>
            ${store.instagram ? `<a href="https://instagram.com/${store.instagram.replace('@','')}" target="_blank" style="width:36px; height:36px; background:var(--bg); border-radius:50%; display:flex; align-items:center; justify-content:center; text-decoration:none;">📸</a>` : ''}
          </div>
        </div>
        
        <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none;">
          <div style="background:var(--brand-light); color:var(--brand); padding:6px 12px; border-radius:var(--radius-full); font-size:0.7rem; font-weight:800; white-space:nowrap;">✓ Pedido via WhatsApp</div>
          <div style="background:#f0fdf4; color:#16a34a; padding:6px 12px; border-radius:var(--radius-full); font-size:0.7rem; font-weight:800; white-space:nowrap;">✓ Atendimento Rápido</div>
          <div style="background:#fff7ed; color:#ea580c; padding:6px 12px; border-radius:var(--radius-full); font-size:0.7rem; font-weight:800; white-space:nowrap;">✓ Entrega Local</div>
        </div>
      </div>
    `;
  }

  return { fmtPrice, emptyState, productStoreCard, cartItemRow, storeTrustCard };
})();

window.UIRender = UIRender;
