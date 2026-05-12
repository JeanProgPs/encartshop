/**
 * EncartShop — Order Module
 * Lógica de negócios e fluxo de status para Pedidos.
 */

const OrderModule = (() => {
  // Fluxo de status: novo -> confirmado -> em_entrega -> finalizado | cancelado
  const STATUS_FLOW = {
    'novo': ['confirmado', 'cancelado'],
    'confirmado': ['em_entrega', 'cancelado'],
    'em_entrega': ['finalizado', 'cancelado'],
    'finalizado': [],
    'cancelado': []
  };

  async function getAll(storeId) {
    return await EncartAPI.OrderAPI.getByStore(storeId);
  }

  async function create(storeId, orderData) {
    if (!orderData.items || !orderData.items.length) {
      throw new Error('Pedido não pode estar vazio.');
    }
    
    orderData.status = 'novo';
    return await EncartAPI.OrderAPI.create(storeId, orderData);
  }

  async function updateStatus(orderId, currentStatus, newStatus) {
    const allowedNext = STATUS_FLOW[currentStatus] || [];
    
    // Verifica se a transição é permitida
    if (!allowedNext.includes(newStatus)) {
      throw new Error(`Transição de status inválida: de ${currentStatus} para ${newStatus}`);
    }
    
    return await EncartAPI.OrderAPI.updateStatus(orderId, newStatus);
  }

  async function remove(orderId) {
    return await EncartAPI.OrderAPI.delete(orderId);
  }

  async function clearAll(storeId) {
    return await EncartAPI.OrderAPI.clearByStore(storeId);
  }

  function getStatusLabel(status) {
    const labels = {
      'novo': 'Novo',
      'em_preparo': 'Em Preparo',
      'confirmado': 'Confirmado',
      'em_entrega': 'Em Entrega',
      'entregue': 'Entregue',
      'finalizado': 'Finalizado',
      'cancelado': 'Cancelado'
    };
    return labels[status] || status;
  }

  function getStatusClass(status) {
    const classes = {
      'novo': 'badge-primary',
      'em_preparo': 'badge-warning',
      'confirmado': 'badge-warning',
      'em_entrega': 'badge-info',
      'entregue': 'badge-success',
      'finalizado': 'badge-success',
      'cancelado': 'badge-danger'
    };
    return classes[status] || 'badge-secondary';
  }

  return { getAll, create, updateStatus, remove, clearAll, STATUS_FLOW, getStatusLabel, getStatusClass };
})();

window.OrderModule = OrderModule;
window.OrdersModule = OrderModule; // alias para compatibilidade
