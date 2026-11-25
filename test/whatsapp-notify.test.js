import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Testes de Integração com WhatsApp Automático (Evolution API)', async (t) => {
  const rootDir = process.cwd();
  const migrationSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/create_whatsapp_integration.sql'), 'utf8');
  const edgeFunctionTs = fs.readFileSync(path.join(rootDir, 'supabase/functions/whatsapp-notify/index.ts'), 'utf8');
  const configHtml = fs.readFileSync(path.join(rootDir, 'admin/configuracoes.html'), 'utf8');
  const pedidosHtml = fs.readFileSync(path.join(rootDir, 'admin/pedidos.html'), 'utf8');

  await t.test('1. Migration possui todas as colunas para gerenciar o WhatsApp', () => {
    assert.ok(migrationSql.includes('whatsapp_auto_notify boolean'), 'Deve ter coluna whatsapp_auto_notify');
    assert.ok(migrationSql.includes('evolution_api_url text'), 'Deve ter coluna evolution_api_url');
    assert.ok(migrationSql.includes('evolution_api_key text'), 'Deve ter coluna evolution_api_key');
    assert.ok(migrationSql.includes('evolution_instance_name text'), 'Deve ter coluna evolution_instance_name');
    assert.ok(migrationSql.includes('whatsapp_connected boolean'), 'Deve ter coluna whatsapp_connected');
  });

  await t.test('2. Edge Function implementa get-qr, check-status, disconnect e send-order-notification', () => {
    assert.ok(edgeFunctionTs.includes("action === 'get-qr'"), 'Deve implementar get-qr');
    assert.ok(edgeFunctionTs.includes("action === 'check-status'"), 'Deve implementar check-status');
    assert.ok(edgeFunctionTs.includes("action === 'disconnect'"), 'Deve implementar disconnect');
    assert.ok(edgeFunctionTs.includes("action === 'send-order-notification'"), 'Deve implementar send-order-notification');
    assert.ok(edgeFunctionTs.includes('/instance/connect/'), 'Deve conectar na Evolution API para QR Code');
    assert.ok(edgeFunctionTs.includes('/message/sendText/'), 'Deve disparar mensagens via sendText');
  });

  await t.test('3. Edge Function formata mensagens e link de rastreamento com precisão', () => {
    assert.ok(edgeFunctionTs.includes('getStatusMessage'), 'Deve conter gerador inteligente de mensagens');
    assert.ok(edgeFunctionTs.includes('confirmado'), 'Deve tratar status confirmado');
    assert.ok(edgeFunctionTs.includes('em_entrega'), 'Deve tratar status em_entrega');
    assert.ok(edgeFunctionTs.includes('pedido.html?ref='), 'Deve incluir link de rastreamento do pedido');
    assert.ok(edgeFunctionTs.includes('cleanPhone'), 'Deve conter higienizador de telefone DDI 55');
  });

  await t.test('4. Painel de Configurações possui interface completa de conexão e QR Code', () => {
    assert.ok(configHtml.includes('wa-connection-badge'), 'Deve ter badge de status de conexão');
    assert.ok(configHtml.includes('wa-qr-modal'), 'Deve ter modal do QR Code');
    assert.ok(configHtml.includes('openWhatsAppConnectModal'), 'Deve ter função para abrir modal do QR Code');
    assert.ok(configHtml.includes('checkWhatsAppStatusPolling'), 'Deve ter polling automático para verificar leitura do QR Code');
    assert.ok(configHtml.includes('s-whatsapp-auto-notify'), 'Deve ter checkbox para ativar/desativar envios automáticos');
  });

  await t.test('5. Painel de Pedidos dispara notificação automática com fallback seguro', () => {
    assert.ok(pedidosHtml.includes('triggerAutomaticWhatsAppNotify'), 'Deve disparar notificação automática ao mudar status');
    assert.ok(pedidosHtml.includes("action: 'send-order-notification'"), 'Deve invocar Edge Function whatsapp-notify');
    assert.ok(pedidosHtml.includes('window.handleWhatsAppNotify'), 'Deve conter fallback para wa.me manual caso não conectado');
  });
});
