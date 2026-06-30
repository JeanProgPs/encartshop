-- ============================================================
-- EncartShop — Módulo de Pagamentos Online
-- Migration: create_payment_module
-- Fase 1 — Infraestrutura (sem alterar funcionalidades existentes)
--
-- IMPORTANTE: Esta migration:
--   ✅ Cria APENAS novas tabelas
--   ✅ NÃO altera nenhuma tabela existente
--   ✅ NÃO modifica nenhum fluxo existente
--   ✅ NÃO ativa nenhuma funcionalidade
--   ✅ É invisível para os clientes atuais
--
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

-- ============================================================
-- VERIFICAÇÃO DE PRÉ-CONDIÇÃO
-- Garante que tabela stores existe antes de criar as FKs
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    RAISE EXCEPTION 'Tabela stores não encontrada. Verifique se o banco está inicializado corretamente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    RAISE EXCEPTION 'Tabela orders não encontrada. Verifique se o banco está inicializado corretamente.';
  END IF;

  RAISE NOTICE '✅ Pré-condições verificadas. Iniciando criação das tabelas do módulo de pagamento.';
END $$;


-- ============================================================
-- TABELA 1: store_payment_settings
--
-- Objetivo: Guardar as configurações privadas do gateway de
-- pagamento de cada loja. Relacionamento 1:1 com stores.
--
-- REGRAS DE SEGURANÇA:
--   • Nunca exposta em SELECT público da loja
--   • Apenas o dono da loja pode ler/escrever
--   • A coluna asaas_api_key nunca deve ser retornada
--     para o frontend — acesso exclusivo via service role
--     nas Edge Functions
-- ============================================================

CREATE TABLE IF NOT EXISTS store_payment_settings (
  -- ── Identificação ──────────────────────────────────────────
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Relacionamento 1:1 com stores ──────────────────────────
  -- ON DELETE CASCADE: se a loja for excluída, as configs vão junto
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- ── Gateway de Pagamento ───────────────────────────────────
  -- Qual provedor esta configuração representa
  -- Valores esperados: 'asaas' | 'mercadopago' | 'pagbank' | 'stripe'
  -- Preparado para múltiplos gateways no futuro
  payment_provider  VARCHAR(50) NOT NULL DEFAULT 'asaas',

  -- ── Credenciais (SENSÍVEL) ─────────────────────────────────
  -- API Key do lojista no Asaas (ou token no gateway escolhido)
  -- NUNCA retornar esta coluna em queries do frontend
  -- Acesso exclusivo via Edge Functions com service_role
  asaas_api_key     TEXT,

  -- ── Ambiente ──────────────────────────────────────────────
  -- 'sandbox'    = ambiente de testes (padrão ao ativar)
  -- 'production' = ambiente real de produção
  environment       VARCHAR(20) NOT NULL DEFAULT 'sandbox'
    CONSTRAINT chk_environment CHECK (environment IN ('sandbox', 'production')),

  -- ── Status do Módulo ──────────────────────────────────────
  -- false = módulo desativado (padrão). O lojista precisa
  -- configurar a API Key e ativar explicitamente.
  -- Enquanto false, o fluxo do WhatsApp permanece inalterado.
  payment_enabled   BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── Métodos de Pagamento Aceitos ──────────────────────────
  -- Array de strings. Valores esperados: 'PIX', 'BOLETO', 'CREDIT_CARD'
  -- Padrão: apenas PIX (menor fricção para lojistas)
  payment_methods   TEXT[] NOT NULL DEFAULT ARRAY['PIX'],

  -- ── Segurança de Webhook ──────────────────────────────────
  -- Token único gerado por loja para validar webhooks recebidos
  -- do Asaas. Evita que requisições forjadas atualizem pedidos.
  -- Gerado automaticamente na Edge Function ao salvar as configs.
  webhook_token     TEXT,

  -- ── Cache de Customer ID do Asaas ─────────────────────────
  -- Guarda o customer_id do Asaas para evitar recriação a cada cobrança.
  -- Diferente do asaas_customer_id em stores (que é da plataforma).
  -- Este é o customer da LOJA no Asaas do lojista.
  -- Nota: não é usado diretamente — cada cliente do lojista tem seu
  -- próprio customer_id no Asaas. Este campo pode guardar metadados
  -- extras do gateway no formato JSON.
  gateway_metadata  JSONB,

  -- ── Auditoria ─────────────────────────────────────────────
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Constraints ───────────────────────────────────────────
  -- Garantia de 1:1 com stores por gateway
  -- Uma loja pode ter no máximo uma configuração por gateway
  CONSTRAINT uq_store_payment_settings_store_provider
    UNIQUE (store_id, payment_provider)
);

-- Comentário descritivo na tabela
COMMENT ON TABLE store_payment_settings IS
  'Configurações privadas do módulo de pagamento online por loja. '
  'Relacionamento 1:1 com stores por gateway. '
  'Nunca expor asaas_api_key ao frontend.';

COMMENT ON COLUMN store_payment_settings.asaas_api_key IS
  'API Key do lojista no gateway. SENSÍVEL — acesso exclusivo via service role nas Edge Functions.';

COMMENT ON COLUMN store_payment_settings.payment_enabled IS
  'Módulo de pagamento online ativo para esta loja. '
  'Quando FALSE (padrão), o fluxo do WhatsApp permanece exatamente igual.';

COMMENT ON COLUMN store_payment_settings.webhook_token IS
  'Token de autenticação para validar webhooks recebidos do Asaas. '
  'Gerado automaticamente. Nunca expor ao frontend.';


-- ============================================================
-- ÍNDICES: store_payment_settings
-- ============================================================

-- Busca por store_id (operação mais comum: verificar se loja tem pagamento)
CREATE INDEX IF NOT EXISTS idx_store_payment_settings_store_id
  ON store_payment_settings(store_id);

-- Busca por provider (para queries que filtram por gateway)
CREATE INDEX IF NOT EXISTS idx_store_payment_settings_provider
  ON store_payment_settings(payment_provider);

-- Busca por lojas com pagamento ativo (para dashboards da plataforma)
CREATE INDEX IF NOT EXISTS idx_store_payment_settings_enabled
  ON store_payment_settings(store_id) WHERE payment_enabled = TRUE;


-- ============================================================
-- RLS: store_payment_settings
--
-- REGRAS:
--   • SELECT: apenas o dono da loja (auth.uid() = stores.user_id)
--   • INSERT: apenas o dono da loja
--   • UPDATE: apenas o dono da loja
--   • DELETE: apenas o dono da loja
--   • NUNCA permite SELECT público (sem auth)
--   • A coluna asaas_api_key é protegida adicionalmente
--     pelo fato de que as Edge Functions usam service_role
--     para ler, e o frontend nunca precisa ler essa coluna
-- ============================================================

ALTER TABLE store_payment_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: apenas o dono da loja pode ver suas configurações
DROP POLICY IF EXISTS "store_payment_settings_select_own" ON store_payment_settings;
CREATE POLICY "store_payment_settings_select_own"
  ON store_payment_settings FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- INSERT: apenas o dono da loja pode criar configurações
DROP POLICY IF EXISTS "store_payment_settings_insert_own" ON store_payment_settings;
CREATE POLICY "store_payment_settings_insert_own"
  ON store_payment_settings FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- UPDATE: apenas o dono da loja pode atualizar
DROP POLICY IF EXISTS "store_payment_settings_update_own" ON store_payment_settings;
CREATE POLICY "store_payment_settings_update_own"
  ON store_payment_settings FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- DELETE: apenas o dono da loja pode excluir
DROP POLICY IF EXISTS "store_payment_settings_delete_own" ON store_payment_settings;
CREATE POLICY "store_payment_settings_delete_own"
  ON store_payment_settings FOR DELETE
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- TRIGGER: updated_at automático — store_payment_settings
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_payment_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_payment_settings_updated_at
  ON store_payment_settings;

CREATE TRIGGER trg_update_payment_settings_updated_at
  BEFORE UPDATE ON store_payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_payment_settings_updated_at();


-- ============================================================
-- TABELA 2: order_payments
--
-- Objetivo: Registrar todas as tentativas/cobranças de
-- pagamento online de pedidos. Desacoplada da tabela orders
-- para não quebrar o fluxo atual. Um pedido pode ter múltiplas
-- tentativas de cobrança.
--
-- DESIGN DECISIONS:
--   • order_id é nullable: permite criar cobrança antes do
--     pedido estar confirmado, se necessário no futuro
--   • gateway é texto livre: preparado para PIX, Boleto,
--     Cartão, e futuros gateways (Mercado Pago, Stripe, etc.)
--   • metadata JSONB: armazena a resposta completa do gateway,
--     útil para debugging e auditoria
-- ============================================================

CREATE TABLE IF NOT EXISTS order_payments (
  -- ── Identificação ──────────────────────────────────────────
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Isolamento Multi-Tenant ────────────────────────────────
  -- Obrigatório para RLS e isolamento de dados entre lojas
  store_id              UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- ── Pedido Relacionado ─────────────────────────────────────
  -- Nullable: cobrança pode existir independente do pedido
  -- (ex: cobrança de reserva antes de finalizar o pedido)
  order_id              UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- ── Gateway de Pagamento ───────────────────────────────────
  -- Qual gateway processou esta cobrança
  -- Valores esperados: 'asaas' | 'mercadopago' | 'pagbank' | 'stripe'
  gateway               VARCHAR(50) NOT NULL DEFAULT 'asaas',

  -- ── Identificação no Gateway ──────────────────────────────
  -- ID da cobrança/payment no sistema do gateway
  -- Usado para consultas de status, cancelamento e webhook
  gateway_payment_id    TEXT,

  -- ── Tipo de Cobrança ──────────────────────────────────────
  -- Valores esperados: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD'
  billing_type          VARCHAR(30) NOT NULL DEFAULT 'PIX',

  -- ── Valor ─────────────────────────────────────────────────
  amount                DECIMAL(12, 2) NOT NULL
    CONSTRAINT chk_amount_positive CHECK (amount > 0),

  -- ── Status da Cobrança ────────────────────────────────────
  -- Mapeado do status do gateway para nomenclatura interna
  -- Valores: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' |
  --          'REFUNDED' | 'CANCELLED' | 'CHARGEBACK_REQUESTED' |
  --          'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' |
  --          'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS'
  status                VARCHAR(50) NOT NULL DEFAULT 'PENDING',

  -- ── Dados de Pagamento PIX ────────────────────────────────
  -- URL de pagamento gerada pelo gateway (página de cobrança)
  payment_url           TEXT,

  -- Código PIX Copia e Cola
  pix_code              TEXT,

  -- QR Code em Base64 (imagem PNG codificada)
  qr_code               TEXT,

  -- Data de vencimento da cobrança
  due_date              DATE,

  -- ── Dados do Comprador ────────────────────────────────────
  -- Armazenados no momento da cobrança (imutáveis)
  customer_name         TEXT,
  customer_document     TEXT,    -- CPF ou CNPJ (pode ser null para compras sem cadastro)
  customer_email        TEXT,
  customer_phone        TEXT,

  -- ── Dados Complementares ──────────────────────────────────
  -- Resposta completa do gateway em JSON
  -- Útil para debugging, auditoria e campos específicos de cada gateway
  metadata              JSONB,

  -- ── Auditoria ─────────────────────────────────────────────
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Preenchido automaticamente quando status muda para RECEIVED ou CONFIRMED
  paid_at               TIMESTAMP WITH TIME ZONE
);

-- Comentários descritivos
COMMENT ON TABLE order_payments IS
  'Registra todas as cobranças online de pedidos. '
  'Desacoplada de orders para não impactar o fluxo atual do WhatsApp. '
  'Preparada para múltiplos gateways (Asaas, Mercado Pago, PagBank, Stripe).';

COMMENT ON COLUMN order_payments.order_id IS
  'FK para orders. Nullable: cobrança pode existir antes do pedido ser confirmado.';

COMMENT ON COLUMN order_payments.gateway_payment_id IS
  'ID da cobrança no sistema do gateway. Usado para consultas, cancelamentos e webhooks.';

COMMENT ON COLUMN order_payments.metadata IS
  'Resposta completa do gateway em JSON. '
  'Não usar para lógica de negócio — apenas para auditoria e debugging.';

COMMENT ON COLUMN order_payments.customer_document IS
  'CPF ou CNPJ do comprador no momento da cobrança. Pode ser nulo se não informado.';


-- ============================================================
-- ÍNDICES: order_payments
-- ============================================================

-- store_id: isolamento e listagem de cobranças por loja
CREATE INDEX IF NOT EXISTS idx_order_payments_store_id
  ON order_payments(store_id);

-- order_id: busca de cobranças de um pedido específico
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id
  ON order_payments(order_id)
  WHERE order_id IS NOT NULL;

-- status: filtro por estado (ex: listar cobranças pendentes)
CREATE INDEX IF NOT EXISTS idx_order_payments_status
  ON order_payments(store_id, status);

-- created_at: ordenação cronológica e relatórios por período
CREATE INDEX IF NOT EXISTS idx_order_payments_created_at
  ON order_payments(store_id, created_at DESC);

-- gateway_payment_id: lookup rápido ao receber webhook do gateway
-- (identificar qual order_payment corresponde ao evento)
CREATE INDEX IF NOT EXISTS idx_order_payments_gateway_payment_id
  ON order_payments(gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

-- paid_at: relatórios financeiros por data de pagamento
CREATE INDEX IF NOT EXISTS idx_order_payments_paid_at
  ON order_payments(store_id, paid_at DESC)
  WHERE paid_at IS NOT NULL;


-- ============================================================
-- RLS: order_payments
--
-- REGRAS:
--   • SELECT: apenas o dono da loja
--   • INSERT: apenas via service role (Edge Functions)
--             — o frontend não insere diretamente
--   • UPDATE: apenas via service role (Edge Functions)
--             — status é atualizado pelo webhook
--   • DELETE: apenas o dono da loja (para exclusão de registros)
--
-- NOTA: INSERT e UPDATE são operações de Edge Function (service role).
-- A policy de INSERT usa WITH CHECK permissiva para service_role,
-- mas o frontend autenticado só pode inserir cobranças da própria loja.
-- ============================================================

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: apenas o dono da loja pode ver suas cobranças
DROP POLICY IF EXISTS "order_payments_select_own" ON order_payments;
CREATE POLICY "order_payments_select_own"
  ON order_payments FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- INSERT: o frontend autenticado insere cobranças apenas da própria loja
-- (Na prática, o INSERT é feito pela Edge Function via service_role,
--  mas esta policy garante isolamento caso haja chamada direta)
DROP POLICY IF EXISTS "order_payments_insert_own" ON order_payments;
CREATE POLICY "order_payments_insert_own"
  ON order_payments FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- UPDATE: apenas o dono pode atualizar (Edge Functions usam service_role,
-- que bypassa RLS; esta policy protege acessos autenticados diretos)
DROP POLICY IF EXISTS "order_payments_update_own" ON order_payments;
CREATE POLICY "order_payments_update_own"
  ON order_payments FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );

-- DELETE: apenas o dono da loja pode excluir registros
DROP POLICY IF EXISTS "order_payments_delete_own" ON order_payments;
CREATE POLICY "order_payments_delete_own"
  ON order_payments FOR DELETE
  USING (
    store_id IN (
      SELECT id FROM stores WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- TRIGGER: updated_at automático — order_payments
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_order_payments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_order_payments_updated_at
  ON order_payments;

CREATE TRIGGER trg_update_order_payments_updated_at
  BEFORE UPDATE ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_order_payments_updated_at();


-- ============================================================
-- TRIGGER: paid_at automático — order_payments
-- Preenche paid_at automaticamente quando o status
-- muda para RECEIVED ou CONFIRMED
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_order_payment_paid_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se o status está mudando para RECEIVED ou CONFIRMED
  -- e paid_at ainda não foi preenchido, registra agora
  IF NEW.status IN ('RECEIVED', 'CONFIRMED') AND OLD.status NOT IN ('RECEIVED', 'CONFIRMED') THEN
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_payment_paid_at
  ON order_payments;

CREATE TRIGGER trg_set_order_payment_paid_at
  BEFORE UPDATE ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_order_payment_paid_at();


-- ============================================================
-- VALIDAÇÃO PÓS-CRIAÇÃO
-- ============================================================

DO $$
DECLARE
  tbl_settings_ok  BOOLEAN;
  tbl_payments_ok  BOOLEAN;
  rls_settings_ok  BOOLEAN;
  rls_payments_ok  BOOLEAN;
  idx_count        INTEGER;
BEGIN
  -- Verificar tabelas
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_payment_settings'
  ) INTO tbl_settings_ok;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_payments'
  ) INTO tbl_payments_ok;

  -- Verificar RLS
  SELECT rowsecurity INTO rls_settings_ok
  FROM pg_tables WHERE tablename = 'store_payment_settings' AND schemaname = 'public';

  SELECT rowsecurity INTO rls_payments_ok
  FROM pg_tables WHERE tablename = 'order_payments' AND schemaname = 'public';

  -- Verificar índices
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename IN ('store_payment_settings', 'order_payments')
    AND schemaname = 'public';

  RAISE NOTICE '=== VALIDAÇÃO DO MÓDULO DE PAGAMENTO ===';
  RAISE NOTICE 'Tabela store_payment_settings: %', CASE WHEN tbl_settings_ok THEN '✅ CRIADA' ELSE '❌ FALHA' END;
  RAISE NOTICE 'Tabela order_payments: %', CASE WHEN tbl_payments_ok THEN '✅ CRIADA' ELSE '❌ FALHA' END;
  RAISE NOTICE 'RLS store_payment_settings: %', CASE WHEN rls_settings_ok THEN '✅ ATIVO' ELSE '❌ INATIVO' END;
  RAISE NOTICE 'RLS order_payments: %', CASE WHEN rls_payments_ok THEN '✅ ATIVO' ELSE '❌ INATIVO' END;
  RAISE NOTICE 'Total de índices criados: %', idx_count;
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'IMPORTANTE: Nenhuma tabela existente foi alterada.';
  RAISE NOTICE 'O fluxo atual (WhatsApp) permanece exatamente igual.';
  RAISE NOTICE '=========================================';
END $$;
