/**
 * EncartShop — Loja Pública / Promotions
 * Isola a lógica de cálculo de ofertas.
 */

window.Promotions = (() => {
  let promoProducts = [];

  async function init() {
    EventBus.log('Promotions', 'Aguardando Products...');
    
    EventBus.on(EventBus.EVENTS.PRODUCTS_LOADED, ({ products }) => {
      try {
        promoProducts = products.filter(p => !!p.promo_price);
        EventBus.log('Promotions', 'Ofertas calculadas', { count: promoProducts.length });
        
        // Emite evento para que a UI saiba que pode gerar a aba de Ofertas
        EventBus.emit('loja:promotions_ready', { hasPromotions: promoProducts.length > 0 });
      } catch (err) {
        EventBus.log('Promotions', 'Erro ao processar ofertas', err.message, true);
        EventBus.emit('loja:promotions_ready', { hasPromotions: false });
      }
    });
  }

  function getPromoProducts() { return promoProducts; }

  return { init, getPromoProducts };
})();
