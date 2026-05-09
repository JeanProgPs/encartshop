/**
 * EncartShop — Loja Pública v8
 * Refinamento: Incremento de 100g para Kg e melhorias no Carrinho
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
  try {
    if (!window.sb) throw new Error('Conexão com o banco falhou.');

    if (STORE_ID) {
      // Verifica se é um UUID
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(STORE_ID);
      
      if (isUUID) {
        store = await EncartAPI.StoreAPI.getById(STORE_ID) || {};
      } else {
        // Se for um slug (nome da loja), busca todas e tenta encontrar match
        const allStores = await EncartAPI.StoreAPI.getAll();
        const slugify = text => (text || '').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');
          
        store = allStores.find(s => slugify(s.name) === slugify(STORE_ID)) || {};
        if (store && store.id) {
          STORE_ID = store.id; // Atualiza global para os próximos requests
        }
      }
    }

    if (!STORE_ID || !store.id) {
      const all = await EncartAPI.StoreAPI.getAll();
      if (all && all.length > 0) { store = all[0]; STORE_ID = all[0].id; }
    }

    if (!STORE_ID) throw new Error('Loja não encontrada.');

    if (store.status === 'pending') {
      document.body.innerHTML = `<div style="text-align:center;padding:100px 20px;"><h2>Loja em Ativação 🚀</h2><a href="/admin">Ir para o Painel</a></div>`;
      return;
    }

    cart = _loadCart();
    if (store.color) {
      document.documentElement.style.setProperty('--accent', store.color);
      document.documentElement.style.setProperty('--brand', store.color);
    }
    
    loadStoreUI();
    await loadProducts();
    updateCartUI();
  } catch (err) {
    document.body.innerHTML = `<div style="text-align:center;padding:100px 20px;">⚠️ ${err.message}</div>`;
  }
});

function loadStoreUI() {
  document.title = store.name + ' — EncartShop';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('header-store-name', store.name);
  setEl('header-hours',      store.hours || '');
  setEl('store-banner',      store.banner_text || 'Ofertas da Semana!');

  const infoBar = document.getElementById('store-info-bar');
  if (infoBar) {
    const parts = [];
    if (store.address) parts.push(`📍 <strong>${store.address}</strong>`);
    
    const fee = store.delivery_fee ?? 0;
    if (fee === -1) {
      parts.push('🚚 <strong>Entrega a combinar</strong>');
    } else if (fee > 0) {
      parts.push(`🚚 Entrega: <strong>R$ ${Number(fee).toFixed(2).replace('.',',')}</strong>`);
    } else {
      parts.push('🚚 <strong>Entrega Grátis</strong>');
    }
    infoBar.innerHTML = parts.map(p => `<div class="info-item">${p}</div>`).join('');
  }
}

async function loadProducts() {
  const prods = await EncartAPI.ProductAPI.getActiveByStore(STORE_ID);
  allProducts = prods;
  renderCategoryTabs();
  renderProducts();
}

function renderCategoryTabs() {
  const tabsWrap = document.getElementById('cat-tabs');
  if (!tabsWrap) return;

  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  
  if (categories.length === 0) {
    tabsWrap.parentElement.classList.add('hidden');
    return;
  }

  tabsWrap.parentElement.classList.remove('hidden');
  const html = [
    `<button class="cat-tab ${activeCategory === 'Todos' ? 'active' : ''}" onclick="setCategory('Todos')">Todos</button>`,
    ...categories.map(cat => `
      <button class="cat-tab ${activeCategory === cat ? 'active' : ''}" onclick="setCategory('${cat}')">${cat}</button>
    `)
  ].join('');
  
  tabsWrap.innerHTML = html;
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderProducts();
  
  // Se for "Todos", sobe pro topo, senão tenta scrollar pra seção
  if (cat === 'Todos') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    const el = document.getElementById(`cat-sec-${cat}`);
    if (el) {
      const top = el.offsetTop - 120; // Compensar header + tabs
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }
}

function renderProducts() {
  const area = document.getElementById('products-area');
  if (!area) return;

  if (!allProducts.length) {
    area.innerHTML = UIRender.emptyState('📦', 'Nenhum produto', 'Volte em breve!');
    return;
  }

  // Filtragem
  const filtered = activeCategory === 'Todos' 
    ? allProducts 
    : allProducts.filter(p => p.category === activeCategory);

  // Agrupamento (sempre agrupa se for "Todos")
  if (activeCategory === 'Todos') {
    const groups = {};
    filtered.forEach(p => {
      const cat = p.category || 'Diversos';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    area.innerHTML = Object.entries(groups).map(([cat, prods]) => `
      <div class="category-section" id="cat-sec-${cat}">
        <div class="section-heading">${cat}</div>
        <div class="product-grid">
          ${prods.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}
        </div>
      </div>
    `).join('');
  } else {
    area.innerHTML = `
      <div class="category-section">
        <div class="section-heading">${activeCategory}</div>
        <div class="product-grid">
          ${filtered.map(p => UIRender.productStoreCard(p, _cartQty(p.id))).join('')}
        </div>
      </div>
    `;
  }
}

// ── Carrinho Refinado ──────────────────────────────────────────
function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  
  // Incremento: 100g para Kg, 1un para outros
  const isKg = product.unit?.toLowerCase() === 'kg';
  const step = isKg ? 0.1 : 1;
  const price = product.promo_price || product.price;
  
  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty += step;
  } else {
    cart.push({ id: product.id, name: product.name, price, image: product.image, unit: product.unit, qty: step });
  }

  _saveCart();
  updateCartUI();
  _refreshProductCard(id);
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;

  const isKg = item.unit?.toLowerCase() === 'kg';
  const step = isKg ? 0.1 : 1;
  
  item.qty += (delta * step);
  // Arredonda para evitar imprecisões de float (ex: 0.300000000004)
  if (isKg) item.qty = Math.round(item.qty * 10) / 10;

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
  const countEl = document.getElementById('cart-count');
  const hCountEl = document.getElementById('header-cart-count');
  const totalItems = cart.length; // Conta quantos produtos diferentes tem
  
  if (countEl) countEl.textContent = totalItems;
  if (hCountEl) hCountEl.textContent = totalItems;
  
  document.getElementById('cart-bubble')?.classList.toggle('hidden', totalItems === 0);
  const hBtn = document.getElementById('header-cart-btn');
  if (hBtn) hBtn.style.display = totalItems > 0 ? '' : 'none';
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
    body.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted);">Seu carrinho está vazio.</p>';
    if (footer) footer.innerHTML = '';
    return;
  }

  body.innerHTML = cart.map(item => {
    const isKg = item.unit?.toLowerCase() === 'kg';
    const qtyLabel = isKg ? `${item.qty.toFixed(1).replace('.',',')} kg` : `${item.qty}x`;
    return `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${UIRender.fmtPrice(item.price * item.qty)}</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span class="qty-num" style="min-width:65px;">${qtyLabel}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
      </div>
    </div>`;
  }).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const feeBase = store.delivery_fee ?? 0;
  const freeThreshold = store.delivery_free || 0;
  
  let fee = 0;
  let feeText = 'Grátis';
  
  if (feeBase === -1) {
    feeText = 'A combinar';
  } else if (feeBase > 0) {
    if (subtotal >= freeThreshold && freeThreshold > 0) {
      feeText = 'Grátis';
    } else {
      feeText = UIRender.fmtPrice(feeBase);
      fee = feeBase;
    }
  }

  if (footer) {
    footer.innerHTML = `
      <div class="cart-row"><span>Subtotal</span><span>${UIRender.fmtPrice(subtotal)}</span></div>
      <div class="cart-row"><span>Entrega</span><span style="color:var(--accent);">${feeText}</span></div>
      <div class="cart-total-row" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
        <span>Total</span><span>${UIRender.fmtPrice(subtotal + fee)}</span>
      </div>
    `;
  }
}

async function checkout() {
  const name = document.getElementById('customer-name')?.value.trim();
  if (!name) { alert('Informe seu nome para o pedido.'); return; }

  const wa = (store.whatsapp || '').replace(/\D/g, '');
  if (!wa) {
    alert('Esta loja ainda não configurou um número de WhatsApp para receber pedidos.');
    return;
  }

  const btn = document.getElementById('whatsapp-btn');
  const originalContent = btn.innerHTML;
  
  try {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const feeBase = store.delivery_fee ?? 0;
    const feeText = feeBase === -1 ? 'A combinar' : (subtotal >= (store.delivery_free || 0) && (store.delivery_free || 0) > 0 ? 'Grátis' : UIRender.fmtPrice(feeBase));
    
    const itemsText = cart.map(i => {
      const q = i.unit?.toLowerCase() === 'kg' ? i.qty.toFixed(1).replace('.',',') + 'kg' : i.qty + 'x';
      return `• ${q} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`;
    }).join('\n');

    const total = subtotal + (feeBase > 0 && feeText !== 'Grátis' ? feeBase : 0);
    const message = `🛒 *Novo Pedido - ${store.name}*\n\n*Cliente:* ${name}\n\n*Itens:*\n${itemsText}\n\n*Entrega:* ${feeText}\n*Total:* ${UIRender.fmtPrice(total)}\n\n_Enviado via EncartShop_`;
    const waUrl = `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(message)}`;

    // 1. Prepara os dados para o banco
    const orderData = {
      customer_name: name,
      address: document.getElementById('customer-address')?.value.trim() || '',
      items: cart,
      total: total,
      status: 'novo',
      created_at: new Date().toISOString()
    };

    // 2. Gerencia o salvamento e o redirecionamento
    btn.disabled = true;
    btn.innerHTML = '<span>🚀 Gravando pedido...</span>';

    try {
      // Usamos store.id que é o ID real da loja no banco
      if (!store.id) throw new Error('ID da loja não encontrado. Tente recarregar a página.');
      
      await OrderModule.create(store.id, orderData);
      console.log("Pedido salvo no banco com sucesso.");
      
      // Limpa o carrinho
      cart = [];
      _saveCart();
      updateCartUI();
      closeCart();

      // Redireciona para o WhatsApp
      window.location.href = waUrl;
    } catch (dbErr) {
      console.error("Erro ao salvar pedido no banco:", dbErr);
      const msg = dbErr.message || (typeof dbErr === 'string' ? dbErr : JSON.stringify(dbErr));
      alert('⚠️ O pedido foi enviado ao WhatsApp, mas NÃO pôde ser salvo no painel.\n\nMotivo: ' + msg);
      
      // Mesmo com erro no banco, tenta enviar para o WhatsApp
      window.location.href = waUrl;
    }

  } catch (err) {
    console.error("Erro no checkout:", err);
    alert('Erro crítico no checkout: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

function _saveCart() { localStorage.setItem(`encart_cart_${STORE_ID}`, JSON.stringify(cart)); }
function _loadCart() { return JSON.parse(localStorage.getItem(`encart_cart_${STORE_ID}`) || '[]'); }
