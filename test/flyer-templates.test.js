import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Gerador de Encartes — Etapa 3: Módulo FlyerTemplates (Modelos, Identidade & Paginação)', async (t) => {
  const code = fs.readFileSync('./admin/modules/flyerTemplates.js', 'utf8');
  const sandbox = {
    window: {},
    console: console
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const FlyerTemplates = sandbox.window.FlyerTemplates;

  assert.ok(FlyerTemplates, 'FlyerTemplates deve ser exposto no escopo global/window');

  // Helper para gerar N produtos simulados
  function generateProducts(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: `p-${i + 1}`,
      name: `Produto Teste ${i + 1}`,
      category: i % 2 === 0 ? 'Mercearia' : 'Hortifrúti',
      price: (i + 1) * 10,
      promo_price: i % 2 === 0 ? (i + 1) * 8 : null,
      unit: i % 2 === 0 ? 'un' : 'kg',
      image: i % 3 === 0 ? `https://example.com/p-${i + 1}.jpg` : null,
      brand: i % 4 === 0 ? 'Marca X' : null,
      size: i % 2 === 0 ? 'M' : null,
      color: i % 2 === 0 ? 'Azul' : null,
      description: `Descrição do produto ${i + 1}`
    }));
  }

  await t.test('Paginação com seleção vazia', () => {
    const res = FlyerTemplates.paginate([], 6);
    assert.strictEqual(res.totalPages, 0, 'Total de páginas deve ser 0');
    assert.strictEqual(res.totalProducts, 0, 'Total de produtos deve ser 0');
    assert.strictEqual(res.pages.length, 0, 'Lista de páginas deve ter tamanho 0');
  });

  await t.test('Distribuição de produtos em páginas com 4 itens por página (não divisível)', () => {
    const prods = generateProducts(10);
    const res = FlyerTemplates.paginate(prods, 4);

    assert.strictEqual(res.totalPages, 3, '10 produtos com 4/pág deve gerar 3 páginas');
    assert.strictEqual(res.totalProducts, 10);
    assert.strictEqual(res.pages[0].length, 4, 'Página 1 deve ter 4 produtos');
    assert.strictEqual(res.pages[1].length, 4, 'Página 2 deve ter 4 produtos');
    assert.strictEqual(res.pages[2].length, 2, 'Página 3 deve ter 2 produtos restantes');
  });

  await t.test('Distribuição de produtos em páginas com 6 itens por página (padrão)', () => {
    const prods = generateProducts(13);
    const res = FlyerTemplates.paginate(prods, 6);

    assert.strictEqual(res.totalPages, 3, '13 produtos com 6/pág deve gerar 3 páginas');
    assert.strictEqual(res.pages[0].length, 6, 'Página 1 deve ter 6 produtos');
    assert.strictEqual(res.pages[1].length, 6, 'Página 2 deve ter 6 produtos');
    assert.strictEqual(res.pages[2].length, 1, 'Página 3 deve ter 1 produto');
  });

  await t.test('Distribuição de produtos em páginas com 8 itens por página', () => {
    const prods = generateProducts(17);
    const res = FlyerTemplates.paginate(prods, 8);

    assert.strictEqual(res.totalPages, 3, '17 produtos com 8/pág deve gerar 3 páginas');
    assert.strictEqual(res.pages[0].length, 8);
    assert.strictEqual(res.pages[1].length, 8);
    assert.strictEqual(res.pages[2].length, 1);
  });

  await t.test('Distribuição de produtos em páginas com 9 itens por página', () => {
    const prods = generateProducts(25);
    const res = FlyerTemplates.paginate(prods, 9);

    assert.strictEqual(res.totalPages, 3, '25 produtos com 9/pág deve gerar 3 páginas');
    assert.strictEqual(res.pages[0].length, 9);
    assert.strictEqual(res.pages[1].length, 9);
    assert.strictEqual(res.pages[2].length, 7);
  });

  await t.test('Garantia de ausência de perda ou duplicação na paginação', () => {
    const prods = generateProducts(31);
    const densities = [4, 6, 8, 9];

    for (const d of densities) {
      const res = FlyerTemplates.paginate(prods, d);
      const flattened = res.pages.flat();

      assert.strictEqual(flattened.length, prods.length, `Densidade ${d}: total de itens deve ser idêntico`);

      const originalIds = prods.map(p => p.id);
      const paginatedIds = flattened.map(p => p.id);
      assert.deepStrictEqual([...paginatedIds], originalIds, `Densidade ${d}: a ordem e integridade dos IDs deve ser preservada`);

      const uniqueIds = new Set(paginatedIds);
      assert.strictEqual(uniqueIds.size, prods.length, `Densidade ${d}: nenhum item duplicado`);
    }
  });

  await t.test('Aplicação da identidade visual da loja e fallbacks seguros', () => {
    // Caso 1: Loja com dados completos
    const completeStore = {
      name: 'Supermercado Progresso',
      color: '#10b981',
      logo_url: 'https://example.com/logo.png',
      slogan: 'Preço baixo todo dia',
      whatsapp: '11999998888',
      address: 'Rua Principal, 100',
      store_segment: 'market'
    };
    const b1 = FlyerTemplates.getStoreBranding(completeStore);
    assert.strictEqual(b1.name, 'Supermercado Progresso');
    assert.strictEqual(b1.color, '#10b981');
    assert.strictEqual(b1.logoUrl, 'https://example.com/logo.png');
    assert.strictEqual(b1.whatsapp, '11999998888');
    assert.strictEqual(b1.segment, 'market');

    // Caso 2: Loja sem logo e sem cor (fallbacks)
    const emptyStore = {};
    const b2 = FlyerTemplates.getStoreBranding(emptyStore);
    assert.strictEqual(b2.name, 'Sua Loja');
    assert.strictEqual(b2.color, '#e94560', 'Deve aplicar cor padrão segura');
    assert.strictEqual(b2.logoUrl, null);
    assert.strictEqual(b2.initial, 'S', 'Deve extrair inicial da loja para avatar');
    assert.strictEqual(b2.segment, 'market');
  });

  await t.test('Renderização de página nos 3 modelos visuais (Market, Food, Fashion)', () => {
    const prods = generateProducts(4);
    const store = {
      name: 'Loja Exemplo',
      color: '#3b82f6',
      logo_url: 'https://example.com/logo.png',
      store_segment: 'market'
    };

    // 1. Modelo Market
    const htmlMarket = FlyerTemplates.renderPage(prods, 0, 1, store, { template: 'market', itemsPerPage: 4 });
    assert.ok(htmlMarket.includes('flyer-theme-market'), 'Deve ter classe flyer-theme-market');
    assert.ok(htmlMarket.includes('SUPER OFERTAS'), 'Deve ter selo SUPER OFERTAS');
    assert.ok(htmlMarket.includes('flyer-grid-4'), 'Deve ter grid de 4 itens');

    // 2. Modelo Food
    const htmlFood = FlyerTemplates.renderPage(prods, 0, 1, store, { template: 'food', itemsPerPage: 4 });
    assert.ok(htmlFood.includes('flyer-theme-food'), 'Deve ter classe flyer-theme-food');
    assert.ok(htmlFood.includes('DELIVERY & PROMOÇÕES'), 'Deve ter selo de food');

    // 3. Modelo Fashion
    const htmlFashion = FlyerTemplates.renderPage(prods, 0, 1, store, { template: 'fashion', itemsPerPage: 4 });
    assert.ok(htmlFashion.includes('flyer-theme-fashion'), 'Deve ter classe flyer-theme-fashion');
    assert.ok(htmlFashion.includes('LOOKS & OFERTAS'), 'Deve ter selo de moda');
  });

  await t.test('Exibição de preços: promoção vs preço normal', () => {
    const prods = [
      { id: '1', name: 'Item Com Promoção', price: 50.00, promo_price: 39.90 },
      { id: '2', name: 'Item Preço Normal', price: 25.00, promo_price: null }
    ];
    const store = { name: 'Loja Teste' };

    const html = FlyerTemplates.renderPage(prods, 0, 1, store, { template: 'market', itemsPerPage: 4 });
    
    // Item promocional deve exibir preço riscado e preço promocional em destaque
    assert.ok(html.includes('De:') && html.includes('50,00'), 'Deve exibir preço normal de forma secundária com prefixo De:');
    assert.ok(html.includes('39,90'), 'Deve exibir preço promocional em destaque');
    assert.ok(html.includes('OFERTA'), 'Deve exibir tag de OFERTA para item em promoção');

    // Item normal não deve ter tag de oferta
    assert.ok(html.includes('25,00'), 'Deve exibir preço regular');
  });

  await t.test('Tratamento de produtos sem imagem (fallback SVG neutro)', () => {
    const prods = [{ id: '1', name: 'Produto Sem Foto', price: 10, image: null }];
    const store = { name: 'Loja Teste' };

    const html = FlyerTemplates.renderPage(prods, 0, 1, store, { template: 'market', itemsPerPage: 4 });
    assert.ok(html.includes('data:image/svg+xml'), 'Deve incluir fallback data URI SVG');
    assert.ok(html.includes('onerror='), 'Deve incluir tratamento onerror');
  });
});
