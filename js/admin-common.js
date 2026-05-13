/**
 * EncartShop — Admin Common v2
 * Inicialização compartilhada de todas as páginas admin.
 * Inclua APÓS todos os módulos JS, no final do <body>.
 *
 * Uso: <script src="../js/admin-common.js"></script>
 * Requer atributo data-page no <body>: <body data-page="dashboard">
 */

(async function initAdminPage() {

  // 1. Proteção de rota — verifica sessão Supabase real
  const authorized = await AuthGuard.requireAuth();
  if (!authorized) return;

  // 2. Detecta a página atual pelo atributo data-page
  const activePage = document.body.dataset.page || '';

  // 3. Injeta sidebar com item ativo marcado e carrega dados
  if (window.UIComponents && window.UIComponents.renderSidebar) {
    UIComponents.renderSidebar(activePage);
  } else {
    console.warn('[AdminCommon] UIComponents.renderSidebar não encontrado.');
  }

  // 4. Verifica Assinatura e injeta alerta se necessário
  const store = await StoreModule.getActive();
  if (store) {
    const subStatus = SubscriptionModule.getStatus(store.expires_at);
    const alert = SubscriptionModule.getAlert(subStatus, store.status);
    SubscriptionModule.injectAlert(alert);
  }

})();
