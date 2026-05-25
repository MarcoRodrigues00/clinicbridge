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
- **Trilha AWS real:** **pausada estrategicamente** (ADR 0008 §6). Retomada
  vinculada à conclusão da Fase 4.1.
- **Pré-requisito vivo:** governança da Fase 3 (`requireRole`, rate limit Redis,
  trust proxy, backup/restore validado, deploy seguro, CORS/env prod) — itens
  conforme `docs/roadmap-next-phase.md`.

---

## Visão geral das fases

| Fase | Natureza | Status | ADR | Entregável principal |
|---|---|---|---|---|
| **4.0** | Direção/ADR | ✅ Sprint 4.0 | ADR 0008 | Decisão estratégica registrada |
| **4.1** | Arquitetura/habilitador | Pendente | ADR 0009 (futura) | Modelo de dados clínicos, roles granulares, audit de leitura |
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

## Fase 4.1 — Arquitetura de dados clínicos + permissões

**Natureza:** **habilitador**. Sem ela, nenhuma Fase 4.2+ pode começar.

**Objetivo:** desenhar (em docs/ADR) o modelo de dados, permissões e auditoria
necessários para suportar dados clínicos com segurança, sem ainda implementar
nada.

**Entregáveis esperados:**
1. **ADR 0009** — arquitetura clínica:
   - Modelo de dados clínicos (entidades, tabelas, FKs, separação administrativo
     vs. clínico — schemas separados? prefixo de tabela? schema PostgreSQL
     dedicado?).
   - Cifra em repouso para campos clínicos sensíveis (decisão: campo-a-campo
     com KMS dedicada vs. cifra inteira do schema vs. cifra a nível de coluna
     com `pgcrypto`). Trade-offs documentados.
   - Modelo de **roles granulares**: candidatas hoje listadas em
     `docs/roadmap-next-phase.md` ("Trilha equipe — Polimentos") — recepção,
     financeiro, gestor da clínica, **profissional de saúde** (novo), **leitor
     clínico** (novo). Mapeamento `requested_role` → role efetiva pela aprovação
     do owner. Revalidação de `papel` no `requireClinic` (hoje só `clinica_id`
     é revalidado).
   - Schema de **audit de leitura clínica**: extensão de `audit_logs` ou
     tabela paralela? Performance vs. completude. Eventos mínimos:
     `clinical.<entidade>.read`, `clinical.<entidade>.list`,
     `clinical.<entidade>.export`.
   - **Política LGPD clínica** específica (base legal art. 11; consentimento
     vs. tutela da saúde; retenção mínima por tipo de dado; export/exclusão).
     Validação jurídica externa **pendente** — não promete compliance.
   - **Threat model** do domínio clínico (STRIDE; ataques entre membros da
     mesma clínica; vazamento por endpoint mal filtrado).
   - **Estratégia de migração** de dados clínicos (importar prontuário de
     sistemas antigos): pipeline CSV/XLSX já existente é base, mas dado
     clínico exige validações próprias (sem normalizar texto livre; preservar
     versão original; consentimento de migração).
2. Sem código, sem migration, sem tabela.

**Gates para iniciar 4.2 (atendimento):**
- ADR 0009 aceita.
- 13 critérios (ADR 0001 §"Critérios para abrir uma fase clínica" + ADR 0008
  §8) atendidos no plano.
- Trilha AWS reavaliada à luz de cifra/KMS/RDS dimensionamento.
- Validação jurídica externa **iniciada** (não exige conclusão para começar
  4.2 com dados sintéticos, mas exige conclusão para dado real).

**Não no escopo de 4.1:**
- Criar tabelas. Criar migrations. Criar endpoints clínicos.
- Implementar roles granulares (4.1 desenha; implementação em sprint própria
  no início da 4.2).

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
| **3.41B** — execução real | ⏸️ **pausado estrategicamente** (ADR 0008 §6) |
| 3.42 — deploy checklist go/no-go | ⏸️ pausado (depende de 3.41B) |
| 3.43 — piloto real | ⏸️ pausado (depende de 3.42) |

Gate para retomar: **ADR 0009 (Fase 4.1) aceita** + reavaliação de
dimensionamento RDS/EBS/KMS à luz dos dados clínicos.

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
