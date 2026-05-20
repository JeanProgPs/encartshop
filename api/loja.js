const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).send('Slug is required');
  }

  const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

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

