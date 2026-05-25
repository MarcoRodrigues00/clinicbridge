# ClinicBridge — Arquitetura clínica e matriz de permissões

> Companheiro operacional da **ADR 0009**
> (`docs/adr/0009-clinical-architecture-roles-read-audit.md`). A ADR estabelece
> direção e princípios; este documento traz **matrizes, catálogos e
> checklists** consultáveis pelas próximas ADRs (0010 prontuário, 0011
> documentos médicos, 0012 financeiro, 0013 relatórios, 0014 convênios,
> 0015 estoque).
>
> **Sprint 4.1 — docs/ADR-only.** Nada aqui autoriza código. Implementação
> técnica de roles, audit de leitura, schema clínico fica para a ADR 0010
> (início da Fase 4.2).
>
> **Relacionado:** ADR 0008, ADR 0001, ADR 0007, `docs/security-notes.md`,
> `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`.

---

## 1. Domínios do Clinic OS — visão consolidada

| Domínio | Natureza | Sprint/ADR | Estado |
|---|---|---|---|
| Cadastro de paciente (administrativo) | Administrativo | Existe (3.22) | ✅ implementado |
| Agenda administrativa | Administrativo | Existe (3.14/3.15) | ✅ implementado |
| Equipe (membros + profissionais da agenda) | Administrativo | Existe (3.24–3.31) | ✅ implementado |
| Importação CSV/XLSX + sessões + recibo | Administrativo (diferencial) | Existe (até 2.x + 3.x) | ✅ implementado |
| Export (read-only, CPF mascarado) | Administrativo | Existe | ✅ implementado |
| Merge B-safe de duplicados | Administrativo | Existe (3.32–3.35; ADR 0007) | ✅ implementado |
| Auditoria de escrita administrativa | Administrativo | Existe | ✅ implementado |
| **Roles granulares (gestor, profissional, financeiro)** | Habilitador | 4.1 conceitual (esta ADR) → 4.2 ADR 0010 implementa | ⏳ docs-only |
| **Audit de leitura clínica** | Habilitador | 4.1 conceitual → 4.2 ADR 0010 implementa | ⏳ docs-only |
| **Prontuário / atendimento v0.1** | Clínico | 4.2 (ADR 0010) | ⏳ planejado |
| **Documentos médicos / receitas v0.1** | Clínico (risco regulatório) | 4.3 (ADR 0011) | ⏳ planejado |
| **Financeiro v0.1** | Operacional | 4.4 (ADR 0012) | ⏳ planejado |
| **Relatórios gerenciais v0.1** | Operacional | 4.5 (ADR 0013) | ⏳ planejado |
| **Convênios / faturamento básico v0.1** | Operacional+ | 4.6 (ADR 0014) | ⏳ planejado |
| **Estoque básico v0.1** | Operacional | 4.7 (ADR 0015) | ⏳ planejado |

---

## 2. Matriz de permissões conceitual

> Cada célula descreve o que a role **pode fazer no domínio**. Defesa real
> é sempre no backend (`requireAuth` + `requireClinic` + `requireRole` ou
> equivalente clínico). A UI esconde o que a role não pode fazer.
>
> Legenda:
> - ✅ = permitido
> - 👁️ = leitura (com audit, quando aplicável)
> - ✏️ = leitura + escrita
> - ❌ = bloqueado
> - 🚧 = a definir pela ADR do módulo (a marcação aqui é sugestão; ADR pode mudar)
> - 📊 = leitura de metadados/agregado (sem conteúdo clínico)

| Domínio | `dono_clinica` | `gestor_clinica` | `profissional_clinico` | `funcionario_administrativo` (≡ `secretaria` atual) | `financeiro` | `admin_sistema` |
|---|---|---|---|---|---|---|
| **Cadastro administrativo do paciente** (listar, criar, editar, arquivar/restaurar) | ✏️ + arquivar/restaurar | ✏️ + arquivar/restaurar | ✏️ (criar/editar; arquivar 🚧) | ✏️ (criar/editar; arquivar ❌) | 👁️ (sem CPF bruto) | ❌ (rotas tenant-scoped) |
| **Merge B-safe de duplicados** (ADR 0007) | ✅ | ✅ | ❌ (administrativo, mas pode misturar histórico clínico — fica owner-side; revisar na ADR 0010) | ❌ (já é assim hoje) | ❌ | ❌ |
| **Agenda administrativa** (listar, criar, alterar status, remarcar) | ✏️ | ✏️ | ✏️ (próprios agendamentos no mínimo; sobre clínica 🚧) | ✏️ (todos da clínica — é assim hoje) | 👁️ (para faturamento) | ❌ |
| **Equipe — membros com login** (listar, desativar acesso) | ✏️ | ✏️ (sem desativar dono) | ❌ | ❌ | ❌ | ❌ |
| **Equipe — profissionais da agenda** (cadastro administrativo) | ✏️ | ✏️ | 👁️ (vê o seletor) | 👁️ (vê o seletor) | 👁️ | ❌ |
| **Convite de funcionário(a) + regenerar invite code** | ✅ | ✅ (🚧 ADR 0010 confirma) | ❌ | ❌ | ❌ | ❌ |
| **Aprovar/recusar solicitações de entrada** | ✅ | ✅ (🚧 ADR 0010 confirma) | ❌ | ❌ | ❌ | ❌ |
| **Prontuário / atendimento (4.2)** — listar, abrir, criar, evoluir | ✏️ + audit leitura | 👁️ + audit leitura (sem criar/editar) | ✏️ + audit leitura | 📊 (metadados — paciente, profissional, data; **sem** queixa/evolução) | ❌ | ❌ |
| **Documentos médicos / receitas (4.3)** — emitir, ler, cancelar | ✏️ + audit leitura | 👁️ + audit leitura | ✏️ + audit leitura | 📊 (existência, status — sem conteúdo) | ❌ | ❌ |
| **Financeiro (4.4)** — contas, fluxo de caixa | ✏️ | ✏️ | ❌ | ❌ | ✏️ | ❌ |
| **Relatórios gerenciais (4.5)** — operacionais, agenda, atendimentos | ✏️ | ✏️ | 👁️ (apenas escopo próprio 🚧) | 👁️ (relatórios estritamente administrativos) | 👁️ (relatórios financeiros) | ❌ |
| **Relatórios gerenciais (4.5)** — com dado clínico (CID, queixa) | ✏️ + audit leitura | ✏️ + audit leitura | 👁️ + audit leitura | ❌ | ❌ | ❌ |
| **Convênios / faturamento básico (4.6)** | ✏️ | ✏️ | 👁️ (consulta de procedimento) | 👁️ | ✏️ | ❌ |
| **Estoque básico (4.7)** | ✏️ | ✏️ | 👁️ (consumo no atendimento, manual) | 👁️ | 👁️ | ❌ |
| **Importação CSV/XLSX** (administrativa) — upload, preview, validar, criar sessão, dry-run | ✏️ | ✏️ | ❌ | ✏️ (já hoje) | ❌ | ❌ |
| **Importação CSV/XLSX** — `mark-ready`, `import` (executar) | ✅ (já hoje) | ✅ (🚧 ADR 0010 confirma) | ❌ | ❌ | ❌ | ❌ |
| **Importação CSV/XLSX** — clínica (prontuário/receita/exame) | 🚧 ADR 0010+ | 🚧 | 🚧 (provavelmente único caminho válido) | ❌ | ❌ | ❌ |
| **Exportação administrativa** (CPF mascarado, sem formula injection) | ✅ (já hoje) | ✅ (🚧 ADR 0010 confirma) | ❌ | ❌ | ❌ | ❌ |
| **Exportação clínica** | 🚧 (fora do v0.1 dos módulos; quando entrar, owner + audit + limite) | 🚧 | 🚧 | ❌ | ❌ | ❌ |
| **Auditoria — leitura de logs administrativos** | 🚧 (UI futura — Fase 4 administrativa) | 🚧 | ❌ | ❌ | ❌ | ✅ (sem PII) |
| **Auditoria — leitura de logs clínicos (audit de leitura)** | 🚧 | 🚧 | ❌ | ❌ | ❌ | ❌ (exceto via break-glass — ADR futura) |
| **Configuração da clínica** (nome, contatos, branding administrativo) | ✏️ | ✏️ | ❌ | ❌ | ❌ | ❌ |
| **Plataforma / cross-tenant** (suporte técnico, configuração de infra) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (sem dado clínico) |

**Notas sobre a matriz:**

1. `funcionario_administrativo` é o **sucessor conceitual** de `secretaria`.
   O nome técnico no DB/JWT continua `secretaria` até a ADR 0010 decidir
   migração — vide ADR 0009 §11.
2. `admin_sistema` continua **bloqueado** das rotas tenant-scoped por
   `requireClinic`. A coluna acima vale como princípio, não como
   implementação atual (que só conhece `dono_clinica`/`secretaria`/`admin_sistema`).
3. Células 🚧 são intencionalmente abertas — a ADR do módulo correspondente
   precisa decidir. Esta tabela é **ponto de partida**, não fechamento.
4. Roles podem coexistir em um mesmo usuário (ex.: dono que também atende é
   `dono_clinica` + `profissional_clinico`). Modelo técnico de
   combinabilidade fica para a ADR 0010.

---

## 3. Catálogo conceitual de eventos de audit

### 3.1 Audit de escrita (já existe)

Padrão atual em `audit_logs`. Colunas: `acao`, `recurso`, `recurso_id`,
`usuario_id`, `clinica_id`, `ip`, `user_agent`, `request_id`, `criado_em`.
**Não tem `metadata` nem `entidade_tipo`** (`docs/security-notes.md`).

Eventos administrativos atuais (referência, não exaustiva):
`auth.*`, `patient.create.success`, `patient.update.success`,
`patient.archive.success`, `patient.restore.success`, `patient.merge.success`,
`appointment.*`, `clinic_professional.*`, `clinic.join_request.*`,
`clinic.member.*`, `clinic.invite_code.regenerated.success`,
`import_file.*`, `import_session.*`.

### 3.2 Audit de leitura clínica (NOVO — conceitual, sem implementação)

Padrão sugerido para eventos clínicos:

| `acao` | Quando emitir | `recurso` | `recurso_id` |
|---|---|---|---|
| `clinical.encounter.read` | Abrir atendimento individual | `encounter` | UUID do atendimento |
| `clinical.encounter.list` | Listar atendimentos de um paciente com conteúdo (queixa/evolução visível) | `encounter` | UUID do paciente |
| `clinical.note.read` | Ler nota/evolução individual | `note` | UUID da nota |
| `clinical.note.list` | Listar notas de um atendimento | `note` | UUID do atendimento |
| `clinical.document.read` | Ler documento médico (atestado, receita administrativa) | `document` | UUID do documento |
| `clinical.document.list` | Listar documentos de um paciente | `document` | UUID do paciente |
| `clinical.document.export` | Baixar/imprimir documento médico | `document` | UUID do documento |
| `clinical.attachment.read` | Abrir anexo clínico (PDF/imagem) — quando existir | `attachment` | UUID do anexo |
| `clinical.report.generated` | Gerar relatório com dado clínico (4.5) | `report` | identificador do relatório |
| `clinical.report.exported` | Exportar relatório com dado clínico (4.5) | `report` | identificador do relatório |

**Campos extras necessários** (vs. `audit_logs` atual):

- `papel` no momento da leitura — anti-stale.
- `paciente_id` — **identificador interno pseudonimizado** (UUID) do paciente
  cujo dado clínico foi acessado. Necessário para rastreabilidade, audit de
  leitura e transparência LGPD ao titular (saber quem acessou seu
  prontuário). É **dado pessoal** dentro do sistema (pseudonimizado, não
  anonimizado) e deve ser tratado como tal — acesso restrito por role,
  jamais exposto em logs de aplicação fora da tabela de audit, em URL
  pública, em mensagem de erro ou em export sem necessidade. Nunca
  acompanhado de nome, CPF, telefone, e-mail ou conteúdo clínico bruto no
  mesmo registro de audit (princípio invariante — vide ADR 0009 §3.2 e
  §6.2).

**Decisão de schema** (extensão de `audit_logs` vs. tabela paralela
`clinical_read_audit`): fica para a **ADR 0010**.

### 3.3 Eventos administrativos que NÃO geram audit de leitura

- Listagem paginada de pacientes (cadastro administrativo).
- Listagem de duplicados (administrativa, CPF mascarado).
- Listagem de agenda do dia (administrativa).
- Listagem de profissionais ativos (administrativo).
- Listagem de membros da equipe (administrativo).
- Recibos de importação (administrativos).

> Critério: se o conteúdo lido **não inclui dado clínico**, segue o padrão
> atual (sem audit de leitura).

---

## 4. Estratégia de versionamento clínico (conceitual)

Princípios obrigatórios em qualquer entidade clínica editável. Modelo
técnico fica para ADR 0010.

### 4.1 Notas / evolução

- **Edição não-destrutiva.** Cada edição cria nova **versão** com
  `previous_version_id` referenciando a anterior. Versão anterior **nunca**
  é mutada nem apagada.
- **Cancelamento ≠ delete.** Cancelar uma nota cria um registro de
  cancelamento (`canceled_at`, `canceled_by_user_id`, `cancellation_reason`
  opcional) — a nota original permanece consultável com flag de cancelada.
- **Sem delete físico.** Princípio invariante (ADR 0008 §4 / ADR 0009 §3.4).

### 4.2 Documentos médicos (atestados, declarações, receitas administrativas)

- **Versionamento + cancelamento** análogos a §4.1.
- **Imutabilidade do PDF** uma vez gerado: regenerar produz nova versão; o
  PDF original permanece consultável. Decisão técnica (rerenderizar
  vs. armazenar PDF) fica para ADR 0011.

### 4.3 Prescrição administrativa

- Sem assinatura ICP-Brasil neste v0.x (ADR 0008 §4.8 / ADR 0001 §7).
- Versionamento + cancelamento + audit completo de leitura.

### 4.4 Atendimento / encontro

- **Status transicional**: agendado → confirmado → realizado → cancelado.
  Cancelar não apaga; usa o mesmo padrão da agenda atual.
- **Vínculo ao paciente é imutável** após criação? Decisão da ADR 0010
  (provável: imutável; correção via cancelamento + novo atendimento).

### 4.5 Anexos clínicos (quando existirem)

- Storage privado (não público).
- Versionamento por substituição → nova versão; original preservado.
- Signed URL **obrigatório** para download (não path direto).
- Validação de magic bytes (extensão do padrão atual de upload).
- Antivírus/sandbox/DLP **bloqueante** (sobe de P3 para P1 antes de anexo
  clínico — vide ADR 0009 §8 risco #9).

---

## 5. LGPD clínica — princípios operacionais

> Detalhe e justificativa: ADR 0009 §7. Esta seção lista o que cada ADR de
> módulo precisa **declarar**.

1. **Base legal declarada** para o tratamento do dado naquele módulo
   (LGPD art. 11 — tutela da saúde, exercício regular de direito, etc.).
2. **Finalidade específica** — não vale "tratamento de dados clínicos em
   geral"; cada módulo declara para quê.
3. **Minimização de campos** — cada campo precisa de justificativa de uso
   pelo módulo. Campo opcional desnecessário **não** entra.
4. **Retenção declarada** — prazo mínimo de retenção, política de limpeza
   futura, validação jurídica externa pendente. Não prometer prazo.
5. **Direitos do titular** — design do schema permite atender futuro
   acesso/portabilidade/eliminação (ex.: `clinical_read_audit` carrega
   `paciente_id` para transparência).
6. **Logs sem conteúdo clínico** — princípio reforçado a cada ADR.
7. **Sem export clínico no v0.1 dos módulos clínicos** — quando entrar,
   exige ADR própria.
8. **Anonimização vs. pseudonimização** — fora do escopo até existir
   demanda real (relatórios gerenciais 4.5 v0.1 não fazem analytics
   identificado fora do tenant).
9. **Transferência internacional** — bucket S3 e RDS preferencialmente
   `sa-east-1`. Confirmar com jurídico.

---

## 6. Threat model clínico — checklist por ADR de módulo

Reproduz a tabela da ADR 0009 §8, formatada como checklist que cada ADR
clínica (0010+) precisa preencher:

- [ ] Como o módulo garante tenant isolation (`clinica_id` em todo DAO).
- [ ] Como `funcionario_administrativo` é bloqueado do conteúdo clínico
  (endpoint que retorna conteúdo clínico exige `requireRole` clínico).
- [ ] Como `admin_sistema` continua bloqueado (`requireClinic`).
- [ ] Como relatórios financeiros que cruzam dado clínico filtram no SQL
  (não no controller).
- [ ] Export clínico — habilitado? owner-only? audit? limites?
- [ ] Logs do módulo — lista exata de campos redigidos no `logger`.
- [ ] Impacto no merge B-safe (ADR 0007) — o módulo cria entidades que
  precisam de proveniência no merge? **Default: histórico clínico do
  secundário fica separado com `merged_into_id`, não é misturado ao
  histórico do principal.** Confirmar na ADR.
- [ ] Backup — cifra atual cobre? dimensionamento muda?
- [ ] Anexos clínicos — signed URL? antivírus? quarentena?
- [ ] Revalidação de `papel` no DB — o módulo introduz role nova? Se sim,
  `requireClinic` (ou middleware dedicado) revalida `papel` na request.

---

## 7. Gates de abertura da Sprint 4.2 — checklist

Cumulativo com ADRs 0001 §"Critérios para abrir uma fase clínica" e 0008 §8.

- [ ] ADR 0009 aceita (item 1 do §9 da ADR 0009).
- [ ] Matriz de permissões (§2 deste documento) revisada pelo dono.
- [ ] Catálogo de audit de leitura (§3.2) revisado.
- [ ] Princípios de versionamento (§4) revisados.
- [ ] Princípios LGPD clínica (§5) declarados.
- [ ] Threat model (§6) consultado pela ADR 0010.
- [ ] Decisão sobre roles documentada (ADR 0009 §4).
- [ ] Impacto no backup/AWS revisado (ADR 0009 §10).
- [ ] Escopo do prontuário v0.1 definido em alto nível (ADR 0010 abre
  declarando isso — entidades, campos, fora do v0.1, permissões,
  audit, threat model, plano de migração CSV/XLSX → clínico).
- [ ] Sem regressão nas invariantes administrativas (`docs/security-notes.md`).
- [ ] Trilha AWS reavaliada (não retomada — só reavaliada).
- [ ] Validação jurídica externa **iniciada** (não exige conclusão para
  rodar 4.2 com dados sintéticos; exige conclusão para dado real em
  produção).

---

## 8. Convenções de nomenclatura sugeridas

A ADR 0010 decide. Sugestões para discussão:

- **Tabelas clínicas:** prefixo `clinical_` (ex.: `clinical_encounters`,
  `clinical_notes`, `clinical_documents`, `clinical_attachments`,
  `clinical_read_audit`).
- **Schema PostgreSQL:** opção alternativa — schema `clinical` separado de
  `public`. Trade-off entre clareza visual e overhead de migration/grant.
- **Audit de leitura:** tabela `clinical_read_audit` (paralela ao
  `audit_logs`) facilita particionamento por mês e limpeza futura sem
  tocar o `audit_logs` administrativo (que tem regras próprias — ADR 0002).
- **Cifra a nível de coluna:** usar `pgcrypto` em colunas declaradas
  sensíveis (ex.: queixa/evolução). KMS dedicada (CMK) para a chave. Decisão
  na ADR 0010 considerando dimensionamento RDS/EBS.

---

## 9. Itens explicitamente fora do escopo deste documento

- Schema técnico das tabelas clínicas (vai para ADR 0010+).
- Implementação de roles (vai para ADR 0010 ou sprint dedicada).
- Implementação de audit de leitura (vai para ADR 0010).
- Validação jurídica de bases legais LGPD (depende de profissional externo).
- Política completa de break-glass para `admin_sistema` (ADR própria futura).
- Política de retenção legal clínica (CFM/jurídico).
- Telemedicina, ICP-Brasil, IA clínica assistiva, TISS real, SNGPC/ANVISA
  (ADR 0008 + ADRs próprias futuras).
- Cópia de UI/textos de Feegow ou concorrentes (ADR 0008 §2.9 — vedada).

---

## 10. Referências

- `docs/adr/0009-clinical-architecture-roles-read-audit.md` (esta sprint)
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- `docs/adr/0007-safe-patient-duplicate-resolution.md`
- `docs/adr/0006-administrative-scheduling-module.md`
- `docs/adr/0002-data-retention-governance.md`
- `docs/adr/0001-product-direction-option-c.md`
- `docs/product-clinic-os-roadmap.md`
- `docs/security-notes.md`
- `docs/roadmap-next-phase.md`
- `docs/production-minimum-plan.md`
- `docs/aws-infra-sprint-3.41-plan.md` (pausado)
- `docs/aws-provisioning-runbook-3.41B.md` (pausado)
