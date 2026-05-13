/**
 * EncartShop — Loja Pública v13
 * Produtos agrupados por categoria + carrinho premium bottom-sheet.
 */

const urlParams      = new URLSearchParams(window.location.search);
const STORE_ID_PARAM = urlParams.get('s') || urlParams.get('id');

let cart           = [];
let store          = {};
let allProducts    = [];
let activeCategory = 'Todos';
let STORE_ID       = STORE_ID_PARAM;

// ── Inicialização ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!window.sb) throw new Error('Falha na conexão com o servidor.');
    if (!STORE_ID)  throw new Error('Link da loja inválido. Verifique o link recebido.');

    showPageLoading(true);

    // 1. Busca loja por UUID ou slug
    let storeData = await EncartAPI.StoreAPI.getById(STORE_ID);
    if (!storeData) {
      storeData = await EncartAPI.StoreAPI.getBySlug(STORE_ID);
    }
    if (!storeData) throw new Error('Loja não encontrada. Verifique o link com o lojista.');

    store    = storeData;
    STORE_ID = store.id;

    // 2. Verifica assinatura
    const subStatus = SubscriptionModule.getStatus(store.expires_at);
    if (subStatus.blocked) {
      showPageLoading(false);
      document.body.innerHTML = `
        <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;background:#f8fafc;">
          <div style="font-size:4rem;margin-bottom:20px">🏪</div>
          <h1 style="font-size:1.4rem;color:#0f172a;margin-bottom:8px">Loja Temporariamente Indisponível</h1>
          <p style="color:#64748b;max-width:380px;line-height:1.6">Esta loja está em manutenção ou com assinatura vencida.</p>
          <a href="/" style="margin-top:24px;color:#4f46e5;text-decoration:none;font-weight:600">← Voltar ao EncartShop</a>
        </div>`;
      return;
    }

    // 3. Aplica tema da loja
    cart = _loadCart();
    if (store.color) {
      document.documentElement.style.setProperty('--accent',     store.color);
      document.documentElement.style.setProperty('--brand',      store.color);
      document.documentElement.style.setProperty('--brand-dark', _darkenColor(store.color));
      document.documentElement.style.setProperty('--brand-glow', store.color + '22');
    }

    // 4. UI e produtos
    loadStoreUI();
    await loadProducts();
    updateCartUI();
    showPageLoading(false);

  } catch (err) {
    console.error('[Loja] Erro Crítico:', err);
    showPageLoading(false);
    document.body.innerHTML = `
      <div style="text-align:center;padding:80px 24px;font-family:sans-serif;background:#f8fafc;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-size:3rem;margin-bottom:20px">⚠️</div>
        <h1 style="font-size:1.2rem;color:#1e293b;margin-bottom:8px">Não conseguimos carregar a loja</h1>
        <p style="color:#64748b;margin-top:8px;max-width:380px;line-height:1.6">${err.message}</p>
        <a href="/" style="display:inline-block;margin-top:24px;color:#4f46e5;text-decoration:none;font-weight:600">← Voltar ao início</a>
      </div>`;
  }
});

// ── Helpers ───────────────────────────────────────────────────

function showPageLoading(show) {
  let el = document.getElementById('page-loading');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'page-loading';
    el.style.cssText = 'position:fixed;inset:0;background:var(--bg,#f8fafc);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;';
    el.innerHTML = `
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--brand,#4f46e5)" stroke-width="2">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
      <div style="color:var(--text-muted,#64748b);font-size:0.85rem;font-family:sans-serif;animation:pulse 1.5s ease infinite">Carregando loja...</div>
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>`;
    document.body.prepend(el);
  } else if (el && !show) {
    el.remove();
  }
}

// Escurece um hex color ~20% para brand-dark
function _darkenColor(hex) {
  try {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (n >> 16 & 255) - 40);
    const g = Math.max(0, (n >>  8 & 255) - 40);
    const b = Math.max(0, (n       & 255) - 40);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  } catch { return hex; }
}

function loadStoreUI() {
  document.title = (store.name || 'Loja') + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name || '');
  setEl('store-banner',      store.banner_text || 'Confira nossas ofertas!');
  setEl('header-hours',      store.hours || '');
}

// ── Produtos ──────────────────────────────────────────────────

async function loadProducts() {
  const area = document.getElementById('products-area');
  if (area) area.innerHTML = _skeletonProducts();

  const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
  allProducts  = Array.isArray(prods) ? prods : [];
  renderCategoryTabs();
  renderProducts();
}

function _skeletonProducts() {
  return `<div style="margin-top:24px">
    <div style="height:20px;width:120px;border-radius:8px;background:rgba(0,0,0,0.06);margin-bottom:16px"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
      ${Array.from({length:6}).map((_,i) => `
        <div style="border-radius:12px;overflow:hidden;background:#f8fafc;border:1px solid rgba(0,0,0,0.06)">
          <div style="height:150px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:encart-shimmer 1.4s infinite ${i*0.1}s"></div>
          <div style="padding:10px;display:flex;flex-direction:column;gap:6px">
            <div style="height:12px;border-radius:4px;background:#e2e8f0;width:75%"></div>
            <div style="height:10px;border-radius:4px;background:#e2e8f0;width:45%"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderCategoryTabs() {
  const tabsArea = document.getElementById('cat-tabs-area');
  const tabsWrap = document.getElementById('cat-tabs');
  if (!tabsWrap) return;

  const categories = _getCategories();
  const hasPromo   = allProducts.some(p => p.promo_price);

  if (!categories.length && !hasPromo) {
    if (tabsArea) tabsArea.classList.add('hidden');
    return;
  }
  if (tabsArea) tabsArea.classList.remove('hidden');

  const tabs = [
    `<button class="cat-tab ${activeCategory==='Todos'?'active':''}" onclick="setCategory('Todos')">Todos</button>`
  ];
  if (hasPromo) {
    tabs.push(`<button class="cat-tab ${activeCategory==='Ofertas'?'active':''}" onclick="setCategory('Ofertas')" style="${activeCategory!=='Ofertas'?'color:#ef4444;border-color:#ef4444':''}">🔥 Ofertas</button>`);
  }
  categories.forEach(cat => {
    tabs.push(`<button class="cat-tab ${activeCategory===cat?'active':''}" onclick="setCategory(${JSON.stringify(cat)})">${cat}</button>`);
  });

  tabsWrap.innerHTML = tabs.join('');
}

function _getCategories() {
  return [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderProducts();
  // Scroll suave para o topo dos produtos
  document.getElementById('products-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProducts() {
  const area = document.getElementById('products-area');
  if (!area) return;

  if (!allProducts.length) {
    area.innerHTML = `<div style="text-align:center;padding:60px 24px;color:var(--text-muted)">
      <div style="font-size:3rem;margin-bottom:12px">🛍️</div>
      <p style="font-size:0.9rem">Nenhum produto disponível no momento.</p>
    </div>`;
    return;
  }

  // ── Vista "Todos": agrupa por categoria ───────────────────────
  if (activeCategory === 'Todos') {
    area.innerHTML = _renderGrouped();
    return;
  }

  // ── Vista "Ofertas" ───────────────────────────────────────────
  if (activeCategory === 'Ofertas') {
    const offerProds = allProducts.filter(p => !!p.promo_price);
    if (!offerProds.length) {
      area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhuma oferta no momento.</div>';
      return;
    }
    area.innerHTML = `
      <div class="category-group">
        <div class="category-group-header">
          <span class="category-group-title">🔥 Ofertas</span>
          <span class="category-group-count">${offerProds.length} produto(s)</span>
          <div class="category-group-line"></div>
        </div>
        <div class="product-grid">${offerProds.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>
      </div>`;
    return;
  }

  // ── Vista de categoria específica ─────────────────────────────
  const filtered = allProducts.filter(p => p.category === activeCategory);
  if (!filtered.length) {
    area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhum produto nesta categoria.</div>';
    return;
  }
  area.innerHTML = `
    <div class="category-group">
      <div class="category-group-header">
        <span class="category-group-title">${activeCategory}</span>
        <span class="category-group-count">${filtered.length} produto(s)</span>
        <div class="category-group-line"></div>
      </div>
      <div class="product-grid">${filtered.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>
    </div>`;
}

// Renderiza todos os produtos agrupados por categoria
function _renderGrouped() {
  const categories = _getCategories();
  const hasPromo   = allProducts.some(p => p.promo_price);
  const groups     = [];

  // Grupo de Ofertas primeiro (se houver)
  if (hasPromo) {
    const promoProds = allProducts.filter(p => !!p.promo_price);
    groups.push(_renderGroup('🔥 Ofertas', promoProds, true));
  }

  // Produtos sem categoria agrupados como "Outros"
  const noCat = allProducts.filter(p => !p.category);

  if (!categories.length && !hasPromo) {
    // Sem categorias nem promos: lista simples
    groups.push(_renderGroup('Produtos', allProducts, false));
  } else {
    // Um grupo por categoria
    categories.forEach(cat => {
      const catProds = allProducts.filter(p => p.category === cat);
      if (catProds.length) groups.push(_renderGroup(cat, catProds, false));
    });
    if (noCat.length) groups.push(_renderGroup('Outros', noCat, false));
  }

  return groups.join('');
}

function _renderGroup(title, products, isPromo = false) {
  const icon = isPromo ? '' : '';
  return `
    <div class="category-group">
      <div class="category-group-header">
        <span class="category-group-title">${title}</span>
        <span class="category-group-count">${products.length}</span>
        <div class="category-group-line"></div>
      </div>
      <div class="product-grid">
        ${products.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}
      </div>
    </div>`;
}

// ── Carrinho ──────────────────────────────────────────────────

function addToCart(id) {
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
  _saveCart(); updateCartUI(); _refreshProductCard(id);
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  const isKg = item.unit?.toLowerCase() === 'kg';
  const step = isKg ? 0.5 : 1;
  item.qty  += delta * step;
  if (isKg) item.qty = Math.round(item.qty * 100) / 100;
  if (item.qty <= 0) cart.splice(cart.indexOf(item), 1);
  _saveCart(); updateCartUI(); _refreshProductCard(id);
  const modal = document.getElementById('cart-modal');
  if (modal && !modal.classList.contains('hidden')) renderCartBody();
}

function _refreshProductCard(id) {
  const p  = allProducts.find(x => x.id === id);
  const el = document.getElementById(`prod-${id}`);
  if (!p || !el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = UIRender.productStoreCard(p, _cartQty(p.id));
  if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
}

function _cartQty(id) {
  const item = cart.find(c => c.id === id);
  return item ? item.qty : 0;
}

function _cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function updateCartUI() {
  const itemCount = cart.length;
  const total     = _cartTotal();
  const fmt       = v => UIRender.fmtPrice(v);

  // Header button
  const hBtn = document.getElementById('header-cart-btn');
  const hCnt = document.getElementById('header-cart-count');
  if (hBtn) hBtn.classList.toggle('hidden', itemCount === 0);
  if (hCnt) hCnt.textContent = itemCount;

  // Bottom bubble
  const bubble     = document.getElementById('cart-bubble');
  const bubbleTotal = document.getElementById('cart-bubble-total');
  const cnt        = document.getElementById('cart-count');
  if (bubble) bubble.classList.toggle('hidden', itemCount === 0);
  if (cnt) cnt.textContent = itemCount;
  if (bubbleTotal) bubbleTotal.textContent = fmt(total);

  // Drawer badge
  const drawerBadge = document.getElementById('cart-drawer-count');
  if (drawerBadge) drawerBadge.textContent = itemCount;
}

function openCart() {
  document.getElementById('cart-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderCartBody();
}

function closeCart() {
  document.getElementById('cart-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

// Fecha ao clicar no backdrop
function handleCartOverlayClick(e) {
  if (e.target.id === 'cart-modal') closeCart();
}

function renderCartBody() {
  const body   = document.getElementById('cart-body');
  const footer = document.getElementById('cart-subtotals');
  const badge  = document.getElementById('cart-drawer-count');
  if (!body) return;

  if (badge) badge.textContent = cart.length;

  if (!cart.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <div class="cart-empty-text">Seu carrinho está vazio</div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Adicione produtos para continuar</p>
      </div>`;
    if (footer) footer.innerHTML = '';
    return;
  }

  const fmt = v => UIRender.fmtPrice(v);
  const defaultImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="%23e2e8f0"><rect width="100%" height="100%"/></svg>';

  body.innerHTML = cart.map(item => {
    const qtyLabel = item.unit === 'kg'
      ? (item.qty < 1 ? `${item.qty * 1000}g` : `${item.qty.toFixed(1).replace('.', ',')}kg`)
      : `${item.qty}x`;
    return `
      <div class="cart-item-row">
        <img class="cart-item-img" src="${item.image || defaultImg}" alt="${item.name}" onerror="this.src='${defaultImg}'">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-unit-price">${fmt(item.price)} / ${item.unit || 'un'}</div>
          <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
        </div>
        <div class="cart-qty-control">
          <button class="cart-qty-btn remove" onclick="changeQty('${item.id}',-1)" title="Remover">−</button>
          <span class="cart-qty-num">${qtyLabel}</span>
          <button class="cart-qty-btn" onclick="changeQty('${item.id}',1)" title="Adicionar">+</button>
        </div>
      </div>`;
  }).join('');

  // ── Summary ────────────────────────────────────────────────
  if (!footer) return;

  const subtotal     = _cartTotal();
  const deliveryFee  = Number(store.delivery_fee)  || 0;
  const deliveryFree = Number(store.delivery_free) || 0;
  const isCombine    = deliveryFee === -1;
  const hasFreeShip  = deliveryFree > 0 && subtotal >= deliveryFree;
  const feeCharged   = isCombine ? 0 : (hasFreeShip ? 0 : deliveryFee);
  const total        = subtotal + feeCharged;

  // Barra de progresso para frete grátis
  let progressHTML = '';
  if (deliveryFree > 0 && !hasFreeShip && !isCombine) {
    const pct = Math.min(100, Math.round((subtotal / deliveryFree) * 100));
    progressHTML = `
      <div class="cart-progress-wrap">
        <div class="cart-progress-bar">
          <div class="cart-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="cart-progress-label">Faltam ${fmt(deliveryFree - subtotal)} para frete grátis!</div>
      </div>`;
  } else if (hasFreeShip) {
    progressHTML = `<div class="cart-free-ship">🎉 Você ganhou frete grátis!</div>`;
  }

  let deliveryLine = '';
  if (isCombine) {
    deliveryLine = `<div class="cart-summary-row"><span>Entrega</span><span style="color:#f59e0b;font-weight:600">A combinar</span></div>`;
  } else if (deliveryFee > 0) {
    deliveryLine = hasFreeShip
      ? `<div class="cart-summary-row"><span>Entrega</span><span style="color:#22c55e;font-weight:600">Grátis 🎉</span></div>`
      : `<div class="cart-summary-row"><span>Entrega</span><span>${fmt(deliveryFee)}</span></div>`;
  }

  footer.innerHTML = `
    ${progressHTML}
    <div class="cart-summary">
      <div class="cart-summary-row"><span>Subtotal (${cart.length} item(s))</span><span>${fmt(subtotal)}</span></div>
      ${deliveryLine}
      <div class="cart-summary-total">
        <span>Total</span>
        <span class="cart-total-value">${isCombine ? fmt(subtotal) : fmt(total)}</span>
      </div>
    </div>`;
}

// ── Checkout ──────────────────────────────────────────────────

async function checkout() {
  const nameInput = document.getElementById('customer-name');
  const name      = nameInput?.value.trim() || '';
  if (!name) {
    nameInput?.focus();
    nameInput?.style.setProperty('border-color', 'var(--danger, #ef4444)');
    setTimeout(() => nameInput?.style.removeProperty('border-color'), 2000);
    showToast('Informe seu nome para continuar.', 'warning');
    return;
  }

  const wa = (store.whatsapp || '').replace(/\D/g, '');
  if (!wa) { showToast('Esta loja ainda não tem WhatsApp configurado.', 'error'); return; }

  const btn = document.getElementById('whatsapp-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparando pedido...'; }

  try {
    const subtotal  = _cartTotal();
    const itemsText = cart.map(i =>
      `• ${i.qty}${i.unit === 'kg' ? 'kg' : 'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`
    ).join('\n');

    const msg = `🛒 *Novo Pedido — ${store.name}*\n\n*Cliente:* ${name}\n\n*Itens:*\n${itemsText}\n\n*Total:* ${UIRender.fmtPrice(subtotal)}\n\n_Enviado via EncartShop_`;

    // Salva no banco sem bloquear o fluxo
    EncartAPI.OrderAPI.create(STORE_ID, {
      customer_name: name,
      items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
      total: subtotal,
      status: 'novo'
    }).catch(e => console.warn('[Loja] Pedido não salvo:', e));

    cart = []; _saveCart(); updateCartUI(); closeCart();
    window.location.href = `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Enviar Pedido pelo WhatsApp`;
    }
  }
}

// ── Persistência ──────────────────────────────────────────────

function _saveCart() {
  try { localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); } catch { }
}
function _loadCart() {
  try { return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); } catch { return []; }
}
