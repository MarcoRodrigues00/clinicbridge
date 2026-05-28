# Super Revisão Geral — Sprint 4.9A

**Data:** 2026-05-27  
**Sprint:** 4.9A — Super Revisão Geral (read-only + correções pequenas)  
**Escopo:** Todos os módulos Clinic OS entregues até 4.8D (Estoque, Convênios, Catálogo de Serviços, Financeiro, Relatórios, Prontuário, Documentos Médicos)

---

## Resumo Executivo

Revisão completa de 7 dimensões por agents especializados. **Nenhum P0 encontrado.** Dois P1 de cópia/UX foram corrigidos nesta sprint. Dois P1 de arquitetura frontend (cache TanStack Query) identificados e registrados no backlog para sprint dedicada. Sistema está em excelente estado para piloto controlado com dados sintéticos em ambiente local/staging.

**Veredicto:** ✅ Piloto seguro com ressalvas documentadas. Não pronto para produção real sem S3, HTTPS, validação jurídica LGPD e secrets manager.

---

## Checks Iniciais

| Check | Resultado |
|-------|-----------|
| `git status` | ✅ Árvore limpa |
| `frontend typecheck` | ✅ rc=0 |
| `backend typecheck` | ✅ rc=0 |
| `migrate:status` | ✅ 18/0 |
| `git diff --check` | ✅ rc=0 |

---

## Agents Executados

| Agent | Arquivos revisados | Resultado |
|-------|-------------------|-----------|
| **UX/Produto** | InsurancePanel, InventoryPanel, FinancialPanel, ReportsPanel, ServicesPanel, App.tsx | 2 P1, 2 P2, 1 P3 |
| **Segurança/LGPD** | Middlewares, DAOs (inventory, insurance, financial, services), Services, logger | 0 P0/P1, 1 P2 informacional |
| **Permissões/Tenant Isolation** | Routes (5 módulos), Services (inventory, insurance, financial, services, reports) | 0 P0/P1, 2 P2 por design |
| **Financeiro/Convênios/Serviços** | financialChargeService, insuranceService, clinicServiceService, FinancialPanel, InsurancePanel | 0 P0/P1, 4 P2 aceitáveis |
| **Prontuário/Documentos Clínicos** | clinicalEncounterService, clinicalDocumentService, DAOs clínicos, ClinicalPatientPane, ClinicalDocumentsPanel | 0 P0/P1, 10 regras críticas PASS |
| **Arquitetura/Manutenibilidade Frontend** | api.ts, App.tsx, FinancialPanel, InsurancePanel, InventoryPanel, AdministrativeSchedulePanel, ReportsPanel | 2 P1 cache, 3 P2, 2 P3 |
| **QA/Docs/Piloto** | project-state.md, testing-checklist.md, security-notes.md, roadmap-next-phase.md, CLAUDE.md, scope docs | 0 P0/P1, piloto viável |

---

## Achados por Severidade

### P0 — Bloqueador

**Nenhum.**

---

### P1 — Corrigir antes de demo/piloto

#### [P1-UX-1] Copy inconsistente: "funcionários administrativos" — `InsurancePanel.tsx:1373`
**Problema:** Role note usava "funcionários administrativos" enquanto o padrão do projeto é "funcionário(a) com acesso administrativo".  
**Correção aplicada:** `Você pode visualizar carteirinhas de pacientes. Apenas o(a) dono(a) da clínica e funcionário(a) com acesso administrativo podem registrar carteirinhas.` ✅

#### [P1-UX-2] Card de acesso restrito com tom diferente — `InsurancePanel.tsx:1855-1858`
**Problema:** "Sua conta não tem permissão para acessar a área de convênios" tinha tom diferente de outros painéis (InventoryPanel usa "Acesso restrito ao estoque. Solicite permissão…").  
**Correção aplicada:** Padronizado para `Acesso restrito ao painel de convênios. Solicite permissão ao(à) dono(a) da clínica.` ✅

#### [P1-ARCH-1] Token em queryKeys — `FinancialPanel.tsx`, `ReportsPanel.tsx`, `AdministrativeSchedulePanel.tsx`
**Problema:** Token JWT incluído como parte da queryKey em 11 queries. TanStack Query cria entradas de cache separadas por token — cache miss após refresh de token, memory leak potencial em sessões longas.
**Impacto:** Performance/cache (não segurança). Token raramente muda (expira em horas).
**Status:** ✅ **Corrigido na Sprint 4.9B.** Token removido de todas as 11 queryKeys afetadas.

#### [P1-ARCH-2] Objeto `filters` mutável em queryKey — `FinancialPanel.tsx:211`
**Problema:** `filters` como objeto `useMemo` na queryKey — substituído por primitivos escalares para clareza e segurança futura.
**Correção:** `['financial', 'charges', filterStatus, filterDateFrom, filterDateTo]`.
**Status:** ✅ **Corrigido na Sprint 4.9B.**

---

### P2 — Melhoria recomendada

#### [P2-UX-1] "oportunidade de retorno" — tom comercial — `ReportsPanel.tsx:438`
**Problema:** Hint "oportunidade de retorno" em card "Sem agendamento há X dias" tem tom comercial inadequado para contexto clínico administrativo.  
**Correção aplicada:** Hint removido. ✅

#### [P2-UX-2] Role notes com padrões diferentes entre painéis
**Problema:** InventoryPanel descreve permissões positivas do usuário; InsurancePanel descrevia quem *pode* fazer. Após fix P1-UX-1, alinhado ao padrão positivo.  
**Status:** Corrigido junto com P1-UX-1. ✅

#### [P2-SEC-1] Rate limit uniforme em inventory/insurance (informacional)
**Observação:** inventory e insurance usam `patientsRateLimit` para GET+POST+PATCH. Financial usa `importRateLimit` (mais restritivo) para writes. Inconsistência defensável — inventory/insurance têm volume menor.  
**Status:** Aceitável para v0.1. Backlog de hardening futuro.

#### [P2-PERM-1] Catálogo de serviços — profissional acessa catálogo sem block no service (por design)
**Observação:** Correto por ADR 0015 §2.7 — profissional precisa ler catálogo para filtrar seletor de agenda. Writes bloqueados na rota via `requireRole(CLINIC_ADMIN_ROLES)`.  
**Sugestão:** Adicionar comentário explicativo na rota `clinicServices.ts:35–45`.  
**Status:** Backlog de documentação interna.

#### [P2-FIN-1] Validação copay+insurance apenas quando ambos preenchidos
**Observação:** Por design — valores unilaterais permitidos (copay sem insurance e vice-versa). Documentado em `insuranceService.ts:1375-1376`.  
**Status:** Aceitável v0.1.

#### [P2-FIN-2] `notes` sem validação de conteúdo clínico no backend
**Observação:** Backend aceita qualquer string ≤500 chars. Aviso anti-clínico exibido em 3 locais no frontend. Confiança na disciplina do operador é a abordagem v0.1.  
**Status:** Aceitável v0.1.

#### [P2-ARCH-1] Componentes gigantes sem divisão
- `FinancialPanel.tsx` — 2078 linhas (5 views internas)
- `InsurancePanel.tsx` — 1943 linhas (4 subtabs)
- `InventoryPanel.tsx` — 1094 linhas
- `AdministrativeSchedulePanel.tsx` — 1027 linhas  
**Status:** Backlog de refatoração progressiva. Não bloqueia produto.

#### [P2-ARCH-2] QueryKey patterns duplicadas entre painéis
**Sugestão:** Centralizar em `src/hooks/queryKeys.ts`.  
**Status:** Backlog.

#### [P2-ARCH-3] Sem Error Boundaries em painéis críticos
**Risco:** Crash em render de FinancialPanel derruba toda a Dashboard.  
**Status:** Backlog.

---

### P3 — Polish

#### [P3-UX-1] HTML do card acesso-restrito diferente entre painéis
InsurancePanel usava `<div>` com `<strong>` enquanto InventoryPanel usa `<p>`. Parcialmente resolvido no fix P1-UX-2 (agora usa `<p>`). InsurancePanels internos (ProvidersSection) já usavam `<p>`.  
**Status:** Resolvido para o card principal. ✅

#### [P3-ARCH-1] Comentários históricos "BUG FIX" no código
`FinancialPanel.tsx` contém comentários de sprints anteriores. Ruído, sem impacto.  
**Status:** Backlog de cleanup.

#### [P3-ARCH-2] `useMemo`/`useCallback` desnecessários
Funções puras memoizadas sem benefício real.  
**Status:** Backlog de cleanup.

---

## Validações Positivas (conformidade confirmada)

### Segurança/LGPD
- ✅ Tenant isolation impecável — `clinica_id` em todos os DAOs, sem `listAll()`
- ✅ SQL parametrizado — sem concatenação com input
- ✅ PII em logs: nenhum (CPF, telefone, email, reason, member_number, holder_name todos redactados em logger)
- ✅ Audit metadata-only, append-only, sem `metadata`/`entidade_tipo`
- ✅ Soft-delete correto em todas as entidades sensíveis
- ✅ errorHandler nunca retorna stack/SQL/path
- ✅ Rate limit IP-keyed antes de requireAuth
- ✅ Anti-enumeration: 404 genérico para cross-tenant

### Permissões
- ✅ Pipeline completo: `patientsRateLimit → requireAuth → requireClinic → requireRole`
- ✅ Downgrade service-level: profissional_clinico bloqueado via `ensureNotProfissional`/`assertNotProfissional`
- ✅ effectiveFinancialAccess correto por papel
- ✅ Matriz cross-tenant: todos os 8 cenários PASS
- ✅ admin_sistema bloqueado em `requireClinic` (no_clinic_context)

### Módulo Clínico
- ✅ 10 regras críticas de prontuário/documentos — 100% conformes
- ✅ ADR 0010/0011 — conformidade total
- ✅ Audit STRICT pré-content-read em prontuário e PDF
- ✅ internal_note redaction centralizada no service
- ✅ Notas append-only — DAO sem update/delete
- ✅ PDF efêmero — sem armazenamento

### Regras de negócio
- ✅ reference_price_cents NUNCA auto-propaga amount_cents (insurance e catálogo)
- ✅ duration_minutes NUNCA auto-preenche ends_at em agenda
- ✅ service_not_available_for_professional validado no backend
- ✅ member_number_masked em listas, raw lazy-loaded no edit, limpo no cancel
- ✅ holder_name nunca em listas
- ✅ Copay + insurance = amount_cents quando mixed (dupla validação frontend + backend)
- ✅ defaultMethod=bank_transfer para convênio

### Frontend
- ✅ Sem console.log com dados sensíveis
- ✅ Sem dangerouslySetInnerHTML
- ✅ localStorage: apenas token (authStorage.ts isolado), sem PII
- ✅ staleTime: 0 em queries de dados sensíveis
- ✅ 403 vira card "Acesso restrito" sem derrubada de tela

---

## Correções Aplicadas Nesta Sprint

| Arquivo | Linha original | Correção |
|---------|---------------|----------|
| `frontend/src/components/InsurancePanel.tsx` | 1373 | "funcionários administrativos" → "funcionário(a) com acesso administrativo" + texto positivo |
| `frontend/src/components/InsurancePanel.tsx` | 1855–1858 | Card restrito `<div>` + texto verboso → `<p>` padronizado com InventoryPanel |
| `frontend/src/components/ReportsPanel.tsx` | 438 | Removido hint "oportunidade de retorno" |

---

## Backlog Priorizado

### Sprint 4.9B — Cache Fix Frontend (P1-ARCH)
1. Remover token de todas as queryKeys (FinancialPanel, ReportsPanel, AdministrativeSchedulePanel) — usar `enabled: !!token`
2. Corrigir queryKey com objeto `filters` → spreadalizar primitivos (FinancialPanel:211)
3. Adicionar Error Boundaries nos painéis críticos (P2-ARCH-3)

### Sprint futura — Refatoração Frontend (P2-ARCH)
4. Extrair subcomponentes de FinancialPanel (2078 linhas)
5. Centralizar queryKeys em `src/hooks/queryKeys.ts`
6. Limpar comentários históricos "BUG FIX"

### Sprint futura — Hardening backend (P2-SEC)
7. Rate limit diferenciado (importRateLimit) para writes de inventory/insurance
8. Comentário explicativo em `clinicServices.ts` sobre acesso por profissional (ADR 0015)

### Produção (P1 já documentados em security-notes.md)
9. S3 bucket real para armazenamento
10. HTTPS real + secrets manager (SSM/Secrets Manager)
11. Validação jurídica da política LGPD (prazos, base legal, art. 18)
12. Backup offsite agendado com bucket S3 real

---

## Recomendação de Próximas Sprints

| Prioridade | Sprint | Descrição |
|-----------|--------|-----------|
| **Alta** | **4.9B** | Fix cache TanStack Query (P1-ARCH-1 e P1-ARCH-2) + Error Boundaries |
| **Média** | **4.10** | Nova fase Clinic OS com ADR própria (TBD com produto) |
| **Média** | **Futura** | Refatoração de componentes gigantes (FinancialPanel, InsurancePanel) |
| **Baixa** | **Futura** | Rate limit diferenciado para writes, cleanup de comentários |

**Nota:** Sprint 4.9B (cache fix) não requer migration, não altera backend, não muda regras de negócio — pode ser executada com segurança em qualquer momento.

---

## Prontidão para Piloto

**✅ Piloto controlado: LIBERADO** — com dados sintéticos/anonimizados em local/staging.

**Condições:**
1. Usar dados de teste/demo (`pnpm --filter backend seed:demo`)
2. Ambiente local Docker Compose ou staging TLS
3. Caveats documentados e comunicados ao cliente-piloto:
   - Estoque: `low_stock` usa `<` (item exato no mínimo não alerta)
   - Estoque: hero usa `limit=100` (contagem subestimada acima de 100 itens)
   - Sem export de relatórios (futuro)
   - Sem TISS/TUSS real (convênios administrativo)
4. P1-ARCH (cache) não bloqueia piloto — apenas eficiência

**❌ Produção real com dados de clínica: BLOQUEADO** — ver `docs/security-notes.md` §P1 para pré-requisitos.
