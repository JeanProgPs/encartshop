/**
 * EncartShop — Loja Pública v12
 * Segura, estável e mobile-first.
 */

const urlParams    = new URLSearchParams(window.location.search);
const STORE_ID_PARAM = urlParams.get('s') || urlParams.get('id');

let cart           = [];
let store          = {};
let allProducts    = [];
let activeCategory = 'Todos';
let STORE_ID       = STORE_ID_PARAM;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!window.sb) throw new Error('Falha na conexão com o servidor.');
    if (!STORE_ID)  throw new Error('Link da loja inválido. Verifique o link recebido.');

    showPageLoading(true);

    // 1. Tenta por UUID primeiro (mais rápido e seguro)
    let storeData = await EncartAPI.StoreAPI.getById(STORE_ID);

    // 2. Se não encontrou por UUID, tenta por slug via endpoint seguro
    if (!storeData) {
      console.log('[Loja] Buscando por slug:', STORE_ID);
      storeData = await EncartAPI.StoreAPI.getBySlug(STORE_ID);
    }

    if (!storeData) {
      throw new Error('Loja não encontrada. Verifique o link com o lojista.');
    }

    store    = storeData;
    STORE_ID = store.id;

    // 3. Verifica assinatura
    const subStatus = SubscriptionModule.getStatus(store.expires_at);
    if (subStatus.blocked) {
      showPageLoading(false);
      document.body.innerHTML = `
        <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;background:#f8fafc;">
          <div style="font-size:4rem;margin-bottom:20px">🏪</div>
          <h1 style="font-size:1.4rem;color:#0f172a;margin-bottom:8px">Loja Temporariamente Indisponível</h1>
          <p style="color:#64748b;max-width:380px;line-height:1.6">Esta loja está em manutenção ou com assinatura vencida. Em breve estará de volta!</p>
          <a href="/" style="margin-top:24px;color:#4f46e5;text-decoration:none;font-weight:600">← Voltar ao EncartShop</a>
        </div>`;
      return;
    }

    // 4. Carrega interface
    cart = _loadCart();
    if (store.color) {
      document.documentElement.style.setProperty('--accent', store.color);
      document.documentElement.style.setProperty('--brand',  store.color);
    }
    loadStoreUI();

    // 5. Carrega produtos
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

function showPageLoading(show) {
  let el = document.getElementById('page-loading');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'page-loading';
    el.style.cssText = `
      position:fixed;inset:0;background:var(--bg,#0f172a);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:9999;gap:16px;`;
    el.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#e94560)" stroke-width="2">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
      <div style="color:#94a3b8;font-size:0.85rem;font-family:sans-serif">Carregando loja...</div>`;
    document.body.prepend(el);
  } else if (el && !show) {
    el.remove();
  }
}

function loadStoreUI() {
  document.title = (store.name || 'Loja') + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name || '');
  setEl('store-banner',      store.banner_text || 'Confira nossas ofertas!');
  setEl('header-hours',      store.hours || '');
}

async function loadProducts() {
  const area = document.getElementById('products-area');
  if (area) area.innerHTML = _skeletonProducts();

  const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
  allProducts  = Array.isArray(prods) ? prods : [];
  renderCategoryTabs();
  renderProducts();
}

function _skeletonProducts() {
  return Array.from({ length: 6 }).map(() => `
    <div style="border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
      <div style="height:160px;background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%);background-size:200% 100%;animation:encart-shimmer 1.4s infinite;"></div>
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
        <div style="height:14px;border-radius:4px;background:rgba(255,255,255,0.07);width:70%;"></div>
        <div style="height:12px;border-radius:4px;background:rgba(255,255,255,0.05);width:40%;"></div>
      </div>
    </div>`).join('');
}

function renderCategoryTabs() {
  const tabsArea = document.getElementById('cat-tabs-area');
  const tabsWrap = document.getElementById('cat-tabs');
  if (!tabsWrap) return;

  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  const hasPromo   = allProducts.some(p => p.promo_price);

  if (!categories.length && !hasPromo) {
    if (tabsArea) tabsArea.classList.add('hidden');
    return;
  }
  if (tabsArea) tabsArea.classList.remove('hidden');

  const html = [`<button class="cat-tab ${activeCategory==='Todos'?'active':''}" onclick="setCategory('Todos')">Todos</button>`];
  if (hasPromo) {
    html.push(`<button class="cat-tab ${activeCategory==='Ofertas'?'active':''}" onclick="setCategory('Ofertas')" style="color:#ef4444;border-color:#ef4444">🔥 Ofertas</button>`);
  }
  categories.forEach(cat => {
    html.push(`<button class="cat-tab ${activeCategory===cat?'active':''}" onclick="setCategory('${CSS.escape(cat)}')">${cat}</button>`);
  });
  tabsWrap.innerHTML = html.join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderProducts();
}

function renderProducts() {
  const area = document.getElementById('products-area');
  if (!area) return;

  if (!allProducts.length) {
    area.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-muted,#64748b)">Nenhum produto disponível no momento.</div>';
    return;
  }

  let filtered = allProducts;
  if (activeCategory === 'Ofertas') filtered = allProducts.filter(p => !!p.promo_price);
  else if (activeCategory !== 'Todos') filtered = allProducts.filter(p => p.category === activeCategory);

  if (!filtered.length) {
    area.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-muted,#64748b)">Nenhum produto nesta categoria.</div>';
    return;
  }

  area.innerHTML = filtered.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('');
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
    cart.push({ id: product.id, name: product.name, price, image: product.image, unit: product.unit, qty: step });
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

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const count = Math.ceil(total);
  const c1 = document.getElementById('cart-count');
  const c2 = document.getElementById('header-cart-count');
  if (c1) c1.textContent = count;
  if (c2) c2.textContent = count;
  document.getElementById('cart-bubble')?.classList.toggle('hidden', cart.length === 0);
  document.getElementById('header-cart-btn')?.classList.toggle('hidden', cart.length === 0);
}

function openCart()  { document.getElementById('cart-modal')?.classList.remove('hidden'); renderCartBody(); }
function closeCart() { document.getElementById('cart-modal')?.classList.add('hidden'); }

function renderCartBody() {
  const body   = document.getElementById('cart-body');
  const footer = document.getElementById('cart-subtotals');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = '<p style="text-align:center;padding:40px;color:#999">Seu carrinho está vazio.</p>';
    if (footer) footer.innerHTML = '';
    return;
  }

  const fmt = v => UIRender.fmtPrice(v);

  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div style="font-weight:600">${item.name}</div>
        <div style="color:var(--accent);font-size:0.9rem">${fmt(item.price * item.qty)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span style="min-width:40px;text-align:center">${item.qty}${item.unit==='kg'?'kg':'x'}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
      </div>
    </div>`).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee  = Number(store.delivery_fee)  || 0;
  const deliveryFree = Number(store.delivery_free) || 0;
  const isCombine    = deliveryFee === -1;
  const hasFreeDelivery = deliveryFree > 0 && subtotal >= deliveryFree;
  const feeToCharge  = isCombine ? 0 : (hasFreeDelivery ? 0 : deliveryFee);
  const total        = subtotal + feeToCharge;

  if (footer) {
    let deliveryLine = '';
    if (isCombine) {
      deliveryLine = '<div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>Entrega</span><span style="color:#f59e0b">A combinar</span></div>';
    } else if (deliveryFee > 0) {
      deliveryLine = hasFreeDelivery
        ? `<div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>Entrega</span><span style="color:#22c55e">Grátis 🎉</span></div>`
        : `<div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>Entrega</span><span>${fmt(deliveryFee)}</span></div>`;
    }
    footer.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
      ${deliveryLine}
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
        <span>Total</span><span>${isCombine ? fmt(subtotal) : fmt(total)}</span>
      </div>
      ${deliveryFree > 0 && !hasFreeDelivery && !isCombine
        ? `<div style="font-size:0.75rem;color:#94a3b8;text-align:center;margin-top:8px">Faltam ${fmt(deliveryFree - subtotal)} para frete grátis!</div>`
        : ''}`;
  }
}

async function checkout() {
  const nameInput = document.getElementById('customer-name');
  const name      = nameInput?.value.trim() || '';
  if (!name) { alert('Por favor, informe seu nome para continuar.'); nameInput?.focus(); return; }

  const wa = (store.whatsapp || '').replace(/\D/g, '');
  if (!wa) { alert('Esta loja ainda não tem WhatsApp configurado.'); return; }

  const btn = document.getElementById('whatsapp-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const itemsText = cart.map(i =>
      `• ${i.qty}${i.unit==='kg'?'kg':'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`
    ).join('\n');

    const msg = `🛒 *Novo Pedido — ${store.name}*\n\n*Cliente:* ${name}\n\n*Itens:*\n${itemsText}\n\n*Subtotal:* ${UIRender.fmtPrice(subtotal)}\n\n_Enviado via EncartShop_`;

    // Salva pedido no banco (não bloqueia o fluxo se falhar)
    try {
      await EncartAPI.OrderAPI.create(STORE_ID, {
        customer_name: name,
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
        total: subtotal,
        status: 'novo'
      });
    } catch (orderErr) {
      console.warn('[Loja] Pedido não salvo no banco:', orderErr);
      // Não bloqueia — cliente ainda vai pelo WhatsApp
    }

    cart = []; _saveCart(); updateCartUI(); closeCart();
    window.location.href = `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar Pedido pelo WhatsApp'; }
  }
}

function _saveCart() {
  try { localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); } catch { /* ignora */ }
}
function _loadCart() {
  try { return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); } catch { return []; }
}
