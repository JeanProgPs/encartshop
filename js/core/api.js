/**
 * EncartShop — API Centralizada
 * Todas as requisições de dados para o Supabase (exceto Auth).
 */

const StoreAPI = {
  async getAll() {
    return EncartHelpers.safeFetch(window.sb.from('stores').select('*'));
  },
  async getByUser(userId) {
    if (!userId) return [];
    return EncartHelpers.safeFetch(window.sb.from('stores').select('*').eq('user_id', userId));
  },
  async getById(id) {
    if (!id) return null;
    return EncartHelpers.safeFetch(window.sb.from('stores').select('*').eq('id', id).single(), null);
  },
  async getBySlug(slug) {
    return null;
  },
  async create(storeData) {
    const cleanData = { ...storeData };
    delete cleanData.slug; 
    const { data, error } = await window.sb.from('stores').insert([cleanData]).select().single();
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao criar loja'); throw error; }
    return data;
  },
  async update(id, storeData) {
    const cleanData = { ...storeData };
    delete cleanData.slug;
    const { data, error } = await window.sb.from('stores').update(cleanData).eq('id', id).select().single();
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao atualizar loja'); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('stores').delete().eq('id', id);
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao deletar loja'); return false; }
    return true;
  }
};

const ProductAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    return EncartHelpers.safeFetch(window.sb.from('products').select('*').eq('store_id', storeId).order('name', { ascending: true }));
  },
  async getActiveByStore(storeId) {
    if (!storeId) return [];
    return EncartHelpers.safeFetch(
      window.sb.from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('active', true)
        .order('name', { ascending: true })
    );
  },
  async add(storeId, productData) {
    const payload = { ...productData, store_id: storeId };
    const { data, error } = await window.sb.from('products').insert([payload]).select().single();
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao adicionar produto'); throw error; }
    return { data };
  },
  async update(id, productData) {
    const { data, error } = await window.sb.from('products').update(productData).eq('id', id).select().single();
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao atualizar produto'); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('products').delete().eq('id', id);
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao excluir produto'); return false; }
    return true;
  }
};

const OrderAPI = {
  async getByStore(storeId) {
    if (!storeId) return [];
    return EncartHelpers.safeFetch(
      window.sb.from('orders')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
    );
  },
  async create(storeId, orderData) {
    const payload = { ...orderData, store_id: storeId };
    const { error } = await window.sb.from('orders').insert([payload]);
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao enviar pedido'); throw error; }
    return true;
  },
  async updateStatus(id, newStatus) {
    const { data, error } = await window.sb.from('orders').update({ status: newStatus }).eq('id', id).select().single();
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao atualizar pedido'); throw error; }
    return data;
  },
  async delete(id) {
    const { error } = await window.sb.from('orders').delete().eq('id', id);
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao excluir pedido'); return false; }
    return true;
  },
  async clearByStore(storeId) {
    if (!storeId) return false;
    const { error } = await window.sb.from('orders').delete().eq('store_id', storeId);
    if (error) { EncartHelpers.globalErrorHandler(error, 'Erro ao limpar pedidos'); return false; }
    return true;
  }
};

const AsaasAPI = {
  /**
   * Solicita a criação de uma cobrança para a loja através da Edge Function.
   * @param {string} storeId 
   * @param {string} cpfCnpj
   * @param {number} planValue
   */
  async createPayment(storeId, cpfCnpj, planValue) {
    if (!storeId) throw new Error('Store ID é obrigatório');
    const { data, error } = await window.sb.functions.invoke('asaas-payment', {
      body: { action: 'createPayment', storeId, cpfCnpj, planValue }
    });
    if (error) { console.error('AsaasAPI.createPayment erro:', error); throw error; }
    
    // Se a função retornou 200 mas com erro interno (success: false)
    if (data && data.success === false) {
      throw new Error(data.error || 'Erro interno na geração do pagamento');
    }
    
    return data;
  },

  /**
   * Consulta o status atual de uma cobrança.
   * @param {string} paymentId 
   */
  async getPaymentStatus(paymentId) {
    if (!paymentId) return null;
    const { data, error } = await window.sb.functions.invoke('asaas-payment', {
      body: { action: 'getPaymentStatus', paymentId }
    });
    if (error) { console.error('AsaasAPI.getPaymentStatus erro:', error); return null; }
    return data;
  }
};

window.EncartAPI = {
  StoreAPI,
  ProductAPI,
  OrderAPI,
  AsaasAPI
};
