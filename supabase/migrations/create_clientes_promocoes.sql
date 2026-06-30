-- ============================================================
-- EncartShop — Modelagem: Clientes e Promoções
-- Script completo para criar tabelas com RLS e índices
-- Executar no SQL Editor do Supabase após aprovação
-- ============================================================

-- ============================================================
-- PARTE 1: TABELA CLIENTES
-- ============================================================

-- Criar tabela clientes
CREATE TABLE IF NOT EXISTS clientes (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Dados Pessoais
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(20),
  
  -- Agregações (desnormalizadas para performance)
  total_pedidos INTEGER NOT NULL DEFAULT 0,
  total_gasto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ultimo_pedido TIMESTAMP,
  
  -- Controle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(store_id, email),
  CONSTRAINT email_format CHECK (
    email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' 
    OR email IS NULL
  )
);

-- Índices para clientes
CREATE INDEX IF NOT EXISTS idx_clientes_store_id 
  ON clientes(store_id);

CREATE INDEX IF NOT EXISTS idx_clientes_email 
  ON clientes(store_id, email);

CREATE INDEX IF NOT EXISTS idx_clientes_total_gasto 
  ON clientes(store_id, total_gasto DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_ultimo_pedido 
  ON clientes(store_id, ultimo_pedido DESC);

-- Habilitar RLS em clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT — Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_select_own" ON clientes;
CREATE POLICY "clientes_select_own"
  ON clientes FOR SELECT
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Policy: INSERT — Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_insert_own" ON clientes;
CREATE POLICY "clientes_insert_own"
  ON clientes FOR INSERT
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Policy: UPDATE — Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_update_own" ON clientes;
CREATE POLICY "clientes_update_own"
  ON clientes FOR UPDATE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Policy: DELETE — Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_delete_own" ON clientes;
CREATE POLICY "clientes_delete_own"
  ON clientes FOR DELETE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- ============================================================
-- PARTE 2: TABELA PROMOÇÕES
-- ============================================================

-- Criar tabela promocoes
CREATE TABLE IF NOT EXISTS promocoes (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Dados da Promoção
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(50) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  
  -- Validade
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP NOT NULL,
  
  -- Status
  ativa BOOLEAN NOT NULL DEFAULT true,
  
  -- Controle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT tipo_valido CHECK (
    tipo IN ('percentual', 'valor_fixo', 'frete_gratis', 'combo')
  ),
  CONSTRAINT valor_positivo CHECK (valor > 0),
  CONSTRAINT data_valida CHECK (data_inicio < data_fim),
  CONSTRAINT tipo_percentual_max CHECK (
    CASE WHEN tipo = 'percentual' THEN valor <= 100 ELSE true END
  )
);

-- Índices para promocoes
CREATE INDEX IF NOT EXISTS idx_promocoes_store_id 
  ON promocoes(store_id);

CREATE INDEX IF NOT EXISTS idx_promocoes_ativa 
  ON promocoes(store_id, ativa);

CREATE INDEX IF NOT EXISTS idx_promocoes_validade 
  ON promocoes(store_id, data_inicio, data_fim);

-- Habilitar RLS em promocoes
ALTER TABLE promocoes ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT — Dono + público válidas
DROP POLICY IF EXISTS "promocoes_select_own" ON promocoes;
CREATE POLICY "promocoes_select_own"
  ON promocoes FOR SELECT
  USING (
    -- Dono: pode ver todas suas promoções
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    OR
    -- Público: pode ver promoções ativas e válidas
    (
      ativa = true
      AND data_inicio <= NOW()
      AND data_fim >= NOW()
      AND store_id IN (SELECT id FROM stores WHERE status = 'active')
    )
  );

-- Policy: INSERT — Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_insert_own" ON promocoes;
CREATE POLICY "promocoes_insert_own"
  ON promocoes FOR INSERT
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Policy: UPDATE — Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_update_own" ON promocoes;
CREATE POLICY "promocoes_update_own"
  ON promocoes FOR UPDATE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Policy: DELETE — Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_delete_own" ON promocoes;
CREATE POLICY "promocoes_delete_own"
  ON promocoes FOR DELETE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- ============================================================
-- PARTE 3: TABELA RELACIONAMENTO (OPCIONAL)
-- ============================================================

-- Criar tabela promocao_produtos (para promoções específicas de produtos)
CREATE TABLE IF NOT EXISTS promocao_produtos (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promocao_id UUID NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Constraints
  UNIQUE(promocao_id, produto_id)
);

-- Índices para promocao_produtos
CREATE INDEX IF NOT EXISTS idx_promocao_produtos_promocao 
  ON promocao_produtos(promocao_id);

CREATE INDEX IF NOT EXISTS idx_promocao_produtos_produto 
  ON promocao_produtos(produto_id);

-- Habilitar RLS em promocao_produtos
ALTER TABLE promocao_produtos ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT — Via promoção (já filtrada por RLS)
DROP POLICY IF EXISTS "promocao_produtos_select_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_select_own"
  ON promocao_produtos FOR SELECT
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Policy: INSERT — Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_insert_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_insert_own"
  ON promocao_produtos FOR INSERT
  WITH CHECK (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Policy: UPDATE — Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_update_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_update_own"
  ON promocao_produtos FOR UPDATE
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Policy: DELETE — Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_delete_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_delete_own"
  ON promocao_produtos FOR DELETE
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ============================================================
-- VALIDAÇÃO PÓS-CRIAÇÃO
-- ============================================================

-- Verificar que as tabelas foram criadas
SELECT 
  tablename,
  CASE WHEN tablename IN ('clientes', 'promocoes', 'promocao_produtos') 
    THEN '✅ CRIADA' 
    ELSE '❌ ERRO' 
  END as status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename;

-- Verificar que RLS está habilitado
SELECT 
  tablename,
  CASE WHEN rowsecurity THEN '✅ RLS ATIVO' ELSE '❌ RLS INATIVO' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename;

-- Verificar que as policies foram criadas
SELECT 
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename, policyname;

-- Verificar que os índices foram criados
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename, indexname;

-- ============================================================
-- CHECKLIST PÓS-APLICAÇÃO
-- ============================================================

/*
CHECKLIST DE VALIDAÇÃO:

Tabelas criadas:
[ ] clientes
[ ] promocoes
[ ] promocao_produtos

RLS Habilitado:
[ ] clientes — 4 policies (SELECT, INSERT, UPDATE, DELETE)
[ ] promocoes — 4 policies (SELECT, INSERT, UPDATE, DELETE)
[ ] promocao_produtos — 4 policies (SELECT, INSERT, UPDATE, DELETE)

Índices Criados:
[ ] clientes: store_id, (store_id, email), (store_id, total_gasto DESC), (store_id, ultimo_pedido DESC)
[ ] promocoes: store_id, (store_id, ativa), (store_id, data_inicio, data_fim)
[ ] promocao_produtos: promocao_id, produto_id

Constraints:
[ ] clientes: UNIQUE(store_id, email), email format, foreign key store_id
[ ] promocoes: tipo válido, valor > 0, data_valida, percentual <= 100
[ ] promocao_produtos: UNIQUE(promocao_id, produto_id), foreign keys

RLS Validation:
[ ] Nenhuma policy com USING true
[ ] Todas usam store_id para isolamento
[ ] SELECT de promocoes permite público válidas
[ ] INSERT/UPDATE/DELETE isolados por store_id

Performance:
[ ] Queries não fazem full table scan
[ ] Índices usados em WHERE clauses
[ ] Sem N+1 queries esperadas

Próximo Passo:
[ ] Testes de isolamento em staging
[ ] Validar que loja A não acessa dados da loja B
[ ] Validar que promoções públicas são visíveis
[ ] Deploy em produção com monitoramento
*/
