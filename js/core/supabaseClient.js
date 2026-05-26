/**
 * EncartShop — Supabase Client Bootstrap
 * Continua compatível com o código legado mas usa o módulo central de configuração.
 */
(function initSupabaseClient() {
  if (typeof window === 'undefined') return;

  if (typeof window.SupabaseCore === 'undefined') {
    console.error('[EncartShop] SupabaseCore não foi carregado. Inclua /js/core/supabase.js antes deste arquivo.');
    return;
  }

  window.SupabaseCore.initSupabase();
})();
