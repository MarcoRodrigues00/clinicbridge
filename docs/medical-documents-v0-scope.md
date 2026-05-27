# ClinicBridge — Documentos Médicos e Receitas v0.1 (escopo operacional)

> Companheiro operacional da **ADR 0011**
> (`docs/adr/0011-medical-documents-prescriptions-v0.md`). A ADR decide;
> este documento lista **checklists, tabelas e cheat-sheets** consultáveis
> durante a Sprint 4.3B (implementação backend).
>
> **Sprint 4.3A — docs/ADR-only.** Nada aqui autoriza código. Implementação
> técnica fica para a 4.3B (gates: ADR 0011 aceita pelo dono).
>
> **Relacionado:** ADR 0011, ADR 0010, ADR 0009, ADR 0008, ADR 0007,
> `docs/clinical-architecture-and-permissions.md`, `docs/security-notes.md`,
> `docs/product-clinic-os-roadmap.md`, `docs/roadmap-next-phase.md`.

---

## 1. Resumo executivo

| Item | Valor |
|---|---|
| **Módulo** | Documentos Médicos e Receitas |
| **Versão** | v0.1 |
| **Sprint conceitual** | 4.3A (ADR 0011 — entregue) |
| **Sprint de implementação backend** | 4.3B (entregue 2026-05-26; smoke 47/47 PASS) |
| **Sprint de implementação frontend** | 4.3C (entregue 2026-05-26) |
| **Tabelas novas** | 1 (`clinical_documents`) |
| **Endpoints novos** | 8 (ver §5) |
| **Roles novas** | Nenhuma — reutiliza `profissional_clinico`, `gestor_clinica` da ADR 0010 |
| **Migração de dados** | Não no v0.1 |
| **PDF** | Gerado on-demand, não armazenado |
| **Migração estritamente aditiva** | 1 tabela nova + índices; sem coluna em tabela existente |
| **Ambiente de validação** | Local + staging local (Docker compose) |
| **Trilha AWS** | Continua pausada; sem impacto novo no provisionamento |

---

## 2. Tipos de documento v0.1

| `doc_type` | Nome UI | Uso típico | Campos `metadata_json` |
|---|---|---|---|
| `receipt_simple` | Receita simples | Medicamentos não controlados | `medications`, `dosage`, `instructions`, `validity_days` |
| `attestation` | Atestado médico | Afastamento trabalho/escola; declaração de condição | `days_absent`, `start_date`, `end_date`, `cid_free` |
| `declaration` | Declaração de comparecimento | Confirma presença do paciente | `event_date`, `start_time`, `end_time` |
| `exam_request` | Solicitação de exame | Pedido textual de exames lab/imagem | `exams_requested`, `clinical_indication` |
| `orientation` | Orientação / relatório simples | Cuidados pós-consulta; encaminhamento | — (conteúdo livre em `body`) |

**Todos textuais, impressíveis, sem assinatura digital válida. Aviso jurídico obrigatório na UI e no PDF.**

---

## 3. Ciclo de vida e campos

### 3.1 Estados

```
draft ──── PATCH (editar) ───────────────────────►
  │
  │  POST /finalize (body não-vazia)
  ▼
finalized ──── GET conteúdo ─────── GET /pdf ────►
  │
  │  POST /cancel (reason_code obrigatório)
  ▼
canceled  (estado final; sem restore)

draft ──► POST /cancel (descartar rascunho) ──► canceled
```

**Regras invariantes de transição:**
- `draft → finalized`: `body` não pode ser vazia; só o autor.
- `finalized → canceled` e `draft → canceled`: só o autor; `cancel_reason_code` obrigatório.
- **Sem transição reversa.** `canceled` é permanente.
- **Sem delete físico.** Invariante.
- PDF só para `status='finalized'`.

### 3.2 Campos principais

| Campo | Tipo | Limite | Mutabilidade |
|---|---|---|---|
| `doc_type` | enum | — | Imutável após criação |
| `title` | text NOT NULL | 200 chars | Mutável em rascunho; imutável após finalized |
| `body` | text NULL | 10 000 chars | NULL OK em rascunho; obrigatório para finalize; imutável após finalized |
| `metadata_json` | jsonb NULL | validado no service | Mutável em rascunho; imutável após finalized |
| `encounter_id` | uuid NULL | — | Mutável em rascunho |
| `supersedes_document_id` | uuid NULL | — | Referência ao documento cancelado substituído |

### 3.3 Razões de cancelamento

```
cancel_reason_code: 'error' | 'duplicate' | 'patient_request' | 'other'
cancel_reason_text: texto livre ≤ 200 chars (opcional; sem PII; nunca em audit)
```

---

## 4. Matriz de permissões — operação × role

Autoritativa para o v0.1 (cópia da ADR 0011 §7).

Legenda: ✅ permitido · ✅* só os próprios · 👁️ leitura com audit · ❌ bloqueado

| Operação | `dono_clinica` | `gestor_clinica` | `profissional_clinico` | `secretaria` | `admin_sistema` |
|---|---|---|---|---|---|
| Criar rascunho (`POST /clinical/documents`) | ❌ (sem grant) | ❌ | ✅ | ❌ | ❌ |
| Editar rascunho (`PATCH .../id`) | ❌ | ❌ | ✅* (draft + próprio) | ❌ | ❌ |
| Finalizar (`POST .../finalize`) | ❌ | ❌ | ✅* (próprio) | ❌ | ❌ |
| Cancelar rascunho/finalizado (`POST .../cancel`) | ❌ v0.1 | ❌ v0.1 | ✅* (próprio) | ❌ | ❌ |
| Listar documentos (`GET /clinical/documents`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só próprios) | ❌ | ❌ |
| Ler conteúdo (`GET .../id`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só autor) | ❌ | ❌ |
| Baixar PDF (`GET .../id/pdf`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só autor) | ❌ | ❌ |
| Documentos por paciente (`GET /patients/:id/documents`) | 👁️ + audit | 👁️ + audit | ✅* + audit (só próprios) | ❌ | ❌ |
| Cross-tenant (qualquer) | 404 genérico | 404 | 404 | — | — |

**Regras-chave:**
1. **Dono que atende** precisa de `profissional_clinico` em `user_clinical_roles`.
2. **Profissional** edita/finaliza/cancela só os próprios; cláusula `WHERE author_user_id = self` é no DAO.
3. **Dono/gestor** leem qualquer + audit; NÃO criam nem editam documentos alheios.
4. **Secretaria/funcionario_admin** não acessam conteúdo de documentos médicos (dados de saúde sensíveis).
5. **PDF** tem as mesmas permissões de leitura do conteúdo — não é mais permissivo.

---

## 5. Endpoints conceituais — cheat sheet

| Método | Path | Middleware adicional | Audit escrita | Audit leitura |
|---|---|---|---|---|
| POST | `/clinical/documents` | `requireClinicalRole('profissional_clinico')` | `clinical.document.created.success` | — |
| GET | `/clinical/documents` | `requireClinicalRole(['profissional_clinico','gestor_clinica'])` + dono | — | `clinical.document.list` |
| GET | `/clinical/documents/:id` | idem | — | `clinical.document.read` (strict) |
| PATCH | `/clinical/documents/:id` | `requireClinicalRole('profissional_clinico')` | `clinical.document.updated.success` | — |
| POST | `/clinical/documents/:id/finalize` | idem | `clinical.document.finalized.success` | — |
| POST | `/clinical/documents/:id/cancel` | idem | `clinical.document.canceled.success` | — |
| GET | `/clinical/documents/:id/pdf` | `requireClinicalRole(['profissional_clinico','gestor_clinica'])` + dono | — | `clinical.document.pdf.downloaded` (strict) |
| GET | `/patients/:id/documents` | `requireClinicalRole(['profissional_clinico','gestor_clinica'])` + dono | — | `clinical.document.list` |

Todos exigem `requireAuth + requireClinic` antes do `requireClinicalRole`.

Códigos de erro padrão: 400 `clinical_document_invalid`, 400 `document_body_required`,
400 `document_not_draft`, 400 `document_already_finalized`, 400 `document_canceled`,
400 `document_not_finalized`, 403 `forbidden_role`, 404 `document_not_found` /
`patient_not_found` (genéricos — anti-enumeração), 401.

---

## 6. Catálogo de eventos de audit

### 6.1 Escrita (em `audit_logs` existente — sem migration)

| `acao` | Quando | `recurso` | `recurso_id` |
|---|---|---|---|
| `clinical.document.created.success` | criar rascunho | `clinical_document` | UUID do documento |
| `clinical.document.updated.success` | editar rascunho | `clinical_document` | UUID do documento |
| `clinical.document.finalized.success` | finalizar | `clinical_document` | UUID do documento |
| `clinical.document.canceled.success` | cancelar | `clinical_document` | UUID do documento |

**Sem PII em nenhum campo.** Falha de audit de escrita aborta a transação.

### 6.2 Leitura (em `clinical_read_audit` — sem migration; `recurso='document'` já aceito)

| `acao` | Quando | `recurso` | `recurso_id` | `paciente_id` |
|---|---|---|---|---|
| `clinical.document.list` | `GET /clinical/documents` ou `GET /patients/:id/documents` | `document` | NULL | NULL |
| `clinical.document.read` | `GET /clinical/documents/:id` (conteúdo) | `document` | doc UUID | patient UUID |
| `clinical.document.pdf.downloaded` | `GET /clinical/documents/:id/pdf` | `document` | doc UUID | patient UUID |

**Postura de falha (`CLINICAL_READ_AUDIT_STRICT`) — herda exatamente a ADR 0010 §8.2.1:**
- `STRICT=true` (obrigatório em produção): falha de audit → 500 `clinical_read_audit_unavailable`; conteúdo/PDF não sai.
- `STRICT=false` (dev/staging sintético): falha loga `error` e leitura continua.
- **PDF em strict mode:** não é gerado/entregue sem audit persistido.

---

## 7. Logger redaction — campos de documento

Estende as 4 camadas da ADR 0010 com campos de documento:

| Campos adicionados | Cobertura esperada |
|---|---|
| `body` (corpo do documento) | camada `body/req.body/payload.body` (camada 3) |
| `cancel_reason_text` (documento) | camada `*.cancel_reason_text` (camada 2) |
| `metadata_json` (valor bruto jsonb) | padrões `*.metadata_json` + `body/payload.metadata_json` |

A Sprint 4.3B confirma cobertura com teste de leak style "N/N PASS" equivalente ao
7/7 PASS da ADR 0010 §8.4. Payload completo de `/clinical/documents` nunca logado integralmente.

---

## 8. PDF — estrutura e regras

### 8.1 Regras de geração

- Só para `status='finalized'`.
- Gerado on-demand em memória; **não armazenado** no v0.1.
- Audit de leitura `clinical.document.pdf.downloaded` **antes** de gerar — strict mode.
- `Content-Type: application/pdf`; `Content-Disposition: attachment; filename="documento-[id-curto].pdf"`.

### 8.2 Estrutura do PDF

```
[CABEÇALHO]
Nome da clínica | CNPJ (se cadastrado) | Endereço | Telefone

[TÍTULO]
[doc_type label] — [title]

[METADADOS]
Data de emissão: [finalized_at]
Profissional: [nome] — [registro_profissional se cadastrado]
Paciente: [nome] — [data_nascimento]
Atendimento vinculado: #[encounter_id curto] (se presente)

[CONTEÚDO]
[body]

[CAMPOS ESTRUTURADOS por tipo]
(metadata_json renderizado por tipo)

[RODAPÉ OBRIGATÓRIO]
"Este documento foi gerado pelo ClinicBridge e não possui assinatura
digital ICP-Brasil. A validade jurídica plena pode exigir assinatura
física do profissional responsável ou assinatura digital com certificado
válido (ICP-Brasil/CFM). Não é uma prescrição eletrônica legalmente válida."

[ASSINATURA MANUAL]
_________________________
[Nome do profissional]
CRM/CRO/Registro: [XXXXX]
Data: ___/___/______
```

### 8.3 Dados pessoais no PDF

- **Incluídos:** nome do paciente, data de nascimento, nome/registro do profissional.
- **Não incluídos no v0.1:** CPF do paciente (revisável; exige análise de minimização LGPD).
- **Sem QR code** de validação pública no v0.1.
- **Biblioteca PDF:** escolhida na 4.3B (opções: `pdfkit`, `puppeteer`; `pdfkit` preferido pelo peso).

---

## 9. Modelo de dados — cheat sheet

### 9.1 Tabela `clinical_documents` (migration `20260603000000_clinical_documents_v0.ts`)

```text
id                     uuid PK gen_random_uuid()
clinica_id             uuid NOT NULL  FK clinics(id) ON DELETE CASCADE
patient_id             uuid NOT NULL  FK patients(id) ON DELETE RESTRICT
encounter_id           uuid NULL      FK clinical_encounters(id) ON DELETE SET NULL
author_user_id         uuid NOT NULL  FK users(id) ON DELETE RESTRICT
doc_type               text NOT NULL  CHECK IN ('receipt_simple','attestation','declaration','exam_request','orientation')
title                  text NOT NULL  CHECK length(title) <= 200
body                   text NULL      CHECK (body IS NULL OR length(body) <= 10000)
metadata_json          jsonb NULL
status                 text NOT NULL DEFAULT 'draft'  CHECK IN ('draft','finalized','canceled')
finalized_at           timestamptz NULL
finalized_by_user_id   uuid NULL  FK users(id) ON DELETE SET NULL
canceled_at            timestamptz NULL
canceled_by_user_id    uuid NULL  FK users(id) ON DELETE SET NULL
cancel_reason_code     text NULL  CHECK IN ('error','duplicate','patient_request','other')
cancel_reason_text     text NULL  CHECK (cancel_reason_text IS NULL OR length(cancel_reason_text) <= 200)
supersedes_document_id uuid NULL  FK clinical_documents(id) ON DELETE SET NULL
created_at             timestamptz NOT NULL DEFAULT now()
updated_at             timestamptz NOT NULL DEFAULT now()

CHECK (status != 'finalized' OR (finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL))
CHECK (status != 'canceled'  OR (canceled_at  IS NOT NULL AND canceled_by_user_id  IS NOT NULL AND cancel_reason_code IS NOT NULL))
CHECK (status  = 'draft'     OR canceled_at IS NULL OR finalized_at IS NULL)
CHECK (cancel_reason_text IS NULL OR cancel_reason_code IS NOT NULL)
```

### 9.2 Índices

```text
idx_clinical_documents_clinica_patient_created   (clinica_id, patient_id, created_at DESC)
idx_clinical_documents_clinica_author_created    (clinica_id, author_user_id, created_at DESC)
idx_clinical_documents_clinica_status            (clinica_id, status, created_at DESC)
idx_clinical_documents_encounter                 (encounter_id) WHERE encounter_id IS NOT NULL
idx_clinical_documents_supersedes               (supersedes_document_id) WHERE supersedes_document_id IS NOT NULL
```

### 9.3 O que NÃO muda no schema atual

- `clinical_encounters`, `clinical_encounter_notes`, `clinical_read_audit`,
  `user_clinical_roles` — sem coluna nova.
- `patients`, `users`, `clinics`, `audit_logs` — sem coluna nova.
- `clinical_read_audit.recurso` já aceita `'document'` (ADR 0010 §5.3) — sem migration.

Migration da 4.3B é **estritamente aditiva** (1 tabela + índices).

---

## 10. Impacto do merge B-safe (ADR 0007)

| Cenário | Comportamento v0.1 |
|---|---|
| Criar documento para `status='archived'` | 404 `patient_not_found` |
| Criar documento para `merged_into_id IS NOT NULL` | 404 `patient_not_found` |
| Documentos do paciente secundário (mesclado) | permanecem sob o `patient_id` original — sem mistura automática |
| Merge B-safe mover documentos? | **NÃO no v0.1** — ADR de extensão da 0007 necessária |
| `GET /patients/:id/documents` | retorna só documentos desse `patient_id` |

---

## 11. Checklist Sprint 4.3B (implementação backend)

### 11.1 Migration

- [ ] `20260603000000_clinical_documents_v0.ts` (ou timestamp do dia da 4.3B)
- [ ] Tabela `clinical_documents` completa (campos, FKs, CHECK constraints)
- [ ] 5 índices nomeados `idx_clinical_documents_*`
- [ ] `down` faz `DROP TABLE clinical_documents` (reverter limpo)
- [ ] `pnpm --filter backend migrate:latest` sem erro
- [ ] `pnpm --filter backend migrate:status` mostra migration como `done`

### 11.2 Tipos

- [ ] `backend/src/types/db.d.ts` — `ClinicalDocumentRow` com todos os campos
- [ ] `.env.example` — sem env var nova (herda `CLINICAL_READ_AUDIT_STRICT`)

### 11.3 DAO

- [ ] `clinicalDocumentDao.ts`:
  - [ ] `create(input)` — INSERT com `status='draft'`
  - [ ] `findByIdForClinic(id, clinicaId)` — filtro tenant
  - [ ] `listForClinic(clinicaId, filters, selfUserId?)` — filtro `author_user_id = self` para profissional
  - [ ] `updateDraft(id, clinicaId, authorId, updates)` — CAS: só `status='draft'` + autor
  - [ ] `finalizeOwn(id, clinicaId, userId)` — CAS: só `status='draft'` + autor; seta `finalized_at`/`finalized_by_user_id`
  - [ ] `cancelOwn(id, clinicaId, userId, reasonCode, reasonText?)` — CAS; funciona em draft e finalized
  - [ ] **Sem `DELETE`** — invariante

### 11.4 Service

- [ ] `clinicalDocumentService.ts`:
  - [ ] `create` — valida patient ativo+não-mesclado; valida encounter_id (se presente); valida doc_type; valida metadata_json por tipo; gera title default; emite audit escrita
  - [ ] `list` — delega ao DAO com filtros validados; emite `clinical.document.list`
  - [ ] `getContent` — delega ao DAO; emite `clinical.document.read` (strict mode); retorna documento completo
  - [ ] `updateDraft` — valida status='draft'; valida author; emite audit escrita
  - [ ] `finalize` — valida body não-vazia; emite audit escrita
  - [ ] `cancel` — valida reason_code ∈ allowlist; emite audit escrita
  - [ ] `getForPdf` — valida status='finalized'; emite `clinical.document.pdf.downloaded` (strict mode)
  - [ ] `applyVisibilityFilter` — em listagens, profissional só vê próprios; dono/gestor veem todos
- [ ] `clinicalDocumentPdfService.ts`:
  - [ ] integra biblioteca PDF (`pdfkit` ou decisão da 4.3B)
  - [ ] estrutura obrigatória: cabeçalho, metadados, body, campos por tipo, rodapé legal
  - [ ] rodapé com aviso ICP-Brasil obrigatório (texto exato da ADR 0011 §10.2)
  - [ ] streaming ao invés de buffer (avaliar para evitar pressão de memória)

### 11.5 Controller + rotas

- [ ] `routes/clinicalDocuments.ts` — 8 endpoints (§14 da ADR 0011); rate limit herdado
- [ ] Montagem em `app.ts`
- [ ] Validação de input no edge; service faz lógica

### 11.6 Logger

- [ ] Estender redação com: `body` (document body), `cancel_reason_text` (documento), `metadata_json`
- [ ] Confirmar que `payload.body` e `payload.metadata_json` são cobertos
- [ ] Rodar teste de leak equivalente ao 7/7 PASS; confirmar N/N PASS antes do commit

### 11.7 Smoke tests (script `/tmp/`)

- [ ] Criar rascunho → 201; `status='draft'`
- [ ] Editar rascunho → 200; campos atualizados
- [ ] Tentar editar após finalizar → 400 `document_already_finalized`
- [ ] Finalizar rascunho (body preenchido) → 200; `status='finalized'`
- [ ] Tentar finalizar sem body → 400 `document_body_required`
- [ ] Baixar PDF de documento finalizado → 200; `Content-Type: application/pdf`; rodapé presente
- [ ] Cancelar documento finalizado → 200; `status='canceled'`
- [ ] Tentar PDF de documento cancelado → 400 `document_canceled`
- [ ] Profissional B tenta ler documento do profissional A → 404 (anti-enumeração)
- [ ] Profissional B tenta cancelar documento do profissional A → 404
- [ ] Dono lê documento alheio → 200 + `clinical_read_audit` row inserida
- [ ] Gestor lê documento alheio → 200 + audit inserida
- [ ] Secretaria → 403 em todos os endpoints de documento
- [ ] Admin_sistema → bloqueia antes de `requireRole` (403/no_clinic_context)
- [ ] Cross-tenant → 404
- [ ] Paciente arquivado/mesclado → 404 ao criar documento
- [ ] Strict mode fail-closed → `GET .../id` com audit failure → 500 sem conteúdo; PDF não entregue
- [ ] Body do documento nunca em logs → grep confirmado

### 11.8 SQL checks pós-teste

```sql
-- 0 linhas (finalized sem finalized_at)
SELECT count(*) FROM clinical_documents WHERE status='finalized' AND finalized_at IS NULL;
-- 0 linhas (canceled sem reason_code)
SELECT count(*) FROM clinical_documents WHERE status='canceled' AND cancel_reason_code IS NULL;
-- audit de escrita presente
SELECT acao, recurso, recurso_id FROM audit_logs WHERE acao LIKE 'clinical.document.%' ORDER BY criado_em DESC LIMIT 10;
-- audit de leitura presente
SELECT acao, recurso FROM clinical_read_audit WHERE recurso='document' ORDER BY criado_em DESC LIMIT 10;
```

### 11.9 Limpeza

- [ ] Documentos sintéticos dos smoke tests removidos (ou marcados claramente como `sintético`)
- [ ] `audit_logs` e `clinical_read_audit` preservados (audit é append-only; FK SET NULL)
- [ ] Build/typecheck OK: `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅
- [ ] Sem commit automático

### 11.10 Documentação (4.3B)

- [ ] `CLAUDE.md` (sprint atual, migration, endpoints, restrições críticas)
- [ ] `docs/project-state.md`
- [ ] `docs/sprint-history.md`
- [ ] `docs/security-notes.md` (estender seção clínica com documentos)
- [ ] `docs/testing-checklist.md` (bloco Sprint 4.3B)

---

## 12. Checklist Sprint 4.3C (implementação frontend — entregue 2026-05-26)

- [x] Aba/seção "Documentos" dentro do drawer `ClinicalPatientPane` (tab bar Atendimentos | Documentos)
- [x] Seletor de tipo de documento (`doc_type`)
- [x] Formulário de criação (tipo, título opcional, corpo)
- [x] **Alerta permanente visível** sobre limitação jurídica (ADR 0011 §10.2; orienta assinar externamente + Gov.br/ITI)
- [x] Botão "Finalizar" com confirmação implícita (action button)
- [x] Lista de documentos com badge de status (Rascunho / Finalizado / Cancelado)
- [x] Botão "Baixar PDF" apenas para `finalized`
- [x] Nota "PDF não sai assinado pelo ClinicBridge" junto ao botão
- [x] `staleTime: 0` para listas e detalhes clínicos
- [x] Sem `dangerouslySetInnerHTML`; sem dado clínico em URL/query string; token nunca em URL do PDF
- [x] 401/403 → mensagem genérica segura
- [x] PDF layout v2 (nome acima da linha de assinatura, caixa metadados bordada, label strip CONTEÚDO, min-height 200pt, rodapé cita VALIDAR Gov.br/ITI + GOV.BR)
- [x] Botão "Como assinar e validar →" com passo a passo inline (SignGuide); guia visual com prints: sprint futura
- [x] Linguagem: "Emitir documento" / "Documentos do paciente" (não "prescrição eletrônica")

---

## 13. Validações — cheat sheet

| Regra | Onde | Erro |
|---|---|---|
| `patient_id` ativo + não-mesclado | service | 404 `patient_not_found` |
| `patient_id` mesma clínica | DAO (filtro tenant) | 404 |
| `encounter_id` mesmo `patient_id` + mesma clínica | service | 400 `clinical_document_invalid` |
| `doc_type` ∈ allowlist | service | 400 `clinical_document_invalid` |
| `title` ≤ 200 chars | DB CHECK + service | 400 |
| `body` ≤ 10 000 chars | DB CHECK + service | 400 |
| `body` não-vazio na finalização | service | 400 `document_body_required` |
| `metadata_json` válido por `doc_type` | service | 400 `clinical_document_invalid` |
| `cancel_reason_text` ≤ 200 chars | DB CHECK + service | 400 |
| `cancel_reason_code` ∈ allowlist | service | 400 `clinical_document_cancel_invalid` |
| `author_user_id == self` (editar/finalizar/cancelar) | DAO CAS | 404 genérico |
| `status == 'draft'` para PATCH e finalize | service | 400 `document_already_finalized` / `document_canceled` |
| `status == 'finalized'` para PDF | service | 400 `document_not_finalized` |
| `supersedes_document_id` mesma clínica (se presente) | service | 400 |
| Cross-tenant | DAO (filtro `clinica_id`) | 404 genérico |

**Rate limit:** reutiliza `patientsRateLimit` para GETs leves. Escritas usam
`CLINICAL_WRITE_RATE_LIMIT_*` (decisão da 4.3B; mesmo padrão da ADR 0010 §12).

---

## 14. Cifra — decisão consciente (herda ADR 0011 §18)

**v0.1 não usa cifra a nível de coluna** em `clinical_documents.body`. Confia em:

1. RDS encryption at rest (cifra de bloco).
2. TLS in transit.
3. Controles de aplicação (`requireAuth` + `requireClinic` + `requireClinicalRole` + tenant filter no DAO).
4. Audit de leitura fail-closed (`CLINICAL_READ_AUDIT_STRICT=true` em produção).
5. Logger redindo `body` de documento.

**Revisão obrigatória antes de produção.** `body` de `attestation` pode conter dado de
saúde sensível (diagnóstico, CID livre). Se validação jurídica ou regulatória exigir
cifra de coluna, abrir sprint dedicada com KMS CMK.

---

## 15. Itens explicitamente fora do v0.1

Reprodução compacta da ADR 0011 §4 e §19:

- Prescrição eletrônica ICP-Brasil; qualquer assinatura digital; Memed/Mevo.
- Receituários especiais (azul/amarelo/branco controlado); medicamentos controlados; SNGPC/ANVISA.
- CID estruturado obrigatório; validação de CRM/CRO.
- Envio automático de PDF por WhatsApp/e-mail.
- QR code de validação pública; NFS-e.
- Upload de exames/anexos clínicos.
- IA gerando conteúdo de documento.
- Armazenamento persistente de PDF (S3).
- Templates por especialidade além dos 5 tipos fixos.
- Versionamento completo de histórico de edições de rascunho.
- Secretaria/funcionario_admin acessando conteúdo.
- `admin_sistema` lendo dados de documentos (break-glass — ADR própria).
- Edição/cancelamento de documento alheio por dono/gestor.
- Migração de documentos de sistema antigo.
- TISS/TUSS; telemedicina; portal do paciente.
- Cópia de UI/textos de Feegow ou concorrentes.

---

## 16. Referências

- `docs/adr/0011-medical-documents-prescriptions-v0.md` (esta sprint)
- `docs/adr/0010-clinical-encounters-medical-record-v0.md`
- `docs/adr/0009-clinical-architecture-roles-read-audit.md`
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- `docs/adr/0007-safe-patient-duplicate-resolution.md`
- `docs/clinical-architecture-and-permissions.md`
- `docs/clinical-encounters-v0-scope.md`
- `docs/security-notes.md`
- `docs/product-clinic-os-roadmap.md`
- `docs/roadmap-next-phase.md`
