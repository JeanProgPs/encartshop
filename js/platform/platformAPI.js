/**
 * EncartShop — Platform API
 * Interface para comunicação com a Edge Function `platform-admin`.
 */

const PlatformAPI = (() => {
  const FUNCTION_NAME = 'platform-admin';

  async function fetchFromEdge(action, params = {}) {
    try {
      const token = await AuthService.getToken();
      if (!token) throw new Error('Não autenticado');

      // Constroi query string
      const queryParams = new URLSearchParams({ action, ...params }).toString();
      
      const { data, error } = await window.sb.functions.invoke(`${FUNCTION_NAME}?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (error) {
        throw new Error(error.message || 'Erro na comunicação com o servidor');
      }

      if (data?.error) {
         throw new Error(data.error);
      }

      return data;
    } catch (e) {
      console.error(`[PlatformAPI] Erro ao buscar action=${action}:`, e);
      throw e;
    }
  }

  async function getStats() {
    return await fetchFromEdge('stats');
  }

  async function getRecentClients() {
    return await fetchFromEdge('recent_clients');
  }

  async function getClients(page = 1, search = '', filter = 'all') {
    return await fetchFromEdge('clients', { page, search, filter });
  }

  async function getClientDetail(storeId) {
    return await fetchFromEdge('client_detail', { store_id: storeId });
  }

  return { getStats, getRecentClients, getClients, getClientDetail };
})();

window.PlatformAPI = PlatformAPI;
