/**
 * EncartShop — Loja Pública / ProductCatalog
 * Busca de produtos e renderização resiliente do grid.
 */

window.ProductCatalog = (() => {
  let allProducts = [];
  let activeCategory = 'Todos';
  let searchQuery = '';
  let storeSegment = 'market'; // Default

  async function init() {
    EventBus.log('ProductCatalog', 'Aguardando StoreContext...');
    
    // Aguarda o contexto da loja ser carregado
    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      // Captura o segmento da loja
      storeSegment = store.store_segment || 'market';
      EventBus.log('ProductCatalog', 'Segmento da loja definido', { segment: storeSegment });
      
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
      searchQuery = '';
      EventBus.log('Filter', 'Aplicando filtro no catálogo', { category });
      renderProducts();
      document.getElementById('products-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Escuta troca de termo de busca
    EventBus.on(EventBus.EVENTS.SEARCH_CHANGED, ({ query }) => {
      EventBus.log('Search', 'Busca alterada', { query });
      searchQuery = query;
      renderProducts();
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
      EventBus.log('RenderMode', 'Catálogo vazio');
      area.innerHTML = `
        <div style="text-align:center;padding:60px 24px;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:12px">🛍️</div>
          <p style="font-size:0.9rem">Nenhum produto disponível no momento.</p>
        </div>`;
      return;
    }

    // Se houver busca ativa, filtra globalmente
    if (searchQuery && searchQuery.trim() !== '') {
      const queryNormal = searchQuery.toLowerCase().trim();
      const filtered = allProducts.filter(p => 
        (p.name || '').toLowerCase().includes(queryNormal) || 
        (p.description || '').toLowerCase().includes(queryNormal) ||
        (p.category || '').toLowerCase().includes(queryNormal)
      );

      EventBus.log('RenderMode', `Busca ativa: "${searchQuery}"`, { count: filtered.length });
      
      if (!filtered.length) {
        area.innerHTML = `
          <div style="text-align:center;padding:60px 24px;color:var(--text-muted);">
            <div style="font-size:3rem;margin-bottom:12px">🔍</div>
            <h4 style="margin:0 0 8px 0;font-size:1.1rem;color:var(--text);font-weight:700;">Nenhum produto encontrado</h4>
            <p style="font-size:0.9rem;opacity:0.8;margin:0">Não encontramos resultados para "<strong>${escapeHTML(searchQuery)}</strong>".</p>
          </div>`;
        return;
      }
      area.innerHTML = _renderGroup(`Resultados para "${searchQuery}"`, filtered, false);
      return;
    }

    // Normalização para evitar problemas com aspas ou espaços vindos do UI
    const targetCat = (activeCategory || '').trim();
    EventBus.log('Render', `Iniciando renderização para: [${targetCat}]`);

    if (targetCat === 'Todos') {
      EventBus.log('RenderMode', 'Renderizando todos os grupos (Agrupado)');
      area.innerHTML = _renderGrouped();
      return;
    }

    if (targetCat === 'Ofertas') {
      EventBus.log('RenderMode', 'Renderizando aba de Ofertas');
      const offerProds = allProducts.filter(p => !!p.promo_price);
      if (!offerProds.length) {
        area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhuma oferta no momento.</div>';
        return;
      }
      area.innerHTML = _renderGroup('🔥 Ofertas', offerProds, true);
      return;
    }

    // Filtro estrito: compara categoria normalizada
    const filtered = allProducts.filter(p => (p.category || '').trim() === targetCat);
    EventBus.log('RenderMode', `Renderizando Categoria Simples: ${targetCat}`, { count: filtered.length });
    
    if (!filtered.length) {
      area.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)">Nenhum produto nesta categoria.</div>';
      return;
    }
    area.innerHTML = _renderGroup(targetCat, filtered, false);
  }

  function _renderGrouped() {
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
    const hasPromo   = allProducts.some(p => p.promo_price);
    const groups     = [];

    if (hasPromo) {
      const promoProds = allProducts.filter(p => !!p.promo_price);
      const promoTitle = storeSegment === 'fashion' ? 'OUTLET' : '🔥 Ofertas';
      groups.push(_renderGroup(promoTitle, promoProds, true));
    }

    // Filtra produtos sem categoria ignorando os que possuem preço promocional (já listados em Ofertas)
    const noCat = allProducts.filter(p => !p.category && !p.promo_price);

    if (!categories.length && !hasPromo) {
      groups.push(_renderGroup('Produtos', allProducts, false));
    } else {
      categories.forEach(cat => {
        // Exclusão mútua: filtra produtos da categoria ignorando os que possuem preço promocional (já listados em Ofertas)
        const catProds = allProducts.filter(p => p.category === cat && !p.promo_price);
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
          <span class="category-group-title">${escapeHTML(title)}</span>
          <span class="category-group-count">${products.length}</span>
          <div class="category-group-line"></div>
        </div>
        <div class="product-grid">
          ${products.map(p => UIRender.productStoreCard(p, _cartQty(p.id, cart), storeSegment)).join('')}
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
