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

## Estado de partida (2026-05-25)

- **Fase 3 administrativa:** funcional, base segura, sem dado clínico.
  Backup local + offsite (docs/scripts). Plano e runbook AWS prontos.
- **Fase 4.0 ✅** (decisão Clinic OS, ADR 0008) e **Fase 4.1 ✅**
  (arquitetura clínica conceitual, ADR 0009 + `docs/clinical-architecture-and-permissions.md`)
  entregues — só docs/ADR.
- **Trilha AWS real:** **pausada estrategicamente** (ADR 0008 §6). Gate de
  retomada **atualizado pela ADR 0009 §10**: ADR 0010 aceita + reavaliação
  RDS/EBS/KMS + região `sa-east-1` preferida.
- **Pré-requisito vivo:** governança da Fase 3 (`requireRole`, rate limit Redis,
  trust proxy, backup/restore validado, deploy seguro, CORS/env prod) — itens
  conforme `docs/roadmap-next-phase.md`.

---

## Visão geral das fases

| Fase | Natureza | Status | ADR | Entregável principal |
|---|---|---|---|---|
| **4.0** | Direção/ADR | ✅ Sprint 4.0 | ADR 0008 | Decisão estratégica registrada |
| **4.1** | Arquitetura/habilitador | ✅ Sprint 4.1 | ADR 0009 + `docs/clinical-architecture-and-permissions.md` | Roles granulares conceituais, separação banco, audit de leitura, threat model, LGPD clínica, gates para 4.2 |
| **4.2** | Clínico — atendimento | Pendente | ADR 0010 (futura) | Prontuário/atendimento v0.1 |
| **4.3** | Clínico — documentos | Pendente | ADR 0011 (futura) | Documentos médicos/receitas v0.1 (sem ICP-Brasil) |
| **4.4** | Operacional — financeiro | Pendente | ADR 0012 (futura) | Financeiro v0.1 (contas a pagar/receber, fluxo de caixa) |
| **4.5** | Operacional — relatórios | Pendente | ADR 0013 (futura) | Relatórios gerenciais v0.1 (alto valor percebido) |
| **4.6** | Operacional — convênios | Pendente | ADR 0014 (futura) | Convênios/faturamento básico v0.1 (TISS/TUSS real fora) |
| **4.7** | Operacional — estoque | Pendente | ADR 0015 (futura) | Estoque básico v0.1 (medicamentos controlados/ANVISA fora) |

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

**Objetivo:** registrar **encontros/atendimentos** ligados a paciente +
profissional + agenda, com notas clínicas versionadas e visualização segura.

**Entregáveis esperados (em ordem):**
1. **ADR 0010** — escopo do prontuário v0.1:
   - Entidades: `clinical_encounters`, `clinical_notes` (versionadas — não
     editar destrutivamente; cada edição = nova versão com `previous_version_id`),
     anexos? (provavelmente fora do v0.1).
   - **Campos do v0.1:** queixa principal, evolução, conduta (texto livre).
     **Fora do v0.1:** diagnóstico estruturado (CID), prescrição estruturada,
     resultados de exames (todos para sprints próprias).
   - Permissões: só **profissional de saúde** cria/edita; **dono** vê tudo da
     clínica; **secretaria/funcionário(a) admin** **não** vê conteúdo
     (vê só metadados: paciente, profissional, data).
   - Audit obrigatório de leitura.
   - Telas: visualização cronológica por paciente; edição inline com versionamento.
2. **Implementação backend** (sprint própria pós-ADR): migration, DAO, service,
   controller, rotas, middlewares.
3. **Implementação frontend** (sprint própria): tela de prontuário do paciente
   ligada à Agenda.

**Gates para iniciar 4.3:**
- 4.2 entregue em staging, com dados sintéticos.
- Audit de leitura validado (queries que listam evolução geram evento).
- Cross-tenant testes 100%.

**Não no v0.1 (registrado):** CID estruturado, exames com resultados
estruturados, prescrição com força legal, telemedicina, integração com CFM.

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
1. **ADR 0013** — escopo dos relatórios:
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

## Fase 4.6 — Convênios / faturamento básico v0.1

**Natureza:** **operacional+** com risco técnico/jurídico alto.

**Objetivo:** cadastro de convênios, valores acordados, faturamento interno
(relatório por convênio). **Sem TISS/TUSS real no v0.1** — apenas
estruturação de dados e cobrança interna.

**Entregáveis esperados:**
1. **ADR 0014** — escopo de convênios:
   - Entidades: `health_insurances` (normalizar o atual `convenio` em
     `patients`), `procedures`, `procedure_prices_per_insurance`.
   - Fluxo: cadastrar convênio → cadastrar procedimentos → registrar
     atendimento → gerar relatório de faturamento (estende relatórios da
     Fase 4.5).
   - Migração: importar convênios/procedimentos de planilhas (reusa o pipeline
     CSV/XLSX existente).
   - Permissões: role **financeiro** + **dono**.
2. Implementação (sprints próprias).

**Não no v0.1 (registrado explicitamente):**
- **TISS (Troca de Informação em Saúde Suplementar) real** — padrão ANS
  XML/SOAP; certificação; homologação por operadora; alto custo técnico/
  jurídico → **ADR própria futura** depois da Fase 4.6 estabilizada.
- **TUSS real** — Terminologia Unificada da Saúde Suplementar; mapeamento de
  códigos requer base TUSS atualizada e licenciamento → futura.
- Integração com operadoras; autorização prévia eletrônica; batch de
  cobrança; conciliação automática.

---

## Fase 4.7 — Estoque básico v0.1

**Natureza:** **operacional**.

**Objetivo:** controle de estoque básico de materiais e insumos da clínica
(gaze, seringas, materiais administrativos). **Sem medicamentos controlados
no v0.1.**

**Entregáveis esperados:**
1. **ADR 0015** — escopo do estoque:
   - Entidades: `stock_items`, `stock_movements` (entrada/saída/ajuste),
     `stock_categories`.
   - Operações: cadastro de item, movimentação manual (entrada/saída),
     alerta de estoque mínimo.
   - Migração: importar inventário inicial via CSV/XLSX (reusa pipeline).
   - Permissões: role **gestor** + **dono**.
   - Vínculo com atendimento (consumo por procedimento): **opcional** no v0.1;
     se entrar, só vínculo manual (sem dedução automática).
2. Implementação (sprints próprias).

**Não no v0.1 (registrado explicitamente):**
- **Medicamentos controlados (SNGPC / RDC ANVISA)** — rastreabilidade de lote
  com fins regulatórios; receituário azul/amarelo; integração com sistema da
  ANVISA → **ADR própria futura** depois da Fase 4.7 estabilizada.
- Nota fiscal de saída; rastreamento por lote/validade com força legal;
  integração com fornecedores; cotação automática; código de barras.

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
| Faturamento TISS/TUSS real (ANS, operadoras) | Fase 4.6 — **fora do v0.1**; ADR separada futura depois da Fase 4.6 estabilizada |
| Medicamentos controlados (SNGPC/ANVISA) | Fase 4.7 — **fora do v0.1**; ADR separada futura depois da Fase 4.7 estabilizada |
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
