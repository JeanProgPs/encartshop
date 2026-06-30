# Edge Function: store-payment

## Status
> **Fase 1 — Infraestrutura:** estrutura criada, implementação pendente.  
> Esta pasta existe apenas para reservar o namespace e documentar o contrato da função.  
> Nenhum código funcional está presente. Nenhuma funcionalidade existente é afetada.

---

## Responsabilidade

Intermediar a comunicação entre o frontend da loja pública e a API Asaas **do lojista**.

Esta função é o único ponto do sistema que acessa a `asaas_api_key` da loja.  
Ela a lê do banco via `service_role` (nunca exposta ao frontend) e a usa  
para criar cobranças diretamente na conta Asaas do lojista.

**O dinheiro vai para a conta do lojista — o EncartShop não intermedia valores.**

### Diferença crítica em relação à `asaas-payment` existente

| | `asaas-payment` (existente) | `store-payment` (novo) |
|---|---|---|
| **Finalidade** | Cobrança de mensalidade da plataforma | Cobrança de pedidos dos clientes |
| **Chave Asaas** | `ASAAS_API_KEY` (env da plataforma) | `store_asaas_api_key` (do banco, por loja) |
| **Destinatário** | Conta EncartShop | Conta do lojista |
| **Tabela atualizada** | `stores.status`, `stores.expires_at` | `order_payments` |
| **Esta função toca em `stores.status`?** | Sim (para ativar/renovar) | ❌ Nunca |

---

## Endpoints (Actions)

A função receberá um `POST` com `Content-Type: application/json`.  
O campo `action` determina o comportamento.

---

### `createCharge`

Cria uma cobrança no Asaas da loja e registra em `order_payments`.

**Request Body:**
```json
{
  "action": "createCharge",
  "storeId": "uuid-da-loja",
  "orderId": "uuid-do-pedido",
  "customerName": "João da Silva",
  "customerDocument": "123.456.789-00",
  "value": 89.90,
  "billingType": "PIX",
  "dueDate": "2026-06-27"
}
```

**Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `action` | string | ✅ | Sempre `"createCharge"` |
| `storeId` | UUID | ✅ | ID da loja |
| `orderId` | UUID | ✅ | ID do pedido em `orders` |
| `customerName` | string | ✅ | Nome do comprador |
| `customerDocument` | string | ❌ | CPF ou CNPJ (necessário no primeiro PIX via Asaas) |
| `value` | number | ✅ | Valor em reais (ex: `89.90`) |
| `billingType` | string | ✅ | `"PIX"` \| `"BOLETO"` \| `"CREDIT_CARD"` |
| `dueDate` | string | ❌ | Data de vencimento `YYYY-MM-DD`. Padrão: D+1 |

**Response (sucesso):**
```json
{
  "success": true,
  "orderPaymentId": "uuid-gerado",
  "gatewayPaymentId": "pay_asaas_id",
  "billingType": "PIX",
  "status": "PENDING",
  "pixCode": "00020126...",
  "qrCode": "base64_da_imagem_png",
  "paymentUrl": "https://www.asaas.com/c/...",
  "dueDate": "2026-06-27"
}
```

**Response (erro):**
```json
{
  "success": false,
  "error": "Descrição do erro",
  "code": "INVALID_API_KEY"
}
```

**Fluxo interno:**
1. Valida JWT do usuário autenticado (lojista)
2. Busca `store_payment_settings` via `service_role` (para ler `asaas_api_key`)
3. Verifica `payment_enabled = true`
4. Cria ou reutiliza customer no Asaas da loja
5. Cria cobrança PIX/Boleto na API Asaas com `externalReference = order_payment.id`
6. Salva registro em `order_payments` com `status = 'PENDING'`
7. Retorna QR Code e dados de pagamento

---

### `getChargeStatus`

Consulta o status atual de uma cobrança no Asaas da loja.  
Usado pelo frontend para polling enquanto o cliente aguarda confirmação do PIX.

**Request Body:**
```json
{
  "action": "getChargeStatus",
  "storeId": "uuid-da-loja",
  "orderPaymentId": "uuid-do-order-payment"
}
```

**Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `action` | string | ✅ | Sempre `"getChargeStatus"` |
| `storeId` | UUID | ✅ | ID da loja (para validação de acesso) |
| `orderPaymentId` | UUID | ✅ | ID em `order_payments` |

**Response (sucesso):**
```json
{
  "success": true,
  "orderPaymentId": "uuid-do-order-payment",
  "status": "CONFIRMED",
  "paidAt": "2026-06-26T14:32:00Z"
}
```

**Fluxo interno:**
1. Busca `order_payments` verificando que `store_id` pertence ao usuário autenticado
2. Busca status atualizado na API Asaas da loja
3. Atualiza `order_payments.status` se mudou
4. Retorna status atual

---

### `cancelCharge`

Cancela uma cobrança em aberto (`PENDING` ou `OVERDUE`).

**Request Body:**
```json
{
  "action": "cancelCharge",
  "storeId": "uuid-da-loja",
  "orderPaymentId": "uuid-do-order-payment"
}
```

**Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `action` | string | ✅ | Sempre `"cancelCharge"` |
| `storeId` | UUID | ✅ | ID da loja |
| `orderPaymentId` | UUID | ✅ | ID em `order_payments` |

**Response (sucesso):**
```json
{
  "success": true,
  "orderPaymentId": "uuid-do-order-payment",
  "status": "CANCELLED"
}
```

---

### `validateApiKey`

Valida se a API Key configurada pelo lojista está correta.  
Usado na tela de configurações ao salvar a chave.

**Request Body:**
```json
{
  "action": "validateApiKey",
  "storeId": "uuid-da-loja",
  "apiKey": "aact_...",
  "environment": "sandbox"
}
```

**Response (sucesso):**
```json
{
  "success": true,
  "valid": true,
  "accountName": "Nome da Conta Asaas"
}
```

**Response (chave inválida):**
```json
{
  "success": true,
  "valid": false,
  "error": "Chave inválida ou sem permissão"
}
```

---

## Autenticação

- Requer JWT válido do Supabase Auth (`Authorization: Bearer <token>`)
- O lojista deve ser dono da loja (`stores.user_id = auth.uid()`)
- A `asaas_api_key` nunca é enviada pelo frontend — apenas lida do banco via `service_role`

---

## Variáveis de Ambiente Necessárias (Fase 2)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (injetada automaticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para leitura da api_key (injetada automaticamente) |

> Não requer `ASAAS_API_KEY` de ambiente — usa a chave do banco por loja.

---

## Segurança

- `asaas_api_key` nunca retornada ao frontend
- Validação de `store_id` vs `auth.uid()` em todas as actions
- Cobrança criada com `externalReference = order_payment.id` para rastreabilidade no webhook
- Nunca modifica `stores.status`, `stores.expires_at` ou qualquer campo de assinatura
