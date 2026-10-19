import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Gerador de Encartes — Etapa 2: Módulo FlyerProducts (Filtros & Seleção)', async (t) => {
  const code = fs.readFileSync('./admin/modules/flyerProducts.js', 'utf8');
  const sandbox = {
    window: {},
    console: console,
    ProductModule: {
      getAll: async () => []
    }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const FlyerProducts = sandbox.window.FlyerProducts;

  assert.ok(FlyerProducts, 'FlyerProducts deve ser exposto no escopo global/window');

  const sampleProducts = [
    {
      id: 'prod-1',
      name: 'Arroz Tipo 1 5kg',
      category: 'Mercearia',
      price: 28.90,
      promo_price: 24.90,
      unit: 'pct',
      active: true,
      image: 'https://example.com/arroz.jpg',
      brand: 'Tio João'
    },
    {
      id: 'prod-2',
      name: 'Feijão Carioca 1kg',
      category: 'Mercearia',
      price: 8.50,
      promo_price: null,
      unit: 'pct',
      active: true,
      image: null,
      brand: 'Camil'
    },
    {
      id: 'prod-3',
      name: 'Picanha Bovina Peça',
      category: 'Açougue',
      price: 69.90,
      promo_price: 59.90,
      unit: 'kg',
      active: true,
      image: 'https://example.com/picanha.jpg',
      brand: 'Friboi'
    },
    {
      id: 'prod-4',
      name: 'Camiseta Básica Algodão',
      category: 'Vestuário',
      price: 49.90,
      promo_price: null,
      unit: 'un',
      active: true,
      image: null,
      brand: 'Hering'
    },
    {
      id: 'prod-5',
      name: 'Maçã Gala Nacional',
      category: 'Hortifrúti',
      price: 9.90,
      promo_price: 7.90,
      unit: 'kg',
      active: true,
      image: 'https://example.com/maca.jpg',
      brand: null
    }
  ];

  t.beforeEach(() => {
    FlyerProducts.setProducts(sampleProducts);
    FlyerProducts.resetFilters();
    FlyerProducts.clearSelection();
  });

  await t.test('Carregamento e listagem geral de produtos', () => {
    const all = FlyerProducts.getAllProducts();
    assert.strictEqual(all.length, 5, 'Deve conter 5 produtos carregados');
  });

  await t.test('Extração e ordenação única de categorias', () => {
    const categories = FlyerProducts.getCategories();
    assert.deepStrictEqual(
      [...categories],
      ['Açougue', 'Hortifrúti', 'Mercearia', 'Vestuário'],
      'Deve retornar categorias únicas ordenadas alfabeticamente'
    );
  });

  await t.test('Filtro por busca textual (nome ou marca)', () => {
    // Busca por nome "Arroz"
    let filtered = FlyerProducts.filterProducts(sampleProducts, { query: 'Arroz' });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'prod-1');

    // Busca por marca "Hering"
    filtered = FlyerProducts.filterProducts(sampleProducts, { query: 'hering' });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'prod-4');
  });

  await t.test('Filtro por categoria específica', () => {
    const filtered = FlyerProducts.filterProducts(sampleProducts, { category: 'Mercearia' });
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(p => p.category === 'Mercearia'));
  });

  await t.test('Filtro exclusivo para produtos com preço promocional', () => {
    const filtered = FlyerProducts.filterProducts(sampleProducts, { onlyPromo: true });
    // prod-1 (24.90 < 28.90), prod-3 (59.90 < 69.90), prod-5 (7.90 < 9.90)
    assert.strictEqual(filtered.length, 3);
    assert.ok(filtered.every(p => FlyerProducts.hasPromoPrice(p)), 'Todos devem ter preço promocional válido');
  });

  await t.test('Combinação de filtros (categoria + promoção + busca)', () => {
    const filtered = FlyerProducts.filterProducts(sampleProducts, {
      category: 'Mercearia',
      onlyPromo: true,
      query: 'Arroz'
    });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'prod-1');
  });

  await t.test('Seleção individual de produtos (selecionar, alternar e desmarcar)', () => {
    assert.strictEqual(FlyerProducts.isSelected('prod-1'), false);
    
    // Alterna para selecionado
    const state1 = FlyerProducts.toggleSelect('prod-1');
    assert.strictEqual(state1, true);
    assert.strictEqual(FlyerProducts.isSelected('prod-1'), true);
    assert.strictEqual(FlyerProducts.getSelectedCount(), 1);

    // Alterna de volta para desmarcado
    const state2 = FlyerProducts.toggleSelect('prod-1');
    assert.strictEqual(state2, false);
    assert.strictEqual(FlyerProducts.isSelected('prod-1'), false);
    assert.strictEqual(FlyerProducts.getSelectedCount(), 0);

    // Define explicitamente via setSelect
    FlyerProducts.setSelect('prod-2', true);
    assert.strictEqual(FlyerProducts.isSelected('prod-2'), true);
    FlyerProducts.setSelect('prod-2', false);
    assert.strictEqual(FlyerProducts.isSelected('prod-2'), false);
  });

  await t.test('Seleção em massa dos produtos filtrados e limpar seleção', () => {
    // Aplica filtro por Açougue (retorna 1 produto)
    FlyerProducts.setFilters({ category: 'Açougue' });
    const filtered = FlyerProducts.getFilteredProducts();
    assert.strictEqual(filtered.length, 1);

    // Seleciona todos os filtrados
    FlyerProducts.selectAll(filtered);
    assert.strictEqual(FlyerProducts.getSelectedCount(), 1);
    assert.strictEqual(FlyerProducts.isSelected('prod-3'), true);

    // Limpa filtros e seleciona tudo do catálogo
    FlyerProducts.resetFilters();
    FlyerProducts.selectAll(FlyerProducts.getAllProducts());
    assert.strictEqual(FlyerProducts.getSelectedCount(), 5);

    // Limpa toda a seleção
    FlyerProducts.clearSelection();
    assert.strictEqual(FlyerProducts.getSelectedCount(), 0);
  });

  await t.test('Cálculo correto de estatísticas (getStats)', () => {
    FlyerProducts.setFilters({ category: 'Mercearia' }); // 2 produtos
    FlyerProducts.setSelect('prod-1', true); // seleciona 1 dos 2

    const stats = FlyerProducts.getStats();
    assert.strictEqual(stats.total, 5, 'Total do catálogo deve ser 5');
    assert.strictEqual(stats.filteredCount, 2, 'Filtrados devem ser 2');
    assert.strictEqual(stats.selectedTotal, 1, 'Total selecionado deve ser 1');
    assert.strictEqual(stats.selectedFilteredCount, 1, 'Selecionados filtrados deve ser 1');
    assert.strictEqual(stats.isAllFilteredSelected, false, 'Nem todos os filtrados estão selecionados');

    // Seleciona o outro item da Mercearia
    FlyerProducts.setSelect('prod-2', true);
    const updatedStats = FlyerProducts.getStats();
    assert.strictEqual(updatedStats.isAllFilteredSelected, true, 'Agora todos os filtrados estão selecionados');
  });

  await t.test('Formatação de valores e escape HTML de segurança', () => {
    const formatted = FlyerProducts.formatMoney(29.90);
    assert.ok(formatted.includes('29,90'), 'Deve formatar preço em padrão brasileiro');

    const escaped = FlyerProducts.escapeHTML('<script>alert("xss")</script>');
    assert.strictEqual(escaped.includes('<script>'), false, 'Deve escapar caracteres perigosos');
  });
});
