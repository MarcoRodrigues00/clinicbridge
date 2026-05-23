# ClinicBridge — Estado do Projeto (detalhado)

> Estado detalhado movido do `CLAUDE.md` na compactação de 2026-05-22. O
> `CLAUDE.md` mantém o resumo; este arquivo guarda a versão completa.
> Histórico por sprint: `docs/sprint-history.md`. Notas de segurança e
> ressalvas: `docs/security-notes.md`. Checklist de testes: `docs/testing-checklist.md`.

## Última sprint aprovada

**Sprint 3.22** (em validação/finalização) — **CRUD administrativo de pacientes**
(Escopo A: criar manual + editar + arquivar/restaurar). **Sem migration**
(`patients.status` já aceita `active/inactive/archived`; `origem` já existe).

Backend:
- `patientDao` ganhou escritas **tenant-scoped**: `findByIdForClinic`, `create`
  (força `origem='manual'`, `status='active'`, `import_session_id=null`),
  `updateForClinic` (patch parcial; toca `atualizado_em`), `setStatusForClinic`
  (archive/restore). **Sem delete físico** (preserva histórico de agendamentos —
  `appointments.patient_id` é `ON DELETE CASCADE`).
- `patientService`: validação administrativa (nome obrigatório; CPF 11 dígitos;
  e-mail; data AAAA-MM-DD ou DD/MM/AAAA, sem futuro; limites de tamanho) **sem
  ecoar valor** no erro (`patient_invalid`/400). `listForClinic` agora aplica
  `status` (default `active`). `createForClinic`/`updateForClinic`/
  `archiveForClinic`/`restoreForClinic`; cross-tenant/inexistente → **404
  genérico** `patient_not_found`. Audits `patient.create/update/archive/restore.
  success` (só `recurso_id` UUID; **sem PII**).
- Controller/rotas: `POST /patients` e `PATCH /patients/:id` (dono + secretaria);
  `PATCH /patients/:id/archive` e `.../restore` (**só dono**, `requireRole`
  após `requireClinic`); `GET /patients?status=active|archived|inactive|all`
  (default `active`). Reusa `patientsRateLimit` (IP-keyed, antes do auth).

Frontend: `PatientsList` ganhou "Novo paciente" + formulário (criar/editar),
filtro de status (Ativos/Arquivados/Todos), ações por card de Editar (dono +
secretaria) e Arquivar/Restaurar (**só dono**), e empty states por contexto. CPF
nunca é exibido bruto (só `cpf_masked`); na edição o campo CPF em branco **mantém**
o atual (não dá para pré-preencher o mascarado). O seletor de paciente da agenda
(`AdministrativeSchedulePanel`) reusa `GET /patients` default → arquivados somem
automaticamente do agendamento.

Verificação: backend + frontend typecheck/build OK; matriz por API (Node fetch,
backend dev :3001, contas descartáveis) **25/25** — inclui os 10 cenários
obrigatórios + CPF mascarado/sem bruto, origem/status no create, CPF inválido →
400 sem eco, e auditoria sem PII. Dados de teste removidos após o run. Validação
**visual** no navegador pendente. Sem commit.

Inclui também (working tree, mantido) os **polimentos de copy** anteriores da
3.22: landing (Hero/Footer "Sprint 0" → "piloto v0.1"; `HowItWorks` cita os
campos reais e remove a promessa de "mesclar/corrigir" no import) e Dashboard
("Checklist do MVP" honesto: lembrete manual concluído, auth+MFA+códigos de
recuperação, "Preparação para produção" pendente); docs de demo com os códigos de
recuperação (3.21).

**Ajuste de copy/UX da tela de Pacientes (após validação visual):** com muitos
registros a tela ficava longa/poluída. Sem refactor grande (mantida a lista de
cards + "Carregar mais"): subtítulo deixa claro que a lista é **paginada e
filtrada** (não mostra todos de uma vez) e incentiva busca/filtro; o contador
mostra o filtro atual e, quando há mais páginas, sinaliza "(página atual — há mais
registros)" + uma dica para refinar; cards mais **compactos** (grid mais denso,
espaçamentos menores) via CSS. typecheck/build do frontend OK.

**Gap de teste conhecido:** o papel `secretaria` **não é testável pelo navegador**
porque ainda não existe gestão de equipe/funcionário na UI — `secretaria` só passa
a existir alterando o banco via SQL. A matriz por API cobriu o papel (criando a
secretaria por SQL), mas a validação ponta-a-ponta pelo navegador do fluxo de
secretaria fica **pendente** até a sprint de gestão de equipe.

**Próximas sprints recomendadas (detalhe em `docs/roadmap-next-phase.md`):**
- **3.23 (recomendada): duplicados acionáveis / correção de importação** — tornar
  `GET /patients/duplicates` acionável (editar/arquivar por grupo reusando o CRUD
  da 3.22; **merge seguro só depois**, com confirmação+audit, **sem** merge
  automático; inclui paginação de duplicados).
- **Sprint futura: gestão de equipe / convite de secretaria** — secretaria
  solicita entrada → dono aprova/recusa → papel aplicado só após aprovação, tudo
  auditado, **sem autoentrada**; inclui a UI de usuários/papéis que falta hoje.

**Sprint 3.21** — segurança: **MFA backup codes**
(códigos de recuperação). Migration `20260528000000_user_mfa_backup_codes` cria
`user_mfa_backup_codes` (id, user_id FK CASCADE, `code_hash`, `used_at`,
`created_at`; índices por user e user+used_at): **só hash argon2**, nunca texto
puro; **uso único** via `used_at` (compare-and-set). `mfaBackupCodeDao` +
`mfaBackupCodeService` (10 códigos alfanuméricos sem caracteres ambíguos, formato
`ABCDE-FGHJK`; hash via `passwordService`/argon2; `consume` = verify + markUsed).
`authService`: confirm ativa MFA **e** gera os códigos numa transação (retorna 1x)
+ audit `auth.mfa.backup_codes.generated.success`; `verifyMfaLogin` aceita **TOTP
ou backup code** (erro genérico `invalid_mfa_code`; backup uso único marcado na
hora → `auth.mfa.backup_code.used.success`); disable apaga os códigos (transação);
`mfaStatus` retorna `backup_codes_remaining` (**nunca** os códigos); novo
`regenerateBackupCodes` (exige TOTP; invalida os anteriores →
`auth.mfa.backup_codes.regenerated.success`). Endpoint novo: `POST
/auth/mfa/backup-codes/regenerate` (requireAuth + TOTP, sob `/auth/*` → rate
limit). Frontend: `MfaSettings` mostra os códigos **1x** (copiar todos + checkbox
"salvei" + concluir), contagem restante e "Gerar novos códigos" (aviso de
invalidação); `LoginPage` aceita "código do app autenticador ou de recuperação".
e2e por curl (backend efêmero): **11/11** cenários; `code_hash` `$argon2id`;
audit/log sem códigos/secret; `migrate:latest` batch 9; backend+frontend
typecheck/build OK. **Ressalvas:** verify de backup faz argon2 sequencial sobre os
códigos não usados (custo aceitável p/ login de recuperação raro); chave dedicada/
KMS do secret TOTP segue P1 (não afeta backup codes, que são hash). Sem SMS/e-mail/
WhatsApp OTP, sem recovery por suporte/bypass. Sem dado clínico. Sem commit.

**Sprint 3.20** — produto: **dados sintéticos + roteiro/checklist de demo do piloto
v0.1**. CSV demo fictício (`docs/demo-data/`), **seed dev-only** de agenda
(`backend/scripts/seed-demo-scheduling.ts`; `pnpm --filter backend seed:demo` /
`seed:demo:clean`; pacientes `origem='seed_demo'` + profissionais `[DEMO]` +
agendamentos fictícios), docs `demo-pilot-v0.1-script.md`/`-checklist.md`.
Administrativo, **não clínico**; sem migration/endpoint.

**Sprint anterior: 3.19** — segurança: **MFA por TOTP no login** (app autenticador; sem SMS/
e-mail OTP/serviço externo). Backend: `otplib`+`qrcode`; migration
`20260527000000_user_mfa` (campos MFA em `users`); secret **cifrado em repouso**
(AES-256-GCM, chave via HKDF do `JWT_SECRET` ou `MFA_ENCRYPTION_KEY` opcional).
Endpoints: `/auth/login` (se MFA on → `mfa_required` + `mfa_challenge_token` curto,
sem JWT), `/auth/mfa/verify-login`, `/auth/mfa/setup|confirm|status|disable`
(setup com pending secret no DB; disable exige TOTP válido). Frontend: passo de
código MFA no login + painel `MfaSettings` (QR + chave manual + ativar/desativar)
na aba Segurança. Auditoria `auth.mfa.*` sem secret/código; rate limit `/auth/*`
reaproveitado. **Usuários existentes seguem com `mfa_enabled=false`** (login
inalterado). Backend e2e validado por curl; backend+frontend typecheck/build OK.
Sem dado clínico. **Ressalvas:** backup codes futuros; cifra do secret derivada do
JWT_SECRET por padrão (P1: chave dedicada/KMS em produção). Sem commit.

**Sprint anterior: 3.18** — frontend: **lembrete manual/assistido** da Agenda Administrativa.
`utils/reminders.ts` (funções puras) gera **mensagem neutra** ("Olá, {nome}! …
atendimento na {clínica} para {data} às {hora}. Para confirmar ou remarcar…") e
botões por card (só `scheduled`/`confirmed`/`rescheduled`): **"Copiar lembrete"**
(clipboard + feedback) e **"Abrir WhatsApp"** (`wa.me` com texto pré-preenchido se
houver telefone; normaliza BR/DDI 55; sem telefone → "Paciente sem telefone
disponível."). Mensagem **editável localmente** por agendamento (draft só em
memória; sem persistência) com aviso anti-clínico e "Restaurar padrão". **Humano
decide enviar** — sem envio automático, sem API oficial,
sem job/cron/fila, sem token. Mensagem **não** usa profissional/rótulo/observação/
CPF/e-mail/dado clínico. frontend typecheck+build OK. **Sem backend/migration/
schema.** WhatsApp API oficial segue pendente (ADR própria). Sem commit.

**Sprint anterior: 3.17** — frontend/UX (QA visual + landing): polimento da **Agenda
Administrativa** e refatoração do **Roadmap público**. Agenda ganhou cabeçalho de
data legível ("Agenda de sábado, 23 de maio de 2026") com navegação Anterior/Hoje/
Próximo, **resumo do dia** (total/agendados/confirmados/concluídos/faltas-cancelados),
**timeline por horário** (ordenada por `starts_at`, horário em destaque) e
**formulário "+ Novo agendamento" colapsável** (não fica mais sempre aberto).
Label "especialidade" → "função/rótulo interno". Landing: seção `Roadmap`
("Sprint 0/1/2/3", desatualizada) substituída por **"O que o ClinicBridge entrega
no piloto"** (capacidades de produto; sem linguagem de obra; sem afirmar produção/
compliance). frontend typecheck+build OK. **Sem backend/migration/schema; sem
WhatsApp/lembretes.** (Browser não automatizado no ambiente.) Sem commit.

**Sprint anterior: 3.16** — frontend (app shell): **navegação por abas + cache/invalidação +
footer**. Adicionado `@tanstack/react-query` (`QueryClientProvider` em `main.tsx`).
Os painéis da agenda (`ClinicProfessionalsPanel`/`AdministrativeSchedulePanel`)
passaram a usar `useQuery`/`useMutation` com a **chave compartilhada
`['clinic-professionals']`** — criar/editar/desativar profissional **invalida e
atualiza o select da agenda sem F5** (corrige o bug de QA); mutations de
agendamento invalidam `['appointments']`. `/app` reorganizado em abas
(Início/Importações/Pacientes/Agenda/Segurança) com título/subtítulo por seção +
**footer** ("Ferramenta administrativa. Não substitui prontuário…"). frontend
typecheck+build OK. **Sem backend/migration/schema; sem WhatsApp/lembretes.**
(Teste de browser não automatizado no ambiente — ver ressalvas.) Sem commit.

**Sprint anterior: 3.15** — produto/implementação: **frontend da Agenda Administrativa**
(piloto v0.1). Dois painéis no Dashboard: `ClinicProfessionalsPanel` (lista;
owner cria/edita/desativa; secretaria read-only com nota) e
`AdministrativeSchedulePanel` (filtros data/profissional/status; criar agendamento
com seletor de paciente reusando `GET /patients`; ações de status
Confirmar/Concluir/Faltou/Cancelar; remarcação inline). `services/api.ts` ganhou
PATCH + tipos/métodos da agenda. **Aviso anti-clínico** visível no campo de
observação. Status em PT (Agendado/Confirmado/Cancelado/Remarcado/Faltou/
Concluído). Sem WhatsApp/lembretes. frontend typecheck+build OK. **Sem alterar
backend** (só o client ganhou PATCH); sem migration; sem dado clínico. **Frontend
e lembretes:** UI feita; **envio de lembrete/WhatsApp ainda pendente** (3.16+).
Sem commit. (Teste de browser não automatizado neste ambiente — ver ressalvas.)

**Sprint anterior: 3.14** — produto/implementação: **backend da Agenda Administrativa**
(ADR 0006). Migration `20260526000000_scheduling` cria `clinic_professionals` e
`appointments` (tenant-scoped por `clinica_id`, FKs, CHECK de status + `ends_at >
starts_at`, índices). Models/DAOs/services/controllers/routes novos: profissionais
(`GET /clinic-professionals`, `POST`/`PATCH /:id`/`PATCH /:id/deactivate` — writes
só `dono_clinica`) e agendamentos (`GET /appointments`, `POST`, `GET /:id`,
`PATCH /:id/status`, `PATCH /:id/reschedule` — owner + secretaria). `requireAuth`
+ `requireClinic` (+ `requireRole` nos writes de profissional); tenant isolation no
DAO; sem `listAll`; **sem DELETE** (cancelamento é status `cancelled`). Auditoria
sem PII/notes. **Administrativo, sem dado clínico.** typecheck+build OK; testes
curl (positivos/negativos/cross-tenant) OK; counts intactos (6/24/7;
clinic_professionals/appointments criadas e limpas pós-teste). **Frontend e
lembretes ainda pendentes.** Sem commit.

**Sprint anterior: 3.13** — produto/escopo (docs/ADR-only): **escopo futuro de lembretes e
WhatsApp** para a Agenda Administrativa. Adendo no ADR 0006 + Parte II em
`docs/administrative-scheduling-scope.md`: **manual-first** (copiar mensagem/abrir
WhatsApp com texto neutro; humano decide enviar), **opt-in/opt-out**, **templates
neutros**, logs só de metadados (sem conteúdo), **WhatsApp automático/API gated**
(sprint futura com ADR própria). **Sem dado clínico nas mensagens** (sem motivo/
diagnóstico/especialidade sensível/medicação). Modelos conceituais futuros
(PatientContactPreference, AppointmentReminder, MessageTemplate) — **não criados**.
**Nada implementado** (sem backend/frontend/migration/endpoint/WhatsApp/job/cron).
Numeração de implementação reordenada (3.14 backend → 3.15 frontend → 3.16 lembrete
manual → 3.17 demo → 3.18 polish → futura WhatsApp API). Sem commit.

**Sprint anterior: 3.12** — produto/escopo (docs/ADR-only): **decisão e escopo do módulo
Agenda Administrativa** (não clínica), preparando o piloto v0.1. Criados ADR
`docs/adr/0006-administrative-scheduling-module.md` + `docs/administrative-scheduling-scope.md`.
Define entidades conceituais (ClinicProfessional, Appointment), status, papéis
(reuso de `dono_clinica`/`secretaria`/`admin_sistema`), regras, LGPD/auditoria e
roadmap (3.13 backend → 3.14 frontend → 3.15 demo → 3.16 polish). **Agenda é
administrativa**: sem diagnóstico/prescrição/evolução/CID/anamnese/exames/
prontuário; observações administrativas mínimas. **Nada implementado** (sem
backend/frontend/migration/schema/endpoint). Sem commit.

**Sprint anterior: 3.11** — produção/governança: **TLS local/staging no Nginx** + HTTP→HTTPS.
Script `scripts/generate-local-nginx-cert.sh` (openssl, cert autoassinado, SAN
localhost/clinicbridge.local/127.0.0.1) → `infra/nginx/certs/` (gitignored; chave
privada nunca versionada). `conf.d`: server `:80` faz **301** para HTTPS; server
`:443` termina TLS e proxya `backend:3001` com `X-Forwarded-Proto: https`. Compose
expõe `127.0.0.1:8443:443` + monta certs ro. **HSTS desativado** em local
(comentado). Verificado e2e: redirect 301, HTTPS health/live/ready 200, readiness
503 com DB parado e 200 ao voltar, cert SAN correto, logs seguros. **Sem domínio/
cert real, sem WAF, sem AWS/Cloudflare**; sem migration/schema; sem commit.

**Sprint anterior: 3.10** — produção/governança: **backend containerizado** para teste ponta
a ponta com Nginx. `backend/Dockerfile` (multi-stage, node:20-slim, non-root,
prod-only, sem `.env`) + `.dockerignore` + serviço `backend` no compose (profile
`edge`, `expose: 3001`, env apontando para `postgres`/`redis` services,
`TRUST_PROXY=1`, `RATE_LIMIT_STORE=redis`, volume `./storage/uploads`). Nginx passou
a proxyar `backend:3001` (resolução DNS em runtime), **resolvendo a limitação Docker
Desktop + WSL2 da 3.9**. Verificado e2e: `Nginx → backend → Postgres/Redis`,
health/live/ready 200 via `localhost:8080`, readiness 503 com DB parado e 200 ao
voltar, anti-spoof de XFF (chave de rate limit usa IP real), logs seguros, counts
intactos (6/24/7). Sem TLS/WAF/domínio/AWS; sem migration/schema; sem commit.

**Sprint anterior: 3.9** — produção/governança: **Nginx reverse proxy local/staging
implementado** (sem WAF, sem TLS real, sem domínio). `infra/nginx/` (nginx.conf +
conf.d) + serviço `nginx` opcional no compose (profile `edge`, 127.0.0.1:8080) →
upstream `host.docker.internal:3001`; `client_max_body_size 10m` (≥
`UPLOAD_MAX_BYTES`); headers `X-Real-IP`/`X-Forwarded-For` com anti-spoof
(overwrite); logs sem `Authorization`/`Cookie`/corpo. Runbook
`docs/nginx-local-staging-runbook.md`. Verificado: `nginx -t` OK, compose up,
proxy+headers+anti-spoof comprovados via upstream de eco. **Limitação conhecida:**
neste host (Docker Desktop + WSL2) o container não alcança o backend da distro WSL
em :3001 (502) — config correta; funciona com backend alcançável pelo host do
Docker (Linux nativo/staging/containerizado). Sem migration/schema; sem WAF/TLS/
domínio/AWS/Cloudflare; `.env` real intocado; sem commit.

**Sprint anterior: 3.8** — produção/governança (docs/ADR-first): **estratégia de borda
segura** — **Nginx** reverse proxy baseline + **WAF futuro (ModSecurity + OWASP
CRS) em detection-only first**. Criados `docs/edge-security-strategy.md` + ADR
`docs/adr/0005-edge-security-reverse-proxy-waf.md`. TLS termina no Nginx; backend
continua HTTP interno, não exposto direto; `TRUST_PROXY`=hop count real;
`FRONTEND_ORIGIN`=domínio HTTPS; `client_max_body_size` ≥ `UPLOAD_MAX_BYTES`; logs
de borda sem PII. Caddy/Traefik avaliados e não escolhidos. **Nada de borda
implementado** (sem Nginx/`nginx.conf`/TLS/WAF; sem alterar compose/backend/banco;
sem migration; sem commit).

**Sprint anterior: 3.7** — produção/governança: **readiness endpoint** para deploy futuro.
`GET /health` + alias `GET /health/live` (liveness, inalterado no formato);
`GET /health/ready` faz `select 1` leve no pool knex com timeout curto
(`HEALTH_READY_DB_TIMEOUT_MS`, default 2000) → **200** `database:ok` / **503**
`database:error`. Sem auth, sem PII, sem `audit_logs`; nunca vaza
`DATABASE_URL`/erro bruto/stack/SQL. Só backend (`routes/health.ts`, `config/env.ts`)
+ `.env.example` + docs; sem migration/schema; sem frontend; sem commit.
typecheck+build OK; testado: DB up → 200, DB inalcançável → 503 em ~2s.

**Sprint anterior: 3.6** — produção/governança: **revisão de deploy seguro + CORS + env de
produção**. Auditoria de env/CORS/Helmet/trust proxy/rate limit/secrets/compose/
health; criados `docs/deploy-security-checklist.md` + ADR
`docs/adr/0004-deploy-security-baseline.md`. Pequenos hardenings **só de produção**
(dev intacto): guardas no `config/env.ts` que **falham o boot** se `JWT_SECRET`/
`DATABASE_URL` ainda usam os placeholders do `.env.example`; warning no `app.ts`
para `RATE_LIMIT_STORE=memory` em produção. **Sem** deploy real, AWS, Terraform,
CI/CD, domínio ou HTTPS real; sem migration/schema; sem commit. typecheck+build OK.

**Sprint anterior: 3.5** — produção/governança: **backup/restore local implementado** com
Restic (decisão da 3.4). Scripts em `scripts/` (`check-backup-env.sh`,
`backup-local-restic.sh`, `restore-local-restic.sh`) + runbook
`docs/backup-restore-local-runbook.md`. **Restore drill validado**: backup
(`pg_dump -Fc` + storage se existir) → snapshot Restic local cifrado → restore em
banco **separado** (`clinicbridge_restore_test`), counts batendo
(patients=6/import_files=24/import_sessions=7) e banco principal **intacto**.
**Sem offsite/AWS/S3.** Não alterou backend funcional/frontend/schema/dados do
banco principal; sem migration; sem commit. `backups/`/repo Restic/dumps
git-ignored; `RESTIC_PASSWORD` só no ambiente. Pendente: offsite/produção (destino,
gestão de chave, agendamento, monitoramento).

**Sprint anterior: 3.4** — produção/governança (docs-only): definida a **estratégia de
backup/restore** — **Restic-first** no MVP, **Bacula** como opção futura
enterprise. Criados `docs/backup-restore-strategy.md` + ADR
`docs/adr/0003-backup-restore-strategy.md`. **Nada de backup implementado** (sem
scripts/cron/secrets/repositório/dumps). Proteger: PostgreSQL + storage (PII);
Redis é efêmero; segredos tratados à parte. Implementação futura deve começar em
**local/dev com restore drill**, antes de qualquer offsite. Liga ao ADR 0002:
limpeza real só após backup validado. Sem alterar backend/frontend/banco/compose;
sem migration.

**Sprint anterior: 3.3** — produção/governança (docs-only): criada a **política técnica de
retenção e governança de dados** (`docs/data-retention-policy.md`, com matriz de
retenção) + ADR `docs/adr/0002-data-retention-governance.md` ("dry-run first,
deletion later"). **Nenhuma limpeza real implementada**, nenhum endpoint/botão de
delete, nenhum dado clínico. Sem alterar backend/frontend/banco; sem migration.
Retenção continua **dry-run**. Próxima etapa possível: backup/restore ou deploy
seguro — **não** a limpeza real (ainda exige validação jurídica + salvaguardas).

**Sprint anterior: 3.2** — produção/governança: `TRUST_PROXY` configurável + store de rate
limit compartilhado opcional (`RATE_LIMIT_STORE=memory|redis`, via
`rate-limit-redis`+`redis`). Default memory (dev intacto); redis falha-rápido no
boot se não conectar. Redis opcional adicionado ao docker-compose. Só backend +
docs + .env.example. Sem migration, sem mudança de banco.

**Sprint anterior: 3.1** — `requireRole`/gating por papel nos endpoints
administrativos sensíveis. `dono_clinica` executa import/mark-ready/export/
retenção; `secretaria` prepara mas não executa.

**Fase atual:** Sprint 2 (Upload → Parse → Validação → Sessão → Dry-run →
Importação → Listagem → Duplicados → Exportação → Hardening → Retenção dry-run)
completa. Este MVP **não** está pronto para produção (ver ressalvas P1 em
`docs/security-notes.md`).

## O que está implementado

- Auth completo (registro, login JWT, `/auth/me`, rate limit, audit logs)
- **MFA por TOTP** (Sprint 3.19): setup/confirm/status/disable + login em 2 passos
  (`mfa_required` → `verify-login`); secret cifrado em repouso; sem SMS/e-mail OTP/
  serviço externo
- **MFA backup codes** (Sprint 3.21): códigos de recuperação (só hash argon2, uso
  único); gerados no confirm + `POST /auth/mfa/backup-codes/regenerate` (exige
  TOTP, invalida anteriores); `verify-login` aceita TOTP ou backup code; status só
  mostra `backup_codes_remaining`; nunca em `/auth/me`; apagados ao desativar MFA
- Upload de CSV/XLSX com validação de extensão, MIME, tamanho e conteúdo real por magic bytes (Sprint 2–2.1, 2.23)
- Preview de arquivo com mapeamento sugerido (Sprint 2.2–2.3)
- Validação local de mapeamento no frontend (Sprint 2.4–2.5)
- Validação backend full-file via `POST /import-files/:id/validate` (Sprint 2.6–2.9)
- Sessão de migração: `POST /import-sessions`, `GET /import-sessions`, `GET /import-sessions/:id` (Sprint 2.10–2.11)
- Simulação dry-run: `POST /import-sessions/:id/dry-run` (Sprint 2.12–2.14, 2.17)
- Preparação: `POST /import-sessions/:id/mark-ready` (`validated → ready_for_import`) (Sprint 2.15)
- Importação controlada: `POST /import-sessions/:id/import` (`ready_for_import → import_completed`) (Sprint 2.16–2.18)
- Recibo persistido da importação (`import_summary_json`, `imported_at`) (Sprint 2.18)
- Listagem de pacientes: `GET /patients` (CPF mascarado, paginação simples, busca; `status=active|archived|inactive|all`, default `active` — Sprint 3.22) (Sprint 2.19)
- CRUD administrativo de pacientes (Sprint 3.22): `POST /patients` + `PATCH /patients/:id` (dono + secretaria); `PATCH /patients/:id/archive` + `.../restore` (só dono; soft-delete via `status`, **sem delete físico**); cross-tenant/inexistente → 404 genérico
- Detecção informativa de duplicados: `GET /patients/duplicates` (read-only, sem merge/edit/delete) (Sprint 2.20)
- Exportação limpa CSV/XLSX: `GET /patients/export` (read-only, CPF mascarado, anti-formula-injection) (Sprint 2.21)
- Rate limit por grupo em todos os endpoints sensíveis (auth, upload, import pipeline, patients, duplicates, export) (Sprint 2.22)
- Retenção de arquivos em DRY-RUN: `GET /import-files/retention/dry-run` (read-only, NÃO apaga) (Sprint 2.24)
- Painel de "Arquivos antigos de importação" no frontend (read-only) (Sprint 2.26)
- Responsividade mobile corrigida no Dashboard (Sprint 2.26)
- Autorização por papel (`requireRole`) nos endpoints administrativos sensíveis
  (import real, mark-ready, export, retenção dry-run) — `dono_clinica` only (Sprint 3.1)
- `TRUST_PROXY` configurável + rate limit com store compartilhado opcional
  (memory/redis) para preparar produção/escala horizontal (Sprint 3.2)
- Backup/restore **local/dev** com Restic: scripts em `scripts/` + runbook;
  restore drill validado em banco separado (Sprint 3.5) — **sem offsite**
- Healthcheck: `GET /health` + `GET /health/live` (liveness) e `GET /health/ready`
  (readiness com `select 1` leve + timeout; 200/503; sem vazar nada) (Sprint 3.7)
- Nginx reverse proxy **local/staging** (`infra/nginx/` + serviço opcional no
  compose, profile `edge`): body size, IP real (anti-spoof), logs sem PII — sem
  TLS/WAF (Sprint 3.9)
- Backend **containerizado** local/staging (`backend/Dockerfile` + serviço `backend`
  no compose, profile `edge`): fluxo Nginx→backend→Postgres/Redis validado e2e
  (Sprint 3.10)
- TLS **local/staging** no Nginx (cert autoassinado via `scripts/generate-local-nginx-cert.sh`)
  + redirect HTTP→HTTPS; HSTS desligado em local — sem cert/domínio real (Sprint 3.11)
- Tabela `patients` criada e populável; `import_sessions` com recibo persistido
- **Agenda Administrativa** — backend (Sprint 3.14: `clinic_professionals` +
  `appointments`; endpoints tenant-scoped, sem DELETE, auditado sem PII) +
  **frontend (Sprint 3.15: painéis de profissionais e agenda no Dashboard, status
  em PT, aviso anti-clínico)**. **Sem dado clínico**; lembretes/WhatsApp ainda não
- Frontend: UploadPanel, ImportPreviewPanel, ValidationReport, ImportSessionsList (com DryRunSection, ImportExecutionSection, ImportReceipt embutidos), PatientsList (com exportação CSV/XLSX), DuplicatesList, ImportFileRetentionPanel, ClinicProfessionalsPanel, AdministrativeSchedulePanel
- **App shell (Sprint 3.16):** `/app` em abas (Início/Importações/Pacientes/Agenda/
  Segurança) + footer; `@tanstack/react-query` para cache/invalidação (agenda e
  profissionais sincronizam sem F5)

## O que NÃO existe (fora de escopo até sprint explícita)

- prontuário / dados clínicos (diagnóstico, prescrição, exames, CID, medicamentos)
- merge de pacientes; **delete físico** de paciente (arquivar = soft-delete via
  `status='archived'`; criar/editar/arquivar/restaurar administrativos existem — Sprint 3.22)
- limpeza real de arquivos (retenção é só dry-run)
- signed URL / download de arquivos de importação
- job/cron automático
- gestão de usuários/papéis pela UI (papel é definido no registro como
  `dono_clinica`, ou via SQL); RBAC complexo com tabela de permissões
- **Agenda Administrativa — lembretes/WhatsApp** ainda não existem: backend
  (3.14) + frontend (3.15) prontos, mas **sem envio de lembrete/WhatsApp**
  (3.16+, manual-first). Sempre **administrativo**, nunca clínico; mensagens
  neutras (ADR 0006)

## Sprints aprovadas

Foundation/Sprint 0 (esqueleto) → Sprint 1.5 (auth hardening) → Sprint 2.0 …
2.26 (pipeline de importação administrativa + hardening + retenção dry-run +
painel frontend). Detalhe de cada uma em `docs/sprint-history.md`.

## Migrações existentes (em ordem)

- `20260520000000_init` — users, clinics, tokens
- `20260521000000_audit_logs`
- `20260522000000_import_files`
- `20260523000000_import_sessions`
- `20260524000000_patients`
- `20260525000000_import_sessions_summary` — import_summary_json, imported_at, imported_by_user_id
- `20260526000000_scheduling` — clinic_professionals, appointments (Sprint 3.14)
- `20260527000000_user_mfa` — campos MFA/TOTP em users (Sprint 3.19)
- `20260528000000_user_mfa_backup_codes` — tabela user_mfa_backup_codes (Sprint 3.21)

## Invariantes atuais (ambiente local)

- patients = 6 na base (+5 com o seed de demo, `origem='seed_demo'`)
- import_files = 24
- import_sessions = 7
- clinic_professionals / appointments: dados de teste manual de UI (ex.: 1 prof /
  3 agend.) + **seed de demo** da Sprint 3.20 (`pnpm --filter backend seed:demo`:
  +3 profissionais, +5 pacientes, +7 agendamentos), revertível por `seed:demo:clean`
- audit_logs registra ações (ex.: `appointment.create.success`) sem PII

> Observação: estes counts são do ambiente local atual e **podem mudar** após
> novos testes/uploads/importações. Use-os como sanity-check, não como verdade
> fixa. Reconfira com o SQL em `docs/testing-checklist.md`.

## Direção estratégica após Sprint 2

- **Opção escolhida: C** (híbrido inteligente) — registrada no ADR
  `docs/adr/0001-product-direction-option-c.md`.
- ClinicBridge continua **administrativo primeiro**: consolidar a base segura,
  auditável e vendável antes de assumir complexidade clínica.
- A **expansão clínica futura será planejada, não implementada agora**: a
  arquitetura é mantida preparada, mas nenhuma tabela/entidade/endpoint clínico é
  criado nesta fase.
- **Prontuário/prescrição exigem ADR futura** dedicada (e, para prescrição,
  análise regulatória/ICP-Brasil) antes de qualquer código.
- **Próxima prioridade recomendada:** Fase 3 — Produção e governança
  administrativa (ver `docs/roadmap-next-phase.md`).

## Próximos passos possíveis (Sprint 3+)

- Fase 3 (produção/governança): requireRole/dono-admin **(Sprint 3.1)**, trust
  proxy + Redis/shared store **(Sprint 3.2)**, política técnica de retenção
  **(Sprint 3.3, docs-only)**, estratégia de backup/restore Restic-first
  **(Sprint 3.4, docs-only)**, backup/restore **local** + restore drill validado
  **(Sprint 3.5)**, baseline de deploy seguro + revisão de CORS/env prod
  **(Sprint 3.6)**, readiness endpoint `/health/ready` **(Sprint 3.7)**,
  estratégia de borda Nginx + WAF **(Sprint 3.8, docs/ADR-first)**, Nginx reverse
  proxy **local/staging** implementado **(Sprint 3.9)**, backend **containerizado**
  + e2e Nginx→backend→DB/Redis **(Sprint 3.10)**, TLS local/staging + HTTP→HTTPS
  **(Sprint 3.11)**; restantes: **TLS real em produção** (cert ACME/gerenciado +
  domínio + HSTS), **WAF** (detection-only → blocking), **deploy real**
  (HTTPS/reverse proxy, secrets
  manager, banco/Redis gerenciados, monitoramento), provisionar Redis/proxy de
  produção, **validação jurídica** da política de retenção, **offsite/produção**
  do backup (destino, gestão de chave, agendamento, monitoramento)
- **Módulo Agenda Administrativa** (ADR 0006 + `docs/administrative-scheduling-scope.md`):
  **3.14 backend ✅** → **3.15 frontend ✅** → **3.16 app shell/navegação/cache ✅** →
  **3.17 QA visual da agenda + landing ✅** → **3.18 lembrete manual/assistido ✅** →
  **3.20** dados sintéticos + roteiro/checklist de demo do piloto v0.1 (seed dev-only
  + CSV fictício + docs) → futura **WhatsApp API** (gated, ADR própria). (MFA por
  TOTP foi a Sprint 3.19, trilha de segurança.) Sempre administrativo, nunca
  clínico; mensagens neutras.
- Download assinado de arquivos de importação (só se houver caso de uso real)
- LGPD: endpoint de exportação e exclusão de dados por clínica
- Limpeza real de arquivos (com confirmação/soft-delete/quarentena/auditoria)
- Roadmap completo das fases: `docs/roadmap-next-phase.md`
- Ver lista priorizada P1/P2/P3 em `docs/security-notes.md`
