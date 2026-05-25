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

-- 4. INSERT: apenas usuário autenticado e proprietário da loja (isolamento por store_id)
DROP POLICY IF EXISTS "logos_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_insert_own" ON storage.objects;
CREATE POLICY "logos_auth_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 5. UPDATE: apenas usuário autenticado e proprietário da loja (isolamento por store_id)
DROP POLICY IF EXISTS "logos_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_update_own" ON storage.objects;
CREATE POLICY "logos_auth_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 6. DELETE: apenas usuário autenticado e proprietário da loja (isolamento por store_id)
DROP POLICY IF EXISTS "logos_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_delete_own" ON storage.objects;
CREATE POLICY "logos_auth_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND (SELECT auth.role()) = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Verificação: confirme que o bucket foi criado
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'logos';
