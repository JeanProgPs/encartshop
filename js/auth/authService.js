/**
 * EncartShop — Auth Service v2
 * Gerencia autenticação com Supabase. Versão robusta com tratamento de erros.
 */

const AuthService = (() => {
  const STORAGE_KEY_ACTIVE_STORE = 'seven_active_store_id';

  async function signUp(email, password) {
    try {
      const { data, error } = await window.sb.auth.signUp({ email, password });
      if (error) {
        console.error('AuthService.signUp erro:', error);
        return { userId: null, error: error.message };
      }
      return { userId: data?.user?.id || null, error: null };
    } catch (e) {
      console.error('AuthService.signUp exceção:', e);
      return { userId: null, error: e.message || 'Erro ao criar conta.' };
    }
  }

  async function login(email, password) {
    try {
      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('AuthService.login erro:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (e) {
      console.error('AuthService.login exceção:', e);
      return { success: false, error: e.message || 'Erro ao fazer login.' };
    }
  }

  async function loginWithStore(storeId, email, password) {
    try {
      const result = await login(email, password);
      if (!result.success) return result;

      // Verifica se o usuário autenticado é o dono dessa loja
      const { data: store, error } = await window.sb
        .from('stores')
        .select('id, user_id')
        .eq('id', storeId)
        .eq('user_id', result.data.user.id)
        .single();

      if (error || !store) {
        await logout();
        return { success: false, error: 'Acesso negado para esta loja.' };
      }

      setActiveStoreId(storeId);
      return { success: true };
    } catch (e) {
      console.error('AuthService.loginWithStore exceção:', e);
      return { success: false, error: e.message || 'Erro de autenticação.' };
    }
  }

  async function logout() {
    try {
      const { error } = await window.sb.auth.signOut();
      if (error) console.error('AuthService.logout erro:', error);
    } catch (e) {
      console.error('AuthService.logout exceção:', e);
    } finally {
      clearActiveStoreId();
    }
  }

  async function getUser() {
    try {
      const { data, error } = await window.sb.auth.getUser();
      if (error) {
        // Session expirada ou inválida — não loga como erro crítico
        if (error.message?.includes('session') || error.message?.includes('JWT')) {
          console.warn('AuthService.getUser: sessão inválida ou expirada.');
        } else {
          console.error('AuthService.getUser erro:', error);
        }
        return null;
      }
      return data?.user || null;
    } catch (e) {
      console.error('AuthService.getUser exceção:', e);
      return null;
    }
  }

  function getActiveStoreId() {
    try {
      return (
        sessionStorage.getItem(STORAGE_KEY_ACTIVE_STORE) ||
        localStorage.getItem(STORAGE_KEY_ACTIVE_STORE) ||
        null
      );
    } catch {
      return null; // Safari privado pode bloquear storage
    }
  }

  function setActiveStoreId(id) {
    if (!id) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_ACTIVE_STORE, id);
      localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, id);
    } catch (e) {
      console.warn('AuthService.setActiveStoreId: não foi possível salvar no storage:', e);
    }
  }

  function clearActiveStoreId() {
    try {
      sessionStorage.removeItem(STORAGE_KEY_ACTIVE_STORE);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_STORE);
    } catch { /* ignora */ }
  }

  async function updateCredentials(data) {
    try {
      const { error } = await window.sb.auth.updateUser(data);
      if (error) {
        console.error('AuthService.updateCredentials erro:', error);
        return { error: error.message };
      }
      return { error: null };
    } catch (e) {
      console.error('AuthService.updateCredentials exceção:', e);
      return { error: e.message || 'Erro ao atualizar credenciais.' };
    }
  }

  return {
    signUp,
    login,
    loginWithStore,
    logout,
    getUser,
    updateCredentials,
    getActiveStoreId,
    setActiveStoreId,
    clearActiveStoreId
  };
})();

window.AuthService = AuthService;
