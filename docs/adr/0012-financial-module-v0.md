# ADR 0012 — Módulo Financeiro v0.1

- **Status:** Accepted
- **Data:** 2026-05-27
- **Decisores:** dono do produto (ClinicBridge)
- **Sprint:** 4.4A (docs/ADR-only — sem código, sem migration, sem AWS)
- **Habilitada por:** ADR 0011 (Documentos Médicos v0.1 implementado e com
  QA/hardening concluídos nas Sprints 4.3B–4.3D). Esta ADR consome os
  invariantes da ADR 0008 (Clinic OS modular) e da ADR 0001 (base
  administrativa segura).
- **Pré-requisitos cumpridos:**
  - ADR 0001 (Opção C — base administrativa segura).
  - ADR 0008 (Clinic OS modular — sem telemedicina).
  - ADR 0009 (arquitetura clínica, roles granulares, audit de leitura, LGPD).
  - ADR 0011 (Documentos Médicos v0.1) + Sprints 4.3B–4.3D: QA hardening validado.
- **Relacionado:**
  - `docs/financial-v0-scope.md` (companheiro operacional desta ADR)
  - `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
  - `docs/adr/0009-clinical-architecture-roles-read-audit.md`
  - `docs/clinical-architecture-and-permissions.md`
  - `docs/security-notes.md`, `docs/project-state.md`
  - `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`
- **Sprint seguinte:** **4.4B** — implementação backend (migration, DAOs,
  services, controllers, rotas, smoke tests). Esta ADR autoriza a abertura da
  4.4B; a 4.4B **só** começa depois desta ADR aceita pelo dono.

---

## 1. Contexto

A Fase 4.3 entregou o módulo de Documentos Médicos v0.1 — receitas simples,
atestados, declarações e orientações com PDF on-demand, ciclo de vida
draft/finalized/canceled, e audit de leitura clínica. O ClinicBridge tem
agora um núcleo clínico funcional mínimo: prontuário + documentos.

A próxima necessidade documentada pelos gestores de clínicas é o **controle
financeiro básico**: cobranças por consulta, registro de pagamentos e visão
do caixa do período. Hoje, clínicas pequenas fazem isso em cadernos, planilhas
ou registros informais fora do sistema. O resultado é falta de rastreabilidade,
dificuldade de cobrar inadimplentes e ausência de visão gerencial simples.

O ClinicBridge **não pretende ser um ERP completo** — o objetivo é oferecer
controle financeiro operacional simples e integrado ao fluxo administrativo
já existente (pacientes, agendamentos), sem virar um sistema de contabilidade,
faturamento TISS ou gateway de pagamentos.

Esta ADR (Sprint 4.4A) fecha as seguintes decisões **antes** de qualquer código:

- Objetivo e posicionamento do módulo financeiro no produto.
- Entidades conceituais e ciclo de vida de uma cobrança.
- Modelo de dados conceitual (tabela principal `financial_charges`).
- Escopo v0.1 — o que entra, o que fica fora.
- Permissões por role — separação clara de financeiro vs. clínico.
- Auditoria de escrita e postura de logs.
- LGPD — dados financeiros como dados pessoais.
- Diretrizes de UX para a sprint de frontend.
- Riscos principais e mitigações.
- Roadmap de sprints seguintes.

O ClinicBridge **não está pronto para produção** (ressalvas P1 em
`docs/security-notes.md`) e não tem dado real. A implementação (Sprint 4.4B)
ocorrerá em staging local com dados sintéticos.

## 2. Decisão — resumo dos compromissos

Esta ADR registra 11 compromissos arquiteturais.

1. **Uma entidade central:** `financial_charges` — cobrança financeira criada
   manualmente pelo operador. Representa o que o paciente deve (ou pagou) por
   uma consulta, procedimento ou serviço.
2. **Ciclo de vida simples:** `pending → paid | canceled`. Sem estados
   intermediários no v0.1 (sem "parcialmente pago", sem "em disputa").
3. **Sem delete físico.** Invariante. `canceled` é o estado final negativo.
   Nenhum `DELETE` no DAO.
4. **Tenant isolation obrigatória** por `clinica_id` em toda query. Sem
   `listAll`. Padrão idêntico ao já vigente em todos os módulos.
5. **Financeiro é administrativo — não clínico.** `financial_charges` **nunca**
   armazena diagnóstico, CID, evolução, prescrição ou qualquer dado textual de
   saúde. Separação de domínios é invariante desta ADR.
6. **Permissões:** `dono_clinica` e `secretaria` (papel administrativo existente)
   operam o financeiro; `gestor_clinica` pode visualizar e operar; `profissional_clinico`
   **não tem acesso** ao módulo financeiro por padrão no v0.1; `admin_sistema`
   bloqueado por `requireClinic`. Sem role nova (`financeiro_clinica`) no v0.1 —
   reutiliza papéis administrativos existentes.
7. **Audit de escrita** em `audit_logs` para create/update/mark_paid/cancel.
   Sem audit de leitura dedicado no v0.1 (diferente do módulo clínico) — decisão
   revisável em v0.2 se o produto crescer em sensibilidade.
8. **Logs sem `notes` administrativas** e sem valores monetários quando possível
   (minimização LGPD).
9. **Sem integração de pagamento** no v0.1: sem Pix automático, sem gateway,
   sem boleto. Registro manual de recebimento (`mark_paid`).
10. **UX simples:** aba "Financeiro" no app shell com lista de cobranças, cards
    de totais e ação rápida "Marcar como pago". Seção de cobranças do paciente
    dentro do perfil administrativo.
11. **Integração Agenda × Financeiro sem automação agressiva.** Uma cobrança
    pode estar vinculada a um agendamento (`appointment_id` opcional). O status
    financeiro é visível na agenda (badge), mas **nunca altera o status da consulta
    automaticamente** no v0.1. Humano decide. Alertas são sugestivos, não
    executivos. Automação configurável por clínica fica para a Sprint 4.4E.

Esta ADR **não autoriza dado financeiro real em produção** — só staging com
dados sintéticos depois da 4.4B implementar.

## 3. Objetivo e posicionamento do módulo

### 3.1 Problema que resolve

Clínicas pequenas e consultórios precisam de:
- Registro de cobranças por atendimento.
- Visão rápida de quanto receberam no período.
- Identificação de inadimplentes.
- Histórico financeiro por paciente.

Hoje fazem isso fora do sistema (planilha, caderno, pós-it) — sem auditoria,
sem integração com agendamento, sem rastreabilidade.

### 3.2 O que o v0.1 entrega

- Criar cobrança manual vinculada a paciente (obrigatório) e agendamento (opcional).
- Listar cobranças com filtros básicos (status, período, paciente).
- Marcar cobrança como paga (registro de data/método).
- Cancelar cobrança (sem delete físico).
- Totalizadores simples: em aberto, recebido no período, vencidos.
- Observações administrativas curtas por cobrança.
- Histórico financeiro do paciente na tela de cadastro.

### 3.3 O que **não** resolve (e não deve ser prometido)

O v0.1 **não é**:
- Sistema de emissão de nota fiscal.
- Gateway de pagamentos (Pix, boleto, cartão automático).
- Sistema de conciliação bancária.
- ERP ou sistema contábil.
- Sistema de faturamento TISS/TUSS ou convênios.
- Sistema de contas a pagar.

Esses recursos têm valor comercial real e são candidatos a sprints futuras
com ADR própria ou a integrações pagas. O v0.1 cria o modelo de dados e a UX
base que viabiliza essas evoluções.

## 4. Escopo v0.1 — o que está dentro

### 4.1 Operações suportadas

| Operação | Descrição |
|---|---|
| Criar cobrança | Operador cria cobrança com paciente, valor, descrição e vencimento |
| Listar cobranças | Lista com filtros: status, data, paciente, `appointment_id`; ordenação por `due_date` desc |
| Ver detalhe | Dados completos de uma cobrança (valor, método, pagamento, notas, agendamento vinculado) |
| Marcar como pago | Registra `paid_at`, `payment_method` e `paid_by_user_id` |
| Cancelar | Registra `canceled_at` + `cancel_reason`; sem delete físico |
| Totalizadores | Em aberto, recebido no período, atrasado (calculados em query) |
| Histórico por paciente | Cobranças do paciente na tela de cadastro administrativo |
| Cobranças por agendamento | Filtro `appointment_id` na listagem geral; ou endpoint dedicado `GET /financial/charges?appointment_id=` |

### 4.2 Ciclo de vida de uma cobrança

```
          +----------+
    ────► | pending  | ──────── PATCH (atualizar descrição/vencimento enquanto pending)
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

- `pending → paid`: `POST /financial/charges/:id/mark-paid`; requer
  `payment_method` (obrigatório) e `paid_at` (default `now()`); somente
  operadores autorizados.
- `pending → canceled`: `POST /financial/charges/:id/cancel`; `cancel_reason`
  opcional (texto curto ≤ 200 chars).
- Cobranças `paid` ou `canceled` são imutáveis (sem PATCH).
- **Sem transição reversa.** Invariante.
- **Sem restore.** `canceled` é terminal.

### 4.3 Campos da cobrança

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | uuid PK | — | gerado |
| `clinica_id` | uuid | Sim | tenant isolation |
| `patient_id` | uuid | Sim | FK patients — quem vai pagar |
| `appointment_id` | uuid? | Não | FK scheduling — agendamento vinculado (opcional) |
| `created_by_user_id` | uuid | Sim | operador que criou a cobrança |
| `description` | text | Sim | descrição do serviço (ex.: "Consulta clínica 27/05") |
| `amount_cents` | integer | Sim | valor em centavos (ex.: 25000 = R$ 250,00) |
| `currency` | text | Sim | default `'BRL'`; sem conversão no v0.1 |
| `due_date` | date? | Não | data de vencimento; NULL = sem vencimento definido |
| `status` | text | Sim | `pending` \| `paid` \| `canceled` |
| `paid_at` | timestamptz? | — | preenchido em `mark-paid` |
| `paid_by_user_id` | uuid? | — | quem registrou o pagamento |
| `payment_method` | text? | — | `cash` \| `pix` \| `card` \| `bank_transfer` \| `other`; obrigatório em `mark-paid` |
| `cancel_reason` | text? | — | motivo livre ≤ 200 chars; opcional em `cancel` |
| `notes` | text? | Não | observações administrativas ≤ 500 chars; não-clínico |
| `canceled_at` | timestamptz? | — | preenchido em `cancel` |
| `canceled_by_user_id` | uuid? | — | quem cancelou |
| `created_at` | timestamptz | — | auto |
| `updated_at` | timestamptz | — | auto |

**Regras invariantes:**

- `amount_cents > 0` — CHECK constraint. Sem cobranças zeradas.
- `currency = 'BRL'` no v0.1 — CHECK constraint.
- `notes` **nunca deve conter diagnóstico, CID, evolução ou dado clínico**.
  Aviso na UI. Sem validação automática de conteúdo (texto livre).
- `payment_method` é allowlist (CHECK constraint): `cash`, `pix`, `card`,
  `bank_transfer`, `other`.
- `status` é allowlist (CHECK constraint): `pending`, `paid`, `canceled`.
- `appointment_id`, se informado, deve pertencer à **mesma `clinica_id`** da
  cobrança e ao **mesmo `patient_id`** do agendamento — validação no service
  (400 `financial_charge_invalid`). Sem cruzamento de tenant. Sem cruzamento
  de paciente. Agendamento inexistente/cross-tenant → 400 genérico.

### 4.4 Totalizadores

Calculados em query (não persistidos):

- **Em aberto:** `SUM(amount_cents) WHERE status='pending' AND (due_date IS NULL OR due_date >= today)`.
- **Atrasados:** `SUM(amount_cents) WHERE status='pending' AND due_date < today`.
- **Recebido no período:** `SUM(amount_cents) WHERE status='paid' AND paid_at BETWEEN :from AND :to`.

Escopo do período: padrão = mês atual; filtros: `date_from`, `date_to`.

## 5. Fora de escopo do v0.1 — explícito

| Item | Onde fica |
|---|---|
| **Nota fiscal eletrônica (NFS-e)** | Fase futura com ADR própria; exige integração com prefeitura/ISS |
| **Boleto bancário** | Fase futura com ADR própria; exige gateway/banco |
| **Pix automático (cobrança/QR)** | Fase futura com ADR própria; exige BACEN/API bancária |
| **Gateway de pagamento** (Stripe, PagSeguro, Asaas, etc.) | Fase futura com ADR própria |
| **Conciliação bancária** | Fase futura; complexidade de ERP |
| **Split de pagamento / repasse médico complexo** | Fora do Clinic OS v0 — ADR futura |
| **Recorrência / assinatura / plano** | Fora do Clinic OS v0 |
| **Contas a pagar** | Fora do v0.1 — o lado "pagar" exige modelo diferente |
| **DRE / contabilidade completa** | Fora — ERP |
| **Faturamento TISS/TUSS / convênios** | Fase 4.6 com ADR própria |
| **Reembolso formal / chargeback** | Fora do v0.1 — modelo de cancelamento simples basta |
| **Integração com maquininha de cartão** | Fase futura com ADR própria |
| **Export contábil (SPED, etc.)** | Fora — ERP |
| **Relatórios avançados (DRE, fluxo de caixa projetado)** | Fase 4.5 relatórios gerenciais |
| **Financeiro multiunidade complexo** | Fora do Clinic OS v0 |
| **Dados clínicos em `notes`** | Invariante desta ADR — `notes` é campo administrativo |
| **Diagnóstico / CID no financeiro** | Proibido por design |
| **`admin_sistema` acessando cobranças** | Bloqueado por `requireClinic` |
| **Profissional vendo financeiro de outros pacientes** | Sem acesso a financeiro por padrão no v0.1 |
| **Parcialmente pago / em disputa** | Fora do v0.1 — ciclo de vida simples; revisável em v0.2 |
| **Confirmação automática de consulta por pagamento** | Fora do v0.1 — humano decide; alerta sugestivo na 4.4E; automação configurável por clínica fica para ADR aditiva |
| **Cancelamento automático de cobrança por cancelamento de consulta** | Fora do v0.1 — alerta ao operador (4.4E); sem automatismo |
| **Cancelamento automático de consulta por cancelamento de cobrança** | Fora do v0.1 — alerta ao operador (4.4E); sem automatismo |
| **Pré-reserva automática até pagamento** | Fora do v0.1 — ADR futura; exige workflow de expiração/liberação de slot |
| **Webhook de pagamento** | Fora do v0.1 — exige gateway; ADR futura |
| **Política configurável por clínica** (pagamento → confirmar consulta auto) | Sprint 4.4E ou posterior — ADR aditiva; v0.1 é manual |
| **Cópia de UI/textos de concorrentes** | Vedada (ADR 0008 §2.9) |

## 6. Modelo de dados conceitual

> **Sem migration nesta sprint.** Esta seção é a especificação que a 4.4B
> implementará. Nome sugerido para a migration:
> `20260604000000_financial_charges_v0.ts` (ou data real da 4.4B).

### 6.1 Tabela `financial_charges`

```text
financial_charges
  id                    uuid PK                gen_random_uuid()
  clinica_id            uuid NOT NULL          FK clinics(id) ON DELETE CASCADE
  patient_id            uuid NOT NULL          FK patients(id) ON DELETE RESTRICT
  appointment_id        uuid NULL              FK scheduling(id) ON DELETE SET NULL
  created_by_user_id    uuid NOT NULL          FK users(id) ON DELETE RESTRICT
  description           text NOT NULL          CHECK length(description) >= 1 AND length(description) <= 500
  amount_cents          integer NOT NULL       CHECK amount_cents > 0
  currency              text NOT NULL DEFAULT 'BRL'   CHECK currency = 'BRL'
  due_date              date NULL
  status                text NOT NULL DEFAULT 'pending'
                                               CHECK status IN ('pending','paid','canceled')
  paid_at               timestamptz NULL
  paid_by_user_id       uuid NULL              FK users(id) ON DELETE SET NULL
  payment_method        text NULL              CHECK payment_method IN ('cash','pix','card','bank_transfer','other')
  cancel_reason         text NULL              CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 200)
  canceled_at           timestamptz NULL
  canceled_by_user_id   uuid NULL              FK users(id) ON DELETE SET NULL
  notes                 text NULL              CHECK (notes IS NULL OR length(notes) <= 500)
  created_at            timestamptz NOT NULL DEFAULT now()
  updated_at            timestamptz NOT NULL DEFAULT now()

  -- Consistency CHECKs:
  CHECK (status != 'paid'     OR (paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL AND payment_method IS NOT NULL))
  CHECK (status != 'canceled' OR (canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL))
  CHECK (status  = 'pending'  OR (paid_at IS NULL OR canceled_at IS NULL))  -- não pode ter ambos

Indexes:
  idx_financial_charges_clinica_patient_created    (clinica_id, patient_id, created_at DESC)
  idx_financial_charges_clinica_status_due         (clinica_id, status, due_date)
  idx_financial_charges_clinica_created            (clinica_id, created_at DESC)
  idx_financial_charges_appointment                (appointment_id) WHERE appointment_id IS NOT NULL
```

**Notas de design:**

- `ON DELETE RESTRICT` em `patient_id` e `created_by_user_id`: histórico
  financeiro tem valor legal/contábil. Arquivar paciente (soft-delete) continua
  ok — o RESTRICT bloqueia apenas DELETE físico, que é proibido por invariante.
- `appointment_id ON DELETE SET NULL`: se agendamento for arquivado/deletado
  fisicamente (impossível com invariantes atuais), a cobrança sobrevive sem
  vínculo.
- `amount_cents` em inteiro (centavos) evita problemas de ponto flutuante.
  Formatação `R$ 250,00` fica na camada de apresentação.
- `notes` é campo administrativo. **Não deve conter dados clínicos.** Aviso
  na UI. Sem validação automática de conteúdo.
- Sem `soft_delete` extra — `status='canceled'` é o mecanismo de "descarte".

### 6.2 O que NÃO muda no schema atual

- `clinical_encounters`, `clinical_documents`, `clinical_read_audit`,
  `user_clinical_roles`, `patients`, `users`, `clinics`, `audit_logs` —
  sem coluna nova.
- `scheduling` (agendamentos) — sem coluna nova; `appointment_id` é referência
  externa.

Migration da 4.4B é **estritamente aditiva** (1 tabela nova + índices).

## 7. Permissões — modelo técnico

### 7.1 Princípio de separação financeiro × clínico

O módulo financeiro é **administrativo** — não herda `requireClinicalRole`.
Usa exclusivamente `requireAuth` + `requireClinic` + verificação de `papel`
do JWT (`requireRole` existente).

**Razão:** financeiro é operado pelos mesmos perfis que já gerenciam agendamentos
e cadastro — não exige o modelo de roles clínicas granulares da ADR 0009.
Manter a separação evita que dados clínicos "contaminem" o módulo financeiro.

### 7.2 Capacidade por role

| Role | Capacidade no módulo financeiro |
|---|---|
| `dono_clinica` | Acesso total: criar, listar, marcar como pago, cancelar, editar pending, ver totalizadores |
| `secretaria` | Acesso operacional: criar, listar, marcar como pago, cancelar, editar pending |
| `gestor_clinica` | Visualização + operação: listar, ver detalhe, marcar como pago, cancelar; **não** cria cobrança no v0.1 — revisável |
| `profissional_clinico` | **Sem acesso** ao módulo financeiro por padrão no v0.1 |
| `financeiro_clinica` | Role conceituada (ADR 0009 §4), **não implementada**; futuro v0.2 pode introduzir |
| `admin_sistema` | Bloqueado por `requireClinic` |

**Nota sobre `gestor_clinica`:** o gestor pode visualizar e operar (pagar/cancelar)
mas não cria cobranças no v0.1. Decisão revisável em v0.2 com ADR aditiva.

**Nota sobre `profissional_clinico`:** profissionais não têm acesso financeiro
por padrão — evita que o profissional veja cobranças de pacientes que não
atendeu ou inferências sobre situação financeira de outros pacientes. Decisão
revisável em v0.2 (ex.: profissional vê apenas cobranças de seus próprios
atendimentos via `appointment_id` vinculado a encontros seus).

### 7.3 Matriz de permissões — operação × role

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
| Cross-tenant (qualquer) | ❌ 404 | ❌ 404 | ❌ 404 | ❌ | ❌ |

## 8. Auditoria

### 8.1 Audit de escrita (em `audit_logs`)

Reusa schema existente sem migration.

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `financial.charge.created.success` | cobrança criada | `financial_charge` | UUID da cobrança |
| `financial.charge.updated.success` | cobrança `pending` editada | `financial_charge` | UUID da cobrança |
| `financial.charge.paid.success` | cobrança marcada como paga | `financial_charge` | UUID da cobrança |
| `financial.charge.canceled.success` | cobrança cancelada | `financial_charge` | UUID da cobrança |

**Regras invariantes:**

- Sem PII — só UUIDs. Sem `description`, sem `amount_cents`, sem `notes`,
  sem `cancel_reason` nos audit_logs.
- Falha de audit de escrita **aborta a transação** — mesmo padrão das ADRs
  0007, 0010, 0011.

### 8.2 Audit de leitura

**Decisão v0.1:** sem `financial_read_audit` dedicado — financeiro é
administrativo, não clínico. O padrão de audit de leitura estrita da ADR 0009
§6 aplica-se a dados de saúde; financeiro tem sensibilidade diferente.

`audit_logs` já registra `financial.charge.created/paid/canceled` — suficiente
para rastreabilidade operacional no v0.1. Revisável em v0.2 se a clínica exigir
log de quem viu quais cobranças.

### 8.3 Logger de aplicação

Campos a **não logar** (redaction existente ou a estender):

- `description` (pode conter informação sobre serviço clínico).
- `notes` (campo livre; pode conter PII inadvertidamente).
- `cancel_reason` (campo livre).
- `amount_cents` (valor financeiro — minimização LGPD; logar apenas em debug local se necessário).

Campos seguros para logar: `status`, `currency`, `payment_method` (é allowlist), `recurso_id`.

A Sprint 4.4B deve estender o `logger.ts` com os caminhos:

```
description, notes, cancel_reason          (top-level)
*.description, *.notes, *.cancel_reason    (1-level wildcard)
body.description, req.body.description,    (2-level nested)
payload.description, etc.
```

## 9. LGPD — postura para dados financeiros

Cobranças financeiras contêm **dados pessoais** (art. 5°, I da LGPD): nome
do paciente (via JOIN), valores, histórico de pagamentos. Não são dados
sensíveis de saúde (art. 11), mas são dados de natureza econômica com
potencial impacto em relações contratuais e disputas.

**Princípios aplicados:**

- **Minimização:** `notes` deve conter apenas o necessário para operação.
  Sem CID, diagnóstico ou dado clínico em `notes`.
- **Finalidade:** módulo financeiro para gestão operacional da clínica;
  não para análise de perfil de saúde do paciente.
- **Retenção:** sem política automática no v0.1. Política de retenção de
  registros financeiros exige orientação jurídica (obrigação fiscal mínima
  5 anos; disputas podem exigir mais).
- **Cancelamento sem apagar:** `status='canceled'` preserva histórico.
  Sem delete físico. Auditabilidade contábil.
- **Acesso restrito:** `profissional_clinico` não acessa financeiro por
  padrão — limitação de finalidade e prevenção de inferências cruzadas.
- **Export:** quando implementado, deve neutralizar formula injection
  (padrão já existente no export de pacientes).
- **Disputa com paciente:** histórico financeiro auditável é a principal
  proteção da clínica em caso de contestação. Invariante sem delete físico
  é diretamente ligado a isso.

## 10. Diretrizes de UX — Sprint 4.4C (frontend)

> Esta seção guia a sprint de frontend posterior à 4.4B. Não é implementação.

### 10.1 Posicionamento

- Aba **"Financeiro"** no app shell (nível de aba, junto com Pacientes, Agenda,
  Equipe) — diferente de Documentos (que ficou dentro do drawer clínico).
  Justificativa: financeiro é acessado por secretaria e gestor constantemente;
  não é vinculado a um paciente específico no caso geral.
- Dentro do cadastro do paciente: seção colapsável **"Cobranças do paciente"**
  com lista resumida e botão "Ver todas" que vai para a aba Financeiro com
  filtro de paciente pré-aplicado.

### 10.2 Visão principal

```
[Financeiro]
  ┌─────────────────────────────────────────────────────┐
  │  Em aberto       Recebido (mês)     Atrasado         │
  │  R$ 2.500,00     R$ 8.400,00        R$ 350,00        │
  └─────────────────────────────────────────────────────┘

  [+ Nova cobrança]  [Filtros: Status | Período | Paciente]

  ┌──────────────────────────────────────────────────────────┐
  │ Consulta clínica — Paciente X    R$ 250,00   Pendente    │
  │ Vence 30/05/2026                            [Pago] [...]  │
  ├──────────────────────────────────────────────────────────┤
  │ Retorno — Paciente Y             R$ 180,00   Pago        │
  │ Pago em 25/05 — PIX                                 [...] │
  └──────────────────────────────────────────────────────────┘
```

### 10.3 Linguagem da UI

Termos preferidos (clínica pequena, não ERP):

| Use | Evite |
|---|---|
| "Cobranças" | "Faturamento", "Fatura", "Invoice" |
| "Recebido" / "Pago" | "Receita", "Crédito" |
| "Em aberto" | "Devedor", "A receber" (menos claro para não-contadores) |
| "Vencido" / "Atrasado" | "Inadimplente" (conteúdo legal — evitar) |
| "Marcar como pago" | "Liquidar", "Baixar" (jargão contábil) |
| "Cancelar cobrança" | "Estornar", "Reverter" (implica gateway) |
| "Valor" ou "R$ ..." | "Montante", "Valor bruto" |
| "Dinheiro" | "Espécie" |

### 10.4 Formulário de nova cobrança

Campos obrigatórios no formulário:
1. Paciente (busca por nome — mesmo padrão do agendamento).
2. Descrição (ex.: "Consulta clínica 27/05").
3. Valor (formatado como moeda; enviado como centavos ao backend).

Campos opcionais:
4. Agendamento vinculado (dropdown dos agendamentos recentes do paciente).
5. Data de vencimento.
6. Observações (aviso: "Não inclua diagnóstico ou informações clínicas aqui").

### 10.5 Ação "Marcar como pago"

Modal simples:
1. Método de pagamento (obrigatório): Dinheiro / PIX / Cartão / Transferência / Outro.
2. Data do pagamento (default = hoje).
3. Confirmação.

Sem campo de comprovante no v0.1 (upload exigiria validação de arquivo/MIME).

### 10.6 Cobrança vinculada a agendamento — visibilidade (Sprint 4.4C)

Quando `appointment_id` está preenchido, a cobrança mostra no detalhe:
- Link/referência ao agendamento vinculado: data, paciente, profissional, status da consulta.
- Permite navegar ao agendamento a partir do financeiro e vice-versa.

Formulário de nova cobrança: campo opcional "Agendamento vinculado" (dropdown dos agendamentos
recentes do paciente selecionado) — já previsto no §10.4.

### 10.7 Badge financeiro na Agenda (Sprint 4.4E)

> Planejamento conceitual — **não é escopo da 4.4C** (frontend financeiro).
> A Sprint 4.4E implementará a integração visual Agenda × Financeiro.

Cada card de agendamento na aba Agenda deve exibir um badge de status financeiro:

| Situação | Badge | Cor sugerida |
|---|---|---|
| Cobrança `pending`, `due_date` ainda não vencido (ou NULL) | "Cobrança pendente" | amarelo |
| Cobrança `pending`, `due_date < hoje` | "Vencido" | vermelho |
| Cobrança `paid` | "Pago" | verde |
| Cobrança `canceled` | "Cobrança cancelada" | cinza |
| Sem cobrança vinculada | (sem badge financeiro) | — |

O badge é **informativo** — não altera o status da consulta automaticamente.

### 10.8 Alertas de integração Agenda × Financeiro (Sprint 4.4E)

Alertas são **sugestões ao operador** — sem automação agressiva. Invariante do v0.1.

| Evento | Alerta exibido | Ação sugerida |
|---|---|---|
| Cobrança marcada como paga | "Pagamento recebido. Deseja confirmar a consulta?" | Botão "Confirmar consulta" (opcional — operador decide) |
| Agendamento cancelado com cobrança `pending` ou `paid` vinculada | "Este agendamento tem cobrança vinculada. Revise a cobrança." | Botão "Ver cobrança" |
| Cobrança cancelada com agendamento `scheduled` ou `confirmed` | "Esta cobrança está vinculada a um agendamento ativo. Revise a agenda." | Botão "Ver agendamento" |

**Invariantes dos alertas:**
- Cancelar consulta **nunca cancela cobrança automaticamente** no v0.1.
- Marcar cobrança como paga **nunca confirma consulta automaticamente** no v0.1.
- O humano (secretaria/dono/gestor) sempre decide cada ação.
- Alertas são dismissíveis — não bloqueiam o fluxo.

## 11. Endpoints conceituais

Prefixo `/financial/`. Todos exigem `requireAuth` + `requireClinic`.
Permissões conforme §7.

### 11.1 `POST /financial/charges` — criar cobrança

- **Middleware:** `requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`.
- **Body:** `{ patient_id, appointment_id?, description, amount_cents, currency?, due_date?, notes? }`.
- **Response 201:** `{ charge: {...status:'pending'...} }`.
- **Audit:** `financial.charge.created.success`.
- **Erros:** 400 `financial_charge_invalid`, 404 `patient_not_found`, 403, 401.

### 11.2 `GET /financial/charges` — listar

- **Middleware:** `requireAuth → requireClinic → requireRole(['dono_clinica','secretaria','gestor_clinica'])`.
- **Query params:** `patient_id?`, `status?`, `date_from?`, `date_to?`, `appointment_id?`, `limit?`, `offset?`.
- **Response 200:** lista de cobranças (sem `notes` no shape de lista — apenas em detalhe).
  Se `appointment_id` informado, retorna cobranças vinculadas ao agendamento específico
  (com validação de tenant, mas **sem exigir** `patient_id` extra — o agendamento já pertence à clínica).
- **Erros:** 400, 403, 401.

### 11.3 `GET /financial/charges/:id` — detalhe

- **Middleware:** idem 11.2.
- **Response 200:** cobrança completa com `notes`.
- **Erros:** 404, 403, 401.

### 11.4 `PATCH /financial/charges/:id` — editar pending

- **Middleware:** `requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`.
- **Regra:** `status == 'pending'`.
- **Campos editáveis:** `description`, `amount_cents`, `due_date`, `notes`.
- **Response 200:** cobrança atualizada.
- **Audit:** `financial.charge.updated.success`.
- **Erros:** 400 `charge_not_pending`, 404, 403, 401.

### 11.5 `POST /financial/charges/:id/mark-paid` — marcar como pago

- **Middleware:** `requireAuth → requireClinic → requireRole(['dono_clinica','secretaria','gestor_clinica'])`.
- **Regra:** `status == 'pending'`.
- **Body:** `{ payment_method, paid_at? }`.
- **Response 200:** cobrança com `status:'paid'`.
- **Audit:** `financial.charge.paid.success`.
- **Erros:** 400 `charge_not_pending`, 400 `payment_method_required`, 404, 403, 401.

### 11.6 `POST /financial/charges/:id/cancel` — cancelar

- **Middleware:** `requireAuth → requireClinic → requireRole(['dono_clinica','secretaria','gestor_clinica'])`.
- **Regra:** `status == 'pending'`.
- **Body:** `{ cancel_reason? }`.
- **Response 200:** cobrança com `status:'canceled'`.
- **Audit:** `financial.charge.canceled.success`.
- **Erros:** 400 `charge_not_pending`, 404, 403, 401.

### 11.7 `GET /financial/summary` — totalizadores

- **Middleware:** idem 11.2.
- **Query params:** `date_from?`, `date_to?` (default = mês atual).
- **Response 200:** `{ pending_amount_cents, paid_amount_cents, overdue_amount_cents, pending_count, paid_count, overdue_count }`.
- **Erros:** 400, 403, 401.

### 11.8 `GET /patients/:id/charges` — cobranças do paciente

- **Middleware:** idem 11.2.
- **Response 200:** lista de cobranças do paciente (sem `notes`).
- **Erros:** 404 `patient_not_found`, 403, 401.

### 11.9 `GET /appointments/:id/charges` — cobranças de um agendamento (Sprint 4.4E)

> **Decisão:** este endpoint **não entra na 4.4B**. O filtro `appointment_id?` em
> `GET /financial/charges` é suficiente para a 4.4B. O endpoint dedicado
> `/appointments/:id/charges` pode ser adicionado na **Sprint 4.4E** (integração
> Agenda × Financeiro) se o produto justificar.
>
> Justificativa: o endpoint exigiria montar o router de appointments no contexto do
> financeiro ou duplicar lógica. O filtro via query param resolve o caso de uso com
> zero código extra na 4.4B.

## 12. Plano de implementação Sprint 4.4B

Ordem sugerida. Cada passo é um commit independente.

1. **Migration** `20260604000000_financial_charges_v0.ts`:
   - Tabela `financial_charges` + índices + CHECK constraints.
   - Reverter (`down`) faz DROP da tabela.
2. **`backend/src/types/db.d.ts`** — adicionar tipo `FinancialChargeRow`.
3. **DAO** `financialChargeDao.ts`:
   - `create`, `findByIdForClinic`, `listForClinic`,
     `updatePending` (só campos editáveis, só se `status='pending'`),
     `markPaid` (CAS — update atômico `WHERE status='pending'`),
     `cancel` (CAS).
   - Sem `DELETE`. Sem `UPDATE` em cobranças `paid` ou `canceled`.
   - `summarize(clinicaId, dateFrom, dateTo)` — query de totalizadores.
4. **Service** `financialChargeService.ts`:
   - `create`, `list`, `getDetail`, `update`, `markPaid`, `cancel`, `summary`.
   - Validações: `patient_id` ativo + não-mesclado (404); `appointment_id`
     mesma clínica (400); `amount_cents > 0`; `payment_method` allowlist;
     `description`/`notes` limites de tamanho.
   - Audit de escrita via `auditLogService.record` — falha aborta transação.
5. **Controller** `financialChargeController.ts` — thin handlers.
6. **Rotas** `financialCharges.ts` — 8 endpoints (§11); registrar em `app.ts`.
7. **Logger** — estender redaction com `description`, `notes`, `cancel_reason`.
8. **Smoke tests** (script em `/tmp/`):
   - Criar cobrança → listar → marcar como pago → confirmar status.
   - Cancelar cobrança → confirmar status.
   - Tentar editar cobrança paga/cancelada → 400.
   - Totalizadores em aberto / recebido / atrasado.
   - Cobranças do paciente.
   - Criar cobrança com `appointment_id` válido (mesmo `patient_id`) → 201.
   - `GET /financial/charges?appointment_id=<uuid>` → 200 (só a cobrança vinculada).
   - Criar cobrança com `appointment_id` de outro paciente → 400 `financial_charge_invalid`.
   - Criar cobrança com `appointment_id` de outra clínica → 400 genérico.
   - secretaria pode criar/pagar/cancelar → 200.
   - gestor pode listar/pagar/cancelar → 200; gestor não cria → 403.
   - profissional_clinico → 403 em todos endpoints.
   - admin_sistema → 403 no_clinic_context.
   - sem token → 401.
   - Cross-tenant → 404.
   - patient_id inexistente → 404.
   - amount_cents = 0 → 400.
   - payment_method inválido → 400.
9. **SQL checks pós-teste:**
   - `SELECT count(*) FROM financial_charges WHERE status='paid' AND paid_at IS NULL` → 0.
   - `SELECT count(*) FROM financial_charges WHERE status='canceled' AND canceled_at IS NULL` → 0.
10. **Documentação:** atualizar `CLAUDE.md`, `project-state.md`,
    `sprint-history.md`, `security-notes.md`, `testing-checklist.md`.
11. **Limpeza:** dados sintéticos dos smoke tests removidos.

### 12.1 Sprints seguintes após 4.4B

| Sprint | Escopo |
|---|---|
| **4.4C** | Frontend Financeiro: aba "Financeiro" no app shell; cards de totalizadores; lista de cobranças; formulário de criação (com `appointment_id` opcional); modal "Marcar como pago"; cobrança vinculada mostrando o agendamento |
| **4.4D** | QA/hardening Financeiro v0.1: smoke N/N PASS; audit/logs verificados; cleanup; docs atualizados; zero código novo |
| **4.4E** | Integração Agenda × Financeiro: badge financeiro na Agenda (pending/pago/vencido/sem cobrança); alertas Agenda→Financeiro e Financeiro→Agenda; botão "Criar cobrança" a partir da consulta; confirmação humana de consulta via alerta; **sem automação** (invariante v0.1) |

**Decisão sobre 4.4B vs 4.4E:**
- `appointment_id` como FK opcional **entra na 4.4B** (schema já o tem; validação simples).
- Filtro `appointment_id?` em `GET /financial/charges` **entra na 4.4B** (parâmetro extra na query).
- Badge e alertas na Agenda **ficam para a 4.4E** (modificam o frontend da Agenda, fora do escopo do módulo financeiro puro).
- Botão "Criar cobrança" a partir da consulta **fica para a 4.4E** (UX de Agenda, não de Financeiro).

## 13. Impacto na trilha AWS

Trilha AWS continua **⏸️ pausada** (ADR 0008 §6 + ADR 0009 §10).

| Componente AWS | Impacto do módulo financeiro | Ação antes de produção |
|---|---|---|
| **RDS** | `financial_charges` cresce linearmente com consultas (clínica com 20 consultas/dia = ~7k rows/ano). Volume não exige dimensionamento diferente. | Sem ação |
| **S3** | v0.1 não gera arquivos financeiros — sem impacto. | Sem ação |
| **KMS** | `amount_cents` e `notes` em plaintext. `notes` pode ter informação sensível; revisitar se jurídico exigir cifra. | Reabrir se necessário |
| **Backup** | `financial_charges` com relevância legal/fiscal — incluir em `pg_dump` e drill de restore. | Validar restore drill |
| **CloudWatch** | Logger redige `description`, `notes`, `cancel_reason`. Validar em staging que valores financeiros não vazam em logs de erro. | Smoke test pós-deploy |

## 14. Riscos

| Risco | Mitigação |
|---|---|
| **Profissional usando `notes` para diagnóstico** | Aviso na UI + text limit; sem detecção automática de conteúdo clínico |
| **Expectativa de gateway/boleto/Pix automático** | Comunicação clara na UI: "Pagamentos registrados manualmente" + aviso de limitação |
| **Inconsistência de status** (cobrança paga sem `paid_at`) | CHECK constraints + CAS no DAO + smoke tests de invariante |
| **Disputa com paciente sobre valor** | Histórico auditável (audit_logs) + imutabilidade após `paid`/`canceled`; sem delete físico |
| **Ausência de política de retenção** | Documentar obrigação fiscal mínima de 5 anos; ADR 0002 e jurídico decidem antes de produção |
| **`profissional_clinico` inferindo situação financeira** | Sem acesso ao módulo por padrão; revisável em v0.2 |
| **Volume de cobranças pendentes sem follow-up** | Fora do escopo — notificações/alertas são sprint futura |
| **Conversão de moeda** | `CHECK currency = 'BRL'` no v0.1; sem conversão; revisável se produto for para outros países |
| **Cifra ausente em `amount_cents`/`notes`** | RDS encryption at rest + TLS in transit + controles de app; sem cifra de coluna no v0.1 |
| **Cobrança duplicada por duplo clique** | Idempotência via UX (debounce/loading) + sem constraint UNIQUE no v0.1 (cobranças distintas podem ter mesmo valor) |
| **`appointment_id` com `patient_id` divergente** | Validação no service antes do INSERT — 400 `financial_charge_invalid`; sem cruzamento silencioso |
| **Pagamento confirmar consulta automaticamente por engano** | Sem automação no v0.1 — alerta é sugestivo; humano decide; invariante explícita em §10.8 |
| **Consulta cancelada com cobrança ativa (estado financeiro órfão)** | Alerta ao operador na 4.4E; sem cancelamento automático de cobrança; cobrança permanece `pending` até ação humana |
| **Cobrança cancelada com consulta ainda confirmada** | Alerta ao operador na 4.4E; sem alteração automática de agenda; consulta permanece no status atual |
| **Paciente paga mas consulta não é confirmada por erro humano** | UX de alerta explícito (§10.8) + audit trail; humano é responsável pela confirmação — intencional no v0.1 |
| **Dependência de webhook/gateway para automação futura** | Decisão adiada; v0.1 é 100% manual; automação exige ADR própria + análise de falhas/idempotência/rollback |

## 15. Valor de produto e oportunidades futuras

O módulo financeiro v0.1 adiciona valor imediato ao ClinicBridge:
- Diferencial frente a sistemas que exigem módulo financeiro caro/separado.
- Dados necessários para evolução natural (NFS-e, integração Pix, relatórios).
- Base para modelo de precificação por volume de cobranças processadas (SaaS).

**Oportunidades futuras (cada uma exige ADR própria):**
- NFS-e: integração com prefeitura, ISS, regime tributário da clínica.
- Pix automático: QR Code dinâmico via API bancária.
- Integração com gateway (Asaas, PagSeguro, Stripe Brazil).
- Split de pagamento / repasse médico: clínica repassa parte ao profissional.
- Planos/assinaturas de pacientes: plano de consultas periódicas.
- Relatórios gerenciais avançados: DRE simples, fluxo de caixa (Fase 4.5).
- Convênios/faturamento TISS (Fase 4.6).

## 16. Integração Agenda × Financeiro — Nível 3

> Adicionado em ajuste da Sprint 4.4A (2026-05-27) — antes do início da 4.4B.
> Esta seção fecha as decisões de integração antes de qualquer código.

### 16.1 Modelo conceitual de dois estados independentes

O produto separa explicitamente dois domínios:

| Domínio | Estados | Tabela | Módulo |
|---|---|---|---|
| **Status da consulta** | `scheduled` → `confirmed` \| `cancelled` \| `rescheduled` \| `no_show` \| `completed` | `scheduling` (agendamentos) | Agenda Administrativa (ADR 0006) |
| **Status financeiro** | `pending` → `paid` \| `canceled` | `financial_charges` | Financeiro (esta ADR) |

**Princípio:** os dois estados são independentes. Um não controla o outro automaticamente no v0.1.
Uma consulta `confirmed` pode ter cobrança `pending`. Uma consulta `cancelled` pode ter cobrança
`paid`. O operador gerencia os dois explicitamente.

### 16.2 Vínculo appointment_id — regras de integridade

- `appointment_id` é **opcional** em `financial_charges`. Uma cobrança pode existir sem agendamento.
- Quando informado: `appointment_id` deve pertencer à **mesma `clinica_id`** e ao **mesmo
  `patient_id`** da cobrança — validação no service antes do INSERT/UPDATE.
- FK no banco: `FK scheduling(id) ON DELETE SET NULL` — se o agendamento for removido fisicamente
  (impossível com as invariantes atuais), a cobrança sobrevive sem vínculo.
- Um agendamento pode ter **0 ou N cobranças** (sem UNIQUE constraint em `appointment_id`).
  Caso típico é 1, mas clínicas podem ter cobranças de retorno ou itens extras.

### 16.3 Fluxo operacional v0.1

```
Agendamento criado
      │
      ▼
  Secretaria/dono cria cobrança manualmente
      │  (appointment_id preenchido — link explícito)
      ▼
  Cobrança: pending
      │
      │  Paciente paga (presencialmente)
      │  Operador clica "Marcar como pago"
      ▼
  Cobrança: paid
      │
      │  Sistema mostra alerta: "Pagamento recebido. Deseja confirmar a consulta?"
      │  Operador clica "Confirmar consulta" (opcional)
      ▼
  Agendamento: confirmed  ◄── decisão humana
```

**Anti-fluxo (o que NÃO acontece no v0.1):**
```
  Cobrança: paid  ─── NÃO → Agendamento: confirmed  (sem automação)
  Agendamento: cancelled ─── NÃO → Cobrança: canceled (sem automação)
```

### 16.4 Badge financeiro — modelo de dados na query

Na 4.4E, o frontend da Agenda exibirá o badge financeiro. Para isso o endpoint de agendamentos
precisará de um JOIN (ou sub-query) em `financial_charges`:

```sql
-- Para cada agendamento, pegar o status financeiro mais relevante
SELECT
  a.id,
  a.status AS appointment_status,
  (
    SELECT fc.status
    FROM financial_charges fc
    WHERE fc.appointment_id = a.id
      AND fc.clinica_id = a.clinica_id
    ORDER BY fc.created_at DESC
    LIMIT 1
  ) AS financial_status,
  (
    SELECT fc.due_date
    FROM financial_charges fc
    WHERE fc.appointment_id = a.id
      AND fc.clinica_id = a.clinica_id
      AND fc.status = 'pending'
    ORDER BY fc.due_date ASC NULLS LAST
    LIMIT 1
  ) AS pending_due_date
FROM scheduling a
WHERE a.clinica_id = :clinica_id
...
```

**Decisão:** este JOIN **não entra na 4.4B nem na 4.4C** — é adicionado no endpoint de
agendamentos na **Sprint 4.4E**. O endpoint financeiro não precisa conhecer a Agenda.

### 16.5 Decisões explícitas deste ajuste

| Decisão | Escolha | Justificativa |
|---|---|---|
| `appointment_id` entra em 4.4B? | **Sim** — FK opcional no schema, validação no service | Schema já prevê; validação simples |
| Filtro `appointment_id?` em listagem entra em 4.4B? | **Sim** — parâmetro extra em query | Zero custo; viabiliza 4.4E sem refactor |
| Badge financeiro na Agenda entra em 4.4C? | **Não** — fica para 4.4E | 4.4C é frontend financeiro puro; Agenda é módulo separado |
| Alertas de integração entram em 4.4C? | **Não** — fica para 4.4E | Mesma razão; requer modificar Agenda |
| Botão "Criar cobrança" na consulta entra em 4.4C? | **Não** — fica para 4.4E | Modifica UX de Agenda, fora do escopo de Financeiro |
| Confirmação automática de consulta por pagamento? | **Nunca no v0.1** — invariante | Risco de erro operacional; humano decide |
| Cancelamento automático de cobrança por consulta cancelada? | **Nunca no v0.1** — invariante | Mesmo motivo |
| Política configurável por clínica? | **Fora do v0.1** — ADR aditiva | Complexidade de configuração; sprint futura |

## 17. Notas finais

- Esta ADR **não afirma conformidade fiscal, contábil ou tributária**.
  Validação jurídica/contábil externa **obrigatória** antes de qualquer dado
  financeiro real em produção.
- Esta ADR **autoriza** a Sprint 4.4B a implementar exatamente o descrito
  aqui — **sem desvios**. Qualquer mudança de escopo durante a 4.4B exige
  aditivo a esta ADR.
- Esta ADR **mantém todas as invariantes** vigentes em `docs/security-notes.md`
  e adiciona:
  - Sem `DELETE` em `financial_charges`.
  - `status='paid'` e `status='canceled'` são imutáveis.
  - `amount_cents > 0` — CHECK constraint obrigatório.
  - `notes` nunca contém dado clínico — aviso na UI.
  - Audit de escrita via `audit_logs` — falha aborta transação.
  - `profissional_clinico` sem acesso ao financeiro por padrão.
  - Sem integração de gateway/boleto/Pix no v0.1.
