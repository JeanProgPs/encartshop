/**
 * EncartShop — SevenStorage (Compatibility Layer) v4
 *
 * MANTÉM a interface pública idêntica para retrocompatibilidade.
 * Internamente delega para os novos módulos: EncartAPI, AuthService, StoreModule, etc.
 *
 * Qualquer HTML que chame SevenStorage.xxx() continuará funcionando sem alteração.
 */

const SevenStorage = (() => {

  // Paleta de cores (mantida aqui para retrocompat)
  const COLOR_PALETTE = [
    { name: 'Vermelho', hex: '#e94560' },
    { name: 'Verde',    hex: '#27ae60' },
    { name: 'Azul',     hex: '#3498db' },
    { name: 'Laranja',  hex: '#f39c12' },
    { name: 'Roxo',     hex: '#9b59b6' },
    { name: 'Rosa',     hex: '#e91e8c' },
    { name: 'Teal',     hex: '#1abc9c' },
    { name: 'Índigo',   hex: '#5c6bc0' },
    { name: 'Âmbar',    hex: '#ffa000' },
    { name: 'Coral',    hex: '#ff5722' },
  ];

  // ── Sessão ────────────────────────────────────────────────
  function getActiveStoreId()  { return AuthService.getActiveStoreId(); }
  function setActiveStoreId(id){ AuthService.setActiveStoreId(id); }
  function clearActiveStore()  { AuthService.clearActiveStoreId(); }

  // ── Lojas ─────────────────────────────────────────────────
  async function getAllStores() {
    const user = await AuthService.getUser();
    if (!user) return [];
    return await EncartAPI.StoreAPI.getByUser(user.id);
  }
  async function getStoreById(id)  { return await EncartAPI.StoreAPI.getById(id); }
  async function getStore(id)      { return id ? await EncartAPI.StoreAPI.getById(id) : await StoreModule.getActive() || {}; }
  async function saveStore(data, id) {
    const storeId = id || getActiveStoreId();
    if (!storeId) return;
    await EncartAPI.StoreAPI.update(storeId, data);
  }
  async function createStore(data) { return await StoreModule.create(data); }
  async function deleteStore(id)   { return await EncartAPI.StoreAPI.delete(id); }

  // ── Produtos ──────────────────────────────────────────────
  async function getProducts(storeId) {
    return await EncartAPI.ProductAPI.getByStore(storeId || getActiveStoreId());
  }
  async function addProduct(product, storeId) {
    const id     = storeId || getActiveStoreId();
    const result = await EncartAPI.ProductAPI.add(id, product);
    return result?.data || null;
  }
  async function updateProduct(pid, data) {
    return await EncartAPI.ProductAPI.update(pid, data);
  }
  async function deleteProduct(pid) {
    return await EncartAPI.ProductAPI.delete(pid);
  }

  // ── Pedidos ───────────────────────────────────────────────
  async function getOrders(storeId) {
    return await EncartAPI.OrderAPI.getByStore(storeId || getActiveStoreId());
  }
  async function addOrder(order, storeId) {
    const id = storeId || getActiveStoreId();
    return await EncartAPI.OrderAPI.create(id, order);
  }
  async function updateOrderStatus(oid, status) {
    return await EncartAPI.OrderAPI.updateStatus(oid, status);
  }
  async function deleteOrder(oid) {
    return await EncartAPI.OrderAPI.delete(oid);
  }
  async function clearOrders(storeId) {
    return await EncartAPI.OrderAPI.clearByStore(storeId || getActiveStoreId());
  }

  // ── Carrinho (Local) ──────────────────────────────────────
  function getCart(storeId) {
    const id = storeId || getActiveStoreId();
    return JSON.parse(localStorage.getItem(`encart_cart_${id}`) || '[]');
  }
  function saveCart(cart, storeId) {
    const id = storeId || getActiveStoreId();
    localStorage.setItem(`encart_cart_${id}`, JSON.stringify(cart));
  }
  function clearCart(storeId) {
    const id = storeId || getActiveStoreId();
    localStorage.removeItem(`encart_cart_${id}`);
    // Limpa também chave legada
    localStorage.removeItem(`seven_cart_${id}`);
  }

  // ── Auth ──────────────────────────────────────────────────
  function isLoggedIn() {
    // Mantém verificação síncrona rápida para retrocompat
    return !!getActiveStoreId();
  }

  async function login(storeId, email, password) {
    const result = await AuthService.loginWithStore(storeId, email, password);
    return result.success;
  }

  async function logout() {
    await AuthService.logout();
  }

  async function requireAuth() {
    await AuthGuard.requireAuth();
  }

  // ── Cor ───────────────────────────────────────────────────
  function applyStoreColor(color) { StoreModule.applyColor(color); }

  // ── Init (mantido por retrocompat) ────────────────────────
  async function init() {}

  return {
    COLOR_PALETTE,
    getAllStores, getStoreById, createStore, deleteStore,
    getActiveStoreId, setActiveStoreId, clearActiveStore,
    getStore, saveStore,
    getProducts, addProduct, updateProduct, deleteProduct,
    getOrders, addOrder, updateOrderStatus, deleteOrder, clearOrders,
    getCart, saveCart, clearCart,
    isLoggedIn, login, logout, requireAuth,
    applyStoreColor, init,
  };

})();

window.SevenStorage = SevenStorage;
