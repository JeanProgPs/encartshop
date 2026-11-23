import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Carrega o StoreSchedule em ambiente Node simulando window
const rootDir = process.cwd();
const scheduleCode = fs.readFileSync(path.join(rootDir, 'loja/modules/schedule.js'), 'utf8');
const vmContext = { window: {} };
new Function('window', scheduleCode)(vmContext.window);
const StoreSchedule = vmContext.window.StoreSchedule;

test('Testes do Módulo StoreSchedule (Aberto/Fechado em Tempo Real)', async (t) => {
  await t.test('1. Avaliação de horário padrão comercial (Seg-Sáb: 7h às 20h | Dom: 8h às 14h)', () => {
    const hours = 'Seg–Sáb: 7h às 20h | Dom: 8h às 14h';

    // Segunda-feira (23/11/2026) às 10:30 -> Aberto
    const segManha = new Date('2026-11-23T10:30:00');
    const res1 = StoreSchedule.evaluate(hours, segManha);
    assert.strictEqual(res1.isOpen, true, 'Segunda 10:30 deve estar aberto');
    assert.strictEqual(res1.hasSchedule, true);
    assert.strictEqual(res1.badgeText, 'Aberto agora');

    // Segunda-feira às 21:00 -> Fechado
    const segNoite = new Date('2026-11-23T21:00:00');
    const res2 = StoreSchedule.evaluate(hours, segNoite);
    assert.strictEqual(res2.isOpen, false, 'Segunda 21:00 deve estar fechado');
    assert.ok(res2.nextOpening.includes('Abre amanhã às 07:00'), 'Deve prever abertura para amanhã às 07:00');

    // Domingo (29/11/2026) às 11:00 -> Aberto
    const domManha = new Date('2026-11-29T11:00:00');
    const res3 = StoreSchedule.evaluate(hours, domManha);
    assert.strictEqual(res3.isOpen, true, 'Domingo 11:00 deve estar aberto');

    // Domingo às 15:00 -> Fechado (fecha às 14h)
    const domTarde = new Date('2026-11-29T15:00:00');
    const res4 = StoreSchedule.evaluate(hours, domTarde);
    assert.strictEqual(res4.isOpen, false, 'Domingo 15:00 deve estar fechado');
    assert.ok(res4.nextOpening.includes('Abre amanhã às 07:00'), 'Deve prever abertura na segunda às 07:00');
  });

  await t.test('2. Turno noturno que vira a noite (ex: Pizzaria / Lanchonete 18h às 02h)', () => {
    const hours = 'Ter a Dom: 18h às 02h';

    // Sábado 23:00 -> Aberto
    const sabNoite = new Date('2026-11-28T23:00:00');
    const res1 = StoreSchedule.evaluate(hours, sabNoite);
    assert.strictEqual(res1.isOpen, true, 'Sábado 23h deve estar aberto');

    // Domingo 01:15 da madrugada (turno de sábado) -> Aberto
    const domMadrugada = new Date('2026-11-29T01:15:00');
    const res2 = StoreSchedule.evaluate(hours, domMadrugada);
    assert.strictEqual(res2.isOpen, true, 'Domingo 01:15 da madrugada deve estar aberto (turno de sábado)');

    // Domingo 03:00 da madrugada -> Fechado (turno encerrou às 02h)
    const domPosMadrugada = new Date('2026-11-29T03:00:00');
    const res3 = StoreSchedule.evaluate(hours, domPosMadrugada);
    assert.strictEqual(res3.isOpen, false, 'Domingo 03:00 deve estar fechado');
    assert.ok(res3.nextOpening.includes('Abre hoje às 18:00'), 'Deve abrir hoje às 18:00');
  });

  await t.test('3. Suporte a 24 horas e casos de borda sem horário', () => {
    const res24h = StoreSchedule.evaluate('Aberto 24 horas todos os dias');
    assert.strictEqual(res24h.isOpen, true);
    assert.strictEqual(res24h.hasSchedule, true);

    const resEmpty = StoreSchedule.evaluate('');
    assert.strictEqual(resEmpty.hasSchedule, false);
    assert.strictEqual(resEmpty.isOpen, true); // Fallback: não bloqueia loja sem horário

    const resText = StoreSchedule.evaluate('Atendimento somente com agendamento');
    assert.strictEqual(resText.hasSchedule, false);
    assert.strictEqual(resText.isOpen, true);
  });

  await t.test('4. Arquivos de integração (HTML, UI, Cart, CSS)', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'loja/index.html'), 'utf8');
    const uiJs = fs.readFileSync(path.join(rootDir, 'loja/modules/ui.js'), 'utf8');
    const cartJs = fs.readFileSync(path.join(rootDir, 'loja/modules/cart.js'), 'utf8');
    const modernCss = fs.readFileSync(path.join(rootDir, 'css/store-modern.css'), 'utf8');

    assert.ok(indexHtml.includes('store-status-badge'), 'loja/index.html deve conter store-status-badge');
    assert.ok(indexHtml.includes('cart-schedule-alert'), 'loja/index.html deve conter cart-schedule-alert');
    assert.ok(indexHtml.includes('/loja/modules/schedule.js'), 'loja/index.html deve importar schedule.js');

    assert.ok(uiJs.includes('_renderStoreStatus'), 'ui.js deve renderizar status da loja');
    assert.ok(uiJs.includes('cart-closed-notice'), 'ui.js deve exibir aviso no carrinho quando fechado');

    assert.ok(cartJs.includes('StoreSchedule.evaluate'), 'cart.js deve verificar se loja está fechada');
    assert.ok(cartJs.includes('Pedido enviado fora do horário'), 'cart.js deve adicionar nota no WhatsApp quando fechado');

    assert.ok(modernCss.includes('.store-status-badge'), 'store-modern.css deve conter regras para status badge');
    assert.ok(modernCss.includes('.store-status-badge.open'), 'store-modern.css deve estilizar status aberto');
    assert.ok(modernCss.includes('.store-status-badge.closed'), 'store-modern.css deve estilizar status fechado');
    assert.ok(modernCss.includes('.cart-closed-notice'), 'store-modern.css deve estilizar aviso no carrinho');
  });
});
