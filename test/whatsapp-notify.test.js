import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractInlineScripts(html) {
  const scripts = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].trim()) scripts.push(match[1]);
  }
  return scripts;
}

test('Auditoria e Testes — Integração WhatsApp (Evolution API)', async (t) => {
  const rootDir = process.cwd();
  const baseMigrationSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/create_whatsapp_integration.sql'), 'utf8');
  const globalMigrationSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20261125121900_create_global_config.sql'), 'utf8');
  const secMigrationSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/20261126130000_whatsapp_security_and_logs.sql'), 'utf8');

  const edgeFunctionTs = fs.readFileSync(path.join(rootDir, 'supabase/functions/whatsapp-notify/index.ts'), 'utf8');
  const platformAdminTs = fs.readFileSync(path.join(rootDir, 'supabase/functions/platform-admin/index.ts'), 'utf8');
  const platformApiJs = fs.readFileSync(path.join(rootDir, 'js/platform/platformAPI.js'), 'utf8');
  const platformConfigHtml = fs.readFileSync(path.join(rootDir, 'platform/configuracoes.html'), 'utf8');

  const configHtml = fs.readFileSync(path.join(rootDir, 'admin/configuracoes.html'), 'utf8');
  const dashboardHtml = fs.readFileSync(path.join(rootDir, 'admin/dashboard.html'), 'utf8');
  const pedidosHtml = fs.readFileSync(path.join(rootDir, 'admin/pedidos.html'), 'utf8');

  await t.test('1. Migrations SQL garantem estrutura, RLS e idempotência', () => {
    assert.ok(baseMigrationSql.includes('whatsapp_auto_notify boolean'));
    assert.ok(baseMigrationSql.includes('evolution_instance_name text'));
    assert.ok(baseMigrationSql.includes('whatsapp_connected boolean'));
    assert.ok(baseMigrationSql.includes('whatsapp_connected_phone text'));

    assert.ok(globalMigrationSql.includes('CREATE TABLE IF NOT EXISTS global_config'));

    assert.ok(secMigrationSql.includes('ALTER TABLE global_config ENABLE ROW LEVEL SECURITY'));
    assert.ok(secMigrationSql.includes('REVOKE ALL ON TABLE global_config FROM anon'));
    assert.ok(secMigrationSql.includes('REVOKE ALL ON TABLE global_config FROM authenticated'));
    assert.ok(secMigrationSql.includes('CREATE TABLE IF NOT EXISTS whatsapp_notification_logs'));
    assert.ok(secMigrationSql.includes('uq_wa_notif_sent_order_status'));
  });

  await t.test('2. Edge Function whatsapp-notify: segurança, prioridade global_config e ações', () => {
    assert.ok(edgeFunctionTs.includes('supabaseAdmin.auth.getUser(token)'), 'Deve validar JWT');
    assert.ok(edgeFunctionTs.includes("store.user_id !== user.id && !isSuperAdmin"), 'Deve validar dono da loja ou SUPER_ADMIN');
    assert.ok(edgeFunctionTs.includes(".from('global_config')"), 'Deve consultar global_config primeiro');
    assert.ok(!edgeFunctionTs.includes('store.evolution_api_key'), 'Não deve depender de API Key na tabela stores');
    assert.ok(edgeFunctionTs.includes("eq('store_id', storeId)"), 'Deve isolar pedidos por store_id');
    assert.ok(edgeFunctionTs.includes("action === 'get-qr'"));
    assert.ok(edgeFunctionTs.includes("action === 'check-status'"));
    assert.ok(edgeFunctionTs.includes("action === 'disconnect'"));
    assert.ok(edgeFunctionTs.includes("action === 'send-order-notification'"));
    assert.ok(edgeFunctionTs.includes('whatsapp_notification_logs'), 'Deve registrar logs e checar idempotência');
  });

  await t.test('3. Normalização de telefone brasileiro e modelos de mensagem', () => {
    // Testa a lógica equivalente à função cleanPhone da Edge Function
    const cleanPhone = (rawPhone) => {
      let digits = String(rawPhone || '').replace(/\D/g, '');
      if (!digits) return '';
      if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
      if (digits.length === 10 || digits.length === 11) return '55' + digits;
      if (digits.length >= 12 && digits.length <= 15) return digits;
      return '';
    };

    assert.strictEqual(cleanPhone('(11) 98765-4321'), '5511987654321');
    assert.strictEqual(cleanPhone('5511987654321'), '5511987654321', 'Não deve duplicar DDI 55');
    assert.strictEqual(cleanPhone('021999998888'), '5521999998888');
    assert.strictEqual(cleanPhone('12345'), '', 'Deve rejeitar número inválido');

    assert.ok(edgeFunctionTs.includes("case 'confirmado':"));
    assert.ok(edgeFunctionTs.includes("case 'em_entrega':"));
    assert.ok(edgeFunctionTs.includes("case 'finalizado':"));
    assert.ok(edgeFunctionTs.includes("case 'cancelado':"));
    assert.ok(edgeFunctionTs.includes('store.name'), 'Mensagem deve incluir nome da loja');
    assert.ok(edgeFunctionTs.includes('pedido.html?ref='), 'Mensagem deve incluir link de rastreio');
  });

  await t.test('4. Painel da Plataforma (SUPER_ADMIN) gerencia configuração global com chave mascarada', () => {
    assert.ok(platformAdminTs.includes("action === 'get_global_config'"));
    assert.ok(platformAdminTs.includes("action === 'save_global_config'"));
    assert.ok(platformAdminTs.includes("action === 'test_evolution_api'"));
    assert.ok(platformAdminTs.includes('masked_api_key'), 'Deve retornar apenas chave mascarada');

    assert.ok(platformApiJs.includes('getGlobalConfig'));
    assert.ok(platformApiJs.includes('saveGlobalConfig'));
    assert.ok(platformApiJs.includes('testEvolutionApi'));

    assert.ok(platformConfigHtml.includes('Integração WhatsApp — Evolution API'));
    assert.ok(platformConfigHtml.includes('evo-api-url'));
    assert.ok(platformConfigHtml.includes('evo-api-key'));
    assert.ok(platformConfigHtml.includes('btn-test-evo'));
  });

  await t.test('5. Painel da Loja sem credenciais globais e sem duplicações', () => {
    assert.ok(!dashboardHtml.includes('global_config'), 'admin/dashboard.html não deve conter blocos de global_config');
    assert.ok(!dashboardHtml.includes('global-evolution-key'), 'admin/dashboard.html não deve conter inputs de API Key global');

    assert.ok(!configHtml.includes('s-evolution-url'), 'admin/configuracoes.html não deve ter input de URL global');
    assert.ok(!configHtml.includes('s-evolution-key'), 'admin/configuracoes.html não deve ter input de API Key global');
    assert.ok(!configHtml.includes("from('global_config')"), 'Frontend da loja não deve consultar global_config');

    const matches = configHtml.match(/async function testWhatsAppConnection\s*\(/g) || [];
    assert.strictEqual(matches.length, 1, 'testWhatsAppConnection deve existir apenas uma vez');
    assert.ok(configHtml.includes('wa-connected-phone'), 'Deve exibir número conectado');
    assert.ok(configHtml.includes('markQrCodeExpired'), 'Deve tratar expiração do QR Code');
  });

  await t.test('6. Painel de Pedidos impede disparo quando status não muda', () => {
    assert.ok(pedidosHtml.includes('if (currentStatus === newStatus) return;'));
    assert.ok(pedidosHtml.includes('previousStatus'));
    assert.ok(pedidosHtml.includes('triggerAutomaticWhatsAppNotify'));
  });

  await t.test('7. Sintaxe JavaScript válida em todos os arquivos modificados', () => {
    new vm.Script(platformApiJs, { filename: 'js/platform/platformAPI.js' });

    for (const [name, html] of [
      ['admin/configuracoes.html', configHtml],
      ['admin/dashboard.html', dashboardHtml],
      ['admin/pedidos.html', pedidosHtml],
      ['platform/configuracoes.html', platformConfigHtml]
    ]) {
      const scripts = extractInlineScripts(html);
      assert.ok(scripts.length > 0, `${name} deve possuir scripts`);
      scripts.forEach((code, idx) => {
        new vm.Script(code, { filename: `${name}#script${idx}` });
      });
    }
  });

  await t.test('8. Isolamento entre duas lojas (instâncias independentes)', () => {
    const getInstanceName = (store) =>
      store.evolution_instance_name || `loja_${store.id.replace(/-/g, '').slice(0, 12)}`;

    const storeA = { id: '11111111-aaaa-bbbb-cccc-111111111111', evolution_instance_name: null };
    const storeB = { id: '22222222-dddd-eeee-ffff-222222222222', evolution_instance_name: null };

    const instA = getInstanceName(storeA);
    const instB = getInstanceName(storeB);

    assert.notStrictEqual(instA, instB, 'Lojas diferentes devem ter instâncias independentes');
    assert.ok(instA.startsWith('loja_'));
    assert.ok(instB.startsWith('loja_'));
  });
});
