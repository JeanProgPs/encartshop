# Relacionamentos e Fluxos — Clientes e Promoções

**Data:** 25 de maio de 2026  
**Status:** 📋 Planejamento  
**Objetivo:** Visualizar fluxos de dados e relacionamentos entre tabelas

---

## 1️⃣ DIAGRAMA DE ENTIDADES

### Versão 1: Core EncartShop

```
┌──────────────────┐
│     users        │ (Supabase auth)
│ id (PK)          │
│ email            │
└────────┬─────────┘
         │ 1:N
         │
┌────────▼──────────┐
│     stores        │
│ id (PK)           │
│ user_id (FK)      │
│ name, active      │
└────────┬──────────┘
         │ 1:N
         ├─────────────────────┬──────────────────┬──────────────────┐
         │                     │                  │                  │
    ┌────▼──────────┐  ┌──────▼────────┐  ┌─────▼──────────┐  ┌────▼──────────┐
    │    products   │  │    orders     │  │   clientes ✨  │  │  promocoes ✨  │
    │ id (PK)       │  │ id (PK)       │  │ id (PK)        │  │ id (PK)        │
    │ store_id (FK) │  │ store_id (FK) │  │ store_id (FK)  │  │ store_id (FK)  │
    │ name, price   │  │ total, email  │  │ email, nome    │  │ nome, tipo     │
    │               │  │ email_usado   │  │ total_gasto ⚡ │  │ valor, datas   │
    └───────────────┘  └───────────────┘  │ ultimo_pedido⚡│  │ ativa          │
                                           └────────────────┘  └────────────────┘
                                                  ▲                     │
                                                  │ relaciona a         │ 1:N
                                                  │ cliente             │
                                                  │ de um               │
                                                  │ pedido              │
                                                  │                     │
                                                  │            ┌────────▼──────────┐
                                                  │            │ promocao_produtos │
                                                  │            │ promocao_id (FK)  │
                                                  │            │ produto_id (FK)   │
                                                  │            └───────────────────┘
                                                  │                     ▲
                                                  │                     │
                                                  └─────────────────────┘
                                                     (futuro: cupom, 
                                                      automação aplicação)

🔑 PK = Primary Key (identificação única)
🔗 FK = Foreign Key (relacionamento)
⚡ = Campo desnormalizado (agregação para performance)
✨ = Nova tabela (não existe ainda)
```

### Versão 2: Com Detalhes de Multi-Tenant

```
┌─────────────────────────────────────────┐
│          ISOLAMENTO MULTI-TENANT        │
│      (via store_id + RLS)               │
├─────────────────────────────────────────┤
│                                         │
│  Loja A (store_id = uuid-a)            │
│  ├─ Produtos (6)                       │
│  ├─ Pedidos (12)                       │
│  ├─ Clientes (45) ✨                   │
│  └─ Promoções (3) ✨                   │
│                                         │
│  Loja B (store_id = uuid-b)            │
│  ├─ Produtos (20)                      │
│  ├─ Pedidos (8)                        │
│  ├─ Clientes (12) ✨                   │
│  └─ Promoções (5) ✨                   │
│                                         │
│  RLS Garante:                          │
│  • Loja A não vê dados da Loja B       │
│  • Clientes isolados por store_id      │
│  • Promoções isoladas por store_id     │
│                                         │
└─────────────────────────────────────────┘
```

---

## 2️⃣ FLUXOS DE DADOS

### Fluxo 1: Criar Cliente (Admin → DB)

```
Admin Interface
     │
     ▼ (POST /clientes)
┌─────────────────────────┐
│  Dados do Cliente       │
│ - nome                  │
│ - email                 │
│ - telefone              │
└────────────┬────────────┘
             │
             ▼ (com store_id + auth.uid())
        ┌──────────────┐
        │  RLS Check   │
        │ store_id == ?│ ✅ Autorizado
        └──────┬───────┘
               │
               ▼
        ┌──────────────────────────┐
        │ INSERT INTO clientes     │
        │ - id (gen_random_uuid()) │
        │ - store_id (da auth)     │
        │ - total_pedidos = 0      │
        │ - total_gasto = 0.00     │
        │ - created_at = NOW()     │
        └──────┬───────────────────┘
               │
               ▼
    ✅ Cliente criado
```

### Fluxo 2: Sincronizar Agregações (Order → Cliente)

```
Novo Pedido Criado
        │
        ▼
    ┌─────────────────────────────┐
    │ INSERT INTO orders          │
    │ - cliente_email = "x@x.com" │
    │ - total = R$ 120.00         │
    │ - store_id = uuid-a         │
    └────────────┬────────────────┘
                 │
                 ▼ (Trigger futuro)
    ┌─────────────────────────────┐
    │ SYNC: Cliente Agregações    │
    │                             │
    │ UPDATE clientes SET         │
    │  total_pedidos = COUNT(...) │
    │  total_gasto = SUM(...)     │
    │  ultimo_pedido = MAX(...)   │
    │ WHERE email = "x@x.com"     │
    │   AND store_id = uuid-a     │
    └────────────┬────────────────┘
                 │
                 ▼
    ✅ Agregações sincronizadas
       Cliente agora tem:
       - total_pedidos = 1
       - total_gasto = 120.00
       - ultimo_pedido = NOW()
```

### Fluxo 3: Aplicar Promoção (Checkout)

```
Checkout - Calcular Total
     │
     ├─→ Buscar Promoções Válidas
     │
     ▼
┌──────────────────────────────┐
│ SELECT FROM promocoes        │
│ WHERE store_id = uuid-a      │
│   AND ativa = true           │
│   AND data_inicio <= NOW()   │
│   AND data_fim >= NOW()      │
│ [RLS permite - é público]    │
└────────────┬─────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Para cada promoção:     │
    │ • percentual            │
    │ • valor_fixo            │
    │ • frete_gratis          │
    │ • combo (futuro)        │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────┐
    │ Aplicar melhor desconto │
    │ (lógica futuro)         │
    └────────────┬────────────┘
                 │
                 ▼
    ✅ Total final calculado
       (com promoção aplicada)
```

### Fluxo 4: Criar Promoção (Admin)

```
Admin Interface
     │
     ▼ (POST /promocoes)
┌─────────────────────────────┐
│ Dados da Promoção           │
│ - nome: "Black Friday 30%"  │
│ - tipo: "percentual"        │
│ - valor: 30                 │
│ - data_inicio/fim           │
│ - ativa: true               │
└────────────┬────────────────┘
             │
             ▼ (com store_id + auth.uid())
        ┌──────────────┐
        │  RLS Check   │
        │ store_id == ?│ ✅ Autorizado
        └──────┬───────┘
               │
               ▼
        ┌──────────────────────────┐
        │ INSERT INTO promocoes    │
        │ - id (gen_random_uuid()) │
        │ - store_id (da auth)     │
        │ - created_at = NOW()     │
        │ - ativa = true           │
        └──────┬───────────────────┘
               │
               ▼
    ✅ Promoção criada
       
       (Opcional: Relacionar a Produtos)
               │
               ▼
        ┌─────────────────────────┐
        │ Se apenas alguns        │
        │ produtos:               │
        │                         │
        │ INSERT INTO             │
        │ promocao_produtos       │
        │ (promocao_id, produto_id)
        └─────────────────────────┘
```

---

## 3️⃣ RELACIONAMENTOS EM DETALHE

### Relacionamento 1: stores → clientes (1:N)

```
Propriedade: UMA loja tem MUITOS clientes
Integridade: ON DELETE CASCADE (se loja deleta, clientes deletam)

Query Típica:
  SELECT * FROM clientes 
  WHERE store_id = $1
  ORDER BY total_gasto DESC;
```

### Relacionamento 2: clientes ← orders (N:1)

```
Propriedade: MUITOS pedidos referem-se a UM cliente (por email)
Integridade: Atualmente via email (não-normalizado)

Query Típica:
  SELECT o.* FROM orders o
  WHERE o.email = (SELECT email FROM clientes WHERE id = $1)
    AND o.store_id = $2;

Futuro (com FK):
  ALTER TABLE orders ADD COLUMN cliente_id UUID REFERENCES clientes(id);
```

### Relacionamento 3: stores → promocoes (1:N)

```
Propriedade: UMA loja tem MUITAS promoções
Integridade: ON DELETE CASCADE (se loja deleta, promoções deletam)

Query Típica:
  SELECT * FROM promocoes 
  WHERE store_id = $1 
    AND ativa = true
    AND data_inicio <= NOW()
    AND data_fim >= NOW();
```

### Relacionamento 4: promocoes → promocao_produtos (1:N) [Opcional]

```
Propriedade: UMA promoção pode aplicar-se a MUITOS produtos
Integridade: ON DELETE CASCADE (se promo deleta, relacionamentos deletam)

Quando usar:
  ✅ Promoção é "apenas esses 5 produtos"
  ❌ Promoção é "todos os produtos"

Query Típica:
  SELECT p.* FROM products p
  JOIN promocao_produtos pp ON p.id = pp.produto_id
  WHERE pp.promocao_id = $1;
```

---

## 4️⃣ AGREGAÇÕES E TRIGGERS

### Agregação 1: `clientes.total_pedidos`

**Propósito:** Contar quantos pedidos um cliente fez

```sql
-- Query que alimenta o campo:
SELECT COUNT(*) FROM orders 
WHERE email = clientes.email 
  AND store_id = clientes.store_id;

-- Trigger (futuro):
CREATE TRIGGER trg_sync_cliente_total_pedidos
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  UPDATE clientes SET total_pedidos = total_pedidos + 1
  WHERE email = NEW.email AND store_id = NEW.store_id;
END;

-- Quando sincronizar:
1. Ao criar pedido
2. Ao deletar pedido
3. Periodicamente (sync job)
```

### Agregação 2: `clientes.total_gasto`

**Propósito:** Somar valor total gasto por cliente

```sql
-- Query:
SELECT COALESCE(SUM(o.total), 0) FROM orders o
WHERE o.email = clientes.email 
  AND o.store_id = clientes.store_id
  AND o.status IN ('completed', 'paid');

-- Trigger (futuro):
CREATE TRIGGER trg_sync_cliente_total_gasto
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW
BEGIN
  UPDATE clientes SET total_gasto = (
    SELECT COALESCE(SUM(total), 0) FROM orders 
    WHERE email = NEW.email AND store_id = NEW.store_id
  )
  WHERE email = NEW.email AND store_id = NEW.store_id;
END;
```

### Agregação 3: `clientes.ultimo_pedido`

**Propósito:** Data do pedido mais recente

```sql
-- Query:
SELECT MAX(created_at) FROM orders 
WHERE email = clientes.email 
  AND store_id = clientes.store_id;

-- Trigger (futuro):
CREATE TRIGGER trg_sync_cliente_ultimo_pedido
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  UPDATE clientes SET ultimo_pedido = NEW.created_at
  WHERE email = NEW.email AND store_id = NEW.store_id
    AND NEW.created_at > clientes.ultimo_pedido;
END;
```

---

## 5️⃣ REGRAS DE NEGÓCIO

### Regra 1: Isolamento Multi-Tenant

```
✅ DEVE SER VERDADEIRO:
- Loja A nunca vê dados da Loja B
- Clientes de Loja A isolados de Loja B
- Promoções de Loja A isoladas de Loja B

Implementação: RLS com store_id
Validação: Testes de acesso cruzado
```

### Regra 2: Email Único por Loja

```
✅ DEVE SER VERDADEIRO:
- Uma loja não pode ter 2 clientes com mesmo email
- Mas Loja A pode ter cliente "john@x.com"
  E Loja B também

Implementação: UNIQUE(store_id, email)
Validação: Tentar criar duplicado deve falhar
```

### Regra 3: Datas de Promoção Válidas

```
✅ DEVE SER VERDADEIRO:
- data_inicio < data_fim (promoção tem duração)
- Promoção só é visível se:
  - ativa = true
  - data_inicio <= NOW()
  - data_fim >= NOW()

Implementação: CHECK constraint + RLS SELECT
Validação: Promoções expiradas não aparecem
```

### Regra 4: Tipos de Promoção Válidos

```
✅ Tipos permitidos:
- percentual (0-100)
- valor_fixo (> 0)
- frete_gratis (valor ignorado)
- combo (futuro)

Implementação: CHECK constraints
Validação: Tentar criar tipo inválido falha
```

---

## 6️⃣ PREPARAÇÃO PARA FUTURO

### O que pode crescer sem retrabalho:

```
✅ Sem mudança de schema:
- Campo "metadata JSONB" para dados customizados
- Cupom com geração por cliente (tabela cupons)
- Cashback/pontos (coluna total_pontos em clientes)
- Tier (coluna tier em clientes, ex: "silver", "gold")

⚠️ Com alterações menores:
- Recompra automática (adicionar "dias_para_recompra")
- Automações (adicionar "regra JSONB")
- Segmentação (adicionar "tags ARRAY")

🔄 Com nova tabela:
- Histórico de agregações (audit trail)
- Aplicação automática de promoção
- Cupom com rastreamento de uso
```

---

## 7️⃣ CHECKLIST DE INTEGRAÇÃO

Antes de usar Clientes e Promoções:

### Backend/API
- [ ] Endpoints CRUD para clientes
- [ ] Endpoints CRUD para promoções
- [ ] Sincronização de agregações (trigger ou job)
- [ ] Aplicação de desconto no checkout
- [ ] Testes de RLS (loja A não vê loja B)

### Frontend
- [ ] Dashboard: Listagem de clientes
- [ ] Dashboard: Criar/editar cliente
- [ ] Dashboard: Listagem de promoções
- [ ] Dashboard: Criar/editar promoção
- [ ] Checkout: Exibir promoções disponíveis
- [ ] Checkout: Calcular desconto

### Qualidade
- [ ] Testes unitários (RLS, agregações)
- [ ] Testes de integração (múltiplas lojas)
- [ ] Performance (índices, queries)
- [ ] Segurança (sem acesso cruzado)

---

## CONCLUSÃO

Relacionamentos e fluxos preparados para:
- ✅ MVP seguro e isolado
- ✅ Evolução gradual sem retrabalho
- ✅ Performance otimizada
- ✅ Multi-tenant desde o início

**Próximo:** Criar script SQL e aplicar em staging
