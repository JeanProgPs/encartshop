import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Gerador de Encartes — Etapa 1 & 2: Estrutura, Controle de Acesso & Elementos de Seleção', async (t) => {
  const encartesHtml = fs.readFileSync('./admin/encartes.html', 'utf8');
  const componentsJs = fs.readFileSync('./js/ui/components.js', 'utf8');

  await t.test('Verifica se o item de menu Encartes foi adicionado à sidebar em components.js', () => {
    assert.ok(
      componentsJs.includes("navItem('encartes', 'newspaper', 'Encartes')"),
      'Deve conter a chamada navItem para encartes com ícone newspaper'
    );
  });

  await t.test('Verifica se admin/encartes.html possui atributos e scripts obrigatórios do painel', () => {
    assert.ok(
      encartesHtml.includes('data-page="encartes"'),
      'Body deve ter data-page="encartes" para marcação de navegação ativa'
    );
    assert.ok(
      encartesHtml.includes('id="sidebar"'),
      'Deve conter aside id="sidebar" para injeção de navegação padrão'
    );
    assert.ok(
      encartesHtml.includes('/js/admin-common.js'),
      'Deve incluir admin-common.js para bootstrap e auth guard'
    );
    assert.ok(
      encartesHtml.includes('/js/modules/subscription.js'),
      'Deve incluir subscription.js para controle de validade da assinatura'
    );
    assert.ok(
      encartesHtml.includes('/js/modules/store.js'),
      'Deve incluir store.js para carregar dados da loja ativa'
    );
    assert.ok(
      encartesHtml.includes('/js/modules/products.js'),
      'Deve incluir products.js para carregar os produtos do catálogo'
    );
    assert.ok(
      encartesHtml.includes('/admin/modules/flyerProducts.js'),
      'Deve incluir flyerProducts.js para gerenciar filtros e seleção'
    );
  });

  await t.test('Verifica se o controle de planos valida exclusivamente Pro e Enterprise', () => {
    assert.ok(
      encartesHtml.includes("plan === 'pro' || plan === 'enterprise'"),
      'Deve verificar estritamente se o plano é pro ou enterprise'
    );
  });

  await t.test('Verifica se a tela de paywall/upgrade é tratada e interrompe carregamento para plano Start', () => {
    assert.ok(
      encartesHtml.includes('id="paywall-container"'),
      'Deve existir container de paywall para o plano Start'
    );
    assert.ok(
      encartesHtml.includes('href="pagamento.html"'),
      'Paywall deve conter link direto para pagamento.html para upgrade'
    );
    // Verifica que se não for Pro/Enterprise, o código retorna antes de chamar loadCatalog
    const paywallCheckIdx = encartesHtml.indexOf('if (!isProOrEnterprise)');
    const loadCatalogIdx = encartesHtml.indexOf('await loadCatalog');
    assert.ok(
      paywallCheckIdx !== -1 && loadCatalogIdx !== -1 && paywallCheckIdx < loadCatalogIdx,
      'A checagem de plano Start deve abortar a execução antes de carregar o catálogo de produtos'
    );
  });

  await t.test('Verifica se os elementos da interface de filtros e busca da Etapa 2 estão presentes', () => {
    assert.ok(encartesHtml.includes('id="search-input"'), 'Deve conter input de busca textual');
    assert.ok(encartesHtml.includes('id="filter-category"'), 'Deve conter select de categorias');
    assert.ok(encartesHtml.includes('id="btn-filter-promo"'), 'Deve conter botão de filtro por promoção');
    assert.ok(encartesHtml.includes('id="btn-reset-filters"'), 'Deve conter botão de limpar filtros');
  });

  await t.test('Verifica se as ações em massa e o grid da Etapa 2 estão presentes', () => {
    assert.ok(encartesHtml.includes('id="btn-select-all-filtered"'), 'Deve conter botão para selecionar todos os filtrados');
    assert.ok(encartesHtml.includes('id="btn-clear-selection"'), 'Deve conter botão para limpar seleção');
    assert.ok(encartesHtml.includes('id="products-grid"'), 'Deve conter grid para renderizar os produtos');
  });

  await t.test('Verifica se os estados de carregamento, erro e catálogo vazio estão presentes', () => {
    assert.ok(encartesHtml.includes('id="products-loading"'), 'Deve conter skeleton de carregamento');
    assert.ok(encartesHtml.includes('id="products-error-state"'), 'Deve conter estado de erro com retry');
    assert.ok(encartesHtml.includes('id="products-empty-catalog"'), 'Deve conter estado de catálogo vazio');
    assert.ok(encartesHtml.includes('id="products-empty-filter"'), 'Deve conter estado de filtro sem resultados');
  });

  await t.test('Verifica se os elementos de Modelos Visuais e Paginação da Etapa 3 estão presentes', () => {
    assert.ok(encartesHtml.includes('/css/flyer-templates.css'), 'Deve incluir a folha de estilos flyer-templates.css');
    assert.ok(encartesHtml.includes('/admin/modules/flyerTemplates.js'), 'Deve incluir o script flyerTemplates.js');
    assert.ok(encartesHtml.includes('id="view-preview"'), 'Deve conter a visualização de prévia do encarte');
    assert.ok(encartesHtml.includes('id="flyer-page-render-target"'), 'Deve conter o alvo de renderização A4');
    assert.ok(encartesHtml.includes('data-template="market"'), 'Deve conter seletor de modelo mercado');
    assert.ok(encartesHtml.includes('data-template="food"'), 'Deve conter seletor de modelo food');
    assert.ok(encartesHtml.includes('data-template="fashion"'), 'Deve conter seletor de modelo fashion');
    assert.ok(encartesHtml.includes('data-density="4"'), 'Deve conter seletor de 4 itens por página');
    assert.ok(encartesHtml.includes('data-density="6"'), 'Deve conter seletor de 6 itens por página');
    assert.ok(encartesHtml.includes('data-density="8"'), 'Deve conter seletor de 8 itens por página');
    assert.ok(encartesHtml.includes('data-density="9"'), 'Deve conter seletor de 9 itens por página');
    assert.ok(encartesHtml.includes('id="btn-prev-page"'), 'Deve conter botão de página anterior');
    assert.ok(encartesHtml.includes('id="btn-next-page"'), 'Deve conter botão de próxima página');
  });
});
