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
    
    // Gera o slug a partir do nome se não for fornecido
    if (!storeData.slug) {
      storeData.slug = storeData.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9]+/g, '-')     // caracteres especiais por hífen
        .replace(/(^-|-$)+/g, '');       // remove hífen do começo e fim
    }
    
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
    
    // Usa caminhos absolutos e URLs amigáveis
    if (store.slug) return `/loja/${store.slug}`;
    
    return `/loja/index.html?s=${store.id}`;
  }

  async function save(storeData) {
    const id = AuthService.getActiveStoreId();
    if (!id) throw new Error('Loja não identificada');
    
    // Regenera slug se o nome mudar (opcional, mas bom para consistência)
    if (storeData.name) {
      storeData.slug = storeData.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }

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
