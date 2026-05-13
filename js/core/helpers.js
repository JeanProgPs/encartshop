/**
 * EncartShop — Helpers Globais
 * Centraliza tratamento de erros, estados de carregamento e validações.
 */

const EncartHelpers = {
  /**
   * Wrapper seguro para chamadas Supabase.
   * Garante que o retorno seja sempre um objeto consistente.
   */
  async safeFetch(promise, fallback = []) {
    try {
      const { data, error } = await promise;
      if (error) {
        this.globalErrorHandler(error);
        return fallback;
      }
      // Garante que se for array, retorna array (prevenindo .map error)
      if (Array.isArray(fallback) && !Array.isArray(data)) {
        return data ? [data] : fallback;
      }
      return data || fallback;
    } catch (err) {
      this.globalErrorHandler(err);
      return fallback;
    }
  },

  /**
   * Centralizador de erros para Logs e UI.
   */
  globalErrorHandler(err, customMsg = '') {
    const message = err.message || err.details || 'Ocorreu um erro inesperado.';
    console.error('[EncartShop Error]:', err);
    
    // Evita spam de mensagens repetidas no console
    if (window.showToast) {
      window.showToast(customMsg || `Erro: ${message}`, 'error');
    }
  },

  /**
   * Gerencia estado de botões durante requisições.
   */
  async withLoading(btnId, action) {
    const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
    if (!btn) return action();

    const originalText = btn.innerHTML;
    try {
      if (window.UIComponents && window.UIComponents.setLoading) {
        window.UIComponents.setLoading(btn, true);
      } else {
        btn.disabled = true;
        btn.textContent = 'Aguarde...';
      }
      return await action();
    } finally {
      if (window.UIComponents && window.UIComponents.setLoading) {
        window.UIComponents.setLoading(btn, false, originalText);
      } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  },

  /**
   * Valida se um valor é um array válido para iteração.
   */
  isValidArray(arr) {
    return Array.isArray(arr) && arr.length > 0;
  }
  /**
   * Utilitário para evitar execuções excessivas (Busca/Scroll)
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};

window.EncartHelpers = EncartHelpers;
