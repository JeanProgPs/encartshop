/**
 * EncartShop — Global Helpers
 * Utilitários globais de erro, loading e feedback visual.
 * Inclua ANTES de qualquer módulo que use essas funções.
 */

const EncartHelpers = (() => {

  // ── Toast Helper ──────────────────────────────────────────────
  // Suporta tipos: 'success' | 'error' | 'warning' | 'info'
  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:99999;
        display:flex; flex-direction:column; gap:10px; pointer-events:none;
      `;
      document.body.appendChild(container);
    }

    const colors = {
      success: { bg: '#22c55e', icon: '✅' },
      error:   { bg: '#ef4444', icon: '❌' },
      warning: { bg: '#f59e0b', icon: '⚠️' },
      info:    { bg: '#3b82f6', icon: 'ℹ️' }
    };
    const style = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background:${style.bg}; color:#fff;
      padding:12px 18px; border-radius:10px;
      box-shadow:0 4px 20px rgba(0,0,0,0.2);
      font-size:0.875rem; font-weight:500;
      display:flex; align-items:center; gap:10px;
      animation:encart-slide-in 0.3s ease;
      pointer-events:all; max-width:320px;
      font-family:var(--font-body, 'Inter', sans-serif);
    `;
    toast.innerHTML = `<span style="font-size:1rem;flex-shrink:0">${style.icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    const timeout = type === 'error' ? 5000 : 3500;
    setTimeout(() => {
      toast.style.animation = 'encart-fade-out 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, timeout);
  }

  // ── Loading Button ─────────────────────────────────────────────
  function setButtonLoading(btn, isLoading, originalText = '') {
    if (!btn) return;
    if (isLoading) {
      btn._originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <svg style="width:16px;height:16px;animation:spin 0.8s linear infinite;vertical-align:middle"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <span style="margin-left:6px">${originalText || 'Aguarde...'}</span>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._originalText || originalText;
    }
  }

  // ── Skeleton Loader ────────────────────────────────────────────
  function skeleton(count = 1, style = 'card') {
    const styles = {
      card: `height:120px; border-radius:12px;`,
      line: `height:20px; border-radius:6px; margin-bottom:8px;`,
      stat: `height:90px; border-radius:12px;`
    };
    const css = styles[style] || styles.card;
    return Array.from({ length: count }).map(() => `
      <div style="
        ${css}
        background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.05) 75%);
        background-size: 200% 100%;
        animation: encart-shimmer 1.4s infinite;
      "></div>
    `).join('');
  }

  // ── Safe Data Fetch ────────────────────────────────────────────
  // Garante que sempre retorna array mesmo em caso de erro
  async function safeArray(promiseFn, fallback = []) {
    try {
      const result = await promiseFn();
      return Array.isArray(result) ? result : (result || fallback);
    } catch (e) {
      console.warn('[EncartHelpers] safeArray capturou erro:', e);
      return fallback;
    }
  }

  // Garante que sempre retorna objeto (ou null) mesmo em caso de erro
  async function safeObject(promiseFn, fallback = null) {
    try {
      const result = await promiseFn();
      return result || fallback;
    } catch (e) {
      console.warn('[EncartHelpers] safeObject capturou erro:', e);
      return fallback;
    }
  }

  // ── Inject Global CSS Animations ──────────────────────────────
  function injectStyles() {
    if (document.getElementById('encart-helpers-css')) return;
    const style = document.createElement('style');
    style.id = 'encart-helpers-css';
    style.textContent = `
      @keyframes encart-slide-in {
        from { opacity: 0; transform: translateX(20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes encart-fade-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(20px); }
      }
      @keyframes encart-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  injectStyles();

  return { showToast, setButtonLoading, skeleton, safeArray, safeObject };
})();

// ── Aliases globais ────────────────────────────────────────────
window.EncartHelpers = EncartHelpers;
window.showToast = EncartHelpers.showToast; // retrocompatibilidade
