/**
 * EncartShop — Platform Common
 * Inicialização compartilhada das páginas do Platform Admin.
 */

(async function initPlatformPage() {
  // Proteção de rota
  const authorized = await PlatformGuard.requireAdmin();
  if (!authorized) return;

  const activePage = document.body.dataset.page || '';
  
  // Injeta Sidebar Exclusiva do Platform Admin
  renderPlatformSidebar(activePage);

})();

function renderPlatformSidebar(activeItem) {
  let sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    document.body.prepend(sidebar);
  }

  // Estilos exclusivos (Índigo Escuro)
  sidebar.style.cssText = `
    width: 256px;
    background: #1e1b4b; /* Indigo 950 */
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
    transition: all 0.3s;
  `;

  const navItem = (id, icon, label, disabled = false) => `
    <a href="${disabled ? '#' : '/platform/' + id}" ${disabled ? 'onclick="event.preventDefault(); window.showToast(\\\'Recurso em breve\\\', \\\'info\\\')"' : ''} class="nav-item ${activeItem === id ? 'active' : ''} ${disabled ? 'disabled-nav' : ''}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;color:${activeItem === id ? '#FFFFFF' : '#818cf8'};font-size:0.9rem;font-weight:500;transition:all 0.2s;text-decoration:none;margin-bottom:4px;background:${activeItem === id ? 'rgba(99, 102, 241, 0.2)' : 'transparent'};${disabled ? 'opacity:0.4;cursor:not-allowed;' : ''}">
      <i data-lucide="${icon}" style="width:18px;height:18px;stroke-width:2.2;"></i>
      <span>${label}</span>
    </a>
  `;

  sidebar.innerHTML = `
    <div class="sidebar-logo" style="padding:24px 20px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;background:#6366f1;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#FFFFFF;box-shadow:0 2px 10px rgba(99,102,241,0.4);">
           <i data-lucide="shield" style="width:20px;height:20px;stroke-width:2.5;"></i>
        </div>
        <div style="display:flex;flex-direction:column;">
           <span style="color:#FFFFFF;font-weight:700;font-size:1rem;letter-spacing:-0.02em;">EncartShop</span>
           <span style="color:#818cf8;font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Platform Admin</span>
        </div>
      </div>
    </div>
    
    <nav class="sidebar-nav" style="flex:1;padding:24px 16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;scrollbar-width:none;">
      <div>
        <div style="font-size:0.65rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Gestão</div>
        ${navItem('dashboard', 'pie-chart', 'Dashboard')}
        ${navItem('clientes', 'users', 'Clientes')}
      </div>
      <div>
        <div style="font-size:0.65rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Operações</div>
        ${navItem('financeiro', 'dollar-sign', 'Financeiro', true)}
        ${navItem('auditoria', 'activity', 'Auditoria', true)}
        ${navItem('suporte', 'life-buoy', 'Suporte', true)}
      </div>
      <div>
        <div style="font-size:0.65rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;padding-left:14px;">Sistema</div>
        ${navItem('configuracoes', 'settings', 'Configurações')}
      </div>
    </nav>

    <div class="sidebar-footer" style="padding:16px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(0,0,0,0.2);">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
        <div style="width:36px;height:36px;background:#4f46e5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#FFF;">
          <i data-lucide="user" style="width:18px;height:18px;"></i>
        </div>
        <div style="flex:1;overflow:hidden;">
          <div style="color:#FFFFFF;font-size:0.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Administrador</div>
        </div>
        <button id="nav-logout" style="background:none;border:none;color:#818cf8;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:color 0.2s;" title="Sair" onmouseover="this.style.color='#FFF'" onmouseout="this.style.color='#818cf8'">
           <i data-lucide="log-out" style="width:16px;height:16px;"></i>
        </button>
      </div>
    </div>
  `;

  setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 10);

  // Hover fix
  const navs = sidebar.querySelectorAll('.nav-item:not(.active):not(.disabled-nav)');
  navs.forEach(n => {
    n.addEventListener('mouseenter', () => { n.style.color = '#FFFFFF'; n.style.background = 'rgba(255,255,255,0.04)'; });
    n.addEventListener('mouseleave', () => { n.style.color = '#818cf8'; n.style.background = 'transparent'; });
  });

  // Logout
  sidebar.querySelector('#nav-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await AuthService.logout();
    window.location.replace('/admin/index.html');
  });

  // Mobile menu toggle
  let overlay = document.getElementById('sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(10,10,10,0.6);z-index:99;backdrop-filter:blur(4px);transition:all 0.3s;';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }

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
