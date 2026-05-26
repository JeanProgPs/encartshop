# Arquitetura EncartShop

## Objetivo
Este documento registra o estado atual do sistema e o plano de modularização incremental para hardening e manutenção.

## Estrutura atual

- `index.html`, `demo.html`, `faq.html`, `support.html`, `privacy.html`
  - Landing e páginas de comunicação.
- `admin/`
  - Páginas administrativas: dashboard, produtos, pedidos, pagamento, lojas, configurações, setup.
- `loja/`
  - Loja pública/cliente com catálogo e carrinho.
- `js/`
  - `core/`
    - infraestrutura compartilhada, APIs e autenticação.
  - `auth/`
    - lógica de login, logout e sessão.
  - `modules/`
    - regras de negócio específicas da loja/admin.
  - `ui/`
    - componentes de renderização e helpers de UI.
  - `storage.js`
    - gerenciamento de arquivos/recursos.
- `api/`
  - endpoint de pré-renderização da loja.
- `supabase/`
  - funções serverless e políticas de segurança.

## Suporte Supabase

### Ponto único de configuração

Criado:
- `js/core/supabase.js`

Responsabilidades:
- armazenar `SUPABASE_URL` e `SUPABASE_ANON_KEY`
- inicializar o cliente Supabase em `window.sb`
- exportar API compatível com CommonJS e AMD
- manter compatibilidade com código legado que usa `window.sb` e `window.supabaseClient`

### Uso gradual

A ideia é que novos módulos possam migrar para:

```js
import { initSupabase, SUPABASE_URL } from '/js/core/supabase.js';
```

Enquanto isso, o carregamento antigo continua funcional via tag `<script>`.

## Caminho de modularização

1. Centralizar configurações de infraestrutura em `/js/core`
2. Migrar APIs e serviços para `/js/services`
3. Mover renderizadores para `/js/ui`
4. Criar uma camada `/js/modules` para regras de negócio
5. Separar a lógica da loja em `/js/store`

## Validação inicial

- `admin/*` já usa `supabaseClient.js` para bootstrap do SDK.
- `api/loja.js` usará a mesma configuração central sem duplicar valores.
- O próximo passo é atualizar os imports `supabase.js` nas páginas que carregam o SDK.

## Observações

- Não há `service_role` exposto no front-end.
- A chave anon do Supabase está exposta no client, o que é esperado; a segurança deve ser mantida via RLS.
- A migração deve ser incremental: primeiro config central, depois paths e depois modularização de serviços.

## Dependências externas atuais

O site carrega hoje as seguintes bibliotecas via CDN:

- `@supabase/supabase-js` para acesso ao backend
- `dompurify` para sanitização de HTML
- `lucide` para ícones na admin
- `tailwindcss` via CDN em algumas páginas de admin

Esta fase não remove CDNs, apenas documenta o uso para migrar localmente no futuro.
