-- ============================================================
-- EncartShop — Migração: Identidade Visual da Loja
-- Executar no SQL Editor do Supabase (dashboard.supabase.com)
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS logo_path    TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#0f172a';

-- ============================================================
-- STORAGE: Criar o bucket 'logos' pelo painel do Supabase
-- (Storage → New Bucket → Name: logos → Public: ON)
-- Depois execute as policies abaixo:
-- ============================================================

-- Permite leitura pública de qualquer arquivo no bucket logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: qualquer um pode ler (leitura pública)
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

-- Policy: apenas usuário autenticado pode fazer upload
DROP POLICY IF EXISTS "logos_auth_insert" ON storage.objects;
CREATE POLICY "logos_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND auth.uid() IS NOT NULL);

-- Policy: apenas o dono pode atualizar/deletar sua logo
DROP POLICY IF EXISTS "logos_auth_update" ON storage.objects;
CREATE POLICY "logos_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "logos_auth_delete" ON storage.objects;
CREATE POLICY "logos_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logos' AND auth.uid() IS NOT NULL);
