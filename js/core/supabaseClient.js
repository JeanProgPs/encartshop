/**
 * EncartShop — Supabase Core Client
 * Fonte única do cliente Supabase para toda a aplicação.
 * NUNCA exponha a service_role key aqui — use apenas a anon/publishable key.
 */

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

(function initSupabaseCore() {
  if (typeof window === 'undefined') return;

  try {
    if (!window.supabase?.createClient) {
      console.error('[EncartShop] SDK do Supabase não carregada. Inclua o CDN antes deste arquivo.');
      return;
    }

    // Expõe como window.sb para uso interno dos módulos
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    });

    // Mantém retrocompatibilidade com código legado que usa window.supabaseClient
    window.supabaseClient = window.sb;

    console.info('[EncartShop] Supabase Core inicializado.');
  } catch (err) {
    console.error('[EncartShop] Falha ao inicializar Supabase:', err);
  }
})();
