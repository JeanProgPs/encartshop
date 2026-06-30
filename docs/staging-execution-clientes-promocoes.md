# Execução Controlada em Staging — Clientes e Promoções

**Objetivo:** Aplicar modelo de `clientes`, `promocoes` e `promocao_produtos` em staging com validação completa antes de qualquer frontend.

---

## Fase 1 — Preparação

### 1. Confirmar backup do banco staging
- Fazer backup manual no Supabase Dashboard.
- Confirmar que o backup está disponível antes de executar qualquer migration.

### 2. Confirmar projeto staging
- Verificar URL do projeto staging no Supabase.
- Garantir que não é o ambiente de produção.

### 3. Confirmar acesso admin Supabase
- Confirmar acesso de administrador ou conta com privilégios suficientes para rodar migrations e criar policies.
- Confirmar acesso ao SQL Editor.

### 4. Ferramentas necessárias
- Supabase Dashboard (staging)
- SQL Editor do Supabase
- Supabase Studio para inspeção manual
- Terminal / notas de validação

---

## Fase 2 — Execução SQL

### Script a executar
- `supabase/migrations/create_clientes_promocoes.sql`

### Instruções
1. Abrir o SQL Editor do projeto staging.
2. Copiar o conteúdo completo de `supabase/migrations/create_clientes_promocoes.sql`.
3. Executar o script completo sem alterar manualmente partes isoladas.
4. Não rodar porções separadas em etapas isoladas; a execução deve ser única para garantir consistência.

### Atenção
- Se ocorrer erro, interromper e analisar imediatamente.
- Não avançar para validações até que a execução tenha finalizado sem falhas.

---

## Fase 3 — Validação Após Execução

### Confirmar criação das tabelas
Executar:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY table_name;
```

Resultado esperado:
- clientes
- promocoes
- promocao_produtos

### Confirmar índices criados
Executar:
```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename, indexname;
```

### Confirmar constraints criadas
Executar:
```sql
SELECT conname, conrelid::regclass AS tabela, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY conrelid::regclass::text, conname;
```

### Confirmar RLS habilitado
Executar:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clientes', 'promocoes', 'promocao_produtos');
```

### Confirmar policies criadas
Executar:
```sql
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY tablename, policyname;
```

---

## Fase 4 — Testes Multi-Tenant

### Configuração
- Criar duas lojas distintas em staging: Loja A e Loja B.
- Garantir que cada loja tenha `store_id` e `user_id` diferentes.
- Utilizar dois usuários autenticados diferentes ou duas contas de loja no Supabase.

### Testes obrigatórios

#### Loja A NÃO pode acessar Loja B

1. SELECT
   - Loja A deve falhar/retornar vazio ao ler `clientes` de Loja B.
   - Loja A deve falhar/retornar vazio ao ler `promocoes` de Loja B.

2. INSERT
   - Loja A deve conseguir criar cliente em Loja A.
   - Loja A NÃO deve conseguir criar cliente atribuído a Loja B.
   - Loja A deve conseguir criar promoção em Loja A.
   - Loja A NÃO deve conseguir criar promoção para Loja B.

3. UPDATE
   - Loja A deve conseguir atualizar cliente de Loja A.
   - Loja A NÃO deve conseguir atualizar cliente de Loja B.
   - Loja A deve conseguir atualizar promoção de Loja A.
   - Loja A NÃO deve conseguir atualizar promoção de Loja B.

4. DELETE
   - Loja A deve conseguir deletar cliente de Loja A.
   - Loja A NÃO deve conseguir deletar cliente de Loja B.
   - Loja A deve conseguir deletar promoção de Loja A.
   - Loja A NÃO deve conseguir deletar promoção de Loja B.

### Queries de teste

```sql
-- Loja A tenta acessar clientes de Loja B
SELECT * FROM clientes
WHERE store_id = '<store_id_da_loja_b>'
LIMIT 10;

-- Loja A tenta acessar promoções de Loja B
SELECT * FROM promocoes
WHERE store_id = '<store_id_da_loja_b>'
LIMIT 10;
```

> Os resultados devem ser vazios ou negados pelo RLS.

---

## Fase 5 — Testes de Performance

### Consultas principais

#### Clientes por store_id
```sql
EXPLAIN ANALYZE
SELECT id, nome, email, total_gasto, ultimo_pedido
FROM clientes
WHERE store_id = '<store_id_da_loja_a>'
ORDER BY total_gasto DESC
LIMIT 50;
```

#### Busca de cliente por email
```sql
EXPLAIN ANALYZE
SELECT * FROM clientes
WHERE store_id = '<store_id_da_loja_a>'
  AND email = 'teste@exemplo.com';
```

#### Promoções ativas
```sql
EXPLAIN ANALYZE
SELECT id, nome, tipo, valor
FROM promocoes
WHERE store_id = '<store_id_da_loja_a>'
  AND ativa = true
  AND data_inicio <= NOW()
  AND data_fim >= NOW();
```

### O que validar
- Índices são usados (`Index Scan` em vez de `Seq Scan`).
- Não há full table scan em queries por `store_id`.
- Tempo de execução é compatível com staging e expected production.

---

## Fase 6 — Validação Frontend Básica

### Mesmo sem UI final
- Testar consultas manuais via Supabase Studio.
- Testar criação/edição básica via SQL e ver se dados aparecem como esperado.
- Testar integração JS mínima usando o client Supabase em um pequeno script local.

### Exemplo de validação JS
```js
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCliente() {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{ store_id: '<store_id_da_loja_a>', nome: 'Teste', email: 'teste@lojaa.com' }]);
  console.log(data, error);
}

testCliente();
```

> Não criar frontend definitivo. Apenas validar que o modelo e o acesso JS funcionam.

---

## Rollback

### Se algum problema crítico surgir
- Parar imediatamente.
- Não executar outras migrations.
- Usar o backup do staging para restaurar o estado anterior.
- Documentar o erro detalhadamente.

### Rollback manual básico
```sql
DROP TABLE IF EXISTS promocao_produtos;
DROP TABLE IF EXISTS promocoes;
DROP TABLE IF EXISTS clientes;
```

> Usar apenas se o backup não puder ser restaurado. Caso contrário, preferir o restore oficial do Supabase.

---

## Objetivo Final

Garantir que `clientes` e `promocoes` nasçam em staging com:
- arquitetura sólida
- segurança multi-tenant
- performance correta
- estabilidade

Antes de qualquer implementação visual.
