/**
 * EncartShop — Platform Guard
 * Protege as rotas /platform garantindo que apenas SUPER_ADMIN acesse.
 */

const PlatformGuard = (() => {
  async function requireAdmin() {
    try {
      const user = await AuthService.getUser();
      if (!user) {
        window.location.replace('/admin/index.html');
        return false;
      }

      // Verifica no app_metadata (fornecido pelo Supabase no JWT) se o usuário é SUPER_ADMIN
      if (user.app_metadata?.role !== 'SUPER_ADMIN') {
        console.warn('[PlatformGuard] Acesso negado: Requer SUPER_ADMIN');
        window.location.replace('/admin/dashboard'); // Redireciona para o admin da loja comum
        return false;
      }

      return true;
    } catch (e) {
      console.error('[PlatformGuard] Erro ao validar permissões:', e);
      window.location.replace('/admin/index.html');
      return false;
    }
  }

  return { requireAdmin };
})();

window.PlatformGuard = PlatformGuard;
