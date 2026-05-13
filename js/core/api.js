/**
 * EncartShop — API Centralizada v2
 * Versão robusta com try/catch e segurança reforçada.
 */

const StoreAPI = {
  async getAll() {
    try {
      const { data, error } = await window.sb.from('stores').select('*');
      if (error) { console.error('StoreAPI.getAll:', error); return []; }
      return data || [];
    } catch (e) { console.error('StoreAPI.getAll:', e); return []; }
  },
  async getByUser(userId) {
    if (!userId) return [];
    try {
      const { data, error } = await window.sb.from('stores').select('*').eq('user_id', userId);
      if (error) { console.error('StoreAPI.getByUser:', error); return []; }
      return data || [];
    } catch (e) { return []; }
  },
  async getById(id) {
    if (!id) return null;
    try {
      const { data, error } = await window.sb.from('stores').select('*').eq('id', id).single();
      if (error) { if (error.code !== 'PGRST116') console.error('StoreAPI.getById:', error); return null; }
      return data || null;
    } catch (e) { return null; }
  },
  // Busca por slug: server-side, sem expor lista completa
  async getBySlug(slug) {
    if (!slug) return null;
    try {
      const slugify = t => (t||'').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-')
        .replace(/[^\w-]+/g,'').replace(/--+/g,'-').replace(/^-+|-+$/g,'');
      // Busca com ilike usando wildcard para acentos/espaços
      const { data, error } = await window.sb.from('stores')
        .select('*').ilike('name', slug.replace(/-/g, '%')).limit(5);
      if (error || !data?.length) return null;
      return data.find(s => slugify(s.name) === slug) || null;
    } catch (e) { return null; }
  },
  async create(storeData) {
    const d = { ...storeData }; delete d.slug;
    try {
      const { data, error } = await window.sb.from('stores').insert([d]).select().single();
      if (error) throw error;
      return data;
    } catch (e) { throw e; }
  },
  async update(id, storeData) {
    if (!id) throw new Error('ID obrigatório');
    const d = { ...storeData }; delete d.slug;
    try {
      const { data, error } = await window.sb.from('stores').update(d).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (e) { throw e; }
  },
  async delete(id) {
    if (!id) return false;
    try {
      const { error } = await window.sb.from('stores').delete().eq('id', id);
      if (error) { console.error('StoreAPI.delete:', error); return false; }
      return true;
    } catch (e) { return false; }
  }
};

const ProductAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    try {
      const { data, error } = await window.sb.from('products')
        .select('*').eq('store_id', storeId).order('name', { ascending: true });
      if (error) { console.error('ProductAPI.getByStore:', error); return []; }
      return data || [];
    } catch (e) { return []; }
  },
  async getActiveByStore(storeId) {
    if (!storeId) return [];
    try {
      const { data, error } = await window.sb.from('products')
        .select('*').eq('store_id', storeId).eq('active', true).order('name', { ascending: true });
      if (error) { console.error('ProductAPI.getActiveByStore:', error); return []; }
      return data || [];
    } catch (e) { return []; }
  },
  async add(storeId, productData) {
    if (!storeId) throw new Error('store_id obrigatório');
    try {
      const { data, error } = await window.sb.from('products')
        .insert([{ ...productData, store_id: storeId }]).select().single();
      if (error) throw error;
      return { data };
    } catch (e) { throw e; }
  },
  async update(id, productData) {
    if (!id) throw new Error('ID obrigatório');
    try {
      const { data, error } = await window.sb.from('products')
        .update(productData).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (e) { throw e; }
  },
  async delete(id) {
    if (!id) return false;
    try {
      const { error } = await window.sb.from('products').delete().eq('id', id);
      if (error) { console.error('ProductAPI.delete:', error); return false; }
      return true;
    } catch (e) { return false; }
  }
};

const OrderAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    try {
      const { data, error } = await window.sb.from('orders')
        .select('*').eq('store_id', storeId).order('created_at', { ascending: false });
      if (error) { console.error('OrderAPI.getByStore:', error); return []; }
      return data || [];
    } catch (e) { return []; }
  },
  async create(storeId, orderData) {
    if (!storeId) throw new Error('store_id obrigatório');
    try {
      const { error } = await window.sb.from('orders').insert([{ ...orderData, store_id: storeId }]);
      if (error) throw error;
      return true;
    } catch (e) { throw e; }
  },
  async updateStatus(id, newStatus) {
    if (!id || !newStatus) throw new Error('ID e status obrigatórios');
    try {
      const { data, error } = await window.sb.from('orders')
        .update({ status: newStatus }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (e) { throw e; }
  },
  async delete(id) {
    if (!id) return false;
    try {
      const { error } = await window.sb.from('orders').delete().eq('id', id);
      if (error) { console.error('OrderAPI.delete:', error); return false; }
      return true;
    } catch (e) { return false; }
  },
  async clearByStore(storeId) {
    if (!storeId) return false;
    try {
      const { error } = await window.sb.from('orders').delete().eq('store_id', storeId);
      if (error) { console.error('OrderAPI.clearByStore:', error); return false; }
      return true;
    } catch (e) { return false; }
  }
};

const AsaasAPI = {
  async createPayment(storeId, cpfCnpj, planValue) {
    if (!storeId) throw new Error('Store ID é obrigatório');
    try {
      const { data, error } = await window.sb.functions.invoke('asaas-payment', {
        body: { action: 'createPayment', storeId, cpfCnpj, planValue }
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Erro interno');
      return data;
    } catch (e) { throw e; }
  },
  async getPaymentStatus(paymentId) {
    if (!paymentId) return null;
    try {
      const { data, error } = await window.sb.functions.invoke('asaas-payment', {
        body: { action: 'getPaymentStatus', paymentId }
      });
      if (error) { console.error('AsaasAPI.getPaymentStatus:', error); return null; }
      return data;
    } catch (e) { return null; }
  }
};

window.EncartAPI = { StoreAPI, ProductAPI, OrderAPI, AsaasAPI };
