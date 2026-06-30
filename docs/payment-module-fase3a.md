# EncartShop — Módulo de Pagamentos Online
## Relatório de Entrega: Fase 3A — Validação da API Key Asaas

**Data:** Junho 2026
**Status:** ✅ Concluída
**Versão:** 1.0.0

---

## Resumo Executivo

A Fase 3A implementou a Edge Function `store-payment` com a action `validateApiKey`.
O botão "Testar Conexão" no painel do lojista agora verifica de forma real se a API Key
cadastrada é válida na conta Asaas do lojista.

**Nenhuma cobrança é criada. Nenhum dado é alterado. Zero impacto no fluxo atual.**

---

## 1. Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `supabase/functions/store-payment/index.ts` | Edge Function — action `validateApiKey` |
| `supabase/functions/store-payment/deno.json` | Import map (mesmo padrão das funções existentes) |
| `docs/payment-module-fase3a.md` | Este relatório |

---

## 2. Arquivos Modificados

| Arquivo | Alteração | Justificativa |
|---|---|---|
| `supabase/config.toml` | Adicionado bloco `[functions.store-payment]` | Registrar a nova função no Supabase local |
| `js/modules/payment-settings.js` | `testConnection()` substituído + `_testConnection()` atualizado | Conectar ao backend real (Fase 3A) |

### Detalhes de `config.toml`

Adicionado ao final:
```toml
[functions.store-payment]
enabled = true
verify_jwt = true
import_map = "./functions/store-payment/deno.json"
entrypoint = "./functions/store-payment/index.ts"
```

`verify_jwt = true` — requer token de autenticação válido. A função valida
adicionalmente que o `user_id` é dono da loja via RLS.

### Detalhes de `payment-settings.js`

Substituído `testConnection()` (simulado) por chamada real:
```javascript
const { data, error } = await window.sb.functions.invoke('store-payment', {
  body: { action: 'validateApiKey', storeId, environment }
});
```

Atualizado `_testConnection()` para tratar códigos específicos:
`NO_API_KEY`, `INVALID_API_KEY`, `ASAAS_TIMEOUT`, `INVALID_ENVIRONMENT`.

---

## 3. Arquitetura da Edge Function

### Fluxo de execução

```
POST /functions/v1/store-payment
{ action: "validateApiKey", storeId: "uuid" }
         │
         ▼
1. Valida JWT do usuário (Supabase Auth)
         │
         ▼
2. Verifica que o usuário é dono da loja (RLS via supabaseUser)
         │
         ▼
3. Busca store_payment_settings via service_role
   (SELECT id, payment_provider, environment, asaas_api_key)
         │
         ├── sem configuração → { success: false, code: "NO_SETTINGS" }
         ├── sem api_key      → { success: false, code: "NO_API_KEY" }
         │
         ▼
4. GET https://sandbox.asaas.com/api/v3/myAccount
   Header: access_token = asaas_api_key (nunca logada)
   Timeout: 8 segundos
         │
         ├── HTTP 200  → { success: true, message: "Conta: Nome da Conta" }
         ├── HTTP 401  → { success: false, code: "INVALID_API_KEY" }
         ├── HTTP 403  → { success: false, code: "INVALID_API_KEY" }
         ├── HTTP 429  → { success: false, code: "RATE_LIMIT" }
         ├── HTTP 5xx  → { success: false, code: "ASAAS_UNAVAILABLE" }
         ├── Timeout   → { success: false, code: "ASAAS_TIMEOUT" }
         └── NetError  → { success: false, code: "NETWORK_ERROR" }
```

### Endpoint Asaas utilizado

`GET /myAccount` — retorna dados da conta associada à API Key.
- Operação de leitura pura — não cria clientes, cobranças ou qualquer dado
- Resposta HTTP 200 confirma que a chave é válida e tem acesso à conta
- Resposta HTTP 401/403 confirma que a chave é inválida ou sem permissão

### Isolamento de segurança confirmado

| Verificação | Resultado |
|---|---|
| Usa `ASAAS_API_KEY` de ambiente (plataforma) | ❌ Nunca |
| Toca em `stores.status` | ❌ Nunca |
| Toca em `stores.expires_at` | ❌ Nunca |
| Loga o valor da `asaas_api_key` | ❌ Nunca |
| Loga headers de autenticação | ❌ Nunca |
| Retorna `asaas_api_key` ao frontend | ❌ Nunca |
| Cria clientes no Asaas | ❌ Não (apenas GET /myAccount) |
| Cria cobranças | ❌ Não |
| Modifica dados no banco | ❌ Não |

### O que os logs contêm (e apenas isso)

```
[store-payment] validateApiKey | store_id=uuid | gateway=asaas | environment=sandbox | result=success | elapsed=342ms
[store-payment] validateApiKey | store_id=uuid | gateway=asaas | environment=sandbox | result=asaas_error | http_status=401 | elapsed=180ms
[store-payment] validateApiKey | store_id=uuid | result=no_api_key
[store-payment] Loja não encontrada ou acesso negado | store_id=uuid | user=uuid
```

---

## 4. Tratamento de Erros Implementado

| Cenário | Código retornado | Mensagem ao usuário |
|---|---|---|
| Sem configuração salva | `NO_SETTINGS` | "Salve uma API Key antes de testar a conexão." |
| Configuração sem API Key | `NO_API_KEY` | "Salve uma API Key antes de testar a conexão." |
| Chave inválida / sem permissão | `INVALID_API_KEY` | "API Key inválida. Verifique a chave no painel Asaas." |
| Ambiente inválido | `INVALID_ENVIRONMENT` | "Ambiente inválido. Selecione Sandbox ou Produção." |
| Timeout (> 8s) | `ASAAS_TIMEOUT` | "Tempo limite excedido. Verifique sua conexão." |
| Erro de rede | `NETWORK_ERROR` | "Erro de rede ao contatar o Asaas." |
| Rate limit Asaas | `RATE_LIMIT` | "Limite de requisições excedido. Aguarde." |
| Asaas indisponível | `ASAAS_UNAVAILABLE` | "O Asaas está temporariamente indisponível." |
| Loja não encontrada / acesso negado | `STORE_NOT_FOUND` | "Loja não encontrada." |
| Token inválido/expirado | `UNAUTHORIZED` | "Token inválido ou expirado." |
| Body JSON inválido | `INVALID_BODY` | "Body inválido. Esperado JSON." |
| Action desconhecida | `UNKNOWN_ACTION` | "Action X não reconhecida." |

---

## 5. Cenários de Teste

### Como testar manualmente (após deploy)

**API Key válida (Sandbox):**
1. Loja Pro/Enterprise, configurar chave sandbox válida do Asaas
2. Selecionar ambiente "Sandbox"
3. Clicar "Testar Conexão"
4. Esperado: toast verde "✅ Conexão realizada com sucesso. Conta: [Nome da Conta]"

**API Key inválida:**
1. Configurar qualquer string aleatória como API Key
2. Clicar "Testar Conexão"
3. Esperado: toast vermelho "API Key inválida. Verifique a chave no painel Asaas."

**Loja sem configuração:**
1. Loja Pro sem API Key salva
2. Clicar "Testar Conexão"
3. Esperado: toast amarelo "Salve uma API Key antes de testar a conexão."

**Loja Básica (Start):**
1. Loja com plano Start
2. O botão "Testar Conexão" não aparece (card de upgrade exibido)
3. Nenhuma chamada à Edge Function é feita

**Ambiente Produção com chave Sandbox:**
1. Configurar chave sandbox, selecionar ambiente "Produção"
2. Clicar "Testar Conexão"
3. Esperado: toast vermelho "API Key inválida" (chave sandbox não funciona em produção)

---

## 6. Evidências de Integridade

### Funções existentes — inalteradas

| Arquivo | Timestamp original | Modificado? |
|---|---|---|
| `asaas-payment/index.ts` | 12/05/2026 | ✅ Não |
| `asaas-payment/deno.json` | 12/05/2026 | ✅ Não |
| `asaas-payment/.npmrc` | 12/05/2026 | ✅ Não |
| `asaas-webhook/index.ts` | 18/05/2026 | ✅ Não |
| `platform-admin/index.ts` | 17/06/2026 | ✅ Não |
| `platform-admin/deno.json` | 17/06/2026 | ✅ Não |

### Fluxo WhatsApp e checkout — inalterados

| Componente | Modificado? |
|---|---|
| `cart.js` | ✅ Não |
| `bootstrap.js` | ✅ Não |
| `api.js` | ✅ Não |
| `orders.js` | ✅ Não |
| `admin/pedidos.html` | ✅ Não |
| `admin/pagamento.html` | ✅ Não |

---

## 7. Riscos Identificados e Mitigações

**Risco 1 — Chave sandbox usada em produção acidentalmente**
Mitigação: o ambiente é lido de `store_payment_settings.environment` (banco), não do frontend. O lojista seleciona sandbox/produção explicitamente ao salvar as configurações.

**Risco 2 — Rate limit do Asaas**
Mitigação: `GET /myAccount` é chamado apenas quando o lojista clica no botão. Não há polling automático. Tratamento específico com código `RATE_LIMIT`.

**Risco 3 — Timeout na Edge Function por lentidão do Asaas**
Mitigação: `fetchWithTimeout` com `AbortController` e 8 segundos de limite. A Edge Function responde com `ASAAS_TIMEOUT` em vez de travar.

**Risco 4 — Confusão com `asaas-payment` existente**
Mitigação: nomes diferentes, arquivos separados, variável de ambiente `ASAAS_API_KEY` não é lida em `store-payment`. A chave vem exclusivamente de `store_payment_settings` via service_role.

---

## 8. Pendências para Próximas Fases

| Fase | Descrição |
|---|---|
| Fase 3B | Action `createCharge` — criar cobrança PIX |
| Fase 3C | Action `getChargeStatus` — consultar status |
| Fase 3D | `store-payment-webhook` — processar confirmações |
| Fase 4 | Checkout com pagamento online no carrinho |
| Fase 5 | Badge de status PIX na tela de pedidos |
