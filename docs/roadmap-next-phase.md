# ClinicBridge — Roadmap da Próxima Fase

> Direção definida no ADR `docs/adr/0001-product-direction-option-c.md`
> (Opção C — base administrativa segura primeiro, expansão clínica futura
> planejada, não implementada). Este roadmap é **sugestão de sequência**, não um
> compromisso de datas. Nada aqui autoriza código clínico: as Fases 5–7 são de
> planejamento e exigem ADR(s) futura(s) dedicada(s) antes de qualquer
> implementação.

## Princípios

- Consolidar o administrativo até produção antes de assumir complexidade clínica.
- Manter a fronteira administrativo vs. clínico explícita em domínio e banco.
- Cada salto de risco (clínico, prescrição) começa por documentação/decisão, não
  por código.
- Falar em **preparação e requisitos**, nunca em "compliance completo".

---

## Plano de produção mínima segura — Sprint 3.37 ✅

> Sprint de planejamento/docs entregue em 2026-05-24. Sem código, sem infra real,
> sem deploy, sem criação de recursos AWS. Plano completo em
> `docs/production-minimum-plan.md`.

**Provedor preferido:** AWS (decisão aceita em 2026-05-24). Decisões de sub-opção
ainda pendentes (ver `docs/production-minimum-plan.md` Seção 5).

**Sequência de sprints pré-produção:**
| Sprint | Escopo |
|---|---|
| **3.38** ✅ | TLS real + domínio + HSTS; corrigir `NODE_ENV` no Dockerfile runtime |
| **3.39** ✅ | Secrets + env de prod: SSM Parameter Store, `MFA_ENCRYPTION_KEY`, `FRONTEND_ORIGIN` |
| **3.40** ✅ | Backup offsite Restic + S3: scripts (`*-offsite-restic.sh`), runbook (`docs/backup-offsite-runbook.md`), IAM mínimo, retenção `forget` documentada (não auto-executada), restore drill em banco separado. Bucket S3 real, IAM role real, SSM real e agendamento ficam para 3.41 (depende de conta AWS) |
| **3.41A** ✅ | Decisão operacional AWS (docs-only): recomendação EC2+Compose, 7 decisões do dono, checklist de execução em `docs/aws-infra-sprint-3.41-plan.md` |
| **3.41B** | Provisionar infra AWS real: bucket S3 + IAM + SSM + EC2 + RDS + Security Groups + DNS (Registro.br) + TLS (Certbot) + smoke tests + backup drill |
| **3.42** | Deploy checklist go/no-go: executar `docs/deploy-security-checklist.md` §15/§16 |
| **3.43** | Piloto real: primeiro usuário com dados sintéticos/anonimizados |

**Riscos P0 documentados:**
- `NODE_ENV=development` hardcoded no runtime stage do Dockerfile.
- TLS real ausente (cert autoassinado local ≠ produção).
- Postgres/Redis expostos sem Security Groups em EC2 nua.
- Secrets em `.env` local sem rotação.

**Decisões pendentes do dono (6 itens):** compute (EC2 vs ECS/Fargate), banco
(RDS vs Docker), storage (EBS vs S3), TLS (Certbot vs ACM+ALB), secrets (SSM vs
Secrets Manager), orçamento mensal. Ver `docs/production-minimum-plan.md` Seção 5.

---

## QA geral do piloto v0.1 — Sprint 3.36 ✅

> Rodada de QA consolidada entregue em 2026-05-24. 10 fluxos cobertos. Nenhum
> BLOCKER identificado. Ressalvas aceitas documentadas em `docs/testing-checklist.md`.
> O produto está apto para **piloto controlado** com dados sintéticos ou
> anonimizados, desde que os P1 listados abaixo sejam resolvidos antes de qualquer
> dado real de clínica em produção.

**Próximos passos pós-QA (pré-produção real):** ver Sprint 3.37 acima e
`docs/production-minimum-plan.md` para o plano completo com arquitetura AWS,
gaps P0/P1/P2 e sequência de sprints.

---

## Fase 3 — Produção e governança administrativa (próxima prioridade)

Objetivo: tornar a base administrativa apta a produção, com governança real.

- `requireRole` / gating dono-admin nos endpoints administrativos sensíveis
  (inclui retenção e, futuramente, limpeza real) — **feito (Sprint 3.1)**;
- **MFA por TOTP no login — feito (Sprint 3.19)** (app autenticador; secret cifrado;
  sem SMS/e-mail OTP/serviço externo); pendente: backup codes + chave de cifra
  dedicada/KMS em produção;
- trust proxy configurado (IP correto atrás de proxy para rate limit/logs) —
  **feito (Sprint 3.2)**;
- Redis / shared store para rate limit (substituir o store em memória do MVP) —
  **feito (Sprint 3.2)**;
- política LGPD de retenção (prazos, base legal, fluxo) — **avançada (Sprint 3.3):
  política técnica inicial + ADR 0002 criadas** (`docs/data-retention-policy.md`);
  **pendente: validação jurídica** dos prazos/base legal e a limpeza real futura;
- backup / restore (validado de ponta a ponta) — **estratégia decidida (3.4,
  Restic-first; ADR 0003)** + **backup/restore local implementado e restore drill
  validado (3.5)** (scripts em `scripts/` + `docs/backup-restore-local-runbook.md`);
  **pendente: offsite/produção** (destino, gestão de chave, agendamento,
  monitoramento) e validação de ponta a ponta em produção;
- deploy seguro (segredos, hardening de runtime, healthchecks) — **baseline
  auditada + checklist (Sprint 3.6): `docs/deploy-security-checklist.md` + ADR
  0004**; **readiness `/health/ready` + liveness `/health`/`/health/live`
  implementados (Sprint 3.7)**; pendente: deploy real (HTTPS/reverse proxy, secrets
  manager, banco/Redis gerenciados, monitoramento);
- edge security (reverse proxy + WAF) — **estratégia decidida (Sprint 3.8): Nginx
  baseline + WAF ModSecurity/OWASP CRS detection-only first** (ADR 0005) +
  **Nginx reverse proxy local/staging (3.9)** + **backend containerizado e2e
  (3.10)** + **TLS local/staging (cert autoassinado) + HTTP→HTTPS (3.11)**
  (`infra/nginx/` + `backend/Dockerfile` + `scripts/generate-local-nginx-cert.sh`;
  serviços opcionais no compose, profile `edge`; runbook
  `docs/nginx-local-staging-runbook.md`); pendente: **TLS real em produção** (cert
  ACME/gerenciado + domínio + HSTS) e o **WAF** (detection-only → tuning → blocking);
- revisão de CORS/env de produção (`FRONTEND_ORIGIN` sem `*`) — **feita (Sprint
  3.6)**: guardas de placeholder (`JWT_SECRET`/`DATABASE_URL`) + warning de
  `RATE_LIMIT_STORE=memory` em produção;
- signed URL para download de arquivos de importação **apenas se** houver caso de
  uso real (não implementar especulativamente).

## Trilha — Módulo Agenda Administrativa (piloto v0.1)

Objetivo: agendamento **administrativo** (não clínico) para fortalecer o piloto
v0.1. Escopo/decisão: ADR `docs/adr/0006-administrative-scheduling-module.md` +
`docs/administrative-scheduling-scope.md` (Sprint 3.12, docs/ADR-only). Mantém a
fronteira administrativo/clínico (Opção C): **sem** diagnóstico/prescrição/
evolução/CID/anamnese/exames/prontuário; observações administrativas mínimas.

Lembretes/WhatsApp: escopo definido na Sprint 3.13 (adendo ADR 0006 +
`docs/administrative-scheduling-scope.md` Parte II) — **manual-first**, opt-in,
templates neutros, **sem dado clínico**; WhatsApp automático/API é gated (sprint
futura com ADR própria). Sequência (numeração atualizada na 3.13):

- **Sprint 3.14 — Backend da Agenda ✅ (concluída):** migration
  `20260526000000_scheduling` (clinic_professionals, appointments), DAO/service/
  controller/routes, validação, `requireAuth`/`requireClinic`/`requireRole`, audit
  sem PII, testes curl (positivos/negativos/cross-tenant). Sem DELETE; sem dado
  clínico.
- **Sprint 3.15 — Frontend da Agenda ✅ (concluída):** painéis de profissionais e
  agenda no Dashboard; filtros (data/profissional/status), criação com seletor de
  paciente, ações de status, remarcação inline; status em PT; aviso anti-clínico;
  client API com PATCH. typecheck+build OK. (Browser não automatizado no ambiente.)
- **Sprint 3.16 — App shell / navegação / cache ✅ (concluída):** `/app` em abas
  (Início/Importações/Pacientes/Agenda/Segurança) + footer; `@tanstack/react-query`
  para cache/invalidação (corrige sync profissionais→agenda sem F5). Polimento
  estrutural; sem WhatsApp/lembretes.
- **Sprint 3.17 — QA visual da agenda + landing ✅ (concluída):** cabeçalho de data
  legível + navegação dia, resumo do dia, timeline por horário, formulário
  colapsável; landing com "O que o piloto entrega" (Roadmap antigo removido).
- **Sprint 3.18 — Lembrete manual/assistido ✅ (concluída):** `utils/reminders.ts`
  (mensagem neutra) + botões "Copiar lembrete" / "Abrir WhatsApp" (`wa.me`) por
  card; humano decide enviar; sem API oficial/job/envio automático/registro de envio.
- **Sprint 3.20 — Dados sintéticos + demo/piloto v0.1 ✅ (entregue):** CSV demo
  fictício (`docs/demo-data/`), **seed dev-only** de agenda
  (`backend/scripts/seed-demo-scheduling.ts` — pacientes/profissionais/agendamentos
  fictícios, marcado `origem='seed_demo'`, com modo cleanup), roteiro
  (`docs/demo-pilot-v0.1-script.md`) e checklist (`docs/demo-pilot-v0.1-checklist.md`)
  com perguntas de validação. (A Sprint 3.19 foi o **MFA por TOTP**, trilha de
  segurança — por isso a demo virou 3.20.) Sem dado clínico.
- **Sprint futura — WhatsApp API oficial:** opt-in, templates aprovados, logs de
  status, opt-out, config por clínica — **só com ADR/sprint própria** + análise
  jurídica/técnica.

> Nada clínico entra por esta trilha — qualquer dado clínico continua exigindo ADR
> clínica dedicada (ADR 0001). Mensagens de lembrete são neutras/administrativas.

## Trilha — Pacientes (cadastro administrativo)

Objetivo: gerir o cadastro **administrativo** de pacientes e a qualidade dos
dados importados. Nada clínico (Opção C / ADR 0001).

- **Sprint 3.22 — CRUD administrativo de pacientes ✅ (em validação):** criar
  manual, editar, **arquivar/restaurar** (soft-delete via `status='archived'`,
  **sem delete físico**). Criar/editar = `dono_clinica` + `secretaria`;
  arquivar/restaurar = **só `dono_clinica`**. `GET /patients?status=active|archived|
  inactive|all` (default `active`); arquivado sai da listagem padrão **e** do
  seletor da agenda; cross-tenant → 404 genérico; audits sem PII; CPF só
  mascarado. Inclui ajuste de **copy/UX** da tela de Pacientes (deixar claro que é
  uma lista **paginada/filtrada**, não "todos os pacientes"; incentivar busca/
  filtro; cards mais compactos). **Sem migration.**
- **Sprint 3.23 — Duplicados acionáveis ✅ (em validação, frontend apenas).** A tela
  `Possíveis duplicados` deixou de ser só informativa: por registro do grupo dá
  para **editar** (reusa `PATCH /patients/:id`; dono + secretaria) e **arquivar/
  restaurar** (reusa archive/restore; **só dono**) — **sem endpoint/backend novo**.
  Destaque dos campos que bateram, status por registro, só CPF mascarado, paginação
  de grupos no **frontend**, refresh cruzado com a lista de pacientes. **Sem merge**
  (auto ou manual), sem mover agendamentos, sem delete físico, sem mexer no import.
- **Sprint 3.32 (entregue — ADR/docs) — Merge seguro de duplicados (decisão).**
  ADR `docs/adr/0007-safe-patient-duplicate-resolution.md`: merge administrativo
  **B-safe**. Motivação: arquivar um duplicado com agendamentos os deixa apontando
  para paciente arquivado → nome-fallback ruim na Agenda. Decisão (owner-only, em
  transação): escolher **principal** → **mover agendamentos** dos secundários
  (reassign tenant-scoped) → **fill-blanks não-destrutivo** (só preenche vazios;
  nunca sobrescreve) → **arquivar** secundários (soft-delete) → proveniência via
  migration mínima `patients.merged_into_id` + `merged_at`. Audit sem PII; CPF
  nunca bruto; cross-tenant → 404; idempotência via CAS; **sem undo completo**.
  **NÃO** nesta trilha: seleção campo-a-campo, merge automático sem confirmação,
  undo/snapshot, qualquer dado clínico, delete físico.
- **Sprint 3.33 (entregue) — Backend + migration + API do merge.** Migration
  `20260601000000_patients_merged_into` adiciona `patients.merged_into_id` (uuid
  NULL FK `patients(id)` `ON DELETE SET NULL`) + `patients.merged_at` + índice
  parcial. Endpoint owner-only `POST /patients/:id/merge` (body
  `{ secondary_ids: [...] }`, 1–10, sem duplicatas, sem o próprio principal).
  Em uma transação: re-fetch tenant-scoped + fill-blanks não-destrutivo
  (`telefone|email|cpf|data_nascimento|convenio|numero_carteirinha`; nunca
  `nome`; ordem = `secondary_ids` como enviado) + reassign tenant-scoped de
  appointments + arquivar com CAS (`WHERE id AND clinica_id AND status='active'
  AND merged_into_id IS NULL`) + audit `patient.merge.success` por par. CPF
  bruto nunca sai; valores dos secundários nunca aparecem na resposta. Erros:
  400 `merge_invalid` (validação), 404 `patient_not_found` genérico
  (inexistente/cross-tenant/archived/CAS miss), 403 `forbidden_role`, 401.
  Matriz por API **18/18** (`/tmp/sprint-3.33-merge-test.mjs`).
- **Sprint 3.34 (entregue — backend model + frontend) — UX do merge B-safe.**
  Backend: `PublicPatient` ganha `merged_into_id`/`merged_at` (não-PII).
  Frontend: rádio "Manter como principal" owner-only por registro,
  selo "Principal" no escolhido, botão "Resolver duplicado" no rodapé do
  grupo, `ConfirmDialog` variant `danger` com copy explícita do comportamento
  B-safe, mensagem inline de sucesso com contagens, invalidação de cache de
  `['appointments']` e `['patients']` no TanStack após sucesso, badge "Mesclado
  em outro registro" em Arquivados (sem lookup do nome do principal). Sem
  endpoint novo (contagem de appointments por paciente fica para futuro);
  sem seleção campo-a-campo; sem undo. `backend typecheck`/`build` ✅,
  `frontend typecheck`/`build` ✅, smoke API confirma shape. **Validação visual
  aprovada pelo usuário em 2026-05-24 (Sprint 3.35) — sem bug bloqueante.**
- **Sprint 3.35 (entregue — docs/QA only) — Validação visual da Sprint 3.34.**
  Sem backend, sem frontend, sem migration. Registro formal de que o merge
  B-safe foi validado visualmente no navegador ("ficou bem fera"). Checklist
  de `docs/testing-checklist.md` atualizado com nota de validação. Trilha
  merge (3.32 ADR → 3.33 backend → 3.34 UX → 3.35 QA) **completa e validada**.
- **Ainda no tema:** **undo/snapshot** completo (exige tabela própria + ADR) e
  **paginação backend** de duplicados quando a base crescer (hoje o corte é
  client-side + cap do scan).
- **Sprint 3.24 (entregue) — Gestão de equipe / convite de funcionário(a).** Antes
  desta sprint o papel `secretaria` só existia via SQL e **não era testável pelo
  navegador** (gap herdado da 3.22). Entregue: cadastro de funcionário(a) sem
  clínica (`account_type='staff'`); migration `20260529000000_clinic_team`
  (`clinics.invite_code` único + tabela `clinic_join_requests`); `POST
  /clinic-join-requests` (código + nome opcional como confirmação + mensagem),
  `GET /clinic-join-requests/me`, `PATCH .../cancel`; `GET /clinics/invite-code`,
  `GET /clinic-join-requests/pending`, `POST .../approve|reject` (owner-only via
  `requireRole`); `approve` é atômico (setStatus + setClinic + cancela outras
  pendentes). UI: seletor owner/staff no `RegisterPage`, `JoinClinicGate` para
  usuários sem clínica e `TeamManagementPanel` (aba Equipe) para o dono. Erros do
  invite são genéricos (`invalid_invite`) para impedir enumeração. **Polimento
  3.24.1:** copy generalizada de "secretaria" para "funcionário(a)" / "equipe"
  (frontend only — a role técnica continua sendo `secretaria` no JWT/DB/audits).
- **Sprint 3.25 (entregue) — Gestão de membros.** Aba Equipe lista membros
  ativos + ex-membros para o dono e permite **desativar acesso** sem deletar
  usuário/histórico. Migration leve estende o CHECK de
  `clinic_join_requests.status` com `'revoked'`; desligar = `users.clinica_id :=
  NULL` + linha histórica `revoked`. `users.ativo` permanece `true`. Endpoints
  `GET /clinic-members` e `PATCH /clinic-members/:userId/deactivate` (owner-only,
  audit `clinic.member.*.success` sem PII). **Stale-JWT fechado** em
  `requireClinic` (1 DB check por request tenant-scoped → 403
  `clinic_membership_revoked` imediato). Sem reativação direta — ex-membro re-entra
  pelo fluxo da 3.24. Validação por API 14/14.
- **Sprint 3.26 (entregue) — Regenerar invite code.** Owner-only `POST
  /clinics/invite-code/regenerate` rotaciona `clinics.invite_code` com retry
  curto sobre o índice único; código antigo para de funcionar para NOVAS
  solicitações. **Decisão consciente:** pendentes pré-regen **NÃO** são
  canceladas (a pendente já provou posse do código antigo + aguarda decisão
  manual do dono; cancelar em lote é destrutivo). Audit
  `clinic.invite_code.regenerated.success` (`recurso='clinic'`, sem código).
  Validação por API 12/12.
- **Próximo no tema — Polimentos da trilha equipe + roles granulares.** Itens
  candidatos, **não implementados** (cada um pode virar sprint própria):
  - **sair voluntariamente** da clínica (membro inicia o desligamento; mesmas
    guardas que o owner-deactivate).
  - **histórico de ações de equipe** (entradas/saídas/aprovações/recusas/
    regenerações) visível ao dono — read-only, sem PII em logs já garantido.
  - **panic-cancel acoplado à regen** (opcional: regen + recusar todas pendentes
    em uma operação atômica com confirmação dupla; só se aparecer use-case real
    — postura atual em `docs/security-notes.md`).
  - **roles granulares** (hoje só existem `dono_clinica` / `secretaria` /
    `admin_sistema`). Candidatas: **recepção**, **financeiro**, **funcionário(a)
    administrativo(a)**, **gestor da clínica**. Hoje a UI generaliza visualmente
    (3.24.1) como "funcionário(a) com acesso administrativo" porque essas roles
    **não existem** ainda. Criá-las exige: coluna/tabela de role com semântica
    de permissões, migração, mapeamento `requested_role`/`papel` na aprovação,
    UI dedicada para escolher a role no envio/aprovação, e revalidação de
    `papel` no DB dentro de `requireClinic` (hoje só `clinica_id`/`ativo` são
    revalidados — ver `docs/security-notes.md`). **Não tentar fazer sem ADR.**
  - troca de papel pelo dono (admin-of-clinic) com guardrails (não pode rebaixar
    o último dono; audit). **Troca de dono continua fora de escopo** — exige ADR
    própria com fluxo de transferência atômica e janelas de aceite.

## Fase 4 — Operação e UX administrativa

Objetivo: melhorar operação do dia a dia sobre o que já existe.

- histórico visual de auditoria (read-only, sem PII);
- UX de revisões/importações (clareza de status e próximos passos);
- paginação de duplicados (ver Trilha — Pacientes, Sprint 3.23 recomendada);
- export streaming/assíncrono para bases grandes;
- limpeza real de arquivos com soft-delete/quarentena/auditoria/idempotência/lock
  (evolução do dry-run atual; ainda administrativo);
- melhor organização do Dashboard.

## Fase 5 — Preparação clínica (ainda SEM prontuário, SEM código clínico)

Objetivo: planejar o domínio clínico. Entregáveis são **documentos**, não código.

- domain design clínico (entidades, fronteiras, linguagem ubíqua);
- matriz de risco;
- modelo de permissões (papéis, escopos, herança);
- estratégia de audit/versionamento clínico;
- separação clara administrativo vs. clínico (domínio e banco);
- threat model específico do domínio clínico;
- LGPD/termos específicos (base legal, consentimento, retenção).

> Saída esperada da Fase 5: uma ADR clínica que satisfaça os "Critérios para
> abrir uma fase clínica" do ADR 0001. Sem ela, a Fase 6 não começa.

## Fase 6 — Clinical Core experimental (somente após aprovação/ADR futura)

Objetivo (condicional): primeiro núcleo clínico mínimo e seguro.

- encounters / atendimentos;
- notas clínicas versionadas;
- visualização segura;
- auditoria de acesso (leitura e escrita);
- **sem** prescrição inicialmente;
- **sem** medicamentos/CID inicialmente, salvo nova decisão registrada.

## Fase 7 — Prescrição eletrônica (somente muito depois, com ADR própria)

Objetivo (condicional, maior risco):

- estudo regulatório Brasil (CFM e normas aplicáveis);
- ICP-Brasil (viabilidade/custo/provedor);
- assinatura digital;
- workflow de emissão/cancelamento/validade;
- regras de retenção;
- logs/audit específicos;
- avaliação de risco jurídico;
- integração futura (farmácias/órgãos), se aplicável.

---

## Resumo de gating

| Fase | Natureza | Pré-requisito para começar |
|------|----------|----------------------------|
| 3 | Administrativo (código) | nenhuma decisão extra — é a próxima prioridade |
| 4 | Administrativo (código) | Fase 3 em bom estado |
| 5 | Planejamento (docs) | apetite por explorar o clínico |
| 6 | Clínico (código) | ADR clínica aprovada (critérios do ADR 0001) |
| 7 | Prescrição (código) | Fase 6 + ADR de prescrição + análise regulatória/ICP-Brasil |
