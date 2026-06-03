/**
 * Script para executar migração de campos SEO na tabela stores
 * Executa via Supabase admin client
 */

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

// Para fazer ALTER TABLE, precisamos de credenciais de admin
// Fallback: usar a REST API com queries SQL
async function runMigration() {
  const migrationSQL = `
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS seo_title TEXT,
      ADD COLUMN IF NOT EXISTS seo_description TEXT,
      ADD COLUMN IF NOT EXISTS seo_keywords TEXT;
  `;

  try {
    // Tentar executar via RPC SQL (se disponível)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ query: migrationSQL })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Erro ao executar migração:', result);
      console.log('\n⚠️  A chave anon não pode executar ALTER TABLE.');
      console.log('Alternativas:');
      console.log('1. Use o Supabase Dashboard → SQL Editor → Cole e execute a SQL');
      console.log('2. Use supabase CLI: supabase db push');
      console.log('3. Forneça uma SUPABASE_SERVICE_ROLE_KEY nos env vars\n');
      process.exit(1);
    }

    console.log('✅ Migração executada com sucesso!');
    console.log(result);
  } catch (err) {
    console.error('Erro:', err.message);
    console.log('\n⚠️  Não foi possível executar via API.');
    console.log('Execute manualmente no Supabase Dashboard:\n');
    console.log(migrationSQL);
    process.exit(1);
  }
}

runMigration();
