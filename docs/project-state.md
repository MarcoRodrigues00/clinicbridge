# ClinicBridge — Estado do Projeto (detalhado)

> Estado detalhado movido do `CLAUDE.md` na compactação de 2026-05-22. O
> `CLAUDE.md` mantém o resumo; este arquivo guarda a versão completa.
> Histórico por sprint: `docs/sprint-history.md`. Notas de segurança e
> ressalvas: `docs/security-notes.md`. Checklist de testes: `docs/testing-checklist.md`.

## Última sprint aprovada

**Sprint 3.39** (entregue — guards de boot + runbook de secrets) —
**secrets e env de produção: `MFA_ENCRYPTION_KEY` obrigatória em prod; `FRONTEND_ORIGIN`
sem localhost/http em prod.** Sem migration, sem feature de produto, sem commit/push.

**Mudanças de código:**
- `backend/src/config/env.ts`: dois novos guards no `superRefine` (bloco
  `NODE_ENV=production`):
  - `MFA_ENCRYPTION_KEY` ausente ou < 32 chars → boot falha com mensagem clara.
  - `FRONTEND_ORIGIN` com localhost, 127.0.0.1 ou http:// → boot falha.
- `.env.example`: comentários atualizados para refletir obrigatoriedade em produção
  de `MFA_ENCRYPTION_KEY` e o guard de `FRONTEND_ORIGIN` com exemplos de staging/prod.

**Arquivo criado:**
- `docs/secrets-env-production-runbook.md` — geração de secrets (`openssl rand -hex 32`),
  variáveis por ambiente (dev/staging/prod), caminhos SSM (`/clinicbridge/staging/*`,
  `/clinicbridge/prod/*`), injeção em runtime (script SSM + compose), caveats de
  rotação (JWT_SECRET invalida sessões; MFA_ENCRYPTION_KEY invalida TOTP), IAM mínimo
  (instance profile read-only no path correto), checklist de 14 itens.

**Validações executadas:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- 5 cenários de guard testados (NODE_ENV=production sem MFA_KEY → exit 1; com MFA_KEY
  curta → exit 1; com localhost FRONTEND_ORIGIN → exit 1; tudo correto → exit 0;
  dev sem MFA_KEY → exit 0) ✅

**Docs atualizados:** `docs/secrets-env-production-runbook.md` (criado),
`docs/production-minimum-plan.md`, `docs/deploy-security-checklist.md` (§3 + §15),
`docs/security-notes.md` (seção MFA + seção Deploy seguro),
`docs/project-state.md` (esta entrada), `docs/sprint-history.md`, `CLAUDE.md`.

**Pendente (aguarda EC2):** executar `aws ssm put-parameter` com os valores reais;
validar injeção de env no container de produção; emitir cert real (runbook DNS/TLS).

---

**Sprint 3.38** (entregue — Dockerfile + Nginx templates + runbook DNS/TLS) —
**preparação de staging/produção para DNS/TLS/Nginx, sem deploy real.** Sem
migration, sem feature de produto, sem commit/push.

**Mudança de código:** `backend/Dockerfile` linha 29 — `ENV NODE_ENV=development`
→ `ENV NODE_ENV=production`. Imagem agora tem default seguro; `docker-compose.yml`
local continua sobrescrevendo para `development` explicitamente (não há impacto
local). Build verificado: `docker compose --profile edge build backend` ✅;
health/ready 200 via proxy ✅; `NODE_ENV=development` no container local (compose
override) ✅.

**Arquivos criados:**
- `infra/nginx/conf.d/clinicbridge.production.conf.example` — template Nginx para
  `api.clinicbridge.com.br` (Let's Encrypt, TLS, anti-spoof, HSTS comentado,
  proxy headers completos). Extensão `.conf.example` evita carga automática pelo glob.
- `infra/nginx/conf.d/clinicbridge.staging.conf.example` — idem para
  `staging.clinicbridge.com.br`.
- `docs/dns-tls-staging-runbook.md` — passo a passo completo: pré-requisitos EC2,
  DNS Registro.br (4 registros A), Certbot standalone, dry-run renovação, reload
  automático, testes curl/openssl, HSTS go/no-go, rollback, checklist go/no-go.

**Docs atualizados:** `docs/production-minimum-plan.md` (NODE_ENV corrigido nas
tabelas; Sprint 3.38 como entregue), `docs/nginx-local-staging-runbook.md` (ponteiro
para novo runbook), `docs/deploy-security-checklist.md` (§5 com Sprint 3.38),
`docs/project-state.md` (esta entrada), `docs/sprint-history.md`, `CLAUDE.md`.

**DNS real e cert real:** pendentes — dependem de EC2 provisionada e Elastic IP.
Ver `docs/dns-tls-staging-runbook.md` para executar quando disponível.

---

**Sprint 3.37** (entregue — planejamento/docs only) — **Plano de produção mínima
segura com AWS como provedor preferido.** Sem backend, sem frontend, sem migration,
sem nova feature, sem código, sem infra real, sem commit/push.

Decisão estratégica registrada: **AWS é o provedor preferido** para hospedagem
futura do ClinicBridge. Decisões de sub-opção ainda pendentes (6 itens — ver
`docs/production-minimum-plan.md` Seção 5).

Arquivo criado: `docs/production-minimum-plan.md` com 7 seções:
(1) estado atual da infra local/staging; (2) arquitetura AWS mínima preferida
(EC2+Docker Compose inicial → ECS/Fargate; RDS PostgreSQL; ElastiCache Redis;
EBS→S3 para uploads; Nginx+Certbot ou Route 53+ACM+ALB para TLS; SSM Parameter
Store; CloudWatch Logs; Security Groups fechando Postgres/Redis da internet);
(3) gaps P0/P1/P2; (4) sequência de sprints 3.37–3.43; (5) decisões pendentes;
(6) o que não muda; (7) referências.

Decisão de domínio registrada: `clinicbridge.com.br` registrado no Registro.br em
2026-05-24 (expira 2027-05-24). Subdomínios planejados: `app.`, `api.`,
`staging.`. DNS ainda sem configuração para AWS — decisão de roteamento
(Registro.br DNS vs Route 53) fica para Sprint 3.38. Sem hospedagem/e-mail extras
no Registro.br.

Decisões pendentes agora 7 itens (compute, banco, storage, DNS/roteamento, TLS,
secrets, orçamento). Ver `docs/production-minimum-plan.md` Seção 5.

Gaps P0 documentados: `NODE_ENV=development` no Dockerfile runtime, TLS real
ausente, Postgres/Redis sem Security Groups, secrets em `.env` sem rotação.

Docs atualizados: `docs/production-minimum-plan.md` (criado e atualizado com domínio),
`docs/roadmap-next-phase.md` (seção Sprint 3.37 + tabela de sprints pré-produção),
`docs/project-state.md` (esta entrada), `docs/sprint-history.md`, `CLAUDE.md`.

---

**Sprint 3.36** (entregue — QA geral do piloto v0.1, docs-only) — Rodada de QA
consolidada dos fluxos principais do ClinicBridge antes do piloto. Sem backend,
sem frontend, sem migration, sem nova feature, sem commit/push.

10 fluxos cobertos: Auth, Equipe, Pacientes, Duplicados+Merge B-safe, Importação,
Agenda, Exportação, Retenção dry-run, Layout/demo, Segurança geral. Classificação
de achados: BLOCKER / BUG PEQUENO / POLISH / ACEITÁVEL MVP / FUTURO.
Nenhum BLOCKER identificado neste QA documental. Ressalvas aceitas documentadas
em `docs/testing-checklist.md` (seção "QA geral do piloto v0.1 — Sprint 3.36").

Docs atualizados: `docs/demo-pilot-v0.1-script.md` (step 3 atualizado de
"duplicados read-only" para "merge B-safe acionável"; perguntas de validação
expandidas), `docs/demo-pilot-v0.1-checklist.md` (seções Equipe e merge B-safe
expandidas; perguntas atualizadas), `docs/testing-checklist.md` (nova seção
"QA geral do piloto v0.1"), `docs/roadmap-next-phase.md` (próximos passos
pós-QA), `docs/sprint-history.md`, `CLAUDE.md`.

---

**Sprint 3.35** (entregue — docs/QA only) — **Validação visual da Sprint 3.34 + consolidação do checklist do merge B-safe**. Sem backend, sem frontend, sem migration, sem nova feature, sem commit/push.

A Sprint 3.34 (UX do merge seguro) foi validada visualmente pelo usuário em 2026-05-24 ("ficou bem fera"). Nenhum bug bloqueante encontrado. Fluxo de merge B-safe considerado funcional e validado para piloto. Itens validados (conforme checklist em `docs/testing-checklist.md`): rádio "Manter como principal" (owner-only), selo "Principal", botão "Resolver duplicado" (habilitado só com seleção), `ConfirmDialog` variant danger com copy B-safe, mensagem verde inline com contagens, grupo some após merge, secundário aparece em Arquivados com badge "Mesclado em outro registro", Agenda atualiza nome para o principal, secretaria não vê rádio/botão, CPF sempre mascarado. Sem regressão nos outros fluxos.

Docs atualizados nesta sprint: `docs/project-state.md` (esta entrada), `docs/sprint-history.md` (Sprint 3.35), `docs/testing-checklist.md` (cabeçalho atualizado), `CLAUDE.md` (estado atual), `docs/roadmap-next-phase.md` (trilha marcada como validada).

---

**Sprint 3.34** (entregue — backend model + frontend) — **UX do merge seguro de duplicados B-safe**. Consome a API da 3.33. Sem mudança em DAOs/services/migrations/agenda backend/importação/Equipe/Auth/MFA. **Sem** endpoint novo, **sem** seleção campo-a-campo, **sem** undo/snapshot, **sem** delete físico, **sem** lookup do nome do principal.

**Backend (mudança mínima — model público apenas):** `backend/src/models/patient.ts` — `PublicPatient` ganha `merged_into_id: string | null` + `merged_at: string | null`; `toPublicPatient` popula a partir de `row.merged_into_id` / `row.merged_at`. **Não é PII** (UUID + timestamp); habilita o badge "Mesclado em outro registro" no frontend. Sem migration; sem nova rota; sem nova permissão.

**Frontend:**
- `frontend/src/services/api.ts`: `PublicPatient` ganha as mesmas duas chaves; tipo novo `PatientMergeResponse` (`patient` + `merge: { merged_count, moved_appointments_count, archived_secondary_ids, filled_fields }`); método `api.mergePatients(token, primaryId, secondaryIds)` para `POST /patients/:id/merge`.
- `frontend/src/components/DuplicatesList.tsx`: **rádio "Manter como principal"** owner-only por registro de cada grupo (sem pré-seleção, estado `primaryByGroup` keyed por `group_key`, limpo a cada reload do scan); selo "Principal" no card escolhido; mensagem dinâmica no rodapé do grupo ("Os outros N registros serão arquivados como duplicados" / "Escolha o paciente principal antes de resolver"); **botão "Resolver duplicado"** desabilitado sem seleção; **`ConfirmDialog` variant `danger`** com copy explícita do comportamento B-safe (mantém o principal, move agendamentos dos duplicados se houver, preenche apenas campos vazios, nunca sobrescreve, arquiva duplicados, nada é apagado, sem desfazer completo); após sucesso: mensagem inline `mergeNotice` (verde, role="status") com contagens da resposta + `onPatientsChanged()` (bump `refreshKey`) + `queryClient.invalidateQueries({queryKey:['appointments']})` + `queryClient.invalidateQueries({queryKey:['patients']})` para sincronizar Agenda/picker; erro de API permanece **dentro** do modal (`error` prop do ConfirmDialog) com `FORBIDDEN_ROLE_MESSAGE` para 403.
- `frontend/src/components/DuplicatesList.module.css`: `.mergeNotice` (verde, sucesso), `.primaryRadio` + `.primaryRadioLabel` (controle owner-only), `.recordPrimary` (borda ciano no card escolhido), `.primaryTag` (selo "Principal"), `.mergeBar` + `.mergeBarHint` (rodapé tracejado), `.mergeBtn` (cyan-soft).
- `frontend/src/components/PatientsList.tsx`: badge discreto **"Mesclado em outro registro"** (`.mergedTag`, itálico cinza-claro) quando `p.status === 'archived' && p.merged_into_id`. Sem lookup do principal — copy genérica intencional. Estilo em `PatientsList.module.css`.

**Permissão:** UI esconde rádio + botão para não-owner (`isOwner`); backend continua sendo defesa real (`requireRole(CLINIC_ADMIN_ROLES)` na Sprint 3.33 já protege com 403 `forbidden_role`). Secretaria/funcionário(a) continua podendo editar via PatientEditForm e ver o badge "Mesclado em outro registro" (read-only).

**Contagem de agendamentos por paciente:** **não criada** nesta sprint. Endpoint `GET /appointments` atual aceita `date|professional_id|status` mas **não** `patient_id`. Decisão consciente: copy genérica no modal evita criar endpoint novo apenas para isso. Próxima sprint pode reavaliar.

**Verificação:** `pnpm --filter backend typecheck` ✅, `pnpm --filter backend build` ✅, `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅, `docker compose build backend && up -d backend` ✅. Smoke API (`/tmp/smoke-3.34.mjs`) confirma: (1) `PublicPatient` agora carrega `merged_into_id`/`merged_at` em criação/listagem/merge; (2) `POST /patients/:id/merge` continua devolvendo `{ patient, merge: {...} }`; (3) secundário arquivado lista com `merged_into_id` setado e `merged_at` ISO. Dados de teste removidos (clínica + usuário descartável). Sem commit/push.

**Validação visual aprovada pelo usuário em 2026-05-24** — checklist de `docs/testing-checklist.md` (Sprint 3.34) percorrido manualmente no navegador. Nenhum bug bloqueante encontrado. Fluxo de merge B-safe aprovado ("ficou bem fera"). Detalhes registrados na Sprint 3.35 abaixo.

---

**Sprint 3.33** (entregue) — **backend + migration + API do merge seguro de duplicados (B-safe)**. Implementação do que a Sprint 3.32 decidiu no ADR 0007. **Sem frontend** (3.34); **sem delete físico**; **sem undo/snapshot**; **sem seleção campo-a-campo**; **sem dado clínico**.

**Migration `20260601000000_patients_merged_into`:** aditiva — adiciona `patients.merged_into_id uuid NULL REFERENCES patients(id) ON DELETE SET NULL` + `patients.merged_at timestamptz NULL` + índice parcial `idx_patients_merged_into WHERE merged_into_id IS NOT NULL`. FK `SET NULL` é defensiva (não há delete físico; protege caso uma sprint futura introduza). Sem snapshot/undo. `down` remove índice e colunas.

**Endpoint `POST /patients/:id/merge`** (owner-only): `patientsRateLimit` → `requireAuth` → `requireClinic` → `requireRole(CLINIC_ADMIN_ROLES)`. Body `{ "secondary_ids": ["uuid", ...] }` (1–10 UUIDs, sem duplicatas, sem o próprio principal). Em **uma transação** (`patientMergeService`): (1) re-fetch tenant-scoped do principal + secundários (todos `status='active'` e `merged_into_id IS NULL`, senão **404 genérico `patient_not_found`**, sem distinguir inexistente de cross-tenant/arquivado); (2) **fill-blanks não-destrutivo** apenas em `telefone|email|cpf|data_nascimento|convenio|numero_carteirinha` — **nunca** `nome`, **nunca** sobrescreve valor já preenchido; ordem dos secundários **= ordem enviada em `secondary_ids`** (escolha reflete a futura UI 3.34); (3) para cada secundário, `appointmentDao.reassignPatientForClinic` (UPDATE tenant-scoped de `patient_id`; preserva status/data/notas; não mexe em `updated_by_user_id`) + `patientDao.setMergedInto` com **CAS** (`WHERE id AND clinica_id AND status='active' AND merged_into_id IS NULL`); CAS miss → 404 e rollback total; (4) audit `patient.merge.success` **dentro** da transação, uma linha por par (recurso='patient', recurso_id=`"<primaryId>|<secondaryId>"`, 73 chars cabem em varchar(80)); falha de audit aborta a transação.

**Response 200:** `{ patient: PublicPatient (principal atualizado, cpf_masked), merge: { merged_count, moved_appointments_count, archived_secondary_ids, filled_fields } }`. **CPF bruto nunca sai** (resposta usa `toPublicPatient`); valores dos secundários nunca aparecem na resposta — só o UUID que o caller já enviou. **Audit nunca contém PII**.

**Limite:** constante local `PATIENT_MERGE_MAX_SECONDARIES=10` (sem env nova nesta sprint; ADR permitia ≤50 — começamos conservador). **Erros:** 400 `merge_invalid` (principal em secondary_ids, vazio, duplicados, > limite, UUID inválido) · 404 `patient_not_found` (inexistente/cross-tenant/já archived/merged/CAS miss) · 403 `forbidden_role` (secretaria) · 401 (sem JWT).

**DAOs alterados:** `patientDao.applyFillBlanks` (UPDATE só dos campos passados) e `patientDao.setMergedInto` (CAS arquivamento + provenance); `appointmentDao.countByPatientForClinic` (telemetria interna) e `appointmentDao.reassignPatientForClinic` (UPDATE tenant-scoped retornando contagem). `PatientRow` agora inclui `merged_into_id`/`merged_at`; `PublicPatient` **não** expõe esses campos nesta sprint (UI 3.34 decide se quer expor para "mesclado em X").

**Arquivos:** `backend/migrations/20260601000000_patients_merged_into.ts` (novo), `backend/src/services/patientMergeService.ts` (novo), `backend/src/dao/patientDao.ts`, `backend/src/dao/appointmentDao.ts`, `backend/src/controllers/patientController.ts`, `backend/src/routes/patients.ts`, `backend/src/types/db.d.ts`. **Sem mudança** no pipeline de importação, em Equipe, Auth/MFA, frontend.

**Verificação:** `pnpm --filter backend typecheck`/`build` ✅, `migrate:latest` ✅ (batch 12), matriz por API **18/18** (`/tmp/sprint-3.33-merge-test.mjs`, contas descartáveis), SQL pós-teste confirma `merged_into_id`/`merged_at` setados + status `archived` + audit no formato `uuid|uuid` sem PII + counts preservados (nada deletado fisicamente). Dados de teste removidos (10 clínicas + 14 usuários descartáveis); audits da operação ficaram historicamente (FK SET NULL — comportamento de append-only correto). Sem commit/push.

**Próximo no tema:** 3.34 (frontend `DuplicatesList` com seleção do principal, contagem de appointments por registro, `ConfirmDialog`, validação visual; Agenda mostra nome certo após merge).

---

**Sprint 3.32** (entregue — ADR/docs only) — **decisão do merge seguro de duplicados (B-safe)**. Sem backend, sem migration, sem API, sem frontend, sem commit.

Criado `docs/adr/0007-safe-patient-duplicate-resolution.md`. **Problema:** hoje "Excluir duplicado" só arquiva; como a Agenda lista agendamentos sem filtrar por status do paciente e resolve nomes a partir de `listPatients` (default `status='active'`), arquivar um duplicado com agendamentos deixa esses agendamentos com **nome-fallback** (`"Paciente abc12345…"`). **Decisão (B-safe):** dono escolhe o paciente **principal** → **move agendamentos** dos secundários para o principal (reassign tenant-scoped de `appointments.patient_id`) → **fill-blanks não-destrutivo** (só preenche campos vazios do principal; nunca sobrescreve; correção real continua via `PatientEditForm`) → **arquiva** secundários (soft-delete; **sem delete físico**) → em **transação**, **owner-only**, **audit sem PII** (`patient.merge.success`, `recurso_id="<primaryId>|<secId>"`), **idempotente** (CAS no status), **cross-tenant → 404**. **Migration mínima decidida** (não criada ainda): `patients.merged_into_id` + `patients.merged_at` (proveniência; índice parcial opcional) — **sem** snapshot/undo completo. Endpoint alvo: `POST /patients/:id/merge` com **múltiplos `secondary_ids`** atômicos (degradação para um-por-chamada permitida se a implementação exigir). **NÃO nesta trilha:** seleção campo-a-campo, merge clínico/prontuário/diagnóstico/prescrição/CID/exame/tratamento, delete físico, undo completo/snapshot, merge automático sem confirmação humana. **Divisão:** 3.32 ADR/docs · 3.33 backend+migration+API · 3.34 frontend/UX+validação visual.

Verificação: nenhum build necessário (docs only). Sem commit/push.

---

**Sprint 3.31** (entregue) — **hardening backend** dos achados da super revisão pós-3.28 (concorrência + trilha de auditoria nas solicitações de entrada). Sem migration, sem nova feature, sem mudança de API/permissão, sem frontend.

Três achados tratados:
1. **`setStatus` pouco scoped → compare-and-set:** o `UPDATE` em `clinicJoinRequestDao.setStatus` ganhou `WHERE id = ? AND status = 'pending'`. Como `pending` é o único estado não-terminal, o guard é exaustivo e impede sobrescrever uma decisão concorrente.
2. **Race/TOCTOU em `cancelMine`:** com o CAS, se o dono aprovar entre o pre-fetch e o update, o cancelamento não casa nenhuma linha → **409 `invalid_state`** (antes podia reverter `approved`→`cancelled` deixando o usuário na clínica com request cancelada). `approve` checa o retorno **dentro da transação** (rollback se obsoleta, antes de `setClinic`); `reject` idem.
3. **`cancelOtherPending` sem trilha:** agora grava `decided_by_user_id` (dono que aprovou) + `decided_at` no cascade-cancel. Campo **não exposto na API** (sem leak cross-tenant).

Arquivos: `backend/src/dao/clinicJoinRequestDao.ts`, `backend/src/services/clinicJoinRequestService.ts`. **Sem migration** (colunas já existem desde `20260529000000`). Verificação: `backend typecheck`/`build` ✅; matriz por API **18/18** (`/tmp/sprint-3.31-api-test.mjs`, contas descartáveis, dados removidos). Sem commit/push.

---

**Sprint 3.30** (entregue) — **QA / validação visual** do fluxo completo da aba Equipe. Sem backend, sem API, sem migration, sem permissão, sem nova feature.

Validação manual no navegador pelo usuário cobrindo sprints 3.24–3.28: login owner, aba Equipe, código de convite, Copiar/Regenerar (ConfirmDialog), solicitações pendentes, Aprovar/Recusar (modal custom), membros ativos/inativos, Desativar acesso (modal danger), profissionais da agenda (criar/editar/desativar), seletor da aba Agenda sincronizado, layout geral. **Nenhum bug bloqueante encontrado. Fluxo aprovado.**

Metodologia: manual, sem automação de browser, sem prints anexados.

Verificação: nenhum build necessário (docs only). Sem commit/push.

---

**Sprint 3.29** (entregue) — **docs/QA** sprint. Sem backend, sem API, sem migration, sem permissão, sem nova feature. Docs atualizados para refletir Sprint 3.28 (modal custom) e as correções pós-revisão (nits). Checklist visual integrado do fluxo Equipe adicionado em `docs/testing-checklist.md`. Demo script e checklist piloto expandidos com bloco de demo da aba Equipe. `sprint-history.md` com Sprint 3.29.

Verificação: nenhum build necessário (docs only).

---

**Sprint 3.28** (entregue, nits aplicados pós-revisão) — **modal custom de confirmação** para ações sensíveis da aba Equipe. Frontend only; **sem backend, sem API, sem migration, sem permissão**.

Criados: `ConfirmDialog.tsx` + `ConfirmDialog.module.css` (componente reutilizável, `<dialog>` nativo, variantes `default`/`danger`, `isBusy` com spinner, ESC/backdrop respeitam `onCancel`, focus trap nativo). Migradas todas as 5 ações: Regenerar código, Aprovar, Recusar (TeamManagementPanel — 4 `window.confirm` removidos) + Desativar profissional (ClinicProfessionalsPanel — confirmação adicionada, antes disparava diretamente). Variante `danger` apenas em Desativar acesso e Desativar profissional.

**Pós-3.28 nits (revisão frontend/UX — aplicados antes do commit):**
- `.secondaryBtn:disabled` adicionado em `TeamManagementPanel.module.css` (estava ausente do bloco de disabled).
- `id` estático `"confirm-dialog-title"` substituído por `useId()` em `ConfirmDialog.tsx` — evita colisão de DOM quando dois dialogs estão montados simultaneamente.
- Tratamento de erro redesenhado: mutations **não** fecham o modal em `onError`; erro aparece **dentro** do modal com `role="alert"`; `openConfirm()` limpa notices/erros stale; `closeConfirm()` limpa o erro ao cancelar. Dialog fecha apenas em `onSuccess`.

Verificação: `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅. Validação visual no navegador pendente. Sem commit/push.

---

---

## Sprint 3.27 — polimento visual da aba Equipe (referência)
Frontend only; **sem backend, sem API, sem migration, sem permissão**. Apenas
copy/CSS/markup ajustados.

Mudanças visíveis ao usuário:
- **Chips de categoria** nos títulos: "Acesso ao sistema" no `TeamManagementPanel`
  (membros com login) e "Aparece na agenda" no `ClinicProfessionalsPanel`
  (profissionais que aparecem como responsável do agendamento, podem não ter
  login). Chips são neutros (cinza), distintos visualmente dos status badges.
- **Código de convite** ganhou peso (mono 1.15rem, letter-spacing 0.08em); vira
  o foco natural do bloco em demo/piloto.
- **Regenerar** virou `ghostBtn` (transparente, só borda) — claramente secundário
  a "Copiar" sem parecer danger. Texto do confirm (3.27) reduzido; 3.28 migrou para modal custom.
- **Recusar** (solicitação pendente) virou `secondaryBtn` (neutro) — recusar não
  é destrutivo. **Desativar acesso** (membro) segue sendo o único `dangerBtn` da
  lista de membros, mantendo o sinal correto.
- **Cards de membros inativos** ganharam `border-left` cinza-azulado frio +
  fundo levemente mais escuro. Escaneáveis sem virar alerta vermelho.
- **Copy nova nos empty states e nos avisos:**
  - Solicitações vazias: "Sem solicitações no momento. Compartilhe o código…"
  - Membros (só dono): "Só você por enquanto. Quando alguém entrar com o
    código, vai aparecer aqui."
  - Profissionais vazio: "Nenhum profissional cadastrado. Adicione quem realiza
    atendimentos — eles aparecem como responsáveis na agenda."
  - Confirm Regenerar: "Gerar um novo código de convite? O código atual deixa
    de aceitar NOVAS solicitações. Membros atuais e pedidos pendentes continuam
    intactos."
  - Confirm Desativar acesso: "Remover o acesso de {nome}? O histórico e os
    dados continuam preservados. A pessoa pode pedir entrada de novo com o
    código de convite."
- **Profissionais** ganhou rótulo no botão: "Desativar profissional" (em vez
  de "Desativar" genérico) — qualifica a ação e evita confusão com "Desativar
  acesso" (membro).
- **Subtítulo do ClinicProfessionalsPanel** começa agora com a ideia central
  em negrito leve ("Pessoas que aparecem como responsável no agendamento.").
- **Mobile** (`@max-width: 480px`): action buttons em `.actions` viram
  full-width nos dois painéis; chip de categoria ganha breathing room quando
  o título quebra.

Verificação: `pnpm --filter frontend typecheck` ✅ e `pnpm --filter frontend
build` ✅. Backend **não** rodado. Validação visual no navegador pendente.
Sem commit/push.

---

## Sprint anterior (3.26)

**Sprint 3.26** — **regenerar código de convite da
clínica**. Backend + frontend, **sem migration**.

Owner-only `POST /clinics/invite-code/regenerate` rotaciona `clinics.invite_code`
para um novo código único (reusa `generateInviteCode` em `utils/inviteCode.ts`;
retry curto de 6 tentativas; índice único `clinics_invite_code_unique` é a
defesa real). Resposta: `{ invite_code (XXXX-XXXX), clinic_name }` — mesmo shape
do `GET`. Cross-tenant não existe (rota não recebe `clinic_id` no path; o owner
só rotaciona a própria clínica, e `requireClinic` re-valida `users.clinica_id`
contra o DB — Sprint 3.25). Audit `clinic.invite_code.regenerated.success` com
`recurso='clinic'`, `recurso_id=clinica_id`, **sem** invite_code (nem antigo nem
novo).

**Decisão de produto/segurança (registrada em `docs/security-notes.md`):**
solicitações pendentes criadas com o código antigo **NÃO são canceladas** na
regen. A pendente prova posse anterior do código e aguarda decisão manual do
dono (que tem **Recusar** na UI). Cancelar em lote esconderia solicitações
legítimas; se um futuro use-case exigir "panic-cancel" associado à rotação,
abrir sprint própria com confirmação dupla.

**Frontend:** `TeamManagementPanel` ganhou botão **Regenerar** ao lado de
**Copiar** no bloco do código. Modal de confirmação custom (sprint 3.28) cobre as
3 frases obrigatórias: "código antigo deixará de funcionar para NOVAS
solicitações", "solicitações pendentes e membros atuais NÃO são alterados",
"compartilhe o novo código apenas com funcionários autorizados". Após sucesso,
`notice` exibe o novo
código uma vez e a cache key `['clinic-invite-code']` é invalidada.

**Verificação:** backend + frontend `typecheck`/`build` OK; matriz por API
**12/12** (códigos antigos rejeitados com `404 invalid_invite`; código novo
aceito; pendente pré-regen preservada; membro não-dono → `403 forbidden_role`;
staff sem clínica → `403 no_clinic_context`; audit row presente com
`recurso='clinic'` sem código). Sem migration; sem mudança em schema.

---

## Sprint anterior (3.25 + 3.25.1)

**Sprint 3.25** — **gestão de membros da equipe**
(backend + frontend). Continuação direta da trilha "equipe" iniciada em 3.24. Dá
ao dono visibilidade dos membros (ativos + ex-membros) e a ação de **desativar
acesso** de funcionários(as), sem deletar usuário, sem apagar audit/histórico, e
fechando o gap de stale JWT.

**Modelo escolhido (sem migration pesada):** o vínculo atual continua sendo
`users.clinica_id`. O histórico de pertencimento é registrado em
`clinic_join_requests`, agora com um quinto status `revoked` (migration leve
`20260530000000_clinic_join_requests_revoked` redefine o CHECK). Desativar um
membro = transação: `users.clinica_id := NULL` + insere linha
`status='revoked'` em `clinic_join_requests`. `users.ativo` **permanece `true`**
(não é banimento global — a pessoa pode pedir entrada em outra clínica ou na
mesma de novo via invite). Aprovar um ex-membro de novo cria nova cadeia
`pending → approved` na mesma tabela (sem desfazer a linha `revoked`).

**Endpoints (owner-only via `requireRole(CLINIC_ADMIN_ROLES)`):**
- `GET /clinic-members` — devolve **ativos + ex-membros** num único call. Cada
  item: `user_id, nome, email, papel, ativo, status: active|removed, is_owner,
  joined_at, removed_at`. `joined_at` é o `decided_at` da aprovação mais recente
  ou `users.criado_em` (fallback para o dono, que entrou via `/auth/register`).
- `PATCH /clinic-members/:userId/deactivate` — atômico. Recusa: `userId ===
  actor.usuario_id` → 400 `cannot_deactivate_self`; `userId ===
  clinic.responsavel_id` → 400 `cannot_deactivate_owner`; user não pertence à
  clínica (inexistente, outra clínica, já desligado) → **404 genérico**
  `member_not_found`. Sem `reactivate`: ex-membro re-entra via fluxo
  `POST /clinic-join-requests` + approve da 3.24.

**Fechamento do gap stale-JWT (`requireClinic` reforçado):** o middleware passou
a executar 1 SELECT por request tenant-scoped, verificando `users.ativo=true` e
`users.clinica_id === req.auth.clinica_id`. Mismatch → 403
`clinic_membership_revoked` (sem PII, sem distinção entre "trocou de clínica" e
"foi desligado"). Token expirado/usuário inativo → 401 `unauthorized`
(reaproveita o shape de requireAuth). Custo: 1 SELECT id-indexed; aceitável no
MVP. `papel` continua vindo do JWT (não é re-validado no DB — única transição
realista, `dono_clinica → secretaria`, **não** existe nesta sprint).

**Audits sem PII:** `clinic.member.list.success` (recurso=`clinic_member`,
`recurso_id=NULL`) e `clinic.member.deactivated.success`
(recurso=`clinic_member`, `recurso_id`=UUID do membro desligado). Nenhum carrega
nome/email/papel.

**Frontend:** `TeamManagementPanel` ganhou seção **"Membros da equipe"** com
toggle "Mostrar inativos", badge `Ativo(a)|Inativo(a)`, badge "Dono(a)" no
`is_owner`, papel exibido como "Funcionário(a) (acesso administrativo)" e botão
**Desativar acesso** (modal de confirmação custom danger — sprint 3.28 — que
deixa claro: não apaga usuário, não apaga histórico, pessoa pode pedir entrada
de novo com o código). UI esconde o botão para o próprio dono e para o
`is_owner`; backend continua sendo a defesa real. Polling leve (30s).

**Verificação:** migration aplicada (`migrate:latest` batch 11); backend +
frontend `typecheck`/`build` OK; matriz por API **14/14** (contas descartáveis;
dados removidos no fim).

**Restrições mantidas / NÃO feito (registrado):** sem delete físico de usuário;
sem reativação direta (pedir entrada via invite resolve); sem regeneração de
invite code (sprint futura); sem múltiplas clínicas por usuário; sem troca de
dono; sem **roles granulares** (recepção/financeiro/gestor — exigem ADR + nova
coluna + UI dedicada). Validação **visual** no navegador pendente.

**Polimento 3.25.1 — reorganização Agenda↔Equipe (frontend only):** o painel
`ClinicProfessionalsPanel` saiu da aba **Agenda** e foi para a aba **Equipe**
(abaixo de "Membros da equipe"). A aba **Agenda** ganhou um aviso curto
("Profissionais usados nos agendamentos são cadastrados em Equipe →
Profissionais da agenda.") e ficou focada nos agendamentos; continua consumindo
o seletor de profissionais ativos via cache `['clinic-professionals']` (chave
compartilhada — invalidate continua propagando para o picker da agenda).
Subtitle do painel ajustado para deixar explícito: alimenta o seletor da agenda;
profissional **pode ou não** ter login (≠ "Membro da equipe"); sem dado clínico.
**Sem backend / sem migration / sem mudança de permissões / sem mudança de
contrato.** `frontend typecheck`/`build` OK.

---

## Sprint anterior (3.24 + 3.24.1)

**Sprint 3.24** — **gestão de equipe / solicitação de
entrada de funcionário(a)**. Primeira sprint da trilha "equipe": permite que uma
secretaria se cadastre (sem clínica), peça acesso por um **código de convite** e
que o(a) dono(a) **aprove**. **Sem busca/listagem pública de clínicas**, **sem
e-mail/WhatsApp automático**, **sem autoentrada**, **sem regeneração de código
ainda**. Erros do invite são **genéricos** (`invalid_invite`) para impedir
enumeração de clínicas.

Migração `20260529000000_clinic_team`: `clinics.invite_code` (unique, case
insensitive, backfilled) + tabela `clinic_join_requests (status pending/approved/
rejected/cancelled, requested_role='secretaria', unique parcial em `(user_id,
clinic_id) WHERE status='pending'`).

Backend (rotas via `backend/src/routes/clinicJoinRequests.ts`, montadas em
`app.ts`):
- `POST /auth/register` aceita `account_type: owner|staff` (default `owner`;
  staff cria usuário `secretaria` **sem** clínica). `auth.register.staff.success`
  é auditado **sem PII**.
- `GET /clinics/invite-code` — dono (`requireRole(CLINIC_ADMIN_ROLES)`); devolve
  `invite_code` + nome da clínica para compartilhar fora do sistema.
- `POST /clinic-join-requests` — secretaria autenticada **sem clínica** envia
  código + nome opcional (confirmação exata; mismatch → mesmo `invalid_invite`)
  + mensagem opcional (≤280 chars). De-dup via lookup + índice parcial → 409
  `request_already_pending`. Papel **sempre** `secretaria` (CHECK no banco).
- `GET /clinic-join-requests/me` / `PATCH /clinic-join-requests/:id/cancel` —
  usuário lista as próprias e cancela pendentes.
- `GET /clinic-join-requests/pending` — dono lista pendentes da própria clínica
  (join com nome/email do solicitante, **só** visível ao dono, **nunca** logado).
- `POST /clinic-join-requests/:id/approve` — atômico: setStatus + `userDao.setClinic`
  + `cancelOtherPending` (usuário só pertence a uma clínica). Cross-tenant/
  inexistente → **404 genérico** `request_not_found`.
- `POST /clinic-join-requests/:id/reject` — dono recusa.
- Audits `clinic.join_request.created/cancelled/approved/rejected.success` com
  `recurso='clinic_join_request'` e apenas UUID em `recurso_id` (sem PII).
- Rate limit reutiliza `patientsRateLimit` (IP-keyed, antes do auth).

Frontend:
- `RegisterPage` ganhou seletor "Sou dono(a) / Sou funcionário(a)"; nome da clínica
  só aparece para `owner`; mensagem de sucesso muda por tipo.
- `JoinClinicGate` (novo, + módulo CSS): tela exibida no `/app` quando
  `user && !clinic` — form de invite code + (opcional) nome da clínica + mensagem;
  lista as próprias solicitações com status (pendente/aprovada/recusada/cancelada),
  botão **Cancelar** nas pendentes e **Recarregar sessão** após possível aprovação.
  Polling leve (15s). Bloqueia novo envio se já existe pendente.
- `TeamManagementPanel` (novo, + módulo CSS): aba **Equipe** no Dashboard, **só
  para `dono_clinica`** (UI esconde + backend gateia). Mostra o **código de convite**
  com **Copiar**, nome da clínica e **solicitações pendentes** (nome/e-mail/mensagem/
  data) com **Aprovar/Recusar** (cada ação abre modal de confirmação custom —
  sprint 3.28; aprovar dá acesso administrativo). Polling 20s.
- `api.ts` adicionou tipos `RegisterStaffPayload/Response`, `MyJoinRequest`,
  `PendingJoinRequest`, `InviteCodeResponse`, `JoinRequestStatus`; métodos
  `registerStaff`, `getClinicInviteCode`, `createClinicJoinRequest`,
  `listMyJoinRequests`, `cancelMyJoinRequest`, `listPendingJoinRequests`,
  `approveJoinRequest`, `rejectJoinRequest`. `register` agora envia
  `account_type:'owner'` (backward compatible).

Verificação: migration aplicada (`migrate:latest`); backend `typecheck`/`build`
OK; matriz por API **23/23** (após reiniciar o backend para limpar rate limit em
memória; dados de teste removidos no fim); frontend `typecheck`/`build` OK.
Validação **visual** no navegador pendente.

Restrições mantidas / NÃO feito (registrado): sem busca/listagem pública de
clínicas; sem invite automático por e-mail/WhatsApp; sem regeneração de código
(sprint futura); sem remoção/expulsão de membros pela UI; sem troca de papel
pelo dono; sem audit de "funcionário(a) removido(a) da equipe". Sem dado clínico.
Sem commit/push.

**Polimento de copy/UX (3.24.1, frontend only — ainda sem commit):** UI passou a
falar em "funcionário(a)" / "equipe" / "membro da equipe" em vez de "secretaria",
para não amarrar o produto a uma profissão específica. Mudanças visíveis:
`RegisterPage` (subtítulo, opção "Sou funcionário(a) / membro da equipe", botão
"Criar conta de funcionário(a)", mensagem de sucesso), `JoinClinicGate`
(placeholder da mensagem), `TeamManagementPanel` (subtítulo, label do papel
exibido como "funcionário(a) (acesso administrativo)", modal de confirmação
custom na aprovação — sprint 3.28), `Dashboard` (`ROLE_LABELS.secretaria → 'Funcionário(a) (acesso
administrativo)'`, subtitle da aba Equipe), `HowItWorks` (landing). **Backend
não foi tocado**: a role técnica continua sendo `secretaria` no JWT, no DB e nas
ações de audit (`auth.register.staff.success`, `clinic.join_request.*`). Decisão
explícita de **não** mexer em `requested_role` / banco / migration nesta rodada
— sistema de roles granulares (recepção, financeiro, gestor, etc.) fica para
sprint futura. `frontend typecheck`/`build` OK.

---

## Sprint anterior (3.23)

**Sprint 3.23** — **duplicados acionáveis / correção de
pacientes** (**frontend apenas, SEM backend, SEM migration**). A tela "Possíveis
duplicados" deixou de ser só informativa: cada registro de um grupo agora tem
ações que **reusam o CRUD da Sprint 3.22** — **editar** (`PATCH /patients/:id`,
dono + secretaria) via form inline `PatientEditForm`, e **arquivar/restaurar**
(`PATCH /patients/:id/archive|restore`, **somente dono**). Nenhum endpoint novo;
nenhuma mudança de resposta/PII.

- **`PatientEditForm.tsx`** (novo, + `.module.css`): form de edição administrativa
  reutilizável (nome/telefone/e-mail/CPF/nascimento/convênio/carteirinha); na
  edição o CPF em branco **mantém** o atual (só vem mascarado). Mantém o form da
  `PatientsList` intacto (sem refactor de risco no código recém-commitado da 3.22).
- **`DuplicatesList.tsx`:** ações por registro (editar dono+secretaria; arquivar/
  restaurar só dono — backend valida, UI esconde); **destaque dos campos que
  bateram** (`reasons → campos`); **status por registro**; **só CPF mascarado**;
  paginação simples de grupos no frontend ("Carregar mais grupos", `GROUPS_PAGE=8`);
  avisos "Revise os dados antes de arquivar", "Arquivar não apaga histórico nem
  agendamentos", "Merge automático ainda não existe".
- **Refresh cruzado:** `Dashboard` ganhou `patientsRefresh` (contador compartilhado,
  padrão do `sessionsRefresh`); `PatientsList` e `DuplicatesList` recebem
  `refreshKey` + `onPatientsChanged`. Após editar/arquivar/restaurar em qualquer um
  dos painéis, **ambos** recarregam. (`PatientsList` preserva busca/filtro ao
  recarregar por `refreshKey`.)
- **Decisão (sem backend):** o scan de duplicados inclui **todos os status**
  (`listForDuplicateScan` não filtra status). Por isso arquivar um duplicado **não
  faz o grupo sumir**: o registro passa a aparecer marcado **Arquivado** (e ganha
  ação **Restaurar**). É o comportamento "grupo muda corretamente"; restaurar a
  partir dos duplicados faz sentido justamente porque arquivados aparecem.
- **Não feito (fora de escopo):** merge (auto/manual), mover agendamentos, delete
  físico, paginação backend de duplicados, alteração de import/dry-run, gestão de
  equipe.

Verificação: frontend typecheck/build OK; matriz por API (Node fetch, backend dev
:3001, contas descartáveis) **13/13** — duplicados aparecem; CPF só mascarado;
secretaria edita membro; secretaria **não** arquiva (403); dono arquiva → grupo
mostra "archived"; dono restaura; cross-tenant → 404; audit com as 4 ações e **sem
PII**. Dados de teste removidos. Validação **visual** no navegador pendente. Sem commit.

**Sprint 3.22** — **CRUD administrativo de pacientes**
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
- Detecção de duplicados: `GET /patients/duplicates` (detecção read-only, sem merge) (Sprint 2.20); **tela acionável** no frontend (editar/arquivar/restaurar por registro reusando o CRUD de pacientes, **sem novo endpoint**) (Sprint 3.23)
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
- `20260529000000_clinic_team` — `clinics.invite_code` (unique) + tabela `clinic_join_requests` (Sprint 3.24)
- `20260530000000_clinic_join_requests_revoked` — estende `cjr_status_check` para aceitar `'revoked'` (Sprint 3.25)

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
