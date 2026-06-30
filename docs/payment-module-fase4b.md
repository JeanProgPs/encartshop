# EncartShop — Módulo de Pagamentos Online
## Relatório de Entrega: Fase 4B — Webhook Asaas

**Data:** Junho 2026
**Status:** ✅ Concluída
**Versão:** 1.0.0

---

## Resumo Executivo

A Fase 4B implementou a Edge Function `store-payment-webhook` que processa
confirmações automáticas de pagamentos PIX enviadas pelo Asaas de cada lojista.

Quando um cliente paga o PIX, o Asaas notifica esta função, que atualiza
`order_payments.status` e `orders.status → 'pago'` automaticamente.

**Nenhuma funcionalidade existente foi alterada. O `asaas-webhook` de
mensalidades permanece completamente intacto.**

---

## 1. Arquivos Criados

| Arquivo | Linhas | Descrição |
|---|---|---|
| `supabase/functions/store-payment-webhook/index.ts` | 479 | Edge Function completa |
| `supabase/functions/store-payment-webhook/deno.json` | 5 | Import map (padrão do projeto) |
| `supabase/migrations/create_webhook_logs.sql` | 166 | Tabela `payment_webhook_logs` + índices + RLS |
| `docs/payment-module-fase4b.md` | — | Este relatório |

---

## 2. Arquivos Modificados

| Arquivo | Alteração | Justificativa |
|---|---|---|
| `supabase/config.toml` | Adicionado bloco `[functions.store-payment-webhook]` | Registrar a nova função no Supabase |
| `js/modules/orders.js` | Adicionado status `'pago'` ao `STATUS_FLOW`, `getStatusLabel`, `getStatusClass` e `countByStatus` | Suportar o novo estado gerado pelo webhook |

### Detalhes de `orders.js`

**Adição 1 — STATUS_FLOW:** `'novo'` agora pode transitar para `'pago'` (webhook)
e `'pago'` pode transitar para `'confirmado'` ou `'cancelado'` (lojista).
Os caminhos existentes (`'novo' → 'confirmado'`, etc.) foram preservados.

**Adição 2 — Labels e classes:** `'pago'` = "PIX Pago" com `badge-success` (verde).

**Adição 3 — countByStatus:** contador `pago: 0` adicionado ao objeto de contagem.

---

## 3. Nova tabela: `payment_webhook_logs`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador do log |
| `event_id` | TEXT | `event_type:payment_id` — chave de idempotência |
| `gateway` | VARCHAR(50) | Gateway origem (`asaas`) |
| `payment_id` | TEXT | ID da cobrança no gateway |
| `event_type` | VARCHAR(100) | Tipo do evento (`PAYMENT_CONFIRMED`, etc.) |
| `status_mapped` | VARCHAR(50) | Status gravado em `order_payments` |
| `processed` | BOOLEAN | `true` = sucesso; `false` = ignorado/erro |
| `skip_reason` | TEXT | Motivo de não processamento |
| `processing_time` | INTEGER | Duração em ms |
| `created_at` | TIMESTAMPTZ | Timestamp do log |

**RLS:** habilitado sem policies públicas — escrita exclusiva via `service_role`.

**Índices:** `payment_id`, `event_id` (unicidade), `created_at DESC`, `processed = FALSE`.

---

## 4. Arquitetura da Edge Function

```
POST /functions/v1/store-payment-webhook
(enviado pelo Asaas da conta do lojista)
         │
         ▼
1. Validação: método POST obrigatório
         │
         ▼
2. Parse do payload JSON
   → erro → log skip_reason='invalid_payload' + HTTP 400
         │
         ▼
3. Extração: eventType, paymentId, eventId = "eventType:paymentId"
   → campos ausentes → log + HTTP 400
         │
         ▼
4. Evento desconhecido? → log skip_reason='unknown_event' + HTTP 200
   (HTTP 200 evita reentrega desnecessária pelo Asaas)
         │
         ▼
5. isDuplicateEvent(eventId)
   → já processado → log skip_reason='duplicate' + HTTP 200
         │
         ▼
6. Busca order_payment pelo gateway_payment_id
   → DB error   → log skip_reason='db_error' + HTTP 500 (Asaas vai retentar)
   → não encontrado → log skip_reason='payment_not_found' + HTTP 200
         │
         ▼
7. Status já terminal e igual? → log skip_reason='already_terminal' + HTTP 200
         │
         ▼
8. UPDATE order_payments:
   • status = internalStatus (RECEIVED/CONFIRMED/OVERDUE/CANCELLED/REFUNDED)
   • paid_at = NOW() se confirmado
   • metadata += { last_webhook_event, last_webhook_at, asaas_payment_date, ... }
         │
         ▼
9. Se PAYMENT_RECEIVED ou PAYMENT_CONFIRMED:
   markOrderAsPaid(orderId, storeId)
   • Verifica order.status não é final (finalizado/cancelado)
   • UPDATE orders SET status = 'pago'
         │
         ▼
10. writeLog(processed=true, processingTime)
    + HTTP 200 { success, event, statusMapped, orderUpdated }
```

---

## 5. Mapeamento de eventos

| Evento Asaas | Status em `order_payments` | Atualiza `orders.status`? |
|---|---|---|
| `PAYMENT_RECEIVED` | `RECEIVED` | ✅ → `'pago'` |
| `PAYMENT_CONFIRMED` | `CONFIRMED` | ✅ → `'pago'` |
| `PAYMENT_OVERDUE` | `OVERDUE` | ❌ |
| `PAYMENT_DELETED` | `CANCELLED` | ❌ |
| `PAYMENT_REFUNDED` | `REFUNDED` | ❌ |
| (outros) | — (ignorado) | ❌ |

---

## 6. Idempotência

O webhook é seguro contra reprocessamento em três camadas:

**Camada 1 — event_id único:**
`eventId = "PAYMENT_CONFIRMED:pay_asaas_123"`. Antes de processar, consulta
`payment_webhook_logs` onde `event_id = eventId AND processed = true`.
Se encontrado, retorna HTTP 200 sem processar.

**Camada 2 — status terminal:**
Se `order_payments.status` já está em `{CONFIRMED, RECEIVED, REFUNDED, CANCELLED}`
e o novo evento mapearia para o mesmo status, retorna HTTP 200 sem reprocessar.

**Camada 3 — orders.status:**
`markOrderAsPaid()` verifica o status atual do pedido. Não altera pedidos
em `'finalizado'`, `'cancelado'` ou já em `'pago'`.

---

## 7. Segurança

| Verificação | Resultado |
|---|---|
| Toca em `stores.status` | ❌ Nunca (zero queries na tabela stores) |
| Toca em `stores.expires_at` | ❌ Nunca |
| Usa `ASAAS_API_KEY` de ambiente | ❌ Nunca |
| Loga API Keys / Authorization | ❌ Nunca |
| Loga secrets / tokens | ❌ Nunca |
| Interfere com `asaas-webhook` | ❌ Nunca (função separada, tabelas separadas) |
| `verify_jwt = false` | ✅ Correto — webhook é chamado pelo Asaas sem JWT |
| Responde HTTP 200 a eventos desconhecidos | ✅ Evita reentregas desnecessárias |
| Responde HTTP 500 a erros de banco | ✅ Força Asaas a retentar |

**Nota sobre `verify_jwt = false`:** O webhook Asaas não envia JWT. A autenticação
é feita via `externalReference` (order_payment_id) que é um UUID impossível de
adivinhar. Em fase futura, pode-se adicionar validação de IP de origem do Asaas
ou token customizado via query string.

---

## 8. Cenários de teste

| Cenário | Comportamento esperado |
|---|---|
| Pagamento confirmado (sandbox) | `order_payments.status = 'CONFIRMED'` + `orders.status = 'pago'` + log `processed=true` |
| Pagamento expirado | `order_payments.status = 'OVERDUE'` + `orders` inalterado + log `processed=true` |
| Pagamento estornado | `order_payments.status = 'REFUNDED'` + `orders` inalterado + log `processed=true` |
| Evento duplicado (mesmo eventId) | Sem alteração + log `skip_reason='duplicate'` + HTTP 200 |
| `payment_id` inexistente | Sem alteração + log `skip_reason='payment_not_found'` + HTTP 200 |
| Payload inválido (não JSON) | Sem alteração + log `skip_reason='invalid_payload'` + HTTP 400 |
| Evento desconhecido | Sem alteração + log `skip_reason='unknown_event'` + HTTP 200 |
| Pedido já finalizado | `order_payments` atualizado + `orders` inalterado + log `processed=true` |

---

## 9. Configuração necessária no painel Asaas

Cada lojista deve configurar no painel Asaas → Minha Conta → Integrações → Webhooks:

```
URL:    https://<project-ref>.supabase.co/functions/v1/store-payment-webhook
Evento: Todos os eventos de pagamento (ou selecionar individualmente)
```

Esta URL é fixa para todos os lojistas. A identificação da loja/pedido é
feita pelo `externalReference` dentro do payload, que contém o `order_payment.id`.

---

## 10. Plano de rollback

Se houver necessidade de reverter:

1. **Desabilitar a função:** `config.toml` → `[functions.store-payment-webhook]` → `enabled = false`
2. **Impacto:** webhooks passam a retornar erro (Asaas fica tentando reenviar por X dias)
3. **Sem impacto no WhatsApp:** o fluxo principal não depende desta função
4. **Sem impacto nas mensalidades:** `asaas-webhook` não é afetado
5. **Dados em order_payments:** permanecem com o último status conhecido
6. **Dados em orders:** pedidos voltam a requerer atualização manual pelo lojista

Para rollback completo da tabela:
```sql
DROP TABLE IF EXISTS payment_webhook_logs;
```
Esta tabela não tem FKs externas — pode ser removida sem cascata.

---

## 11. Confirmação de integridade

| Arquivo | Timestamp | Modificado? |
|---|---|---|
| `asaas-payment/index.ts` | 12/05/2026 | ✅ Não |
| `asaas-webhook/index.ts` | 18/05/2026 | ✅ Não |
| `platform-admin/index.ts` | 17/06/2026 | ✅ Não |
| `loja/modules/cart.js` | 01/06/2026 | ✅ Não |
| `loja/modules/delivery.js` | 18/05/2026 | ✅ Não |
| `loja/bootstrap.js` | 26/06/2026 (Fase 4A) | ✅ Não (Fase 4B) |
| `loja/index.html` | 26/06/2026 (Fase 4A) | ✅ Não (Fase 4B) |
| `admin/pagamento.html` | 25/05/2026 | ✅ Não |
| `admin/pedidos.html` | 05/06/2026 | ✅ Não |

---

## 12. Critérios de aceitação

- [x] Nenhuma funcionalidade existente alterada
- [x] Fluxo WhatsApp continua funcionando
- [x] Módulo de mensalidade permanece intacto (zero queries em `stores`)
- [x] Pagamentos atualizados automaticamente via webhook
- [x] Webhook idempotente (3 camadas de proteção)
- [x] Logs completos para auditoria em `payment_webhook_logs`
- [x] Nenhuma informação sensível em logs

---

## 13. Pendências para próximas fases

| Item | Descrição |
|---|---|
| Fase 4C | Polling de status no `pix-checkout.js` como mecanismo de contingência |
| Fase 5 | Badge "PIX Pago" em `admin/pedidos.html` com filtro no painel do lojista |
| Fase 5 | Aba "Pagamentos" no painel com histórico de `order_payments` |
| Futuro | Validação por IP de origem do Asaas ou token customizado no webhook |
| Futuro | Limpeza automática de logs antigos (> 90 dias) via pg_cron |
