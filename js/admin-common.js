/**
 * EncartShop — Admin Common v3
 * Inicialização compartilhada de todas as páginas admin.
 */

(async function initAdminPage() {

  // 1. Proteção de rota — verifica sessão Supabase real
  const authorized = await AuthGuard.requireAuth();
  if (!authorized) return;

  // 2. Detecta a página atual pelo atributo data-page
  const activePage = document.body.dataset.page || '';

  // 3. Injeta sidebar com item ativo marcado e carrega dados
  UIComponents.renderSidebar(activePage);

  // 4. Verifica Assinatura e injeta alerta se necessário
  try {
    const store = await StoreModule.getActive();
    if (store) {
      // Regra: se status for 'pending', mostra o banner de ativação
      // Se for 'active', verifica se expirou
      const subStatus = SubscriptionModule.getStatus(store.expires_at);
      const isPending = store.status === 'pending';
      
      const alert = SubscriptionModule.getAlert(subStatus, isPending);
      SubscriptionModule.injectAlert(alert);
    }
  } catch (e) {
    console.warn('[AdminCommon] Falha ao injetar alerta de assinatura:', e);
  }

})();
