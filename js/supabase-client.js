// Arquivo de configuração do Supabase
const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

// Inicializa o cliente globalmente
// Usamos window.supabaseClient para evitar conflito com o objeto da SDK (window.supabase)
try {
  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase Client inicializado com sucesso.');
  } else {
    console.error('Erro: SDK do Supabase não encontrada no objeto window.');
  }
} catch (e) {
  console.error('Erro ao instanciar o cliente Supabase:', e);
}

