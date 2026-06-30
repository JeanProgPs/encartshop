# EncartShop — Módulo de Pagamentos Online
## Relatório de Entrega: Fase 2 — Configuração do Gateway

**Data:** Junho 2026
**Status:** ✅ Concluída
**Versão:** 1.0.0

---

## Resumo Executivo

A Fase 2 adicionou a área "Pagamentos Online" ao painel de configurações do lojista.
O módulo é completamente independente e não interfere em nenhuma funcionalidade existente.

**O fluxo WhatsApp permanece 100% inalterado.**
Nenhum cliente existente percebe qualquer diferença.

---

## 1. Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `js/modules/payment-settings.js` | Módulo completo de configuração do gateway |
| `docs/payment-module-fase2.md` | Este relatório |

---

## 2. Arquivos Modificados

| Arquivo | Alterações | Justificativa |
|---|---|---|
| `admin/configuracoes.html` | 3 adições cirúrgicas (ver detalhes abaixo) | Necessário para injetar a nova seção na página existente |
| `supabase/migrations/create_payment_module.sql` | Correção de sintaxe: `ON store_payment_settings UPDATE` → `ON store_payment_settings FOR UPDATE` | Bug de sintaxe SQL identificado — `FOR` ausente na policy de UPDATE |
| `js/modules/payment.js` | Atualização dos comentários de exportação | Documentar que StorePaymentAPI foi movido para payment-settings.js |

### Detalhes das alterações em `configuracoes.html`

**Alteração 1 — Container HTML** (entre os cards Domínio Próprio e Segurança):
```html
<!-- Pagamentos Online -->
<div class="bg-cardBg border border-borderColor rounded-xl p-6 shadow-sm"
     id="payment-settings-card"></div>
```
O container é vazio por padrão. O módulo o preenche dinamicamente após carregar os dados da loja.

**Alteração 2 — Inclusão do script** (após `/js/storage.js`):
```html
<script src="/js/modules/payment-settings.js"></script>
```

**Alteração 3 — Chamada de inicialização** (ao final da função `load()`):
```javascript
// Fase 2: inicializa a seção de Pagamentos Online (módulo independente)
if (window.PaymentSettingsModule) await PaymentSettingsModule.init(_store);
```
O `if (window.PaymentSettingsModule)` garante que, se o script não carregar por qualquer razão,
a página continua funcionando normalmente sem erro.

---

## 3. Detalhes do `payment-settings.js`

### Estrutura do módulo

```
PaymentSettingsModule (IIFE)
├── Constantes: CONTAINER_ID, PLANS_WITH_ACCESS, GATEWAYS, PAYMENT_METHODS
├── Estado: _store, _settings, _apiKeyChanged
│
├── StorePaymentAPI (interno)
│   ├── getByStore(storeId)      — busca sem retornar asaas_api_key
│   ├── hasApiKey(storeId)       — verifica existência da chave (boolean)
│   ├── saveSettings(storeId, payload) — upsert com proteção da chave
│   ├── removeSettings(storeId)  — apaga config e desativa módulo
│   └── testConnection(storeId, env) — simulado até Fase 3
│
├── Helpers
│   ├── _hasAccess(store)        — verifica plano pro/enterprise
│   ├── _renderUpgradeCard()     — card informativo para plano Start
│   └── _renderSettingsCard()    — formulário completo para Pro/Enterprise
│
├── Handlers de interação
│   ├── _onApiKeyInput()         — marca chave como alterada, bloqueia toggle
│   ├── _onMethodChange()        — protege PIX de ser desmarcado
│   ├── _onEnabledChange()       — atualiza badge de status em tempo real
│   ├── _toggleKeyVisibility()   — alterna password/text no input
│   ├── _confirmRemoveKey()      — confirma e remove configurações
│   └── _testConnection()        — testa (simulado) e exibe resultado
│
└── API Pública
    ├── init(store)              — entrada principal, chamada pela página
    └── save()                   — salva configurações do formulário
```

### Comportamento por plano

| Plano | Comportamento |
|---|---|
| `start` / (outros) | Card informativo com botão "Conhecer Plano Pro" |
| `pro` | Formulário completo de configuração |
| `enterprise` | Formulário completo de configuração |

### Proteção da API Key

1. **No SELECT:** nunca buscada — query explícita sem `asaas_api_key`
2. **No DOM:** campo `type="password"`, limpo após salvar
3. **No payload:** incluída apenas se `_apiKeyChanged === true` E campo não vazio
4. **Nos logs:** nunca logada — apenas mensagens de status sem valor da chave
5. **RLS:** policy de SELECT não inclui a coluna (apenas campos não-sensíveis)

### Regras de negócio implementadas

- Não é possível ativar o módulo sem ter uma API Key salva
- PIX não pode ser desmarcado (único método disponível na Fase 2)
- Cartão de Crédito e Boleto ficam desabilitados com badge "Em breve"
- Apenas Asaas está habilitado no dropdown de gateways
- Botão "Testar Conexão" retorna mensagem informativa sem erro de JS
- Após salvar, o campo de API Key é limpo do DOM por segurança
- Após salvar, o card é re-renderizado com o novo estado

---

## 4. Evidências de Integridade do Sistema

### Fluxo do WhatsApp (Plano Básico)

| Componente | Status | Evidência |
|---|---|---|
| `cart.js` | ✅ Inalterado | Arquivo não foi aberto ou modificado |
| `bootstrap.js` | ✅ Inalterado | Arquivo não foi aberto ou modificado |
| `checkout()` | ✅ Inalterado | Função em cart.js — não tocada |
| `OrderAPI.create()` | ✅ Inalterado | Sem alterações em api.js |
| Redirecionamento WhatsApp | ✅ Inalterado | Lógica em cart.js — não tocada |

### Módulo de Mensalidades (Asaas Plataforma)

| Componente | Status |
|---|---|
| `asaas-payment/index.ts` | ✅ Inalterado |
| `asaas-webhook/index.ts` | ✅ Inalterado |
| `AsaasAPI` em `api.js` | ✅ Inalterado |
| `admin/pagamento.html` | ✅ Inalterado |
| `stores.asaas_customer_id` | ✅ Não tocado |
| `stores.status / expires_at` | ✅ Não tocados |

### Outros arquivos do admin

| Arquivo | Status |
|---|---|
| `admin/pedidos.html` | ✅ Inalterado |
| `admin/dashboard.html` | ✅ Inalterado |
| `admin/produtos.html` | ✅ Inalterado |
| `admin/pagamento.html` | ✅ Inalterado |
| `js/core/api.js` | ✅ Inalterado |
| `js/modules/orders.js` | ✅ Inalterado |
| `js/modules/store.js` | ✅ Inalterado |
| `js/ui/components.js` | ✅ Inalterado |
| `js/auth/authGuard.js` | ✅ Inalterado |

### Checklist de Aceitação

- [x] Loja Básica/Start: vê card informativo, não consegue ativar o recurso
- [x] Loja Pro: vê formulário completo, pode salvar configurações
- [x] Loja Enterprise: vê formulário completo, pode salvar configurações
- [x] WhatsApp continua funcionando normalmente
- [x] Pedidos continuam sendo criados normalmente
- [x] Integração atual com Asaas (mensalidades) não foi modificada
- [x] A API Key nunca aparece em logs ou retorna ao frontend após salva
- [x] Testar Conexão retorna mensagem informativa sem erro de JS
- [x] Módulo permanece desativado por padrão (`payment_enabled = false`)
- [x] Nenhuma venda utiliza pagamentos online nesta fase

---

## 5. Pendências para a Fase 3

| Item | Descrição |
|---|---|
| Edge Function `store-payment` | Implementar `createCharge`, `getChargeStatus`, `cancelCharge`, `validateApiKey` |
| Edge Function `store-payment-webhook` | Implementar processamento de webhooks do Asaas |
| `testConnection()` real | Substituir simulação por chamada à Edge Function `validateApiKey` |
| Webhook URL no painel | Exibir a URL do webhook para o lojista configurar no Asaas |
| Configuração do `config.toml` | Registrar as duas novas funções no `[functions.*]` do Supabase |

---

## 6. Validação de Segurança

A implementação segue o princípio de menor privilégio:

- O frontend **nunca** acessa `asaas_api_key` diretamente
- O RLS garante que somente o dono da loja lê `store_payment_settings`
- A tabela `store_payment_settings` não tem nenhuma policy de SELECT público
- O `payment_enabled` só pode ser `true` se houver uma API Key salva
- A Fase 2 **não conecta ao Asaas** — apenas persiste configurações locais
