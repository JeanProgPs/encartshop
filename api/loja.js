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
    // 1. Busca dados da loja no Supabase via REST API (evita dependência pesada do SDK)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stores?slug=eq.${slug}&select=*`, {
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
    const storeDesc = store.slogan || store.banner_text || 'Confira nossas ofertas e faça seu pedido pelo WhatsApp!';
    const storeUrl  = `https://encartshop.com/loja/${slug}`;
    
    // Lógica de fallback para imagem: Banner -> Logo -> Default
    const storeImage = store.banner_url || store.logo_url || 'https://encartshop.com/assets/preview-default.png';

    // 4. Injeta metadados no HEAD
    // Remove tags estáticas se existirem para evitar duplicidade
    html = html.replace(/<title>.*?<\/title>/, `<title>${storeName} — EncartShop</title>`);
    html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${storeDesc}">`);

    const metaTags = `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${storeUrl}">
    <meta property="og:title" content="${storeName} — EncartShop">
    <meta property="og:description" content="${storeDesc}">
    <meta property="og:image" content="${storeImage}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${storeUrl}">
    <meta property="twitter:title" content="${storeName} — EncartShop">
    <meta property="twitter:description" content="${storeDesc}">
    <meta property="twitter:image" content="${storeImage}">
    `;

    // Insere as novas tags antes do fechamento do </head>
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
