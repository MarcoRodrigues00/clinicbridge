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

## 8. Checklist Sprint 4.5B (backend)

### 8.1 DAO / Service

- [ ] `ReportDao` (ou queries inline no service) — tenant-scoped, sem `listAll`
- [ ] `ReportService` — 4 métodos: `appointmentsReport`, `financialReport`,
  `patientsReport`, `agendaFinancialReport`
- [ ] Validação de intervalo de datas (max 366 dias, não anterior a 2 anos)
- [ ] `effectiveFinancialAccess` verificado em `financialReport` e `agendaFinancialReport`
- [ ] Audit `report.view.success` registrado em todos os relatórios

### 8.2 Controller + Rotas

- [ ] `ReportController` thin — 4 handlers
- [ ] Rota `GET /reports/appointments`
- [ ] Rota `GET /reports/financial`
- [ ] Rota `GET /reports/patients`
- [ ] Rota `GET /reports/agenda-financial`
- [ ] Pipeline: `rateLimit → requireAuth → requireClinic → requireRole`

### 8.3 Verificação de build

- [ ] `pnpm --filter backend typecheck`
- [ ] `pnpm --filter backend build`
- [ ] `pnpm --filter frontend typecheck` (sem regressão)
- [ ] `git diff --check` rc=0

---

## 9. Checklist Sprint 4.5C (frontend)

### 9.1 Estrutura

- [ ] `TabKey += 'relatorios'` em Dashboard
- [ ] TABS: `{ key: 'relatorios', label: 'Relatórios', icon: BarChart2 }`
- [ ] SECTION_INTRO para 'relatorios'
- [ ] `ReportsPanel` component + `ReportsPanel.module.css`
- [ ] 4 funções de API em `api.ts` (getAppointmentsReport, getFinancialReport, etc.)

### 9.2 Filtros

- [ ] Atalhos: hoje / 7 dias / mês atual / customizado
- [ ] Inputs `date_from` / `date_to` para customizado
- [ ] Validação de intervalo máximo (366 dias) — mensagem de erro amigável
- [ ] `professional_id` opcional em R-A e R-D

### 9.3 Cards de indicadores

- [ ] R-A: total, concluídos, faltas, cancelados, taxa de comparecimento
- [ ] R-B: recebido, em aberto, vencido, cancelado, por método de pagamento
- [ ] R-C: ativos, novos, sem agendamento recente
- [ ] R-D: sem cobrança, cobrança pendente, paga, cancelados com pendência

### 9.4 Segurança

- [ ] ReportsPanel não renderiza para `profissional_clinico`
- [ ] Seção financeira (R-B, R-D) ocultada se 403 da API
- [ ] Aviso gerencial exibido
- [ ] Sem nome/CPF de paciente na UI

### 9.5 Verificação de build

- [ ] `pnpm --filter frontend typecheck`
- [ ] `pnpm --filter frontend build`
- [ ] `pnpm --filter backend typecheck` (sem regressão)
- [ ] `git diff --check` rc=0

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
