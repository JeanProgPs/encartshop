-- ============================================================
-- EncartShop — Migration de Segurança de Pagamentos
-- Isola credenciais sensíveis em tabela dedicada (Fase 1/MP)
-- VERSÃO IDEMPOTENTE: segura para rodar múltiplas vezes
-- ============================================================

-- 1. Criação da tabela de segredos (IF NOT EXISTS = seguro)
CREATE TABLE IF NOT EXISTS store_payment_secrets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  payment_provider  VARCHAR(50) NOT NULL,
  asaas_api_key     TEXT,
  mp_access_token   TEXT,
  mp_public_key     TEXT,
  webhook_token     TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_store_payment_secrets_provider UNIQUE (store_id, payment_provider)
);

-- RLS: Sem políticas para authenticated = deny all. 
-- Apenas service_role ou funções SECURITY DEFINER podem acessar.
ALTER TABLE store_payment_secrets ENABLE ROW LEVEL SECURITY;

-- Trigger de updated_at (DROP IF EXISTS garante idempotência)
DROP TRIGGER IF EXISTS trg_update_payment_secrets_updated_at ON store_payment_secrets;
CREATE TRIGGER trg_update_payment_secrets_updated_at
  BEFORE UPDATE ON store_payment_secrets
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_payment_settings_updated_at();

-- 2. Adicionar colunas flags na tabela pública (IF NOT EXISTS = seguro)
ALTER TABLE store_payment_settings 
  ADD COLUMN IF NOT EXISTS has_asaas_key BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_mp_key    BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Migração de dados: mover credenciais para a tabela de segredos
-- Só executa se as colunas asaas_api_key e webhook_token ainda existirem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_payment_settings'
      AND column_name = 'asaas_api_key'
  ) THEN

    -- Migra os segredos existentes para store_payment_secrets
    INSERT INTO store_payment_secrets (store_id, payment_provider, asaas_api_key, webhook_token)
    SELECT store_id, payment_provider, asaas_api_key, webhook_token
    FROM store_payment_settings
    WHERE asaas_api_key IS NOT NULL OR webhook_token IS NOT NULL
    ON CONFLICT (store_id, payment_provider) DO UPDATE 
    SET 
      asaas_api_key = COALESCE(EXCLUDED.asaas_api_key, store_payment_secrets.asaas_api_key),
      webhook_token = COALESCE(EXCLUDED.webhook_token, store_payment_secrets.webhook_token);

    -- Atualiza a flag has_asaas_key com base nos dados ainda presentes
    UPDATE store_payment_settings
    SET has_asaas_key = (asaas_api_key IS NOT NULL AND trim(asaas_api_key) <> '');

    -- Remove as colunas sensíveis da tabela pública
    ALTER TABLE store_payment_settings DROP COLUMN IF EXISTS asaas_api_key;
    ALTER TABLE store_payment_settings DROP COLUMN IF EXISTS webhook_token;

    RAISE NOTICE 'Migração de credenciais concluída com sucesso.';
  ELSE
    RAISE NOTICE 'Colunas asaas_api_key/webhook_token já foram removidas. Nenhuma migração necessária.';
  END IF;
END;
$$;

-- 4. Função RPC Segura para o Frontend (SECURITY DEFINER)
-- Permite gravar configurações e segredos sem expor as credenciais ao cliente.
CREATE OR REPLACE FUNCTION save_store_payment_settings(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id    UUID;
  v_provider    VARCHAR;
  v_environment VARCHAR;
  v_enabled     BOOLEAN;
  v_methods     TEXT[];
  v_asaas_key   TEXT;
  v_mp_access   TEXT;
  v_mp_public   TEXT;
  v_user_id     UUID;
  v_is_owner    BOOLEAN;
BEGIN
  v_store_id    := (payload->>'store_id')::UUID;
  v_provider    := COALESCE(payload->>'payment_provider', 'asaas');
  v_environment := COALESCE(payload->>'environment', 'sandbox');
  v_enabled     := COALESCE((payload->>'payment_enabled')::BOOLEAN, FALSE);
  
  IF payload->'payment_methods' IS NOT NULL THEN
    SELECT array_agg(x::TEXT) INTO v_methods
    FROM jsonb_array_elements_text(payload->'payment_methods') x;
  ELSE
    v_methods := ARRAY['PIX'];
  END IF;

  v_asaas_key := payload->>'asaas_api_key';
  v_mp_access := payload->>'mp_access_token';
  v_mp_public := payload->>'mp_public_key';

  -- Validação: somente o dono da loja pode alterar
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = v_store_id AND user_id = v_user_id
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Acesso negado à loja informada';
  END IF;

  -- Atualiza tabela pública (sem credenciais)
  INSERT INTO store_payment_settings (
    store_id, payment_provider, environment, payment_enabled, payment_methods,
    has_asaas_key, has_mp_key
  ) VALUES (
    v_store_id, v_provider, v_environment, v_enabled, v_methods,
    (v_asaas_key IS NOT NULL AND trim(v_asaas_key) <> ''),
    (v_mp_access IS NOT NULL AND trim(v_mp_access) <> '')
  )
  ON CONFLICT (store_id, payment_provider) DO UPDATE SET
    environment   = EXCLUDED.environment,
    payment_enabled = EXCLUDED.payment_enabled,
    payment_methods = EXCLUDED.payment_methods,
    has_asaas_key = CASE
      WHEN v_asaas_key IS NOT NULL THEN (trim(v_asaas_key) <> '')
      ELSE store_payment_settings.has_asaas_key
    END,
    has_mp_key = CASE
      WHEN v_mp_access IS NOT NULL THEN (trim(v_mp_access) <> '')
      ELSE store_payment_settings.has_mp_key
    END,
    updated_at = NOW();

  -- Atualiza tabela de segredos (COALESCE preserva valores existentes se campo não enviado)
  INSERT INTO store_payment_secrets (
    store_id, payment_provider, asaas_api_key, mp_access_token, mp_public_key
  ) VALUES (
    v_store_id, v_provider, v_asaas_key, v_mp_access, v_mp_public
  )
  ON CONFLICT (store_id, payment_provider) DO UPDATE SET
    asaas_api_key   = COALESCE(v_asaas_key, store_payment_secrets.asaas_api_key),
    mp_access_token = COALESCE(v_mp_access, store_payment_secrets.mp_access_token),
    mp_public_key   = COALESCE(v_mp_public, store_payment_secrets.mp_public_key),
    updated_at      = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Função RPC para remover configurações de pagamento com segurança
CREATE OR REPLACE FUNCTION delete_store_payment_settings(p_store_id UUID, p_provider VARCHAR)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id  UUID;
  v_is_owner BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = p_store_id AND user_id = v_user_id
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  DELETE FROM store_payment_settings WHERE store_id = p_store_id AND payment_provider = p_provider;
  DELETE FROM store_payment_secrets   WHERE store_id = p_store_id AND payment_provider = p_provider;

  RETURN jsonb_build_object('success', true);
END;
$$;
