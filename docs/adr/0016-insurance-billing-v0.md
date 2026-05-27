# ADR 0016 — Convênios v0.1 (manual básico)

> **Status:** Aceita — 2026-05-27
>
> **Sprint:** 4.7A (docs/ADR-only)
>
> **Relacionado:**
> `docs/adr/0012-financial-module-v0.md` ·
> `docs/adr/0015-services-catalog-commercial-layer-v0.md` ·
> `docs/insurance-billing-future-scope.md` (insumo/pré-planejamento) ·
> `docs/insurance-billing-v0-scope.md` (operacional desta ADR) ·
> `docs/services-catalog-v0-scope.md` ·
> `docs/product-clinic-os-roadmap.md`
>
> **O que esta ADR autoriza:** docs e planejamento da Fase 4.7.
> **Nenhum código, schema, migration ou endpoint foi criado nesta sprint.**

---

## 1. Contexto

O ClinicBridge tem hoje (pós-Sprint 4.6D):

- **Catálogo de Serviços v0.1:** `clinic_services` com nome, categoria, duração e
  preço de tabela; `professional_services` vinculando profissional × serviço;
  `appointments.service_id` e `financial_charges.service_id` como campos opcionais.
  Serviço é etiqueta administrativa — sem TUSS/CBHPM, sem prontuário.

- **Financeiro v0.1:** cobranças **particulares** manuais (`pending → paid | canceled`).
  Valor, forma de pagamento e observações entradas à mão. Sem convênio, sem TISS.

- **Pacientes — campos legados:** `patients.convenio` e `patients.numero_carteirinha`
  existem como texto livre herdado do CSV de importação. Sem entidade estruturada de
  operadora, plano ou carteirinha.

- **Relatórios v0.1:** 4 relatórios gerenciais lendo tabelas existentes. Sem corte por
  "particular vs. convênio" porque não existe essa distinção estruturada.

**Lacuna percebida pela clínica-piloto (multi-especialidade: médico + psicóloga):**

> "Quero registrar que o João vem pelo Unimed e a Maria vem particular, e ver no
> financeiro quanto eu tenho a receber de cada convênio este mês."

Para isso precisamos de convênios estruturados — operadoras, planos e carteirinhas do
paciente. Esta ADR decide o escopo do v0.1 e o faseamento correto.

**Cenário-piloto relevante:**

A clínica-piloto atende médico, psicóloga e possivelmente odontóloga. Isso importa por:

- A psicologia tem regras de privacidade mais rígidas em algumas operadoras (separação
  de dados entre especialidades). O modelo deve manter dados de convênio claramente
  administrativos, nunca clínicos.
- Multi-especialidade pode significar convênios diferentes por profissional (Unimed
  aceita o médico mas não a psicóloga). O vínculo operadora × serviço (`service_insurance_prices`)
  contempla esse cenário sem forçar automação.

---

## 2. Decisão central

**Convênios v0.1 = camada administrativa/comercial manual.**

- Cadastro de operadoras e planos aceitos pela clínica.
- Registro do plano do paciente (carteirinha/operadora/validade) — dado pessoal
  administrativo.
- Preço de referência por serviço × operadora — nunca auto-propaga para `amount_cents`.
- Cobrança financeira com indicação de pagador (particular, convênio, misto).
- **Humano decide** o valor final em toda operação financeira.

**O que NÃO é Convênios v0.1:**

- TISS/TUSS/ANS real — sem geração, envio ou validação de XML.
- Autorização eletrônica de procedimento.
- Lote de faturamento ou reconciliação automática de glosa.
- Integração com operadora (portal, API, webservice).
- Elegibilidade online.
- Nota fiscal eletrônica (NFS-e).
- Gateway de pagamento.
- Repasse automático ao médico.
- Qualquer dado clínico, diagnóstico, CID, queixa, prontuário ou prescrição.

---

## 3. Entidades conceituais (implementação em 4.7B+)

As entidades abaixo são **conceituais nesta ADR**. Nenhum schema ou migration existe
até a Sprint 4.7B. Os campos são sugestão orientativa — a implementação pode ajustar
tamanhos e constraints sem nova ADR, desde que os invariantes de segurança e negócio
sejam mantidos.

### 3.1 `insurance_providers` — operadoras aceitas pela clínica

```
id              uuid        PK DEFAULT gen_random_uuid()
clinica_id      uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
name            text        NOT NULL  -- "Unimed", "Bradesco Saúde", etc.
                                      -- CHECK length 1..200
active          boolean     NOT NULL  DEFAULT true
notes           text        NULL      -- observações administrativas; nunca dado clínico
                                      -- CHECK length <= 500
created_at      timestamptz NOT NULL  DEFAULT now()
updated_at      timestamptz NOT NULL  DEFAULT now()

UNIQUE INDEX (clinica_id, lower(btrim(name)))  -- case-insensitive, tolerante a espaços
```

**Regras:**
- Tenant-scoped. Uma clínica cadastra apenas as operadoras com que trabalha.
- Soft-delete via `active = false`. Desativar não apaga histórico.
- Sem código ANS no v0.1 — campo `ans_code` pode ser informativo no futuro.
- `notes` nunca contém diagnóstico, CID, dado clínico ou nome de paciente.

---

### 3.2 `insurance_plans` — planos de uma operadora

```
id              uuid        PK DEFAULT gen_random_uuid()
clinica_id      uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
provider_id     uuid        NOT NULL FK insurance_providers(id) ON DELETE CASCADE
name            text        NOT NULL  -- "Unipart Flex", "Nacional Flex", etc.
                                      -- CHECK length 1..150
active          boolean     NOT NULL  DEFAULT true
notes           text        NULL      -- CHECK length <= 500
created_at      timestamptz NOT NULL  DEFAULT now()
updated_at      timestamptz NOT NULL  DEFAULT now()

UNIQUE INDEX (clinica_id, provider_id, lower(btrim(name)))
```

**Regras:**
- Entidade **opcional** — clínicas que não distinguem planos mantêm `plan_id = NULL`
  em `patient_insurances` e `service_insurance_prices`.
- Soft-delete via `active = false`.
- `provider_id` e `clinica_id` devem ser da mesma clínica — validação no service.

---

### 3.3 `patient_insurances` — carteirinha/plano do paciente

```
id              uuid        PK DEFAULT gen_random_uuid()
clinica_id      uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
patient_id      uuid        NOT NULL FK patients(id) ON DELETE CASCADE
provider_id     uuid        NOT NULL FK insurance_providers(id) ON DELETE SET NULL
plan_id         uuid        NULL     FK insurance_plans(id) ON DELETE SET NULL
member_number   text        NULL     -- número do beneficiário/carteirinha ← PII
                                     -- CHECK length <= 100; redação obrigatória em logs
valid_until     date        NULL     -- validade da carteirinha; alerta de UI quando vencida
holder_name     text        NULL     -- titular, se paciente é dependente ← PII
                                     -- CHECK length <= 200; redação em logs
active          boolean     NOT NULL DEFAULT true
notes           text        NULL     -- CHECK length <= 500; nunca dado clínico
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()

INDEX (clinica_id, patient_id)   -- lookup de planos por paciente
INDEX (clinica_id, provider_id)  -- lookup por operadora
```

**Regras:**
- Um paciente pode ter múltiplos planos (ex.: Unimed principal + Bradesco secundário).
- `member_number` e `holder_name` são PII — **nunca devem entrar em logs ou audits**;
  adicionar à lista de redação em `logger.ts` na Sprint 4.7B.
- `valid_until` gera alerta visual na UI quando < hoje + 30 dias. Nunca bloqueia automaticamente.
- Soft-delete via `active = false`. Sem delete físico.
- `patient_id`, `provider_id` e `clinica_id` devem ser da mesma clínica — validação no service.

**Migração de campos legados (decisão 4.7B):**
A Sprint 4.7B deve criar uma migration que:
1. Mantém `patients.convenio` e `patients.numero_carteirinha` **intactos** (compatibilidade).
2. Opcionalmente propõe script assistido de migração para `patient_insurances`, mas **não
   migra automaticamente** (risco de criar vínculos incorretos sem revisão humana).
3. A UI pode exibir os campos legados como "convênio legado (não estruturado)" com opção
   de convertê-los para a nova entidade — decisão final na ADR 4.7B.

---

### 3.4 `service_insurance_prices` — preço de referência por serviço × operadora

```
id                    uuid        PK DEFAULT gen_random_uuid()
clinica_id            uuid        NOT NULL FK clinics(id) ON DELETE CASCADE
service_id            uuid        NOT NULL FK clinic_services(id) ON DELETE CASCADE
provider_id           uuid        NOT NULL FK insurance_providers(id) ON DELETE CASCADE
plan_id               uuid        NULL     FK insurance_plans(id) ON DELETE SET NULL
reference_price_cents integer     NULL     -- preço de referência da tabela do convênio
                                           -- CHECK reference_price_cents >= 0
active                boolean     NOT NULL DEFAULT true
notes                 text        NULL     -- CHECK length <= 500
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()

UNIQUE INDEX (clinica_id, service_id, provider_id, COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid))
```

**Regras:**
- Preço de referência — **NUNCA auto-propaga para `amount_cents`** da cobrança.
  O humano sempre decide o valor. A UI exibe como sugestão visual.
- Sem plano específico (plan_id NULL) = preço base do convênio para qualquer plano.
- Com plan_id = preço específico para aquele plano (substitui o preço base na UI).
- Soft-delete via `active = false`.
- Todos os IDs devem pertencer à mesma clínica — validação no service.

---

### 3.5 Extensão futura de `financial_charges` (migration em 4.7B)

Campos a adicionar em uma migration aditiva:

```sql
ALTER TABLE financial_charges
  ADD COLUMN payer_type             text    NULL,  -- 'private' | 'insurance' | 'mixed'
  ADD COLUMN insurance_provider_id  uuid    NULL REFERENCES insurance_providers(id) ON DELETE SET NULL,
  ADD COLUMN patient_insurance_id   uuid    NULL REFERENCES patient_insurances(id) ON DELETE SET NULL,
  ADD COLUMN copay_amount_cents     integer NULL,  -- parte do paciente (coparticipação)
  ADD COLUMN insurance_amount_cents integer NULL;  -- parte do convênio
```

**Regras:**

- `amount_cents` permanece como **valor total da cobrança** — campo obrigatório existente.
- `copay_amount_cents + insurance_amount_cents` devem somar `amount_cents` quando
  `payer_type = 'mixed'` — validação no service (não forçar no banco no v0.1 para
  simplicidade; incluir CHECK no v0.2 se houver evidência de violação).
- Status do ciclo (`pending → paid | canceled`) permanece inalterado no v0.1.
  Estados separados `patient_paid` / `insurance_received` são escopo de v0.2+.
- `payer_type = NULL` equivale a "particular" (retrocompatibilidade com cobranças
  existentes — **nenhum dado histórico é alterado**).
- Sem glosa no v0.1. Glosa futura = evento/nota separado, não alterar o status da cobrança.

---

## 4. Permissões

A camada de convênios é **administrativa**, seguindo o mesmo padrão do Catálogo de
Serviços (ADR 0015) e do Financeiro (ADR 0012). Não usa `requireClinicalRole`.

| Papel | Gerenciar operadoras/planos | Gerenciar `service_insurance_prices` | Gerenciar `patient_insurances` | Ver convênios (read) | Ver relatórios financeiros |
|---|---|---|---|---|---|
| `dono_clinica` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `secretaria` (puro) | ❌ CRUD | ❌ CRUD | ✅ (rotina adm.) | ✅ | ✅ |
| `secretaria + gestor_clinica` | ❌ CRUD | ❌ CRUD | ✅ | ✅ | ✅ |
| `secretaria + profissional_clinico` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `profissional_clinico` (só clínico) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin_sistema` | ❌ (cross-tenant proibido) | ❌ | ❌ | ❌ | ❌ |

**Justificativas:**

- Cadastrar operadoras e regras de preço é ação gerencial — impacto na tabela de
  referência de toda a clínica. Requer `requireRole(['dono_clinica'])` para escrita.
- Secretaria pode registrar e editar o plano do paciente como parte da rotina
  administrativa (agendamento, pré-atendimento). Segue o padrão de `requireRole`
  expandido para `patient_insurances`.
- `profissional_clinico` não tem acesso a dados financeiros ou de convênio —
  invariante da ADR 0012 §7.2 e ADR 0009 §5. Psicólogos e médicos não precisam
  ver informações de faturamento para atender.
- `admin_sistema` bloqueado em `requireClinic` como em toda entidade tenant-scoped.

---

## 5. LGPD e privacidade

### 5.1 Classificação de dados

| Dado | Classificação | Tratamento |
|---|---|---|
| Nome da operadora / plano | Administrativo | OK em UI; nunca em logs |
| `member_number` (carteirinha) | Pessoal sensível operacional | **Redação em logs** obrigatória; nunca bruto em audit |
| `holder_name` (titular) | Pessoal | **Redação em logs**; nunca bruto em audit |
| `valid_until` | Operacional | OK em UI; sem restrição especial |
| `payer_type`, valores financeiros | Financeiro administrativo | OK em UI; sem restrição especial |
| `notes` de qualquer entidade | Texto livre administrativo | Jamais dado clínico; aviso na UI |

### 5.2 Invariantes LGPD

- `patient_insurances` contém dados pessoais do paciente → **deve ser incluída no
  export LGPD art. 18** quando o módulo for implementado (mesma política do export
  de pacientes existente). Sprint 4.7B deve estender o export.
- `member_number` e `holder_name` → adicionar à lista de redação em `logger.ts`
  na Sprint 4.7B. Campos nunca devem aparecer em `audit_logs.acao` ou qualquer
  campo textual do audit.
- Audit de escrita = metadata-only. Exemplo: `insurance.patient.link.success` com
  `recurso_id = <patient_insurance_id>`. Sem número de carteirinha ou nome no audit.
- Audit de leitura de convênios: sem audit de leitura dedicado no v0.1 (mesmo
  padrão do Financeiro — módulo administrativo, não clínico).
- Psicologia: dados de convênio de pacientes em atendimento psicológico **não devem
  expor** especialidade na UI de outras áreas da clínica. No v0.1, o isolamento é
  por `clinica_id` — dentro da mesma clínica, o dono e a secretaria veem tudo. O
  isolamento por especialidade dentro da clínica é escopo de ADR futura se necessário.

### 5.3 O que não entra em `notes` de convênio

O mesmo aviso do Financeiro v0.1 se aplica a `notes` de qualquer entidade de convênio:

> Não incluir: diagnóstico, CID, hipótese diagnóstica, queixa clínica, resultado de
> exame, nome de medicamento, prescrição, evolução clínica.
> Esses dados pertencem ao prontuário clínico (ADR 0010).

---

## 6. Relação com o Catálogo de Serviços (ADR 0015)

- **Pré-requisito:** convênios dependem de serviços. A entidade `service_insurance_prices`
  referencia `clinic_services`. Sem o Catálogo de Serviços implementado, a tabela de
  preços por convênio não pode existir. Gate: Sprint 4.6D ✅ entregue.

- **Independência:** cadastrar operadoras (`insurance_providers`) e planos do paciente
  (`patient_insurances`) **não exige** `service_insurance_prices`. A clínica pode
  registrar "João vem pelo Unimed" sem precisar de preço de referência por serviço.
  `service_insurance_prices` é a camada mais avançada da v0.1.

- **Nunca auto-propaga:** assim como `price_cents` do serviço nunca propaga para
  `amount_cents` da cobrança, `reference_price_cents` do convênio também nunca propaga.
  Humano decide o valor final em toda operação.

---

## 7. Relação com o Financeiro (ADR 0012)

- `financial_charges` ganha campos opcionais de convênio (§3.5). Todos são `NULL`
  por padrão — retrocompatibilidade total com cobranças existentes.

- `amount_cents` permanece obrigatório e autoritativo. Indica o valor total
  que a clínica pretende receber (do paciente + do convênio).

- Ciclo de status permanece: `pending → paid | canceled`. No v0.1, "paid" significa
  "ciclo encerrado manualmente". Estados separados por pagador (patient_paid /
  insurance_received) são escopo de v0.2 com ADR própria.

- O botão "Usar preço de tabela" do Catálogo de Serviços continua funcionando como
  ação explícita. A UI pode exibir também o preço de referência do convênio como
  segunda sugestão, mas sem auto-preenchimento automático.

---

## 8. Relação com Relatórios (ADR 0014)

- **Futuro:** após `payer_type` estar em `financial_charges`, os relatórios gerenciais
  (R-B Financeiro e R-D Agenda × Financeiro) podem ser estendidos com corte por
  pagador: particular × convênio × misto.
- **Não no v0.1 dos relatórios** — a extensão dos relatórios exige Sprint própria pós-4.7D.
- **Não no v0.1 de convênios** — o Sprint 4.7C (frontend) pode exibir badges
  "Convênio / Particular" na Agenda, mas relatórios segmentados ficam para depois.

---

## 9. Fora do escopo — invariantes permanentes nesta ADR

Os itens abaixo **nunca serão implementados sem ADR separada** com análise
regulatória/jurídica:

- **TISS real** (XML/SOAP ANS; homologação por operadora; certificação).
- **TUSS/CBHPM** como tabela oficial normativa vinculada a procedimentos.
- **Código ANS de operadora** em submissão eletrônica.
- **Autorização eletrônica prévia** (ePrior, webservice operadora).
- **Lote de faturamento ANS** e reconciliação automática de glosa.
- **Elegibilidade online** (validação de carteirinha em tempo real).
- **Gateway de pagamento** (Pix automático, cobrança recorrente).
- **Repasse automático** ao médico ou ao convênio.
- **NFS-e** (Nota Fiscal de Serviços Eletrônica — exige análise municipal).
- **ICP-Brasil** com força legal para documentos de convênio.
- **Integração com farmácias** ou qualquer sistema externo de saúde.
- **Auditoria clínica** de procedimentos autorizados pelo convênio.
- Qualquer dado clínico, diagnóstico, CID, queixa ou prontuário nos campos de convênio.

---

## 10. Riscos e decisões futuras

| Risco / Decisão | Versão | Observação |
|---|---|---|
| TISS/ANS real | ADR futura (pós-4.7 estabilizado) | Alto custo técnico/jurídico; certificação separada |
| Glosa | v0.2+ | Hoje: nota manual; futuro: entidade `insurance_claim_events` |
| Estados separados patient_paid / insurance_received | v0.2+ | Status `paid` unificado no v0.1 |
| Migração de `patients.convenio` / `patients.numero_carteirinha` | 4.7B | Migração assistida, não automática |
| Isolamento de especialidade dentro da clínica | ADR futura | v0.1 isola por clínica; isolamento intra-clínico por especialidade é mais complexo e pode ser necessário para psicologia + LGPD |
| Repasse por profissional | Fase futura | Exige modelo de repasse + contabilidade; ADR própria |
| `insurance_authorizations` (autorização manual de procedimento) | v0.2+ | Entidade `appointment_insurance_authorizations` pode entrar como tabela simples se houver demanda real; fora do v0.1 |
| Importação CSV de tabela de convênio | Fase futura | Pode reusar pipeline de importação existente; exige ADR de extensão |

---

## 11. Sequência de sprints (sugestão para ADR 0016)

| Sprint | Escopo | Gate |
|---|---|---|
| **4.7A** ✅ | ADR 0016 — Convênios v0.1 (docs-only) | Sprint 4.6D ✅ |
| **4.7B** ⏳ | Backend: `insurance_providers` + `insurance_plans` + `patient_insurances` + `service_insurance_prices` + extensão `financial_charges` | ADR 0016 aceita ✅ |
| **4.7C** ⏳ | Frontend: seção convênios no paciente + badge na agenda + split financeiro (pagador) | 4.7B entregue |
| **4.7D** ⏳ | QA/hardening Convênios v0.1 | 4.7C entregue |

**Não no v0.1:** TISS/TUSS; autorização eletrônica; glosa; lote; repasse automático.

---

## 12. Alternativas consideradas

### 12.1 Manter convênio como texto livre em `financial_charges.notes`

**Rejeitada** — sem entidade estruturada não é possível filtrar relatórios por convênio,
vincular carteirinha do paciente, registrar preço de referência por operadora, ou preparar
base para TISS futuro. O texto livre continua existindo no campo `notes`, mas como
complemento, não como substituto.

### 12.2 Implementar autorização de procedimento (`insurance_authorizations`) no v0.1

**Rejeitada** — aumenta o escopo em uma entidade com ciclo de vida próprio
(`pending | authorized | denied | expired`). Clínicas pequenas raramente precisam de
rastreamento formal de autorização no início. A secretaria registra o número manualmente
em `notes` por ora. Pode entrar no v0.2 se houver demanda real.

### 12.3 Unir `insurance_plans` com `patient_insurances` (sem entidade de plano separada)

**Considerada mas mantida separada** — manter `insurance_plans` como entidade própria
permite que a clínica cadastre os planos que aceita (ex.: "Nacional Flex" e "Unipart Plus"
da Unimed) sem depender de registro manual por paciente. Também permite `service_insurance_prices`
com granularidade por plano. A entidade é **opcional** — clínicas sem essa necessidade
usam `plan_id = NULL` em todo lugar.

### 12.4 Auto-propagar preço de convênio para `amount_cents` ao selecionar pagador

**Rejeitada** — mantém a invariante central do ClinicBridge: **humano decide o valor
final**. O preço de referência do convênio é sugestão visual, nunca automação silenciosa.
O mesmo princípio já existe para `price_cents` do Catálogo de Serviços.

---

## 13. Critérios de aceitação (Sprint 4.7A)

Esta sprint é **docs/ADR-only**. Critérios:

- [x] ADR 0016 criada e aceita.
- [x] `docs/insurance-billing-v0-scope.md` criado com checklist de implementação.
- [x] `CLAUDE.md` atualizado: estado atual = Sprint 4.7A entregue.
- [x] `docs/project-state.md` atualizado com Sprint 4.7A.
- [x] `docs/sprint-history.md` com entrada 4.7A.
- [x] `docs/roadmap-next-phase.md` atualizado com Sprint 4.7A registrada como entregue.
- [x] `docs/product-clinic-os-roadmap.md` atualizado: Fase 4.6 ✅, Fase 4.7 ADR aceita.
- [x] `docs/insurance-billing-future-scope.md` referencia esta ADR (já estava marcado como insumo).
- [x] `git diff --check` rc=0.
- [x] **Zero mudanças de código, schema, migration ou env.**

---

## 14. Referências

- ADR 0012 — `docs/adr/0012-financial-module-v0.md`
- ADR 0015 — `docs/adr/0015-services-catalog-commercial-layer-v0.md`
- Pré-planejamento convênios — `docs/insurance-billing-future-scope.md`
- Operacional desta ADR — `docs/insurance-billing-v0-scope.md`
- Roadmap Clinic OS — `docs/product-clinic-os-roadmap.md`
- Segurança — `docs/security-notes.md`
- Estado do projeto — `docs/project-state.md`
