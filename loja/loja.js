/**
 * EncartShop — Loja Pública v4
 * Suporte a slug (/loja/nome-da-loja) e query param (?s=UUID)
 */

// ── Detecta loja via URL ──────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const URL_STORE_ID   = urlParams.get('s')    || null;
const URL_STORE_SLUG = urlParams.get('slug') || _getSlugFromPath();

function _getSlugFromPath() {
  // Detecta /loja/nome-da-loja
  const parts = window.location.pathname.split('/').filter(Boolean);
  // Ex: ['loja', 'mercado-do-joao'] → slug = 'mercado-do-joao'
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

  // 1. Resolve a loja (por slug ou ID)
  if (!STORE_ID && URL_STORE_SLUG) {
    const found = await EncartAPI.StoreAPI.getBySlug(URL_STORE_SLUG);
    if (found) { store = found; STORE_ID = found.id; }
  }

  if (STORE_ID && !store.id) {
    store = await EncartAPI.StoreAPI.getById(STORE_ID) || {};
  }

  // 2. Fallback: primeira loja disponível (conveniência em ambiente de dev)
  if (!STORE_ID) {
    const all = await EncartAPI.StoreAPI.getAll();
    if (all.length) { store = all[0]; STORE_ID = all[0].id; }
  }

  // 3. Loja não encontrada ou inativa
  if (!STORE_ID || !store?.name || store.status === 'pending') {
    const title = store?.status === 'pending' ? 'Loja aguardando ativação' : 'Loja não encontrada';
    const msg   = store?.status === 'pending' 
      ? 'Esta loja foi criada recentemente e está aguardando a ativação do plano. Se você é o dono, acesse o painel administrativo.'
      : 'O link desta loja é inválido ou ela foi removida. Verifique o link com o estabelecimento.';
    
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;font-family:Inter,sans-serif;background:#0a0a1a;color:#f0f0f5;">
        <div style="font-size:3rem;margin-bottom:16px;">🏪</div>
        <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:8px;">${title}</h2>
        <p style="color:#8888aa;max-width:320px;line-height:1.6;">${msg}</p>
        ${store?.status === 'pending' ? '<a href="/admin" style="margin-top:24px; color:var(--brand); font-weight:600; text-decoration:none;">Ir para o Painel →</a>' : ''}
      </div>`;
    return;
  }

  // 4. Carrega carrinho persistido
  cart = _loadCart();

  // 5. Aplica cor e carrega UI
  if (store.color) SevenStorage.applyStoreColor(store.color);
  loadStoreUI();
  await loadProducts();
  updateCartUI();
});

// ── UI da Loja ────────────────────────────────────────────────
function loadStoreUI() {
  document.title = store.name + ' — EncartShop';

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name);
  setEl('header-hours',      store.hours || '');
  setEl('store-banner',      store.banner_text || store.bannerText || '🔥 Confira nossas ofertas desta semana!');

  // Logo dinâmico
  const logoEl = document.getElementById('store-logo-icon');
  if (logoEl && store.name) {
    logoEl.textContent = store.name.charAt(0).toUpperCase();
  }

  const infoBar = document.getElementById('store-info-bar');
  if (infoBar) {
    const parts = [];
    if (store.address) parts.push(`📍 <strong>${store.address}</strong>`);
    if (store.hours)   parts.push(`🕐 ${store.hours}`);

    const fee  = store.delivery_fee  || store.deliveryFee  || 0;
    const free = store.delivery_free || store.deliveryFree || 0;
    if (fee > 0) {
      parts.push(`🚚 Entrega: <strong>R$ ${Number(fee).toFixed(2).replace('.',',')}</strong>`);
      if (free > 0) parts.push(`🎉 Grátis acima de <strong>R$ ${Number(free).toFixed(2).replace('.',',')}</strong>`);
    } else {
      parts.push('🚚 <strong>Entrega Grátis</strong>');
    }
    infoBar.innerHTML = parts.map(p => `<div class="info-item">${p}</div>`).join('');
  }
}

// ── Produtos ──────────────────────────────────────────────────
async function loadProducts() {
  console.log('[EncartShop] Carregando produtos para STORE_ID:', STORE_ID);
  try {
    const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
    console.log('[EncartShop] Produtos carregados:', prods.length);
    allProducts = prods;
    buildCategoryTabs();
    renderProducts();
  } catch (err) {
    console.error('[EncartShop] Erro ao carregar produtos:', err);
    document.getElementById('products-area').innerHTML = '<p style="text-align:center;padding:40px;color:var(--danger);">Erro ao carregar produtos. Verifique o console.</p>';
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

  let products = activeCategory === 'Todos'
    ? allProducts
    : allProducts.filter(p => p.category === activeCategory);

  if (!products.length) {
    area.innerHTML = UIRender.emptyState('📦', 'Nenhum produto ainda', 'Volte em breve para ver nossas novidades!');
    return;
  }

    if (activeCategory === 'Todos') {
      const promos  = products.filter(p => p.promo_price);
      const regular = products.filter(p => !p.promo_price);
      let html = '';
      if (promos.length)
        html += `<div class="promo-section"><div class="section-heading">🔥 Promoções da Semana</div><div class="product-grid">${promos.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div></div>`;
      const cats = [...new Set(regular.map(p => p.category))];
      cats.forEach(cat => {
        html += `<div class="section-heading">${catEmoji(cat)} ${cat}</div><div class="product-grid">${regular.filter(p => p.category === cat).map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>`;
      });
      area.innerHTML = html;
    } else {
      const promos  = products.filter(p => p.promo_price);
      const regular = products.filter(p => !p.promo_price);
      area.innerHTML =
        (promos.length  ? `<div class="section-heading">🔥 Promoções</div><div class="product-grid">${promos.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>` : '') +
        (regular.length ? `<div class="section-heading">📦 Produtos</div><div class="product-grid">${regular.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}</div>` : '');
    }
}

function catEmoji(cat) {
  const map = {
    // Food
    Frutas:'🍎',Verduras:'🥦',Legumes:'🥕',Mercearia:'🛒',Carnes:'🥩','Laticínios':'🥛',Bebidas:'🥤',Limpeza:'🧹',Higiene:'🧼',Padaria:'🍞',Frios:'🧀',
    // Universal Retail
    Moda:'👕',Roupas:'👗',Calçados:'👟',Acessórios:'🕶️',Eletrônicos:'📱',Tecnologia:'💻',Beleza:'💄',Cosméticos:'💅',Saúde:'💊',
    Petshop:'🐶','Pet Shop':'🐱',Brinquedos:'🧸',Papelaria:'📚','Casa & Jardim':'🪴',Ferramentas:'🛠️',Esportes:'🏀',Presentes:'🎁'
  };
  return map[cat] || '📦';
}

// ── Cart Operations ───────────────────────────────────────────
function addToCart(id) {
  const product = allProducts.find(p => p.id === id || p.id === parseInt(id));
  if (!product) return;
  const price   = product.promo_price ? product.promo_price : product.price;
  const existing = cart.find(c => c.id === id || c.id === parseInt(id));
  if (existing) { existing.qty += 1; }
  else { cart.push({ id: product.id, name: product.name, price, image: product.image, unit: product.unit, qty: 1 }); }
  _saveCart();
  updateCartUI();
  _refreshProductCard(product.id);
  const bubble = document.getElementById('cart-bubble');
  if (bubble) { bubble.style.transform = 'scale(1.15)'; setTimeout(() => bubble.style.transform = '', 200); }
  showToast(`${product.name} adicionado! 🛒`, 'success');
}

function changeQty(id, delta) {
  const parsedId = typeof id === 'string' && id.includes('-') ? id : parseInt(id) || id;
  const idx = cart.findIndex(c => c.id === parsedId || c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  _saveCart();
  updateCartUI();
  _refreshProductCard(id);
  const modal = document.getElementById('cart-modal');
  if (modal && !modal.classList.contains('hidden')) renderCartBody();
}

function _refreshProductCard(id) {
  const p  = allProducts.find(x => x.id === id || x.id === parseInt(id));
  const el = document.getElementById(`prod-${id}`);
  if (!p || !el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = UIRender.productStoreCard(p, _cartQty(p.id));
  el.replaceWith(tmp.firstElementChild);
}

function _cartQty(id) {
  const item = cart.find(c => c.id === id || c.id === parseInt(id));
  return item ? item.qty : 0;
}

function updateCartUI() {
  const total  = cart.reduce((s, i) => s + i.qty, 0);
  const bubble  = document.getElementById('cart-bubble');
  const countEl = document.getElementById('cart-count');
  const hCountEl = document.getElementById('header-cart-count');
  const hBtn    = document.getElementById('header-cart-btn');
  if (countEl) countEl.textContent = total;
  if (hCountEl) hCountEl.textContent = total;
  if (bubble) bubble.classList.toggle('hidden', total === 0);
  if (hBtn) hBtn.style.display = total > 0 ? '' : 'none';
}

// ── Cart Modal ────────────────────────────────────────────────
function openCart()  { document.getElementById('cart-modal')?.classList.remove('hidden'); renderCartBody(); }
function closeCart() { document.getElementById('cart-modal')?.classList.add('hidden'); }

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cart-modal')?.addEventListener('click', function(e) { if (e.target === this) closeCart(); });
});

function renderCartBody() {
  const body   = document.getElementById('cart-body');
  const footer = document.getElementById('cart-subtotals');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = UIRender.emptyState('🛒', 'Carrinho vazio', 'Adicione produtos para continuar.');
    if (footer) footer.innerHTML = '';
    return;
  }

  const fmt = v => UIRender.fmtPrice(v);
  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image || 'https://placehold.co/52x52/1a1a2e/888?text=?'}" alt="${item.name}" onerror="this.src='https://placehold.co/52x52/1a1a2e/888?text=?'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',+1)" style="background:rgba(233,69,96,0.2);color:var(--accent);">+</button>
      </div>
    </div>`).join('');

  const subtotal     = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const freeThreshold = store.delivery_free || store.deliveryFree || 0;
  const feeBase       = store.delivery_fee  || store.deliveryFee  || 0;
  const fee           = (feeBase > 0 && subtotal < freeThreshold) ? feeBase : (feeBase === -1 ? -1 : 0);
  const total         = subtotal + (fee > 0 ? fee : 0);

  if (footer) footer.innerHTML = `
    <div class="cart-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${fee === -1
      ? `<div class="cart-row" style="color:var(--accent);"><span>🚚 Entrega</span><span>A combinar</span></div>`
      : (fee > 0
          ? `<div class="cart-row"><span>Taxa de entrega</span><span>${fmt(fee)}</span></div>
             ${freeThreshold > 0 ? `<div class="cart-row" style="color:var(--promo);font-size:0.78rem;">🎉 Faltam ${fmt(freeThreshold - subtotal)} para frete grátis</div>` : ''}`
          : `<div class="cart-row" style="color:var(--success);"><span>✅ Entrega grátis</span><span>R$ 0,00</span></div>`)
    }
    <div class="divider" style="margin:8px 0;"></div>
    <div class="cart-total-row"><span>Total</span><span style="color:var(--accent);">${fmt(total)}</span></div>`;
}

// ── Checkout ──────────────────────────────────────────────────
async function checkout() {
  if (!cart.length) { showToast('Adicione produtos primeiro!', 'error'); return; }
  const name    = document.getElementById('customer-name')?.value.trim();
  const address = document.getElementById('customer-address')?.value.trim();
  if (!name) { document.getElementById('customer-name')?.focus(); showToast('Informe seu nome.', 'error'); return; }

  const subtotal     = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const freeThreshold = store.delivery_free || store.deliveryFree || 0;
  const feeBase       = store.delivery_fee  || store.deliveryFee  || 0;
  const fee           = (feeBase > 0 && subtotal < freeThreshold) ? feeBase : (feeBase === -1 ? -1 : 0);
  const total         = subtotal + (fee > 0 ? fee : 0);

  const btn = document.getElementById('whatsapp-btn');
  if (btn) { btn.textContent = 'Processando...'; btn.disabled = true; }

  await EncartAPI.OrderAPI.create(STORE_ID, {
    customerName: name, address,
    items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    deliveryFee: fee, total,
  });

  if (btn) { btn.textContent = 'Enviar Pedido via WhatsApp 🟢'; btn.disabled = false; }

  const fmt   = v => UIRender.fmtPrice(v);
  const lines = [
    `🛒 *Novo Pedido — ${store.name}*`, ``,
    `*Cliente:* ${name}`,
    address ? `*Endereço:* ${address}` : `*Retirada* no estabelecimento`,
    ``, `*Itens:*`,
    ...cart.map(i => `• ${i.qty}x ${i.name} — ${fmt(i.price * i.qty)}`),
    ``,
    fee === -1 ? `*Entrega:* A combinar` : (fee > 0 ? `*Taxa de entrega:* ${fmt(fee)}` : `*Entrega:* Grátis`),
    `*Total: ${fmt(total)}*`,
    ``, `_Enviado via EncartShop_`,
  ];

  const cleanWa = (store.whatsapp || '5511999999999').replace(/\D/g, '');
  const url     = `https://wa.me/${cleanWa}?text=${encodeURIComponent(lines.join('\n'))}`;

  cart = [];
  _saveCart();
  updateCartUI();
  closeCart();
  renderProducts();

  showToast('Pedido enviado! Abrindo WhatsApp...', 'success');
  setTimeout(() => window.open(url, '_blank'), 800);
}

// ── Carrinho persistido ───────────────────────────────────────
function _saveCart() {
  localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart));
}
function _loadCart() {
  // Tenta chave nova, fallback para chave legada
  return JSON.parse(
    localStorage.getItem(`encart_cart_${STORE_ID}`) ||
    localStorage.getItem(`seven_cart_${STORE_ID}`) ||
    '[]'
  );
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
