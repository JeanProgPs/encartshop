# RLS Audit — Plano de Ação Consolidado

## Status Geral
**Fase 2 (Auditoria RLS):** ✅ 80% Completo  
**Próxima:** Fase 2.6 — Auditar Tabelas Não Documentadas  

---

## 📋 Tarefas Imediatas (Esta Semana)

### Task 1.1: Verificar Existência de "clientes" e "promocoes"

**Como executar:**
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar e executar:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('clientes', 'promocoes');
```

**Resultado esperado:**
- ✅ Se vazio: Tabelas não existem (seguro)
- ⚠️ Se aparecer: Executar `supabase/audit-missing-tables.sql`

**Tempo estimado:** 5 minutos

---

### Task 1.2: Se Tabelas Existem, Aplicar RLS

**Como executar:**
1. Se Task 1.1 encontrou "clientes" e/ou "promocoes":
2. Copiar conteúdo de `supabase/audit-missing-tables.sql`
3. Executar no SQL Editor do Supabase
4. Validar output (deve dizer "RLS habilitado" ou "RLS já está habilitado")

**Checklist:**
- [ ] Tabelas verificadas
- [ ] RLS habilitado (se necessário)
- [ ] Policies criadas
- [ ] Nenhum erro no output

**Tempo estimado:** 10 minutos

---

### Task 1.3: Backup + Aplicar Storage Hardening em Staging

**Pré-requisitos:**
- ✅ Ter acesso a ambiente Supabase staging/dev
- ✅ Ter feito backup manual

**Como executar:**
1. No Supabase Dashboard (staging):
   - Supabase → Backups → Download (para segurança)
2. SQL Editor → Copiar `docs/rls-hardening-storage.sql`
3. Executar completo (não interrompa no meio)
4. Validar: Nenhum erro deve aparecer

**Tempo estimado:** 15 minutos

---

### Task 1.4: Testes Funcionais em Staging

**Teste 1: Upload de arquivo**
```
1. Login como Lojista A em staging
2. Ir para Produtos → Fazer upload de imagem
3. Validar que upload funciona
4. Esperado: ✅ Sucesso
```

**Teste 2: Dashboard funciona**
```
1. Ir para Dashboard → Produtos
2. Listar produtos
3. Editar produto (incluindo upload)
4. Esperado: ✅ Sem erros
```

**Teste 3: Isolamento entre lojas**
```
1. Fazer login com Lojista A
2. Tentar deletar arquivo de Lojista B (se possível)
3. Esperado: ❌ Acesso negado ou erro
```

**Tempo estimado:** 30 minutos

**Se falhar:** Executar rollback (ver deployment guide) e documentar erro

---

## 🚀 Fases Sequenciais

### Fase 2.6: Auditar Tabelas Não Documentadas ✅ SCRIPTS CRIADOS

**Status:** Pronto para execução  
**Artefatos:** `supabase/audit-missing-tables.sql`  
**Próximo:** Executar quando Task 1.2

---

### Fase 2.7: Deploy em Produção (se sucesso em staging)

**Pré-requisitos:**
- ✅ Todos os testes em staging passam
- ✅ Usuários notificados (opcional)
- ✅ Backup em produção feito

**Processo:**
1. SQL Editor (produção) → Executar `docs/rls-hardening-storage.sql`
2. Rodar testes novamente (em produção)
3. Monitorar erros por 48 horas

**Rollback:** Se algo quebrar, restaurar backup (Supabase → Backups → Restore)

**Tempo estimado:** 20 minutos + 48h monitoramento

---

### Fase 3: Audit Logging (Próximo mês)

**Objetivo:** Rastreamento de acesso para conformidade

**Tarefas:**
- [ ] Criar tabela `audit_logs`
- [ ] Registrar INSERTs/UPDATEs/DELETEs importantes
- [ ] Configurar alertas para acesso não autorizado

---

### Fase 4: ES Modules Migration (Próximo mês)

**Objetivo:** Gradualmente substituir globals por imports

**Não inicia até:** Fase 2.7 completa com sucesso

---

## 📊 Matriz de Decisão: Task 1.2

```
Se audit-missing-tables.sql retorna:

┌─────────────────────┬──────────────────┬─────────────────┐
│ Situação            │ Ação             │ Próximo         │
├─────────────────────┼──────────────────┼─────────────────┤
│ Ambas tabelas       │ Executar script  │ Validar output  │
│ existem             │ completo         │ e fazer Task 1.4│
├─────────────────────┼──────────────────┼─────────────────┤
│ Apenas "clientes"   │ Criar RLS manual │ Task 1.4        │
│ existe              │ para clientes    │                 │
├─────────────────────┼──────────────────┼─────────────────┤
│ Apenas "promocoes"  │ Criar RLS manual │ Task 1.4        │
│ existe              │ para promocoes   │                 │
├─────────────────────┼──────────────────┼─────────────────┤
│ Nenhuma tabela      │ Pular Task 1.2   │ Ir direto para  │
│ existe              │ (seguro)         │ Task 1.3        │
└─────────────────────┴──────────────────┴─────────────────┘
```

---

## 🎯 Critério de Sucesso

**Fase 2 completada quando:**

- [x] Auditoria RLS completa (tabelas principais) ✅
- [x] Vulnerabilidades de storage identificadas ✅
- [x] Patches de isolamento criados ✅
- [x] Documentação técnica completa ✅
- [ ] Tabelas "clientes" e "promocoes" auditadas (pendente)
- [ ] Storage hardening aplicado em staging (pendente)
- [ ] Testes em staging passam (pendente)
- [ ] Storage hardening aplicado em produção (pendente)
- [ ] Testes em produção passam (pendente)
- [ ] 48h monitoramento sem erros (pendente)

---

## 📄 Artefatos Criados (Fase 2)

| Arquivo | Uso | Status |
|---------|-----|--------|
| docs/rls-audit-report.md | Análise técnica | ✅ Pronto |
| docs/rls-hardening-storage.sql | Script de correção | ✅ Pronto |
| docs/rls-hardening-deployment-guide.md | Guia passo-a-passo | ✅ Pronto |
| docs/rls-audit-summary.md | Resumo executivo | ✅ Pronto |
| supabase/rls_policies.sql | Policies corrigidas | ✅ Atualizado |
| supabase/migrations/add_logo_columns.sql | Logos policies corrigidas | ✅ Atualizado |
| supabase/audit-missing-tables.sql | Script verificação | ✅ Pronto |
| supabase/rls_hardening_storage.sql | Script hardening | ✅ Pronto |

---

## 🔄 Próxima Reunião

**Agenda:**
1. Executar Task 1.1 (verificar tabelas)
2. Documentar resultado
3. Se necessário, executar Task 1.2
4. Agendar Task 1.3 em ambiente staging

**Tempo total estimado:** 60-90 minutos

---

## 📞 Suporte

**Se encontrar erro:**
1. Procurar na seção "Rollback" do deployment guide
2. Consultar o relatório de auditoria (`docs/rls-audit-report.md`)
3. Se erro persistir, restaurar backup e replancar

**Contatos:**
- Dev: Time EncartShop
- DB: Supabase Support (@supabase.com)
