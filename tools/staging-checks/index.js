// Simple staging checks using @supabase/supabase-js
// Requires env vars (see README.md)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in env');
  process.exit(2);
}

const supabase = createClient(URL, ANON, { auth: { persistSession: false } });

async function run() {
  console.log('1) Verificando acesso anônimo a promoções públicas...');
  const { data: anonPromos, error: anonErr } = await supabase
    .from('promocoes')
    .select('id,store_id,titulo,ativa')
    .eq('ativa', true)
    .limit(50);
  if (anonErr) console.error('Erro (anon) ao listar promocoes:', anonErr.message);
  else console.log(`Anon: encontrou ${anonPromos.length} promoções públicas`);

  const userAEmail = process.env.TEST_USER_A_EMAIL;
  const userAPass = process.env.TEST_USER_A_PASSWORD;
  const userAStore = process.env.TEST_STORE_A_ID;

  if (!userAEmail || !userAPass || !userAStore) {
    console.warn('Variáveis de usuário de teste não definidas. Pulando testes autenticados.');
    return;
  }

  console.log('2) Autenticando como usuário A...');
  const { data: signA, error: signAErr } = await supabase.auth.signInWithPassword({
    email: userAEmail,
    password: userAPass,
  });
  if (signAErr) {
    console.error('Falha ao autenticar usuário A:', signAErr.message);
    process.exit(3);
  }
  console.log('Usuário A autenticado. Testando INSERT em promocoes (store_id = sua loja)...');

  const now = new Date();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { data: insertData, error: insertErr } = await supabase.from('promocoes').insert([
    {
      titulo: 'Teste RLS automatizado',
      descricao: 'Inserção via script de validação',
      store_id: userAStore,
      ativa: true,
      data_inicio: now.toISOString(),
      data_fim: tomorrow.toISOString(),
    },
  ]);

  if (insertErr) {
    console.error('INSERT falhou para usuário A (deveria permitir se store_id correto):', insertErr.message);
  } else {
    console.log('INSERT bem-sucedido para usuário A, id:', insertData[0].id);
  }

  console.log('3) Testando isolamento: usuário A não deve ver registros da loja B');
  const otherStore = process.env.TEST_STORE_B_ID;
  if (otherStore) {
    const { data: otherPromos, error: otherErr } = await supabase
      .from('promocoes')
      .select('id')
      .eq('store_id', otherStore);
    if (otherErr) console.error('Erro ao consultar promocoes de outra loja:', otherErr.message);
    else console.log(`Usuário A vê ${otherPromos.length} promoções da loja B (esperado: 0)`);
  } else {
    console.warn('TEST_STORE_B_ID não definido — pule teste de isolamento por loja');
  }

  console.log('4) Teste de upload em storage (logos): enviar arquivo na pasta da loja A');
  try {
    const filePath = `${userAStore}/staging-test.txt`;
    const content = Buffer.from('staging-check');
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('logos')
      .upload(filePath, content, { contentType: 'text/plain' });
    if (uploadErr) console.error('Upload falhou (usuário A):', uploadErr.message);
    else console.log('Upload bem-sucedido em:', filePath);
  } catch (e) {
    console.error('Erro inesperado no upload:', e.message || e);
  }

  console.log('\nFim dos checks. Revise logs para analisar resultados.');
}

run().catch((err) => {
  console.error('Erro no script:', err.message || err);
  process.exit(1);
});
