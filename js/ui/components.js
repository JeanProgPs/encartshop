/**
 * EncartShop — UI Components Compartilhados
 */

const UIComponents = (() => {

  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '10px';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.color = '#fff';
    toast.style.background = isError ? '#e74c3c' : '#2ecc71';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.animation = 'slideInRight 0.3s ease forwards';
    toast.style.fontFamily = 'Inter, sans-serif';
    toast.style.fontWeight = '500';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function renderSidebar(activeItem) {
    let sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      // Fallback in case there is no sidebar element, although all admin pages have one.
      sidebar = document.createElement('aside');
      sidebar.className = 'sidebar';
      sidebar.id = 'sidebar';
      document.body.prepend(sidebar);
    }
    
    sidebar.innerHTML = `
      <div class="sidebar-logo">
        <div class="logo-icon" style="width:42px; height:42px; background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%); border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:900; color:#fff; margin-bottom:10px; box-shadow:var(--shadow-brand);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        </div>
        <div class="logo-text">
          <span class="brand">EncartShop</span>
          <span class="sub" style="font-size:0.7rem; color:var(--text-muted);">Painel do Lojista</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Menu</div>
        <a href="/dashboard" class="nav-item ${activeItem === 'dashboard' ? 'active' : ''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Dashboard</span>
        </a>
        <a href="/produtos" class="nav-item ${activeItem === 'produtos' ? 'active' : ''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          <span>Produtos</span>
        </a>
        <a href="/pedidos" class="nav-item ${activeItem === 'pedidos' ? 'active' : ''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <span>Pedidos</span>
        </a>
        <a href="/configuracoes" class="nav-item ${activeItem === 'configuracoes' ? 'active' : ''}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Configurações</span>
        </a>
      </nav>
      <div class="sidebar-footer" style="padding:16px 12px;">
        <a href="#" id="view-store-btn" target="_blank" class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:16px; font-size:0.85rem;">👁️ Ver Loja</a>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;background:rgba(255,255,255,0.05);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">👤</div>
          <div style="flex:1;overflow:hidden;">
            <div id="sidebar-store-name" style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Carregando...</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Administrador</div>
          </div>
          <button id="nav-logout" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;" title="Sair">🚪</button>
        </div>
      </div>
    `;

    // Mobile toggle support
    const mobileClose = sidebar.querySelector('#mobile-close');
    if (mobileClose) {
      mobileClose.addEventListener('click', () => {
        sidebar.classList.remove('active');
      });
    }

    // Toggle button in header
    let mainContent = document.querySelector('.admin-main');
    if (mainContent) {
      let header = mainContent.querySelector('header');
      if (header && !header.querySelector('.mobile-toggle')) {
         let mobileBtn = document.createElement('button');
         mobileBtn.className = 'mobile-toggle';
         mobileBtn.innerHTML = '☰';
         mobileBtn.style.marginRight = '15px';
         mobileBtn.style.background = 'none';
         mobileBtn.style.border = 'none';
         mobileBtn.style.color = 'white';
         mobileBtn.style.fontSize = '24px';
         mobileBtn.style.cursor = 'pointer';
         
         mobileBtn.addEventListener('click', () => {
            sidebar.classList.add('active');
         });
         
         header.prepend(mobileBtn);
      }
    }
    
    // Bind logout
    const logoutBtn = sidebar.querySelector('#nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await AuthService.logout();
        window.location.replace('/admin');
      });
    }
    
    // Atualiza nome da loja
    StoreModule.getActive().then(store => {
       if (store) {
           const nameEl = sidebar.querySelector('#sidebar-store-name');
           if(nameEl) nameEl.textContent = store.name;
           
           const viewBtn = sidebar.querySelector('#view-store-btn');
           if(viewBtn) {
              const url = StoreModule.getStoreUrl(store);
              viewBtn.href = url;
           }
       }
    });
  }

  function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function handleOverlayClick(event, id) {
    if (event.target.id === id) {
      closeModal(id);
    }
  }

  function setLoading(btn, isLoading, originalText = '') {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<svg class="spinner" viewBox="0 0 50 50" style="width:20px;height:20px;animation:spin 1s linear infinite;"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="100" stroke-dashoffset="50"></circle></svg> Aguarde...`;
    } else {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  return { showToast, renderSidebar, openModal, closeModal, handleOverlayClick, setLoading };
})();

window.UIComponents = UIComponents;
window.showToast = UIComponents.showToast;
