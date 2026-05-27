# ADR 0014 — Relatórios Gerenciais v0.1

| Campo | Valor |
|---|---|
| **Status** | Accepted |
| **Data** | 2026-05-27 |
| **Sprint** | 4.5A (docs/ADR-only) |
| **Autores** | Produto + eng |
| **Relacionado** | ADR 0008 (Clinic OS) · ADR 0009 (roles) · ADR 0012 (Financeiro) · ADR 0013 (Agenda × Financeiro) · `docs/management-reports-v0-scope.md` · `docs/product-clinic-os-roadmap.md` §Fase-4.5 |

---

## 1. Contexto

Com a Fase 4.4 completa, o ClinicBridge tem dados de agenda (appointments),
financeiro (financial_charges) e pacientes que crescem a cada uso. Hoje o
dono/gestor visualiza cada módulo em sua aba isolada, sem visão consolidada
do período.

A Fase 4.5 entrega **relatórios gerenciais simples** que sintetizam esses
dados em indicadores operacionais e financeiros — sem dados clínicos, sem
contabilidade formal e sem BI customizável.

---

## 2. Objetivo

1. Dar ao dono/gestor uma visão consolidada de agenda, caixa e pacientes
   para um período escolhido.
2. Apoiar a rotina de clínicas pequenas: "quanto recebi esta semana?",
   "quantos pacientes faltaram?", "quais consultas não têm cobrança?".
3. Reutilizar exclusivamente dados administrativos e financeiros já
   existentes — sem novas tabelas clínicas, sem prontuário.
4. Manter a fronteira clínica intacta: nenhum campo de `clinical_encounters`,
   `clinical_notes` ou `clinical_documents` aparece em relatório.

---

## 3. Decisão

### 3.1 Quatro relatórios no v0.1

| ID | Nome | Fonte principal |
|---|---|---|
| R-A | Resumo Operacional (Agenda) | `appointments` |
| R-B | Resumo Financeiro | `financial_charges` |
| R-C | Resumo de Pacientes | `patients` (metadata administrativa) |
| R-D | Agenda × Financeiro | `appointments` + `financial_charges` |

Cada relatório retorna **indicadores agregados** (contagens, totais) e
**listas curtas de atenção** (máximo 20–50 itens) — nunca um dump completo.

### 3.2 Relatório R-A — Resumo Operacional

Indicadores por período:

| Campo | Descrição |
|---|---|
| `total` | Total de agendamentos no período |
| `scheduled` | Agendados (status scheduled + rescheduled) |
| `confirmed` | Confirmados |
| `completed` | Concluídos |
| `cancelled` | Cancelados |
| `no_show` | Faltas |
| `attendance_rate` | (completed + confirmed) / total, se total > 0 |

Lista de atenção (opcional, limite 20): agendamentos com status `scheduled`
há mais de X dias sem evolução — útil para follow-up da secretaria.

Filtros: `date_from`, `date_to`, `professional_id` (opcional).

**Não inclui:** conteúdo de `administrative_notes`; dados clínicos;
nome do paciente em listas (somente contagens no v0.1).

### 3.3 Relatório R-B — Resumo Financeiro

Indicadores por período (baseado em `created_at` ou `paid_at`, configurável):

| Campo | Descrição |
|---|---|
| `received_cents` | Total pago (`status=paid`, `paid_at` no período) |
| `pending_cents` | Total pendente (`status=pending`) |
| `overdue_cents` | Pendente com `due_date < hoje` |
| `cancelled_cents` | Total cancelado no período |
| `count_pending` | Quantidade de cobranças pendentes |
| `count_paid` | Quantidade de cobranças pagas |
| `count_overdue` | Quantidade de cobranças vencidas |
| `count_cancelled` | Quantidade de cobranças canceladas |
| `by_payment_method` | Totais recebidos por método de pagamento |

Filtros: `date_from`, `date_to`.

**Não inclui:** `notes` das cobranças; `cancel_reason`; `description`
individual em listas; CPF/nome do paciente; repasse médico; DRE;
conciliação bancária.

### 3.4 Relatório R-C — Resumo de Pacientes

Indicadores estáticos + por período:

| Campo | Descrição |
|---|---|
| `total_active` | Pacientes com `status=active` |
| `total_archived` | Pacientes com `status=archived` |
| `new_in_period` | Novos pacientes cadastrados no período (`criado_em`) |
| `with_appointment_in_period` | Pacientes com ≥1 agendamento no período |
| `without_recent_appointment` | Ativos sem agendamento nos últimos N dias (N configurável, padrão 90) |

Filtros: `date_from`, `date_to`.

**Não inclui:** nome de pacientes em listas; CPF (nem mascarado);
telefone; e-mail; dados clínicos; diagnóstico.

### 3.5 Relatório R-D — Agenda × Financeiro

Visão cruzada de cobrança por status de consulta:

| Campo | Descrição |
|---|---|
| `with_pending_charge` | Consultas com cobrança `pending` no período |
| `with_paid_charge` | Consultas com cobrança `paid` no período |
| `with_overdue_charge` | Consultas com cobrança vencida |
| `without_charge` | Consultas sem nenhuma cobrança vinculada |
| `cancelled_with_pending` | Consultas canceladas com cobrança `pending` |
| `charge_cancelled_appt_active` | Cobrança cancelada, consulta ainda ativa |

Filtros: `date_from`, `date_to`, `professional_id` (opcional).

**Não inclui:** `notes` de cobranças; `administrative_notes` da agenda;
`description` individual das cobranças; valor detalhado por consulta
(somente totais agregados).

---

## 4. Fora do escopo v0.1

### 4.1 Dados clínicos (bloqueio absoluto)

- Conteúdo de `clinical_encounters`, `clinical_notes`, `clinical_documents`.
- Diagnóstico, CID, queixa principal, evolução, plano terapêutico.
- Prescrições, documentos médicos, imagens, resultados de exames.
- Produtividade clínica por diagnóstico ou procedimento.
- `internal_note` e qualquer campo de prontuário.

### 4.2 Financeiro avançado

- Repasse médico, comissões, contas a pagar.
- DRE, conciliação bancária, contabilidade formal.
- Gateway/Pix automático, boleto, NFS-e.
- Convênios, TISS/TUSS, glosa, faturamento por operadora.

### 4.3 Funcionalidades futuras (pós-v0.1)

- Dashboards com gráficos (barras, pizza, linha).
- Relatórios agendados (cron/e-mail).
- Export CSV/XLSX de relatórios (requer ADR/escopo próprio).
- BI customizável, integrações externas (Looker, Power BI).
- Relatórios cross-clínica (invariante tenant nunca muda).
- Comparação de períodos lado a lado.
- Nome do paciente em listas de relatório.
- Filtros por convênio.
- Produtividade individual por profissional (requer ADR de privacidade).

---

## 5. Permissões

| Papel | R-A (Agenda) | R-B (Financeiro) | R-C (Pacientes) | R-D (Agenda×Fin) |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` + `gestor_clinica` grant | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (pura, sem grant) | ✅ | ❌ | ✅ | ❌ |
| `secretaria` + `profissional_clinico` grant | ✅ | ❌ | ✅ | ❌ |
| `profissional_clinico` | ❌ | ❌ | ❌ | ❌ |
| `admin_sistema` | ❌ (sem clínica) | ❌ | ❌ | ❌ |

**Regra de implementação:**

- R-A e R-C: `requireRole(['dono_clinica', 'secretaria'])` — acesso
  para todo papel administrativo da clínica.
- R-B e R-D: verificação de `effectiveFinancialAccess !== 'none'` no
  service (mesmo padrão do Financeiro v0.1). Profissional → 403.
  Secretaria pura → acesso a R-B e R-D (efectiveFinancialAccess='full').
  Gestor → acesso (effectiveFinancialAccess='transact').

**Nota:** `profissional_clinico` não tem acesso a nenhum relatório no v0.1.
Relatório de produtividade própria pode entrar em versão futura com ADR
específica de privacidade e escopo.

---

## 6. Fontes de dados — permitidas e proibidas

### 6.1 Permitidas

| Tabela | Campos usados |
|---|---|
| `appointments` | `id`, `status`, `starts_at`, `ends_at`, `patient_id`, `professional_id`, `clinica_id`, `criado_em` |
| `financial_charges` | `id`, `status`, `amount_cents`, `due_date`, `paid_at`, `created_at`, `appointment_id`, `payment_method`, `clinica_id` |
| `patients` | `id`, `status`, `criado_em`, `clinica_id` |
| `clinic_professionals` | `id`, `name`, `clinica_id`, `active` (apenas para join de filtro por profissional) |

**Atenção:** `administrative_notes` de `appointments` e `notes`/`cancel_reason`/`description`
de `financial_charges` **não são usados em listas de relatório**. Podem aparecer
somente se o design de detalhe futuro exigir, com ADR própria.

### 6.2 Proibidas (nunca usar em relatórios)

| Tabela/campo | Motivo |
|---|---|
| `clinical_encounters` | Dados clínicos — ADR 0010 |
| `clinical_notes` | Dados clínicos — ADR 0010 |
| `clinical_documents` | Dados clínicos — ADR 0011 |
| `patients.cpf_masked` / CPF | PII — anti-enumeration |
| `patients.telefone` / `email` | PII |
| `patients.nome` em listas | PII — evitar exposição em listas agregadas no v0.1 |
| `financial_charges.notes` | Pode conter info administrativa sensível |
| `financial_charges.cancel_reason` | Idem |
| `financial_charges.description` em listas | Idem |
| `appointments.administrative_notes` | Pode conter PII |
| `audit_logs` como fonte | Logs têm finalidade própria; não usar como fonte de relatório |

---

## 7. Segurança e LGPD

### 7.1 Isolamento de tenant

Todo endpoint de relatório obedece `requireAuth → requireClinic →
requireRole/service-check`. Queries sempre filtram por `clinica_id`.
Cross-tenant → 403.

### 7.2 Audit de acesso

Acesso a relatório gera evento em `audit_logs`:

```
acao    = 'report.view.success'
recurso = 'report'
recurso_id = '<tipo>:<date_from>:<date_to>'   -- ex: 'R-B:2026-05-01:2026-05-31'
usuario_id = <usuário que consultou>
clinica_id = <clínica>
```

Filtros não devem conter PII (nome de paciente, CPF, e-mail). O campo
`recurso_id` armazena apenas tipo de relatório e intervalo de datas.

### 7.3 PII em respostas

- Contagens e totais monetários: permitidos.
- Nome do paciente: **não** aparece em nenhuma lista de relatório no v0.1.
- CPF: **nunca** (nem mascarado).
- Telefone/e-mail: **nunca**.
- IDs de appointment/charge: podem aparecer em listas de atenção curtas,
  apenas para linkagem interna (botão "Ver detalhe" — já autorizado).

### 7.4 Export

**Sem export no v0.1.** Relatórios são apenas para visualização em tela.
Export futuro exigirá ADR/escopo próprio com regras de neutralização de
fórmula (invariante do export existente), conteúdo permitido e audit.

### 7.5 Sem dados clínicos

Qualquer campo das tabelas clínicas (`clinical_encounters`, `clinical_notes`,
`clinical_documents`) é proibido. Se uma query precisar fazer JOIN com
essas tabelas, a sprint está errada — parar e rever.

### 7.6 Logs de backend

`description`, `notes`, `cancel_reason`, `amount_cents` individuais não
aparecem em logs de request nem em mensagens de erro. Apenas agregados.

---

## 8. Arquitetura de API (decisão para 4.5B)

### 8.1 Decisão: endpoints separados por tipo de relatório

```
GET /reports/appointments          → R-A  (dono + secretaria)
GET /reports/financial             → R-B  (dono + gestor; secretaria pura)
GET /reports/patients              → R-C  (dono + secretaria)
GET /reports/agenda-financial      → R-D  (dono + gestor; secretaria pura)
```

**Justificativa:** endpoints separados permitem gating de autorização
limpo por endpoint sem computar dados que o usuário não pode ver.
Um endpoint único (`GET /reports/summary`) forçaria o service a computar
todos os relatórios e então omitir seções — mais frágil.

### 8.2 Query params comuns

```
date_from       ISO date, obrigatório (default: primeiro dia do mês atual)
date_to         ISO date, obrigatório (default: hoje)
professional_id UUID, opcional (apenas R-A e R-D)
```

**Limites:**
- Intervalo máximo: 366 dias. Backend rejeita com 400 se `date_to - date_from > 366`.
- `date_from` não pode ser anterior a 2 anos (limite soft — evitar scans enormes).

### 8.3 Pipeline de middleware

```
rateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])
→ [service verifica effectiveFinancialAccess para R-B e R-D]
```

### 8.4 Resposta

Retorna JSON com seção `data` (indicadores) e opcionalmente `attention`
(lista curta, máximo 50 itens). Sem paginação no v0.1 (itens de atenção
têm limite fixo).

```json
{
  "report": "appointments",
  "date_from": "2026-05-01",
  "date_to": "2026-05-31",
  "data": { "total": 42, "completed": 30, "no_show": 5, ... },
  "attention": []
}
```

---

## 9. Performance

- Geração **on-demand** — sem cache, sem materialização no v0.1.
- Filtros de data obrigatórios com default seguro (mês atual).
- Índices existentes em `appointments(clinica_id, starts_at)` e
  `financial_charges(clinica_id, created_at)` devem ser suficientes.
- **Sem nova migration** — relatórios consultam tabelas existentes.
- Se queries ficarem lentas em clínicas com >5.000 registros, adicionar
  índices parciais ou `MATERIALIZED VIEW` em sprint posterior com medição.
- Timeout de query: reutilizar o timeout de DB da aplicação (configurável
  via `QUERY_TIMEOUT_MS`).

---

## 10. UX (diretrizes para 4.5C)

### 10.1 Aba "Relatórios" no Dashboard

- Nova `TabKey = 'relatorios'` com ícone `BarChart2` (lucide-react).
- Visível para `dono_clinica` e `secretaria` (profissional não vê).
- SECTION_INTRO: "Resumo do período para apoiar a gestão da clínica.
  Não substitui contabilidade ou declarações fiscais."

### 10.2 Estrutura visual

```
[Filtros: período  |  profissional (opcional)]
[Atualizar]

── Agenda ──────────────────────────────────────
  [Total]  [Concluídos]  [Faltas]  [Cancelados]
  [Taxa de comparecimento]

── Financeiro (se autorizado) ──────────────────
  [Recebido]  [Em aberto]  [Vencido]  [Cancelado]
  [Por método de pagamento]

── Pacientes ────────────────────────────────────
  [Ativos]  [Novos no período]  [Sem agendamento recente]

── Agenda × Financeiro (se autorizado) ─────────
  [Com cobrança pendente]  [Com cobrança paga]
  [Sem cobrança]  [Cancelados com cobrança pendente]
```

### 10.3 Cards de indicadores

- Design consistente com cards do FinancialPanel.
- Cor por semântica: verde = positivo (pago, concluído), amarelo = atenção
  (pendente, falta), vermelho = crítico (vencido, cancelado com pendência).
- Sem gráficos no v0.1 (apenas números e listas).

### 10.4 Filtros de período

| Atalho | Descrição |
|---|---|
| Hoje | `date_from = date_to = hoje` |
| Últimos 7 dias | `date_from = hoje - 7d` |
| Mês atual | `date_from = 1º do mês, date_to = hoje` |
| Intervalo customizado | Inputs de data livres (máx. 366 dias) |

### 10.5 Copy (termos de UI)

"Relatórios" · "Resumo do período" · "Agenda" · "Financeiro" ·
"Pacientes" · "Recebido" · "Em aberto" · "Vencido" · "Cancelado" ·
"Consultas realizadas" · "Faltas" · "Cancelamentos" · "Sem cobrança" ·
"Pagamento pendente" · "Taxa de comparecimento" · "Novos pacientes" ·
"Sem agendamento recente"

---

## 11. Roadmap

| Sprint | Objetivo |
|---|---|
| **4.5A** (esta) | ADR 0014 + `docs/management-reports-v0-scope.md` (docs-only) |
| **4.5B** | Backend: DAOs + services + 4 endpoints (`/reports/*`) + smoke tests |
| **4.5C** | Frontend: aba "Relatórios" + ReportsPanel + filtros + cards |
| **4.5D** | QA/hardening: smoke 4 papéis; SQL; audit; cleanup; segurança |
| **4.6A** | ADR 0015 — Convênios/faturamento básico v0.1 (gate: 4.5 entregue) |

---

## 12. Critérios de aceite (4.5A)

- [x] ADR 0014 criada e aceita
- [x] `docs/management-reports-v0-scope.md` criado
- [x] Relatórios R-A/B/C/D definidos com campos, filtros e limites
- [x] Permissões explícitas por papel para cada relatório
- [x] Fontes permitidas e proibidas listadas
- [x] Segurança/LGPD documentada (audit, PII, tenant)
- [x] Arquitetura de API decidida (endpoints separados)
- [x] UX básica especificada (aba, cards, filtros, copy)
- [x] Sem migration nova autorizada
- [x] Sem export no v0.1
- [x] Nenhuma alteração de código, schema ou env
- [x] `git diff --check` rc=0

---

## 13. Relacionados

- `docs/management-reports-v0-scope.md` (checklists operacionais 4.5B/C/D)
- `docs/adr/0012-financial-module-v0.md` (Financeiro v0.1 — fonte R-B)
- `docs/adr/0013-agenda-financial-integration-v0.md` (Agenda × Financeiro — fonte R-D)
- `docs/adr/0009-clinical-architecture-roles-read-audit.md` (roles granulares)
- `docs/product-clinic-os-roadmap.md` §Fase-4.5
- `docs/security-notes.md`
- `docs/insurance-billing-future-scope.md` (Convênios — fora deste escopo)
