# ClinicBridge — Catálogo de Serviços v0.1 (escopo operacional)

> Documento operacional criado na Sprint 4.6A (2026-05-27).
> Fonte de verdade arquitetural: `docs/adr/0015-services-catalog-commercial-layer-v0.md`.
>
> **Esta sprint é docs/ADR-only. Nenhum código foi criado.**
> A implementação começa na Sprint 4.6B (backend) após esta ADR aceita.
>
> **Relacionado:** `docs/financial-v0-scope.md` · `docs/agenda-financial-integration-v0-scope.md` ·
> `docs/management-reports-v0-scope.md` · `docs/insurance-billing-future-scope.md`

---

## 1. O que é o Catálogo de Serviços v0.1

Uma **etiqueta administrativa/comercial** que permite à clínica:

1. **Categorizar agendamentos** por tipo de atendimento ("Consulta inicial",
   "Retorno", "Sessão de fisio", "Procedimento").
2. **Registrar um preço de tabela** como referência visual — sem enforcement automático.
3. **Vincular profissionais** a serviços que oferecem (filtro no seletor de agendamento).
4. **Segmentar relatórios** por tipo de serviço/procedimento.

### O que NÃO é

| Não é | Por quê |
|---|---|
| Código TUSS/CBHPM | Sem normativo ANS; seria TISS real — fase futura (ADR 0016+ estabilizada) |
| Protocolo clínico | Serviço ≠ diagnóstico; não entra no prontuário (ADR 0010) |
| Item de nota fiscal | NFS-e exige análise municipal — ADR futura própria |
| Trigger automático de preço | Humano sempre decide o valor da cobrança |
| Definição de "procedimento" no sentido clínico | Texto livre administrativo |

---

## 2. Entidades criadas na Sprint 4.6B

### 2.1 `clinic_services`

```
id                uuid        PK
clinica_id        uuid        NOT NULL FK clinics — tenant isolation
name              text        NOT NULL (1–200 caracteres)
category          text        NULL — texto livre; sugestões: "Consulta" | "Sessão" | "Exame" | "Procedimento" | "Outro"
description       text        NULL (≤ 2000 caracteres)
duration_minutes  integer     NULL (1–1440 minutos)
price_cents       integer     NULL (≥ 0; NULL = sem preço de tabela)
active            boolean     NOT NULL DEFAULT true
created_at        timestamptz
updated_at        timestamptz

-- Implementado em 4.6B como UNIQUE INDEX normalizado:
-- idx_clinic_services_clinica_name_normalized_unique
--   ON clinic_services (clinica_id, lower(btrim(name)))
-- Rejeita variações case-insensitive e tolerantes a espaços com 409.
-- CHECK do name usa char_length(btrim(name)) >= 1.
```

### 2.2 `professional_services`

```
professional_id   uuid        NOT NULL FK clinic_professionals(id)
service_id        uuid        NOT NULL FK clinic_services(id)
clinica_id        uuid        NOT NULL FK clinics(id) — tenant isolation
active            boolean     NOT NULL DEFAULT true
created_at        timestamptz

PRIMARY KEY (professional_id, service_id)
```

### 2.3 Extensão de `appointments`

```sql
ALTER TABLE appointments
  ADD COLUMN service_id uuid NULL REFERENCES clinic_services(id) ON DELETE SET NULL;
```

### 2.4 Extensão de `financial_charges`

```sql
ALTER TABLE financial_charges
  ADD COLUMN service_id uuid NULL REFERENCES clinic_services(id) ON DELETE SET NULL;
```

---

## 3. APIs planejadas (Sprint 4.6B)

### 3.1 Gestão de serviços

```
GET    /services               → lista serviços ativos (paginação, filtro active)
POST   /services               → cria serviço
GET    /services/:id           → detalhe
PATCH  /services/:id           → edita (name/category/description/duration/price/active)
```

**Sem DELETE** — desativação é via `PATCH { active: false }`.

### 3.2 Vínculos profissional × serviço

```
GET    /services/:id/professionals           → profissionais vinculados
POST   /services/:id/professionals           → vincula { professional_id }
DELETE /services/:id/professionals/:profId   → desativa vínculo
```

### 3.3 Pipeline de autenticação

```
patientsRateLimit → requireAuth → requireClinic → requireRole(CLINIC_ADMIN_ROLES)
```

Para `GET /services` (seletor de agenda) — o papel `profissional_clinico` deve poder
listar serviços ao criar agendamento. Ajuste de `requireRole` documentado na ADR 0015
§2.7.

---

## 4. Regras invariantes

| Regra | Versão |
|---|---|
| `clinica_id` obrigatório em todas as tabelas novas | v0.1 — invariante |
| Sem delete físico — soft-delete via `active = false` | v0.1 — invariante |
| `price_cents` é referência; nunca auto-propaga para `amount_cents` | v0.1 — invariante |
| `service_id` é opcional em agendamentos e cobranças | v0.1 |
| `name` e `description` nunca contêm dado clínico/CID/queixa | invariante |
| Audit de escrita em criação/edição/desativação | v0.1 — invariante |
| Cross-tenant → 404 genérico (anti-enumeração) | invariante |
| Serviço desativado some dos seletores mas permanece em históricos | v0.1 — invariante |

---

## 5. Fora do escopo v0.1

| Fora de escopo | Fase futura |
|---|---|
| TUSS/CBHPM/código ANS | Pós-4.7 (Convênios) estabilizado + ADR própria |
| NFS-e vinculada ao serviço | ADR futura própria (análise municipal) |
| Preço por convênio (copay diferenciado) | ADR 0016 (Convênios v0.1) |
| Relatório por serviço nos dashboards | 4.5 estendido quando dados existirem |
| Vínculo de serviço com prontuário/CID | Nunca (são domínios separados) |
| Aprovação/autorização de serviço pelo convênio | ADR 0016 |
| Estoque de materiais por serviço | ADR 0017 (Estoque v0.1) |

---

## 6. Segurança e LGPD

- `clinic_services` **não contém dado pessoal** do paciente.
- `professional_services` vincula profissional da clínica (não é dado do titular
  da LGPD — é funcionário/prestador; tratamento diferente de dado de paciente).
- Quando Convênios (ADR 0016) for implementado, `patient_insurance_plans` conterá
  dado pessoal do paciente → deverá integrar o export LGPD art. 18.
- Logger redaction: nenhum campo de `clinic_services` requer redação. Campos
  futuros de convênio (`member_number`, `authorization_number`) serão adicionados
  ao `logger.ts` na ADR 0016.

---

## 7. Faseamento de implementação

### Sprint 4.6A ✅ (esta sprint — docs/ADR-only)

- [ ] ADR 0015 criada.
- [ ] Este documento criado.
- [ ] Docs atualizados (CLAUDE.md, project-state, sprint-history, roadmap).
- [ ] **Zero código.**

### Sprint 4.6B ✅ — Backend Catálogo de Serviços (entregue 2026-05-27)

- [x] Migration única aditiva: `clinic_services` + `professional_services` +
      `appointments.service_id` + `financial_charges.service_id`
      (`20260605000000_clinic_services_v0`). UNIQUE normalizado
      `(clinica_id, lower(btrim(name)))`; CHECK name usa `char_length(btrim(name)) >= 1`;
      índices parciais tenant-scoped `(clinica_id, service_id) WHERE service_id IS NOT NULL`
      em `appointments` e `financial_charges`.
- [x] Tipos em `db.d.ts` (`ClinicServiceRow`, `ProfessionalServiceRow`, extensão de
      `AppointmentRow`/`FinancialChargeRow`).
- [x] `clinicServiceDao.ts` — DAOs gêmeos (`clinicServiceDao` + `professionalServiceDao`);
      CRUD tenant-scoped; sem `listAll`; sem delete físico.
- [x] `clinicServiceService.ts` — validações (1..120 / ≤80 / ≤500 / 5..720 / 0..99_999_999);
      duplicate-name pré-check + 23505 handler; re-link idempotente; audit metadata-only.
- [x] `clinicServiceController.ts` — thin controller.
- [x] `routes/clinicServices.ts` — pipeline `patientsRateLimit + requireAuth + requireClinic +
      requireRole(...)`; URL `/clinic-services` (não `/services`) para evitar colisão
      com escopo clínico futuro.
- [x] Registro em `app.ts`.
- [x] Smoke tests (Python urllib, sem jq): 51/51 PASS após revisão de normalização — inclui
      duplicate case-insensitive + whitespace-pad, whitespace-only 400, rename normalizado, mais
      CRUD, link idempotente, cross-tenant 404, validações negativas, permissões 5 papéis,
      payload-safety.
- [x] SQL checks: 16/0 migrations; CHECK + UNIQUE + FK SET NULL; índices criados; sem
      `SELECT *`; sem SQL concatenado; greps zero clinical_* nos arquivos novos.
- [x] `pnpm --filter backend typecheck` ✅ · `build` ✅.
- [x] `pnpm --filter backend migrate:status` 16/0.
- [x] Documentação (CLAUDE.md, project-state, sprint-history, testing-checklist).

**Decisão de escopo:** wiring de `service_id` nos endpoints existentes de `appointments` e
`financial_charges` foi **deferido para 4.6C** (frontend). A coluna está pronta (nullable +
FK SET NULL) e o payload pode evoluir aditivamente sem breaking change.

**Endpoints entregues:**
- `GET /clinic-services` · `POST /clinic-services`
- `GET /clinic-services/:id` · `PATCH /clinic-services/:id` · `PATCH /clinic-services/:id/status`
- `GET /clinic-services/:id/professionals` · `POST /clinic-services/:id/professionals`
- `PATCH /clinic-services/:id/professionals/:professional_id/status`

### Sprint 4.6C ✅ — Frontend Catálogo de Serviços (entregue 2026-05-27)

- [x] `ServicesPanel` (aba Equipe → Serviços): lista, criar, editar, desativar/reativar,
      vincular/desvincular profissionais. Owner-only para escrita; subtítulo explícito
      "etiqueta administrativa/comercial — não TUSS/CBHPM, não prontuário".
- [x] Seletor de serviço no `AdministrativeSchedulePanel` (opcional; **filtra por serviços
      vinculados ao profissional selecionado** via `GET /clinic-services?professional_id=`; quando
      nenhum profissional selecionado, lista todos os serviços ativos; reseta `cServiceId` ao
      trocar profissional; exibe hint "Nenhum serviço vinculado" quando professional selecionado
      mas lista vazia; passa `service_id` ao criar agendamento). Duração nunca preenche horário
      automaticamente.
- [x] Seletor de serviço no `FinancialPanel` ao criar/editar cobrança (opcional;
      exibe preço de tabela como sugestão; botão "Usar preço de tabela" é ação
      EXPLÍCITA do usuário — NUNCA auto-propaga `price_cents` → `amount_cents`).
- [x] 8 API funções em `api.ts`: `listClinicServices` (`professional_id` filter adicionado),
      `getClinicService`, `createClinicService`, `updateClinicService`, `updateClinicServiceStatus`,
      `listServiceProfessionals`, `linkServiceProfessional`, `updateServiceProfessionalStatus`.
- [x] Tipos `ClinicService`, `ProfessionalServiceLink`, `ListClinicServicesParams`,
      `CreateClinicServicePayload`, `UpdateClinicServicePayload` em `api.ts`.
- [x] `service_id: string | null` adicionado a `PublicAppointment`, `FinancialChargeListItem`,
      `CreateAppointmentPayload`, `CreateFinancialChargePayload`, `UpdateFinancialChargePayload`.
- [x] Backend wiring: `appointmentService.create` aceita + valida `service_id`
      (active, same clinic, professional binding check →`service_not_available_for_professional`).
- [x] Backend wiring: `financialChargeService.create`/`update` aceitam + validam `service_id`
      (active, same clinic; mismatch com appointment → `service_mismatch_with_appointment`;
      **profissional do agendamento sem vínculo com o serviço →
      `service_not_available_for_appointment_professional`**).
      `validateServiceLink` helper isolado. NUNCA auto-propaga `price_cents` → `amount_cents`.
- [x] `GET /clinic-services` aceita `professional_id` opcional: filtra via EXISTS subquery em
      `professional_services` (active=true); tenant-scoped; sem nova migration.
- [x] `pnpm --filter frontend typecheck` ✅ · `build` ✅.
- [x] `pnpm --filter backend typecheck` ✅ · `build` ✅.
- [x] `migrate:status` 16/0 ✅ · `git diff --check` rc=0.

**Endpoints entregues (backend wire-up):**
- `GET /clinic-services?professional_id=` filtra serviços por profissional (EXISTS subquery, tenant-scoped).
- `POST /appointments` aceita `service_id` opcional (com validação profissional×serviço).
- `PATCH /financial/charges` e `POST /financial/charges` aceitam `service_id` opcional
  (valida também vínculo do serviço com o profissional do agendamento, se houver).

### Sprint 4.6D — QA/Hardening Catálogo de Serviços ✅ (2026-05-27)

- [x] Smoke API 41/41 PASS — auth, CRUD, limites, permissões, links, Agenda+service_id, Financeiro+service_id.
- [x] Bug crítico corrigido: controllers não repassavam `service_id` (4.6C.2).
- [x] CSS classes `.fetchError`/`.refetchBtn` adicionadas; guard `!isError` no empty-state.
- [x] `limit: 200` → `limit: 100`; chave duplicada removida; aba Serviços separada.
- [x] `pnpm --filter frontend typecheck` ✅ · `build` ✅.
- [x] `pnpm --filter backend typecheck` ✅ · `build` ✅.
- [x] `migrate:status` 16/0 ✅ · `git diff --check` rc=0.

---

## 8. Gate para Sprint 4.7A (ADR 0016 — Convênios v0.1)

- Sprint 4.6 (A+B+C+D) entregue e QA aprovado.
- `clinic_services` em uso em pelo menos um agendamento ou cobrança de teste.
- Decisão sobre migração de `patients.convenio` + `patients.numero_carteirinha`
  registrada na ADR 0016 (pode importar para `patient_insurance_plans`).

---

## 9. Convênios — estado atual dos campos legados

Os campos `patients.convenio` e `patients.numero_carteirinha` existem desde a
importação CSV inicial como **texto livre não-estruturado**.

- O merge B-safe (ADR 0007) faz fill-blanks nesses campos.
- **Nenhuma mudança nestes campos** na Sprint 4.6.
- A ADR 0016 decidirá: (a) migrar para `patient_insurance_plans` e manter
  os campos legados por compatibilidade retroativa, ou (b) deprecar os campos
  legados com janela de migração definida.

---

## 10. Checklist de documentação (Sprint 4.6A)

- [x] ADR 0015 criada — `docs/adr/0015-services-catalog-commercial-layer-v0.md`
- [x] Este documento criado — `docs/services-catalog-v0-scope.md`
- [ ] CLAUDE.md atualizado
- [ ] `docs/project-state.md` atualizado
- [ ] `docs/sprint-history.md` atualizado
- [ ] `docs/roadmap-next-phase.md` atualizado
- [ ] `docs/product-clinic-os-roadmap.md` atualizado
- [ ] `docs/insurance-billing-future-scope.md` marcado como pré-planejamento
- [ ] `git diff --check` rc=0
