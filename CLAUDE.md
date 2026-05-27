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
> - **Convênios/faturamento básico (futuro — Fase 4.6):** `docs/insurance-billing-future-scope.md`
> - **Documentos Médicos v0.1:** ADR `docs/adr/0011-medical-documents-prescriptions-v0.md` · `docs/medical-documents-v0-scope.md`
> - **Prontuário v0.1:** ADR `docs/adr/0010-clinical-encounters-medical-record-v0.md` · `docs/clinical-encounters-v0-scope.md`
> - **Arquitetura clínica + roles + audit:** ADR `docs/adr/0009-clinical-architecture-roles-read-audit.md` · `docs/clinical-architecture-and-permissions.md`
> - **Outros ADRs (0001–0009):** `docs/adr/`
> - **Runbooks (backup/DNS/TLS/Nginx/secrets/AWS):** `docs/backup-restore-local-runbook.md`, `docs/backup-offsite-runbook.md`, `docs/dns-tls-staging-runbook.md`, `docs/secrets-env-production-runbook.md`, `docs/aws-provisioning-runbook-3.41B.md`
> - **Planos de prod/infra AWS:** `docs/production-minimum-plan.md`, `docs/aws-infra-sprint-3.41-plan.md`

## Estado atual (atualizado 2026-05-27)

**Sprint atual: 4.4E-D** (entregue) — **QA/Hardening Agenda × Financeiro v0.1.**
Code review segurança PASS (13/13 checks); smoke API 24/24 PASS real (5 papéis); SQL invariants 9/9;
audit logs verificados; cleanup cobrança sintética; docs finais.
Ressalvas: "Ver cobrança" navega para aba mas sem seleção automática; badge limit=100.
`pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ · `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅ · `migrate:status` 15/0 ✅ · `git diff --check` rc=0.
Detalhe: `docs/project-state.md`.

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

**Sprints anteriores recentes (detalhes em `docs/sprint-history.md`):**
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
4.0–4.4E-D ✅ → **4.5** relatórios (ADR 0014) →
**4.6** convênios/faturamento básico → **4.7** estoque básico.
Cada fase nova exige ADR própria. Detalhe: `docs/product-clinic-os-roadmap.md`.

**Fase:** Fase 3 (produção/governança). **NÃO está pronto para produção** — ver P1 em `docs/security-notes.md`.
**AWS** é o provedor preferido; trilha pausada estrategicamente — ver `docs/production-minimum-plan.md`.

**O que existe:** auth (JWT, MFA/TOTP, backup codes, rate limit, audit); upload CSV/XLSX (magic bytes, SHA-256);
import/migração (preview, mapeamento, validação, dry-run, import); listagem/CRUD de pacientes; merge B-safe (ADR 0007);
export CSV/XLSX; retenção dry-run; equipe (invite, aprovação, membros, desativação); agenda administrativa;
prontuário v0.1 (encounters, notes, read-audit LGPD); documentos médicos v0.1 (PDF on-demand);
financeiro v0.1 backend + frontend (aba Financeiro; lista + cards resumo; criar/editar/detalhe; marcar pago; cancelar);
badge financeiro na agenda (5 estados), alertas A1–A4, botão "Criar cobrança" inline, link "Ver cobrança".
Detalhe: `docs/project-state.md`.

**O que NÃO existe (sprint explícita):** relatórios gerenciais (4.5A+); convênios/carteirinha estruturada (4.6A+);
delete físico de paciente; undo completo de merge; limpeza real de arquivos; gateway de pagamento; ICP-Brasil; telemedicina; NFS-e.

**Migrações (15 aplicadas):** `20260520_init` · `20260521_audit_logs` · `20260522_import_files` ·
`20260523_import_sessions` · `20260524_patients` · `20260525_import_sessions_summary` ·
`20260526_scheduling` · `20260527_user_mfa` · `20260528_user_mfa_backup_codes` ·
`20260529_clinic_team` · `20260530_clinic_join_requests_revoked` · `20260601_patients_merged_into` ·
`20260602_clinical_encounters_v0` · `20260603_clinical_documents_v0` · `20260604_financial_charges_v0`.

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

- **4.5** relatórios gerenciais v0.1 (ADR 0014)
- **4.6A** ADR 0015 Convênios v0.1 (gate: 4.4E entregue; planejamento em `docs/insurance-billing-future-scope.md`)
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
