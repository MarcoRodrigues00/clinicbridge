# CLAUDE.md — ClinicBridge

> Arquivo curto e operacional. Histórico longo e detalhes ficam nos docs:
> - **Estado detalhado / invariantes:** `docs/project-state.md`
> - **Histórico das sprints (1.5 → 2.26):** `docs/sprint-history.md`
> - **Segurança detalhada + ressalvas P1/P2/P3:** `docs/security-notes.md`
> - **Política de retenção e governança de dados:** `docs/data-retention-policy.md` (+ ADR `docs/adr/0002-data-retention-governance.md`)
> - **Estratégia de backup/restore (Restic-first):** `docs/backup-restore-strategy.md` (+ ADR `docs/adr/0003-backup-restore-strategy.md`)
> - **Runbook backup/restore local (scripts em `scripts/`):** `docs/backup-restore-local-runbook.md`
> - **Runbook backup OFFSITE Restic + S3 (Sprint 3.40; scripts `*-offsite-restic.sh`; IAM mínimo; retenção documentada; restore drill remoto):** `docs/backup-offsite-runbook.md`
> - **Checklist de deploy seguro / CORS / env prod:** `docs/deploy-security-checklist.md` (+ ADR `docs/adr/0004-deploy-security-baseline.md`)
> - **Estratégia de borda (Nginx reverse proxy + WAF):** `docs/edge-security-strategy.md` (+ ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md`)
> - **Plano de produção mínima segura (AWS preferido; gaps P0/P1/P2; sprints 3.37–3.43; decisões pendentes):** `docs/production-minimum-plan.md`
> - **Plano operacional de infra AWS Sprint 3.41B (EC2+Compose; 7 decisões; checklist 6 fases; custo ~$47-56/mês seguro):** `docs/aws-infra-sprint-3.41-plan.md`
> - **Runbook de provisionamento AWS real Sprint 3.41B (passo a passo; Console+CLI; billing; SG; RDS; EC2; EBS; SSM; Certbot; smoke tests; drill):** `docs/aws-provisioning-runbook-3.41B.md`
> - **Runbook DNS/TLS/Nginx para staging+produção (Sprint 3.38; Registro.br → Certbot → testes):** `docs/dns-tls-staging-runbook.md` (templates: `infra/nginx/conf.d/clinicbridge.{production,staging}.conf.example`)
> - **Runbook de secrets/env de produção (Sprint 3.39; geração de secrets, SSM, injeção, rotação):** `docs/secrets-env-production-runbook.md`
> - **Agenda Administrativa (backend 3.14 + frontend 3.15; lembrete manual/wa.me 3.18; WhatsApp API futuro; não clínico):** `docs/administrative-scheduling-scope.md` (+ ADR `docs/adr/0006-administrative-scheduling-module.md`)
> - **Merge seguro de duplicados (B-safe; decidido 3.32, backend 3.33, UX 3.34, validado 3.35; administrativo, sem delete físico, sem undo completo):** ADR `docs/adr/0007-safe-patient-duplicate-resolution.md`
> - **Expansão para Clinic OS modular (Sprint 4.0; sem telemedicina; migração como diferencial; ADR própria por módulo; trilha AWS pausada estrategicamente):** ADR `docs/adr/0008-clinicbridge-clinic-os-expansion.md` + roadmap `docs/product-clinic-os-roadmap.md`
> - **Arquitetura clínica + roles granulares + audit de leitura + LGPD clínica (Sprint 4.1, docs/ADR-only; bloqueia 4.2+; gate de retomada AWS atualizado):** ADR `docs/adr/0009-clinical-architecture-roles-read-audit.md` + operacional `docs/clinical-architecture-and-permissions.md`
> - **Prontuário/Atendimento clínico v0.1 — escopo do módulo (Sprint 4.2A, docs/ADR-only; autoriza Sprint 4.2B; sem migration/endpoint ainda; cifra a nível de coluna fora do v0.1 — decisão revisável):** ADR `docs/adr/0010-clinical-encounters-medical-record-v0.md` + operacional `docs/clinical-encounters-v0-scope.md`
> - **Runbook Nginx + backend containerizado local/staging (`infra/nginx/`, `backend/Dockerfile`, profile `edge`):** `docs/nginx-local-staging-runbook.md`
> - **Demo/piloto v0.1 (Sprint 3.20; dados fictícios, não clínico):** `docs/demo-data/README.md` (+ `docs/demo-data/pacientes-demo.csv`), `docs/demo-pilot-v0.1-script.md`, `docs/demo-pilot-v0.1-checklist.md` — seed dev-only de agenda: `backend/scripts/seed-demo-scheduling.ts` (`pnpm --filter backend seed:demo` / `seed:demo:clean`)
> - **Checklist de testes (build/curl/SQL/responsivo):** `docs/testing-checklist.md`
> - **Fonte de verdade de produto/arquitetura/STRIDE/LGPD:** `docs/ClinicBridge_Documentacao_Mestre.md`

## Estado atual (resumido — atualizado 2026-05-26)

**Sprint atual: 4.2D** (entregue) — **Hardening/QA clínico final do Prontuário v0.1.**
QA de segurança, logs, audit e dados sintéticos antes de avançar para Fase 4.3.
**Sem código novo, sem migrations, sem env vars, sem AWS, sem dado clínico real.**

**Validações confirmadas (análise estática + inspeção de DB):**
- **Logger redaction:** 4 camadas em `logger.ts` cobrem os 7 campos clínicos
  (`chief_complaint`, `anamnesis`, `evolution`, `plan`, `internal_note`,
  `cancel_reason_text`, `rectification_reason_text`) e `paciente_id`.
  Nenhum controller/service loga payload clínico diretamente (grep confirmado).
- **Clinical read audit:** 3 categorias corretas (`clinical.encounter.read`
  com `paciente_id`, `clinical.encounter.list` sem, `clinical.timeline.list`
  com). Strict mode (`CLINICAL_READ_AUDIT_STRICT`) aborta antes de serializar
  conteúdo clínico se audit falhar. `audit_logs` administrativos nunca recebem
  conteúdo clínico.
- **Permissões:** `dono_clinica` lê sem grant explícito; precisa de grant
  `profissional_clinico` para escrever. `gestor_clinica` lê somente. `secretaria`
  e `admin_sistema` bloqueados via `requireClinicalRole` (403 `forbidden_role`).
  profA não vê encounters de profB (DAO self-filter `attending_user_id_self`).
  `internal_note` redactado via helper único `applyInternalNoteRedaction`.
- **Frontend:** sem `console.log`, sem `localStorage`/`sessionStorage` com dado
  clínico (JWT em `localStorage` é o padrão do MVP); sem `dangerouslySetInnerHTML`;
  sem dado clínico em URL/query string. `internal_note null` → oculto. `staleTime: 0`.
- **Dados sintéticos:** 2 encounters + 3 notes de QA deletados do dev DB (SQL
  direto, autorizados por serem dados sintéticos de dev). 14 `clinical_read_audit`
  rows preservados (sem conteúdo clínico — só metadados de auditoria). 1 grant
  `user_clinical_roles` preservado (permissão funcional).

**Verificação:** `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend
build` ✅ · `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅ ·
`git diff --check` rc=0 · `git status --short` limpo.

**Sprint anterior: 4.2C** (entregue) — **Frontend do Prontuário v0.1.**
`ClinicalPatientPane` (drawer, máquina de estados timeline→detail→new-encounter→new-note),
`ClinicalRolesPanel` (owner-only grants), botão "Prontuário" no `PatientsList`.

**Sprint anterior: 4.2B-3** (entregue) — **controllers + rotas clínicas +
logger redaction + smoke tests do Prontuário v0.1.** Rotas registradas em
`app.ts` com pipeline
`rateLimit → requireAuth → requireClinic → (requireClinicalRole | requireRole)`:
`POST/GET /clinical/encounters`, `GET /clinical/encounters/:id`,
`PATCH /clinical/encounters/:id/cancel`, `POST /clinical/encounters/:id/notes`,
`GET /patients/:id/clinical-timeline`, `GET/POST /clinical/roles[/grant|/revoke]`.
`logger.ts` estendido com 4 camadas (top-level, `*.field`, `body/req.body/payload.<field>`,
`body/req.body/payload.initial_note.<field>`). Smoke 76/76 PASS.

**Sprint anterior: 4.2B-2** (entregue) — camada interna: 4 DAOs + 1 middleware
`requireClinicalRole` + 4 services; separação metadata-list × content-read;
`clinicalReadAuditService` strict/best-effort via `CLINICAL_READ_AUDIT_STRICT`.

**Sprint anterior: 4.2B-1** (entregue) — migration `20260602000000_clinical_encounters_v0.ts`
(4 tabelas, 13 CHECK constraints, 14 índices) + tipos `db.d.ts` + env guard
`CLINICAL_READ_AUDIT_STRICT`.

**Sprint anterior: 4.2A** (entregue — docs/ADR-only) — ADR 0010 + operacional
`docs/clinical-encounters-v0-scope.md`. Define os 5 campos textuais clínicos,
4 tabelas, audit de leitura com fail-closed em prod. Autorizou a 4.2B.

**Sprint anterior: 4.1** (entregue — docs/ADR-only) — arquitetura clínica
conceitual + roles granulares + audit de leitura + LGPD clínica (ADR 0009).
Sprint 4.1.1 — correção LGPD/segurança no `paciente_id`.

**Sprint anterior: 4.0** (entregue — docs/ADR-only) — expansão estratégica
para Clinic OS modular (ADR 0008).

**Fases Clinic OS planejadas:** 4.0 ✅ decisão → **4.1 ✅** ADR 0009 →
**4.2A ✅** ADR 0010 → **4.2B-1 ✅** base técnica → **4.2B-2 ✅** camada
interna → **4.2B-3 ✅** controllers + rotas + smoke 76/76 PASS → **4.2C ✅**
frontend (drawer, roles panel, botão Prontuário) → **4.2D ✅** QA/hardening
(logs, audit, permissões, dados sintéticos, docs) → **4.2B-4** (opcional —
endpoint LGPD-art.18 de auditoria de leitura) → **4.3** documentos
médicos/receitas (sem ICP-Brasil) → **4.4** financeiro → **4.5** relatórios
gerenciais → **4.6** convênios/faturamento básico (TISS/TUSS real fora) →
**4.7** estoque básico (medicamentos controlados/ANVISA fora). Cada **fase
nova** exige ADR própria. Detalhe: `docs/product-clinic-os-roadmap.md`.

**Fase:** Fase 3 (produção/governança). **Este MVP NÃO está pronto para produção** — ver P1 em
`docs/security-notes.md`. Nunca descrever como "pronto para produção".

**AWS é o provedor preferido** para deploy futuro (decisão 2026-05-24). Sem deploy real até o
checklist mínimo de produção segura ser cumprido — ver `docs/production-minimum-plan.md`.

**Equipe / Agenda:**
- **Equipe** = centro de pessoas da clínica: (1) membros com login (acesso ao sistema),
  (2) profissionais da agenda (cadastro administrativo; podem ou não ter login). Aba owner-only.
- **Agenda** consome profissionais ativos cadastrados em Equipe via cache `['clinic-professionals']`.
  Backend/rotas/permissões de `clinic_professionals` **não mudam** ao reorganizar as abas.

**O que existe:** auth (JWT, MFA/TOTP + backup codes, rate limit, audit); upload CSV/XLSX
(magic bytes, SHA-256); preview/mapeamento/validação full-file; sessões de migração; dry-run /
mark-ready / import; recibo persistido; listagem de pacientes (CPF mascarado); CRUD
administrativo de pacientes (criar/editar/arquivar/restaurar, soft-delete — 3.22); tela de
duplicados acionável (editar/arquivar/restaurar — 3.23); merge B-safe de duplicados (backend
3.33 + frontend validado 3.34; ADR 0007); export CSV/XLSX (formula injection neutralizada);
retenção dry-run (backend + painel); responsividade mobile; trilha Equipe completa (3.24–3.31:
invite, aprovação, copy "funcionário(a)", membros, desativar acesso, regenerar código,
ConfirmDialog, hardening concorrência); Agenda administrativa (3.14–3.15); Nginx reverse proxy
local/staging + TLS autoassinado (3.9–3.11); Dockerfile `NODE_ENV=production` runtime (3.38);
guards de boot env.ts (3.39); scripts + runbook de backup offsite Restic→S3 (3.40, sem
bucket real). Detalhe e endpoints: `docs/project-state.md`.

**O que NÃO existe (precisa sprint explícita):** prontuário/dados clínicos; delete físico de
paciente; undo completo do merge (sem snapshot de campos antigos nem de appointments movidos);
seleção campo-a-campo no merge; contagem de agendamentos por paciente na UI; lookup do nome do
principal no badge "Mesclado em outro registro"; limpeza real de arquivos; signed URL/download;
job/cron; gestão de usuários/papéis na UI.

**Migrações (em ordem):** `20260520_init` · `20260521_audit_logs` · `20260522_import_files` ·
`20260523_import_sessions` · `20260524_patients` · `20260525_import_sessions_summary` ·
`20260526_scheduling` · `20260527_user_mfa` · `20260528_user_mfa_backup_codes` ·
`20260529_clinic_team` · `20260530_clinic_join_requests_revoked` ·
`20260601_patients_merged_into` · `20260602_clinical_encounters_v0`.

**Invariantes locais (sanity-check):** patients=6 (base, sem demo), import_files=24,
import_sessions=7. Seed demo: `pnpm --filter backend seed:demo` (+3 prof, +5 pac,
+7 agend, `origem='seed_demo'`); reverter com `seed:demo:clean`.
Reconfirme via `docs/testing-checklist.md`.

## Direção estratégica (atualizada 2026-05-25)

**Decisão atual: Clinic OS modular** (ADR 0008, Sprint 4.0) + **arquitetura
clínica e roles definidas conceitualmente** (ADR 0009, Sprint 4.1). O
ClinicBridge evolui de "ponte de migração administrativa" para **sistema
modular de gestão clínica**, mantendo migração como diferencial permanente.
**Sem telemedicina** no escopo. Cada módulo clínico (prontuário, documentos,
financeiro, relatórios, convênios, estoque) exige **ADR própria** antes de
qualquer código.

**Continua válido (não substituído):** base administrativa segura primeiro
(ADR 0001 Opção C — pré-requisito para Fase 4.1+); critérios de gating clínico
do ADR 0001 + ADR 0008 + gates adicionais da ADR 0009 §9. **Não codar
prontuário/prescrição/dados clínicos sem ADR de módulo (0010+) aprovada.**

Detalhe e princípios invariantes: `docs/adr/0008-clinicbridge-clinic-os-expansion.md`,
`docs/adr/0009-clinical-architecture-roles-read-audit.md`,
`docs/clinical-architecture-and-permissions.md` (matriz de permissões
conceitual e audit de leitura). Sequência de fases administrativas:
`docs/roadmap-next-phase.md`. Sequência de fases Clinic OS:
`docs/product-clinic-os-roadmap.md`.

## Próximas prioridades

- **Trilha Clinic OS (Fase 4):** **4.0 ✅** ADR de expansão → **4.1 ✅** ADR 0009
  + matriz de permissões + audit de leitura + threat model clínico → **4.2A ✅**
  ADR 0010 escopo Prontuário v0.1 → **4.2B-1 ✅** base técnica (migration +
  tipos + env guard `CLINICAL_READ_AUDIT_STRICT`) → **4.2B-2 ✅** camada interna
  (DAOs, middleware `requireClinicalRole`, services base; sem rotas) →
  **4.2B-3 ✅** controllers + rotas + logger redaction 4 camadas + smoke 76/76 PASS
  → **4.2C ✅** frontend (drawer `ClinicalPatientPane`, painel `ClinicalRolesPanel`,
  botão Prontuário em PatientsList; typecheck/build ✅) → **4.2D ✅** QA/hardening
  (logs validados, audit validado, permissões validadas, dados sintéticos limpos,
  docs atualizados; zero mudanças de código) → **4.2B-4** (próximo
  passo opcional — endpoint owner-only para listar audit de leitura
  clínica/transparência LGPD-art.18, ou pular direto para a Fase 4.3 se
  jurídico priorizar receitas) → **4.3** documentos médicos/receitas v0.1
  (sem ICP-Brasil) → **4.4** financeiro v0.1 → **4.5** relatórios gerenciais
  v0.1 → **4.6** convênios/faturamento básico v0.1 (TISS/TUSS real fora) →
  **4.7** estoque básico v0.1 (medicamentos controlados/ANVISA fora).
  **Fases futuras (sem número):** IA clínica assistiva (depois de 4.2 madura),
  assinatura digital ICP-Brasil (depois de 4.3 madura), TISS/TUSS real (depois
  de 4.6), SNGPC/ANVISA (depois de 4.7). Cada **fase nova** = ADR própria.
  Detalhe: `docs/product-clinic-os-roadmap.md`.
- **Trilha AWS (pausada estrategicamente):** **3.41A ✅** plano operacional →
  **3.41B-0 ✅** runbook executável → **3.41B** execução real ⏸️ → **3.42** go/no-go ⏸️
  → **3.43** piloto ⏸️. Gate de retomada atualizado pela ADR 0009 §10:
  **ADR 0010 (prontuário v0.1) aceita** + reavaliação de dimensionamento
  RDS/EBS/KMS para dados clínicos + decisão sobre KMS CMK dedicada para cifra
  clínica (se aplicável) + região `sa-east-1` preferida por LGPD.
- **P1 pendentes antes de prod:** bucket S3 + IAM + agendamento + alertas do backup offsite
  (3.40 entregou scripts/docs; falta provisionar); banco/Redis gerenciados (3.41); WAF;
  deploy real (3.42); provisionar Redis/proxy reais (`TRUST_PROXY`/`REDIS_URL` em prod);
  validação jurídica de retenção (ADR 0002).
- **Trilha pacientes (próximo):** contagem de agendamentos por paciente na UI do merge
  (endpoint owner-only, tenant-scoped); paginação backend de duplicados; undo/snapshot
  completo (tabela + ADR).
- **Trilha equipe (próximo):** saída voluntária da clínica; roles granulares (ADR própria).
  Troca de dono fora de escopo.
- **P2:** limpeza real de arquivos (confirmação/quarentena/auditoria/idempotência/lock);
  paginação de duplicados; export streaming/assíncrono; rate limit dedicado em GETs leves.
- **P3:** antivírus/sandbox/DLP; validação XLSX OPC/XML completa; observabilidade/métricas.

Detalhes: `docs/roadmap-next-phase.md`.

## Restrições críticas em vigor (NÃO remover)

Detalhe completo em `docs/security-notes.md`. Resumo obrigatório:

- **Tenant:** sempre filtrar por `clinica_id`; `requireAuth + requireClinic` em
  todo endpoint tenant-scoped; cross-tenant → 403 (nas escritas de paciente →
  **404 genérico** `patient_not_found`, sem distinguir inexistente de outro
  tenant). DAOs sempre filtram tenant, sem `listAll`. `importFileDao`/
  `importSessionDao` sem update/delete livre. `patientDao`: leitura + escritas
  **tenant-scoped** (create/update/setStatus, Sprint 3.22), **sem delete físico**
  (arquivar = `status='archived'`).
- **PII:** nunca expor CPF bruto (só `cpf_masked`); export usa `cpf_masked`
  (`include_cpf_raw=true` → 400). Issues/mensagens/audits/logs nunca contêm
  CPF/telefone/e-mail/nome. Nunca expor `nome_original`/`nome_interno`/path/
  sha256/conteúdo de arquivo.
- **Escopo clínico autorizado pela ADR 0010 (Sprint 4.2A) — só Prontuário
  v0.1, implementado na Sprint 4.2B (B-1 schema → B-2 services → B-3
  controllers/rotas):** 4 tabelas (`clinical_encounters`,
  `clinical_encounter_notes`, `clinical_read_audit`, `user_clinical_roles`);
  5 campos textuais clínicos (`chief_complaint`, `anamnesis`, `evolution`,
  `plan`, `internal_note`); status `active|canceled` (sem restore); notas
  append-only com retificação por `revises_note_id`; **sem** delete físico;
  **sem** mistura de histórico em merge B-safe; **profissional só vê os
  próprios** (cláusula no DAO `clinicalEncounterDao` via
  `attending_user_id_self`); dono/gestor leem com audit, não editam alheio;
  funcionario/financeiro/admin_sistema → 403 em todo endpoint clínico;
  `internal_note` redacted para não-autor pelo helper único
  `clinicalEncounterNoteService.applyInternalNoteRedaction`; criar encounter
  exige paciente ativo + não-mesclado. Rotas registradas: `POST/GET
  /clinical/encounters`, `GET /clinical/encounters/:id` (CONTENT-READ; audit
  STRICT antes de carregar notas), `PATCH /clinical/encounters/:id/cancel`,
  `POST /clinical/encounters/:id/notes`,
  `GET /patients/:id/clinical-timeline` (METADATA-only),
  `GET/POST /clinical/roles[/grant|/revoke]` (owner-only via
  `requireRole(CLINIC_ADMIN_ROLES)`). Logger redact estendido com 4 camadas:
  top-level, `*.field` (1-level), `body/req.body/payload.<field>` (2-level),
  `body/req.body/payload.initial_note.<field>` (3-level) — verificado por
  teste de vazamento 7/7 PASS antes do commit (`config/logger.ts`).
  **Tudo fora desse escopo continua
  proibido** sem ADR de módulo nova (CID estruturado, prescrição, exames,
  anexos, ICP-Brasil, telemedicina, IA clínica, TISS, medicamentos
  controlados). ADR 0009 (4.1) decide arquitetura conceitual; ADR 0010
  (4.2A) decide o módulo; cada **fase nova** (4.3+) abre ADR própria.
  CRUD
  administrativo de paciente (criar/editar/arquivar/restaurar) existe (Sprint
  3.22) e é **somente administrativo**. **Merge** de paciente está implementado
  no backend (Sprint 3.33; ADR 0007 B-safe administrativo): fill-blanks
  não-destrutivo + mover agendamentos tenant-scoped + arquivar secundário com
  CAS, **owner-only**, em transação, **audit sem PII**, **CPF nunca bruto**,
  **sem** seleção campo-a-campo, **sem** undo completo/snapshot, **sem** nada
  clínico, **sem** delete físico (continua proibido). Frontend: Sprint 3.34, validado 2026-05-24.
- **audit_logs:** colunas reais = `acao/recurso/recurso_id/usuario_id/clinica_id/
  ip/user_agent/request_id/criado_em`. **Não existem** `metadata` nem
  `entidade_tipo`. Append-only no DAO.
- **Upload:** valida extensão + MIME declarado + conteúdo real (magic bytes;
  XLSX exige ZIP `PK\x03\x04` + partes OOXML). Storage privado, nome interno
  aleatório, SHA-256.
- **Retenção:** ainda é **dry-run** — NÃO apaga nada. Limpeza real é futura e
  exige confirmação/auditoria/soft-delete/quarentena. O painel não tem botão
  destrutivo/download. Política técnica em `docs/data-retention-policy.md` (ADR
  0002); limpeza real continua **fora do escopo atual**.
- **Export:** read-only; neutraliza formula injection (`= + - @`) em CSV e XLSX;
  `Content-Disposition` com filename fixo; sem signed URL.
- **Rate limit:** por grupo, IP-keyed, roda antes de `requireAuth`; 429 genérico.
  Store configurável (`RATE_LIMIT_STORE=memory|redis`; default memory, redis
  falha-rápido no boot se não conectar). `TRUST_PROXY` configurável (default
  `false`; setar atrás de proxy). Padrão de env:
  `<SCOPE>_RATE_LIMIT_WINDOW_MS`/`<SCOPE>_RATE_LIMIT_MAX`. Ver `docs/security-notes.md`.
- **errorHandler:** nunca retorna stack/SQL/path; 500 → `internal_error`. Erros
  de parse → mensagens genéricas (sem ecoar conteúdo da planilha).
- **requireRole (papel):** `requireRole(CLINIC_ADMIN_ROLES)` roda após
  `requireClinic` (nunca burla tenant) e gateia os endpoints administrativos
  sensíveis a `dono_clinica`: `POST /import-sessions/:id/import`, `.../mark-ready`,
  `GET /patients/export`, `GET /import-files/retention/dry-run`, **`PATCH
  /patients/:id/archive`** e **`PATCH /patients/:id/restore`** (Sprint 3.22), **e
  `GET /clinics/invite-code`, `GET /clinic-join-requests/pending`, `POST
  /clinic-join-requests/:id/approve|reject` (Sprint 3.24)**, **e `GET
  /clinic-members` + `PATCH /clinic-members/:userId/deactivate` (Sprint 3.25)**,
  **e `POST /clinics/invite-code/regenerate` (Sprint 3.26)**, **e `POST
  /patients/:id/merge` (Sprint 3.33 — merge B-safe owner-only)**.
  `secretaria`
  (operator) faz upload/preview/validate/create-session/dry-run, leitura de
  pacientes/duplicados, **criar/editar paciente** (`POST /patients`, `PATCH
  /patients/:id`) e **solicitar entrada/cancelar a própria** em
  `clinic-join-requests` quando ainda não tem clínica — mas **não** arquivar/
  restaurar paciente nem aprovar/recusar solicitações. 403 → `{ error: { code:
  'forbidden_role', ... } }`. Papel vem do JWT (sem hit no DB); risco de papel
  stale até o token expirar — aceitável enquanto não há gestão de sessão na UI
  (ver `docs/security-notes.md`).
- **Limites MVP:** `IMPORT_MAX_ROWS=100` (intencional).
- **`requireClinic` faz DB check (Sprint 3.25):** além de validar
  `req.auth.clinica_id` do JWT, busca `users` por id e exige `ativo=true` e
  `users.clinica_id === auth.clinica_id`. Inconsistente → 403
  `clinic_membership_revoked`. Custo: 1 SELECT indexado por request
  tenant-scoped. Garante que desativação de membro é **efetiva imediatamente**,
  sem rotação de token. `papel` ainda NÃO é re-validado contra DB (única transição
  possível seria `dono_clinica → secretaria`, não implementada — documentado em
  `docs/security-notes.md`).
- **Vocabulário de produto (3.24.1):** UI fala em "funcionário(a)", "equipe" e
  "membro da equipe" / "funcionário(a) com acesso administrativo". A role técnica
  do backend permanece `secretaria` (JWT, DB, `requested_role`, audit acoes) —
  **não trocar** sem migration/refactor. Evitar termos visíveis como "secretaria"
  / "sua secretária" / "cadastro de secretaria". Roles granulares novas
  (`gestor_clinica`, `profissional_clinico`, `financeiro`, `funcionario_administrativo`
  como sucessor técnico de `secretaria`) estão **conceituadas** na ADR 0009 §4
  + matriz em `docs/clinical-architecture-and-permissions.md` §2, mas
  **não implementadas** — implementação técnica fica para ADR 0010 / sprint
  dedicada antes da Fase 4.2. Não criar agora.

## Project identity

ClinicBridge é um SaaS de **gestão de clínicas com migração inteligente** —
em evolução de uma base administrativa segura para um **Clinic OS modular**
(ADR 0008). Hoje o produto entregue é administrativo; módulos clínicos estão
no roadmap, cada um exigindo ADR própria antes de qualquer código.

**O que está entregue hoje (Fase 3 administrativa):** dados administrativos
do paciente; contatos; agendamento; convênio; import CSV/XLSX; mapeamento de
colunas; validação; detecção de duplicados; merge B-safe administrativo;
export limpo; equipe; MFA; audit logs. **NÃO é um sistema de prontuário ainda.**

**O que vem no roadmap (Clinic OS, com ADR própria por módulo):** prontuário/
atendimento (Fase 4.2); documentos médicos/receitas (4.3); financeiro (4.4);
relatórios gerenciais (4.5); convênios/faturamento básico (4.6); estoque
básico (4.7). Fases futuras sem número: IA clínica assistiva, ICP-Brasil,
TISS/TUSS real, SNGPC/ANVISA.

**O que continua fora do escopo:** telemedicina (vídeo/áudio síncrono);
prescrição eletrônica com força legal (ICP-Brasil); TISS real; medicamentos
controlados (SNGPC/ANVISA); app mobile nativo; cópia de UI/textos de
concorrentes (Feegow ou outros). Se uma tarefa tentar entrar nessas áreas
sem ADR, **pare e peça confirmação.**

## Source of truth

Antes de implementar, leia `docs/ClinicBridge_Documentacao_Mestre.md` (escopo,
arquitetura, modelo de dados, backlog, segurança, STRIDE, LGPD, MVC+DAO).
Apoio: `docs/ClinicBridge_Relatorio.pdf`, `docs/ClinicBridge_Apresentacao.pptx`.
Se implementação e documentação conflitarem, pergunte antes de escolher.

## Preferred stack

- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite + TypeScript (TanStack Query p/ cache/invalidação;
  `/app` em abas — Sprint 3.16)
- DB: PostgreSQL · Infra local: Docker Compose
- Arquitetura: MVC + DAO com Service layer entre Controller e DAO
- Package manager: pnpm

## Architecture rules (MVC + DAO + Service)

- **Controller:** recebe HTTP, valida input no edge, chama Services, retorna
  resposta. NÃO executa SQL nem contém lógica de negócio pesada.
- **Service:** lógica de negócio (parse, validação, normalização, dedup,
  orquestração de export); chama DAOs; testável sem a camada web.
- **DAO:** acesso a banco; queries parametrizadas/ORM seguro; **enforce
  `clinica_id`** em dados tenant-scoped; sem UI nem decisões de negócio complexas.
- **Model:** entidades de domínio e DTOs.
- **View/Frontend:** apresenta dados, captura input, chama API; **não** toma
  decisões de segurança nem assume que validação de frontend basta.

## Multi-tenant rule

Toda tabela/operação sensível de clínica é escopada por `clinica_id`. Recursos
sensíveis: patients, import_files, migrations, migration_errors, audit_logs,
clinic users. Nunca implementar acesso a paciente/import/migração/export sem
checagem de tenant. Cross-tenant → 403.

## Security baseline

Segurança não é opcional. Detalhe em `docs/security-notes.md`. Sempre considerar:
autenticação; autorização; isolamento de tenant; upload seguro; validação real de
MIME; limite de tamanho; nome interno gerado; SHA-256; storage privado; download
assinado (futuro); audit logs; rate limits; mensagens de erro seguras; sem
segredos/PII em logs; backup; fluxos LGPD de export/exclusão.

- Senhas: nunca em texto puro; argon2id ou bcrypt com custo forte.
- MFA por TOTP (Sprint 3.19): app autenticador, sem SMS/e-mail OTP/serviço externo;
  secret cifrado em repouso (AES-GCM); login em 2 passos (`mfa_required` →
  `verify-login`); secret nunca logado/retornado após ativar. Detalhe em
  `docs/security-notes.md`. Ressalva: chave dedicada/KMS de cifra do secret é futura (P1).
- MFA backup codes (Sprint 3.21): tabela `user_mfa_backup_codes`, **só hash
  argon2** (nunca texto puro), **uso único** (`used_at` por CAS), só para usuários
  com MFA ativo. Gerados no confirm e no `POST /auth/mfa/backup-codes/regenerate`
  (exige TOTP; invalida os anteriores). `verify-login` aceita TOTP **ou** backup
  code com erro genérico (`invalid_mfa_code`). Códigos exibidos **uma única vez**;
  **nunca** em `/auth/me`/status (status só devolve `backup_codes_remaining`);
  nunca logados. Disable apaga os códigos.
- DB: nunca concatenar SQL com input; usar ORM/queries parametrizadas.
- Frontend: evitar `dangerouslySetInnerHTML`; escapar conteúdo; sem stack traces.
- Secrets: nunca commitar `.env`; `.env.example` só com placeholders.

## Upload rules

Tipos permitidos no MVP: `.csv`, `.xlsx`. Requisitos: allowlist de extensão;
validação de MIME; limite de tamanho; timeout; SHA-256; storage privado; nome
interno aleatório; sem bucket público; sem nome original em URL pública. Não
implementar PDF/ZIP/imagem/exames/documentos clínicos sem pedido explícito.

## LGPD and privacy posture

Mesmo sem prontuário, o sistema lida com dados pessoais. Premissas: minimização;
retenção limitada; aceite explícito de termos; export; exclusão; auditabilidade;
limitação de finalidade; logging seguro. Prefira "dados pessoais do paciente" /
"dados administrativos". Evite implicar que o MVP guarda diagnóstico/prescrição/
prontuário.

## Coding standards

TypeScript strict onde prático. Prefira: estrutura de pastas clara; arquivos
pequenos; nomes legíveis; DTOs/types explícitos; config centralizada; tratamento
de erro centralizado; respostas de API consistentes; testes para regras críticas.
Evite: controllers gigantes; lógica de negócio em rotas; DB em controllers;
secrets hardcoded; `any` amplo; catches silenciosos; logar dados sensíveis.

## Project structure (alvo)

`/backend/src` → config, models, dao, services, controllers, routes, middlewares,
utils, jobs, server.ts (+ `/tests`). `/frontend/src` → views, components,
services, hooks, utils, main.tsx, App.tsx. `/docs`, `/.claude/agents`,
`docker-compose.yml`, `.env.example`, `README.md`.

## Development workflow

Antes de editar: inspecione os arquivos relevantes; explique o plano brevemente;
mantenha a mudança no escopo pedido. Depois: resuma o que mudou; liste comandos
para rodar; mencione riscos/TODOs; **não** afirme que testes passaram sem ter
rodado. Ao gerar código: incremental; sem construir features futuras cedo; sem
over-engineering; manter escopo MVP.

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

**Env vars:** fonte de verdade é `.env.example` (cobre todos os scopes de rate
limit, upload, preview, validation, dry-run, import, patients, export, retention).
Detalhe por sprint em `docs/sprint-history.md`. Smoke tests / SQL / curl em
`docs/testing-checklist.md`.

## Git behavior

Não commitar automaticamente. Quando pedirem commit: mostrar arquivos alterados;
resumir mudanças; sugerir mensagem.

## Communication style

Direto e prático. Prefira: implementado / ainda não / risco / próximo passo /
bloqueado porque. Evite linguagem inflada (revolucionário, disruptivo, plataforma
definitiva, solução completa de saúde, compliance total com LGPD/CFM). Descreva
o ClinicBridge como: sistema de gestão de clínicas com migração inteligente,
em evolução modular para Clinic OS (ADR 0008); base administrativa segura
hoje; módulos clínicos no roadmap por ADR; sem telemedicina.

## Token and subagent usage policy

Subagents são caros e **não** devem ser usados automaticamente.

- Padrão: não chamar subagents salvo pedido explícito. Para tarefas normais, faça
  uma revisão interna curta, só dos arquivos alterados; foco em crítico/alto risco;
  sem scan amplo do repo.
- **Perguntar antes** de usar subagent quando a tarefa toca: autenticação;
  autorização; tenant/`clinica_id`; uploads/arquivos; LGPD/PII; schema de banco;
  middleware de segurança; fronteiras de arquitetura.
- Usar subagent **sem perguntar** só se o usuário disser explicitamente: "chame
  os agents" / "rode security-reviewer" / "rode architecture-guardian" / "faça
  revisão com subagents" / "faça auditoria completa com agents".
- Edits pequenos: sem agents, sem scan do repo, build/typecheck só se relevante.
- Formato de revisão leve: 1) arquivos revisados 2) issues críticas 3) issues de
  alto risco 4) seguro prosseguir? sim/não 5) comandos rodados.
- Orçamento: revisões de rotina < 3k tokens quando possível; revisão ampla só no
  fim de sprints importantes.
