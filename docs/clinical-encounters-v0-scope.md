# ClinicBridge — Prontuário/Atendimento clínico v0.1 (escopo operacional)

> Companheiro operacional da **ADR 0010**
> (`docs/adr/0010-clinical-encounters-medical-record-v0.md`). A ADR decide;
> este documento lista **checklists, tabelas e cheat-sheets** consultáveis
> durante a Sprint 4.2B (implementação backend).
>
> **Sprint 4.2A — docs/ADR-only.** Nada aqui autoriza código. Implementação
> técnica fica para a 4.2B (gates: ADR 0010 aceita pelo dono).
>
> **Relacionado:** ADR 0010, ADR 0009, ADR 0008, ADR 0007, ADR 0001,
> `docs/clinical-architecture-and-permissions.md`, `docs/security-notes.md`,
> `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`.

---

## 1. Resumo executivo

| Item | Valor |
|---|---|
| **Módulo** | Prontuário/Atendimento clínico |
| **Versão** | v0.1 |
| **Sprint conceitual** | 4.2A (esta — ADR 0010) |
| **Sprint de implementação** | 4.2B (pendente) |
| **Tabelas novas** | 4 (`clinical_encounters`, `clinical_encounter_notes`, `clinical_read_audit`, `user_clinical_roles`) |
| **Endpoints novos** | 5 clínicos + 2 administrativos (grant/revoke role) |
| **Roles novas (DB)** | `profissional_clinico`, `gestor_clinica` (em `user_clinical_roles`); `users.papel` intocado |
| **Migração de dados** | Não no v0.1 |
| **UI** | Sprint própria após 4.2B |
| **Ambiente de validação** | Local + staging local (Docker compose) |
| **Trilha AWS** | Continua pausada; sem impacto novo no provisionamento |

---

## 2. Campos do v0.1 — visão consolidada

### 2.1 Campos textuais clínicos (na nota)

| Campo | Limite | Quem vê |
|---|---|---|
| `chief_complaint` (queixa principal) | 2 000 chars | autor + dono + gestor |
| `anamnesis` (anamnese / história) | 8 000 chars | autor + dono + gestor |
| `evolution` (evolução / observações) | 8 000 chars | autor + dono + gestor |
| `plan` (conduta / orientações) | 4 000 chars | autor + dono + gestor |
| `internal_note` (observação interna clínica) | 2 000 chars | **autor + dono + gestor — apenas** |

Pelo menos um campo deve estar preenchido para a nota ser criada.

### 2.2 Campos administrativos do encounter

| Campo | Tipo | Notas |
|---|---|---|
| `patient_id` | uuid NOT NULL | tenant-scoped, ativo, não-mesclado |
| `attending_user_id` | uuid NOT NULL | = `auth.usuario_id`, com `profissional_clinico` ativo |
| `professional_id` | uuid NULL | FK a `clinic_professionals` (link com agenda) |
| `appointment_id` | uuid NULL | FK a `appointments` (vínculo opcional) |
| `started_at` | timestamptz NOT NULL | passado recente ou agora |
| `ended_at` | timestamptz NULL | ≥ `started_at` se presente |
| `status` | enum (active/canceled) | one-way |
| `cancel_reason_code` | enum NULL | obrigatório se canceled |
| `cancel_reason_text` | text NULL | ≤ 200 chars, sem PII; nunca em audit |

### 2.3 Razões estruturadas (enums)

```
cancel_reason_code:        'duplicated' | 'wrong_patient' | 'data_error' | 'other'
rectification_reason_code: 'typo'       | 'clinical_correction' | 'add_info' | 'other'
```

---

## 3. Matriz de permissões — operação × role

Autoritativa para o v0.1 do Prontuário (cópia da ADR 0010 §7 para
consulta rápida).

| Operação | dono_clinica | gestor_clinica | profissional_clinico | funcionario_admin | financeiro | admin_sistema |
|---|---|---|---|---|---|---|
| Criar encounter | ❌ (sem role clínica) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cancelar encounter próprio | ✅* | ✅* | ✅* | ❌ | ❌ | ❌ |
| Cancelar encounter alheio | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Adicionar/retificar nota em encounter próprio | ✅* | ✅* | ✅* | ❌ | ❌ | ❌ |
| Adicionar/retificar nota em encounter alheio | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Listar encounters da clínica | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ | ❌ | ❌ | ❌ |
| Ler encounter + notas | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ | ❌ | ❌ | ❌ |
| Ler `internal_note` | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ | ❌ | ❌ | ❌ |
| Timeline do paciente | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ | ❌ | ❌ | ❌ |
| Conceder/revogar role clínica | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cross-tenant qualquer | 404 genérico | 404 | 404 | — | — | — |

Legenda: ✅ permitido · ✅* "só os próprios" no DAO · ⚠️ auditado · ❌ bloqueado.

**Regras-chave:**
1. **Dono que atende** precisa de `profissional_clinico` em `user_clinical_roles`.
2. **Profissional** edita só os próprios; cláusula `WHERE attending_user_id = self` é no DAO.
3. **Dono/gestor** leem qualquer + audit; NÃO editam alheio.
4. **`internal_note`** redacted para não-autor/dono/gestor (defesa no DAO/service).
5. **Funcionário admin / financeiro / admin_sistema** → 403 em todo endpoint clínico.

---

## 4. Catálogo de eventos de audit

### 4.1 Escrita (em `audit_logs` existente — sem migration)

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `clinical.encounter.created.success` | criar encounter | `clinical_encounter` | encounter UUID |
| `clinical.encounter.canceled.success` | cancelar encounter | `clinical_encounter` | encounter UUID |
| `clinical.encounter.note.created.success` | criar nota (não-retificação) | `clinical_encounter_note` | nota UUID |
| `clinical.encounter.note.rectified.success` | criar nota com `revises_note_id` | `clinical_encounter_note` | nova nota UUID |
| `clinical.role.granted.success` | conceder role clínica | `user_clinical_role` | linha UUID |
| `clinical.role.revoked.success` | revogar role clínica | `user_clinical_role` | linha UUID |

**Sem PII em nenhum campo de `audit_logs`.**

### 4.2 Leitura (em `clinical_read_audit` — tabela nova)

| `acao` | Quando | `recurso` | `recurso_id` | `paciente_id` |
|---|---|---|---|---|
| `clinical.encounter.read` | `GET /clinical/encounters/:id` | `encounter` | encounter UUID | patient UUID |
| `clinical.encounter.list` | `GET /clinical/encounters` | `encounter` | NULL | NULL |
| `clinical.timeline.list` | `GET /patients/:id/clinical-timeline` | `timeline` | patient UUID | patient UUID |

**`paciente_id`** segue tratamento da ADR 0009 §6.2 (após Sprint 4.1.1):
identificador interno pseudonimizado, dado pessoal, acesso restrito,
jamais em logs de aplicação fora desta tabela.

**Postura de falha — `CLINICAL_READ_AUDIT_STRICT`** (vide ADR 0010 §8.2.1):

| Ambiente | Default | Falha de `clinical_read_audit` | Resposta da leitura clínica |
|---|---|---|---|
| dev/test (`NODE_ENV != 'production'`) | `false` (best-effort) | logada nível `error` | 200 (segue) — apenas com dados sintéticos |
| staging com dados sintéticos | `false` (best-effort) por padrão; **opcionalmente `true`** para validar produção | logada `error` ou bloqueia conforme config | 200 ou 500 conforme config |
| **produção com dado clínico real** | **`true` obrigatório** (guard de boot força) | logada `error` + transação revertida | **500 `clinical_read_audit_unavailable`** — conteúdo clínico **nunca** sai no body |

Boot em `NODE_ENV=production` com `CLINICAL_READ_AUDIT_STRICT=false` →
**falha de boot** com mensagem clara (padrão da Sprint 3.39).

### 4.3 Sem audit (mantém padrão atual)

- `GET /patients` (cadastro administrativo).
- `GET /patients/duplicates`.
- `GET /appointments`.
- `GET /clinic-members`, `GET /clinic-professionals`.

---

## 5. Endpoints conceituais — cheat sheet

| Método | Path | Middleware | Audit escrita | Audit leitura |
|---|---|---|---|---|
| POST | `/clinical/encounters` | requireAuth + requireClinic + requireClinicalRole(profissional) | `clinical.encounter.created.success` + (se note) `.note.created.success` | — |
| GET | `/clinical/encounters` | + requireClinicalRole(profissional, gestor, dono) | — | `clinical.encounter.list` |
| GET | `/clinical/encounters/:id` | + requireClinicalRole(...) | — | `clinical.encounter.read` |
| PATCH | `/clinical/encounters/:id/cancel` | + requireClinicalRole(profissional) | `clinical.encounter.canceled.success` | — |
| POST | `/clinical/encounters/:id/notes` | + requireClinicalRole(profissional) | `clinical.encounter.note.{created\|rectified}.success` | — |
| GET | `/patients/:id/clinical-timeline` | + requireClinicalRole(profissional, gestor, dono) | — | `clinical.timeline.list` |
| POST | `/clinical/roles/grant` | + requireRole(CLINIC_ADMIN_ROLES) | `clinical.role.granted.success` | — |
| POST | `/clinical/roles/revoke` | + requireRole(CLINIC_ADMIN_ROLES) | `clinical.role.revoked.success` | — |

Códigos de erro padrão: 400 `clinical_*_invalid`, 403 `forbidden_role`,
404 `patient_not_found` / `encounter_not_found` (genéricos —
anti-enumeração), 401 (sem JWT/expirado).

---

## 6. Versionamento e retificação — fluxo

```
Encounter (active)
  └── Nota 1 (revises_note_id=NULL)
  └── Nota 2 (revises_note_id=Nota1, rectification_reason_code='clinical_correction')
  └── Nota 3 (revises_note_id=NULL — outra entrada do mesmo encounter)
  └── Nota 4 (revises_note_id=Nota3, rectification_reason_code='typo')

Encounter (canceled, status one-way)
  ├── canceled_at, canceled_by_user_id, cancel_reason_code obrigatórios
  └── notas existentes permanecem visíveis (médico-legal)
  └── sem restore (criar novo encounter)
```

**Invariantes:**
- nota sempre `INSERT`, nunca `UPDATE`/`DELETE`;
- encounter `UPDATE` apenas em: cancelamento (status→canceled + cancel_*),
  conclusão (set `ended_at`), atualização de `updated_at`/`updated_by_user_id`;
- retificação preserva autoria (apenas autor original retifica);
- cancelamento preserva autor (apenas autor cancela no v0.1).

---

## 7. Impacto do merge B-safe (ADR 0007)

| Cenário | Comportamento v0.1 |
|---|---|
| Tentar criar encounter para paciente `status='archived'` | 404 `patient_not_found` |
| Tentar criar encounter para paciente com `merged_into_id IS NOT NULL` | 404 `patient_not_found` |
| Timeline de paciente principal (resultado de merge) | mostra apenas encounters criados sob esse `patient_id` |
| Timeline de paciente secundário (mesclado) | mostra encounters dele; UI futura deve avisar "paciente mesclado" |
| Merge B-safe mover encounters? | **NÃO no v0.1.** Exige ADR de extensão da 0007 |
| Mistura automática de histórico clínico no merge | **NÃO** — invariante |

---

## 8. Checklist Sprint 4.2B (implementação)

### 8.1 Migration

- [ ] `20260602000000_clinical_encounters_v0.ts` (timestamp ajustar conforme dia)
- [ ] 4 `createTable`: `clinical_encounters`, `clinical_encounter_notes`, `clinical_read_audit`, `user_clinical_roles`
- [ ] FKs com `ON DELETE` apropriado (RESTRICT para histórico médico-legal; CASCADE para tenant; SET NULL para usuários)
- [ ] CHECK constraints (status, ranges de tempo, length, transições de status)
- [ ] Indexes nomeados `idx_<table>_<cols>`
- [ ] Unique parcial em `user_clinical_roles` active
- [ ] `down` reverte limpo (drop em ordem reversa)

### 8.2 Tipos / DAOs

- [ ] `backend/src/types/db.d.ts` — tipos das 4 tabelas
- [ ] `userClinicalRoleDao.ts`
- [ ] `clinicalEncounterDao.ts` — incluindo cláusula `attending_user_id` quando applicable
- [ ] `clinicalEncounterNoteDao.ts` — sem `update`
- [ ] `clinicalReadAuditDao.ts` — append-only

### 8.3 Middleware

- [ ] `requireClinicalRole(...roles)` em `middlewares/`
- [ ] Cache de request (1 SELECT por request)
- [ ] Aceita `dono_clinica` via `users.papel`
- [ ] 403 `forbidden_role` genérico

### 8.4 Services

- [ ] `clinicalEncounterService` (create/findById/list/cancel)
- [ ] `clinicalEncounterNoteService` (create/rectify)
- [ ] `clinicalReadAuditService` com dois modos (vide ADR 0010 §8.2.1):
  - strict (default em `NODE_ENV=production`): falha bloqueia leitura
    com 500 `clinical_read_audit_unavailable`, sem retornar conteúdo
    clínico;
  - best-effort (dev/staging com dados sintéticos): falha loga `error`
    e a leitura continua.
- [ ] Env var nova `CLINICAL_READ_AUDIT_STRICT` em `config/env.ts`:
  default `false` em dev/test; guard de boot **força `true`** quando
  `NODE_ENV=production` (boot falha se setado como `false` em prod —
  mesmo padrão da Sprint 3.39).
- [ ] `.env.example` documentando `CLINICAL_READ_AUDIT_STRICT` com
  comentário do comportamento esperado em cada ambiente.
- [ ] `userClinicalRoleService` (grant/revoke)

### 8.5 Controllers + rotas

- [ ] `routes/clinicalEncounters.ts` (5 endpoints clínicos)
- [ ] `routes/clinicalRoles.ts` (2 endpoints administrativos)
- [ ] Montagem em `app.ts`
- [ ] Rate limit dedicado para escritas clínicas (`CLINICAL_WRITE_*`) — opcional na 4.2B; pode reusar `patientsRateLimit`
- [ ] Validação de input no edge; service faz lógica

### 8.6 Logger

- [ ] Estender redação para: `chief_complaint, anamnesis, evolution, plan, internal_note, cancel_reason_text, rectification_reason_text`
- [ ] Body de `/clinical/*` jamais logado integral

### 8.7 Testes (smoke via curl)

- [ ] Cross-tenant → 404
- [ ] Profissional vê só os próprios
- [ ] Dono lê + audit (verifica linha em `clinical_read_audit`)
- [ ] Funcionário/financeiro/admin_sistema → 403
- [ ] `internal_note` redacted para não-autor
- [ ] Paciente arquivado/mesclado → 404 ao criar
- [ ] Cancelamento por terceiro → 404 (anti-enumeração)
- [ ] Retificação preserva autoria → 400 se outro tenta
- [ ] Audit sem PII (grep no DB)
- [ ] Logger sem conteúdo clínico (grep nos logs)
- [ ] **`CLINICAL_READ_AUDIT_STRICT` — fail-closed (obrigatório):**
      simular falha no `clinical_read_audit` (mock do DAO ou
      `REVOKE INSERT` em conexão de teste). Com `STRICT=true`:
      - `GET /clinical/encounters/:id` → **500 `clinical_read_audit_unavailable`**;
      - body **não contém** nenhum dos 5 campos clínicos (grep no body);
      - log de erro **sem** `paciente_id`, **sem** conteúdo, **sem**
        stack ecoado ao cliente.
      Repetir com `STRICT=false` (apenas em ambiente sintético) → 200 +
      body com conteúdo + log de erro.
- [ ] Boot em `NODE_ENV=production` com `CLINICAL_READ_AUDIT_STRICT=false`
      → boot falha (testar com env var temporária; não deixar setado).

### 8.8 SQL checks pós-teste

- [ ] CHECK constraints respeitadas (cancel sem cancel_at = 0)
- [ ] Retificação sem reason_code = 0
- [ ] Unique parcial em roles ativos respeitado
- [ ] Audit `clinical.*` presente
- [ ] `clinical_read_audit` registra leituras

### 8.9 Limpeza

- [ ] Dados de teste removidos (usuários/clínicas descartáveis)
- [ ] Audits preservados (FK SET NULL — comportamento correto)
- [ ] Build/typecheck OK no backend
- [ ] Sem commit/push automático

### 8.10 Documentação

- [ ] `CLAUDE.md` (sprint atual, migrations, endpoints, restrições críticas)
- [ ] `docs/project-state.md`
- [ ] `docs/sprint-history.md`
- [ ] `docs/security-notes.md` (nova seção "Prontuário clínico v0.1")
- [ ] `docs/testing-checklist.md` (bloco Sprint 4.2B)

---

## 9. Cifra — decisão consciente

**v0.1 não usa cifra a nível de coluna.** Confia em:

1. RDS encryption at rest (cifra de bloco).
2. TLS in transit.
3. Controles de aplicação (`requireAuth` + `requireClinic` +
   `requireClinicalRole` + tenant filter no DAO).
4. Audit de leitura — **fail-closed em produção**
   (`CLINICAL_READ_AUDIT_STRICT=true`): falha de audit bloqueia a
   resposta. Sem audit íntegro, conteúdo clínico não sai. Controle
   compensatório principal pela ausência de cifra a nível de coluna.
5. Logger redigindo campos clínicos.

**Revisão obrigatória antes de produção:** se validação jurídica externa
exigir cifra a nível de coluna OU se anexos clínicos entrarem em sprint
futura, **abrir sprint dedicada** com KMS CMK dedicada, scheme (provável
randomized) e migração dos campos em staging.

---

## 10. Itens explicitamente fora do v0.1

Reprodução compacta da ADR 0010 §18:

- CID estruturado, prescrição estruturada, exames (pedido/resultado),
  anexos clínicos, assinatura digital, ICP-Brasil, telemedicina, IA
  clínica, medicamentos controlados, TISS/TUSS, portal do paciente.
- Edição/cancelamento de encounter alheio.
- `admin_sistema` lendo dado clínico (break-glass).
- Cifra a nível de coluna (revisável).
- Restore de encounter cancelado.
- Importação CSV/XLSX clínica.
- Funcionário/financeiro lendo qualquer conteúdo clínico.
- Dashboards/relatórios clínicos.
- Cópia de UI/textos de Feegow ou concorrentes.

---

## 11. Referências

- `docs/adr/0010-clinical-encounters-medical-record-v0.md` (esta sprint)
- `docs/adr/0009-clinical-architecture-roles-read-audit.md`
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- `docs/adr/0007-safe-patient-duplicate-resolution.md`
- `docs/adr/0001-product-direction-option-c.md`
- `docs/clinical-architecture-and-permissions.md`
- `docs/security-notes.md`
- `docs/product-clinic-os-roadmap.md`
- `docs/roadmap-next-phase.md`
- `docs/aws-provisioning-runbook-3.41B.md` (pausado)
