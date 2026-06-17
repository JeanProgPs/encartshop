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

      // Supabase functions.invoke() ignores query strings in the function name,
      // so we use a direct fetch against the Edge Function URL instead.
      const SUPABASE_URL = SupabaseCore.SUPABASE_URL;
      const queryParams = new URLSearchParams({ action, ...params }).toString();
      const url = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}?${queryParams}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': SupabaseCore.SUPABASE_ANON_KEY,
        }
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error || `Edge Function returned a non-2xx status code`);
      }

      const data = await response.json();

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

  async function getStoresOverview(page = 1, search = '', filter = 'all') {
    return await fetchFromEdge('stores_overview', { page, search, filter });
  }

  return { getStats, getRecentClients, getClients, getClientDetail, getStoresOverview };
})();

window.PlatformAPI = PlatformAPI;
