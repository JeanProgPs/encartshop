-- ============================================================
-- Migration: Integração WhatsApp Automático (Evolution API)
-- Permite que lojas conectem instâncias de WhatsApp e enviem
-- notificações automáticas de mudança de status de pedidos.
-- ============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS whatsapp_auto_notify boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS evolution_api_url text,
  ADD COLUMN IF NOT EXISTS evolution_api_key text,
  ADD COLUMN IF NOT EXISTS evolution_instance_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_connected_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_last_sync timestamptz;

-- Comentários descritivos
COMMENT ON COLUMN stores.whatsapp_auto_notify IS 'Indica se a loja deseja disparar mensagens automáticas de pedidos pelo WhatsApp';
COMMENT ON COLUMN stores.evolution_api_url IS 'URL da instância da Evolution API (ex: https://evolution.up.railway.app)';
COMMENT ON COLUMN stores.evolution_api_key IS 'API Key global da Evolution API';
COMMENT ON COLUMN stores.evolution_instance_name IS 'Nome único da instância do WhatsApp para esta loja (ex: loja_uuid)';
COMMENT ON COLUMN stores.whatsapp_connected IS 'Indica se a instância do WhatsApp está conectada (state = open)';
COMMENT ON COLUMN stores.whatsapp_connected_phone IS 'Número de telefone do WhatsApp pareado via QR Code';
COMMENT ON COLUMN stores.whatsapp_last_sync IS 'Data e hora da última verificação de status da conexão';
