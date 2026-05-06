/**
 * EncartShop — Product Module
 * Lógica de negócios e validação para Produtos.
 */

const ProductModule = (() => {
  async function getAll(storeId) {
    return await EncartAPI.ProductAPI.getByStore(storeId);
  }

  async function add(storeId, productData) {
    if (!productData.name || !productData.price || !productData.category) {
      return { success: false, errors: ['Nome, preço e categoria são obrigatórios.'] };
    }
    
    try {
      const res = await EncartAPI.ProductAPI.add(storeId, productData);
      return { success: true, data: res.data };
    } catch (e) {
      console.error("Erro ao adicionar produto:", e);
      return { success: false, errors: [e.message || 'Erro ao adicionar produto'] };
    }
  }

  async function update(productId, productData) {
    try {
      const res = await EncartAPI.ProductAPI.update(productId, productData);
      return { success: true, data: res };
    } catch (e) {
      console.error("Erro ao atualizar produto:", e);
      return { success: false, errors: [e.message || 'Erro ao atualizar produto'] };
    }
  }

  async function remove(productId) {
    return await EncartAPI.ProductAPI.delete(productId);
  }

  function filter(products, { query, category, status }) {
    let result = products;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    if (category) {
      result = result.filter(p => p.category === category);
    }
    if (status) {
      if (status === 'active') result = result.filter(p => p.active);
      else if (status === 'inactive') result = result.filter(p => !p.active);
      else if (status === 'promo') result = result.filter(p => !!p.promo_price && p.active);
    }
    return result;
  }

  function getCategories(products) {
    return [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  }

  async function toggleActive(productId, currentStatus) {
    return await update(productId, { active: !currentStatus });
  }

  return { getAll, add, create: add, update, remove, filter, getCategories, toggleActive };
})();

window.ProductModule = ProductModule;
window.ProductsModule = ProductModule; // alias
