# EncartShop — Módulo de Pagamentos Online
## Relatório de Entrega: Fase 3B — Geração de Cobrança PIX

**Data:** Junho 2026
**Status:** ✅ Concluída
**Versão:** 1.0.0

---

## Resumo Executivo

A Fase 3B expandiu a Edge Function `store-payment` com a action `createPixCharge`
e introduziu uma camada de abstração (`PaymentProvider` / `AsaasProvider`) que
concentra toda a comunicação com o Asaas.

O resultado é uma API pronta para ser consumida no checkout (Fase 4).
**Nenhum fluxo existente foi alterado. Nenhuma cobrança é criada automaticamente.**

---

## 1. Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `docs/payment-module-fase3b.md` | Este relatório |

---

## 2. Arquivos Modificados

| Arquivo | Alterações | Justificativa |
|---|---|---|
| `supabase/functions/store-payment/index.ts` | Reescrito com arquitetura em camadas | Adicionar `createPixCharge` + `PaymentProvider` |
| `js/modules/payment.js` | `OrderPaymentAPI.createCharge()` implementado | Conectar ao backend real (Fase 3B) |

### Escopo das alterações em `index.ts`

O arquivo passou de ~260 linhas (Fase 3A) para 711 linhas (Fase 3B).
O handler `validateApiKey` foi **preservado integralmente** — extraído para
a função `handleValidateApiKey` que mantém comportamento 100% idêntico à Fase 3A.

---

## 3. Arquitetura implementada

### Camadas

```
Deno.serve()  ← entrada HTTP, autenticação, RLS, roteamento
     │
     ├── handleValidateApiKey()   (Fase 3A, preservado)
     └── handleCreatePixCharge()  (Fase 3B, novo)
              │
              ▼
       createProvider(settings)   ← factory, ponto de extensão
              │
              ▼
       AsaasProvider (implements PaymentProvider)
              │
              ├── validateCredentials() → GET /myAccount
              ├── ensureCustomer()      → GET /customers?cpfCnpj + POST /customers
              └── createPixCharge()     → POST /payments + GET /payments/{id}/pixQrCode
```

### Interface `PaymentProvider`

```typescript
interface PaymentProvider {
  validateCredentials(): Promise<string>
  ensureCustomer(customer: CustomerInput): Promise<string>
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>
}
```

Para adicionar Mercado Pago, PagBank ou Stripe:
1. Criar `class MercadoPagoProvider implements PaymentProvider`
2. Adicionar `case 'mercadopago': return new MercadoPagoProvider(...)` na factory
3. Zero alterações no router ou nas actions

---

## 4. Fluxo da action `createPixCharge`

```
POST /functions/v1/store-payment
{ action: "createPixCharge", storeId, orderId?, customer, amount, description?, dueDate? }
         │
         ▼
1. Valida JWT + RLS (usuário é dono da loja)
         │
         ▼
2. Valida campos: customer.name, amount > 0, amount >= 1.00
         │
         ▼
3. fetchSettings() via service_role → store_payment_settings
         │
         ├── sem settings    → { success: false, code: "NO_SETTINGS" }
         ├── sem api_key     → { success: false, code: "NO_API_KEY" }
         ├── disabled        → { success: false, code: "GATEWAY_DISABLED" }
         └── PIX não aceito  → { success: false, code: "PIX_NOT_ENABLED" }
         │
         ▼
4. createProvider(settings) → AsaasProvider(apiKey, env)
         │
         ▼
5. ensureCustomer() → GET /customers?cpfCnpj (localiza existente)
                   → POST /customers (cria novo se necessário)
         │
         ▼
6. createPixCharge() → POST /payments (cria cobrança PIX)
                    → GET /payments/{id}/pixQrCode (busca QR Code)
         │
         ▼
7. INSERT em order_payments via service_role
   Campos salvos: gateway_payment_id, pix_code, qr_code, payment_url,
                  status, amount, billing_type, metadata, customer_*
         │
         ▼
8. Resposta ao frontend (sem api_key, sem access_token):
   { success, orderPaymentId, paymentId, invoiceUrl, pixCode,
     qrCode, expirationDate, status, amount, billingType }
```

---

## 5. Campos salvos em `order_payments`

| Campo | Origem |
|---|---|
| `store_id` | storeId do body |
| `order_id` | orderId do body (nullable) |
| `gateway` | `store_payment_settings.payment_provider` |
| `gateway_payment_id` | `payment.id` retornado pelo Asaas |
| `billing_type` | `'PIX'` (fixo nesta action) |
| `amount` | `payment.value` retornado pelo Asaas |
| `status` | `payment.status` retornado pelo Asaas |
| `payment_url` | `payment.invoiceUrl` |
| `pix_code` | `pixQrCode.payload` |
| `qr_code` | `pixQrCode.encodedImage` (base64) |
| `due_date` | `pixQrCode.expirationDate` |
| `customer_name` | `customer.name` do body |
| `customer_document` | `customer.document` sanitizado (só dígitos) |
| `customer_email` | `customer.email` do body |
| `customer_phone` | `customer.phone` do body |
| `metadata` | `{ gateway_payment_id, asaas_customer_id, environment, created_at }` |

A tabela `orders` **não é alterada** nesta fase.

---

## 6. Tratamento de erros implementado

| Cenário | Código | Mensagem |
|---|---|---|
| customer.name ausente | `MISSING_CUSTOMER_NAME` | "customer.name obrigatório." |
| amount inválido ou zero | `INVALID_AMOUNT` | "amount deve ser número positivo." |
| amount < R$ 1,00 | `AMOUNT_TOO_LOW` | "Valor mínimo para cobrança é R$ 1,00." |
| Sem configuração salva | `NO_SETTINGS` | "Pagamento online não configurado." |
| Sem API Key | `NO_API_KEY` | "API Key não configurada." |
| Gateway desabilitado | `GATEWAY_DISABLED` | "Pagamento online está desabilitado." |
| PIX não habilitado | `PIX_NOT_ENABLED` | "PIX não está habilitado para esta loja." |
| API Key inválida | `INVALID_API_KEY` | "API Key inválida ou sem permissão." |
| Erro de validação Asaas | `ASAAS_VALIDATION_ERROR` | Mensagem do Asaas |
| Timeout | `ASAAS_TIMEOUT` | "Tempo limite excedido." |
| Asaas indisponível | `ASAAS_UNAVAILABLE` | "Asaas temporariamente indisponível." |
| Falha ao salvar no banco | warning parcial | Cobrança criada, registro interno falhou |

O caso de falha ao salvar no banco é tratado com resiliência:
a cobrança já foi criada no Asaas e o cliente pode pagar.
O sistema retorna `success: true` com `warning` para que o frontend
possa informar o lojista sem bloquear a experiência do cliente.

---

## 7. Cenários de teste

### Como testar via `curl` ou Supabase Dashboard

```bash
# validateApiKey (Fase 3A — preservada)
curl -X POST https://<ref>.supabase.co/functions/v1/store-payment \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"action":"validateApiKey","storeId":"<uuid>"}'

# createPixCharge — sucesso esperado (sandbox)
curl -X POST https://<ref>.supabase.co/functions/v1/store-payment \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "createPixCharge",
    "storeId": "<uuid>",
    "orderId": "<uuid-do-pedido>",
    "customer": { "name": "João da Silva", "document": "12345678901" },
    "amount": 89.90,
    "description": "Pedido #XYZ"
  }'
```

### Cenários validados pela lógica

| Cenário | Resultado esperado |
|---|---|
| Loja sem API Key | `{ success: false, code: "NO_API_KEY" }` |
| Gateway desabilitado | `{ success: false, code: "GATEWAY_DISABLED" }` |
| amount = 0 | `{ success: false, code: "INVALID_AMOUNT" }` |
| amount = 0.50 | `{ success: false, code: "AMOUNT_TOO_LOW" }` |
| customer sem nome | `{ success: false, code: "MISSING_CUSTOMER_NAME" }` |
| API Key sandbox válida, amount válido | `{ success: true, orderPaymentId, pixCode, qrCode, ... }` |
| Persistência em order_payments | INSERT com todos os campos preenchidos |

---

## 8. Segurança

| Verificação | Resultado |
|---|---|
| `asaas_api_key` logada | ❌ Nunca |
| `asaas_api_key` retornada ao frontend | ❌ Nunca |
| `access_token` / headers logados | ❌ Nunca |
| `stores.status` ou `stores.expires_at` alterados | ❌ Nunca |
| Tabela `orders` alterada | ❌ Nunca |
| `ASAAS_API_KEY` de ambiente usado | ❌ Nunca |
| `asaas-payment` ou `asaas-webhook` tocados | ❌ Nunca |
| Validação de ownership (RLS) | ✅ Sempre |
| Timeout com AbortController | ✅ 10 segundos |

---

## 9. Evidências de integridade

| Arquivo | Status |
|---|---|
| `asaas-payment/index.ts` (12/05) | ✅ Inalterado |
| `asaas-webhook/index.ts` (18/05) | ✅ Inalterado |
| `platform-admin/index.ts` (17/06) | ✅ Inalterado |
| `cart.js` | ✅ Inalterado |
| `bootstrap.js` | ✅ Inalterado |
| `api.js` | ✅ Inalterado |
| `orders.js` | ✅ Inalterado |
| `admin/pedidos.html` | ✅ Inalterado |
| `admin/pagamento.html` | ✅ Inalterado |

---

## 10. Pendências para próximas fases

| Fase | Descrição |
|---|---|
| Fase 3C | Actions `getChargeStatus` e `cancelCharge` na Edge Function |
| Fase 3D | Edge Function `store-payment-webhook` — processar confirmações |
| Fase 4 | Checkout com pagamento online: bifurcação em `cart.js` |
| Fase 5 | Badge de status PIX em `admin/pedidos.html` |
