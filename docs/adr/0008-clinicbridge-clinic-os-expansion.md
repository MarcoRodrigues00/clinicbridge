# ADR 0008 — Expansão do ClinicBridge para Clinic OS completo

- **Status:** Accepted
- **Data:** 2026-05-25
- **Decisores:** dono do produto (ClinicBridge)
- **Supersedes (parcialmente):** ADR 0001 (Opção C) — a base administrativa
  segura continua sendo pré-requisito, mas o produto deixa de ser **apenas**
  uma ponte de migração e passa a ser um **Clinic OS modular**. Os critérios de
  gating clínico do ADR 0001 (§ "Critérios para abrir uma fase clínica") **continuam
  válidos** e são reaproveitados pelas Fases 4.x desta ADR.
- **Relacionado:** `docs/product-clinic-os-roadmap.md`,
  `docs/adr/0001-product-direction-option-c.md`, `docs/security-notes.md`,
  `docs/project-state.md`, `docs/roadmap-next-phase.md`,
  `docs/production-minimum-plan.md`, `docs/aws-infra-sprint-3.41-plan.md`,
  `docs/aws-provisioning-runbook-3.41B.md`.

---

## 1. Contexto

O ClinicBridge nasceu como **ponte de migração de dados administrativos** entre
sistemas antigos e exports limpos. ADR 0001 (2026-05-22) consolidou a Opção C:
base administrativa segura primeiro, expansão clínica futura **planejada mas não
implementada**, com ADR dedicada por módulo clínico.

Em 2026-05-22 → 2026-05-25 a base administrativa amadureceu:
auth + MFA + backup codes; upload/preview/validação/import; pacientes CRUD;
duplicados acionáveis + merge B-safe; export read-only; agenda administrativa;
equipe; backup local + offsite (scripts/docs); plano e runbook AWS (3.41A,
3.41B-0). **Nenhum recurso AWS real foi criado.**

A direção de produto evoluiu: o ClinicBridge **não** vai ficar restrito a
migração. A intenção declarada agora é **competir com sistemas completos de
gestão clínica** (referência de mercado: Feegow e similares), com migração
permanecendo como **diferencial competitivo** — não como produto final.

Esta ADR registra essa expansão de forma controlada, modular e por fases.

## 2. Decisão

O ClinicBridge passa a ser desenvolvido como **Clinic OS** — sistema modular
de gestão de clínicas — sob as seguintes condições:

1. **Sem telemedicina por enquanto.** Vídeo, áudio, integração com plataformas
   de telessaúde e qualquer feature que cruze a fronteira síncrona médico↔paciente
   ficam fora do escopo. Reavaliar em ADR futura própria.
2. **Migração/importação permanece como diferencial permanente**, não como
   módulo descontinuável.
3. **A base administrativa segura (Fase 3 do ADR 0001) continua sendo
   pré-requisito.** Nenhum módulo clínico entra antes da Fase 4.1 (arquitetura
   clínica) ser aprovada por ADR própria.
4. **Cada módulo clínico precisa de uma ADR própria** (Fases 4.2–4.7 abaixo),
   com: modelo de dados, fronteiras, permissões, audit de leitura+escrita,
   requisitos LGPD, threat model do módulo, plano de migração de dados (se
   importar de sistema antigo).
5. **Tenant isolation por `clinica_id` permanece invariante** em todo dado
   novo. **Nenhuma exceção.**
6. **Audit de acesso (leitura) torna-se obrigatório** para qualquer dado
   clínico — não basta auditar escrita.
7. **Roles granulares passam a ser P1** antes da Fase 4.2 (atendimento). O
   modelo atual (`dono_clinica` / `secretaria` / `admin_sistema`) não comporta
   o domínio clínico.
8. **Linguagem do produto:** falar em "ClinicBridge — sistema de gestão de
   clínicas com migração inteligente". Evitar "plataforma completa de saúde",
   "solução definitiva", "compliance total com LGPD/CFM" — essas afirmações
   exigem validação jurídica externa e não podem ser feitas pelo time agora.
9. **Não copiar telas, textos, fluxos ou nomenclatura** de Feegow ou outros
   concorrentes. Análise competitiva é permitida; cópia direta de UI/copy é
   vedada (risco jurídico + falta de diferenciação).

## 3. Módulos no roadmap Clinic OS

Em ordem de prioridade declarada (não cronograma rígido — cada um abre por
ADR própria):

| # | Módulo | Natureza | ADR própria? |
|---|---|---|---|
| 1 | **Migração/importação/exportação** (já existe; vira diferencial permanente) | Administrativo | Não — evolui pelo backlog normal |
| 2 | **Agenda + Equipe** (já existem; passam a ser módulos centrais) | Administrativo | Não — evoluem pelo backlog normal |
| 3 | **Arquitetura clínica + permissões granulares** | Habilitador | ✅ Fase 4.1 |
| 4 | **Prontuário eletrônico / atendimento** | Clínico | ✅ Fase 4.2 |
| 5 | **Documentos médicos / receitas (sem prescrição eletrônica válida)** | Clínico | ✅ Fase 4.3 |
| 6 | **Financeiro** (contas a pagar/receber, fluxo de caixa básico) | Administrativo+ | ✅ Fase 4.4 |
| 7 | **Relatórios gerenciais** (alto valor percebido; antes de convênios/estoque) | Operacional | ✅ Fase 4.5 |
| 8 | **Convênios / faturamento básico** (TISS/TUSS real fora do v0.1) | Administrativo+ | ✅ Fase 4.6 |
| 9 | **Estoque básico** (medicamentos controlados/ANVISA fora do v0.1) | Operacional | ✅ Fase 4.7 |

> **Fases futuras planejadas (sem número ainda, exigem ADR própria):**
> **IA clínica assistiva** (pré-requisito: prontuário v0.1 sólido com dado real
> validado); **Assinatura digital ICP-Brasil + prescrição eletrônica válida**
> (pré-requisito: documentos médicos v0.1 maduro); **TISS/TUSS real**
> (pré-requisito: convênios v0.1 estabilizado); **Medicamentos controlados
> SNGPC/ANVISA** (pré-requisito: estoque v0.1 estabilizado); **Telemedicina**
> (reabrir esta ADR).

> Detalhe e fases: `docs/product-clinic-os-roadmap.md`.

## 4. Princípios invariantes do Clinic OS

Estes princípios são **regras de aceitação** para qualquer módulo futuro.
Toda ADR de módulo (Fases 4.x) deve declarar como atende cada um:

1. **Não implementar dado clínico sem ADR.** Nenhuma migration, tabela, endpoint
   ou tela clínica entra sem ADR própria aprovada.
2. **Todo acesso clínico é auditável** — leitura + escrita. `audit_logs` precisa
   ganhar suporte a evento de leitura clínica (Fase 4.1 entrega o schema).
3. **Separação clara administrativo vs. clínico** em domínio, banco e camada
   de service. Mistura de tabelas exige justificativa em ADR.
4. **Tenant isolation por `clinica_id`** em toda tabela tenant-scoped, novas
   incluídas. DAOs sempre filtram tenant. Cross-tenant → 403/404 genérico.
5. **CPF nunca bruto desnecessariamente.** O padrão atual (`cpf_masked` na API)
   se estende ao domínio clínico. Excepcionar exige justificativa em ADR + audit.
6. **Não prometer conformidade jurídica** sem validação externa. Falar em
   "preparação e requisitos", "alinhado a", "minimização" — nunca "compliance total".
7. **Telemedicina fora do escopo.** Vídeo/áudio síncrono não entra sem ADR
   própria + validação CFM/regulatória.
8. **Prescrição eletrônica válida (ICP-Brasil)** continua reservada — receitas
   da Fase 4.3 são **documento administrativo gerado pelo profissional**, não
   prescrição com assinatura digital legal. Prescrição válida = ADR futura
   dedicada (mantém os critérios do ADR 0001 §7).
9. **PII em logs/audits/mensagens de erro continua proibida.** A regra atual
   (sem nome/CPF/telefone/e-mail) se estende a campos clínicos (CID, queixa,
   diagnóstico, prescrição).
10. **Migração permanece como diferencial.** Cada módulo novo deve considerar
    "como importar este dado de sistemas antigos" desde a ADR.

## 5. Riscos identificados (não bloqueantes desta ADR)

| Risco | Mitigação |
|---|---|
| **LGPD / dados sensíveis de saúde** (art. 11 — base legal especial) | Fase 4.1 entrega política LGPD clínica específica + base legal por módulo. Validação jurídica externa antes de qualquer dado real. |
| **Acesso indevido a dados clínicos** entre membros da mesma clínica | Roles granulares (Fase 4.1) + audit de leitura obrigatório. Sem audit de leitura = sem dado clínico em produção. |
| **Documentos médicos com força legal** (atestado, receita, declaração) | Fase 4.3 limita-se a documento administrativo gerado pelo profissional. Validade jurídica plena exige ADR de prescrição/ICP-Brasil. |
| **Prescrição eletrônica válida** (ICP-Brasil, CFM) | **Fora do v0.1 da Fase 4.3.** Fase futura própria (sem número ainda) depois de documentos médicos v0.1 maduro. Mantém critérios do ADR 0001 §7. |
| **IA clínica assistiva** (sugestão de evolução, resumo, alertas) | **Fase futura própria (sem número ainda)**, depois de prontuário v0.1 sólido com dado real validado. Risco de viés/responsabilidade clínica + LGPD art. 11 + tratamento automatizado (art. 20). Não tentar dentro da Fase 4.2. |
| **Faturamento TISS/TUSS real** (ANS, operadoras) | Alta complexidade técnica + jurídica. **Fora do v0.1 da Fase 4.6** (que entrega só faturamento interno). TISS/TUSS real = ADR separada futura depois da Fase 4.6 estabilizada. |
| **Medicamentos controlados (SNGPC/ANVISA)** | **Fora do v0.1 da Fase 4.7** (que entrega só estoque básico de materiais). SNGPC/ANVISA = ADR separada futura depois da Fase 4.7 estabilizada. |
| **Vazamento entre clínicas (tenant isolation)** | Invariante reforçada na Fase 4.1; testes de cross-tenant obrigatórios em toda Fase 4.x. |
| **Cópia de UI/copy de concorrentes** (Feegow etc.) | Vedada por princípio §2.9. Diferenciação por migração + UX própria. |
| **Over-engineering por antecipação** (criar abstrações para todos os 9 módulos antes de implementar 1) | Fase 4.1 entrega só o mínimo necessário para o módulo seguinte (atendimento). Generalizações exigem 2+ casos de uso reais. |
| **Crescimento de escopo no MVP** ("já que vai virar Clinic OS, vamos adicionar X") | Cada feature continua passando pelo backlog/sprint normal. Esta ADR não autoriza implementação — só direção. |
| **Custo AWS antes do retorno** | Execução AWS pausada estrategicamente (§6) até Fase 4.1 fechar. |

## 6. Impacto na trilha AWS — pausa estratégica

A trilha de provisionamento AWS real (Sprint 3.41B em diante) fica **pausada
estrategicamente** — **não cancelada**.

Justificativa:
- O runbook (`docs/aws-provisioning-runbook-3.41B.md`) e o plano
  (`docs/aws-infra-sprint-3.41-plan.md`) **permanecem válidos** para a base
  administrativa.
- A arquitetura clínica (Fase 4.1) pode mudar dimensionamento (RDS storage,
  EBS, retenção, backup) e modelo de secrets/keys (KMS dedicada para campos
  clínicos cifrados). Provisionar antes da Fase 4.1 gera retrabalho/custo.
- Nenhum dado real está em produção; não há urgência de deploy.

Gate para retomar a trilha AWS:
- Fase 4.1 (arquitetura clínica + permissões) **aprovada por ADR** própria.
- Reavaliação do dimensionamento (RDS instance class, storage, backup window,
  cifra em repouso) feita à luz dos dados clínicos.
- Decisão sobre KMS dedicada (CMK) para `MFA_ENCRYPTION_KEY` e potenciais
  campos clínicos cifrados (chave dedicada vs. `JWT_SECRET` fallback).

Enquanto isso, o desenvolvimento local + Nginx local/staging + backups locais
seguem funcionando. Os 7 decisões do dono do ADR 0001 §5 do
`docs/production-minimum-plan.md` ficam congeladas até reabertura da trilha.

## 7. O que NÃO muda com esta ADR

- Código do backend/frontend: sem alteração.
- Migrations: nenhuma nesta sprint.
- Tabelas clínicas: **não criadas**. Continuam proibidas até Fase 4.1+ ADR.
- Endpoints/telas/JWT/permissões atuais: sem alteração.
- Invariantes de segurança do `docs/security-notes.md`: **todas continuam em
  vigor**. "Escopo clínico proibido" permanece — só sai com ADR de Fase 4.x.
- Tenant isolation, CPF mascarado, audit append-only: invariantes permanentes.
- Compromisso de não prometer compliance total: permanente.

## 8. Critérios para abrir cada Fase 4.x

Reutilizam os 9 critérios do ADR 0001 §"Critérios para abrir uma fase clínica",
acrescidos para Clinic OS:

10. **Roles granulares implementadas e testadas** (Fase 4.1 entrega; Fases 4.2+
    dependem).
11. **Audit de leitura clínica disponível** (Fase 4.1 entrega o schema; cada
    Fase 4.x usa).
12. **Separação banco administrativo vs. clínico** definida em schema/migration
    pattern (Fase 4.1).
13. **Estratégia de migração de dados clínicos** definida (CSV/XLSX → entidade
    clínica) — mantém o diferencial competitivo.

Detalhe operacional de cada fase: `docs/product-clinic-os-roadmap.md`.

## 9. Itens explicitamente fora do escopo desta ADR

- Implementar qualquer módulo (esta ADR só registra direção).
- Criar tabelas clínicas.
- Criar AWS real.
- Alterar backend/frontend/migrations/schema/API.
- Promessa de prazo/data.
- Telemedicina, prescrição eletrônica válida (ICP-Brasil), TISS real.
- Cópia de UI/copy de Feegow ou qualquer concorrente.
- App mobile nativo (continua fora; reavaliar em ADR futura própria).
- Integração com órgãos públicos/operadoras (cada integração = ADR própria).

## 10. Notas finais

Esta ADR descreve **direção de produto e princípios**, não autoriza código.
Cada Fase 4.x precisa abrir sua própria ADR, ser aprovada pelo dono e cumprir
os 13 critérios acima antes de qualquer implementação.

**Esta ADR não afirma conformidade jurídica completa com LGPD, CFM, ICP-Brasil
ou TISS.** Conformidades específicas dependerão das ADRs e validações futuras.
