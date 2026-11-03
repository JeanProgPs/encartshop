import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Carrega buildOrderReceiptHtml diretamente de admin/pedidos.html
function loadBuildOrderReceiptHtml() {
  const htmlPath = path.resolve('admin/pedidos.html');
  const fileContent = fs.readFileSync(htmlPath, 'utf8');

  // Encontra o bloco da função buildOrderReceiptHtml dentro do HTML
  const fnMarker = 'window.buildOrderReceiptHtml = function';
  const startIdx = fileContent.indexOf(fnMarker);
  assert.ok(startIdx !== -1, 'buildOrderReceiptHtml deve existir em admin/pedidos.html');

  const endMarker = 'window.handlePrintOrder = function';
  const endIdx = fileContent.indexOf(endMarker, startIdx);
  assert.ok(endIdx !== -1, 'handlePrintOrder deve existir após buildOrderReceiptHtml');

  const fnCode = fileContent.substring(startIdx, endIdx);

  const sandbox = {
    window: {},
    currentStore: null,
    escapeHTML: (str) => String(str ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m])),
    UIRender: {
      fmtPrice: (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(fnCode, sandbox);

  return sandbox.window.buildOrderReceiptHtml;
}

test('Testes de Impressão de Pedidos (Qualidade e Espaçamento)', async (t) => {
  const buildOrderReceiptHtml = loadBuildOrderReceiptHtml();

  const mockOrder = {
    id: 'e9b25123-4567-89ab-cdef-123456789abc',
    created_at: '2026-11-03T10:30:00.000Z',
    customer_name: 'Maria Oliveira [#789ABC]',
    customer_phone: '11987654321',
    customer_address: 'Av. Paulista, 1000, Apto 42',
    delivery_fee: 10.00,
    items: [
      { id: '1', name: 'Maçã Fuji Selecionada', qty: 2, unit: 'kg', price: 8.50 },
      { id: '2', name: 'Suco de Laranja 1L', quantity: 3, unit: 'un', price: 12.00 }
    ],
    total: 63.00
  };

  const mockStore = {
    name: 'Hortifrúti da Villa',
    whatsapp_footer: 'Siga nosso Instagram @hortifruti'
  };

  const mockPayment = {
    status: 'confirmed'
  };

  await t.test('1. Qualidade e Contraste: regras CSS obrigatórias', () => {
    const html = buildOrderReceiptHtml(mockOrder, { store: mockStore, payment: mockPayment });

    // Deve conter diretivas de contraste exato para impressão (anti-desbotamento)
    assert.ok(html.includes('print-color-adjust: exact !important'), 'Deve incluir print-color-adjust');
    assert.ok(html.includes('-webkit-print-color-adjust: exact !important'), 'Deve incluir -webkit-print-color-adjust');

    // Textos devem ser estritamente pretos (#000000)
    assert.ok(html.includes('color: #000000 !important'), 'Deve aplicar cor preta absoluta #000000');

    // Não deve usar Courier New fino como fonte primária
    assert.ok(html.includes('Segoe UI') || html.includes('-apple-system'), 'Deve usar fonte sans-serif encorpada para excelente legibilidade');

    // Elementos principais em negrito alto
    assert.ok(html.includes('font-weight: 900'), 'Deve conter negrito extra (900) para totais e títulos');
    assert.ok(html.includes('font-weight: 800'), 'Deve conter negrito forte (800) para quantidades e rótulos');

    // Divisórias bem definidas
    assert.ok(html.includes('border-top: 2px solid #000000') || html.includes('border-bottom: 2px solid #000000'), 'Deve conter bordas sólidas marcadas para o total');
    assert.ok(html.includes('1.5px dashed #000000'), 'Divisórias tracejadas devem ter espessura mínima de 1.5px');
  });

  await t.test('2. Eliminação de Espaço Excessivo no Final: @page e alturas dinâmicas', () => {
    const html = buildOrderReceiptHtml(mockOrder, { store: mockStore });

    // Regra @page eliminando margens e cabeçalhos do navegador
    assert.ok(html.includes('@page'), 'Deve definir regra @page');
    assert.ok(html.includes('size: auto'), 'Deve ter size: auto em @page para corte automático');
    assert.ok(html.includes('margin: 0'), 'Deve ter margin: 0 em @page');

    // Altura auto e min-height zero
    assert.ok(html.includes('height: auto !important'), 'html e body devem ter height: auto');
    assert.ok(html.includes('min-height: 0 !important'), 'html e body devem ter min-height: 0');

    // Largura estrita do rolo térmico (80mm) sem espalhar na página
    assert.ok(html.includes('max-width: 80mm !important'), 'Deve delimitar max-width: 80mm em print');

    // Eliminação de margem inferior final
    assert.ok(html.includes('margin-bottom: 0 !important'), 'Rodapé e último filho devem zerar margin-bottom');

    // Prevenção de quebras de página indesejadas
    assert.ok(html.includes('page-break-after: avoid !important') || html.includes('break-after: avoid !important'), 'Deve evitar quebras de página extras');
  });

  await t.test('3. Preservação e Exibição Completa das Informações do Pedido', () => {
    const html = buildOrderReceiptHtml(mockOrder, { store: mockStore, payment: mockPayment });

    // Nome da loja
    assert.ok(html.includes('Hortifrúti da Villa'), 'Deve exibir nome da loja');

    // Referência do pedido
    assert.ok(html.includes('PEDIDO #89ABC'), 'Deve exibir ID do pedido resumido');

    // Informações do cliente
    assert.ok(html.includes('Maria Oliveira [#789ABC]'), 'Deve exibir nome do cliente');
    assert.ok(html.includes('11987654321'), 'Deve exibir telefone do cliente');
    assert.ok(html.includes('Av. Paulista, 1000, Apto 42'), 'Deve exibir endereço de entrega');
    assert.ok(html.includes('PIX Confirmado'), 'Deve exibir status do pagamento confirmado');

    // Itens com unidades corretas
    assert.ok(html.includes('2kg'), 'Deve formatar item por kg');
    assert.ok(html.includes('Maçã Fuji Selecionada'), 'Deve conter nome do item');
    assert.ok(html.includes('3x'), 'Deve formatar item unitário');
    assert.ok(html.includes('Suco de Laranja 1L'), 'Deve conter nome do segundo item');

    // Subtotal e Totais
    assert.ok(html.includes('Subtotal:'), 'Deve ter linha de subtotal');
    assert.ok(html.includes('Entrega:'), 'Deve ter linha de entrega');
    assert.ok(html.includes('TOTAL:'), 'Deve ter linha de TOTAL');

    // Mensagens de rodapé
    assert.ok(html.includes('Siga nosso Instagram @hortifruti'), 'Deve exibir rodapé personalizado da loja');
    assert.ok(html.includes('Obrigado pela preferência!'), 'Deve exibir mensagem padrão de agradecimento');
  });

  await t.test('4. Segurança e Casos de Borda: Escape HTML e valores vazios', () => {
    const maliciousOrder = {
      id: 'xxx-12345',
      created_at: null,
      customer_name: '<script>alert("hack")</script>',
      customer_phone: null,
      customer_address: null,
      delivery_fee: -1, // A combinar
      items: [
        { name: '<b>Produto com tag</b>', qty: 1, price: 15.00 }
      ]
    };

    const html = buildOrderReceiptHtml(maliciousOrder);

    // Tags perigosas escapadas
    assert.ok(!html.includes('<script>alert("hack")</script>'), 'Não deve conter tags de script injetadas');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'), 'Deve escapar nome do cliente malicioso');
    assert.ok(!html.includes('<b>Produto com tag</b>'), 'Não deve permitir HTML injetado no nome do produto');

    // Entrega a combinar
    assert.ok(html.includes('A combinar'), 'Deve indicar Entrega A combinar para delivery_fee: -1');

    // Fallback de loja quando não informada
    assert.ok(html.includes('EncartShop'), 'Deve usar EncartShop como fallback padrão de nome da loja');
  });
});
