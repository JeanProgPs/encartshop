# Guia de Aplicação: RLS Storage Hardening

## Objetivo

Aplicar isolamento por `store_id` aos buckets `products` e `logos` do Supabase.

---

## ⚠️ PRÉ-REQUISITOS CRÍTICOS

**Antes de executar:**

1. ✅ Fazer backup do banco (Supabase → Backups → Download)
2. ✅ Aplicar em staging/dev primeiro (NÃO em produção diretamente)
3. ✅ Ter acesso de `postgres` (superuser) no Supabase Dashboard
4. ✅ Testar em navegador privado para validar isolamento

---

## Passo 1: Verificar Tabelas Existentes

Executar no **SQL Editor** do Supabase Dashboard:

```sql
-- Listar todas as tabelas da aplicação
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Resultado esperado:**
- stores
- products
- orders
- delivery_zones
- profiles (talvez)
- **clientes** (?) — se existir, adicionar RLS
- **promocoes** (?) — se existir, adicionar RLS

---

## Passo 2: Validar Policies Atuais

```sql
-- Ver todas as policies de storage
SELECT
  policyname,
  tablename,
  permissive,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('objects')
  AND schemaname = 'storage'
ORDER BY policyname;
```

**Deve mostrar:**
- `storage_products_select_public` (SELECT)
- `logos_public_read` (SELECT)
- Policies de INSERT/UPDATE/DELETE **SEM isolamento** (risco atual)

---

## Passo 3: Backup da Policy Atual (Rollback)

Antes de alterar, copiar o script atual para rollback:

```sql
-- BACKUP: Política antiga (sem isolamento)
-- Se precisar reverter, recriar essas policies

CREATE POLICY "storage_products_insert_auth_BACKUP"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
  );
```

---

## Passo 4: Aplicar Hardening

No **SQL Editor** do Supabase, copiar e executar o conteúdo de:

```
supabase/rls_hardening_storage.sql
```

**⚠️ Atenção:**
- Executar por inteiro em uma transação
- Não interromper no meio
- Aguardar conclusão (esperar ~10 segundos)

---

## Passo 5: Validar Aplicação

### 5.1 Verificar que as policies foram criadas

```sql
SELECT policyname, cmd FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;
```

**Resultado esperado:** Policies com `*_own_store` ou `*_own`

### 5.2 Validar sintaxe das policies

```sql
-- Nenhum erro deve aparecer
SELECT * FROM pg_policies WHERE policyname LIKE '%products%';
SELECT * FROM pg_policies WHERE policyname LIKE '%logos%';
```

---

## Passo 6: Testes Funcionais

### Teste 1: Upload de arquivo como Lojista A

```
1. Fazer login como Lojista A (user_id: abc123)
2. Ir para Produtos → Upload logo
3. Validar que upload funciona
4. Verificar que arquivo fica em bucket: logos/abc123-uuid-...
```

**Resultado esperado:** ✅ Upload bem-sucedido

### Teste 2: Verificar que não pode deletar arquivo de outra loja

```
1. Ficar logado como Lojista A
2. Tentar deletar arquivo de Lojista B
3. Esperado: Erro "Unauthorized" ou falha silenciosa
```

**Resultado esperado:** ❌ Acesso negado

### Teste 3: Listar produtos na loja pública

```
1. Abrir loja pública (sem login) em navegador incógnito
2. Carregar página de produtos
3. Validar que imagens carregam normalmente
```

**Resultado esperado:** ✅ Imagens visíveis

### Teste 4: Dashboard admin funciona normalmente

```
1. Login como lojista
2. Ir para Dashboard → Produtos
3. Carregar produtos
4. Editar produto (incluindo upload de nova imagem)
```

**Resultado esperado:** ✅ Tudo funciona

---

## Passo 7: Rollback (se necessário)

Se qualquer teste falhar:

### Opção A: Reverter policies individuais

```sql
-- Remover as novas policies
DROP POLICY "storage_products_insert_own_store" ON storage.objects;
DROP POLICY "storage_products_update_own_store" ON storage.objects;
DROP POLICY "storage_products_delete_own_store" ON storage.objects;

DROP POLICY "logos_auth_insert_own" ON storage.objects;
DROP POLICY "logos_auth_update_own" ON storage.objects;
DROP POLICY "logos_auth_delete_own" ON storage.objects;

-- Recriar policies antigas (sem isolamento)
CREATE POLICY "storage_products_insert_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
  );

-- ... (ver rls_policies.sql para o resto)
```

### Opção B: Restaurar do backup completo

Se os testes falharem completamente, restaurar o backup do Supabase:
- Supabase Dashboard → Backups → Restore

---

## Passo 8: Deploy em Produção

Após sucesso em staging:

1. Notificar usuários (opcional): "Manutenção de segurança às XX:00"
2. Fazer backup em produção
3. Executar `rls_hardening_storage.sql` em produção
4. Rodar os testes novamente (em produção)
5. Monitorar logs de erro por 1 hora

---

## Monitoramento Pós-Deploy

### Verificar erros de acesso

```sql
-- Se disponível, verificar logs de erro
SELECT error_code, count(*) FROM error_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_code;
```

### Verificar uploads/downloads

```sql
-- Validar que uploads continuam funcionando
SELECT count(*) as total_files FROM storage.objects 
WHERE bucket_id IN ('products', 'logos')
  AND created_at > NOW() - INTERVAL '1 hour';
```

---

## Resumo das Mudanças

| Item | Antes | Depois |
|------|-------|--------|
| INSERT products | Qualquer autenticado | Apenas dono da loja |
| UPDATE products | Qualquer autenticado | Apenas dono da loja |
| DELETE products | Qualquer autenticado | Apenas dono da loja |
| INSERT logos | Qualquer autenticado | Apenas dono da loja |
| UPDATE logos | Qualquer autenticado | Apenas dono da loja |
| DELETE logos | Qualquer autenticado | Apenas dono da loja |
| SELECT (public) | Público | Público ✅ (não muda) |

---

## Próximas Fases

Após essa aplicação bem-sucedida:

- [ ] Verificar existência de "clientes" e "promocoes" e adicionar RLS se necessário
- [ ] Implementar audit log para rastreamento de acesso
- [ ] Revisar outras tabelas potencialmente não documentadas
- [ ] Criar teste automatizado de isolamento RLS

---

## Suporte

Se encontrar erro durante aplicação:

1. **Erro de sintaxe SQL:** Copiar linha por linha, executar separadamente
2. **Policy já existe:** Usar `DROP IF EXISTS` (já incluído no script)
3. **Permissão negada:** Verificar que está usando usuário com permissão de superuser

Contate o time de DevOps se persistir.
