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
> - **Convênios v0.1 (Fase 4.7):** ADR `docs/adr/0016-insurance-billing-v0.md` · operacional `docs/insurance-billing-v0-scope.md` · pré-planejamento `docs/insurance-billing-future-scope.md`
> - **Estoque v0.1 (Fase 4.8):** ADR `docs/adr/0017-inventory-v0.md` · operacional `docs/inventory-v0-scope.md`
> - **Plano de Piloto Controlado:** `docs/pilot-controlled-plan.md` · checklist `docs/pilot-go-no-go-checklist.md`
> - **Documentos Médicos v0.1:** ADR `docs/adr/0011-medical-documents-prescriptions-v0.md` · `docs/medical-documents-v0-scope.md`
> - **Prontuário v0.1:** ADR `docs/adr/0010-clinical-encounters-medical-record-v0.md` · `docs/clinical-encounters-v0-scope.md`
> - **Arquitetura clínica + roles + audit:** ADR `docs/adr/0009-clinical-architecture-roles-read-audit.md` · `docs/clinical-architecture-and-permissions.md`
> - **Outros ADRs (0001–0009):** `docs/adr/`
> - **Runbooks (backup/DNS/TLS/Nginx/secrets/AWS):** `docs/backup-restore-local-runbook.md`, `docs/backup-offsite-runbook.md`, `docs/dns-tls-staging-runbook.md`, `docs/secrets-env-production-runbook.md`, `docs/aws-provisioning-runbook-3.41B.md`
> - **Planos de prod/infra AWS:** `docs/production-minimum-plan.md`, `docs/aws-infra-sprint-3.41-plan.md`

## Estado atual (atualizado 2026-05-27)

**Sprint atual: 5.0A** (entregue) — **Plano de Piloto Controlado (docs-only).**
Criados `docs/pilot-controlled-plan.md` e `docs/pilot-go-no-go-checklist.md`.
Plano cobre: fases 1/2/3, personas do piloto (médico, psicóloga, secretária, futuro odontologia),
módulos incluídos/excluídos, fluxos de teste, critérios go/no-go, regras LGPD para dados sintéticos,
roteiro de 28 min, backlog pós-piloto. Veredicto: ✅ GO para Fase 1 com dados sintéticos.
Zero código, zero migration, zero backend/frontend.
`git diff --check` rc=0 ✅.

**Sprint anterior: 4.9C.2** (entregue) — **Microcorreção landing.**
Header CTA "Ver demonstração" → "Criar conta" (Link to="/register"). PricingPlans items atualizados
conforme spec (Essencial 4 itens, Profissional 5, Piloto assistido CTA "Começar piloto assistido").
Demo guiada registrada como backlog futuro. DashboardMockup (ainda mostra migração) → backlog de redesign.
Backend intocado. Zero migration.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.9C.1** (entregue) — **Ajuste de copy + seção de planos.**
Copy simplificada para linguagem humana (clínica pequena / consultório): Hero ("Organize sua clínica em um só lugar"),
HowItWorks (4 passos simples), Roadmap (sem TISS/ICP-Brasil), Security (sem CIAA/STRIDE/jurídico),
FinalCTA e Footer. CTA "Ver demonstração" removido; CTAs primários são "Criar conta" e "Preparar arquivo de teste".
Nova seção de planos estática (PricingPlans.tsx): Essencial · Profissional · Piloto assistido — sem preço, sem
checkout, sem backend. Header nav: "Roadmap" → "Funcionalidades" + "Planos". Validation removida do fluxo da landing
(coberta pelos CTAs e PricingPlans). Backend, schema, permissões intocados.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.9C** (entregue) — **UX polish / landing / demo prep.**
Copy da landing page atualizada para refletir Clinic OS modular (Hero, HowItWorks, Roadmap, FinalCTA,
Footer, Security, Validation). AuthAside atualizada (prontuário v0.1 com restrições, não mais "não é prontuário").
Dashboard: card Início menciona todos os módulos; "Checklist do MVP" → "Módulos disponíveis" com 3 linhas ✅;
subtítulo Segurança atualizado. Backend intocado. Zero migration.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.9B** (entregue) — **Fix cache TanStack Query.**
Removido `token` de todas as queryKeys (FinancialPanel × 6, ReportsPanel × 4, AdministrativeSchedulePanel × 1).
Objeto `filters` mutável substituído por primitivos escalares em `listQuery` (FinancialPanel).
Comentário incorreto sobre `token` no ReportsPanel corrigido. Backend, schema, regras de negócio e UX intocados.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.9A** (entregue) — **Super Revisão Geral (todos os módulos 4.4–4.8).**
7 agents especializados; nenhum P0. 2 P1 de copy corrigidos (InsurancePanel copy + card restrito);
hint "oportunidade de retorno" removido do ReportsPanel. 2 P1 de cache TanStack Query (token em
queryKeys, objeto mutable em queryKey) identificados e entregues na 4.9B.
Prontidão para piloto controlado com dados sintéticos: ✅ liberado.
Relatório: `docs/super-review-4-9A.md`.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ ·
`migrate:status` 18/0 ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.8D** (entregue) — **QA/Hardening Estoque v0.1. Fase 4.8 completa.**
Revisão UX/estado InventoryPanel, verificações segurança/LGPD (0 violations), sanity smoke live
(8/8 PASS: owner 200 · profissional 403 · anônimo 401 · CRUD · movimento · soft-delete),
docs atualizados. Zero código novo, zero migration.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ ·
`migrate:status` 18/0 ✅ · `git diff --check` rc=0 ✅.
**Caveats:** `low_stock` usa `<` (item exatamente no mínimo não dispara); hero usa `limit=100`.

**Sprint anterior: 4.8C** (entregue) — **Frontend Estoque v0.1.**
Aba "Estoque" no Dashboard (`InventoryPanel`): hero (Itens ativos · Estoque baixo);
filtros (busca por nome · categoria · status ativos/inativos/todos · "Apenas estoque baixo");
lista de itens com badge "Estoque baixo" (usa `item.low_stock` do backend) e badge Inativo;
criar/editar/desativar item (owner-only); registrar movimento (owner + secretaria) com
seletor de tipo (Entrada/Saída/Ajuste/Perda·descarte), modelo magnitude+direção (usuário
nunca digita sinal; Ajuste tem toggle Aumentar/Reduzir), pré-visualização "Estoque atual →
Após o movimento" e **bloqueio visual** quando ficaria negativo; histórico de movimentos por item.
Card "Acesso restrito" para 403 (profissional_clinico). `current_quantity` **nunca** editável
direto na UI — só muda por movimento. 8 funções API + tipos `InventoryItem`, `InventoryMovement`,
`InventoryMovementType`, payloads/params em `api.ts`. Sem console.log de payload; sem
localStorage/sessionStorage; sem PII/`reason`/`notes` em URL; sem `dangerouslySetInnerHTML`.
Zero backend, zero migration.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.8B** (entregue) — **Backend Estoque v0.1.**
Migration `20260607000000_inventory_v0` (batch 18): tabelas `inventory_items` +
`inventory_movements`. 9 endpoints: `GET|POST /inventory/items`,
`GET|PATCH /inventory/items/:id`, `PATCH /inventory/items/:id/status`,
`GET|POST /inventory/items/:id/movements`, `GET /inventory/movements`.
DAO + service (`buildInventoryActor` carrega grants de `user_clinical_roles` para bloquear
`profissional_clinico`) + controller + routes (`patientsRateLimit + requireAuth + requireClinic
+ requireRole(['dono_clinica','secretaria'])`). Permissões: owner CRUD+movimentos;
secretaria movimentos+leitura; profissional_clinico bloqueado no service; admin_sistema 403.
`current_quantity` atualizado **somente** via transação com `SELECT FOR UPDATE`.
Audit metadata-only: `item_id` + `movement_type` + `quantity_delta`; `reason`/`notes`/`name`
nunca no audit. Logger redige `reason`. `created_by_user_id` nullable (ON DELETE SET NULL).
Smoke **51/51 PASS**. `pnpm --filter backend typecheck` ✅ · build ✅ · `migrate:status` 18/0 ✅ ·
`pnpm --filter frontend typecheck` ✅ · `git diff --check` rc=0 ✅.

**Sprint anterior: 4.8A** (entregue) — **ADR 0017 Estoque v0.1 (docs/ADR-only).**
ADR 0017 + `docs/inventory-v0-scope.md` criados. Entidades `inventory_items` + `inventory_movements`.
Permissões: owner CRUD; secretaria movimentos+leitura; profissional_clinico bloqueado.
`git diff --check` rc=0 ✅. **Zero código, schema, migration ou env.**

**Sprint anterior: 4.7D** (entregue) — **QA/Hardening + UX Polish Convênios v0.1.**
Subtabs internas no `InsurancePanel`: "Carteirinhas dos pacientes" (default) · "Convênios aceitos"
(operadoras + planos) · "Preços de referência". `canWrite={true}` hardcode corrigido →
`canWrite={isOwner || papel === 'secretaria'}`. `holder_name` removido da view de lista (ficava
exposto como PII — agora só no formulário de edição). `PayerBadge` adicionado na lista e detalhe
de cobranças (Particular / Convênio / Misto). `MarkPaidModal` recebe `payer_type`,
`copay_amount_cents`, `insurance_amount_cents`; título e nota contextual mudam por tipo
(convênio → "Registrar recebimento do convênio" + aviso; misto → breakdown + aviso v0.1);
`defaultMethod = bank_transfer` para convênio. Bug corrigido: trocar paciente no `NewChargeForm`
agora limpa `patientInsuranceId`. Footer do Dashboard atualizado:
"ClinicBridge · Clinic OS" · "Gestão clínica e administrativa para consultórios."
`pnpm --filter frontend typecheck` ✅ · build ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.7C** (entregue) — **Frontend Convênios v0.1.**
Aba "Convênios" completa no Dashboard (`InsurancePanel`): operadoras, planos,
preços por serviço × operadora, carteirinhas de paciente. Integração de `payer_type`
(`Particular` / `Convênio` / `Particular + convênio`) em `FinancialPanel` → `NewChargeForm`
+ `EditChargeForm`. Seletor de carteirinha ativa do paciente aparece quando
`payer_type=insurance|mixed`. Campos copay/insurance aparecem quando `mixed`; validação
visual `copay + insurance = amount_cents`. `reference_price_cents` exibido como referência
visual — **nunca** auto-popula `amount_cents`.
**PII na UI:** `member_number_masked` na lista; raw (`member_number`) carregado lazily via
`getPatientInsurance` **apenas** ao abrir edição (`enabled: editing && !!token`); limpo
imediatamente em `cancelEdit()`. Sem PII em `console.log`/`localStorage`/URL.
Card "Acesso restrito" para profissional_clinico (403 tratado sem derruba de tela).
Owner-only para writes de operadoras/planos/preços; owner+secretaria para carteirinhas.
20 funções API + tipos `InsuranceProvider`, `InsurancePlan`, `PatientInsuranceListItem`,
`PatientInsurance`, `ServiceInsurancePrice`, `FinancialPayerType` adicionados a `api.ts`.
`pnpm --filter frontend typecheck` ✅ · build ✅ · `pnpm --filter backend typecheck` ✅ ·
`git diff --check` rc=0.

**Sprint anterior: 4.7B** (entregue) — **Backend Convênios v0.1.**
Migration única aditiva `20260606_insurance_billing_v0`: 4 tabelas novas
(`insurance_providers`, `insurance_plans`, `patient_insurances`, `service_insurance_prices`)
+ extensão de `financial_charges` com 5 colunas nullable (`payer_type`,
`insurance_provider_id`, `patient_insurance_id`, `copay_amount_cents`,
`insurance_amount_cents`). 4 DAOs + 1 service único + 17 endpoints.
**Smoke 47/47 PASS.**
`pnpm --filter backend typecheck` ✅ · build ✅ · `migrate:status` 17/0 ✅ · `git diff --check` rc=0.

**Sprint anterior: 4.7A** (entregue) — **ADR 0016 Convênios v0.1 (docs/ADR-only).**
ADR 0016 + `docs/insurance-billing-v0-scope.md` criados. Convênios v0.1 = camada
administrativa/comercial manual. Permissões: operadoras/regras = owner-only;
`patient_insurances` = owner + secretaria; profissional_clinico bloqueado.
`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

**Sprint anterior: 4.6D** (entregue) — **QA/Hardening Catálogo de Serviços v0.1.**
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

**Endpoints de Estoque registrados (Sprint 4.8B):**
`GET /inventory/items` · `POST /inventory/items` · `GET /inventory/items/:id` ·
`PATCH /inventory/items/:id` · `PATCH /inventory/items/:id/status` ·
`GET /inventory/items/:id/movements` · `POST /inventory/items/:id/movements` ·
`GET /inventory/movements`.

**Endpoints de Convênios registrados (Sprint 4.7B):**
`GET /insurance/providers` · `POST /insurance/providers` · `GET /insurance/providers/:id` ·
`PATCH /insurance/providers/:id` · `PATCH /insurance/providers/:id/status` ·
`GET /insurance/plans` (filtros: `provider_id`) · `POST /insurance/plans` ·
`GET /insurance/plans/:id` · `PATCH /insurance/plans/:id` · `PATCH /insurance/plans/:id/status` ·
`GET /insurance/service-prices` (filtros: `service_id`/`provider_id`/`plan_id`) ·
`POST /insurance/service-prices` · `GET /insurance/service-prices/:id` ·
`PATCH /insurance/service-prices/:id` · `PATCH /insurance/service-prices/:id/status` ·
`GET /patients/:patient_id/insurances` · `POST /patients/:patient_id/insurances` ·
`GET /patients/:patient_id/insurances/:id` · `PATCH /patients/:patient_id/insurances/:id` ·
`PATCH /patients/:patient_id/insurances/:id/status`. Extensão `financial_charges`:
`payer_type` (`private`|`insurance`|`mixed`|`null`), `insurance_provider_id`,
`patient_insurance_id`, `copay_amount_cents`, `insurance_amount_cents` (todos nullable,
retrocompat com cobranças existentes).

**Sprints anteriores recentes (detalhes em `docs/sprint-history.md`):**
- **5.0A** ✅ Plano de Piloto Controlado (docs-only) · `pilot-controlled-plan.md` · `pilot-go-no-go-checklist.md` · GO Fase 1
- **4.9C.2** ✅ Header CTA → "Criar conta" · PricingPlans items corrigidos · demo = backlog
- **4.9C.1** ✅ Copy simplificada + PricingPlans estático
- **4.9C** ✅ UX polish / landing / demo prep — copy landing atualizada · AuthAside · Dashboard início/segurança · backend intocado
- **4.9B** ✅ Fix cache TanStack Query — `token` removido de 11 queryKeys · `filters` object substituído por primitivos · backend intocado
- **4.9A** ✅ Super Revisão Geral — 7 agents · 0 P0 · 2 P1 copy corrigidos · 2 P1 cache TanStack entregues em 4.9B · piloto liberado · `docs/super-review-4-9A.md`
- **4.8D** ✅ QA/Hardening Estoque — revisão UX · greps segurança 0-violations · sanity smoke 8/8 · docs · **Fase 4.8 completa**
- **4.8C** ✅ Frontend Estoque v0.1 — aba "Estoque" + `InventoryPanel` (hero, filtros, low-stock, CRUD owner, movimentos, histórico) — typecheck/build ✅
- **4.8B** ✅ Backend Estoque v0.1 — migration 18 + DAO + service + controller + 9 endpoints — smoke 51/51 PASS
- **4.8A** ✅ ADR 0017 Estoque v0.1 (docs-only) — 2 entidades, permissões, invariantes, gate 4.8B aberto
- **4.7D** ✅ QA/Hardening Convênios — subtabs UX · PayerBadge · MarkPaid payer-aware · canWrite fix · holder_name PII fix · bug paciente
- **4.7C** ✅ Frontend Convênios v0.1 — `InsurancePanel` + payer_type no Financeiro — typecheck/build ✅
- **4.7B** ✅ Backend Convênios v0.1 — migration 17 + 4 DAOs + insuranceService + 17 endpoints — smoke 47/47 PASS
- **4.7A** ✅ ADR 0016 Convênios v0.1 (docs-only) — 4 entidades, permissões, LGPD, gate 4.7B aberto
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
4.0–4.5D ✅ · 4.6A–D ✅ · 4.7A–D ✅ (Convênios v0.1 completo) · 4.8A–D ✅ (Estoque v0.1 completo) · 4.9A–C ✅ (Super Revisão + Cache Fix + UX Polish) · 5.0A ✅ (Plano de Piloto) →
**Próxima fase TBD** (ADR própria necessária antes de qualquer código). **Próxima sprint: 5.0B** (Demo Dataset / seed sintético).
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
`service_not_available_for_professional` e `service_mismatch_with_appointment`);
estoque v0.1 backend + frontend (inventory_items + inventory_movements; 9 endpoints; owner CRUD + sec movimentos;
profissional_clinico bloqueado via grants + card "Acesso restrito" na UI; current_quantity em transação
SELECT FOR UPDATE e NUNCA editável direto na UI; audit metadata-only; append-only; aba "Estoque" no
Dashboard com hero/filtros/low-stock badge; movimento magnitude+direção com preview e bloqueio de estoque
negativo; histórico por item; notes/reason nunca em console/localStorage/URL);
convênios v0.1 backend + frontend (insurance_providers, insurance_plans, patient_insurances,
service_insurance_prices; extensão de financial_charges com payer_type/insurance_provider_id/
patient_insurance_id/copay_amount_cents/insurance_amount_cents; CRUD owner-only para
providers/plans/service_prices, owner+secretaria para patient_insurances; profissional_clinico
bloqueado no service + card "Acesso restrito" na UI; PII member_number mascarado em list/UI,
raw apenas no edit mode lazy-fetched + limpo no cancelamento; holder_name + member_number na
redação do logger; reference_price_cents NUNCA auto-propaga amount_cents; aba "Convênios"
no Dashboard; campo payer_type + seletor de carteirinha + copay/insurance fields no FinancialPanel;
campos legados patients.convenio/numero_carteirinha intactos).
Detalhe: `docs/project-state.md`.

**O que NÃO existe (sprint explícita):** export de relatórios
(futuro com ADR própria); gráficos complexos / BI customizável; migração automática de
patients.convenio→patient_insurances (decisão deferida); import CSV de estoque; baixa automática de estoque
por atendimento; delete físico de paciente;
undo completo de merge; limpeza real de arquivos; gateway de pagamento; ICP-Brasil; telemedicina;
NFS-e; TISS/TUSS real.

**Migrações (18 aplicadas):** `20260520_init` · `20260521_audit_logs` · `20260522_import_files` ·
`20260523_import_sessions` · `20260524_patients` · `20260525_import_sessions_summary` ·
`20260526_scheduling` · `20260527_user_mfa` · `20260528_user_mfa_backup_codes` ·
`20260529_clinic_team` · `20260530_clinic_join_requests_revoked` · `20260601_patients_merged_into` ·
`20260602_clinical_encounters_v0` · `20260603_clinical_documents_v0` · `20260604_financial_charges_v0` ·
`20260605_clinic_services_v0` · `20260606_insurance_billing_v0` · `20260607_inventory_v0`.

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

- **Próxima fase Clinic OS:** TBD — exige ADR própria antes de qualquer código
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
