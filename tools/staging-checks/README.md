# Staging checks — EncartShop

Pré-requisitos (exportar como variáveis de ambiente):

- `SUPABASE_URL` — URL do projeto staging
- `SUPABASE_ANON_KEY` — chave anon/public do staging
- `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_STORE_A_ID` — credenciais e store_id do usuário de teste A
- opcional: `TEST_STORE_B_ID`, `TEST_USER_B_...` para testes adicionais

Instalação e execução:

```bash
cd tools/staging-checks
npm install
npm run test:staging
```

O script realiza:
- consulta anônima a promoções públicas
- autenticação do usuário A e tentativa de `INSERT` em `promocoes`
- verificação de isolamento entre lojas
- tentativa de upload para o bucket `logos` na pasta `store_id/`

Analise os logs e rode `supabase/staging_validation.sql` no SQL Editor para checar policies/tables.
