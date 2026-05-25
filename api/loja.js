const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).send('Slug is required');
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_KEY } = require('../js/core/supabase');

  try {
    // 1. Identifica se o parâmetro 'slug' é um UUID válido para determinar a coluna de busca
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);
    const queryParam = isUUID ? `id=eq.${slug}` : `slug=eq.${slug}`;

    // 2. Busca dados da loja no Supabase via REST API (evita dependência pesada do SDK)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?${queryParam}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const stores = await response.json();
    const store = stores && stores.length > 0 ? stores[0] : null;

    // 2. Lê o index.html da loja
    const filePath = path.join(process.cwd(), 'loja', 'index.html');
    let html = fs.readFileSync(filePath, 'utf8');

    if (!store) {
      // Retorna o HTML padrão se a loja não existir (o JS da loja tratará o erro)
      return res.status(200).send(html);
    }

    // 2.5. Busca os 12 principais produtos ativos para pré-renderização (SSR Híbrido SEO)
    let activeProducts = [];
    try {
      const prodResponse = await fetch(`${SUPABASE_URL}/rest/v1/products?store_id=eq.${store.id}&active=eq.true&order=name.asc&limit=12&select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      const products = await prodResponse.json();
      if (Array.isArray(products)) {
        activeProducts = products;
      }
    } catch (err) {
      console.error('Error fetching products for SSR SEO:', err);
    }

    // 3. Prepara metadados dinâmicos
    const storeName = store.name || 'Loja';
    const storeDesc = store.slogan || store.banner_text || 'Encontre os melhores produtos para pedir direto pelo WhatsApp.';
    const storeUrl  = `https://encartshop.com/loja/${store.slug || slug}`;
    const storeImage = store.banner_url || store.logo_url || 'https://encartshop.com/assets/preview-default.png';
    const robotsPolicy = getRobotsPolicy(req.headers.host);

    // 4. Injeta metadados no HEAD
    html = html.replace(/<title>.*?<\/title>/, `<title>${storeName} — EncartShop</title>`);
    html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${storeDesc}">`);
    html = html.replace(/<link rel="canonical" href=".*?">/, `<link rel="canonical" href="${storeUrl}">`);
    html = html.replace(/<meta name="robots" content=".*?">/, `<meta name="robots" content="${robotsPolicy}">`);

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Store",
          "name": storeName,
          "description": storeDesc,
          "url": storeUrl,
          "image": storeImage,
          "logo": storeImage,
          "telephone": store.phone || undefined,
          "address": store.address ? {
            "@type": "PostalAddress",
            "streetAddress": store.address
          } : undefined,
          "sameAs": Array.isArray(store.social_links) && store.social_links.length ? store.social_links : undefined
        },
        {
          "@type": "Organization",
          "name": "EncartShop",
          "url": "https://encartshop.com",
          "logo": "https://encartshop.com/assets/favicon.png",
          "sameAs": [
            "https://www.facebook.com/encartshop",
            "https://www.instagram.com/encartshop"
          ]
        }
      ].filter(Boolean)
    };

    const metaTags = `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="EncartShop">
    <meta property="og:url" content="${storeUrl}">
    <meta property="og:title" content="${storeName} — EncartShop">
    <meta property="og:description" content="${storeDesc}">
    <meta property="og:image" content="${storeImage}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${storeUrl}">
    <meta name="twitter:title" content="${storeName} — EncartShop">
    <meta name="twitter:description" content="${storeDesc}">
    <meta name="twitter:image" content="${storeImage}">

    <meta name="robots" content="${robotsPolicy}">
    <link rel="canonical" href="${storeUrl}">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    `;

    html = html.replace('</head>', `${metaTags}\n</head>`);

    // 4.5. Pré-renderiza produtos ativos para SEO (SSR Híbrido)
    if (activeProducts.length > 0) {
      const staticCardsHTML = activeProducts.map(p => {
        const isPromo = !!p.promo_price;
        const unit = p.unit || 'un';
        const defaultImg = 'https://images.placeholders.dev/?width=400&height=400&text=Sem%20Imagem&bgColor=%23f1f5f9&textColor=%2364748b';
        const img = escapeHTML(p.image) || defaultImg;
        const priceNormal = fmtPriceLocal(p.price);
        const pricePromo = isPromo ? fmtPriceLocal(p.promo_price) : '';
        const nameEscaped = escapeHTML(p.name);

        return `
      <div class="product-card" id="prod-static-${p.id}">
        <div class="product-image-wrap">
          <img src="${img}" alt="${nameEscaped}" loading="lazy">
          ${isPromo ? `<div class="promo-badge">🔥 OFERTA</div>` : ''}
        </div>
        <div class="product-info">
          <div class="product-name" title="${nameEscaped}">${nameEscaped}</div>
          <div class="product-price-row">
            ${isPromo 
              ? `<div class="price-normal">${priceNormal}</div><div class="price-promo">${pricePromo}</div>`
              : `<div class="price-regular">${priceNormal}</div>`
            }
            <span class="product-unit-label">/${unit}</span>
          </div>
          <div class="product-card-actions">
            <button class="btn-add-cart">
              <span>Adicionar</span>
            </button>
          </div>
        </div>
      </div>`;
      }).join('\n');

      const productsGridHTML = `
    <div class="category-group">
      <div class="category-group-header">
        <span class="category-group-title">Destaques</span>
        <span class="category-group-count">${activeProducts.length}</span>
        <div class="category-group-line"></div>
      </div>
      <div class="product-grid">
        ${staticCardsHTML}
      </div>
    </div>`;

      html = html.replace('<div id="products-area">', `<div id="products-area">\n${productsGridHTML}`);
    }

    // 5. Retorna o HTML modificado
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Error in api/loja:', error);
    // Fallback para o HTML original em caso de erro no servidor
    try {
      const filePath = path.join(process.cwd(), 'loja', 'index.html');
      const html = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch (e) {
      return res.status(500).send('Internal Server Error');
    }
  }
};

function getRobotsPolicy(host) {
  if (!host) return 'noindex, nofollow';
  const normalized = host.toLowerCase();
  const isProduction = normalized === 'encartshop.com' || normalized === 'www.encartshop.com' || normalized.endsWith('.encartshop.com');
  return isProduction ? 'index, follow' : 'noindex, nofollow';
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtPriceLocal(v) {
  if (v === undefined || v === null) return 'R$ 0,00';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

