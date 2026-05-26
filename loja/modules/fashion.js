/**
 * EncartShop — Loja Pública / FashionModule
 * Gerencia o comportamento visual exclusivo do segmento de moda.
 */

window.FashionModule = (() => {
  let activeStore = null;

  function init() {
    EventBus.log('FashionModule', 'Iniciando módulo...');

    EventBus.on(EventBus.EVENTS.STORE_LOADED, ({ store }) => {
      activeStore = store;
      
      // Ativa funcionalidades apenas se for fashion
      if (store.store_segment === 'fashion') {
        EventBus.log('FashionModule', 'Segmento fashion detectado. Aplicando adaptações.');
        _setupHeroBanner();
      }
    });
  }

  function _setupHeroBanner() {
    const heroArea = document.getElementById('fashion-hero-area');
    if (!heroArea) return;

    // Remove o banner de mercado antigo se existir
    const storeBanner = document.querySelector('.store-banner-area');
    if (storeBanner) storeBanner.style.display = 'none';

    // Imagem placeholder para a vitrine fashion (conforme aprovado)
    const heroImageUrl = 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80';
    
    // Tenta usar o nome da loja ou nome padrao
    const storeName = activeStore.name || 'Nova Coleção';
    const tagText = activeStore.slogan || 'Elegância para o seu estilo';

    heroArea.innerHTML = `
      <div class="fashion-hero-container">
        <img src="${heroImageUrl}" alt="Coleção Fashion" class="fashion-hero-img">
        <div class="fashion-hero-overlay"></div>
        <div class="fashion-hero-content">
          <div class="fashion-hero-tag">${escapeHTML(tagText)}</div>
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
