/**
 * EncartShop — Loja Pública v6
 * Resiliente - Modo compatibilidade (sem dependência de coluna slug)
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

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[EncartShop] Iniciando vitrine...');
  const storeNameEl = document.getElementById('header-store-name');

  try {
    if (!window.sb) throw new Error('Erro de conexão com o banco.');

    // 1. Resolve a loja por ID
    if (STORE_ID) {
      console.log('[EncartShop] Buscando loja por ID:', STORE_ID);
      const found = await EncartAPI.StoreAPI.getById(STORE_ID);
      if (found) store = found;
    }

    // 2. Fallback: se não houver ID na URL, pega a primeira loja disponível
    if (!STORE_ID || !store.id) {
      console.log('[EncartShop] Sem loja definida, buscando fallback...');
      const all = await EncartAPI.StoreAPI.getAll();
      if (all && all.length > 0) {
        store = all[0];
        STORE_ID = all[0].id;
      }
    }

    // 3. Validação final
    if (!STORE_ID || !store || !store.name) {
      throw new Error('Link de loja inválido.');
    }

    // 4. Verificação de ativação
    if (store.status === 'pending') {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;font-family:Inter,sans-serif;background:#0a0a1a;color:#f0f0f5;">
          <div style="font-size:3rem;margin-bottom:16px;">🚀</div>
          <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:8px;">Loja em Ativação</h2>
          <p style="color:#8888aa;max-width:320px;line-height:1.6;">Esta loja ainda não foi ativada. Se você é o dono, acesse o painel administrativo.</p>
          <a href="/admin" style="margin-top:24px; color:var(--brand); font-weight:600; text-decoration:none;">Painel Admin →</a>
        </div>`;
      return;
    }

    // 5. Inicializa UI e Dados
    cart = _loadCart();
    if (store.color) {
      document.documentElement.style.setProperty('--accent', store.color);
      document.documentElement.style.setProperty('--brand', store.color);
    }
    
    loadStoreUI();
    await loadProducts();
    updateCartUI();

    console.info('[EncartShop] Vitrine carregada:', store.name);

  } catch (err) {
    console.error('[EncartShop] Erro:', err);
    if (storeNameEl) storeNameEl.textContent = 'Erro';
    const area = document.getElementById('products-area');
    if (area) area.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#e74c3c;">⚠️ ${err.message}</div>`;
  }
});

// ── UI ────────────────────────────────────────────────────────
function loadStoreUI() {
  document.title = store.name + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name);
  setEl('header-hours',      store.hours || '');
  setEl('store-banner',      store.banner_text || 'Confira nossas ofertas!');

  const logoEl = document.getElementById('store-logo-icon');
  if (logoEl && store.color) {
     logoEl.style.background = `linear-gradient(135deg, ${store.color} 0%, rgba(0,0,0,0.3) 100%)`;
  }

  const infoBar = document.getElementById('store-info-bar');
  if (infoBar) {
    const parts = [];
    if (store.address) parts.push(`📍 <strong>${store.address}</strong>`);
    const fee = store.delivery_fee || 0;
    parts.push(fee > 0 ? `🚚 Entrega: R$ ${Number(fee).toFixed(2).replace('.',',')}` : '🚚 Entrega Grátis');
    infoBar.innerHTML = parts.map(p => `<div class="info-item">${p}</div>`).join('');
  }
}

async function loadProducts() {
  try {
    const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
    allProducts = prods;
    renderProducts();
  } catch (err) { console.error(err); }
}

function renderProducts() {
  const area = document.getElementById('products-area');
  if (!area) return;
  if (!allProducts.length) {
    area.innerHTML = UIRender.emptyState('📦', 'Nenhum produto', 'Volte em breve!');
    return;
  }
  area.innerHTML = `<div class="product-grid">${allProducts.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>`;
}

function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  const existing = cart.find(c => c.id === id);
  if (existing) { existing.qty += 1; }
  else { cart.push({ id: product.id, name: product.name, price: product.promo_price || product.price, qty: 1 }); }
  _saveCart(); updateCartUI(); _refreshProductCard(id);
}

function changeQty(id, delta) {
  const idx = cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  _saveCart(); updateCartUI(); _refreshProductCard(id);
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
  const total = cart.reduce((s, i) => s + i.qty, 0);
  ['cart-count', 'header-cart-count'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = total; });
  document.getElementById('cart-bubble')?.classList.toggle('hidden', total === 0);
}

function _saveCart() { localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); }
function _loadCart() { return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); }
