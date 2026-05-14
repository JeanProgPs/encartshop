/**
 * EncartShop — Loja Public Bootstrap v1
 * Responsável por garantir o carregamento seguro, validar dependências,
 * exibir a tela de loading global e fornecer fallbacks de erro graciosos.
 */

const StoreBootstrap = (() => {
  const REQUIRED_DEPS = ['sb', 'EncartAPI', 'AuthService', 'StoreModule', 'OrderModule', 'SubscriptionModule', 'UIRender', 'EncartHelpers'];
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  // Trata erros globais que escaparam das funções normais
  function setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('[Bootstrap] Erro global capturado:', event.error || event.message);
      // Apenas exibe o fallback se a loja ainda não carregou ou foi um erro muito crítico
      if (!window.LojaApp || !window.LojaApp.isInitialized) {
        showCriticalError(event.error?.message || event.message || 'Erro inesperado no carregamento.');
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Bootstrap] Promise não tratada:', event.reason);
      if (!window.LojaApp || !window.LojaApp.isInitialized) {
        showCriticalError(event.reason?.message || 'Falha na comunicação com o servidor.');
      }
    });
  }

  function renderLoadingScreen() {
    if (document.getElementById('bootstrap-loading')) return;

    const el = document.createElement('div');
    el.id = 'bootstrap-loading';
    el.style.cssText = `
      position: fixed; inset: 0; background: var(--bg, #f8fafc);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 99999; gap: 16px; transition: opacity 0.4s ease;
    `;
    el.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--brand, #4f46e5)" stroke-width="2" class="bootstrap-spin">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      <div style="color: var(--text-muted, #64748b); font-size: 0.9rem; font-family: sans-serif; font-weight: 500;">
        Preparando a loja...
      </div>
      <style>@keyframes bootstrap-spin { 100% { transform: rotate(360deg); } } .bootstrap-spin { animation: bootstrap-spin 1.5s linear infinite; }</style>
    `;
    document.body.prepend(el);
  }

  function removeLoadingScreen() {
    const el = document.getElementById('bootstrap-loading');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }
  }

  function showCriticalError(message) {
    removeLoadingScreen();
    // Previne que o erro substitua um DOM já útil. Só sobrepõe se a loja estiver vazia
    const mainContent = document.getElementById('main-content');
    if (mainContent && mainContent.innerHTML.trim().length > 200 && window.LojaApp?.isInitialized) {
      if (window.showToast) window.showToast('Erro: ' + message, 'error');
      return;
    }

    document.body.innerHTML = `
      <div style="text-align:center; padding:80px 24px; font-family:var(--font-body, sans-serif); background:var(--bg, #f8fafc); min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="font-size:3.5rem; margin-bottom:20px;">⚠️</div>
        <h1 style="font-size:1.3rem; color:var(--text, #1e293b); margin-bottom:12px; font-weight:800;">Oops! Algo deu errado.</h1>
        <p style="color:var(--text-muted, #64748b); margin-top:0; max-width:400px; line-height:1.6; font-size:0.95rem;">
          Não conseguimos carregar a loja corretamente.<br>
          <span style="font-size:0.8rem; opacity:0.8;">Detalhe: ${message}</span>
        </p>
        <button onclick="window.location.reload()" style="margin-top:28px; background:var(--brand, #4f46e5); color:#fff; border:none; padding:12px 24px; border-radius:10px; font-weight:700; cursor:pointer; font-size:0.95rem; box-shadow:0 4px 12px rgba(79,70,229,0.3);">
          🔄 Tentar Novamente
        </button>
      </div>`;
  }

  function validateDependencies() {
    const missing = REQUIRED_DEPS.filter(dep => typeof window[dep] === 'undefined');
    if (missing.length > 0) {
      throw new Error(`Dependências ausentes: ${missing.join(', ')}`);
    }
  }

  async function boot(attempt = 1) {
    console.info(`[Bootstrap] Iniciando boot... (Tentativa ${attempt}/${MAX_RETRIES})`);
    renderLoadingScreen();
    setupGlobalErrorHandling();

    try {
      // Pequeno delay na primeira tentativa para dar chance aos scripts síncronos pesados
      if (attempt === 1) await new Promise(r => setTimeout(r, 100));

      validateDependencies();

      if (typeof window.LojaApp === 'undefined' || typeof window.LojaApp.init !== 'function') {
        throw new Error('LojaApp não definida ou sem método init()');
      }

      console.info('[Bootstrap] Dependências validadas. Iniciando LojaApp...');
      await window.LojaApp.init();
      
      console.info('[Bootstrap] Boot concluído com sucesso.');
      removeLoadingScreen();

    } catch (error) {
      console.warn(`[Bootstrap] Falha na tentativa ${attempt}:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        console.info(`[Bootstrap] Agendando nova tentativa em ${RETRY_DELAY}ms...`);
        setTimeout(() => boot(attempt + 1), RETRY_DELAY);
      } else {
        showCriticalError(error.message || 'Falha ao inicializar dependências da loja.');
      }
    }
  }

  return { boot, showCriticalError, removeLoadingScreen };
})();

// Aguarda o DOMContentLoaded para iniciar o bootstrap, 
// dando chance para os scripts injetados no final do body serem lidos pelo parser.
document.addEventListener('DOMContentLoaded', () => {
  StoreBootstrap.boot();
});
