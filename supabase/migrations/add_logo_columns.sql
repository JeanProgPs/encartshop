-- ============================================================
-- EncartShop — Storage: Bucket LOGOS + Policies
-- Executar no SQL Editor do Supabase (dashboard.supabase.com)
-- ============================================================

-- 1. Cria o bucket 'logos' como público (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,  -- 2 MB em bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 2. Remove policies antigas (evita conflito)
DROP POLICY IF EXISTS "logos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_insert"  ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_update"  ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_delete"  ON storage.objects;

-- 3. SELECT público: qualquer pessoa pode ver logos
CREATE POLICY "logos_public_read"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'logos' );

-- 4. INSERT: apenas usuário autenticado pode fazer upload
CREATE POLICY "logos_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
  );

-- 5. UPDATE: apenas usuário autenticado pode atualizar
CREATE POLICY "logos_auth_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
  );

-- 6. DELETE: apenas usuário autenticado pode deletar
CREATE POLICY "logos_auth_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
  );

-- Verificação: confirme que o bucket foi criado
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'logos';
