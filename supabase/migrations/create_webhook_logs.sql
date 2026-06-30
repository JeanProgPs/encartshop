-- ============================================================
-- EncartShop — Módulo de Pagamentos Online
-- Migration: create_webhook_logs
-- Fase 4B — Tabela de log dos webhooks de pagamento de pedidos
--
-- IMPORTANTE:
--   ✅ Cria APENAS a tabela payment_webhook_logs
--   ✅ NÃO altera nenhuma tabela existente
--   ✅ NÃO interfere com o webhook de mensalidades (asaas-webhook)
--   ✅ Usada exclusivamente pela função store-payment-webhook
-- ============================================================

-- ============================================================
-- TABELA: payment_webhook_logs
--
-- Objetivo:
--   Registrar cada evento de webhook recebido do Asaas para
--   pagamentos de pedidos. Serve para:
--     • Auditoria completa de eventos processados
--     • Detecção de reprocessamento (idempotência)
--     • Debugging de falhas de integração
--     • Conformidade e rastreabilidade financeira
--
-- SEGURANÇA:
--   • Nunca armazena API Keys, Authorization ou secrets
--   • Apenas dados de evento (event_id, status, timing)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_webhook_logs (
  -- ── Identificação ──────────────────────────────────────────
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identificação do evento no Asaas ──────────────────────
  -- ID único do evento enviado pelo Asaas no payload
  -- Usado para detecção de eventos duplicados (idempotência)
  event_id         TEXT,

  -- ── Gateway que originou o evento ─────────────────────────
  gateway          VARCHAR(50) NOT NULL DEFAULT 'asaas',

  -- ── ID do pagamento no gateway ────────────────────────────
  -- Corresponde a order_payments.gateway_payment_id
  payment_id       TEXT,

  -- ── Tipo do evento recebido ────────────────────────────────
  -- Ex: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, etc.
  event_type       VARCHAR(100),

  -- ── Status mapeado para o sistema interno ─────────────────
  -- Status que foi gravado em order_payments (ou null se não processado)
  status_mapped    VARCHAR(50),

  -- ── Resultado do processamento ────────────────────────────
  -- true  = evento processado com sucesso
  -- false = evento ignorado, duplicado ou com erro
  processed        BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── Motivo do não-processamento (quando processed = false) ─
  -- Ex: 'duplicate', 'payment_not_found', 'invalid_payload', 'unknown_event'
  skip_reason      TEXT,

  -- ── Tempo de processamento ────────────────────────────────
  -- Duração em milissegundos do processamento completo do evento
  processing_time  INTEGER,

  -- ── Auditoria ─────────────────────────────────────────────
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()

  -- Sem updated_at: logs são imutáveis após inserção
);

-- Comentários
COMMENT ON TABLE payment_webhook_logs IS
  'Log de auditoria dos webhooks de pagamento de pedidos recebidos do Asaas. '
  'Usado pela função store-payment-webhook. '
  'Não interfere com a tabela de mensalidades (asaas-webhook).';

COMMENT ON COLUMN payment_webhook_logs.event_id IS
  'ID único do evento Asaas. Usado para detecção de duplicatas (idempotência).';

COMMENT ON COLUMN payment_webhook_logs.processed IS
  'true = evento processou com sucesso. '
  'false = evento ignorado, duplicado ou falhou.';

COMMENT ON COLUMN payment_webhook_logs.skip_reason IS
  'Motivo pelo qual o evento não foi processado (null se processed=true).';


-- ============================================================
-- ÍNDICES: payment_webhook_logs
-- ============================================================

-- Busca por payment_id: correlacionar log com order_payments
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment_id
  ON payment_webhook_logs(payment_id)
  WHERE payment_id IS NOT NULL;

-- Busca por event_id: detecção de duplicatas
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id
  ON payment_webhook_logs(event_id)
  WHERE event_id IS NOT NULL;

-- Busca por data: relatórios e limpeza de logs antigos
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at
  ON payment_webhook_logs(created_at DESC);

-- Busca por eventos não processados: monitoramento de falhas
CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed
  ON payment_webhook_logs(created_at DESC)
  WHERE processed = FALSE;


-- ============================================================
-- RLS: payment_webhook_logs
--
-- Esta tabela é escrita EXCLUSIVAMENTE via service_role
-- (Edge Function store-payment-webhook).
-- Não há necessidade de acesso por usuários autenticados
-- via frontend nesta fase.
--
-- Por segurança, RLS habilitado com acesso negado por padrão.
-- Acesso via service_role bypassa RLS (comportamento padrão do Supabase).
-- ============================================================

ALTER TABLE payment_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy pública: acesso apenas via service_role
-- (INSERT pela Edge Function, SELECT via painel da plataforma futuramente)

-- Policy placeholder para leitura futura pelo super admin
-- Descomentada quando o painel de plataforma precisar de acesso:
-- DROP POLICY IF EXISTS "webhook_logs_select_platform" ON payment_webhook_logs;
-- CREATE POLICY "webhook_logs_select_platform"
--   ON payment_webhook_logs FOR SELECT
--   USING (auth.jwt() ->> 'role' = 'SUPER_ADMIN');


-- ============================================================
-- VALIDAÇÃO PÓS-CRIAÇÃO
-- ============================================================

DO $$
DECLARE
  tbl_ok   BOOLEAN;
  rls_ok   BOOLEAN;
  idx_count INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_webhook_logs'
  ) INTO tbl_ok;

  SELECT rowsecurity INTO rls_ok
  FROM pg_tables
  WHERE tablename = 'payment_webhook_logs' AND schemaname = 'public';

  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename = 'payment_webhook_logs' AND schemaname = 'public';

  RAISE NOTICE '=== VALIDAÇÃO: payment_webhook_logs ===';
  RAISE NOTICE 'Tabela criada:   %', CASE WHEN tbl_ok THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'RLS habilitado:  %', CASE WHEN rls_ok THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'Índices criados: %', idx_count;
  RAISE NOTICE '=====================================';
END $$;
