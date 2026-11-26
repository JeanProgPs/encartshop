-- ============================================================
-- Migration: Segurança da global_config e Logs/Idempotência WhatsApp
-- ============================================================

-- 1. Segurança rigorosa na tabela global_config
-- Apenas o backend (Edge Functions com service_role) pode ler/escrever.
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE global_config FROM anon;
REVOKE ALL ON TABLE global_config FROM authenticated;

DROP POLICY IF EXISTS "global_config_no_public_access" ON global_config;

-- Adiciona colunas de auditoria de teste de conexão (não-destrutivo)
ALTER TABLE global_config
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_ok boolean;

-- Garante que exista ao menos uma linha singleton
INSERT INTO global_config (evolution_api_url, evolution_api_key)
SELECT NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM global_config);

-- 2. Tabela de logs e idempotência de notificações WhatsApp
-- Evita envio duplicado para o mesmo (order_id, event_status) e registra falhas para diagnóstico
-- sem armazenar API Keys, tokens ou dados pessoais sensíveis.
CREATE TABLE IF NOT EXISTS whatsapp_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_status text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_notif_logs_store_created
  ON whatsapp_notification_logs (store_id, created_at DESC);

-- Índice único parcial: impede envio duplicado bem-sucedido para o mesmo pedido e status
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_notif_sent_order_status
  ON whatsapp_notification_logs (order_id, event_status)
  WHERE status = 'sent';

ALTER TABLE whatsapp_notification_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE whatsapp_notification_logs FROM anon;
REVOKE ALL ON TABLE whatsapp_notification_logs FROM authenticated;
