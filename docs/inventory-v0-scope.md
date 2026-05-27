# ClinicBridge — Estoque v0.1: Escopo Operacional

> Documento operacional da Sprint 4.8A (docs/ADR-only).
> Fonte de verdade arquitetural: `docs/adr/0017-inventory-v0.md`.
> Roadmap: `docs/product-clinic-os-roadmap.md` §"Fase 4.8".
> Histórico de sprints: `docs/sprint-history.md`.

---

## 1. Objetivo

Controle manual de entrada e saída de materiais e insumos da clínica.
A secretaria ou o dono registram movimentações (entrada, saída, ajuste, perda).
O sistema exibe quantidade atual e alerta quando abaixo do mínimo configurado.

**Princípio central:** humano decide toda movimentação — sem dedução automática.

---

## 2. O que entra no v0.1

| Feature | Incluído | Observação |
|---|---|---|
| Cadastro de item (nome, categoria, unidade, mín.) | ✅ | Owner-only CRUD |
| Campo `location` (localização física) | ✅ | Nullable, informativo |
| Campo `notes` por item | ✅ | Adm.; sem dado clínico |
| Soft-delete de item (`active = false`) | ✅ | Histórico preservado |
| Movimentação manual: entrada / saída / ajuste / perda | ✅ | Secretaria + dono |
| Campo `reason` por movimento | ✅ | Nullable, texto livre adm. |
| Atualização de `current_quantity` via service (transação) | ✅ | Sem trigger de banco |
| Alerta visual de estoque mínimo | ✅ | `current_quantity < minimum_quantity` |
| Histórico de movimentos por item | ✅ | Append-only, sem delete |
| Filtro de movimentos por tipo / data | ✅ | 4.8B/C |
| Listagem de itens ativos com indicador de alerta | ✅ | 4.8C |
| Audit metadata-only por movimentação | ✅ | `item_id`, `movement_type`, `quantity_delta` |

## 3. O que NÃO entra no v0.1

| Feature | Status | ADR necessária |
|---|---|---|
| Medicamentos controlados (SNGPC/ANVISA) | ❌ permanente v0.1 | ADR futura (pós-4.8 estabilizado) |
| Rastreabilidade de lote e validade (força legal) | ❌ permanente v0.1 | ADR futura |
| Código de barras / RFID | ❌ permanente v0.1 | ADR futura |
| Cadastro de fornecedor / pedido de compra / NF-e | ❌ permanente v0.1 | ADR futura |
| Custo de compra / custo médio ponderado | ❌ permanente v0.1 | ADR futura |
| Integração contábil | ❌ permanente v0.1 | ADR futura |
| Dedução automática por serviço ou agendamento | ❌ permanente v0.1 | ADR de automação |
| Prontuário de consumo por paciente (`patient_id`) | ❌ permanente | Proibido sem ADR clínica |
| Import CSV de inventário inicial | ❌ v0.1 | Pode entrar no v0.2 se houver demanda |
| Notificação de estoque mínimo (push/email) | ❌ v0.1 | Sprint futura com infraestrutura |
| Relatório de custo de material por período | ❌ v0.1 | Aguarda campo de custo |
| Integração com ANVISA / distribuidoras | ❌ permanente | ADR regulatória futura |

---

## 4. Entidades (resumo — detalhe na ADR 0017 §3)

### `inventory_items`

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `clinica_id` | uuid NOT NULL FK | tenant-scoped |
| `name` | text NOT NULL | 1..120 chars; UNIQUE (clinica_id, lower(btrim(name))) |
| `category` | text NULL | ≤ 80 chars |
| `unit` | text NOT NULL | 1..40 chars ("caixa", "unidade", "frasco") |
| `current_quantity` | integer NOT NULL DEFAULT 0 | ≥ 0; atualizado pelo service |
| `minimum_quantity` | integer NOT NULL DEFAULT 0 | ≥ 0; limiar de alerta |
| `location` | text NULL | ≤ 120 chars; informativo |
| `notes` | text NULL | ≤ 500 chars; nunca dado clínico |
| `active` | boolean NOT NULL DEFAULT true | soft-delete |
| `created_at` / `updated_at` | timestamptz | — |

### `inventory_movements`

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `clinica_id` | uuid NOT NULL FK | tenant-scoped |
| `item_id` | uuid NOT NULL FK | ON DELETE CASCADE |
| `movement_type` | text NOT NULL | CHECK IN ('entry','exit','adjustment','loss') |
| `quantity_delta` | integer NOT NULL | ≠ 0; positivo=entrada; negativo=saída/perda |
| `reason` | text NULL | ≤ 300 chars; nunca dado clínico; nunca em audit |
| `created_by_user_id` | uuid NOT NULL FK | ON DELETE SET NULL |
| `created_at` | timestamptz NOT NULL | — |

**Append-only** — sem UPDATE ou DELETE. Correção = novo movimento de ajuste.

---

## 5. Permissões (resumo — detalhe na ADR 0017 §4)

| Operação | `dono_clinica` | `secretaria` | `profissional` |
|---|---|---|---|
| CRUD de itens | ✅ | ❌ | ❌ |
| Registrar movimentos | ✅ | ✅ | ❌ |
| Ver estoque e histórico | ✅ | ✅ | ❌ |

- `requireRole(['dono_clinica'])` para escrita de itens.
- `requireRole(['dono_clinica', 'secretaria'])` (excluindo profissional_clinico puro)
  para movimentos e leitura.
- Mesmo padrão do Financeiro v0.1 e Convênios v0.1.

---

## 6. Invariantes de segurança

- **Tenant:** `clinica_id` em todo DAO. Sem `listAll`. Cross-tenant → 403.
- **Sem delete físico:** `inventory_items` usa soft-delete. `inventory_movements` é
  append-only (sem delete, sem update).
- **PII:** nenhum campo PII de paciente nas entidades de estoque. `notes` e `reason`
  nunca contêm dado clínico (aviso de UI obrigatório).
- **Audit metadata-only:** `inventory.item.create.success`, `.update.success`,
  `.status.update.success`, `inventory.movement.create.success`. Campos registrados:
  `item_id`, `movement_type`, `quantity_delta`. `reason` e `notes` **nunca no audit**.
- **Concorrência em `current_quantity`:** `SELECT FOR UPDATE` na transação do service.
  Rejeitar movimento de saída/perda que causaria quantidade negativa → 409
  `inventory_quantity_insufficient`.
- **`requireAuth + requireClinic + requireRole`** em todo endpoint.

---

## 7. Checklist de implementação

### Sprint 4.8B — Backend

- [ ] Migration única aditiva `20260607_inventory_v0`:
  - [ ] Tabela `inventory_items` com constraints e índices.
  - [ ] Tabela `inventory_movements` com CHECK de `movement_type` e `quantity_delta`.
  - [ ] Índices parciais tenant-scoped.
- [ ] `db.d.ts` — tipos `InventoryItem`, `InventoryMovement`, payloads.
- [ ] `inventoryItemDao.ts` — `create`, `list` (filtros: `active`, busca por nome),
  `getById`, `update`, `setStatus` (soft-delete).
- [ ] `inventoryMovementDao.ts` — `create` (append-only), `listByItem`, `listByClinic`
  (filtros: `item_id`, `movement_type`, date range).
- [ ] `inventoryService.ts` — lógica de negócio:
  - `createItem` (owner-only, validação de nome duplicado case-insensitive → 409 `inventory_item_name_duplicated`).
  - `updateItem` (owner-only).
  - `setItemStatus` (soft-delete owner-only).
  - `createMovement`: validação `quantity_delta ≠ 0`; transação `SELECT FOR UPDATE`
    em `inventory_items`; atualiza `current_quantity`; rejeita se < 0 para exit/loss
    → 409 `inventory_quantity_insufficient`; cria movimento; audit metadata-only.
  - `listItems`, `getItem`, `listMovements`.
- [ ] `inventoryController.ts` — recebe HTTP, valida input, chama service. Sem SQL.
- [ ] `routes/inventory.ts` — `patientsRateLimit + requireAuth + requireClinic + requireRole`.
- [ ] Registrar router em `app.ts`.
- [ ] Smoke tests curl: auth/permissão/tenant/CRUD/movimentação/quantidade negativa.
- [ ] `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 18/0 ✅.
- [ ] `git diff --check` rc=0.

### Sprint 4.8C — Frontend

- [ ] `InventoryPanel.tsx` — nova aba "Estoque" no Dashboard.
- [ ] Lista de itens com badge de alerta (vermelho quando `current_quantity < minimum_quantity`).
- [ ] Formulário de criação/edição de item (owner-only — botões ocultos para secretaria).
- [ ] Formulário de movimentação (disponível para dono e secretaria).
- [ ] Seletor de `movement_type` com labels PT-BR ("Entrada" / "Saída" / "Ajuste" / "Perda").
- [ ] Histórico de movimentos por item (colapsável ou em aba interna).
- [ ] Aviso de UI nos campos `notes`/`reason`: "Não incluir paciente, diagnóstico ou dado clínico."
- [ ] Card "Acesso restrito" para profissional_clinico (403 tratado sem derrubar tela).
- [ ] API funcs em `api.ts` (≥ 7 funções: CRUD items + movement + list).
- [ ] React Query keys: `['inventory', 'items']`, `['inventory', 'items', id]`,
  `['inventory', 'items', id, 'movements']`.
- [ ] Invalidação de queries após movimentação.
- [ ] `pnpm --filter frontend typecheck` ✅ · `build` ✅.
- [ ] `git diff --check` rc=0.

### Sprint 4.8D — QA/Hardening

- [ ] Smoke API: matriz papel × operação × tenant (auth, CRUD, permissão, cross-tenant,
  quantidade negativa, UUID inválido, payload-safety).
- [ ] SQL check: `SELECT COUNT(*) FROM inventory_items WHERE clinica_id IS NULL;` → 0.
- [ ] Grep frontend: sem PII de paciente, sem `console.log` de `reason`/`notes`.
- [ ] Audit: confirmar que `reason` e `notes` não aparecem em `audit_logs`.
- [ ] `pnpm --filter frontend typecheck` ✅ · `build` ✅ · `pnpm --filter backend typecheck` ✅ · `build` ✅.
- [ ] `migrate:status` 18/0 ✅.
- [ ] `git diff --check` rc=0.

---

## 8. Decisões técnicas abertas (resolver em 4.8B)

| Questão | Opção A | Opção B | Preferência atual |
|---|---|---|---|
| Atualizar `current_quantity` | Service em transação (SELECT FOR UPDATE) | Trigger de banco | **Opção A** (mais testável, controle de erro no service) |
| Rejeitar quantity negativa | Validação no service (409) | Constraint CHECK no banco | **Opção A** (v0.1; CHECK no banco no v0.2 se houver evidência) |
| Endpoint de listagem geral | `GET /inventory/movements` separado | Só por item `GET /inventory/items/:id/movements` | **Ambos** (um para visão geral, outro por item) |
| Rate limit | Reusar `patientsRateLimit` existente | Limit dedicado | **Reusar** (mesma clínica, mesmo perfil de uso) |

---

## 9. Gate de abertura de 4.8B

- [x] ADR 0017 aceita ✅
- [x] `docs/inventory-v0-scope.md` criado ✅
- [x] `CLAUDE.md` atualizado ✅
- [x] `docs/project-state.md` atualizado ✅
- [x] `docs/sprint-history.md` atualizado ✅
- [x] `docs/roadmap-next-phase.md` atualizado ✅
- [x] `docs/product-clinic-os-roadmap.md` atualizado ✅
- [x] `git diff --check` rc=0 ✅
- [x] Zero mudanças de código, schema, migration ou env ✅

---

## 10. Referências

- ADR 0017 — `docs/adr/0017-inventory-v0.md`
- ADR 0012 — `docs/adr/0012-financial-module-v0.md`
- ADR 0015 — `docs/adr/0015-services-catalog-commercial-layer-v0.md`
- ADR 0016 — `docs/adr/0016-insurance-billing-v0.md`
- Roadmap Clinic OS — `docs/product-clinic-os-roadmap.md`
- Histórico de sprints — `docs/sprint-history.md`
- Estado do projeto — `docs/project-state.md`
