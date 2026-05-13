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
    
    // Geração automática e validação de slug
    let slug = storeData.slug || slugify(storeData.name);
    let finalSlug = slug;
    let counter = 1;
    
    // Verifica unicidade do slug
    while (true) {
      const existing = await EncartAPI.StoreAPI.getBySlug(finalSlug);
      if (!existing) break;
      finalSlug = `${slug}-${counter}`;
      counter++;
    }
    storeData.slug = finalSlug;
    
    // Pega o usuário logado para vincular a loja a ele
    const user = await AuthService.getUser();
    if (user) {
      storeData.user_id = user.id;
    }
    
    return await EncartAPI.StoreAPI.create(storeData);
  }

  function applyColor(hexColor) {
    if (!hexColor) return;
    document.documentElement.style.setProperty('--brand', hexColor);
    document.documentElement.style.setProperty('--brand-dark', hexColor); // Simplificado ou calculado
    document.documentElement.style.setProperty('--brand-glow', `${hexColor}1a`); // 10% opacidade
  }

  function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  function getStoreUrl(store) {
    if (!store) return '';
    
    // Usa nome da loja convertido para slug
    const slug = slugify(store.name || 'loja');
    
    // Se estivermos no painel admin, o link relativo é ../loja/index.html
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    if (isInsideAdmin || window.location.pathname.endsWith('/admin')) {
        return `../loja/index.html?s=${slug}`;
    }

    return `loja/index.html?s=${slug}`;
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

  const COLOR_PALETTE = [
    { name: 'Encart Red', hex: '#e94560' },
    { name: 'Royal Blue', hex: '#3b82f6' },
    { name: 'Emerald',    hex: '#10b981' },
    { name: 'Vivid Purple', hex: '#8b5cf6' },
    { name: 'Amber Gold', hex: '#f59e0b' },
    { name: 'Deep Pink',  hex: '#ec4899' },
    { name: 'Dark Slate', hex: '#334155' },
    { name: 'Orange',     hex: '#f97316' }
  ];

  return { getActive, create, save, applyColor, getStoreUrl, COLOR_PALETTE };
})();

window.StoreModule = StoreModule;
