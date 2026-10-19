/**
 * EncartShop — FlyerTemplates Module (Etapa 3)
 * Gerenciamento de modelos visuais, identidade da loja e paginação automática
 * para o Gerador de Encartes.
 */

const FlyerTemplates = (() => {
  const DEFAULT_BRAND_COLOR = '#e94560';
  const DEFAULT_ITEMS_PER_PAGE = 6;
  const ALLOWED_ITEMS_PER_PAGE = [4, 6, 8, 9];
  const ALLOWED_TEMPLATES = ['market', 'food', 'fashion'];

  /**
   * Divide uma lista de produtos em páginas com tamanho fixo.
   * Não duplica nem descarta nenhum produto.
   *
   * @param {Array} products - Lista de produtos selecionados
   * @param {number} itemsPerPage - 4, 6, 8 ou 9
   * @returns {Object} { pages, totalPages, totalProducts, itemsPerPage }
   */
  function paginate(products = [], itemsPerPage = DEFAULT_ITEMS_PER_PAGE) {
    const list = Array.isArray(products) ? [...products] : [];
    const perPage = ALLOWED_ITEMS_PER_PAGE.includes(Number(itemsPerPage))
      ? Number(itemsPerPage)
      : DEFAULT_ITEMS_PER_PAGE;

    if (list.length === 0) {
      return {
        pages: [],
        totalPages: 0,
        totalProducts: 0,
        itemsPerPage: perPage
      };
    }

    const pages = [];
    for (let i = 0; i < list.length; i += perPage) {
      pages.push(list.slice(i, i + perPage));
    }

    return {
      pages,
      totalPages: pages.length,
      totalProducts: list.length,
      itemsPerPage: perPage
    };
  }

  /**
   * Extrai e normaliza a identidade visual da loja ativa com fallbacks seguros.
   * @param {Object} store
   * @returns {Object}
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

    // Iniciais para fallback caso não haja logo
    const initial = name.charAt(0).toUpperCase() || 'E';

    return {
      name,
      color,
      logoUrl,
      slogan,
      whatsapp,
      address,
      hours,
      segment: ALLOWED_TEMPLATES.includes(segment) ? segment : 'market',
      initial
    };
  }

  /**
   * Formata valores monetários em padrão BRL.
   */
  function formatMoney(value) {
    if (value === undefined || value === null || value === '') return 'R$ 0,00';
    const num = Number(value);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Sanitiza strings contra XSS.
   */
  function escapeHTML(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  /**
   * Determina a classe de grid CSS adequada para a densidade de itens por página.
   */
  function getGridClass(itemsPerPage) {
    switch (Number(itemsPerPage)) {
      case 4:
        return 'flyer-grid-4'; // 2x2
      case 6:
        return 'flyer-grid-6'; // 3x2 ou 2x3
      case 8:
        return 'flyer-grid-8'; // 4x2
      case 9:
        return 'flyer-grid-9'; // 3x3
      default:
        return 'flyer-grid-6';
    }
  }

  /**
   * Renderiza o cabeçalho institucional do encarte.
   */
  function renderHeader(branding, template, options = {}) {
    const subtitle = options.customSubtitle || branding.slogan || (
      template === 'fashion' ? 'COLEÇÃO & OFERTAS EXCLUSIVAS' :
      template === 'food' ? 'CARDÁPIO DE OFERTAS & SABORES' :
      'OFERTAS DA SEMANA'
    );

    const logoHtml = branding.logoUrl
      ? `<img src="${escapeHTML(branding.logoUrl)}" alt="${escapeHTML(branding.name)}" class="flyer-header-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'flyer-header-logo-fallback\\'>${escapeHTML(branding.initial)}</span>'">`
      : `<span class="flyer-header-logo-fallback">${escapeHTML(branding.initial)}</span>`;

    if (template === 'fashion') {
      return `
        <header class="flyer-header flyer-header-fashion" style="--brand-color: ${escapeHTML(branding.color)};">
          <div class="flyer-header-left">
            <div class="flyer-logo-box">${logoHtml}</div>
            <div class="flyer-header-info">
              <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
              <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
            </div>
          </div>
          <div class="flyer-header-badge-fashion">
            <span>LOOKS & OFERTAS</span>
          </div>
        </header>
      `;
    }

    if (template === 'food') {
      return `
        <header class="flyer-header flyer-header-food" style="--brand-color: ${escapeHTML(branding.color)};">
          <div class="flyer-header-left">
            <div class="flyer-logo-box">${logoHtml}</div>
            <div class="flyer-header-info">
              <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
              <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
            </div>
          </div>
          <div class="flyer-header-badge-food">
            <span>DELIVERY & PROMOÇÕES</span>
          </div>
        </header>
      `;
    }

    // Padrão: Mercado
    return `
      <header class="flyer-header flyer-header-market" style="--brand-color: ${escapeHTML(branding.color)};">
        <div class="flyer-header-left">
          <div class="flyer-logo-box">${logoHtml}</div>
          <div class="flyer-header-info">
            <h1 class="flyer-store-title">${escapeHTML(branding.name)}</h1>
            <p class="flyer-store-subtitle">${escapeHTML(subtitle)}</p>
          </div>
        </div>
        <div class="flyer-header-badge-market">
          <span>SUPER OFERTAS</span>
        </div>
      </header>
    `;
  }

  /**
   * Renderiza um card de produto de acordo com o modelo selecionado.
   */
  function renderProductCard(product, template, branding) {
    const defaultImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="%23f4f4f5"><rect width="100%" height="100%" fill="%23f4f4f5"/><text x="50%" y="50%" fill="%23a1a1aa" font-family="sans-serif" font-size="12" text-anchor="middle" dy=".3em">Sem Foto</text></svg>';
    const imgUrl = product.image ? escapeHTML(product.image) : defaultImg;
    const name = escapeHTML(product.name || 'Produto sem nome');
    const category = escapeHTML(product.category || '');
    const unit = product.unit ? `/${escapeHTML(product.unit)}` : '';
    
    // Validação de Preço Promocional Real
    const promo = Number(product.promo_price);
    const regular = Number(product.price);
    const hasPromo = !isNaN(promo) && promo > 0 && promo < regular;

    const promoFormatted = hasPromo ? formatMoney(promo) : null;
    const regularFormatted = formatMoney(regular);

    // Template 1: Fashion (Moda)
    if (template === 'fashion') {
      const brand = product.brand ? `<span class="flyer-card-brand">${escapeHTML(product.brand)}</span>` : '';
      const sizeTag = product.size ? `<span class="flyer-tag">Tam: ${escapeHTML(product.size)}</span>` : '';
      const colorTag = product.color ? `<span class="flyer-tag">${escapeHTML(product.color)}</span>` : '';

      return `
        <div class="flyer-card flyer-card-fashion">
          <div class="flyer-card-img-wrap">
            <img src="${imgUrl}" alt="${name}" class="flyer-card-img" onerror="this.src='${defaultImg}'">
            ${hasPromo ? '<span class="flyer-tag-promo">OFF</span>' : ''}
          </div>
          <div class="flyer-card-body">
            <div class="flyer-card-meta">
              ${brand}
              ${category ? `<span class="flyer-card-cat">${category}</span>` : ''}
            </div>
            <h3 class="flyer-card-title">${name}</h3>
            ${(sizeTag || colorTag) ? `<div class="flyer-tags-wrap">${sizeTag}${colorTag}</div>` : ''}
            <div class="flyer-card-prices">
              ${hasPromo ? `
                <div class="flyer-price-regular">De ${regularFormatted}</div>
                <div class="flyer-price-promo" style="color: ${escapeHTML(branding.color)};">
                  Por ${promoFormatted} <span class="flyer-unit">${unit}</span>
                </div>
              ` : `
                <div class="flyer-price-single">
                  ${regularFormatted} <span class="flyer-unit">${unit}</span>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    // Template 2: Food (Alimentação)
    if (template === 'food') {
      const desc = product.description ? `<p class="flyer-card-desc">${escapeHTML(product.description)}</p>` : '';

      return `
        <div class="flyer-card flyer-card-food">
          <div class="flyer-card-img-wrap">
            <img src="${imgUrl}" alt="${name}" class="flyer-card-img" onerror="this.src='${defaultImg}'">
            ${hasPromo ? '<span class="flyer-tag-promo">PROMOÇÃO</span>' : ''}
          </div>
          <div class="flyer-card-body">
            ${category ? `<span class="flyer-card-cat">${category}</span>` : ''}
            <h3 class="flyer-card-title">${name}</h3>
            ${desc}
            <div class="flyer-card-prices">
              ${hasPromo ? `
                <div class="flyer-price-regular">De ${regularFormatted}</div>
                <div class="flyer-price-promo" style="color: ${escapeHTML(branding.color)};">
                  ${promoFormatted} <span class="flyer-unit">${unit}</span>
                </div>
              ` : `
                <div class="flyer-price-single" style="color: ${escapeHTML(branding.color)};">
                  ${regularFormatted} <span class="flyer-unit">${unit}</span>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    // Template 3: Market (Mercado / Variedades) - Padrão
    return `
      <div class="flyer-card flyer-card-market">
        <div class="flyer-card-img-wrap">
          <img src="${imgUrl}" alt="${name}" class="flyer-card-img" onerror="this.src='${defaultImg}'">
          ${hasPromo ? '<span class="flyer-tag-promo">OFERTA</span>' : ''}
        </div>
        <div class="flyer-card-body">
          ${category ? `<span class="flyer-card-cat">${category}</span>` : ''}
          <h3 class="flyer-card-title">${name}</h3>
          <div class="flyer-card-prices">
            ${hasPromo ? `
              <div class="flyer-price-regular">De: ${regularFormatted}</div>
              <div class="flyer-price-highlight" style="color: ${escapeHTML(branding.color)};">
                <span class="flyer-price-por">Por:</span> ${promoFormatted} <span class="flyer-unit">${unit}</span>
              </div>
            ` : `
              <div class="flyer-price-highlight">
                ${regularFormatted} <span class="flyer-unit">${unit}</span>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza o rodapé institucional do encarte.
   */
  function renderFooter(branding, pageIndex, totalPages) {
    const phone = branding.whatsapp ? `WhatsApp: ${escapeHTML(branding.whatsapp)}` : '';
    const addr = branding.address ? escapeHTML(branding.address) : '';
    const contacts = [phone, addr].filter(Boolean).join(' • ');

    return `
      <footer class="flyer-footer">
        <div class="flyer-footer-info">
          ${contacts ? `<span class="flyer-footer-contact">${contacts}</span>` : ''}
          <span class="flyer-footer-disclaimer">Ofertas válidas enquanto durarem os estoques. Fotos meramente ilustrativas.</span>
        </div>
        <div class="flyer-footer-page">
          Página ${pageIndex + 1} de ${totalPages}
        </div>
      </footer>
    `;
  }

  /**
   * Renderiza uma página completa de encarte em proporção A4.
   *
   * @param {Array} pageProducts - Produtos atribuídos a esta página
   * @param {number} pageIndex - Índice da página (0-based)
   * @param {number} totalPages - Total de páginas
   * @param {Object} store - Dados da loja ativa
   * @param {Object} options - { template, itemsPerPage, customSubtitle }
   * @returns {string} HTML da folha de encarte
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
        class="flyer-page-sheet flyer-theme-${template} ${gridClass}"
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
