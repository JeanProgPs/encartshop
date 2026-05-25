-- ============================================================
-- EncartShop — Auditar Tabelas Não Documentadas
-- Verificar se "clientes" e "promocoes" existem
-- Se existem, adicionar RLS se não tiver
-- ============================================================

-- ============================================================
-- Passo 1: Verificar quais tabelas existem
-- ============================================================

-- Query de diagnóstico: listar todas as tabelas
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('stores', 'products', 'orders', 'profiles', 'delivery_zones') 
      THEN 'Conhecida — RLS auditada'
    WHEN table_name IN ('clientes', 'promocoes') 
      THEN '⚠️ NÃO AUDITADA — Requer RLS'
    ELSE '❓ Desconhecida'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================
-- Passo 2: Se "clientes" existir, verificar e adicionar RLS
-- ============================================================

-- Diagnosticar: tem RLS habilitado?
SELECT 
  tablename,
  rowsecurity as "RLS_Habilitado?"
FROM pg_tables
WHERE tablename = 'clientes' AND schemaname = 'public';

-- Se resultado for vazio, a tabela não existe (OK)
-- Se resultado for 'f' (false), precisa habilitar RLS:

DO $$
DECLARE
  has_table boolean;
  has_rls boolean;
BEGIN
  -- Verificar se tabela existe
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'clientes'
  ) INTO has_table;

  IF has_table THEN
    -- Verificar se RLS está habilitado
    SELECT rowsecurity INTO has_rls
    FROM pg_tables
    WHERE tablename = 'clientes' AND schemaname = 'public';

    IF NOT has_rls THEN
      -- Habilitar RLS
      ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
      
      -- Criar policies de isolamento (assumindo que tem coluna store_id ou user_id)
      -- NOTA: Ajustar conforme estrutura real da tabela
      
      -- SELECT: próprios clientes + cliente anonimato (sem auth)
      CREATE POLICY "clientes_select_own"
        ON clientes FOR SELECT
        USING (
          user_id = auth.uid()
          OR store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- INSERT: próprios clientes ou loja
      CREATE POLICY "clientes_insert_own"
        ON clientes FOR INSERT
        WITH CHECK (
          user_id = auth.uid()
          OR store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- UPDATE: próprios dados
      CREATE POLICY "clientes_update_own"
        ON clientes FOR UPDATE
        USING (
          user_id = auth.uid()
          OR store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- DELETE: apenas loja/dono
      CREATE POLICY "clientes_delete_own"
        ON clientes FOR DELETE
        USING (
          user_id = auth.uid()
          OR store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      RAISE NOTICE 'RLS habilitado e policies criadas para tabela clientes';
    ELSE
      RAISE NOTICE 'RLS já está habilitado na tabela clientes';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela clientes não existe (OK)';
  END IF;
END $$;

-- ============================================================
-- Passo 3: Se "promocoes" existir, verificar e adicionar RLS
-- ============================================================

-- Diagnosticar: tem RLS habilitado?
SELECT 
  tablename,
  rowsecurity as "RLS_Habilitado?"
FROM pg_tables
WHERE tablename = 'promocoes' AND schemaname = 'public';

-- Se resultado for 'f' (false), precisa habilitar RLS:

DO $$
DECLARE
  has_table boolean;
  has_rls boolean;
BEGIN
  -- Verificar se tabela existe
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'promocoes'
  ) INTO has_table;

  IF has_table THEN
    -- Verificar se RLS está habilitado
    SELECT rowsecurity INTO has_rls
    FROM pg_tables
    WHERE tablename = 'promocoes' AND schemaname = 'public';

    IF NOT has_rls THEN
      -- Habilitar RLS
      ALTER TABLE promocoes ENABLE ROW LEVEL SECURITY;
      
      -- Criar policies de isolamento
      -- NOTA: Ajustar conforme estrutura real da tabela
      
      -- SELECT: público (promoções da loja ativa) ou dono
      CREATE POLICY "promocoes_select_public"
        ON promocoes FOR SELECT
        USING (
          store_id IN (SELECT id FROM stores WHERE status = 'active')
          OR store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- INSERT: apenas loja
      CREATE POLICY "promocoes_insert_own"
        ON promocoes FOR INSERT
        WITH CHECK (
          store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- UPDATE: apenas loja
      CREATE POLICY "promocoes_update_own"
        ON promocoes FOR UPDATE
        USING (
          store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      -- DELETE: apenas loja
      CREATE POLICY "promocoes_delete_own"
        ON promocoes FOR DELETE
        USING (
          store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
        );

      RAISE NOTICE 'RLS habilitado e policies criadas para tabela promocoes';
    ELSE
      RAISE NOTICE 'RLS já está habilitado na tabela promocoes';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela promocoes não existe (OK)';
  END IF;
END $$;

-- ============================================================
-- Passo 4: Validação Final
-- ============================================================

-- Listar todas as policies de todas as tabelas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificar que nenhuma tabela ficou sem RLS
SELECT 
  tablename,
  rowsecurity as "RLS_Ativo?"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
