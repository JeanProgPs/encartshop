/**
 * EncartShop — Loja Pública / SmartBanner (PRO)
 * Gera um banner rotativo automático baseado nas melhores ofertas.
 */

window.SmartBanner = (() => {
  const MAX_BANNERS = 5;
  let sliderInterval = null;
  let activeStore = null;

  async function init() {
    EventBus.log('SmartBanner', 'Aguardando inicialização...');

    EventBus.on(EventBus.EVENTS.STORE_LOADED, ({ store }) => {
      activeStore = store;
    });

    EventBus.on(EventBus.EVENTS.PRODUCTS_LOADED, ({ products }) => {
      try {
        if (!activeStore) throw new Error('StoreContext ausente');

        // Validação de plano (PRO ou Enterprise)
        const plan = (activeStore.plan || '').toLowerCase();
        if (plan !== 'pro' && plan !== 'enterprise') {
          EventBus.log('SmartBanner', 'Loja não possui plano PRO. Banner ignorado.', { plan });
          return; // Morre em silêncio
        }

        const topOffers = _selectBestOffers(products);
        if (topOffers.length === 0) {
          EventBus.log('SmartBanner', 'Nenhum produto qualificável para o banner.');
          return;
        }

        _renderBanners(topOffers);
        _initSlider();
        EventBus.emit('loja:banners_loaded', { count: topOffers.length });
        EventBus.log('SmartBanner', 'Banner gerado com sucesso', { items: topOffers.length });
      } catch (err) {
        EventBus.log('SmartBanner', 'Falha ao gerar banners', err.message, true);
        EventBus.emit('loja:banner_failed', { error: err.message });
      }
    });
  }

  // ── Engine de Seleção ──────────────────────────────────────────
  function _selectBestOffers(products) {
    // Regras: promo_price > 0, price > promo_price, active !== false, tem imagem
    const valid = products.filter(p => {
      const price = Number(p.price) || 0;
      const promo = Number(p.promo_price) || 0;
      return promo > 0 && price > promo && p.active !== false && p.image;
    });

    // Calcula desconto e ordena
    valid.forEach(p => {
      const price = Number(p.price);
      const promo = Number(p.promo_price);
      p._discountPct = ((price - promo) / price) * 100;
    });

    valid.sort((a, b) => b._discountPct - a._discountPct);

    // Remove produtos com o mesmo nome (evitar duplicados)
    const unique = [];
    const seenNames = new Set();
    for (const p of valid) {
      const nameNorm = p.name.toLowerCase().trim();
      if (!seenNames.has(nameNorm)) {
        seenNames.add(nameNorm);
        unique.push(p);
      }
      if (unique.length >= MAX_BANNERS) break;
    }

    return unique;
  }

  // ── Renderer ───────────────────────────────────────────────────
  function _renderBanners(offers) {
    const area = document.getElementById('smart-banner-area');
    if (!area) return;

    const fmt = v => UIRender.fmtPrice(v);

    const slidesHTML = offers.map((p, idx) => {
      const pct = Math.round(p._discountPct);
      return `
        <div class="smart-slide" onclick="window.addToCart('${p.id}')">
          <img src="${p.image}" alt="${p.name}" class="smart-slide-img" loading="${idx === 0 ? 'eager' : 'lazy'}">
          <div class="smart-slide-overlay">
            <div class="smart-slide-badge">🔥 ${pct}% OFF</div>
            <div class="smart-slide-content">
              <h3 class="smart-slide-title">${p.name}</h3>
              <div class="smart-slide-prices">
                <span class="smart-slide-old">${fmt(p.price)}</span>
                <span class="smart-slide-new">${fmt(p.promo_price)}</span>
              </div>
            </div>
            <button class="smart-slide-btn">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    const indicatorsHTML = offers.length > 1 
      ? `<div class="smart-slider-dots">
           ${offers.map((_, i) => `<div class="smart-dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></div>`).join('')}
         </div>`
      : '';

    area.innerHTML = `
      <div class="smart-banner-container">
        <div class="smart-slider" id="smart-slider-track">
          ${slidesHTML}
        </div>
        ${indicatorsHTML}
      </div>
    `;

    _injectStyles();
  }

  // ── Slider Behavior ────────────────────────────────────────────
  function _initSlider() {
    const track = document.getElementById('smart-slider-track');
    const dots  = document.querySelectorAll('.smart-dot');
    if (!track || dots.length === 0) return;

    let currentIndex = 0;
    const totalSlides = dots.length;

    const updateDots = (index) => {
      dots.forEach(d => d.classList.remove('active'));
      if (dots[index]) dots[index].classList.add('active');
    };

    track.addEventListener('scroll', () => {
      const slideWidth = track.clientWidth;
      const scrollLeft = track.scrollLeft;
      const newIndex = Math.round(scrollLeft / slideWidth);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < totalSlides) {
        currentIndex = newIndex;
        updateDots(currentIndex);
      }
    });

    const nextSlide = () => {
      currentIndex = (currentIndex + 1) % totalSlides;
      const slideWidth = track.clientWidth;
      track.scrollTo({ left: currentIndex * slideWidth, behavior: 'smooth' });
    };

    // Autoplay
    if (sliderInterval) clearInterval(sliderInterval);
    sliderInterval = setInterval(nextSlide, 4000);

    // Pausa no touch/hover
    track.addEventListener('touchstart', () => clearInterval(sliderInterval), { passive: true });
    track.addEventListener('touchend', () => {
      clearInterval(sliderInterval);
      sliderInterval = setInterval(nextSlide, 4000);
    }, { passive: true });
  }

  function _injectStyles() {
    if (document.getElementById('smart-banner-styles')) return;
    const style = document.createElement('style');
    style.id = 'smart-banner-styles';
    style.innerHTML = `
      .smart-banner-container {
        position: relative;
        margin: 16px 16px 24px 16px;
        border-radius: 16px;
        overflow: hidden;
        background: #0f172a;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
      }
      .smart-slider {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none;  /* IE and Edge */
        scroll-behavior: smooth;
      }
      .smart-slider::-webkit-scrollbar { display: none; }
      
      .smart-slide {
        flex: 0 0 100%;
        scroll-snap-align: start;
        position: relative;
        aspect-ratio: 21/9;
        min-height: 160px;
        max-height: 220px;
        cursor: pointer;
        overflow: hidden;
        user-select: none;
      }
      .smart-slide-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        position: absolute;
        inset: 0;
        z-index: 1;
        transition: transform 0.4s ease;
      }
      .smart-slide:hover .smart-slide-img {
        transform: scale(1.05);
      }
      .smart-slide-overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
        background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 100%);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 16px;
      }
      .smart-slide-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        background: var(--danger, #ef4444);
        color: #fff;
        font-weight: 800;
        font-size: 0.75rem;
        padding: 4px 10px;
        border-radius: 999px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        letter-spacing: 0.05em;
      }
      .smart-slide-content {
        padding-right: 48px;
      }
      .smart-slide-title {
        color: #fff;
        font-size: 1.1rem;
        font-weight: 700;
        margin: 0 0 4px 0;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .smart-slide-prices {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .smart-slide-old {
        color: rgba(255,255,255,0.6);
        text-decoration: line-through;
        font-size: 0.85rem;
      }
      .smart-slide-new {
        color: #fff;
        font-size: 1.2rem;
        font-weight: 900;
        color: var(--success, #10b981);
      }
      .smart-slide-btn {
        position: absolute;
        right: 16px;
        bottom: 16px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--brand, #4f46e5);
        color: #fff;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.2s;
      }
      .smart-slide-btn:active {
        transform: scale(0.9);
      }
      
      .smart-slider-dots {
        position: absolute;
        bottom: 8px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        gap: 6px;
        z-index: 10;
        pointer-events: none;
      }
      .smart-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(255,255,255,0.4);
        transition: all 0.3s ease;
      }
      .smart-dot.active {
        background: #fff;
        width: 16px;
        border-radius: 4px;
      }
      
      @media (min-width: 540px) {
        .smart-banner-container { margin: 24px; border-radius: 20px; }
        .smart-slide { aspect-ratio: 24/8; max-height: 260px; }
        .smart-slide-title { font-size: 1.3rem; }
        .smart-slide-new { font-size: 1.4rem; }
      }
    `;
    document.head.appendChild(style);
  }

  return { init };
})();
