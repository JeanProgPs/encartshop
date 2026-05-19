/**
 * EncartShop — UI Components v2
 * Toast com 4 tipos, skeleton loader, sidebar mobile, modal helpers.
 */

const UIComponents = (() => {

  // ── Toast (4 tipos: success | error | warning | info) ────────
  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:320px;';
      document.body.appendChild(container);
    }
    const palette = {
      success: { bg: '#22c55e', icon: '✅' },
      error:   { bg: '#ef4444', icon: '❌' },
      warning: { bg: '#f59e0b', icon: '⚠️' },
      info:    { bg: '#3b82f6', icon: 'ℹ️' }
    };
    const s = palette[type] || palette.info;
    const toast = document.createElement('div');
    toast.style.cssText = `
      background:${s.bg};color:#fff;padding:12px 16px;border-radius:10px;
      box-shadow:0 4px 20px rgba(0,0,0,0.25);font-size:0.875rem;font-weight:500;
      display:flex;align-items:center;gap:10px;pointer-events:all;
      animation:encart-slide-in 0.3s ease;`;
    toast.innerHTML = `<span style="font-size:1rem;flex-shrink:0">${s.icon}</span>`;
    const textNode = document.createElement('span');
    textNode.textContent = message;
    toast.appendChild(textNode);
    container.appendChild(toast);
    const ms = type === 'error' ? 5000 : 3500;
    setTimeout(() => {
      toast.style.animation = 'encart-fade-out 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, ms);
  }

  // ── Sidebar Admin ────────────────────────────────────────────
  function renderSidebar(activeItem) {
    let sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      sidebar = document.createElement('aside');
      sidebar.className = 'sidebar';
      sidebar.id = 'sidebar';
      document.body.prepend(sidebar);
    }

    sidebar.innerHTML = `
      <div class="sidebar-logo">
        <div id="sidebar-logo-container" style="width:42px;height:42px;background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;margin-bottom:10px;box-shadow:var(--shadow-brand);overflow:hidden;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        </div>
        <div class="logo-text">
          <span class="brand">EncartShop</span>
          <span class="sub" style="font-size:0.7rem;color:var(--text-muted)">Painel do Lojista</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Menu</div>
        <a href="dashboard.html" class="nav-item ${activeItem==='dashboard'?'active':''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>Dashboard</span>
        </a>
        <a href="produtos.html" class="nav-item ${activeItem==='produtos'?'active':''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <span>Produtos</span>
        </a>
        <a href="pedidos.html" class="nav-item ${activeItem==='pedidos'?'active':''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span>Pedidos</span>
        </a>
        <a href="configuracoes.html" class="nav-item ${activeItem==='configuracoes'?'active':''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></svg>
          <span>Configurações</span>
        </a>
      </nav>
      <div class="sidebar-footer" style="padding:16px 12px">
        <a href="#" id="view-store-btn" target="_blank" class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:16px;font-size:0.85rem">👁️ Ver Loja</a>
        <div style="display:flex;align-items:center;gap:10px">
          <div id="sidebar-avatar-placeholder" style="width:36px;height:36px;background:rgba(255,255,255,0.05);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;overflow:hidden;flex-shrink:0;">👤</div>
          <div style="flex:1;overflow:hidden">
            <div id="sidebar-store-name" style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Carregando...</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">Administrador</div>
          </div>
          <button id="nav-logout" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;font-size:1.2rem" title="Sair">🚪</button>
        </div>
      </div>`;

    // ── Overlay para fechar sidebar no mobile ────────────────
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:199;backdrop-filter:blur(2px)';
      overlay.addEventListener('click', closeSidebar);
      document.body.appendChild(overlay);
    }

    // ── Botão hamburguer no header ───────────────────────────
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      const header = mainContent.querySelector('header');
      if (header && !header.querySelector('.mobile-toggle')) {
        const btn = document.createElement('button');
        btn.className = 'mobile-toggle';
        btn.setAttribute('aria-label', 'Abrir menu');
        btn.innerHTML = `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
        btn.style.cssText = 'background:none;border:none;color:var(--text);cursor:pointer;padding:4px;display:flex;align-items:center;margin-right:12px;flex-shrink:0';
        btn.addEventListener('click', openSidebar);
        header.prepend(btn);
      }
    }

    // ── Logout ────────────────────────────────────────────────
    sidebar.querySelector('#nav-logout')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await AuthService.logout();
      window.location.replace('index.html');
    });

    // ── Nome da loja e logo na sidebar ─────────────────────────
    StoreModule.getActive().then(store => {
      if (!store) return;
      const nameEl = sidebar.querySelector('#sidebar-store-name');
      if (nameEl) nameEl.textContent = store.name;
      const viewBtn = sidebar.querySelector('#view-store-btn');
      if (viewBtn) viewBtn.href = StoreModule.getStoreUrl(store);

      // Dynamic Logo Injection
      if (store.logo_url) {
        const logoContainer = sidebar.querySelector('#sidebar-logo-container');
        if (logoContainer) {
          logoContainer.innerHTML = `<img src="${store.logo_url}" alt="${store.name}" style="width:100%;height:100%;object-fit:cover;">`;
        }
        const avatarEl = sidebar.querySelector('#sidebar-avatar-placeholder');
        if (avatarEl) {
          avatarEl.innerHTML = `<img src="${store.logo_url}" alt="${store.name}" style="width:100%;height:100%;object-fit:cover;">`;
        }
      }
    }).catch(() => {/* silencioso */});
  }

  function openSidebar() {
    document.getElementById('sidebar')?.classList.add('active');
    const ov = document.getElementById('sidebar-overlay');
    if (ov) ov.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('active');
    const ov = document.getElementById('sidebar-overlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Modal ────────────────────────────────────────────────────
  function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) { overlay.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) { overlay.classList.add('hidden'); document.body.style.overflow = ''; }
  }

  function handleOverlayClick(event, id) {
    if (event.target.id === id) closeModal(id);
  }

  // ── Button Loading ────────────────────────────────────────────
  function setLoading(btn, isLoading, originalText = '') {
    if (!btn) return;
    if (isLoading) {
      btn._savedText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg style="width:16px;height:16px;animation:spin 0.8s linear infinite;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>&nbsp;${originalText || 'Aguarde...'}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._savedText || originalText;
    }
  }

  // ── Injetar animações CSS ─────────────────────────────────────
  if (!document.getElementById('ui-components-css')) {
    const s = document.createElement('style');
    s.id = 'ui-components-css';
    s.textContent = `
      @keyframes encart-slide-in { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
      @keyframes encart-fade-out { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(20px)} }
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes encart-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    `;
    document.head.appendChild(s);
  }

  return { showToast, renderSidebar, openModal, closeModal, handleOverlayClick, setLoading, openSidebar, closeSidebar };
})();

window.UIComponents = UIComponents;
window.showToast = UIComponents.showToast;
