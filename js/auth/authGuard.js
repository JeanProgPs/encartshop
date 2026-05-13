/**
 * EncartShop — Auth Guard v2
 *
 * Regras de acesso:
 * - status === 'pending'  → Dashboard LIBERADO (apenas banner de pagamento)
 * - status === 'active'   + assinatura vencida + carência esgotada → redireciona para pagamento
 * - sem sessão            → redireciona para login
 */

const AuthGuard = (() => {
  async function requireAuth() {
    // 1. Verifica sessão Supabase
    const user = await AuthService.getUser();
    const activeStoreId = AuthService.getActiveStoreId();

    if (!user || !activeStoreId) {
      AuthService.clearActiveStoreId();
      try { sessionStorage.setItem('redirect_after_login', window.location.pathname); } catch {}
      window.location.replace('index.html');
      return false;
    }

    // 2. Verifica estado da assinatura (não bloqueia pending — apenas expirado+carência)
    if (!window.location.pathname.includes('pagamento.html')) {
      try {
        const store = await EncartAPI.StoreAPI.getById(activeStoreId);
        if (store) {
          const subStatus = SubscriptionModule.getStatus(store.expires_at);

          // 1. PENDING expirada (> 7 dias): bloqueia dashboard
          if (store.status === 'pending' && SubscriptionModule.isPendingExpired(store)) {
            window.location.replace('pagamento.html');
            return false;
          }

          // 2. EXPIRED + GRACE ESGOTADA: bloqueia dashboard
          if (store.status !== 'pending' && subStatus.blocked) {
            window.location.replace('pagamento.html');
            return false;
          }
        }
      } catch (e) {
        console.warn('[AuthGuard] Erro ao verificar assinatura:', e);
        // Não bloqueia em caso de erro de rede — fail-open no admin
      }
    }

    return true;
  }

  // Redireciona para dashboard se já estiver logado
  async function checkAlreadyLoggedIn() {
    try {
      const user = await AuthService.getUser();
      const activeStoreId = AuthService.getActiveStoreId();
      if (user && activeStoreId) {
        window.location.replace('dashboard.html');
      }
    } catch { /* ignora */ }
  }

  return { requireAuth, checkAlreadyLoggedIn };
})();

window.AuthGuard = AuthGuard;
