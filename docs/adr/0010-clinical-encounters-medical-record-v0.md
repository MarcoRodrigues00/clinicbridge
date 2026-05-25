# ADR 0010 — Prontuário/Atendimento clínico v0.1 (escopo do módulo, sem implementação)

- **Status:** Accepted
- **Data:** 2026-05-25
- **Decisores:** dono do produto (ClinicBridge)
- **Sprint:** 4.2A (docs/ADR-only — sem código, sem migration, sem AWS)
- **Habilitada por:** ADR 0009 (arquitetura clínica + roles + audit de leitura + LGPD clínica). Esta ADR consome os 9 gates da ADR 0009 §9 e o checklist de
  `docs/clinical-architecture-and-permissions.md` §7.
- **Pré-requisitos cumpridos pelas ADRs anteriores:** ADR 0001 (Opção C), ADR 0007
  (merge B-safe), ADR 0008 (Clinic OS modular), ADR 0009 (arquitetura clínica
  conceitual). Esta ADR **não substitui** nem afrouxa nenhuma invariante anterior.
- **Relacionado:** `docs/clinical-encounters-v0-scope.md` (companheiro operacional
  desta ADR), `docs/clinical-architecture-and-permissions.md`,
  `docs/security-notes.md`, `docs/project-state.md`,
  `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`,
  `docs/aws-provisioning-runbook-3.41B.md` (pausado).
- **Sprint seguinte:** **4.2B** — implementação backend (migrations, DAOs,
  services, controllers, rotas, middlewares de role clínica, audit de leitura
  técnico, testes). Esta ADR autoriza a abertura da 4.2B; a 4.2B **só** começa
  depois desta ADR aceita pelo dono.

---

## 1. Contexto

A Sprint 4.1 (ADR 0009) entregou a arquitetura clínica **conceitual**: roles
granulares (`dono_clinica`, `gestor_clinica`, `profissional_clinico`,
`funcionario_administrativo`, `financeiro`, `admin_sistema`), separação
administrativo vs. clínico, audit de leitura clínica, versionamento,
LGPD clínica (art. 11), threat model com 10 vetores e gates obrigatórios para
abrir a 4.2. **Nenhum schema/migration/endpoint clínico existe ainda.**

Esta ADR (Sprint 4.2A) é o **primeiro módulo clínico** do Clinic OS e exige a
decisão **fim-a-fim** do escopo do prontuário v0.1 antes que qualquer código
seja escrito (Sprint 4.2B). Decisões pendentes da ADR 0009 que esta ADR fecha:

- **Schema clínico:** prefixo de tabela vs. schema PostgreSQL separado.
- **Implementação de roles** (`profissional_clinico`, `gestor_clinica`):
  coluna em `users.papel` vs. tabela paralela vs. array.
- **Schema do audit de leitura:** extensão de `audit_logs` vs. tabela paralela
  `clinical_read_audit`.
- **Cifra a nível de coluna** vs. apenas cifra de bloco (RDS at-rest) + controles
  de aplicação.
- **Política de visibilidade** profissional vê só os próprios vs. clínica
  inteira.
- **Política de edição** dono/gestor podem editar prontuário de outro
  profissional.

O ClinicBridge **não está pronto para produção** (ressalvas P1 em
`docs/security-notes.md`) e **não** tem dado clínico real. A 4.2B
implementará o v0.1 em **staging com dados sintéticos** — produção real
exige Fase 3 fechada + validação jurídica externa concluída + retomada da
trilha AWS.

## 2. Decisão — resumo dos compromissos

Esta ADR registra 12 compromissos arquiteturais. Detalhe nas seções seguintes.

1. **Escopo conservador:** v0.1 entrega **atendimento + notas textuais
   versionadas** ligadas a paciente administrativo. Sem CID, prescrição,
   exames, anexos, IA, ICP-Brasil.
2. **Três tabelas novas:** `clinical_encounters` (atendimento — identidade
   estável), `clinical_encounter_notes` (notas append-only com revisão),
   `clinical_read_audit` (audit de leitura paralelo).
3. **Roles novas em tabela própria:** `user_clinical_roles` —
   append-only, suporta multi-role (ex.: dono que também atende), mantém
   `users.papel` retrocompatível.
4. **Prefixo `clinical_` no schema `public`** (não schema separado por agora).
5. **Notas append-only com retificação por revisão** — não há `UPDATE`
   destrutivo em conteúdo de nota. Edição = nova linha apontando para a
   anterior.
6. **Encounter tem dois estados:** `active` e `canceled`. Cancelamento
   exige `cancel_reason_code`. Sem `UPDATE` no encounter exceto via
   cancelamento, conclusão (`ended_at`) e troca de status.
7. **Audit de leitura em tabela paralela** `clinical_read_audit` —
   permite particionamento futuro e política de retenção distinta da
   administrativa. Carrega `paciente_id` pseudonimizado conforme ADR 0009
   §6.2.
8. **Visibilidade default — "profissional só vê os próprios"** (ADR 0009
   §4.3). Dono/gestor leem qualquer atendimento da clínica **com audit**;
   **não editam nem cancelam** atendimento de outro profissional no v0.1
   (responsabilidade médico-legal preserva o autor).
9. **`funcionario_administrativo` e `financeiro` NÃO acessam endpoints
   clínicos no v0.1.** Usam a agenda administrativa que já existe. Sem
   "timeline reduzida" no v0.1 (decisão consciente — evita superfície
   nova; pode ser reaberto em sprint futura).
10. **`admin_sistema` bloqueado** por `requireClinic` (sem exceção;
    break-glass fora do v0.1, exige ADR própria — ADR 0009 §4.6).
11. **Cifra a nível de coluna NÃO entra no v0.1.** Confia em RDS
    encryption at rest + TLS in transit + controles de aplicação + audit
    de leitura. Decisão consciente, **revisável** antes de dado clínico
    real em produção. Detalhe em §13.
12. **Merge B-safe (ADR 0007) é o gate de criação**: encounter **não pode**
    ser criado para paciente com `merged_into_id IS NOT NULL` ou
    `status='archived'`. Histórico clínico do secundário (quando existir)
    permanece **separado** com `merged_into_id` — sem mistura automática.
    Detalhe em §10.

Esta ADR **não autoriza dado clínico real em produção** — só staging
com dados sintéticos depois da 4.2B implementar.

## 3. Escopo v0.1 — o que está dentro

### 3.1 Atendimento (`clinical_encounter`)

- **Vínculo a paciente administrativo obrigatório** (`patient_id`, FK a
  `patients`, tenant-scoped).
- **Vínculo opcional a agendamento** (`appointment_id`, FK a `appointments`,
  tenant-scoped) — walk-in/atendimento não agendado é permitido.
- **Profissional autor obrigatório** (`attending_user_id`, FK a `users`).
  Esse usuário precisa ter o papel `profissional_clinico` no momento da
  criação (validado por DB check + middleware).
- **Vínculo opcional a profissional da agenda** (`professional_id`, FK a
  `clinic_professionals`). Quando o profissional clínico também tem cadastro
  em `clinic_professionals` (caso comum), o link é preenchido. Mantém
  consistência com a agenda.
- **Data/hora do atendimento** (`started_at` obrigatório; `ended_at` opcional).
- **Status simples** (`active` | `canceled`). Cancelamento exige razão
  estruturada (§9).
- **Sem unique constraint anti-overlap** — o profissional pode (em casos
  excepcionais) ter dois encounters simultâneos; sobreposição não bloqueia
  no v0.1, igual à agenda atual.

### 3.2 Notas clínicas (`clinical_encounter_notes`)

Cada nota pertence a um encounter. Múltiplas notas por encounter são
permitidas (ex.: anotações progressivas durante consulta longa). Cada nota
contém os **5 campos textuais permitidos no v0.1**:

| Campo | Tipo | Limite | Visibilidade |
|---|---|---|---|
| `chief_complaint` (queixa principal) | text NULL | 2 000 chars | profissional autor + dono + gestor |
| `anamnesis` (anamnese / história) | text NULL | 8 000 chars | profissional autor + dono + gestor |
| `evolution` (evolução / observações) | text NULL | 8 000 chars | profissional autor + dono + gestor |
| `plan` (conduta / orientações) | text NULL | 4 000 chars | profissional autor + dono + gestor |
| `internal_note` (observação interna clínica) | text NULL | 2 000 chars | profissional autor + dono + gestor — **nunca** funcionario_administrativo nem financeiro nem admin_sistema |

> **Todos os 5 campos são opcionais individualmente**, mas pelo menos um
> deve estar preenchido para a nota ser criada (validação no service).

> **Nomes em inglês** seguem a convenção do código existente
> (`administrative_notes`, `created_at`, etc.). Vocabulário visível ao
> usuário fica em português (UI traduz). Decisão consciente para manter
> consistência com o schema atual; ADR 0009 §8 sugere prefixo `clinical_`
> nas tabelas, o que esta ADR adota.

### 3.3 Linha do tempo por paciente

- Endpoint `GET /patients/:id/clinical-timeline` retorna lista cronológica
  de encounters do paciente, **com metadados apenas** na lista (data,
  profissional, status, primeira linha da queixa? — não; só metadados).
  Conteúdo das notas só vem em `GET /clinical/encounters/:id`.
- Paginação por cursor de `started_at` (sem paginação backend complexa no
  v0.1; ordenação `DESC`).

### 3.4 Retificação / cancelamento

- **Edição de nota = nova linha** (`clinical_encounter_notes`) com
  `revises_note_id` apontando para a anterior + `rectification_reason_code`
  preenchido. **Sem `UPDATE` destrutivo no conteúdo.**
- **Cancelamento de encounter** = update do status para `canceled` +
  `canceled_at` + `canceled_by_user_id` + `cancel_reason_code`. **Notas
  permanecem visíveis** (auditoria médico-legal). Não há `restore`
  no v0.1 (decisão conservadora — restore exigiria ADR).
- **Sem delete físico** em nenhuma das duas tabelas. Invariante.

### 3.5 Roles clínicas

- Nova tabela `user_clinical_roles` (§6.4). Roles aceitas no v0.1:
  `profissional_clinico` e `gestor_clinica`. `financeiro` fica
  documentado mas **não é implementado nesta sprint** (será na 4.4).
- `dono_clinica` continua em `users.papel` (não muda). O dono ganha
  automaticamente capacidade de ler/gerir (a matriz §7 trata `dono_clinica`
  como gestor implícito para fins clínicos).
- Para o dono que **também atende**, o owner concede a ele mesmo a role
  `profissional_clinico` via `user_clinical_roles` (endpoint coberto na
  4.2B; UI fica para sprint própria).

## 4. Fora de escopo do v0.1 — explícito

Estes itens **não entram** nesta sprint nem na 4.2B. Cada um exige ADR
própria ou sprint futura conforme indicado.

| Item | Onde fica |
|---|---|
| **CID estruturado** (códigos CID-10/11, hipótese diagnóstica selecionável) | Fase futura sem número (depois de 4.2 madura) |
| **Prescrição / receita estruturada** | ADR 0011 (Fase 4.3 — documentos médicos v0.1) — só receita administrativa, sem ICP-Brasil |
| **Solicitação de exames** | Fase futura sem número |
| **Resultados de exames estruturados** | Fase futura sem número |
| **Anexos clínicos / upload** (PDF, imagem) | Fase futura — exige antivírus/sandbox/DLP bloqueante, signed URL, KMS dedicada (ADR 0009 §8 risco #9) |
| **Assinatura digital ICP-Brasil** | Fase futura sem número (depois de 4.3 madura) |
| **Telemedicina** (vídeo/áudio síncrono) | Fora do Clinic OS por ADR 0008 §2.1 |
| **IA clínica assistiva** (sugestão de evolução, resumo, alertas, transcrição) | Fase futura sem número (depois de 4.2 madura + dado real validado) |
| **Medicamentos controlados (SNGPC/ANVISA)** | Fora — ADR 0008 §3 |
| **TISS/TUSS real** | Fora — ADR 0008 §3 |
| **Compartilhamento externo com paciente / portal do paciente** | Fora do Clinic OS atualmente; exige ADR própria |
| **CID/exames livres em texto da evolução** | **Permitido como texto livre** (não estruturado) na `evolution` — esta ADR não bloqueia o profissional de escrever "CID provisório R10" no campo de evolução; bloqueia **apenas** estrutura/campo dedicado. Logger redige conforme §8.4. |
| **Restore de encounter cancelado** | Fora do v0.1; reabrir = novo encounter |
| **Edição de encounter alheio por dono/gestor** | Fora do v0.1 — preserva responsabilidade médico-legal |
| **Cancelamento de encounter alheio por dono/gestor** | Fora do v0.1 — só o autor cancela seu próprio |
| **Funcionário administrativo / financeiro lerem timeline clínica** | Fora do v0.1 — usam agenda administrativa |
| **Listar encounters de outro tenant (cross-tenant)** | **Proibido — invariante** (tenant isolation, ADR 0009 §3.1) |
| **`admin_sistema` lendo dado clínico** | Fora — break-glass exige ADR própria (ADR 0009 §4.6) |
| **Importação CSV/XLSX de prontuário** (migração de sistema antigo) | Fora do v0.1; previsto pela ADR 0008 §4.10 / ADR 0009 §3.10, mas exige sprint própria com validações específicas |
| **Notificação ao paciente** (e-mail/SMS/WhatsApp de "atendimento criado") | Fora — manual-first é a regra atual (ADR 0006) |
| **Estatística agregada / dashboards clínicos** | Fora — depende de Fase 4.5 (relatórios) |
| **Export clínico** | Fora do v0.1 — quando entrar, exige ADR própria (ADR 0009 §7.3) |
| **Cópia de UI/textos de Feegow ou concorrentes** | Vedada por ADR 0008 §2.9 |

## 5. Modelo de dados conceitual

> **Sem migration nesta sprint.** Esta seção é a **especificação** que a
> 4.2B implementará. Convenção de timestamp da migration:
> `20260602000000_clinical_encounters_v0.ts` (ou similar — a 4.2B decide o
> dia exato). Convenção de nomes segue o padrão observado em
> `backend/migrations/`.

### 5.1 Tabela `clinical_encounters`

```text
clinical_encounters
  id                       uuid PK                      gen_random_uuid()
  clinica_id               uuid NOT NULL                FK clinics(id) ON DELETE CASCADE
  patient_id               uuid NOT NULL                FK patients(id) ON DELETE RESTRICT  (preserva histórico médico-legal; arquivar paciente continua permitido)
  attending_user_id        uuid NOT NULL                FK users(id)    ON DELETE RESTRICT  (preserva autor)
  professional_id          uuid NULL                    FK clinic_professionals(id) ON DELETE SET NULL
  appointment_id           uuid NULL                    FK appointments(id) ON DELETE SET NULL
  started_at               timestamptz NOT NULL
  ended_at                 timestamptz NULL
  status                   text NOT NULL DEFAULT 'active'   CHECK status IN ('active','canceled')
  canceled_at              timestamptz NULL
  canceled_by_user_id      uuid NULL                    FK users(id) ON DELETE SET NULL
  cancel_reason_code       text NULL                    CHECK em ('duplicated','wrong_patient','data_error','other')
  created_at               timestamptz NOT NULL DEFAULT now()
  updated_at               timestamptz NOT NULL DEFAULT now()

  CHECK (ended_at IS NULL OR ended_at >= started_at)
  CHECK (status='canceled' -> canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL AND cancel_reason_code IS NOT NULL)
  CHECK (status='active'   -> canceled_at IS NULL AND canceled_by_user_id IS NULL AND cancel_reason_code IS NULL)

Indexes:
  idx_clinical_encounters_clinica_patient_started     (clinica_id, patient_id, started_at DESC)
  idx_clinical_encounters_clinica_user_started        (clinica_id, attending_user_id, started_at DESC)
  idx_clinical_encounters_clinica_appointment         (clinica_id, appointment_id)  WHERE appointment_id IS NOT NULL
```

**Notas de design:**
- `ON DELETE RESTRICT` em `patient_id` e `attending_user_id`: histórico
  médico-legal exige preservar o vínculo. Arquivar paciente (status archived)
  ou desativar usuário **continua** funcionando — apenas o `DELETE` físico
  fica bloqueado (e delete físico já é proibido por invariante).
- `professional_id` é uma referência redundante à agenda — útil para join
  rápido com `clinic_professionals.name` em telas de timeline. `SET NULL`
  reflete que profissionais da agenda podem ser desativados.
- **Sem coluna de texto clínico** aqui — toda nota vai em
  `clinical_encounter_notes`. O encounter é só identidade + metadados.

### 5.2 Tabela `clinical_encounter_notes`

```text
clinical_encounter_notes
  id                       uuid PK                      gen_random_uuid()
  clinica_id               uuid NOT NULL                FK clinics(id) ON DELETE CASCADE  (denormalizado para tenant filter direto)
  encounter_id             uuid NOT NULL                FK clinical_encounters(id) ON DELETE RESTRICT  (histórico médico-legal)
  author_user_id           uuid NOT NULL                FK users(id) ON DELETE RESTRICT
  chief_complaint          text NULL                    CHECK length <= 2000
  anamnesis                text NULL                    CHECK length <= 8000
  evolution                text NULL                    CHECK length <= 8000
  plan                     text NULL                    CHECK length <= 4000
  internal_note            text NULL                    CHECK length <= 2000
  revises_note_id          uuid NULL                    FK clinical_encounter_notes(id) ON DELETE SET NULL
  rectification_reason_code text NULL                   CHECK em ('typo','clinical_correction','add_info','other')
  created_at               timestamptz NOT NULL DEFAULT now()

  CHECK (
    chief_complaint IS NOT NULL
    OR anamnesis IS NOT NULL
    OR evolution IS NOT NULL
    OR plan IS NOT NULL
    OR internal_note IS NOT NULL
  )
  CHECK (revises_note_id IS NULL = rectification_reason_code IS NULL)

Indexes:
  idx_clinical_encounter_notes_encounter        (encounter_id, created_at)
  idx_clinical_encounter_notes_clinica_author   (clinica_id, author_user_id)
  idx_clinical_encounter_notes_revises_partial  (revises_note_id)  WHERE revises_note_id IS NOT NULL
```

**Notas de design:**
- **Sem `UPDATE` no DAO** para esta tabela — apenas `INSERT`. Append-only
  estrito (princípio de auditoria médico-legal).
- `revises_note_id` aponta para a nota imediatamente anterior na cadeia
  (não para a primeira). Para reconstruir a cadeia, navega-se recursivamente
  (queries simples no v0.1; CTE recursiva se virar gargalo — não previsto).
- Ordenação cronológica natural por `created_at`; tie-break por `id`.
- **Cancelamento de nota individual** não existe. Para "cancelar" o
  conteúdo, cria-se uma nova nota com `rectification_reason_code='clinical_correction'`
  ou similar substituindo o texto. A cadeia preserva o original.

### 5.3 Tabela `clinical_read_audit`

Decisão da ADR 0009 §6.2 fechada nesta ADR: **tabela paralela**, não
extensão de `audit_logs`. Justificativa:
- volume esperado distinto (leituras clínicas geram muito mais linhas que
  audits administrativos);
- política de retenção potencialmente distinta (clínico pode exigir CFM
  ~20 anos; administrativo pode ser menor);
- particionamento por mês futuro mais limpo;
- separação semântica para queries de transparência LGPD (paciente
  perguntando "quem leu meu prontuário").

```text
clinical_read_audit
  id                       uuid PK                      gen_random_uuid()
  clinica_id               uuid NOT NULL                (tenant filter — sem FK para preservar audit se clínica for hard-deleted, espelha audit_logs com SET NULL atual)
  usuario_id               uuid NULL                    (quem leu; SET NULL se user deletado — preserva evidência)
  papel_at_read            text NOT NULL                (snapshot do papel no momento — 'dono_clinica' | 'gestor_clinica' | 'profissional_clinico' | ...)
  acao                     text NOT NULL                CHECK starts with 'clinical.'
  recurso                  text NOT NULL                CHECK em ('encounter','note','timeline','document','report','attachment')
  recurso_id               uuid NULL                    (UUID do recurso lido — encounter, note, etc.)
  paciente_id              uuid NULL                    (UUID pseudonimizado do paciente — vide ADR 0009 §6.2; obrigatório quando aplicável)
  request_id               text NULL
  ip                       inet NULL
  user_agent               text NULL
  criado_em                timestamptz NOT NULL DEFAULT now()

Indexes:
  idx_clinical_read_audit_clinica_criado          (clinica_id, criado_em DESC)
  idx_clinical_read_audit_paciente_criado         (paciente_id, criado_em DESC) WHERE paciente_id IS NOT NULL
  idx_clinical_read_audit_clinica_usuario_criado  (clinica_id, usuario_id, criado_em DESC)
```

**Notas:**
- **Append-only no DAO.** Sem `UPDATE` nem `DELETE`. Espelha `auditLogDao`.
- **Sem FK em `clinica_id`/`usuario_id`** — segue o padrão atual de
  `audit_logs` (SET NULL na lógica do schema atual via FK; aqui mantemos
  sem FK para simplicidade e preservação histórica; a 4.2B decide se
  introduz FK com `ON DELETE SET NULL` ou mantém sem FK como
  `audit_logs`. Recomendação: **espelhar exatamente o padrão de
  `audit_logs`** para consistência).
- `papel_at_read` é **string snapshot** do papel efetivo no momento da
  leitura — anti-stale (princípio ADR 0009 §6.2).
- `paciente_id` é o **identificador pseudonimizado** descrito na ADR 0009
  §6.2 — dado pessoal pseudonimizado, acesso restrito, nunca acompanhado
  de PII bruta, jamais em logs de aplicação fora desta tabela.
- **Conteúdo lido NUNCA é armazenado** — sem snippets, sem queixa, sem
  CID, sem nome de medicamento.

### 5.4 Tabela `user_clinical_roles`

Decisão da ADR 0009 §4 fechada nesta ADR: **tabela paralela append-only
com revogação**. Justificativa:
- `users.papel` continua intocado (retrocompatibilidade total com auth/JWT
  atual);
- suporta multi-role natural (`dono_clinica` + `profissional_clinico`);
- audit-friendly (concessão e revogação registradas);
- escala para `gestor_clinica`, `financeiro` (futuro) sem refactor.

```text
user_clinical_roles
  id                       uuid PK                      gen_random_uuid()
  user_id                  uuid NOT NULL                FK users(id) ON DELETE CASCADE
  clinica_id               uuid NOT NULL                FK clinics(id) ON DELETE CASCADE
  role                     text NOT NULL                CHECK em ('profissional_clinico','gestor_clinica')   -- 'financeiro' fica para 4.4
  granted_by_user_id       uuid NULL                    FK users(id) ON DELETE SET NULL
  granted_at               timestamptz NOT NULL DEFAULT now()
  revoked_at               timestamptz NULL
  revoked_by_user_id       uuid NULL                    FK users(id) ON DELETE SET NULL

Indexes:
  idx_user_clinical_roles_user_clinica         (user_id, clinica_id)
  idx_user_clinical_roles_active_partial       (user_id, clinica_id, role) WHERE revoked_at IS NULL
  unique_user_clinical_roles_active_partial    UNIQUE (user_id, clinica_id, role) WHERE revoked_at IS NULL
```

**Notas:**
- Unique parcial garante **uma concessão ativa por (user, clinica, role)**;
  revogar + reconceder cria duas linhas (histórico preservado).
- Concessão e revogação são **owner-only** (`requireRole(CLINIC_ADMIN_ROLES)`).
  Endpoint específico fica para a 4.2B; pode ser via UI ou via SQL/seed na
  primeira rodada de staging.
- **Sem coluna `granted_to_email/nome`** — só UUIDs.
- O usuário precisa pertencer à mesma clínica (`users.clinica_id = clinica_id`) —
  validação no service.

### 5.5 O que NÃO muda no schema atual

Esta ADR **não altera**:
- `users` (papel, ativo, clinica_id) — sem coluna nova, sem migration.
- `patients` — sem campo clínico.
- `appointments` — sem campo clínico (continua só administrativo).
- `audit_logs` — sem coluna nova.
- `clinic_professionals` — sem campo clínico.

Migrations da 4.2B são **estritamente aditivas** (4 tabelas novas + índices).

## 6. Permissões — modelo técnico

### 6.1 Onde a defesa acontece

- **`requireAuth`** — usuário autenticado.
- **`requireClinic`** — tenant + revalidação `users.ativo=true` e
  `users.clinica_id` (mantém invariante da Sprint 3.25).
- **`requireRole`** — papel administrativo (`dono_clinica`) onde aplicável.
- **`requireClinicalRole`** (novo na 4.2B) — middleware que consulta
  `user_clinical_roles` (com cache de request) e bloqueia se a role
  necessária não estiver ativa.

A camada de **service** aplica regras finas: "profissional só vê os
próprios" é uma cláusula `WHERE attending_user_id = req.auth.usuario_id`
no DAO, **não** uma checagem no controller (defesa em profundidade).

### 6.2 Hierarquia de capacidade (resumo)

- **Capacidade administrativa total da clínica:** `dono_clinica`.
- **Capacidade administrativa amplia leitura clínica:** `gestor_clinica`
  (granted) — vê tudo da clínica com audit, sem editar/cancelar atendimento
  alheio.
- **Capacidade de criar/editar prontuário:** `profissional_clinico` (granted)
  — só os próprios.
- **Sem acesso a conteúdo clínico:** `funcionario_administrativo`
  (`secretaria` técnica), `financeiro`, `admin_sistema`.

### 6.3 Combinabilidade

O dono que também atende é `dono_clinica` (em `users.papel`) +
`profissional_clinico` (em `user_clinical_roles`). O sistema **soma**
capacidades. Não há rebaixamento (o dono não vira "só profissional"
quando atende — continua sendo dono).

## 7. Matriz de permissões — operação × role

Cumulativa com `docs/clinical-architecture-and-permissions.md` §2. Esta
tabela é **autoritativa para o v0.1 do Prontuário**.

Legenda: ✅ permitido · ✅* permitido com cláusula "só os próprios" no DAO
· 📊 metadados (sem conteúdo clínico) · ❌ bloqueado · ⚠️ auditado

| Operação | dono_clinica | gestor_clinica | profissional_clinico | funcionario_admin (≡ secretaria) | financeiro | admin_sistema |
|---|---|---|---|---|---|---|
| Criar encounter (`POST /clinical/encounters`) | ❌ (a menos que tenha role `profissional_clinico` também) | ❌ | ✅ (`attending_user_id` = self) | ❌ | ❌ | ❌ |
| Cancelar encounter próprio (`PATCH .../cancel`) | ✅* (se autor) | ✅* (se autor) | ✅* | ❌ | ❌ | ❌ |
| Cancelar encounter alheio | ❌ (v0.1) | ❌ (v0.1) | ❌ | ❌ | ❌ | ❌ |
| Adicionar nota a encounter próprio (`POST .../notes`) | ✅* (se autor) | ✅* (se autor) | ✅* | ❌ | ❌ | ❌ |
| Adicionar nota a encounter alheio | ❌ (v0.1) | ❌ (v0.1) | ❌ | ❌ | ❌ | ❌ |
| Listar encounters da clínica (`GET /clinical/encounters`) | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ (filtra `attending_user_id=self`) | ❌ | ❌ | ❌ |
| Ler encounter (`GET /clinical/encounters/:id`) — com notas | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ (só se autor) | ❌ | ❌ | ❌ |
| Ler `internal_note` da nota | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ (só se autor) | ❌ (nunca) | ❌ (nunca) | ❌ (nunca) |
| Timeline do paciente (`GET /patients/:id/clinical-timeline`) | ✅ + ⚠️ | ✅ + ⚠️ | ✅* + ⚠️ (só os encounters próprios — paciente pode ter atendido com outro profissional, esses **não** aparecem para esta role) | ❌ | ❌ | ❌ |
| Conceder/revogar `user_clinical_roles` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cross-tenant (qualquer) | ❌ 404 genérico | ❌ 404 | ❌ 404 | ❌ | ❌ | ❌ |

**Notas explícitas:**

1. **"profissional só vê os próprios"** — implementado como cláusula `WHERE
   attending_user_id = :self` em **todos** os SELECTs do
   `clinicalEncounterDao` quando `papel` clínico = `profissional_clinico`
   sem ser `dono_clinica`/`gestor_clinica` simultaneamente. Defesa real
   no DAO, não no controller.
2. **`gestor_clinica` vê tudo + audit, mas não edita.** O gestor é um leitor
   gerencial; edição de prontuário é privilégio do autor.
3. **`dono_clinica` por si só não cria encounter.** Para o owner atender,
   precisa também ter `profissional_clinico` em `user_clinical_roles`. Isso
   força clareza de responsabilidade médico-legal.
4. **`funcionario_administrativo` não tem timeline clínica.** Continua
   usando a agenda administrativa atual (`/appointments`).
5. **`financeiro`** — role declarada na ADR 0009 §4 mas **não implementada**
   nesta sprint nem na 4.2B. Entra na Fase 4.4 (ADR 0012).
6. **`admin_sistema`** — bloqueado por `requireClinic`. Sem exceção no v0.1.
   Break-glass exige ADR própria (ADR 0009 §4.6).

## 8. Auditoria — escrita e leitura

### 8.1 Audit de escrita (estende `audit_logs` existente)

Sem migration. Reusa o schema atual de `audit_logs` (princípio ADR 0009
§3.2 — `audit_logs` permanece append-only e inalterado).

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `clinical.encounter.created.success` | encounter criado | `clinical_encounter` | UUID do encounter |
| `clinical.encounter.canceled.success` | encounter cancelado | `clinical_encounter` | UUID do encounter |
| `clinical.encounter.note.created.success` | nota criada (sem `revises_note_id`) | `clinical_encounter_note` | UUID da nota |
| `clinical.encounter.note.rectified.success` | nota criada com `revises_note_id` | `clinical_encounter_note` | UUID da nova nota (a anterior fica no campo `revises_note_id`, **não** no audit) |
| `clinical.role.granted.success` | concessão de `profissional_clinico`/`gestor_clinica` | `user_clinical_role` | UUID do registro |
| `clinical.role.revoked.success` | revogação | `user_clinical_role` | UUID do registro |

**Regras invariantes:**
- Sem PII em `audit_logs` — só UUIDs. Sem nome de paciente, sem CPF, sem
  conteúdo da nota, sem `cancel_reason_code` (texto livre fica fora do
  audit), sem `rectification_reason_code` (idem; o motivo categorizado vive
  na tabela `clinical_encounter_notes` que carrega seu próprio histórico).
- Falha de audit aborta a transação (mesmo padrão da ADR 0007 — merge B-safe).

### 8.2 Audit de leitura (tabela nova `clinical_read_audit`)

| `acao` | Quando emitir | `recurso` | `recurso_id` | `paciente_id` |
|---|---|---|---|---|
| `clinical.encounter.read` | `GET /clinical/encounters/:id` | `encounter` | UUID do encounter | UUID do paciente |
| `clinical.encounter.list` | `GET /clinical/encounters` (com qualquer filtro que retorne lista) | `encounter` | NULL (lista) | NULL (lista pode cruzar pacientes; consulta agregada não singulariza) |
| `clinical.timeline.list` | `GET /patients/:id/clinical-timeline` | `timeline` | UUID do paciente (= patient_id) | UUID do paciente |

**Regras invariantes:**
- Audit de leitura emitido **antes** da resposta sair. Comportamento
  controlado pela config `CLINICAL_READ_AUDIT_STRICT` (vide §8.2.1):
  - **`false` (best-effort)** — falha de audit é logada com nível
    `error` no application logger mas **não bloqueia** a resposta.
    Aceitável **apenas** em local/dev/staging com **dados sintéticos**.
  - **`true` (strict / fail-closed)** — falha de audit **bloqueia** a
    resposta. O endpoint retorna **500 `clinical_read_audit_unavailable`**
    (mensagem genérica, sem detalhe interno, sem conteúdo clínico, sem
    PII) e a transação que possa ter sido aberta é revertida. Conteúdo
    clínico **nunca** é retornado ao cliente quando o audit não
    conseguiu persistir. **Obrigatório** antes de qualquer produção com
    dado clínico real.
- **Sem conteúdo lido** — `clinical_read_audit` carrega só identificadores.
- **`paciente_id` pseudonimizado** — vide ADR 0009 §6.2 (reformulado pela
  Sprint 4.1.1): identificador interno pseudonimizado, dado pessoal,
  acesso restrito.

### 8.2.1 `CLINICAL_READ_AUDIT_STRICT` — gating de produção clínica

A Sprint 4.2B introduz a variável de ambiente `CLINICAL_READ_AUDIT_STRICT`
em `backend/src/config/env.ts` (segue o padrão das demais env vars do
projeto). Comportamento:

- **`NODE_ENV != 'production'`** → default `false` (best-effort).
  Permite desenvolvimento e staging com dados sintéticos sem quebrar
  por bug de logging.
- **`NODE_ENV == 'production'`** → guard de boot **força `true`** quando
  o módulo clínico estiver carregado. Boot **falha** se o valor estiver
  setado como `false` em produção (mensagem clara orientando para
  ativar o strict mode). Mesmo padrão da Sprint 3.39 com
  `MFA_ENCRYPTION_KEY`/`FRONTEND_ORIGIN`.
- Em strict mode, a leitura de conteúdo clínico (`GET /clinical/encounters/:id`,
  `GET /clinical/encounters`, `GET /patients/:id/clinical-timeline`)
  **só responde 2xx** após `clinical_read_audit` persistir com sucesso.
  Falha → **500 `clinical_read_audit_unavailable`** + log nível
  `error` (sem PII, sem `paciente_id`, sem stack ecoado ao cliente).

**Por que essa decisão muda a postura "best-effort" para a 4.2B:**
o audit de leitura é o **controle compensatório principal** da ausência
de cifra a nível de coluna (§13) e da política de visibilidade
(profissional vê só os próprios). Sem audit, perde-se rastreabilidade
LGPD e detecção retrospectiva de acesso indevido. Produção com dado
clínico real sem audit íntegro **viola** o princípio da ADR 0009 §3.6
("audit de leitura obrigatório").

**Implementação técnica sugerida (4.2B decide o detalhe final):**
- *Padrão simples (recomendado v0.1):* gravar `clinical_read_audit`
  **antes** do `SELECT` que retorna conteúdo clínico (mesma transação
  quando possível) ou imediatamente após, em transação dedicada que
  o controller só commita se o audit gravou. Em caso de falha no
  strict mode, retornar 500 e nunca devolver o body com conteúdo.
- *Padrão alternativo:* gravar o audit **antes** da query principal
  rodar; se falhar, abortar antes de tocar o conteúdo clínico. Tem
  custo de uma escrita "especulativa" caso a query principal devolva
  404, mas garante atomicidade simples.
- A 4.2B documenta o padrão escolhido no PR; ambos satisfazem a
  invariante "conteúdo clínico não sai sem audit persistido".

### 8.3 Listagem genérica não auditada

Listagens estritamente administrativas (sem conteúdo clínico) **não**
geram audit de leitura clínica. Confirmação:
- `GET /patients` (cadastro) — sem audit.
- `GET /patients/duplicates` — sem audit.
- `GET /appointments` (agenda administrativa) — sem audit.
- `GET /clinic-members`, `GET /clinic-professionals` — sem audit.

Critério (ADR 0009 §6.1 confirmado): se a resposta **não inclui** dado
clínico, segue o padrão atual.

### 8.4 Logger de aplicação — campos clínicos sensíveis

O `logger` atual (em `backend/src/utils/logger.ts` ou similar) já redige
`authorization|cookie|password|senha|cpf|token`. A 4.2B **estende** a
lista de termos redigidos para incluir:

```
chief_complaint, anamnesis, evolution, plan, internal_note,
cancel_reason_text, rectification_reason_text
```

E adiciona um princípio explícito: **payload de body de endpoints
`/clinical/*` nunca é logado integralmente** — só metadados (status code,
duração, request_id, usuario_id, papel).

## 9. Versionamento, retificação e cancelamento

### 9.1 Edição de nota = retificação

- Service `clinicalEncounterNoteService.rectify(noteId, newFields, reason)`:
  1. valida que `reason_code` ∈ `('typo','clinical_correction','add_info','other')`;
  2. valida que o autor da nova nota é o autor da nota original (no v0.1
     — preserva autoria);
  3. insere nova linha em `clinical_encounter_notes` com `revises_note_id =
     noteId` e os campos novos;
  4. emite audit `clinical.encounter.note.rectified.success`.
- **A nota anterior permanece intacta.** UI da fase futura mostra cadeia
  cronológica + flag "retificada por nota Y".

### 9.2 Cancelamento de encounter

- Service `clinicalEncounterService.cancel(encounterId, reason_code, reason_text?)`:
  1. valida `reason_code` ∈ `('duplicated','wrong_patient','data_error','other')`;
  2. valida que o autor (`attending_user_id`) é o usuário atual;
  3. `UPDATE` do encounter para `status='canceled'`, `canceled_at=now()`,
     `canceled_by_user_id=self`, `cancel_reason_code=:reason_code`;
  4. **`reason_text` é OPCIONAL e LIMITADO a 200 chars; nunca PII; armazenado
     na linha do encounter em coluna separada `cancel_reason_text` (text NULL,
     length <= 200)** — completar a especificação da §5.1 com esta coluna;
  5. emite audit `clinical.encounter.canceled.success` (sem `reason_text` no audit).
- Notas existentes **permanecem** visíveis (histórico médico-legal).
- **Sem restore.**

> **Ajuste de modelo §5.1:** acrescentar coluna `cancel_reason_text text
> NULL CHECK length<=200` ao schema de `clinical_encounters`. Esta coluna
> permite o profissional registrar contexto curto, **mas nunca PII**;
> validação no service. A 4.2B implementa.

### 9.3 Sem delete físico — invariante

- `clinical_encounters` — sem `DELETE` no DAO.
- `clinical_encounter_notes` — sem `DELETE` no DAO.
- `clinical_read_audit` — sem `DELETE` no DAO (append-only).
- `user_clinical_roles` — sem `DELETE` no DAO (revogação via `revoked_at`).

## 10. Impacto do merge B-safe (ADR 0007)

### 10.1 Regras de criação

Encounter **não pode** ser criado quando o paciente:
- está com `status='archived'` (já era invariante administrativa);
- tem `merged_into_id IS NOT NULL` (mesclado em outro).

**Erro:** 404 genérico `patient_not_found` (anti-enumeração, mesmo padrão
da ADR 0007).

### 10.2 Histórico clínico de paciente mesclado

Quando dado clínico existir (depois da 4.2B), o histórico do **paciente
secundário** (arquivado pelo merge) **não se mistura** com o histórico do
**paciente principal**. Encounters criados sob `patient_id = secundário`
permanecem com esse `patient_id` original — mesmo que o secundário esteja
arquivado e marcado `merged_into_id = principal`.

**Default sugerido pela ADR 0009 §8 risco #7 e confirmado aqui.**

### 10.3 Exibição na timeline

A timeline `GET /patients/:id/clinical-timeline` é **estritamente do
`patient_id` consultado**:
- se consultada com o ID do principal → mostra apenas encounters criados
  sob o principal;
- se consultada com o ID do secundário → mostra os encounters do secundário
  (que foi mesclado), mas a UI da fase futura deve avisar "paciente
  mesclado em X" (consome `patients.merged_into_id` já existente).

**No v0.1 não há merge de timeline nem agregação cross-patient.** Se o
profissional precisar de visão consolidada, abre cada timeline separada.

### 10.4 Merge B-safe pode mover encounters?

**NÃO no v0.1.** A ADR 0007 atual move apenas `appointments`, não
`clinical_encounters`. A questão "merge B-safe deve passar a mover
encounters também?" exige **ADR de extensão** da 0007 + análise de
responsabilidade médico-legal (mover atendimento de um paciente para outro
é eticamente sensível). Esta ADR registra a pergunta e **deixa fora do
v0.1**.

## 11. Endpoints conceituais

Convenção: prefixo `/clinical/` para endpoints clínicos novos.
`patient_id` na URL para a timeline (consistente com padrões REST). Todos
exigem `requireAuth` + `requireClinic`. Permissões por endpoint:

### 11.1 `POST /clinical/encounters` — criar atendimento

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole('profissional_clinico')`.
- **Body:** `{ patient_id: uuid, appointment_id?: uuid, professional_id?: uuid, started_at: ISO, ended_at?: ISO, initial_note?: { chief_complaint?, anamnesis?, evolution?, plan?, internal_note? } }`.
- **Regras:** patient_id ativo e não-mesclado (§10.1); appointment_id
  opcional mas se presente deve pertencer ao paciente e à clínica;
  professional_id opcional mas se presente deve estar ativo na clínica;
  pelo menos um campo da nota inicial se `initial_note` presente.
- **Response 201:** `{ encounter: {...}, initial_note?: {...} }` (sem
  `attending_user_id` precisar ser repetido — service injeta `req.auth.usuario_id`).
- **Audit escrita:** `clinical.encounter.created.success` + (se nota inicial)
  `clinical.encounter.note.created.success`.
- **Audit leitura:** N/A (criação).
- **Erros:** 400 `clinical_encounter_invalid` (validações), 404
  `patient_not_found` (paciente arquivado/mesclado/outra clínica), 403
  `forbidden_role` (sem `profissional_clinico`), 401.

### 11.2 `GET /clinical/encounters` — listar

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono passa por estar no allowlist de leitura — decisão técnica: `requireClinicalRole` aceita também `dono_clinica` direto via `users.papel`).
- **Query params:** `patient_id?`, `professional_id?` (= `attending_user_id`), `status?`, `from?` (ISO), `to?` (ISO), `cursor?`, `limit?` (default 50, max 200).
- **DAO impõe** `WHERE attending_user_id = self` se papel = `profissional_clinico` sem ser `dono_clinica`/`gestor_clinica`.
- **Response 200:** lista de encounters com metadados (sem conteúdo das notas). Inclui contagem de notas e timestamp da última nota (para timeline).
- **Audit leitura:** `clinical.encounter.list` (recurso_id NULL, paciente_id NULL — lista).
- **Erros:** 400 `clinical_list_invalid` (param inválido), 403, 401.

### 11.3 `GET /clinical/encounters/:id` — ler atendimento + notas

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono ok).
- **Service:** retorna 404 genérico se `attending_user_id != self` e papel == `profissional_clinico` (sem ser dono/gestor) — anti-enumeração.
- **Response 200:** `{ encounter: {...}, notes: [...com revises_note_id e cadeia ordenada cronologicamente...] }`. Inclui `internal_note` **apenas** se o leitor é dono/gestor/autor; caso contrário a chave é omitida (defesa real: o DAO filtra a coluna com base na role efetiva).
- **Audit leitura:** `clinical.encounter.read` (recurso_id = encounterId, paciente_id = encounter.patient_id).
- **Erros:** 404 `encounter_not_found`, 403, 401.

### 11.4 `PATCH /clinical/encounters/:id/cancel` — cancelar atendimento próprio

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole('profissional_clinico')`.
- **Body:** `{ reason_code: 'duplicated'|'wrong_patient'|'data_error'|'other', reason_text?: string }`.
- **Regra:** `attending_user_id == self` no CAS do `UPDATE`. Mismatch → 404 (anti-enumeração).
- **Response 200:** `{ encounter: {...status:'canceled'...} }`.
- **Audit escrita:** `clinical.encounter.canceled.success`.
- **Erros:** 400 `clinical_cancel_invalid`, 404, 403, 401.

### 11.5 `POST /clinical/encounters/:id/notes` — adicionar/retificar nota

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole('profissional_clinico')`.
- **Body:** `{ chief_complaint?, anamnesis?, evolution?, plan?, internal_note?, revises_note_id?: uuid, rectification_reason_code?: ... }`.
- **Regras:** `attending_user_id == self` (e `author_user_id == self` na nota); pelo menos um campo de texto; se `revises_note_id` presente, deve pertencer ao mesmo encounter, deve ter `author_user_id == self` (autor preserva autoria), e `rectification_reason_code` deve estar preenchido.
- **Response 201:** `{ note: {...} }`.
- **Audit escrita:** `clinical.encounter.note.created.success` ou `.rectified.success`.
- **Erros:** 400, 404, 403, 401.

### 11.6 `GET /patients/:id/clinical-timeline` — timeline do paciente

- **Middleware:** `requireAuth` → `requireClinic` → `requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono ok).
- **Service:** profissional vê só os atendimentos próprios desse paciente; dono/gestor veem todos.
- **Response 200:** lista de encounters (metadados) ordenada `started_at DESC`.
- **Audit leitura:** `clinical.timeline.list` (recurso_id = patient_id, paciente_id = patient_id).
- **Erros:** 404 (paciente outra clínica/inexistente), 403, 401.

### 11.7 Endpoints administrativos auxiliares (4.2B opcional)

Para conceder/revogar `profissional_clinico` e `gestor_clinica` —
necessários para staging. A 4.2B decide se vira endpoint REST ou apenas
script de seed. Recomendação: **endpoint REST owner-only** desde a 4.2B,
para evitar acoplamento a SQL manual em staging.

- `POST /clinical/roles/grant` — `{ user_id, role }` (owner-only).
- `POST /clinical/roles/revoke` — `{ user_id, role }` (owner-only).
- Audit: `clinical.role.granted.success` / `clinical.role.revoked.success`.

UI de gestão dessas roles fica para **sprint própria depois da 4.2B** —
no início é via API/curl/seed em staging.

## 12. Validações e regras de negócio (cheat-sheet)

| Regra | Onde | Erro |
|---|---|---|
| `patient_id` ativo + não-mesclado | service | 404 `patient_not_found` |
| `patient_id` mesma clínica | DAO (filtro tenant) | 404 |
| `appointment_id` mesmo paciente + mesma clínica | service | 400 `clinical_encounter_invalid` |
| `professional_id` ativo + mesma clínica | service | 400 |
| `attending_user_id == auth.usuario_id` no INSERT | service (não confiar no body) | 400 |
| Usuário tem `profissional_clinico` ativo em `user_clinical_roles` | middleware `requireClinicalRole` | 403 `forbidden_role` |
| `started_at` razoável (sem futuro distante; sem passado < 5 anos) | service | 400 |
| `ended_at >= started_at` se presente | DB CHECK + service | 400 |
| Pelo menos um campo na nota | DB CHECK + service | 400 |
| `revises_note_id` pertence ao mesmo encounter | service | 400 |
| `revises_note_id.author_user_id == self` (autor preserva) | service | 400 |
| Cancel: `attending_user_id == self` no `UPDATE` (CAS) | DAO | 404 (silent rollback) |
| `cancel_reason_text` ≤ 200 chars, sem PII (validação textual leve) | service | 400 |
| `rectification_reason_text` ≤ 200 chars (se existir) | service | 400 |
| Cross-tenant em qualquer recurso | DAO (filtro tenant em TODA query) | 404 genérico |

**Rate limit:** reusa `patientsRateLimit` (IP-keyed, antes do auth) para
GETs leves. Para escritas (`POST /clinical/encounters`, `POST .../notes`,
`PATCH .../cancel`), considerar **rate limit dedicado** com `<SCOPE>` =
`CLINICAL_WRITE_*` (a 4.2B decide; padrão da Sprint 3.2).

**Validação anti-PII textual:** o service **não tenta** detectar
automaticamente CPF/telefone/e-mail nos campos clínicos — texto livre por
definição pode conter dados sensíveis e a UI já tem aviso anti-clínico/
anti-PII contextual. Heurísticas falsam-positivam em texto médico legítimo
("paciente refere CPF dor"). Aviso na UI + treinamento operacional é a
postura do v0.1.

## 13. Cifra / KMS — decisão aberta documentada

**Pendente da ADR 0009 §10:** "cifra a nível de coluna com KMS dedicada
vs. apenas cifra de bloco RDS + controles de aplicação".

### 13.1 Decisão do v0.1

**Cifra a nível de coluna NÃO entra no v0.1.** O prontuário v0.1 será
protegido por:
1. **RDS encryption at rest** (cifra de bloco — habilitada quando RDS for
   provisionada; gate na trilha AWS pausada);
2. **TLS in transit** (já existe — Nginx + cert);
3. **Controles de aplicação** — `requireAuth` + `requireClinic` +
   `requireClinicalRole` + tenant filter em todo DAO + audit de leitura;
4. **Audit de leitura completo** — habilita detecção retrospectiva de
   acesso indevido;
5. **Logger redigindo campos clínicos** (§8.4) — defesa em profundidade
   contra leak via stack trace.

### 13.2 Justificativa

- Cifra a nível de coluna adiciona complexidade significativa:
  - queries não podem usar `ILIKE` ou índice GIN sobre texto cifrado
    sem schemes especiais (deterministic vs. randomized — trade-offs
    distintos);
  - backup/restore precisa preservar chave;
  - rotação de chave reescreve todos os registros;
  - `pgcrypto` é solução pragmática mas vincula a chave ao app (perda
    da chave = perda dos dados).
- O v0.1 **não tem dado clínico real** ainda. Implementar cifra a nível
  de coluna agora otimiza para um cenário que **só existe em staging**.
- Anexos clínicos (fase futura) **provavelmente exigirão** cifra de
  storage dedicada (KMS); essa decisão é separada e cabe na ADR de anexos.

### 13.3 Decisão revisável

Esta decisão **é explicitamente revisável** antes de dado clínico real em
produção. Gates de revisão:
- Validação jurídica externa concluída (LGPD art. 11 — base legal e
  retenção).
- Volume estimado de prontuário (impacto em RDS storage class).
- Existência ou não de anexo clínico (que pode promover KMS dedicada).

Se a revisão concluir que cifra de coluna é necessária, abrir **sprint
dedicada antes da 4.2 ir para produção** com:
- escolha de scheme (deterministic para CPF-like — não aplicável aqui;
  randomized para texto clínico — provável);
- KMS CMK dedicada (não usar fallback `JWT_SECRET`);
- migração dos campos existentes em staging;
- atualização do DAO + indexação adaptada.

## 14. Vocabulário e nomenclatura

- **Tabelas:** prefixo `clinical_` (em `public` schema). `user_clinical_roles`
  segue a convenção atual (`user_*` em snake_case plural).
- **Colunas em inglês** seguem o padrão de `appointments`, `clinic_professionals`,
  `import_files` etc. Vocabulário em português é problema da UI.
- **Endpoints em inglês** (`/clinical/encounters`, `/patients/:id/clinical-timeline`).
- **UI usa "atendimento" / "prontuário" / "evolução" / "conduta"** em
  português; mapping textual fica para a sprint de UI.
- **`secretaria` (DB/JWT) ≡ "funcionário(a) administrativo(a)" (UI)** — sem
  migration (ADR 0009 §11 mantida).

## 15. Plano de implementação Sprint 4.2B

Ordem sugerida, dependências entre passos explícitas. **Cada passo abre
PR/commit próprio** quando possível, para reduzir blast radius.

1. **Migration única aditiva** `20260602000000_clinical_encounters_v0.ts`:
   - `clinical_encounters`
   - `clinical_encounter_notes`
   - `clinical_read_audit`
   - `user_clinical_roles`
   - todos os índices, CHECK constraints, FKs.
   - Reverter (`down`) drop limpo.
2. **`backend/src/types/db.d.ts`** — adicionar tipos das 4 tabelas.
3. **DAOs (4 novos):**
   - `userClinicalRoleDao.ts` — `findActiveForUserInClinic`, `grant`, `revoke` (append-only).
   - `clinicalEncounterDao.ts` — `create`, `findByIdForClinic`, `listForClinic` (com cláusula `attending_user_id` quando aplicável), `cancelForOwn` (CAS), `updateEnded`.
   - `clinicalEncounterNoteDao.ts` — `create`, `listByEncounter`, sem `update`.
   - `clinicalReadAuditDao.ts` — `record` (espelha `auditLogDao`), sem `update`/`delete`.
4. **Middleware `requireClinicalRole`** em `backend/src/middlewares/`:
   - cache de request: faz 1 SELECT em `user_clinical_roles WHERE user_id=? AND clinica_id=? AND revoked_at IS NULL`;
   - aceita também `dono_clinica` direto de `users.papel`;
   - retorna 403 `forbidden_role` (genérico, sem PII);
   - acrescenta `req.clinicalRoles: Set<string>` para o controller usar.
5. **Services (4 novos):**
   - `clinicalEncounterService.ts` — `create`, `findById`, `list`, `cancel`.
   - `clinicalEncounterNoteService.ts` — `create`, `rectify`.
   - `clinicalReadAuditService.ts` — wrapper de `record` com **dois modos**
     controlados por `env.CLINICAL_READ_AUDIT_STRICT` (vide §8.2.1):
     - **strict mode (default em produção):** falha do `record` propaga
       erro; controller deve abortar com 500 `clinical_read_audit_unavailable`
       sem retornar conteúdo clínico no body.
     - **best-effort (dev/staging com dados sintéticos):** falha loga
       `error` e a leitura continua.
     O service expõe ambos via assinaturas claras (`recordStrict` /
     `recordBestEffort`) ou um parâmetro explícito — a 4.2B decide a
     forma; a invariante é "conteúdo clínico nunca sai sem audit
     persistido em strict mode".
   - `userClinicalRoleService.ts` — `grant`, `revoke`.
6. **Controllers + rotas** (`backend/src/routes/clinicalEncounters.ts` + montagem em `app.ts`):
   - 5 endpoints clínicos + 2 endpoints de roles (grant/revoke).
   - Validação de input no edge; service faz lógica.
7. **Atualização do logger** (`backend/src/utils/logger.ts` ou similar):
   - estender lista de termos redigidos com os 5 campos clínicos + razões.
   - princípio: body de `/clinical/*` nunca logado integral.
8. **Atualização do `cors.ts` / `app.ts`**: nada novo (rotas já cobertas pela allowlist atual; sem `FRONTEND_ORIGIN` extra).
9. **Smoke tests via curl** (script descartável em `/tmp/`):
   - matriz **cross-tenant**: paciente da clínica A + token da clínica B → 404.
   - **profissional vê só os próprios**: profA cria encounter; profB tenta listar → vê só os seus, não o de profA.
   - **dono lê + audit**: dono lê encounter alheio → 200 + linha em `clinical_read_audit`.
   - **funcionário/financeiro/admin_sistema** → 403/403/403 em todos os endpoints clínicos.
   - **`internal_note` redacted** para não-autor (verificar JSON não contém a chave).
   - **paciente arquivado/mesclado** → 404 ao criar encounter.
   - **cancelamento por terceiro** → 404 (anti-enumeração).
   - **retificação preserva autoria** → 400 se outro profissional tenta retificar.
   - **audit sem PII**: grep no DB `audit_logs` + `clinical_read_audit` por nomes/CPFs de teste → 0.
   - **logger não loga conteúdo clínico**: grep nos logs de aplicação.
   - **`CLINICAL_READ_AUDIT_STRICT` — fail-closed (obrigatório):**
     simular falha de persistência em `clinical_read_audit` (ex.: mock do
     DAO `record` lançando exceção, OU revogar `INSERT` na tabela via
     `REVOKE` temporário sob conexão dedicada de teste) e confirmar:
     - `GET /clinical/encounters/:id` → **500 `clinical_read_audit_unavailable`**
       (com `CLINICAL_READ_AUDIT_STRICT=true`);
     - body de resposta **não contém** os 5 campos textuais clínicos
       nem qualquer trecho (`chief_complaint|anamnesis|evolution|plan|internal_note`)
       — verificado por grep no body;
     - log de erro registrado **sem** `paciente_id`, **sem** conteúdo, **sem** stack
       traceback ecoado ao cliente;
     - mesma simulação com `CLINICAL_READ_AUDIT_STRICT=false` (apenas em
       ambiente de teste com dados sintéticos) → 200 + body com
       conteúdo + log de erro registrado (comportamento best-effort).
     - Boot em `NODE_ENV=production` com `CLINICAL_READ_AUDIT_STRICT=false`
       → **falha de boot** (guard em `config/env.ts`).
10. **SQL checks pós-teste**:
    - `SELECT COUNT(*) FROM clinical_encounters WHERE status='canceled' AND canceled_at IS NULL` → 0 (CHECK garante; double-check).
    - `SELECT COUNT(*) FROM clinical_encounter_notes WHERE revises_note_id IS NOT NULL AND rectification_reason_code IS NULL` → 0.
    - `SELECT COUNT(*) FROM user_clinical_roles WHERE revoked_at IS NULL GROUP BY user_id, clinica_id, role HAVING COUNT(*) > 1` → 0 vazio (unique parcial).
11. **Limpeza de dados de teste** — usuários e clínicas descartáveis removidos no fim, conforme padrão das sprints anteriores. **Audits ficam** (FK SET NULL — comportamento correto).
12. **Documentação compacta:**
    - atualizar `CLAUDE.md` (sprint atual = 4.2B; lista de migrations; endpoints novos no resumo).
    - atualizar `docs/project-state.md` (entrada Sprint 4.2B).
    - atualizar `docs/sprint-history.md` (Sprint 4.2B).
    - atualizar `docs/security-notes.md` (seção nova "Prontuário clínico v0.1" — endpoints, audit de leitura, defesa real, invariantes).
    - atualizar `docs/testing-checklist.md` (bloco Sprint 4.2B).

**Estimativa de PRs (sugestão):** 1 PR para migration + types, 1 PR para
DAOs + middleware, 1 PR para services + controllers + rotas, 1 PR para
docs. Total: 4 PRs pequenos vs. 1 grande — decisão da 4.2B.

## 16. Impacto na trilha AWS (continua pausada)

Trilha AWS continua **⏸️ pausada estrategicamente** (ADR 0008 §6 + ADR
0009 §10). Gate de retomada **permanece** "ADR 0010 aceita +
reavaliação". Esta ADR aceita registra os impactos concretos:

| Componente AWS | Impacto do Prontuário v0.1 | Ação antes de produção |
|---|---|---|
| **RDS class/storage** | 5 campos text por nota; clínicas pequenas (10 prof × 30 pac/dia × 250 dias) geram ~75 mil notas/ano + audit de leitura em volume similar. `db.t3.micro` provavelmente continua suficiente para 5–10 clínicas. Reavaliar a cada 10× crescimento. | Revisar dimensionamento no `docs/aws-infra-sprint-3.41-plan.md` antes de provisionar |
| **EBS/S3** | **Anexos clínicos fora do v0.1** — sem impacto em storage de objeto no v0.1. EBS para Postgres continua o mesmo dimensionamento. | Sem ação |
| **KMS** | **Sem cifra a nível de coluna no v0.1** (§13). RDS encryption at rest cobre. **Sem KMS CMK dedicada agora** para os campos clínicos textuais. | Reabrir decisão se anexos clínicos entrarem ou se validação jurídica exigir |
| **CloudWatch logs** | Logger redige campos clínicos (§8.4). Validar em staging que stack traces de erro **não** vazam conteúdo clínico. | Smoke test pós-deploy de staging |
| **Backup (Restic)** | Cifra atual cobre. `clinical_read_audit` cresce em volume — incluir nos dumps `pg_dump -Fc`. | Validar restore drill em staging com tabelas clínicas |
| **Region** | `sa-east-1` (São Paulo) preferida por LGPD — confirmado na ADR 0009 §10. | Confirmar com jurídico ao provisionar |
| **SSM Parameter Store** | Sem secret novo para o v0.1 (não há KMS dedicada). | Sem ação |

**Decisão consciente:** a 4.2B pode ser implementada e validada
**inteiramente em ambiente local + staging local** (Docker compose +
Postgres local + Nginx local) sem precisar de AWS provisionada. A
retomada da trilha AWS continua sendo um evento separado.

## 17. Riscos (não bloqueantes desta ADR)

| Risco | Mitigação |
|---|---|
| **Volume de `clinical_read_audit` cresce sem controle** | Particionamento por mês fica para sprint futura (não no v0.1); índices cobrem queries comuns; retenção legal pendente de jurídico |
| **Falha de audit de leitura silenciosa** | Config `CLINICAL_READ_AUDIT_STRICT` (vide §8.2.1): **best-effort** apenas em dev/staging com dados sintéticos (log nível `error`); **fail-closed** obrigatório em produção (guard de boot em `config/env.ts` força `true` quando `NODE_ENV=production`). Em strict mode, falha de audit → 500 `clinical_read_audit_unavailable` + conteúdo clínico **nunca** retornado |
| **Profissional malicioso lendo prontuário próprio "para outro paciente"** | `paciente_id` está no audit — detecção retrospectiva; revisão periódica de `clinical_read_audit` por dono/gestor é o controle |
| **Dono editando prontuário alheio "porque manda na clínica"** | Vedado por design (§7); 403 firme; revisão futura se for demanda real exige ADR |
| **Mistura acidental de histórico clínico em merge B-safe** | Default §10.2 (sem mistura); ADR de extensão da 0007 antes de qualquer mudança |
| **Cifra ausente leakar dado clínico em backup furtado** | RDS encryption at rest + cifra Restic do backup; revisão antes de produção (§13.3) |
| **Logger leakar dado clínico via stack trace** | Redação no logger (§8.4) + smoke test |
| **Profissional retificando nota muitas vezes para "apagar" original** | Cadeia preserva todas as versões; UI deve mostrar histórico completo (fase futura) |
| **Sobreposição de horário em encounter** | Sem constraint anti-overlap (decisão consciente); aceita no v0.1 |
| **Faturamento futuro (4.6) querer cruzar valor com diagnóstico** | Fora do v0.1; quando entrar, ADR 0014 deve filtrar campos clínicos no SQL (ADR 0009 §8 risco #4) |

## 18. Itens fora do escopo recap (não autorizados por esta ADR)

Esta ADR **NÃO** autoriza, **NEM** na 4.2B nem em sprint subsequente sem
ADR nova:

- Tabela clínica fora das 4 declaradas.
- Campo clínico estruturado (CID, exame, medicamento, dose).
- Anexo clínico, upload, signed URL para conteúdo clínico.
- Assinatura digital ICP-Brasil.
- Telemedicina (vídeo/áudio).
- IA clínica assistiva (sugestão, resumo, alertas).
- Compartilhamento externo com paciente, portal do paciente.
- TISS/TUSS real, SNGPC/ANVISA.
- Export clínico (CSV/XLSX/PDF com conteúdo clínico).
- `admin_sistema` lendo dado clínico (break-glass).
- Edição/cancelamento de encounter alheio por dono/gestor.
- Cifra a nível de coluna (decisão revisável — §13.3).
- Migração de prontuário de sistema antigo (CSV/XLSX → clínico).
- Restore de encounter cancelado.
- Notificação automática ao paciente.
- Dashboards/relatórios clínicos.
- Funcionário/financeiro lendo conteúdo clínico (mesmo metadados de
  timeline).
- Cópia de UI/textos de Feegow ou concorrentes.

## 19. Notas finais

- Esta ADR **não afirma conformidade jurídica completa com LGPD, CFM,
  ICP-Brasil ou TISS.** Validação jurídica externa **obrigatória** antes
  de qualquer dado clínico real em produção (ADR 0009 §7).
- Esta ADR **autoriza** a Sprint 4.2B a implementar exatamente o que está
  aqui descrito — **sem desvios**. Qualquer mudança de escopo durante a
  4.2B exige aditivo a esta ADR.
- Esta ADR **mantém todas as invariantes** vigentes em
  `docs/security-notes.md` e adiciona invariantes próprias do módulo
  clínico:
  - sem `UPDATE` em conteúdo de nota (append-only com `revises_note_id`);
  - sem `DELETE` físico em nenhuma das 4 tabelas;
  - sem mistura de histórico clínico em merge B-safe;
  - audit de leitura para todo acesso a conteúdo clínico;
    **fail-closed em produção** (`CLINICAL_READ_AUDIT_STRICT=true` — vide
    §8.2.1): falha de audit bloqueia a resposta com 500
    `clinical_read_audit_unavailable`, sem retornar conteúdo clínico no
    body; best-effort permitido apenas em dev/staging com dados sintéticos;
  - logger redige campos clínicos;
  - cifra a nível de coluna é decisão revisável antes de produção.
- A Sprint 4.2B **pode** ser quebrada em sub-sprints (4.2B-1 migration+DAOs,
  4.2B-2 services+endpoints, 4.2B-3 audit+smoke) sem reabrir esta ADR,
  desde que o escopo final seja exatamente o documentado aqui.
