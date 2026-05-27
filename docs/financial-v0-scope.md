# ClinicBridge — Módulo Financeiro v0.1 (escopo operacional)

> Companheiro operacional da **ADR 0012**
> (`docs/adr/0012-financial-module-v0.md`). A ADR decide;
> este documento lista **checklists, tabelas e cheat-sheets** consultáveis
> durante a Sprint 4.4B (implementação backend).
>
> **Sprint 4.4A — docs/ADR-only.** Nada aqui autoriza código. Implementação
> técnica fica para a 4.4B (gate: ADR 0012 aceita pelo dono).
>
> **Relacionado:** ADR 0012, ADR 0009, ADR 0008, ADR 0007,
> `docs/clinical-architecture-and-permissions.md`, `docs/security-notes.md`,
> `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`.

---

## 1. Resumo executivo

| Item | Valor |
|---|---|
| **Módulo** | Financeiro |
| **Versão** | v0.1 |
| **Sprint conceitual** | 4.4A (ADR 0012 — entregue 2026-05-27) |
| **Sprint de implementação backend** | 4.4B (ainda não iniciada) |
| **Sprint de implementação frontend** | 4.4C (após 4.4B aprovada) |
| **Tabelas novas** | 1 (`financial_charges`) |
| **Endpoints novos** | 8 (ver §5) |
| **Roles novas** | Nenhuma — reutiliza `dono_clinica`, `secretaria`, `gestor_clinica` |
| **Migração de dados** | Não no v0.1 |
| **Middleware de autorização** | `requireRole` (administrativo) — **não** `requireClinicalRole` |
| **Audit de leitura dedicado** | Não no v0.1 — apenas `audit_logs` de escrita |
| **Migração estritamente aditiva** | 1 tabela nova + índices; sem coluna em tabela existente |
| **Ambiente de validação** | Local + staging local (Docker Compose) |
| **Trilha AWS** | Continua pausada; sem impacto novo no provisionamento |

---

## 2. Ciclo de vida de uma cobrança

```
          +----------+
    ────► | pending  | ──── PATCH (atualizar descrição/vencimento enquanto pending)
          +----------+
              │   │
              │   └── POST /cancel ──► +-----------+
              │                        | canceled  |
              │                        +-----------+
              │
              └── POST /mark-paid ──► +------+
                                      | paid |
                                      +------+
```

**Regras de transição:**

- `pending → paid`: `POST /financial/charges/:id/mark-paid`; requer `payment_method`
  (obrigatório); `paid_at` default `now()`.
- `pending → canceled`: `POST /financial/charges/:id/cancel`; `cancel_reason` opcional
  (texto livre ≤ 200 chars).
- Cobranças `paid` ou `canceled` são **imutáveis** — sem PATCH.
- **Sem transição reversa.** Invariante.
- **Sem restore.** `canceled` é terminal.
- **Sem delete físico.** Invariante.

---

## 3. Campos da cobrança

| Campo | Tipo | Obrigatório | Limite | Imutabilidade |
|---|---|---|---|---|
| `id` | uuid PK | — | — | — |
| `clinica_id` | uuid FK clinics | Sim | — | Imutável |
| `patient_id` | uuid FK patients | Sim | — | Imutável após criação |
| `appointment_id` | uuid FK scheduling? | Não | — | Editável em pending |
| `created_by_user_id` | uuid FK users | Sim (injetado) | — | Imutável |
| `description` | text | Sim | 500 chars | Editável em pending |
| `amount_cents` | integer | Sim | > 0 | Editável em pending |
| `currency` | text | Sim ('BRL') | — | Imutável |
| `due_date` | date? | Não | — | Editável em pending |
| `status` | text | Sim | `pending`\|`paid`\|`canceled` | Só via transição |
| `paid_at` | timestamptz? | — | — | Preenchido em mark-paid |
| `paid_by_user_id` | uuid? | — | — | Preenchido em mark-paid |
| `payment_method` | text? | — | allowlist | Preenchido em mark-paid |
| `cancel_reason` | text? | Não | 200 chars | Preenchido em cancel |
| `canceled_at` | timestamptz? | — | — | Preenchido em cancel |
| `canceled_by_user_id` | uuid? | — | — | Preenchido em cancel |
| `notes` | text? | Não | 500 chars | Editável em pending; **sem dado clínico** |
| `created_at` | timestamptz | — | — | Imutável |
| `updated_at` | timestamptz | — | — | Auto |

**`payment_method` allowlist:** `cash` · `pix` · `card` · `bank_transfer` · `other`.

---

## 4. Matriz de permissões — operação × role

Autoritativa para o v0.1 (cópia da ADR 0012 §7.3).

Legenda: ✅ permitido · 👁️ visualização · ❌ bloqueado

| Operação | `dono_clinica` | `secretaria` | `gestor_clinica` | `profissional_clinico` | `admin_sistema` |
|---|---|---|---|---|---|
| Criar cobrança (`POST /financial/charges`) | ✅ | ✅ | ❌ (v0.1) | ❌ | ❌ |
| Listar cobranças (`GET /financial/charges`) | ✅ | ✅ | 👁️ | ❌ | ❌ |
| Ver detalhe (`GET /financial/charges/:id`) | ✅ | ✅ | 👁️ | ❌ | ❌ |
| Editar pending (`PATCH /financial/charges/:id`) | ✅ | ✅ | ❌ (v0.1) | ❌ | ❌ |
| Marcar como pago (`POST .../mark-paid`) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cancelar (`POST .../cancel`) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Totalizadores (`GET /financial/summary`) | ✅ | ✅ | 👁️ | ❌ | ❌ |
| Cobranças do paciente (`GET /patients/:id/charges`) | ✅ | ✅ | 👁️ | ❌ | ❌ |
| Cross-tenant (qualquer) | 404 genérico | 404 | 404 | — | — |

**Regras-chave:**

1. Módulo financeiro usa **`requireRole`** (administrativo) — **não** `requireClinicalRole`.
2. `profissional_clinico` **sem acesso ao financeiro** por padrão no v0.1 — prevenção de inferências cruzadas.
3. `gestor_clinica` pode visualizar e operar (pagar/cancelar) mas não cria cobranças no v0.1.
4. `admin_sistema` bloqueado por `requireClinic`.
5. Cross-tenant → 404 genérico (anti-enumeração, mesmo padrão do restante do produto).

---

## 5. Endpoints — cheat sheet

| Método | Path | Role mínima | Audit escrita |
|---|---|---|---|
| POST | `/financial/charges` | `dono_clinica` \| `secretaria` | `financial.charge.created.success` |
| GET | `/financial/charges` | + `gestor_clinica` | — |
| GET | `/financial/charges/:id` | + `gestor_clinica` | — |
| PATCH | `/financial/charges/:id` | `dono_clinica` \| `secretaria` | `financial.charge.updated.success` |
| POST | `/financial/charges/:id/mark-paid` | + `gestor_clinica` | `financial.charge.paid.success` |
| POST | `/financial/charges/:id/cancel` | + `gestor_clinica` | `financial.charge.canceled.success` |
| GET | `/financial/summary` | + `gestor_clinica` | — |
| GET | `/patients/:id/charges` | + `gestor_clinica` | — |

Todos exigem `patientsRateLimit → requireAuth → requireClinic → requireRole(...)`.

Prefixo: `/financial/`. O endpoint `/patients/:id/charges` fica no router de patients.

Códigos de erro padrão:
- 400 `financial_charge_invalid` — payload inválido
- 400 `charge_not_pending` — tentativa de PATCH/mark-paid/cancel em paid ou canceled
- 400 `payment_method_required` — mark-paid sem `payment_method`
- 403 `forbidden_role` — role sem acesso
- 404 `patient_not_found` — paciente inexistente, arquivado, mesclado ou cross-tenant
- 404 `charge_not_found` — cobrança inexistente ou cross-tenant
- 401 — sem token

---

## 6. Catálogo de eventos de audit

### 6.1 Escrita (em `audit_logs` existente — sem migration)

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `financial.charge.created.success` | cobrança criada | `financial_charge` | UUID da cobrança |
| `financial.charge.updated.success` | cobrança `pending` editada | `financial_charge` | UUID da cobrança |
| `financial.charge.paid.success` | cobrança marcada como paga | `financial_charge` | UUID da cobrança |
| `financial.charge.canceled.success` | cobrança cancelada | `financial_charge` | UUID da cobrança |

**Sem PII em nenhum campo.** Sem `description`, `amount_cents`, `notes`, `cancel_reason` em `audit_logs`.
Falha de audit de escrita **aborta a transação** — mesmo padrão das ADRs 0007, 0010, 0011.

### 6.2 Leitura

**v0.1 sem `financial_read_audit` dedicado.** Módulo financeiro é administrativo, não clínico.
`audit_logs` de escrita é suficiente para rastreabilidade operacional no v0.1.

---

## 7. Logger redaction — campos de cobrança

A Sprint 4.4B deve estender o `logger.ts` com os caminhos:

```
description, notes, cancel_reason              (top-level)
*.description, *.notes, *.cancel_reason        (1-level wildcard)
body.description, req.body.description         (2-level nested)
payload.description, payload.notes, ...
```

Campos seguros para logar: `status`, `currency`, `payment_method` (allowlist), `recurso_id`.

---

## 8. Modelo de dados — cheat sheet

### 8.1 Tabela `financial_charges` (migration `20260604000000_financial_charges_v0.ts`)

```text
id                    uuid PK            gen_random_uuid()
clinica_id            uuid NOT NULL      FK clinics(id) ON DELETE CASCADE
patient_id            uuid NOT NULL      FK patients(id) ON DELETE RESTRICT
appointment_id        uuid NULL          FK scheduling(id) ON DELETE SET NULL
created_by_user_id    uuid NOT NULL      FK users(id) ON DELETE RESTRICT
description           text NOT NULL      CHECK length(description) >= 1 AND length(description) <= 500
amount_cents          integer NOT NULL   CHECK amount_cents > 0
currency              text NOT NULL DEFAULT 'BRL'  CHECK currency = 'BRL'
due_date              date NULL
status                text NOT NULL DEFAULT 'pending'
                                         CHECK status IN ('pending','paid','canceled')
paid_at               timestamptz NULL
paid_by_user_id       uuid NULL          FK users(id) ON DELETE SET NULL
payment_method        text NULL          CHECK payment_method IN ('cash','pix','card','bank_transfer','other')
cancel_reason         text NULL          CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 200)
canceled_at           timestamptz NULL
canceled_by_user_id   uuid NULL          FK users(id) ON DELETE SET NULL
notes                 text NULL          CHECK (notes IS NULL OR length(notes) <= 500)
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()

-- Consistency CHECKs:
CHECK (status != 'paid'     OR (paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL AND payment_method IS NOT NULL))
CHECK (status != 'canceled' OR (canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL))
CHECK (status  = 'pending'  OR (paid_at IS NULL OR canceled_at IS NULL))
```

### 8.2 Índices

```text
idx_financial_charges_clinica_patient_created    (clinica_id, patient_id, created_at DESC)
idx_financial_charges_clinica_status_due         (clinica_id, status, due_date)
idx_financial_charges_clinica_created            (clinica_id, created_at DESC)
idx_financial_charges_appointment                (appointment_id) WHERE appointment_id IS NOT NULL
```

### 8.3 O que NÃO muda no schema atual

- `clinical_encounters`, `clinical_documents`, `clinical_read_audit`,
  `user_clinical_roles`, `patients`, `users`, `clinics`, `audit_logs`,
  `scheduling` — sem coluna nova.

Migration da 4.4B é **estritamente aditiva** (1 tabela + índices).

---

## 9. Impacto do merge B-safe (ADR 0007)

| Cenário | Comportamento v0.1 |
|---|---|
| Criar cobrança para `status='archived'` | 404 `patient_not_found` |
| Criar cobrança para `merged_into_id IS NOT NULL` | 404 `patient_not_found` |
| Cobranças do paciente secundário (mesclado) | permanecem sob `patient_id` original — sem migração automática |
| Merge B-safe mover cobranças? | **NÃO no v0.1** — fora de escopo |
| `GET /patients/:id/charges` | retorna só cobranças desse `patient_id` |

---

## 10. Checklist Sprint 4.4B (implementação backend)

### 10.1 Migration

- [ ] `20260604000000_financial_charges_v0.ts` (ou timestamp do dia da 4.4B)
- [ ] Tabela `financial_charges` completa (campos, FKs, CHECK constraints)
- [ ] 4 índices nomeados `idx_financial_charges_*`
- [ ] `down` faz `DROP TABLE financial_charges` (reverter limpo)
- [ ] `pnpm --filter backend migrate:latest` sem erro
- [ ] `pnpm --filter backend migrate:status` mostra migration como `done`

### 10.2 Tipos

- [ ] `backend/src/types/db.d.ts` — `FinancialChargeRow` com todos os campos

### 10.3 DAO

- [ ] `financialChargeDao.ts`:
  - [ ] `create(input)` — INSERT com `status='pending'`; `clinica_id` injetado
  - [ ] `findByIdForClinic(id, clinicaId)` — filtro tenant
  - [ ] `listForClinic(clinicaId, filters)` — filtros: `patient_id`, `status`, `date_from`, `date_to`, `limit`, `offset`
  - [ ] `updatePending(id, clinicaId, updates)` — CAS: só `status='pending'`; sem `DELETE`
  - [ ] `markPaid(id, clinicaId, userId, paymentMethod, paidAt)` — CAS `WHERE status='pending'`
  - [ ] `cancel(id, clinicaId, userId, reason?)` — CAS `WHERE status='pending'`
  - [ ] `summarize(clinicaId, dateFrom, dateTo)` — query de totalizadores
  - [ ] **Sem `DELETE`** — invariante
  - [ ] **Sem `UPDATE`** em cobranças `paid` ou `canceled`

### 10.4 Service

- [ ] `financialChargeService.ts`:
  - [ ] `create` — valida `patient_id` ativo+não-mesclado; valida `appointment_id` (mesma clínica, se presente); valida `amount_cents > 0`; valida tamanhos; emite audit
  - [ ] `list` — delega ao DAO com filtros validados
  - [ ] `getDetail` — delega ao DAO; retorna cobrança completa com `notes`
  - [ ] `update` — valida `status='pending'`; emite audit
  - [ ] `markPaid` — valida `payment_method` ∈ allowlist; emite audit
  - [ ] `cancel` — valida `status='pending'`; emite audit
  - [ ] `summary` — delega ao DAO; valida `date_from`/`date_to`

### 10.5 Controller + rotas

- [ ] `routes/financialCharges.ts` — 8 endpoints (§5 acima); rate limit herdado
- [ ] Montagem em `app.ts`
- [ ] Validação de input no edge; service faz lógica

### 10.6 Logger

- [ ] Estender redation com: `description`, `notes`, `cancel_reason`
- [ ] Confirmar que `payload.description` e `payload.notes` são cobertos
- [ ] Rodar grep de vazamento pós-smoke; confirmar N/N PASS antes do commit

### 10.7 Smoke tests (script em `/tmp/`)

- [ ] Sem token → 401 ✅
- [ ] `secretaria` cria cobrança → 201/pending ✅
- [ ] Lista cobranças → 200 ✅
- [ ] Detalhe → 200 com `notes` ✅
- [ ] Editar pending (description/amount/due_date) → 200 ✅
- [ ] Marcar como pago (payment_method: 'pix') → 200/paid ✅
- [ ] Tentar editar cobrança paga → 400/charge_not_pending ✅
- [ ] Tentar marcar pago novamente → 400/charge_not_pending ✅
- [ ] Criar segunda cobrança → cancelar → 200/canceled ✅
- [ ] Tentar cancelar cobrança já cancelada → 400/charge_not_pending ✅
- [ ] Totalizadores `GET /financial/summary` → 200 com campos esperados ✅
- [ ] Cobranças do paciente `GET /patients/:id/charges` → 200 ✅
- [ ] `gestor_clinica` lista → 200 ✅
- [ ] `gestor_clinica` tenta criar → 403 ✅
- [ ] `gestor_clinica` marca como pago → 200 ✅
- [ ] `profissional_clinico` → 403 em todos endpoints ✅
- [ ] `admin_sistema` → 403/no_clinic_context ✅
- [ ] `amount_cents = 0` → 400 ✅
- [ ] `amount_cents < 0` → 400 ✅
- [ ] `payment_method` inválido → 400 ✅
- [ ] `patient_id` inexistente → 404 ✅
- [ ] `patient_id` arquivado → 404 ✅
- [ ] Cross-tenant → 404 ✅

### 10.8 SQL checks pós-teste

```sql
-- 0 linhas (paid sem paid_at)
SELECT count(*) FROM financial_charges WHERE status='paid' AND paid_at IS NULL;
-- 0 linhas (paid sem payment_method)
SELECT count(*) FROM financial_charges WHERE status='paid' AND payment_method IS NULL;
-- 0 linhas (canceled sem canceled_at)
SELECT count(*) FROM financial_charges WHERE status='canceled' AND canceled_at IS NULL;
-- audit de escrita presente
SELECT acao, recurso, recurso_id FROM audit_logs
  WHERE acao LIKE 'financial.charge.%' ORDER BY criado_em DESC LIMIT 10;
-- sem dados financeiros em logs de aplicação
-- (grep description/notes/cancel_reason nos logs do backend)
```

### 10.9 Limpeza

- [ ] Cobranças sintéticas dos smoke tests removidas (ou marcadas claramente)
- [ ] `audit_logs` preservados (append-only)
- [ ] Build/typecheck OK: `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅
- [ ] Sem commit automático

### 10.10 Documentação (4.4B)

- [ ] `CLAUDE.md` (sprint atual, migration, endpoints, restrições críticas)
- [ ] `docs/project-state.md`
- [ ] `docs/sprint-history.md`
- [ ] `docs/security-notes.md` (estender seção financeira com guardrails)
- [ ] `docs/testing-checklist.md` (bloco Sprint 4.4B)

---

## 11. Checklist Sprint 4.4C (implementação frontend — após 4.4B)

- [ ] Aba **"Financeiro"** no app shell (`/app`, junto com Pacientes, Agenda, Equipe)
- [ ] Cards de totalizadores: Em aberto / Recebido (mês) / Atrasado
- [ ] Lista de cobranças com filtros: Status / Período / Paciente
- [ ] Botão "+ Nova cobrança" (dono + secretaria; gestor não vê)
- [ ] Formulário de criação: Paciente (busca), Descrição, Valor, Vencimento?, Observações?
  - [ ] Aviso visível: "Não inclua diagnóstico ou informações clínicas em Observações"
- [ ] Card de cobrança: descrição, valor, status badge, vencimento, ações inline
- [ ] Modal "Marcar como pago": método (obrigatório), data (default hoje)
- [ ] Confirmação antes de cancelar cobrança
- [ ] Seção "Cobranças do paciente" no cadastro administrativo (lista resumida + "Ver todas")
- [ ] `staleTime: 0` para listas e detalhes de cobranças
- [ ] Sem `dangerouslySetInnerHTML`; valores em centavos formatados no frontend (`R$ 250,00`)
- [ ] 401/403 → mensagem genérica segura
- [ ] Linguagem conforme ADR 0012 §10.3 ("Cobranças", "Em aberto", "Marcar como pago")

---

## 12. Validações — cheat sheet

| Regra | Onde | Erro |
|---|---|---|
| `patient_id` ativo + não-mesclado | service | 404 `patient_not_found` |
| `patient_id` mesma clínica | DAO (filtro tenant) | 404 |
| `appointment_id` mesma clínica (se presente) | service | 400 `financial_charge_invalid` |
| `amount_cents > 0` | DB CHECK + service | 400 `financial_charge_invalid` |
| `currency = 'BRL'` | DB CHECK | 400 |
| `description` ∈ [1, 500] chars | DB CHECK + service | 400 |
| `notes` ≤ 500 chars (se presente) | DB CHECK + service | 400 |
| `cancel_reason` ≤ 200 chars (se presente) | DB CHECK + service | 400 |
| `payment_method` ∈ allowlist | DB CHECK + service | 400 |
| `status == 'pending'` para PATCH, mark-paid, cancel | service | 400 `charge_not_pending` |
| `payment_method` presente em mark-paid | service | 400 `payment_method_required` |
| Cross-tenant | DAO (filtro `clinica_id`) | 404 genérico |

**Rate limit:** reutiliza `patientsRateLimit` (mesmo padrão de módulo financeiro = operacional).

---

## 13. Fora de escopo do v0.1 — lista rápida

- Nota fiscal eletrônica (NFS-e) / ISS.
- Boleto bancário; Pix automático / QR dinâmico; gateway de pagamento.
- Conciliação bancária; SPED; DRE completa; fluxo de caixa projetado.
- Contas a pagar (só contas a receber no v0.1).
- Split de pagamento / repasse médico.
- Planos/assinaturas de pacientes.
- Faturamento TISS/TUSS / convênios (Fase 4.6).
- Relatórios avançados (Fase 4.5).
- Reembolso formal / chargeback.
- Integração com maquininha de cartão.
- Export contábil (SPED, etc.).
- Upload de comprovante de pagamento.
- Dados clínicos (diagnóstico, CID, evolução) em `notes` — proibido por invariante.
- Parcialmente pago / em disputa.
- Notificações / alertas de inadimplência.
- `profissional_clinico` com acesso ao financeiro (revisável em v0.2).
- `financeiro_clinica` role (ADR 0009 §4, não implementada — revisável em v0.2).

---

## 14. Referências

- `docs/adr/0012-financial-module-v0.md` (esta sprint)
- `docs/adr/0009-clinical-architecture-roles-read-audit.md`
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- `docs/adr/0007-safe-patient-duplicate-resolution.md`
- `docs/clinical-architecture-and-permissions.md`
- `docs/medical-documents-v0-scope.md`
- `docs/security-notes.md`
- `docs/product-clinic-os-roadmap.md`
- `docs/roadmap-next-phase.md`
