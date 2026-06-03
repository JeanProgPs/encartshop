-- Migration: add_custom_domain_stores
-- Adiciona os campos de domínio customizado para o plano Enterprise.

ALTER TABLE stores
ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Política de RLS para garantir que a consulta por domínio seja pública.
-- A política `stores_select_public_slug` (ou as novas que existem) já cobrem SELECT FOR PUBLIC na tabela `stores` se `status = 'active'`.
-- Portanto, a adição da coluna não exige mudanças nas permissões públicas básicas de leitura.
