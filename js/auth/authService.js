/**
 * EncartShop — Auth Service
 * Gerencia o estado de autenticação real no Supabase.
 */

const AuthService = (() => {
  // Mantemos o store_id ativo no sessionStorage para a sessão do admin
  const STORAGE_KEY_ACTIVE_STORE = 'seven_active_store_id';

  async function signUp(email, password) {
    const { data, error } = await window.sb.auth.signUp({
      email,
      password
    });
    
    if (error) {
      console.error('AuthService.signUp erro:', error);
      return { userId: null, error: error.message };
    }
    
    return { userId: data.user?.id, error: null };
  }

  async function login(email, password) {
    const { data, error } = await window.sb.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('AuthService.login erro:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  }

  async function loginWithStore(storeId, email, password) {
    // Fluxo onde o usuário seleciona a loja e depois loga.
    // Primeiro fazemos o login real no auth do Supabase.
    const result = await login(email, password);
    
    if (result.success) {
      // Verifica se o usuário autenticado realmente tem permissão para essa loja
      const { data: store, error } = await window.sb
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .eq('user_id', result.data.user.id)
        .single();
        
      if (error || !store) {
        // O usuário logou mas não é dono dessa loja
        await logout(); // reverte
        return { success: false, error: 'Acesso negado para esta loja.' };
      }
      
      // Login e loja validados. Salva o store_id ativo.
      setActiveStoreId(storeId);
      return { success: true };
    }
    
    return result;
  }

  async function logout() {
    const { error } = await window.sb.auth.signOut();
    if (error) console.error('AuthService.logout erro:', error);
    clearActiveStoreId();
  }

  async function getUser() {
    const { data: { user } } = await window.sb.auth.getUser();
    return user;
  }

  function getActiveStoreId() {
    return sessionStorage.getItem(STORAGE_KEY_ACTIVE_STORE) || localStorage.getItem(STORAGE_KEY_ACTIVE_STORE) || null;
  }

  function setActiveStoreId(id) {
    if (id) {
      sessionStorage.setItem(STORAGE_KEY_ACTIVE_STORE, id);
      // Fallback para caso onde o localStorage era usado
      localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, id);
    }
  }

  function clearActiveStoreId() {
    sessionStorage.removeItem(STORAGE_KEY_ACTIVE_STORE);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_STORE);
  }

  async function updateCredentials(data) {
    const { error } = await window.sb.auth.updateUser(data);
    if (error) {
      console.error('AuthService.updateCredentials erro:', error);
      return { error: error.message };
    }
    return { error: null };
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
