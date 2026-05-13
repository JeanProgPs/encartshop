/**
 * EncartShop Pro — Public Store Engine
 * Modular, Robust & Conversion Focused.
 */

const StoreApp = (() => {
  // ── State ───────────────────────────────────────────────────
  let state = {
    store: null,
    products: [],
    cart: [],
    activeCategory: 'Todos',
    searchQuery: '',
    isLoading: true,
    storeIdParam: new URLSearchParams(window.location.search).get('s') || new URLSearchParams(window.location.search).get('id')
  };

  // ── Initialization ──────────────────────────────────────────
  async function init() {
    try {
      console.log('[StoreApp] Booting...');
      
      if (!state.storeIdParam) {
        throw new Error('Link da loja inválido. Use encatshop.com/loja?s=NOME-DA-LOJA');
      }

      await loadStoreData();
      
      if (state.store) {
        setupUI();
        await loadProducts();
        loadCartFromStorage();
        render();
        attachEventListeners();
      }
      
    } catch (err) {
      console.error('[StoreApp] Boot failed:', err);
      renderError(err.message);
    } finally {
      state.isLoading = false;
    }
  }

  // ── Data Loading ────────────────────────────────────────────
  async function loadStoreData() {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.storeIdParam);
    let data = isUUID 
      ? await EncartAPI.StoreAPI.getById(state.storeIdParam)
      : await EncartAPI.StoreAPI.getBySlug(state.storeIdParam);

    if (!data) {
        // Fallback Legado
        const all = await EncartAPI.StoreAPI.getAll();
        const slugify = text => (text || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
        const target = slugify(state.storeIdParam);
        data = all.find(s => slugify(s.name) === target);
    }

    if (!data) throw new Error('Loja não encontrada.');
    
    // Check Status
    const sub = SubscriptionModule.getStatus(data.expires_at, data.status);
    if (sub.blocked) { renderBlocked(); return; }
    
    if (data.status === 'pending') {
      const user = await AuthService.getUser();
      if (!user || user.id !== data.user_id) {
         renderPending();
         return;
      }
      _injectAdminBanner();
    }

    state.store = data;
  }

  async function loadProducts() {
    const data = await EncartAPI.ProductAPI.getActiveByStore(state.store.id);
    state.products = data || [];
  }

  // ── UI Setup ────────────────────────────────────────────────
  function setupUI() {
    document.title = `${state.store.name} | EncartShop`;
    
    // Apply Brand Color
    if (state.store.color) {
      document.documentElement.style.setProperty('--brand', state.store.color);
      document.documentElement.style.setProperty('--brand-light', `${state.store.color}15`);
      document.documentElement.style.setProperty('--shadow-brand', `0 10px 25px -5px ${state.store.color}33`);
    }

    const headerName = document.getElementById('header-store-name');
    if (headerName) headerName.textContent = state.store.name;

    const trustCard = document.getElementById('store-trust-card');
    if (trustCard) {
      trustCard.classList.remove('skeleton');
      trustCard.style.height = 'auto';
      trustCard.innerHTML = UIRender.storeTrustCard(state.store);
    }
  }

  function attachEventListeners() {
    const searchInput = document.getElementById('store-search');
    if (searchInput) {
      searchInput.addEventListener('input', EncartHelpers.debounce((e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderProducts();
      }, 300));
    }
  }

  // ── Cart Logic ──────────────────────────────────────────────
  function addToCart(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    const isKg = product.unit?.toLowerCase() === 'kg';
    const step = isKg ? 0.5 : 1;
    const price = product.promo_price || product.price;

    const existing = state.cart.find(c => c.id === id);
    if (existing) {
      existing.qty += step;
    } else {
      state.cart.push({ ...product, price, qty: step });
    }

    saveCartToStorage();
    updateCartUI();
    _refreshProductCard(id);
    
    if (window.UIComponents?.showToast) {
       UIComponents.showToast(`${product.name} adicionado!`, 'success');
    }
  }

  function changeQty(id, delta) {
    const item = state.cart.find(c => c.id === id);
    if (!item) return;

    const isKg = item.unit?.toLowerCase() === 'kg';
    const step = isKg ? 0.5 : 1;
    
    item.qty += (delta * step);
    if (isKg) item.qty = Math.round(item.qty * 100) / 100;

    if (item.qty <= 0) {
      state.cart = state.cart.filter(c => c.id !== id);
    }

    saveCartToStorage();
    updateCartUI();
    _refreshProductCard(id);
    renderCartDrawer();
  }

  function updateCartUI() {
    const totalItems = state.cart.reduce((acc, i) => acc + (i.unit?.toLowerCase() === 'kg' ? 1 : i.qty), 0);
    const subtotal = state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
    
    const count = Math.floor(totalItems);
    const hasItems = state.cart.length > 0;

    // Header Badge
    const badge = document.getElementById('header-cart-badge');
    const btn = document.getElementById('header-cart-btn');
    if (badge) badge.textContent = count;
    if (btn) btn.classList.toggle('hidden', !hasItems);

    // Sticky Bar
    const cartBar = document.getElementById('cart-bar');
    const countText = document.getElementById('cart-count-text');
    const totalPreview = document.getElementById('cart-total-preview');
    
    if (cartBar) cartBar.classList.toggle('hidden', !hasItems);
    if (countText) countText.textContent = `${count} ${count === 1 ? 'item' : 'itens'} no pedido`;
    if (totalPreview) totalPreview.textContent = UIRender.fmtPrice(subtotal);
  }

  // ── Rendering ───────────────────────────────────────────────
  function render() {
    renderCategoryTabs();
    renderProducts();
  }

  function renderCategoryTabs() {
    const tabsArea = document.getElementById('cat-tabs-area');
    const tabsWrap = document.getElementById('cat-tabs');
    if (!tabsWrap) return;

    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    const hasPromo = state.products.some(p => p.promo_price);
    
    if (categories.length === 0 && !hasPromo) {
      tabsArea.classList.add('hidden');
      return;
    }

    tabsArea.classList.remove('hidden');
    let html = `<button class="cat-pill ${state.activeCategory === 'Todos' ? 'active' : ''}" onclick="StoreApp.setCategory('Todos')">Todos</button>`;
    
    if (hasPromo) {
      html += `<button class="cat-pill ${state.activeCategory === 'Ofertas' ? 'active' : ''}" onclick="StoreApp.setCategory('Ofertas')">🔥 Ofertas</button>`;
    }

    categories.forEach(cat => {
      html += `<button class="cat-pill ${state.activeCategory === cat ? 'active' : ''}" onclick="StoreApp.setCategory('${cat}')">${cat}</button>`;
    });

    tabsWrap.innerHTML = html;
  }

  function renderProducts() {
    const area = document.getElementById('products-area');
    if (!area) return;

    let filtered = state.products;
    
    // Category Filter
    if (state.activeCategory === 'Ofertas') {
      filtered = filtered.filter(p => !!p.promo_price);
    } else if (state.activeCategory !== 'Todos') {
      filtered = filtered.filter(p => p.category === state.activeCategory);
    }

    // Search Filter
    if (state.searchQuery) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(state.searchQuery));
    }

    if (filtered.length === 0) {
      area.innerHTML = UIRender.emptyState('🔍', 'Nenhum produto encontrado', 'Tente buscar por outro termo ou categoria.');
      return;
    }

    area.innerHTML = filtered.map(p => {
      const cartItem = state.cart.find(c => c.id === p.id);
      return UIRender.productStoreCard(p, cartItem ? cartItem.qty : 0);
    }).join('');
  }

  function renderCartDrawer() {
    const list = document.getElementById('cart-items-list');
    const subEl = document.getElementById('cart-subtotal');
    const totEl = document.getElementById('cart-total');

    if (!list) return;

    if (state.cart.length === 0) {
      list.innerHTML = UIRender.emptyState('🛒', 'Seu pedido está vazio', 'Adicione produtos para começar seu pedido.');
      if (subEl) subEl.textContent = 'R$ 0,00';
      if (totEl) totEl.textContent = 'R$ 0,00';
      return;
    }

    list.innerHTML = state.cart.map(item => UIRender.cartItemRow(item)).join('');
    
    const subtotal = state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
    if (subEl) subEl.textContent = UIRender.fmtPrice(subtotal);
    if (totEl) totEl.textContent = UIRender.fmtPrice(subtotal);
  }

  // ── WhatsApp ────────────────────────────────────────────────
  function sendToWhatsApp() {
    if (state.cart.length === 0) return;

    const wa = (state.store.whatsapp || '').replace(/\D/g, '');
    if (!wa) {
      alert('Esta loja ainda não configurou o WhatsApp.');
      return;
    }

    const obs = document.getElementById('order-obs')?.value.trim();
    const subtotal = state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
    
    const itemsText = state.cart.map(i => {
      const qtyStr = i.unit?.toLowerCase() === 'kg' 
        ? (i.qty < 1 ? `${i.qty * 1000}g` : `${i.qty.toFixed(1).replace('.',',')}kg`) 
        : `${i.qty}x`;
      return `• ${qtyStr} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`;
    }).join('\n');

    let msg = `Olá! 👋 Gostaria de fazer um pedido:\n\n`;
    msg += `🛒 *MEU PEDIDO*\n${itemsText}\n\n`;
    if (obs) msg += `📝 *OBS:* ${obs}\n\n`;
    msg += `💰 *TOTAL: ${UIRender.fmtPrice(subtotal)}*\n\n`;
    msg += `_Enviado via EncartShop_`;

    const url = `https://api.whatsapp.com/send?phone=55${wa}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  // ── Helpers ─────────────────────────────────────────────────
  function setCategory(cat) {
    state.activeCategory = cat;
    renderCategoryTabs();
    renderProducts();
  }

  function saveCartToStorage() {
    localStorage.setItem(`encart_cart_${state.store.id}`, JSON.stringify(state.cart));
  }

  function loadCartFromStorage() {
    try {
      const saved = localStorage.getItem(`encart_cart_${state.store.id}`);
      state.cart = saved ? JSON.parse(saved) : [];
      updateCartUI();
    } catch(e) { state.cart = []; }
  }

  function _refreshProductCard(id) {
    const p = state.products.find(x => x.id === id);
    const el = document.getElementById(`prod-${id}`);
    if (p && el) {
      const cartItem = state.cart.find(c => c.id === id);
      const tmp = document.createElement('div');
      tmp.innerHTML = UIRender.productStoreCard(p, cartItem ? cartItem.qty : 0);
      el.replaceWith(tmp.firstElementChild);
    }
  }

  function _injectAdminBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fff7ed; color:#c2410c; padding:12px; text-align:center; font-size:0.8rem; font-weight:700; border-bottom:1px solid #ffedd5; position:sticky; top:0; z-index:1001;';
    banner.innerHTML = `⚠️ MODO PREVIEW (Apenas você pode ver) | <a href="/admin/pagamento.html" style="color:#f97316;">Ativar Loja</a>`;
    document.body.prepend(banner);
  }

  // ── Error Pages ─────────────────────────────────────────────
  function renderPending() {
    document.body.innerHTML = `<div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:30px; background:#fff;">
      <div style="font-size:4rem; margin-bottom:20px;">🏗️</div>
      <h1 style="font-size:1.5rem; margin-bottom:10px;">Loja em Construção</h1>
      <p style="color:var(--text-light); max-width:320px; line-height:1.6;">Esta loja ainda não foi ativada. Volte em breve!</p>
      <a href="/" style="margin-top:30px; color:var(--brand); font-weight:700; text-decoration:none;">Conhecer EncartShop →</a>
    </div>`;
  }

  function renderBlocked() {
    document.body.innerHTML = `<div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:30px; background:#f8fafc;">
      <div style="font-size:4rem; margin-bottom:20px;">🏪</div>
      <h1 style="font-size:1.5rem; margin-bottom:10px;">Loja Indisponível</h1>
      <p style="color:var(--text-light);">A assinatura desta loja expirou ou está suspensa.</p>
    </div>`;
  }

  function renderError(msg) {
    document.body.innerHTML = `<div style="text-align:center; padding:100px 30px;">
      <div style="font-size:3rem; margin-bottom:20px;">⚠️</div>
      <h2 style="font-size:1.2rem;">Ops! Algo deu errado</h2>
      <p style="color:var(--text-muted); margin-top:10px;">${msg}</p>
      <a href="/" style="display:inline-block; margin-top:30px; color:var(--brand); font-weight:700;">Voltar ao Início</a>
    </div>`;
  }

  // Public API
  return { 
    init, 
    setCategory, 
    addToCart, 
    changeQty, 
    sendToWhatsApp,
    openCart: () => {
      document.getElementById('drawer-overlay')?.classList.add('active');
      renderCartDrawer();
    },
    closeCart: () => {
      document.getElementById('drawer-overlay')?.classList.remove('active');
    }
  };
})();

// Global Helpers for onclick
window.addToCart = StoreApp.addToCart;
window.changeQty = StoreApp.changeQty;
window.sendToWhatsApp = StoreApp.sendToWhatsApp;
window.openCart = StoreApp.openCart;
window.closeCart = StoreApp.closeCart;

// Start App
document.addEventListener('DOMContentLoaded', StoreApp.init);
