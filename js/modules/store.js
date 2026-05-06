/**
 * EncartShop — Store Module
 * Lógica de negócios para Lojas.
 */

const StoreModule = (() => {
  async function getActive() {
    const id = AuthService.getActiveStoreId();
    if (!id) return null;
    return await EncartAPI.StoreAPI.getById(id);
  }

  async function create(storeData) {
    if (!storeData.name) throw new Error('Nome da loja é obrigatório');
    
    // Slug removido (coluna inexistente no banco)
    // if (!storeData.slug) { ... }
    
    // Pega o usuário logado para vincular a loja a ele
    const user = await AuthService.getUser();
    if (user) {
      storeData.user_id = user.id;
    }
    
    return await EncartAPI.StoreAPI.create(storeData);
  }

  function applyColor(hexColor) {
    if (!hexColor) return;
    document.documentElement.style.setProperty('--primary-color', hexColor);
  }

  function getStoreUrl(store) {
    if (!store) return '';
    
    // Usa apenas ID pois slug não existe no banco
    return `/loja/index.html?s=${store.id}`;
  }

  async function save(storeData) {
    const id = AuthService.getActiveStoreId();
    if (!id) throw new Error('Loja não identificada');
    
    // Slug removido
    // if (storeData.name) { ... }

    try {
      await EncartAPI.StoreAPI.update(id, storeData);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { getActive, create, save, applyColor, getStoreUrl };
})();

window.StoreModule = StoreModule;
