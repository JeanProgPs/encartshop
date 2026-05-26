/**
 * EncartShop — Loja Pública / CampaignsModule
 * Gerencia a exibição do carrossel de campanhas para qualquer segmento.
 */

window.CampaignsModule = (() => {
  let activeStore = null;
  let campaigns = [];
  let currentIndex = 0;
  let intervalId = null;

  function init() {
    EventBus.on(EventBus.EVENTS.STORE_LOADED, async ({ store }) => {
      activeStore = store;
      campaigns = [];
      
      try {
        if (window.EncartAPI && window.EncartAPI.CampaignAPI) {
          const apiCampaigns = await window.EncartAPI.CampaignAPI.getActiveByStore(store.id);
          if (apiCampaigns && apiCampaigns.length > 0) {
            campaigns = apiCampaigns.map(c => ({
              ...c,
              image_url: c.desktop_image,
              filter: c.target_value
            }));
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar campanhas da API:', e);
      }
      
      // Fallback temporário para legado se a API não retornou nada
      if (campaigns.length === 0) {
        const bt = store.banner_text || '';
        if (bt.trim().startsWith('[')) {
          try {
            campaigns = JSON.parse(bt);
          } catch(e) { console.error('Erro ao parsear campanhas:', e); }
        }
      }

      if (campaigns && campaigns.length > 0) {
        _renderCarousel();
      }
    });
  }

  function _renderCarousel() {
    // Vamos usar a div #fashion-hero-area para renderizar o carrossel, 
    // ou se não existir, cria uma logo acima de #products-area
    let heroArea = document.getElementById('fashion-hero-area');
    if (!heroArea) {
      heroArea = document.createElement('div');
      heroArea.id = 'fashion-hero-area';
      const main = document.getElementById('main-content');
      main.insertBefore(heroArea, document.getElementById('smart-banner-area'));
    }

    // Oculta os banners antigos de mercado se existirem
    const storeBanner = document.querySelector('.store-banner-area');
    if (storeBanner) storeBanner.style.display = 'none';
    const smartBanner = document.getElementById('smart-banner-area');
    if (smartBanner) smartBanner.style.display = 'none';

    heroArea.style.display = 'block';

    const hasLogo = activeStore.logo_url ? true : false;
    const logoHtml = hasLogo ? `
      <div class="campaign-logo-overlay">
        <img src="${escapeHTML(activeStore.logo_url)}" alt="Logo da Loja" class="campaign-logo-img">
      </div>
    ` : '';

    heroArea.innerHTML = `
      <div class="campaign-carousel-container" id="campaign-carousel-container">
        ${logoHtml}
        <div class="campaign-track" id="campaign-track">
          ${campaigns.map((camp, i) => `
            <div class="campaign-slide" data-index="${i}" onclick="CampaignsModule.handleBannerClick(${i})">
              <img src="${escapeHTML(camp.image_url)}" loading="${i === 0 ? 'eager' : 'lazy'}">
            </div>
          `).join('')}
        </div>
        ${campaigns.length > 1 ? `
          <div class="campaign-dots">
            ${campaigns.map((_, i) => `<span class="campaign-dot ${i === 0 ? 'active' : ''}" onclick="CampaignsModule.goToSlide(${i})"></span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    if (campaigns.length > 1) {
      _startRotation();
    }
  }

  function _startRotation() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      goToSlide((currentIndex + 1) % campaigns.length);
    }, 4000);
  }

  function goToSlide(index) {
    currentIndex = index;
    const track = document.getElementById('campaign-track');
    if (track) {
      track.style.transform = `translateX(-${index * 100}%)`;
    }
    const dots = document.querySelectorAll('.campaign-dot');
    dots.forEach((d, i) => {
      if (i === index) d.classList.add('active');
      else d.classList.remove('active');
    });
    // Restart interval to prevent quick jump if user clicked
    if (campaigns.length > 1) _startRotation();
  }

  function handleBannerClick(index) {
    const camp = campaigns[index];
    if (camp && camp.filter && camp.filter.trim() !== '') {
      EventBus.emit(EventBus.EVENTS.CATEGORY_CHANGED, { category: camp.filter.trim() });
      const productsArea = document.getElementById('products-area');
      if (productsArea) {
        const offset = productsArea.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: offset, behavior: 'smooth' });
      }
    }
  }

  return { init, handleBannerClick, goToSlide };
})();
