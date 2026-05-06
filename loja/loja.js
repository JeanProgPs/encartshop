/**
 * EncartShop — Loja Pública v5
 * Ultra-resiliente e compatível com Vercel Clean URLs
 */

// ── Detecta loja via URL ──────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const URL_STORE_ID   = urlParams.get('s')    || null;
const URL_STORE_SLUG = urlParams.get('slug') || _getSlugFromPath();

function _getSlugFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const lojaIdx = parts.indexOf('loja');
  return (lojaIdx !== -1 && parts[lojaIdx + 1]) ? parts[lojaIdx + 1] : null;
}

// ── Estado global ─────────────────────────────────────────────
let cart          = [];
let store         = {};
let allProducts   = [];
let activeCategory = 'Todos';
let STORE_ID      = URL_STORE_ID;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[EncartShop] Iniciando vitrine...');
  const storeNameEl = document.getElementById('header-store-name');

  try {
    // 0. Diagnóstico Inicial
    if (!window.sb) {
      throw new Error('Conexão com o banco não inicializada.');
    }

    // 1. Resolve a loja (por slug ou ID)
    if (!STORE_ID && URL_STORE_SLUG) {
      console.log('[EncartShop] Buscando loja por slug:', URL_STORE_SLUG);
      const found = await EncartAPI.StoreAPI.getBySlug(URL_STORE_SLUG);
      if (found) { 
        store = found; 
        STORE_ID = found.id; 
      }
    }

    if (STORE_ID && !store.id) {
      console.log('[EncartShop] Buscando loja por ID:', STORE_ID);
      const found = await EncartAPI.StoreAPI.getById(STORE_ID);
      if (found) store = found;
    }

    // 2. Fallback: primeira loja do banco (para demonstração)
    if (!STORE_ID && !URL_STORE_SLUG) {
      console.log('[EncartShop] Sem parâmetros, buscando fallback...');
      const all = await EncartAPI.StoreAPI.getAll();
      if (all && all.length > 0) { 
        store = all[0]; 
        STORE_ID = all[0].id; 
      }
    }

    // 3. Validação
    if (!STORE_ID || !store || !store.name) {
      throw new Error('Link de loja inválido ou loja não encontrada.');
    }

    // 4. Status Pendente
    if (store.status === 'pending') {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;font-family:Inter,sans-serif;background:#0a0a1a;color:#f0f0f5;">
          <div style="font-size:3rem;margin-bottom:16px;">🚀</div>
          <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:8px;">Loja em Ativação</h2>
          <p style="color:#8888aa;max-width:320px;line-height:1.6;">Esta loja foi criada mas ainda não foi ativada. Se você é o dono, acesse o painel e realize o pagamento.</p>
          <a href="/admin" style="margin-top:24px; color:var(--brand); font-weight:600; text-decoration:none;">Acessar Painel →</a>
        </div>`;
      return;
    }

    // 5. Carrega Carrinho
    cart = _loadCart();

    // 6. Aplica Identidade
    if (store.color) {
      document.documentElement.style.setProperty('--accent', store.color);
      document.documentElement.style.setProperty('--brand', store.color);
    }
    
    // 7. Renderiza UI
    loadStoreUI();
    await loadProducts();
    updateCartUI();

    console.info('[EncartShop] Vitrine pronta:', store.name);

  } catch (err) {
    console.error('[EncartShop] Erro:', err);
    if (storeNameEl) storeNameEl.textContent = 'Erro ao carregar';
    
    const area = document.getElementById('products-area');
    if (area) {
      area.innerHTML = `
        <div style="text-align:center; padding:60px 20px; color:#e74c3c;">
          <div style="font-size:3rem; margin-bottom:16px;">⚠️</div>
          <h3 style="font-weight:700; margin-bottom:8px;">Ops! Algo deu errado.</h3>
          <p style="font-size:0.9rem; opacity:0.8; max-width:400px; margin:0 auto;">
            ${err.message || 'Erro inesperado.'}<br><br>
            Tente recarregar a página ou verifique o link.
          </p>
        </div>`;
    }
  }
});

// ── UI da Loja ────────────────────────────────────────────────
function loadStoreUI() {
  document.title = store.name + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name);
  setEl('header-hours',      store.hours || '');
  setEl('store-banner',      store.banner_text || store.bannerText || '🔥 Ofertas da Semana!');

  const logoEl = document.getElementById('store-logo-icon');
  if (logoEl && store.color) {
     logoEl.style.background = `linear-gradient(135deg, ${store.color} 0%, rgba(0,0,0,0.3) 100%)`;
  }

  const infoBar = document.getElementById('store-info-bar');
  if (infoBar) {
    const parts = [];
    if (store.address) parts.push(`📍 <strong>${store.address}</strong>`);
    if (store.hours)   parts.push(`🕐 ${store.hours}`);
    const fee  = store.delivery_fee  || 0;
    const free = store.delivery_free || 0;
    if (fee > 0) {
      parts.push(`🚚 Entrega: <strong>R$ ${Number(fee).toFixed(2).replace('.',',')}</strong>`);
      if (free > 0) parts.push(`🎉 Grátis acima de <strong>R$ ${Number(free).toFixed(2).replace('.',',')}</strong>`);
    } else if (fee === -1) {
      parts.push('🚚 Entrega: <strong>A combinar</strong>');
    } else {
      parts.push('🚚 <strong>Entrega Grátis</strong>');
    }
    infoBar.innerHTML = parts.map(p => `<div class="info-item">${p}</div>`).join('');
  }
}

async function loadProducts() {
  try {
    const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
    allProducts = prods;
    buildCategoryTabs();
    renderProducts();
  } catch (err) {
    console.error('loadProducts erro:', err);
  }
}

function buildCategoryTabs() {
  const cats = ['Todos', ...new Set(allProducts.map(p => p.category))];
  const wrap = document.getElementById('cat-tabs');
  if (!wrap) return;
  wrap.innerHTML = cats.map(c =>
    `<button class="cat-tab ${c === 'Todos' ? 'active' : ''}" onclick="setCategory('${c}', this)">${c}</button>`
  ).join('');
}

function setCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

function renderProducts() {
  const area = document.getElementById('products-area');
  if (!area) return;
  let products = activeCategory === 'Todos' ? allProducts : allProducts.filter(p => p.category === activeCategory);
  if (!products.length) {
    area.innerHTML = UIRender.emptyState('📦', 'Nenhum produto ainda', 'Volte em breve!');
    return;
  }
  if (activeCategory === 'Todos') {
    const promos  = products.filter(p => p.promo_price);
    const regular = products.filter(p => !p.promo_price);
    let html = '';
    if (promos.length) html += `<div class="promo-section"><div class="section-heading">🔥 Promoções</div><div class="product-grid">${promos.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div></div>`;
    const cats = [...new Set(regular.map(p => p.category))];
    cats.forEach(cat => {
      html += `<div class="section-heading">${cat}</div><div class="product-grid">${regular.filter(p => p.category === cat).map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>`;
    });
    area.innerHTML = html;
  } else {
    area.innerHTML = `<div class="product-grid">${products.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>`;
  }
}

// ── Carrinho ──────────────────────────────────────────────────
function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  const price = product.promo_price || product.price;
  const existing = cart.find(c => c.id === id);
  if (existing) { existing.qty += 1; }
  else { cart.push({ id: product.id, name: product.name, price, image: product.image, qty: 1 }); }
  _saveCart(); updateCartUI(); _refreshProductCard(id);
}

function changeQty(id, delta) {
  const idx = cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  _saveCart(); updateCartUI(); _refreshProductCard(id);
  if (!document.getElementById('cart-modal').classList.contains('hidden')) renderCartBody();
}

function _refreshProductCard(id) {
  const p = allProducts.find(x => x.id === id);
  const el = document.getElementById(`prod-${id}`);
  if (!p || !el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = UIRender.productStoreCard(p, _cartQty(p.id));
  el.replaceWith(tmp.firstElementChild);
}

function _cartQty(id) {
  const item = cart.find(c => c.id === id);
  return item ? item.qty : 0;
}

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const elements = ['cart-count', 'header-cart-count'];
  elements.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = total; });
  document.getElementById('cart-bubble')?.classList.toggle('hidden', total === 0);
}

function openCart() { document.getElementById('cart-modal')?.classList.remove('hidden'); renderCartBody(); }
function closeCart() { document.getElementById('cart-modal')?.classList.add('hidden'); }

function renderCartBody() {
  const body = document.getElementById('cart-body');
  const footer = document.getElementById('cart-subtotals');
  if (!body) return;
  if (!cart.length) { body.innerHTML = '<p style="text-align:center;padding:20px;">Carrinho vazio</p>'; if (footer) footer.innerHTML = ''; return; }
  
  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${UIRender.fmtPrice(item.price * item.qty)}</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',+1)">+</button>
      </div>
    </div>`).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  if (footer) footer.innerHTML = `<div class="cart-total-row"><span>Total</span><span>${UIRender.fmtPrice(subtotal)}</span></div>`;
}

async function checkout() {
  if (!cart.length) return;
  const name = document.getElementById('customer-name')?.value.trim();
  if (!name) { showToast('Informe seu nome', 'error'); return; }
  
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cleanWa = (store.whatsapp || '5511999999999').replace(/\D/g, '');
  const text = `🛒 *Novo Pedido — ${store.name}*\n\n*Cliente:* ${name}\n\n*Total: ${UIRender.fmtPrice(subtotal)}*`;
  window.open(`https://wa.me/${cleanWa}?text=${encodeURIComponent(text)}`, '_blank');
}

function _saveCart() { localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); }
function _loadCart() { return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); }

function showToast(msg) { alert(msg); }
