/**
 * EncartShop — Loja Pública EventBus
 * Gerenciador de Eventos com logging estruturado e tipagem centralizada.
 */

window.EventBus = (() => {
  const EVENTS = {
    STORE_LOADED: 'loja:store_loaded',
    PRODUCTS_LOADED: 'loja:products_loaded',
    CATEGORY_CHANGED: 'loja:category_changed',
    CART_UPDATED: 'loja:cart_updated',
    CART_TOGGLE: 'loja:cart_toggle',
    CHECKOUT_START: 'loja:checkout_start',
    SEARCH_CHANGED: 'loja:search_changed',
    ERROR: 'loja:error'
  };

  const log = (moduleName, message, data = null, isError = false) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const prefix = `[${timestamp}] [${moduleName}]`;
    if (isError) {
      console.error(prefix, message, data || '');
    } else {
      console.info(prefix, message, data || '');
    }
  };

  function emit(eventName, detail = {}) {
    log('EventBus', `Emitindo: ${eventName}`);
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  }

  function on(eventName, callback) {
    document.addEventListener(eventName, (e) => callback(e.detail));
  }

  return { EVENTS, emit, on, log };
})();
