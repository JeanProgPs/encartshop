/**
 * EncartShop — Loja Pública / StoreUI
 * Responsável por desenhar componentes dinâmicos da interface (tabs, header, carrinho modal).
 */

window.StoreUI = (() => {
  let activeCategory = 'Todos';
  let store = null;

  async function init() {
    EventBus.log('StoreUI', 'Aguardando inicialização da UI...');

    // 1. Quando a Loja Carregar -> Preenche Header e Banner
    EventBus.on(EventBus.EVENTS.STORE_LOADED, (data) => {
      store = data.store;
      _setEl('header-store-name', store.name || '');
      _setEl('store-banner',      store.banner_text || 'Confira nossas ofertas!');
      _setEl('header-hours',      store.hours || '');
      EventBus.log('StoreUI', 'Header atualizado');
    });

    // 2. Quando os Produtos Carregarem -> Cria Abas de Categoria
    EventBus.on(EventBus.EVENTS.PRODUCTS_LOADED, ({ products }) => {
      _renderCategoryTabs(products);
    });

    // 3. Quando a Categoria Mudar -> Atualiza Tab Ativa
    EventBus.on(EventBus.EVENTS.CATEGORY_CHANGED, ({ category }) => {
      activeCategory = category;
      const tabsWrap = document.getElementById('cat-tabs');
      if (tabsWrap) {
        tabsWrap.querySelectorAll('.cat-tab').forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.cat === category) btn.classList.add('active');
        });
      }
      
      // Limpa busca ao mudar categoria
      const sInput = document.getElementById('store-search-input');
      const sClear = document.getElementById('search-clear-btn');
      if (sInput && sInput.value) {
        sInput.value = '';
        if (sClear) sClear.classList.add('hidden');
      }
    });

    // Configura eventos da busca
    const searchInput = document.getElementById('store-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (searchClear) {
          searchClear.classList.toggle('hidden', val.length === 0);
        }
        EventBus.emit(EventBus.EVENTS.SEARCH_CHANGED, { query: val });
      });
    }
    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchInput.focus();
        EventBus.emit(EventBus.EVENTS.SEARCH_CHANGED, { query: '' });
      });
    }

    // 4. Quando o Carrinho for atualizado -> Redesenha Modal, Bolha e Header
    EventBus.on(EventBus.EVENTS.CART_UPDATED, ({ cart }) => {
      _updateCartIndicators(cart);
      const modal = document.getElementById('cart-modal');
      if (modal && !modal.classList.contains('hidden')) {
        _renderCartBody(cart);
      }
    });
  }

  // ── Helpers de Renderização UI ──────────────────────────────
  function _setEl(id, val) { 
    const el = document.getElementById(id); 
    if (el) el.textContent = val; 
  }

  function _renderCategoryTabs(products) {
    const tabsArea = document.getElementById('cat-tabs-area');
    const tabsWrap = document.getElementById('cat-tabs');
    if (!tabsWrap) return;

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const hasPromo   = products.some(p => p.promo_price);

    if (!categories.length && !hasPromo) {
      if (tabsArea) tabsArea.classList.add('hidden');
      return;
    }
    if (tabsArea) tabsArea.classList.remove('hidden');

    const tabs = [
      `<button class="cat-tab ${activeCategory==='Todos'?'active':''}" data-cat="Todos">Todos</button>`
    ];
    if (hasPromo) {
      tabs.push(`<button class="cat-tab ${activeCategory==='Ofertas'?'active':''}" data-cat="Ofertas" style="${activeCategory!=='Ofertas'?'color:#ef4444;border-color:#ef4444':''}">🔥 Ofertas</button>`);
    }
    categories.forEach(cat => {
      const catEsc = escapeHTML(cat);
      tabs.push(`<button class="cat-tab ${activeCategory===cat?'active':''}" data-cat="${catEsc}">${catEsc}</button>`);
    });

    tabsWrap.innerHTML = tabs.join('');

    // Previne múltiplos listeners adicionados se a função rodar várias vezes
    if (!tabsWrap.dataset.listener) {
      tabsWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('.cat-tab');
        if (!btn) return;
        const cat = btn.dataset.cat;
        if (cat) {
          window.setCategory(cat);
        }
      });
      tabsWrap.dataset.listener = "true";
    }
  }

  function _updateCartIndicators(cart) {
    const totalQty  = cart.reduce((s, i) => s + i.qty, 0);
    const total     = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const fmt       = v => UIRender.fmtPrice(v);

    const hBtn = document.getElementById('header-cart-btn');
    const hCnt = document.getElementById('header-cart-count');
    if (hBtn) hBtn.classList.toggle('hidden', totalQty === 0);
    if (hCnt) hCnt.textContent = totalQty;

    const bubble     = document.getElementById('cart-bubble');
    const bubbleTotal = document.getElementById('cart-bubble-total');
    const cnt        = document.getElementById('cart-count');
    const cntLabel   = document.getElementById('cart-count-label');

    if (bubble) {
      bubble.classList.toggle('cart-visible', totalQty > 0);
    }
    if (cnt) cnt.textContent = totalQty;
    if (cntLabel) {
      cntLabel.textContent = totalQty === 1 ? 'item' : 'itens';
    }
    if (bubbleTotal) bubbleTotal.textContent = fmt(total);

    const drawerBadge = document.getElementById('cart-drawer-count');
    if (drawerBadge) drawerBadge.textContent = totalQty;
  }

  function _renderCartBody(cart) {
    const body   = document.getElementById('cart-body');
    const footer = document.getElementById('cart-subtotals');
    if (!body) return;

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
      const img = escapeHTML(item.image) || defaultImg;
      return `
        <div class="cart-item-row">
          <img class="cart-item-img" src="${img}" alt="${escapeHTML(item.name)}" onerror="this.src='${defaultImg}'">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHTML(item.name)}</div>
            <div class="cart-item-unit-price">${fmt(item.price)} / ${escapeHTML(item.unit || 'un')}</div>
            <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
          </div>
          <div class="cart-qty-control">
            <button class="cart-qty-btn remove" onclick="window.changeQty('${item.id}',-1)" title="Remover">−</button>
            <span class="cart-qty-num">${qtyLabel}</span>
            <button class="cart-qty-btn" onclick="window.changeQty('${item.id}',1)" title="Adicionar">+</button>
          </div>
        </div>`;
    }).join('');

    if (!footer) return;

    // Se o DeliveryModule PRO estiver ativo, não desenhamos a tabela padrão do carrinho
    if (window.DeliveryModule && window.DeliveryModule.getState()?.active) {
      footer.innerHTML = '';
      return;
    }

    const subtotal     = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const deliveryFee  = Number(store.delivery_fee)  || 0;
    const deliveryFree = Number(store.delivery_free) || 0;
    const isCombine    = deliveryFee === -1;
    const hasFreeShip  = deliveryFree > 0 && subtotal >= deliveryFree;
    const feeCharged   = isCombine ? 0 : (hasFreeShip ? 0 : deliveryFee);
    const total        = subtotal + feeCharged;

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

  // ── Ações Globais de UI (Retrocompatibilidade) ──────────────
  window.setCategory = function(cat) {
    EventBus.emit(EventBus.EVENTS.CATEGORY_CHANGED, { category: cat });
  };

  window.openCart = function() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      const cart = window.CartManager ? window.CartManager.getCart() : [];
      _renderCartBody(cart);
    }
  };

  window.closeCart = function() {
    document.getElementById('cart-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
  };

  window.handleCartOverlayClick = function(e) {
    if (e.target.id === 'cart-modal') window.closeCart();
  };

  return { init };
})();
