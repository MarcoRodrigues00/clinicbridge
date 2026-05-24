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
> - **Merge seguro de duplicados (B-safe; decidido na Sprint 3.32, implementação 3.33/3.34; administrativo, sem delete físico, sem undo completo):** ADR `docs/adr/0007-safe-patient-duplicate-resolution.md`
> - **Runbook Nginx + backend containerizado local/staging (`infra/nginx/`, `backend/Dockerfile`, profile `edge`):** `docs/nginx-local-staging-runbook.md`
> - **Demo/piloto v0.1 (Sprint 3.20; dados fictícios, não clínico):** `docs/demo-data/README.md` (+ `docs/demo-data/pacientes-demo.csv`), `docs/demo-pilot-v0.1-script.md`, `docs/demo-pilot-v0.1-checklist.md` — seed dev-only de agenda: `backend/scripts/seed-demo-scheduling.ts` (`pnpm --filter backend seed:demo` / `seed:demo:clean`)
> - **Checklist de testes (build/curl/SQL/responsivo):** `docs/testing-checklist.md`
> - **Fonte de verdade de produto/arquitetura/STRIDE/LGPD:** `docs/ClinicBridge_Documentacao_Mestre.md`

## Estado atual (resumido — atualizado 2026-05-24)

**Sprint 3.34** (entregue) — **frontend/UX do merge seguro de duplicados
B-safe** (consome a API da Sprint 3.33; ADR 0007). Sem mudança em
backend/services/DAOs/migrations/agenda/importação. Backend mudou só no
**model público** (`PublicPatient` ganha `merged_into_id` + `merged_at`;
**não é PII** — UUID + timestamp; **nome do principal NÃO** é buscado/exposto).
**Frontend:** `DuplicatesList` ganha **rádio "Manter como principal"**
(owner-only, sem pré-seleção) por registro de cada grupo, **botão "Resolver
duplicado"** no rodapé do grupo (desabilitado sem seleção), **`ConfirmDialog`
variant `danger`** com copy explícita ("mantém o principal, move agendamentos
dos duplicados, preenche apenas campos vazios, nunca sobrescreve, arquiva
duplicados, nada é apagado fisicamente, esta versão ainda não tem desfazer
completo"). Após sucesso: mensagem inline + invalida `['appointments']` e
`['patients']` no TanStack Query (Agenda mostra o nome certo na próxima
visualização). Secretaria/funcionário(a) **não vê** rádio nem botão (UI esconde;
backend continua sendo defesa real — 403 `forbidden_role`). `PatientsList`
mostra badge discreto "Mesclado em outro registro" em arquivados que têm
`merged_into_id` (sem lookup do nome do principal). `secondary_ids` é derivado
no cliente como `grupo - principal escolhido`; envio único `POST
/patients/:id/merge` atômico. **Sem** seleção campo-a-campo, **sem** undo,
**sem** delete físico, **sem** endpoint novo (contagem de agendamentos por
paciente fica para sprint futura — copy genérica nesta versão). `backend
typecheck`/`build` ✅, `frontend typecheck`/`build` ✅, container backend
rebuildado. Smoke API confirma shape com `merged_into_id`/`merged_at` em todas
as respostas de paciente. Validação visual manual no navegador pendente.

**Sprint 3.33** (entregue) — **backend + migration + API do merge seguro de
duplicados (B-safe)** (ADR 0007). Migration `20260601000000_patients_merged_into`
adiciona `patients.merged_into_id` (uuid NULL FK → patients, `ON DELETE SET NULL`)
+ `patients.merged_at` (timestamptz NULL) + índice parcial. Endpoint **owner-only**
`POST /patients/:id/merge` (`patientsRateLimit` → `requireAuth` → `requireClinic` →
`requireRole(CLINIC_ADMIN_ROLES)`). Body `{ "secondary_ids": ["uuid", ...] }` —
**1 a 10** secundários, sem duplicatas, sem o próprio principal. Em **uma
transação** (`patientMergeService`): re-fetch tenant-scoped do principal +
secundários (todos `active` e nunca mesclados; senão **404 genérico
`patient_not_found`** — sem distinguir inexistente/cross-tenant/archived);
**fill-blanks não-destrutivo** só em `telefone|email|cpf|data_nascimento|convenio|
numero_carteirinha` (**nunca** `nome`, **nunca** sobrescreve); ordem **=
secondary_ids como enviado** (reflete a futura UI 3.34); para cada secundário,
`appointmentDao.reassignPatientForClinic` (UPDATE tenant-scoped) +
`patientDao.setMergedInto` com **CAS** (`WHERE id AND clinica_id AND
status='active' AND merged_into_id IS NULL`) — CAS miss → rollback total; audit
`patient.merge.success` **dentro** da transação, uma linha por par
(`recurso_id="<primaryId>|<secondaryId>"`, 73 chars). **Response:** `{ patient:
PublicPatient (cpf_masked), merge: { merged_count, moved_appointments_count,
archived_secondary_ids, filled_fields } }`. **CPF bruto nunca sai**; valores dos
secundários nunca aparecem; **audit sem PII**. Erros: 400 `merge_invalid`, 404
`patient_not_found`, 403 `forbidden_role`, 401. **Sem** delete físico, **sem**
undo/snapshot, **sem** seleção campo-a-campo, **sem** dado clínico, **sem**
frontend (3.34). `backend typecheck`/`build` ✅, `migrate:latest` ✅, matriz por
API **18/18** (`/tmp/sprint-3.33-merge-test.mjs`), SQL pós-teste confirma
invariantes; dados descartáveis removidos.

**Sprint 3.32** (entregue — ADR/docs only) — decisão do **merge seguro de
duplicados (B-safe)**. Sem código. Criou `docs/adr/0007-safe-patient-duplicate-resolution.md`
fixando: dono escolhe principal → move agendamentos dos secundários → fill-blanks
não-destrutivo (só campos vazios) → arquiva secundários (soft-delete) → tudo em
transação, owner-only, audit sem PII, idempotente, cross-tenant 404. Migration
mínima (`merged_into_id`/`merged_at`) e endpoint `POST /patients/:id/merge` foram
implementados em 3.33.

**Sprint 3.31** (entregue) — **hardening backend** dos achados da
super revisão pós-3.28 (concorrência + trilha de auditoria nas solicitações de
entrada). **Sem migration, sem nova feature, sem mudança de API/permissão/frontend.**
(1) `clinicJoinRequestDao.setStatus` virou **compare-and-set** (`WHERE id AND
status='pending'`) — impede sobrescrever decisão concorrente; (2) fecha o
TOCTOU em `cancelMine` (e checa retorno em `approve` dentro da transação, antes
de `setClinic`, e em `reject`) → **409 `invalid_state`** quando a request deixou
de ser pendente; (3) `cancelOtherPending` agora grava `decided_by_user_id` +
`decided_at` no cascade-cancel (campo **não exposto na API**). Colunas já
existiam (`20260529000000`). `backend typecheck`/`build` OK; matriz por API
**18/18** (`/tmp/sprint-3.31-api-test.mjs`).

**Sprint 3.30** (entregue) — **QA / validação visual** do fluxo
completo da aba Equipe. Sem backend, sem API, sem migration, sem permissão, sem
nova feature. Validação manual no navegador pelo usuário (sprints 3.24–3.28):
login owner, código de convite, Copiar/Regenerar (ConfirmDialog), solicitações
pendentes, Aprovar/Recusar, membros ativos/inativos, Desativar acesso (modal
danger), profissionais da agenda, seletor da aba Agenda sincronizado. Nenhum bug
bloqueante. Fluxo Equipe aprovado.

**Sprint 3.29** (entregue) — **docs/QA** sprint. Docs atualizados para refletir
Sprint 3.28 (modal custom) e os nits pós-revisão. Checklist visual integrado do
fluxo Equipe em `docs/testing-checklist.md`. Demo script e checklist piloto
expandidos com bloco da aba Equipe.

**Sprint 3.28** (entregue, nits pós-revisão aplicados) — **modal custom de
confirmação** para ações sensíveis da aba Equipe (frontend only; sem
backend/API/migration/permissão). `ConfirmDialog.tsx` + `ConfirmDialog.module.css`
reutilizável: `<dialog>` nativo, variantes `default|danger`, `isBusy` com spinner,
ESC/backdrop respeitam `onCancel`. Nits: `useId()` para IDs únicos entre os dois
dialogs montados simultaneamente, `.secondaryBtn:disabled` adicionado ao CSS,
tratamento de erro redesenhado (dialog fica aberto em `onError`, erro aparece
inline com `role="alert"`). 5 ações migradas: Regenerar, Aprovar, Recusar,
Desativar acesso (4 `window.confirm` removidos de TeamManagementPanel) e Desativar
profissional (confirmação adicionada ao ClinicProfessionalsPanel). `frontend
typecheck`/`build` OK. Validação visual pendente.

**Sprint 3.27** — **polimento visual da aba Equipe**
(frontend only; sem backend/API/migration/permissão). Chips de categoria nos
títulos ("Acesso ao sistema" no `TeamManagementPanel`; "Aparece na agenda" no
`ClinicProfessionalsPanel`) deixam óbvia a diferença entre membros com login e
profissionais da agenda. Código de convite ganhou peso visual (mono 1.15rem +
letter-spacing maior); botão **Regenerar** virou variante `ghostBtn` (transparente,
só borda) para parecer secundário sem virar danger; **Recusar** deixou de ser
danger (mais coerente — recusar pedido não é destrutivo); **Desativar acesso**
continua sendo o único `dangerBtn` na lista de membros; cards inativos ganharam
`border-left` cinza-azulado frio (escaneáveis sem virar alerta); empty states e
mensagens de `window.confirm` reescritos em tom mais humano e administrativo;
mobile `@max-width:480px` empilha botões full-width nos dois painéis. Sem
mudança de comportamento; só copy/CSS/markup. `frontend typecheck`/`build` OK.

**Sprint 3.26** — **regenerar código de convite da
clínica** (backend + frontend, **sem migration**). Owner-only `POST
/clinics/invite-code/regenerate` rotaciona `clinics.invite_code` com retry curto
sobre o índice único. **Não cancela solicitações pendentes** (decisão registrada
em `docs/security-notes.md`): a pendente foi criada por alguém que já provou
posse do código antigo e aguarda decisão manual do dono — recusar em lote sem
revisão seria destrutivo. Audit `clinic.invite_code.regenerated.success` com
`recurso='clinic'`, `recurso_id=clinica_id`, **sem** invite code (nem antigo nem
novo). Frontend: botão "Regenerar" ao lado de "Copiar" no `TeamManagementPanel`,
com `window.confirm` explicando que (a) o código antigo deixa de funcionar para
NOVAS solicitações, (b) pendentes e membros atuais NÃO são afetados; mensagem de
sucesso mostra o novo código uma vez. Validação por API **12/12**.

**Sprint 3.25 + 3.25.1** — **gestão de membros da
equipe** (3.25, backend + frontend) + **reorganização Agenda↔Equipe** (3.25.1,
frontend only). Aba **Equipe** agora tem 3 seções, na ordem: (1) Código de convite
+ Solicitações pendentes, (2) Membros da equipe (acesso ao sistema, 3.25), (3)
Profissionais da agenda (cadastro administrativo migrado da aba Agenda em 3.25.1;
podem ou não ter login). A aba **Agenda** ficou focada nos agendamentos e
consome o seletor de profissionais ativos via cache compartilhada
`['clinic-professionals']`. Backend, rotas, permissões e contrato de
`clinic_professionals` **não mudaram**. Dono lista
**ativos + inativos** e pode **desativar acesso** de funcionários(as) (não deleta
usuário, não toca em audit/dados criados). Migration leve
(`20260530000000_clinic_join_requests_revoked`) estende o CHECK do status de
`clinic_join_requests` para aceitar `revoked` (linha histórica do desligamento).
Endpoints owner-only `GET /clinic-members` e `PATCH
/clinic-members/:userId/deactivate`. Sem reativação por endpoint — funcionário(a)
desligado(a) pode pedir entrada de novo via invite (fluxo da 3.24). Audits sem
PII: `clinic.member.list.success`, `clinic.member.deactivated.success`. Para
fechar o gap de stale JWT, `requireClinic` agora faz **1 SELECT por request
tenant-scoped** verificando `users.ativo` e `users.clinica_id === auth.clinica_id`
— mismatch → 403 `clinic_membership_revoked` (efetivo imediato, sem rotação de
token). Auto-desativação bloqueada (400 `cannot_deactivate_self`); dono não pode
ser removido por aqui (`cannot_deactivate_owner`); cross-tenant → 404
`member_not_found`. Validação por API **14/14**.

**Sprint anterior: Sprint 3.24.1** (entregue) — copy generalizada para
"funcionário(a)/equipe" no frontend; role técnica `secretaria` mantida no backend.

**Sprint 3.23** — **duplicados acionáveis** (frontend,
**sem backend**). A tela "Possíveis duplicados" passou de informativa a acionável,
reusando o CRUD da 3.22: editar por registro (dono + secretaria, form inline
`PatientEditForm`) e arquivar/restaurar (**só dono**). Destaque dos campos que
bateram; status por registro; só CPF mascarado; paginação simples de grupos no
frontend. **Sem merge** (automático ou manual), **sem delete físico**.

**Sprint 3.22** — **CRUD administrativo de pacientes** (criação manual + edição +
arquivar/restaurar via soft-delete). Backend: `POST /patients` e `PATCH
/patients/:id` (dono + secretaria), `PATCH /patients/:id/archive` e `.../restore`
(**somente dono**); `GET /patients` aceita `status=active|archived|inactive|all`
(**default `active`**). Soft-delete via `status='archived'` (**sem delete físico**).
CPF nunca volta bruto. Audits sem PII. Sem migration.

**Em validação/finalização: Sprint 3.24** — **gestão de equipe / solicitação de
entrada de funcionário(a)** (primeira sprint da trilha "equipe"). Backend + frontend.
**Linguagem de produto (3.24.1):** UI fala em "funcionário(a)" / "equipe" /
"membro da equipe"; a role técnica do backend permanece `secretaria` no JWT/DB
(sem migration/refactor). Outras roles (recepção, financeiro, gestor) ficam para
sprint futura — não implementadas agora.
Migration `20260529000000_clinic_team` adiciona `clinics.invite_code` (unique) e
a tabela `clinic_join_requests`. Cadastro agora aceita `account_type: owner|staff`
(default `owner`; staff cria `secretaria` **sem** clínica). Dono vê o código de
convite em `GET /clinics/invite-code` e gerencia pendentes em `GET
/clinic-join-requests/pending` + `.../approve|reject` (`requireRole`). Secretaria
sem clínica usa `POST /clinic-join-requests` (código + nome opcional como
**confirmação** + mensagem ≤280) e gerencia as próprias em `.../me` + `.../cancel`.
**Sem busca/listagem pública de clínicas**, **sem invite automático por
e-mail/WhatsApp**, **sem autoentrada**, **sem regeneração de código** (sprint
futura). Erros do invite são **genéricos** (`invalid_invite`) para impedir
enumeração. Aprovar é atômico (setStatus + setClinic + cancela outras pendentes
do mesmo usuário). Cross-tenant/inexistente → **404 genérico** `request_not_found`.
Audits `clinic.join_request.created/cancelled/approved/rejected.success` **sem
PII**. Frontend: seletor owner/staff no `RegisterPage` (rótulos "funcionário(a)
/ membro da equipe"); `JoinClinicGate` para usuários sem clínica (form do código
+ lista das próprias com cancelar); `TeamManagementPanel` (aba **Equipe**, só
dono — código + Copiar + pendentes com Aprovar/Recusar; rótulo do papel exibido
como "funcionário(a) (acesso administrativo)"). Polling leve via TanStack Query.
Validação por API **23/23**.
**Gap (encerrado):** a partir desta sprint o papel `secretaria` é testável pelo
navegador (cadastro de funcionário(a) + aprovação pelo dono).

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
**delete físico** de paciente (arquivar é soft-delete); **undo completo do
merge** (3.33/3.34 só gravam `merged_into_id`/`merged_at`; não há snapshot dos
campos antigos nem dos appointments movidos); **seleção campo-a-campo** no merge
(só fill-blanks não-destrutivo); **contagem de agendamentos por paciente** na
UI do merge (3.34 usa copy genérica — sem endpoint novo nesta sprint); **lookup
do nome do principal** no badge "Mesclado em outro registro" (intencional —
mantém UI honesta e evita PII desnecessária); limpeza real de arquivos; signed
URL/download; job/cron; gestão de usuários/papéis na UI (papel é definido no
registro/SQL).

**Migrações (em ordem):** `20260520000000_init` (users/clinics/tokens) ·
`20260521000000_audit_logs` · `20260522000000_import_files` ·
`20260523000000_import_sessions` · `20260524000000_patients` ·
`20260525000000_import_sessions_summary` · `20260526000000_scheduling`
(clinic_professionals/appointments — Agenda Administrativa, Sprint 3.14) ·
`20260527000000_user_mfa` (campos MFA/TOTP em users — Sprint 3.19) ·
`20260528000000_user_mfa_backup_codes` (tabela `user_mfa_backup_codes` — Sprint 3.21) ·
`20260529000000_clinic_team` (`clinics.invite_code` + `clinic_join_requests` —
Sprint 3.24) · `20260530000000_clinic_join_requests_revoked` (estende
`cjr_status_check` para incluir `'revoked'` — Sprint 3.25) ·
`20260601000000_patients_merged_into` (`patients.merged_into_id` +
`patients.merged_at` + índice parcial — proveniência do merge B-safe, Sprint 3.33).

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

- **Produto (trilha pacientes):** **3.23/3.32/3.33/3.34 entregues** = duplicados
  acionáveis (3.23), decisão B-safe (3.32 ADR), backend+API do merge (3.33) e
  **UX de merge na tela de duplicados** (3.34: rádio "Manter como principal",
  botão "Resolver duplicado", `ConfirmDialog` danger, badge "Mesclado em outro
  registro" em Arquivados, invalidação de cache de Agenda). **Próximo no tema:**
  **validação visual** manual da 3.34 (script em `docs/testing-checklist.md`);
  futuro: contagem de agendamentos por paciente na UI do merge (exige endpoint
  novo); **paginação backend** de duplicados se a base crescer; **undo/snapshot**
  completo (tabela própria + ADR).
- **Produto (trilha equipe):** **3.24/3.24.1/3.25 entregues** = solicitação de
  entrada por código de convite, aprovação pelo dono, copy generalizada para
  "funcionário(a)/equipe", **gestão de membros (listar ativos/inativos,
  desativar acesso)** com fechamento do gap de stale JWT via DB check em
  `requireClinic`. **Próximo no tema:** **regenerar invite code** (invalidando
  pendentes opcionalmente), **sair voluntariamente** da clínica, e — quando
  necessário — **roles granulares** (recepção, financeiro, gestor) com ADR
  própria. Troca de dono **continua fora de escopo**. Detalhe:
  `docs/roadmap-next-phase.md`.
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
  3.22) e é **somente administrativo**. **Merge** de paciente está implementado
  no backend (Sprint 3.33; ADR 0007 B-safe administrativo): fill-blanks
  não-destrutivo + mover agendamentos tenant-scoped + arquivar secundário com
  CAS, **owner-only**, em transação, **audit sem PII**, **CPF nunca bruto**,
  **sem** seleção campo-a-campo, **sem** undo completo/snapshot, **sem** nada
  clínico, **sem** delete físico (continua proibido). Frontend chega na 3.34.
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
  / "sua secretária" / "cadastro de secretaria". Outras roles (recepção,
  financeiro, gestor) ficam para sprint futura — não criar agora.

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
