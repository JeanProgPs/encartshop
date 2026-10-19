import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('PixCheckoutModule fallback WhatsApp URL tests', async (t) => {
  const code = fs.readFileSync('./loja/modules/pix-checkout.js', 'utf8');

  // 1. Verificação estática
  await t.test('Garante que storeObj não existe no escopo de pix-checkout.js', () => {
    assert.strictEqual(code.includes('storeObj'), false, 'Não deve haver referências a storeObj');
    assert.ok(code.includes('_store && _store.whatsapp_footer'), 'Deve conter referência segura a _store.whatsapp_footer');
  });

  // 2. Verificação dinâmica em runtime
  await t.test('Executa _buildWhatsAppUrl e gera mensagem com e sem rodapé personalizado', async () => {
    const sandbox = {
      window: {
        location: { origin: 'https://encartshop.com' },
        sb: {
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null })
                    })
                  })
                })
              })
            })
          })
        }
      },
      EventBus: {
        log: () => {},
        on: (evt, cb) => {
          if (evt === 'STORE_LOADED') storeLoadedCallback = cb;
        },
        emit: () => {},
        EVENTS: { STORE_LOADED: 'STORE_LOADED', CART_UPDATED: 'CART_UPDATED' }
      },
      document: {
        getElementById: () => null
      },
      UIRender: {
        fmtPrice: (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')
      }
    };
    sandbox.window.window = sandbox.window;

    let storeLoadedCallback = null;

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    // Inicializa módulo
    sandbox.window.PixCheckoutModule.init();

    const storeWithFooter = {
      id: 'store-123',
      name: 'Padaria Modelo',
      whatsapp: '11999998888',
      whatsapp_footer: 'Nos siga no Instagram @padariamodelo!'
    };

    // Dispara STORE_LOADED
    await storeLoadedCallback({ store: storeWithFooter });

    const cartItems = [
      { id: '1', name: 'Pão Francês', qty: 2, price: 0.50, unit: 'un' },
      { id: '2', name: 'Queijo Prato', qty: 0.5, price: 40.00, unit: 'kg' }
    ];

    // Caso 1: Com rodapé personalizado
    const url1 = sandbox.window.PixCheckoutModule._buildWhatsAppUrl(
      'João Silva',
      '11988887777',
      'Rua das Flores, 10',
      cartItems,
      21.00,
      21.00,
      'ABC12'
    );

    assert.ok(url1, 'A URL não deve ser nula');
    assert.ok(url1.startsWith('https://wa.me/5511999998888?text='), 'Deve normalizar número com DDI 55');
    const decodedMsg1 = decodeURIComponent(url1.split('text=')[1]);
    assert.ok(decodedMsg1.includes('Nos siga no Instagram @padariamodelo!'), 'Deve conter o rodapé personalizado');
    assert.ok(!decodedMsg1.includes('Gerenciar no Painel:'), 'Não deve conter o link do painel quando houver rodapé');
    assert.ok(decodedMsg1.includes('Pedido #ABC12'), 'Deve conter o número do pedido');
    assert.ok(decodedMsg1.includes('João Silva'), 'Deve conter o nome do cliente');

    // Caso 2: Sem rodapé personalizado (fallback padrão de Gerenciar no Painel)
    storeWithFooter.whatsapp_footer = null;
    await storeLoadedCallback({ store: storeWithFooter });

    const url2 = sandbox.window.PixCheckoutModule._buildWhatsAppUrl(
      'Maria Santos',
      '',
      '',
      cartItems,
      21.00,
      21.00,
      'XYZ99'
    );

    assert.ok(url2, 'A URL não deve ser nula');
    const decodedMsg2 = decodeURIComponent(url2.split('text=')[1]);
    assert.ok(decodedMsg2.includes('Gerenciar no Painel:'), 'Deve conter o link padrão do painel');
    assert.ok(decodedMsg2.includes('https://encartshop.com/admin/pedidos.html?ref=XYZ99'), 'Deve conter a URL de gerenciamento');
    assert.ok(decodedMsg2.includes('Pedido #XYZ99'), 'Deve conter o número do pedido');
  });
});
