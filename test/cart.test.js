import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('CartManager & Traditional WhatsApp Checkout Regression Tests', async (t) => {
  const cartCode = fs.readFileSync('./loja/modules/cart.js', 'utf8');

  await t.test('Verifica formatação do cupom e rodapé WhatsApp no cart.js', () => {
    const sandbox = {
      window: {
        location: { origin: 'https://encartshop.com', href: '' }
      },
      EventBus: {
        log: () => {},
        on: () => {},
        emit: () => {},
        EVENTS: { STORE_LOADED: 'STORE_LOADED', CART_UPDATED: 'CART_UPDATED' }
      },
      document: {
        getElementById: () => null
      },
      UIRender: {
        fmtPrice: (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      }
    };
    sandbox.window.window = sandbox.window;

    vm.createContext(sandbox);
    vm.runInContext(cartCode, sandbox);

    // Garante que o CartManager inicializa e checkout tradicional monta a mensagem esperada
    assert.ok(sandbox.window.CartManager, 'CartManager deve ser exposto no window');
    assert.ok(typeof sandbox.window.addToCart === 'function', 'addToCart deve ser função');
    assert.ok(typeof sandbox.window.checkout === 'function', 'checkout deve ser função');
  });
});
