# ADR 0009 — Arquitetura clínica mínima, roles granulares, audit de leitura e LGPD clínica

- **Status:** Accepted
- **Data:** 2026-05-25
- **Decisores:** dono do produto (ClinicBridge)
- **Sprint:** 4.1 (docs/ADR-only — sem código, sem migration, sem AWS)
- **Habilitada por:** ADR 0008 (expansão para Clinic OS modular)
- **Reutiliza gates de:** ADR 0001 §"Critérios para abrir uma fase clínica"
- **Coerente com:** ADR 0007 (merge B-safe administrativo — sem dado clínico)
- **Relacionado:** `docs/clinical-architecture-and-permissions.md` (detalhe
  operacional desta ADR), `docs/product-clinic-os-roadmap.md`,
  `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`,
  `docs/aws-provisioning-runbook-3.41B.md` (pausado),
  `docs/aws-infra-sprint-3.41-plan.md` (pausado).

---

## 1. Contexto

A ADR 0008 (Sprint 4.0, 2026-05-25) decidiu a expansão do ClinicBridge para
**Clinic OS modular**, com o módulo de arquitetura clínica (Fase 4.1) como
**habilitador obrigatório** das fases clínicas/operacionais subsequentes
(4.2 prontuário, 4.3 documentos médicos, 4.4 financeiro, 4.5 relatórios,
4.6 convênios, 4.7 estoque). A 4.1 entrega **apenas documentação e ADR** —
nenhum schema, endpoint, role ou tabela clínica é criado nesta sprint.

O sistema hoje tem três papéis em `users.papel`:
`dono_clinica` (owner), `secretaria` (operator com login — exibido na UI como
"funcionário(a) com acesso administrativo" desde a Sprint 3.24.1), e
`admin_sistema` (sem `clinica_id`, bloqueado das rotas tenant-scoped por
`requireClinic`). Nada disso comporta um domínio clínico minimamente seguro:
não há profissional de saúde, gestor, financeiro nem leitor clínico; e o audit
hoje cobre **escrita** mas não **leitura**.

Esta ADR define o modelo conceitual mínimo para suportar os módulos clínicos
**com segurança equivalente** ao que a base administrativa já tem, antes que
qualquer migration ou código clínico exista.

## 2. Decisão

Para liberar a Sprint 4.2 (prontuário/atendimento v0.1), o ClinicBridge adota
os seguintes compromissos **arquiteturais e documentais**:

1. **Separação explícita entre dado administrativo e dado clínico** em
   domínio, banco e camada de service. A fronteira é declarativa por agora
   (sem migration) e vira invariante no §5.
2. **Roles granulares conceituais** definidas nesta ADR (§4) e **não
   implementadas** ainda — implementação acontece na ADR/sprint que abrir 4.2
   (ou em sprint dedicada anterior, se necessário). Nomes técnicos atuais
   (`dono_clinica`, `secretaria`, `admin_sistema`) **não mudam** sem migration
   dedicada.
3. **Audit de leitura** torna-se invariante para qualquer dado clínico. Schema
   conceitual definido nesta ADR (§6); migration real entra com a 4.2.
4. **Versionamento de dados clínicos editáveis** é invariante: notas e
   documentos não são sobrescritos sem histórico; nada de delete físico.
5. **`admin_sistema` não acessa dados clínicos por padrão.** Continua sendo
   papel de plataforma (suporte técnico, infra, configuração cross-tenant).
   Acesso clínico excepcional exige ADR própria + audit reforçado + política
   de "break-glass" (§4.6).
6. **LGPD clínica** ganha princípios próprios (§7) e exige **validação
   jurídica externa** antes de qualquer dado clínico real em produção. Não
   afirma conformidade completa.
7. **Threat model clínico** registrado (§8) — 10 vetores específicos a tratar
   por cada fase clínica.
8. **Gates obrigatórios para abrir 4.2** listados em §9 e reutilizam os 13
   critérios cumulativos das ADRs 0001 (§"Critérios para abrir uma fase
   clínica") e 0008 (§8).
9. **Trilha AWS continua pausada estrategicamente** (ADR 0008 §6). Esta ADR
   registra os impactos clínicos esperados em RDS/EBS/KMS/backup (§10) sem
   provisionar nada.
10. **Princípios invariantes da ADR 0008 §4 permanecem em vigor sem exceção**
    e são reforçados aqui.

Esta ADR **não** autoriza código. Cada módulo clínico continua exigindo ADR
própria (0010 prontuário, 0011 documentos médicos, etc.).

## 3. Princípios invariantes (Clinic OS clínico)

Reforça e estende a ADR 0008 §4. Toda ADR de módulo clínico (4.2+) deve
declarar como atende cada item.

1. **Tenant isolation por `clinica_id`** — invariante absoluta. DAOs clínicos
   sempre filtram tenant. Cross-tenant → 403 ou 404 genérico (anti-enumeração).
2. **Sem PII clínica em logs/audits/mensagens** — extensão do princípio atual
   para campos clínicos: queixa, CID, diagnóstico, prescrição, nome de
   medicamento, conteúdo de receita, anexo. Audits gravam `acao`, `recurso`,
   `recurso_id`, `usuario_id`, `clinica_id`, `ip`, `user_agent`, `request_id`
   e nada mais (schema atual de `audit_logs`).
3. **CPF mascarado por padrão** — telas/exports clínicos seguem o padrão atual
   (`cpf_masked`). Excepcionar exige justificativa por ADR.
4. **Sem delete físico de dado clínico** — soft-delete em todas as entidades.
   Histórico imutável é parte do valor médico-legal e bloqueia revisão futura.
5. **Versionamento em dados clínicos editáveis** — notas, evolução,
   prescrição, documentos. Cada edição cria nova versão referenciando a
   anterior; cancelamento ≠ delete (cria registro de cancelamento).
6. **Audit de leitura obrigatório** para qualquer dado clínico — leitura,
   listagem com conteúdo clínico, export, geração de relatório com dado
   clínico. Listagens estritamente administrativas (cadastro, contato,
   agenda sem motivo) continuam com o padrão atual (sem audit de leitura).
7. **Separação banco administrativo vs. clínico** — schema/prefixo dedicado
   (decisão técnica fica para a ADR 0010). Mistura de colunas administrativas
   e clínicas em uma mesma tabela exige justificativa em ADR.
8. **Roles granulares e revalidação no request** — `requireClinic` revalida
   `papel` no DB para roles clínicas (decisão técnica na ADR 0010). Hoje só
   `clinica_id`/`ativo` são revalidados; isso muda quando uma role clínica
   tomar decisão de acesso.
9. **Sem prescrição com força legal** (ICP-Brasil) no Clinic OS v0.x — vide
   ADR 0008 §4.8 e ADR 0001 §7.
10. **Migração de dados clínicos** considerada na ADR de cada módulo — é o
    diferencial competitivo permanente do ClinicBridge. CSV/XLSX → entidade
    clínica precisa de validações próprias (sem normalização destrutiva de
    texto livre; consentimento de migração; preservar versão original).

## 4. Roles granulares conceituais

Definição **conceitual** apenas. Implementação técnica (coluna/tabela,
mapeamento `requested_role`, UI de aprovação, revalidação no DB,
fluxo de transição entre papéis) fica para sprint dedicada **antes da 4.2** ou
no início da 4.2 conforme decidido na ADR 0010.

| Role conceitual | Escopo | Tenant-scoped? | Estado atual no código |
|---|---|---|---|
| `dono_clinica` | Tudo administrativo + clínico da própria clínica. Único papel que pode transferir titularidade (fora de escopo até ADR própria). | Sim | ✅ existe |
| `gestor_clinica` | Tudo administrativo + ler relatórios consolidados + gerir equipe; **não** cria/edita prontuário (a menos que também tenha `profissional_clinico`). | Sim | ❌ não existe |
| `profissional_clinico` | Cria/edita prontuário, documentos médicos, prescrição administrativa **dos próprios pacientes/atendimentos** ou dos da clínica conforme política da clínica (decisão por clínica fica na ADR 0010). | Sim | ❌ não existe |
| `funcionario_administrativo` | Cadastro/contato/agenda/importação. **Não** acessa conteúdo clínico (vê metadados — paciente, profissional, data). Sucessor conceitual da `secretaria` atual. | Sim | ⚠️ existe como `secretaria` (nome técnico antigo; renomear exige migration dedicada — vide §11) |
| `financeiro` | Financeiro + relatórios financeiros + faturamento de convênios; **não** acessa conteúdo clínico. | Sim | ❌ não existe |
| `admin_sistema` | Plataforma/tenants/configuração/suporte técnico cross-tenant **sem `clinica_id`**. **NÃO acessa dados clínicos por padrão.** | Não (bloqueado por `requireClinic` em rotas tenant-scoped) | ✅ existe (não acessa dado clínico desde sempre — invariante reforçada aqui) |

### 4.1 Combinabilidade

Roles **podem coexistir** em um mesmo usuário (ex.: dono que também atende é
`dono_clinica` + `profissional_clinico`). Modelo técnico (uma coluna, tabela
de papéis, array de papéis, ou role primária + papéis adicionais) fica para
a ADR 0010. Hoje o sistema só permite **uma** role por usuário (`users.papel`).

### 4.2 `dono_clinica` vs `gestor_clinica`

`dono_clinica` é o único papel que pode **transferir titularidade da clínica**,
mas isso continua **fora de escopo** (sem ADR de transferência de dono).
`gestor_clinica` é "dono operacional sem propriedade jurídica": faz tudo
administrativo e gerencial, **mas não troca o dono nem desativa o dono**.

### 4.3 `profissional_clinico` e visibilidade

A política "vê só os próprios atendimentos" vs. "vê todos os atendimentos da
clínica" fica para a ADR 0010 (clínicas grandes podem precisar do segundo
modo; clínicas pequenas em geral preferem o primeiro). Default sugerido:
**ver apenas os próprios** + audit de leitura completo nos dois modos.

### 4.4 `funcionario_administrativo` e dado clínico

**Nunca** vê conteúdo clínico — vê apenas metadados (que pacientes existem,
qual profissional atendeu, em que data). O conteúdo (queixa, evolução,
diagnóstico, prescrição) **não** é renderizado para esta role. Tentativa de
acesso a endpoint clínico → 403 `forbidden_role` (sem PII clínica na
mensagem, conforme padrão atual).

### 4.5 `financeiro` e dado clínico

Análogo a `funcionario_administrativo`: vê valores, datas, procedimentos
faturados, convênio do paciente, **não** vê conteúdo clínico. Risco
específico: **relatório financeiro vazando dado clínico** — qualquer view/
query que cruze financeiro com prontuário precisa **filtrar campos clínicos**
no DAO (não no controller). Mitigação no §8.

### 4.6 `admin_sistema` e dado clínico — política "break-glass"

**Padrão:** `admin_sistema` **não** acessa dado clínico de paciente. O
middleware `requireClinic` continua bloqueando todas as rotas tenant-scoped.

**Acesso excepcional** (suporte técnico que requer ver dado clínico para
resolver bug, auditoria interna, ordem judicial) **não** é implementado
nesta ADR. Quando aparecer use-case real:

- exige ADR dedicada com política de "break-glass" (justificativa textual
  obrigatória, audit reforçado em tabela separada, notificação ao dono da
  clínica, prazo de janela curto);
- nunca via JWT permanente — token de uma sessão com prazo;
- nunca silenciosa — registro **visível ao dono da clínica** na aba de
  auditoria (quando essa aba existir, ver `docs/roadmap-next-phase.md` Fase 4
  administrativa);
- jamais para acesso massivo cross-tenant.

Até essa ADR existir, `admin_sistema` continua **sem** caminho técnico para
ler dado clínico de pacientes — invariante.

## 5. Separação administrativo vs. clínico (modelo conceitual)

Esta seção define a **fronteira**. Nada de tabela/schema/migration é criado
nesta sprint.

### 5.1 Dado administrativo (já existe)

- Cadastro do paciente: nome, contato (telefone, e-mail), CPF (mascarado na
  saída), data de nascimento, convênio básico, número de carteirinha,
  endereço opcional.
- Agenda administrativa: agendamentos com paciente + profissional + data +
  status + `administrative_notes` curtas e **comprovadamente** não-clínicas
  (a UI da Sprint 3.15 já tem aviso anti-clínico).
- Importação: arquivos CSV/XLSX + sessões + recibos.
- Equipe: membros com login + profissionais da agenda + convites.
- Auditoria atual: escrita administrativa (sem audit de leitura).

### 5.2 Dado clínico (novo — só vira tabela na 4.2+)

Categorização sugerida (cada item exige ADR no módulo correspondente):

| Categoria | Exemplos | Módulo / ADR |
|---|---|---|
| Atendimento / encontro | Data, profissional, paciente, motivo administrativo (≠ queixa clínica) | 4.2 (ADR 0010) |
| Evolução / nota clínica | Queixa, anamnese, conduta, evolução textual | 4.2 (ADR 0010) |
| Diagnóstico estruturado | CID, hipótese diagnóstica estruturada | Fase futura (não 4.2 v0.1) |
| Prescrição administrativa | Receita gerada para impressão (sem ICP-Brasil) | 4.3 (ADR 0011) |
| Documentos médicos | Atestado, declaração de comparecimento, laudo simples | 4.3 (ADR 0011) |
| Exames | Pedido, resultado estruturado ou anexo | Fase futura (não 4.3 v0.1) |
| Anexo clínico | PDF/imagem ligado ao atendimento | 4.2 ou 4.3 conforme ADR |
| Medicamentos | Lista de medicamentos do paciente (alergia, uso contínuo) | Fase futura |
| Faturamento clínico | Procedimentos realizados (vínculo ao atendimento) | 4.6 (ADR 0014) — preserva separação clínica |

### 5.3 Regra técnica para separar

A separação física (schema PostgreSQL dedicado vs. prefixo de tabela vs.
mesma database com convenção de nome) é **decisão técnica da ADR 0010**.
Esta ADR só estabelece que:

1. Tabela clínica não pode misturar colunas administrativas e clínicas sem
   justificativa em ADR (princípio §3.7).
2. DAO clínico não pode ser invocado por service administrativo (ex.: a
   exportação atual de pacientes **não** pode crescer para incluir dado
   clínico sem reescrever a ADR de export).
3. FKs entre clínico e administrativo **são permitidas e esperadas** (ex.:
   `clinical_encounters.patient_id → patients.id`) — a separação é por
   responsabilidade, não por isolamento total.
4. `ON DELETE` de FKs clínicas → administrativas deve ser **`SET NULL` ou
   `RESTRICT`**, nunca `CASCADE` — preserva histórico médico-legal mesmo se
   algo administrativo for arquivado/limpo no futuro.

## 6. Audit de leitura clínica — modelo conceitual

### 6.1 Quando auditar leitura

| Evento | Audit de leitura? |
|---|---|
| Listar pacientes (cadastro administrativo) | ❌ não (segue padrão atual) |
| Buscar paciente por nome/CPF (administrativo) | ❌ não |
| Listar agenda do dia (administrativo) | ❌ não |
| Abrir prontuário de um paciente | ✅ obrigatório |
| Listar evolução de um atendimento | ✅ obrigatório |
| Ler documento médico (atestado/receita) | ✅ obrigatório |
| Listar documentos médicos de um paciente | ✅ obrigatório |
| Exportar relatório com dado clínico | ✅ obrigatório |
| Gerar relatório gerencial que cruze dado clínico | ✅ obrigatório |
| Listar atendimentos de um paciente (sem conteúdo, só metadados) | ⚠️ a definir na 4.2 — sugestão: auditar se a listagem inclui motivo/queixa, não auditar se for só data/profissional |

### 6.2 Campos mínimos conceituais do audit de leitura

Schema técnico (extensão de `audit_logs` ou tabela paralela `clinical_read_audit`)
fica para a ADR 0010. Campos conceituais necessários:

- `clinica_id` — invariante tenant.
- `usuario_id` — quem leu.
- `papel` no momento da leitura (anti-stale; se o papel mudar, o registro
  preserva o papel vigente naquele instante).
- `acao` — `clinical.<entidade>.read` / `.list` / `.export`.
- `recurso` — `encounter` | `note` | `document` | `report` | `attachment`.
- `recurso_id` — UUID do dado lido (nunca PII).
- `paciente_id` — **identificador interno pseudonimizado** (UUID) do paciente
  cujo dado clínico foi lido. Necessário para rastreabilidade, audit de
  leitura e transparência LGPD ao titular (art. 9 / 18 — saber quem acessou
  seu prontuário). **Tratamento obrigatório:**
  - É **dado pessoal** dentro do sistema (pseudonimizado, não anonimizado —
    a chave de reidentificação está no banco) e deve ser tratado como tal:
    acesso restrito por role, nunca exposto em logs de aplicação fora da
    tabela de audit, nunca incluído em URL pública, mensagem de erro,
    métrica ou export sem necessidade comprovada.
  - **Nunca** acompanhado de nome, CPF, telefone, e-mail ou conteúdo clínico
    bruto no mesmo registro de audit (princípio §3.2 — invariante).
  - Acesso à consulta "quem leu o prontuário deste paciente" é restrito
    (decisão de role na ADR 0010; default sugerido: `dono_clinica` +
    `gestor_clinica`, sempre auditado).
- `request_id`, `ip`, `user_agent`, `criado_em` — como no `audit_logs` atual.
- **Sem** conteúdo lido, sem snippets, sem queixa, sem CID, sem PII do
  paciente além do `paciente_id` pseudonimizado.

### 6.3 Performance e retenção

- **Append-only.** Mesmo princípio do `audit_logs` atual. Limpeza real exige
  ADR (espelha ADR 0002).
- **Volume esperado:** alto (toda leitura clínica gera linha). Decisão de
  schema (`audit_logs` único vs. tabela paralela com particionamento por mês)
  fica para ADR 0010 com base em estimativa real.
- **Retenção legal:** prazo mínimo de retenção depende de validação jurídica
  (CFM costuma falar em 20 anos para prontuário; audit de leitura é evidência
  acessória). Não prometer valor antes da consulta.

### 6.4 Visibilidade ao titular do dado

LGPD art. 9 / 18 prevê que o titular pode requisitar transparência. O design
deve permitir, no futuro, que o paciente saiba **quais membros da clínica
acessaram seu prontuário e quando** — sem expor IPs/User-Agents nem
identidade individual fora do escopo necessário. Implementação fica para
sprint própria (fase futura, sem número); a ADR 0009 só estabelece que o
schema **precisa permitir essa consulta** (ter `paciente_id` pseudonimizado
como descrito em §6.2, com acesso restrito).

## 7. LGPD clínica — princípios

Esta ADR descreve **preparação e requisitos**, não conformidade. Validação
jurídica externa **obrigatória** antes de qualquer dado clínico real em
produção.

1. **Dados de saúde são sensíveis** (LGPD art. 11). Base legal especial —
   não basta consentimento genérico; tutela da saúde (art. 11, II, "a") e
   exercício regular de direito (art. 11, II, "d") são candidatas, mas
   exigem confirmação jurídica caso-a-caso.
2. **Minimização de acesso.** Cada role vê o mínimo necessário para sua
   função (§4). Profissional vê seu paciente; financeiro não vê queixa;
   funcionário(a) administrativo(a) não vê prontuário.
3. **Minimização de exportação.** Export clínico **não** é parte do v0.1 dos
   módulos clínicos. Quando entrar, exige ADR própria + audit de export +
   limite por clínica + sem PII em URL/log.
4. **Logs sem conteúdo clínico bruto.** Princípio §3.2 reforçado.
5. **Retenção e eliminação dependem de política jurídica futura.** Não
   prometer prazos. Limpeza de dado clínico real exige ADR (espelha ADR 0002),
   com requisitos próprios (CFM costuma exigir 20 anos para prontuário —
   confirmar com jurídico).
6. **Base legal e consentimento.** Termo/consentimento de tratamento de dado
   sensível precisa ser validado antes de produção. Fluxo de adesão por
   paciente + revogação fica para sprint própria; modelo conceitual entra na
   ADR 0010.
7. **Direitos do titular** (LGPD art. 18 — acesso, portabilidade,
   eliminação, confirmação): fluxo de atendimento desses direitos não está
   implementado e exige sprint própria depois de dado clínico real existir.
8. **Anonimização vs. pseudonimização.** Para futuras analytics/IA clínica,
   exige ADR própria — relatório gerencial v0.1 (4.5) **não** faz analytics
   com dado clínico identificado fora do tenant.
9. **Transferência internacional de dados.** Backup offsite atual (3.40) usa
   S3 brasileiro recomendado — se for outra região, exige avaliação LGPD.
   Não prometer "compliance" antes de definir região do bucket de produção.

## 8. Threat model clínico

10 vetores específicos. Cada ADR de fase clínica (4.2+) declara mitigações.

| # | Risco | Mitigação base (esta ADR estabelece) |
|---|---|---|
| 1 | **Profissional vendo paciente de outra clínica** | Invariante tenant `clinica_id` em todo DAO clínico. Cross-tenant → 404 genérico. Teste cross-tenant obrigatório em toda Fase 4.x. |
| 2 | **Funcionário administrativo vendo prontuário sem permissão** | `requireRole` cobre endpoints clínicos; UI esconde + backend é defesa real. Audit de leitura para detecção. |
| 3 | **`admin_sistema` vendo dado clínico indevidamente** | `requireClinic` bloqueia rotas tenant-scoped. Acesso clínico via `admin_sistema` = **ADR de break-glass futura** (§4.6). |
| 4 | **Relatório financeiro vazando dado clínico** | DAO de relatório financeiro **filtra campos clínicos no SQL** (não no controller). Tabela financeira nunca herda colunas clínicas. ADR 0014 (convênios) e ADR 0013 (relatórios) declaram explicitamente quais campos cruzam. |
| 5 | **Export clínico indevido** | Export clínico fora do v0.1 dos módulos clínicos. Quando entrar: owner-only + audit + limites + CPF mascarado. |
| 6 | **Logs contendo dado clínico** | Princípio §3.2; `logger` redige campos clínicos sensíveis (extensão da lista atual `authorization/cookie/password/senha/cpf/token`). Lista exata vira invariante na ADR 0010. |
| 7 | **Merge de pacientes impactando histórico clínico** | ADR 0007 é **B-safe administrativo** — não toca dado clínico. Quando dado clínico existir, ADR 0007 precisa ser **estendida** (ou nova ADR) decidindo: o merge **move** evolução do secundário para o principal? **mantém** evolução separada com `merged_into_id`? Resposta provável: **manter separada com proveniência**, sem misturar histórico clínico de dois pacientes. Decisão final fica para a ADR 0010. **Até lá, merge continua sendo administrativo apenas.** |
| 8 | **Backup contendo dado clínico sensível** | Estratégia atual (Restic + cifra em repouso) já cifra todo o backup. Reavaliação do dimensionamento e da chave KMS dedicada (vs. fallback `JWT_SECRET`) entra no gate de retomada AWS (§10). |
| 9 | **Anexos clínicos futuros** | Storage privado (não público), validação de magic bytes (extensão do padrão atual), antivírus/sandbox/DLP (P3 atual vira **P1 antes de anexo clínico**). Signed URL **obrigatório** para download de anexo clínico — não pode ser path direto. |
| 10 | **Reuso de token / role stale** | Hoje `papel` vem do JWT sem hit no DB. Para roles clínicas isso **muda**: `requireClinic` (ou um novo `requireClinicalRole`) revalida `papel` no DB. Decisão técnica na ADR 0010. Sem essa revalidação, **não liberar Fase 4.2**. |

## 9. Gates obrigatórios para abrir Sprint 4.2 (prontuário/atendimento v0.1)

Cumulativos com os 13 critérios das ADRs 0001 e 0008 §8. Esta ADR adiciona:

1. **ADR 0009 (esta) aceita.** ✅ (após este commit).
2. **Matriz de permissões aprovada** — `docs/clinical-architecture-and-permissions.md`
   §2 (criada nesta sprint) revisada pelo dono.
3. **Modelo de audit de leitura definido** — §6 desta ADR + detalhamento no
   `docs/clinical-architecture-and-permissions.md`.
4. **Tenant isolation revisado** — confirmação documental de que toda
   migration futura clínica filtrará `clinica_id` em todo DAO (princípio
   §3.1).
5. **Decisão sobre roles documentada** — §4 desta ADR. Implementação técnica
   das roles fica para sprint própria **antes** ou **no início** da 4.2
   (ADR 0010 decide).
6. **Impacto no backup/AWS revisado** — §10 desta ADR.
7. **Riscos LGPD documentados** — §7 desta ADR. Validação jurídica externa
   **iniciada** (não exige conclusão para começar 4.2 com dados sintéticos;
   exige conclusão para dado real).
8. **Escopo do prontuário v0.1 definido em alto nível** — ADR 0010 declara
   entidades, campos do v0.1, fora-do-v0.1, permissões, audit de leitura,
   threat model do módulo, plano de migração CSV/XLSX → entidade clínica.
9. **Sem regressão na base administrativa** — todas as invariantes da
   `docs/security-notes.md` continuam em vigor. ADR 0010 declara como
   preserva.

Bloqueios adicionais (espelham ADR 0001/0008):

10. Base administrativa em produção com governança da Fase 3 concluída —
    **bloqueio relaxado**: a 4.2 pode rodar em staging/local com dados
    sintéticos antes da Fase 3 fechar. Dado real **exige** Fase 3 fechada.
11. Backup/restore validado de ponta a ponta — staging ok; produção real
    depende da retomada da trilha AWS (§10).

## 10. Impacto na trilha AWS (pausada)

A trilha AWS (Sprints 3.41B+) continua **pausada estrategicamente** (ADR 0008
§6 — não cancelada). Esta ADR registra os impactos clínicos esperados que
exigem reavaliação **antes** de retomar:

| Componente AWS | Impacto clínico esperado | Quando reavaliar |
|---|---|---|
| **RDS PostgreSQL** | Storage e classe podem mudar — prontuário gera volume textual maior que cadastro; audit de leitura clínica gera **muitas** linhas. Sugestão inicial: revisar `db.t3.micro` quando estimar volume de audit. | Antes de provisionar RDS de produção |
| **EBS / armazenamento de anexos** | Anexo clínico futuro (4.2/4.3) muda dimensionamento de EBS. Sugestão: migrar anexos para S3 com signed URL antes de produção (não EBS bruto). | Antes da Fase 4.2 entregar anexo |
| **KMS** | Hoje `MFA_ENCRYPTION_KEY` pode usar fallback de `JWT_SECRET` (Sprint 3.39). Para campos clínicos cifrados em coluna (se a ADR 0010 decidir cifra a nível de coluna), exige **KMS CMK dedicada**, não fallback. Rotação afeta dados existentes — planejar em ADR. | Antes da Fase 4.2 implementar cifra clínica |
| **Backup** | Cifra em repouso já existe (Restic). Retenção clínica (CFM ~20 anos) **não** se aplica a snapshot operacional — confundir os dois é erro. Snapshot operacional = recuperação de desastre (semanas/meses); arquivamento legal = anos/décadas (sistema separado, fora do escopo de produção mínima). | Antes de prometer retenção legal |
| **Logs / CloudWatch** | Logs de aplicação clínica precisam reforçar redação (princípio §3.2). Filtros em CloudWatch para garantir que stack trace clínico não vaze conteúdo. | Antes de Fase 4.2 entregar |
| **Security Groups / VPC** | Sem mudança conceitual — Postgres/Redis continuam fechados da internet. | Sem ação adicional |
| **Region / LGPD** | Bucket S3 e RDS preferencialmente **`sa-east-1` (São Paulo)** para reduzir risco LGPD de transferência internacional. Confirmar com jurídico. | Antes de provisionar |

**Gate consolidado para retomar AWS:** ADR 0009 (esta) aceita + reavaliação
acima registrada na próxima abertura do `docs/aws-infra-sprint-3.41-plan.md`
+ ADR 0010 (prontuário v0.1) definindo cifra/storage clínico.

## 11. Vocabulário, compatibilidade e migração de papéis

- A ADR 0008 §2.8 já estabeleceu vocabulário de produto ("sistema de gestão
  de clínicas com migração inteligente"). Esta ADR não muda.
- A Sprint 3.24.1 introduziu o vocabulário visível "funcionário(a) (acesso
  administrativo)" sobre a role técnica `secretaria`. Essa **decisão
  consciente** permanece: trocar o nome técnico para `funcionario_administrativo`
  exige migration + refactor de `users.papel` + `clinic_join_requests.requested_role`
  + auditoria histórica + JWT — fica para sprint dedicada antes ou no início
  da 4.2 (ADR 0010 decide).
- Roles novas (`gestor_clinica`, `profissional_clinico`, `financeiro`)
  precisam de decisão técnica sobre **uma coluna vs. tabela de papéis** —
  fica para ADR 0010.
- **Pessoa pode ter mais de uma role**: o dono que também atende é
  `dono_clinica` + `profissional_clinico`. O modelo técnico precisa
  comportar isso (sugestão: array de papéis ou tabela `user_roles`).

## 12. Itens explicitamente fora do escopo desta ADR

- **Implementar qualquer tabela/migration/endpoint clínico.** Esta ADR só
  decide arquitetura conceitual.
- **Implementar roles granulares no banco.** Fica para sprint dedicada
  decidida na ADR 0010.
- **Implementar audit de leitura.** Schema conceitual definido aqui; tabela
  real fica para a ADR 0010.
- **Criar AWS real, rodar AWS CLI, criar secrets, bucket, IAM.** Trilha
  pausada (ADR 0008 §6).
- **Alterar `docker-compose.yml`, Nginx, infra local.** Sem mudança.
- **Implementar prontuário, documentos médicos, financeiro, relatórios,
  convênios, estoque.** Cada um exige ADR própria (0010+).
- **Telemedicina, ICP-Brasil/prescrição eletrônica válida, IA clínica
  assistiva, TISS/TUSS real, SNGPC/ANVISA.** Continuam fora — ADR 0008.
- **Cópia de UI/textos de Feegow ou concorrentes.** Continua vedada — ADR
  0008 §2.9.
- **Política completa de break-glass para `admin_sistema`.** §4.6 declara
  intenção; ADR própria futura define mecanismo.
- **Fluxo de consentimento/termo do paciente para dado clínico.** ADR 0010
  modela; implementação fica para sprint própria.

## 13. Decisão de design — por que esta ADR é só conceitual

Tentar entregar simultaneamente (a) modelo conceitual completo, (b) migration
de roles + audit de leitura, e (c) implementação do prontuário v0.1 numa
única sprint **violaria** o princípio §11 da ADR 0008 ("Over-engineering por
antecipação"). Esta ADR é deliberadamente **só docs/conceitual** para:

1. Permitir revisão e iteração do modelo **antes** de schema/código.
2. Manter cada sprint focada (decidir vs. implementar).
3. Preservar a invariante "sem código clínico sem ADR aceita".
4. Dar tempo para validação jurídica iniciar em paralelo com a ADR 0010.

A próxima ADR clínica (0010, prontuário v0.1) **traz** decisões técnicas:
schema PostgreSQL vs. prefixo, coluna `papel` array vs. tabela
`user_roles`, audit `audit_logs` único vs. tabela paralela, cifra a nível
de coluna vs. cifra do schema.

## 14. Notas finais

- Esta ADR **não afirma conformidade jurídica completa com LGPD, CFM,
  ICP-Brasil ou TISS.** Conformidades específicas dependerão das ADRs e
  validações futuras (princípio §6 da ADR 0008).
- Esta ADR **não autoriza código.** Sprint 4.2 começa apenas após ADR 0010
  aprovada, que por sua vez exige esta ADR aceita.
- Esta ADR **mantém todas as invariantes vigentes** em
  `docs/security-notes.md`. "Escopo clínico proibido sem ADR de Fase 4.x"
  permanece — só sai com ADR de módulo (0010+) aprovada.
