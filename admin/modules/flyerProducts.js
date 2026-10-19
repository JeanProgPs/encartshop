/**
 * EncartShop — FlyerProducts Module (Etapa 2)
 * Gerenciamento de carregamento, filtragem e seleção individual/em massa
 * de produtos para o Gerador de Encartes.
 */

const FlyerProducts = (() => {
  let _products = [];
  let _selectedIds = new Set();
  let _filters = {
    query: '',
    category: '',
    onlyPromo: false
  };

  /**
   * Inicializa o módulo buscando os produtos da loja ativa através de ProductModule.
   * Não grava nem altera nenhum dado no banco.
   * @param {string} storeId
   * @returns {Promise<Array>} Lista de produtos carregados
   */
  async function loadProducts(storeId) {
    if (!storeId) throw new Error('ID da loja é obrigatório para carregar produtos.');
    
    // Utiliza o módulo padrão do projeto (ProductModule)
    if (typeof ProductModule !== 'undefined' && typeof ProductModule.getAll === 'function') {
      _products = await ProductModule.getAll(storeId);
    } else if (typeof window !== 'undefined' && window.EncartAPI?.ProductAPI?.getByStore) {
      _products = await window.EncartAPI.ProductAPI.getByStore(storeId);
    } else {
      _products = [];
    }

    if (!Array.isArray(_products)) {
      _products = [];
    }

    return _products;
  }

  /**
   * Define manualmente os produtos (útil para testes unitários ou mock).
   * @param {Array} prods
   */
  function setProducts(prods) {
    _products = Array.isArray(prods) ? [...prods] : [];
    return _products;
  }

  /**
   * Retorna todos os produtos em memória.
   * @returns {Array}
   */
  function getAllProducts() {
    return _products;
  }

  /**
   * Extrai categorias únicas e ordenadas alfabeticamente dos produtos carregados.
   * @param {Array} prods
   * @returns {Array<string>}
   */
  function getCategories(prods = _products) {
    const list = Array.isArray(prods) ? prods : [];
    return [...new Set(list.map(p => (p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /**
   * Verifica se um produto possui preço promocional válido e ativo.
   * @param {Object} p
   * @returns {boolean}
   */
  function hasPromoPrice(p) {
    if (!p) return false;
    const promo = Number(p.promo_price);
    const regular = Number(p.price);
    return !isNaN(promo) && promo > 0 && promo < regular;
  }

  /**
   * Função pura para filtrar produtos com base em query, categoria e filtro de promoção.
   * @param {Array} prods
   * @param {Object} filters
   * @returns {Array}
   */
  function filterProducts(prods = _products, filters = _filters) {
    let result = Array.isArray(prods) ? prods : [];
    const q = (filters.query || '').trim().toLowerCase();
    const cat = (filters.category || '').trim();
    const onlyPromo = !!filters.onlyPromo;

    if (q) {
      result = result.filter(p => {
        const name = (p.name || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const description = (p.description || '').toLowerCase();
        return name.includes(q) || category.includes(q) || brand.includes(q) || description.includes(q);
      });
    }

    if (cat) {
      result = result.filter(p => (p.category || '').trim().toLowerCase() === cat.toLowerCase());
    }

    if (onlyPromo) {
      result = result.filter(p => hasPromoPrice(p));
    }

    return result;
  }

  /**
   * Atualiza os filtros e retorna a lista resultante.
   * @param {Object} newFilters
   * @returns {Array}
   */
  function setFilters(newFilters = {}) {
    _filters = { ..._filters, ...newFilters };
    return getFilteredProducts();
  }

  /**
   * Retorna os produtos filtrados usando os filtros atuais.
   * @returns {Array}
   */
  function getFilteredProducts() {
    return filterProducts(_products, _filters);
  }

  /**
   * Limpa os filtros de pesquisa.
   */
  function resetFilters() {
    _filters = {
      query: '',
      category: '',
      onlyPromo: false
    };
    return getFilteredProducts();
  }

  /**
   * Retorna os filtros atuais.
   */
  function getFilters() {
    return { ..._filters };
  }

  // ── Controle de Seleção ──────────────────────────────────────

  /**
   * Verifica se um produto está selecionado.
   * @param {string} id
   * @returns {boolean}
   */
  function isSelected(id) {
    return _selectedIds.has(String(id));
  }

  /**
   * Alterna a seleção de um produto individualmente.
   * @param {string} id
   * @returns {boolean} Novo estado de seleção
   */
  function toggleSelect(id) {
    const strId = String(id);
    if (_selectedIds.has(strId)) {
      _selectedIds.delete(strId);
      return false;
    } else {
      _selectedIds.add(strId);
      return true;
    }
  }

  /**
   * Define explicitamente a seleção de um produto.
   * @param {string} id
   * @param {boolean} selected
   */
  function setSelect(id, selected) {
    const strId = String(id);
    if (selected) {
      _selectedIds.add(strId);
    } else {
      _selectedIds.delete(strId);
    }
    return selected;
  }

  /**
   * Seleciona todos os produtos fornecidos (normalmente os que estão visíveis no filtro atual).
   * @param {Array} productsToSelect
   * @returns {number} Quantidade total de selecionados
   */
  function selectAll(productsToSelect = getFilteredProducts()) {
    if (Array.isArray(productsToSelect)) {
      productsToSelect.forEach(p => {
        if (p && p.id) _selectedIds.add(String(p.id));
      });
    }
    return _selectedIds.size;
  }

  /**
   * Desmarca todos os produtos fornecidos (normalmente os filtrados).
   * @param {Array} productsToDeselect
   * @returns {number} Quantidade total de selecionados restante
   */
  function deselectAll(productsToDeselect = getFilteredProducts()) {
    if (Array.isArray(productsToDeselect)) {
      productsToDeselect.forEach(p => {
        if (p && p.id) _selectedIds.delete(String(p.id));
      });
    }
    return _selectedIds.size;
  }

  /**
   * Limpa completamente a seleção de produtos.
   */
  function clearSelection() {
    _selectedIds.clear();
    return 0;
  }

  /**
   * Retorna array com os IDs dos produtos selecionados.
   * @returns {Array<string>}
   */
  function getSelectedIds() {
    return Array.from(_selectedIds);
  }

  /**
   * Retorna array com os objetos completos dos produtos selecionados.
   * @returns {Array<Object>}
   */
  function getSelectedProducts() {
    return _products.filter(p => _selectedIds.has(String(p.id)));
  }

  /**
   * Retorna quantidade de produtos selecionados.
   * @returns {number}
   */
  function getSelectedCount() {
    return _selectedIds.size;
  }

  /**
   * Retorna estatísticas de contagem.
   */
  function getStats() {
    const filtered = getFilteredProducts();
    const selectedFiltered = filtered.filter(p => _selectedIds.has(String(p.id)));
    return {
      total: _products.length,
      filteredCount: filtered.length,
      selectedTotal: _selectedIds.size,
      selectedFilteredCount: selectedFiltered.length,
      isAllFilteredSelected: filtered.length > 0 && selectedFiltered.length === filtered.length
    };
  }

  // ── Utilitários de Formatação ─────────────────────────────────

  function formatMoney(value) {
    if (value === undefined || value === null || value === '') return 'R$ 0,00';
    const num = Number(value);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHTML(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  return {
    loadProducts,
    setProducts,
    getAllProducts,
    getCategories,
    hasPromoPrice,
    filterProducts,
    setFilters,
    getFilteredProducts,
    resetFilters,
    getFilters,
    isSelected,
    toggleSelect,
    setSelect,
    selectAll,
    deselectAll,
    clearSelection,
    getSelectedIds,
    getSelectedProducts,
    getSelectedCount,
    getStats,
    formatMoney,
    escapeHTML
  };
})();

if (typeof window !== 'undefined') {
  window.FlyerProducts = FlyerProducts;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlyerProducts;
}
