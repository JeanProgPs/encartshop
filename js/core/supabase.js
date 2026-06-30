/**
 * EncartShop — Supabase Core
 * Centraliza a URL e a chave anon do Supabase em um único ponto.
 * Suporta uso como script global e como módulo CommonJS.
 */
(function (global) {
  const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

  function createClient(supabaseSDK) {
    const sdk = supabaseSDK || (typeof window !== 'undefined' ? window.supabase : null);
    if (!sdk || !sdk.createClient) {
      throw new Error('[SupabaseCore] Supabase SDK não encontrada. Carregue o CDN antes de inicializar.');
    }

    return sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    });
  }

  function initSupabase() {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!window.supabase?.createClient) {
      console.error('[SupabaseCore] SDK do Supabase não carregada. Inclua o CDN antes deste arquivo.');
      return null;
    }

    if (!window.sb) {
      window.sb = createClient(window.supabase);
      window.supabaseClient = window.sb;
      console.info('[SupabaseCore] Supabase Core inicializado.');
    }

    return window.sb;
  }

  const publicApi = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    createClient,
    initSupabase,
    get client() {
      return typeof window !== 'undefined' ? window.sb : null;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return publicApi;
    });
  }

  if (typeof global !== 'undefined') {
    global.SupabaseCore = publicApi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
