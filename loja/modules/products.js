/**
 * EncartShop — Loja Pública / ProductCatalog
 * Busca de produtos e renderização resiliente do grid.
 */

window.ProductCatalog = (() => {
  let allProducts = [];
  let activeCategory = 'Todos';

  async function init() {
    EventBus.log('ProductCatalog', 'Aguardando StoreContext...');
    
    // Aguarda o contexto da loja ser carregado
    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      EventBus.log('ProductCatalog', 'StoreContext recebido. Buscando produtos...');
      
      const area = document.getElementById('products-area');
      if (area) area.innerHTML = _skeletonProducts();

      try {
        const prods = await EncartAPI.ProductAPI.getActiveByStore(store.id);
        allProducts = Array.isArray(prods) ? prods : [];
        
        EventBus.log('ProductCatalog', 'Produtos carregados', { count: allProducts.length });
        EventBus.emit(EventBus.EVENTS.PRODUCTS_LOADED, { products: allProducts });
        
        renderProducts();
      } catch (err) {
        EventBus.log('ProductCatalog', 'Falha ao buscar produtos', err.message, true);
        if (area) {
          area.innerHTML = `
            <div style="text-align:center;padding:60px 24px;color:var(--danger, #ef4444);">
              <div style="font-size:3rem;margin-bottom:12px">⚠️</div>
              <h4 style="margin:0 0 8px 0;font-size:1.1rem">Não foi possível carregar o catálogo</h4>
              <p style="font-size:0.9rem;opacity:0.8;margin:0">Tente atualizar a página.</p>
            </div>
          `;
        }
      }
    });

    // Escuta troca de categoria para refiltrar
    EventBus.on(EventBus.EVENTS.CATEGORY_CHANGED, ({ category }) => {
      EventBus.log('Category', 'Categoria alterada', { from: activeCategory, to: category });
      activeCategory = category;
      EventBus.log('Filter', 'Aplicando filtro no catálogo', { category });
      renderProducts();
      document.getElementById('products-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Escuta atualização do carrinho para atualizar QTY no grid
    EventBus.on(EventBus.EVENTS.CART_UPDATED, ({ cart }) => {
      _refreshAllProductCards(cart);
    });
  }

  function getProducts() { return allProducts; }

  // ── Rendering ────────────────────────────────────────────────
  function renderProducts() {
    const area = document.getElementById('products-area');
    if (!area) return;

    if (!allProducts.length) {
      area.innerHTML = `
        <div style="text-align:center;padding:60px 24px;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:12px">🛍️</div>
          <p style="font-size:0.9rem">Nenhum produto disponível no momento.</p>
        </div>`;
      return;
    }

    if (activeCategory === 'Todos') {
      area.innerHTML = _renderGrouped();
      return;
    }

    if (activeCategory === 'Ofertas') {
      const offerProds = allProducts.filter(p => !!p.promo_price);
      if (!offerProds.length) {
        area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhuma oferta no momento.</div>';
        return;
      }
      area.innerHTML = _renderGroup('🔥 Ofertas', offerProds, true);
      return;
    }

    const filtered = allProducts.filter(p => p.category === activeCategory);
    if (!filtered.length) {
      area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhum produto nesta categoria.</div>';
      return;
    }
    area.innerHTML = _renderGroup(activeCategory, filtered, false);
  }

  function _renderGrouped() {
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
    const hasPromo   = allProducts.some(p => p.promo_price);
    const groups     = [];

    if (hasPromo) {
      const promoProds = allProducts.filter(p => !!p.promo_price);
      groups.push(_renderGroup('🔥 Ofertas', promoProds, true));
    }

    const noCat = allProducts.filter(p => !p.category);

    if (!categories.length && !hasPromo) {
      groups.push(_renderGroup('Produtos', allProducts, false));
    } else {
      categories.forEach(cat => {
        const catProds = allProducts.filter(p => p.category === cat);
        if (catProds.length) groups.push(_renderGroup(cat, catProds, false));
      });
      if (noCat.length) groups.push(_renderGroup('Outros', noCat, false));
    }

    return groups.join('');
  }

  function _renderGroup(title, products, isPromo = false) {
    const cart = window.CartManager ? window.CartManager.getCart() : [];
    return `
      <div class="category-group">
        <div class="category-group-header">
          <span class="category-group-title">${title}</span>
          <span class="category-group-count">${products.length}</span>
          <div class="category-group-line"></div>
        </div>
        <div class="product-grid">
          ${products.map(p => UIRender.productStoreCard(p, _cartQty(p.id, cart))).join('')}
        </div>
      </div>`;
  }

  function _skeletonProducts() {
    if (typeof EncartHelpers !== 'undefined' && EncartHelpers.skeleton) {
      return `
      <div style="margin-top:24px">
        <div style="height:20px;width:120px;border-radius:8px;background:rgba(0,0,0,0.06);margin-bottom:16px"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
          ${EncartHelpers.skeleton(6, 'stat').replace(/border-radius:12px/g, 'border-radius:12px;height:210px;')}
        </div>
      </div>`;
    }
    return '';
  }

  // ── Atualização pontual do HTML do grid ─────────────────────
  function _refreshAllProductCards(cart) {
    // Para performance, atualizamos pontualmente cada card no DOM se ele existir
    allProducts.forEach(p => {
      const el = document.getElementById(`prod-${p.id}`);
      if (el) {
        const tmp = document.createElement('div');
        tmp.innerHTML = UIRender.productStoreCard(p, _cartQty(p.id, cart));
        if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
      }
    });
  }

  function _cartQty(id, cart) {
    const item = cart.find(c => c.id === id);
    return item ? item.qty : 0;
  }

  return { init, getProducts };
})();
