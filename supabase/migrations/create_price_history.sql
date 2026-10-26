-- ============================================================
-- EncartShop — Gestão de Preços
-- Migration: create_price_history
-- Fase 2 — Histórico de preços + função RPC transacional
--
-- VERSÃO IDEMPOTENTE: segura para executar múltiplas vezes.
--
-- ESCOPO:
--   ✅ Cria tabela product_price_history
--   ✅ Cria RLS da tabela de histórico
--   ✅ Cria função bulk_update_prices (SECURITY DEFINER)
--   ✅ Cria índices de performance
--
-- NÃO ALTERA:
--   ❌ Tabela products (nem estrutura, nem dados)
--   ❌ Módulos de pagamentos, pedidos, catálogo ou encartes
-- ============================================================

-- ============================================================
-- PRÉ-CONDIÇÃO: garante que as tabelas de dependência existem
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    RAISE EXCEPTION 'Tabela products não encontrada. Verifique o esquema.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    RAISE EXCEPTION 'Tabela stores não encontrada. Verifique o esquema.';
  END IF;

  RAISE NOTICE '✅ Pré-condições verificadas.';
END $$;


-- ============================================================
-- TABELA: product_price_history
--
-- Registra cada operação de alteração de preço.
-- Um único "lote" (clique em Confirmar) gera N linhas com o
-- mesmo operation_id, permitindo restauração coletiva.
--
-- SEGURANÇA:
--   • Escrita exclusiva via função SECURITY DEFINER
--   • Leitura restrita ao dono da loja via RLS
--   • Sem policy de INSERT para usuários autenticados
-- ============================================================

CREATE TABLE IF NOT EXISTS product_price_history (
  -- ── Identificação ──────────────────────────────────────────
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Relacionamentos ────────────────────────────────────────
  store_id     UUID NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- ── Autoria ────────────────────────────────────────────────
  -- auth.uid() capturado no servidor durante a execução da função
  changed_by   UUID NOT NULL,
  changed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Agrupamento de operação ────────────────────────────────
  -- UUID gerado pelo frontend para cada "lote" de confirmação.
  -- Permite restaurar ou auditar todos os produtos de uma operação.
  operation_id UUID NOT NULL,

  -- ── Contexto opcional ─────────────────────────────────────
  -- Ex: "Reajuste dez/2026 +10%". Fornecido opcionalmente pelo usuário.
  reason       TEXT,

  -- ── Valores antes e depois ────────────────────────────────
  price_before      DECIMAL(12, 2) NOT NULL,
  promo_before      DECIMAL(12, 2),    -- NULL = produto não tinha promoção antes
  price_after       DECIMAL(12, 2) NOT NULL,
  promo_after       DECIMAL(12, 2),    -- NULL = promoção removida intencionalmente

  -- ── Constraints ───────────────────────────────────────────
  CONSTRAINT chk_pph_price_before_positive  CHECK (price_before  > 0),
  CONSTRAINT chk_pph_price_after_positive   CHECK (price_after   > 0),
  CONSTRAINT chk_pph_promo_before_positive  CHECK (promo_before  IS NULL OR promo_before  > 0),
  CONSTRAINT chk_pph_promo_after_positive   CHECK (promo_after   IS NULL OR promo_after   > 0)
);

COMMENT ON TABLE product_price_history IS
  'Histórico de alterações de preço por produto. '
  'Gravado exclusivamente pela função bulk_update_prices (SECURITY DEFINER). '
  'Cada linha representa um produto alterado em uma operação em lote.';

COMMENT ON COLUMN product_price_history.operation_id IS
  'Identificador da operação em lote. Mesmo UUID para todos os produtos '
  'alterados no mesmo clique de Confirmar.';

COMMENT ON COLUMN product_price_history.promo_after IS
  'NULL significa que a promoção foi intencionalmente removida nesta operação.';


-- ============================================================
-- ÍNDICES
-- ============================================================

-- Consulta por produto (timeline de preços de um produto específico)
CREATE INDEX IF NOT EXISTS idx_pph_product
  ON product_price_history(product_id, changed_at DESC);

-- Consulta por loja + data (histórico da loja, mais recente primeiro)
CREATE INDEX IF NOT EXISTS idx_pph_store_date
  ON product_price_history(store_id, changed_at DESC);

-- Consulta por operação (restauração de um lote completo)
CREATE INDEX IF NOT EXISTS idx_pph_operation
  ON product_price_history(operation_id);


-- ============================================================
-- RLS: product_price_history
--
-- REGRAS:
--   SELECT: apenas o dono da loja pode ler seu histórico
--   INSERT: apenas via função SECURITY DEFINER (sem policy pública)
--   UPDATE: bloqueado — histórico é imutável
--   DELETE: bloqueado — histórico é imutável
-- ============================================================

ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;

-- SELECT: lojista lê apenas o histórico da própria loja
DROP POLICY IF EXISTS "pph_select_own" ON product_price_history;
CREATE POLICY "pph_select_own"
  ON product_price_history FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- Sem policies de INSERT, UPDATE ou DELETE para usuários autenticados.
-- A função bulk_update_prices usa service_role internamente para INSERT.
-- Qualquer tentativa direta de INSERT por um usuário autenticado será bloqueada.


-- ============================================================
-- FUNÇÃO: bulk_update_prices
--
-- Atualiza preços de N produtos em uma única transação atômica.
-- Registra o histórico de cada alteração na mesma transação.
--
-- SEGURANÇA:
--   • SECURITY DEFINER: executa com privilégios do criador
--   • SET search_path = public: impede hijacking via search_path
--   • Valida auth.uid() antes de qualquer operação
--   • Valida que TODOS os produtos pertencem à loja do usuário
--   • Lê price_before e promo_before do banco (não confia no frontend)
--   • SELECT ... FOR UPDATE garante consistência em operações concorrentes
--
-- ATOMICIDADE:
--   • Qualquer falha desfaz TODAS as alterações do lote (rollback do PG)
--   • Loop de validação pré-update verifica todos antes de gravar qualquer
--
-- REMOÇÃO DE PROMOÇÃO:
--   • Somente JSON null explícito remove a promoção
--   • Chave ausente no objeto é rejeitada (payload malformado)
--   • String vazia, zero e negativos são rejeitados
--   • Nenhuma conversão automática de inválido para NULL
--
-- PARÂMETROS:
--   p_updates  JSONB  Array de objetos — cada um DEVE conter:
--     product_id   UUID      obrigatório
--     price        NUMERIC   obrigatório, > 0, ≤ 999999.99
--     promo_price  NUMERIC|null  obrigatório como chave:
--                               JSON null  = remover promoção
--                               NUMERIC    = novo preço, 0 < valor < price
--   p_operation_id UUID     gerado pelo frontend para identificar o lote
--   p_reason       TEXT     descrição opcional do reajuste
--
-- RETORNO: JSONB { success, updated, operation_id, store_id }
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_update_prices(
  p_updates      JSONB,
  p_operation_id UUID    DEFAULT gen_random_uuid(),
  p_reason       TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_store_id       UUID;
  v_item           JSONB;
  v_product_id     UUID;
  v_price          DECIMAL(12, 2);   -- price_after  (do payload)
  v_promo          DECIMAL(12, 2);   -- promo_after  (do payload; NULL = remover)
  v_promo_key_raw  TEXT;             -- valor bruto da chave promo_price no JSON
  v_pb             DECIMAL(12, 2);   -- price_before (lido do banco)
  v_pmb            DECIMAL(12, 2);   -- promo_before (lido do banco)
  v_updated        INT := 0;
  v_first_prod     UUID;
BEGIN

  -- ── 1. Valida array não vazio ─────────────────────────────
  IF p_updates IS NULL OR jsonb_array_length(p_updates) = 0 THEN
    RAISE EXCEPTION 'Lista de produtos vazia.';
  END IF;

  -- ── 2. Identifica e valida o usuário autenticado ──────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  -- ── 3. Descobre a loja pelo primeiro produto e valida posse ─
  v_first_prod := (p_updates -> 0 ->> 'product_id')::UUID;
  IF v_first_prod IS NULL THEN
    RAISE EXCEPTION 'product_id ausente no primeiro item.';
  END IF;

  SELECT p.store_id INTO v_store_id
  FROM products p
  WHERE p.id = v_first_prod;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Produto % não encontrado.', v_first_prod;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stores WHERE id = v_store_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é proprietário da loja.';
  END IF;

  -- ── 4. Valida que TODOS os produtos pertencem à mesma loja ─
  -- Loop completo antes de qualquer UPDATE — garante rollback total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;

    -- Valida product_id presente e válido
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id ausente ou inválido em item do payload.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION
        'Produto % não pertence à loja % ou não existe.',
        v_product_id, v_store_id;
    END IF;

    -- Valida que a chave 'price' está presente
    IF NOT (v_item ? 'price') THEN
      RAISE EXCEPTION 'Chave "price" ausente no payload para produto %.', v_product_id;
    END IF;

    -- Valida que a chave 'promo_price' está presente (pode ser JSON null)
    IF NOT (v_item ? 'promo_price') THEN
      RAISE EXCEPTION
        'Chave "promo_price" ausente no payload para produto %. '
        'Envie JSON null para remover a promoção ou um valor numérico para defini-la.',
        v_product_id;
    END IF;
  END LOOP;

  -- ── 5. Aplica updates e registra histórico ─────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;

    -- ── 5a. Lê valores anteriores do banco com bloqueio ────
    -- FOR UPDATE: bloqueia a linha durante a transação,
    -- evitando que operações concorrentes alterem o mesmo produto
    -- e causem inconsistência no histórico.
    SELECT price, promo_price
      INTO v_pb, v_pmb
      FROM products
     WHERE id = v_product_id
       AND store_id = v_store_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Produto % não encontrado ao tentar bloquear para atualização.',
        v_product_id;
    END IF;

    -- ── 5b. Parsing de price (novo) ────────────────────────
    -- A chave foi confirmada presente no passo 4
    IF (v_item -> 'price')::text = 'null' OR v_item ->> 'price' IS NULL THEN
      RAISE EXCEPTION 'price não pode ser null para produto %.', v_product_id;
    END IF;

    IF trim(v_item ->> 'price') = '' THEN
      RAISE EXCEPTION 'price não pode ser string vazia para produto %.', v_product_id;
    END IF;

    v_price := (v_item ->> 'price')::DECIMAL;

    -- ── 5c. Parsing de promo_price (novo) ─────────────────
    -- Distingue JSON null de chave ausente (validada no passo 4)
    -- e de string vazia ou zero (ambos rejeitados).
    --
    -- jsonb_typeof(v_item -> 'promo_price') retorna:
    --   'null'   → JSON null explícito: remoção intencional
    --   'number' → valor numérico
    --   outros   → malformado → rejeita
    IF jsonb_typeof(v_item -> 'promo_price') = 'null' THEN
      -- Remoção explícita e intencional da promoção
      v_promo := NULL;

    ELSIF jsonb_typeof(v_item -> 'promo_price') = 'number' THEN
      v_promo := (v_item ->> 'promo_price')::DECIMAL;

    ELSE
      -- string, boolean, array, object ou qualquer outro tipo
      v_promo_key_raw := v_item ->> 'promo_price';
      IF v_promo_key_raw IS NOT NULL AND trim(v_promo_key_raw) = '' THEN
        RAISE EXCEPTION
          'promo_price não pode ser string vazia para produto %. '
          'Envie JSON null para remover a promoção.',
          v_product_id;
      ELSE
        RAISE EXCEPTION
          'promo_price com tipo inválido para produto %. '
          'Esperado: número ou JSON null.',
          v_product_id;
      END IF;
    END IF;

    -- ── 5d. Validações dos valores finais ──────────────────
    -- Validam price_after e promo_after — nunca os valores anteriores.
    -- Isso permite corrigir produtos com dados históricos inconsistentes.

    IF v_price <= 0 THEN
      RAISE EXCEPTION 'price (%) deve ser maior que zero para produto %.', v_price, v_product_id;
    END IF;
    IF v_price > 999999.99 THEN
      RAISE EXCEPTION 'price (%) excede o limite máximo para produto %.', v_price, v_product_id;
    END IF;
    IF v_promo IS NOT NULL AND v_promo <= 0 THEN
      RAISE EXCEPTION
        'promo_price (%) deve ser maior que zero para produto %. '
        'Envie JSON null para remover a promoção.',
        v_promo, v_product_id;
    END IF;
    IF v_promo IS NOT NULL AND v_promo >= v_price THEN
      RAISE EXCEPTION
        'promo_price (%) deve ser estritamente menor que price (%) para produto %.',
        v_promo, v_price, v_product_id;
    END IF;

    -- ── 5e. Atualiza APENAS os campos de preço ────────────
    -- Nenhum outro campo (name, image, category, etc.) é tocado.
    -- store_id na cláusula WHERE é segunda camada de isolamento.
    UPDATE products
       SET price       = v_price,
           promo_price = v_promo
     WHERE id = v_product_id
       AND store_id = v_store_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Produto % não encontrado durante UPDATE (possível race condition).',
        v_product_id;
    END IF;

    -- ── 5f. Registra histórico ─────────────────────────────
    -- price_before e promo_before vêm do banco (lidos no 5a),
    -- não do payload do frontend.
    INSERT INTO product_price_history (
      store_id,
      product_id,
      changed_by,
      changed_at,
      operation_id,
      reason,
      price_before,
      promo_before,
      price_after,
      promo_after
    ) VALUES (
      v_store_id,
      v_product_id,
      v_user_id,
      NOW(),
      p_operation_id,
      p_reason,
      v_pb,    -- lido do banco, não do frontend
      v_pmb,   -- lido do banco, não do frontend
      v_price,
      v_promo
    );

    v_updated := v_updated + 1;
  END LOOP;

  -- ── 6. Retorno ────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',      true,
    'updated',      v_updated,
    'operation_id', p_operation_id,
    'store_id',     v_store_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Qualquer exceção desfaz tudo automaticamente (rollback PG)
    RAISE;
END;
$$;

COMMENT ON FUNCTION bulk_update_prices IS
  'Atualiza preços de múltiplos produtos em uma única transação atômica. '
  'Registra histórico em product_price_history. '
  'Lê price_before e promo_before do banco (não aceita do frontend). '
  'Usa SELECT FOR UPDATE para consistência em operações concorrentes. '
  'Valida autenticação e propriedade da loja no servidor. '
  'SECURITY DEFINER com search_path fixo. '
  'Payload: [{ product_id, price, promo_price }]. '
  'promo_price deve ser JSON null (remoção) ou número > 0 e < price.';

-- Revoga execução pública — apenas authenticated pode chamar via RPC
REVOKE ALL ON FUNCTION bulk_update_prices(JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_update_prices(JSONB, UUID, TEXT) TO authenticated;


-- ============================================================
-- VALIDAÇÃO PÓS-CRIAÇÃO
-- ============================================================
DO $$
DECLARE
  tbl_ok  BOOLEAN;
  rls_ok  BOOLEAN;
  fn_ok   BOOLEAN;
  idx_cnt INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_price_history'
  ) INTO tbl_ok;

  SELECT rowsecurity INTO rls_ok
  FROM pg_tables
  WHERE tablename = 'product_price_history' AND schemaname = 'public';

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bulk_update_prices'
  ) INTO fn_ok;

  SELECT COUNT(*) INTO idx_cnt
  FROM pg_indexes
  WHERE tablename = 'product_price_history' AND schemaname = 'public';

  RAISE NOTICE '=== VALIDAÇÃO: Gestão de Preços Fase 2 ===';
  RAISE NOTICE 'Tabela product_price_history: %', CASE WHEN tbl_ok THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'RLS habilitado:               %', CASE WHEN rls_ok THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'Função bulk_update_prices:    %', CASE WHEN fn_ok  THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'Índices criados:              %', idx_cnt;
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Tabela products: NÃO ALTERADA.';
END $$;
