# Super Revisão Geral — Sprint 6.0I (Pré-Piloto)

**Data:** 2026-05-29
**Sprint:** 6.0I — Super Revisão Geral Pré-Piloto (read-only / diagnóstico)
**Escopo:** Produto inteiro até 6.0H/5.1F — Agenda, Pacientes, Prontuário, Documentos, Financeiro, Relatórios, Serviços, Convênios, Estoque, Assinatura/Billing sandbox, Auri/Demo Aurora, onboarding, Equipe/Roles/Grants.
**Natureza:** **Diagnóstico apenas.** Nenhum arquivo de produto foi alterado. Nenhuma migration. Nenhuma mudança em auth/tenant/permissões. Sem commit.

---

## Resumo Executivo

Revisão de 7 dimensões por agents especializados (UX/mobile, RBAC, tenant/segurança, LGPD, arquitetura frontend, arquitetura backend, produto/pré-piloto). **Nenhum P0 encontrado.** O núcleo do produto está sólido: tenant isolation consistente por `clinica_id` em todos os DAOs, sem `listAll`, sem delete físico em entidades sensíveis, CAS (`status='pending'`) confirmado em transições financeiras, CPF sempre mascarado, read-audit clínico STRICT disparando antes de servir conteúdo nos caminhos principais, e o billing/Asaas sandbox cleanly isolado (env-gated, default-deny, sem PII clínica, sem payload bruto salvo/logado).

Foram identificados **5 P1**, **~10 P2** e alguns P3/baixo. Os P1 se concentram em três frentes:
1. **LGPD/dados sensíveis** — `holder_name` de convênio sai **sem máscara** na listagem; painel de auditoria clínica **não rotula** eventos de documento (lacuna de transparência Art. 18).
2. **Consistência RBAC ↔ UI** — `GET /clinic-professionals` sem `requireRole`; botão "Prontuário" exibido para todos os papéis (gate só no backend → parece "quebrado" p/ secretaria).
3. **Produto/onboarding p/ consultório solo** — o "problema das 3 listas" (Equipe × Profissional da agenda × Acesso ao prontuário) e o dono que não é auto-cadastrado como profissional travam o primeiro uso.

**Veredicto:** ✅ **Piloto controlado Fase 1 com dados sintéticos pode prosseguir.** Recomenda-se uma sprint pequena de polish (6.0J) com os P1 baratos de LGPD/RBAC/UX **antes de inserir qualquer dado real**. Nada aqui muda o bloqueio de cobrança real (CNPJ + ADR 5.2A) nem de produção AWS (ADR 5.2A).

---

## Checks Iniciais

| Check | Resultado |
|-------|-----------|
| `frontend typecheck` | ✅ rc=0 |
| `backend typecheck` | ✅ rc=0 |
| `migrate:status` | ✅ 19/0 (Pending: []) |
| `git diff --check` | ✅ rc=0 |
| `git status --short` | ✅ Árvore limpa |

---

## Mapa de Módulos Revisados

| Módulo | Backend | Frontend | Severidade encontrada |
|--------|---------|----------|------------------------|
| Auth / MFA / sessão | authService, requireAuth, tokenService | AuthProvider, Login/Register | Limpo |
| Pacientes / Merge / Export | patientService, patientMergeService, patientExportService, patientDao | PatientsList, PatientEditForm | P2 (merge expõe ids), P1 (botão prontuário p/ todos) |
| Agenda | appointmentService, appointmentDao | AdministrativeSchedulePanel | P1 (querykey obj), P1 (preço serviço não preenche cobrança) |
| Prontuário | clinicalEncounterService, clinicalEncounterNoteService | ClinicalPatientPane | P2 (audit fora da tx — aceito) |
| Documentos | clinicalDocumentService, clinicalDocumentPdfService | ClinicalDocumentsPanel | P2 (draft sem read-audit) |
| Financeiro | financialChargeService, financialChargeDao | FinancialPanel | P2 (picker stale), CAS ✅ confirmado |
| Relatórios | reportsService, reportsDao | ReportsPanel | P2 (TOCTOU prof filter — só dado stale) |
| Serviços | clinicServiceService | ServicesPanel | P1 (querykey obj), nota (sem Auri tour) |
| Convênios | insuranceService (1394 LOC) | InsurancePanel | **P1 (holder_name sem máscara)**, P2 (split) |
| Estoque | inventoryService | InventoryPanel | Limpo (audit dentro da tx ✅) |
| Auditoria clínica (LGPD) | clinicalReadAuditService, clinicalReadAuditDao | ClinicalReadAuditPanel | **P1 (rótulos de documento ausentes)**, P2 (join sem tenant no alvo) |
| Equipe / Roles / Grants | clinicMemberService, clinicProfessionalService, userClinicalRoleService | TeamManagementPanel, ClinicProfessionalsPanel, ClinicalRolesPanel, RolePermissionsGuide | **P1 (GET /clinic-professionals sem requireRole)**, P1 (3 listas), P2 (guia "Supervisor") |
| Billing / Asaas sandbox | billingService, billingWebhookService, billingAsaasProvider, billingEventDao | SubscriptionPanel | P1 (markStatus sem clinica_id — sem exploit hoje), P1 (provisionSubscription sem tx), P2 (recordIfNew+markStatus sem tx) |
| Onboarding / Demo / Auri | demo-login env-gated | SetupChecklist, GuidedDemoTour, DemoMascot, DemoPage | P1 (ordem do checklist / solo) |
| Arquitetura geral | MVC+DAO+Service ✅ | api.ts 2694 LOC, sem error boundaries | P2 (splits), P1 (error boundaries) |

---

## Agents Executados

| Agent | Foco | Resultado |
|-------|------|-----------|
| **UX Compactação + Mobile** | Dashboard + todos os painéis + CSS | 0 P0, ~3 P1 (copy/padrão), 3 P2. Layout mobile sólido (sem overflow-breakers) |
| **Permissões / RBAC / Grants** | middlewares, routes, services, RolePermissionsGuide | 0 P0, 1 P1 (`GET /clinic-professionals`), 3 P2 |
| **Tenant Isolation + Segurança** | 29 DAOs, logger, errorHandler, edge | 0 P0, 1 P1 (`billingEventDao.markStatus`), 2 P2, 2 baixo |
| **LGPD + Dados Sensíveis** | insurance, clínico, billing, audit, copy | 0 P0, 2 P1 (`holder_name`, rótulos audit), 3 P2 |
| **Arquitetura Frontend** | api.ts, painéis grandes, TanStack Query | 0 P0, 2 P1 (querykey obj, error boundaries), 4 P2, 1 bug de label |
| **Arquitetura Backend** | services grandes, transações, audit, billing | 0 P0, 2 P1 (tx provisionSubscription; CAS markPaid ✅ confirmado), 3 P2, 3 P3 |
| **Produto / Pré-Piloto** | jornada ponta-a-ponta consultório solo | 0 P0, 5 P1 (onboarding/3-listas/preço/prontuário), 5 P2 |

---

## Achados por Severidade

### P0 — Bloqueador

**Nenhum.** Verificação adicional: `financialChargeDao.markPaid` (`backend/src/dao/financialChargeDao.ts:210`) usa `.where({ id, clinica_id, status: 'pending' })` — CAS com tenant + status confirmado. Não é P0.

---

### P1 — Corrigir antes de inserir dados reais / antes do piloto

#### [P1-LGPD-1] `holder_name` de convênio retornado **sem máscara** na listagem — `backend/src/services/insuranceService.ts:452-487`
`member_number` é mascarado (`member_number_masked`), mas `holder_name` (nome completo do titular = PII) sai **bruto** em `PublicPatientInsuranceListItem` em toda chamada de lista, não só no detalhe. O cabeçalho do arquivo já declara `holder_name` como PII.
**Proposta:** mascarar na listagem (ex.: iniciais / `holder_name_masked`) ou omitir do item de lista e servir só no detalhe. Fix barato.

#### [P1-LGPD-2] Painel de auditoria clínica não rotula eventos de documento — `frontend/src/components/ClinicalReadAuditPanel.tsx:14-34`
`ACAO_LABELS`/`ACAO_OPTIONS` não incluem `clinical.document.list`, `clinical.document.read`, `clinical.document.pdf.downloaded` (que o backend emite). Esses eventos aparecem **sem rótulo** (em branco) na trilha de auditoria → lacuna de transparência LGPD Art. 18: download de PDF e leitura de documento ficam invisíveis ao dono.
**Proposta:** adicionar os 3 rótulos + opções de filtro. Fix barato, frontend-only estático.

#### [P1-RBAC-1] `GET /clinic-professionals` sem `requireRole` — `backend/src/routes/clinicProfessionals.ts:19`
Só compõe `requireAuth + requireClinic`. Qualquer membro ativo — inclusive `secretaria` com grant `profissional_clinico` (que é bloqueado em todos os outros módulos) — pode enumerar profissionais (nomes, rótulos, ativo/inativo). Escritas já são owner-only. Não vaza dado de paciente, mas é inconsistente com o padrão dos outros list endpoints (insurance/inventory usam `requireRole(['dono_clinica','secretaria'])`) e com o próprio comentário da rota.
**Proposta:** adicionar `requireRole(['dono_clinica','secretaria'])` ao GET. Fix de 1 linha. **Toca autorização → exige aprovação antes de aplicar.**

#### [P1-UI/BACKEND-1] Botão "Prontuário" exibido a todos os papéis, gate só no backend — `frontend/src/components/PatientsList.tsx:716-725` + `ClinicalPatientPane.tsx`
Todo card de paciente mostra "Prontuário" independente do papel. Uma secretaria pura clica e recebe 403/painel vazio (backend decide). Em piloto isso lê como "quebrado/proibido", não "não é sua área".
**Proposta:** esconder o botão quando o usuário não tem acesso clínico, **ou** renderizar estado explícito "Área clínica — você não tem acesso". (Esconder no frontend não substitui o gate do backend, que permanece.)

#### [P1-PROD-1] Onboarding do consultório solo trava nas "3 listas" — `SetupChecklist.tsx`, `Dashboard.tsx` (aba equipe), `ClinicProfessionalsPanel.tsx`, `AdministrativeSchedulePanel.tsx`
Três problemas acoplados que, juntos, são a maior fricção do primeiro uso:
- **Ordem do checklist ≠ cadeia real de dependência:** "Profissionais" do checklist aponta p/ `equipe`, que mostra primeiro a parede de convite/membros; o que o solo precisa (`ClinicProfessionalsPanel`) é a 3ª seção.
- **Caso solo não modelado:** o dono **é** o profissional, mas nada o auto-cadastra como "Profissional da agenda" no signup → dropdown da Agenda vem vazio ("Sem profissional"); ele tem que re-digitar o próprio nome.
- **Problema das 3 listas sub-explicado:** Equipe (login) × Profissional da agenda × Acesso ao prontuário são 3 cadastros separados da mesma pessoa; o `RolePermissionsGuide` explica mas vem **fechado por padrão** e só o dono vê.
**Proposta (incremental, sem ADR):** (a) abrir o guia por padrão na 1ª visita; (b) helper inline "Mesma pessoa? Cadastre nos 3 lugares"; (c) nudge "Adicione você mesmo como profissional" na Agenda vazia / no checklist; (d) reordenar/reapontar os itens do checklist. Unificação real das 3 listas = backlog com ADR própria (NÃO agora).

#### [P1-PROD-2] Preço do serviço não flui para a cobrança — `AdministrativeSchedulePanel.tsx:243-245,481-496`
Serviços têm "Preço de tabela", mas o form inline "Criar cobrança" na agenda fixa `description='Consulta'` e valor em branco. O catálogo parece decorativo para o financeiro.
**Proposta:** pré-preencher (não-autoritativo, editável) `description = nome do serviço` e `amount = preço de tabela`. **Manter cosmético/editável** para não violar invariantes (billing não lê PII/clínico).

#### [P1-FE-1] Sem Error Boundaries em nenhum ponto da árvore — `frontend/src/` (global)
`grep` não achou nenhum `ErrorBoundary`. Um throw em `FinancialPanel`/`InsurancePanel`/`ClinicalPatientPane` derruba o `Dashboard` inteiro (tela branca), inclusive painéis adjacentes com dado clínico/financeiro.
**Proposta:** um `PanelErrorBoundary` (~20 linhas) envolvendo os 6 painéis grandes no `Dashboard.tsx`. Sem mexer nos painéis.

#### [P1-FE-2] Objeto literal em queryKey — `AdministrativeSchedulePanel.tsx:301`, `ServicesPanel.tsx:500`
Objeto inline na queryKey cria nova referência a cada render. Funciona no TanStack v5 (comparação estrutural) mas é frágil e destoa do padrão escalar usado no resto do app.
**Proposta:** achatar em valores escalares na key. Fix de 2 linhas cada. (Mesma classe do P1-ARCH da 4.9A.)

#### [P1-BILL-1] `billingEventDao.markStatus` faz UPDATE só por `id`, sem `clinica_id` — `backend/src/dao/billingEventDao.ts:61-72`
Único método mutável do arquivo sem `clinica_id` no WHERE. **Sem exploit hoje** (o `id` vem do próprio `recordIfNew` na mesma request), mas qualquer caller futuro com UUID cross-tenant sobrescreveria o status de outro tenant.
**Proposta:** adicionar `clinica_id` ao WHERE (tratar caso `null` de eventos não-mapeados). Fix antes de ativar a mutação real de assinatura (sprint futura). **Toca billing/tenant → aprovação antes de aplicar.**

#### [P1-BILL-2] `provisionSubscription` sem transação no binding de provider — `backend/src/services/billingService.ts:231-255`
Cria `clinic_subscriptions`, chama API externa, então grava `billing_provider_customers` + `billing_provider_subscriptions`. Falha após a 1ª gravação deixa estado parcial; o 409 "subscription_exists" no retry bloqueia. Caminho dev/admin-only hoje.
**Proposta:** envolver as **duas** gravações de DAO (não a chamada externa) em `db.transaction`. Hardening antes de wirar checkout real.

---

### P2 — Melhoria recomendada (pode esperar)

- **[P2-LGPD-1] Documento draft retornado sem read-audit** — `clinicalDocumentService.ts:493 (create), 644-731 (updateDraft)`. `findById` audita antes de servir; `create`/`updateDraft` retornam `body` sem audit. Risco baixo (draft, só autor). Resolver como exceção explícita no ADR 0011 ou emitir audit. 
- **[P2-LGPD-2] Merge expõe `archived_secondary_ids` na resposta** — `patientMergeService.ts:222-229`. Não é PII direta, mas permite enumeração de ids; só vira risco se o frontend logar. 
- **[P2-LGPD-3] `payload_hash` (sha256 do corpo do webhook) salvo em `billing_events`** — `billingWebhookService.ts:130-138`. Aceitável p/ dados comerciais sintéticos; rastrear antes de produção. 
- **[P2-SEC-1] `clinicalReadAuditDao.list` LEFT JOIN em `patients` sem `clinica_id` no alvo do join** — `clinicalReadAuditDao.ts:141-144`. Gate em `cra.clinica_id` já isola; defensivamente adicionar `andOn('p.clinica_id','cra.clinica_id')`. 
- **[P2-SEC-2] `reportsDao.agendaFinancialCounters` — TOCTOU no filtro de profissional** — `reportsDao.ts:369-405`. Parametrizado (sem injection); janela entre `professionalExistsInClinic` e o agregado só retorna dado stale, sem leak cross-tenant. 
- **[P2-RBAC-1] Guia "Supervisor" sugere acesso a relatórios standalone** — `RolePermissionsGuide.tsx:63`. `gestor_clinica` acessa relatórios porque o login é `secretaria`, não pelo grant em si; a redação pode confundir no onboarding. 
- **[P2-RBAC-2] Divergência das 3 listas na desativação** — desativar membro (`clinic_members`) não desativa o `clinic_professionals` correspondente → profissional desativado continua no dropdown da agenda; grants `user_clinical_roles` não são revogados (hoje barrados por `requireClinic`, mas hygiene pendente). 
- **[P2-FE-1] `api.ts` monolítico (2694 LOC)** — split seguro em `api.ts` + `api.types.ts` via `export type *` (zero mudança de runtime, callers não mudam import). 
- **[P2-FE-2] `formatCents`/`formatDate`/`is403` duplicados em 5+ painéis** — risco de drift do sentinel `—`/locale. Extrair `frontend/src/utils/formatters.ts`. 
- **[P2-FE-3] Picker de pacientes do Financeiro fica stale 60s** — `FinancialPanel.tsx:1927-1933`. Paciente criado em outra aba não aparece no dropdown por até 60s. Invalidar `['patients','financial-picker']` no onSuccess de create/archive. 
- **[P2-FE-4] InsurancePanel dispara todas as queries independente da aba** — `InsurancePanel.tsx:1813-1843`. `plansQuery` (limit 200) carrega sempre. Adicionar `enabled` por aba. 
- **[P2-BE-1] `insuranceService.ts` 1394 LOC com 4 sub-services** — split em arquivos por sub-service + `insuranceValidators.ts` compartilhado. Pós-piloto. 
- **[P2-BE-2] `billingWebhookService` `recordIfNew + markStatus` sem transação** — `billingWebhookService.ts:132-154`. Crash entre os dois deixa status parcial; sem impacto na escopo no-mutation atual. 
- **[P2-UX-1] Cards de "acesso restrito" inconsistentes** — `FinancialPanel.tsx:1948-1956` (XCircle/"Acesso não autorizado") vs `InventoryPanel.tsx:916-923` / `ReportsPanel.tsx:192-196` (ShieldOff/"Acesso restrito"). Unificar para o padrão calmo (ShieldOff/"Acesso restrito"). 
- **[P2-UX-2] Subtítulos verbosos do Dashboard** — `Dashboard.tsx:79-92`. "Apenas dados administrativos — sem dados clínicos" repetido 3×; card "Bem-vindo(a)" (`:390-403`) duplica a nav em prosa; banner de hint da agenda (`:432-436`) sem dismiss. Compactar.

---

### P3 / Baixo — Polish

- **[P3-SEC-1] `verifyAsaasToken` vaza timing de comprimento** — `billingAsaasProvider.ts:54-57`. O `timingSafeEqual(a,a)` no mismatch é proporcional ao comprimento fornecido. Risco prático baixo; padronizar comparação de comprimento fixo. 
- **[P3-SEC-2] `errorHandler` repassa `err.details` sem sanitização** — `errorHandler.ts:29-33`. Hoje inerte (nenhum `HttpError` passa `details`), mas latente. Filtrar a um shape seguro ou remover da assinatura. 
- **[P3-FE-1] `appTourDismissed` calculado por IIFE no render** — `Dashboard.tsx:128-130`. Bug visível de label: o botão não atualiza até re-render externo. Mover para `useState` como `teaserDismissed`. 
- **[P3-BE-1] Constantes de validação duplicadas** (`UUID_RE`, `LIST_MAX_OFFSET`, parsers) em 5-6 services — extrair `backend/src/utils/validators.ts`. 
- **[P3-UX-1] ServicesPanel sem botão "Auri explica"** — `Dashboard.tsx:452-454` não passa `onAuriTour` ao ServicesPanel, enquanto os outros painéis têm. Confirmar se é intencional. 
- **[P3-PROD-1] Audit fora da transação em `clinicalEncounterService.create`** — `clinicalEncounterService.ts:421-430`. Padrão best-effort aceito (e `safeAudit` nunca lança), mas `inventoryService.createMovement` audita **dentro** da tx — inconsistência de modelo, não bug. 

---

## Inconsistências entre UI e Backend (consolidado)

| # | UI promete / mostra | Backend faz | Severidade |
|---|---------------------|-------------|------------|
| 1 | Botão "Prontuário" em todo card de paciente | Gate clínico só no backend → 403 p/ secretaria | P1 |
| 2 | Guia: "Supervisor" lê relatórios (grant standalone) | Relatórios gateados por `requireRole(secretaria)`, não pelo grant | P2 |
| 3 | Profissional desativado some da Equipe | Continua no dropdown da Agenda (3 listas não sincronizam) | P2 |
| 4 | (nenhuma promessa indevida de escrita encontrada) | Escritas corretamente bloqueadas no service-layer | OK |

O RBAC backend é sólido no **service-layer** (não só rota): `effectiveFinancialAccess`, `assertNotProfissional` em convênios, estoque CRUD owner-only, prontuário por ADR 0010+. Matriz completa de papéis verificada (ver achados do agent RBAC). O frontend, salvo o item #1, não promete acesso que o backend negue.

---

## Riscos Permissões / LGPD / Tenant Isolation (resumo)

**Tenant isolation:** ✅ Forte. Todos os 29 DAOs filtram `clinica_id` em SELECT/UPDATE/DELETE; sem `listAll`; sem delete físico; sem concatenação de SQL; CAS consistente. Única exceção mutável sem `clinica_id`: `billingEventDao.markStatus` (P1, sem exploit hoje). Resolvers internos de billing (`findByExternalId`) intencionalmente sem clinic-scope são documentados e corretos.

**RBAC:** ✅ Sólido no service-layer. 1 P1 (`GET /clinic-professionals` read sem `requireRole`). 3 listas (Equipe/Profissional/Grant) são gerenciáveis hoje porque `requireClinic` faz DB check; a divergência é hygiene/UX, não bypass.

**LGPD:** 2 P1 acionáveis antes de dado real (`holder_name` sem máscara; rótulos de audit de documento). Read-audit STRICT confirmado nos caminhos principais. CPF sempre mascarado. Export neutraliza formula injection. Billing sem PII clínica e sem payload bruto. Logs sem PII/segredos (logger redige defensivamente).

**Edge/dev:** Nginx + Cloudflare Tunnel revisados **apenas como dev/sandbox** (self-signed `:8443`, túnel sandbox). Não tratados como produção. Sem achado.

---

## Features Recomendadas (pré-piloto)

P1 (alto impacto no sucesso do piloto):
- Auto-cadastrar o dono como "Profissional da agenda" (ou nudge forte) — remove o maior dead-end do consultório solo.
- Pré-preenchimento (cosmético/editável) do preço do serviço na cobrança.
- Esconder/explicar o botão "Prontuário" para papéis sem acesso clínico.
- Abrir `RolePermissionsGuide` por padrão na 1ª visita + helper "mesma pessoa nos 3 lugares".

P2 (melhora real, pode vir depois):
- Link Agenda → "abrir prontuário / criar documento" no card do agendamento.
- Quick-create de paciente de dentro do form de agendamento.
- Empty-state da Agenda detectando pré-requisitos faltando (0 pacientes/profissionais).

---

## Features a NÃO Fazer Agora (fora de fase / perigoso)

- Cobrança real / checkout / captura de cartão — **bloqueado** até CNPJ + contrato/termos/LGPD + ADR 5.2A.
- Mutação real de assinatura/soft-lock via webhook de produção — backlog futuro (exige ADR).
- ICP-Brasil com força legal, TISS/TUSS real, NFS-e, SNGPC/ANVISA, telemedicina, app mobile nativo, prescrição eletrônica legal, IA clínica, CID estruturado.
- **Unificação das 3 listas** (Equipe × Profissional × Grant) em um cadastro único — desejável, mas mexe em auth/tenant/modelo → **exige ADR própria**, não nesta fase.
- Acoplamento **autoritativo** preço→cobrança (manter só prefill cosmético; senão arrisca o invariante "billing não lê PII/clínico").
- Produção AWS — pausada até ADR 5.2A.

---

## Proposta de Próximas Sprints Pequenas

> Cada sprint é pequena, revisável, e respeita as restrições da 6.0I (sem ADR nova, sem mexer no core de auth/tenant exceto fixes pontuais aprovados).

**Sprint 6.0J — Polish LGPD/UX pré-dado-real (frontend + 1-2 backend pontuais, com aprovação):**
- [P1-LGPD-2] rótulos de auditoria de documento (frontend estático).
- [P1-UI/BACKEND-1] botão Prontuário: esconder/estado explícito p/ não-clínicos (frontend).
- [P1-LGPD-1] mascarar `holder_name` na listagem de convênios (backend — toca resposta de PII, **aprovar antes**).
- [P2-UX-1/2] unificar cards de acesso restrito + compactar subtítulos/cards do Dashboard.
- [P3-FE-1] `appTourDismissed` → `useState`.

**Sprint 6.0K — Onboarding do consultório solo (frontend):**
- [P1-PROD-1] guia aberto por padrão + helper "3 lugares" + nudge "adicione-se como profissional" + reordenar checklist.
- [P1-PROD-2] prefill cosmético preço→cobrança.

**Sprint 6.0L — Hardening frontend (sem mudança de comportamento):**
- [P1-FE-1] `PanelErrorBoundary` nos 6 painéis grandes.
- [P1-FE-2] achatar queryKeys de objeto.
- [P2-FE-2] extrair `formatters.ts`; [P2-FE-1] split `api.ts`/`api.types.ts`; [P2-FE-3/4] invalidar picker / `enabled` por aba.

**Sprint 6.0M — Hardening backend billing/tenant (com aprovação, antes de ativar billing real):**
- [P1-RBAC-1] `requireRole` em `GET /clinic-professionals` (**aprovar — toca authz**).
- [P1-BILL-1] `clinica_id` em `billingEventDao.markStatus`; [P1-BILL-2] tx em `provisionSubscription`; [P2-BE-2] tx em webhook.
- [P2-SEC-1] tenant no alvo do join de read-audit.

**Backlog (ADR própria, NÃO agora):** unificação das 3 listas; split de `insuranceService.ts`; extração de validators compartilhados; mutação real de assinatura.

---

## Recomendação Final (caminho pré-piloto)

1. **Pode iniciar piloto Fase 1 com dados sintéticos** em local/staging agora — núcleo seguro, sem P0.
2. **Antes de inserir qualquer dado real (mesmo de família):** rodar **6.0J** (P1 de LGPD/RBAC/UX baratos). `holder_name` sem máscara e a lacuna de auditoria de documento são os dois itens que mais importam para dado real.
3. **6.0K** torna o primeiro uso de um consultório solo fluido (maior risco de "eles travam e te ligam").
4. **6.0L/6.0M** são hardening — fazer quando houver folga; **6.0M é pré-requisito de qualquer ativação real de billing**, junto com CNPJ + ADR 5.2A.
5. Nenhum achado altera os bloqueios já vigentes (cobrança real, produção AWS). A trilha 5.2A continua sendo o gate para dados reais e cobrança real.

**Honestidade brutal:** o produto está bem mais maduro e seguro do que arriscado. Os riscos reais não são de segurança catastrófica — são de **PII de convênio vazando sem máscara em lista**, de **transparência de auditoria incompleta** e, sobretudo, de **um consultório solo não conseguir se cadastrar como profissional sem ajuda**. Resolver esses poucos P1 baratos é o que separa "piloto que impressiona" de "piloto que precisa de suporte por telefone".
