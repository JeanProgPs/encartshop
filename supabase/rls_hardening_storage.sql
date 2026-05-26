-- ============================================================
-- EncartShop — RLS Hardening: Storage Bucket Isolation
-- Corrige isolamento por store_id nos buckets products e logos
-- Executar no SQL Editor do Supabase após validação
-- ============================================================

-- ============================================================
-- BUCKET: products — Isolamento por store_id (dono)
-- ============================================================

-- Remove policies antigas não-isoladas
DROP POLICY IF EXISTS "storage_products_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_products_update_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_products_delete_auth" ON storage.objects;

-- SELECT: mantém público (não muda)
-- CREATE POLICY "storage_products_select_public" já existe

-- INSERT: apenas autenticado e proprietário da loja (validar via pasta/store_id)
CREATE POLICY "storage_products_insert_own_store"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- UPDATE: apenas autenticado e proprietário da loja
CREATE POLICY "storage_products_update_own_store"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- DELETE: apenas autenticado e proprietário da loja
CREATE POLICY "storage_products_delete_own_store"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- BUCKET: logos — Isolamento por store_id (dono)
-- ============================================================

-- Remove policies antigas não-isoladas
DROP POLICY IF EXISTS "logos_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_delete" ON storage.objects;

-- SELECT: mantém público (não muda)
-- CREATE POLICY "logos_public_read" já existe

-- INSERT: apenas autenticado e proprietário da loja
CREATE POLICY "logos_auth_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- UPDATE: apenas autenticado e proprietário da loja
CREATE POLICY "logos_auth_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- DELETE: apenas autenticado e proprietário da loja
CREATE POLICY "logos_auth_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- VALIDAÇÃO PÓS-APLICAÇÃO
-- ============================================================

-- Verificar que as políticas foram criadas corretamente
SELECT
  policyname,
  tablename,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN (SELECT tablename FROM pg_policies WHERE schemaname = 'storage')
ORDER BY tablename, policyname;

-- Checklist:
-- [ ] policies de INSERT isoladas por store_id
-- [ ] policies de UPDATE isoladas por store_id
-- [ ] policies de DELETE isoladas por store_id
-- [ ] SELECT público mantido (não alterado)
-- [ ] Sem USING true em nenhuma política
