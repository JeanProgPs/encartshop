/**
 * EncartShop — FlyerTemplates Module (v2 — Estilo Encarte Real)
 * Renderiza encartes no estilo tablóide de supermercado/padaria/moda,
 * com identidade da loja, preços em destaque e paginação automática.
 */

const FlyerTemplates = (() => {
  const DEFAULT_BRAND_COLOR = '#e94560';
  const DEFAULT_ITEMS_PER_PAGE = 6;
  const ALLOWED_ITEMS_PER_PAGE = [4, 6, 8, 9];
  const ALLOWED_TEMPLATES = ['market', 'food', 'fashion'];

  /**
   * Divide uma lista de produtos em páginas com tamanho fixo.
   *
   * @param {Array} products
   * @param {number} itemsPerPage - 4, 6, 8 ou 9
   * @returns {Object} { pages, totalPages, totalProducts, itemsPerPage }
   */
  function paginate(products = [], itemsPerPage = DEFAULT_ITEMS_PER_PAGE) {
    const list = Array.isArray(products) ? [...products] : [];
    const perPage = ALLOWED_ITEMS_PER_PAGE.includes(Number(itemsPerPage))
      ? Number(itemsPerPage)
      : DEFAULT_ITEMS_PER_PAGE;

    if (list.length === 0) {
      return { pages: [], totalPages: 0, totalProducts: 0, itemsPerPage: perPage };
    }

    const pages = [];
    for (let i = 0; i < list.length; i += perPage) {
      pages.push(list.slice(i, i + perPage));
    }

    return { pages, totalPages: pages.length, totalProducts: list.length, itemsPerPage: perPage };
  }

  /**
   * Extrai e normaliza a identidade visual da loja ativa com fallbacks seguros.
   */
  function getStoreBranding(store = {}) {
    const s = store || {};
    const name = (s.name || '').trim() || 'Sua Loja';
    const color = (s.color || '').trim() || DEFAULT_BRAND_COLOR;
    const logoUrl = (s.logo_url || '').trim() || null;
    const slogan = (s.slogan || '').trim() || '';
    const whatsapp = (s.whatsapp || '').trim() || '';
    const address = (s.address || '').trim() || '';
    const hours = (s.hours || '').trim() || '';
    const segment = (s.store_segment || 'market').toLowerCase();
    const initial = name.charAt(0).toUpperCase() || 'E';

    return {
      name, color, logoUrl, slogan, whatsapp, address, hours,
      segment: ALLOWED_TEMPLATES.includes(segment) ? segment : 'market',
      initial
    };
  }

  /** Formata valores monetários em BRL. */
  function formatMoney(value) {
    if (value === undefined || value === null || value === '') return 'R$ 0,00';
    const num = Number(value);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Quebra "R$ X,XX" em partes para estilização separada do preço. */
  function splitPrice(value) {
    const str = formatMoney(value); // ex: "R$ 4,89"
    const match = str.match(/^(R\$\s*)([\d.]+),([\d]{2})$/);
    if (match) {
      return { symbol: match[1].trim(), integer: match[2], decimal: match[3] };
    }
    return { symbol: 'R$', integer: str.replace('R$ ', '').split(',')[0] || '0', decimal: '00' };
  }

  /** Sanitiza strings contra XSS. */
  function escapeHTML(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  /** Retorna a classe de grid CSS adequada. */
  function getGridClass(itemsPerPage) {
    switch (Number(itemsPerPage)) {
      case 4: return 'flyer-grid-4';
      case 6: return 'flyer-grid-6';
      case 8: return 'flyer-grid-8';
      case 9: return 'flyer-grid-9';
      default: return 'flyer-grid-6';
    }
  }

  // ────────────────────────────────────────────────────────────────
  // CABEÇALHOS
  // ────────────────────────────────────────────────────────────────

  function renderLogoHtml(branding) {
    const escapedName = escapeHTML(branding.name);
    const escapedInitial = escapeHTML(branding.initial);
    if (branding.logoUrl) {
      return `<img src="${escapeHTML(branding.logoUrl)}" alt="${escapedName}" class="flyer-header-logo-img" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"><span class="flyer-header-logo-fallback" style="display:none">${escapedInitial}</span>`;
    }
    return `<span class="flyer-header-logo-fallback">${escapedInitial}</span>`;
  }

  function renderHeader(branding, template, options = {}) {
    const logoHtml = renderLogoHtml(branding);

    if (template === 'fashion') {
      const subtitle = options.customSubtitle || branding.slogan || 'COLEÇÃO & OFERTAS EXCLUSIVAS';
      return `
        <header class="flyer-header" style="--brand-color:${escapeHTML(branding.color)};">
          <div class="flyer-header-left">
            <div class="flyer-logo-box">${logoHtml}</div>
            <div class="flyer-header-info">
              <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
              <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
            </div>
          </div>
          <div class="flyer-header-badge">LOOKS &amp; MODA</div>
        </header>
      `;
    }

    if (template === 'food') {
      const subtitle = options.customSubtitle || branding.slogan || 'CARDÁPIO DE OFERTAS';
      return `
        <header class="flyer-header" style="--brand-color:${escapeHTML(branding.color)};">
          <div class="flyer-header-left">
            <div class="flyer-logo-box">${logoHtml}</div>
            <div class="flyer-header-info">
              <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
              <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
            </div>
          </div>
          <div class="flyer-header-badge">DELIVERY &amp; PROMOS</div>
        </header>
      `;
    }

    // Padrão: Market (Estilo Supermercado Guanabara / CrieOferta)
    const subtitle = options.customSubtitle || branding.slogan || 'OFERTAS DA SEMANA · ECONOMIA DE VERDADE';
    return `
      <header class="flyer-header" style="--brand-color:${escapeHTML(branding.color)};">
        <div class="flyer-header-left">
          <div class="flyer-logo-box">${logoHtml}</div>
          <div class="flyer-header-info">
            <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
            <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
          </div>
        </div>
        <div class="flyer-header-badge">SUPER OFERTAS</div>
      </header>
      <div class="flyer-promo-banner">⚡ PREÇOS VÁLIDOS ENQUANTO DURAREM OS ESTOQUES · CONFIRA NOSSAS OFERTAS!</div>
    `;
  }

  // ────────────────────────────────────────────────────────────────
  // CARDS DE PRODUTO
  // ────────────────────────────────────────────────────────────────

  function renderCardImage(product, name) {
    const rawImage = product?.image || product?.image_url || product?.img || '';
    const hasImage = Boolean(rawImage && String(rawImage).trim());
    const placeholderHtml = `
      <div class="flyer-card-no-img">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Sem Foto</span>
      </div>
    `;

    if (!hasImage) {
      return placeholderHtml;
    }

    const safeUrl = escapeHTML(String(rawImage).trim());
    return `
      <img src="${safeUrl}" alt="${name}" class="flyer-card-img" crossorigin="anonymous" referrerpolicy="no-referrer" loading="eager" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';">
      <div class="flyer-card-no-img" style="display:none">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Sem Foto</span>
      </div>
    `;
  }

  function renderProductCard(product, template, branding) {
    const name = escapeHTML(product.name || 'Produto sem nome');
    const category = escapeHTML(product.category || '');
    const unit = product.unit ? `${escapeHTML(product.unit)}` : '';
    const imageHtml = renderCardImage(product, name);

    const promo = Number(product.promo_price);
    const regular = Number(product.price);
    const hasPromo = !isNaN(promo) && promo > 0 && promo < regular;

    if (template === 'fashion') {
      const brand = product.brand ? `<span class="flyer-card-brand">${escapeHTML(product.brand)}</span>` : '';
      const sizeTag = product.size ? `<span class="flyer-tag">Tam: ${escapeHTML(product.size)}</span>` : '';
      const colorTag = product.color ? `<span class="flyer-tag">${escapeHTML(product.color)}</span>` : '';

      return `
        <div class="flyer-card">
          <div class="flyer-card-img-wrap">
            ${imageHtml}
            ${hasPromo ? '<span class="flyer-tag-promo">OFF</span>' : ''}
          </div>
          <div class="flyer-card-body">
            ${brand}
            ${category ? `<span class="flyer-card-cat" style="display:none">${category}</span>` : ''}
            <h3 class="flyer-card-title">${name}</h3>
            ${(sizeTag || colorTag) ? `<div class="flyer-tags-wrap">${sizeTag}${colorTag}</div>` : ''}
            <div class="flyer-card-prices">
              ${hasPromo ? `
                <div class="flyer-price-from">De ${formatMoney(regular)}</div>
                <div class="flyer-price-main">Por ${formatMoney(promo)}<span class="flyer-unit">${unit ? ` /${unit}` : ''}</span></div>
              ` : `
                <div class="flyer-price-single">${formatMoney(regular)}<span class="flyer-unit">${unit ? ` /${unit}` : ''}</span></div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    if (template === 'food') {
      const desc = product.description ? `<p class="flyer-card-desc">${escapeHTML(product.description)}</p>` : '';
      return `
        <div class="flyer-card">
          <div class="flyer-card-img-wrap">
            ${imageHtml}
            ${hasPromo ? '<span class="flyer-tag-promo">PROMOÇÃO</span>' : ''}
          </div>
          <div class="flyer-card-body">
            ${category ? `<span class="flyer-card-cat">${category}</span>` : ''}
            <h3 class="flyer-card-title">${name}</h3>
            ${desc}
            <div class="flyer-card-prices">
              ${hasPromo ? `
                <div class="flyer-price-from">De ${formatMoney(regular)}</div>
                <div class="flyer-price-main">${formatMoney(promo)}<span class="flyer-unit">${unit ? ` /${unit}` : ''}</span></div>
              ` : `
                <div class="flyer-price-single">${formatMoney(regular)}<span class="flyer-unit">${unit ? ` /${unit}` : ''}</span></div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    // Market — estilo "cartazete de supermercado" com preço grande em destaque (estilo Guanabara & CrieOferta)
    const price = hasPromo ? promo : regular;
    const parts = splitPrice(price);

    return `
      <div class="flyer-card">
        <div class="flyer-card-img-wrap">
          ${imageHtml}
          ${hasPromo ? '<span class="flyer-tag-promo">OFERTA</span>' : ''}
        </div>
        <div class="flyer-card-body">
          ${category ? `<span class="flyer-card-cat">${category}</span>` : ''}
          <h3 class="flyer-card-title">${name}</h3>
          <div class="flyer-card-prices">
            ${hasPromo ? `<div class="flyer-price-from">De: ${formatMoney(regular)}</div>` : ''}
            <div class="flyer-price-main-wrap">
              ${hasPromo
                ? `<div class="flyer-price-main" style="color:var(--brand-color,#e94560);">
                     <span class="currency">R$</span><span class="int">${parts.integer}</span><sup class="dec">,${parts.decimal}</sup>
                     ${unit ? `<span class="flyer-unit">/${unit}</span>` : ''}
                   </div>`
                : `<div class="flyer-price-single">
                     <span class="currency">R$</span><span class="int">${parts.integer}</span><sup class="dec">,${parts.decimal}</sup>
                     ${unit ? `<span class="flyer-unit">/${unit}</span>` : ''}
                   </div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ────────────────────────────────────────────────────────────────
  // RODAPÉ
  // ────────────────────────────────────────────────────────────────

  function renderFooter(branding, pageIndex, totalPages) {
    const phone = branding.whatsapp ? `WhatsApp: ${escapeHTML(branding.whatsapp)}` : '';
    const addr = branding.address ? escapeHTML(branding.address) : '';
    const hours = branding.hours ? escapeHTML(branding.hours) : '';
    const contacts = [phone, addr, hours].filter(Boolean).join(' · ');

    return `
      <footer class="flyer-footer">
        <div class="flyer-footer-info" style="flex:1;min-width:0;">
          ${contacts ? `<span class="flyer-footer-contact">${contacts}</span>` : ''}
          <span style="opacity:0.7;">Ofertas válidas enquanto durarem os estoques. Imagens meramente ilustrativas.</span>
        </div>
        <div class="flyer-footer-page">Pág. ${pageIndex + 1}/${totalPages}</div>
      </footer>
    `;
  }

  // ────────────────────────────────────────────────────────────────
  // RENDERIZAÇÃO COMPLETA DE PÁGINA
  // ────────────────────────────────────────────────────────────────

  /**
   * Renderiza uma página completa de encarte em proporção A4.
   *
   * @param {Array}  pageProducts  - Produtos desta página
   * @param {number} pageIndex     - Índice 0-based
   * @param {number} totalPages    - Total de páginas
   * @param {Object} store         - Dados da loja ativa
   * @param {Object} options       - { template, itemsPerPage, customSubtitle }
   * @returns {string} HTML da folha
   */
  function renderPage(pageProducts = [], pageIndex = 0, totalPages = 1, store = {}, options = {}) {
    const branding = getStoreBranding(store);
    const template = ALLOWED_TEMPLATES.includes(options.template)
      ? options.template
      : branding.segment;
    const itemsPerPage = ALLOWED_ITEMS_PER_PAGE.includes(Number(options.itemsPerPage))
      ? Number(options.itemsPerPage)
      : DEFAULT_ITEMS_PER_PAGE;

    const gridClass = getGridClass(itemsPerPage);
    const headerHtml = renderHeader(branding, template, options);
    const footerHtml = renderFooter(branding, pageIndex, totalPages);
    const cardsHtml = pageProducts.map(p => renderProductCard(p, template, branding)).join('');

    return `
      <div
        class="flyer-page-sheet flyer-theme-${template}"
        data-page-index="${pageIndex}"
        style="--brand-color: ${escapeHTML(branding.color)};"
      >
        ${headerHtml}
        <main class="flyer-grid-container ${gridClass}">
          ${cardsHtml}
        </main>
        ${footerHtml}
      </div>
    `;
  }

  return {
    paginate,
    getStoreBranding,
    renderPage,
    renderProductCard,
    renderHeader,
    renderFooter,
    formatMoney,
    escapeHTML,
    ALLOWED_ITEMS_PER_PAGE,
    ALLOWED_TEMPLATES,
    DEFAULT_ITEMS_PER_PAGE
  };
})();

if (typeof window !== 'undefined') {
  window.FlyerTemplates = FlyerTemplates;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlyerTemplates;
}
