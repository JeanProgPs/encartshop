import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Testes de Acompanhamento de Pedido pelo Cliente (Order Tracking)', async (t) => {
  const rootDir = process.cwd();
  const apiJs = fs.readFileSync(path.join(rootDir, 'js/core/api.js'), 'utf8');
  const cartJs = fs.readFileSync(path.join(rootDir, 'loja/modules/cart.js'), 'utf8');
  const pedidoHtml = fs.readFileSync(path.join(rootDir, 'loja/pedido.html'), 'utf8');
  const lojaHtml = fs.readFileSync(path.join(rootDir, 'loja/index.html'), 'utf8');

  await t.test('1. OrderAPI implementa getById e getByRef com buscas inteligentes', () => {
    assert.ok(apiJs.includes('async getById(id)'), 'Deve conter OrderAPI.getById');
    assert.ok(apiJs.includes('async getByRef(ref'), 'Deve conter OrderAPI.getByRef');
    assert.ok(apiJs.includes('customer_name'), 'getByRef deve buscar por padrão [#REF]');
    assert.ok(apiJs.includes('ilike'), 'Deve utilizar busca sem distinção de maiúsculas');
  });

  await t.test('2. CartManager gera link de rastreamento no WhatsApp e salva no localStorage', () => {
    assert.ok(cartJs.includes('/loja/pedido.html?ref='), 'Mensagem do WhatsApp deve conter link de rastreamento');
    assert.ok(cartJs.includes('encart_last_order'), 'Deve salvar último pedido no localStorage');
  });

  await t.test('3. Página de Rastreamento (loja/pedido.html) possui stepper visual completo', () => {
    assert.ok(pedidoHtml.includes('step-novo'), 'Deve conter etapa Recebido');
    assert.ok(pedidoHtml.includes('step-confirmado'), 'Deve conter etapa Confirmado / Em preparo');
    assert.ok(pedidoHtml.includes('step-em_entrega'), 'Deve conter etapa Saiu p/ Entrega');
    assert.ok(pedidoHtml.includes('step-finalizado'), 'Deve conter etapa Entregue');
    assert.ok(pedidoHtml.includes('status-alert-box'), 'Deve conter banner de status');
    assert.ok(pedidoHtml.includes('realtime-pill'), 'Deve conter indicador de tempo real');
  });

  await t.test('4. Atualizações em tempo real com Supabase Realtime', () => {
    assert.ok(pedidoHtml.includes('postgres_changes'), 'Deve escutar alterações da tabela orders em tempo real');
    assert.ok(pedidoHtml.includes('subscribeToOrderRealtime'), 'Deve se inscrever no canal de realtime');
  });

  await t.test('5. Vitrine (loja/index.html) possui link de acesso rápido ao rastreamento', () => {
    assert.ok(lojaHtml.includes('/loja/pedido.html'), 'Rodapé da loja deve conter link para acompanhar pedido');
  });
});
