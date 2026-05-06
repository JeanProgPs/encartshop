/**
 * EncartShop — API Centralizada
 * Todas as requisições de dados para o Supabase (exceto Auth).
 */

const StoreAPI = {
  async getAll() {
    const { data, error } = await window.sb.from('stores').select('*');
    if (error) { console.error('StoreAPI.getAll erro:', error); return []; }
    return data || [];
  },
  async getById(id) {
    if (!id) return null;
    const { data, error } = await window.sb.from('stores').select('*').eq('id', id).single();
    if (error) { console.error('StoreAPI.getById erro:', error); return null; }
    return data;
  },
  async getBySlug(slug) {
    // Desativado temporariamente pois a coluna slug não existe no banco
    return null;
  },
  async create(storeData) {
    const cleanData = { ...storeData };
    delete cleanData.slug; // Remove para evitar erro se a coluna não existir
    const { data, error } = await window.sb.from('stores').insert([cleanData]).select().single();
    if (error) { console.error('StoreAPI.create erro:', error); throw error; }
    return data;
  },
  async update(id, storeData) {
    const cleanData = { ...storeData };
    delete cleanData.slug; // Remove para evitar erro se a coluna não existir
    const { data, error } = await window.sb.from('stores').update(cleanData).eq('id', id).select().single();
    if (error) { console.error('StoreAPI.update erro:', error); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('stores').delete().eq('id', id);
    if (error) { console.error('StoreAPI.delete erro:', error); return false; }
    return true;
  }
};

const ProductAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    const { data, error } = await window.sb.from('products').select('*').eq('store_id', storeId).order('name', { ascending: true });
    if (error) { console.error('ProductAPI.getByStore erro:', error); return []; }
    return data || [];
  },
  async getActiveByStore(storeId) {
    if (!storeId) return [];
    const { data, error } = await window.sb.from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) { console.error('ProductAPI.getActiveByStore erro:', error); return []; }
    return data || [];
  },
  async add(storeId, productData) {
    const payload = { ...productData, store_id: storeId };
    const { data, error } = await window.sb.from('products').insert([payload]).select().single();
    if (error) { console.error('ProductAPI.add erro:', error); throw error; }
    return { data };
  },
  async update(id, productData) {
    const { data, error } = await window.sb.from('products').update(productData).eq('id', id).select().single();
    if (error) { console.error('ProductAPI.update erro:', error); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('products').delete().eq('id', id);
    if (error) { console.error('ProductAPI.delete erro:', error); return false; }
    return true;
  }
};

const OrderAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    const { data, error } = await window.sb.from('orders').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
    if (error) { console.error('OrderAPI.getByStore erro:', error); return []; }
    return data || [];
  },
  async create(storeId, orderData) {
    const payload = { ...orderData, store_id: storeId };
    const { data, error } = await window.sb.from('orders').insert([payload]).select().single();
    if (error) { console.error('OrderAPI.create erro:', error); throw error; }
    return data;
  },
  async updateStatus(id, newStatus) {
    const { data, error } = await window.sb.from('orders').update({ status: newStatus }).eq('id', id).select().single();
    if (error) { console.error('OrderAPI.updateStatus erro:', error); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('orders').delete().eq('id', id);
    if (error) { console.error('OrderAPI.delete erro:', error); return false; }
    return true;
  },
  async clearByStore(storeId) {
    if (!storeId) return false;
    const { error } = await window.sb.from('orders').delete().eq('store_id', storeId);
    if (error) { console.error('OrderAPI.clearByStore erro:', error); return false; }
    return true;
  }
};

window.EncartAPI = {
  StoreAPI,
  ProductAPI,
  OrderAPI
};
