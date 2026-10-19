import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Edge Function store-payment Logic & Security Tests', async (t) => {
  const edgeCode = fs.readFileSync('./supabase/functions/store-payment/index.ts', 'utf8');

  await t.test('Verifica que validateApiKey exige autenticação de lojista', () => {
    assert.ok(edgeCode.includes("case 'validateApiKey': {"), 'Deve ter bloco dedicado para validateApiKey');
    assert.ok(edgeCode.includes('store.user_id !== user.id'), 'Deve validar se user_id da loja coincide com o usuário autenticado');
  });

  await t.test('Verifica que createPixCharge permite checkout público com validação de status e plano', () => {
    assert.ok(edgeCode.includes("case 'createPixCharge': {"), 'Deve ter bloco dedicado para createPixCharge');
    assert.ok(edgeCode.includes("store.status !== 'active'"), 'Deve validar se a loja está ativa');
    assert.ok(edgeCode.includes("['pro', 'enterprise']"), 'Deve validar se o plano da loja é pro ou enterprise');
  });

  await t.test('Verifica proteção anti-fraude: validação de divergência de valor', () => {
    assert.ok(edgeCode.includes('AMOUNT_MISMATCH'), 'Deve conter código de erro AMOUNT_MISMATCH');
    assert.ok(edgeCode.includes('Math.abs(Number(orderRecord.total) - parsedAmount) > 0.05'), 'Deve conferir divergência entre total do pedido e amount');
  });

  await t.test('Verifica proteção contra cobranças duplicadas (idempotência)', () => {
    assert.ok(edgeCode.includes('ORDER_ALREADY_PAID'), 'Deve bloquear nova cobrança para pedido já pago');
    assert.ok(edgeCode.includes('existingPayment.status === \'pending\' && existingPayment.pix_code'), 'Deve reutilizar cobrança pendente existente');
  });
});
