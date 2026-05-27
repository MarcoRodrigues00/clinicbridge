# ADR 0017 — Estoque básico v0.1

> **Status:** Aceita — 2026-05-27
>
> **Sprint:** 4.8A (docs/ADR-only)
>
> **Relacionado:**
> `docs/adr/0012-financial-module-v0.md` ·
> `docs/adr/0015-services-catalog-commercial-layer-v0.md` ·
> `docs/adr/0016-insurance-billing-v0.md` ·
> `docs/inventory-v0-scope.md` (operacional desta ADR) ·
> `docs/product-clinic-os-roadmap.md`
>
> **O que esta ADR autoriza:** docs e planejamento da Fase 4.8.
> **Nenhum código, schema, migration ou endpoint foi criado nesta sprint.**

---

## 1. Contexto

O ClinicBridge tem hoje (pós-Sprint 4.7D):

- **Catálogo de Serviços v0.1:** `clinic_services` com nome, categoria, duração e
  preço de tabela; `professional_services` vinculando profissional × serviço.
  Serviço é etiqueta administrativa — sem TUSS/CBHPM, sem prontuário.

- **Convênios v0.1:** `insurance_providers`, `insurance_plans`, `patient_insurances`,
  `service_insurance_prices`; extensão de `financial_charges` com `payer_type`,
  `copay_amount_cents`, `insurance_amount_cents`. Camada manual sem TISS/TUSS.

- **Financeiro v0.1:** cobranças com ciclo `pending → paid | canceled`, suporte a
  payer_type (particular/convênio/misto). Módulo administrativo.

- **Relatórios v0.1:** 4 relatórios gerenciais de Agenda, Financeiro, Pacientes,
  Agenda × Financeiro. Leitura de tabelas existentes, sem nova tabela.

**Lacuna percebida:**

> "Preciso saber quanto de gaze, seringas e luvas ainda tenho em estoque antes
> de fazer a compra do mês. E quando uma caixa entra ou sai, quero registrar."

Clínicas pequenas (médico, psicóloga, odontóloga) consomem insumos e materiais
administrativos que precisam de rastreamento básico: quantidade atual, mínimo de
alerta, entradas e saídas manuais. Sem isso, o controle é feito em planilha ou
papel — fora do sistema.

**Por que agora (pós-Convênios v0.1):**

O Catálogo de Serviços (ADR 0015) foi declarado como pré-requisito para Convênios
(ADR 0016) e também é o contexto natural para Estoque — cada serviço pode
consumir materiais. A sequência 4.6 → 4.7 → 4.8 foi decidida na ADR 0015 §1.

---

## 2. Decisão central

**Estoque v0.1 = controle manual de entrada/saída de materiais e insumos.**

- Cadastro de itens (nome, categoria, unidade, quantidade atual, mínimo de alerta).
- Movimentação manual: entrada (`entry`), saída (`exit`), ajuste de inventário
  (`adjustment`), perda/descarte (`loss`).
- Alerta visual de estoque mínimo na UI.
- **Humano decide** toda movimentação — sem dedução automática por serviço ou
  agendamento.

**O que NÃO é Estoque v0.1:**

- Medicamentos controlados (SNGPC / RDC ANVISA / receituário azul e amarelo).
- Rastreabilidade obrigatória de lote e validade com fins regulatórios.
- Código de barras ou integração com leitor.
- Cadastro de fornecedor, pedido de compra ou nota fiscal de entrada.
- Integração com contabilidade ou custo médio ponderado.
- Prescrição ou relação com prontuário.
- Dedução automática de estoque ao registrar um serviço ou agendamento.
- Integração com qualquer sistema externo (distribuidora, operadora, ANVISA).

---

## 3. Entidades conceituais (implementação em 4.8B+)

As entidades abaixo são **conceituais nesta ADR**. Nenhum schema ou migration
existe até a Sprint 4.8B. Os campos são orientativos — a implementação pode
ajustar tamanhos e constraints sem nova ADR, desde que os invariantes de
segurança e negócio sejam mantidos.

### 3.1 `inventory_items` — catálogo de itens de estoque

```
id                uuid        PK DEFAULT gen_random_uuid()
clinica_id        uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
name              text        NOT NULL  -- "Gaze 10x10cm", "Luva M"
                                        -- CHECK char_length(btrim(name)) BETWEEN 1 AND 120
category          text        NULL      -- "Material cirúrgico", "EPI", "Administrativo"
                                        -- CHECK char_length(btrim(category)) <= 80
unit              text        NOT NULL  -- "caixa", "unidade", "frasco", "par"
                                        -- CHECK char_length(btrim(unit)) BETWEEN 1 AND 40
current_quantity  integer     NOT NULL  DEFAULT 0   -- atualizado por trigger ou service
                                        -- CHECK current_quantity >= 0 (v0.1; ajuste futuro)
minimum_quantity  integer     NOT NULL  DEFAULT 0   -- limiar de alerta visual
                                        -- CHECK minimum_quantity >= 0
location          text        NULL      -- "Sala 1 / armário 2"; informativo
                                        -- CHECK char_length(btrim(location)) <= 120
notes             text        NULL      -- observações administrativas
                                        -- CHECK char_length(notes) <= 500
                                        -- AVISO: nunca incluir paciente, diagnóstico, CID
active            boolean     NOT NULL  DEFAULT true
created_at        timestamptz NOT NULL  DEFAULT now()
updated_at        timestamptz NOT NULL  DEFAULT now()

UNIQUE INDEX (clinica_id, lower(btrim(name)))  -- case-insensitive, tolerante a espaços
INDEX (clinica_id, active)                     -- lookup de itens ativos da clínica
```

**Regras:**
- Tenant-scoped. Cada clínica gerencia seu próprio catálogo.
- Soft-delete via `active = false`. Desativar não apaga histórico de movimentos.
- `current_quantity` é atualizado pelo service a cada movimentação (não por
  trigger no v0.1). Implementação com transação atômica para evitar race condition.
- `notes` é texto livre administrativo — **nunca** deve conter diagnóstico, CID,
  queixa clínica, nome de paciente ou dado clínico.
- Itens desativados aparecem no histórico de movimentos mas não no selector ativo.

### 3.2 `inventory_movements` — registro de movimentações

```
id                 uuid        PK DEFAULT gen_random_uuid()
clinica_id         uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
item_id            uuid        NOT NULL FK inventory_items(id) ON DELETE CASCADE
movement_type      text        NOT NULL  -- CHECK IN ('entry','exit','adjustment','loss')
quantity_delta     integer     NOT NULL  -- positivo = entrada; negativo = saída/perda/ajuste
                                        -- CHECK quantity_delta <> 0
reason             text        NULL      -- motivo livre, administrativo
                                        -- CHECK char_length(reason) <= 300
                                        -- AVISO: nunca incluir paciente, diagnóstico, CID
created_by_user_id uuid        NOT NULL FK users(id) ON DELETE SET NULL
created_at         timestamptz NOT NULL  DEFAULT now()

INDEX (clinica_id, item_id)              -- histórico por item
INDEX (clinica_id, created_at DESC)      -- listagem recente por clínica
INDEX (clinica_id, created_by_user_id)   -- movimentos por usuário
```

**Regras:**
- **Append-only** — sem UPDATE ou DELETE. Uma movimentação errada é corrigida por
  outro movimento de ajuste (`adjustment`).
- `quantity_delta`:
  - `entry` → delta positivo (ex.: +50 unidades recebidas).
  - `exit` → delta negativo (ex.: −10 unidades consumidas).
  - `adjustment` → positivo ou negativo (acerto de inventário).
  - `loss` → delta negativo (descarte, vencimento, quebra).
- `reason` é texto livre administrativo — **nunca** deve conter dado clínico.
- `created_by_user_id` usa `ON DELETE SET NULL` para preservar o histórico mesmo
  se o membro sair da clínica.
- `item_id` usa `ON DELETE CASCADE` porque o histórico está vinculado ao item;
  na prática o item nunca é deletado fisicamente (soft-delete via `active`).
- Audit de escrita = metadata-only: `item_id`, `movement_type`, `quantity_delta`.
  `reason` **nunca** entra no audit log.

---

## 4. Permissões

O módulo de estoque é **administrativo**, seguindo o padrão do Catálogo de
Serviços (ADR 0015) e do Financeiro (ADR 0012). Não usa `requireClinicalRole`.

| Papel | Gerenciar itens (CRUD) | Registrar movimentos | Ver estoque (read) | Ver relatórios |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (puro) | ❌ CRUD | ✅ (rotina adm.) | ✅ | ✅ (se `effectiveFinancialAccess` ≥ transact) |
| `secretaria + gestor_clinica` | ❌ CRUD | ✅ | ✅ | ✅ |
| `secretaria + profissional_clinico` | ❌ | ❌ | ❌ | ❌ |
| `profissional_clinico` (só clínico) | ❌ | ❌ | ❌ | ❌ |
| `admin_sistema` | ❌ (cross-tenant proibido) | ❌ | ❌ | ❌ |

**Justificativas:**

- Criar e gerenciar o catálogo de itens é decisão gerencial (definir o que a
  clínica estoca, categorias, alertas). Requer `requireRole(['dono_clinica'])`.
- Registrar uma movimentação de entrada ou saída é rotina administrativa. A
  secretaria precisa registrar quando uma caixa de luvas chega ou quando material
  é retirado. Segue o padrão expandido de `requireRole`.
- `profissional_clinico` não tem acesso a dados operacionais de estoque —
  invariante da ADR 0012 §7.2 e ADR 0009 §5. Médico e psicóloga não precisam
  gerenciar inventário para atender.
- `admin_sistema` bloqueado em `requireClinic` como em toda entidade tenant-scoped.

**Endpoints mínimos previstos para 4.8B (orientativos):**

- `GET /inventory/items` · `POST /inventory/items` · `GET /inventory/items/:id` ·
  `PATCH /inventory/items/:id` · `PATCH /inventory/items/:id/status`
- `GET /inventory/items/:id/movements` · `POST /inventory/items/:id/movements`
- `GET /inventory/movements` (visão geral recente, filtros por item/tipo/data)

Nomes e formato final definidos na Sprint 4.8B.

---

## 5. LGPD e privacidade

### 5.1 Classificação de dados

| Dado | Classificação | Tratamento |
|---|---|---|
| Nome do item / categoria / unidade | Administrativo | OK em UI; nunca em logs |
| `current_quantity` / `minimum_quantity` | Operacional | OK em UI; sem restrição |
| `location` | Administrativo | OK em UI; nunca em logs |
| `notes` de `inventory_items` | Texto livre administrativo | Jamais dado clínico; aviso na UI |
| `movement_type` / `quantity_delta` | Operacional | OK em audit (metadata); sem restrição |
| `reason` de `inventory_movements` | Texto livre administrativo | Jamais dado clínico; **nunca em audit** |
| `created_by_user_id` | Referência interna | Resolve-se por JOIN; não expor nome em audit |

### 5.2 Invariantes LGPD

- `inventory_items` e `inventory_movements` **não contêm dado pessoal de paciente**.
  Não precisam ser incluídos no export LGPD art. 18 de pacientes.
- `created_by_user_id` é referência ao usuário da clínica, não ao paciente.
  Pode aparecer em relatórios internos sem restrição LGPD equivalente ao prontuário.
- Audit de escrita = metadata-only. Exemplo: `inventory.movement.create.success`
  com `recurso_id = <movement_id>`, `item_id`, `movement_type`, `quantity_delta`.
  `reason` e `notes` **nunca** entram no audit log.
- Sem audit de leitura dedicado no v0.1 — mesmo padrão do Financeiro (módulo
  administrativo, não clínico).

### 5.3 O que não entra em `notes` ou `reason`

Aviso a ser exibido na UI (mesmo padrão do Financeiro e Convênios):

> Não incluir: nome ou identificação de paciente, diagnóstico, CID,
> hipótese diagnóstica, queixa clínica, resultado de exame, nome de
> medicamento prescrito, tratamento ou evolução clínica.
> Esses dados pertencem ao prontuário clínico (ADR 0010).

---

## 6. Relação com outros módulos

### 6.1 Catálogo de Serviços (ADR 0015)

- Pré-requisito lógico: a ideia de que cada serviço consome materiais é natural,
  mas o **vínculo explícito serviço × item de estoque está fora do v0.1**.
- No v0.1, a secretaria registra saídas manualmente após um atendimento, se
  desejar — sem automação.
- Futuramente: `service_inventory_consumption` pode listar os materiais esperados
  por serviço (ADR futura). Não implementar sem demanda real.

### 6.2 Financeiro (ADR 0012)

- Custo de material por cobrança (`financial_charges.cost_cents`) está **fora do
  v0.1**. Não criar campo sem ADR.
- O inventário é camada operacional separada do financeiro no v0.1.

### 6.3 Convênios (ADR 0016)

- Sem relação direta no v0.1. Convênios são sobre pagamento; estoque é sobre
  material. Qualquer vínculo (ex.: "este material é coberto pelo convênio") exige
  ADR futura.

### 6.4 Prontuário e documentos clínicos (ADR 0010 / 0011)

- **Invariante absoluta:** `inventory_movements` nunca referencia `clinical_encounters`,
  `clinical_encounter_notes` ou `clinical_documents`.
- Medicamentos prescritos pertencem ao prontuário — **não ao estoque administrativo**.
- Medicamentos controlados (SNGPC/ANVISA) exigem ADR própria futura.

---

## 7. Fora do escopo — invariantes permanentes nesta ADR

Os itens abaixo **nunca serão implementados sem ADR separada** com análise
regulatória/jurídica:

- **Medicamentos controlados (SNGPC / RDC ANVISA):** rastreabilidade de lote,
  receituário azul e amarelo, integração com ANVISA — risco regulatório alto.
- **Rastreabilidade de lote e validade com força legal:** exige campo `lot_number`
  + `expiry_date` obrigatórios + relatório de lote por ANVISA.
- **Código de barras / RFID:** leitura automática, integração com leitor.
- **Cadastro de fornecedor, pedido de compra e nota fiscal de entrada (NF-e):**
  integração fiscal, DANFE, XML NF-e.
- **Custo médio ponderado e integração contábil.**
- **Dedução automática de estoque** ao finalizar um serviço, agendamento ou
  cobrança — humano decide toda movimentação no v0.1.
- **Integração com distribuidoras ou sistemas externos de saúde.**
- **Prontuário de consumo de material por paciente** (qualquer relação
  `inventory_movements.patient_id` é proibida no v0.1).
- **Import CSV/XLSX de inventário inicial** — pode ser avaliado em sprint futura
  se houver demanda real; não implementar especulativamente.

---

## 8. Riscos e decisões futuras

| Risco / Decisão | Versão | Observação |
|---|---|---|
| Medicamentos controlados (SNGPC/ANVISA) | ADR futura (pós-4.8 estabilizado) | Alto risco regulatório; integração ANVISA; receituário separado |
| Rastreabilidade de lote/validade | v0.2+ | Campos `lot_number` + `expiry_date` opcionais; força legal = ADR própria |
| Dedução automática por serviço | v0.2+ | Exige vínculo `service_inventory_consumption` + ADR de automação |
| Custo médio e integração contábil | ADR futura | Exige entidade de custo + análise de regras fiscais |
| Import CSV de inventário inicial | v0.2+ | Pode reusar pipeline de importação existente; ADR de extensão |
| Alerta de estoque mínimo por push/email | Sprint futura | Hoje = alerta visual na UI; notificação proativa exige infraestrutura |
| `current_quantity < 0` | v0.1 decisão técnica | Constraint `>= 0` sugerida; validar no service se `exit` causaria negativo → erro 409 |
| Concorrência em `current_quantity` | Implementação 4.8B | Usar transação + `SELECT FOR UPDATE` no service; não usar trigger no v0.1 |

---

## 9. Sequência de sprints (sugestão)

| Sprint | Escopo | Gate |
|---|---|---|
| **4.8A** ✅ | ADR 0017 — Estoque v0.1 (docs-only) | Sprint 4.7D ✅ |
| **4.8B** ⏳ | Backend: `inventory_items` + `inventory_movements` + DAOs + service + endpoints | ADR 0017 aceita ✅ |
| **4.8C** ⏳ | Frontend: aba Estoque + `InventoryPanel` (lista, movimentos, alerta mínimo) | 4.8B entregue |
| **4.8D** ⏳ | QA/hardening Estoque v0.1 | 4.8C entregue |

**Não no v0.1:** medicamentos controlados; lote/validade obrigatórios; código de barras;
fornecedor/NF; custo médio; dedução automática.

---

## 10. Alternativas consideradas

### 10.1 Usar `clinic_services` como catálogo de estoque

**Rejeitada** — serviços são etiquetas comerciais/administrativas (ADR 0015):
têm preço de tabela, duração, vínculo com profissional. Itens de estoque têm
quantidade, unidade, localização e historico de movimentação — semânticas
completamente diferentes. Misturar aumentaria complexidade e violaria a
invariante "serviço não é prontuário, não é estoque".

### 10.2 Incluir custo (preço de compra) no v0.1

**Rejeitada** — custo médio requer política contábil (FIFO/LIFO/médio),
integração com NF de entrada e possível impacto no Financeiro v0.1.
Aumenta escopo de forma desproporcional para o objetivo inicial (saber
o que tem em estoque). Campo `unit_cost_cents` pode entrar no v0.2 como
dado informativo, sem cálculo automático.

### 10.3 Forçar `current_quantity` por trigger de banco

**Rejeitada para v0.1** — trigger de banco é difícil de testar, depura mal e
pode entrar em conflito com a lógica de validação de quantidade negativa no
service. O service calcula e atualiza `current_quantity` em transação atômica
(`SELECT FOR UPDATE`). Trigger pode ser avaliado se houver evidência de
inconsistência em produção.

### 10.4 Permitir movimento vinculado a paciente (`patient_id`)

**Rejeitada** — vincularia estoque a dados de saúde de paciente (qual material
foi usado em quem), criando dado pessoal sensível sem ADR clínica. O v0.1 registra
saída de X unidades em determinada data, sem referência ao paciente atendido.

### 10.5 Implementar dedução automática ao finalizar agendamento

**Rejeitada** — exige configuração de "consumo padrão por serviço", automação
silenciosa de movimentações e tratamento de falha quando o item não existe ou
está zerado. Contraria o princípio "humano decide" (ADR 0008 §4, ADR 0015 §2,
ADR 0016 §2). Fica para sprint futura com ADR de automação.

---

## 11. Critérios de aceitação (Sprint 4.8A)

Esta sprint é **docs/ADR-only**. Critérios:

- [x] ADR 0017 criada e aceita.
- [x] `docs/inventory-v0-scope.md` criado com checklist de implementação.
- [x] `CLAUDE.md` atualizado: estado atual = Sprint 4.8A entregue.
- [x] `docs/project-state.md` atualizado com Sprint 4.8A.
- [x] `docs/sprint-history.md` com entrada 4.8A.
- [x] `docs/roadmap-next-phase.md` atualizado com Sprint 4.8A registrada.
- [x] `docs/product-clinic-os-roadmap.md` atualizado: Fase 4.7 ✅ completa, Fase 4.8A ✅.
- [x] `git diff --check` rc=0.
- [x] **Zero mudanças de código, schema, migration ou env.**

---

## 12. Referências

- ADR 0012 — `docs/adr/0012-financial-module-v0.md`
- ADR 0015 — `docs/adr/0015-services-catalog-commercial-layer-v0.md`
- ADR 0016 — `docs/adr/0016-insurance-billing-v0.md`
- Operacional desta ADR — `docs/inventory-v0-scope.md`
- Roadmap Clinic OS — `docs/product-clinic-os-roadmap.md`
- Segurança — `docs/security-notes.md`
- Estado do projeto — `docs/project-state.md`
