/**
 * EncartShop — Loja Pública / FashionModule
 * Gerencia o comportamento visual exclusivo do segmento de moda.
 */

window.FashionModule = (() => {
  let activeStore = null;

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
            if (apiCampaigns && apiCampaigns.length > 0) {
              hasCampaigns = true;
            }
          }
        } catch (e) {
          console.warn('FashionModule: Erro ao checar campanhas da API:', e);
        }

        if (!hasCampaigns) {
          const bt = store.banner_text || '';
          hasCampaigns = bt.trim().startsWith('[') && JSON.parse(bt).length > 0;
        }

        if (!hasCampaigns) {
          _setupHeroPlaceholder();
        }
      }
    });
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

  return { init };
})();
