# ADR 0013 — Integração Agenda × Financeiro v0.1

| Campo | Valor |
|---|---|
| **Status** | Accepted |
| **Data** | 2026-05-27 |
| **Sprint** | 4.4E-A (docs/ADR-only) |
| **Autores** | Marco Rodrigues |
| **Relacionado** | ADR 0012 (Financeiro v0.1) · ADR 0006 (Agenda) · ADR 0008 (Clinic OS) · `docs/agenda-financial-integration-v0-scope.md` |

---

## 1. Contexto

O Financeiro v0.1 (Sprints 4.4A–4.4D) entregou cobranças manuais para a clínica:
ciclo `pending → paid | canceled`, totalizadores, notas administrativas e vínculo
opcional `appointment_id` em `financial_charges`. O campo `appointment_id` já existe
no schema e é validado (cross-tenant + cross-patient) no service financeiro.

A Agenda administrativa (Sprints 3.14–3.18) mostra agendamentos por dia/profissional
e permite gerenciar status da consulta (`scheduled`, `confirmed`, `cancelled`,
`rescheduled`, `no_show`, `completed`).

Hoje esses dois módulos são ilhas: a secretaria precisa alternar entre abas para
saber se uma consulta tem cobrança, e não há atalho para criar cobrança a partir
de um agendamento. A integração visual e operacional desses módulos é o objetivo
da Fase 4.4E.

---

## 2. Objetivo

1. Mostrar a **situação financeira da consulta** diretamente na agenda, sem
   transformá-la em painel financeiro.
2. Permitir **criar cobrança a partir de um agendamento** com dados pré-preenchidos.
3. Oferecer **alertas sugestivos** quando consulta e cobrança estiverem em estados
   inconsistentes.
4. Manter a agenda focada no horário e na logística da consulta.

---

## 3. Decisão

### 3.1 Dois eixos totalmente independentes

O sistema mantém dois eixos de estado sem dependência automática entre si:

**Eixo 1 — Status da consulta** (tabela `appointments`):

| Status | Significado |
|---|---|
| `scheduled` | Agendada, não confirmada |
| `confirmed` | Confirmada pela clínica/paciente |
| `cancelled` | Cancelada |
| `rescheduled` | Remarcada (original cancelada, nova criada) |
| `no_show` | Paciente não compareceu |
| `completed` | Consulta realizada |

**Eixo 2 — Status financeiro** (derivado de `financial_charges` por `appointment_id`):

| Estado derivado | Condição |
|---|---|
| Sem cobrança | nenhuma cobrança com `appointment_id` desta consulta |
| Pendente | cobrança `pending`, `due_date >= today` ou sem `due_date` |
| Vencida | cobrança `pending`, `due_date < today` |
| Paga | cobrança `paid` |
| Cancelada | cobrança `canceled` |

**Regra central e invariante:**
- Status financeiro **NÃO altera** status da consulta automaticamente.
- Status da consulta **NÃO altera** cobrança automaticamente.
- **O sistema sugere, o humano decide — sempre.**

### 3.2 Badge financeiro na agenda

Badge pequeno e discreto exibido no card/linha de cada agendamento.

| Estado derivado | Label UI | Estilo |
|---|---|---|
| Sem cobrança | "Sem cobrança" | neutro/cinza, opaco |
| Pendente | "Pagamento pendente" | amarelo suave |
| Vencida | "Vencido" | vermelho suave |
| Paga | "Pago" | verde suave |
| Cancelada | "Cobrança cancelada" | cinza riscado |

**Diretrizes visuais:**
- Badge pequeno, secundário ao horário e nome do paciente.
- Dark theme: usar tokens de cor já definidos no CSS module; evitar branco puro
  e cores saturadas.
- Sem badge (ou badge "Sem cobrança" ocultável) para clínicas que ainda não usam o módulo.
- `profissional_clinico` não vê badge financeiro (ver §3.5).

### 3.3 Alertas sugestivos

Alertas são **informativos e dismissíveis**. Nenhum executa ação automaticamente.

| Cenário | Alerta | Onde aparece |
|---|---|---|
| Cobrança `paid` + consulta `scheduled` ou `confirmed` | "Pagamento recebido. Deseja confirmar a consulta?" | Card/detalhe do agendamento |
| Cobrança `pending` vencida + consulta `scheduled` ou `confirmed` | "Pagamento vencido. Revise antes da consulta." | Card/detalhe do agendamento |
| Consulta `cancelled` + cobrança `pending` | "Consulta cancelada. Revise a cobrança vinculada." | Card/detalhe do agendamento |
| Cobrança `canceled` + consulta `scheduled` ou `confirmed` | "Cobrança cancelada. Revise o agendamento." | Detalhe do agendamento |

**Invariante de alertas:**
- Cada alerta é uma `<div>` informativa com botão "Dispensar" (dismiss local, sem persistência de servidor).
- Nenhum alerta dispara `PATCH /appointments` ou qualquer escrita automaticamente.
- O botão sugerido pelo alerta abre o fluxo correspondente (ex.: modal de confirmação de consulta), mas o usuário precisa confirmar ativamente.

### 3.4 Botão "Criar cobrança" a partir de agendamento

Disponível no card/detalhe de agendamento **apenas quando não existe cobrança vinculada**.

**Fluxo:**
1. Usuário abre detalhe do agendamento.
2. Clica em "Criar cobrança".
3. Formulário `NewChargeForm` abre com:
   - `patient_id` pré-selecionado (do agendamento, não editável).
   - `appointment_id` preenchido (hidden/readonly).
   - `description` sugerida: "Consulta" — **editável pelo usuário** (texto neutro, sem dado clínico).
   - `amount_cents` em branco (usuário preenche).
   - `due_date` opcional.
   - `notes` administrativas com aviso anti-clínico.
4. Ao criar: invalidação de cache (`['financial']` + queries de agendamento).
5. Agenda passa a mostrar badge "Pagamento pendente".

**Quando exibir "Ver cobrança" em vez de "Criar cobrança":**
- Quando já existe cobrança `pending` ou `paid` vinculada: botão "Ver cobrança" abre detalhe no `FinancialPanel`.
- Quando cobrança está `canceled`: botão "Criar nova cobrança" (permite criar nova, pois a cancelada é imutável).

**Restrições da descrição sugerida:**
- Texto neutro: "Consulta", "Retorno", "Atendimento agendado".
- **Nunca** incluir: motivo da consulta, diagnóstico, procedimento clínico, CID, nome de medicamento.
- A sugestão é editável — a responsabilidade final é do usuário.

### 3.5 Permissões

| Ação | `dono_clinica` | `secretaria` | `gestor_clinica` | `profissional_clinico` | `admin_sistema` |
|---|---|---|---|---|---|
| Ver badge financeiro na agenda | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver alertas sugestivos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Criar cobrança via agenda | ✅ | ✅ | ❌ (v0.1) | ❌ | ❌ |
| Ver cobrança (link) via agenda | ✅ | ✅ | ✅ | ❌ | ❌ |

**Regras:**
- `profissional_clinico` **não vê valores financeiros** nem badge financeiro na agenda.
  O card do agendamento é exibido sem a seção financeira para esse role.
- `gestor_clinica` pode ver badge e alerta (já tem `effectiveFinancialAccess=transact`)
  mas não criar cobrança (alinhado com ADR 0012 §7.3).
- `admin_sistema` bloqueado pelo `requireClinic` existente.
- A detecção de role no frontend (`user.papel`) continua sendo defensiva (não decisão de segurança);
  o backend é a fonte de verdade via `effectiveFinancialAccess`.

### 3.6 Estratégia de endpoints — MVP

**Decisão: reutilizar endpoints existentes; sem endpoint agregador na 4.4E.**

**Endpoints já disponíveis e suficientes:**

| Operação | Endpoint | Comentário |
|---|---|---|
| Listar cobranças do dia (para badge) | `GET /financial/charges?limit=100` | Frontend agrupa por `appointment_id` |
| Criar cobrança com vínculo | `POST /financial/charges` + `appointment_id` | Já existe |
| Ver detalhe da cobrança | `GET /financial/charges/:id` | Já existe |
| Filtrar cobranças de um agendamento | `GET /financial/charges?appointment_id=<id>` | Já existe |

**Estratégia de fetch para badge:**
- Frontend carrega agendamentos do dia (request já existente).
- Em paralelo, faz `GET /financial/charges?limit=100` (sem filtro de data — retorna cobranças recentes da clínica).
- Monta `Map<appointment_id, FinancialChargeListItem>` no cliente.
- Badge é derivado dessa map sem chamada adicional por card.

**Por que não criar `GET /appointments?include_financial=true` agora:**
- O volume de dados é pequeno (clínica pequena, MVP).
- Evita acoplamento prematuro entre módulos.
- Um endpoint agregador pode ser adicionado em sprint futura se UX/performance exigir.
- Princípio Clinic OS: sem over-engineering (ADR 0008 §4.11).

**Único endpoint novo potencial para 4.4E-B (decidir na sprint):**
- `GET /appointments/:id/charges` — alternativa a usar `?appointment_id=` filter.
  Deixar como opção para a sprint de backend se o roteamento ficar mais claro assim.
  Não é bloqueante para a ADR.

### 3.7 Invalidação de cache (React Query)

| Evento | Queries a invalidar |
|---|---|
| Cobrança criada via agenda | `['financial']` (todos) + `['appointments']` (dia atual) |
| Cobrança marcada como paga | `['financial']` + `['appointments']` (dia atual) |
| Cobrança cancelada | `['financial']` + `['appointments']` (dia atual) |
| Agendamento cancelado/remarcado | `['appointments']` (dia atual) — não invalida `['financial']` automaticamente |
| Alerta sugestivo exibido | nenhuma invalidação — é read-only |

**Nota:** invalidar `['appointments']` ao mudar status de cobrança garante que o badge
seja atualizado imediatamente após criação/pagamento/cancelamento de cobrança.

### 3.8 Segurança e LGPD

1. **Tenant isolation:** toda leitura de cobranças para badge usa o token do usuário;
   `requireAuth + requireClinic` garante que só cobranças da mesma clínica sejam retornadas.

2. **`appointment_id` sempre validado:** o backend já valida cross-tenant + cross-patient
   em `validateAppointmentLink` (ADR 0012 §4); nenhuma mudança necessária.

3. **Separação financeiro/clínico:**
   - Badge mostra apenas status (`pending`/`paid`/`canceled`/sem cobrança). Nunca expõe
     `description`, `notes`, `amount_cents` no card da agenda.
   - Valores e notas só aparecem no `FinancialPanel` (detalhe de cobrança).
   - `profissional_clinico` não recebe nenhum dado financeiro.

4. **Descrição sugerida neutra:** o frontend não deve usar dados do prontuário (queixa,
   evolução, diagnóstico) para preencher a descrição. Campo editável com sugestão fixa.

5. **Logs:** campos `description`, `notes`, `amount_cents` já estão redacted no `logger.ts`
   (4.4B). Nenhum campo financeiro novo entra nos logs pelo badge.

6. **`notes` sem dado clínico:** o aviso "Não inclua diagnóstico ou informações de saúde"
   deve aparecer no formulário de criação via agenda, identicamente ao `FinancialPanel`.

7. **Sem PII em URL:** `appointment_id` e `patient_id` são UUIDs internos (não-PII);
   valores e notas nunca vão para query string.

---

## 4. Fora de escopo da Sprint 4.4E

Os itens abaixo **não entram na 4.4E** mesmo que tecnicamente possíveis:

- Convênios, carteirinha, autorização, guia, glosa (Fase 4.6).
- Gateway de pagamento, Pix automático, boleto, NFS-e.
- Webhook de pagamento.
- Confirmação automática de consulta ao receber pagamento.
- Cancelamento automático de cobrança ao cancelar consulta.
- Cancelamento automático de consulta ao cancelar cobrança.
- Alteração de status financeiro por `profissional_clinico`.
- Nova role `financeiro_clinica`.
- Relatórios financeiros avançados (Fase 4.5).
- `GET /appointments?include_financial=true` (endpoint agregador — sprint futura se necessário).
- Seção "Cobranças do paciente" no cadastro administrativo (pode vir junto ou em sprint própria).
- Dashboards/gráficos financeiros na agenda.

---

## 5. Sprints de implementação sugeridas

| Sprint | Natureza | Escopo |
|---|---|---|
| **4.4E-A** | ADR/docs-only (esta sprint) | Esta ADR + doc operacional + atualizações de docs |
| **4.4E-B** | Backend (se necessário) | Avaliar se é preciso endpoint novo ou apenas docs de contrato da 4.4E-C. Pode ser pulado se tudo reusa existente |
| **4.4E-C** | Frontend | Badge + alertas + botão "Criar cobrança" na agenda |
| **4.4E-D** | QA/hardening | Smoke, audit, cleanup, docs finais |

**Gate para iniciar 4.4E-B/C:** esta ADR aceita pelo dono.

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Badge exibe valores/notas indevidos para profissional | `profissional_clinico` não vê seção financeira; backend bloqueia via `effectiveFinancialAccess` |
| Descrição da cobrança criada via agenda contém dado clínico | Aviso na UI; validação de responsabilidade é do usuário (v0.1 não tem filtro de conteúdo) |
| `GET /financial/charges` sem filtro retorna cobranças demais em clínicas grandes | `limit=100` suficiente para MVP; pagination/filtro por data na agenda futura |
| Alerta "Confirmar consulta?" confunde o usuário como automático | Copy explícita: "Deseja confirmar?" + botão requer clique ativo |
| Acoplamento entre módulos agenda/financeiro no frontend | Composição via React Query + Map; agenda não importa componentes do FinancialPanel |
| `appointment_id` de outro paciente/clínica aceito no form | Backend já valida `validateAppointmentLink`; frontend preenche de forma readonly |

---

## 7. Referências

- ADR 0012 `docs/adr/0012-financial-module-v0.md` — Financeiro v0.1 (campos, permissões, redaction)
- ADR 0006 `docs/adr/0006-administrative-scheduling-module.md` — Agenda administrativa
- ADR 0008 `docs/adr/0008-clinicbridge-clinic-os-expansion.md` — Princípios Clinic OS
- `docs/agenda-financial-integration-v0-scope.md` — doc operacional desta ADR
- `docs/financial-v0-scope.md` — checklists e detalhes do Financeiro v0.1
- `docs/insurance-billing-future-scope.md` — convênios (fora do escopo desta ADR)
