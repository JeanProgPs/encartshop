/**
 * EncartShop — Loja Pública / Bootstrap Modular
 * Orquestra a inicialização dos módulos isolados da loja com timeout e retry.
 */

window.StoreBootstrap = (() => {
  const MODULE_TIMEOUT_MS = 8000;
  
  function createLoadingScreen() {
    if (document.getElementById('encart-boot-screen')) return;
    const div = document.createElement('div');
    div.id = 'encart-boot-screen';
    div.style.cssText = `
      position:fixed;inset:0;background:#ffffff;z-index:99999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      transition:opacity 0.5s ease;font-family:sans-serif;
    `;
    div.innerHTML = `
      <div style="width:40px;height:40px;border:4px solid #f1f5f9;border-top-color:#4f46e5;border-radius:50%;animation:encart-spin 1s linear infinite;margin-bottom:20px;"></div>
      <h2 style="color:#0f172a;font-size:1.2rem;margin:0 0 8px 0;">Preparando a loja...</h2>
      <style>@keyframes encart-spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(div);
  }

  function removeLoadingScreen() {
    const screen = document.getElementById('encart-boot-screen');
    if (screen) {
      screen.style.opacity = '0';
      setTimeout(() => screen.remove(), 500);
    }
  }

  function showErrorScreen(message) {
    const screen = document.getElementById('encart-boot-screen');
    if (screen) {
      screen.innerHTML = `
        <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
        <h2 style="color:#ef4444;font-size:1.4rem;margin:0 0 8px 0;text-align:center;">Erro ao carregar loja</h2>
        <p style="color:#64748b;max-width:300px;text-align:center;line-height:1.5;">${escapeHTML(message)}</p>
        <button onclick="window.location.reload()" style="margin-top:24px;padding:10px 20px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Tentar Novamente</button>
      `;
      screen.style.background = '#f8fafc';
    }
  }

  async function checkDependencies() {
    if (typeof window.sb === 'undefined') throw new Error('Falha na conexão (Supabase).');
    if (typeof window.EncartAPI === 'undefined') throw new Error('Módulos de API ausentes.');
    if (typeof window.EventBus === 'undefined') throw new Error('EventBus ausente.');
  }

  const withTimeout = (promise, moduleName) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout no módulo: ${moduleName}`)), MODULE_TIMEOUT_MS)
      )
    ]);
  };

  async function boot() {
    createLoadingScreen();

    try {
      await checkDependencies();

      // 1. Instancia módulos paralelos primeiro para registrar os listeners
      const modules = [
        { name: 'StoreUI', ref: window.StoreUI },
        { name: 'SmartBanner', ref: window.SmartBanner },
        { name: 'DeliveryModule', ref: window.DeliveryModule },
        { name: 'ProductCatalog', ref: window.ProductCatalog },
        { name: 'CartManager', ref: window.CartManager },
        { name: 'Promotions', ref: window.Promotions }
      ];

      const promises = modules
        .filter(m => m.ref && typeof m.ref.init === 'function')
        .map(m => m.ref.init().catch(err => {
            window.EventBus.log('Bootstrap', `Falha isolada no módulo ${m.name}`, err.message, true);
            return null;
        }));

      // 2. Inicia StoreContext (dependência central bloqueante). Ele fará os fetchs e emitirá STORE_LOADED
      if (!window.StoreContext) throw new Error('Módulo StoreContext não encontrado.');
      await withTimeout(window.StoreContext.init(), 'StoreContext');

      // 3. Aguarda resolução de qualquer promise residual de listener (já foram trigados pelos emits)
      await Promise.allSettled(promises);

      // Finaliza carregamento
      removeLoadingScreen();
    } catch (err) {
      console.error('[Bootstrap] Erro Fatal:', err);
      showErrorScreen(err.message || 'Falha de conexão. Verifique sua internet.');
    }
  }

  // Captura erros não tratados genéricos para evitar tela branca pura
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Error]', event.reason);
  });

  return { boot };
})();

// Inicia o processo quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.StoreBootstrap.boot());
} else {
  window.StoreBootstrap.boot();
}
