-- ============================================================
-- EncartShop — Validação em Staging
-- Execute estes comandos no SQL Editor do Supabase (staging)
-- ============================================================

-- 1) Verificar existência de tabelas e RLS habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('clientes','promocoes')
ORDER BY tablename;

-- 2) Listar policies criadas para as tabelas
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('clientes','promocoes')
ORDER BY tablename, policyname;

-- 3) Verificar políticas de storage (se aplicável)
SELECT policyname, tablename, permissive, cmd
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

-- 4) Verificações de dados (exemplos)
SELECT count(*) AS qtd_promocoes_ativas
FROM promocoes
WHERE ativa = true
  AND data_inicio <= NOW()
  AND data_fim >= NOW();

SELECT id, store_id, titulo, ativa, data_inicio, data_fim
FROM promocoes
WHERE ativa = true
  AND data_inicio <= NOW()
  AND data_fim >= NOW()
LIMIT 50;

-- 5) Checklist rápido
-- [ ] Tabelas criadas: clientes, promocoes
-- [ ] RLS habilitado em ambas
-- [ ] Policies aplicadas e corretas
-- [ ] Storage policies listadas e isoladas por store_id
