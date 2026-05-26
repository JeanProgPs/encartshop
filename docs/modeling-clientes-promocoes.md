# Modelagem: Clientes e Promoções

**Objetivo:** Definir schema seguro, escalável e multi-tenant para futuras funcionalidades  
**Status:** 📋 Planejamento (não implementado ainda)  
**Data:** 25 de maio de 2026  

---

## 📊 Visão Geral

### Escopo
Modelar duas novas entidades principais:
1. **`clientes`** — Registro de clientes únicos por loja
2. **`promocoes`** — Promoções e descontos gerenciados por loja

### Princípios
- ✅ Multi-tenant (isolação por `store_id`)
- ✅ RLS desde o início (sem acesso cruzado entre lojas)
- ✅ Relacionamentos normalizados
- ✅ Índices otimizados para queries comuns
- ✅ Preparado para evolução futura (cashback, recompra, automações)
- ❌ Sem complexidade desnecessária (IA, campanhas automáticas, CRM avançado)

---

## FASE 1: TABELA `clientes`

### 1.1 Schema Proposto

```sql
CREATE TABLE clientes (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Dados Pessoais
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(20),
  
  -- Agregações (desnormalizadas para performance)
  total_pedidos INTEGER NOT NULL DEFAULT 0,        -- Count de pedidos
  total_gasto DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- Soma de valores
  ultimo_pedido TIMESTAMP,                         -- Data do último pedido
  
  -- Controle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(store_id, email),                -- Email único por loja
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' OR email IS NULL)
);

-- Índices
CREATE INDEX idx_clientes_store_id ON clientes(store_id);
CREATE INDEX idx_clientes_email ON clientes(store_id, email);
CREATE INDEX idx_clientes_total_gasto ON clientes(store_id, total_gasto DESC);
CREATE INDEX idx_clientes_ultimo_pedido ON clientes(store_id, ultimo_pedido DESC);
```

### 1.2 Explicação dos Campos

| Campo | Tipo | Propósito | Notas |
|-------|------|----------|-------|
| `id` | UUID | Identificação única | PK, gerado automaticamente |
| `store_id` | UUID | Isolamento tenant | FK para stores, não pode ser nulo |
| `nome` | VARCHAR | Nome do cliente | Obrigatório, até 255 chars |
| `email` | VARCHAR | Contato | Opcional, validado, único por loja |
| `telefone` | VARCHAR | Contato | Opcional, formato flexível |
| `total_pedidos` | INT | Agregação | Atualizado ao criar pedido |
| `total_gasto` | DECIMAL | Agregação | Atualizado ao finalizar pedido |
| `ultimo_pedido` | TIMESTAMP | Agregação | Atualizado ao criar pedido |
| `created_at` | TIMESTAMP | Auditoria | Auto NOW() |
| `updated_at` | TIMESTAMP | Auditoria | Auto NOW(), atualizado em UPDATE |

### 1.3 Relacionamentos

```
┌─────────────┐
│   stores    │
│ id (PK)     │
└──────┬──────┘
       │ 1:N
       │
┌──────▼──────────┐          ┌──────────────────┐
│    clientes     │          │     orders       │
│ id (PK)         │          │ id (PK)          │
│ store_id (FK)   │◄─────────┤ store_id (FK)    │
│ email           │ 1:N      │ email/cliente_id │
│ total_gasto     │          │                  │
└─────────────────┘          └──────────────────┘
```

**Relacionamentos Diretos:**
- `clientes.store_id` → `stores.id` (N:1)
- `clientes` ← `orders` (1:N) — via email ou cliente_id futuro

**Agregações Denormalizadas:**
- `total_pedidos`: COUNT de orders com esse cliente
- `total_gasto`: SUM de order.total onde cliente = esse
- `ultimo_pedido`: MAX de order.created_at

### 1.4 Motivação de Denormalização

**Por que campos agregados?**
- Dashboard precisa ordenar clientes por valor gasto
- Performance: evita JOIN com orders a cada query
- Trade-off: mantém atualizado via triggers (futuro)

**Como manter sincronizado?**
```sql
-- Trigger (futuro)
CREATE OR REPLACE FUNCTION sync_cliente_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clientes SET
    total_pedidos = (SELECT COUNT(*) FROM orders WHERE ... ),
    total_gasto = (SELECT SUM(total) FROM orders WHERE ... ),
    ultimo_pedido = (SELECT MAX(created_at) FROM orders WHERE ... )
  WHERE id = NEW.cliente_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_cliente_stats
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION sync_cliente_stats();
```

### 1.5 Preparação para Futuro

**Campos não incluídos (mas podem ser adicionados):**
- `data_nascimento` — Para análise de cohort
- `cidade, estado` — Para análise geográfica
- `segmento` — Ex: "novo", "repetidor", "VIP"
- `tags` — Para segmentação manual
- `metadata` JSONB — Para dados customizados

---

## FASE 2: TABELA `promocoes`

### 2.1 Schema Principal

```sql
CREATE TABLE promocoes (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Dados da Promoção
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(50) NOT NULL,  -- percentual, valor_fixo, frete_gratis, combo
  valor DECIMAL(10,2) NOT NULL,
  
  -- Validade
  data_inicio TIMESTAMP NOT NULL,
  data_fim TIMESTAMP NOT NULL,
  
  -- Status
  ativa BOOLEAN NOT NULL DEFAULT true,
  
  -- Controle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT tipo_valido CHECK (tipo IN ('percentual', 'valor_fixo', 'frete_gratis', 'combo')),
  CONSTRAINT valor_positivo CHECK (valor > 0),
  CONSTRAINT data_valida CHECK (data_inicio < data_fim),
  CONSTRAINT tipo_percentual_max CHECK (
    CASE WHEN tipo = 'percentual' THEN valor <= 100 ELSE true END
  )
);

-- Índices
CREATE INDEX idx_promocoes_store_id ON promocoes(store_id);
CREATE INDEX idx_promocoes_ativa ON promocoes(store_id, ativa);
CREATE INDEX idx_promocoes_validade ON promocoes(store_id, data_inicio, data_fim);
```

### 2.2 Explicação dos Campos

| Campo | Tipo | Propósito | Notas |
|-------|------|----------|-------|
| `id` | UUID | Identificação única | PK |
| `store_id` | UUID | Isolamento tenant | FK, não nulo |
| `nome` | VARCHAR | Título da promo | Ex: "Black Friday 50%" |
| `descricao` | TEXT | Detalhes | Ex: "Em todos os produtos" |
| `tipo` | VARCHAR | Categoria | Enum: percentual, valor_fixo, frete_gratis, combo |
| `valor` | DECIMAL | Desconto/valor | Para percentual: 0-100, para valor: moeda |
| `data_inicio` | TIMESTAMP | Quando começa | Necessário para filtrar válidas |
| `data_fim` | TIMESTAMP | Quando termina | Necessário para filtrar válidas |
| `ativa` | BOOLEAN | Status | Soft-flag, não deleta historicamente |
| `created_at` | TIMESTAMP | Auditoria | |
| `updated_at` | TIMESTAMP | Auditoria | |

### 2.3 Tipos de Promoção

```python
# Tipos suportados inicialmente

1. percentual
   - valor: 5 → desconto de 5%
   - aplicação: (valor_produto * valor) / 100
   - exemplo: R$100 com 20% = R$80

2. valor_fixo
   - valor: 50 → desconto fixo de R$50
   - aplicação: valor_produto - valor
   - mínimo: (ordem pode ter requisito mínimo no futuro)
   - exemplo: R$100 com -R$20 = R$80

3. frete_gratis
   - valor: 0 (ignorado)
   - aplicação: frete_final = 0
   - nota: validar se order tem frete na tabela orders

4. combo
   - valor: (referência no futuro)
   - aplicação: via tabela relacionamento
   - nota: "compre X produtos e ganhe Y"
```

### 2.4 Tabela Relacionamento (Opcional): `promocao_produtos`

**Quando usar:** Se promação se aplica a produtos específicos

```sql
CREATE TABLE promocao_produtos (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promocao_id UUID NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Constraints
  UNIQUE(promocao_id, produto_id)
);

-- Índices
CREATE INDEX idx_promocao_produtos_promocao ON promocao_produtos(promocao_id);
CREATE INDEX idx_promocao_produtos_produto ON promocao_produtos(produto_id);
```

**Usar quando:**
- ✅ Promoção se aplica APENAS a alguns produtos
- ❌ Se promoção é global (aplica a todos), não criar relacionamento

**Relação:**
```
┌─────────────────────┐
│   promocoes         │
│ id (PK)             │
│ store_id            │
│ nome, tipo, valor   │
└──────────┬──────────┘
           │ 1:N
           │
┌──────────▼────────────────────┐
│ promocao_produtos              │
│ promocao_id (FK)               │
│ produto_id (FK)                │
└────────────────────────────────┘
           │ N:1
           │
┌──────────▼──────────┐
│   products          │
│ id (PK)             │
│ store_id            │
└─────────────────────┘
```

### 2.5 Preparação para Futuro

**Campos NOT-YET (podem ser adicionados):**
- `restricoes JSONB` — Ex: `{min_cart: 100, max_usages: 5}`
- `cupom VARCHAR` — Se quiser código de cupom
- `quantidade_disponivel INT` — Limitar usos totais
- `categoria_id UUID` — Aplicar a categoria inteira
- `automacao BOOLEAN` — Aplicar automaticamente vs manual
- `prioridade INT` — Se múltiplas promoções, qual aplicar

---

## FASE 3: ROW LEVEL SECURITY (RLS)

### 3.1 Políticas para `clientes`

```sql
-- Habilitar RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_select_own" ON clientes;
CREATE POLICY "clientes_select_own"
  ON clientes FOR SELECT
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 2. INSERT: Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_insert_own" ON clientes;
CREATE POLICY "clientes_insert_own"
  ON clientes FOR INSERT
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 3. UPDATE: Apenas loja proprietária
DROP POLICY IF EXISTS "clientes_update_own" ON clientes;
CREATE POLICY "clientes_update_own"
  ON clientes FOR UPDATE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 4. DELETE: Apenas loja proprietária (soft-delete recomendado)
DROP POLICY IF EXISTS "clientes_delete_own" ON clientes;
CREATE POLICY "clientes_delete_own"
  ON clientes FOR DELETE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );
```

### 3.2 Políticas para `promocoes`

```sql
-- Habilitar RLS
ALTER TABLE promocoes ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Loja proprietária (para edição) E públicas válidas (para checkout)
DROP POLICY IF EXISTS "promocoes_select_own" ON promocoes;
CREATE POLICY "promocoes_select_own"
  ON promocoes FOR SELECT
  USING (
    -- Dono: pode ver todas suas promoções
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    OR
    -- Público: pode ver promoções ativas e válidas (sem auth, ok)
    (
      ativa = true
      AND data_inicio <= NOW()
      AND data_fim >= NOW()
      AND store_id IN (SELECT id FROM stores WHERE active = true)
    )
  );

-- 2. INSERT: Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_insert_own" ON promocoes;
CREATE POLICY "promocoes_insert_own"
  ON promocoes FOR INSERT
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 3. UPDATE: Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_update_own" ON promocoes;
CREATE POLICY "promocoes_update_own"
  ON promocoes FOR UPDATE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );

-- 4. DELETE: Apenas loja proprietária
DROP POLICY IF EXISTS "promocoes_delete_own" ON promocoes;
CREATE POLICY "promocoes_delete_own"
  ON promocoes FOR DELETE
  USING (
    store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
  );
```

### 3.3 Políticas para `promocao_produtos` (se usada)

```sql
-- Habilitar RLS
ALTER TABLE promocao_produtos ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Via promoção (já filtrada por RLS em promocoes)
DROP POLICY IF EXISTS "promocao_produtos_select_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_select_own"
  ON promocao_produtos FOR SELECT
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- 2. INSERT: Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_insert_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_insert_own"
  ON promocao_produtos FOR INSERT
  WITH CHECK (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- 3. UPDATE: Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_update_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_update_own"
  ON promocao_produtos FOR UPDATE
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- 4. DELETE: Apenas admin da loja
DROP POLICY IF EXISTS "promocao_produtos_delete_own" ON promocao_produtos;
CREATE POLICY "promocao_produtos_delete_own"
  ON promocao_produtos FOR DELETE
  USING (
    promocao_id IN (
      SELECT id FROM promocoes 
      WHERE store_id = (SELECT id FROM stores WHERE user_id = auth.uid() LIMIT 1)
    )
  );
```

### 3.4 Validação RLS

**Checklist pós-criação:**

- [ ] `clientes` — RLS habilitado, 4 policies (CRUD)
- [ ] `promocoes` — RLS habilitado, 4 policies (CRUD com SELECT público)
- [ ] `promocao_produtos` — RLS habilitado, 4 policies (se usado)
- [ ] Nenhuma policy com `USING true` (antissegurança)
- [ ] Todas as policies respeitam `store_id` do usuário
- [ ] SELECT inclui validações de `active = true` onde apropriado

---

## FASE 4: DOCUMENTAÇÃO E ÍNDICES

### 4.1 Índices Resumidos

| Tabela | Índice | Propósito |
|--------|--------|----------|
| `clientes` | `store_id` | Listar clientes por loja |
| `clientes` | `(store_id, email)` | Buscar cliente por email |
| `clientes` | `(store_id, total_gasto DESC)` | Top clientes por gasto |
| `clientes` | `(store_id, ultimo_pedido DESC)` | Clientes recentes |
| `promocoes` | `store_id` | Listar promos por loja |
| `promocoes` | `(store_id, ativa)` | Promos ativas |
| `promocoes` | `(store_id, data_inicio, data_fim)` | Promos por período |
| `promocao_produtos` | `promocao_id` | Produtos de uma promo |
| `promocao_produtos` | `produto_id` | Promos de um produto |

### 4.2 Queries Típicas (Performance)

```sql
-- Query 1: Top 10 clientes por valor gasto
SELECT id, nome, total_gasto 
FROM clientes 
WHERE store_id = $1 
ORDER BY total_gasto DESC 
LIMIT 10;
-- Usa índice: (store_id, total_gasto DESC) ✅

-- Query 2: Promoções ativas agora
SELECT id, nome, tipo, valor 
FROM promocoes 
WHERE store_id = $1 
  AND ativa = true 
  AND data_inicio <= NOW() 
  AND data_fim >= NOW();
-- Usa índice: (store_id, ativa) ✅

-- Query 3: Produtos com promoção específica
SELECT p.* 
FROM products p
JOIN promocao_produtos pp ON p.id = pp.produto_id
WHERE pp.promocao_id = $1;
-- Usa índice: promocao_id ✅
```

### 4.3 Fluxos Futuros (Sem Implementar Agora)

**O que podem virar:**

1. **Tier/Segmentação**
   - Clientes "novo", "repetidor", "VIP"
   - Descontos automáticos por tier

2. **Recompra Inteligente**
   - "Próximo cliente a comprar em X dias"
   - E-mail automático com sugestão de recompra

3. **Cashback/Pontos**
   - `cliente_pontos` — Acumular pontos por compra
   - `resgate` — Usar pontos em próxima compra

4. **Cupom**
   - Gerar código único por cliente
   - Rastreamento de uso

5. **Automações**
   - Aplicar promoção automaticamente se ordem > X
   - Frete grátis acumulado (ex: a cada 3ª compra)

6. **Análise**
   - Relatórios de cliente ideal (RFM)
   - Cohort analysis por período

---

## FASE 5: MIGRATION SQL

### 5.1 Script Pronto para Aplicação

**Arquivo:** `supabase/migrations/create_clientes_promocoes.sql`

Ver arquivo separado com:
- CREATE TABLE completo
- Índices
- RLS enablement
- Policies
- Constraints

### 5.2 Passos de Aplicação

1. ✅ Revisar schema
2. ✅ Validar com time
3. ⏳ Executar em staging
4. ⏳ Testar queries
5. ⏳ Deploy em produção
6. ⏳ Monitorar performance

---

## RESUMO EXECUTIVO

### Segurança ✅
- Multi-tenant isolado por `store_id`
- RLS desde o início
- Sem acesso cruzado entre lojas
- Constraints validam dados

### Performance ✅
- Índices estratégicos
- Denormalização controlada (agregações)
- Preparado para escala

### Escalabilidade ✅
- Pronto para adicionar campos
- Estrutura suporta futuras automações
- Sem retrabalho estrutural esperado

### Simplicidade ✅
- Foco em MVP (4 tipos de promo)
- Sem complexidade desnecessária
- Preparado para evoluir incrementalmente

---

## Próximas Fases

- [ ] **Fase 5.1:** Criar script SQL com tabelas + RLS
- [ ] **Fase 5.2:** Aplicar em staging
- [ ] **Fase 5.3:** Testes de isolamento RLS
- [ ] **Fase 5.4:** Deploy em produção
- [ ] **Fase 6:** Documentação API (futuro)
- [ ] **Fase 7:** Frontend (MUCH later)

---

**Data de Revisão:** 25 de maio de 2026  
**Status:** 📋 Aprovação pendente  
**Próximo:** Criar script SQL e testar em staging
