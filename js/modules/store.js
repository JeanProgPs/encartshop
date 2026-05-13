/**
 * EncartShop — Store Module v2
 * Lógica de negócios para Lojas com suporte a SLUG persistente.
 */

const StoreModule = (() => {
  async function getActive() {
    const id = AuthService.getActiveStoreId();
    if (!id) return null;
    return await EncartAPI.StoreAPI.getById(id);
  }

  async function create(storeData) {
    if (!storeData.name) throw new Error('Nome da loja é obrigatório');
    
    // Gera o slug inicial baseado no nome
    storeData.slug = slugify(storeData.name);
    
    const user = await AuthService.getUser();
    if (user) {
      storeData.user_id = user.id;
    }
    
    return await EncartAPI.StoreAPI.create(storeData);
  }

  function applyColor(hexColor) {
    if (!hexColor) return;
    document.documentElement.style.setProperty('--brand', hexColor);
    document.documentElement.style.setProperty('--brand-dark', _darkenColor(hexColor));
    document.documentElement.style.setProperty('--brand-glow', `${hexColor}1a`);
  }

  function _darkenColor(hex) {
    try {
      const n = parseInt(hex.replace('#',''), 16);
      const r = Math.max(0, (n >> 16 & 255) - 40);
      const g = Math.max(0, (n >>  8 & 255) - 40);
      const b = Math.max(0, (n       & 255) - 40);
      return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    } catch { return hex; }
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
    
    // Prioriza o slug do banco, se não houver gera na hora (fallback)
    const slug = store.slug || slugify(store.name || 'loja');
    
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    if (isInsideAdmin || window.location.pathname.endsWith('/admin')) {
        return `../loja/index.html?s=${slug}`;
    }

    return `loja/index.html?s=${slug}`;
  }

  async function save(storeData) {
    const id = AuthService.getActiveStoreId();
    if (!id) throw new Error('Loja não identificada');
    
    // Se o nome mudou, gera um novo slug (opcional, mas mantém consistência)
    if (storeData.name) {
      storeData.slug = slugify(storeData.name);
    }

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

  return { getActive, create, save, applyColor, getStoreUrl, slugify, COLOR_PALETTE };
})();

window.StoreModule = StoreModule;
