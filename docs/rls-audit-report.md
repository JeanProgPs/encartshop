# AUDITORIA RLS — EncartShop
## Relatório de Segurança Multi-Tenant

**Data:** 25 de maio de 2026  
**Status:** CRÍTICO COM RECOMENDAÇÕES  
**Objetivo:** Validar isolamento de dados entre lojas/clientes  

---

## Resumo Executivo

✅ **Tabelas principais protegidas:** stores, products, orders, delivery_zones  
⚠️ **Storage com risco:** buckets "products" e "logos" não isolam por proprietário  
❓ **Tabelas não auditadas:** "clientes", "promocoes" (referenciadas na UI)  

---

## Detalhes por Tabela

### 1. `stores` — ✅ SEGURO

| Operação | Política | Status |
|----------|----------|--------|
| SELECT | Dono (auth.uid = user_id) OU loja ativa | ✅ Seguro |
| INSERT | Apenas auth.uid = user_id | ✅ Seguro |
| UPDATE | Apenas dono | ✅ Seguro |
| DELETE | Apenas dono | ✅ Seguro |

**Nota:** Policy SELECT "pública" permite enumeração limitada via UUID (difícil de adivinhar).

---

### 2. `products` — ✅ SEGURO

| Operação | Política | Status |
|----------|----------|--------|
| SELECT | Qualquer um (loja ativa) | ✅ Seguro (faz JOIN com stores) |
| INSERT | Apenas dono da loja | ✅ Seguro |
| UPDATE | Apenas dono da loja | ✅ Seguro |
| DELETE | Apenas dono da loja | ✅ Seguro |

**Implementação:** Valida `auth.uid = (SELECT user_id FROM stores WHERE id = store_id)`

---

### 3. `orders` — ✅ SEGURO

| Operação | Política | Status |
|----------|----------|--------|
| SELECT | Apenas dono da loja | ✅ Seguro |
| INSERT | Público (anônimo) — qualquer store_id válido | ✅ Seguro |
| UPDATE | Apenas dono da loja | ✅ Seguro |
| DELETE | Apenas dono da loja | ✅ Seguro |

**Nota:** INSERT público é necessário para clientes anonimicamente criarem pedidos via loja.

---

### 4. `profiles` — ✅ SEGURO (condicional)

| Operação | Política | Status |
|----------|----------|--------|
| SELECT | Apenas próprio perfil | ✅ Seguro |
| INSERT | Apenas próprio perfil | ✅ Seguro |
| UPDATE | Apenas próprio perfil | ✅ Seguro |

**Nota:** Aplicada apenas se a tabela existir (código dinâmico).

---

### 5. `delivery_zones` — ✅ SEGURO

| Operação | Política | Status |
|----------|----------|--------|
| SELECT | Loja ativa OU dono logado | ✅ Seguro |
| INSERT | Apenas dono | ✅ Seguro |
| UPDATE | Apenas dono | ✅ Seguro |
| DELETE | Apenas dono | ✅ Seguro |

**Nota:** Mesma pattern que delivery, isolamento perfeito.

---

## Storage Buckets

### `products` — ⚠️ RISCO: SEM ISOLAMENTO POR PROPRIETÁRIO

| Operação | Política Atual | Risco | Recomendação |
|----------|---|---|---|
| SELECT | Público | Nenhum — é intencional | Mantém |
| INSERT | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |
| UPDATE | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |
| DELETE | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |

**Problema:** Qualquer usuário autenticado pode fazer upload/deletar produtos de outra loja se conhecer o nome do arquivo.

**Correção proposta:**
```sql
-- Storage produtos: isolamento por store_id (dono da loja)
CREATE POLICY "storage_products_insert_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "storage_products_update_auth"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "storage_products_delete_auth"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
    AND (text_to_array(name, '/'::text))[1] = (
      SELECT id::text FROM stores WHERE user_id = auth.uid() LIMIT 1
    )
  );
```

---

### `logos` — ⚠️ RISCO: SEM ISOLAMENTO POR PROPRIETÁRIO

| Operação | Política Atual | Risco | Recomendação |
|----------|---|---|---|
| SELECT | Público | Nenhum | Mantém |
| INSERT | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |
| UPDATE | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |
| DELETE | Apenas autenticado | 🔴 CRÍTICO | Validar store_id do dono |

**Mesmo problema do bucket `products`.**

**Correção proposta:** Mesma estratégia — isolar por pasta do store_id.

---

## Tabelas Não Auditadas

### UI referencia: "clientes", "promocoes"

**Status:** ❓ **NÃO ENCONTRADAS NAS POLÍTICAS**

Se essas tabelas existem no banco, elas podem **não ter RLS habilitado**.

**Ação recomendada:**
1. Verificar se as tabelas existem: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
2. Se existem, adicionar RLS no arquivo `rls_policies.sql`
3. Se não existem, remover referências da UI

---

## Checklist de Risco

| Item | Status | Ação |
|------|--------|------|
| stores isolada por user_id | ✅ OK | — |
| products isolada via store_id | ✅ OK | — |
| orders isolada via store_id | ✅ OK | — |
| delivery_zones isolada | ✅ OK | — |
| storage/products isolada | ⚠️ RISCO | Aplicar patch isolamento |
| storage/logos isolada | ⚠️ RISCO | Aplicar patch isolamento |
| Tabelas "clientes" e "promocoes" | ❓ INCERTO | Auditar existência |

---

## Criticidade e Impacto

### 🔴 CRÍTICO

- **Storage buckets sem isolamento:** Qualquer usuário autenticado pode deletar arquivos de outra loja.
- **Impacto:** Perda de imagens de produtos/logos de lojas concorrentes.

### ⚠️ ALTO

- **Tabelas "clientes" e "promocoes" não auditadas:** Se existem sem RLS, há risco de loja A acessar dados da loja B.

### ✅ BAIXO

- Tabelas principais estão bem isoladas com RLS.

---

## Plano de Correção

### Fase 1 (Imediato)
1. Verificar existência de "clientes" e "promocoes"
2. Se existem, adicionar RLS
3. Aplicar patches de isolamento aos buckets storage

### Fase 2 (Próxima semana)
1. Testar cada correção individualmente
2. Validar que não quebra funcionalidades
3. Monitorar logs de acesso

### Fase 3 (Longo prazo)
1. Implementar auditoria de acesso (audit log)
2. Considerar usar Row Level Security + Audit Policy para rastreamento

---

## Recomendações Imediatas

**1. Auditar tabelas existentes:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**2. Aplicar isolamento no storage** (ver seção "Correção proposta" acima)

**3. Testes pós-correção:**
- ✅ Lojista A não consegue acessar dados da loja B
- ✅ Upload de arquivos funciona normalmente
- ✅ Lista de produtos/pedidos permanece funcional
- ✅ Dashboard não quebra

---

## Conclusão

O EncartShop tem **arquitetura RLS sólida** para tabelas principais.  
Porém, **storage buckets carecem de isolamento** e há **tabelas potencialmente não documentadas**.

Seguindo o plano acima, o sistema será **seguro para multi-tenant** em produção.
