# Super Revisão Pré-Piloto Pós-Governança — Sprint 6.2A

> **Data:** 2026-05-29 · **Tipo:** QA/revisão multi-área, **docs-only** (sem feature nova, sem migration, sem commit).
> **Escopo de fase:** Fase 3 (produção/governança). **NÃO pronto para dados reais.** Cobrança real e AWS seguem bloqueadas até ADR 5.2A.
> **Precedentes:** `docs/super-review-6-0I.md`, `docs/super-review-4-9A.md`.
>
> **Atualização 2026-05-29 (Sprint 6.1E):** **GOV-NEW-1 RESOLVIDO** — `register()` agora cria a
> linha de titular na mesma transação; smoke confirma clínica nova com 1 titular e promote 201.
> **TEST-1 parcialmente endereçado** — base mínima de testes (`node:test`/`tsx`, 11 testes:
> `requireClinicGovernance` + `maskCpf`); integração-DB segue de backlog (6.1E.1). Demais P1/P2/P3 inalterados.

---

## 1) Resumo executivo

Revisão pré-piloto do Clinic OS inteiro **após** a entrega do módulo Governança da Clínica (ADR 0019, sprints 6.1A–6.1D). Oito lentes especializadas executadas em paralelo (subagents) + verificações empíricas via API/DB.

**Veredito geral: produto em boa forma para piloto controlado com dados sintéticos.** A base de segurança, isolamento de tenant, LGPD e a nova camada de governança estão **sólidas e coerentes com os invariantes documentados**. A maioria dos P1 da revisão anterior (6.0I) foi **genuinamente resolvida** (máscara `holder_name`, labels de audit de documento, `requireRole` em `GET /clinic-professionals`, PanelErrorBoundary, prefill de cobrança, estado restrito do prontuário).

**Nenhum P0** (sem vazamento, sem bypass, sem quebra grave de isolamento).

**Achado de destaque (P1, novo, confirmado empiricamente):** clínicas **criadas após o backfill 6.1A não recebem linha de titular** em `clinic_governance_members`. Resultado verificado: numa clínica recém-registrada, `GET /clinic-governance` retorna `{"members":[]}` (painel sem titular) e promover um administrador retorna **403 `governance_titular_required`** — ou seja, o recurso-âncora desta fase está **não-funcional para tenants novos**, que é exatamente quem um piloto familiar cadastra.

Os demais gaps dominantes são **operacionais/processo, não bugs de runtime**: zero testes automatizados no repo; dois P1 de billing carregados da 6.0I ainda abertos (no-op hoje, mas pré-requisito antes de cobrança real); checklists de go/no-go desatualizados; ausência de revoke/transferência de titularidade; e o gate de dados reais (ADR 5.2A: infra gerenciada, S3, WAF, restore offsite, LGPD legal, termos) **inteiramente por construir — corretamente mantendo dados reais e cobrança real BLOQUEADOS.**

---

## 2) Escopo revisado

- **Backend:** 22 rotas, 22 controllers, 42 services, 30 DAOs, 11 middlewares; migrations (20 aplicadas); error handling; transações; idempotência; edge/Nginx/Docker.
- **Frontend:** `Dashboard.tsx` (613 linhas, 12 abas), 88 componentes, `api.ts` (2.723 linhas), TanStack Query/queryKeys, PanelErrorBoundary, tours Auri por módulo, `GovernancePanel` (novo).
- **Governança (ADR 0019):** `clinic_governance_members`, `requireClinicGovernance`, fallback `dono_clinica→titular`, enforcement em writes de `clinic-services`, `GovernancePanel`, tour Auri TEAM.
- **Segurança/LGPD:** auth/JWT/MFA, rate limits, CORS/edge/TLS local, demo-login, Asaas sandbox/webhooks, secrets, redaction de logs, prontuário/documentos/read-audit, export/import, convênios (PII).
- **Pré-piloto:** checklists de go/no-go, prontidão para piloto familiar sintético, gates para dados reais/AWS/cobrança.

---

## 3) Metodologia / agents usados

Orquestração multi-agente (workflow em background) com **8 revisores especialistas em paralelo**, cada um devolvendo achados estruturados (severidade, evidência `arquivo:linha`, risco, recomendação, sprint) e verificando se os P1 da 6.0I foram resolvidos:

| # | Lente | Tipo de agent |
|---|-------|---------------|
| 1 | Product/UX | general-purpose |
| 2 | Security/Auth | security-reviewer |
| 3 | Tenant isolation | security-reviewer |
| 4 | LGPD/Clinical privacy | security-reviewer |
| 5 | Governance/RBAC | architecture-guardian → *re-executado* general-purpose (1ª passada veio vazia) |
| 6 | Architecture/frontend | architecture-guardian |
| 7 | Backend/API | architecture-guardian |
| 8 | Pre-pilot readiness | general-purpose |

**Verificação empírica adicional (eu, via `https://localhost:8443` + Postgres):** smoke de governança por papel (200/403/401/404); enforcement de Serviços antes/depois de promover; efeitos colaterais da promoção (0 `user_clinical_roles`, `papel` inalterado, billing intocado); audit metadata-only; e **registro de clínica nova descartável** para confirmar o P1 de governança. Dados de teste limpos; baseline da smoke clinic restaurado (1 titular ativo, 0 administradores); audit logs preservados.

---

## 4) Achados por área

### 4.1 Product/UX
Boa forma geral; copy do `GovernancePanel` separa bem governança × clínico × billing. Fricções residuais: nudges de "cadastrar profissional" caem no **topo** de uma aba Equipe de ~1500 linhas (5 painéis empilhados) em vez do painel de Profissionais (UX-1, resíduo do 6.0I P1-PROD-1); tour de onboarding nunca visita Equipe nem ensina a ordem de setup (UX-2); inconsistências de copy carregadas da 6.0I (UX-3 cartão "Acesso não autorizado" no Financeiro; UX-4 linha "Supervisor"); navegação de 12 abas planas pesada no mobile (UX-5); promoção de governança sem desfazer na UI (UX-6, copy honesta); confusão potencial entre aba real e Demo Aurora (UX-7).

### 4.2 Security/Auth
Postura **sólida**: JWT HS256 estrito (valida UUID+papel; rejeita token de `mfa_challenge` em rotas de sessão), `requireClinic` faz DB-check de membership a cada request, webhook Asaas com comparação timing-safe + 404 sandbox-gated + sem log de payload bruto/secret. `requireClinicGovernance` compõe corretamente após `requireAuth+requireClinic` com fallback legado seguro contra membro revogado. **Sem P0/P1.** P2: leak de **tamanho** do token Asaas por timing (SEC-1, carregado da 6.0I, elevar antes de billing prod). P3: passthrough de `errorHandler.details` latente (SEC-2); secret único compartilhado entre JWT de sessão e de MFA-challenge (AUTH-1, débito pós-5.2A).

### 4.3 Tenant isolation
**Forte.** `clinicGovernanceDao` 100% tenant-scoped, sem `listAll`, sem delete físico, fallback corretamente protegido contra ressurreição de membro revogado. `clinica_id` sempre vem de `req.auth`, nunca do input. P1 (carregado, billing-only, sem exploit hoje): `billingEventDao.markStatus` faz UPDATE só por `id`, sem `clinica_id` (TENANT-1/BILL-1). P2: `provisionSubscription` sem transação (TENANT-2/BILL-2); resposta de governança carrega `email` (consistente com `/clinic-members`).

### 4.4 LGPD / Clinical privacy
**Fundação sólida.** Ambos P1-LGPD da 6.0I resolvidos (6.0J): `holder_name` ausente da listagem de convênios; labels de audit de documento presentes. Read-audit clínico STRICT, conteúdo-antes-de-audit, sem PII em logs de falha; export só `cpf_masked` + neutraliza fórmula. **Governança não dá acesso clínico** (confirmado: 0 `user_clinical_roles`). P2: LEFT JOIN em `patients` no read-audit sem constraint de tenant no alvo do join (defense-in-depth, LGPD-2, carregado). P3: painel de read-audit expõe e-mail do acessor (intencional Art. 18 — documentar, LGPD-1); `create`/`updateDraft` de documento retornam corpo sem read-audit (author-only, LGPD-3).

### 4.5 Governance / RBAC (ADR 0019)
Camada limpa e bem isolada; os três eixos (`users.papel` no JWT, `user_clinical_roles` clínico, `clinic_governance_members` governança) **não se confundem** (GOVRBAC-7 OK); anti-enumeração no promote confirmada (404 genérico para cross-tenant/inativo/admin_sistema; 400 `governance_member_exists`; audit guarda id da linha, nunca o user_id do alvo — GOVRBAC-8 OK). Fraquezas **operacionais, não de segurança**:
- **GOVRBAC-2 / PILOT-4 → ver P1 GOV-NEW-1:** `register()` não cria linha de titular → tenants novos quebram o recurso.
- **GOVRBAC-3 (P2):** sem endpoint de revoke/remover administrador — promoção irreversível sem SQL manual (colunas `revoked_*` existem mas nenhum código as escreve).
- **GOVRBAC-4 (P2):** sem transferência de titularidade + índice único de 1 titular ativo = trava em disputa multi-sócio (`assertClinicTitular` existe mas nenhuma rota o usa).
- **GOVRBAC-1 (P3):** TOCTOU de duas queries no fallback (inócuo até existir revoke).
- **GOVRBAC-5 (P3):** schema de revogação shipped-but-unused; `revoke_reason` é vetor PII futuro se exposto sem sanitização.
- **GOVRBAC-6 / PILOT-5 (P2):** ADR 0019 ainda diz "Proposta — nenhum código" enquanto 6.1A–6.1D estão implementados (drift de doc).

### 4.6 Architecture / frontend
Adições 6.1C arquiteturalmente limpas. P2: `GovernancePanel` não invalida `['clinicMembers']` após promover (dropdown stale até 60s, FE-1); divergência de shape `['clinic-members']` (array) × `['clinicMembers']` (`{members}`) documentada mas não resolvida (FE-2); `InventoryPanel` ainda com objeto-literal em queryKey (FE-3, resíduo 6.0I P1-FE-2); aba **Segurança sem PanelErrorBoundary** (FE-4). P3: `appTourDismissed` via IIFE não-reativo (FE-5, resíduo 6.0I); `ServicesPanel` sem `onAuriTour` (FE-6). Débito conhecido: `api.ts` 2.723 linhas (monolito — extração segura, não bloqueante).

### 4.7 Backend / API
Fronteiras MVC+DAO+Service **limpas** em todo o código novo (controller de governança sem SQL; service com toda a lógica; DAO único ponto de acesso). P1 (billing, carregados): markStatus sem `clinica_id` (BILL-1) e `provisionSubscription` sem transação (BILL-2) — ambos no-op hoje, **pré-requisito antes de cobrança real**. P2: `recordIfNew`+`markStatus` do webhook não-atômicos (BILL-3); duas queries no fallback de governança em todo write gated (GOV-1, resolve-se quando `register()` criar a linha de titular).

### 4.8 Pre-pilot readiness
P1: **zero testes automatizados** no repo (PILOT-1 — maior gap de processo; recomenda-se suite-guarda de invariantes antes da Fase-2 anonimizada); markStatus sem tenant (PILOT-2); gate de dados reais 5.2A inteiramente por construir (PILOT-7 — **gate, não bug; manter bloqueado**). P2: checklists go/no-go desatualizados/sem assinatura (PILOT-3); drift do ADR 0019 (PILOT-5); register sem titular (PILOT-4); promoção irreversível (PILOT-6).

---

## 5) Tabela P0/P1/P2/P3

> **P0:** nenhum.

| ID | Sev | Área | Descrição | Evidência | Risco | Recomendação | Sprint |
|----|-----|------|-----------|-----------|-------|--------------|--------|
| **GOV-NEW-1** | **P1 ✅ RESOLVIDO (6.1E)** | Governance | Clínica registrada após o backfill 6.1A **não tinha linha de titular** → `GET /clinic-governance` = `{members:[]}` e promover = **403 `governance_titular_required`** (verificado empiricamente). | `authService.ts` (`register`); `requireClinicGovernance.ts:68-79`; `clinicGovernanceService.assertClinicTitular` | Recurso-âncora da fase era **não-funcional para tenants novos** (cenário exato do piloto). | **Corrigido na 6.1E:** `register()` insere titular na transação existente (`created_by_user_id=user.id`). Smoke: clínica nova = 1 titular, promote 201. | 6.1E ✅ |
| **TEST-1** | **P1 🟡 PARCIAL (6.1E)** | Processo | Zero testes automatizados; invariantes guardados só por review/checklist. | `backend/package.json` (agora com `test`); 11 testes em `*.test.ts` | Refactor futuro pode quebrar invariante crítico. | **6.1E:** base mínima (`node:test`/`tsx`) cobrindo `requireClinicGovernance` (5 casos, incl. revoked-não-ressuscita) + `maskCpf`. **Backlog 6.1E.1:** integração-DB (isolamento por DAO, markPaid CAS, register titular, audit-sem-PII). | 6.1E ✅ / 6.1E.1 (DB) |
| **BILL-1** | **P1** | Tenant/Backend | `billingEventDao.markStatus` UPDATE só por `id`, sem `clinica_id`. (carregado 6.0I) | `billingEventDao.ts:61-72` | Sem exploit hoje (id vem do mesmo request); cross-tenant mutation quando billing ativar. | Adicionar `clinica_id` ao WHERE (tratar caso NULL). **Toca billing/tenant — aprovar antes.** | 6.0M (pré-billing) |
| **BILL-2** | **P1** | Backend | `provisionSubscription`: dois inserts DAO após chamada externa, fora de transação. (carregado 6.0I) | `billingService.ts:231-256` | Estado parcial irreversível após falha; retry bloqueado por 409. Admin-only/mock hoje. | Envolver os dois inserts locais em `db.transaction` (chamada externa fora da tx). | 6.0M (pré-billing) |
| **UX-1** | **P1** | Product/UX | Nudges de "cadastrar profissional" caem no topo da aba Equipe (~1500 linhas), não no painel de Profissionais. (resíduo 6.0I P1-PROD-1) | `Dashboard.tsx:479-498`; `SetupChecklist.tsx:294-300`; `AdministrativeSchedulePanel.tsx:743-747` | Maior momento de fricção do 1º uso real; dono se perde entre sub-painéis. | `id`/ref no `ClinicProfessionalsPanel` + `scrollIntoView` no nudge (ou reordenar painéis). Frontend-only. | 6.0K-follow-up |
| **GATE-5.2A** | **P1 (gate)** | Pré-piloto | Pré-requisitos de dados reais (infra gerenciada, S3, WAF, `TRUST_PROXY`/`REDIS_URL` prod, restore offsite validado, LGPD legal, termos) **inteiramente por construir**. | `security-notes.md:632-654`; `pilot-go-no-go-checklist.md:180-197`; retenção dry-run | Usar qualquer dado real sem isto = não pronto legal/operacionalmente. | **Manter dados reais e cobrança real BLOQUEADOS.** Sequenciar ADR 5.2A + revisão LGPD legal + termos. Gate, não bug — sem código agora. | 5.2A |
| GOV-1 | P2 | Tenant/Backend | TOCTOU: fallback de `requireClinicGovernance` faz 2 leituras sem atomicidade. | `requireClinicGovernance.ts:52-78` | Janela estreita; inócuo até existir revoke. | Combinar em 1 método de DAO atômico antes do revoke. | pré-revoke |
| GOV-EMAIL | P2 | Backend/LGPD | Resposta de `GET /clinic-governance` e do promote inclui `email` do membro (não usado na UI). | `clinicGovernanceService.ts:148-154,205-212` | Minimização: consistente com `/clinic-members`, não é leak novo. | Omitir `email` da projeção da lista **ou** documentar a decisão na ADR 0019. | Backlog |
| SEC-1 | P2 | Security | `verifyAsaasToken` vaza **tamanho** do token por timing em mismatch. (carregado 6.0I) | `billingAsaasProvider.ts:46-60` | Oráculo de timing; baixo na sandbox, hardenar antes de billing prod. | Hashear ambos os lados (SHA-256) antes do `timingSafeEqual`. | 6.0M / pré-billing |
| LGPD-2 | P2 | LGPD/Tenant | LEFT JOIN em `patients` no read-audit sem `clinica_id` no alvo do join. (carregado 6.0I) | `clinicalReadAuditDao.ts:141-144` | Teórico; write-time scope é o gate real. | `.andOn('p.clinica_id', ...)` — defense-in-depth de 1 linha. | 6.0M |
| BILL-3 | P2 | Backend | Webhook: `recordIfNew`+`markStatus` não-atômicos. | `billingWebhookService.ts:132-153` | Evento órfão em `received` após falha transitória. | Envolver ambos em `db.transaction` (sem I/O de rede dentro). | 6.0M |
| GOVRBAC-3 | P2 | Governance | Sem endpoint de revoke/remover administrador — promoção irreversível sem SQL. | `clinicGovernanceDao.ts:90-107`; `GovernancePanel.tsx:269-271` | Lock-in operacional; administrador errado não pode ser rebaixado. | Endpoint titular-only que vira `status='revoked'` + audit (colunas já existem). | próxima sprint de governança |
| GOVRBAC-4 | P2 | Governance | Sem transferência de titularidade + índice único de 1 titular = trava em disputa. | migração `:111-115`; `clinicGovernanceService.ts:104-114` (helper não usado) | Disputa de propriedade sem caminho no produto. | ADR + sprint dedicada (swap atômico). **Não fazer agora.** | ADR dedicada |
| FE-1 | P2 | Frontend | `GovernancePanel` promove sem invalidar `['clinicMembers']` → dropdown stale ≤60s. | `GovernancePanel.tsx:79` | Confusão de UX; backend rejeita duplicata corretamente. | `invalidateQueries({queryKey:['clinicMembers']})` no `onSuccess`. | 6.1E |
| FE-2 | P2 | Frontend | Divergência de shape `['clinic-members']` (array) × `['clinicMembers']` (`{members}`) documentada mas não resolvida. | `TeamManagementPanel.tsx:122-128`; `GovernancePanel.tsx:57-65`; `ClinicalRolesPanel.tsx:40-45` | Bug latente de manutenção (próximo dev copia a key errada). | Padronizar 1 key + 1 shape (constante compartilhada). | Backlog |
| FE-3 | P2 | Frontend | `InventoryPanel` com objeto-literal em queryKey. (resíduo 6.0I P1-FE-2) | `InventoryPanel.tsx:879-883` | Baixo no TanStack v5; diverge do padrão escalar. | Achatar para escalares. | hardening |
| FE-4 | P2 | Frontend | Aba **Segurança** sem `PanelErrorBoundary`. | `Dashboard.tsx:506-550` | Tela branca se MfaSettings/ReadAudit lançar. | Envolver em `<PanelErrorBoundary label="Segurança">`. | polish |
| UX-2 | P2 | Product/UX | Tour de onboarding não visita Equipe nem ensina a ordem de setup numa conta vazia. | `GuidedDemoTour.tsx:326-409`; `Dashboard.tsx:325-352` | Dono termina o tour vendo telas vazias, sem "comece por aqui". | Passo apontando o `SetupChecklist` / handoff ao checklist. | 6.0K-follow-up |
| UX-3 | P2 | Product/UX | Cartão restrito do Financeiro usa `XCircle`/"Acesso não autorizado" (alarmante) vs `ShieldOff`/"Acesso restrito" dos demais. (resíduo 6.0I P2-UX-1) | `FinancialPanel.tsx:1949-1950` | Copy inconsistente/alarmante p/ estado normal de permissão. | Trocar para `ShieldOff` + "Acesso restrito…". | 6.0J-follow-up |
| UX-4 | P2 | Product/UX | Linha "Supervisor" no `RolePermissionsGuide` implica grant financeiro autônomo. (resíduo 6.0I P2-RBAC-1) | `RolePermissionsGuide.tsx:63-67` | Dono modela permissões errado no onboarding. | Reescrever: financeiro/relatórios dependem do login de funcionário, não do grant clínico. | 6.0J-follow-up |
| UX-5 | P2 | Product/UX | 12 abas planas sem agrupamento; pesado no mobile. | `Dashboard.tsx:66-79`; `Dashboard.module.css:726-748` | Sobrecarga de 1ª impressão; nav longa no mobile. | Agrupar visualmente "Dia a dia" × "Gestão" (sem backend). | Backlog |
| PILOT-3 | P2 | Docs | Checklist go/no-go desatualizado (18/0, ADR 5.1A) e sem assinatura. | `pilot-go-no-go-checklist.md:17,103,182` | Piloto iniciado contra checklist obsoleto; gap de rastreabilidade. | Atualizar (20/0, ADR 5.2A, governança) + ticar contra o build + verificador/data. | 6.1E |
| PILOT-5 | P2 | Docs | ADR 0019 ainda diz "Proposta — nenhum código" enquanto 6.1A–6.1D estão entregues. | `docs/adr/0019*:3-5` vs código | Drift de doc mina a disciplina de "source of truth". | Atualizar status para "entregue 6.1A–6.1D" + notas de gaps. | 6.1E (quick-win) |
| SEC-2 | P3 | Security | `errorHandler` serializa `HttpError.details` sem sanitização (latente, sem caller hoje). | `errorHandler.ts:29-33` | Disclosure futuro se `details` levar dado interno. | Type-guard: só primitivos/array de strings. | 6.0L hardening |
| AUTH-1 | P3 | Security | JWT de sessão e de MFA-challenge usam o mesmo `JWT_SECRET`. | `tokenService.ts:30-50` | Teórico (verify rejeita por papel ausente). | Secret dedicado pós-5.2A; documentar risco aceito. | pós-5.2A |
| LGPD-1 | P3 | LGPD | Painel de read-audit expõe e-mail do acessor (intencional Art. 18). | `ClinicalReadAuditPanel.tsx:212-215` | Baixo (single-tenant); decisão deliberada. | Comentar como decisão LGPD Art. 18 (sem mudança de código). | doc |
| LGPD-3 | P3 | LGPD | `create`/`updateDraft` de documento retornam corpo sem read-audit (author-only). | `clinicalDocumentService.ts:493,730-731` | Baixo; só o autor dispara; write-audit existe. | Emitir read-audit best-effort **ou** documentar exceção na ADR 0011. | ADR 0011 |
| GOVRBAC-1 | P3 | Governance | TOCTOU de 2 queries no fallback (ver GOV-1). | `requireClinicGovernance.ts:52,71-78` | Inócuo até existir revoke. | Colapsar em 1 query no sprint do revoke. | com revoke |
| GOVRBAC-5 | P3 | Governance | Schema de revogação shipped-but-unused; `revoke_reason` = vetor PII futuro. | migração `:58-66,83-95` | Baixo; surface morta + PII futura se exposta. | Sanitizar/allow-list `revoke_reason` quando o revoke nascer; nunca ecoar no audit. | com revoke |
| FE-5 | P3 | Frontend | `appTourDismissed` via IIFE não-reativo. (resíduo 6.0I P3-FE-1) | `Dashboard.tsx:130-132` | Label do botão não atualiza após 1º tour. | Trocar IIFE por `useState` (padrão do `teaserDismissed` logo acima). | polish |
| FE-6 | P3 | Frontend | `ServicesPanel` sem `onAuriTour`. (resíduo 6.0I P3-UX-1) | `Dashboard.tsx:462-465`; `GuidedDemoTour.tsx:308-317` | Inconsistência (único painel principal sem tour). | Adicionar `SERVICES_TOUR_STEPS` no futuro **ou** comentar omissão intencional. | Backlog |
| UX-6 | P3 | Product/UX | Promoção de governança one-way na UI (sem rebaixar). | `GovernancePanel.tsx:267-272` | Dead-end de UX p/ multi-sócio; copy já é honesta. | Rastrear revoke (ver GOVRBAC-3). | Backlog |
| UX-7 | P3 | Product/UX | CTA Demo Aurora abre nova aba dentro de sessão real (confusão de abas). | `Dashboard.tsx:357-379` | Baixo (demoBar + write-block distinguem). | Prefixo de título "DEMO · " na aba `/demo`. | Backlog |

---

## 6) Quick wins seguros

**Docs-only (sem risco, recomendados já — feitos/ofertados nesta sprint):**
- Reconciliar status da ADR 0019 → "entregue 6.1A–6.1D" + gaps (PILOT-5/GOVRBAC-6).
- Atualizar `pilot-go-no-go-checklist.md` ao estado atual (20 migrations, ADR 5.2A, itens de governança) com verificador/data (PILOT-3).
- `CLAUDE.md` já corrigido na 6.1D para 20 migrações.

**Código trivial (frontend, não toca auth/tenant — exigem aprovação por política desta sprint):**
- `GovernancePanel`: `invalidateQueries(['clinicMembers'])` no `onSuccess` (FE-1, 1 linha).
- Aba Segurança: envolver em `PanelErrorBoundary` (FE-4, 2 linhas).
- Financeiro: cartão restrito → `ShieldOff`/"Acesso restrito" (UX-3, 2 linhas).
- `RolePermissionsGuide`: reescrever linha "Supervisor" (UX-4, copy).
- `InventoryPanel`: achatar queryKey (FE-3).
- `Dashboard`: `appTourDismissed` via `useState` (FE-5).

---

## 7) Itens que NÃO devem ser feitos agora

- **Cobrança real / checkout / captura de cartão / mutação real de assinatura-soft-lock via webhook** — bloqueado por CNPJ + contrato/termos/LGPD + ADR 5.2A.
- **Dados reais de paciente** (mesmo CPF/telefone de parente) — bloqueado pelo GATE-5.2A.
- **Infra AWS de produção** — pausada por política até ADR 5.2A.
- **Transferência de titularidade** — exige ADR própria (swap atômico contra o índice único; fluxo formal aceite+audit+grace).
- **Unificar as "3 listas"** (Login Equipe / Profissional da agenda / Acesso ao prontuário) — exige ADR; toca auth/tenant/model.
- **Separar o secret do JWT de MFA-challenge** — exige plano de migração/ADR (re-verificação de sessões).
- **Trocar webhook Asaas para HMAC** — sandbox não suporta; token compartilhado é o contrato documentado (ADR 0018).
- **Acoplar preço de serviço à cobrança de forma autoritativa** — preserva o invariante "billing nunca lê PII/clínico".
- **Cobertura de teste abrangente de uma vez** — começar pela suite-guarda de invariantes.
- **Ampliar enforcement de governança a outros módulos** (appointments/financeiro/etc.) sem ADR.

---

## 8) Recomendação de roadmap após a revisão

Sequência sugerida (pequena, incremental, sem abrir billing/AWS):

1. **6.1E — Fechamento de Governança + base de qualidade (recomendada a seguir):**
   - **GOV-NEW-1 (P1):** inserir linha de titular em `register()` (corrige o recurso para tenants novos; toca auth — aprovar). Reduz o fallback a puro legado.
   - **TEST-1 (P1):** suite-guarda mínima de invariantes (vitest).
   - **Docs:** reconciliar ADR 0019 + refresh do checklist go/no-go.
   - Quick wins de frontend (FE-1, FE-4, UX-3, UX-4) se aprovados.
2. **6.0M-bis — Hardening pré-billing** (só quando billing real for desbloqueado): BILL-1, BILL-2, BILL-3, SEC-1, LGPD-2.
3. **Sprint de Governança v0.2 (pós-piloto, ADR):** revoke titular-only (GOVRBAC-3); depois transferência de titularidade (GOVRBAC-4, ADR própria).
4. **5.2A — ADR Produção Segura AWS:** gate obrigatório antes de qualquer dado real e cobrança real.

---

## 9) Go / No-Go

| Decisão | Veredito | Condição |
|---------|----------|----------|
| **Continuar pré-piloto sintético** | ✅ **GO** | Dados 100% fictícios; Demo Aurora fictícia. Nenhum P0; P1s não bloqueiam o caminho sintético interno. |
| **Piloto familiar anonimizado** | 🟢 **GO** (era 🟡) | **GOV-NEW-1 resolvido (6.1E)** + base mínima de testes (TEST-1 parcial). Dados estritamente sintéticos/anonimizados; comunicar aos participantes que **revoke/transferência de titularidade ainda não existem**. Recomendado fechar integração-DB (6.1E.1) em paralelo. |
| **Dados reais de paciente** | ⛔ **NO-GO** | Bloqueado pelo GATE-5.2A: infra gerenciada, S3, WAF, restore offsite validado, retenção real, **revisão LGPD legal + termos publicados**. |
| **Produção / AWS** | ⛔ **NO-GO** | Pausado por política até ADR 5.2A. |
| **Cobrança real** | ⛔ **NO-GO** | Exige CNPJ + contrato/termos/LGPD + ADR 5.2A; **hardenar BILL-1/BILL-2/BILL-3/SEC-1 antes**. Não cobrar em CPF improvisado. |

---

*Revisão 6.2A — docs-only, sem commit. 8 lentes (subagents) + verificação empírica. Sem feature nova, sem migration. Smoke clinic restaurada ao baseline; audit logs preservados.*
