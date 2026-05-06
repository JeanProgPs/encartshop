/**
 * EncartShop — Auth Guard
 * Proteção de rotas do admin.
 */

const AuthGuard = (() => {
  async function requireAuth() {
    // 1. Verifica se há usuário logado no Supabase
    const user = await AuthService.getUser();
    
    // 2. Verifica se a loja ativa está definida
    const activeStoreId = AuthService.getActiveStoreId();

    if (!user || !activeStoreId) {
      AuthService.clearActiveStoreId();
      sessionStorage.setItem('redirect_after_login', window.location.pathname);
      window.location.replace('index.html');
      return false;
    }
    
    // 3. Verifica se o pagamento está pendente
    // Evita loop se já estiver na página de pagamento
    if (!window.location.pathname.includes('pagamento.html')) {
      const store = await EncartAPI.StoreAPI.getById(activeStoreId);
      if (store && store.status === 'pending') {
        window.location.replace('pagamento.html');
        return false;
      }
    }
    
    return true;
  }

  // Verifica se o admin tentou entrar no index de login já estando logado
  async function checkAlreadyLoggedIn() {
    const user = await AuthService.getUser();
    const activeStoreId = AuthService.getActiveStoreId();
    
    if (user && activeStoreId) {
      window.location.replace('dashboard.html');
    }
  }

  return {
    requireAuth,
    checkAlreadyLoggedIn
  };
})();

window.AuthGuard = AuthGuard;
