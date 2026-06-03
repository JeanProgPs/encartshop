/**
 * EncartShop — Loja Pública / FashionModule
 * Gerencia o comportamento visual exclusivo do segmento de moda.
 */

window.FashionModule = (() => {
  let activeStore = null;
  let filterData = { brands: [], genders: [], colors: [], sizes: [] };
  let selectedFilters = { brand: [], gender: [], color: [], size: [] };

  function init() {
    EventBus.log('FashionModule', 'Iniciando módulo...');

    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      activeStore = store;
      
      if (store.store_segment === 'fashion') {
        EventBus.log('FashionModule', 'Segmento fashion detectado. Aplicando adaptações.');

        let hasCampaigns = false;
        try {
          if (window.EncartAPI && window.EncartAPI.CampaignAPI) {
            const apiCampaigns = await window.EncartAPI.CampaignAPI.getActiveByStore(store.id);
            if (apiCampaigns && apiCampaigns.length > 0) hasCampaigns = true;
          }
        } catch (e) {}

        if (!hasCampaigns) {
          const bt = store.banner_text || '';
          hasCampaigns = bt.trim().startsWith('[') && JSON.parse(bt).length > 0;
        }

        if (!hasCampaigns) {
          _setupHeroPlaceholder();
        }
      }
    });

    EventBus.on(EventBus.EVENTS.PRODUCTS_LOADED, ({ products }) => {
      if (activeStore && activeStore.store_segment === 'fashion') {
        _extractFilterData(products);
        _renderSidebar();
        
        // Show sidebar and mobile button
        const sbContainer = document.getElementById('fashion-sidebar-container');
        const btnContainer = document.getElementById('mobile-filter-btn-container');
        if (sbContainer) sbContainer.style.display = 'block';
        if (btnContainer) {
          // Só mostra o botão mobile se a tela for menor que ~768px (mas vamos exibir block e o CSS pode ocultar em telas grandes se quisermos. O jeito mais fácil é via JS ou Media Query)
          // Mas como estamos sem media query específica pra ele no CSS principal, mostramos sempre se fashion (ou ocultamos via inline js no resize).
          // Pelo layout (grid flex gap 24px), se a tela for pequena, flex wrap cuidaria, mas o mobile ideal é ocultar o sidebar e mostrar o botão.
          btnContainer.style.display = window.innerWidth <= 768 ? 'block' : 'none';
          sbContainer.style.display = window.innerWidth > 768 ? 'block' : 'none';
          
          window.addEventListener('resize', () => {
            btnContainer.style.display = window.innerWidth <= 768 ? 'block' : 'none';
            sbContainer.style.display = window.innerWidth > 768 ? 'block' : 'none';
          });
        }
      }
    });
  }

  function _extractFilterData(products) {
    const brands = new Set();
    const genders = new Set();
    const colors = new Set();
    const sizes = new Set();

    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
      if (p.gender) genders.add(p.gender);
      if (p.color) colors.add(p.color);
      if (p.size) sizes.add(p.size);
    });

    filterData.brands = Array.from(brands).sort();
    filterData.genders = Array.from(genders).sort();
    filterData.colors = Array.from(colors).sort();
    filterData.sizes = Array.from(sizes).sort();
  }

  function _renderSidebar() {
    const sb = document.getElementById('fashion-sidebar-container');
    const mb = document.getElementById('mobile-filter-body');
    if (!sb && !mb) return;

    const html = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
        <h3 style="font-size: 1.1rem; font-weight: 800; font-family: var(--font-display, 'Outfit', sans-serif); color: var(--text);">Filtros</h3>
        <button onclick="FashionModule.clearFilters()" style="font-size: 0.75rem; color: var(--brand); background: transparent; border: none; font-weight: 600; cursor: pointer;">Limpar</button>
      </div>

      ${_buildFilterGroup('Marca', 'brand', filterData.brands)}
      ${_buildFilterGroup('Gênero', 'gender', filterData.genders)}
      ${_buildFilterGroup('Cor', 'color', filterData.colors)}
      ${_buildFilterGroup('Tamanho', 'size', filterData.sizes)}
    `;

    if (sb) sb.innerHTML = html;
    if (mb) mb.innerHTML = html;
  }

  function _buildFilterGroup(title, key, options) {
    if (!options || options.length === 0) return '';
    
    let html = `<div style="margin-bottom: 24px;">`;
    html += `<h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">${escapeHTML(title)}</h4>`;
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    
    options.forEach(opt => {
      const isChecked = selectedFilters[key].includes(opt);
      // IDs precisam ser únicos se renderizarmos no mobile e desktop juntos. Vamos usar classe e onclick.
      html += `
        <label style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem; cursor: pointer; color: var(--text); font-weight: 500;">
          <input type="checkbox" onchange="FashionModule.toggleFilter('${key}', '${escapeHTML(opt).replace(/'/g, "\\'")}')" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; border-radius: 4px; accent-color: var(--brand);">
          ${escapeHTML(opt)}
        </label>
      `;
    });
    
    html += `</div></div>`;
    return html;
  }

  function toggleFilter(key, value) {
    const idx = selectedFilters[key].indexOf(value);
    if (idx > -1) {
      selectedFilters[key].splice(idx, 1);
    } else {
      selectedFilters[key].push(value);
    }
    
    // Se estiver no desktop, aplica imediatamente
    if (window.innerWidth > 768) {
      EventBus.emit('FASHION_FILTER_CHANGED', selectedFilters);
      _renderSidebar(); // re-render para atualizar os checkboxes nas duas views
    }
  }

  function applyFiltersMobile() {
    EventBus.emit('FASHION_FILTER_CHANGED', selectedFilters);
    toggleMobileFilter(); // fecha o modal
    _renderSidebar(); // re-render para sinc
  }

  function clearFilters() {
    selectedFilters = { brand: [], gender: [], color: [], size: [] };
    EventBus.emit('FASHION_FILTER_CHANGED', selectedFilters);
    _renderSidebar();
  }

  function toggleMobileFilter() {
    const modal = document.getElementById('mobile-filter-modal');
    if (!modal) return;
    
    if (modal.style.display === 'none' || modal.classList.contains('hidden')) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      setTimeout(() => modal.style.opacity = '1', 10);
    } else {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }, 300);
    }
  }

  function _setupHeroPlaceholder() {
    const heroArea = document.getElementById('fashion-hero-area');
    if (!heroArea) return;

    // Remove o banner de mercado antigo se existir
    const storeBanner = document.querySelector('.store-banner-area');
    if (storeBanner) storeBanner.style.display = 'none';

    const heroImageUrl = 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80';
    const storeName = activeStore.name || 'Nova Coleção';
    const tagText = activeStore.slogan || 'Elegância para o seu estilo';

    heroArea.innerHTML = `
      <div class="fashion-hero-container">
        <img src="${heroImageUrl}" alt="Coleção Fashion" class="fashion-hero-img">
        <div class="fashion-hero-overlay"></div>
        <div class="fashion-hero-content">
          ${activeStore.logo_url ? `<img src="${escapeHTML(activeStore.logo_url)}" alt="${escapeHTML(storeName)}" class="fashion-hero-logo">` : `<div class="fashion-hero-tag">${escapeHTML(tagText)}</div>`}
          <h1 class="fashion-hero-title">${escapeHTML(storeName)}</h1>
          <button class="fashion-hero-btn" onclick="document.getElementById('products-area').scrollIntoView({behavior: 'smooth'})">
            Ver Coleção
          </button>
        </div>
      </div>
    `;
  }

  return { init, toggleFilter, clearFilters, toggleMobileFilter, applyFiltersMobile };
})();
