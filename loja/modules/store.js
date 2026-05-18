/**
 * EncartShop — Loja Pública / StoreContext
 * Gerencia a recuperação da loja, SEO e temas. Única dependência central do boot.
 */

window.StoreContext = (() => {
  let activeStore = null;
  let isOwner = false;

  async function init() {
    EventBus.log('StoreContext', 'Iniciando módulo...');
    const urlParams = new URLSearchParams(window.location.search);
    let storeId = urlParams.get('s') || urlParams.get('id');

    // Se não houver param na URL, tenta pegar do path (/loja/slug)
    if (!storeId && window.location.pathname.startsWith('/loja/')) {
      const parts = window.location.pathname.split('/');
      storeId = parts[parts.length - 1];
    }

    if (!storeId) throw new Error('Link da loja inválido. Verifique o link recebido.');

    // 1. Busca loja por UUID ou slug
    let storeData = await EncartAPI.StoreAPI.getById(storeId);
    if (!storeData) storeData = await EncartAPI.StoreAPI.getBySlug(storeId);
    if (!storeData) throw new Error('Loja não encontrada. Verifique o link com o lojista.');

    activeStore = storeData;

    // 2. Verifica se o usuário logado é o dono desta loja
    const user = await AuthService.getUser();
    isOwner = user && user.id === activeStore.user_id;

    // 3. Verifica bloqueio inteligente
    const availability = SubscriptionModule.getPublicAvailability(activeStore);
    if (!availability.available && !isOwner) {
      renderBlockedScreen(availability.reason);
      throw new Error(`Loja indisponível: ${availability.reason}`);
    }

    // 4. Indexação SEO e Headers
    handleIndexing(availability.available);
    if (isOwner && !availability.available) injectPreviewBanner();

    // 5. Aplicar Cores
    if (activeStore.color) {
      document.documentElement.style.setProperty('--accent', activeStore.color);
      document.documentElement.style.setProperty('--brand', activeStore.color);
      document.documentElement.style.setProperty('--brand-dark', _darkenColor(activeStore.color));
      document.documentElement.style.setProperty('--brand-glow', activeStore.color + '22');
    }

    // 6. Aplicar identidade visual (logo + branding)
    applyBranding(activeStore);

    EventBus.log('StoreContext', 'Loja carregada com sucesso', { id: activeStore.id });
    EventBus.emit(EventBus.EVENTS.STORE_LOADED, { store: activeStore, isOwner });
  }

  /**
   * Injeta a logo no header da vitrine pública e atualiza meta tags OG inline.
   * Fallback: exibe a inicial do nome da loja em fundo colorido.
   */
  function applyBranding(store) {
    const logoEl = document.getElementById('store-logo-el');
    if (!logoEl) return;

    if (store.logo_url) {
      // Substitui o ícone placeholder por imagem real
      logoEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = store.logo_url;
      img.alt = store.name || 'Logo';
      img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:10px;';
      img.onerror = () => {
        // Fallback se a URL falhar
        logoEl.innerHTML = `<span style="font-weight:900;color:#fff;">${(store.name||'L').charAt(0).toUpperCase()}</span>`;
      };
      logoEl.appendChild(img);
    } else {
      // Fallback: inicial do nome da loja
      logoEl.innerHTML = `<span style="font-weight:900;color:#fff;font-size:1rem;">${(store.name||'L').charAt(0).toUpperCase()}</span>`;
    }

    // Atualiza og:image inline se existir placeholder
    if (store.logo_url) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.setAttribute('content', store.logo_url);
      const twImg = document.querySelector('meta[property="twitter:image"]');
      if (twImg) twImg.setAttribute('content', store.logo_url);
    }
  }

  function getStore() { return activeStore; }

  // ── Helpers Internos ────────────────────────────────────────
  function handleIndexing(isAvailable) {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = isAvailable ? 'index, follow' : 'noindex, nofollow';
  }

  function renderBlockedScreen(reason) {
    let title = "Loja Temporariamente Indisponível";
    let desc = "Esta loja está em manutenção ou com assinatura pendente.";
    let icon = "🏪";

    if (reason === 'pending' || reason === 'pending_expired') {
      title = "Loja ainda não ativada";
      desc  = "Esta vitrine está sendo preparada e ainda não foi publicada pelo lojista.";
      icon  = "🛠️";
    } else if (reason === 'subscription_expired') {
      title = "Assinatura Vencida";
      desc  = "Esta loja suspendeu as atividades temporariamente. Tente novamente mais tarde.";
      icon  = "⌛";
    }

    document.body.innerHTML = `
      <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;background:#f8fafc;">
        <div style="font-size:4rem;margin-bottom:20px">${icon}</div>
        <h1 style="font-size:1.4rem;color:#0f172a;margin-bottom:8px">${title}</h1>
        <p style="color:#64748b;max-width:380px;line-height:1.6">${desc}</p>
        <a href="/" style="margin-top:24px;color:#4f46e5;text-decoration:none;font-weight:600">← Voltar ao EncartShop</a>
      </div>`;
  }

  function injectPreviewBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: #1e293b; color: #fff; padding: 10px 20px;
      text-align: center; font-size: 0.8rem; font-weight: 600;
      display: flex; align-items: center; justify-content: center; gap: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    banner.innerHTML = `
      <span>🕵️ MODO PREVIEW: Esta loja não está visível para clientes.</span>
      <a href="/admin/pagamento.html" style="background:#4f46e5; color:#fff; padding:4px 12px; border-radius:6px; text-decoration:none;">Ativar Agora</a>
    `;
    document.body.prepend(banner);
    document.body.style.paddingTop = "40px";
  }

  function _darkenColor(hex) {
    try {
      const n = parseInt(hex.replace('#',''), 16);
      const r = Math.max(0, (n >> 16 & 255) - 40);
      const g = Math.max(0, (n >>  8 & 255) - 40);
      const b = Math.max(0, (n       & 255) - 40);
      return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    } catch { return hex; }
  }

  return { init, getStore };
})();
