# Edge Function: store-payment-webhook

## Status
> **Fase 1 — Infraestrutura:** estrutura criada, implementação pendente.  
> Esta pasta existe apenas para reservar o namespace e documentar o contrato da função.  
> Nenhum código funcional está presente. Nenhuma funcionalidade existente é afetada.

---

## Responsabilidade

Receber e processar notificações (webhooks) enviadas pelo Asaas **de cada loja** quando  
o status de uma cobrança de pedido muda.

Ao confirmar um pagamento, esta função:
1. Atualiza `order_payments.status` → `CONFIRMED`
2. Preenche `order_payments.paid_at`
3. Atualiza `orders.status` → `confirmado`

**Esta função NUNCA toca em:**
- `stores.status`
- `stores.expires_at`
- `stores.asaas_payment_id`
- `stores.asaas_pix_code`
- `stores.asaas_pix_qr_code`
- Qualquer campo relacionado à mensalidade da plataforma

### Diferença crítica em relação à `asaas-webhook` existente

| | `asaas-webhook` (existente) | `store-payment-webhook` (novo) |
|---|---|---|
| **Finalidade** | Confirmar pagamento de mensalidade | Confirmar pagamento de pedido |
| **Identifica por** | `asaas_payment_id` em `stores` | `externalReference` em `order_payments` |
| **Atualiza** | `stores.status` + `stores.expires_at` | `order_payments.status` + `orders.status` |
| **Toca em stores?** | Sim (ativa/renova a loja) | ❌ Nunca |
| **Webhook configurado em** | Conta Asaas da plataforma | Conta Asaas de **cada lojista** |

---

## URL do Webhook

Cada lojista deverá configurar a URL abaixo no painel Asaas da conta dele:

```
https://<project-ref>.supabase.co/functions/v1/store-payment-webhook
```

A identificação da loja/cobrança é feita pelo campo `externalReference` dentro do payload  
do webhook, que contém o `id` do registro em `order_payments`.

---

## Eventos Processados

### `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`

Disparado quando o PIX é reconhecido (received) ou confirmado (confirmed) pelo Asaas.

**Ação:**
```
UPDATE order_payments
  SET status = 'CONFIRMED', paid_at = NOW()
  WHERE id = <externalReference>

UPDATE orders
  SET status = 'confirmado'
  WHERE id = order_payments.order_id
```

---

### `PAYMENT_OVERDUE`

Disparado quando a cobrança vence sem pagamento.

**Ação:**
```
UPDATE order_payments
  SET status = 'OVERDUE'
  WHERE id = <externalReference>
```

---

### `PAYMENT_DELETED` / `PAYMENT_CANCELLED`

Disparado quando a cobrança é cancelada.

**Ação:**
```
UPDATE order_payments
  SET status = 'CANCELLED'
  WHERE id = <externalReference>
```

---

### `PAYMENT_REFUNDED`

Disparado quando um pagamento é estornado.

**Ação:**
```
UPDATE order_payments
  SET status = 'REFUNDED'
  WHERE id = <externalReference>

-- Não reverte orders.status automaticamente
-- O lojista decide manualmente o que fazer com o pedido
```

---

## Payload de Entrada (Asaas → Função)

O Asaas envia um `POST` com `Content-Type: application/json`:

```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_asaas_id_123",
    "customer": "cus_asaas_id_456",
    "value": 89.90,
    "netValue": 87.35,
    "status": "CONFIRMED",
    "billingType": "PIX",
    "externalReference": "uuid-do-order-payment",
    "paymentDate": "2026-06-26",
    "confirmedDate": "2026-06-26T14:32:00.000-03:00",
    "description": "Pedido #XYZAB — Loja Exemplo"
  }
}
```

---

## Autenticação do Webhook

Para garantir que apenas requisições legítimas do Asaas sejam processadas,  
cada loja terá um `webhook_token` único armazenado em `store_payment_settings`.

**Opções de validação (a definir na implementação):**

**Opção A — Token por loja via header:**
O lojista configura o webhook no Asaas com um header customizado.  
A função valida o header contra o `webhook_token` do `store_payment_settings`.

**Opção B — Identificação via externalReference:**
O `externalReference` contém o `order_payment.id` (UUID).  
A função busca o registro, valida que pertence a uma loja com `payment_enabled = true`,  
e rejeita se não encontrar.

**Recomendação:** usar ambos em conjunto para máxima segurança.

---

## Fluxo Interno Esperado (Fase 2)

```
1. Receber POST do Asaas
2. Extrair event e payment.externalReference
3. Buscar order_payment pelo id (externalReference)
4. Validar que order_payment existe e store tem payment_enabled
5. Verificar webhook_token (se configurado)
6. Processar evento:
   - RECEIVED/CONFIRMED → paid_at + status + orders.status
   - OVERDUE            → status = OVERDUE
   - DELETED/CANCELLED  → status = CANCELLED
   - REFUNDED           → status = REFUNDED
7. Retornar HTTP 200 (Asaas re-tenta em caso de falha)
```

---

## Tratamento de Erros

| Situação | Resposta | Motivo |
|---|---|---|
| `externalReference` não encontrado | `200 OK` + log | Pode ser cobrança de mensalidade; não rejeitar |
| Evento desconhecido | `200 OK` | Asaas re-tenta em falhas; aceitar e ignorar |
| Erro de banco | `500` | Asaas vai re-tentar; acceptable |
| Token inválido | `401` | Rejeitar requisições não autorizadas |

> **Por que retornar 200 mesmo quando o externalReference não é encontrado?**  
> Porque o Asaas re-tenta eventos que retornam erro. Se um webhook vier da conta  
> de um lojista mas `externalReference` for de outra cobrança (ex: cobrança de teste),  
> não queremos loop de retry. Log do evento e responde 200.

---

## Variáveis de Ambiente Necessárias (Fase 2)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (injetada automaticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Para atualizar `order_payments` e `orders` (injetada automaticamente) |

> Não requer nenhum secret adicional — a autenticação é feita via `externalReference` + `webhook_token`.
