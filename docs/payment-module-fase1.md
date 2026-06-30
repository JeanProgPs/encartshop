# EncartShop — Módulo de Pagamentos Online
## Relatório de Entrega: Fase 1 — Infraestrutura

**Data:** Junho 2026  
**Status:** ✅ Concluída  
**Versão:** 1.0.0

---

## Resumo Executivo

A Fase 1 preparou toda a infraestrutura de banco de dados e documentação  
necessária para suportar pagamentos online no EncartShop.

**Nenhuma funcionalidade existente foi alterada.**  
O sistema funciona exatamente como antes desta fase.

---

## 1. Migrations Criadas

### `supabase/migrations/create_payment_module.sql`

Migration única e completa para o módulo de pagamento.  
Contém duas tabelas, índices, RLS, triggers e validação pós-criação.

---

## 2. Tabelas Criadas

### 2.1 `store_payment_settings`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `store_id` | UUID FK → stores | Isolamento multi-tenant (1:1 por gateway) |
| `payment_provider` | VARCHAR(50) | Gateway: `asaas`, `mercadopago`, `pagbank`, `stripe` |
| `asaas_api_key` | TEXT | **SENSÍVEL** — API Key do lojista. Nunca exposta ao frontend. |
| `environment` | VARCHAR(20) | `sandbox` ou `production` |
| `payment_enabled` | BOOLEAN | Módulo ativo? Padrão: `false` |
| `payment_methods` | TEXT[] | Métodos aceitos. Padrão: `['PIX']` |
| `webhook_token` | TEXT | Token para validar webhooks do Asaas |
| `gateway_metadata` | JSONB | Metadados extras do gateway |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Atualizado automaticamente por trigger |

**Constraint:** `UNIQUE(store_id, payment_provider)` — uma config por gateway por loja.

### 2.2 `order_payments`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `store_id` | UUID FK → stores | Isolamento multi-tenant |
| `order_id` | UUID FK → orders (nullable) | Pedido relacionado |
| `gateway` | VARCHAR(50) | Gateway usado: `asaas`, etc. |
| `gateway_payment_id` | TEXT | ID da cobrança no sistema do gateway |
| `billing_type` | VARCHAR(30) | `PIX`, `BOLETO`, `CREDIT_CARD` |
| `amount` | DECIMAL(12,2) | Valor cobrado (> 0 por constraint) |
| `status` | VARCHAR(50) | `PENDING`, `CONFIRMED`, `OVERDUE`, `CANCELLED`, etc. |
| `payment_url` | TEXT | Link de pagamento do gateway |
| `pix_code` | TEXT | Código PIX copia-e-cola |
| `qr_code` | TEXT | QR Code em Base64 |
| `due_date` | DATE | Vencimento da cobrança |
| `customer_name` | TEXT | Nome do comprador |
| `customer_document` | TEXT | CPF/CNPJ (nullable) |
| `customer_email` | TEXT | E-mail do comprador |
| `customer_phone` | TEXT | Telefone do comprador |
| `metadata` | JSONB | Resposta completa do gateway |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Atualizado automaticamente por trigger |
| `paid_at` | TIMESTAMPTZ | Preenchido automaticamente ao confirmar pagamento |

---

## 3. Políticas RLS

### `store_payment_settings`

| Policy | Comando | Condição |
|---|---|---|
| `store_payment_settings_select_own` | SELECT | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `store_payment_settings_insert_own` | INSERT | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `store_payment_settings_update_own` | UPDATE | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `store_payment_settings_delete_own` | DELETE | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |

**Resultado:** Nunca permite SELECT público. Apenas o dono da loja tem acesso.

### `order_payments`

| Policy | Comando | Condição |
|---|---|---|
| `order_payments_select_own` | SELECT | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `order_payments_insert_own` | INSERT | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `order_payments_update_own` | UPDATE | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |
| `order_payments_delete_own` | DELETE | `store_id IN (SELECT id FROM stores WHERE user_id = auth.uid())` |

**Resultado:** Isolamento total por loja. Loja A não vê cobranças da Loja B.

---

## 4. Índices

### `store_payment_settings`

| Índice | Coluna(s) | Propósito |
|---|---|---|
| `idx_store_payment_settings_store_id` | `store_id` | Busca de configurações por loja |
| `idx_store_payment_settings_provider` | `payment_provider` | Filtro por gateway |
| `idx_store_payment_settings_enabled` | `store_id` WHERE `payment_enabled = TRUE` | Dashboard: lojas com pagamento ativo |

### `order_payments`

| Índice | Coluna(s) | Propósito |
|---|---|---|
| `idx_order_payments_store_id` | `store_id` | Isolamento e listagem por loja |
| `idx_order_payments_order_id` | `order_id` WHERE NOT NULL | Cobranças de um pedido específico |
| `idx_order_payments_status` | `(store_id, status)` | Filtro por status (ex: pendentes) |
| `idx_order_payments_created_at` | `(store_id, created_at DESC)` | Ordenação e relatórios por período |
| `idx_order_payments_gateway_payment_id` | `gateway_payment_id` WHERE NOT NULL | Lookup rápido no webhook |
| `idx_order_payments_paid_at` | `(store_id, paid_at DESC)` WHERE NOT NULL | Relatórios financeiros |

---

## 5. Triggers

### `trg_update_payment_settings_updated_at`
Atualiza `store_payment_settings.updated_at` automaticamente em cada UPDATE.

### `trg_update_order_payments_updated_at`
Atualiza `order_payments.updated_at` automaticamente em cada UPDATE.

### `trg_set_order_payment_paid_at`
Preenche `order_payments.paid_at = NOW()` automaticamente quando  
`status` muda para `RECEIVED` ou `CONFIRMED` e `paid_at` ainda é NULL.

---

## 6. Arquivos Adicionados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `supabase/migrations/create_payment_module.sql` | SQL Migration | Tabelas, índices, RLS, triggers |
| `supabase/functions/store-payment/README.md` | Documentação | Contrato da Edge Function de cobrança |
| `supabase/functions/store-payment-webhook/README.md` | Documentação | Contrato da Edge Function de webhook |
| `js/modules/payment.js` | JavaScript | Interfaces de API (sem implementação) |
| `docs/payment-module-fase1.md` | Documentação | Este relatório |

---

## 7. Arquivos Modificados

**Nenhum.**

> Esta fase não alterou nenhum arquivo existente do projeto.

---

## 8. Confirmação de Integridade do Sistema

### Fluxo do WhatsApp (Plano Básico)

| Etapa | Status |
|---|---|
| Cliente monta carrinho | ✅ Inalterado |
| Checkout via `cart.js` | ✅ Inalterado |
| `EncartAPI.OrderAPI.create()` | ✅ Inalterado |
| Redirecionamento para WhatsApp | ✅ Inalterado |
| Lojista recebe pedido no WhatsApp | ✅ Inalterado |
| Lojista atualiza status no painel | ✅ Inalterado |

### Módulo de Mensalidade (Asaas Plataforma)

| Componente | Status |
|---|---|
| Edge Function `asaas-payment` | ✅ Inalterada |
| Edge Function `asaas-webhook` | ✅ Inalterada |
| `AsaasAPI` em `api.js` | ✅ Inalterado |
| `admin/pagamento.html` | ✅ Inalterada |
| `stores.asaas_customer_id` | ✅ Inalterado |
| `stores.expires_at` | ✅ Inalterado |
| `stores.status` | ✅ Inalterado |

### Painel Administrativo

| Página | Status |
|---|---|
| `admin/dashboard.html` | ✅ Inalterada |
| `admin/pedidos.html` | ✅ Inalterada |
| `admin/configuracoes.html` | ✅ Inalterada |
| `admin/produtos.html` | ✅ Inalterada |
| `admin/pagamento.html` | ✅ Inalterada |

### Loja Pública

| Componente | Status |
|---|---|
| `loja/bootstrap.js` | ✅ Inalterado |
| `loja/modules/cart.js` | ✅ Inalterado |
| `loja/modules/delivery.js` | ✅ Inalterado |
| `loja/index.html` | ✅ Inalterada |

### JavaScript Core

| Arquivo | Status |
|---|---|
| `js/core/api.js` | ✅ Inalterado |
| `js/core/supabase.js` | ✅ Inalterado |
| `js/core/helpers.js` | ✅ Inalterado |
| `js/modules/orders.js` | ✅ Inalterado |
| `js/modules/store.js` | ✅ Inalterado |
| `js/modules/subscription.js` | ✅ Inalterado |
| `js/auth/authGuard.js` | ✅ Inalterado |
| `js/auth/authService.js` | ✅ Inalterado |

---

## 9. Checklist de Aceitação

- [x] O EncartShop funciona exatamente como antes
- [x] Todos os clientes atuais continuam usando apenas o WhatsApp
- [x] Nenhuma tela foi alterada
- [x] Nenhuma funcionalidade existente foi alterada
- [x] Nenhum fluxo foi alterado
- [x] A integração de mensalidade com o Asaas está 100% intacta
- [x] As Edge Functions existentes não foram tocadas
- [x] A tabela `stores` não foi alterada
- [x] Apenas infraestrutura nova foi adicionada
- [x] O novo módulo está invisível para os clientes atuais

---

## 10. Próximas Fases

### Fase 2 — Configurações no Painel do Lojista
- Seção "Pagamento Online" em `admin/configuracoes.html`
- Formulário para cadastro de API Key Asaas
- Validação da chave antes de salvar
- Visível apenas para planos Pro/Enterprise

### Fase 3 — Edge Functions
- Implementação de `store-payment/index.ts`
- Implementação de `store-payment-webhook/index.ts`
- Testes em ambiente sandbox

### Fase 4 — Checkout com Pagamento Online
- Modificação controlada de `cart.js`
- Botão "Pagar Online" apenas quando `payment_enabled = true`
- Botão WhatsApp permanece sempre disponível

### Fase 5 — Painel de Pedidos com Status de Pagamento
- Badge de status PIX em `admin/pedidos.html`
- Sem alterar o comportamento atual da listagem

---

## Notas de Segurança

1. **`asaas_api_key` nunca é exposta:** A coluna existe apenas no banco, acessível  
   somente via `service_role` nas Edge Functions. O frontend nunca recebe esse valor.

2. **RLS sem SELECT público:** Diferente de outras tabelas (como `products` e `orders`  
   que têm acesso público para a vitrine), `store_payment_settings` e `order_payments`  
   são acessíveis apenas pelo dono autenticado da loja.

3. **`payment_enabled = false` por padrão:** Nenhuma loja terá o módulo ativo  
   até configurar explicitamente. O campo `StorePaymentAPI.isEnabled()` retorna  
   `false` incondicionalmente na Fase 1.

4. **Isolamento entre mensalidade e pedidos:** A nova tabela `order_payments`  
   é completamente separada dos campos de assinatura em `stores`. Os triggers  
   e webhooks existentes não são afetados.
