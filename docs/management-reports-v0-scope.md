# ClinicBridge — Relatórios Gerenciais v0.1 (escopo operacional)

> Companheiro operacional da **ADR 0014**
> (`docs/adr/0014-management-reports-v0.md`). A ADR decide;
> este documento lista **checklists, matrizes e detalhes operacionais**
> para as sprints de implementação 4.5B/C/D.
>
> **Sprint 4.5A — docs/ADR-only.** Nada aqui autoriza código.
> Gate: ADR 0014 aceita pelo dono.
>
> **Relacionado:** ADR 0014 · ADR 0012 · ADR 0013 · ADR 0009 ·
> `docs/financial-v0-scope.md` · `docs/agenda-financial-integration-v0-scope.md` ·
> `docs/insurance-billing-future-scope.md`.

---

## 1. Resumo executivo

| Item | Valor |
|---|---|
| **Sprint ADR/docs** | 4.5A (esta sprint — 2026-05-27) |
| **Sprint backend** | 4.5B |
| **Sprint frontend** | 4.5C |
| **Sprint QA** | 4.5D |
| **Tabelas novas** | Nenhuma — reutiliza `appointments`, `financial_charges`, `patients` |
| **Endpoints novos** | 4 (ver §4) |
| **Migrations** | Nenhuma |
| **Roles novas** | Nenhuma |
| **Middleware novo** | Nenhum (reutiliza `requireAuth + requireClinic + requireRole`) |
| **Export** | Sem export no v0.1 |
| **Dependência** | ADR 0014 aceita |

---

## 2. Quatro relatórios — referência rápida

```
R-A  Resumo Operacional (Agenda)
     appointments → status counts, attendance_rate
     filtros: date_from, date_to, professional_id
     acesso: todos (dono + secretaria)

R-B  Resumo Financeiro
     financial_charges → received, pending, overdue, cancelled, by_method
     filtros: date_from, date_to
     acesso: dono + gestor (effectiveFinancialAccess != 'none')

R-C  Resumo de Pacientes
     patients → active, archived, new_in_period, with_appointment
     filtros: date_from, date_to
     acesso: todos (dono + secretaria)

R-D  Agenda × Financeiro
     appointments + financial_charges → cobrança por status de consulta
     filtros: date_from, date_to, professional_id
     acesso: dono + gestor (effectiveFinancialAccess != 'none')
```

---

## 3. Matriz de permissões

| Papel | R-A | R-B | R-C | R-D |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` + `gestor_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (pura) | ✅ | ✅ | ✅ | ✅ |
| `secretaria` + `profissional_clinico` | ✅ | ❌ | ✅ | ❌ |
| `profissional_clinico` | ❌ | ❌ | ❌ | ❌ |
| `admin_sistema` | ❌ | ❌ | ❌ | ❌ |

**Nota:** Secretaria pura tem `effectiveFinancialAccess = 'full'` (ADR 0012 §5),
portanto acessa R-B e R-D. Profissional tem `effectiveFinancialAccess = 'none'` →
403. O bloqueio de R-A e R-C para profissional é no middleware `requireRole`
(profissional não tem papel administrativo).

---

## 4. Especificação dos endpoints (para 4.5B)

### 4.1 Pipeline comum

```
rateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])
→ [service verifica effectiveFinancialAccess para R-B e R-D]
```

### 4.2 Parâmetros comuns

| Param | Tipo | Obrigatório | Default | Validação |
|---|---|---|---|---|
| `date_from` | `YYYY-MM-DD` | Sim | 1º dia do mês atual | date válida |
| `date_to` | `YYYY-MM-DD` | Sim | hoje | date válida; ≥ date_from |
| `professional_id` | UUID | Não | — | apenas R-A e R-D |

**Limites:**
- `date_to - date_from > 366` → 400 `interval_too_large`
- `date_from < hoje - 2 anos` → 400 `interval_too_old` (soft limit)

### 4.3 GET /reports/appointments (R-A)

```json
{
  "report": "appointments",
  "date_from": "2026-05-01",
  "date_to": "2026-05-31",
  "professional_id": null,
  "data": {
    "total": 42,
    "scheduled": 5,
    "confirmed": 2,
    "completed": 28,
    "cancelled": 4,
    "no_show": 3,
    "attendance_rate": 0.71
  },
  "attention": [
    { "appointment_id": "uuid", "starts_at": "2026-05-10T09:00Z", "status": "scheduled" }
  ]
}
```

`attention`: agendamentos com `status IN ('scheduled','confirmed')` e
`starts_at < hoje - 3 dias` (consultas passadas sem evolução de status).
Limite: 20 itens. Campos: `appointment_id`, `starts_at`, `status` — sem nome
de paciente, sem `administrative_notes`.

### 4.4 GET /reports/financial (R-B)

```json
{
  "report": "financial",
  "date_from": "2026-05-01",
  "date_to": "2026-05-31",
  "data": {
    "received_cents": 120000,
    "pending_cents": 45000,
    "overdue_cents": 15000,
    "cancelled_cents": 20000,
    "count_paid": 8,
    "count_pending": 3,
    "count_overdue": 1,
    "count_cancelled": 2,
    "by_payment_method": [
      { "method": "pix", "total_cents": 80000, "count": 5 },
      { "method": "card", "total_cents": 40000, "count": 3 }
    ]
  }
}
```

- `received_cents`: `SUM(amount_cents) WHERE status='paid' AND paid_at BETWEEN date_from AND date_to`.
- `pending_cents`: `SUM(amount_cents) WHERE status='pending'` (sem filtro de data — total em aberto).
- `overdue_cents`: `SUM(amount_cents) WHERE status='pending' AND due_date < hoje`.
- `cancelled_cents`: `SUM(amount_cents) WHERE status='canceled' AND canceled_at BETWEEN dates`.
- Sem `notes`, `cancel_reason`, `description`, nome de paciente.

### 4.5 GET /reports/patients (R-C)

```json
{
  "report": "patients",
  "date_from": "2026-05-01",
  "date_to": "2026-05-31",
  "data": {
    "total_active": 48,
    "total_archived": 6,
    "new_in_period": 4,
    "with_appointment_in_period": 22,
    "without_recent_appointment": 12
  }
}
```

- `without_recent_appointment`: ativos sem agendamento nos últimos 90 dias
  (parâmetro `no_appt_days`, default 90, máx 365).
- Sem nome, CPF, telefone, e-mail de paciente na resposta.

### 4.6 GET /reports/agenda-financial (R-D)

```json
{
  "report": "agenda-financial",
  "date_from": "2026-05-01",
  "date_to": "2026-05-31",
  "data": {
    "with_pending_charge": 5,
    "with_paid_charge": 28,
    "with_overdue_charge": 2,
    "without_charge": 7,
    "cancelled_with_pending": 1,
    "charge_cancelled_appt_active": 0
  }
}
```

- Sem `notes`, `cancel_reason`, `description`.
- Contagens puras — sem listar IDs individuais na resposta principal.
- Lista de atenção opcional (máx 20): `appointment_id` + `starts_at` dos casos
  `cancelled_with_pending` e `charge_cancelled_appt_active` (acionáveis pelo usuário).

---

## 5. Segurança — checklist para 4.5B

- [ ] `clinica_id` em todas as queries — nunca `listAll` nem busca cross-tenant
- [ ] Parâmetros de data validados (formato, ordem, limite de intervalo)
- [ ] `professional_id` validado como pertencente à clínica antes do uso
- [ ] Sem `clinical_encounters`, `clinical_notes`, `clinical_documents` em qualquer query
- [ ] Sem `administrative_notes` de appointments
- [ ] Sem `notes`/`cancel_reason`/`description` de financial_charges
- [ ] Sem CPF/nome/telefone/e-mail de paciente na resposta
- [ ] R-B e R-D bloqueados para `profissional_clinico` (403 forbidden_role)
- [ ] R-A e R-C bloqueados para `admin_sistema` (requireClinic → no_clinic_context)
- [ ] `audit_logs` escrito com `report.view.success` (sem PII nos campos de audit)
- [ ] `errorHandler` nunca retorna stack/SQL/path
- [ ] Sem `console.log` de dados financeiros ou de pacientes
- [ ] Sem `dangerouslySetInnerHTML` no frontend
- [ ] Token não vai em URL query string

---

## 6. Segurança — checklist para 4.5C (frontend)

- [ ] ReportsPanel não renderiza para `profissional_clinico`
- [ ] Seção R-B e R-D não renderiza se `is403` (ou acesso bloqueado)
- [ ] Sem nome de paciente exibido em listas
- [ ] Sem CPF, telefone, e-mail exibidos
- [ ] staleTime razoável nas queries (ex.: 60_000 ms para relatórios on-demand)
- [ ] Mensagem clara se período máximo excedido (400 → UI amigável)
- [ ] Aviso: "Este relatório é gerencial. Não substitui contabilidade formal."
- [ ] Sem `localStorage/sessionStorage` para dados de relatório
- [ ] Sem `dangerouslySetInnerHTML`

---

## 7. Fora do escopo — lista rápida

Ver ADR 0014 §4 para lista completa. Resumo:

- Dados clínicos (qualquer campo de prontuário/documentos).
- Export CSV/XLSX (requer ADR própria).
- Gráficos/dashboards visuais (sprint posterior ao v0.1).
- Relatórios agendados/cron.
- Produtividade individual do profissional.
- Convênios/repasse médico.
- Comparação multi-período ou multi-clínica.
- Nome/CPF/dados identificáveis de paciente em listas.

---

## 8. Checklist Sprint 4.5B (backend) — ENTREGUE 2026-05-27

### 8.1 DAO / Service

- [x] `reportsDao` (`backend/src/dao/reportsDao.ts`) — tenant-scoped (29 ocorrências `clinica_id`), sem `listAll`
- [x] `reportsService` (`backend/src/services/reportsService.ts`) — 4 métodos:
  `appointments`, `financial`, `patients`, `agendaFinancial`
- [x] Validação de intervalo de datas (max 366 dias, floor ~2 anos, round-trip ISO anti `feb 30`)
- [x] `effectiveFinancialAccess` verificado em `financial` e `agendaFinancial` (profissional → 403)
- [x] Audit `report.<type>.view.success` registrado nos 4 relatórios (metadata-only; `recurso_id=<type>:<from>:<to>`)

### 8.2 Controller + Rotas

- [x] `reportsController` (`backend/src/controllers/reportsController.ts`) thin — 4 handlers
- [x] Rota `GET /reports/appointments`
- [x] Rota `GET /reports/financial`
- [x] Rota `GET /reports/patients`
- [x] Rota `GET /reports/agenda-financial`
- [x] Pipeline: `patientsRateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`
- [x] Registro: `app.use(reportsRouter)` em `backend/src/app.ts` após `financialChargesRouter`

### 8.3 Verificação de build

- [x] `pnpm --filter backend typecheck` ✅
- [x] `pnpm --filter backend build` ✅
- [x] `pnpm --filter frontend typecheck` ✅
- [x] `git diff --check` rc=0 ✅
- [x] `pnpm --filter backend migrate:status` — 15/15 aplicadas, zero pendentes, zero novas ✅

### 8.4 Smoke tests (24 + 27 = 51/51 PASS)

- [x] Auth/permissão: 24/24 — matriz 6 usuários × 4 endpoints (incluindo sem token).
- [x] Filtros inválidos: 10/10 (`date_*` formato/impossível/ordem/intervalo, `professional_id` mal-formado/cross-tenant, `no_appt_days` non-numeric/0/999).
- [x] Payload safety: 12/12 (varredura de chaves + substring scan; sem PII/clinical).
- [x] Content shape: 5/5 (chaves obrigatórias em `data` + `attention`).
- [x] Audit DB: 22 linhas `report.*.view.success` com `recurso_id` no formato esperado.

### 8.5 Decisão técnica registrada

- Reuso de `patientsRateLimit` (read-style) para os 4 endpoints — mesma cadência dos GETs de pacientes/financeiro.
- R-D usa raw SQL parametrizado com `DISTINCT ON (fc.appointment_id) ... ORDER BY fc.created_at DESC` (Postgres-only) para resolver "latest charge per appointment" sem materializar IDs no service.
- R-B `pending`/`overdue` ignoram a janela (saldo aberto atual) por desenho — ADR 0014 §3.3.

### 8.6 Ressalvas aceitas (Sprint 4.5B)

- Sem frontend até 4.5C.
- Sem export (CSV/PDF/XLSX) — futuro com ADR própria.
- Relatórios on-demand; sem cache, sem materialização.
- Intervalo máximo 366 dias por desenho.
- Sem dados clínicos; sem nomes/CPF/contato de pacientes (apenas `appointment_id` na lista de atenção R-A).
- Profissional `effectiveFinancialAccess='none'` → 403 nas trilhas R-B/R-D.

---

## 9. Checklist Sprint 4.5C (frontend) — ENTREGUE 2026-05-27

### 9.1 Estrutura

- [x] `TabKey += 'relatorios'` em Dashboard
- [x] TABS: `{ key: 'relatorios', label: 'Relatórios', icon: BarChart3 }`
- [x] SECTION_INTRO para 'relatorios'
- [x] `ReportsPanel` component + `ReportsPanel.module.css`
- [x] 4 funções de API em `api.ts` (`getAppointmentReport`, `getFinancialReport`, `getPatientsReport`, `getAgendaFinancialReport`) + helper `buildReportsQuery`

### 9.2 Filtros

- [x] Atalhos: Hoje / Últimos 7 dias / Mês atual / Personalizado
- [x] Inputs `date_from` / `date_to` para Personalizado
- [x] Validação visual `date_to >= date_from` antes de refetch; backend valida intervalo máximo 366 dias e responde `report_invalid_filters` com mensagem amigável (mostrada como está)
- [ ] `professional_id` opcional em R-A e R-D — **não exposto na UI v0.1** (backend aceita; pode entrar em 4.5D se necessário)
- [ ] `no_appt_days` em R-C — **fixo em 90 dias na UI v0.1** (sem controle dedicado)

### 9.3 Cards de indicadores

- [x] R-A: total, agendadas, confirmadas, realizadas, canceladas, faltas, taxa de comparecimento + lista "Em atraso" (até 8, sem UUID)
- [x] R-B: recebido, em aberto, vencido, cancelado, cobranças pagas/pendentes, por método de pagamento (Dinheiro/Pix/Cartão/Transferência/Outro)
- [x] R-C: ativos, novos no período, com agendamento no período, sem agendamento recente, arquivados
- [x] R-D: appointments_total, sem cobrança, pendente, pago, vencido, cobrança cancelada + 2 sinais ("cancelada com pendente", "cobrança cancelada com consulta ativa")

### 9.4 Segurança

- [x] `ReportsPanel` gateia `papel ∈ {dono_clinica, secretaria}` (admin já fica no JoinClinicGate)
- [x] Seções financeira (R-B) e Agenda × Financeiro (R-D) viram `SectionBlocked` se 403 — não derruba o painel
- [x] Aviso "Nenhum dado clínico é exibido aqui" no cabeçalho
- [x] Sem nome/CPF/telefone/e-mail/notes/description/cancel_reason/administrative_notes/body/internal_note/clinical/diagnostico/cid/prescricao/evolucao na UI (não estão nos tipos)
- [x] Sem UUID exibido como informação principal (lista "Em atraso" mostra só horário + status)
- [x] Token só em header `Authorization` (apiFetch); nunca em URL
- [x] Sem `console.log`/`localStorage`/`sessionStorage`/`dangerouslySetInnerHTML`
- [x] Valores em BRL via `Intl.NumberFormat`; nunca `amount_cents` cru
- [x] Sem export / sem cópia

### 9.5 Verificação de build

- [x] `pnpm --filter frontend typecheck` ✅
- [x] `pnpm --filter frontend build` ✅ (warning de bundle pré-existente, não relacionado)
- [x] `pnpm --filter backend typecheck` ✅
- [x] `git diff --check` rc=0 ✅

---

## 10. Checklist Sprint 4.5D (QA/hardening)

- [ ] Smoke: dono — todos os 4 relatórios retornam 200
- [ ] Smoke: secretaria (pura) — R-A/C 200; R-B/D 200 (secretaria=full)
- [ ] Smoke: gestor — R-A/B/C/D 200
- [ ] Smoke: profissional — R-A/C 403; R-B/D 403
- [ ] Smoke: admin_sistema — qualquer /reports/* 403
- [ ] SQL: intervalo > 366 dias → 400
- [ ] SQL: without_recent_appointment usa parâmetro correto
- [ ] Audit: `report.view.success` registrado para cada acesso
- [ ] Audit: sem PII em recurso_id
- [ ] Logs: sem `notes`/`description`/`amount_cents` individuais
- [ ] Frontend: profissional não vê aba Relatórios
- [ ] Frontend: secretaria pura não vê seção financeira quebrada
- [ ] Frontend: limite 366 dias exibe mensagem amigável
- [ ] Typecheck + build ✅ · `git diff --check` rc=0

---

## 11. Referências

- `docs/adr/0014-management-reports-v0.md` (esta ADR)
- `docs/adr/0012-financial-module-v0.md` (Financeiro v0.1)
- `docs/adr/0013-agenda-financial-integration-v0.md` (Agenda × Financeiro)
- `docs/adr/0009-clinical-architecture-roles-read-audit.md` (roles)
- `docs/financial-v0-scope.md` (checklists financeiro)
- `docs/security-notes.md`
- `docs/insurance-billing-future-scope.md` (convênios — fora do escopo)
