# CLAUDE.md — ClinicBridge

> Guia operacional. Para detalhes use os docs abaixo — não duplicate aqui.
> **Estado detalhado + componentes por sprint:** `docs/project-state.md`
> **Histórico de sprints:** `docs/sprint-history.md`
> **Segurança + P1/P2/P3:** `docs/security-notes.md`
> **Checklist testes + smoke users:** `docs/testing-checklist.md`
> **Fonte de verdade produto/arquitetura/STRIDE/LGPD:** `docs/ClinicBridge_Documentacao_Mestre.md`
> **Roadmap Clinic OS:** `docs/product-clinic-os-roadmap.md`
> **Próximas prioridades:** `docs/roadmap-next-phase.md`
> **Piloto:** `docs/pilot-controlled-plan.md` · `docs/pilot-go-no-go-checklist.md`
> **Demo:** `docs/demo-dataset.md`
> **ADRs:** `docs/adr/` (0001–0017)
> **Runbooks:** `docs/backup-restore-local-runbook.md`, `docs/dns-tls-staging-runbook.md`, `docs/secrets-env-production-runbook.md`
> **Prod/AWS:** `docs/production-minimum-plan.md`, `docs/aws-infra-sprint-3.41-plan.md`

## Estado atual (2026-05-28)

**Entregue (landing/demo/Auri/mobile):** 5.0E–5.0I — Demo Experience, tour Auri, landing demo em destaque, teaser+bolinha, nav mobile compacto, CLAUDE.md slimming. Ver `docs/project-state.md`.
**Sprint atual:** 6.0A (entregue) — **Agenda madura v0.1 pré-piloto.** Anti-overlap por profissional (`scheduled`/`confirmed`/`rescheduled` bloqueiam; `cancelled`/`completed`/`no_show` liberam; sem profissional → sem checagem) em create/reschedule/updateStatus → **409 `appointment_time_conflict`** sem PII; **sem migration** (checagem no service; janela de corrida documentada). Filtro `service_id` no list; frontend ganha filtro de serviço, "Limpar filtros", serviço no card e mensagem amigável de conflito. Permissões da agenda **inalteradas**. Agenda×Financeiro/Serviços preservados. Validação visual pendente no navegador. Ver `docs/project-state.md` + `docs/sprint-history.md` + `docs/administrative-scheduling-scope.md` §9.
**Próxima sprint:** 5.1D spike sandbox (Asaas vs Stripe) ou continuação 6.0 (piloto familiar).
**Depois:** 5.1E QA/security billing · **5.2A** ADR Produção Segura AWS (renumerada de 5.1A; obrigatória antes de dados reais e de cobrança real).

**Fase:** Fase 3 (produção/governança). **NÃO pronto para produção com dados reais** — ver `docs/security-notes.md`.
**Piloto controlado:** GO Fase 1 com dados sintéticos. Demo Aurora = 100% fictícia.
**AWS:** provedor preferido; trilha pausada até 5.1A.

### Módulos entregues (resumo)

auth (JWT, MFA/TOTP, backup codes, rate limit, audit) · upload CSV/XLSX (magic bytes, SHA-256) ·
import/migração (preview, mapeamento, validação, dry-run, commit) · pacientes CRUD + merge B-safe + export + retenção dry-run ·
equipe (invite, aprovação, desativação) · agenda administrativa ·
prontuário v0.1 (encounters, notes, read-audit LGPD) · documentos médicos v0.1 (PDF on-demand) ·
financeiro v0.1 (charges, summary, mark-paid, cancel; badge agenda 5 estados, alertas A1–A4) ·
relatórios v0.1 (4 endpoints + ReportsPanel; filtros período; 403-por-bloco intencional) ·
catálogo de serviços v0.1 (clinic_services, professional_services; seletor agenda/financeiro) ·
convênios v0.1 (providers, plans, patient_insurances, service_prices; payer_type no financeiro; PII member_number mascarado) ·
estoque v0.1 (items, movements; SELECT FOR UPDATE; low_stock badge; magnitude+direção) ·
demo guiada/Auri (tour 8 passos, GuidedDemoTour, barra demo, write-block frontend, POST /auth/demo-login env-gated) ·
landing + /demo (DemoCallout, LandingAuriTeaser, hierarquia CTAs: "Ver demo guiada" primário).

**Fora do escopo permanente (não implementar sem nova ADR):** telemedicina · ICP-Brasil · TISS/TUSS real · NFS-e · gateway de pagamento · app mobile · CID estruturado · prescrição eletrônica legal · IA clínica · SNGPC/ANVISA.

### Migrações (19 aplicadas)

`20260520_init` · `20260521_audit_logs` · `20260522_import_files` · `20260523_import_sessions` ·
`20260524_patients` · `20260525_import_sessions_summary` · `20260526_scheduling` · `20260527_user_mfa` ·
`20260528_user_mfa_backup_codes` · `20260529_clinic_team` · `20260530_clinic_join_requests_revoked` ·
`20260601_patients_merged_into` · `20260602_clinical_encounters_v0` · `20260603_clinical_documents_v0` ·
`20260604_financial_charges_v0` · `20260605_clinic_services_v0` · `20260606_insurance_billing_v0` · `20260607_inventory_v0` · `20260608_billing_v0`.

### Seeds / demo / smoke

- **Smoke:** 5 `*@clinicbridge.local` na "Clinica Smoke Dev"; senha `SmokeDevOnly!23`. `smoke.profissional` + `smoke.gestor` têm grants clínicos. **Não apagar entre sprints.** Detalhes: `docs/testing-checklist.md`.
- **Demo agenda:** `pnpm --filter backend seed:demo` · reverter: `seed:demo:clean`.
- **Demo completo:** `ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full` (Clínica Demo Aurora — 20 pac, 20 appt, 12 cobranças, convênios, estoque) · reverter: `seed:demo:full:clean`. Detalhes: `docs/demo-dataset.md`.
- **Demo guiada:** `ALLOW_DEMO_LOGIN=true` habilita `POST /auth/demo-login`; auto-login no `demo.owner@clinicbridge.local`; recusa em `NODE_ENV=production`. Exige seed acima.
- **Invariantes locais (dev):** patients=6 (base, sem demo), import_files=24, import_sessions=7.

## Direção estratégica

**Clinic OS modular** (ADR 0008). ClinicBridge evolui de migração administrativa para sistema modular de gestão clínica. Sem telemedicina. **Cada módulo clínico exige ADR própria antes de qualquer código.** Base administrativa segura primeiro (ADR 0001 Opção C). Gates: ADR 0008 + ADR 0009 §9. Detalhe: `docs/product-clinic-os-roadmap.md`.

## Próximas prioridades

- **5.1B–E:** Billing/entitlements — backend (mock) · frontend · spike sandbox (Asaas vs Stripe) · QA/security. ADR 0018.
- **5.2A:** ADR Produção Segura AWS — obrigatória antes de qualquer dado real e de cobrança real
- **Camada comercial (invariantes ADR 0018):** plano por tenant (não por usuário); entitlements validados no backend; estado só muda por webhook verificado (nunca pelo frontend); soft-lock nunca sequestra dados; sem dado de cartão; billing não vaza PII clínica; webhook idempotente + tenant resolvido por mapa interno
- **P1 antes de prod:** S3 bucket real; banco/Redis gerenciados; WAF; deploy; `TRUST_PROXY`/`REDIS_URL` em prod
- **Trilha pacientes:** contagem agendamentos no merge; paginação duplicados; undo/snapshot (ADR própria)
- **Trilha equipe:** saída voluntária; roles granulares (ADR própria)
- **P2:** limpeza real de arquivos; export streaming; rate limit GETs
- **P3:** antivírus; validação XLSX OPC/XML; observabilidade

Detalhe: `docs/roadmap-next-phase.md`.

## Restrições críticas (NÃO remover)

Detalhe completo: `docs/security-notes.md`.

- **Tenant:** sempre filtrar por `clinica_id`; `requireAuth + requireClinic` em todo endpoint tenant-scoped. Cross-tenant → 403; escritas de paciente → **404 genérico** `patient_not_found` (anti-enumeration). DAOs sem `listAll`. Sem delete físico (arquivar = `status='archived'`).

- **PII:** nunca expor CPF bruto (só `cpf_masked`). Logs/audit nunca contêm CPF/telefone/e-mail/nome/sha256/path.

- **Escopo clínico (ADR 0010 + 0011 + 0012):**
  - Prontuário: 4 tabelas clinicais; 5 campos (`chief_complaint`, `anamnesis`, `evolution`, `plan`, `internal_note`); profissional só vê os próprios; `internal_note` redacted para não-autor; dono/gestor leem com audit STRICT; secretaria/financeiro/admin_sistema → 403; notas append-only; sem delete físico.
  - Documentos: `clinical_documents`; ciclo draft→finalized→canceled; PDF on-demand sem armazenamento; audit STRICT antes de servir conteúdo; sem ICP-Brasil.
  - Financeiro: `financial_charges`; ciclo pending→paid|canceled; sem delete físico; usa `requireRole` (não `requireClinicalRole`); `notes` nunca contém diagnóstico/CID.
  - **Tudo fora desses escopos é proibido** sem nova ADR (CID estruturado, prescrição, exames, ICP-Brasil, telemedicina, IA clínica, TISS, medicamentos controlados).

- **audit_logs:** colunas reais = `acao/recurso/recurso_id/usuario_id/clinica_id/ip/user_agent/request_id/criado_em`. Não existem `metadata` nem `entidade_tipo`. Append-only no DAO.

- **Upload:** allowlist extensão + MIME real (magic bytes; XLSX exige ZIP PK + OOXML). Storage privado, nome aleatório, SHA-256.

- **Retenção:** dry-run apenas — **NÃO apaga nada**. Limpeza real é futura (ADR 0002).

- **Export:** read-only; neutraliza formula injection (`= + - @`); sem signed URL.

- **Rate limit:** IP-keyed, antes de `requireAuth`; 429 genérico. `RATE_LIMIT_STORE=memory|redis`. `TRUST_PROXY=false` por padrão (setar atrás de proxy).

- **errorHandler:** nunca retorna stack/SQL/path; 500 → `internal_error`.

- **requireRole:** `requireRole(CLINIC_ADMIN_ROLES)` gateia endpoints admin após `requireClinic`. Owner-only: import, export, archive/restore paciente, invite, aprovar membros, desativar membro, merge B-safe, leitura audit clínico. Secretaria: upload, preview, criar/editar paciente, solicitar entrada (sem clínica). Papel vem do JWT (stale até expirar — documentado).

- **`requireClinic` faz DB check** (Sprint 3.25): busca `users`, exige `ativo=true` + `clinica_id` match. Desativação efetiva imediatamente sem rotação de token. `papel` não re-validado contra DB.

- **Vocabulário:** UI usa "funcionário(a)"/"equipe". Role técnica permanece `secretaria` no backend/JWT/DB. Não trocar sem migration/refactor. Roles granulares (`gestor_clinica`, `profissional_clinico`) via `user_clinical_roles` (Sprint 4.2B).

- **Financeiro:** `effectiveFinancialAccess`: dono+secretaria=full; secretaria+gestor_clinica=transact; secretaria+profissional_clinico=none; profissional sempre bloqueado no serviço.

- **Limites MVP:** `IMPORT_MAX_ROWS=100` (intencional).

## Project identity

ClinicBridge é SaaS de **gestão de clínicas com migração inteligente** em evolução para **Clinic OS modular** (ADR 0008). **NÃO é sistema de prontuário completo.** Cada módulo exige ADR própria.
Fora do escopo permanente: telemedicina; ICP-Brasil com força legal; TISS real; SNGPC/ANVISA; app mobile nativo.
Se uma tarefa tentar entrar nessas áreas sem ADR, **pare e peça confirmação.**

## Source of truth

Antes de implementar, leia `docs/ClinicBridge_Documentacao_Mestre.md`. Se implementação e documentação conflitarem, **pergunte antes de escolher.**

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

Segurança não é opcional. Sempre: autenticação; autorização; tenant isolation; upload seguro; audit logs; rate limits; sem PII/segredos em logs; erros seguros. Detalhe: `docs/security-notes.md`.

- **Senhas:** argon2id. **MFA:** TOTP (secret AES-GCM em repouso); backup codes (argon2, uso único).
- **DB:** nunca concatenar SQL com input; queries parametrizadas.
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
Evite linguagem inflada. Descreva o ClinicBridge como: sistema de gestão de clínicas com migração inteligente, Clinic OS modular em evolução (ADR 0008); base administrativa hoje + módulos clínicos por ADR; sem telemedicina.

## Token and subagent usage policy

Subagents são caros — **não** usar automaticamente.

- Padrão: revisão interna curta, só arquivos alterados; foco em crítico/alto risco; sem scan amplo.
- **Perguntar antes** quando a tarefa toca: autenticação; autorização; tenant; uploads; LGPD/PII; schema; middleware de segurança.
- Usar **sem perguntar** só se o usuário disser explicitamente: "chame os agents" / "rode security-reviewer" / etc.
- Orçamento: revisões de rotina < 3k tokens; revisão ampla só no fim de sprints importantes.
