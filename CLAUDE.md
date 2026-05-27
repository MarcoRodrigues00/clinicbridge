# CLAUDE.md — ClinicBridge

> Guia operacional rápido. Detalhes completos nos docs específicos:
> - **Estado detalhado + componentes por sprint:** `docs/project-state.md`
> - **Histórico de sprints:** `docs/sprint-history.md`
> - **Segurança + ressalvas P1/P2/P3:** `docs/security-notes.md`
> - **Checklist de testes + smoke users:** `docs/testing-checklist.md`
> - **Fonte de verdade produto/arquitetura/STRIDE/LGPD:** `docs/ClinicBridge_Documentacao_Mestre.md`
> - **Roadmap Clinic OS:** `docs/product-clinic-os-roadmap.md`
> - **Módulo Financeiro v0.1:** ADR `docs/adr/0012-financial-module-v0.md` · operacional `docs/financial-v0-scope.md`
> - **Integração Agenda × Financeiro v0.1:** ADR `docs/adr/0013-agenda-financial-integration-v0.md` · `docs/agenda-financial-integration-v0-scope.md`
> - **Relatórios Gerenciais v0.1:** ADR `docs/adr/0014-management-reports-v0.md` · `docs/management-reports-v0-scope.md`
> - **Catálogo de Serviços v0.1 (Fase 4.6):** ADR `docs/adr/0015-services-catalog-commercial-layer-v0.md` · `docs/services-catalog-v0-scope.md`
> - **Convênios v0.1 (Fase 4.7 — futuro):** pré-planejamento `docs/insurance-billing-future-scope.md`
> - **Documentos Médicos v0.1:** ADR `docs/adr/0011-medical-documents-prescriptions-v0.md` · `docs/medical-documents-v0-scope.md`
> - **Prontuário v0.1:** ADR `docs/adr/0010-clinical-encounters-medical-record-v0.md` · `docs/clinical-encounters-v0-scope.md`
> - **Arquitetura clínica + roles + audit:** ADR `docs/adr/0009-clinical-architecture-roles-read-audit.md` · `docs/clinical-architecture-and-permissions.md`
> - **Outros ADRs (0001–0009):** `docs/adr/`
> - **Runbooks (backup/DNS/TLS/Nginx/secrets/AWS):** `docs/backup-restore-local-runbook.md`, `docs/backup-offsite-runbook.md`, `docs/dns-tls-staging-runbook.md`, `docs/secrets-env-production-runbook.md`, `docs/aws-provisioning-runbook-3.41B.md`
> - **Planos de prod/infra AWS:** `docs/production-minimum-plan.md`, `docs/aws-infra-sprint-3.41-plan.md`

## Estado atual (atualizado 2026-05-27)

**Sprint atual: 4.6D** (entregue) — **QA/Hardening Catálogo de Serviços v0.1.**
Smoke API 41/41 PASS (auth, CRUD, limites, permissões, links, Agenda+service_id, Financeiro+service_id).
Bug crítico corrigido em 4.6C.2: `appointmentController.create` e `financialChargeController.create`/`update`
não repassavam `service_id` do body para o service — validações de
`service_not_available_for_professional` e `service_mismatch_with_appointment` nunca disparavam.
Corrigido em 3 pontos dos 2 controllers. CSS `.fetchError`/`.refetchBtn` adicionados ao `ServicesPanel.module.css`.
Guard `!listQuery.isError` no empty-state do `ServicesPanel`. `limit: 200` → `limit: 100` + chave duplicada
removida no `AdministrativeSchedulePanel`. Aba `Serviços` separada no Dashboard (sem `ownerOnly` —
secretaria e profissional podem ver o catálogo; escrita já bloqueada pelo backend + UI por papel).
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ · build ✅ ·
`migrate:status` 16/0 ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.6C** (entregue) — **Frontend Catálogo de Serviços v0.1.**
`ServicesPanel` (aba própria **Serviços**, visível a todos os papéis da clínica): lista, criar, editar,
desativar/reativar, vincular/desvincular profissionais (owner-only para escrita; subtítulo
"etiqueta administrativa/comercial — não TUSS/CBHPM, não prontuário"). Seletor de serviço no
`AdministrativeSchedulePanel` (opcional; **filtra serviços pelo profissional selecionado** via
`GET /clinic-services?professional_id=`; quando nenhum profissional selecionado, lista todos os ativos;
hint "Nenhum serviço vinculado" quando profissional sem vínculo; reseta `cServiceId` ao trocar
profissional; duração NUNCA preenche horário). Seletor de serviço no `FinancialPanel` (botão
"Usar preço de tabela" é ação EXPLÍCITA; NUNCA auto-propaga `price_cents` → `amount_cents`).
8 funções API em `api.ts` + `professional_id` filter em `ListClinicServicesParams`.
`service_id: string | null` adicionado a `PublicAppointment`, `FinancialChargeListItem`,
`CreateAppointmentPayload`, `CreateFinancialChargePayload`, `UpdateFinancialChargePayload`.
Backend wiring: `appointmentService.create` valida `service_id` (active + professional binding →
`service_not_available_for_professional`); `financialChargeService.create`/`update` validam `service_id`
(active + mismatch com appointment → `service_mismatch_with_appointment`; **profissional do agendamento
sem vínculo → `service_not_available_for_appointment_professional`**). `GET /clinic-services` aceita
`professional_id` opcional (EXISTS subquery tenant-scoped, sem nova migration).
NUNCA auto-propaga `price_cents` → `amount_cents` no backend. Zero nova migration.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ · build ✅ ·
`migrate:status` 16/0 ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.6B** (entregue) — **Backend Catálogo de Serviços v0.1.**
Migration única aditiva `20260605_clinic_services_v0`: tabelas `clinic_services` (catálogo com
`name 1..120` + CHECK `char_length(btrim(name)) >= 1`, `category ≤80`, `description ≤500`,
`duration_minutes 5..720`, `price_cents 0..99_999_999`, `active`; UNIQUE INDEX normalizado
`(clinica_id, lower(btrim(name)))` — duplicata case-insensitive e tolerante a espaços
→ 409 `service_name_duplicated`) e `professional_services` (PK composta professional×service + clinica_id +
`active`; índices por clínica). `appointments.service_id` e `financial_charges.service_id` adicionados
como NULL opcionais (FK SET NULL; coluna pronta, **wiring deferido para 4.6C** — sem mudança de payload
em endpoints existentes nesta sprint). Nenhuma tabela clínica tocada.
8 endpoints novos: `GET /clinic-services` · `POST /clinic-services` · `GET /clinic-services/:id` ·
`PATCH /clinic-services/:id` · `PATCH /clinic-services/:id/status` ·
`GET /clinic-services/:id/professionals` · `POST /clinic-services/:id/professionals` ·
`PATCH /clinic-services/:id/professionals/:professional_id/status`.
Pipeline: `patientsRateLimit + requireAuth + requireClinic + requireRole`. **Reads** abertos a
`dono_clinica + secretaria` (profissional_clinico passa pela leitura — necessário para seletor de agenda;
admin_sistema bloqueado em `requireClinic` com `no_clinic_context`). **Writes** restritos a
`CLINIC_ADMIN_ROLES = ['dono_clinica']`. Re-link de profissional×serviço é idempotente
(`active` volta a true; sem linha duplicada). Audit metadata-only — sem nome/preço/category/body:
`clinic_service.create.success`, `.update.success`, `.status.update.success`, `.professional.link.success`,
`.professional.status.update.success`. Índices parciais tenant-scoped em
`appointments (clinica_id, service_id) WHERE service_id IS NOT NULL` e
`financial_charges (clinica_id, service_id) WHERE service_id IS NOT NULL`.
**Smoke 51/51 PASS** após revisão de normalização — inclui case-insensitive (`consulta médica` colide
com `Consulta médica`), whitespace-pad (`  Consulta médica  ` → 409), whitespace-only (`   ` → 400),
rename para nome normalizado colidente → 409, rename self com casing diferente → 200; mais regressão
completa (anônimo 401; admin 403; owner CRUD+link; secretaria/gestor/profissional read OK + write 403;
cross-tenant 404; UUID inválido 400; payload-safety sem PII/clínico). **Invariante-chave:** serviço é
etiqueta administrativa — sem TUSS/CBHPM, sem prontuário, sem auto-propagação de preço para
`amount_cents`, sem auto-duração para `ends_at`.
`pnpm --filter backend typecheck` ✅ · build ✅ · `pnpm --filter frontend typecheck` ✅ ·
`migrate:status` 16/0 ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.6A** (entregue) — **ADR 0015 Catálogo de Serviços v0.1 + Camada Comercial (docs/ADR-only).**
ADR 0015 + `docs/services-catalog-v0-scope.md` criados. Decisão de faseamento: **4.6 = Catálogo de Serviços**
(esta ADR), **4.7 = Convênios manual básico** (ADR 0016 futura), **4.8 = Estoque** (ADR 0017 futura).
Entidades definidas: `clinic_services` (catálogo com preço de tabela, duração, categoria), `professional_services`
(many-to-many professional↔service), extensão de `appointments.service_id` e `financial_charges.service_id`
(ambos NULL opcionais, sem auto-propagação de preço). Invariante-chave: serviço é etiqueta administrativa —
não é código TUSS/CBHPM, não entra no prontuário, não dispara automação de preço.
`docs/insurance-billing-future-scope.md` marcado como pré-planejamento (supersedido pela ADR 0015/0016).
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.** Detalhe: `docs/project-state.md`.

**Sprint anterior: 4.5D** (entregue) — **QA/hardening + polish UX Relatórios Gerenciais v0.1.**
Fecha a fase 4.5. Polish-only no `ReportsPanel`: hero strip "Resumo do período" (4 sinais via
queryKeys deduplicadas — sem fetch extra); frases interpretativas por bloco; ordem dos cards do
Financeiro privilegia Recebido/Em aberto/Vencido (Cancelado por último, sem tom); subtítulo
interno do R-D vira "Pontos de atenção"; "Sem agendamento há mais de 90 dias" no R-C;
restricted-card com tom calmo (ciano, não cinza-erro). Pacientes/data formatado em PT-BR.
**Decisão profissional×tab:** aba "Relatórios" segue visível para todo papel administrativo —
frontend não tem como distinguir `secretaria` pura de `secretaria + profissional_clinico`
(o `/me` não devolve grants; `/clinical/roles` é owner-only) sem adicionar endpoint.
Profissional vê R-A/R-C normalmente e R-B/R-D como card "Área financeira restrita" intencional.
**QA regressão API 24/24 PASS** (matriz 5 papéis × 4 endpoints + PII scan; reusa smoke 4.5B).
Frontend security greps: console/localStorage/dangerouslySet/token-em-URL/forbidden-fields = 0.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ ·
build ✅ · `migrate:status` 15/0 ✅ · `git diff --check` rc=0. **Zero migration, zero backend.**

**Sprint anterior: 4.5C** (entregue) — **Frontend Relatórios Gerenciais v0.1.**
Nova aba "Relatórios" no Dashboard; `ReportsPanel` consome os 4 endpoints da Sprint 4.5B.
Filtros de período: Hoje · Últimos 7 dias · Mês atual · Personalizado (date_from/date_to);
botão "Atualizar" invalida via `refreshKey`. 4 blocos: Agenda, Financeiro, Pacientes,
Agenda × Financeiro. Valores em BRL via `Intl.NumberFormat`. 403 por relatório vira card
"Acesso restrito" — não derruba a tela. Lista "Em atraso" (R-A) mostra horário + status
traduzido; **nunca renderiza UUID** de appointment. Sem PII, sem dados clínicos, sem export.

**Sprint anterior: 4.5B** (entregue) — **Backend Relatórios Gerenciais v0.1.**
4 endpoints read-only, sem migration, sem nova tabela, sem dados clínicos, sem PII.
`GET /reports/appointments` · `GET /reports/financial` · `GET /reports/patients` · `GET /reports/agenda-financial`.
Filtros: `date_from`/`date_to` (YYYY-MM-DD, padrão = mês corrente, intervalo ≤ 366 dias,
floor ~2 anos), `professional_id` (R-A e R-D), `no_appt_days` (R-C, 1..365).
Permissões: `requireAuth + requireClinic + requireRole(['dono_clinica','secretaria'])`;
R-B/R-D adicionalmente exigem `effectiveFinancialAccess !== 'none'` (profissional → 403).
Audit metadata-only: `report.<type>.view.success` com `recurso_id=<type>:<from>:<to>` (sem valores).
Reusa `patientsRateLimit`. Smoke 24/24 (auth/permissão) + 27/27 (filtros / payload / shape) PASS.

**Sprint anterior: 4.5A** (entregue) — **ADR 0014 Relatórios Gerenciais v0.1 (docs/ADR-only).**
ADR 0014 + `docs/management-reports-v0-scope.md` criados.
4 relatórios definidos (R-A Agenda, R-B Financeiro, R-C Pacientes, R-D Agenda×Financeiro);
permissões por papel; fontes permitidas/proibidas; API 4 endpoints separados; UX; roadmap 4.5B/C/D.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.** Detalhe: `docs/project-state.md`.

**Sprint anterior: 4.4E-D** (entregue) — **QA/Hardening Agenda × Financeiro v0.1.**
Code review segurança PASS (13/13); smoke API 24/24 PASS; SQL 9/9; audit; cleanup.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ · build ✅ · `migrate:status` 15/0 ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.4E-C** (entregue) — **Frontend Agenda × Financeiro v0.1.**
Badge financeiro (5 estados) por agendamento; alertas A1–A4; botão "Criar cobrança" inline; link "Ver cobrança".
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.4E-B** (entregue) — **Avaliação backend Agenda × Financeiro (docs-only).**
Decisão: reutilizar endpoints existentes; nenhum backend novo necessário.
`git diff --check` rc=0. **Zero mudanças de código.**

**Sprint anterior: 4.4E-A** (entregue) — **ADR 0013 Integração Agenda × Financeiro v0.1 (docs/ADR-only).**
ADR 0013 + `docs/agenda-financial-integration-v0-scope.md` criados.
`git diff --check` rc=0. **Zero mudanças de código.**

**Endpoints financeiros registrados:**
`POST /financial/charges` · `GET /financial/charges` (incl. `?appointment_id`) · `GET /financial/summary` ·
`GET /financial/charges/:id` · `PATCH /financial/charges/:id` · `POST /financial/charges/:id/mark-paid` ·
`POST /financial/charges/:id/cancel` · `GET /patients/:id/charges`

**Endpoints de relatórios registrados (Sprint 4.5B):**
`GET /reports/appointments` · `GET /reports/financial` · `GET /reports/patients` · `GET /reports/agenda-financial`

**Endpoints do Catálogo de Serviços registrados (Sprint 4.6B):**
`GET /clinic-services` · `POST /clinic-services` · `GET /clinic-services/:id` ·
`PATCH /clinic-services/:id` · `PATCH /clinic-services/:id/status` ·
`GET /clinic-services/:id/professionals` · `POST /clinic-services/:id/professionals` ·
`PATCH /clinic-services/:id/professionals/:professional_id/status`

**Sprints anteriores recentes (detalhes em `docs/sprint-history.md`):**
- **4.6D** ✅ QA/Hardening Catálogo de Serviços — smoke 41/41; bug controller corrigido (4.6C.2)
- **4.6C** ✅ Frontend Catálogo de Serviços v0.1 — `ServicesPanel` + seletores Agenda/Financeiro
- **4.6B** ✅ Backend Catálogo de Serviços v0.1 — migration + 8 endpoints — smoke 51/51 PASS
- **4.6A** ✅ ADR 0015 Catálogo de Serviços v0.1 (docs-only)
- **4.5A** ✅ ADR 0014 Relatórios Gerenciais v0.1 (docs-only)
- **4.4D-conv** ✅ Planejamento Convênios/Faturamento — `insurance-billing-future-scope.md` criado
- **4.4D** ✅ QA/Hardening Financeiro — smoke 60/60, SQL 9/9, frontend security PASS, cleanup
- **4.4C** ✅ Frontend Financeiro — `FinancialPanel` + Dashboard tab "Financeiro" — typecheck/build ✅
- **4.4B** ✅ Backend Financeiro — migration + DAOs + services + 8 endpoints — smoke 49/49 PASS
- **4.4A** ✅ ADR 0012 + `docs/financial-v0-scope.md` (docs-only)
- **4.3D** ✅ QA/hardening Documentos Médicos — smoke 50/50 PASS
- **4.3C** ✅ Frontend Documentos Médicos (`ClinicalDocumentsPanel`, tab bar, 7 API funcs, PDF blob)
- **4.3B** ✅ Backend Documentos Médicos — migration + PDFKit + 8 endpoints — smoke 47/47 PASS
- **4.3A** ✅ ADR 0011 + `docs/medical-documents-v0-scope.md` (docs-only)
- **4.2E** ✅ `GET /clinical/read-audit` owner-only (LGPD-art.18) + `ClinicalReadAuditPanel`
- **4.2D** ✅ QA/hardening Prontuário — 76/76 PASS validados, dados sintéticos limpos
- **4.2C** ✅ Frontend Prontuário (`ClinicalPatientPane`, `ClinicalRolesPanel`)
- **4.2B-1/2/3** ✅ Migration 4 tabelas + DAOs + services + rotas clínicas (76/76 PASS)
- **4.2A** ✅ ADR 0010 (docs-only) · **4.1** ✅ ADR 0009 · **4.0** ✅ ADR 0008

**Trilha Clinic OS:**
4.0–4.5D ✅ · 4.6A ✅ · 4.6B ✅ · 4.6C ✅ · 4.6D ✅ (QA/hardening; bug controller corrigido) →
**4.7A** ADR 0016 Convênios → **4.7B–D** implementação → **4.8** Estoque (ADR 0017).
Cada fase nova exige ADR própria. Detalhe: `docs/product-clinic-os-roadmap.md`.

**Fase:** Fase 3 (produção/governança). **NÃO está pronto para produção** — ver P1 em `docs/security-notes.md`.
**AWS** é o provedor preferido; trilha pausada estrategicamente — ver `docs/production-minimum-plan.md`.

**O que existe:** auth (JWT, MFA/TOTP, backup codes, rate limit, audit); upload CSV/XLSX (magic bytes, SHA-256);
import/migração (preview, mapeamento, validação, dry-run, import); listagem/CRUD de pacientes; merge B-safe (ADR 0007);
export CSV/XLSX; retenção dry-run; equipe (invite, aprovação, membros, desativação); agenda administrativa;
prontuário v0.1 (encounters, notes, read-audit LGPD); documentos médicos v0.1 (PDF on-demand);
financeiro v0.1 backend + frontend (aba Financeiro; lista + cards resumo; criar/editar/detalhe; marcar pago; cancelar);
badge financeiro na agenda (5 estados), alertas A1–A4, botão "Criar cobrança" inline, link "Ver cobrança";
relatórios gerenciais v0.1 backend + frontend (aba Relatórios; hero "Resumo do período" + 4 blocos:
Agenda, Financeiro, Pacientes, Agenda × Financeiro; filtros Hoje/7d/Mês/Personalizado; frases
interpretativas por bloco; 403 por relatório vira card "Acesso restrito" intencional);
catálogo de serviços v0.1 backend + frontend (clinic_services + professional_services; CRUD owner-only;
leitura aberta para seletor de agenda; soft-delete; re-link idempotente; aba "Serviços" no Dashboard
visível a todos os papéis; seletor na Agenda filtra por profissional; seletor no Financeiro com botão
"Usar preço de tabela" explícito; `service_id` wired em appointments e financial_charges com validação
`service_not_available_for_professional` e `service_mismatch_with_appointment`).
Detalhe: `docs/project-state.md`.

**O que NÃO existe (sprint explícita):** frontend de catálogo de serviços (4.6C); wiring de
`service_id` em endpoints de appointments/financial (4.6C); export de relatórios (futuro com ADR própria);
gráficos complexos / BI customizável; convênios/carteirinha estruturada (4.7B+); delete físico de paciente;
undo completo de merge; limpeza real de arquivos; gateway de pagamento; ICP-Brasil; telemedicina; NFS-e.

**Migrações (16 aplicadas):** `20260520_init` · `20260521_audit_logs` · `20260522_import_files` ·
`20260523_import_sessions` · `20260524_patients` · `20260525_import_sessions_summary` ·
`20260526_scheduling` · `20260527_user_mfa` · `20260528_user_mfa_backup_codes` ·
`20260529_clinic_team` · `20260530_clinic_join_requests_revoked` · `20260601_patients_merged_into` ·
`20260602_clinical_encounters_v0` · `20260603_clinical_documents_v0` · `20260604_financial_charges_v0` ·
`20260605_clinic_services_v0`.

**Invariantes locais:** patients=6 (base, sem demo), import_files=24, import_sessions=7.
Seed demo: `pnpm --filter backend seed:demo` (+3 prof, +5 pac, +7 agend); reverter: `seed:demo:clean`.

**Usuários smoke persistentes (dev):** 5 `*@clinicbridge.local` na "Clinica Smoke Dev"; senha `SmokeDevOnly!23`.
`smoke.profissional` + `smoke.gestor` têm grants clínicos. **Não apagar entre sprints.**
Detalhes + recriação: `docs/testing-checklist.md` §"Usuários smoke persistentes".

## Direção estratégica

**Clinic OS modular** (ADR 0008). ClinicBridge evolui de migração administrativa para sistema modular de gestão clínica.
Sem telemedicina. Cada módulo clínico exige **ADR própria** antes de qualquer código.
Base administrativa segura primeiro (ADR 0001 Opção C). Gates: ADR 0008 + ADR 0009 §9.
Detalhe: `docs/adr/0008-clinicbridge-clinic-os-expansion.md`, `docs/product-clinic-os-roadmap.md`.

## Próximas prioridades

- **4.7A** ADR 0016 Convênios v0.1 (docs/ADR-only; gate: 4.6D ✅; detalhes em `docs/insurance-billing-future-scope.md`)
- **Trilha AWS (pausada):** gate de retomada = ADR 0010+0011+0012 aceitas ✅ + reavaliação RDS/EBS/KMS
- **P1 antes de prod:** S3 bucket real; banco/Redis gerenciados; WAF; deploy; `TRUST_PROXY`/`REDIS_URL` em prod
- **Trilha pacientes:** contagem de agendamentos no merge; paginação duplicados; undo/snapshot completo (ADR)
- **Trilha equipe:** saída voluntária; roles granulares (ADR própria)
- **P2:** limpeza real de arquivos; export streaming; rate limit GETs
- **P3:** antivírus; validação XLSX OPC/XML; observabilidade

Detalhes: `docs/roadmap-next-phase.md`.

## Restrições críticas em vigor (NÃO remover)

Detalhe completo: `docs/security-notes.md`.

- **Tenant:** sempre filtrar por `clinica_id`; `requireAuth + requireClinic` em todo endpoint tenant-scoped.
  Cross-tenant → 403; escritas de paciente → **404 genérico** `patient_not_found` (anti-enumeration).
  DAOs sem `listAll`. Sem delete físico (arquivar = `status='archived'`).

- **PII:** nunca expor CPF bruto (só `cpf_masked`). Logs/audit nunca contêm CPF/telefone/e-mail/nome/sha256/path.

- **Escopo clínico (ADR 0010 + 0011 + 0012):**
  - Prontuário: 4 tabelas clinicais; 5 campos (`chief_complaint`, `anamnesis`, `evolution`, `plan`, `internal_note`);
    profissional só vê os próprios; `internal_note` redacted para não-autor; dono/gestor leem com audit STRICT;
    secretaria/financeiro/admin_sistema → 403; notas append-only; sem delete físico.
  - Documentos: tabela `clinical_documents`; ciclo draft→finalized→canceled; PDF on-demand sem armazenamento;
    audit STRICT antes de servir conteúdo; sem ICP-Brasil.
  - Financeiro: tabela `financial_charges`; ciclo pending→paid|canceled; sem delete físico; módulo administrativo
    (usa `requireRole`, não `requireClinicalRole`); `notes` nunca contém diagnóstico/CID.
  - **Tudo fora desses escopos é proibido** sem nova ADR (CID estruturado, prescrição, exames, ICP-Brasil,
    telemedicina, IA clínica, TISS, medicamentos controlados).

- **audit_logs:** colunas reais = `acao/recurso/recurso_id/usuario_id/clinica_id/ip/user_agent/request_id/criado_em`.
  Não existem `metadata` nem `entidade_tipo`. Append-only no DAO.

- **Upload:** allowlist extensão + MIME real (magic bytes; XLSX exige ZIP PK + OOXML). Storage privado, nome aleatório, SHA-256.

- **Retenção:** dry-run apenas — **NÃO apaga nada**. Limpeza real é futura (ADR 0002).

- **Export:** read-only; neutraliza formula injection (`= + - @`); sem signed URL.

- **Rate limit:** IP-keyed, antes de `requireAuth`; 429 genérico. `RATE_LIMIT_STORE=memory|redis`.
  `TRUST_PROXY=false` por padrão (setar atrás de proxy).

- **errorHandler:** nunca retorna stack/SQL/path; 500 → `internal_error`.

- **requireRole:** `requireRole(CLINIC_ADMIN_ROLES)` gateia endpoints admin após `requireClinic`.
  Owner-only: import, export, archive/restore paciente, invite, aprovar membros, desativar membro,
  merge B-safe, leitura de audit clínico. Secretaria: upload, preview, criar/editar paciente,
  solicitar entrada (sem clínica). Papel vem do JWT (stale até expirar — documentado).

- **`requireClinic` faz DB check** (Sprint 3.25): busca `users`, exige `ativo=true` + `clinica_id` match.
  Desativação é efetiva imediatamente sem rotação de token. `papel` não é re-validado contra DB.

- **Vocabulário:** UI usa "funcionário(a)"/"equipe". Role técnica permanece `secretaria` no backend/JWT/DB.
  Não trocar sem migration/refactor. Roles granulares (`gestor_clinica`, `profissional_clinico`) conceituadas
  em ADR 0009, implementadas via `user_clinical_roles` (Sprint 4.2B).

- **Financeiro:** `effectiveFinancialAccess`: dono+secretaria=full; secretaria+gestor_clinica=transact;
  secretaria+profissional_clinico=none; profissional sempre bloqueado no serviço.

- **Limites MVP:** `IMPORT_MAX_ROWS=100` (intencional).

## Project identity

ClinicBridge é um SaaS de **gestão de clínicas com migração inteligente** em evolução para **Clinic OS modular** (ADR 0008).
Entregue hoje: base administrativa (pacientes, agendamento, equipe, import/export, merge, audit) + prontuário v0.1 + documentos médicos v0.1 + financeiro v0.1 (backend).
**NÃO é sistema de prontuário completo.** Cada módulo exige ADR própria.
Fora do escopo permanente: telemedicina; ICP-Brasil com força legal; TISS real; SNGPC/ANVISA; app mobile nativo.
Se uma tarefa tentar entrar nessas áreas sem ADR, **pare e peça confirmação.**

## Source of truth

Antes de implementar, leia `docs/ClinicBridge_Documentacao_Mestre.md`.
Se implementação e documentação conflitarem, **pergunte antes de escolher.**

## Preferred stack

- Backend: Node.js + Express + TypeScript · Frontend: React + Vite + TypeScript (TanStack Query; `/app` em abas)
- DB: PostgreSQL · Infra: Docker Compose · Package manager: pnpm

## Architecture rules (MVC + DAO + Service)

- **Controller:** recebe HTTP, valida input no edge, chama Services. NÃO executa SQL nem lógica pesada.
- **Service:** lógica de negócio; chama DAOs; testável sem camada web.
- **DAO:** acesso a banco; queries parametrizadas; **sempre** enforce `clinica_id`; sem delete físico em entidades sensíveis.
- **Frontend:** apresenta dados; não toma decisões de segurança.

## Multi-tenant rule

Toda tabela/operação tenant-scoped filtrada por `clinica_id`. Cross-tenant → 403. Nunca implementar acesso sem checagem de tenant.

## Security baseline

Segurança não é opcional. Sempre: autenticação; autorização; isolamento de tenant; upload seguro; audit logs; rate limits;
sem PII/segredos em logs; mensagens de erro seguras. Detalhe: `docs/security-notes.md`.

- **Senhas:** argon2id. **MFA:** TOTP (secret AES-GCM em repouso); backup codes (argon2, uso único). Detalhe: `docs/security-notes.md`.
- **DB:** nunca concatenar SQL com input; ORM/queries parametrizadas.
- **Frontend:** evitar `dangerouslySetInnerHTML`; sem stack traces ao usuário.
- **Secrets:** nunca commitar `.env`; `.env.example` só com placeholders.

## Upload rules

Tipos: `.csv`, `.xlsx`. Allowlist extensão + MIME real (magic bytes) + tamanho. Storage privado, nome aleatório, SHA-256.
Não implementar PDF/ZIP/imagem sem pedido explícito (documentos clínicos têm ADR 0011 própria).

## LGPD posture

Minimização; retenção limitada; aceite de termos; export; auditabilidade; limitação de finalidade; logging seguro.
Prefira "dados pessoais do paciente" / "dados administrativos". Evite implicar diagnóstico/prescrição/prontuário.

## Coding standards

TypeScript strict. Arquivos pequenos; DTOs explícitos; tratamento de erro centralizado; respostas API consistentes.
Evite: controllers gigantes; lógica em rotas; DB em controllers; `any` amplo; catches silenciosos; logar dados sensíveis.

## Project structure

`/backend/src` → config, models, dao, services, controllers, routes, middlewares, utils.
`/frontend/src` → views, components, services, hooks, utils, main.tsx, App.tsx.
`/docs`, `/.claude/agents`, `docker-compose.yml`, `.env.example`.

## Development workflow

Antes de editar: inspecione arquivos relevantes; explique o plano; mantenha escopo.
Depois: resuma mudanças; liste comandos; mencione riscos/TODOs; **não** afirme que testes passaram sem ter rodado.
Incremental; sem over-engineering; sem features futuras cedo.

## Commands

```bash
# Setup
cp .env.example .env && pnpm install && docker compose up -d
curl http://localhost:3001/health

# Backend (porta 3001)
pnpm --filter backend dev | build | start | typecheck
pnpm --filter backend migrate:latest | migrate:rollback | migrate:status

# Frontend (Vite, porta 5173)
pnpm --filter frontend dev | build | preview | typecheck

# Infra
docker compose up -d | down | config
```

Env vars: fonte de verdade = `.env.example`. Detalhe por sprint: `docs/sprint-history.md`.
Smoke tests / SQL / curl: `docs/testing-checklist.md`.

## Git behavior

Não commitar automaticamente. Quando pedirem commit: mostrar arquivos alterados; resumir mudanças; sugerir mensagem.

## Communication style

Direto e prático: implementado / ainda não / risco / próximo passo / bloqueado porque.
Evite linguagem inflada. Descreva o ClinicBridge como: sistema de gestão de clínicas com migração inteligente,
Clinic OS modular em evolução (ADR 0008); base administrativa hoje + módulos clínicos por ADR; sem telemedicina.

## Token and subagent usage policy

Subagents são caros — **não** usar automaticamente.

- Padrão: revisão interna curta, só arquivos alterados; foco em crítico/alto risco; sem scan amplo.
- **Perguntar antes** quando a tarefa toca: autenticação; autorização; tenant; uploads; LGPD/PII; schema; middleware de segurança.
- Usar **sem perguntar** só se o usuário disser explicitamente: "chame os agents" / "rode security-reviewer" / etc.
- Orçamento: revisões de rotina < 3k tokens; revisão ampla só no fim de sprints importantes.
