# ClinicBridge — Integração Agenda × Financeiro v0.1 (escopo operacional)

> Companheiro operacional da **ADR 0013**
> (`docs/adr/0013-agenda-financial-integration-v0.md`). A ADR decide;
> este documento lista **checklists, matrizes e detalhes operacionais**
> para as sprints de implementação 4.4E-B/C/D.
>
> **Sprint 4.4E-A — docs/ADR-only.** Nada aqui autoriza código.
> Gate: ADR 0013 aceita pelo dono.
>
> **Relacionado:** ADR 0013 · ADR 0012 · ADR 0006 · `docs/financial-v0-scope.md` ·
> `docs/insurance-billing-future-scope.md`.

---

## 1. Resumo executivo

| Item | Valor |
|---|---|
| **Sprint ADR/docs** | 4.4E-A (esta sprint — 2026-05-27) |
| **Sprint backend** | 4.4E-B (opcional; avaliar na sprint) |
| **Sprint frontend** | 4.4E-C |
| **Sprint QA** | 4.4E-D |
| **Tabelas novas** | Nenhuma — reutiliza `financial_charges` e `appointments` |
| **Endpoints novos** | 0 obrigatórios no MVP (endpoint `/appointments/:id/charges` opcional na 4.4E-B) |
| **Migrations** | Nenhuma |
| **Roles novas** | Nenhuma |
| **Middleware novo** | Nenhum |
| **Dependência** | ADR 0013 aceita; `financial_charges.appointment_id` já existe |

---

## 2. Dois eixos independentes — referência rápida

```
Consulta                    Cobrança
──────────────────────      ───────────────────────
scheduled ─────────────┐    pending ──── mark-paid ──► paid
confirmed              │                └── cancel ──► canceled
cancelled              │    
rescheduled            │    
no_show                │    
completed              │    
                       │    
  Sem vínculo automático entre os dois eixos.
  O sistema SUGERE. O humano DECIDE.
```

**Nota de spelling:** `appointments.status` usa `cancelled` (duplo l, padrão da migration).
`financial_charges.status` usa `canceled` (simples l). Manter consistência nos testes e na UI.

---

## 3. Estados financeiros derivados — lógica de badge

O estado financeiro de um agendamento é **derivado** de `financial_charges`, não armazenado:

```typescript
// Pseudocódigo de cálculo do badge
function appointmentFinancialState(
  appointmentId: string,
  chargeMap: Map<string, FinancialChargeListItem>,
  today: string, // ISO date 'YYYY-MM-DD'
): 'none' | 'pending' | 'overdue' | 'paid' | 'charge_canceled' {
  const charge = chargeMap.get(appointmentId);
  if (!charge) return 'none';
  if (charge.status === 'paid') return 'paid';
  if (charge.status === 'canceled') return 'charge_canceled';
  // pending
  if (charge.due_date && charge.due_date < today) return 'overdue';
  return 'pending';
}
```

**Labels UI e estilos:**

| Estado derivado | Label | Cor sugerida |
|---|---|---|
| `none` | "Sem cobrança" | Cinza/opaco (ocultável) |
| `pending` | "Pagamento pendente" | Amarelo suave (#B7791F / token existente) |
| `overdue` | "Vencido" | Vermelho suave (#C53030 / token existente) |
| `paid` | "Pago" | Verde suave (#276749 / token existente) |
| `charge_canceled` | "Cobrança cancelada" | Cinza riscado |

**Para `profissional_clinico`:** badge não é renderizado; seção financeira omitida do card.

---

## 4. Catálogo de alertas sugestivos

| ID | Condição de disparo | Texto do alerta | Ação sugerida (opcional) |
|---|---|---|---|
| A1 | `charge.status=paid` AND `appointment.status IN ('scheduled','confirmed')` | "Pagamento recebido. Deseja confirmar a consulta?" | Botão "Confirmar consulta" abre modal de confirmação |
| A2 | `charge.status=pending` AND `charge.due_date < today` AND `appointment.status IN ('scheduled','confirmed')` | "Pagamento vencido. Revise antes da consulta." | Botão "Ver cobrança" (link para detalhe no Financeiro) |
| A3 | `appointment.status='cancelled'` AND `charge.status='pending'` | "Consulta cancelada. Revise a cobrança vinculada." | Botão "Ver cobrança" (link para detalhe no Financeiro) |
| A4 | `charge.status='canceled'` AND `appointment.status IN ('scheduled','confirmed')` | "Cobrança cancelada. Revise o agendamento." | Botão "Ver agendamento" (scroll para card) |

**Invariante de alertas:**
- Cada alerta tem botão "Dispensar" (dismiss local via estado React; sem chamada de API).
- Dismiss não persiste entre sessões (v0.1).
- Nenhum alerta executa `PATCH /appointments` ou `POST .../cancel` automaticamente.

---

## 5. Fluxo "Criar cobrança" via agenda — passo a passo

```
Agenda (card/detalhe do agendamento)
  │
  ├─ [sem cobrança vinculada] → botão "Criar cobrança"
  │     │
  │     └─► NewChargeForm (reutilizar do FinancialPanel ou abrir aba Financeiro)
  │           patient_id    = appointment.patient_id   [readonly]
  │           appointment_id = appointment.id           [hidden]
  │           description   = "Consulta"               [editável]
  │           amount_cents  = ""                        [obrigatório]
  │           due_date      = ""                        [opcional]
  │           notes         = ""                        [opcional + aviso anti-clínico]
  │           ──── POST /financial/charges ────────────►
  │                                                    201 Created
  │           queryClient.invalidateQueries(['financial'])
  │           queryClient.invalidateQueries(['appointments'])
  │           badge → "Pagamento pendente"
  │
  ├─ [cobrança pending/paid vinculada] → botão "Ver cobrança"
  │     └─► navega para aba "Financeiro" com detalhe da cobrança
  │           (setTab('financeiro') + setSelectedChargeId(charge.id))
  │
  └─ [cobrança canceled vinculada] → botão "Criar nova cobrança"
        └─► mesmo fluxo acima (nova cobrança, mesmo appointment_id — permitido)
```

**Sobre reutilização de componentes:**
- Opção A: reutilizar `NewChargeForm` do `FinancialPanel` (extrair para componente compartilhado).
- Opção B: ao clicar "Criar cobrança", navegar para a aba "Financeiro" com estado pré-preenchido.
- Decisão de implementação fica para a Sprint 4.4E-C (ambas são válidas; Opção B é mais simples inicialmente).

---

## 6. Estratégia de fetch para badge

### 6.1 Abordagem MVP (recomendada para 4.4E-C)

```
Ao carregar a agenda do dia:
  1. GET /appointments?date=YYYY-MM-DD         → lista de agendamentos
  2. GET /financial/charges?limit=100          → cobranças recentes da clínica

Frontend:
  chargeMap = new Map(charges.filter(c => c.appointment_id).map(c => [c.appointment_id, c]))
  
  Para cada agendamento:
    badge = appointmentFinancialState(appt.id, chargeMap, today)
```

**React Query:**
```typescript
// Cache separado das cobranças para badge (mais leve que o full FinancialPanel)
useQuery({
  queryKey: ['financial', 'charges', 'agenda-badge', token],
  queryFn: () => api.listFinancialCharges(token, { limit: 100 }),
  staleTime: 30_000,
  enabled: isPapelAllowed, // não busca para profissional_clinico
})
```

### 6.2 Invalidação de cache — resumo

| Evento | `queryClient.invalidateQueries(...)` |
|---|---|
| Cobrança criada via agenda | `['financial']` + `['appointments']` |
| Cobrança marcada como paga (FinancialPanel) | `['financial']` + `['appointments']` |
| Cobrança cancelada (FinancialPanel) | `['financial']` + `['appointments']` |
| Agendamento cancelado/remarcado | `['appointments']` (financeiro não é invalidado automaticamente) |

**Nota:** `FinancialPanel` já invalida `['financial']` em todas as mutações. Na 4.4E-C,
adicionar `['appointments']` a essas invalidações para manter o badge sincronizado.

---

## 7. Permissões — resumo operacional

| Papel | Badge na agenda | Alertas | Criar cobrança via agenda | Ver cobrança (link) |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` | ✅ | ✅ | ✅ | ✅ |
| `gestor_clinica` | ✅ | ✅ | ❌ | ✅ |
| `profissional_clinico` | ❌ | ❌ | ❌ | ❌ |
| `admin_sistema` | ❌ (requireClinic bloqueia) | — | — | — |

**Implementação frontend:**
```typescript
const isPapelFinanceiro = user?.papel === 'dono_clinica' || user?.papel === 'secretaria';
const podeVerBadge = isPapelFinanceiro || user?.papel === 'gestor_clinica'; 
// gestor: papel='secretaria' + grant gestor_clinica → verificar com effectiveFinancialAccess backend
// Para simplificar: mostrar badge se !is403 na query de cobranças (padrão atual do FinancialPanel)
```

**Decisão de implementação:** A detecção de `gestor_clinica` é feita via grant em
`user_clinical_roles`, não via `papel` (que é sempre `secretaria` para gestores).
O frontend pode tentar buscar as cobranças e, se receber 403, não exibir o badge —
mesmo padrão do `FinancialPanel` existente.

---

## 8. Segurança — checklist para 4.4E-C

- [ ] Badge não expõe `description`, `notes`, `amount_cents` no card da agenda
- [ ] Seção financeira (badge + alertas + botões) não renderizada para `profissional_clinico`
- [ ] `appointment_id` pré-preenchido como readonly no form de criação via agenda
- [ ] Descrição sugerida é texto neutro fixo ("Consulta"), nunca dado do prontuário
- [ ] Aviso "Não inclua diagnóstico ou informações de saúde" presente no form
- [ ] Sem `console.log` de dados financeiros em componentes da agenda
- [ ] Sem `dangerouslySetInnerHTML`
- [ ] Token não colocado em URL query string
- [ ] `staleTime: 0` se/onde o detalhe financeiro for acessado diretamente na agenda

---

## 9. Fora de escopo — lista rápida

Ver ADR 0013 §4 para lista completa. Resumo:

- Convênios / carteirinha / autorização / glosa (Fase 4.6).
- Gateway / Pix automático / boleto / NFS-e.
- Confirmação/cancelamento automático entre consulta e cobrança.
- Endpoint `GET /appointments?include_financial=true` (agregador futuro).
- Badge para `profissional_clinico`.
- Nova role `financeiro_clinica`.

---

## 10. Checklist Sprint 4.4E-B (backend — se necessário)

> Avaliar na sprint se 4.4E-B é necessária ou se 4.4E-C reutiliza 100% os endpoints existentes.

- [ ] Decisão documentada: criar `GET /appointments/:id/charges` ou reutilizar `?appointment_id=` filter
- [ ] Se criar endpoint novo: `rateLimit → requireAuth → requireClinic → requireRole`
- [ ] Smoke tests para permissões (profissional → 403, gestor → charges do agendamento)
- [ ] Typecheck + build ✅

---

## 11. Checklist Sprint 4.4E-C (frontend)

### 11.1 Badge
- [ ] `useQuery(['financial', 'charges', 'agenda-badge', token])` com `limit=100`
- [ ] `chargeMap: Map<string, FinancialChargeListItem>` construído no cliente
- [ ] Função `appointmentFinancialState()` em utils/hooks (testável isoladamente)
- [ ] Badge renderizado no card/linha de agendamento
- [ ] Badge não renderizado para `profissional_clinico`
- [ ] Labels e estilos conforme §3 desta ADR

### 11.2 Alertas
- [ ] Alertas A1–A4 exibidos no detalhe do agendamento
- [ ] Dismiss local (estado React, sem chamada de API)
- [ ] Nenhum alerta executa ação automaticamente
- [ ] Alertas não renderizados para `profissional_clinico`

### 11.3 Botão "Criar cobrança"
- [ ] Visível apenas para `dono_clinica` e `secretaria`
- [ ] `appointment_id` pré-preenchido (readonly/hidden)
- [ ] `patient_id` pré-selecionado (readonly)
- [ ] Descrição sugerida "Consulta" (editável)
- [ ] Aviso anti-clínico nas observações
- [ ] Após criar: `invalidateQueries(['financial'])` + `invalidateQueries(['appointments'])`
- [ ] Badge atualizado automaticamente após criação

### 11.4 Link "Ver cobrança"
- [ ] Visível para dono, secretaria, gestor (quando cobrança existe)
- [ ] Navega para aba Financeiro com detalhe da cobrança

### 11.5 Segurança
- [ ] Todos os checks da §8 deste doc

### 11.6 Verificação de build
- [ ] `pnpm --filter frontend typecheck`
- [ ] `pnpm --filter frontend build`
- [ ] `pnpm --filter backend typecheck` (sem regressão)
- [ ] `git diff --check` rc=0

---

## 12. Checklist Sprint 4.4E-D (QA/hardening)

- [ ] Smoke browser: smoke.secretaria — badge visível após criar cobrança
- [ ] Smoke browser: smoke.owner — criar cobrança via agenda, badge atualiza
- [ ] Smoke browser: smoke.gestor — badge visível, sem botão "Criar cobrança"
- [ ] Smoke browser: smoke.profissional — sem seção financeira na agenda
- [ ] Alerta A1: criar cobrança e marcar como paga → alerta aparece
- [ ] Alerta A3: cancelar consulta com cobrança pending → alerta aparece
- [ ] Dismiss de alerta: funciona sem chamada de API
- [ ] Badge sincroniza ao voltar da aba Financeiro (invalidação de cache)
- [ ] `description` sugerida não vaza dado clínico
- [ ] Logs: sem `description`, `notes`, `amount_cents` expostos
- [ ] Typecheck + build ✅ · `git diff --check` rc=0

---

## 13. Referências

- `docs/adr/0013-agenda-financial-integration-v0.md` (esta ADR)
- `docs/adr/0012-financial-module-v0.md` (Financeiro v0.1)
- `docs/adr/0006-administrative-scheduling-module.md` (Agenda)
- `docs/financial-v0-scope.md` (checklists financeiro)
- `docs/insurance-billing-future-scope.md` (convênios — fora do escopo)
- `docs/security-notes.md`
