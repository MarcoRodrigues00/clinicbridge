# CLAUDE.md — ClinicBridge

> Arquivo curto e operacional. Histórico longo e detalhes ficam nos docs:
> - **Estado detalhado / invariantes:** `docs/project-state.md`
> - **Histórico das sprints (1.5 → 2.26):** `docs/sprint-history.md`
> - **Segurança detalhada + ressalvas P1/P2/P3:** `docs/security-notes.md`
> - **Política de retenção e governança de dados:** `docs/data-retention-policy.md` (+ ADR `docs/adr/0002-data-retention-governance.md`)
> - **Estratégia de backup/restore (Restic-first):** `docs/backup-restore-strategy.md` (+ ADR `docs/adr/0003-backup-restore-strategy.md`)
> - **Runbook backup/restore local (scripts em `scripts/`):** `docs/backup-restore-local-runbook.md`
> - **Checklist de deploy seguro / CORS / env prod:** `docs/deploy-security-checklist.md` (+ ADR `docs/adr/0004-deploy-security-baseline.md`)
> - **Estratégia de borda (Nginx reverse proxy + WAF):** `docs/edge-security-strategy.md` (+ ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md`)
> - **Agenda Administrativa (backend 3.14 + frontend 3.15; lembrete manual/wa.me 3.18; WhatsApp API futuro; não clínico):** `docs/administrative-scheduling-scope.md` (+ ADR `docs/adr/0006-administrative-scheduling-module.md`)
> - **Runbook Nginx + backend containerizado local/staging (`infra/nginx/`, `backend/Dockerfile`, profile `edge`):** `docs/nginx-local-staging-runbook.md`
> - **Demo/piloto v0.1 (Sprint 3.20; dados fictícios, não clínico):** `docs/demo-data/README.md` (+ `docs/demo-data/pacientes-demo.csv`), `docs/demo-pilot-v0.1-script.md`, `docs/demo-pilot-v0.1-checklist.md` — seed dev-only de agenda: `backend/scripts/seed-demo-scheduling.ts` (`pnpm --filter backend seed:demo` / `seed:demo:clean`)
> - **Checklist de testes (build/curl/SQL/responsivo):** `docs/testing-checklist.md`
> - **Fonte de verdade de produto/arquitetura/STRIDE/LGPD:** `docs/ClinicBridge_Documentacao_Mestre.md`

## Estado atual (resumido — atualizado 2026-05-23)

**Última sprint aprovada: Sprint 3.22** — **CRUD administrativo de pacientes**
(criação manual + edição + arquivar/restaurar via soft-delete). Backend:
`POST /patients` e `PATCH /patients/:id` (dono + secretaria), `PATCH
/patients/:id/archive` e `.../restore` (**somente dono**); `GET /patients` aceita
`status=active|archived|inactive|all` (**default `active`**). Soft-delete via
`status='archived'` (**sem delete físico**; agendamentos preservados); arquivado
sai da listagem padrão **e** do seletor da agenda. Cross-tenant → **404 genérico**
(`patient_not_found`). CPF nunca volta bruto (só `cpf_masked`); audits
`patient.create/update/archive/restore.success` **sem PII**. Sem migration.

**Em validação/finalização: Sprint 3.23** — **duplicados acionáveis** (frontend,
**sem backend**). A tela "Possíveis duplicados" passou de informativa a acionável,
**reusando o CRUD da 3.22**: por registro do grupo dá para **editar** (dono +
secretaria, form inline `PatientEditForm`) e **arquivar/restaurar** (**somente
dono**). Destaca os campos que bateram, mostra status por registro, **só CPF
mascarado**, paginação simples de grupos no frontend ("Carregar mais grupos").
Após ação, recarrega duplicados **e** a lista de pacientes (contador compartilhado
`patientsRefresh` no Dashboard). **Sem merge** (automático ou manual), **sem delete
físico**, **sem** mexer no pipeline de import/dry-run. Avisos: "Revise os dados
antes de arquivar", "Arquivar não apaga histórico nem agendamentos", "Merge
automático ainda não existe". **Gap conhecido:** o papel `secretaria` não é
testável pelo navegador (só existe via SQL) até haver gestão de equipe na UI — ver
sprint futura no `docs/roadmap-next-phase.md`.

**Fase:** Fase 3 (produção/governança) + trilha da Agenda Administrativa em curso;
Sprint 2 (pipeline de importação) completa. **Este MVP NÃO está pronto para
produção** (ver ressalvas P1 em `docs/security-notes.md`). Nunca descrever como
"pronto para produção". Estado detalhado e por-sprint: `docs/project-state.md`.

**O que existe:** auth (JWT, `/auth/me`, rate limit, audit); upload CSV/XLSX com
magic bytes; preview + mapeamento; validação full-file; sessões de migração;
dry-run; mark-ready; importação controlada; recibo persistido; listagem de
pacientes (CPF mascarado); **CRUD administrativo de pacientes (criar/editar
manual + arquivar/restaurar por soft-delete, Sprint 3.22)**; duplicados —
**detecção read-only + tela acionável** (editar/arquivar/restaurar por registro
reusando o CRUD, Sprint 3.23; **sem merge**); export CSV/XLSX; hardening de rate
limit; retenção dry-run (backend + painel
frontend); responsividade mobile; `requireRole` por papel nos endpoints
administrativos sensíveis (Sprint 3.1); `TRUST_PROXY` configurável + rate limit
com store memory/redis (Sprint 3.2). Detalhe e endpoints: `docs/project-state.md`.

**O que NÃO existe (precisa sprint explícita):** prontuário/dados clínicos;
**merge de pacientes**; **delete físico** de paciente (arquivar é soft-delete);
limpeza real de arquivos; signed URL/download; job/cron; gestão de usuários/papéis
na UI (papel é definido no registro/SQL).

**Migrações (em ordem):** `20260520000000_init` (users/clinics/tokens) ·
`20260521000000_audit_logs` · `20260522000000_import_files` ·
`20260523000000_import_sessions` · `20260524000000_patients` ·
`20260525000000_import_sessions_summary` · `20260526000000_scheduling`
(clinic_professionals/appointments — Agenda Administrativa, Sprint 3.14) ·
`20260527000000_user_mfa` (campos MFA/TOTP em users — Sprint 3.19) ·
`20260528000000_user_mfa_backup_codes` (tabela `user_mfa_backup_codes` — Sprint 3.21).

**Invariantes locais (sanity-check, podem mudar):** patients=6 (base, sem demo),
import_files=24, import_sessions=7. `clinic_professionals`/`appointments` contêm
dados de teste manual de UI (ex.: 1 prof / 3 agend.); o **seed de demo** (`pnpm
--filter backend seed:demo`) adiciona +3 profissionais, +5 pacientes
(`origem='seed_demo'`) e +7 agendamentos, **revertíveis** por `seed:demo:clean`.
audit sem PII. Reconfira via `docs/testing-checklist.md`.

## Direção estratégica (aceita 2026-05-22)

**Decisão estratégica aceita: Opção C** (híbrido inteligente) — **base
administrativa segura primeiro**, com a arquitetura mantida preparada para
**expansão clínica futura** (planejada, não implementada agora). **Não codar
prontuário/prescrição/dados clínicos sem ADR futura** dedicada. Detalhe e
critérios de gating: `docs/adr/0001-product-direction-option-c.md`. Sequência de
fases: `docs/roadmap-next-phase.md`.

## Próximas prioridades prováveis

- **Produto (trilha pacientes):** **3.23 entregue (frontend)** = duplicados
  acionáveis (editar/arquivar/restaurar por registro reusando o CRUD da 3.22;
  paginação de grupos no frontend). **Próximo no tema:** **merge seguro** (com
  confirmação + audit, **sem** merge automático; mover agendamentos exige decisão
  própria) e **paginação backend** de duplicados se a base crescer. Sprint futura =
  **gestão de equipe / convite de secretaria** (secretaria solicita entrada → dono
  aprova → papel aplicado, tudo auditado, **sem autoentrada**); enquanto não
  existir, o **teste do papel secretaria pelo navegador segue pendente** (hoje só
  via SQL). Detalhe: `docs/roadmap-next-phase.md`.
- **P1 (antes de produção):** ~~trust proxy~~ + ~~Redis/shared store p/ rate
  limit~~ (feitos na Sprint 3.2; falta só provisionar Redis/proxy reais e setar
  `TRUST_PROXY`/`REDIS_URL` em prod); ~~requireRole/dono-admin~~ (Sprint 3.1);
  política técnica de retenção criada (Sprint 3.3 — `docs/data-retention-policy.md`
  + ADR 0002; falta validação jurídica); backup/restore Restic-first decidido
  (3.4) e **local implementado + restore drill validado (3.5)** — scripts em
  `scripts/` + runbook; falta **offsite/produção**; deploy seguro com **baseline
  auditada + checklist (3.6 — `docs/deploy-security-checklist.md` + ADR 0004;
  guardas de produção no env.ts/app.ts)** + **readiness `/health/ready` (3.7)** +
  **estratégia de borda Nginx + WAF decidida (3.8 — ADR 0005)** + **Nginx reverse
  proxy local/staging implementado (3.9 — `infra/nginx/`, profile `edge`)** +
  **backend containerizado + e2e Nginx→backend→DB/Redis (3.10 — `backend/Dockerfile`)**
  + **TLS local/staging (cert autoassinado) + HTTP→HTTPS (3.11 —
  `scripts/generate-local-nginx-cert.sh`)**; falta TLS real em produção (cert
  ACME/gerenciado + domínio + HSTS), WAF e o deploy real (secrets manager).
- **P2:** limpeza real de arquivos (confirmação/soft-delete/quarentena/auditoria/
  idempotência/lock); paginação de duplicados; export streaming/assíncrono;
  rate limit dedicado em GETs leves se necessário.
- **P3:** antivírus/sandbox/DLP; validação XLSX OPC/XML completa se o risco
  aumentar; observabilidade/métricas; `.xlsm`/`.xlsb` só se houver necessidade.

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
- **Escopo clínico proibido:** não criar prontuário, diagnóstico, prescrição,
  exames, CID, medicamentos ou dados clínicos sem sprint explícita. CRUD
  administrativo de paciente (criar/editar/arquivar/restaurar) existe (Sprint
  3.22) e é **somente administrativo**; **merge** e **delete físico** de paciente
  continuam proibidos sem sprint explícita.
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
  /patients/:id/archive`** e **`PATCH /patients/:id/restore`** (Sprint 3.22).
  `secretaria` (operator) faz upload/preview/validate/create-session/dry-run,
  leitura de pacientes/duplicados e **criar/editar paciente** (`POST /patients`,
  `PATCH /patients/:id`) — mas **não** arquivar/restaurar. 403 → `{ error: {
  code: 'forbidden_role', ... } }`. Papel vem do JWT (sem hit no DB); risco de
  papel stale até o token expirar — aceitável enquanto não há gestão de usuários
  na UI (ver `docs/security-notes.md`).
- **Limites MVP:** `IMPORT_MAX_ROWS=100` (intencional).

## Project identity

ClinicBridge é um SaaS / Micro SaaS para ajudar clínicas pequenas e profissionais
de saúde a migrar **dados administrativos** de sistemas antigos para exports
limpos, organizados e revisáveis. **NÃO é um sistema de prontuário.**

O MVP foca em: dados administrativos do paciente; contatos; agendamento;
convênio; import CSV/XLSX; mapeamento de colunas; validação; detecção de
duplicados; revisão; export limpo; audit logs.

O MVP evita: prontuário completo; diagnóstico; prescrições; resultados de exames;
telemedicina; assinaturas médicas; faturamento com integração de convênios; app
mobile. Se uma tarefa tentar expandir para essas áreas, **pare e peça confirmação.**

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
definitiva, solução completa de saúde). Descreva o ClinicBridge como: focado;
seguro por design; com escopo; migração de dados administrativos; MVP prático.

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
