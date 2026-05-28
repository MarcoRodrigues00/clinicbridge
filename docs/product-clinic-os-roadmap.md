# ClinicBridge — Roadmap Clinic OS (Fases 4.x)

> Direção definida na ADR `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
> (expansão para Clinic OS modular). Este roadmap é **sugestão de sequência**,
> **não** compromisso de datas. Nenhuma fase autoriza código — cada uma exige
> ADR própria aprovada antes de implementação.
>
> Princípios invariantes em vigor (todas as fases): ADR 0008 §4.
> Critérios de gating: ADR 0001 §"Critérios para abrir uma fase clínica" +
> ADR 0008 §8 (4 critérios adicionais).
>
> Relacionado: `docs/roadmap-next-phase.md` (Fase 3 administrativa),
> `docs/security-notes.md`, `docs/production-minimum-plan.md`,
> `docs/aws-provisioning-runbook-3.41B.md` (pausado).

---

## Estado de partida (atualizado 2026-05-27)

- **Fase 3 administrativa:** funcional, base segura, sem dado clínico.
  Backup local + offsite (docs/scripts). Plano e runbook AWS prontos.
- **Fases 4.0–4.5D ✅** — Prontuário v0.1, Documentos Médicos v0.1, Financeiro v0.1,
  Agenda × Financeiro, Relatórios Gerenciais v0.1 — todos entregues e QA aprovados.
- **Fases 4.6A–4.6D ✅** (2026-05-27) — Catálogo de Serviços v0.1 completo: ADR 0015 ✅ +
  backend (8 endpoints, 2 tabelas, extensão appointments/financial_charges) + frontend
  (ServicesPanel, seletores Agenda/Financeiro) + QA 41/41 PASS + bug 4.6C.2 corrigido.
- **Fase 4.7A ✅** (2026-05-27) — ADR 0016 Convênios v0.1 aceita (docs/ADR-only).
  Próximo: **4.7B** backend Convênios v0.1.
- **Trilha AWS real:** **pausada estrategicamente** (ADR 0008 §6 + ADR 0009 §10).
  Gate de retomada: ADR 0010+0011+0012 aceitas ✅ + reavaliação RDS/EBS/KMS.
- **Pré-requisito vivo:** governança da Fase 3 (`requireRole`, rate limit Redis,
  trust proxy, backup/restore validado, deploy seguro, CORS/env prod) — itens
  conforme `docs/roadmap-next-phase.md`.

---

## Visão geral das fases

| Fase | Natureza | Status | ADR | Entregável principal |
|---|---|---|---|---|
| **4.0** | Direção/ADR | ✅ Sprint 4.0 | ADR 0008 | Decisão estratégica registrada |
| **4.1** | Arquitetura/habilitador | ✅ Sprint 4.1 | ADR 0009 + `docs/clinical-architecture-and-permissions.md` | Roles granulares conceituais, separação banco, audit de leitura, threat model, LGPD clínica, gates para 4.2 |
| **4.2A** | Clínico — escopo ADR | ✅ Sprint 4.2A | ADR 0010 + `docs/clinical-encounters-v0-scope.md` | Escopo do Prontuário/Atendimento v0.1 (4 tabelas conceituais, 5 endpoints, roles em tabela paralela, audit de leitura paralelo, cifra de coluna fora) |
| **4.2B** | Clínico — implementação | Pendente | sem ADR nova | Backend Prontuário v0.1 (migration + DAOs + middleware `requireClinicalRole` + services + endpoints + logger + smoke tests) |
| **4.3** | Clínico — documentos | Pendente | ADR 0011 (futura) | Documentos médicos/receitas v0.1 (sem ICP-Brasil) |
| **4.4** | Operacional — financeiro | Pendente | ADR 0012 (futura) | Financeiro v0.1 (contas a pagar/receber, fluxo de caixa) |
| **4.5** | Operacional — relatórios | ✅ 4.5A–D entregues | ADR 0014 ✅ | Relatórios gerenciais v0.1 · `docs/management-reports-v0-scope.md` |
| **4.6** | Operacional — serviços | ✅ 4.6A–D entregues | ADR 0015 ✅ | Catálogo de Serviços v0.1 · `docs/services-catalog-v0-scope.md` |
| **4.7** | Operacional — convênios | ✅ 4.7A–D entregues | ADR 0016 ✅ | Convênios manual básico v0.1 · `docs/insurance-billing-v0-scope.md` |
| **4.8** | Operacional — estoque | 4.8A–D ✅ **Completo** | ADR 0017 ✅ | Estoque básico v0.1 · `docs/inventory-v0-scope.md` (medicamentos controlados/ANVISA fora) |

**Fases futuras planejadas (sem número ainda, exigem ADR própria):**

| Tema | Pré-requisito | Por que separado |
|---|---|---|
| **IA clínica assistiva** (sugestão de evolução, resumo, alertas) | Prontuário v0.1 sólido + dado real validado | Risco de viés/responsabilidade clínica; LGPD art. 11; precisa de prontuário maduro como base. |
| **Assinatura digital ICP-Brasil + prescrição eletrônica válida** | Documentos médicos v0.1 maduro | Risco regulatório alto; integração com provedor ICP-Brasil; CFM; custo. Mantém ADR 0001 §7. |
| **TISS/TUSS real** | Convênios v0.1 estabilizado | Padrão ANS XML/SOAP; certificação; homologação por operadora; alto custo técnico/jurídico. |
| **Medicamentos controlados (SNGPC/ANVISA)** | Estoque v0.1 estabilizado | Rastreabilidade de lote + receituário azul/amarelo + integração ANVISA; alto risco regulatório. |
| **Telemedicina** | — (reabrir ADR 0008) | CFM, regulatório; fora do escopo do Clinic OS conforme ADR 0008 §2.1. |

> A numeração de ADR é orientativa. Cada Fase 4.x abre sua ADR ao iniciar.

---

## Fase 4.0 — Decisão / ADR ✅

**Sprint 4.0** — entregue 2026-05-25, docs-only.

**Entregáveis:**
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md` (esta direção).
- `docs/product-clinic-os-roadmap.md` (este arquivo).
- Atualização de `CLAUDE.md`, `docs/project-state.md`, `docs/sprint-history.md`,
  `docs/roadmap-next-phase.md`.

**Não entregue (intencional):** código, migration, tabela clínica, AWS, secret.

**Gate para iniciar 4.1:**
- ADR 0008 aceita.
- Roadmap Clinic OS aceito.
- Trilha AWS pausada formalmente.

---

## Fase 4.1 — Arquitetura de dados clínicos + permissões ✅

**Status:** ✅ entregue na Sprint 4.1 (2026-05-25, docs/ADR-only).

**Natureza:** **habilitador**. Sem ela, nenhuma Fase 4.2+ pode começar.

**O que foi entregue:**
- ADR `docs/adr/0009-clinical-architecture-roles-read-audit.md` — 14 seções
  cobrindo: princípios invariantes clínicos (10 regras), modelo conceitual
  de roles (6 roles), separação administrativo vs. clínico (modelo
  conceitual + regras técnicas mínimas), audit de leitura clínica (eventos
  conceituais `clinical.<entidade>.read|list|export` + `paciente_id` para
  transparência LGPD ao titular), versionamento clínico (sem delete físico;
  edição → nova versão; cancelamento ≠ delete), LGPD clínica (9 princípios
  operacionais — art. 11), threat model com 10 vetores específicos,
  política conceitual "break-glass" para `admin_sistema` (não implementada),
  gates obrigatórios para abrir 4.2 (9 critérios), impacto na trilha AWS
  pausada.
- Doc operacional `docs/clinical-architecture-and-permissions.md` —
  matriz de permissões conceitual por domínio × role, catálogo conceitual
  de eventos de audit, checklist LGPD por módulo, threat model como
  checklist por ADR de módulo, gates para 4.2 como checklist, convenções
  de nomenclatura sugeridas.
- ADR 0001 (Opção C) — gates clínicos continuam **válidos** e reusados
  pela 4.2+ (cumulativo com ADR 0008 §8 e ADR 0009 §9).

**Decisões consciente registradas na ADR 0009:**
- 4.1 é deliberadamente **só conceitual** — implementação técnica de roles,
  audit de leitura, schema clínico fica para a ADR 0010 (início da 4.2)
  para evitar over-engineering antecipado (princípio ADR 0008 §4.11).
- `admin_sistema` **não acessa dado clínico** por padrão. Break-glass
  exige ADR futura própria.
- Vocabulário do produto inalterado: nome técnico `secretaria` continua
  no DB/JWT/audits até migration dedicada (ADR 0010 decide).
- Histórico clínico em merge B-safe (ADR 0007) **não se mistura** quando
  dado clínico existir — default sugerido é histórico separado com
  `merged_into_id`. Decisão final na ADR 0010.

**Gates para iniciar 4.2 (atendimento) — agora consolidados em ADR 0009 §9
e checklist `docs/clinical-architecture-and-permissions.md` §7:**
- ADR 0009 aceita ✅.
- Matriz de permissões revisada pelo dono.
- Catálogo de audit de leitura revisado.
- Princípios de versionamento revisados.
- Princípios LGPD clínica declarados ✅ (validação jurídica externa precisa
  iniciar em paralelo).
- Threat model consultado pela ADR 0010.
- Decisão sobre roles documentada ✅ (implementação técnica na ADR 0010).
- Impacto no backup/AWS revisado ✅.
- Escopo do prontuário v0.1 definido em alto nível (entregue pela ADR 0010
  ao abrir).
- Sem regressão nas invariantes administrativas (`docs/security-notes.md`).
- Trilha AWS reavaliada (não retomada — só reavaliada).
- Validação jurídica externa iniciada (não exige conclusão para 4.2 com
  dados sintéticos; exige para dado real).

**O que NÃO foi entregue (intencional e registrado):**
- Nenhum schema/migration clínico.
- Nenhuma role nova no banco (`papel` continua `dono_clinica`/`secretaria`/
  `admin_sistema`).
- Nenhum audit de leitura técnico (só schema conceitual).
- Nenhum endpoint, controller, service ou DAO clínico.
- Nenhuma alteração em backend/frontend.
- Nenhum recurso AWS, nenhum secret.
- Nenhuma promessa de conformidade LGPD/CFM/ICP-Brasil/TISS.

**Próximo passo:** abrir ADR 0010 (prontuário v0.1) cumprindo os gates §9
acima. Essa ADR trará as decisões técnicas (schema PostgreSQL vs. prefixo,
implementação de roles, schema do audit de leitura, cifra a nível de
coluna vs. schema).

---

## Fase 4.2 — Prontuário eletrônico / atendimento v0.1

**Natureza:** **clínico** (primeiro módulo de dado clínico real).
**Subdivisão entregue:** 4.2A (ADR — entregue) + 4.2B (implementação —
pendente).

**Objetivo:** registrar **encontros/atendimentos** ligados a paciente +
profissional, com notas clínicas versionadas (append-only), visualização
segura por role e audit de leitura obrigatório.

### Fase 4.2A ✅ — ADR + escopo (Sprint 4.2A)

Entregue em 2026-05-25, docs/ADR-only. Fonte autoritativa do escopo:
**ADR 0010** (`docs/adr/0010-clinical-encounters-medical-record-v0.md`)
+ operacional `docs/clinical-encounters-v0-scope.md`.

**Decisões fechadas** (resumo — detalhe na ADR 0010):
- **4 tabelas conceituais:** `clinical_encounters`,
  `clinical_encounter_notes` (append-only com `revises_note_id`),
  `clinical_read_audit` (paralela ao `audit_logs`, com `paciente_id`
  pseudonimizado), `user_clinical_roles` (append-only com revogação).
- **5 campos textuais clínicos no v0.1:** `chief_complaint` (≤ 2000),
  `anamnesis` (≤ 8000), `evolution` (≤ 8000), `plan` (≤ 4000),
  `internal_note` (≤ 2000). `internal_note` redacted para não-autor.
- **Prefixo `clinical_` em `public`** (sem schema PostgreSQL separado).
- **Status do encounter:** `active` | `canceled` (one-way; sem restore).
- **Permissões:** profissional cria/edita só os próprios; dono/gestor
  leem qualquer com audit, **não editam alheio**;
  funcionario/financeiro/admin_sistema → 403 em todo endpoint clínico.
- **`internal_note` apenas autor/dono/gestor.**
- **Merge B-safe:** criar encounter exige paciente ativo + não-mesclado;
  histórico clínico do secundário **não se mistura**.
- **Cifra a nível de coluna FORA do v0.1** — decisão revisável (RDS
  encryption at rest + TLS + controles de aplicação + audit + logger
  redigindo cobrem o v0.1).
- **5 endpoints clínicos + 2 administrativos** (grant/revoke role).
- **Audit de escrita** estende `audit_logs` (sem migration);
  **audit de leitura** em tabela paralela com **postura de falha por
  ambiente** (`CLINICAL_READ_AUDIT_STRICT` — ADR 0010 §8.2.1):
  best-effort apenas em dev/staging com dados sintéticos; **fail-closed
  obrigatório em produção** (guard de boot força em `NODE_ENV=production`;
  falha → 500 `clinical_read_audit_unavailable`, sem conteúdo clínico
  no body). Smoke test obrigatório na 4.2B.

**Fora do v0.1 (registrado):** CID estruturado, prescrição estruturada,
exames (pedido/resultado), anexos clínicos, assinatura digital,
ICP-Brasil, telemedicina, IA clínica, medicamentos controlados, TISS,
portal do paciente, edição/cancel de encounter alheio, restore de
encounter, importação CSV/XLSX clínica, export clínico,
funcionario/financeiro lendo conteúdo clínico.

### Fase 4.2B — implementação backend (pendente, sem ADR nova)

**Não exige ADR nova** — implementa exatamente o decidido na 4.2A. Plano
detalhado: ADR 0010 §15 + `docs/clinical-encounters-v0-scope.md` §8
(checklist 4.2B).

**Entregáveis esperados (em ordem):**
1. Migration única aditiva (4 tabelas + índices + CHECK + unique parcial).
2. Tipos em `db.d.ts`.
3. DAOs (`userClinicalRoleDao`, `clinicalEncounterDao`,
   `clinicalEncounterNoteDao`, `clinicalReadAuditDao`).
4. Middleware `requireClinicalRole`.
5. Services + controllers + rotas (5 clínicos + 2 administrativos).
6. Logger estendido (redigir campos clínicos + razões; body de
   `/clinical/*` jamais integral).
7. Smoke tests via curl (matriz de role × operação × tenant).
8. SQL checks + limpeza de dados de teste.
9. Documentação compacta (CLAUDE.md, project-state, sprint-history,
   security-notes — nova seção "Prontuário clínico v0.1", testing-checklist).

**Gates para iniciar 4.3 (após 4.2B):**
- 4.2B entregue em staging local, com dados sintéticos.
- Audit de leitura validado (queries que listam evolução geram evento).
- Cross-tenant testes 100%.
- `internal_note` redacted validado.
- Logger sem conteúdo clínico (grep nos logs).
- Audit sem PII (grep no DB).

**Posicionamento — IA clínica assistiva:** sugestão automatizada de
evolução/resumo, alertas de interação medicamentosa, transcrição de
consulta, recomendação assistiva — **fica para fase futura própria
(sem número ainda)**, depois do prontuário v0.1 estar **sólido com dado
real validado**. Razões: risco de viés/responsabilidade clínica; LGPD
art. 11 e tratamento automatizado (art. 20); precisa de massa de dados
real para fazer sentido. Não tentar dentro da Fase 4.2.

---

## Fase 4.3 — Documentos médicos / receitas v0.1

**Natureza:** **clínico** com risco regulatório.

**Objetivo:** geração de documentos administrativos pelo profissional —
atestado, declaração, receita simples — **sem força jurídica plena** de
prescrição eletrônica (ICP-Brasil fica em ADR separada futura, conforme ADR
0001 §7).

**Entregáveis esperados:**
1. **ADR 0011** — escopo de documentos:
   - Tipos no v0.1: atestado, declaração de comparecimento, receita simples
     (impressa pelo profissional para assinatura física).
   - **Posição clara:** documento **não é assinado digitalmente** com
     ICP-Brasil neste v0.1. Validade jurídica plena pode exigir assinatura
     física do profissional ou assinatura digital com cert válido — não
     prometer.
   - Template engine simples (sem editor rico avançado); cabeçalho/rodapé da
     clínica configurável.
   - Audit obrigatório: emissão + leitura + cancelamento.
   - Versionamento e cancelamento (não delete físico).
2. Implementação (sprints próprias pós-ADR).

**Não no v0.1:** prescrição eletrônica válida; integração farmácias; CFM;
ICP-Brasil; medicamentos controlados; receituário azul/amarelo.

**Posicionamento — assinatura digital ICP-Brasil + prescrição eletrônica
válida:** **fica para fase futura própria (sem número ainda)**, depois de
documentos médicos v0.1 estar maduro em uso real. Razões: integração com
provedor ICP-Brasil (custo + complexidade); análise regulatória CFM; risco
jurídico/responsabilidade profissional. Mantém os critérios do ADR 0001 §7.
Não tentar dentro da Fase 4.3.

---

## Fase 4.4 — Financeiro v0.1

**Natureza:** **operacional** (administrativo+, sem dado clínico direto).

**Objetivo:** contas a pagar/receber, fluxo de caixa básico, conciliação manual.

**Entregáveis esperados:**
1. **ADR 0012** — escopo do financeiro:
   - Entidades: `financial_transactions`, categorias, contas (caixa, banco —
     sem integração bancária).
   - Permissões: novo role **financeiro** (Fase 4.1 deve ter previsto).
   - Vínculos com agenda (cobrar por agendamento) — opcionais; **sem** automação
     no v0.1.
   - Export para CSV (extensão do export existente).
2. Implementação (sprints próprias).

**Não no v0.1:** integração bancária (Open Finance, conciliação automática),
nota fiscal eletrônica (NFS-e — ADR futura separada, exige análise municipal),
controle de inadimplência automatizado.

---

## Fase 4.5 — Relatórios gerenciais v0.1

**Natureza:** **operacional** — alto valor percebido pelo cliente final.

**Objetivo:** entregar relatórios gerenciais consolidados que sustentem
percepção de valor compatível com sistemas completos (Feegow et al.) — sem
copiar telas/textos. **Promovido para antes de Convênios/Estoque** porque
relatórios já agregam valor com os módulos 4.0–4.4 entregues, enquanto
convênios e estoque exigem mais dados acumulados para terem retorno real.

**Entregáveis esperados:**
1. **ADR 0014** ✅ (Sprint 4.5A) — escopo dos relatórios (aceita em 2026-05-27):
   - **Relatórios mínimos do v0.1:**
     - agenda por profissional / por período / por status;
     - atendimentos realizados por profissional;
     - financeiro consolidado (entradas, saídas, fluxo) — depende da Fase 4.4;
     - pacientes ativos / arquivados / mesclados;
     - importações realizadas (extensão do recibo de importação existente).
   - **Princípio:** relatório lê dados existentes — **não criar tabela só para
     relatório**; usar `views` ou queries parametrizadas. Schema só muda se
     justificar performance (medida, não suposta).
   - **Export:** estende o export existente (CSV/XLSX com formula injection
     neutralizada — invariante). Sem signed URL.
   - **Permissões:** role **gestor** (definido na Fase 4.1) + **dono**.
     **Secretaria/funcionário(a)** **não vê** relatórios financeiros.
   - **Agendamento de relatório (cron):** **fora do v0.1**. Geração sob demanda.
   - **Dashboards visuais (gráficos):** **fora do v0.1**. Foco em listas
     filtráveis + export. Gráficos podem virar sprint própria após validação.
   - **Audit:** geração e export de relatório clínico/financeiro são
     auditados (mesmo padrão da Fase 4.1 — audit de leitura).
2. Implementação (sprints próprias pós-ADR).

**Não no v0.1:** dashboards com gráficos; relatórios agendados (cron); BI
externo; integrações com Looker/Power BI; relatórios cross-clínica (cada
clínica vê só os seus — invariante tenant).

---

## Fase 4.6 — Catálogo de Serviços v0.1 ✅

**Natureza:** **operacional**.

**Status:** ✅ 4.6A–D entregues (2026-05-27).

**ADR:** `docs/adr/0015-services-catalog-commercial-layer-v0.md` · Operacional: `docs/services-catalog-v0-scope.md`.

**Objetivo:** catálogo administrativo de serviços da clínica (nome, categoria, duração,
preço de tabela), vínculo profissional × serviço, associação opcional com agendamentos
e cobranças. Base para Relatórios por tipo de serviço e pré-requisito para Convênios.

**Entidades implementadas:**
- `clinic_services(clinica_id, name, category[texto livre], description, duration_minutes, price_cents, active)`.
- `professional_services(professional_id, service_id, clinica_id, active)` — many-to-many.
- `appointments.service_id uuid NULL` — opcional; validação `service_not_available_for_professional`.
- `financial_charges.service_id uuid NULL` — opcional; validação `service_mismatch_with_appointment`.

**Invariante central:** `price_cents` é referência visual; nunca auto-propaga para
`amount_cents` da cobrança. Serviço **não entra no prontuário** (ADR 0010).

**Sequência de sprints (todas entregues):**

| Sprint | Escopo |
|---|---|
| **4.6A** ✅ | ADR 0015 + docs operacional (docs/ADR-only) |
| **4.6B** ✅ | Backend: migration + DAOs + services + 8 endpoints — smoke 51/51 PASS |
| **4.6C** ✅ | Frontend: `ServicesPanel` + seletor na agenda + seletor no financeiro |
| **4.6C.2** ✅ | Correção: controllers não repassavam `service_id`; CSS; isError guard; aba Serviços separada |
| **4.6D** ✅ | QA/hardening — smoke 41/41 PASS |

**Não no v0.1 (registrado explicitamente):**
- TUSS/CBHPM/ANS — sem código normativo.
- NFS-e vinculada ao serviço.
- Preço por convênio (ADR 0016).
- Estoque de materiais por serviço (ADR 0017).

---

## Fase 4.7 — Convênios manual básico v0.1

**Natureza:** **operacional+** com risco técnico/jurídico moderado.

**Status:** 4.7A ✅ (ADR 0016 aceita, 2026-05-27) · 4.7B–D ⏳ (implementação pendente).

**ADR:** `docs/adr/0016-insurance-billing-v0.md` ✅ · Operacional: `docs/insurance-billing-v0-scope.md`.
Insumo histórico: `docs/insurance-billing-future-scope.md`.

**Objetivo:** cadastro manual de convênios, carteirinha do paciente, preço de referência
por serviço × operadora, cobrança com indicação de pagador (particular/convênio/misto).
**Sem TISS/TUSS real no v0.1.** Humano decide o valor final em toda operação.

**Entidades conceituais (decididas na ADR 0016):**
- `insurance_providers(clinica_id, name, active, notes)` — operadoras da clínica.
- `insurance_plans(clinica_id, provider_id, name, active)` — planos por operadora (opcional).
- `patient_insurances(clinica_id, patient_id, provider_id, plan_id, member_number, valid_until, holder_name, active)` — carteirinha do paciente. PII: `member_number`, `holder_name`.
- `service_insurance_prices(clinica_id, service_id, provider_id, plan_id, reference_price_cents)` — referência; nunca auto-propaga.
- `financial_charges` ganha: `payer_type`, `insurance_provider_id`, `patient_insurance_id`,
  `copay_amount_cents`, `insurance_amount_cents`.

**Migração legada:** `patients.convenio` + `patients.numero_carteirinha` mantidos intactos.
Migração assistida (não automática) para `patient_insurances` decidida em 4.7B.

**Sequência de sprints:**

| Sprint | Escopo |
|---|---|
| **4.7A** ✅ | ADR 0016 — Convênios v0.1 (docs-only) |
| **4.7B** ✅ | Backend: 4 tabelas novas + extensão `financial_charges` + 17 endpoints — smoke 47/47 PASS |
| **4.7C** ✅ | Frontend: `InsurancePanel` (aba Convênios) + payer_type no `FinancialPanel` — typecheck/build ✅ |
| **4.7D** ✅ | QA/hardening convênios — subtabs UI, PayerBadge, MarkPaid payer-aware, canWrite fix, holder_name PII fix |
| **Fase futura** | `appointment_insurance_authorizations` + estados separados patient_paid/insurance_received |

**Não no v0.1:**
- TISS/TUSS real; integração eletrônica com operadoras; batch de cobrança; lote ANS.
- NFS-e; gateway de pagamento; repasse automático; autorização eletrônica.

---

## Fase 4.8 — Estoque básico v0.1

**Natureza:** **operacional**.

**Status:** 4.8A ✅ (docs/ADR-only, 2026-05-27) · 4.8B ✅ (backend, 2026-05-27) ·
4.8C ✅ (frontend, 2026-05-27) · 4.8D ✅ (QA/hardening, 2026-05-27). **Fase 4.8 completa.**

**ADR:** ADR 0017 ✅ aceita — `docs/adr/0017-inventory-v0.md`.
Operacional: `docs/inventory-v0-scope.md`.

**Objetivo:** controle manual de entrada/saída de materiais e insumos da clínica
(gaze, seringas, materiais administrativos). **Humano decide toda movimentação.**
**Sem medicamentos controlados no v0.1.**

**Entidades (ADR 0017 §3):**
- `inventory_items` — catálogo de itens (name 1..120, category ≤80, unit 1..40,
  current_quantity, minimum_quantity, location nullable, notes nullable ≤500, active;
  UNIQUE INDEX `(clinica_id, lower(btrim(name)))`).
- `inventory_movements` — append-only (movement_type: `entry|exit|adjustment|loss`;
  quantity_delta ≠ 0; reason nullable ≤300; created_by_user_id).

**Permissões (ADR 0017 §4):**
- `dono_clinica`: CRUD de itens + registrar movimentos + ler.
- `secretaria`: registrar movimentos + ler (sem CRUD de itens).
- `profissional_clinico`: bloqueado.

**Sequência de sprints:**

| Sprint | Escopo |
|---|---|
| **4.8A** ✅ | ADR 0017 — Estoque v0.1 (docs-only). Gate: 4.7A–D ✅ |
| **4.8B** ✅ | Backend: migration 18 + DAOs + service + controller + 9 endpoints — smoke 51/51 PASS |
| **4.8C** ✅ | Frontend: aba Estoque + `InventoryPanel` (hero, filtros, low-stock, CRUD owner, movimentos, histórico) — typecheck/build ✅ |
| **4.8D** ✅ | QA/Hardening Estoque v0.1 — revisão UX, greps segurança 0-violations, sanity smoke 8/8. **Fase 4.8 completa.** |

**Não no v0.1 (invariantes permanentes desta ADR):**
- **Medicamentos controlados (SNGPC / RDC ANVISA)** — rastreabilidade de lote
  com fins regulatórios; receituário azul/amarelo; integração ANVISA → ADR própria futura.
- Lote/validade obrigatórios com força legal; código de barras/RFID.
- Fornecedor, pedido de compra, NF-e; custo médio; integração contábil.
- Dedução automática por serviço ou agendamento (humano decide no v0.1).
- Vínculo `patient_id` em movimentos (proibido sem ADR clínica).
- Import CSV de inventário inicial (pode entrar no v0.2 com demanda real).

---

## Princípios transversais (aplicáveis a todas as Fases 4.x)

> Repetidos aqui para reforço operacional. Fonte de verdade: ADR 0008 §4.

1. **Tenant isolation por `clinica_id`** — invariante. Testes cross-tenant
   obrigatórios em toda sprint.
2. **Sem PII em logs/audits/mensagens** — incluindo PII clínica (CID, queixa,
   conteúdo de receita, nome do medicamento).
3. **Audit append-only** — `audit_logs` não muda schema; eventuais novas
   tabelas (ex.: `clinical_read_audit`) também append-only.
4. **CPF mascarado por padrão** — telas/exports clínicos seguem o mesmo padrão.
5. **Sem delete físico** — soft-delete em todo dado clínico; histórico
   imutável é parte do valor médico-legal.
6. **Versionamento** em dados clínicos editáveis (notas, prescrições, documentos).
7. **MVC + DAO + Service** — sem mudar arquitetura.
8. **Migrations aditivas** sempre que possível; FK `ON DELETE SET NULL` para
   preservar audit.
9. **Migração de dados** considerada em toda ADR (CSV/XLSX → entidade) — é o
   diferencial.
10. **Sem texto/UI copiado de concorrentes** — referência permitida; cópia
    direta, não.

---

## Riscos consolidados (todas as fases)

| Risco | Onde mitiga |
|---|---|
| LGPD art. 11 (dados sensíveis de saúde) | Fase 4.1 (ADR 0009) — política LGPD clínica + base legal + validação jurídica externa |
| Vazamento entre membros da mesma clínica | Fase 4.1 — roles granulares + audit de leitura |
| Documento médico com força legal | Fase 4.3 — limita-se a documento administrativo gerado; prescrição válida com ICP-Brasil = fase futura própria depois de 4.3 madura |
| Assinatura digital / prescrição eletrônica válida (ICP-Brasil, CFM) | Fase futura própria (sem número ainda); pré-requisito = documentos médicos v0.1 maduro |
| IA clínica assistiva (viés, responsabilidade, LGPD) | Fase futura própria (sem número ainda); pré-requisito = prontuário v0.1 sólido com dado real validado |
| Telemedicina (regulatório CFM) | ADR 0008 §2.1 — fora do escopo até ADR própria |
| Faturamento TISS/TUSS real (ANS, operadoras) | Fase 4.7 — **fora do v0.1**; ADR separada futura depois da Fase 4.7 estabilizada |
| Medicamentos controlados (SNGPC/ANVISA) | Fase 4.8 — **fora do v0.1**; ADR separada futura depois da Fase 4.8 estabilizada |
| Crescimento de escopo / "vamos adicionar X" | Cada feature passa pelo backlog/sprint normal |
| Over-engineering arquitetural na 4.1 | Manter 4.1 mínimo para atender 4.2; generalizar só com 2+ casos reais |
| Custo AWS antes de retorno clínico | Trilha AWS pausada até 4.1 fechar |
| Cópia de UI/copy de Feegow | ADR 0008 §2.9 — vedada por princípio |

---

## Status da trilha AWS (paralela)

| Sprint | Estado |
|---|---|
| 3.41A — plano operacional AWS | ✅ entregue (docs-only) |
| 3.41B-0 — runbook executável | ✅ entregue (docs-only) |
| **3.41B** — execução real | ⏸️ **pausado estrategicamente** (ADR 0008 §6 + ADR 0009 §10) |
| 3.42 — deploy checklist go/no-go | ⏸️ pausado (depende de 3.41B) |
| 3.43 — piloto real | ⏸️ pausado (depende de 3.42) |

Gate para retomar (**atualizado pela ADR 0009 §10**):
**ADR 0010 (prontuário v0.1) aceita** + reavaliação de dimensionamento
RDS (volume textual + audit de leitura), EBS/S3 (anexos clínicos futuros
com signed URL), KMS CMK dedicada (se ADR 0010 escolher cifra a nível de
coluna), região `sa-east-1` preferida por LGPD.

---

## Referências

- ADR 0008 — `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- ADR 0001 — `docs/adr/0001-product-direction-option-c.md` (parcialmente superseded)
- Roadmap administrativo — `docs/roadmap-next-phase.md`
- Estado detalhado — `docs/project-state.md`
- Notas de segurança — `docs/security-notes.md`
- Plano produção mínima — `docs/production-minimum-plan.md`
- Plano AWS — `docs/aws-infra-sprint-3.41-plan.md`
- Runbook AWS — `docs/aws-provisioning-runbook-3.41B.md` (execução pausada)
