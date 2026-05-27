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

    // Estilos premium da sidebar
    sidebar.style.cssText = `
      width: var(--sidebar-width);
      background: var(--bg-secondary);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      z-index: 100;
      transition: var(--transition);
    `;

    const navItem = (id, icon, label, disabled = false) => `
      <a href="${disabled ? '#' : id + '.html'}" ${disabled ? 'onclick="event.preventDefault(); window.showToast(\\\'Recurso em breve\\\', \\\'info\\\')"' : ''} class="nav-item ${activeItem === id ? 'active' : ''} ${disabled ? 'disabled-nav' : ''}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;color:${activeItem === id ? '#FFFFFF' : '#A1A1AA'};font-size:0.9rem;font-weight:500;transition:all 0.2s;text-decoration:none;margin-bottom:4px;background:${activeItem === id ? 'rgba(255,255,255,0.08)' : 'transparent'};${disabled ? 'opacity:0.4;cursor:not-allowed;' : ''}">
        <i data-lucide="${icon}" style="width:18px;height:18px;stroke-width:2.2;"></i>
        <span>${label}</span>
        ${disabled ? '<span style="margin-left:auto;font-size:0.6rem;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;text-transform:uppercase;">Breve</span>' : ''}
      </a>
    `;

    sidebar.innerHTML = `
      <div class="sidebar-logo" style="padding:24px 20px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex;align-items:center;gap:12px;">
          <div id="sidebar-logo-container" style="width:36px;height:36px;background:#FFFFFF;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#0A0A0A;box-shadow:0 2px 10px rgba(0,0,0,0.2);overflow:hidden;">
             <i data-lucide="shopping-bag" style="width:20px;height:20px;stroke-width:2.5;"></i>
          </div>
          <div style="display:flex;flex-direction:column;">
             <span style="color:#FFFFFF;font-weight:700;font-size:1rem;letter-spacing:-0.02em;">EncartShop</span>
             <span style="color:#A1A1AA;font-size:0.7rem;font-weight:500;">Painel de Controle</span>
          </div>
        </div>
      </div>
      
      <nav class="sidebar-nav" style="flex:1;padding:24px 16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;scrollbar-width:none;">
        
        <div>
          <div style="font-size:0.65rem;font-weight:700;color:#52525B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Visão Geral</div>
          ${navItem('dashboard', 'layout-dashboard', 'Dashboard')}
          ${navItem('pedidos', 'shopping-cart', 'Pedidos')}
          ${navItem('produtos', 'package', 'Produtos')}
          ${navItem('clientes', 'users', 'Clientes', true)}
        </div>

        <div>
          <div style="font-size:0.65rem;font-weight:700;color:#52525B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Crescimento</div>
          ${navItem('marketing', 'megaphone', 'Marketing', true)}
          ${navItem('promocoes', 'tag', '<span id="sidebar-nav-campaigns-label">Campanhas</span>')}
          ${navItem('relatorios', 'bar-chart-3', 'Relatórios', true)}
        </div>

        <div>
          <div style="font-size:0.65rem;font-weight:700;color:#52525B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Gestão</div>
          ${navItem('financeiro', 'wallet', 'Financeiro', true)}
          ${navItem('configuracoes', 'settings', 'Configurações')}
      </nav>


      <div class="sidebar-footer" style="padding:16px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(0,0,0,0.2);">
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;transition:var(--transition);cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
          <div id="sidebar-avatar-placeholder" style="width:36px;height:36px;background:rgba(255,255,255,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#FFF;overflow:hidden;flex-shrink:0;">
            <i data-lucide="store" style="width:18px;height:18px;"></i>
          </div>
          <div style="flex:1;overflow:hidden;">
            <div id="sidebar-store-name" style="color:#FFFFFF;font-size:0.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Carregando...</div>
            <div style="color:#A1A1AA;font-size:0.7rem;display:flex;align-items:center;gap:4px;margin-top:2px;">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success);"></span>
              Plano Pro
            </div>
          </div>
          <button id="nav-logout" style="background:none;border:none;color:#A1A1AA;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:color 0.2s;" title="Sair" onmouseover="this.style.color='#FFF'" onmouseout="this.style.color='#A1A1AA'">
             <i data-lucide="log-out" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </div>
    `;

    // Processar ícones Lucide
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 10);

    // ── Overlay para fechar sidebar no mobile ────────────────
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(10,10,10,0.6);z-index:99;backdrop-filter:blur(4px);transition:all 0.3s;';
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
        btn.innerHTML = `<i data-lucide="menu" style="width:24px;height:24px;color:var(--text-primary);"></i>`;
        btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;margin-right:16px;flex-shrink:0';
        btn.addEventListener('click', openSidebar);
        header.prepend(btn);
        setTimeout(() => { if (window.lucide) window.lucide.createIcons({root: btn}); }, 10);
      }
    }

    // ── Hover Sidebar nav items fix ───────────────────────────
    const navs = sidebar.querySelectorAll('.nav-item:not(.active):not(.disabled-nav)');
    navs.forEach(n => {
      n.addEventListener('mouseenter', () => { n.style.color = '#FFFFFF'; n.style.background = 'rgba(255,255,255,0.04)'; });
      n.addEventListener('mouseleave', () => { n.style.color = '#A1A1AA'; n.style.background = 'transparent'; });
    });

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

      // Atualiza nomenclatura interna (Campanhas vs Outlet)
      const campLabel = sidebar.querySelector('#sidebar-nav-campaigns-label');
      if (campLabel) {
        campLabel.textContent = store.store_segment === 'fashion' ? 'Outlet' : 'Campanhas';
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
