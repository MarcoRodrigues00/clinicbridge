# ClinicBridge — Convênios v0.1 — Escopo Operacional

> **ADR:** `docs/adr/0016-insurance-billing-v0.md` (aceita 2026-05-27)
>
> **Sprint atual:** 4.7A (docs/ADR-only) ✅
>
> **Pré-planejamento original:** `docs/insurance-billing-future-scope.md` (insumo histórico)
>
> **Relacionado:** `docs/services-catalog-v0-scope.md` ·
> `docs/financial-v0-scope.md` · `docs/adr/0012-financial-module-v0.md`

---

## 1. Invariantes de negócio (aplicáveis em toda implementação)

1. **Humano decide o valor.** `reference_price_cents` de `service_insurance_prices`
   **nunca auto-propaga** para `amount_cents` da cobrança. Exibição visual sempre.
2. **Sem TISS/TUSS real.** Nenhum campo é código normativo ANS/TUSS/CBHPM.
3. **Sem dado clínico.** `notes` de qualquer entidade de convênio nunca contém
   diagnóstico, CID, queixa, anamnese, evolução, prescrição ou dado de prontuário.
4. **Soft-delete em tudo.** `active = false`. Sem delete físico.
5. **Tenant isolation.** Toda tabela filtrada por `clinica_id`. Cross-tenant → 404 genérico.
6. **PII protegido.** `member_number` e `holder_name` → redação em logs; nunca em audit.
7. **Retrocompatibilidade.** `financial_charges` existentes ficam com campos de convênio
   `NULL` — nenhum dado histórico é alterado.
8. **Campos legados intactos.** `patients.convenio` e `patients.numero_carteirinha`
   permanecem na tabela `patients` durante e após a Sprint 4.7B.

---

## 2. Entidades a implementar (Sprint 4.7B)

| Entidade | Propósito | PII? |
|---|---|---|
| `insurance_providers` | Cadastro de operadoras da clínica | Não |
| `insurance_plans` | Planos de uma operadora (opcional) | Não |
| `patient_insurances` | Carteirinha/plano do paciente | **Sim** — `member_number`, `holder_name` |
| `service_insurance_prices` | Preço de referência por serviço × operadora | Não |
| `financial_charges` (extensão) | `payer_type`, `insurance_provider_id`, `patient_insurance_id`, `copay_amount_cents`, `insurance_amount_cents` | Não |

Ver schema conceitual detalhado: `docs/adr/0016-insurance-billing-v0.md` §3.

---

## 3. Permissões resumidas

| Papel | Operadoras/Planos (write) | `service_insurance_prices` (write) | `patient_insurances` (write) | Leitura geral |
|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (puro) | ❌ | ❌ | ✅ | ✅ |
| `secretaria + gestor` | ❌ | ❌ | ✅ | ✅ |
| `secretaria + profissional` | ❌ | ❌ | ❌ | ❌ |
| `profissional_clinico` | ❌ | ❌ | ❌ | ❌ |

---

## 4. Endpoints API planejados (Sprint 4.7B)

### 4.1 Operadoras

```
GET    /insurance/providers                      # lista operadoras ativas/inativas
POST   /insurance/providers                      # criar operadora (owner-only)
GET    /insurance/providers/:id                  # detalhe
PATCH  /insurance/providers/:id                  # editar (owner-only)
PATCH  /insurance/providers/:id/status           # ativar/desativar (owner-only)
```

### 4.2 Planos de uma operadora

```
GET    /insurance/providers/:id/plans            # lista planos da operadora
POST   /insurance/providers/:id/plans            # criar plano (owner-only)
PATCH  /insurance/providers/:id/plans/:planId    # editar plano (owner-only)
PATCH  /insurance/providers/:id/plans/:planId/status  # ativar/desativar
```

### 4.3 Preços por serviço

```
GET    /insurance/providers/:id/service-prices        # lista preços da operadora
POST   /insurance/providers/:id/service-prices        # criar preço (owner-only)
PATCH  /insurance/providers/:id/service-prices/:priceId  # editar (owner-only)
DELETE /insurance/providers/:id/service-prices/:priceId  # desativar (owner-only)
```

### 4.4 Convênios do paciente

```
GET    /patients/:id/insurances                  # lista planos do paciente
POST   /patients/:id/insurances                  # vincular plano (owner + secretaria)
PATCH  /patients/:id/insurances/:insId           # editar vínculo
PATCH  /patients/:id/insurances/:insId/status    # ativar/desativar
```

**Pipeline:** `patientsRateLimit → requireAuth → requireClinic → requireRole`.

**Nota:** a definição exata de rotas, agrupamentos e parâmetros pode ser ajustada
na Sprint 4.7B sem nova ADR, desde que as permissões e invariantes sejam mantidos.

---

## 5. Audit metadata-only

Eventos esperados em `audit_logs` (acao → recurso → recurso_id):

| Evento | Recurso | recurso_id |
|---|---|---|
| `insurance.provider.create.success` | `insurance_provider` | `<id>` |
| `insurance.provider.update.success` | `insurance_provider` | `<id>` |
| `insurance.provider.status.update.success` | `insurance_provider` | `<id>` |
| `insurance.plan.create.success` | `insurance_plan` | `<id>` |
| `insurance.plan.update.success` | `insurance_plan` | `<id>` |
| `insurance.service_price.create.success` | `insurance_service_price` | `<id>` |
| `insurance.service_price.update.success` | `insurance_service_price` | `<id>` |
| `insurance.patient.link.success` | `patient_insurance` | `<id>` |
| `insurance.patient.update.success` | `patient_insurance` | `<id>` |

**Nunca incluir no audit:** nome de paciente, `member_number`, `holder_name`, CPF,
valor de preço de referência, dados clínicos ou qualquer PII.

---

## 6. Segurança e LGPD — checklist de implementação (4.7B)

- [ ] `member_number` e `holder_name` adicionados à lista de redação em `logger.ts`.
- [ ] Export LGPD art. 18 (`GET /patients/:id`) estendido com `patient_insurances`.
- [ ] Cross-tenant em todas as entidades retorna 404 genérico (anti-enumeração).
- [ ] Audit de escrita criado para todas as operações relevantes.
- [ ] `notes` em qualquer entidade nunca contém dado clínico (aviso na UI).
- [ ] `patients.convenio` e `patients.numero_carteirinha` mantidos intactos.
- [ ] Migração assistida de campos legados (docs/script) — não automática.

---

## 7. UX planejada (Sprint 4.7C)

### 7.1 Cadastro de operadoras (aba Equipe ou aba nova "Convênios")

- Lista de operadoras ativas da clínica.
- Botões Novo / Editar / Desativar (owner-only).
- Drill-down para planos e preços por serviço.

### 7.2 Cadastro de planos de uma operadora

- Lista de planos com nome e status.
- Botões Novo / Editar / Desativar (owner-only).

### 7.3 Preço por serviço × operadora

- Tabela cruzada serviço × operadora com preço de referência.
- Sem auto-preenchimento — botão "Usar preço do convênio" é ação explícita do usuário.

### 7.4 Seção "Convênios" no perfil do paciente

- Lista dos planos ativos do paciente (operadora, plano, carteirinha mascarada, validade).
- Alerta visual se `valid_until < hoje + 30 dias`.
- Botões Adicionar / Editar / Desativar (owner + secretaria).
- Campo `member_number` exibido mascarado por padrão (ex.: `****-1234`); expansão
  com ação explícita e audit de leitura (se decidido no futuro).

### 7.5 Agenda — badge de pagador

- Badge "Convênio" / "Particular" / "Misto" por agendamento (se informado).
- Campo "Forma de atendimento" no formulário de novo agendamento:
  - Particular (padrão)
  - Convênio (dropdown dos convênios ativos do paciente)
  - Misto / Coparticipação
- Seleção não obrigatória — campo opcional, como `service_id`.

### 7.6 Financeiro — split de pagador

- Campo "Pagador" em `NewChargeForm` / `EditChargeForm`:
  - Particular, Convênio ou Misto.
- Quando Convênio ou Misto: seletores de operadora / plano e campos de valor.
- Sugestão visual do preço de referência (`service_insurance_prices`) — sem auto-fill.
- Botão "Usar preço de referência do convênio" = ação explícita do usuário.
- Totalizadores na listagem: "A receber — Particular" e "A receber — Convênio"
  (extensão da aba Financeiro existente).

### 7.7 Alertas sugestivos (não automáticos)

| Alerta | Gatilho | Ação humana |
|---|---|---|
| Carteirinha vencida | `valid_until < hoje` | Secretaria solicita atualização |
| Carteirinha próxima do vencimento | `valid_until < hoje + 30d` | Alerta visual, sem bloqueio |
| Paciente sem convênio registrado | Agendamento com `payer_type = 'insurance'` mas sem `patient_insurance_id` | Secretaria registra carteirinha |

---

## 8. Fora do escopo v0.1

| Item | Versão |
|---|---|
| TISS/TUSS real (XML, webservice ANS) | ADR futura pós-4.7 estabilizado |
| Autorização eletrônica de procedimento | v0.2+ (entidade `appointment_insurance_authorizations`) |
| Glosa / evento de negativa | v0.2+ |
| Estados separados patient_paid / insurance_received | v0.2+ |
| Lote de faturamento ANS | ADR futura separada |
| Elegibilidade online | ADR futura separada |
| Gateway de pagamento | ADR futura separada |
| Repasse automático ao profissional | Fase futura com ADR própria |
| NFS-e por cobrança | ADR futura + análise municipal |
| Relatórios segmentados particular × convênio | 4.7D+ ou sprint própria pós-4.7D |
| Importação CSV de tabela de convênio | Fase futura (extensão do pipeline de import) |
| Isolamento de especialidade dentro da mesma clínica | ADR futura se necessário (ex.: psicologia vs. medicina) |

---

## 9. Checklist por sprint

### Sprint 4.7A — ADR 0016 + Escopo (docs-only) ✅

- [x] ADR 0016 criada (`docs/adr/0016-insurance-billing-v0.md`).
- [x] Este documento criado (`docs/insurance-billing-v0-scope.md`).
- [x] CLAUDE.md atualizado.
- [x] `docs/project-state.md` atualizado.
- [x] `docs/sprint-history.md` atualizado.
- [x] `docs/roadmap-next-phase.md` atualizado.
- [x] `docs/product-clinic-os-roadmap.md` atualizado.
- [x] `git diff --check` rc=0.
- [x] Zero código, schema, migration ou env alterados.

### Sprint 4.7B — Backend Convênios v0.1

- [ ] Migration única aditiva: `insurance_providers`, `insurance_plans`,
      `patient_insurances`, `service_insurance_prices`.
- [ ] Migration de extensão: `financial_charges` ganha `payer_type`,
      `insurance_provider_id`, `patient_insurance_id`, `copay_amount_cents`,
      `insurance_amount_cents`.
- [ ] DAOs: `insuranceProviderDao`, `insurancePlanDao`, `patientInsuranceDao`,
      `serviceInsurancePriceDao`.
- [ ] Services: `insuranceProviderService`, `patientInsuranceService`.
- [ ] Controllers + rotas (endpoints §4).
- [ ] Logger estendido: `member_number` e `holder_name` na lista de redação.
- [ ] Export LGPD estendido com `patient_insurances`.
- [ ] Smoke API: auth/permissão, CRUD, limites, tenant, PII.
- [ ] `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` N/0 ✅.
- [ ] `git diff --check` rc=0.

### Sprint 4.7C — Frontend Convênios v0.1

- [ ] Seção "Convênios" no perfil do paciente (owner + secretaria).
- [ ] Aba ou seção de gerenciamento de operadoras/planos (owner-only).
- [ ] Badge de pagador na Agenda.
- [ ] Campo "Pagador" + split financeiro no `FinancialPanel`.
- [ ] Alerta de carteirinha vencida/próxima do vencimento.
- [ ] Sem auto-preenchimento de valor — botão explícito.
- [ ] `pnpm --filter frontend typecheck` ✅ · `build` ✅.
- [ ] `git diff --check` rc=0.

### Sprint 4.7D — QA/Hardening Convênios v0.1

- [ ] Smoke API completo (todas as rotas; todos os papéis).
- [ ] SQL: grep sem `SELECT *` sem filtro tenant.
- [ ] Audit/logs: `member_number`, `holder_name` ausentes em todos os logs.
- [ ] Frontend security greps: sem PII em localStorage, sem dangerouslySetInnerHTML.
- [ ] Regressão: smoke 4.6D + smoke 4.4D ainda passam.
- [ ] `pnpm --filter frontend typecheck` ✅ · `build` ✅ · `pnpm --filter backend typecheck` ✅ · `build` ✅.
- [ ] `migrate:status` N/0 ✅ · `git diff --check` rc=0.

---

## 10. Gate para Sprint 4.8A (ADR 0017 — Estoque v0.1)

- Sprint 4.7 (A+B+C+D) entregue e QA aprovado.
- Pelo menos um paciente com convênio registrado e uma cobrança de convênio criada.
- Decisão sobre migração de `patients.convenio` documentada (feita ou descartada).
