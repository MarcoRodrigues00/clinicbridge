# ADR 0015 — Catálogo de Serviços v0.1 + Camada Comercial (umbrella)

> **Status:** Aceita — 2026-05-27
>
> **Sprint:** 4.6A (docs/ADR-only)
>
> **Relacionado:**
> `docs/adr/0012-financial-module-v0.md` ·
> `docs/adr/0013-agenda-financial-integration-v0.md` ·
> `docs/adr/0014-management-reports-v0.md` ·
> `docs/insurance-billing-future-scope.md` (planejamento prévio) ·
> `docs/services-catalog-v0-scope.md` (operacional desta ADR) ·
> `docs/product-clinic-os-roadmap.md`
>
> **O que esta ADR autoriza:** docs e planejamento da Fase 4.6/4.7.
> **Nenhum código, schema ou migration foi criado nesta sprint.**

---

## 1. Contexto

O ClinicBridge tem hoje (pós-Sprints 4.4 + 4.5):

- Financeiro v0.1: cobranças **particulares** manuais (`pending → paid | canceled`).
  Valor, forma de pagamento e observações entradas à mão. Sem convênio, sem TUSS.
- Agenda v0.1: agendamentos com `profissional_id` + `patient_id` + `starts_at` +
  `status` + `administrative_notes` livres. Sem campo estruturado de "serviço".
- Pacientes: `patients.convenio` + `patients.numero_carteirinha` como texto livre
  herdado de CSV — sem entidade estruturada de operadora ou plano.
- Relatórios v0.1: 4 relatórios gerenciais lendo as tabelas acima; sem corte por
  "tipo de serviço" ou "convênio" porque essas entidades não existem.

**Lacuna percebida por clínicas-piloto:**

> "Quero ver quantas consultas, sessões de fisio e procedimentos fiz este mês,
> quanto vem de particular e quanto de Unimed."

Para isso precisamos de (a) catálogo de serviços e (b) convênios estruturados.
São módulos distintos em maturidade e risco — esta ADR decide a arquitetura da
camada comercial e o faseamento.

---

## 2. Decisões desta ADR

### 2.1 Faseamento (decisão de roadmap)

A Fase 4.6 original estava marcada como "Convênios/faturamento básico". Após
análise de complexidade, **optamos por separar em três fases menores**:

| Fase | ADR | Natureza | Escopo |
|---|---|---|---|
| **4.6** | ADR 0015 (esta) | Operacional | Catálogo de Serviços v0.1 |
| **4.7** | ADR 0016 (futura) | Operacional + risco | Convênios manual básico v0.1 |
| **4.8** | ADR 0017 (futura) | Operacional | Estoque básico v0.1 |

**Motivação do split:**

- Serviços é pré-requisito para convênios (o convênio precisa saber qual
  serviço/procedimento está sendo coberto).
- Convênios adiciona três entidades novas e estende `financial_charges` com
  `payer_type`, `copay_amount_cents`, `insurance_amount_cents` — impacto maior.
- Estoque é independente de serviços e convênios; entrar junto aumenta risco.
- Fases menores = ADRs focadas, sprints gerenciáveis, QA por módulo.

> **Esta ADR** cobre inteiramente o **Catálogo de Serviços** e serve de umbrella
> conceitual para a camada comercial. Convênios terão ADR 0016 própria antes de
> qualquer código.

---

### 2.2 O que é um "serviço" no ClinicBridge

**Um serviço é uma etiqueta administrativa/comercial** que ajuda a clínica a:

- Dar contexto ao agendamento ("Consulta inicial", "Retorno", "Sessão de fisio").
- Referenciar a cobrança financeira sem copiar automaticamente o valor.
- Segmentar relatórios por tipo de atendimento.

**Um serviço NÃO é:**

- Um código de procedimento TUSS/CBHPM/ANS. (Nenhum código normativo.)
- Um item clínico — o serviço **não entra no prontuário** (ADR 0010).
- Uma linha de nota fiscal (NFS-e é fase futura própria).
- Uma definição de protocolo clínico (CID, queixa, conduta).
- Um trigger automático de preço — o valor da cobrança sempre é decidido pelo
  humano; o `price_cents` do serviço é só referência visual de tabela.

> **Invariante:** o campo `name` de um serviço é texto livre administrativo.
> Nunca contém diagnóstico, CID, queixa ou evolução clínica.
> Esses dados pertencem ao prontuário (ADR 0010).

---

### 2.3 Entidade `clinic_services`

```
id                uuid        PK DEFAULT gen_random_uuid()
clinica_id        uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
name              text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
category          text        NULL     -- "Consulta" | "Sessão" | "Exame" | "Procedimento" | "Outro" | livre
description       text        NULL     CHECK (length(description) <= 2000)
duration_minutes  integer     NULL     CHECK (duration_minutes > 0 AND duration_minutes <= 1440)
price_cents       integer     NULL     CHECK (price_cents >= 0)  -- preço de tabela; NULL = sem tabela
active            boolean     NOT NULL DEFAULT true
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()

UNIQUE (clinica_id, name) -- evita duplicata dentro da clínica
```

**Regras de negócio:**

- `clinica_id` — tenant isolation obrigatório. Serviço pertence a uma clínica;
  cross-clínica → 403/404 genérico.
- `active = false` = soft-delete. Serviço desativado some dos seletores de
  novo agendamento/nova cobrança, mas **permanece** nos registros históricos
  (agendamentos e cobranças já criados não são afetados).
- Sem delete físico — `price_cents` e `name` históricos precisam ser preservados
  para auditoria.
- `category` é texto livre com sugestões pré-definidas na UI; sem enum no banco
  (evita migration para cada categoria nova).
- `price_cents` NULL = "sem preço de tabela cadastrado" (legítimo). A UI exibe
  "—" para NULL.
- `UNIQUE (clinica_id, name)` — case-sensitive; a UI pode normalizar antes de
  salvar (ex.: trim, lowercase). Se a clínica precisar de dois serviços com
  nome idêntico mas parâmetros diferentes, deve diferenciar no nome (ex.:
  "Consulta 30min" vs "Consulta 50min").

---

### 2.4 Entidade `professional_services` (many-to-many)

```
professional_id   uuid        NOT NULL FK clinic_professionals(id) ON DELETE CASCADE
service_id        uuid        NOT NULL FK clinic_services(id) ON DELETE CASCADE
clinica_id        uuid        NOT NULL FK clinics(id) ON DELETE CASCADE   -- redundante mas reforça tenant
active            boolean     NOT NULL DEFAULT true
created_at        timestamptz NOT NULL DEFAULT now()

PRIMARY KEY (professional_id, service_id)
INDEX (clinica_id, service_id)   -- lookup de quem oferece este serviço
```

**Regras:**

- Relacionamento optional — profissional pode existir sem serviços vinculados.
  O campo `professional_id` em `appointments` continua funcional independente de
  `professional_services`.
- `active = false` = soft-delete no vínculo (sem delete físico).
- Um serviço pode ter zero, um ou vários profissionais.
- Um profissional pode ter zero, um ou vários serviços.
- A UI usa essa tabela para sugerir serviços compatíveis ao criar agendamento
  (filtro: `service.active = true AND ps.professional_id = :id AND ps.active = true`).
  Se o profissional não tiver serviço cadastrado, o campo é opcional — não bloqueia
  a criação do agendamento.
- **Tenant:** `professional_id` e `service_id` devem ambos pertencer à mesma
  `clinica_id`. Validação no service backend.

---

### 2.5 Integração com Agenda (`appointments.service_id`)

```sql
ALTER TABLE appointments
  ADD COLUMN service_id uuid NULL
  REFERENCES clinic_services(id) ON DELETE SET NULL;
```

**Regras:**

- `NULL` = agendamento sem serviço especificado (permite no v0.1).
- Agendamentos existentes ficam com `service_id = NULL` — **nenhuma migração de dados**.
- Ao criar/editar agendamento, a UI oferece selector de serviços ativos da clínica
  (opcionalmente filtrado pelo profissional selecionado via `professional_services`).
- **Não propaga** duração automaticamente — `starts_at`/`ends_at` continuam entrados
  pelo usuário. `duration_minutes` do serviço é só sugestão visual.
- **Não propaga** preço automaticamente para a cobrança financeira.
- `ON DELETE SET NULL` — desativar/não deleta o serviço; se o serviço for removido
  fisicamente (não vai acontecer por soft-delete, mas por segurança): agendamento
  fica com `service_id = NULL`.

---

### 2.6 Integração com Financeiro (`financial_charges.service_id`)

```sql
ALTER TABLE financial_charges
  ADD COLUMN service_id uuid NULL
  REFERENCES clinic_services(id) ON DELETE SET NULL;
```

**Regras:**

- `NULL` = cobrança sem serviço especificado (legítimo).
- A UI oferece selector de serviços ao criar/editar cobrança — opcional.
- **Nunca** copia `price_cents` do serviço para `amount_cents` da cobrança
  automaticamente. O humano sempre preenche o valor. O `price_cents` do serviço
  aparece como sugestão visual ("Tabela: R$ 150,00 — você pode ajustar").
- **Nunca** copia `service_id` do agendamento para a cobrança automaticamente.
  Se a cobrança for criada a partir de um agendamento (via botão "Criar cobrança"),
  o serviço pode ser pré-populado como sugestão, mas o humano confirma.
- Cobranças existentes ficam com `service_id = NULL`.
- `ON DELETE SET NULL` — mesma razão acima.

---

### 2.7 Permissões

Mesma política do Financeiro v0.1 (ADR 0012) — a camada de serviços é
**administrativa**, não clínica:

| Papel | CRUD serviços | Ver serviços | Vincular profissional | Ver relatório por serviço |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (puro) | ✅ | ✅ | ✅ (se não owner-only) | ✅ |
| `secretaria + gestor_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria + profissional_clinico` | ❌ CRUD | ✅ | ❌ | ❌ financeiro |
| `profissional_clinico` (só clínico) | ❌ | ✅ (seletor agenda) | ❌ | ❌ |
| `admin_sistema` | ❌ (cross-tenant proibido) | ❌ | ❌ | ❌ |

**Rationale:** CRUD de catálogo de serviços é ação gerencial — impacta a tabela de
preços e a categorização de receita. Seguiremos `requireRole(CLINIC_ADMIN_ROLES)`
para escrita e `requireRole(...)` amplo para leitura (seletor de agendamento).

> Nota: `profissional_clinico` **pode ver** o seletor de serviços ao criar
> agendamento porque ele agenda no painel clínico. Mas não **gerencia** o catálogo.

---

### 2.8 Endpoints da API (planejamento para 4.6B)

```
GET    /services               # lista serviços ativos da clínica (com paginação)
POST   /services               # cria serviço (dono + secretaria)
GET    /services/:id           # detalhe do serviço
PATCH  /services/:id           # edita nome/category/description/duration/price/active
DELETE /services/:id           # soft-delete (active=false) — sem delete físico

GET    /services/:id/professionals           # profissionais vinculados
POST   /services/:id/professionals           # vincula profissional
DELETE /services/:id/professionals/:profId   # desativa vínculo (active=false)
```

**Pipeline de autenticação:** `patientsRateLimit → requireAuth → requireClinic →
requireRole(CLINIC_ADMIN_ROLES)` para escrita; `requireRole(...)` amplo para
`GET` (inclui seletor de agendamento).

**Não existem** endpoints de delete físico.

---

### 2.9 Relatórios por serviço (extensão 4.5 no futuro)

Quando `clinic_services` existir, os relatórios gerenciais (ADR 0014) poderão
ser estendidos com:

- **R-A estendido:** agendamentos por serviço (top 5 serviços / período).
- **R-B estendido:** receita por serviço (sum `amount_cents` where
  `financial_charges.service_id = :id AND status = 'paid'`).
- **R-D estendido:** agenda × financeiro por serviço.

**Fora do v0.1 de relatórios:** ranking de serviços por profissional, comparativo
mês a mês por serviço, relatório de tabela de preços. Isso entra em 4.5 quando
os dados existirem.

---

### 2.10 Cenário-piloto multi-especialidade

A clínica-piloto tem: médico clínico + psicóloga + possível odontóloga.

**Catálogo de serviços ilustrativo:**

| Nome | Categoria | Profissional | Duração | Preço tabela |
|---|---|---|---|---|
| Consulta médica | Consulta | Dr. Fulano | 30 min | R$ 200,00 |
| Consulta de retorno | Consulta | Dr. Fulano | 20 min | R$ 150,00 |
| Sessão de psicologia | Sessão | Dra. Beltrana | 50 min | R$ 180,00 |
| Avaliação psicológica | Avaliação | Dra. Beltrana | 60 min | R$ 250,00 |

- Cada profissional tem serviços próprios vinculados (`professional_services`).
- Ao agendar com Dr. Fulano, o seletor de serviço oferece apenas "Consulta médica" e
  "Consulta de retorno" (filtrado por `professional_services.professional_id`).
- O relatório R-A pode mostrar: "Consulta médica: 32 agendamentos | Sessão de
  psicologia: 18 agendamentos" no período.

---

### 2.11 UX futura (não implementar antes de 4.6C)

- **Cadastro de serviços** (aba "Equipe → Serviços" ou aba própria no Dashboard):
  lista com nome, categoria, preço de tabela, duração, profissionais vinculados.
  Botões: Novo, Editar, Desativar.
- **Seletor no agendamento:** campo opcional "Serviço" — dropdown de serviços ativos,
  filtrado pelo profissional selecionado. Badge de duração como sugestão.
- **Seletor na cobrança financeira:** campo opcional "Serviço" — dropdown de serviços
  ativos; exibe preço de tabela como sugestão visual (não auto-preenche o valor).
- **Relatórios:** filtro/agrupamento por serviço nas abas de agenda e financeiro.

---

### 2.12 Convênios (escopo de ADR 0016 — sumário conceitual)

Esta ADR **não implementa** convênios. O planejamento detalhado está em
`docs/insurance-billing-future-scope.md`. Aqui registramos as entidades que a
ADR 0016 deverá decidir:

| Entidade | Propósito |
|---|---|
| `insurance_providers` | Cadastro de operadoras da clínica (Unimed, Bradesco, etc.) |
| `patient_insurance_plans` | Plano do paciente (número da carteirinha, validade) |
| `appointment_insurance_authorizations` | Autorização de procedimento (número emitido pela operadora) |

E extensões de tabelas existentes:

| Tabela | Colunas adicionais | ADR |
|---|---|---|
| `financial_charges` | `payer_type`, `insurance_provider_id`, `copay_amount_cents`, `insurance_amount_cents` | ADR 0016 |
| `appointments` | `payer_type` (opcional — se quiser saber a forma na agenda) | ADR 0016 |

> **Gate para ADR 0016:** Sprint 4.6 (Catálogo de Serviços) entregue e estabilizada.
> Convênios **dependem de serviços** (a autorização é de um serviço específico).

---

### 2.13 Fora do escopo desta ADR e das fases 4.6–4.8

Os itens abaixo exigem ADR separada com análise regulatória/jurídica:

- **TISS/TUSS real** (Troca de Informação em Saúde Suplementar / Terminologia ANS):
  XML/SOAP; homologação por operadora; licenciamento TUSS. **ADR futura pós-4.7.**
- **Código ANS de operadora** — `insurance_providers.ans_code` pode ser campo
  informativo no v0.1; submissão eletrônica é fase futura.
- **CBHPM / tabela de procedimentos CBHPM** — sem vínculo normativo no v0.1.
- **NFS-e** (Nota Fiscal de Serviços Eletrônica) — exige análise por município.
- **Gateway de pagamento** (Pix automático, débito automático, cobrança recorrente).
- **Repasse automático** ao médico ou convênio.
- **Lote de faturamento ANS** e reconciliação automática de glosa.
- **Autorização prévia eletrônica** (ePrior, operadora-a-operadora).
- **Medicamentos controlados** (SNGPC/ANVISA) — pertence ao Estoque v0.1+ (ADR 0017).
- **ICP-Brasil** com força legal para documentos de convênio.

---

### 2.14 Segurança e LGPD

#### 2.14.1 Classificação de dados

| Dado | Classificação | Tratamento |
|---|---|---|
| `name` do serviço | Administrativo | OK em UI; nunca contém dado clínico |
| `price_cents` | Financeiro administrativo | OK em UI; sem restrição |
| `category`, `description` | Administrativo | Aviso: nunca dado clínico/CID |
| `professional_services` | Vínculo administrativo | OK; sem dado sensível |

#### 2.14.2 Invariantes de segurança

- **Tenant isolation** por `clinica_id` em `clinic_services` e
  `professional_services`. Cross-tenant → 404 genérico (anti-enumeração).
- **Sem delete físico** — soft-delete via `active = false`.
- **Audit de escrita** — criação, edição, desativação de serviço geram evento
  em `audit_logs` (`acao='service.created'|'service.updated'|'service.deactivated'`).
  Sem audit de leitura dedicado (catálogo é administrativo — mesmo padrão ADR 0012).
- **PII:** campo `name` e `description` do serviço **nunca contêm** nome de paciente,
  CPF, dado clínico ou queixa. A UI exibirá aviso: *"Não inclua dados pessoais do
  paciente neste campo."*
- **Logger redaction:** nenhum campo novo de `clinic_services` requer redação.
  Campos de convênio (futuro) — `member_number` e `authorization_number` — serão
  listados em `logger.ts` redaction quando a ADR 0016 for implementada.
- **LGPD:** `clinic_services` não contém dado pessoal; `professional_services` vincula
  um profissional da clínica (não é dado do paciente — tratamento normal).
  Quando convênios chegarem (`patient_insurance_plans`), a tabela conterá dado pessoal
  do paciente e deverá ser incluída no export LGPD art. 18.

---

### 2.15 Migrações

**Sprint 4.6B** criará uma migration única aditiva com:

1. Tabela `clinic_services`.
2. Tabela `professional_services`.
3. `ALTER TABLE appointments ADD COLUMN service_id uuid NULL REFERENCES ...`.
4. `ALTER TABLE financial_charges ADD COLUMN service_id uuid NULL REFERENCES ...`.
5. Índices necessários.

**Sem migração de dados** para agendamentos ou cobranças existentes — colunas
`service_id` ficarão `NULL` em registros históricos.

**Não há migration para `patients.convenio` / `patients.numero_carteirinha`** —
esses campos permanecem como texto livre até a ADR 0016 (Convênios), que pode
importar os dados para `patient_insurance_plans`.

---

## 3. Alternativas consideradas

### 3.1 Manter serviços + convênios na mesma Fase 4.6

**Rejeitada** — uma única sprint com cinco tabelas novas, extensões de duas
tabelas existentes e UX em três módulos (agenda, financeiro, pacientes) seria
muito ampla para QA adequado. O split reduz risco por fase.

### 3.2 Usar `category` como enum no banco

**Rejeitada** — as categorias variam por especialidade (médico generalista ≠
odontologia ≠ fisioterapia). Texto livre com sugestões na UI é mais flexível e
não exige migration para cada nova categoria.

### 3.3 Auto-propagar `price_cents` para `amount_cents` ao criar cobrança

**Rejeitada** — o preço real cobrado pode diferir da tabela (negociação, convênio,
desconto). Auto-propagação criaria expectativa errada e audit confuso. O humano
sempre decide o valor da cobrança.

### 3.4 Não ter Catálogo de Serviços (usar apenas `administrative_notes` livre)

**Rejeitada** — sem entidade estruturada não é possível segmentar relatórios por
tipo de serviço, vincular profissional a serviços oferecidos, ou preparar a base
para convênios (que necessitam do conceito de "serviço autorizado").

---

## 4. Critérios de aceitação (Sprint 4.6A)

Esta sprint é **docs/ADR-only**. Critérios:

- [ ] ADR 0015 criada e aceita pelo dono.
- [ ] `docs/services-catalog-v0-scope.md` criado com checklist de implementação.
- [ ] `CLAUDE.md` atualizado: estado atual = Sprint 4.6A entregue.
- [ ] `docs/project-state.md` atualizado com Sprint 4.6A.
- [ ] `docs/sprint-history.md` com entrada 4.6A.
- [ ] `docs/roadmap-next-phase.md` e `docs/product-clinic-os-roadmap.md` atualizados
      com a nova numeração 4.6/4.7/4.8.
- [ ] `docs/insurance-billing-future-scope.md` marcado como pré-planejamento
      (supersedido pela ADR 0015/0016).
- [ ] `git diff --check` rc=0.
- [ ] **Zero mudanças de código, schema, migration ou env.**

---

## 5. Referências

- ADR 0012 — `docs/adr/0012-financial-module-v0.md`
- ADR 0013 — `docs/adr/0013-agenda-financial-integration-v0.md`
- ADR 0014 — `docs/adr/0014-management-reports-v0.md`
- Planejamento prévio convênios — `docs/insurance-billing-future-scope.md`
- Roadmap Clinic OS — `docs/product-clinic-os-roadmap.md`
- Segurança — `docs/security-notes.md`
- Estado do projeto — `docs/project-state.md`
