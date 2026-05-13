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
    const subStatus = SubscriptionModule.getStatus(store.expires_at, store.status);
    
    // Se bloqueada por vencimento (independente de ser dono ou não)
    if (subStatus.blocked) {
      renderBlockedPage();
      return;
    }

    // Se pendente, permite acesso mas mostra aviso (opcional conforme UX)
    if (store.status === 'pending') {
       const user = await AuthService.getUser();
       const isOwner = user && user.id === store.user_id;

       if (isOwner) {
          console.warn('[Loja] Preview interno para o dono.');
          _injectPendingBanner();
          _blockSEO();
       } else {
          console.log('[Loja] Acesso negado: loja não ativada.');
          renderPendingPage();
          return;
       }
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

function _blockSEO() {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    console.info('[SEO] Indexação bloqueada para esta loja em rascunho.');
}

function _injectPendingBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fff7ed; color:#c2410c; padding:12px; text-align:center; font-size:0.9rem; font-weight:600; border-bottom:1px solid #ffedd5; display:flex; align-items:center; justify-content:center; gap:15px; position:sticky; top:0; z-index:1001;';
    banner.innerHTML = `
      <span>⚠️ Esta loja está em modo de rascunho (apenas você pode ver).</span>
      <a href="/admin/pagamento.html" style="background:#f97316; color:#fff; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:0.8rem;">Finalizar Pagamento</a>
    `;
    document.body.prepend(banner);
}

function renderPendingPage() {
  document.body.innerHTML = `
    <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px; font-family:sans-serif; background:#fff;">
      <div style="font-size:4rem; margin-bottom:20px;">🏗️</div>
      <h1 style="font-size:1.5rem; color:#0f172a; margin-bottom:12px;">Loja em Construção</h1>
      <p style="color:#64748b; max-width:400px; line-height:1.6; margin-bottom:24px;">Esta loja ainda não foi ativada pelo proprietário. Volte em breve!</p>
      <a href="/" style="color:#4f46e5; text-decoration:none; font-weight:600; border:1px solid #e2e8f0; padding:10px 20px; border-radius:8px;">Conheça o EncartShop</a>
    </div>`;
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
  const c3 = document.getElementById('sidebar-cart-count');
  
  const count = Math.floor(totalItems);
  if (c1) c1.textContent = count;
  if (c2) c2.textContent = count;
  if (c3) c3.textContent = count;
  
  document.getElementById('cart-bubble')?.classList.toggle('hidden', cart.length === 0);
  document.getElementById('header-cart-btn')?.classList.toggle('hidden', cart.length === 0);
  
  // Atualiza também o sidebar persistente
  renderCartBody();
}

function openCart() {
  document.getElementById('cart-modal')?.classList.remove('hidden');
  renderCartBody();
}

function closeCart() {
  document.getElementById('cart-modal')?.classList.add('hidden');
}

function renderCartBody() {
  const sidebarBody = document.getElementById('cart-sidebar-body');
  const sidebarFooter = document.getElementById('cart-sidebar-footer');
  const modalBody = document.getElementById('cart-body');
  const modalFooter = document.getElementById('cart-subtotals');
  
  if (!cart.length) {
    const emptyHtml = '<p style="text-align:center;padding:40px;color:#999;font-size:0.85rem;">Seu carrinho está vazio.</p>';
    if (sidebarBody) sidebarBody.innerHTML = emptyHtml;
    if (sidebarFooter) sidebarFooter.innerHTML = '';
    if (modalBody) modalBody.innerHTML = emptyHtml;
    if (modalFooter) modalFooter.innerHTML = '';
    return;
  }

  const itemsHtml = cart.map(item => {
    if (typeof UIRender.cartItemRow === 'function') {
      return UIRender.cartItemRow(item);
    }
    // Fallback básico se a função falhar
    return `<div class="cart-item-row"><div>${item.name}</div><div>${UIRender.fmtPrice(item.price * item.qty)}</div></div>`;
  }).join('');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal; // Futuramente taxa de entrega aqui

  const footerHtml = `
    <div class="cart-form" style="margin-bottom:16px;">
      <label class="form-label">Seu Nome</label>
      <input type="text" class="form-input customer-name-input" placeholder="Como te chamamos?" oninput="syncNames(this.value)">
    </div>
    <div class="summary-row"><span>Subtotal</span><span>${UIRender.fmtPrice(subtotal)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${UIRender.fmtPrice(total)}</span></div>
    <button class="checkout-btn" onclick="checkout()">
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.817 9.817 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.182 8.182 0 0 1 2.41 5.82c0 4.52-3.67 8.19-8.19 8.19-1.53 0-3.06-.43-4.39-1.24l-.31-.19-3.26.86.87-3.17-.21-.33c-.88-1.41-1.35-3.04-1.35-4.72 0-4.52 3.68-8.19 8.21-8.19m-3.11 4.64c-.17 0-.45.06-.69.32-.24.25-.92.9-.92 2.2 0 1.3.95 2.56 1.08 2.73.13.17 1.87 2.85 4.53 4 .63.27 1.13.44 1.51.56.64.2 1.22.17 1.67.1.51-.07 1.57-.64 1.79-1.26.22-.61.22-1.14.15-1.26-.07-.12-.25-.18-.53-.32-.28-.14-1.66-.82-1.92-.91-.26-.09-.45-.14-.64.14-.19.28-.73.91-.89 1.1-.16.19-.32.21-.61.07-.28-.14-1.2-.44-2.28-1.41-.84-.75-1.41-1.68-1.57-1.97-.17-.28-.02-.44.12-.58.13-.12.28-.32.42-.48.14-.16.18-.28.28-.46.1-.18.05-.33-.02-.47-.07-.14-.64-1.54-.87-2.11-.23-.55-.47-.48-.64-.49"/></svg>
      <span>Finalizar no WhatsApp</span>
    </button>
  `;

  if (sidebarBody) sidebarBody.innerHTML = itemsHtml;
  if (sidebarFooter) sidebarFooter.innerHTML = footerHtml;
  if (modalBody) modalBody.innerHTML = itemsHtml;
  if (modalFooter) modalFooter.innerHTML = footerHtml;
  
  // Recupera o nome se já foi digitado
  const savedName = localStorage.getItem('encart_customer_name');
  if (savedName) {
    document.querySelectorAll('.customer-name-input').forEach(i => i.value = savedName);
  }
}

function syncNames(val) {
  localStorage.setItem('encart_customer_name', val);
  document.querySelectorAll('.customer-name-input').forEach(i => {
    if (i !== document.activeElement) i.value = val;
  });
}

async function checkout() {
  // Pega o nome do primeiro input que encontrar (já que estão sincronizados)
  const name = document.querySelector('.customer-name-input')?.value.trim();
  
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
  const itemsText = cart.map(i => {
    const isKg = i.unit?.toLowerCase() === 'kg';
    const qtyStr = isKg ? (i.qty < 1 ? `${i.qty * 1000}g` : `${i.qty.toFixed(1).replace('.',',')}kg`) : `${i.qty}x`;
    return `• ${qtyStr} ${i.name} — ${UIRender.fmtPrice(i.price * i.qty)}`;
  }).join('\n');
  
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
