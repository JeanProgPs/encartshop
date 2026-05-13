/**
 * EncartShop — Loja Pública
 */

// ── Detecta loja via URL ──────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const STORE_ID_PARAM = urlParams.get('s') || urlParams.get('id');

// ── Estado global ─────────────────────────────────────────────
let cart          = [];
let store         = {};
let allProducts   = [];
let activeCategory = 'Todos';
let STORE_ID      = STORE_ID_PARAM;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[Loja] Iniciando busca para:', STORE_ID_PARAM);
    
    if (!STORE_ID_PARAM) {
        throw new Error('Link da loja inválido. Use encatshop.com/loja?s=NOME-DA-LOJA');
    }

    let storeData = null;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(STORE_ID_PARAM);

    if (isUUID) {
        console.log('[Loja] Buscando por ID (UUID)...');
        storeData = await EncartAPI.StoreAPI.getById(STORE_ID_PARAM);
    } else {
        console.log('[Loja] Buscando por SLUG:', STORE_ID_PARAM);
        storeData = await EncartAPI.StoreAPI.getBySlug(STORE_ID_PARAM);
    }
    
    // Fallback: se não encontrou e não era UUID, tenta busca manual por nome (legado)
    if (!storeData && !isUUID) {
        console.log('[Loja] Fallback: buscando em todas as lojas...');
        const allStores = await EncartAPI.StoreAPI.getAll();
        const slugify = text => (text || '').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
          
        const targetSlug = slugify(STORE_ID_PARAM);
        storeData = allStores.find(s => slugify(s.name) === targetSlug);
    }

    console.log('[Loja] Resultado da busca:', storeData);

    if (!storeData) {
      console.warn('[Loja] Nenhuma loja encontrada para:', STORE_ID_PARAM);
      throw new Error(`Loja "${STORE_ID_PARAM}" não encontrada.`);
    }

    store = storeData;
    STORE_ID = store.id;

    // 2. Verifica status (Ativa vs Pendente vs Bloqueada)
    const subStatus = SubscriptionModule.getStatus(store.expires_at);
    
    if (subStatus.blocked) {
      renderBlockedPage();
      return;
    }

    // Se pendente, permite acesso mas mostra aviso (opcional conforme UX)
    if (store.status === 'pending') {
       console.warn('[Loja] Aviso: Esta loja está com pagamento pendente.');
       _injectPendingBanner();
    }

    // 3. Setup UI
    cart = _loadCart();
    if (store.color) {
      document.documentElement.style.setProperty('--accent', store.color);
      document.documentElement.style.setProperty('--brand', store.color);
    }
    
    loadStoreUI();
    await loadProducts();
    updateCartUI();

  } catch (err) {
    console.error('[Loja] Erro ao carregar:', err);
    EncartHelpers.globalErrorHandler(err, 'Falha ao carregar loja');
    renderErrorPage(err.message);
  }
});

function _injectPendingBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fef3c7; color:#92400e; padding:10px; text-align:center; font-size:0.85rem; font-weight:600; border-bottom:1px solid #fde68a;';
    banner.innerHTML = '⚠️ Esta loja está em modo de demonstração aguardando ativação.';
    document.body.prepend(banner);
}

function renderBlockedPage() {
  document.body.innerHTML = `
    <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px; font-family:sans-serif; background:#f8fafc;">
      <div style="font-size:4rem; margin-bottom:20px;">🏪</div>
      <h1 style="font-size:1.5rem; color:#0f172a; margin-bottom:8px;">Loja Temporariamente Indisponível</h1>
      <p style="color:#64748b; max-width:400px; line-height:1.6;">Esta loja está suspensa ou sua assinatura expirou.</p>
      <a href="/" style="margin-top:24px; color:#4f46e5; text-decoration:none; font-weight:600;">← Voltar ao EncartShop</a>
    </div>`;
}

function renderErrorPage(msg) {
  document.body.innerHTML = `
    <div style="text-align:center; padding:100px 24px; font-family:sans-serif;">
      <div style="font-size:3rem; margin-bottom:20px;">⚠️</div>
      <h1 style="font-size:1.2rem; color:#1e293b;">Não conseguimos carregar a loja</h1>
      <p style="color:#64748b; margin-top:10px;">${msg}</p>
      <a href="/" style="display:inline-block; margin-top:24px; color:#4f46e5; text-decoration:none; font-weight:600;">Voltar ao Início</a>
    </div>`;
}

function loadStoreUI() {
  document.title = store.name + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name);
  setEl('store-banner',      store.banner_text || 'Confira nossas ofertas!');
  setEl('header-hours',      store.hours || '');
}

async function loadProducts() {
  const area = document.getElementById('products-area');
  if (window.UIComponents && window.UIComponents.renderSkeleton) {
    UIComponents.renderSkeleton('products-area', 6, 'product');
  }

  const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
  allProducts = prods || [];
  
  renderCategoryTabs();
  renderProducts();
}

function renderCategoryTabs() {
  const tabsWrap = document.getElementById('cat-tabs');
  if (!tabsWrap) return;

  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  const hasPromo = allProducts.some(p => p.promo_price);
  
  if (categories.length === 0 && !hasPromo) {
    document.getElementById('cat-tabs-area').classList.add('hidden');
    return;
  }

  document.getElementById('cat-tabs-area').classList.remove('hidden');
  
  const html = [];
  html.push(`<button class="cat-tab ${activeCategory === 'Todos' ? 'active' : ''}" onclick="setCategory('Todos')">Todos</button>`);
  
  if (hasPromo) {
    html.push(`<button class="cat-tab ${activeCategory === 'Ofertas' ? 'active' : ''}" onclick="setCategory('Ofertas')" style="color:#ef4444; border-color:#ef4444;">🔥 Ofertas</button>`);
  }
  
  categories.forEach(cat => {
    html.push(`<button class="cat-tab ${activeCategory === cat ? 'active' : ''}" onclick="setCategory('${cat}')">${cat}</button>`);
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
    area.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:#666;">Nenhum produto encontrado.</div>';
    return;
  }

  let filtered = [];
  if (activeCategory === 'Todos') filtered = allProducts;
  else if (activeCategory === 'Ofertas') filtered = allProducts.filter(p => !!p.promo_price);
  else filtered = allProducts.filter(p => p.category === activeCategory);

  area.innerHTML = filtered.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('');
}

// ── Carrinho ──────────────────────────────────────────
function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  
  const isKg = product.unit?.toLowerCase() === 'kg';
  const step = isKg ? 0.5 : 1;
  const price = product.promo_price || product.price;
  
  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty += step;
  } else {
    cart.push({ 
      id: product.id, 
      name: product.name, 
      price, 
      image: product.image, 
      unit: product.unit, 
      qty: step 
    });
  }

  _saveCart();
  updateCartUI();
  _refreshProductCard(id);
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;

  const isKg = item.unit?.toLowerCase() === 'kg';
  const step = isKg ? 0.5 : 1;
  item.qty += (delta * step);
  if (isKg) item.qty = Math.round(item.qty * 100) / 100;

  if (item.qty <= 0) {
    const idx = cart.indexOf(item);
    cart.splice(idx, 1);
  }

  _saveCart();
  updateCartUI();
  _refreshProductCard(id);
  if (!document.getElementById('cart-modal').classList.contains('hidden')) renderCartBody();
}

function _refreshProductCard(id) {
  const p = allProducts.find(x => x.id === id);
  const el = document.getElementById(`prod-${id}`);
  if (p && el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = UIRender.productStoreCard(p, _cartQty(p.id));
    el.replaceWith(tmp.firstElementChild);
  }
}

function _cartQty(id) {
  const item = cart.find(c => c.id === id);
  return item ? item.qty : 0;
}

function updateCartUI() {
  const totalItems = cart.reduce((acc, item) => acc + (item.unit === 'kg' ? 1 : item.qty), 0);
  const c1 = document.getElementById('cart-count');
  const c2 = document.getElementById('header-cart-count');
  if (c1) c1.textContent = Math.floor(totalItems);
  if (c2) c2.textContent = Math.floor(totalItems);
  
  document.getElementById('cart-bubble')?.classList.toggle('hidden', cart.length === 0);
  document.getElementById('header-cart-btn')?.classList.toggle('hidden', cart.length === 0);
}

function openCart() {
  document.getElementById('cart-modal')?.classList.remove('hidden');
  renderCartBody();
}

function closeCart() {
  document.getElementById('cart-modal')?.classList.add('hidden');
}

function renderCartBody() {
  const body = document.getElementById('cart-body');
  const footer = document.getElementById('cart-subtotals');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">Seu carrinho está vazio.</p>';
    if (footer) footer.innerHTML = '';
    return;
  }

  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div style="font-weight:600;">${item.name}</div>
        <div style="color:var(--accent);font-size:0.9rem;">${UIRender.fmtPrice(item.price * item.qty)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span style="min-width:40px;text-align:center;">${item.qty}${item.unit==='kg'?'kg':'x'}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
      </div>
    </div>
  `).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>Subtotal</span><span>${UIRender.fmtPrice(subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;margin-top:10px;border-top:1px solid #eee;padding-top:10px;">
        <span>Total</span><span>${UIRender.fmtPrice(subtotal)}</span>
      </div>
    `;
  }
}

async function checkout() {
  const name = document.getElementById('customer-name')?.value.trim();
  if (!name) { 
    if (window.UIComponents && window.UIComponents.showToast) {
       UIComponents.showToast('Informe seu nome para o pedido.', 'error'); 
    } else {
       alert('Informe seu nome para o pedido.');
    }
    return; 
  }

  const wa = (store.whatsapp || '').replace(/\D/g, '');
  if (!wa) { 
    if (window.UIComponents && window.UIComponents.showToast) {
       UIComponents.showToast('Loja sem WhatsApp configurado.', 'error'); 
    } else {
       alert('Loja sem WhatsApp configurado.');
    }
    return; 
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemsText = cart.map(i => `• ${i.qty}${i.unit==='kg'?'kg':'x'} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`).join('\n');
  const message = `🛒 *Novo Pedido - ${store.name}*\n\n*Cliente:* ${name}\n\n*Itens:*\n${itemsText}\n\n*Total:* ${UIRender.fmtPrice(subtotal)}\n\n_Enviado via EncartShop_`;
  
  window.open(`https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(message)}`, '_blank');
}

function _saveCart() { 
  localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); 
}

function _loadCart() { 
  try {
    return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); 
  } catch(e) {
    return [];
  }
}
