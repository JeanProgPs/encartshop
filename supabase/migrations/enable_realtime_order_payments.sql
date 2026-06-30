-- ============================================================
-- EncartShop — Módulo de Pagamentos Online
-- Migration: enable_realtime_order_payments
-- Fase 6 — Habilita Supabase Realtime para order_payments
--
-- O Supabase usa a publicação 'supabase_realtime' para transmitir
-- mudanças de tabelas para clientes conectados via WebSocket.
-- Por padrão, tabelas novas NÃO são incluídas automaticamente.
--
-- Esta migration adiciona order_payments à publicação,
-- permitindo que o painel do lojista (pedidos.html) receba
-- atualizações de status financeiro em tempo real via
-- postgres_changes, sem F5.
--
-- IMPORTANTE:
--   ✅ Não altera nenhuma tabela existente
--   ✅ Não afeta outras publicações
--   ✅ A tabela orders NÃO é adicionada aqui (não é necessária)
--   ✅ RLS continua protegendo os dados — clientes só recebem
--      eventos de registros que têm permissão de ler
-- ============================================================

-- Adiciona order_payments à publicação do Realtime
-- ALTER PUBLICATION é idempotente para adição de tabelas no PG 15+
-- Em versões anteriores, verificamos antes de adicionar
DO $$
BEGIN
  -- Verifica se a publicação supabase_realtime existe
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Verifica se order_payments já está na publicação
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'order_payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE order_payments;
      RAISE NOTICE '✅ order_payments adicionada à publicação supabase_realtime';
    ELSE
      RAISE NOTICE 'ℹ️  order_payments já estava na publicação supabase_realtime';
    END IF;
  ELSE
    RAISE WARNING '⚠️  Publicação supabase_realtime não encontrada. Verifique se o Realtime está habilitado no projeto Supabase.';
  END IF;
END $$;

-- Validação
SELECT
  pubname,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'order_payments';
