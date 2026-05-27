# ClinicBridge — Estado do Projeto (detalhado)

> Estado detalhado movido do `CLAUDE.md` na compactação de 2026-05-22. O
> `CLAUDE.md` mantém o resumo; este arquivo guarda a versão completa.
> Histórico por sprint: `docs/sprint-history.md`. Notas de segurança e
> ressalvas: `docs/security-notes.md`. Checklist de testes: `docs/testing-checklist.md`.

## Última sprint aprovada

**Sprint 4.6A** (entregue 2026-05-27) — **ADR 0015 Catálogo de Serviços v0.1 + Camada Comercial (docs/ADR-only).**
Sprint docs/ADR-only. Zero código, zero schema, zero migration, zero env.

**Arquivos criados:**
- `docs/adr/0015-services-catalog-commercial-layer-v0.md` — ADR umbrella da camada comercial.
- `docs/services-catalog-v0-scope.md` — escopo operacional com entidades, regras, checklist de implementação.

**Arquivos modificados:**
- `docs/insurance-billing-future-scope.md` — marcado como pré-planejamento supersedido (banner ADR 0015/0016).
- `CLAUDE.md` — estado atualizado, trilha Clinic OS renumerada, próximas prioridades.
- `docs/project-state.md` — esta entrada.
- `docs/sprint-history.md` — entrada 4.6A.
- `docs/roadmap-next-phase.md` — sprint 4.6A registrada como entregue; faseamento 4.6/4.7/4.8.
- `docs/product-clinic-os-roadmap.md` — Fase 4.6 e Fase 4.7 renumeradas/atualizadas.

**Decisões fechadas:**

1. **Faseamento da camada comercial:**
   - **4.6 = Catálogo de Serviços v0.1** (ADR 0015 — esta).
   - **4.7 = Convênios manual básico v0.1** (ADR 0016 — Sprint 4.7A futura).
   - **4.8 = Estoque básico v0.1** (ADR 0017 — Sprint 4.8A futura).
   - Motivação: split reduz risco e permite QA por módulo; serviços são pré-requisito para convênios.

2. **Invariante de "Serviço":** é etiqueta administrativa/comercial — não é TUSS, não entra no
   prontuário (ADR 0010), não auto-propaga preço para cobranças.

3. **Entidades do Catálogo de Serviços:**
   - `clinic_services(clinica_id, name, category, description, duration_minutes, price_cents, active)` + `UNIQUE(clinica_id, name)`.
   - `professional_services(professional_id, service_id, clinica_id, active)` (many-to-many).
   - `appointments.service_id uuid NULL` — extensão aditiva, sem migração de dados históricos.
   - `financial_charges.service_id uuid NULL` — extensão aditiva, sem migração de dados históricos.

4. **`price_cents` é referência visual** — nunca auto-propaga para `amount_cents` da cobrança.
   Humano sempre decide o valor.

5. **`category` é texto livre** — sem enum no banco; UI sugere valores comuns (Consulta/Sessão/Exame/Procedimento/Outro).

6. **`insurance-billing-future-scope.md` permanece como insumo** para ADR 0016 (Convênios); não é deletado.

**Gates finais:**
- `git diff --check` rc=0 ✅
- `git status --short` — 2 arquivos novos + 5 modificados ✅
- **Zero código, zero migration, zero schema, zero env.**

**Próxima sprint:** **4.6B** backend Catálogo de Serviços (gate: ADR 0015 aceita ✅).
Detalhes do checklist de implementação: `docs/services-catalog-v0-scope.md` §7.

---

**Sprint 4.5D** (entregue 2026-05-27) — **QA/hardening + polish UX Relatórios Gerenciais v0.1.**
Sprint de polish + regressão. Fecha a fase 4.5. Zero backend, zero migration, zero schema, zero env.

**Arquivos alterados (2 código + docs):**
- `frontend/src/components/ReportsPanel.tsx` — refator leve para levantar as 4 queries ao root + hero strip + frases interpretativas + reordenação dos cards do Financeiro + subtítulo "Pontos de atenção" no R-D + copy do restricted-card.
- `frontend/src/components/ReportsPanel.module.css` — `.hero*` / `.caption*` / `.flagValueWarn`; ajuste `.flagItem` (ordem label/valor invertida); `.blocked` com tom ciano-calmo (border-left 3px) em vez de cinza-erro; mobile do hero.

**Polish UX aplicado:**

1. **Hero strip "Resumo do período"** acima dos 4 blocos com 4 sinais grandes:
   - Consultas no período · Recebido · Em aberto (hint mostra vencido se > 0) · Pacientes novos.
   - Lê do **mesmo cache** das seções (queryKey idêntica → TanStack Query deduplica, mas levantei as queries ao root para evitar resubscription churn).
   - Células de Recebido/Em aberto ficam com `.heroCellMuted` (opacity 0.6) e hint "acesso restrito" quando o usuário tem 403 no R-B.

2. **Frases interpretativas** por bloco (sem julgamento, contexto operacional):
   - Agenda: cobre 3 casos (sem consultas / nada confirmado-realizado / com cancelamentos-faltas).
   - Financeiro: deixa explícito que "Em aberto" e "Vencido" são saldo atual e não dependem do período (ADR 0014 §3.3).
   - Pacientes: "X novo(s). Base ativa: Y."
   - Agenda × Financeiro: "X consulta(s) · Y ponto(s) de atenção operacional a revisar."

3. **Agenda** — reordem dos cards: Total · Realizadas · Confirmadas · Agendadas · Faltas · Canceladas · Taxa.
   - "Canceladas" perdeu o tom warning (é normal); só "Faltas" mantém danger quando > 0.
   - Taxa de comparecimento: hint "realizadas + confirmadas / total" quando há consultas; "sem consultas no período" quando total=0.

4. **Financeiro** — ordem: Recebido (success) · Em aberto (info) · Vencido (danger só se > 0) · Cobranças pagas · Cobranças pendentes (hint mostra vencidas se > 0) · **Cancelado por último, sem tom**.

5. **Pacientes** — label virou `"Sem agendamento há mais de 90 dias"` (em vez de "Sem agendamento recente"); hint "oportunidade de retorno" no lugar de "últimos 90 dias" (já está no label). Tom warning só se > 0.

6. **Agenda × Financeiro** — flags viraram bloco "Pontos de atenção" com label à esquerda, valor à direita; valor em amarelo (`.flagValueWarn`) quando > 0. Card "Sem cobrança" recebe tom warning só se > 0.

7. **Restricted-card** — tom **ciano-calmo** (`border-left: 3px solid rgba(34,211,238,0.45)` + fundo `rgba(34,211,238,0.04)`) em vez de cinza/erro. Copy: "Sua acesso atual não permite visualizar indicadores financeiros. Os blocos Agenda e Pacientes continuam disponíveis."

8. **Datas** no header de período formatadas em PT-BR (`DD/MM/AAAA`) via novo helper `formatDateBr`.

**Decisão sobre profissional × aba Relatórios:**
- **Mantida visível** para todo papel administrativo. Frontend **não consegue** distinguir um secretaria puro de um `secretaria + profissional_clinico` no v0.1 — o `GET /me` não devolve grants clínicos e o `GET /clinical/roles` é owner-only. Adicionar endpoint de "meus grants" seria backend novo, fora do escopo de polish.
- Profissional vê R-A/R-C normais; R-B/R-D viram card "Área financeira restrita" com tom intencional (ciano, não erro).
- Backend continua sendo a fonte da verdade: `effectiveFinancialAccess='none'` → 403 em R-B/R-D. Sprint 4.5B já valida; 4.5D só melhora a UX no recebimento desse 403.

**QA regressão API (24/24 PASS):**
- Matriz 5 papéis × 4 endpoints: owner/secretaria/gestor 4× 200; profissional R-A/R-C 200, R-B/R-D 403 `forbidden_role`; admin 4× 403 `no_clinic_context`.
- Payload PII scan recursivo (chaves proibidas) em todos os 4 endpoints com token de owner: 0 hits.
- Sem regressão do backend Sprint 4.5B.

**Segurança frontend (greps):**
- `console.{log,debug,warn,error,info}` no ReportsPanel: 0 (única ocorrência é no comentário de cabeçalho).
- `localStorage`/`sessionStorage`: 0 (idem).
- `dangerouslySetInnerHTML`: 0 (idem).
- `appointment_id` renderizado como texto: 0 (única ocorrência é como `key` de React no map, com comentário explicando).
- Forbidden field names no `.tsx` (`nome|cpf|email|telefone|endereco|cancel_reason|administrative_notes|description|amount_cents|notes|body|internal_note|prescricao|diagnostico|cid|evolucao`): 0.
- Token sempre em `Authorization` header via `apiFetch`; nunca em URL/query (sem mudança em `api.ts`).

**QA browser/manual:**
- Validado anteriormente com `smoke.owner` e `smoke.profissional` (4.5C); regressão de payload validada com tokens persistentes em 4.5D.
- QA visual completo em browser fica por conta do usuário (subir `pnpm --filter frontend dev` e seguir `docs/testing-checklist.md` §"Smoke Frontend Relatórios v0.1").

**Gates finais:**
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (warning de bundle size pré-existente)
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:status` 15/15 (zero pendentes/novas) ✅
- `git diff --check` rc=0 ✅
- `git status --short` — 2 frontend modificados + 5 docs modificados ✅

**Ressalvas registradas (encerrando a fase 4.5):**
- Sem export (CSV/PDF/XLSX) no v0.1 — futuro com ADR própria.
- Sem gráficos complexos / BI customizável — propositalmente.
- Sem dados clínicos; sem nomes/CPF/telefone/e-mail de pacientes; sem `appointment_id` renderizado.
- Relatórios on-demand; sem cache local persistente nem auto-refresh.
- Profissional **continua vendo a aba** com blocos financeiros restritos (decisão acima).
- Filtros avançados `professional_id` (R-A/R-D) e `no_appt_days` (R-C) **não expostos como controles na UI** — backend aceita; pode entrar em 4.6/futuro se demanda real aparecer.
- Convênios continuam fora até Fase 4.6 (ADR 0015 ainda não escrita).
- Frontend não substitui contabilidade nem emissão fiscal (`disclaimer` no rodapé do painel).

**Próxima sprint natural:** **4.6B** backend Catálogo de Serviços v0.1 (gate: ADR 0015 aceita ✅).

---

**Sprint 4.5C** (entregue 2026-05-27) — **Frontend Relatórios Gerenciais v0.1.**
Consumo dos 4 endpoints implementados na Sprint 4.5B; aba "Relatórios" no Dashboard.

**Arquivos novos:**
- `frontend/src/components/ReportsPanel.tsx`
- `frontend/src/components/ReportsPanel.module.css`

**Arquivos modificados:**
- `frontend/src/services/api.ts` — tipos (`ReportPeriodPreset`, `ReportsFilters`, 4 response types)
  + 4 funções (`getAppointmentReport`, `getFinancialReport`, `getPatientsReport`,
  `getAgendaFinancialReport`) + helper `buildReportsQuery` (omite filtros vazios).
- `frontend/src/views/Dashboard.tsx` — nova aba "Relatórios" (ícone `BarChart3`), entre Financeiro e Equipe.

**Estrutura visual:**
- Cabeçalho com título, subtítulo e aviso "Nenhum dado clínico é exibido aqui".
- Barra de filtros: presets Hoje · Últimos 7 dias · Mês atual · Personalizado (com inputs `date`); botão Atualizar.
- 4 blocos (cada um com seu próprio `useQuery`, `staleTime: 30s`, `refreshKey` invalidador):
  - **Agenda** — cards de total + status + taxa de comparecimento + lista "Em atraso" (até 8 visíveis, horário + status traduzido; **nunca renderiza UUID**).
  - **Financeiro** — cards Recebido/Em aberto/Vencido/Cancelado + contagens + breakdown por método de pagamento (Dinheiro/Pix/Cartão/Transferência/Outro).
  - **Pacientes** — Ativos/Novos/Com agendamento/Sem agendamento recente (90 dias)/Arquivados.
  - **Agenda × Financeiro** — 6 cards + 2 sinais ("cancelada com cobrança pendente", "cobrança cancelada com consulta ativa").

**Permissões/UX:**
- Painel gateia `papel ∈ {dono_clinica, secretaria}` (admin_sistema não chega — bloqueado por `requireClinic` no backend).
- 403 por relatório vira `SectionBlocked` com texto "Seu acesso atual não permite…" — **não derruba o painel inteiro**.
- `report_invalid_filters` exibe a mensagem amigável do backend; validação visual de `date_to >= date_from` antes do refetch.
- Vocabulário UI: "acesso", "permissão", "área financeira" (sem "role").

**Segurança frontend:**
- Token apenas no header `Authorization` via `apiFetch`; nunca em URL/query.
- Sem `console.log` / `localStorage` / `sessionStorage` / `dangerouslySetInnerHTML`.
- Tipos do payload NÃO incluem `nome`/`cpf`/`email`/`telefone`/`notes`/`cancel_reason`/`description`/`administrative_notes`/`body`/`internal_note`/etc.
- Lista "Em atraso" renderiza só `formatTime(starts_at)` + status; o `appointment_id` só vai na key React.
- Valores monetários em BRL via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`; nunca exibe `amount_cents` cru.
- Sem botão de export, sem cópia para clipboard.

**Responsividade:**
- Cards em grid `auto-fill minmax(170px, 1fr)` (≥640px) ou `1fr 1fr` (mobile).
- Barra de filtros empilha; inputs `date` ocupam 100% no mobile.

**Gates finais:**
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `git diff --check` rc=0 ✅

**Smoke API (reaproveitado de 4.5B + check contra UI):**
- Owner: 4/4 endpoints 200 com payload no formato esperado pelos tipos do `ReportsPanel`.
- Profissional: R-A e R-C 200; R-B e R-D 403 (forbidden_role) → painel renderiza `SectionBlocked`.

**Ressalvas registradas:**
- Sem export (CSV/PDF/XLSX) no v0.1 — futuro com ADR própria.
- Sem gráficos complexos no v0.1 (só cards/lista).
- Relatórios on-demand (refetch manual); sem materialização nem auto-refresh.
- Sem dados clínicos; sem nomes/CPF/contato de pacientes.
- Frontend não substitui contabilidade ou emissão fiscal (`disclaimer` no rodapé do painel).
- Filtro `professional_id` exposto pelo backend mas ainda **não exposto na UI** (v0.1) — pode ser exposto em 4.5D se necessário.
- `no_appt_days` fixo em 90 dias no v0.1 (sem controle dedicado na UI).
- Convênios continuam fora até Fase 4.6.

**QA visual/manual:** validado contra os endpoints reais via tokens de smoke (`smoke.owner` e `smoke.profissional`).
Verificação completa no browser pelo usuário fica como tarefa de 4.5D (junto com hardening).

---

**Sprint 4.5B** (entregue 2026-05-27) — **Backend Relatórios Gerenciais v0.1.**
Implementação dos 4 endpoints read-only definidos pela ADR 0014.
Arquivos novos: `backend/src/dao/reportsDao.ts`, `backend/src/services/reportsService.ts`,
`backend/src/controllers/reportsController.ts`, `backend/src/routes/reports.ts`.
Registro: `backend/src/app.ts` adiciona `app.use(reportsRouter)` após `financialChargesRouter`.

**Endpoints:**
- `GET /reports/appointments` (R-A) — totais por status + `attendance_rate` + lista de
  até 20 ids de "pendentes em atraso" (apenas `appointment_id` + `starts_at` + `status`).
  Filtros: `date_from`, `date_to`, `professional_id?` (validado contra `clinic_professionals` da clínica).
- `GET /reports/financial` (R-B) — `received_cents`/`pending_cents`/`overdue_cents`/`canceled_cents`
  + contagens + breakdown por `payment_method`. Janela aplica em `paid_at` / `canceled_at`;
  `pending`/`overdue` ignoram janela (saldo aberto atual, ADR 0014 §3.3).
- `GET /reports/patients` (R-C) — `total_active`, `total_archived` (`merged_into_id IS NULL`),
  `new_in_period`, `with_appointment_in_period`, `without_recent_appointment`.
  Filtros extras: `no_appt_days` (1..365, default 90).
- `GET /reports/agenda-financial` (R-D) — 8 contadores (appointments_total, with_pending_charge,
  with_paid_charge, with_overdue_charge, with_canceled_charge, without_charge,
  cancelled_with_pending, charge_canceled_appt_active). Join `appointments × latest_charge_por_appointment`
  via `DISTINCT ON` em raw SQL parametrizado.

**Validação de filtros:** YYYY-MM-DD (com round-trip check anti-rollover de fevereiro);
`date_to >= date_from`; intervalo ≤ 366 dias; floor ~2 anos; default = mês corrente (1º → hoje).
Inválidos → 400 `report_invalid_filters`. UUID validado por regex antes do hit em DB.

**Permissões:**
- Pipeline: `patientsRateLimit` → `requireAuth` → `requireClinic` → `requireRole(['dono_clinica','secretaria'])`.
- R-B / R-D: serviço chama `effectiveFinancialAccess` (reusa `financialChargeService`); profissional → 403 `forbidden_role`.
- Matriz validada com 5 smoke users; 24/24 PASS.

**Audit (metadata-only):** `report.<type>.view.success` (recurso=`report`, recurso_id=`<type>:<from>:<to>`).
Sem valores, sem PII; falha de audit não aborta a resposta (best-effort, mesmo padrão do financeiro).

**Invariantes de segurança:**
- DAO sempre filtra `clinica_id` (29 ocorrências); sem `listAll`.
- Zero referências a `clinical_*` tables (gateado por grep).
- Sem PII no payload (`nome`, `cpf`, `email`, `telefone`, `notes`, `cancel_reason`, `description`,
  `administrative_notes`, `body`, `internal_note`, `diagnostico`, `cid`, `prescricao`, `evolucao`) — validado por walk + substring scan.
- Nenhuma concatenação SQL; toda raw SQL é parametrizada com `?`.
- Sem migration, sem nova tabela, sem mudança em `.env.example`.

**Smoke results:**
- Auth/permissão: 24/24 (sem token, owner, secretaria, gestor, profissional, admin).
- Filtros inválidos: 10/10 (formatos, datas impossíveis, ordem invertida, > 366 dias,
  professional_id mal-formado, professional_id cross-tenant, no_appt_days inválido).
- Payload safety: 12/12 (keys + substrings).
- Content shape: 5/5 (chaves obrigatórias presentes).
- Audit DB: 22 linhas `report.*.view.success` com `recurso_id` no formato esperado.

**Gates finais:** `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 15/15 ✅ ·
`pnpm --filter frontend typecheck` ✅ · `git diff --check` rc=0.

**Ressalvas registradas:**
- Sem frontend até 4.5C (UI apenas a partir da próxima sprint).
- Sem export (CSV/PDF) no v0.1 — futuro.
- Relatórios são on-demand; sem cache nem materialização (futuro se virar gargalo).
- Intervalo máximo 366 dias por desenho (ADR 0014).
- Sem dados clínicos, sem nomes/CPF/contato de pacientes — apenas ids de appointment na lista de atenção.
- Profissional `effectiveFinancialAccess='none'` → 403 nas duas trilhas financeiras (R-B, R-D).

---

**Sprint 4.5A** (entregue 2026-05-27) — **ADR 0014 Relatórios Gerenciais v0.1 (docs/ADR-only).**
`docs/adr/0014-management-reports-v0.md` + `docs/management-reports-v0-scope.md` criados.
Definidos: 4 relatórios (R-A Resumo Operacional, R-B Resumo Financeiro, R-C Resumo de Pacientes,
R-D Agenda × Financeiro); permissões por papel; fontes de dados permitidas/proibidas;
arquitetura de API (4 endpoints separados: `/reports/appointments`, `/reports/financial`,
`/reports/patients`, `/reports/agenda-financial`); UX (aba "Relatórios", cards, filtros, copy);
roadmap 4.5B/C/D; sem migration, sem export no v0.1.
ADR 0014 aceita. Gate para 4.5B aberto.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

---

**Sprint 4.4E-D** (entregue 2026-05-27) — **QA/Hardening Agenda × Financeiro v0.1.**
Code review segurança frontend: 13/13 PASS.
Smoke API 24/24 PASS real: secretaria (login + GET appointments + GET charges + POST charge + GET ?appointment_id + list sem notes/cancel_reason),
gestor (GET appointments + GET charges + POST → 403 forbidden_role),
profissional (GET appointments + GET charges → 403 forbidden_role),
admin_sistema (GET appointments + GET charges → 403 no_clinic_context), owner (GET básicos).
SQL invariants: 9/9 (pending/paid/canceled, cross-tenant=0, invariants paid/pending/canceled, amount>0).
Audit logs: `financial.charge.created.success` + `financial.charge.canceled.success` registrados; sem PII em recurso_id.
Backend logs: sem dados financeiros.
Cleanup: cobrança sintética `dcd487fb` cancelada; usuários smoke preservados.
Ressalvas: "Ver cobrança" navega para aba sem selecionar cobrança específica; badge limit=100; gestor vê botão mas recebe 403.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ · build ✅ · `migrate:status` 15/0 ✅ · `git diff --check` rc=0.

---

**Sprint 4.4E-C** (entregue 2026-05-27) — **Frontend Agenda × Financeiro v0.1.**
Badge financeiro (5 estados: none/pending/overdue/paid/charge_canceled) por agendamento na timeline da agenda.
Alertas A1–A4 (informativos, descartáveis via estado React, sem chamada de API).
Botão "Criar cobrança" inline com form (patient readonly, appointment_id oculto, descrição pré-preenchida "Consulta",
aviso anti-clínico, invalidação de cache em `['financial']` + `['appointments']` após sucesso).
Botão "Ver cobrança" navega para aba Financeiro via `onGoToFinanceiro` callback.
Profissional: seção financeira oculta (403 → `financialBlocked`). Gestor: badge + ver cobrança; criar cobrança
mostra 403 se backend bloquear (papel=secretaria+gestor_clinica).
Sem backend novo, sem migration, sem endpoint novo.
`pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ · `pnpm --filter backend typecheck` ✅ · `git diff --check` rc=0.

**Componentes modificados:**
- `frontend/src/components/AdministrativeSchedulePanel.tsx` — badge financeiro; alertas A1–A4; form "Criar cobrança";
  botão "Ver cobrança"; `useQuery(['financial','charges','agenda-badge',token])`; `chargeMap: Map<string,FinancialChargeListItem>`;
  `appointmentFinancialState()`; `getFinancialAlerts()`; `createChargeMutation`; prop `onGoToFinanceiro?`.
- `frontend/src/components/AdministrativeSchedulePanel.module.css` — classes `.cardBadges`, `.financialBadge`,
  `.fb_pending/overdue/paid/charge_canceled`, `.financialSection`, `.financialRow`, `.financialLabel`,
  `.financialBtns`, `.financialBtn`, `.financialBtnCreate`, `.financialAlert`, `.financialAlertIcon`,
  `.financialAlertDismiss`, `.chargeForm`, `.chargeFormHead`, `.chargeFormTitle`, `.chargeFormPatient`,
  `.chargeFormActions`, `.required`.
- `frontend/src/views/Dashboard.tsx` — `<AdministrativeSchedulePanel onGoToFinanceiro={() => setTab('financeiro')} />`.

---

**Sprint 4.4E-B** (entregue 2026-05-27) — **Avaliação backend Agenda × Financeiro (docs-only).**
Decisão: `GET /financial/charges?limit=100` cobre o badge. `?appointment_id=` já existe. Sem endpoint novo.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

---

**Sprint 4.4E-A** (entregue 2026-05-27) — **ADR 0013 Integração Agenda × Financeiro v0.1 (docs/ADR-only).**
`docs/adr/0013-agenda-financial-integration-v0.md` + `docs/agenda-financial-integration-v0-scope.md` criados.
Definidos: badge financeiro (5 estados), alertas sugestivos (A1–A4), fluxo "Criar cobrança" via agenda,
estratégia de endpoints (reutilizar existentes), permissões por role, segurança/LGPD, invalidação de cache.
ADR 0013 aceita. Gate para 4.4E-B/C aberto.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

---

**Sprint anterior: 4.4D-conv** (entregue 2026-05-27) — **Planejamento Convênios e Faturamento Básico (docs-only).**
`docs/insurance-billing-future-scope.md` criado · Fase 4.6 detalhada em `product-clinic-os-roadmap.md` ·
`financial-v0-scope.md` expandido · `roadmap-next-phase.md` atualizado.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

**Sprint anterior: 4.4D** (entregue 2026-05-27) — **QA/Hardening Módulo Financeiro v0.1.**
Smoke API 60/60 PASS · SQL invariants 9/9 · audit 4 ações · log redaction PASS ·
frontend security checks PASS · cleanup (0 pending, 19 canceled, 6 paid).
`pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅ ·
`pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ ·
`migrate:status` 15/0 ✅ · `git diff --check` rc=0. **Zero mudanças de código.**

**Sprint anterior: 4.4C** (entregue 2026-05-27) — **Frontend do Módulo Financeiro v0.1.**
Aba "Financeiro" no Dashboard; `FinancialPanel` auto-contido; 8 tipos + 8 funções API.
`pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ · `pnpm --filter backend typecheck` ✅ · `git diff --check` rc=0.
**Sem migration, sem backend novo, sem gateway, sem badge na Agenda.**

**Componentes entregues:**
- `frontend/src/services/api.ts` — 8 tipos exportados (`FinancialChargeStatus`, `FinancialPaymentMethod`,
  `FinancialChargeListItem`, `FinancialChargeDetail`, `FinancialSummary`, `FinancialChargeFilters`,
  `CreateFinancialChargePayload`, `UpdateFinancialChargePayload`, `MarkFinancialChargePaidPayload`,
  `CancelFinancialChargePayload`) + 8 funções (`listFinancialCharges`, `getFinancialSummary`,
  `getFinancialCharge`, `createFinancialCharge`, `updateFinancialCharge`, `markFinancialChargePaid`,
  `cancelFinancialCharge`, `listPatientCharges`).
- `frontend/src/components/FinancialPanel.tsx` — panel auto-contido com state machine `list → new | detail → edit`;
  summary cards (em aberto / vencido / recebido); filtros status/data; tabela de cobranças com badge de status
  (Pendente/Vencido/Pago/Cancelado); formulário criar/editar; detalhe com notes + cancel_reason
  (ambos só no detalhe, nunca na listagem — segurança); modal "Marcar como pago" (forma + data);
  modal "Cancelar" (motivo opcional; irreversível); aviso clínico nas observações (ADR 0012 §10);
  `staleTime: 0` em detalhe; 403 via `useEffect` → `onAccessBlocked()`; sem `console.log` de dados financeiros;
  sem `localStorage/sessionStorage`; sem `dangerouslySetInnerHTML`; `appointment_id` omitido do
  formulário (4.4E — API de agendamentos por paciente ainda não disponível).
- `frontend/src/components/FinancialPanel.module.css` — CSS module com design tokens.
- `frontend/src/views/Dashboard.tsx` — `TabKey` +`'financeiro'`; TABS +`Wallet` icon;
  `SECTION_INTRO.financeiro`; `{tab === 'financeiro' && <FinancialPanel />}`.

---

**Sprint anterior: 4.4B** (entregue 2026-05-27) — **Implementação backend do Módulo Financeiro v0.1.**
Migration `financial_charges` + DAO + Service + Controller + Rotas. Smoke **49/49 PASS**.
Logger redaction estendido para campos financeiros. `appointment_id` opcional com validação
cross-tenant + cross-patient. **Sem frontend, sem AWS, sem gateway.**

**Componentes entregues:**
- `backend/migrations/20260604000000_financial_charges_v0.ts` — tabela `financial_charges`
  (11 CHECK constraints defensivos: amount>0, currency=BRL, status allowlist,
  payment_method allowlist, paid/canceled consistency triplets, pending-clean invariants;
  4 índices normais + 1 índice parcial WHERE appointment_id IS NOT NULL;
  FKs: clinica_id CASCADE, patient_id RESTRICT, created_by RESTRICT, paid_by SET NULL,
  canceled_by SET NULL, appointment_id SET NULL). Migration batch 15.
- `backend/src/dao/financialChargeDao.ts` — tenant-scoped sem `listAll()`;
  `create`, `findByIdForClinic`, `listForClinic`, `listForPatient`;
  CAS atomics: `updatePending`, `markPaid`, `cancel`; sem delete físico;
  `summarize()` (pending/overdue/paid com janela de data configurável).
- `backend/src/services/financialChargeService.ts` — `buildFinancialActor` carrega grants
  de `user_clinical_roles` (1 SELECT); `effectiveFinancialAccess` → `full`/`transact`/`none`;
  7 métodos + `listForPatient`; `loadActivePatient` exige `status=active AND merged_into_id IS NULL`;
  `validateAppointmentLink` cross-tenant via generic 400 (anti-enumeration); best-effort audit.
- `backend/src/controllers/financialChargeController.ts` — thin; 8 handlers.
- `backend/src/routes/financialCharges.ts` — 8 rotas; pipeline
  `rateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`;
  gestor/profissional bloqueados no service (clinical_roles lookup).
- **Modificados:**
  - `backend/src/types/db.d.ts` — `FinancialChargeRow`, `FinancialChargeStatus`, `FinancialPaymentMethod`.
  - `backend/src/config/logger.ts` — +16 redaction paths: `description`/`notes`/`cancel_reason`/
    `amount_cents` × 4 camadas (top-level, `*.field`, `body.*`, `req.body.*`, `payload.*`).
  - `backend/src/app.ts` — registra `financialChargesRouter`.

**Endpoints registrados:**
| Método | Path | Acesso |
|--------|------|--------|
| POST | `/financial/charges` | full |
| GET | `/financial/charges` | transact+full |
| GET | `/financial/summary` | transact+full |
| GET | `/financial/charges/:id` | transact+full |
| PATCH | `/financial/charges/:id` | full |
| POST | `/financial/charges/:id/mark-paid` | transact+full |
| POST | `/financial/charges/:id/cancel` | transact+full |
| GET | `/patients/:id/charges` | transact+full |

**Smoke tests — 49/49 PASS** (usuários smoke `*@clinicbridge.local`).
Cobertos: sem token/admin 401/403; secretaria/owner create 201; gestor create 403;
profissional all ops 403; list (notes omitido)/detail (notes presente); gestor list/detail;
gestor PATCH 403; secretaria edita pending; gestor mark-paid; edit/pay/cancel paid 400;
cancel pending + edit canceled 400; gestor cancel; validações (amount=0/-100, desc_vazia,
patient_not_found, method_invalido/ausente); appointment_id válido/filtro/outro_patient/ghost;
patient charges/inexistente; summary shape/gestor/bad_date; charge not found/bad uuid.

**SQL invariants — 4/4 PASS + 11 CHECKs verificados.**
**Audit — 4 acoes; sentinels FIN_*_SENTINEL → 0 ocorrências nos logs.**

**Cleanup:** 2 cobranças pending canceladas via SQL (`cancel_reason='smoke_cleanup_4.4B'`);
1 cobrança paid mantida; 3 cobranças canceled mantidas; 1 patient temporário arquivado
(`Smoke Temp Patient 4.4B-cross`). Usuários smoke preservados.

**`pnpm --filter backend typecheck`** ✅ · **`pnpm --filter backend build`** ✅ ·
**`pnpm --filter frontend typecheck`** ✅ · **`migrate:status`** 15 applied/0 pending ✅ ·
**`git diff --check`** rc=0.

---

**Sprint anterior: 4.4A** (entregue 2026-05-27; ajuste docs 2026-05-27) — **ADR Módulo Financeiro v0.1 (docs/ADR-only).**
ADR 0012 + `docs/financial-v0-scope.md`. Fecha o escopo do módulo financeiro e autoriza a Sprint 4.4B.
**Sem código, sem migration, sem env vars, sem AWS.**

**Ajuste pós-entrega (2026-05-27 — ainda na 4.4A, antes do início da 4.4B):**
ADR 0012 e scope doc atualizados com "Nível 3 — Integração Agenda × Financeiro":
- `appointment_id` validação cross-tenant + cross-patient documentada (entra na 4.4B).
- Filtro `?appointment_id` em `GET /financial/charges` (entra na 4.4B).
- Nova §16 (ADR 0012): modelo de dois estados independentes; fluxo operacional v0.1;
  badge financeiro na Agenda; alertas sugestivos; decisões explícitas de o que entra em cada sprint.
- Invariante: nenhuma automação agressiva no v0.1 — humano decide sempre.
- Sprint 4.4E adicionada: integração Agenda × Financeiro (badge, alertas, botão criar cobrança).
- Riscos adicionados: pagamento confirmar consulta automaticamente; consulta cancelada com cobrança ativa; cobrança cancelada com consulta ativa.

**Componentes entregues:**
- `docs/adr/0012-financial-module-v0.md` — ADR completa (17 seções, Status: Accepted):
  1 tabela `financial_charges`; ciclo de vida `pending → paid | canceled`; 8 endpoints;
  matriz de permissões (secretaria/dono full; gestor view+pay+cancel; profissional sem acesso);
  audit de escrita em `audit_logs`; sem audit de leitura dedicado; logger redaction de
  `description`/`notes`/`cancel_reason`; LGPD postura; diretrizes UX; 16 riscos documentados;
  §16 integração Agenda × Financeiro Nível 3.
- `docs/financial-v0-scope.md` — companheiro operacional (checklists 4.4B + 4.4C + 4.4D + 4.4E,
  matriz, endpoints, catálogo audit, modelo de dados, validações, fora de escopo).

**`git diff --check`** rc=0 · **`git status --short`** apenas docs novos/modificados.

---

**Sprint anterior: 4.3D** (entregue 2026-05-27) — **QA/hardening final de Documentos Médicos v0.1.**
Smoke 50/50 PASS. Audit/logs verificados. Cleanup de dados sintéticos. Zero mudanças de código.
**Sem migration, sem AWS, sem ICP-Brasil.**

---

**Sprint anterior: 4.3C** (entregue 2026-05-26) — **Frontend de Documentos Médicos e Receitas v0.1.**
Aba "Documentos" no drawer clínico; `ClinicalDocumentsPanel` (lista, criar, detalhe, editar,
finalizar, cancelar, download PDF). **Sem migration, sem AWS, sem ICP-Brasil.**

**Componentes entregues:**
- `frontend/src/components/ClinicalDocumentsPanel.tsx` — state machine `list` → `new` | `detail`;
  `staleTime: 0` em todas as queries de conteúdo (list + detail); PDF via blob sem token em URL
  (`downloadClinicalDocumentPdf`); aviso jurídico ADR 0011 §10.2 em criar e detalhe; sem
  `dangerouslySetInnerHTML`; 401/403 → mensagem genérica segura.
- `frontend/src/components/ClinicalDocumentsPanel.module.css` — CSS module com design tokens.
- `frontend/src/services/api.ts` — 8 tipos + 7 funções adicionados (section "Clinical Documents v0.1").
- `frontend/src/components/ClinicalPatientPane.tsx` — tab bar "Atendimentos | Documentos" na
  timeline view; `activeTab` reseta a `'encounters'` ao abrir o drawer; fluxo de atendimentos
  inalterado.
- `frontend/src/components/ClinicalPatientPane.module.css` — `.tabBar`, `.tabBtn`, `.tabBtnActive`.
- `backend/src/services/clinicalDocumentPdfService.ts` — layout v2: cabeçalho clínica + separador
  bold; título 22pt centrado; caixa metadados 2 colunas sombreada + bordada; label strip
  "CONTEÚDO DO DOCUMENTO"; min-height 200pt; assinatura corrigida (nome ACIMA da linha → linha
  → label → data; sem texto atravessado); limite superior para não colidir com rodapé; rodapé
  cita VALIDAR Gov.br/ITI + GOV.BR; `compress:false` mantido; sem logo/QR/armazenamento.
- `frontend/src/components/ClinicalDocumentsPanel.tsx` — botão "Como assinar e validar →"
  (`SignGuide` inline, 6 etapas, cita VALIDAR Gov.br/ITI + GOV.BR) em criar e em detalhe
  de finalizados; copy do disclaimer atualizado; `pdfNoteRow` agrupa unsigned note + toggle.
- `frontend/src/components/ClinicalDocumentsPanel.module.css` — classes `signGuide*` e
  `pdfNoteRow` adicionadas.

**Verificação:**
- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅
- `git diff --check` rc=0

---

**Sprint anterior: 4.3B** (entregue) — **Implementação backend de Documentos Médicos e Receitas v0.1.**
Migration + DAOs + services + PDF on-demand + 8 endpoints. Smoke 47/47 PASS.
**Sem frontend, sem AWS, sem ICP-Brasil, sem armazenamento de PDF.**

**Componentes entregues:**
- `backend/migrations/20260603000000_clinical_documents_v0.ts`
- `backend/src/dao/clinicalDocumentDao.ts`
- `backend/src/services/clinicalDocumentService.ts`
- `backend/src/services/clinicalDocumentPdfService.ts` (`compress: false` para smoke sem poppler)
- `backend/src/controllers/clinicalDocumentController.ts`
- `backend/src/routes/clinicalDocuments.ts`

---

**Sprint anterior: 4.3A** (entregue) — **ADR Documentos Médicos e Receitas v0.1 (docs/ADR-only).**
ADR 0011 + operacional `docs/medical-documents-v0-scope.md`.
**Sem código, sem migration, sem env vars, sem AWS, sem dado clínico real.**

**Componentes entregues:**
- `docs/adr/0011-medical-documents-prescriptions-v0.md` — ADR completa (20 seções, Status:
  Accepted): 5 tipos de documento; 1 tabela `clinical_documents`; ciclo `draft→finalized→canceled`;
  PDF on-demand não armazenado; audit duplo; logger redaction; 8 endpoints conceituais;
  permissões espelhando ADR 0010.
- `docs/medical-documents-v0-scope.md` — companheiro operacional.

**`git diff --check`** rc=0 · **`git status --short`** apenas docs novos/modificados.

---

**Sprint anterior: 4.2E** (entregue) — **Endpoint LGPD-art.18 de auditoria de leitura clínica.**
`GET /clinical/read-audit` owner-only para transparência LGPD sobre acesso ao prontuário.
**Sem migrations, sem env vars, sem dado clínico real. Smoke 8/8 PASS.**

**Componentes entregues:**
- `backend/src/dao/clinicalReadAuditDao.ts` — adicionado método `list()`: tenant-scoped
  por `cra.clinica_id`; LEFT JOIN `patients` (nome do paciente) + `users` (nome/e-mail do
  accessor); filtros: `patient_id`, `user_id`, `acao`, `date_from`, `date_to`, `limit`,
  `offset`; shape `ClinicalReadAuditListRow` exclui `ip`/`user_agent` intencionalmente.
- `backend/src/services/clinicalReadAuditListService.ts` — valida e parse raw query:
  UUID regex para `patient_id`/`user_id`; allowlist de 3 `acao`; date parse + invariante
  `date_to > date_from`; `limit∈[1,100]` (default 50), `offset≤10000`; erro 400
  `clinical_read_audit_filter_invalid`; best-effort audit admin `clinical_read_audit.list.success`.
  Shape público `PublicClinicalReadAuditEntry` (12 campos; sem `ip`, `user_agent`,
  campos clínicos — nenhum estava na tabela por design).
- `backend/src/controllers/clinicalReadAuditController.ts` — thin controller.
- `backend/src/routes/clinicalReadAudit.ts` — `GET /clinical/read-audit`;
  pipeline `patientsRateLimit → requireAuth → requireClinic → requireRole(CLINIC_ADMIN_ROLES)`.
- `backend/src/app.ts` — registro do `clinicalReadAuditRouter`.
- `frontend/src/services/api.ts` — função `listClinicalReadAudit(token, filters)`.
- `frontend/src/components/ClinicalReadAuditPanel.tsx` — painel owner-only;
  filtros tipo/data com botão "Buscar" (sem refetch por keystroke); lista nome/e-mail
  do accessor, nome do paciente, papel, data formatada; sem IP, sem user_agent,
  sem conteúdo clínico; aviso explícito "apenas metadados de acesso".
- `frontend/src/components/ClinicalReadAuditPanel.module.css` — estilos do painel.
- `frontend/src/views/Dashboard.tsx` — `<ClinicalReadAuditPanel />` na aba Segurança,
  condicional `isOwner`.

**Smoke tests 10/10 PASS** (via usuários smoke persistentes `*@clinicbridge.local`):
1. sem token → 401 ✅  2. `smoke.owner` (dono_clinica) → 200 ✅
3. 9 campos ausentes (7 clínicos + `ip` + `user_agent`) ✅  4. `smoke.secretaria` → 403 `forbidden_role` ✅
5. `smoke.profissional` (+grant profissional_clinico) → 403 `forbidden_role` ✅
6. `smoke.gestor` (+grant gestor_clinica) → 403 `forbidden_role` ✅
7. `smoke.admin` (admin_sistema, sem clinic) → 403 `no_clinic_context` ✅
8. `?acao=invalid` → 400 `clinical_read_audit_filter_invalid` ✅
9. `?patient_id=abc` → 400 ✅  10. `?date_from=not-a-date` → 400 ✅

**Usuários smoke persistentes criados (Sprint 4.2E adendo):**
5 usuários `*@clinicbridge.local` na "Clinica Smoke Dev" para smoke tests futuros.
`smoke.profissional` + `smoke.gestor` com grants clínicos ativos. Não deletar entre sprints.
Senha dev: `SmokeDevOnly!23`. Script de recriação em `docs/testing-checklist.md`.

**Verificação:**
- `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `git diff --check` rc=0

---

**Sprint anterior: 4.2D** (entregue) — **Hardening/QA clínico final do Prontuário v0.1.**
Zero mudanças de código. Validações: logger redaction (7 campos grep confirmado), read audit
(3 categorias, strict mode), permissões (dono/gestor/secretaria), frontend sem dados clínicos,
dados sintéticos do dev DB limpos. `pnpm --filter {backend,frontend} {typecheck,build}` ✅.

---

**Sprint anterior: 4.2C** (entregue) — **Frontend do Prontuário v0.1.** Primeira UI
clínica consumindo os endpoints já existentes da 4.2B-3. **Sem alterações
de backend, sem migrations, sem env vars novas, sem AWS, sem dado clínico
real persistido.**

**Arquivos criados:**
- `frontend/src/components/ClinicalPatientPane.tsx` — drawer lateral
  (right-side pane via `<dialog>`) com máquina de estado: `timeline`,
  `detail`, `new-encounter`, `new-note`. Sub-componentes internos:
  `TimelineView` (metadata-only), `ClinicalEncounterDetail` (CONTENT-READ
  com form de cancelamento inline), `NoteCard` (renderiza campos clínicos;
  `internal_note null` → oculto, sem placeholder), `ClinicalEncounterForm`
  (cria encounter + nota inicial opcional), `ClinicalNoteForm` (adiciona
  ou retifica nota — ao menos 1 campo obrigatório). TanStack Query com
  `staleTime: 0` nos dados clínicos; invalidação pós-mutation correta.
  Audit notice permanente no topo do pane.
- `frontend/src/components/ClinicalPatientPane.module.css` — estilos
  completos: overlay backdrop, pane 680px, encounter cards, note cards,
  badge de status, forms, botões, `.cancelSection`/`.cancelWarning`
  para o form inline de cancelamento, `.rolesPanel` e subestilos para
  o `ClinicalRolesPanel` (mesmo CSS module compartilhado).
- `frontend/src/components/ClinicalRolesPanel.tsx` — painel owner-only
  na aba Equipe. `useQuery(['clinicalRoles'])` + `useQuery(['clinicMembers'])`
  em paralelo; exibe grants com nome do membro; form de concessão
  (select membro + select role + botão); botão de revogação por grant;
  erros contextuais. Retorna `null` para não-owners.

**Arquivos alterados:**
- `frontend/src/services/api.ts` — adicionados tipos e funções antes de
  `getImportFileRetentionDryRun`: `ClinicalEncounterStatus`,
  `ClinicalRoleName`, `ClinicalCancelReasonCode`, `ClinicalNoteRectifyCode`,
  `PublicClinicalEncounterListItem`, `PublicClinicalEncounter`,
  `PublicClinicalNote`, `PublicClinicalRoleGrant`,
  `CreateClinicalEncounterPayload`, `CancelClinicalEncounterPayload`,
  `AddClinicalNotePayload`; e funções `listClinicalTimeline`,
  `getClinicalEncounterDetail`, `createClinicalEncounter`,
  `cancelClinicalEncounter`, `addClinicalNote`, `listClinicalRoleGrants`,
  `grantClinicalRole`, `revokeClinicalRole`.
- `frontend/src/components/PatientsList.tsx` — importa `ClinicalPatientPane`
  e `clinicalStyles`; adiciona estado `clinicalPatient`; botão "Prontuário"
  (`clinicalStyles.prontuarioBtn`) em cada card não-arquivado; monta
  `<ClinicalPatientPane>` ao final da seção. Ação "Prontuário" disponível
  para todos os usuários logados — backend decide o acesso.
- `frontend/src/views/Dashboard.tsx` — importa e monta `<ClinicalRolesPanel />`
  ao final do `tab === 'equipe' && isOwner` block.

**Invariantes de segurança do frontend:**
- Nenhum `console.log` com payload clínico.
- Dado clínico somente em memória (React state / TanStack Query cache);
  não em `localStorage`/`sessionStorage`, não em URL/query string.
- `internal_note null` → campo oculto, sem texto de placeholder.
- 403/401 de endpoint clínico → mensagem genérica, sem revelar se dados
  existem.
- Backend é authoritative; frontend não toma decisões de autorização.
- Sem `dangerouslySetInnerHTML`; conteúdo clínico renderizado como texto.

**Verificação:**
- `pnpm --filter frontend typecheck` ✅ (0 erros)
- `pnpm --filter frontend build` ✅ (warning de chunk size pré-existente)
- `git diff --check` rc=0

**O que NÃO entrou (intencional):** nenhuma alteração de backend; nenhuma
migration; nenhuma env var nova; nenhum AWS; nenhum dado clínico real;
nenhuma tela de auditoria LGPD-art.18 (fica para 4.2B-4 ou Fase 4.5);
nenhum campo fora dos 5 já decididos na ADR 0010.

---

**Sprint anterior: 4.2B-3** (entregue) — **controllers + rotas clínicas + logger
redaction + smoke tests do Prontuário v0.1.** Implementa exatamente o que
a ADR 0010 §15 passos 6–9 decidiu sobre a camada interna entregue na
4.2B-2. **Sem frontend, sem migrations novas, sem AWS, sem dado clínico
real.**

**Arquivos criados:**
- `backend/src/controllers/clinicalEncounterController.ts` — `create`,
  `list`, `detail`, `cancel`, `createNote`, `timeline`. `clinicalActor(req)`
  monta `{clinica_id, usuario_id, clinicalRoles}` confiando no que a
  pipeline de middleware já validou; falha hard se `clinicalRoles` ausente
  (defesa em profundidade).
- `backend/src/controllers/userClinicalRoleController.ts` — `listActive`,
  `grant`, `revoke`. Usa `ownerActor(req)` (não precisa de `clinicalRoles`
  — endpoint é administrativo).
- `backend/src/routes/clinicalEncounters.ts` — registra:
  - `POST /clinical/encounters` →
    `importRateLimit + requireAuth + requireClinic + requireClinicalRole(['profissional_clinico'])`
  - `GET /clinical/encounters` →
    `patientsRateLimit + ... + requireClinicalRole(['profissional_clinico','gestor_clinica'])`
  - `GET /clinical/encounters/:id` → idem GET
  - `PATCH /clinical/encounters/:id/cancel` → idem POST
  - `POST /clinical/encounters/:id/notes` → idem POST
  - `GET /patients/:id/clinical-timeline` → idem GET
- `backend/src/routes/clinicalRoles.ts` — registra
  `GET /clinical/roles`, `POST /clinical/roles/grant`,
  `POST /clinical/roles/revoke` gateadas por
  `requireRole(CLINIC_ADMIN_ROLES)` (owner-only). NÃO usa
  `requireClinicalRole` — administração de roles é tarefa do dono, não
  ação clínica.

**Arquivos alterados:**
- `backend/src/config/logger.ts` — `redactPaths` estendida com 4 camadas
  de cobertura (ajuste pós-4.2B-3, antes do commit):
  1. Top-level: `chief_complaint`, `anamnesis`, `evolution`, `plan`,
     `internal_note`, `cancel_reason_text`, `rectification_reason_text`,
     `paciente_id`.
  2. 1-level wildcards: `*.field` — cobre `body.<f>`, `note.<f>`, etc.
  3. 2-level explícito: `body.<f>`, `req.body.<f>`, `payload.<f>` — cobre
     `logger.info({ body: req.body })`.
  4. 3-level explícito: `body.initial_note.<f>`, `req.body.initial_note.<f>`,
     `payload.initial_note.<f>` — cobre `POST /clinical/encounters` com
     sub-objeto `initial_note`. Verificado por teste de vazamento 7/7 PASS
     (`/tmp/test-logger-redact-4.2B-3b.js`, removido após o run):
     nenhum valor sentinel (`queixa-vazamento-teste`, `interno-vazamento-teste`,
     `cancelamento-vazamento-teste`, `paciente_id UUID`, etc.) aparece nos
     logs em nenhuma das 7 formas testadas.
  `plan` é redação broad (campo único no projeto; `clinics.plano` é
  "plano" em PT e não conflita). `patient_id` (admin) NÃO é redacted
  globalmente — quebraria logs administrativos legítimos; discipline-only
  nos clinical services.
- `backend/src/app.ts` — registra `clinicalRolesRouter` e
  `clinicalEncountersRouter` (admin antes do clínico — ordem REST
  tradicional). Comentário explícito sobre redação no logger.

**Decisões técnicas:**
1. **Rate limit reusa limiters existentes:** `patientsRateLimit` em GETs
   leves (list/detail/timeline) e `importRateLimit` em writes
   (POST/PATCH). ADR 0010 §12 sugere `CLINICAL_WRITE_*` dedicado — ficou
   para sprint futura se o volume real exigir; introduzir env vars novas
   estava fora do escopo desta sprint.
2. **`dono_clinica` implícito apenas quando `gestor_clinica` na allowlist:**
   para criar/cancelar (`['profissional_clinico']`), o owner precisa de
   concessão explícita. Confirmado pelo smoke test 1.4 e 6.2.
3. **Timeline em `clinicalEncountersRouter`:** path `/patients/:id/clinical-timeline`
   pertence semanticamente ao módulo clínico (decide audit, requireClinicalRole,
   etc.), mesmo seguindo a convenção REST de sub-resource do paciente.
4. **Logger cobre 4 camadas de profundidade explícita:** fast-redact não
   suporta wildcards recursivos (`**`), então paths de 3 níveis são
   declarados explicitamente. Defesa principal continua discipline-only
   nos services (que nunca passam clinical row ao logger).
5. **`patient_id` NÃO globalmente redacted:** seria destrutivo para logs
   administrativos (appointments, scheduling). Restrição é discipline-only.

**Smoke test (76/76 PASS — `/tmp/test-clinical-sprint-4.2B-3.sh`, removido
após o run):**
- **Seção 1 — Autorização:** sem token → 401 (5 cenários); secretaria →
  403 em todos os clinical endpoints; profissional sem grant → 403; owner
  sem `profissional_clinico` não cria (mas lista — gestor implícito);
  não-owner não concede role.
- **Seção 2 — Grant/revoke role:** owner concede profA/profB
  (`profissional_clinico`) e gestor (`gestor_clinica`) → 201; duplicata →
  400 `clinical_role_already_granted`; cross-tenant grant → 404 genérico;
  role `financeiro` → 400 (fora do v0.1).
- **Seção 3 — Create + patient guards:** profA cria → 201; profB cria
  outro → 201; paciente arquivado → 404 `patient_not_found`; paciente
  mesclado → 404; UUID aleatório → 404; encounter sem initial_note → 201.
- **Seção 4 — Metadata-only:** `list` e `timeline` retornam ZERO ocorrências
  de `chief_complaint|anamnesis|evolution|plan|internal_note|cancel_reason_text|notes`;
  profA NÃO vê encounter do profB (DAO self-filter); owner/gestor com
  filter por paciente veem AMBOS encounters.
- **Seção 5 — Detail + redaction:** autor vê próprio `internal_note`;
  owner (gestor implícito) lendo encounter alheio vê `internal_note`;
  gestor lendo encounter alheio vê `internal_note`; profissional A → 404
  no encounter do B (anti-enumeração); owner lendo encounter de profB vê
  o `internal_note` que profB anotou.
- **Seção 6 — Cancel:** profB cancela alheio → 404; owner sem grant não
  cancela → 403; profA cancela próprio → 200 + status=canceled;
  segunda cancelamento → 404 (CAS idempotente).
- **Seção 7 — Notes:** append OK; profB em encounter de profA → 404;
  nota vazia → 400; rectify próprio → 201; profB rectify de profA → 404;
  rectify sem `rectification_reason_code` → 400.
- **Seção 8 — Audit/SQL:** `audit_logs` sem texto clínico em
  recurso/recurso_id; `clinical_read_audit` com 9 linhas para clinica A,
  todas com `acao LIKE 'clinical.%'` + recurso no allowlist; snapshots
  `papel_at_read` com `dono_clinica`, `gestor_clinica`, `profissional_clinico`
  presentes; `paciente_id` NULL em `clinical.encounter.list` e NOT NULL
  em `clinical.encounter.read` / `clinical.timeline.list`.
- **Seção 9 — Logs:** grep nos logs em `chief_complaint|anamnesis|...
  |"queixa A"|"interno A"|"queixa A corrigida"` → 0 ocorrências; grep nas
  chaves JSON `"chief_complaint":|"anamnesis":|...` → 0.
- **Seção 10 — Strict fail-closed:** best-effort com CHECK `NOT VALID`
  quebrando inserts → 200 OK + conteúdo entregue + log `clinical_read_audit_failed`
  sem `paciente_id`; strict mode via Node child mockando o DAO ⇒
  `HttpError(500, clinical_read_audit_unavailable)`; production boot
  guard validado pela 4.2B-1 (9/9).
- **Seção 11 — Revoke:** owner revoga grant → 200; profA não cria após
  revoke → 403 (middleware re-queries `user_clinical_roles` por request);
  segundo revoke → 404 (idempotente).

**Cleanup pós-smoke:** todas as 4 tabelas clínicas voltaram para count=0;
clinics/users/patients/audit_logs de teste deletados; constraint
`clinical_read_audit_acao_prefix_check` restaurada; invariantes locais
preservados (patients=26, import_files=25, import_sessions=8, users=35).

**O que NÃO entrou nesta sprint (intencional):** nenhum frontend; nenhum
endpoint de transparência LGPD-art.18 ("quem leu meu prontuário" —
opcional, vai para 4.2B-4 ou Fase 4.5); nenhum env var nova (rate
limiter dedicado `CLINICAL_WRITE_*` não foi criado — reusa
`importRateLimit`); nenhuma migration nova; nenhum recurso AWS; nenhum
dado clínico real persistido (smoke usa fixtures sintéticos limpos).

**Riscos / ressalvas:**
- **Rate limit compartilhado com import** — em produção real, pode valer
  introduzir `CLINICAL_WRITE_*` dedicado (env vars + scope) se houver
  volume; hoje o write-class compartilha 120 req/15min com a pipeline
  de import.
- **`patient_id` em logs administrativos NÃO é redacted globalmente** —
  discipline-only nos clinical services. Auditoria periódica do log
  deve confirmar.
- **`plan` é redação broad no logger** — qualquer top-level/1-deep `plan`
  em qualquer contexto será removido. Aceitável: `clinics.plano` (PT)
  não conflita, e nenhuma feature atual loga top-level `plan`. Documentado
  no comentário do `logger.ts`.
- **Sem CSRF token** — JWT em Authorization header, não cookie; sem
  cross-site state-changing risk. Mantém o padrão atual.
- **Smoke test exigiu bumpar `AUTH_RATE_LIMIT_MAX=200` temporariamente**
  durante o run (precisa 30+ requests em /auth/* na fase de setup); env
  foi restaurada para 20 ao final. **Não comitar o bump.**

---

**Sprint anterior: 4.2B-2** (entregue) — **camada interna do Prontuário v0.1:
DAOs + middleware `requireClinicalRole` + services base, sem rotas
públicas.** Implementa exatamente o que a ADR 0010 §15 passos 3–5
decidiu, sem desvio. **Nenhuma rota clínica registrada em `app.ts`;
nenhum controller; nenhum frontend.** Autoriza a 4.2B-3 (controllers,
rotas, logger estendido, smoke tests) a consumir esta camada sem
refactor.

**Arquivos criados (9, todos sob `backend/src/`):**

DAOs (`dao/`):
- `userClinicalRoleDao.ts` — append-only. `grant`, `revoke` (CAS),
  `listActiveRoleNames`, `findActiveForUserRole`, `listActiveByClinic`.
  Toda query tenant-scoped. Partial unique index do schema garante
  uma concessão ativa por (user, clinica, role); duplicata vira
  Postgres `23505` que o service traduz em 400.
- `clinicalReadAuditDao.ts` — append-only, espelha `auditLogDao`.
  Único método `record`, com `clip()` para colunas limitadas. Sem
  `update`/`delete`. DB CHECK força namespace `clinical.*`.
- `clinicalEncounterDao.ts` — `create`, `findByIdForClinic`,
  `listForClinic`, `listForPatient`, `cancelOwn` (CAS por id +
  clinica_id + attending_user_id = self + status='active'). Parâmetro
  `attending_user_id_self` defensivo aplicado SEMPRE quando presente
  (ADR 0010 §6.1 — defesa no DAO, não no controller). Sem update
  clínico (encounter não tem texto) nem delete físico.
- `clinicalEncounterNoteDao.ts` — append-only estrito. `create`,
  `findByIdInEncounter`, `listByEncounter`. Sem `update`/`delete`.
  Retorna `internal_note` raw — redação é decisão do service.

Middleware (`middlewares/requireClinicalRole.ts`):
- Compõe APÓS `requireAuth` + `requireClinic`. Recebe lista de
  `UserClinicalRoleName`. `admin_sistema` e `secretaria` → 403
  firme. `dono_clinica` passa **implicitamente apenas quando
  `gestor_clinica` está na allowlist** (operações de leitura).
  Para escrita (`profissional_clinico` only), o owner precisa de
  concessão explícita em `user_clinical_roles` (ADR 0010 §7 linha 1).
  Demais roles vêm de SELECT em `user_clinical_roles`. Popula
  `req.clinicalRoles: Set<ClinicalCapability>`. 403 `forbidden_role`
  é genérico (anti-enumeração).

Services (`services/`):
- `userClinicalRoleService.ts` — `grant` (valida target ativo +
  mesma clínica + papel ≠ admin_sistema; trata `23505` como 400
  `clinical_role_already_granted`), `revoke` (CAS + audit
  `clinical.role.revoked.success` na transação — mesmo padrão do
  patientMergeService), `listActive`. Audit em `audit_logs`
  (`recurso='user_clinical_role'`).
- `clinicalReadAuditService.ts` — **controle compensatório principal**
  da ausência de cifra a nível de coluna (ADR 0010 §13). Allowlist
  de acoes. Modo determinado por `env.CLINICAL_READ_AUDIT_STRICT`:
  `recordStrict` (falha → 500 `clinical_read_audit_unavailable`),
  `recordBestEffort` (falha logada sem PII), `recordReadAudit`
  (default — usa strict em prod, best-effort em dev/test). Snapshot
  `papel_at_read` anti-stale (dono > gestor > profissional).
- `clinicalEncounterService.ts` — separação rigorosa entre
  **metadados** e **conteúdo clínico**:
  - **METADADOS-LIST** (`list`, `listForPatient`) → retorna
    `PublicClinicalEncounterListItem` (sem os 5 campos textuais; sem
    `cancel_reason_text`). DAO `listForClinic`/`listForPatient` consulta
    APENAS `clinical_encounters` (sem JOIN com notas) — defesa de schema.
    `toListItem` dropa `cancel_reason_text`. Audit `clinical.encounter.list`
    (lista geral, `paciente_id=null`) ou `clinical.timeline.list` (single-patient,
    `paciente_id` presente). Strict mode aplica também aos audits de
    metadados — falha aborta a resposta antes do SELECT.
  - **CONTEÚDO-READ** (`findById`) → única operação que retorna notas
    (5 campos textuais). Audit STRICT `clinical.encounter.read` com
    `paciente_id` emitido **após** carregar a metadata mas **antes** de
    carregar as notas. Em strict mode, falha do audit aborta antes de
    qualquer texto clínico sair. `internal_note` redacted para não-autor
    pelo helper único do note service.
  - **WRITE** (`create`, `cancel`) → audit administrativo
    (`clinical.encounter.created/canceled.success`) em `audit_logs`,
    best-effort. `create` valida paciente ativo + não-mesclado +
    mesma clínica; `started_at` bound 1d/5y. `cancel` via CAS no DAO.
  `attendingSelfFilterFor(actor)` aplica self-filter no DAO (null
  para dono/gestor, `usuario_id` para profissional). **Audit de
  metadados (list/timeline) NÃO substitui audit de conteúdo (read)**
  — são `acao` distintas e jamais intercambiáveis.
- `clinicalEncounterNoteService.ts` — `create` cobre criação simples
  e retificação. Helper público `applyInternalNoteRedaction(row, actor)`
  é o **único ponto auditável** de redação — autor + dono + gestor
  veem `internal_note`; demais leitores recebem `null`. DAO sempre
  devolve raw; service projeta. `normalizeInitialNotePayload`
  reusado pelo encounter service para validação UPFRONT antes de
  abrir transação. Rectification exige nota alvo no mesmo encounter
  + mesmo autor (ADR 0010 §9.1).

**Decisões técnicas resumidas:**
1. **`dono_clinica` implícito apenas quando `gestor_clinica` está
   na allowlist.** Owner-as-clinician precisa da concessão explícita
   (ADR 0010 §7 linha 1).
2. **Defesa em profundidade no DAO** — `attending_user_id_self` no
   DAO sempre aplicado, service-bug-proof.
3. **Audit STRICT antes da query principal** (atomicidade simples).
4. **Redaction só no service**, ponto único auditável.
5. **Audit administrativo best-effort × audit de leitura strict**:
   mecanismos diferentes (`auditLogDao` vs. `clinicalReadAuditDao`),
   nunca confundidos.
6. **404 genérico em todos os mismatches** (cross-tenant, autor
   alheio, paciente mesclado/arquivado, encounter cancelado).
7. **Sem `update`/`delete` clínico**: encounter cancela via CAS,
   notas só INSERT, roles via `revoked_at`.

**Verificação executada:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `git diff --check` rc=0
- `git status --short`: 9 arquivos novos, todos sob
  `backend/src/{dao,middlewares,services}/`. Nada mais.
- `grep -rn 'clinical\|encounter'` em `backend/src/app.ts` e
  `backend/src/routes/` — só comentários administrativos antigos.
  **Sem rota clínica registrada.**
- `backend/src/controllers/` — nenhum controller clínico criado.

**O que NÃO é entregue nesta sprint (intencional):** nenhuma rota
clínica em `app.ts`/`routes/`, nenhum controller, nenhum frontend,
nenhuma alteração em `logger.ts` (extensão de `redactPaths` fica
para 4.2B-3), nenhum seed de role clínica em banco real, nenhuma
inserção em tabelas clínicas, nenhum recurso AWS, nenhum secret novo,
nenhuma migration adicional. ADR 0010 §15 passos 6–9 (controllers,
rotas, logger, smoke tests) vão para a **Sprint 4.2B-3**.

**Riscos / ressalvas:**
- Camada interna sem cobertura por endpoint ainda — services não
  são exercitados ponta a ponta. Smoke tests da matriz cross-tenant /
  "profissional só vê os próprios" / redaction de `internal_note` /
  fail-closed strict / 403 para funcionário/financeiro/admin_sistema
  (ADR 0010 §15 passo 9) ficam para a 4.2B-3.
- `user_clinical_roles` continua vazia em dev/staging. Antes de
  qualquer teste ponta a ponta da 4.2B-3 será necessário endpoint
  owner-only de grant ou seed dev-only.
- Disciplina de logging não automatizada: services aqui não passam
  conteúdo clínico ao `logger`, mas `redactPaths` em `config/logger.ts`
  só cobre `password`/`senha`/`cpf`/`token`. A 4.2B-3 deve estender
  com os 5 campos clínicos + cancel/rectification reason_text (ADR
  0010 §8.4). Hoje a defesa é discipline-only.
- `applyInternalNoteRedaction` é ponto único de redação. Um
  controller futuro que devolver o row do DAO direto vaza
  `internal_note` — smoke test obrigatório na 4.2B-3.

---

**Sprint anterior: 4.2B-1** (entregue) — **base técnica do Prontuário v0.1:
migration aditiva + tipos + env guard.** Primeira sprint a tocar
código clínico de verdade. **Sem endpoints, sem DAOs, sem services,
sem controllers, sem UI, sem AWS.** Implementa exatamente o que a
ADR 0010 §5 + §15 (passos 1–2) e §8.2.1 (env var) decidiram.

**Arquivos criados:**
- `backend/migrations/20260602000000_clinical_encounters_v0.ts` —
  migration única aditiva (batch 13) com as 4 tabelas decididas na
  ADR 0010 §5:
  - **`clinical_encounters`** — identidade do atendimento. FKs:
    `clinica_id` CASCADE; `patient_id`, `attending_user_id` RESTRICT
    (preserva histórico médico-legal — patients/users nunca são
    deletados fisicamente; RESTRICT é defesa em profundidade);
    `professional_id`, `appointment_id`, `canceled_by_user_id` SET NULL.
    Colunas: `started_at`, `ended_at`, `status` (default `active`),
    `canceled_at`, `cancel_reason_code`, `cancel_reason_text` (≤ 200
    chars sem PII, jamais em audit), `created_at`, `updated_at`. 5 CHECK
    constraints: status allowlist (`active`|`canceled`), time order
    (`ended_at >= started_at`), cancel triplet consistency (status,
    canceled_at, canceled_by, reason_code coerentes), reason_code
    allowlist (`duplicated`|`wrong_patient`|`data_error`|`other`),
    `cancel_reason_text` length cap. 4 índices (3 não-parciais + 1
    partial em `appointment_id`).
  - **`clinical_encounter_notes`** — notas append-only com cadeia de
    retificação. `clinica_id` denormalizado para filtro de tenant
    direto sem join. FKs: `clinica_id` CASCADE; `encounter_id`,
    `author_user_id` RESTRICT; `revises_note_id` SET NULL. 5 campos
    textuais clínicos (`chief_complaint` ≤ 2000, `anamnesis` ≤ 8000,
    `evolution` ≤ 8000, `plan` ≤ 4000, `internal_note` ≤ 2000) +
    `rectification_reason_code`. 4 CHECK constraints: has-content
    (pelo menos um campo), length caps por coluna via `char_length`,
    rectification consistency (`revises_note_id` ⇔ `reason_code`),
    reason_code allowlist (`typo`|`clinical_correction`|`add_info`|`other`).
    3 índices (2 não-parciais + 1 partial em `revises_note_id`).
  - **`clinical_read_audit`** — paralelo a `audit_logs` (Sprint 1.5):
    `criado_em` (português, mesmo padrão), `usuario_id`/`clinica_id`
    com `SET NULL` (preserva evidência). Campos extras vs.
    `audit_logs`: `papel_at_read` (snapshot anti-stale do papel
    efetivo no momento da leitura), `paciente_id` (uuid pseudonimizado
    — sem FK, dado pessoal sob LGPD com acesso restrito por design,
    chave para LGPD-art.18 transparência ao titular). 2 CHECK
    constraints: `acao LIKE 'clinical.%'` (namespace forçado), recurso
    allowlist (`encounter`|`note`|`timeline`|`document`|`report`|`attachment`).
    3 índices (2 não-parciais + 1 partial em `paciente_id`). Append-only
    no DAO (4.2B-2 garante).
  - **`user_clinical_roles`** — append-only com revogação por
    `revoked_at`. FKs: `user_id`, `clinica_id` CASCADE; `granted_by`,
    `revoked_by` SET NULL. Não toca `users.papel` — backward-compatible
    total. 2 CHECK constraints: role allowlist (`profissional_clinico`|
    `gestor_clinica` — `financeiro` reservado para Sprint 4.4), revocation
    consistency (`revoked_at IS NULL ⇒ revoked_by_user_id IS NULL`).
    2 índices (1 plain + 1 **UNIQUE PARCIAL** sobre `(user_id, clinica_id,
    role) WHERE revoked_at IS NULL` — garante uma concessão ativa por
    par + histórico preservado em linhas revogadas).
  - **Total:** 13 CHECK constraints, 15 índices (não-PK), 0 dados clínicos
    inseridos. Migration testada com `up`/`down` roundtrip; reaplicada
    limpa.

**Arquivos alterados:**
- `backend/src/types/db.d.ts` — 4 interfaces novas
  (`ClinicalEncounterRow`, `ClinicalEncounterNoteRow`,
  `ClinicalReadAuditRow`, `UserClinicalRoleRow`) + 4 type aliases
  (`ClinicalEncounterStatus`, `ClinicalEncounterCancelReasonCode`,
  `ClinicalNoteRectificationReasonCode`, `UserClinicalRoleName`) +
  registro das 4 tabelas em `declare module 'knex/types/tables'`.
  Comentários inline reforçam: pseudonimização de `paciente_id`,
  redação obrigatória de `internal_note` para não-autor, append-only.
- `backend/src/config/env.ts` — nova env var `CLINICAL_READ_AUDIT_STRICT`
  com transform que aceita `true`/`1`/`false`/`0`/unset; default `false`
  em dev/test (best-effort). **Guard de produção no `superRefine`:**
  quando `NODE_ENV=production`, o `process.env.CLINICAL_READ_AUDIT_STRICT`
  bruto deve ser exatamente `'true'` ou `'1'` (case/whitespace insensitive);
  qualquer outro valor (incluindo ausência) faz o boot **falhar** com
  mensagem clara apontando ADR 0010 §8.2.1. Mesmo padrão da Sprint 3.39
  (`MFA_ENCRYPTION_KEY`, `FRONTEND_ORIGIN`). Smoke test rodou 9
  cenários (dev/test/prod × variações de var) — 9/9 PASS.
- `.env.example` — bloco novo "Clinical read audit posture (Sprint
  4.2B-1, ADR 0010 §8.2.1)" comentando a postura por ambiente; linha
  `# CLINICAL_READ_AUDIT_STRICT=false` (comentada para deixar default
  dev). Sem secret novo; sem valor real.

**Verificação executada:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:latest` ✅ (batch 13)
- `pnpm --filter backend migrate:rollback` + reaplicar — limpo
- SQL checks pós-migration: 4 tabelas novas todas com COUNT=0;
  invariantes locais preservadas (patients=26, import_files=25,
  import_sessions=8, users=17, audit_logs=1373 — não tocados pela
  migration). **Observação:** os números atuais diferem dos
  "invariantes locais (sanity-check)" no CLAUDE.md (patients=6,
  import_files=24, import_sessions=7) porque o banco local
  acumulou dados de teste/seed de sprints anteriores. **Não é
  problema desta sprint** — a invariante validada aqui é "migration
  aditiva não toca dados existentes", e isso foi confirmado.
- 13 CHECK constraints listados via `pg_constraint`; 15 índices
  não-PK listados via `pg_indexes`. 4 testes negativos provaram:
  status fora do allowlist, role fora do allowlist, nota sem
  conteúdo, `clinical.*` acao sem namespace — todos REJEITADOS.
- `grep -r clinical backend/src/routes /controllers /services /dao`:
  só comentários antigos administrativos — **nenhum endpoint,
  DAO, service ou controller clínico criado**.

**O que NÃO é entregue nesta sprint (registrado):** nenhum endpoint
clínico (`/clinical/*` continua 404), nenhum DAO clínico, nenhum
service clínico, nenhum controller clínico, nenhum middleware
`requireClinicalRole`, nenhum logger estendido, nenhuma role atribuída
a usuário real, nenhuma inserção em `clinical_encounters`/
`clinical_encounter_notes`/`clinical_read_audit`/`user_clinical_roles`
(todas começam vazias), nenhuma UI, nenhum recurso AWS, nenhum
secret novo. A ADR 0010 §15 passos 3–12 (DAOs, middleware, services,
controllers, rotas, logger, smoke tests) vão para a **Sprint 4.2B-2**.

**Riscos / ressalvas:**
- Sprint 4.2B-2 precisa implementar tanto o caminho strict quanto o
  best-effort do `clinicalReadAuditService` antes de qualquer endpoint
  clínico responder com conteúdo. Hoje a env var existe e tem guard,
  mas nenhum service consome — é flag inerte até a 4.2B-2.
- O comentário no `.env.example` referencia "staging com dados sintéticos
  pode rodar com false ou true para drill da postura prod" — quando a
  4.2B-2 entregar staging, o drill com `true` é o teste-chave do
  fail-closed (smoke test obrigatório §15 da ADR 0010).
- Counts locais (`patients=26`, etc.) divergem dos invariantes
  documentados em `CLAUDE.md` (6, 24, 7) — apenas estado acumulado de
  testes, não regressão. Atualizar o sanity-check quando convier; não
  bloqueia esta sprint.
- Nenhuma role clínica concedida a nenhum usuário real. Em staging/dev,
  a 4.2B-2 vai precisar de uma forma de conceder (endpoint owner-only
  ou seed dev-only) antes de testar endpoints clínicos.

**Sprint anterior: 4.2A** (entregue — docs/ADR-only) — **escopo do módulo
Prontuário/Atendimento clínico v0.1.** ADR 0010
(`docs/adr/0010-clinical-encounters-medical-record-v0.md`) + operacional
`docs/clinical-encounters-v0-scope.md`.

**Resumo de decisões da ADR 0010 (12 compromissos):**
1. Escopo conservador: atendimento + notas textuais versionadas ligadas a
   paciente administrativo. Sem CID, prescrição, exames, anexos, IA,
   ICP-Brasil.
2. **4 tabelas novas conceituais** (sem migration nesta sprint):
   `clinical_encounters` (identidade estável do atendimento),
   `clinical_encounter_notes` (notas append-only com `revises_note_id`),
   `clinical_read_audit` (paralela ao `audit_logs`, com `paciente_id`
   pseudonimizado), `user_clinical_roles` (append-only com revogação;
   roles `profissional_clinico` e `gestor_clinica`; mantém `users.papel`
   retrocompatível).
3. **5 campos textuais clínicos** permitidos no v0.1: `chief_complaint`
   (≤ 2000), `anamnesis` (≤ 8000), `evolution` (≤ 8000), `plan` (≤ 4000),
   `internal_note` (≤ 2000). `internal_note` visível **apenas** ao
   autor/dono/gestor (redacted no DAO para outros).
4. **Prefixo `clinical_` em `public`** (sem schema PostgreSQL separado por
   agora). Justificativa: simplicidade de migrations/FKs/grants.
5. **Notas append-only com retificação por revisão.** Sem `UPDATE`
   destrutivo em conteúdo de nota; edição = nova linha apontando para a
   anterior com `rectification_reason_code` obrigatório.
6. **Encounter `status` two-state:** `active` | `canceled` (one-way; sem
   restore). Cancel exige `cancel_reason_code` + opcional `cancel_reason_text`
   ≤ 200 chars sem PII (jamais em audit).
7. **Audit de leitura em tabela paralela `clinical_read_audit`** (não
   estende `audit_logs`). Eventos: `clinical.encounter.read`/`.list`,
   `clinical.timeline.list`. **Postura de falha por ambiente** (config
   `CLINICAL_READ_AUDIT_STRICT` na 4.2B — vide ADR 0010 §8.2.1):
   **best-effort** apenas em local/dev/staging com **dados sintéticos**
   (falha loga `error`, leitura segue); **fail-closed obrigatório em
   produção** com dado clínico real — guard de boot força `true` em
   `NODE_ENV=production` (espelha padrão da Sprint 3.39); falha em
   strict mode → 500 `clinical_read_audit_unavailable` + conteúdo
   clínico **nunca** sai no body. Smoke test de fail-closed obrigatório
   na 4.2B.
8. **Visibilidade default — "profissional só vê os próprios"** (ADR 0009
   §4.3 confirmada). Cláusula `WHERE attending_user_id = self` no DAO.
   Dono/gestor leem qualquer atendimento da clínica com audit; **não
   editam nem cancelam alheio** no v0.1 (responsabilidade médico-legal
   preserva o autor).
9. **Funcionario_administrativo + financeiro NÃO acessam endpoints
   clínicos** no v0.1 (403 em todos). Sem timeline reduzida. Usam agenda
   administrativa existente.
10. **`admin_sistema` bloqueado** por `requireClinic` (sem exceção;
    break-glass continua fora — ADR 0009 §4.6).
11. **Cifra a nível de coluna NÃO entra no v0.1.** Confia em RDS
    encryption at rest + TLS in transit + controles de aplicação
    (`requireAuth`/`requireClinic`/`requireClinicalRole` + tenant filter)
    + audit de leitura + logger redigindo campos clínicos. **Decisão
    revisável** antes de dado clínico real em produção (KMS CMK dedicada
    + sprint dedicada se jurídico/anexos clínicos exigirem).
12. **Merge B-safe (ADR 0007) é gate de criação:** encounter não pode ser
    criado para paciente com `merged_into_id IS NOT NULL` ou
    `status='archived'` → 404 genérico. Histórico clínico do secundário
    **não se mistura** com o do principal (default ADR 0009 §8 risco #7
    confirmado). Mover encounters no merge exige ADR de extensão da 0007.

**5 endpoints clínicos + 2 administrativos (conceituais):**
- `POST /clinical/encounters` (profissional autor)
- `GET /clinical/encounters` (lista; profissional vê só os próprios)
- `GET /clinical/encounters/:id` (detalhe + notas; `internal_note` redacted
  conforme role)
- `PATCH /clinical/encounters/:id/cancel` (autor próprio)
- `POST /clinical/encounters/:id/notes` (autor próprio; com ou sem
  `revises_note_id`)
- `GET /patients/:id/clinical-timeline` (profissional vê só os próprios
  desse paciente; dono/gestor veem todos)
- `POST /clinical/roles/grant` + `POST /clinical/roles/revoke` (owner-only)

**Audit de escrita** estende `audit_logs` existente (sem migration):
`clinical.encounter.created.success`, `.canceled.success`,
`.note.created.success`, `.note.rectified.success`,
`clinical.role.granted.success`, `.revoked.success`. **Sem PII** em
nenhum.

**Logger** será estendido na 4.2B para redigir
`chief_complaint|anamnesis|evolution|plan|internal_note|
cancel_reason_text|rectification_reason_text`; body de `/clinical/*`
jamais logado integral.

**Plano Sprint 4.2B (próximo passo, sem ADR nova):** migration única
aditiva (4 tabelas + índices + CHECK constraints + unique parcial em
roles ativos) → tipos em `db.d.ts` → 4 DAOs → middleware
`requireClinicalRole` → 4 services → controllers + rotas → atualização
do logger → smoke tests por API (cross-tenant, profissional-vê-só-os-próprios,
dono lê + audit, funcionario/financeiro/admin_sistema → 403,
`internal_note` redacted, paciente arquivado/mesclado → 404, cancel/
retificação preservam autoria, audit sem PII, logger sem conteúdo
clínico) → SQL checks → limpeza de dados de teste → docs (CLAUDE.md,
project-state, sprint-history, security-notes, testing-checklist).

**Trilha AWS continua pausada estrategicamente.** Esta ADR registra
impactos concretos do v0.1: RDS class (volume textual + audit de leitura
em ~75 mil linhas/ano para 10 prof × 30 pac/dia × 250 dias — `db.t3.micro`
provavelmente segura para 5-10 clínicas); EBS/S3 sem mudança (anexos fora
do v0.1); KMS sem CMK dedicada agora (decisão revisável); CloudWatch
exige validar redação em staging; backup Restic cobre as 4 tabelas novas;
região `sa-east-1` preferida por LGPD. **Decisão consciente:** 4.2B
pode ser implementada e validada inteiramente em local + staging local
(Docker compose) sem AWS — retomada da trilha continua evento separado.

**Princípios invariantes mantidos sem exceção:** tenant isolation, CPF
mascarado, audit append-only, sem PII em logs, sem delete físico,
migration aditiva. **Invariantes próprias do módulo clínico
adicionadas:** sem `UPDATE` em conteúdo de nota (append-only com
`revises_note_id`); sem `DELETE` físico em nenhuma das 4 tabelas; sem
mistura de histórico clínico em merge B-safe; audit de leitura para todo
acesso a conteúdo clínico; logger redige campos clínicos; cifra a nível
de coluna revisável.

**O que NÃO é entregue nesta sprint (registrado):** nenhuma migration,
nenhum schema clínico no banco, nenhuma role nova no banco, nenhum audit
de leitura técnico, nenhum endpoint clínico, nenhum middleware
`requireClinicalRole` implementado, nenhuma alteração em
backend/frontend, nenhum recurso AWS, nenhuma promessa de conformidade
LGPD/CFM/ICP-Brasil/TISS.

**Sprint anterior: 4.1** (entregue — docs/ADR-only) — **arquitetura clínica mínima,
roles granulares conceituais, audit de leitura e LGPD clínica.** ADR 0009
(`docs/adr/0009-clinical-architecture-roles-read-audit.md`) define princípios
invariantes do domínio clínico, modelo conceitual de roles
(`dono_clinica`, `gestor_clinica`, `profissional_clinico`,
`funcionario_administrativo` sucessor de `secretaria`, `financeiro`,
`admin_sistema` sem dado clínico por padrão), separação administrativo vs.
clínico, eventos conceituais de audit de leitura
(`clinical.<entidade>.read|list|export` + `paciente_id` para transparência
LGPD ao titular), estratégia de versionamento clínico (sem delete físico,
edição via nova versão, cancelamento ≠ delete), princípios LGPD clínica
(art. 11 — dados sensíveis), threat model com 10 vetores específicos,
política "break-glass" para `admin_sistema` (não implementada — ADR futura),
e gates obrigatórios para abrir a Sprint 4.2 (ADR 0010 prontuário v0.1).

Documento operacional companheiro:
`docs/clinical-architecture-and-permissions.md` — matriz de permissões
conceitual por domínio (cadastro, agenda, equipe, prontuário, documentos,
financeiro, relatórios, convênios, estoque, importação/exportação,
auditoria), catálogo de eventos de audit de leitura, estratégia de
versionamento, checklist LGPD por módulo, threat model por ADR de módulo,
checklist de gates para 4.2, convenções sugeridas de nomenclatura (prefixo
`clinical_`, schema PostgreSQL dedicado, tabela `clinical_read_audit`
paralela).

**Bloqueia Fase 4.2** (prontuário/atendimento v0.1) até a ADR 0010 abrir
(que precisa cumprir os 9 gates listados na ADR 0009 §9 + checklist em
`docs/clinical-architecture-and-permissions.md` §7).

**Trilha AWS continua pausada estrategicamente** (ADR 0008 §6). Gate de
retomada atualizado pela ADR 0009 §10: **ADR 0010 aceita** + reavaliação de
dimensionamento RDS (volume textual de prontuário + audit de leitura
clínica), EBS/S3 (anexos clínicos futuros — signed URL obrigatório), KMS
(CMK dedicada se ADR 0010 escolher cifra a nível de coluna; hoje
`MFA_ENCRYPTION_KEY` ainda pode usar fallback de `JWT_SECRET`), região
`sa-east-1` preferida por LGPD (transferência internacional).

**Princípios invariantes mantidos sem exceção:** tenant isolation,
CPF mascarado, audit append-only, sem PII em logs, sem delete físico,
migration aditiva, escopo clínico proibido sem ADR de módulo aprovada.
Vocabulário de produto da Sprint 3.24.1 mantido (UI fala em "funcionário(a)",
backend continua com `secretaria` até migration dedicada — ver ADR 0009 §11).

**O que NÃO é entregue nesta sprint (registrado):** nenhum schema/migration
clínico, nenhuma role nova no banco, nenhum audit de leitura técnico,
nenhum endpoint clínico, nenhuma alteração em backend/frontend, nenhum
recurso AWS, nenhuma promessa de conformidade LGPD/CFM/ICP-Brasil/TISS
(continua exigindo validação jurídica externa).

**Sprint anterior: 4.0** (entregue — docs/ADR-only) — **expansão estratégica
para Clinic OS modular.** ADR 0008 (`docs/adr/0008-clinicbridge-clinic-os-expansion.md`)
registra a evolução: ClinicBridge deixa de ser apenas ponte de migração e
passa a sistema modular de gestão clínica, **sem telemedicina**, com migração
permanecendo como diferencial. Roadmap Clinic OS criado
(`docs/product-clinic-os-roadmap.md`) com fases 4.0–4.7 + fases futuras sem
número (IA clínica assistiva, ICP-Brasil, TISS/TUSS real, SNGPC/ANVISA), cada
uma exigindo ADR própria. ADR 0001 (Opção C) **parcialmente superseded** —
base administrativa continua sendo pré-requisito; critérios de gating clínico
mantidos.

**Sprint anterior: 3.41B-0** (entregue — docs-only) — **runbook executável de provisionamento
AWS real.** Checklist passo a passo com caminho Console AWS e caminho CLI; billing
alarm; bucket S3 privado+versionado+SSE; IAM instance profile; SSM Parameter Store
(17 parâmetros staging+prod); Security Groups (EC2/RDS/Redis); RDS db.t3.micro;
EC2 t3.small + EBS 20 GB; setup inicial com Docker/Restic/Node; injeção de secrets do SSM;
migrations; DNS Registro.br; Certbot; smoke tests (9 checks); backup drill (gate go/no-go);
checklist de controle de custos; rollback de emergência; go/no-go §15 com 17 itens.
Runbook: `docs/aws-provisioning-runbook-3.41B.md`. Nenhum recurso AWS criado;
nenhum código de produto alterado; nenhum secret versionado.

**Sprint anterior: 3.41A** (entregue — docs-only) — decisão operacional AWS:
recomendação EC2+Compose, 7 decisões do dono, arquitetura. Ver `docs/aws-infra-sprint-3.41-plan.md`.

**Sprint 3.40** (entregue — backup offsite Restic + S3, docs/scripts only) — **scripts
de backup/restore offsite com hard guards de segurança + runbook operacional com IAM
mínimo e retenção documentada.** Sem migration, sem backend/frontend, sem AWS real,
sem commit/push.

**Arquivos criados:**
- `scripts/check-backup-offsite-env.sh` — pré-flight; checa `restic`, docker, Postgres,
  `RESTIC_PASSWORD`/`RESTIC_REPOSITORY`, AWS creds (env ou IAM role default chain),
  `.gitignore`. `--probe` opcional tenta `restic snapshots`. Nunca imprime secrets.
- `scripts/backup-offsite-restic.sh` — `pg_dump -Fc` + `storage/uploads` → snapshot
  Restic remoto (S3-compatible). Hard guard: aborta se `RESTIC_REPOSITORY` não começar
  com `s3:`. Suporta `--help` e `--dry-run` (gera dump mas não envia). Tags
  `clinicbridge`/`offsite`/`ts:<TS>`. Nunca imprime senha/credenciais.
- `scripts/restore-offsite-restic.sh` — restore drill em banco SEPARADO
  (`clinicbridge_restore_offsite_test`). Dois hard guards: aborta se `RESTORE_DB ==
  POSTGRES_DB` e se `RESTIC_REPOSITORY` não começar com `s3:`. Compara counts de
  `patients`/`import_files`/`import_sessions` lado a lado.
- `docs/backup-offsite-runbook.md` — 11 seções (status, pré-requisitos, IAM mínimo com
  JSON policy de exemplo, secrets via SSM, fluxo, variáveis, procedimentos, política
  de retenção `forget+prune` **documentada não auto-executada**, agendamento futuro,
  segurança, troubleshooting, checklist).

**Mudanças em arquivos existentes:**
- `.env.example` — bloco Sprint 3.40 documentando `RESTIC_REPOSITORY` (s3:), `AWS_*`,
  `RESTIC_CACHE_DIR`, `RESTORE_DB` offsite default. Mensagem clara de que valores reais
  vêm do SSM/IAM role, nunca do `.env`.
- `CLAUDE.md` — pointer Sprint 3.40 + entrada na lista de docs.
- `docs/backup-restore-strategy.md` — estado atual atualizado (offsite scripts ✅,
  bucket real pendente).
- `docs/security-notes.md` — seção backup atualizada com hard guards e runbook offsite.
- `docs/secrets-env-production-runbook.md` — referência cruzada ao runbook offsite e
  ao IAM mínimo do bucket de backup.
- `docs/production-minimum-plan.md` — Sprint 3.40 marcada ✅; §2.7 atualizado.
- `docs/deploy-security-checklist.md` — §11 atualizado.
- `docs/testing-checklist.md` — novo bloco "Backup offsite (Sprint 3.40)" com smoke
  tests seguros (sem AWS).
- `docs/sprint-history.md` — entrada Sprint 3.40.
- `docs/roadmap-next-phase.md` — Sprint 3.40 marcada ✅.

**Decisões de design registradas:**
1. **Hard guard `s3:`** em ambos backup e restore — protege contra rodar offsite por
   engano contra um repo local.
2. **Hard guard `RESTORE_DB != POSTGRES_DB`** — protege o banco principal (espelha o
   script local da Sprint 3.5).
3. **`RESTORE_DB` default `clinicbridge_restore_offsite_test`** — nome distinto do
   drill local (`clinicbridge_restore_test`) permite ambos coexistirem.
4. **Retenção `forget --prune` documentada, NÃO auto-executada** — limpeza destrutiva
   exige restore drill recente + revisão jurídica (ADR 0002).
5. **AWS creds aceitas via env OU IAM role** — preferência por IAM role em EC2/ECS;
   scripts não exigem env vars AWS, deixam o Restic usar o default credential chain.
6. **Sem mudança no script local existente** — `backup-local-restic.sh` continua
   bloqueando offsite; ambos fluxos são paralelos e independentes.

**Validações executadas (sem AWS real):**
- `bash -n scripts/{check,backup,restore}-*-offsite-restic.sh` — sintaxe ok.
- `--help` em cada script retorna 0 e imprime ajuda sem executar nada.
- Backup com `RESTIC_REPOSITORY` ausente → exit 1 com mensagem clara.
- Backup com `RESTIC_REPOSITORY=backups/foo` (local) → exit 1 `[ABORTAR]`.
- Restore com `RESTORE_DB=POSTGRES_DB` → exit 1 `[ABORTAR]`.
- `git status` — nenhum dump/repo/segredo staged; só docs/scripts/.env.example.
- `git check-ignore` confirma proteção para `backups/work/*`, `backups/restore-offsite-work/*`.

**Pendente (depende de provisionamento AWS, Sprint 3.41+):**
- Bucket S3 real (`clinicbridge-backups-staging` e `-prod`) com versionamento, SSE,
  block public access.
- IAM role/instance profile com a policy mínima documentada (§2.3 do runbook).
- `RESTIC_PASSWORD` gravada no SSM (`/clinicbridge/<env>/restic_password`).
- Execução real de `check --probe` → `backup` → `restore` drill em staging — **gate
  go/no-go** para produção.
- Agendamento (systemd-timer ou ECS scheduled task) — sprint futura.
- Alertas de falha (CloudWatch) — sprint futura.

---

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
