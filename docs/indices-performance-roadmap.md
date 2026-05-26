# Índices, Performance e Próximos Passos

**Data:** 25 de maio de 2026  
**Status:** 📋 Planejamento Completo  
**Objetivo:** Otimizar queries e definir roadmap de implementação

---

## 1️⃣ ESTRATÉGIA DE ÍNDICES

### Por Que Índices Importam

```
❌ SEM índice:
  SELECT * FROM clientes WHERE store_id = $1
  └─ Full table scan (1M linhas = lento)

✅ COM índice:
  CREATE INDEX idx_clientes_store_id ON clientes(store_id);
  └─ Binary search (1M linhas ≈ 20 queries)
  └─ ~100x mais rápido
```

### Índices em `clientes`

| Índice | Tipo | Uso Típico | Prioridade |
|--------|------|-----------|-----------|
| `(store_id)` | B-tree | Listar clientes por loja | 🔴 CRÍTICO |
| `(store_id, email)` | B-tree | Buscar cliente por email | 🔴 CRÍTICO |
| `(store_id, total_gasto DESC)` | B-tree | Top clientes por gasto | 🟡 ALTO |
| `(store_id, ultimo_pedido DESC)` | B-tree | Clientes recentes | 🟡 ALTO |

### Índices em `promocoes`

| Índice | Tipo | Uso Típico | Prioridade |
|--------|------|-----------|-----------|
| `(store_id)` | B-tree | Listar promos por loja | 🔴 CRÍTICO |
| `(store_id, ativa)` | B-tree | Promos ativas por loja | 🔴 CRÍTICO |
| `(store_id, data_inicio, data_fim)` | B-tree | Promos por período (checkout) | 🟡 ALTO |

### Índices em `promocao_produtos`

| Índice | Tipo | Uso Típico | Prioridade |
|--------|------|-----------|-----------|
| `(promocao_id)` | B-tree | Produtos de uma promo | 🔴 CRÍTICO |
| `(produto_id)` | B-tree | Promos de um produto | 🟡 ALTO |
| `(promocao_id, produto_id)` UNIQUE | Hash | Evitar duplicatas | 🔴 CRÍTICO |

---

## 2️⃣ QUERIES ESPERADAS

### Query 1: Listar Clientes de Uma Loja (Dashboard)

```sql
-- Esperado: rápido, com paginação
SELECT id, nome, email, total_gasto, ultimo_pedido 
FROM clientes 
WHERE store_id = $1 
ORDER BY total_gasto DESC 
LIMIT 50;

-- Plano de execução (esperado):
-- Index Scan using idx_clientes_store_id
-- -> Filter (store_id = $1)
-- -> Sort (total_gasto DESC)
-- -> Limit 50

-- Tempo: < 100ms
```

### Query 2: Buscar Cliente por Email

```sql
SELECT * FROM clientes 
WHERE store_id = $1 AND email = $2;

-- Plano de execução (esperado):
-- Index Scan using idx_clientes_email
-- -> Filter (store_id = $1 AND email = $2)

-- Tempo: < 10ms
```

### Query 3: Promoções Válidas no Checkout

```sql
SELECT id, nome, tipo, valor 
FROM promocoes 
WHERE store_id = $1 
  AND ativa = true 
  AND data_inicio <= NOW() 
  AND data_fim >= NOW();

-- Plano de execução (esperado):
-- Index Scan using idx_promocoes_ativa
-- -> Filter (store_id = $1 AND ativa = true)
-- -> Filter (data_inicio <= NOW() AND data_fim >= NOW())

-- Tempo: < 50ms
```

### Query 4: Produtos com Promoção

```sql
SELECT p.id, p.nome, p.preco 
FROM products p
JOIN promocao_produtos pp ON p.id = pp.produto_id
WHERE pp.promocao_id = $1;

-- Plano de execução (esperado):
-- Nested Loop Join
-- -> Index Scan using idx_promocao_produtos_promocao
-- -> Index Scan using products_pkey

-- Tempo: < 20ms (para até 100 produtos)
```

---

## 3️⃣ MONITORAMENTO DE PERFORMANCE

### O que monitorar em produção:

```sql
-- Query lenta (> 100ms)?
SELECT query, mean_exec_time 
FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC;

-- Index não está sendo usado?
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;

-- Tabela cresce muito rápido?
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables 
WHERE tablename IN ('clientes', 'promocoes', 'promocao_produtos')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 4️⃣ ROADMAP DE IMPLEMENTAÇÃO

### Fase 1: Fundação (Semana 1-2)

**Tarefas:**
- [ ] Revisar e aprovar schema
- [ ] Executar `supabase/migrations/create_clientes_promocoes.sql` em staging
- [ ] Validar RLS (loja A não vê loja B)
- [ ] Validar índices criados
- [ ] Testes de query performance

**Entregáveis:**
- ✅ Tabelas criadas
- ✅ RLS funcional
- ✅ Índices otimizados
- ❌ Sem frontend ainda

**Critério de Sucesso:**
- Todas as queries correm em < 100ms
- Loja A isolada de Loja B
- Sem erros de constraints

---

### Fase 2: API Backend (Semana 3-4)

**Tarefas:**
- [ ] Criar endpoints GET/POST/PUT/DELETE para clientes
- [ ] Criar endpoints GET/POST/PUT/DELETE para promoções
- [ ] Sincronização de agregações (trigger ou job)
- [ ] Aplicação de desconto no checkout
- [ ] Testes de integração RLS

**Entregáveis:**
- ✅ API pronta
- ✅ Agregações sincronizadas
- ✅ Checkout com desconto
- ❌ Sem frontend ainda

**Critério de Sucesso:**
- API retorna apenas dados da loja autenticada
- Agregações mantêm-se sincronizadas
- Descontos aplicados corretamente

---

### Fase 3: Frontend Admin (Semana 5-6)

**Tarefas:**
- [ ] Página de listagem de clientes
- [ ] Página de criar/editar cliente
- [ ] Página de listagem de promoções
- [ ] Página de criar/editar promoção
- [ ] Ordenação, filtro, paginação

**Entregáveis:**
- ✅ Dashboard clientes funcional
- ✅ Dashboard promoções funcional
- ✅ UI responsiva

**Critério de Sucesso:**
- Tudo funciona em desktop/tablet/mobile
- Sem layout breaking
- Interactions rápidas (< 500ms)

---

### Fase 4: Frontend Público (Semana 7-8)

**Tarefas:**
- [ ] Exibir promoções no checkout
- [ ] Aplicar desconto visualmente
- [ ] Histórico de compras (últimos pedidos)
- [ ] Dados do cliente no pedido

**Entregáveis:**
- ✅ Checkout com promoções
- ✅ Histórico de compras
- ✅ UX melhorada

**Critério de Sucesso:**
- Promoção aplicada corretamente
- Histórico exibe com dados corretos
- Sem breaking changes

---

### Fase 5: Otimizações & Escalas (Semana 9+)

**Tarefas:**
- [ ] Audit log de acesso
- [ ] Cache de promoções
- [ ] Background jobs para agregações
- [ ] Relatórios (RFM, cohort)
- [ ] Automações (recompra, cashback)

---

## 5️⃣ ESTRUTURA DE IMPLEMENTAÇÃO

### Sugestão de Arquivos

```
js/
├── core/
│   └── supabase.js ✅ (já existe)
├── modules/
│   ├── clientes.js          (NEW)
│   │   ├── fetchClientes()
│   │   ├── createCliente()
│   │   ├── updateCliente()
│   │   └── deleteCliente()
│   │
│   ├── promocoes.js         (NEW)
│   │   ├── fetchPromoces()
│   │   ├── createPromocao()
│   │   ├── updatePromocao()
│   │   └── deletePromocao()
│   │
│   └── ...outros modules
│
admin/
├── clientes.html            (NEW)
│   └── Dashboard de clientes
│
├── promocoes.html           (NEW)
│   └── Dashboard de promoções
│
└── ...outras páginas

loja/
└── checkout com promoções
```

---

## 6️⃣ TESTES OBRIGATÓRIOS

### Teste 1: Isolamento RLS

```javascript
// Loja A não pode ver clientes da Loja B
test('cliente A não acessa dados da loja B', async () => {
  const lojaA = await loginAs('loja-a');
  const clientesA = await supabase
    .from('clientes')
    .select('*');
  
  expect(clientesA.data).toHaveLength(0); // Nenhum cliente da outra loja
});
```

### Teste 2: Agregações Sincronizadas

```javascript
test('total_gasto é sincronizado ao criar pedido', async () => {
  const cliente1 = await createCliente('loja-a', 'john@x.com');
  expect(cliente1.total_gasto).toBe(0);
  
  await createOrder('loja-a', 'john@x.com', 100);
  const clienteAtualizado = await fetchCliente(cliente1.id);
  
  expect(clienteAtualizado.total_gasto).toBe(100);
});
```

### Teste 3: Promoção Aplicada Corretamente

```javascript
test('desconto percentual aplicado corretamente', async () => {
  const promo = await createPromocao('loja-a', {
    tipo: 'percentual',
    valor: 20
  });
  
  const desconto = calcularDesconto(100, promo);
  expect(desconto).toBe(20); // 20% de 100 = 20
});
```

### Teste 4: Promoção Expirada não Aparece

```javascript
test('promoção expirada não aparece no checkout', async () => {
  const promo = await createPromocao('loja-a', {
    data_fim: yesterday() // ontem
  });
  
  const promos = await fetchPromoesValidas('loja-a');
  expect(promos).not.toContain(promo);
});
```

---

## 7️⃣ PERFORMANCE TARGETS

| Operação | Target | Nota |
|----------|--------|------|
| List clientes | < 100ms | 50 por página |
| Search cliente | < 10ms | Por email |
| List promoções | < 50ms | Incluindo filtro por validade |
| Apply desconto | < 20ms | No checkout |
| Create cliente | < 50ms | Validações + INSERT |
| Create promoção | < 50ms | Validações + INSERT |

---

## 8️⃣ DECISÕES DE DESIGN

### Decisão 1: Email como identificador de cliente (por enquanto)

```
✅ Vantagem:
  - Não precisa coletar ID do cliente antes de criar pedido
  - Loja pode enviar pedido anônimo com email

❌ Desvantagem:
  - Join com orders via email (string match)
  - Não normalizado (futuro: adicionar cliente_id em orders)

Futuro:
  ALTER TABLE orders ADD COLUMN cliente_id UUID REFERENCES clientes(id);
  UPDATE orders SET cliente_id = (
    SELECT id FROM clientes WHERE email = orders.email
  );
  ALTER TABLE orders DROP COLUMN email; -- ou manter ambos
```

### Decisão 2: Agregações desnormalizadas

```
✅ Vantagem:
  - Dashboard rápido (não precisa JOIN com orders)
  - Ordenar por total_gasto é O(1)

❌ Desvantagem:
  - Precisa manter sincronizado
  - Extra storage (alguns bytes por cliente)

Implementação:
  - Trigger ao criar/atualizar/deletar order
  - Ou job que roda a cada 1h
```

### Decisão 3: Promoções com tipo enum

```
✅ Vantagem:
  - Validação de tipos (CHECK constraint)
  - Simples de implementar

❌ Desvantagem:
  - Adicionar novo tipo requer ALTER TABLE (raro ok)

Alternativa (NÃO usar agora):
  tipo VARCHAR(50) + tabela de tipos
  (over-engineering para MVP)
```

---

## 9️⃣ ESTIMATIVAS DE DADOS

### Cenário Pequeno (1-10 lojas)

```
Clientes: ~1,000
Promoções: ~50
Tabela size: < 1MB

Performance: Excelente
Índices necessários: Sim, mesmo assim (boa prática)
```

### Cenário Médio (100-1000 lojas)

```
Clientes: ~100,000
Promoções: ~5,000
Tabela size: ~50MB

Performance: Boa (com índices)
Queries: < 100ms
```

### Cenário Grande (10,000+ lojas)

```
Clientes: ~10,000,000
Promoções: ~500,000
Tabela size: ~5GB

Performance: Requer particionamento
Queries: Possível N+1, requer cache
Solução: Redis cache de promoções ativas
```

---

## 🔟 CHECKLIST DE LANÇAMENTO

**Semana Anterior ao Deploy:**
- [ ] Code review completo
- [ ] Testes passam 100%
- [ ] Performance aceita (< 100ms queries)
- [ ] RLS validado em staging
- [ ] Backup em produção pronto

**Dia do Deploy:**
- [ ] Backup executado
- [ ] Migrations rodadas
- [ ] Índices criados
- [ ] RLS habilitado
- [ ] Testes em produção

**Pós-Deploy (48h):**
- [ ] Monitorar erro rates
- [ ] Checar query slowlog
- [ ] Validar RLS no produção
- [ ] Usuários testam funcionalidade
- [ ] Performance aceita

---

## RESUMO

✅ Schema pronto e otimizado  
✅ RLS desde o início  
✅ Índices estratégicos  
✅ Preparado para crescer  

📋 Próximo: Revisão e aprovação do time
