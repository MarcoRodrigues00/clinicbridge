# ADR 0011 — Documentos Médicos e Receitas v0.1

- **Status:** Accepted
- **Data:** 2026-05-26
- **Decisores:** dono do produto (ClinicBridge)
- **Sprint:** 4.3A (docs/ADR-only — sem código, sem migration, sem AWS)
- **Habilitada por:** ADR 0010 (Prontuário v0.1 implementado e com QA/hardening
  concluídos nas Sprints 4.2B–4.2E). Esta ADR consome os gates da ADR 0009 §9,
  os invariantes da ADR 0010 e confirma que todas as colunas de tabela e padrões
  de audit da Fase 4.2 estão operacionais.
- **Pré-requisitos cumpridos:**
  - ADR 0001 (Opção C — base administrativa segura).
  - ADR 0008 (Clinic OS modular — sem telemedicina).
  - ADR 0009 (arquitetura clínica, roles granulares, audit de leitura, LGPD).
  - ADR 0010 (Prontuário v0.1 — 4 tabelas, middleware `requireClinicalRole`,
    tabela `clinical_read_audit` operacional, logger redaction 4 camadas).
  - Sprint 4.2D/4.2E: QA hardening + endpoint LGPD-art.18 validados.
- **Relacionado:**
  - `docs/medical-documents-v0-scope.md` (companheiro operacional desta ADR)
  - `docs/adr/0010-clinical-encounters-medical-record-v0.md`
  - `docs/clinical-architecture-and-permissions.md`
  - `docs/security-notes.md`, `docs/project-state.md`
  - `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`
- **Sprint seguinte:** **4.3B** — implementação backend (migration, DAOs,
  services, controllers, rotas, logger redaction estendido, smoke tests).
  Esta ADR autoriza a abertura da 4.3B; a 4.3B **só** começa depois desta
  ADR aceita pelo dono.

---

## 1. Contexto

A Fase 4.2 entregou o Prontuário v0.1 — atendimentos clínicos com notas
textuais, audit de leitura strict, permissões granulares por `user_clinical_roles`
e endpoint LGPD-art.18. O produto tem agora a infraestrutura clínica mínima:
tabelas `clinical_*`, middleware `requireClinicalRole`, redação de campos sensíveis
no logger.

A próxima necessidade documentada pelos clínicos-alvo é a geração de **documentos
médicos básicos** — receita simples, atestado, declaração — que são parte do
fluxo natural de atendimento. Atualmente, esses documentos são gerados
manualmente em papel ou em ferramentas externas (Word, Google Docs), sem controle
de versão, sem auditoria e sem vínculo com o prontuário.

Esta ADR (Sprint 4.3A) fecha as seguintes decisões **antes** de qualquer código:

- Quais tipos de documentos entram no v0.1.
- Natureza jurídica e aviso de limitação obrigatório.
- Ciclo de vida: rascunho → finalizado → cancelado.
- Modelo de dados conceitual (tabela `clinical_documents`).
- Permissões por role (herda o padrão da ADR 0010).
- Auditoria de criação/finalização/cancelamento/leitura/PDF.
- Logger redaction para campos de documento.
- Geração de PDF — escopo, limitações e aviso obrigatório.
- UX futura: posicionamento no drawer de prontuário.
- LGPD: documentos como dados pessoais sensíveis.
- O que fica explicitamente fora do v0.1.

O ClinicBridge **não está pronto para produção** (ressalvas P1 em
`docs/security-notes.md`) e não tem dado clínico real. A implementação
(Sprint 4.3B) ocorrerá em staging local com dados sintéticos.

## 2. Decisão — resumo dos compromissos

Esta ADR registra 11 compromissos arquiteturais.

1. **Cinco tipos de documento no v0.1:** `receipt_simple` (receita simples),
   `attestation` (atestado), `declaration` (declaração/comparecimento),
   `exam_request` (solicitação de exame textual), `orientation` (orientação/
   relatório simples). Todos textuais, impressíveis, **sem força jurídica
   plena** sem assinatura física/ICP-Brasil.
2. **Uma tabela nova:** `clinical_documents` — prefixo `clinical_` em `public`
   schema (consistente com ADR 0010). Denormaliza `clinica_id` para filter
   direto.
3. **Ciclo de vida simples:** `draft → finalized → canceled`. Rascunhos são
   mutáveis (UPDATE em `body`/`title`/`metadata_json`). Documentos finalizados
   são imutáveis. Substituição de documento finalizado = cancelar + criar novo
   com `supersedes_document_id`.
4. **Sem delete físico.** Invariante. `canceled` é o estado final negativo.
   Nenhum `DELETE` no DAO.
5. **PDF gerado on-demand**, não armazenado no v0.1. Auditado na leitura/
   download. Contém aviso obrigatório de limitação jurídica.
6. **Audit de escrita** (em `audit_logs`) + **audit de leitura** (em
   `clinical_read_audit`) — herda os dois padrões da ADR 0010.
7. **Logger redaction** estende as 4 camadas da ADR 0010 com os campos de
   documento (`body`, `title` de documento, `cancel_reason_text`).
8. **Permissões:** `profissional_clinico` cria/edita draft/finaliza/cancela
   os próprios; `dono_clinica`/`gestor_clinica` leem qualquer com audit;
   `secretaria`/`funcionario_administrativo` **não têm acesso** ao conteúdo
   de documentos médicos; `admin_sistema` bloqueado por `requireClinic`.
9. **Vínculo ao atendimento opcional** — `encounter_id` é NULL-permitido.
   Clínica pode emitir atestado sem encounter formal no sistema; o vínculo
   é fortemente recomendado mas não bloqueante.
10. **`metadata_json` mínimo** — campos estruturados por tipo de documento
    (ex.: dias de afastamento, CID livre para atestado); validado no service,
    não imposto por DB CHECK (jsonb nullable).
11. **Aviso jurídico na UI** — tela de criação deve exibir alerta permanente
    de que o documento não tem assinatura digital ICP-Brasil e que a validade
    jurídica depende de assinatura física do profissional.

Esta ADR **não autoriza dado clínico real em produção** — só staging com
dados sintéticos depois da 4.3B implementar.

## 3. Escopo v0.1 — o que está dentro

### 3.1 Tipos de documento (`doc_type`)

| Valor DB | Nome UI | Uso típico | Campos específicos em `metadata_json` |
|---|---|---|---|
| `receipt_simple` | Receita simples | Medicamentos não controlados; impressa + assinatura física | `medications`, `dosage`, `instructions`, `validity_days` |
| `attestation` | Atestado médico | Afastamento do trabalho/escola; declaração de condição | `days_absent`, `start_date`, `end_date`, `cid_free` (texto livre, não estruturado) |
| `declaration` | Declaração de comparecimento | Confirma presença do paciente na consulta | `event_date`, `start_time`, `end_time` |
| `exam_request` | Solicitação de exame | Pedido de exames laboratoriais, de imagem (textual) | `exams_requested`, `clinical_indication` |
| `orientation` | Orientação / relatório simples | Cuidados pós-consulta, relatório de encaminhamento | — (conteúdo livre em `body`) |

**Todos os tipos:**
- São **documentos textuais impressíveis** — não são documentos eletrônicos
  com assinatura digital válida.
- Vinculam-se a um `patient_id` (obrigatório) e opcionalmente a um
  `encounter_id`.
- Podem ser gerados como PDF com aviso de limitação jurídica.
- Seguem o mesmo ciclo de vida `draft → finalized → canceled`.

### 3.2 Ciclo de vida

```
                    +--------+
              ────► |  draft | ────── PATCH (atualizar)
              |     +--------+
              |        │
              |        │ POST /finalize (autor; body não-vazia)
              |        ▼
              |    +-----------+
              |    | finalized | ────── GET (conteúdo; audit)
              |    +-----------+      ──── GET /pdf (download; audit)
              |        │
              │        │ POST /cancel (autor; cancel_reason_code obrigatório)
              │        ▼
              |    +-----------+
              └─── | canceled  |
                   +-----------+

Substituição: cancelar o antigo + criar novo com supersedes_document_id=antigo.
```

**Regras de transição:**
- `draft → finalized`: `POST /clinical/documents/:id/finalize`; só o autor;
  `body` não pode ser vazia; documento permanece imutável após isso.
- `finalized → canceled`: `POST /clinical/documents/:id/cancel`; só o autor
  no v0.1; `cancel_reason_code` obrigatório; `cancel_reason_text` opcional
  (≤ 200 chars, sem PII).
- `draft → canceled`: `POST /clinical/documents/:id/cancel` em rascunho também
  é permitido (descartar rascunho).
- **Sem transição reversa**: nenhuma ação pode retornar de `canceled` para
  `draft` ou `finalized`. Invariante.
- **Sem restore.** Igual ao padrão de encounter da ADR 0010.

### 3.3 Campo `body` e composição

- `body` (text NULL): conteúdo principal do documento em texto livre.
  **Obrigatório e não-vazio** para finalização; pode estar vazio em rascunho.
  Limite: 10.000 chars.
- `title` (text NOT NULL): título/descrição. Service gera default ("Atestado —
  26/05/2026") se não fornecido. Limite: 200 chars.
- `metadata_json` (jsonb NULL): campos semi-estruturados por tipo (tabela §3.1).
  Validado no service; não há DB CHECK sobre o conteúdo (jsonb flexível).
  **Nunca inclui PII bruta** (sem CPF, telefone, endereço — esses vêm do
  cadastro do paciente via join no PDF, não ficam em `metadata_json`).
- **Templates de UI:** a implementação futura pode oferecer templates pré-preenchidos
  por tipo. O backend não guarda o template — apenas o resultado após preenchimento.

### 3.4 PDF

- Gerado **on-demand** a partir de documento com `status='finalized'`.
- **Não é armazenado** no v0.1 — gerado em memória, retornado como stream.
  Decisão: evita S3/storage extra antes de AWS provisionada; revisável
  quando armazenamento for necessário (ex.: histórico de PDFs emitidos).
- **Conteúdo obrigatório no PDF:**
  - Cabeçalho: nome da clínica, endereço, CNPJ (se cadastrado).
  - Dados do paciente: nome, data de nascimento (sem CPF bruto, sem endereço
    completo no PDF sem análise futura de necessidade mínima).
  - Dados do profissional: nome, CRM/CRO/registro profissional (se cadastrado).
  - Tipo e título do documento, data de emissão.
  - Conteúdo (`body` + campos de `metadata_json` relevantes ao tipo).
  - **Rodapé obrigatório de aviso:**
    > "Este documento foi gerado pelo ClinicBridge e não possui assinatura
    > digital ICP-Brasil. A validade jurídica plena pode exigir assinatura
    > física do profissional responsável ou assinatura digital com certificado
    > válido (ICP-Brasil/CFM). Não é uma prescrição eletrônica legalmente
    > válida."
- **Download auditado** em `clinical_read_audit` com `acao='clinical.document.pdf.downloaded'`.
- **Sem QR code de validação pública** no v0.1 (exige backend de validação).
- **Biblioteca PDF:** escolha fica para a sprint 4.3B (opções: `pdfkit`,
  `puppeteer`, `@react-pdf/renderer`). Requisito: bundle no backend sem
  dependência de browser externo.

### 3.5 Vínculo ao atendimento

- `encounter_id` é opcional (NULL-permitido).
- Quando preenchido, deve pertencer ao mesmo `patient_id` e mesma `clinica_id`
  (validado no service).
- **Fortemente recomendado** vincular documentos a encounters quando existe
  um encounter formal — melhora rastreabilidade clínica.
- **Não bloqueante:** profissional pode emitir atestado sem encounter registrado
  no sistema (ex.: consulta presencial sem agendamento prévio cadastrado).

## 4. Fora de escopo do v0.1 — explícito

| Item | Onde fica |
|---|---|
| **Prescrição eletrônica válida (ICP-Brasil / CFM)** | Fase futura própria (sem número); pré-requisito = documentos v0.1 maduro em uso real |
| **Assinatura digital com certificado** (qualquer provedor) | Fase futura própria |
| **Integração com plataformas de e-prescrição** (Memed, Mevo, etc.) | Fora do Clinic OS atualmente; ADR futura se virar demanda |
| **Receituários especiais** (azul/amarelo para controlados) | Fora — medicamentos controlados são SNGPC/ANVISA (ADR 0008 §3) |
| **CID estruturado / diagnóstico como campo obrigatório** | `cid_free` em `metadata_json` de `attestation` é texto livre; CID estruturado é fase futura |
| **Medicamentos controlados / retenção de receituário** | Fora — SNGPC/ANVISA (ADR 0008 §3) |
| **Validação ANVISA / RDC 20/2011** | Fora |
| **Integração com farmácias** | Fora |
| **Envio automático por WhatsApp / e-mail** | ADR 0006 = manual-first; envio automático exige consentimento/logs/ADR futura |
| **Upload de exames / anexos clínicos** | Fora — exige antivírus/sandbox/DLP/KMS (ADR 0010 §4) |
| **IA gerando conteúdo do documento** | Fase futura sem número (depois de 4.2 madura e dado real validado) |
| **QR code de validação pública** | Fora — exige backend de validação pública; ADR futura |
| **Impressão fiscal / NF-e** | Fora — nota fiscal é módulo financeiro (Fase 4.4) |
| **Portal do paciente** (acesso pelo titular) | Fora do Clinic OS atualmente; ADR futura |
| **Armazenamento do PDF emitido** | Fora do v0.1 — gerado on-demand sem persistência; revisável quando S3 estiver provisionado |
| **Templates por especialidade** (cardiologia, pediatria, etc.) | Fora do v0.1 — templates fixos por tipo; especialização é fase futura |
| **Secretaria / funcionario_admin lendo documento médico** | Bloqueado por design — dados pessoais sensíveis de saúde |
| **`admin_sistema` acessando conteúdo** | Break-glass exige ADR própria (ADR 0009 §4.6) |
| **TISS / TUSS** | Fora — ADR 0008 §3 |
| **Telemedicina** | Fora — ADR 0008 §2.1 |
| **Edição/cancelamento de documento alheio por dono/gestor** | Fora do v0.1 — preserva responsabilidade médico-legal |
| **Versionamento com histórico de edições de rascunho** | Fora do v0.1 — `updated_at` registra última atualização; histórico completo de drafts é complexidade desnecessária nesta fase |
| **Migração de documentos de sistema antigo** | Fora — quando entrar, exige sprint própria |
| **Cópia de UI/textos de Feegow ou concorrentes** | Vedada (ADR 0008 §2.9) |

## 5. Modelo de dados conceitual

> **Sem migration nesta sprint.** Esta seção é a especificação que a 4.3B
> implementará. Nome da migration: `20260603000000_clinical_documents_v0.ts`
> (ou similar — a 4.3B decide o dia exato).

### 5.1 Tabela `clinical_documents`

```text
clinical_documents
  id                        uuid PK                     gen_random_uuid()
  clinica_id                uuid NOT NULL               FK clinics(id) ON DELETE CASCADE
  patient_id                uuid NOT NULL               FK patients(id) ON DELETE RESTRICT   (histórico médico-legal; arquivar paciente continua ok)
  encounter_id              uuid NULL                   FK clinical_encounters(id) ON DELETE SET NULL
  author_user_id            uuid NOT NULL               FK users(id) ON DELETE RESTRICT       (preserva responsável)
  doc_type                  text NOT NULL               CHECK doc_type IN ('receipt_simple','attestation','declaration','exam_request','orientation')
  title                     text NOT NULL               CHECK length(title) <= 200
  body                      text NULL                   CHECK (body IS NULL OR length(body) <= 10000)
  metadata_json             jsonb NULL
  status                    text NOT NULL DEFAULT 'draft'   CHECK status IN ('draft','finalized','canceled')
  finalized_at              timestamptz NULL
  finalized_by_user_id      uuid NULL                   FK users(id) ON DELETE SET NULL
  canceled_at               timestamptz NULL
  canceled_by_user_id       uuid NULL                   FK users(id) ON DELETE SET NULL
  cancel_reason_code        text NULL                   CHECK cancel_reason_code IN ('error','duplicate','patient_request','other')
  cancel_reason_text        text NULL                   CHECK (cancel_reason_text IS NULL OR length(cancel_reason_text) <= 200)
  supersedes_document_id    uuid NULL                   FK clinical_documents(id) ON DELETE SET NULL   (self-ref; este doc substitui o anterior)
  created_at                timestamptz NOT NULL DEFAULT now()
  updated_at                timestamptz NOT NULL DEFAULT now()

  -- Consistency CHECKs:
  CHECK (status != 'finalized' OR (finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL))
  CHECK (status != 'canceled'  OR (canceled_at  IS NOT NULL AND canceled_by_user_id  IS NOT NULL AND cancel_reason_code IS NOT NULL))
  CHECK (status  = 'draft'     OR canceled_at IS NULL OR finalized_at IS NULL)   -- não pode ter ambos
  CHECK (cancel_reason_text IS NULL OR cancel_reason_code IS NOT NULL)           -- texto só com código

Indexes:
  idx_clinical_documents_clinica_patient_created     (clinica_id, patient_id, created_at DESC)
  idx_clinical_documents_clinica_author_created      (clinica_id, author_user_id, created_at DESC)
  idx_clinical_documents_clinica_status              (clinica_id, status, created_at DESC)
  idx_clinical_documents_encounter                   (encounter_id) WHERE encounter_id IS NOT NULL
  idx_clinical_documents_supersedes                  (supersedes_document_id) WHERE supersedes_document_id IS NOT NULL
```

**Notas de design:**

- `ON DELETE RESTRICT` em `patient_id` e `author_user_id`: histórico médico-legal.
  Arquivar paciente (soft-delete) continua ok — o `RESTRICT` bloqueia apenas
  `DELETE` físico, que já é proibido por invariante.
- `encounter_id ON DELETE SET NULL`: se o encounter for cancelado (não deletado
  fisicamente), o vínculo permanece. Se por algum motivo extremo um encounter
  fosse deletado (impossível com as atuais invariantes), o documento sobrevive
  com `encounter_id = NULL`.
- `supersedes_document_id ON DELETE SET NULL`: auto-referência fraca; se o
  documento antigo for inacessível (ex.: bug de dados), o novo documento não
  fica bloqueado.
- `metadata_json` é `jsonb NULL` — validação de estrutura interna fica no
  service por tipo de documento. Não usar CHECK JSON para evitar schema
  migration em cada mudança de template.
- **Sem `UPDATE` em `body`/`title` depois de `finalized`** — service recusa
  com 400 `document_already_finalized`. Rascunhos podem ser editados via
  `PATCH /clinical/documents/:id`.
- **Sem `DELETE` no DAO.** Invariante.

### 5.2 O que NÃO muda no schema atual

- `clinical_encounters`, `clinical_encounter_notes`, `clinical_read_audit`,
  `user_clinical_roles` — sem coluna nova.
- `patients`, `users`, `clinics`, `audit_logs` — sem coluna nova.
- `clinical_read_audit.recurso` já aceita `'document'` no CHECK existente
  (ADR 0010 §5.3) — nenhuma migration necessária nesta coluna.

Migration da 4.3B é **estritamente aditiva** (1 tabela nova + índices).

## 6. Permissões — modelo técnico

### 6.1 Onde a defesa acontece

Herda exatamente o padrão da ADR 0010 §6.1:

- **`requireAuth`** → **`requireClinic`** → **`requireClinicalRole`** (onde
  aplicável) → defesa de service com cláusulas `WHERE author_user_id = self`.

Nenhuma defesa nova de middleware é necessária — `requireClinicalRole` já
implementado na ADR 0010 cobre os novos endpoints.

### 6.2 Capacidade por role

| Role | Capacidade em documentos médicos |
|---|---|
| `profissional_clinico` | Criar, editar rascunho, finalizar, cancelar **os próprios**; ler os próprios (com audit); gerar PDF dos próprios |
| `dono_clinica` | Ler **qualquer** documento da clínica (com audit); gerar PDF de qualquer documento finalizado; **não** cria/edita/cancela documentos alheios no v0.1 |
| `gestor_clinica` | Ler qualquer documento da clínica (com audit); gerar PDF; **não** cria/edita/cancela |
| `secretaria` / `funcionario_administrativo` | **Sem acesso** ao conteúdo de documentos médicos |
| `financeiro` | **Sem acesso** no v0.1 — mesmo padrão da ADR 0010 |
| `admin_sistema` | Bloqueado por `requireClinic` |

**Nota:** assim como na ADR 0010, `dono_clinica` por si só **não cria** documentos
médicos no v0.1. Para atender e emitir documentos, o dono precisa também de
`profissional_clinico` em `user_clinical_roles`. Isso preserva a clareza de
responsabilidade médico-legal.

### 6.3 Regra "autor vê/edita os próprios"

Implementada como cláusula `WHERE author_user_id = :self` no DAO para roles
`profissional_clinico` sem ser dono/gestor simultaneamente. Defesa real no DAO,
não no controller — mesmo princípio da ADR 0010 §6.1.

## 7. Matriz de permissões — operação × role

Legenda: ✅ permitido · ✅* só os próprios · 👁️ leitura com audit · ❌ bloqueado

| Operação | `dono_clinica` | `gestor_clinica` | `profissional_clinico` | `secretaria` | `admin_sistema` |
|---|---|---|---|---|---|
| Criar rascunho (`POST /clinical/documents`) | ❌ (sem grant `profissional_clinico`) | ❌ | ✅ | ❌ | ❌ |
| Editar rascunho (`PATCH /clinical/documents/:id`) | ❌ | ❌ | ✅* (só próprios, só draft) | ❌ | ❌ |
| Finalizar (`POST /clinical/documents/:id/finalize`) | ❌ | ❌ | ✅* (só próprios) | ❌ | ❌ |
| Cancelar rascunho ou finalizado (`POST .../cancel`) | ❌ (v0.1) | ❌ (v0.1) | ✅* (só próprios) | ❌ | ❌ |
| Listar documentos (`GET /clinical/documents`) | 👁️ + audit | 👁️ + audit | ✅* + audit (filtra `author_user_id=self`) | ❌ | ❌ |
| Ler conteúdo (`GET /clinical/documents/:id`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só se autor) | ❌ | ❌ |
| Baixar PDF (`GET /clinical/documents/:id/pdf`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só se autor) | ❌ | ❌ |
| Documentos por paciente (`GET /patients/:id/documents`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só próprios) | ❌ | ❌ |
| Cross-tenant (qualquer) | ❌ 404 genérico | ❌ 404 | ❌ 404 | ❌ | ❌ |

**Notas explícitas:**

1. **"profissional só vê os próprios"** — cláusula `WHERE author_user_id = :self`
   em todos os SELECTs do `clinicalDocumentDao` quando role = `profissional_clinico`
   sem ser dono/gestor. Defesa no DAO.
2. **Dono/gestor veem tudo + audit, mas não editam.** Consulta gerencial; edição
   de documento alheio preserva responsabilidade médico-legal.
3. **Cancelamento de documento alheio por dono/gestor:** fora do v0.1 (mesma
   decisão da ADR 0010 §7 para encounters). Se for demanda real, reabrir com ADR.
4. **`secretaria` não acessa conteúdo.** Pode ver agenda do paciente, não
   documentos clínicos. Decisão explícita: documento médico pode conter dado
   de saúde sensível (diagnóstico em atestado, medicamento em receita).
5. **PDF** tem as mesmas permissões de leitura do conteúdo — não é mais permissivo.

## 8. Auditoria — escrita e leitura

### 8.1 Audit de escrita (em `audit_logs`)

Sem migration — reusa schema atual.

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `clinical.document.created.success` | documento criado (draft) | `clinical_document` | UUID do documento |
| `clinical.document.updated.success` | rascunho atualizado (PATCH) | `clinical_document` | UUID do documento |
| `clinical.document.finalized.success` | documento finalizado | `clinical_document` | UUID do documento |
| `clinical.document.canceled.success` | documento cancelado | `clinical_document` | UUID do documento |

**Regras invariantes:**
- Sem PII — só UUIDs. Sem conteúdo de `body`, sem `cancel_reason_text`,
  sem campos de `metadata_json`.
- Sem `doc_type` explícito no audit (não é PII, mas mantém minimalismo).
- Falha de audit de escrita **aborta a transação** — mesmo padrão da ADR 0007
  (merge B-safe) e ADR 0010 (encounters).

### 8.2 Audit de leitura (em `clinical_read_audit`)

A tabela `clinical_read_audit` já existe (ADR 0010) e já aceita `recurso='document'`
no CHECK existente. Sem migration.

| `acao` | Quando | `recurso` | `recurso_id` | `paciente_id` |
|---|---|---|---|---|
| `clinical.document.list` | `GET /clinical/documents` ou `GET /patients/:id/documents` (listagem) | `document` | NULL | NULL (lista pode cruzar pacientes) |
| `clinical.document.read` | `GET /clinical/documents/:id` (conteúdo) | `document` | UUID do documento | UUID do paciente |
| `clinical.document.pdf.downloaded` | `GET /clinical/documents/:id/pdf` | `document` | UUID do documento | UUID do paciente |

**Regras invariantes:**
- Herda os modos `CLINICAL_READ_AUDIT_STRICT` da ADR 0010 §8.2.1.
  **Strict mode obrigatório em produção** (fail-closed).
- `paciente_id` pseudonimizado — identificador interno, nunca PII bruta.
- Conteúdo do documento **nunca** armazenado em `clinical_read_audit`.

### 8.3 Audit de PDF

Download de PDF é um evento de leitura de conteúdo clínico (o PDF contém o
`body` completo). Por isso, gera `clinical.document.pdf.downloaded` em
`clinical_read_audit` — **não** apenas em `audit_logs`.

Em strict mode, o PDF só é gerado/retornado se o audit de leitura persistir.
Se o audit falhar: 500 `clinical_read_audit_unavailable` (sem entregar o PDF).
Conteúdo clínico nunca sai sem audit.

### 8.4 Logger de aplicação — campos de documento

Estende as 4 camadas de redação da ADR 0010 §8.4 com campos de documentos:

Campos adicionados à lista de redação:
```
body (document body — campo clínico principal)
cancel_reason_text (documento)
metadata_json (valor bruto do jsonb — coberto pelo *.field e body patterns existentes)
```

A camada `body/req.body/payload.<field>` da ADR 0010 já cobre campos chamados
`body` em payloads de request. A 4.3B verifica e confirma que `document_body`,
`doc_body` ou o nome exato usado no payload também é coberto (teste de leak
no estilo 7/7 PASS da ADR 0010 §8.4).

**Princípio:** payload completo de `/clinical/documents` nunca logado
integralmente — apenas metadados (status code, duração, request_id, usuario_id).

## 9. Documento lifecycle — detalhamento técnico

### 9.1 Criar rascunho

- Service `clinicalDocumentService.create(authorId, clinicaId, input)`:
  1. Valida `patient_id` ativo + não-mesclado (erro 404 `patient_not_found`).
  2. Valida `encounter_id` (se presente) = mesmo `patient_id` + mesma clínica.
  3. Valida `doc_type` ∈ allowlist.
  4. Valida `metadata_json` contra schema esperado por `doc_type`.
  5. Gera `title` default se não fornecido.
  6. Insere em `clinical_documents` com `status='draft'`.
  7. Emite audit de escrita `clinical.document.created.success`.

### 9.2 Editar rascunho

- `PATCH /clinical/documents/:id` — só funciona com `status='draft'`
  e `author_user_id == self`.
- Campos editáveis: `title`, `body`, `metadata_json`, `encounter_id`.
  `doc_type`, `patient_id`, `author_user_id`, `clinica_id` são imutáveis.
- Emite audit `clinical.document.updated.success`.

### 9.3 Finalizar documento

- `POST /clinical/documents/:id/finalize` — `status` muda de `draft` para
  `finalized`.
- Validações:
  1. `status == 'draft'` (400 `document_not_draft` se já finalizado/cancelado).
  2. `author_user_id == self` (404 anti-enumeração se outro usuário tentar).
  3. `body IS NOT NULL AND trim(body) != ''` (400 `document_body_required`).
- Grava `finalized_at = now()` e `finalized_by_user_id = self`.
- Emite audit `clinical.document.finalized.success`.
- **Após finalização, `body`/`title`/`metadata_json` são imutáveis.**

### 9.4 Cancelar documento

- `POST /clinical/documents/:id/cancel` — `status` muda para `canceled`.
- Funciona com `status IN ('draft','finalized')`.
- `cancel_reason_code` obrigatório; `cancel_reason_text` opcional (≤ 200 chars).
- `author_user_id == self` no DAO (CAS — compare-and-swap no UPDATE).
  Mismatch → 404 genérico (anti-enumeração).
- Emite audit `clinical.document.canceled.success`.
- **Sem restore.**

### 9.5 Substituir documento finalizado

Fluxo de substituição:
1. Cancelar o documento antigo (`POST /clinical/documents/:id/cancel` com
   `reason_code='duplicate'` ou `'error'`).
2. Criar novo documento (`POST /clinical/documents`) com
   `supersedes_document_id = id_do_antigo`.
3. A UI futura exibe o vínculo "substitui o documento cancelado de X/X/XXXX".

Não há endpoint dedicado de substituição no v0.1 — é o fluxo manual acima.

## 10. PDF — especificação técnica

### 10.1 Endpoint

`GET /clinical/documents/:id/pdf`

- Só para `status='finalized'`. `status='draft'` → 400 `document_not_finalized`.
  `status='canceled'` → 400 `document_canceled` (cancelado não gera PDF).
- Permissões: igual ao endpoint de leitura de conteúdo (§7).
- Audit de leitura `clinical.document.pdf.downloaded` **antes** de gerar o PDF.
  Strict mode: falha de audit → 500 sem PDF.

### 10.2 Estrutura do PDF

```
[CABEÇALHO]
Nome da clínica | CNPJ (se cadastrado) | Endereço | Telefone

[TÍTULO]
[doc_type label] — [title]

[METADADOS]
Data de emissão: [finalized_at formatado]
Profissional: [nome do autor] — [registro_profissional se cadastrado]
Paciente: [nome] — [data_nascimento]
Atendimento vinculado: #[encounter_id curto] (se encounter_id presente)

[CONTEÚDO]
[body]

[CAMPOS ESTRUTURADOS por tipo]
(Dias de afastamento: X, Exames: ..., etc. — renderizados a partir de metadata_json)

[RODAPÉ OBRIGATÓRIO]
"Este documento foi gerado pelo ClinicBridge e não possui assinatura digital
ICP-Brasil. A validade jurídica plena pode exigir assinatura física do
profissional responsável ou assinatura digital com certificado válido
(ICP-Brasil/CFM). Não é uma prescrição eletrônica legalmente válida."

[ASSINATURA MANUAL]
_________________________
[Nome do profissional]
CRM/CRO/Registro: [XXXXX]
Data: ___/___/______
```

### 10.3 Dados pessoais no PDF

- **Incluídos necessários:** nome do paciente, data de nascimento (vinculo com
  o documento clínico), nome/registro do profissional.
- **Não incluídos no v0.1:** CPF do paciente (dado sensível — incluir exigiria
  análise de minimização LGPD específica; profissional pode preencher no `body`
  se necessário para o documento); endereço completo.
- **Revisável:** incluir CPF no PDF pode ser uma demanda real (atestados
  frequentemente têm CPF). Se for incluído em versão futura, exige campo opt-in
  por tipo de documento e análise de minimização.

## 11. UX — diretrizes para a Sprint 4.3C (frontend)

> Esta seção guia a sprint de frontend posterior à 4.3B. Não é implementação.

### 11.1 Posicionamento

- Aba ou seção "Documentos" **dentro do drawer `ClinicalPatientPane`** —
  continuação natural do fluxo do prontuário.
- Alternativa: botão "Emitir documento" no `ClinicalEncounterDetail` (dentro
  de um encounter aberto).
- **Não** uma aba separada de top-level no dashboard no v0.1 — peso clínico
  não justifica.

### 11.2 Fluxo de criação

1. Selecionar tipo de documento.
2. Vincular ao encounter (opcional, dropdown dos encounters ativos do paciente).
3. Preencher template (título + body + campos do tipo).
4. **Alerta permanente visível:** "Este documento não tem assinatura digital
   ICP-Brasil. Será necessária sua assinatura física para validade jurídica."
5. Pré-visualizar (render simples em tela).
6. Finalizar → documento imutável.
7. Baixar PDF / imprimir.

### 11.3 Lista de documentos

- Ordenada por `created_at DESC`.
- Badge de status: Rascunho (cinza) / Finalizado (verde) / Cancelado (vermelho).
- Filtro rápido por tipo.
- Clicar abre visualização do conteúdo (somente-leitura para finalizado/cancelado;
  editável para rascunho).
- Botão "Baixar PDF" só para `finalized`.

### 11.4 Linguagem da UI

- "Emitir documento" / "Documentos do paciente" (não "prescrição eletrônica",
  não "e-receita").
- "Documento finalizado" (não "assinado digitalmente").
- Aviso claro sobre limitação jurídica visível na tela de criação e no PDF.

## 12. LGPD — postura para documentos médicos

Documentos médicos contêm **dados pessoais sensíveis** (art. 5°, II e 11 da LGPD)
quando incluem dados de saúde (diagnóstico, medicamento, afastamento médico).

**Princípios aplicados:**

- **Minimização:** `body` e `metadata_json` contêm apenas o necessário para o
  documento. Sem acumulação de dados além da finalidade clínica imediata.
- **Audit de leitura:** toda leitura de conteúdo e download de PDF auditados
  em `clinical_read_audit`.
- **Direito de acesso:** o endpoint LGPD-art.18 (`GET /clinical/read-audit`)
  já expõe metadados de quem acessou o prontuário; documentos seguem o mesmo
  padrão (eventos `clinical.document.read` e `clinical.document.pdf.downloaded`
  aparecem na listagem do painel de auditoria).
- **Retenção:** política de retenção de `clinical_documents` futuramente alinhada
  com CFM (~20 anos para prontuário médico) — mesma pendência da ADR 0010 §13.
  **Sem política de retenção automática no v0.1.** ADR 0002 (retenção) e jurídico
  externo decidem antes de produção real.
- **Cancelamento sem apagar:** `status='canceled'` preserva histórico. Sem delete
  físico. Princípio da auditabilidade LGPD.
- **Acesso restrito:** `secretaria`/`funcionario_administrativo` não acessam
  conteúdo. Limitação de finalidade.
- **Aviso no PDF:** titular do dado (paciente) deve poder entender as limitações
  do documento recebido. Rodapé obrigatório cumpre isso parcialmente; aviso
  mais explícito sobre LGPD pode ser adicionado na iteração futura.

## 13. Impacto no merge B-safe (ADR 0007)

Segue exatamente o padrão da ADR 0010 §10:

- Criar documento para paciente `merged_into_id IS NOT NULL` ou `status='archived'`
  → 404 `patient_not_found` (anti-enumeração).
- Histórico de documentos do paciente secundário (arquivado pelo merge) permanece
  com o `patient_id` original — sem mistura automática com o paciente principal.
- O endpoint `GET /patients/:id/documents` retorna apenas documentos do
  `patient_id` consultado — sem agregação cross-patient.
- Merge B-safe **não move** `clinical_documents` no v0.1 (assim como não move
  `clinical_encounters`). ADR de extensão da 0007 seria necessária.

## 14. Endpoints conceituais

Prefixo `/clinical/` consistente com ADR 0010. Todos exigem
`requireAuth` + `requireClinic`. Permissões por endpoint conforme §7.

### 14.1 `POST /clinical/documents` — criar rascunho

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole('profissional_clinico')`.
- **Body:** `{ patient_id, encounter_id?, doc_type, title?, body?, metadata_json? }`.
- **Response 201:** `{ document: {...status:'draft'...} }`.
- **Audit escrita:** `clinical.document.created.success`.
- **Erros:** 400 `clinical_document_invalid`, 404 `patient_not_found`, 403, 401.

### 14.2 `GET /clinical/documents` — listar

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono ok).
- **Query params:** `patient_id?`, `doc_type?`, `status?`, `author_user_id?`, `from?`, `to?`, `limit?`, `offset?`.
- **DAO:** `WHERE author_user_id = self` para `profissional_clinico` sem ser dono/gestor.
- **Response 200:** lista de documentos com metadados (sem `body`, sem `metadata_json`).
- **Audit leitura:** `clinical.document.list`.
- **Erros:** 400, 403, 401.

### 14.3 `GET /clinical/documents/:id` — ler conteúdo

- **Middleware:** idem 14.2.
- **Service:** 404 genérico se `author_user_id != self` e papel == `profissional_clinico`.
- **Response 200:** documento completo com `body` e `metadata_json`.
- **Audit leitura:** `clinical.document.read` (recurso_id = docId, paciente_id = document.patient_id). Strict mode.
- **Erros:** 404 `document_not_found`, 403, 401.

### 14.4 `PATCH /clinical/documents/:id` — atualizar rascunho

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole('profissional_clinico')`.
- **Body:** `{ title?, body?, metadata_json?, encounter_id? }`.
- **Regra:** `status == 'draft'` AND `author_user_id == self`.
- **Response 200:** documento atualizado.
- **Audit escrita:** `clinical.document.updated.success`.
- **Erros:** 400 `document_already_finalized`, 400 `document_canceled`, 404, 403, 401.

### 14.5 `POST /clinical/documents/:id/finalize` — finalizar

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole('profissional_clinico')`.
- **Body:** `{}` (sem campos; finalização não aceita alteração simultânea de conteúdo).
- **Response 200:** documento com `status:'finalized'`.
- **Audit escrita:** `clinical.document.finalized.success`.
- **Erros:** 400 `document_body_required`, 400 `document_not_draft`, 404, 403, 401.

### 14.6 `POST /clinical/documents/:id/cancel` — cancelar

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole('profissional_clinico')`.
- **Body:** `{ reason_code: 'error'|'duplicate'|'patient_request'|'other', reason_text?: string }`.
- **Regra:** `author_user_id == self` no CAS do UPDATE. Mismatch → 404.
- **Response 200:** documento com `status:'canceled'`.
- **Audit escrita:** `clinical.document.canceled.success`.
- **Erros:** 400 `clinical_document_cancel_invalid`, 404, 403, 401.

### 14.7 `GET /clinical/documents/:id/pdf` — gerar PDF

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono ok).
- **Regra:** `status == 'finalized'`. `draft` → 400 `document_not_finalized`. `canceled` → 400 `document_canceled`.
- **Response 200:** `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="documento-[id-curto].pdf"`.
- **Audit leitura:** `clinical.document.pdf.downloaded` (strict mode — PDF não é entregue sem audit persistido).
- **Erros:** 400, 404, 403, 401.

### 14.8 `GET /patients/:id/documents` — documentos do paciente

- **Middleware:** `requireAuth → requireClinic → requireClinicalRole(['profissional_clinico','gestor_clinica'])` (dono ok).
- **Service:** profissional vê só os próprios documentos desse paciente; dono/gestor veem todos.
- **Response 200:** lista de metadados (sem `body`, sem `metadata_json`).
- **Audit leitura:** `clinical.document.list`.
- **Erros:** 404 (paciente outra clínica/inexistente), 403, 401.

## 15. Validações e regras de negócio (cheat-sheet)

| Regra | Onde | Erro |
|---|---|---|
| `patient_id` ativo + não-mesclado | service | 404 `patient_not_found` |
| `patient_id` mesma clínica | DAO (filtro tenant) | 404 |
| `encounter_id` mesmo `patient_id` + mesma clínica | service | 400 `clinical_document_invalid` |
| `doc_type` ∈ allowlist | service | 400 `clinical_document_invalid` |
| `title` ≤ 200 chars | DB CHECK + service | 400 |
| `body` ≤ 10000 chars | DB CHECK + service | 400 |
| `body` não-vazio na finalização | service | 400 `document_body_required` |
| `metadata_json` válido para o `doc_type` | service | 400 `clinical_document_invalid` |
| `cancel_reason_text` ≤ 200 chars | DB CHECK + service | 400 |
| `author_user_id == self` (criação) | service (injeta `req.auth`) | — (nunca confia no body) |
| `author_user_id == self` (editar/finalizar/cancelar) | DAO CAS / service | 404 genérico |
| `status == 'draft'` para PATCH e finalize | service | 400 `document_already_finalized` / `document_canceled` |
| `status == 'finalized'` para PDF | service | 400 `document_not_finalized` |
| Cross-tenant | DAO (filtro `clinica_id` em toda query) | 404 genérico |
| `supersedes_document_id` mesma clínica (se presente) | service | 400 |

**Rate limit:** reutiliza `patientsRateLimit` para GETs leves. Para escritas
(`POST /clinical/documents`, `PATCH`, `POST .../finalize`, `POST .../cancel`),
usar `CLINICAL_WRITE_RATE_LIMIT_*` (a 4.3B decide; mesmo padrão da ADR 0010 §12).

## 16. Plano de implementação Sprint 4.3B

Ordem sugerida. Cada passo é um commit independente.

1. **Migration** `20260603000000_clinical_documents_v0.ts`:
   - Tabela `clinical_documents` + índices + CHECK constraints.
   - Reverter (`down`) faz DROP da tabela.
2. **`backend/src/types/db.d.ts`** — adicionar tipo `ClinicalDocumentRow`.
3. **DAO** `clinicalDocumentDao.ts`:
   - `create`, `findByIdForClinic`, `listForClinic` (com filtro de autor),
     `updateDraft` (só campos de rascunho, só se `status='draft'`),
     `finalizeOwn` (CAS), `cancelOwn` (CAS).
   - Sem `DELETE`. Sem `UPDATE` em documento finalizado.
4. **Service** `clinicalDocumentService.ts`:
   - `create`, `getDraft`/`getContent`, `list`, `updateDraft`,
     `finalize`, `cancel`, `getForPdf`.
   - Validações completas conforme §15.
   - `applyVisibilityFilter(doc, userRole, userId)` — reduz o shape
     para leitores sem `body` em listagens; aplica audit antes de
     retornar conteúdo.
5. **Controller + rotas** `clinicalDocuments.ts`:
   - 8 endpoints (§14); montagem em `app.ts`.
6. **Service de PDF** `clinicalDocumentPdfService.ts`:
   - Selecionar + integrar biblioteca (pdfkit recomendado pelo peso; puppeteer
     se HTML-first for preferido — decisão da 4.3B).
   - Gerar PDF on-demand conforme §10.2.
   - Auditoria via `clinicalReadAuditService.recordStrict`.
7. **Logger** — estender redaction com `body` (document), `cancel_reason_text`
   (document); verificar cobertura com teste 4.3B equivalente ao 7/7 PASS.
8. **Smoke tests** (script em `/tmp/`):
   - Criar rascunho → editar → finalizar → ler conteúdo → baixar PDF.
   - Tentar ler documento de outro profissional → 404.
   - Dono lê documento alheio + audit gerado → OK.
   - Gestor lê documento alheio + audit → OK.
   - Secretaria → 403 em todos os endpoints.
   - Tentar PATCH em documento finalizado → 400.
   - Cancelar documento alheio → 404.
   - PDF de documento não-finalizado → 400.
   - PDF com strict audit fail-closed → 500 sem PDF.
   - Body de documento nunca em logs → grep confirmado.
   - Cross-tenant → 404.
   - Paciente arquivado/mesclado → 404 ao criar documento.
9. **SQL checks pós-teste:**
   - `SELECT count(*) FROM clinical_documents WHERE status='finalized' AND finalized_at IS NULL` → 0.
   - `SELECT count(*) FROM clinical_documents WHERE status='canceled' AND cancel_reason_code IS NULL` → 0.
10. **Documentação:** atualizar `CLAUDE.md`, `project-state.md`,
    `sprint-history.md`, `security-notes.md`, `testing-checklist.md`.
11. **Limpeza:** dados sintéticos dos smoke tests removidos; documentos
    ficam se necessário para desenvolvimento (marcar como sintéticos).

## 17. Impacto na trilha AWS

Trilha AWS continua **⏸️ pausada** (ADR 0008 §6 + ADR 0009 §10 + ADR 0010 §16).

| Componente AWS | Impacto do módulo documentos | Ação antes de produção |
|---|---|---|
| **RDS** | `clinical_documents.body` pode ter até 10k chars/documento. Clínica com 10 profissionais × 20 documentos/dia = ~73k docs/ano. `db.t3.micro` ainda suficiente para 5–10 clínicas. | Revisar dimensionamento junto com encounters |
| **S3** | v0.1 **não armazena PDF** — sem impacto. Revisitar se armazenamento de PDF for adicionado. | Sem ação |
| **KMS** | Mesma postura da ADR 0010 §13 — sem cifra de coluna no v0.1. `body` de documento pode conter dado de saúde sensível; revisitar antes de produção real. | Reabrir se validação jurídica exigir cifra |
| **CloudWatch** | Logger redige `body` de documento. Validar em staging que PDF não vaza conteúdo em logs. | Smoke test pós-deploy |
| **Backup** | `clinical_documents` cresce com documentos — incluir em `pg_dump`. | Validar restore drill |

## 18. Riscos

| Risco | Mitigação |
|---|---|
| **Profissional emitindo receita médica sem CRM válido cadastrado** | ClinicBridge não valida registro profissional no v0.1; responsabilidade é do profissional. Aviso na UI. Validação de registro é fase futura. |
| **PDF sendo tratado como documento legalmente válido** | Rodapé obrigatório + aviso na UI (§11.2). Não há como impedir uso indevido, mas a postura é explícita. |
| **Body com PII bruta (ex.: CPF do paciente no texto)** | Texto livre por definição pode conter PII. Logger redige campos; postura = aviso na UI. Sem detecção automática (mesmo princípio da ADR 0010 §12). |
| **Profissional malicioso acumulando documentos de pacientes de outros** | Cláusula `author_user_id = self` no DAO; cross-tenant bloqueado. Detecção retrospectiva via `clinical_read_audit`. |
| **Volume de documentos PDF em memória sob carga** | Geração on-demand sem streaming bufferizado pode ser um problema. A 4.3B avalia timeout e streaming (stream ao invés de buffer). |
| **`metadata_json` contendo dados sensíveis não redados** | Logger redige o campo `metadata_json` via padrão `body/payload.<field>` da camada 2. Confirmar cobertura no smoke test. |
| **Cancelamento de documento após assinatura física** | Documento cancelado no sistema não invalida papel assinado fisicamente. Informar profissional na UI. |
| **Retenção de `clinical_documents` sem política** | Pendente de jurídico externo e ADR 0002 (retenção). Sem política automática no v0.1. |
| **Cifra ausente no dado sensível de documentos** | Mesma postura da ADR 0010 §13 — RDS encryption at rest + TLS + controles de app. Revisável antes de produção real. |
| **Library PDF vulnerável** | Avaliar CVEs da lib escolhida antes do merge; `pnpm audit` no PR. |

## 19. Itens fora do escopo recap (não autorizados por esta ADR)

Esta ADR **NÃO** autoriza, nem na 4.3B nem em sprint subsequente sem ADR nova:

- Prescrição eletrônica ICP-Brasil.
- Qualquer assinatura digital (cert válido ou não).
- Integração com plataformas de e-prescrição (Memed, Mevo, etc.).
- Receituários especiais (azul/amarelo/branco controlado).
- Medicamentos controlados / SNGPC / ANVISA.
- Envio automático por WhatsApp/e-mail do PDF.
- QR code de validação pública.
- Upload de exames / anexos clínicos.
- IA gerando conteúdo.
- Armazenamento persistente de PDF (S3).
- Secretaria ou funcionario_administrativo acessando conteúdo de documentos.
- `admin_sistema` lendo dados de documentos (break-glass).
- Edição/cancelamento de documento alheio por dono/gestor.
- CID estruturado como campo obrigatório.
- Templates por especialidade além dos 5 tipos fixos.
- Versionamento completo de histórico de edições de rascunho.
- Migração de documentos de sistema antigo.
- TISS/TUSS, telemedicina, NFS-e.
- Cópia de UI/textos de Feegow ou concorrentes.

## 20. Notas finais

- Esta ADR **não afirma conformidade jurídica** com LGPD, CFM, CRM, ANVISA,
  ICP-Brasil ou qualquer regulatório. Validação jurídica externa **obrigatória**
  antes de qualquer dado clínico real em produção.
- Esta ADR **autoriza** a Sprint 4.3B a implementar exatamente o descrito
  aqui — **sem desvios**. Qualquer mudança de escopo durante a 4.3B exige
  aditivo a esta ADR.
- Esta ADR **mantém todas as invariantes** vigentes em `docs/security-notes.md`
  e adiciona:
  - Sem `UPDATE` em `body`/`title`/`metadata_json` após `finalized`.
  - Sem `DELETE` em `clinical_documents`.
  - Audit de leitura para todo acesso a conteúdo e download de PDF —
    **fail-closed em produção** (herda `CLINICAL_READ_AUDIT_STRICT`).
  - Logger redige `body` de documento.
  - PDF contém rodapé de aviso obrigatório.
  - `secretaria`/`funcionario_administrativo` nunca acessam conteúdo de
    documentos médicos.
