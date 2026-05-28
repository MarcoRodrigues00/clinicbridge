# ClinicBridge — Histórico de Sprints (2.0 → 2.26)

> Histórico detalhado movido do `CLAUDE.md` na Maintenance Sprint de compactação
> (2026-05-22). O `CLAUDE.md` mantém só o estado resumido e as regras críticas;
> este arquivo guarda as decisões por sprint para consulta das próximas sprints.
> Ordem: ascendente por número de sprint.

---

## Sprint 1.5 (auth hardening)

**Env vars (see .env.example):**
- FRONTEND_ORIGIN (CORS allowlist, comma-separated; "*" proibido em produção)
- AUTH_RATE_LIMIT_WINDOW_MS (padrão 900000)
- AUTH_RATE_LIMIT_MAX (padrão 20)

**Notes:**
- audit_logs é append-only no DAO (sem update/delete).
- requestId middleware roda antes das rotas; toda resposta carrega X-Request-Id.
- helmet e CORS restrito aplicados globalmente; rate limit aplicado só em /auth/*.
- GET /auth/me requer Bearer token e devolve user + clinic.

---

## Sprint 2 (upload skeleton — sem parse/migração)

**Env vars (see .env.example):**
- UPLOAD_DIR (padrão ./storage/uploads; storage privado, fora de pasta pública)
- UPLOAD_MAX_BYTES (padrão 5242880 = 5MB)

**Endpoints:**
- POST /import-files/upload (requireAuth + requireClinic; multipart campo "file")
- GET /import-files (requireAuth + requireClinic; lista da clínica autenticada)

**Notes:**
- importFileDao só tem create + listByClinic (sempre filtra clinica_id; sem update/delete).
- Arquivo salvo em UPLOAD_DIR/<clinica_id>/<uuid>.<ext>; nunca usa o nome original como path.
- multer usa memoryStorage; valida extensão (.csv/.xlsx) + MIME declarado + tamanho.
- SHA-256 calculado e gravado; audit import_file.upload.success por upload.
- PublicImportFile nunca expõe nome_interno nem caminho do servidor.

---

## Sprint 2.1 (hardening leve do upload)

**Env vars (see .env.example):**
- UPLOAD_RATE_LIMIT_WINDOW_MS (padrão 900000)
- UPLOAD_RATE_LIMIT_MAX (padrão 30)

**Notes:**
- uploadRateLimit aplicado só em POST /import-files/upload (não afeta /auth nem o GET).
- Checagem leve de conteúdo (utils/fileContent.ts) antes de salvar: CSV = texto legível (rejeita NUL/binário); XLSX = assinatura ZIP "PK". NÃO é parser.
- Falha → 400 invalid_file_content ("Arquivo inválido ou incompatível.").
- audit import_file.upload.failure (best-effort) para extensão/MIME, conteúdo, ausência e tamanho; sem nome de arquivo nem conteúdo.
- Mensagens de erro padronizadas: file_required, invalid_file_type, invalid_file_content, file_too_large (com limite real do env).
- Pendente para Sprint 3: MIME real por magic bytes completo, download assinado.

---

## Sprint 2.2 (parse + preview — sem gravar pacientes)

**Env vars (see .env.example):**
- PREVIEW_MAX_ROWS (padrão 10)
- PREVIEW_MAX_COLUMNS (padrão 30)

**Endpoint:**
- GET /import-files/:id/preview (requireAuth + requireClinic; escopado por clinica_id)

**Notes:**
- Parse: CSV via csv-parse (entry principal, callback; detecta , ou ;); XLSX via exceljs (1ª planilha; NÃO executa fórmula). Escolhido exceljs (doc §1.17) em vez de xlsx por seguranca (CVE-2023-30533 no xlsx do npm).
- importFileDao.findByIdForClinic filtra por id + clinica_id (404 genérico para outra clínica/inexistente).
- Preview limitado: PREVIEW_MAX_ROWS linhas, PREVIEW_MAX_COLUMNS colunas, célula truncada em 500 chars; nunca retorna o arquivo inteiro.
- Resposta: { file, summary{detected_columns,total_preview_rows,preview_limited,warnings}, suggested_mapping, rows }.
- Nunca expõe nome_interno/caminho; nunca loga conteúdo/cabeçalhos; audit import_file.preview.success/failure.
- NÃO grava pacientes, NÃO importa para o banco, NÃO exporta, NÃO faz download.

---

## Sprint 2.3 (frontend only)

- ImportPreviewPanel: mapeamento sugerido em formato "Nome → coluna", contagem "Pré-visualizando X linhas", aviso quando preview_limited, headers da tabela sem caixa-alta forçada (mantém nome original do arquivo).
- Seção "Confirmar mapeamento de colunas": selects para Nome/Telefone/E-mail/CPF/Data de nascimento, iniciados pelo suggested_mapping, com opção "Não mapear".
- Estado do mapeamento é SÓ local (useState); avisos locais de UX (nome obrigatório; telefone OU e-mail).
- Sem backend novo, sem persistência, sem importação. Painel é remontado por arquivo via key={preview.file.id} para re-semear a sugestão.

---

## Sprint 2.4 (frontend only)

- Botão "Verificar dados" roda validação LOCAL sobre as rows do preview com o mapeamento escolhido. Não chama backend, não persiste, não importa.
- Seção "Confirme o que cada coluna representa" (copy nova); fallback de sugestão no frontend (FALLBACK_SYNONYMS) preenche alvo que o backend deixou null (ex.: "Data Nasc.").
- Validações: nome (vazio=erro, <3=aviso), telefone (10–13 dígitos), e-mail (regex simples=erro), CPF (11 dígitos; ausente=aviso; nunca mostra o CPF na mensagem), data nascimento (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY; futuro/idade>120=aviso), contato (sem telefone nem e-mail=aviso).
- Resultado: "Resultado da verificação" com contagens + lista "Linha N: problema"; células destacadas (cor + marca ✗/⚠ + title/aria-label, não só cor). Trocar select limpa o resultado.
- Mensagem de linha NÃO inclui conteúdo sensível (sem CPF/valor da célula).

---

## Sprint 2.5 (frontend only)

- Mensagens humanizadas (ex.: "Nome não informado", "E-mail em formato inválido").
- Resultado separado por gravidade: Erros / Avisos / Possíveis duplicados.
- Detecção de possíveis duplicados SÓ nas rows do preview e SÓ com colunas mapeadas+preenchidas: CPF (dígitos), e-mail (lowercase), telefone (dígitos), nome+data de nascimento (nome normalizado + data). Duplicado é aviso, não bloqueia; mensagem nunca mostra CPF.
- Aviso local quando a mesma coluna é usada em mais de um campo (não bloqueia).

---

## Sprint 2.6 (validação backend full-file — modo relatório)

**Env vars (see .env.example):**
- VALIDATION_MAX_ROWS (padrão 20000)
- VALIDATION_MAX_ISSUES_RETURNED (padrão 100)

**Endpoint:**
- POST /import-files/:id/validate (requireAuth + requireClinic; body { mapping })

**Notes:**
- Parse de CSV/XLSX foi extraído para services/importParse.ts (parseImportFile + deriveColumns), compartilhado por preview e validação (sem duplicar lógica de leitura de arquivo não confiável). Preview foi refatorado para usar; comportamento preservado.
- importValidationService: valida mapping (shape + nome obrigatório + telefone|email + coluna existe), analisa até VALIDATION_MAX_ROWS, retorna ImportValidationReport. NÃO grava pacientes, NÃO persiste mapping.
- Relatório: contagens (valid/avisos/erros por linha), duplicate_groups, field_stats (empty/invalid), issues (cap VALIDATION_MAX_ISSUES_RETURNED, errors primeiro; issues_truncated). validation_limited quando arquivo > VALIDATION_MAX_ROWS.
- Issues NUNCA contêm valores de célula (sem CPF/telefone/e-mail/nome); resposta sem path/nome_interno.
- Erros: 400 validation_mapping_invalid, 404 import_file_not_found, 400 invalid_file_validation. Audit import_file.validation.success/failure.
- Frontend: botão "Verificar dados" agora chama o backend (loading "Verificando arquivo…"); validação local antiga removida (só pré-condições de mapping). Tabela do preview sem destaque de célula.

---

## Sprint 2.7 (frontend only)

- Relatório extraído para components/ValidationReport.tsx (+ .module.css); ImportPreviewPanel só renderiza <ValidationReport report={report} />.
- Cards de resumo (ícone+label+número, responsivos, não só cor): linhas analisadas/válidas/avisos/erros/possíveis duplicados.
- Mensagem interpretativa por estado (sem erro = "nenhum erro bloqueante"; com avisos/duplicados = orientação); sempre "Nenhum dado foi importado ainda".
- Blocos Erros/Avisos/Possíveis duplicados com título + contador + explicação; listas mostram 10 e expandem com "Ver mais/Ocultar" (state local, sem nova chamada).
- Avisos de validation_limited e issues_truncated reescritos de forma amigável (derivados dos flags, não do texto cru do backend; demais warnings, ex. multi-planilha, mantidos).
- Sem backend, sem persistência, sem importação, sem PII nos textos.

---

## Sprint 2.8 (amostragem balanceada das issues)

- importValidationService.selectIssueSample(errors, warnings, duplicates, cap): substitui o slice global. Quotas ~40% erros (ceil), ~40% avisos, ~20% duplicados reservados; sobra redistribuída erros>avisos>duplicados. Ordem final: erros, avisos, duplicados.
- Garante que duplicados e erros não fiquem escondidos por avisos quando issues_truncated. duplicate_groups continua contando TODOS os grupos; issues_returned = tamanho da amostra; issues_truncated = total > amostra.
- Mensagem de truncamento reescrita (sem "primeiros N"). Frontend filtra a nova string e mostra banner amigável próprio.
- Mensagens nunca expõem CPF/telefone/e-mail/nome.

---

## Sprint 2.9 (frontend only — qualidade por campo)

- ValidationReport ganhou a seção "Qualidade por campo" (componente FieldQuality) usando report.field_stats; sem alterar backend (field_stats já estava completo: mapped_column/empty/invalid por campo mapeado; campos não mapeados ficam ausentes).
- Por campo: coluna mapeada + "{n} vazios · {n} inválidos" + status (OK / Atenção [só vazios] / Revisar [há inválidos] / Não mapeado [ausente do field_stats]). Status por texto+ícone+badge (não só cor); grid responsivo.
- Nunca mostra valores de célula (só contagens e nome da coluna).

---

## Sprint 2.10 (sessão de migração — sem importar pacientes)

**Endpoints:**
- POST /import-sessions (requireAuth + requireClinic; body { import_file_id, mapping })
- GET /import-sessions ; GET /import-sessions/:id

**Notes:**
- Tabela import_sessions (migration 20260523000000). Colunas no padrão do projeto: clinica_id, import_file_id, usuario_id, status (check), mapping_json, validation_summary_json, field_stats_json, issues_sample_json, criado_em, atualizado_em. NÃO é a tabela `migrations` do doc (essa fica para a importação real). NÃO cria patients/migration_errors.
- Guarda apenas mapping + resumo/stats + amostra de issues (line + label seguros). NUNCA linhas/valores de pacientes (CPF/telefone/e-mail/nome), NUNCA nome_interno/path.
- importSessionService.create REEXECUTA importValidationService.generateReport (não confia no relatório do cliente) e deriva o mapping salvo de report.field_stats[*].mapped_column. status = 'validated'.
- importSessionDao: create + listByClinic + findByIdForClinic (sempre filtra clinica_id; sem update/delete). jsonb stringificado no insert.
- PublicImportSession expõe file via toPublicImportFile (sem path/nome_interno). Audit import_session.created / import_session.create_failed.
- Frontend: botão "Salvar revisão da migração" no ImportPreviewPanel (após o relatório); copy "Nenhum paciente foi importado". Sem botão "Importar".

---

## Sprint 2.11 (frontend only — revisões salvas)

- ImportSessionsList (em /app, abaixo do UploadPanel) consome GET /import-sessions; "Abrir revisão" abre o detalhe LOCALMENTE (a lista já traz a sessão completa) — sem GET /:id extra.
- Detalhe reaproveita ValidationReport montando { file, summary: validation_summary, field_stats, issues: issues_sample } + bloco de mapeamento salvo (Nome → coluna / Não mapeado).
- Refresh: Dashboard tem sessionsRefresh; UploadPanel recebe onSessionSaved e repassa ao ImportPreviewPanel, que chama após salvar; ImportSessionsList refaz fetch quando refreshKey muda. Também há botão "Atualizar revisões".
- Sem endpoint novo, sem importação, sem patients, sem PII (só nome do arquivo, contagens, colunas mapeadas, status/data).

---

## Sprint 2.12 (simulação de importação — NÃO importa pacientes)

**Env vars (see .env.example):**
- DRY_RUN_MAX_ROWS (padrão 20000)
- DRY_RUN_MAX_ISSUES_RETURNED (padrão 100)
- DRY_RUN_SAMPLE_ROWS (padrão 20)

**Endpoint:**
- POST /import-sessions/:id/dry-run (requireAuth + requireClinic; escopado por clinica_id)

**Notes:**
- Criou tabela administrativa `patients` (migration 20260524000000) com clinica_id, nome, telefone, email, cpf, data_nascimento, criado_em, atualizado_em. Tabela permanece VAZIA — nenhum INSERT é feito nesta sprint.
- importDryRunService reexecuta o parse + validação e classifica cada linha em would_import / blocked / needs_review (mapping vem de field_stats da sessão). NÃO grava patients, NÃO persiste o resultado.
- Resposta: { session_id, file, summary (totais por categoria + issues_returned/truncated), issues (amostra balanceada), sample_rows (até DRY_RUN_SAMPLE_ROWS) }. Sample_rows expõe apenas presença (contato: email/telefone/email_telefone/none, has_cpf, has_data_nascimento) — NUNCA o valor do CPF/telefone/e-mail/nome.
- Audit import_session.dry_run.success / import_session.dry_run.failure.
- Frontend: botão "Simular importação" no detalhe da revisão (ImportSessionsList) com loading "Simulando importação…"; DryRunResult mostra cards (analisadas/seriam importadas/bloqueadas/com avisos/possíveis duplicados) + banner "Esta foi apenas uma simulação. Nenhum paciente foi importado." + amostra de linhas + pontos de atenção. Trocar/fechar a revisão limpa o estado do dry-run. Nenhum botão "Importar pacientes" é exposto.

---

## Sprint 2.13 (frontend only — polimento UX do dry-run)

- DryRunResult agora separa visualmente: resumo interpretativo (frases por contagem: blocked/warnings/duplicates), "Amostra de linhas" e três grupos por severidade ("Erros bloqueantes", "Avisos", "Possíveis duplicados") com título, contagem (vinda do summary), explicação curta e listas recolhíveis.
- Limites visuais: 10 itens iniciais na amostra de linhas, 8 itens iniciais por grupo de pontos de atenção. Botões "Ver mais …/Ocultar …" com state local (sem nova chamada ao backend).
- Listas expandidas usam `max-height` com `overflow-y: auto` (.scrollList) para evitar parede infinita; cards e grupos têm borda colorida + ícone + texto (não só cor).
- Amostra de linhas usa badge de status ("Seria importada"/"Bloqueada"/"Precisa revisão") + chips compactos para Contato/CPF/Data nasc. — somente PRESENÇA (sem valores).
- Nota "Mostramos uma amostra. O arquivo tem mais ocorrências dessa categoria." aparece por grupo quando issues_truncated e total > sample.
- Sem novo endpoint, sem importação, sem patients, sem PII (nada de CPF/telefone/e-mail/nome). `summary.issues_truncated` (string genérica do backend) deixou de ser exibido como banner global porque a mensagem por grupo cobre melhor o caso.

---

## Sprint 2.14 (correções do dry-run — amostra balanceada + expansão)

- Backend: `importDryRunService` ganhou `selectDryRunIssueSample(errors, warnings, duplicates, cap)` (mesma regra da Sprint 2.8 do `importValidationService`): ~40% erros (ceil), ~40% avisos (floor), ~20% duplicados reservados; sobra redistribuída errors > warnings > duplicates. Substitui o `slice(0, cap)` global que escondia os duplicados quando avisos enchiam a fatia. `summary.issues_truncated` continua refletindo `totalIssues > issues.length`. Mensagens seguem sem PII (nada de CPF/telefone/e-mail/nome real).
- Frontend (`DryRunResult`): removida a classe `.scrollList` (max-height 22rem) que travava a expansão — após "Ver mais …" a lista cresce naturalmente; o limite por sample no backend já previne parede infinita e o botão "Ocultar …" mantém o controle do usuário.
- Frontend: labels passaram a usar "+N" — "Ver mais avisos (+N)" / "Ocultar avisos" (e equivalentes para erros, duplicados, linhas da amostra).
- Frontend: mensagem genérica "Nenhum item nesta amostra" virou contextual — quando `totalCount > 0` e a amostra do grupo está vazia, exibe "Existem N {erros bloqueantes|avisos|possíveis duplicados} no arquivo, mas nenhum exemplo foi incluído nesta amostra." (fallback caso o limite de issues seja muito apertado).

---

## Sprint 2.15 (preparação para importação — NÃO importa pacientes)

**Endpoint:**
- POST /import-sessions/:id/mark-ready (requireAuth + requireClinic; escopado por clinica_id)

**Notes:**
- Backend reexecuta o dry-run no `importSessionService.markReady` (NÃO confia em contagens do cliente) e só avança se `blocked_count === 0` e `would_import_count > 0`. Erros: 404 import_session_not_found, 400 import_session_invalid_status (status != validated), 400 import_session_has_blocking_errors, 400 import_session_nothing_to_import, 400 import_session_mark_ready_failed.
- `importSessionDao.updateStatusForClinic(id, clinica_id, from, to)` filtra por `clinica_id` + `status` esperado (tenant + transição) e atualiza `atualizado_em`. Sem update/delete livre.
- Transição implementada nesta sprint: `validated` → `ready_for_import`. Nenhum outro status muda. Nenhum INSERT em `patients`. Nenhum endpoint que importe pacientes foi adicionado.
- Audit: `import_session.mark_ready.success` / `import_session.mark_ready.failure` (independente dos audits internos do dry-run).
- Frontend: nova seção "Preparação para importação" no detalhe da revisão (ImportSessionsList), com checklist (revisão salva / simulação executada / sem linhas bloqueadas / avisos / possíveis duplicados / nenhum paciente importado) e botão "Marcar como pronta para importação". Botão só é habilitado se `status === 'validated' && dryRunDone && blocked_count === 0 && would_import_count > 0`. Sem botão "Importar pacientes".

---

## Sprint 2.16 (importação real controlada)

**Env vars (see .env.example):**
- IMPORT_MAX_ROWS (padrão 100)

**Endpoint:**
- POST /import-sessions/:id/import (requireAuth + requireClinic; escopado por clinica_id)

**Notes:**
- `importDryRunService` refatorado: nova função interna `classifySession(session, clinicId)` retorna `{ report, drafts }` em uma única passagem; `run()` usa para a simulação (status='validated') e `classifyForImport(sessionId, clinicId)` (status='ready_for_import', sem audit) é consumida pelo novo serviço de execução. Mesma regra de classificação + dedup que o dry-run — single source of truth.
- `importExecutionService.executeImport(sessionId, actor, ctx)`: (1) tenant + status check; (2) reexecuta classificação; (3) aborta com 400 se `blocked_count > 0`, `would_import_count <= 0` ou `would_import_count > IMPORT_MAX_ROWS`; (4) CAS `ready_for_import → import_started`; (5) em UMA transação: `INSERT INTO patients` (bulk, sem RETURNING) + UPDATE para `import_completed`; (6) qualquer erro dentro da transação dá rollback e a sessão é movida para `failed`.
- patients inserido: clinica_id, import_session_id, nome (trimmed), telefone (só dígitos), email (lowercase), cpf (só dígitos quando 11), data_nascimento (ISO), convenio=null, numero_carteirinha=null, status='active', origem='import'. Nenhum dado clínico, nada vindo do cliente.
- Audits: `import_session.import.started` / `import_session.import.completed` / `import_session.import.failed`. Resposta: `{ result: { session_id, status: 'completed', summary: { session_id, imported_count, skipped_count, total_rows_analyzed, status: 'completed', patients_created } } }` — sem PII.
- Erros: 404 import_session_not_found, 400 import_session_not_ready, 400 import_session_has_blocking_errors, 400 import_session_nothing_to_import, 400 import_limit_exceeded, 500 import_execution_failed.
- Frontend: nova seção "Importação controlada" no detalhe da revisão — só aparece quando `status === 'ready_for_import'` ou `status === 'import_completed'`. Em `ready_for_import`: checkbox de confirmação ("Entendo que esta ação criará pacientes administrativos.") + botão "Executar importação controlada" (habilita só com checkbox + sem loading). Em `import_completed`: mensagem "Importação concluída. X pacientes administrativos foram criados." Sem botão "Importar pacientes" — só este botão controlado.

---

## Sprint 2.17 (correções de fluxo simulação/importação)

- Backend: `POST /import-sessions/:id/dry-run` agora aceita os statuses `validated`, `ready_for_import` e `import_completed` (lista `DRY_RUN_ALLOWED_STATUSES` no `importDryRunService`). Demais statuses (`import_started`, `failed`, `cancelled`) retornam `400 import_session_invalid_status_for_dry_run` com mensagem "Esta revisão não pode ser simulada no status atual." O dry-run continua read-only — nenhum INSERT em `patients`.
- Importação real (`POST /import-sessions/:id/import`) **não** mudou: continua exigindo `ready_for_import` (CAS) + reexecutando classifySession + IMPORT_MAX_ROWS + transação. `import_completed` segue impossível de reimportar (status check + CAS).
- Frontend: novo subcomponente `DryRunSection` no `ImportSessionsList` adapta o label do botão ao status (`Simular importação` / `Simular novamente` / `Ver simulação` para `import_completed`) e desabilita visualmente para statuses não permitidos.
- Frontend: `ImportExecutionSection` agora exige uma simulação visual nesta abertura do detalhe (`dryRun !== null`) além de `status === 'ready_for_import'`, `blocked_count === 0`, `would_import_count > 0` e checkbox marcado. Quando `dryRun === null` aparece o aviso "Execute a simulação antes de importar." (checkbox desabilitado). Em `import_completed` o bloco mostra "Importação concluída." + "Esta revisão não pode ser importada novamente." sem expor botão.

---

## Sprint 2.18 (recibo persistido da importação)

- Migration `20260525000000_import_sessions_summary.ts` adiciona em `import_sessions`: `import_summary_json` (jsonb null), `imported_at` (timestamptz null), `imported_by_user_id` (uuid null, FK users ON DELETE SET NULL) + índice `idx_import_sessions_imported_at`. Sem PII.
- `importSessionDao.markCompletedForClinic(id, clinica_id, summary, importedByUserId, conn?)` faz a transição `import_started → import_completed` (CAS) gravando summary + imported_at + imported_by_user_id + atualizado_em em uma única update. Pensado para rodar dentro da `trx` do import — patients, status e recibo são commitados atomicamente.
- `importExecutionService.executeImport` agora monta o summary dentro da transação (inclui `import_max_rows = env.IMPORT_MAX_ROWS`), chama `markCompletedForClinic` (CAS preserva idempotência) e reutiliza o mesmo summary na resposta. Em qualquer falha dentro da transação, rollback derruba o INSERT em patients **e** a gravação do recibo; o status vai para `failed` no catch.
- `ImportExecutionSummary` ganhou `import_max_rows`. `PublicImportSession` ganhou `import_summary: ImportExecutionSummary | null` e `imported_at: Date | null`. `toPublicImportSession` propaga os dois (e nenhum dado de usuário/PII além do timestamp).
- Importações pré-2.18 ficam com `import_summary_json = null` e `imported_at = null` (esperado — campos novos). UI faz fallback para "Importação concluída." sem o bloco de recibo.
- Frontend: novo subcomponente `ImportReceipt` mostra "Recibo da importação" com cards de Concluída em / Pacientes criados / Linhas analisadas / Linhas puladas / Limite por execução / Status. Prefere o `liveResult` (logo após importar), cai para `session.import_summary` no GET — garante persistência após reload. Mensagem fixa: "Este resumo contém apenas contagens e metadados da execução. Nenhum dado clínico foi importado." + "Esta revisão já foi importada e não pode ser executada novamente."

---

## Sprint 2.19 (listagem somente leitura de pacientes)

**Env vars (see .env.example):**
- PATIENTS_LIST_DEFAULT_LIMIT (padrão 50) — page size quando `?limit` é omitido
- PATIENTS_LIST_MAX_LIMIT (padrão 100) — teto para `?limit` enviado pelo cliente

**Endpoint:**
- GET /patients (requireAuth + requireClinic; escopado por clinica_id; query `search`, `limit`, `offset`)

**Notes:**
- `models/patient.ts`: novo `PublicPatient` + `maskCpf(cpf)` (`12345678901 → ***.***.789-01`; null para vazio/não-11-dígitos) + `toPublicPatient`. **CPF bruto nunca sai do backend** — só `cpf_masked`. Nenhum campo clínico (não existem no MVP).
- `dao/patientDao.ts`: `listPatientsByClinic(clinica_id, {limit, offset, search})` — SEMPRE filtra `clinica_id` (sem `listAll`), ordena `criado_em DESC`, busca `ILIKE` em nome/email/telefone (wildcards `%`/`_` escapados; valores parametrizados). Read-only: sem create/update/delete.
- `services/patientService.ts`: valida paginação (limit 1..`PATIENTS_LIST_MAX_LIMIT`, default `PATIENTS_LIST_DEFAULT_LIMIT`; offset ≥ 0 → senão `400 invalid_pagination`), busca `limit+1` no DAO para derivar `has_more` sem `COUNT(*)`, mascara CPF, e audita `patient.list.success` (best-effort, **sem o termo de busca**). Resposta `{ patients, pagination{ limit, offset, has_more } }`.
- `controllers/patientController.ts` + `routes/patients.ts`: `GET /patients` com `requireAuth + requireClinic`; `patientsRouter` registrado em `app.ts`. Erros: `401 unauthorized`, `403 no_clinic_context`, `400 invalid_pagination`.
- NÃO cria tabela nova (usa `patients` da Sprint 2.12), NÃO importa, NÃO edita, NÃO exclui, NÃO expõe prontuário/diagnóstico/exames.
- Frontend: `components/PatientsList.tsx` (+ `.module.css`) no `/app` (abaixo de "Revisões salvas"). Título "Pacientes importados", aviso "Nenhum dado clínico foi importado.", busca (nome/e-mail/telefone) com Buscar/Limpar, estado vazio "Nenhum paciente importado ainda.", cards responsivos com CPF mascarado, e "Carregar mais pacientes" via `has_more`. Sem botões de editar/excluir/prontuário. `api.listPatients(token, { search, limit, offset })`.

---

## Sprint 2.20 (detecção informativa de duplicados — read-only)

**Env vars (see .env.example):**
- DUPLICATES_SCAN_MAX_ROWS (padrão 5000) — teto de linhas lidas por varredura de duplicados

**Endpoint:**
- GET /patients/duplicates (requireAuth + requireClinic; escopado por clinica_id)

**Notes:**
- `models/patientDuplicate.ts`: `DuplicateGroup` (`group_key`, `reason`, `reasons[]`, `confidence`, `count`, `patients: PublicPatient[]`) + `DuplicateScanResult` (`groups`, `summary{groups_count, patients_in_duplicate_groups, scan_limited}`). Reaproveita `PublicPatient` (sem CPF bruto).
- `dao/patientDao.ts`: `listForDuplicateScan(clinica_id, limit)` — SEMPRE filtra `clinica_id`, `criado_em ASC`, capado por `DUPLICATES_SCAN_MAX_ROWS` (+1 para detectar `scan_limited`). Read-only (sem update/delete/merge).
- `services/patientDuplicateService.ts`: normaliza (CPF dígitos/11, telefone dígitos ≥8, e-mail lower+trim, nome sem acento/lowercase/espaços, data `YYYY-MM-DD`) e roda **union-find** sobre 6 critérios: `cpf_match` (high), `email_match`/`telefone_match`/`name_dob_match`/`name_telefone_match`/`name_email_match` (medium). Um cluster = componente conexo; `reason` = critério mais forte; `confidence='high'` se houver CPF. `group_key` = `${reason}:${sha256(ids ordenados).slice(0,12)}` — **não reversível, sem PII**. Grupos ordenados: high antes de medium, depois força do reason, depois `count` desc. NÃO grava nada; `patients` count não muda.
- Audit `patient.duplicates.list.success` (best-effort, `recurso='patient'`, sem PII e sem contagens — a tabela não tem coluna `metadata`).
- `controllers/patientController.ts` + `routes/patients.ts`: `GET /patients/duplicates` (`requireAuth + requireClinic`). Sem rota `:id` que pudesse sombrear.
- Frontend: `components/DuplicatesList.tsx` (+ `.module.css`) no `/app` abaixo de "Pacientes importados". Aviso "Esta análise é apenas informativa…", botão único "Atualizar análise", estado vazio "Nenhum possível duplicado encontrado.", cards por grupo (motivo + confiança Alta/Média + nº de registros + reasons extras + registros com CPF mascarado). **Sem botões de merge/editar/excluir.** `api.listPatientDuplicates(token)`.

---

## Sprint 2.21 (exportação limpa CSV/XLSX — read-only)

**Env vars (see .env.example):**
- PATIENTS_EXPORT_MAX_ROWS (padrão 5000) — teto de linhas por exportação; acima disso retorna 413 patients_export_too_large

**Endpoint:**
- GET /patients/export (requireAuth + requireClinic; escopado por clinica_id; query `format=csv|xlsx`, `search` opcional, `include_cpf_raw` recusado)

**Notes:**
- `services/patientExportService.ts`: reaproveita `patientDao.listPatientsByClinic` (limit `PATIENTS_EXPORT_MAX_ROWS`+1 para detectar excesso, mesma busca ILIKE do `GET /patients`) e `toPublicPatient` (CPF mascarado). Gera CSV (BOM UTF-8, CRLF, escaping RFC 4180) e XLSX (`exceljs`, planilha "Pacientes"). NÃO grava em `patients`.
- Anti-formula-injection (CWE-1236): `neutralizeFormula` prefixa `'` quando a célula começa com `= + - @` (ou tab/CR/LF) — aplicado em **CSV e XLSX**. Nenhuma célula XLSX é fórmula (tudo texto).
- Colunas exportadas (nesta ordem): nome, telefone, email, cpf_masked, data_nascimento, convenio, numero_carteirinha, status, origem, import_session_id, criado_em, atualizado_em. **Nunca** cpf bruto, dados clínicos, tokens nem ids de usuário.
- Controller valida no edge: `format` ≠ csv/xlsx → 400 `patients_export_invalid_format`; `include_cpf_raw=true` → 400 `patients_export_cpf_raw_not_allowed`. Service: excesso → 413 `patients_export_too_large`; erro de geração → 500 `patients_export_failed`. `Content-Type` correto por formato; `Content-Disposition` com filename fixo `pacientes-clinicbridge-YYYYMMDD.<ext>` (sem input do usuário).
- Audit `patient.export.success` / `patient.export.failure` (best-effort, `recurso='patient'`, recurso_id null, **sem PII, sem termo de busca, sem contagens** — `audit_logs` não tem `metadata`).
- Frontend: bloco de exportação na seção "Pacientes importados" (`PatientsList`) com aviso ("apenas dados administrativos… CPF mascarado") + botões "Exportar CSV"/"Exportar XLSX" (respeitam a busca atual via `activeSearch`). `api.downloadPatientsExport` baixa o Blob e dispara o download; erro de limite mostra mensagem amigável. Sem opção de CPF bruto, sem editar/excluir/merge.

---

## Sprint 2.22 (hardening dos endpoints sensíveis — sem nova feature)

**Env vars (see .env.example):**
- PATIENTS_RATE_LIMIT_WINDOW_MS (900000) / PATIENTS_RATE_LIMIT_MAX (300) — GET /patients e /patients/duplicates
- EXPORT_RATE_LIMIT_WINDOW_MS (900000) / EXPORT_RATE_LIMIT_MAX (30) — GET /patients/export (mais restrito; gera arquivo)
- IMPORT_RATE_LIMIT_WINDOW_MS (900000) / IMPORT_RATE_LIMIT_MAX (120) — preview/validate/sessions/dry-run/mark-ready/import

**Notes:**
- `middlewares/rateLimit.ts`: factory `makeRateLimit` + `patientsRateLimit`, `exportRateLimit`, `importRateLimit` (mesmo shape de `authRateLimit`/`uploadRateLimit`: IP-keyed, draft-7 headers, body 429 genérico). Cada limiter tem store próprio.
- Aplicação (limiter ANTES de requireAuth, como no upload): `patients.ts` → patientsRateLimit em `/patients` e `/patients/duplicates`, exportRateLimit em `/patients/export`; `importPreview.ts`/`importValidation.ts` → importRateLimit; `importSessions.ts` → importRateLimit nos 4 POSTs (create, dry-run, mark-ready, import). Auth `/auth/*` e upload mantêm os limiters existentes.
- Auditoria de segurança (apenas confirmado, sem alteração): errorHandler não vaza stack/SQL/path (500 → `internal_error`); parse errors → mensagens genéricas (preview/validation/dry-run); CORS restrito por `FRONTEND_ORIGIN` (recusa `*` em prod, allowlist explícita, credentials true); helmet global; logger redige `authorization/cookie/password/senha/cpf/token`; nenhum `error: {}` vazio no código; sem concatenação de SQL (knex parametrizado); tenant isolation OK em todos os DAOs (patient/importFile/importSession sempre filtram `clinica_id`; sem `listAll`; o único acesso direto a `patients` em service é o INSERT do import, que carrega `clinica_id`).
- Export: confirmado `format` inválido → 400, `include_cpf_raw=true` → 400, CPF nunca bruto, formula injection neutralizada (CSV+XLSX), `PATIENTS_EXPORT_MAX_ROWS`, `Content-Disposition` fixo, sem signed URL pública.
- Import/upload: confirmado allowlist de extensão/MIME, `UPLOAD_MAX_BYTES`, `IMPORT_MAX_ROWS`, nenhum dado clínico importado, import real exige `ready_for_import` (CAS), dry-run read-only, mark-ready revalida, import transacional, `import_completed` não reimporta.
- Teste 429 (instância de teste com `EXPORT_RATE_LIMIT_MAX=3`): export sem token → 401×3 e depois 429 (limiter roda antes do auth); body 429 = `{ error: { code: 'rate_limited', ... } }`, headers `RateLimit`/`Retry-After`. `patients` count inalterado (6).
- Sem migration nova, sem dependência nova (`express-rate-limit` já existia), sem mudança de fluxo de negócio.

---

## Sprint 2.23 (validação real de tipo de arquivo por magic bytes — só backend)

- `utils/fileContent.ts` reforçado: `isValidXlsxContent` agora exige (1) assinatura de local file header ZIP `50 4B 03 04` e (2) presença das partes obrigatórias OOXML `[Content_Types].xml` e `xl/workbook.xml`. Nomes de entrada do ZIP são armazenados sem compressão, então um `buffer.includes` acha as partes sem extrair/descomprimir nada (sem temp file, sem zip-slip/zip-bomb). Antes só checava 2 bytes `PK` — um ZIP qualquer renomeado `.xlsx` passava; agora é rejeitado.
- `isValidCsvContent` inalterado (já rejeitava vazio/NUL/binário). Novo `validateUploadContent(extNoDot, buffer): {ok:true}|{ok:false, reason:'empty'|'invalid'}` (substitui o `isValidUploadContent` booleano).
- `uploadService.receiveFile` usa `validateUploadContent`: vazio → `400 file_empty` ("O arquivo está vazio…"); incompatível → `400 invalid_file_content` ("Arquivo inválido ou incompatível.") — código existente preservado. Audita `import_file.upload.failure` (sem filename/bytes/conteúdo/PII).
- Decisão: o gate de MIME declarado (multer `fileFilter`) foi mantido. Um XLSX válido enviado com MIME fora da allowlist é recusado em `invalid_file_type` (defesa em profundidade: extensão + MIME declarado + conteúdo real). Não afrouxamos o MIME.
- Frontend NÃO alterado (UploadPanel já exibe `err.message`, que continua amigável).
- Sem env nova, sem dependência nova, sem migration. Não toca patients/dados clínicos.
- Verificação (probe com fixtures reais): empty.csv→empty; binário→invalid; valid.csv→ok; texto-como-xlsx→invalid; ZIP real (stored, não-OOXML) renomeado .xlsx→invalid; xlsx real (exceljs)→ok.

---

## Sprint 2.24 (política de retenção de arquivos — modo dry-run, só backend)

**Env vars (see .env.example):**
- IMPORT_FILE_RETENTION_DAYS (padrão 30) — arquivo vira candidato à limpeza quando mais antigo que isso
- IMPORT_FILE_RETENTION_DRY_RUN_MAX (padrão 100) — teto de candidatos retornados por dry-run

**Endpoint:**
- GET /import-files/retention/dry-run (importRateLimit + requireAuth + requireClinic; escopado por clinica_id; query opcional `retention_days` 1..365, `limit` 1..MAX)

**Notes:**
- `models/importFileRetention.ts`: `RetentionCandidate` (id, status, extensao, mime_type, tamanho_bytes, criado_em, has_import_session, latest_session_status) + `RetentionDryRunResult` (retention_days, candidates_count, scan_limited, candidates). **Sem `nome_original`/`nome_interno`/path/sha256/conteúdo.**
- `importFileDao.listOlderThanForClinic(clinica_id, cutoff, limit)` (criado_em < cutoff, asc, tenant-scoped, READ-ONLY) + `importSessionDao.listByFileIdsForClinic(fileIds, clinica_id)` (desc, para derivar a última sessão por arquivo). Nenhum delete em DAO.
- `importFileRetentionService.dryRun(actor, {retentionDays, limit}, ctx)`: cutoff = now − dias; busca `limit+1` (deriva `scan_limited`); pega o status da última sessão por arquivo; **exclui** arquivos em fluxo ativo (última sessão `validated`/`ready_for_import`/`import_started`); inclui arquivos sem sessão ou com sessão final (`import_completed`/`failed`/`cancelled`). NÃO apaga nada. Audit `import_file.retention.dry_run.success`/`.failure` (recurso='import_file', recurso_id null, sem PII).
- Controller valida no edge: `retention_days` 1..365 (default env), `limit` 1..`IMPORT_FILE_RETENTION_DRY_RUN_MAX` (default = MAX) → senão `400 invalid_retention_params`. Rota em `importFiles.ts` registrada ANTES de qualquer `/import-files/:id` (path literal não é sombreado).
- Decisão: NÃO há helper de role no projeto ainda; mantido `requireClinic` (gating por dono/admin fica como ressalva futura). Sem migration (usa colunas existentes), sem dependência nova, sem frontend.
- Verificação (probe real): days=0 → candidatos só com metadados seguros (sem nome/hash/path); days=30 → 0 (arquivos recentes); outra clínica → 0; `import_files` e `patients` inalterados (24/24, 6/6); nada apagado.

---

## Sprint 2.25 (auditoria de fechamento da Sprint 2 — sem feature nova)

- Auditado: docs (CLAUDE.md/README/.env.example), 17 rotas (auth/requireClinic/rate limit/tenant), segurança (errorHandler/CORS/helmet/logger), banco (migrations em ordem, 0 pendente; DAOs sempre filtram clinica_id; sem SQL concatenado; sem listAll), builds (backend typecheck+build, frontend build — todos OK), invariantes (patients=6, import_files=24, import_sessions=7; audit sem PII).
- Correções pequenas e seguras (sem mudar comportamento): (1) `DRY_RUN_MAX_ROWS`/`DRY_RUN_MAX_ISSUES_RETURNED`/`DRY_RUN_SAMPLE_ROWS` adicionadas ao `.env.example` (eram usadas no código e faltavam); (2) seção "Current phase" estava congelada em "Foundation / Sprint 0" → atualizada + nota explícita "não pronto para produção"; (3) typo `DRY_RUN_SAMPLE_ROWS` "padrão 10" → "20".
- Confirmado SEM alteração: nenhuma feature nova, nenhuma migration nova, nenhuma dependência nova; patients/import_files/import_sessions inalterados; nada apagado; CPF nunca bruto; sem prontuário/dados clínicos/edição/exclusão/merge.
- Ressalva de doc resolvida: `.env.example` agora cobre todas as env vars do `env.ts`. `POSTGRES_*` e `VITE_API_BASE_URL` no `.env.example` são consumidas por docker-compose/frontend (não pelo `env.ts` do backend) — corretas, não são lixo.

---

## Sprint 2.26 (visibilidade administrativa da retenção dry-run — só frontend)

- `services/api.ts`: tipos `RetentionCandidate`/`RetentionDryRunResult`/`RetentionDryRunParams` (apenas campos seguros — sem `nome_original`/`nome_interno`/path/sha256/conteúdo) + `api.getImportFileRetentionDryRun(token, { retention_days?, limit? })` (monta query string).
- `components/ImportFileRetentionPanel.tsx` (+ `.module.css`) no `/app`, abaixo de `DuplicatesList`. Copy administrativa amigável (polimento posterior, sem jargão como "retention/dry-run/candidates_count/scan_limited"): título "Arquivos antigos de importação"; subtítulo "Veja arquivos enviados há mais tempo que podem ser revisados para limpeza futura."; aviso fixo "Esta verificação é apenas informativa. Nenhum arquivo será apagado por aqui."; frase de segurança "A limpeza real exigirá uma etapa futura com confirmação e auditoria."; inputs "Arquivos com mais de [N] dias" (1..365) e "Mostrar até" (1..100) com validação client-side; botão primário "Verificar arquivos" e secundário "Atualizar"; estados loading/erro/vazio ("Nenhum arquivo antigo encontrado para revisão."). Resumo: "Período analisado: mais de X dias", "Arquivos encontrados", "Exibidos", "Análise limitada: Sim/Não". Lista de candidatos exibe SÓ campos seguros: Tipo (extensão CSV/XLSX como chip), Ref. curta (id truncado, só handle), Tamanho (B/KB/MB), Enviado em, "Tem revisão salva? Sim/Não", "Último status da revisão" (label amigável). MIME removido da UI (técnico/redundante; segue no tipo, não renderizado). **Sem botão de apagar/limpar/excluir, sem download.**
- Responsividade reforçada no polimento: rótulos longos quebram linha (sem `white-space: nowrap` em coluna fixa estreita), valores usam `overflow-wrap: anywhere` (sem ellipsis), `fieldRow` colapsa para 1 coluna < 32rem, inputs com `max-width: 100%`, botão "Verificar arquivos" full-width no mobile, título com `clamp`. Sem scroll horizontal em 360/390/430/768px.
- Polimento de responsividade global mínima do Dashboard (`views/Dashboard.module.css`): `.page { overflow-x: clip }` (guarda contra scroll horizontal fantasma; não cria scroll container nem afeta overflow-y); `min-width: 0` em `.main`/`.hero`/`.identityItem`/`.card`/`.brand`; `overflow-wrap: anywhere` em `.brand`/`.greeting`/`.heroClinic`/`.identityValue` (e-mail e nome longos quebram, não cortam); `.topbar { flex-wrap: wrap }`; media query `max-width: 30rem` reduz paddings/margens. `index.css` já tinha `box-sizing: border-box` global + `body { overflow-x: hidden }` (não alterado).
- Erros amigáveis: 401 → "Sessão expirada…"; `invalid_retention_params` → "Não foi possível usar esses valores…"; `rate_limited` → aviso de muitas tentativas; genérico → "Não foi possível verificar os arquivos agora. Tente novamente." Nenhum detalhe técnico vazado.
- Backend NÃO alterado (endpoint da Sprint 2.24 já existia e atende). Sem migration, sem env nova, sem dependência nova. Continua dry-run: nada é apagado; `import_files`/`import_sessions`/`patients` inalterados.

---

## Sprint 3.1 (requireRole / gating dono-admin — primeiro passo da Fase 3)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → Fase 3 (produção/governança). Detalhe de segurança: `docs/security-notes.md` (seção "Autorização por papel").

- **Decisão de modelo:** o schema **já tinha** `papel` em `users` (`admin_sistema`/`dono_clinica`/`secretaria`) e o JWT já carregava `papel` nas claims. Reutilizado — **nenhuma migration, nenhuma tabela de permissões, nenhuma dependência**. Sem RBAC complexo (escopo MVP). `dono_clinica` = owner; `secretaria` = operator; `admin_sistema` = sistema (sem clínica, já barrado por `requireClinic` nas rotas tenant). Registro (`authService`) cria `dono_clinica`, então usuários existentes não quebram.
- **Middleware** (`middlewares/requireAuth.ts`): `requireRole(allowed: readonly UserPapel[])` + `CLINIC_ADMIN_ROLES = ['dono_clinica']`. Roda **após** `requireAuth` + `requireClinic` (nunca burla auth/tenant); lê o papel do JWT (sem hit no DB). 403 → `{ error: { code: 'forbidden_role', message: 'Você não tem permissão para executar esta ação.' } }`. 403 não é auditado.
- **Endpoints gateados a `dono_clinica`** (ordem: rateLimit → requireAuth → requireClinic → requireRole → handler): `POST /import-sessions/:id/import`, `POST /import-sessions/:id/mark-ready`, `GET /patients/export`, `GET /import-files/retention/dry-run`. `secretaria` mantém upload/preview/validate/create-session/dry-run e `GET /patients` + `/patients/duplicates`.
- **Frontend:** `Dashboard` esconde `ImportFileRetentionPanel` para não-owner (`user.papel !== 'dono_clinica'`); `PatientsList` mostra os botões de export só para owner (operator vê nota); `ImportSessionsList` troca os controles de mark-ready/import por nota para operator (mantém o recibo read-only e a simulação). Todos os handlers sensíveis mapeiam `forbidden_role` para "Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica." Defesa real é no backend; frontend é só UX.
- **Tradeoff papel stale:** papel no JWT → muda só ao reemitir token. Aceitável sem gestão de usuários na UI; revisitar com TTL curto/refresh ou lookup no DB quando isso existir.
- **Verificação (HTTP real, tokens assinados localmente com o `tokenService`, sem mutar o DB):** sem token → export/retention/import = 401. owner (`dono_clinica`) → patients/duplicates/export/retention = 200. secretaria → patients/duplicates = 200; export/retention/mark-ready/import = 403 `forbidden_role` (body genérico confirmado). Counts inalterados (patients=6, import_files=24, import_sessions=7); audit das ações do owner sem PII (`recurso_id` null). Builds: backend typecheck+build OK, frontend build OK.
- **Decisão de quem fica de fora:** `POST /import-sessions` (create), `dry-run` e `POST /import-files/:id/validate` **não** foram gateados — operator precisa preparar revisões/simular. Só as ações que criam pacientes, geram arquivo com PII ou são base para limpeza futura ficaram restritas a owner (alinhado ao pedido da sprint).

---

## Sprint 3.2 (produção/governança: trust proxy + Redis/shared store p/ rate limit)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → Fase 3. Detalhe de segurança: `docs/security-notes.md` (seções "Trust proxy" e "Rate-limit store compartilhado / Redis"). Só backend + docs + `.env.example` + `docker-compose.yml`. **Sem migration, sem mudança de banco, sem frontend.**

- **Dependências add:** `redis@^5` + `rate-limit-redis@^5` (combo canônico recomendado pela doc do `express-rate-limit`; leves; só conectam quando `RATE_LIMIT_STORE=redis`). Lockfile atualizado.
- **Trust proxy** (`config/env.ts` + `app.ts`): `TRUST_PROXY` (string → boolean/number/string) alimenta `app.set('trust proxy', …)`. Default `false` (não confia em `X-Forwarded-*`). Em produção, se não setado, emite **warning forte** no boot (não falha — `false` é legítimo p/ API exposta direto). Antes era hardcoded `false`.
- **Store de rate limit** (`config/rateLimitStore.ts`): `RATE_LIMIT_STORE=memory|redis` (default memory). memory → `createRateLimitStore` retorna `undefined` (MemoryStore embutido por limiter). redis → **uma** conexão `redis` compartilhada por todos os limiters, cada um com `RedisStore` prefixado por escopo (`REDIS_PREFIX<scope>:`) p/ contadores independentes. Novas envs: `RATE_LIMIT_STORE`, `REDIS_URL` (obrigatória se redis — `superRefine` no env), `REDIS_PREFIX` (default `clinicbridge:ratelimit:`), `RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS` (5000).
- **Limiters** (`rateLimit.ts`/`authRateLimit.ts`/`uploadRateLimit.ts`): passaram a receber `store: createRateLimitStore(scope)`. Scopes: auth/upload/patients/export/import. API dos limiters e body 429 (`{ error: { code: 'rate_limited', message } }`) + headers draft-7 **preservados**. Limiter continua antes de `requireAuth`.
- **Bootstrap** (`server.ts`): `main()` async — `await initRateLimitStore()` (conecta Redis em redis mode; **falha-rápido** com `process.exit(1)` se não conectar — sem degradar p/ memory) e **só então** `await import('./app')` (import dinâmico garante que os limiters/`store.init` rodem com o cliente já aberto; sem o dinâmico, o boot cuspia `ClientClosedError`). `closeRateLimitStore()` no shutdown.
- **Segurança:** `REDIS_URL` nunca é logado (só a mensagem de erro do cliente). Nenhuma rota perde proteção; `requireRole` da 3.1 intacto; export/retention/import inalterados; CPF nunca bruto.
- **docker-compose:** serviço `redis:7-alpine` **opcional** (bound a `127.0.0.1:${REDIS_PORT:-6379}`, sem persistência, healthcheck). Com memory mode o backend nem conecta.
- **Verificação (instâncias efêmeras, sem tocar o dev server nem o banco):**
  - memory (max=3): export sem token → 401×3 e depois 429; body genérico + headers `RateLimit`/`Retry-After`; outro grupo (`/patients`) independente.
  - redis (max=3): boot limpo (0 `ClientClosedError`), 401×3 → 429, chave `clinicbridge:ratelimit:export:<ip>` no Redis; **contador persiste entre reinícios** (1ª chamada pós-restart já 429 → store compartilhado).
  - trust proxy: `TRUST_PROXY=1` + `X-Forwarded-For: 203.0.113.7` → chave usa `203.0.113.7`; `TRUST_PROXY=false` → chave usa o loopback do socket (XFF ignorado).
  - builds: backend typecheck+build OK. counts inalterados (patients=6, import_files=24, import_sessions=7). Portas de teste encerradas; dev server (3001, memory) intacto.
- **Ressalva:** rate-limit-redis carrega um Lua script no `init`; com o import dinâmico isso roda já conectado. Em produção, monitorar reconexão do Redis (queda de Redis em redis mode derruba o rate limit das rotas até reconectar — `redis` client tenta reconectar sozinho).

---

## Sprint 3.3 (política LGPD de retenção e governança de dados — DOCS-ONLY)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → Fase 3 (produção/governança), item P1 "política LGPD de retenção". **Docs-only: sem backend, sem frontend, sem migration, sem mudança de banco, sem dependência.**

- **Criou** `docs/data-retention-policy.md`: política técnica de retenção e governança (17 seções — status/escopo, princípios, dados tratados/fora de escopo, arquivos de importação, pacientes, sessões/recibos, logs/auditoria, exportações, dry-run atual, limpeza real futura, quarentena/soft-delete, responsabilidades por papel, requisitos antes de apagar, riscos, checklist futuro, validação jurídica) + **matriz de retenção** (import_files metadata, arquivo físico, import_sessions, import_summary_json, patients, audit_logs, exports baixados, tokens/sessões, logs de aplicação, chaves de rate limit Redis).
- **Criou** `docs/adr/0002-data-retention-governance.md` ("Data Retention Governance — dry-run first, deletion later"; Accepted; 2026-05-23): retenção segue **dry-run** até existirem política + confirmação + soft-delete/quarentena + auditoria por arquivo; **nada é apagado automaticamente**; limpeza real é sprint futura separada, com 10 critérios mínimos (requireRole/dono_clinica, confirmação explícita, soft-delete/quarentena com janela de recuperação, auditoria por arquivo, idempotência, lock se job, coordenação banco+storage, logs sem PII, prazos validados juridicamente, backup/restore validado).
- **Atualizou** `docs/security-notes.md` (nova seção "Política de retenção e governança de dados" + ressalva P1 ajustada), `docs/project-state.md` (Sprint 3.3 como última aprovada), `docs/roadmap-next-phase.md` (Fase 3: retenção avançada em nível técnico; pendente validação jurídica/limpeza real/backup/deploy), `CLAUDE.md` (referência curta).
- **Pontos fixados:** MVP trata só dados administrativos; **não** trata dados clínicos; arquivos enviados podem conter PII administrativa; `nome_original` pode conter PII e nunca é exposto publicamente; retenção atual é só dry-run; limpeza real não existe; documento é rascunho técnico que **exige revisão jurídica antes de produção**; **sem** promessa de compliance LGPD completo; produto **não** pronto para produção.
- **NÃO** fez: limpeza real, endpoint de delete, botão de apagar, job/cron, signed URL, migration, alteração de banco, dado clínico, edição/exclusão/merge de pacientes. Counts inalterados (patients=6, import_files=24, import_sessions=7 — não tocados, pois nada de código/banco mudou). Sem build (docs-only).

---

## Sprint 3.4 (estratégia de backup/restore — Restic-first, Bacula futuro — DOCS-ONLY)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → Fase 3, item P1 "backup/restore". Também pré-requisito da limpeza real (critério #10 do ADR 0002). **Docs-only: sem backend, sem frontend, sem migration, sem mudança de banco, sem alterar `docker-compose.yml`/`.env.example`, sem scripts/cron/secrets/dumps, sem dependência.**

- **Decisão (ADR 0003 `docs/adr/0003-backup-restore-strategy.md`, Accepted, 2026-05-23):** **Restic-first** no MVP (repo cifrado por padrão, dedup, snapshots, single-binary, local+offsite S3/B2/SFTP, restore testável); **Bacula** fica como **opção futura enterprise** (frota multi-host/tape/catálogo central — overkill p/ o setup single-host/Docker atual). Nada implementado; apenas direção + requisitos. Implementação futura deve começar em **local/dev com restore drill validado, antes de qualquer offsite real**.
- **Criou** `docs/backup-restore-strategy.md` (15 seções): status/escopo, o que precisa de backup (PostgreSQL + storage de uploads, ambos PII) e o que **não** precisa (Redis efêmero; segredos `.env`/`JWT_SECRET` tratados à parte, nunca no backup em texto puro), por que Restic primeiro, Bacula como enterprise futuro, **tabela comparativa Restic×Bacula**, modelo de backup conceitual (sem scripts), RPO/RTO propostos (não validados), retenção de backups (alinhada à `data-retention-policy.md`, sujeita a validação jurídica), segurança/cifragem + gestão da chave, restore + **restore drills**, responsabilidades, requisitos antes de produção, riscos, checklist futuro, validação jurídica.
- **Atualizou** `docs/security-notes.md` (nova seção "Backup e restore (estratégia)" + ressalva P1 ajustada), `docs/project-state.md` (Sprint 3.4 como última aprovada), `docs/roadmap-next-phase.md` (Fase 3: backup/restore = estratégia decidida; implementação pendente), `CLAUDE.md` (referência curta).
- **Pontos fixados:** backups conteriam PII (banco + storage) → exigem cifragem em repouso + gestão de chave (perda da chave = irrecuperável); Redis não é backupeado; segredos fora do backup em texto puro; restore drill obrigatório (backup sem restore testado não conta); ordem local/dev → drill → offsite; limpeza real (ADR 0002) só destrava após backup validado; documento é rascunho técnico que **exige revisão jurídica antes de produção**; **sem** promessa de compliance LGPD completo; produto **não** pronto para produção.
- **NÃO** fez: backup/scripts/cron/job, repositório Restic, chaves/secrets, dumps/backups reais, destino offsite real, instalação de Bacula, migration, alteração de banco/compose/código, dado clínico. Counts inalterados (patients=6, import_files=24, import_sessions=7 — não tocados). Sem build (docs-only).

---

## Sprint 3.5 (backup/restore LOCAL com Restic + restore drill — implementação)

Direção: ADR `docs/adr/0003-backup-restore-strategy.md` (Restic-first) → Fase 3, item P1 backup/restore. **Local/dev apenas — sem AWS/S3/Backblaze/MinIO/offsite.** Não alterou backend funcional, frontend, schema, dados do banco principal; sem migration; sem endpoint/job/cron; sem commit/push. Runbook: `docs/backup-restore-local-runbook.md`.

- **`.gitignore` reforçado:** além do que já existia (`backups/`, `*.dump`, `*.sql`, `storage/`, `uploads/`, `.env*`), adicionados `backup/`, `restic-repo/`, `.restic/`, `*.pgdump`, `*.sql.gz`, `*.backup`, `*.bak`, `*.tar`, `*.tar.gz`, `*.restic`. `.env.example` segue versionado; nada de migrations/docs ignorado.
- **Scripts (`scripts/`, bash + `set -euo pipefail`, sem secret hardcoded):**
  - `check-backup-env.sh` — verifica restic, docker, container Postgres, `pg_dump`/`pg_restore`, `RESTIC_PASSWORD` (sem imprimir o valor) e cobertura do `.gitignore`; resumo seguro.
  - `backup-local-restic.sh` — `restic init` idempotente; `pg_dump -Fc` (dentro do container, via `docker exec`, escrito no host em `backups/work/clinicbridge-TS.dump`); inclui `storage/uploads` se existir; `restic backup` com tags; lista snapshots; mantém o dump por padrão (`CLEAN_BACKUP_WORKDIR=true` apaga).
  - `restore-local-restic.sh` — **aborta se `RESTORE_DB == POSTGRES_DB`** (protege o principal); `restic restore latest` → `backups/restore-work/latest`; localiza o dump; recria **só** `clinicbridge_restore_test`; `pg_restore --no-owner --no-privileges`; imprime counts principal × restore lado a lado; não apaga a pasta de restore.
- **Variáveis (defaults seguros):** `POSTGRES_CONTAINER=clinicbridge-postgres`, `POSTGRES_DB=clinicbridge`, `POSTGRES_USER=clinicbridge`, `RESTORE_DB=clinicbridge_restore_test`, `BACKUP_WORKDIR=backups/work`, `RESTIC_REPOSITORY=backups/restic-repo`, `UPLOAD_DIR=storage/uploads`. `RESTIC_PASSWORD` só vem do ambiente (nunca em arquivo).
- **Drill executado (2026-05-22, local/dev):** restic 0.18.1; Postgres 15.18 no container. `check` → 11 ok / 0 fail. `backup` → repo cifrado criado, snapshot `d926ad54` (storage ausente neste checkout → backup só do banco, avisado). `restore` → restaurou do snapshot, recriou `clinicbridge_restore_test`, `pg_restore` OK. **Counts main vs restore:** patients 6=6, import_files 24=24, import_sessions 7=7 (todos OK). Banco principal **intacto** (counts inalterados; restore foi em banco separado).
- **Segurança:** `RESTIC_PASSWORD` exportada só no shell (não salva em arquivo, não versionada, não impressa). `git status` mostra apenas `M .gitignore` + `?? scripts/`; `backups/` (repo Restic cifrado + dumps + restore-work) confirmado **ignored** (`!!`), nada de backup/dump tracked/staged. Sem offsite/AWS; sem dado clínico; sem limpeza real.
- **Pendente (futuro):** offsite/produção (destino, gestão de chave do repo, agendamento, monitoramento/alerta) e validação de ponta a ponta em produção. Liga ao ADR 0002: limpeza real só após backup validado em produção.

---

## Sprint 3.6 (deploy seguro + revisão de CORS/env de produção — auditoria + hardening)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → Fase 3, item P1 "deploy seguro + revisão de CORS/env". **Sem deploy real, AWS, Terraform, CI/CD, domínio ou HTTPS real; sem migration/schema; sem dependência; sem commit/push.** Decisão: ADR `docs/adr/0004-deploy-security-baseline.md`. Checklist: `docs/deploy-security-checklist.md`.

- **Auditoria (read-only) confirmou base sólida:** CORS recusa `*` em produção (boot falha) + lista vazia falha + origem não permitida sem vazar detalhe (`middlewares/cors.ts`); `errorHandler` não vaza stack/SQL/path (500 → `internal_error`); `logger` redige `authorization/cookie/password/senha/senha_hash/cpf/token/...` (`remove:true`); `x-powered-by` desabilitado + Helmet defaults; fail-fast de Redis em redis mode + warning de `TRUST_PROXY` não setado em produção (Sprint 3.2); `/health` é liveness sem vazar env/versão/secret.
- **Achados/buracos fechados:** (1) o placeholder de `JWT_SECRET` no `.env.example` tem >48 chars e **passava** no `min(48)` — sem guarda, produção poderia bootar com segredo público; (2) `RATE_LIMIT_STORE=memory` em produção era aceito **sem aviso** (contadores por instância) enquanto `TRUST_PROXY` já avisava.
- **Hardenings (pequenos, só `NODE_ENV=production`, dev/test intactos):**
  - `config/env.ts` (`superRefine`): boot **falha** se `JWT_SECRET` casa `/replace-with|change-me/i` ou se `DATABASE_URL` casa `/change-me-locally/i`.
  - `app.ts`: `logger.warn` quando `RATE_LIMIT_STORE=memory` em produção (espelha o warning de `TRUST_PROXY`; mantém fail-fast só para redis sem conexão).
  - `.env.example`: comentários seguros (exemplo de `FRONTEND_ORIGIN` prod HTTPS; `REDIS_URL` obrigatória em redis mode / recomendada multi-instância; nota de `RESTIC_PASSWORD` shell-only). Sem secrets reais; `.env.example` segue versionado.
- **Documentos:** criado `docs/deploy-security-checklist.md` (17 seções: status/escopo, ambientes, env obrigatórias, CORS, HTTPS/reverse proxy, trust proxy, rate limit/Redis, banco, storage, secrets, backup, logs/auditoria, healthcheck, compose dev vs prod, checklist staging, checklist produção, fora de escopo) + ADR 0004. Atualizados `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`, `docs/testing-checklist.md`, `CLAUDE.md`.
- **Decisão de baseline (ADR 0004):** reverse-proxy/HTTPS first; produção exige `FRONTEND_ORIGIN` explícito (sem `*`); `TRUST_PROXY` = hop count real; `RATE_LIMIT_STORE=redis` em multi-instância; `docker-compose.yml` é local/dev (não produção).
- **Verificação:** `pnpm --filter backend typecheck` + `build` OK. Guardas testadas com instâncias efêmeras (env craftada): `NODE_ENV=production` + placeholder de `JWT_SECRET` → boot recusa com mensagem clara; idem `DATABASE_URL=...change-me-locally`; com segredos válidos → passa. **Sem** alterar `docker-compose.yml`/banco/schema; **sem** `.env` real tocado; nenhum secret no diff; counts do banco inalterados (não tocados).

---

## Sprint 3.7 (readiness endpoint /health/ready com checagem leve de banco)

Direção: ADR `docs/adr/0004-deploy-security-baseline.md` (§13 do checklist marcava readiness como melhoria futura) → Fase 3. **Só backend + `.env.example` + docs. Sem migration/schema, sem frontend, sem dependência, sem deploy real, sem commit/push.**

- **`routes/health.ts`:** `GET /health` mantido como liveness (formato inalterado: `{status:'ok',service,timestamp}`) + alias explícito `GET /health/live`. Novo `GET /health/ready`: roda `db.raw('select 1')` no pool knex existente (sem conexão paralela), com `withTimeout` (Promise.race + `setTimeout(...).unref()`). **200** `{status:'ready',...,checks:{database:'ok'}}` quando o DB responde; **503** `{status:'not_ready',...,checks:{database:'error'}}` quando não. try/catch local → o `errorHandler` nunca vira 500 com detalhe. Sem `requireAuth`, sem tenant, sem PII, sem `audit_logs`. Falha logada só com mensagem segura (`err.message`), nunca a connection string.
- **`config/env.ts`:** novo `HEALTH_READY_DB_TIMEOUT_MS` (coerce number, default **2000**) — timeout curto para um 503 rápido em vez de pendurar no `acquireConnectionTimeout` longo (60s) do knex. **`.env.example`:** documentado com comentário seguro.
- **Segurança confirmada:** readiness nunca expõe `DATABASE_URL`/`JWT_SECRET`/`REDIS_URL`/stack/SQL/versão — só `ok`/`error` por check + timestamp.
- **Verificação:** `pnpm --filter backend typecheck` + `build` OK. Instâncias efêmeras (sem tocar o dev server 3001, que não estava rodando):
  - porta 3010 (DB real up): `/health`=200, `/health/live`=200, `/health/ready`=200 `database:ok`.
  - porta 3011 (`DATABASE_URL` blackhole `10.255.255.1`, `NODE_ENV=development`): `/health`=200 (liveness independe do DB), `/health/ready`=**503** `database:error` em **~2.00s** (cap de timeout). Log só com `"readiness check timed out"` — sem host/credencial. Listeners efêmeros encerrados; Postgres compartilhado **não** foi parado (teste de 503 via host inalcançável, alternativa segura).
- **Sem** alterar `docker-compose.yml`/banco/schema; `.env` real intocado; nenhum secret no diff; nenhum dado clínico.

---

## Sprint 3.8 (edge security baseline — Nginx reverse proxy + WAF strategy — DOCS/ADR-FIRST)

Direção: ADR `docs/adr/0004-deploy-security-baseline.md` (reverse-proxy/HTTPS first) → Fase 3. **Docs/ADR-only: sem Nginx, sem ModSecurity, sem `nginx.conf` real, sem TLS/domínio, sem AWS/Cloudflare, sem alterar `docker-compose.yml`/backend/banco, sem migration, sem dependência, sem commit/push.** Decisão: ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md`. Estratégia: `docs/edge-security-strategy.md`.

- **Auditoria de borda (read-only):** confirmado o que já está pronto para ficar atrás do Nginx — CORS por `FRONTEND_ORIGIN` (recusa `*` em prod), `TRUST_PROXY` configurável, rate limit por grupo memory/redis (antes do auth), `/health` + `/health/live` (liveness) + `/health/ready` (readiness com `select 1`), Helmet defaults + `x-powered-by` off, logger redige PII, errorHandler sem vazamento. Pendente de config real: TLS, IP real (hop count), body size de borda, logs de acesso, WAF. Achado relevante: `express.json` limita JSON a **100kb**, mas upload (multer) usa `UPLOAD_MAX_BYTES` (5 MB) → o `client_max_body_size` do Nginx deve acomodar **5 MB** (o maior corpo), não 100kb.
- **Decisão (ADR 0005):** **Nginx** como reverse proxy baseline (o time domina; caminho direto para ModSecurity/OWASP CRS; controle fino de headers/TLS/body size/timeouts/logs/upstream). **Caddy** (HTTPS automático/config limpa) e **Traefik** (service discovery) avaliados e **não escolhidos** agora. TLS termina no Nginx; backend continua **HTTP interno**, **não** exposto direto na internet.
- **WAF futuro:** ModSecurity + OWASP CRS, começando em **detection-only/log-only**; blocking só após tuning por rota/grupo (upload CSV/XLSX, JSON de mapeamento, acentos, payloads grandes, export/download, auth, JWT no header — alto risco de falso positivo). WAF **não** substitui requireAuth/requireClinic/requireRole, rate limit do app, validação por magic bytes, CPF mascarado, CORS, errorHandler.
- **Integrações documentadas:** `TRUST_PROXY` = hop count real do Nginx (IP real p/ rate limit/`audit_logs`); `FRONTEND_ORIGIN` = domínio HTTPS real (CORS continua no app, Nginx não emite CORS); `client_max_body_size` ≥ `UPLOAD_MAX_BYTES`; HTTP→HTTPS + HSTS só sob HTTPS estável; logs de borda sem corpo/`Authorization`/`Cookie`/PII; `/health/live` e `/health/ready` atrás do proxy; rate limit do app permanece (`RATE_LIMIT_STORE=redis` em multi-instância).
- **Documentos:** criados `docs/adr/0005-...` (18 seções) e `docs/edge-security-strategy.md` (19 seções + diagrama de borda em texto + exemplo `nginx.conf` **ilustrativo, marcado como não aplicado**). Atualizados `docs/deploy-security-checklist.md` (§5), `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`, `docs/testing-checklist.md`, `CLAUDE.md`.
- **Próxima sprint recomendada:** implementar o Nginx reverse proxy (local/staging, sem WAF blocking) — `nginx.conf` de exemplo, TLS local/staging, `TRUST_PROXY`, `client_max_body_size`, IP real, logs sem PII, probes; WAF entra depois em detection-only.
- **Confirmado:** docs-only; nenhum backend/frontend/compose/`.env`/migration alterado; nenhum secret; nenhum Nginx/ModSecurity instalado; nenhum domínio/Cloudflare/AWS configurado.

---

## Sprint 3.9 (Nginx reverse proxy local/staging — sem WAF blocking)

Direção: ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md` (Nginx baseline) → Fase 3. **Local/staging only: sem TLS real, sem domínio, sem WAF/ModSecurity, sem AWS/Cloudflare, sem migration/schema, sem alterar regra de negócio, sem commit/push.** Runbook: `docs/nginx-local-staging-runbook.md`.

- **Config Nginx (`infra/nginx/`):** `nginx.conf` (worker/events/http, `server_tokens off`, `client_max_body_size 10m`, log_format **seguro** `clinicbridge_safe` = IP + `fwd="<XFF de entrada>"` + `"<método> <path-sem-query-string>"` + status/bytes/tempo; sem `Authorization`/`Cookie`/corpo) + `conf.d/clinicbridge.local.conf` (upstream `host.docker.internal:3001`, `listen 80`, `client_max_body_size 10m`, timeouts 5s/30s/30s, `proxy_set_header` Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto). **Anti-spoof:** XFF/Real-IP são **sobrescritos** com `$remote_addr` (não `$proxy_add_x_forwarded_for`), pois o Nginx é a borda — descarta XFF forjado pelo cliente; com `TRUST_PROXY=1` o Express usa esse valor. Comentado: se houver outro proxy na frente, trocar para `$proxy_add_x_forwarded_for` + ajustar hop count.
- **docker-compose:** serviço `nginx` (nginx:alpine) **opcional** via `profiles: ["edge"]` (um `docker compose up -d` padrão **não** o sobe). `127.0.0.1:${NGINX_PORT:-8080}:80` (não exposto além do host); volumes ro de `infra/nginx/`; `extra_hosts: host.docker.internal:host-gateway`; `depends_on: postgres, redis`. Postgres/Redis **não** tiveram exposição alterada. Subir: `docker compose --profile edge up -d nginx`.
- **`.env.example`:** comentário sobre `NGINX_PORT` e usar `TRUST_PROXY=1` quando o backend está atrás do Nginx. Sem secrets; `.env` real intocado.
- **Verificação:** `docker compose --profile edge config` OK; `docker compose exec nginx nginx -t` **successful**; container `clinicbridge-nginx` up (127.0.0.1:8080). Proxy + headers + **anti-spoof comprovados** com upstream de eco (traefik/whoami) descartável na rede do compose, via conf de teste temporário (removido depois): request com `X-Forwarded-For: 203.0.113.99` chega ao upstream como `X-Forwarded-For: 172.18.0.1` e `X-Real-Ip: 172.18.0.1` (IP real da conexão, **não** o forjado), `X-Forwarded-Proto: http`, resposta 200 através do proxy. Access log confirmado **sem** `Authorization`/`Cookie`/corpo (grep vazio, mesmo com `Authorization: Bearer ...` na request). Readiness com DB já validado direto no backend (Sprint 3.7).
- **Limitação conhecida (documentada no runbook):** neste host (Docker Desktop + WSL2) o backend roda na **distro WSL**, fora da VM do Docker Desktop, então o container Nginx **não alcança** `:3001` por `host.docker.internal`/gateway/IP da WSL (502; testado: connection refused/timeout). **Não é bug de config** — é isolamento de rede do ambiente. A config `host.docker.internal:3001` está correta para ambientes onde o backend é alcançável pelo host do Docker (Linux nativo com `host-gateway`, staging VM, ou backend containerizado na rede do compose). Pendente: TLS real, tornar o backend alcançável (ou containerizá-lo) e WAF.
- **Confirmado:** sem WAF/ModSecurity/OWASP CRS; sem TLS/domínio/AWS/Cloudflare reais; sem migration/schema; `.env` real e dados intocados; sem secret nos arquivos; sem dado clínico; backend efêmero de teste encerrado; container de eco removido; `conf.d/` final só com o arquivo shipped.

---

## Sprint 3.10 (backend containerizado para teste ponta a ponta com Nginx)

Direção: ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md` → Fase 3; resolve a ressalva Docker Desktop + WSL2 da Sprint 3.9. **Local/staging only: sem TLS real, sem domínio, sem WAF/ModSecurity, sem AWS/Cloudflare, sem migration/schema, sem alterar dados, sem commit/push.** Runbook: `docs/nginx-local-staging-runbook.md`.

- **`backend/Dockerfile` (multi-stage, contexto = raiz do repo):** builder `node:20-slim` com toolchain (python3/make/g++) p/ `argon2`; `corepack` (pnpm); copia manifests (incl. `frontend/package.json` p/ o workspace resolver) + `pnpm install --frozen-lockfile --filter backend`; copia `backend/` e `pnpm --filter backend build` → `dist/`. Runtime `node:20-slim`: **install prod-only limpo** (`--prod`, sem dev deps; argon2 usa prebuilt empacotado → sem toolchain no runtime) + copia só o `dist/` do builder. Roda como usuário **`node` (uid 1000, non-root)**, `EXPOSE 3001`, `CMD node dist/server.js`. **Sem `.env` na imagem; sem secrets baked-in.** Migrations NÃO rodam no container (rodadas do host).
- **`.dockerignore` (novo):** bloqueia `.git`/`.claude`/`node_modules`/`dist`/`backups`/`storage`/`uploads`/`*.dump`/`*.sql`/`*.csv`/`*.xlsx`/logs e — crítico — `**/.env` + `**/.env.*` em qualquer nível (padrão sem barra só pega a raiz no .dockerignore), mantendo `**/.env.example`. `frontend/*` ignorado exceto `frontend/package.json` (necessário ao workspace).
- **`docker-compose.yml`:** serviço `backend` (profile `edge`, build `context: .` + `dockerfile: backend/Dockerfile`, `image: clinicbridge-backend:local`). Env do container: `NODE_ENV=development` (mantém os guards de produção desligados p/ usar a senha de dev do Postgres), `DATABASE_URL` → service `postgres`, `REDIS_URL=redis://redis:6379`, `RATE_LIMIT_STORE=redis`, `TRUST_PROXY=1`, `JWT_SECRET` = **placeholder local/staging** (≥48 chars, claramente não-real), `FRONTEND_ORIGIN` default. `expose: 3001` (não publicado no host — Nginx é a entrada). Volume `./storage/uploads:/repo/backend/storage/uploads` (gitignored; uid 1000 = node → gravável). `depends_on` postgres/redis `service_healthy`. nginx ganhou `depends_on: backend`.
- **Nginx (`infra/nginx/conf.d/clinicbridge.local.conf`):** upstream trocado de `host.docker.internal:3001` para o serviço `backend:3001`, resolvido em **runtime** via `resolver 127.0.0.11 valid=10s ipv6=off` + `set $cb_backend "backend:3001"; proxy_pass http://$cb_backend;` (Nginx sobe mesmo sem o backend; 502 até ficar pronto). Headers/anti-spoof/`client_max_body_size 10m`/timeouts inalterados. Fallback host-run documentado (trocar p/ `host.docker.internal:3001`).
- **`.env.example`:** já trazia (3.9) a nota de `NGINX_PORT`/`TRUST_PROXY=1` atrás do proxy; sem novos secrets.
- **Verificação e2e (tudo containerizado, profile `edge`):** `nginx -t` OK; backend boot loga `rate-limit store connected (redis)` + `listening :3001 (development)`. Via `http://localhost:8080`: `/health`=200, `/health/live`=200, `/health/ready`=200 `database:ok`. Readiness com `docker compose stop postgres` → **503** `database:error` em ~2.00s (cap); `/health` segue 200; ao religar o Postgres volta a 200. **Anti-spoof:** request via proxy com `X-Forwarded-For: 203.0.113.99` → chave de rate limit no Redis = `clinicbridge:ratelimit:export:172.18.0.1` (IP real do Nginx), **não** o forjado. Access log do Nginx sem `Authorization`/`Cookie`/corpo (path sem query string); backend logs sem secrets/URLs com credencial. **Segurança da imagem reverificada:** sem `/repo/.env` nem `/repo/backend/.env`; sem `typescript`/`tsx`; `argon2` presente; processo roda como `node`. `pnpm --filter backend typecheck` + `build` OK. Counts intactos (patients=6, import_files=24, import_sessions=7).
- **Ressalva 3.9 RESOLVIDA:** com o backend containerizado na rede do compose, o Nginx alcança `backend:3001` e o fluxo ponta a ponta funciona (a limitação anterior era só do backend host-run na distro WSL).
- **Confirmado:** sem WAF/TLS/domínio/AWS/Cloudflare; sem migration/schema; `.env` real intocado; sem secret real em Dockerfile/compose/docs (JWT_SECRET do compose é placeholder local); sem dado clínico; sem limpeza real; backend não publicado no host; Nginx em 127.0.0.1:8080; Postgres/Redis sem exposição piorada.

---

## Sprint 3.11 (TLS local/staging no Nginx + HTTP→HTTPS, sem WAF)

Direção: ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md` → Fase 3. **Local/staging only: certificado AUTOASSINADO, sem domínio real, sem cert real/gerenciado, sem Let's Encrypt, sem AWS/Cloudflare, sem WAF/ModSecurity, sem migration/schema, sem commit/push.** Runbook: `docs/nginx-local-staging-runbook.md`.

- **`scripts/generate-local-nginx-cert.sh` (novo):** bash `set -euo pipefail`; `openssl` gera cert autoassinado (RSA 2048, 365d) com **SAN** `DNS:localhost,DNS:clinicbridge.local,IP:127.0.0.1` em `infra/nginx/certs/local/clinicbridge.local.{crt,key}`; `chmod 600` na key; idempotente (não sobrescreve sem `FORCE=true`); para com instrução se faltar openssl. **Não gera cert de produção.**
- **`.gitignore`:** adicionado `infra/nginx/certs/`, `*.key`, `*.pem` — chave privada/cert local **nunca** versionados (verificado via `git check-ignore`).
- **`infra/nginx/conf.d/clinicbridge.local.conf`:** server `:80` → `return 301 https://$host:8443$request_uri` (HTTP→HTTPS); server `:443 ssl` com `ssl_certificate(_key)` montados, `ssl_protocols TLSv1.2 TLSv1.3`, proxy para `backend:3001` (resolver runtime), `X-Forwarded-Proto $scheme` (https no server TLS), anti-spoof `X-Real-IP`/`X-Forwarded-For` = `$remote_addr`, `client_max_body_size 10m`, logs seguros. **HSTS comentado** (desligado em local — evita prender o navegador a HTTPS no localhost; ligar só com HTTPS real estável).
- **`docker-compose.yml`:** nginx ganhou porta `127.0.0.1:${NGINX_HTTPS_PORT:-8443}:443` + volume `./infra/nginx/certs/local:/etc/nginx/certs:ro`. Comentário avisa para gerar o cert antes do `up` (senão o Nginx não sobe). **`.env.example`:** documentado `NGINX_HTTPS_PORT=8443` + nota de certs locais/`curl -k`/produção usa cert real.
- **Verificação e2e (profile `edge`, tudo containerizado):** cert gerado e gitignored; `nginx -t` OK; `compose ps` mostra `127.0.0.1:8080->80` + `127.0.0.1:8443->443`. HTTP `http://localhost:8080/health` → **301** `Location: https://localhost:8443/health`. HTTPS (`curl -k`): `/health`=200, `/health/live`=200, `/health/ready`=200 `database:ok`. `openssl s_client` confirma o SAN (localhost/clinicbridge.local/127.0.0.1). Readiness com `docker compose stop postgres` → **503** via HTTPS (liveness segue 200); volta a 200 ao religar. Access log do Nginx sem `Authorization`/`Cookie`/corpo (path sem query string). `X-Forwarded-Proto: https` é definido por construção (`$scheme` no server `listen 443 ssl`); a revalidação ao vivo via upstream de eco ficou inconclusiva por artefato de `default_server`/SNI no teste (não é defeito de config) — forwarding/anti-spoof de headers já comprovados nas Sprints 3.9/3.10. Containers de teste/echo removidos; `conf.d/` final só com o arquivo shipped.
- **Confirmado:** cert/key **não** stageados (`git status` não os mostra; `git check-ignore` confirma); sem WAF/ModSecurity/OWASP CRS; sem domínio/AWS/Cloudflare/cert real; `.env` real intocado; sem secret real (cert é autoassinado local); sem migration/schema; backend/frontend funcional não alterado; counts intactos (6/24/7); Nginx só em 127.0.0.1.

---

## Sprint 3.12 (ADR e escopo do módulo Agenda Administrativa — DOCS/ADR-ONLY)

Direção: ADR `docs/adr/0001-product-direction-option-c.md` (Opção C) → expansão **administrativa** de alto valor para o piloto **v0.1**. **Docs/ADR-only: sem backend, sem frontend, sem migration, sem schema, sem endpoint, sem tela, sem dado clínico, sem commit/push.**

- **Criou** ADR `docs/adr/0006-administrative-scheduling-module.md` ("Administrative Scheduling Module — agenda administrativa, não clínica"; Accepted; 2026-05-23; 17 seções). Decisão: ClinicBridge **terá** um módulo de **Agenda Administrativa** (agendamento), **administrativo/comercial, não clínico**; trabalha sobre pacientes administrativos existentes + profissionais da clínica; observações administrativas mínimas; implementação só em sprints separadas após o ADR.
- **Criou** `docs/administrative-scheduling-scope.md` (16 seções): status/objetivo, por que agenda, escopo administrativo, fora do escopo clínico, usuários/papéis (matriz), entidades conceituais, fluxos, status, regras, segurança/LGPD, auditoria, UX, roadmap, dados sintéticos, perguntas de validação, critérios de aceite do MVP.
- **Entidades conceituais propostas** (tenant-scoped por `clinica_id`, sem campo clínico): **ClinicProfessional** (id, clinica_id, nome, especialidade opcional/rótulo, ativo, timestamps) e **Appointment** (id, clinica_id, patient_id, professional_id opcional, starts_at, ends_at, status, administrative_notes opcional, created_by/updated_by, timestamps). Status: scheduled/confirmed/cancelled/rescheduled/no_show/completed (labels PT na UI).
- **Permissões (reuso dos papéis existentes, sem RBAC novo):** `dono_clinica` gerencia profissionais + todas as ações de agendamento; `secretaria` cria/remarca/cancela/confirma/no_show/concluído + visualiza (sem configs sensíveis); `admin_sistema` barrado por `requireClinic`. `requireRole` após `requireAuth`+`requireClinic`.
- **Fronteira anti-clínica fixada:** sem prontuário/diagnóstico/prescrição/CID/anamnese/exames/medicação/evolução/queixa/procedimento; `administrative_notes` administrativa (ex. permitido "pediu contato por telefone"; proibido "dor intensa"/"diagnóstico Y"). Sem edição/exclusão/merge de pacientes; sem delete físico (status `cancelled`); sem export/lembretes no MVP. LGPD: PII indireta (presença/horário) → minimização + acesso por papel + tenant; audit sem PII/observação.
- **Roadmap:** 3.13 backend → 3.14 frontend → 3.15 dados sintéticos/demo v0.1 → 3.16 polimento UX/dashboard.
- **Atualizou** `docs/project-state.md` (Sprint 3.12 + agenda como módulo futuro), `docs/roadmap-next-phase.md` (trilha da Agenda), `docs/security-notes.md` (riscos/proibição clínica), `docs/testing-checklist.md` (nota: agenda sem testes — não implementada), `CLAUDE.md` (referência curta).
- **Confirmado:** docs-only; nenhum backend/frontend/compose/`.env`/migration/schema/endpoint alterado; sem dado clínico; sem secret; sem commit/push.

---

## Sprint 3.13 (escopo de lembretes e WhatsApp para a Agenda Administrativa — DOCS/ADR-ONLY)

Direção: ADR `docs/adr/0006-administrative-scheduling-module.md` (agenda administrativa) → preparar comunicação de alto valor para clínicas, mantendo administrativo/seguro. **Docs/ADR-only: sem backend, sem frontend, sem migration, sem endpoint, sem integração WhatsApp, sem SDK, sem job/cron/fila, sem envio real, sem commit/push.**

- **ADR 0006:** adicionado adendo "Lembretes e comunicação administrativa". Decisão: a agenda **poderá** ter lembretes; **manual-first** (lembrete assistido, humano decide enviar); **WhatsApp** como canal futuro **com opt-in + templates neutros**; **WhatsApp automático/API oficial fica fora do MVP** e exige ADR/sprint própria; **nenhuma** mensagem com dado clínico; envios futuros auditáveis **sem armazenar conteúdo sensível** (só metadados); paciente pode **opt-out**; credenciais nunca no Git. Seção 17 (próximas sprints) renumerada.
- **`docs/administrative-scheduling-scope.md`:** nova **Parte II — Comunicação e lembretes (futuro)** com II.1 lembretes administrativos, II.2 WhatsApp manual/assistido (`wa.me?text=` neutro, sem API), II.3 WhatsApp automático futuro (gated), II.4 opt-in/preferências, II.5 templates neutros (exemplo permitido + proibidos), II.6 logs de envio (só metadados), II.7 regras anti-dado-clínico, II.8 roadmap de fases A–D, II.9 **modelos conceituais futuros** (PatientContactPreference, AppointmentReminder, MessageTemplate) — **não criar tabelas/migrations/envio agora**. Roadmap (seção 13) renumerado.
- **Templates:** exemplo **permitido** (lembrete neutro de horário/confirmar-remarcar) e **proibidos** (consulta psicológica/tratamento de ansiedade/avaliação para dor/retorno de medicamento — qualquer diagnóstico/motivo/especialidade sensível/tratamento/remédio).
- **Fases:** A agenda manual → B lembrete assistido/manual → C registro interno de lembrete → D WhatsApp automático futuro (opt-in/templates/logs/opt-out/config por clínica + análise jurídica/técnica).
- **Atualizou** `docs/security-notes.md` (subseção Lembretes/WhatsApp: mensagem neutra, opt-in/out, logs sem conteúdo, segredos fora do Git), `docs/roadmap-next-phase.md` (trilha da Agenda renumerada + lembrete + WhatsApp gated), `docs/project-state.md` (Sprint 3.13 + escopo futuro), `docs/testing-checklist.md` (nota: lembretes/WhatsApp sem testes — não implementados), `CLAUDE.md` (referência curta).
- **Numeração de implementação:** 3.14 backend → 3.15 frontend → 3.16 lembrete manual/assistido → 3.17 dados sintéticos/demo v0.1 → 3.18 polimento → sprint futura WhatsApp API.
- **Confirmado:** docs-only; nenhum backend/frontend/compose/`.env`/migration/endpoint/job/cron alterado; sem integração/SDK WhatsApp; sem token/API key/secret; sem dado clínico; sem commit/push.

---

## Sprint 3.14 (backend da Agenda Administrativa — implementação)

Direção: ADR `docs/adr/0006-administrative-scheduling-module.md` + `docs/administrative-scheduling-scope.md`. **Backend only: sem frontend, sem lembretes/WhatsApp, sem job/cron/fila, sem integração externa; sem mexer em Nginx/TLS/compose/`.env`; sem commit/push. Administrativo, sem dado clínico.**

- **Migration `20260526000000_scheduling.ts`:** cria `clinic_professionals` (id, clinica_id FK→clinics CASCADE, name, specialty_label nullable, is_active default true, timestamps) e `appointments` (id, clinica_id FK CASCADE, patient_id FK→patients CASCADE, professional_id FK→clinic_professionals SET NULL **nullable**, starts_at, ends_at, status default 'scheduled', administrative_notes nullable, created_by/updated_by FK→users SET NULL, timestamps). CHECK `appointments_status_check` (scheduled/confirmed/cancelled/rescheduled/no_show/completed) + CHECK `ends_at > starts_at`. Índices: clinic_professionals(clinica_id),(clinica_id,is_active); appointments(clinica_id,starts_at),(clinica_id,professional_id,starts_at),(clinica_id,patient_id,starts_at),(clinica_id,status). `migrate:latest` aplicou (batch 7).
- **Types/models:** `types/db.d.ts` ganhou `ClinicProfessionalRow`/`AppointmentRow` + registro em `Tables`. `models/clinicProfessional.ts` e `models/appointment.ts` (allowlist `APPOINTMENT_STATUSES`, `STATUS_UPDATE_ALLOWED` sem `rescheduled`, `toPublic*`). `PublicAppointment` inclui `administrative_notes` (administrativo) mas o audit/log nunca o grava.
- **DAOs (tenant-scoped, sem `listAll`, sem delete):** `clinicProfessionalDao` (create/listByClinic/findByIdForClinic/updateForClinic) e `appointmentDao` (create/listByClinic com filtros from/to/professional/status/limit/findByIdForClinic/updateStatusForClinic/rescheduleForClinic). `patientDao.existsForClinic` adicionado (read-only) para validar que o paciente pertence à clínica.
- **Services:** `clinicProfessionalService` (validação name≤200/specialty≤120/active filter; audit) e `appointmentService` (UUID/ISO date/`ends>starts`/status allowlist/notes≤500; valida patient e professional na mesma clínica → 400 seguro; filtros de listagem date=YYYY-MM-DD ou from/to/professional/status/limit≤500; audit). Reschedule atualiza horários e marca status `rescheduled` (decisão documentada). **Sem blocklist textual em `administrative_notes`** (evita falso positivo; só limite + documentação + UI futura avisa).
- **Controllers/routes/app:** `clinicProfessionalController`/`appointmentController`; `routes/clinicProfessionals.ts` (GET owner+secretaria; POST/PATCH/PATCH deactivate só `dono_clinica` via `requireRole(CLINIC_ADMIN_ROLES)`) e `routes/appointments.ts` (GET/POST/GET :id/PATCH :id/status/PATCH :id/reschedule — owner+secretaria; **sem DELETE**). Rate limit reusa `patientsRateLimit` (IP-keyed, antes do auth). Registrados em `app.ts` sem quebrar rotas existentes.
- **Permissões:** writes de profissional só owner (secretaria → 403); agendamentos owner+secretaria; `admin_sistema` barrado por `requireClinic`. `requireRole` após `requireAuth`+`requireClinic`.
- **Auditoria:** `clinic_professional.create/update/deactivate.success`, `appointment.create/list/detail/status.update/reschedule.success` — `recurso` clinic_professional/appointment, `recurso_id` (null em list), **sem PII, sem `administrative_notes`** (schema do audit não tem coluna de conteúdo).
- **Verificação:** `pnpm --filter backend typecheck` + `build` OK. Testes curl (backend efêmero no host:3001, tokens assinados via `tokenService` reusando user real para a FK `created_by`): sem token → 401/401; owner POST/GET/PATCH/deactivate profissional → 201/200/200/200; secretaria POST profissional → **403**, GET → 200; agendamento (secretaria) create → 201, list/date-filter/detail → 200, status confirmed → 200, reschedule → 200, status cancelled → 200. Negativos: status inválido 400, `ends<=starts` 400, paciente inexistente 400, paciente de outra clínica 400, profissional inexistente 400, notes>500 400, DELETE 404, detalhe cross-tenant 404. Audit confirmado sem PII; counts intactos (patients=6, import_files=24, import_sessions=7); `clinic_professionals`/`appointments` criadas e **dados de teste limpos** (0/0).
- **Confirmado:** sem frontend; sem WhatsApp/lembretes/job/cron; sem `.env` real/secret; sem dado clínico; sem delete físico; tenant isolation no DAO; sem commit/push.

---

## Sprint 3.15 (frontend da Agenda Administrativa — implementação)

Direção: ADR `docs/adr/0006-administrative-scheduling-module.md` + `docs/administrative-scheduling-scope.md`. **Frontend only: sem WhatsApp/lembretes/job; sem migration; sem alterar backend funcional (só o client ganhou PATCH); sem Nginx/TLS/compose/`.env`; sem commit/push. Administrativo, sem dado clínico.**

- **`services/api.ts`:** `FetchOptions.method` agora aceita **PATCH** (ajuste mínimo no client, não no backend). Tipos `PublicClinicProfessional`, `PublicAppointment`, `AppointmentStatus` + responses/params. Métodos: `listClinicProfessionals`/`createClinicProfessional`/`updateClinicProfessional`/`deactivateClinicProfessional`/`listAppointments`/`createAppointment`/`updateAppointmentStatus`/`rescheduleAppointment` (todos via `apiFetch`, throw `ApiError`).
- **`components/AdministrativeSchedulePanel.tsx` (+ `.module.css`):** filtros (data padrão hoje / profissional / status), criação de agendamento com **seletor de paciente** (reusa `GET /patients` com busca, sem endpoint novo), profissional opcional, início/fim (input time), observação administrativa opcional com **aviso anti-clínico**; lista em cards (horário, paciente, profissional, status em PT, observação); ações de status (Confirmar/Concluir/Faltou/Cancelar) escondidas em status terminais (cancelled/completed); **remarcação inline** (PATCH reschedule → status Remarcado). Estados loading/erro/vazio ("Nenhum agendamento para esta data.")/sucesso ("Agendamento criado."/"Status atualizado."/"Agendamento remarcado."). Tempos tratados em **UTC** no MVP (criação `${date}T${time}:00.000Z`, exibição via getUTC*) para alinhar com o filtro `date=YYYY-MM-DD` (janela UTC do backend).
- **`components/ClinicProfessionalsPanel.tsx` (+ `.module.css`):** lista de profissionais; **owner** cria (nome + rótulo opcional), edita (nome/rótulo) e desativa; **secretaria** vê a lista + nota amigável (gestão é do dono); botões de gestão escondidos para não-owner (defesa real é o `requireRole` do backend). Estados loading/erro/vazio/sucesso.
- **`views/Dashboard.tsx`:** adicionadas as seções `ClinicProfessionalsPanel` e `AdministrativeSchedulePanel` após o painel de retenção, antes do grid informativo. Nenhum card/feature existente removido.
- **Status em PT:** scheduled→Agendado, confirmed→Confirmado, cancelled→Cancelado, rescheduled→Remarcado, no_show→Faltou, completed→Concluído.
- **Anti-clínico/segurança na UI:** aviso visível no campo de observação; termos clínicos (prontuário/diagnóstico/prescrição/CID/medicação) aparecem **só** no texto de proibição, nunca como funcionalidade. 403→mensagem amigável; controles de gestão escondidos para secretaria.
- **Verificação:** `pnpm --filter frontend typecheck` + `build` OK (2211 módulos). Contratos do client batem com o backend já validado e2e na Sprint 3.14 (payloads: `professional_id` null, ISO `Z`, status/`ends>starts`). **Teste de browser não automatizado neste ambiente CLI/WSL** — verificação foi por typecheck/build + alinhamento de contrato; passos manuais no `docs/testing-checklist.md`.
- **Ressalvas:** nome do paciente no card vem do mapa dos primeiros 50 pacientes carregados (fallback para id curto se fora da página) — sem endpoint get-by-id; tempos em UTC (simplificação MVP); transições de status sem máquina de estados completa.
- **Confirmado:** sem WhatsApp/lembretes/job/cron; sem migration; sem dado clínico; backend funcional intacto (só client+PATCH); sem `.env`/secret; sem commit/push. Counts intactos.

---

## Sprint 3.16 (app shell — navegação, cache/invalidação e polimento estrutural — frontend)

Direção: QA da 3.15 (bug de sync profissional→agenda + `/app` longo demais). **Frontend only: sem backend/migration/schema; sem WhatsApp/lembretes/job; sem Nginx/TLS/compose/`.env`; sem commit/push. Administrativo, sem dado clínico.**

- **Biblioteca de cache:** escolhido **TanStack Query** (`@tanstack/react-query@^5`) em vez de SWR — mutations + `invalidateQueries` por chave resolvem o bug de forma idiomática (uma chave compartilhada sincroniza componentes irmãos), DX madura e tipada. Custo no bundle moderado (~+13kB gzip). Provider `QueryClientProvider` em `main.tsx` com defaults conservadores (`staleTime 30s`, `retry 1`, `refetchOnWindowFocus:false`).
- **Bug profissional→agenda corrigido:** `ClinicProfessionalsPanel` e `AdministrativeSchedulePanel` refatorados para `useQuery`/`useMutation`. Ambos consomem a chave **`['clinic-professionals']`** (prefixo; o painel usa `'all'`, a agenda `'active'`). As mutations de profissional (`create`/`update`/`deactivate`) chamam `invalidateQueries(['clinic-professionals'])` → o select de profissional da agenda atualiza **sem F5**. Mutations de agendamento (`create`/`status`/`reschedule`) invalidam `['appointments']` → a lista atualiza sozinha. Token lido por request via `getToken()` (não persistido no cache).
- **Navegação do `/app`:** `Dashboard` reorganizado em **abas** (Início/Importações/Pacientes/Agenda/Segurança) com estado local, título+subtítulo por seção, ícones e estado ativo — encurta a página (cada aba mostra só seus painéis). Painéis existentes apenas realocados (wiring Upload→ImportSessionsList via `refreshKey` preservado; retenção só para owner). Nenhuma feature removida.
- **Footer** no app autenticado: marca + "MVP administrativo" + aviso "Ferramenta administrativa. Não substitui prontuário ou sistema clínico." + itens textuais (Segurança/Privacidade/Suporte/Roadmap, sem páginas reais). Discreto e responsivo.
- **Listas longas:** a navegação por abas resolve o principal (página deixou de empilhar tudo). `PatientsList` já tinha "carregar mais" (paginação de backend). Paginação dedicada por lista (revisões/duplicados) fica como melhoria futura — documentado.
- **Verificação:** `pnpm --filter frontend typecheck` + `build` OK (2258 módulos; JS ~496kB / ~150kB gzip). **Teste de browser não automatizado neste ambiente CLI/WSL** — validado por typecheck/build + revisão; passos manuais no `docs/testing-checklist.md`.
- **Anti-clínico mantido:** avisos da agenda intactos; footer reforça caráter administrativo; nenhum termo clínico como funcionalidade.
- **Confirmado:** dependência adicionada (`@tanstack/react-query`, `package.json` + `pnpm-lock.yaml`); sem backend/migration/schema; sem WhatsApp/lembretes/job; sem `.env`/secret; sem dado clínico; sem commit/push.

---

## Sprint 3.17 (QA visual e polimento da Agenda + Landing/Roadmap — frontend/UX)

Direção: QA visual pós-3.16 (agenda confusa; landing/Roadmap desatualizada). **Frontend/UX + docs: sem backend/migration/schema; sem WhatsApp/lembretes/job; sem `.env`/secret; sem commit/push. Administrativo, sem dado clínico.**

- **Agenda — cabeçalho temporal:** `AdministrativeSchedulePanel` ganhou barra de data com **data legível** ("Agenda de {dia da semana}, {DD de mês de AAAA}" via `toLocaleDateString('pt-BR')`, parse ao meio-dia local p/ evitar shift de fuso) + navegação **Anterior / Hoje / Próximo** (além do input date mantido nos filtros) + **resumo do dia** em chips (Total, Agendados [scheduled+rescheduled], Confirmados, Concluídos, Faltas/Cancelados) calculado no front a partir da lista.
- **Agenda — timeline por horário:** lista virou `timeline` com trilha de horário à esquerda (início em destaque + fim), ordenada por `starts_at` asc no front; cada card mostra paciente (destaque), profissional, horário, status em badge, observação administrativa e ações. Estado vazio com ícone + "Nenhum agendamento para {dia}." + botão "+ Novo agendamento".
- **Agenda — formulário colapsável:** o form de novo agendamento não fica mais sempre aberto; botão **"+ Novo agendamento"** expande, "Fechar" recolhe, e ao criar com sucesso fecha e limpa. Mantidos: busca/seleção de paciente, profissional opcional, início/fim, observação + **aviso anti-clínico**.
- **Labels:** "especialidade" → **"função/rótulo interno"** (subtítulo + placeholder do `ClinicProfessionalsPanel`), reforçando que o rótulo não é dado clínico. Termos clínicos seguem **só** nos avisos de proibição.
- **Landing/Roadmap:** `components/Roadmap.tsx` refatorado de "Roadmap do MVP — Sprint 0/1/2/3" (desatualizado, maioria `done:false`) para **"O que o ClinicBridge entrega no piloto"** — 4 cards de capacidades (Migração de dados, Pacientes administrativos, Agenda administrativa, Segurança e governança), todos como entregues. Sem "Sprint N", sem linguagem de obra; honesto ("versão piloto administrativa", sem afirmar produção/compliance). Reusa o CSS existente (`Roadmap.module.css`).
- **Responsivo:** timeline colapsa para 1 coluna < 32rem (trilha de horário vira linha); chips/nav/datebar quebram linha; sem corte horizontal.
- **Verificação:** `pnpm --filter frontend typecheck` + `build` OK (2258 módulos; ~500kB JS / ~151kB gzip; CSS ~90kB). **Browser não automatizado neste ambiente CLI/WSL** — validado por typecheck/build + revisão; passos manuais no `docs/testing-checklist.md`.
- **Confirmado:** sem backend/migration/schema; sem WhatsApp/lembretes/job; sem dado clínico; sem `.env`/secret; sem commit/push. Nenhuma feature removida (upload/import/pacientes/duplicados/export/retenção/agenda intactos).
- **Ajustes de QA (continuação 3.17):** (1) Agenda — badge classificando a data selecionada (`dayKind` via comparação de YYYY-MM-DD local): **Hoje** (cyan), **Amanhã** (teal), **Ontem** (âmbar), **Data selecionada** (neutro); botão alterna "Hoje" (ativo, quando a data é hoje) ↔ **"Ir para hoje"** (secundário, quando não é) — resolve a confusão de "parecer Hoje" ao navegar dias. (2) Login/cadastro: `AuthAside` reescrito (título "Gestão administrativa segura para clínicas" + 5 bullets: Pacientes organizados, Agenda administrativa, Sessão protegida, Migração e exportação, Não é prontuário clínico — removido o bullet desatualizado "Upload CSV/XLSX em breve"); subtítulos de `RegisterPage`/`LoginPage` ampliados, sem prometer prontuário/clínico/produção/compliance. typecheck+build OK.

---

## Sprint 3.18 (lembrete manual/assistido da Agenda Administrativa — frontend)

Direção: ADR 0006 (adendo de lembretes) + `docs/administrative-scheduling-scope.md` Parte II (fase B — lembrete assistido). **Frontend only: sem backend/migration/schema; sem WhatsApp API oficial; sem SDK; sem envio automático; sem job/cron/fila/webhook; sem token/secret; sem `.env`; sem commit/push. Administrativo, sem dado clínico.**

- **`frontend/src/utils/reminders.ts` (novo, funções puras):** `buildReminderMessage` (template **neutro**), `formatReminderDate` (DD/MM/YYYY sem shift de fuso), `formatReminderTime` (HH:MM UTC, consistente com a agenda), `normalizeWhatsappPhone` (só dígitos; DDI 55 + 10/11 mantém; 10/11 locais → prefixa 55; senão null), `buildWhatsappUrl` (`https://wa.me/<num>?text=<encoded>` ou null). Comentário no topo deixa explícito: só prepara, humano envia; sem API oficial/automação; nunca dado clínico.
- **`AdministrativeSchedulePanel`:** mapa de paciente passou a guardar o objeto completo (nome + telefone). Por card, só para status `scheduled`/`confirmed`/`rescheduled`, uma linha "Lembrete administrativo" com **"Copiar lembrete"** (`navigator.clipboard.writeText` + fallback amigável → "Mensagem copiada.") e **"Abrir WhatsApp"** (`window.open(wa.me, _blank, noopener,noreferrer)` se houver telefone; senão "Paciente sem telefone disponível."). Usa `useAuth().clinic?.nome` para a clínica. Mensagem montada só com nome+clínica+data+hora.
- **Edição local da mensagem (continuação 3.18):** botão "Ver/editar mensagem" abre um textarea por agendamento prefilled com o template; "Copiar lembrete"/"Abrir WhatsApp" passam a usar a **mensagem efetiva** (draft local se houver, senão o padrão); "Restaurar padrão" volta ao template neutro; "Fechar" recolhe (o draft persiste **só em memória** enquanto a tela estiver aberta). Estado `reminderDrafts: Record<id,string>` + `openReminderId` — **sem backend, sem localStorage, sem persistência**. `maxLength` 700 + contador + aviso anti-clínico próximo ao textarea.
- **Anti-clínico/segurança:** a mensagem padrão **não** inclui `professionalName`/`specialty_label`, `administrative_notes`, status, CPF, e-mail nem qualquer texto clínico/área sensível; comentário no código reforça isso. O texto editável tem aviso visível ("Não inclua diagnóstico, queixa, medicação…"); sem bloqueio textual automático (evita falso positivo). Sem registro de envio; textos evitam "enviar automaticamente".
- **CSS:** botões de lembrete discretos (linha própria com rótulo), quebram linha no mobile.
- **Verificação:** `pnpm --filter frontend typecheck` + `build` OK. **Browser não automatizado neste ambiente CLI/WSL** — validado por typecheck/build + revisão; passos manuais no `docs/testing-checklist.md`.
- **Confirmado:** sem backend/migration/schema; sem WhatsApp API/SDK/envio automático/job/cron/fila/webhook; sem token/secret; sem dado clínico; sem commit/push. Nenhuma feature removida.

---

## Sprint 3.19 (MFA no login com TOTP — backend + frontend)

Direção: reforço de segurança (Fase 3). **MFA por TOTP (app autenticador). Sem SMS, sem e-mail OTP, sem serviço externo/pago, sem dado clínico, sem commit/push.**

- **Libs:** `otplib@13` (TOTP) + `qrcode` (+ `@types/qrcode`) no backend. QR gerado no backend como data URL (frontend só renderiza `<img>`). Sem serviço externo de QR.
- **Secret cifrado em repouso:** `config/mfaCrypto.ts` (AES-256-GCM; chave HKDF-SHA256 do `JWT_SECRET`, ou `MFA_ENCRYPTION_KEY` opcional). `MFA_ENCRYPTION_KEY` adicionada ao `env.ts` (opcional) + `.env.example` (sem alterar `.env` real). `services/totpService.ts` (generateSecret/otpauthUrl/verify com `epochTolerance` 30s/qrDataUrl).
- **Migration `20260527000000_user_mfa`:** campos em `users` (`mfa_enabled` default false, `mfa_secret_encrypted`, `mfa_pending_secret_encrypted`, `mfa_pending_created_at`, `mfa_enabled_at`, `mfa_last_verified_at`). Aditiva: 13 usuários existentes ficaram `mfa_enabled=false`. `types/db.d.ts` + `userDao` (setPendingMfaSecret/enableMfa/disableMfa/touchMfaVerified).
- **Fluxo login 2 passos:** `tokenService.signMfaChallenge/verifyMfaChallenge` (JWT 5min, `typ=mfa_challenge`, sem `papel` → rejeitado por `requireAuth`). `authService.login` retorna `LoginOutcome` (sessão normal **ou** `{mfa_required, mfa_challenge_token}` quando MFA on — senha validada mas sem JWT). `verifyMfaLogin` valida challenge+código e emite o JWT. `mfaSetup/mfaConfirm/mfaStatus/mfaDisable` (setup grava pending cifrado, expira 10min; confirm ativa; disable exige TOTP válido). `authController` + rotas sob `/auth/*` (herdam `authRateLimit`): `/auth/mfa/verify-login` (sem auth, usa challenge), `/setup|/confirm|/status|/disable` (requireAuth).
- **Frontend:** `api.ts` (login union + verifyMfaLogin/getMfaStatus/setupMfa/confirmMfa/disableMfa); `AuthProvider` (`login` retorna `{mfaRequired, challengeToken?}` + `completeMfaLogin`; challenge só em state, nunca persistido); `LoginPage` (passo de código de 6 dígitos + "Voltar"); `MfaSettings` na aba Segurança (status; ativar → QR + chave manual + confirmar; desativar com código) — secret nunca exibido após ativado, nunca em localStorage.
- **Verificação e2e (backend efêmero, usuário descartável):** register→login (token) → status false → setup (manual_key+otpauth+qr) → confirm código errado **400** / válido **enabled true** → status enabled sem secret → login **mfa_required sem token** → verify-login errado **401** / válido **token** → disable errado **400** / válido **disabled** → login normal pós-disable. Audit `auth.mfa.*` presente sem secret/código; **log do backend sem o secret** (grep count 0). `migrate:latest` (batch 8); backend+frontend typecheck/build OK.
- **Auditoria:** `auth.mfa.setup.started/confirmed`, `auth.mfa.login.challenge/success/failure`, `auth.mfa.disable.success/failure` (recurso `auth`, sem PII/secret/código).
- **Ressalvas:** backup codes (futuro); cifra do secret derivada do `JWT_SECRET` por padrão → P1: chave dedicada/KMS em produção (trocar `JWT_SECRET` sem chave dedicada invalida secrets MFA). MVP não pronto para produção.
- **Confirmado:** sem SMS/e-mail OTP/serviço externo; sem dado clínico; usuários sem MFA intactos; `.env` real não alterado; sem secret/código em logs; sem commit/push.

---

## Sprint 3.20 (dados sintéticos + roteiro/checklist de demo do piloto v0.1)

**Entregáveis:**
- `docs/demo-data/pacientes-demo.csv` (12 pacientes fictícios; cabeçalhos casam com o auto-mapeamento; 1 duplicado intencional + 1 só-email; CPFs inválidos/placeholder; e-mails `@example.com`) + `docs/demo-data/README.md`.
- Seed dev-only `backend/scripts/seed-demo-scheduling.ts` + scripts `seed:demo`/`seed:demo:clean`: guard `NODE_ENV=production`, tenant-scoped (clínica com mais pacientes ou `SEED_CLINIC_ID`), cria pacientes (`origem='seed_demo'`) + profissionais `[DEMO]` + agendamentos fictícios (notas administrativas neutras); idempotente; cleanup remove só o demo (pacientes por `origem`, profissionais por nome `[DEMO]`).
- `docs/demo-pilot-v0.1-script.md` + `docs/demo-pilot-v0.1-checklist.md`.

**Notes:**
- Administrativo, **não clínico**; sem migration/endpoint/WhatsApp/envio automático/job/cron. Validado e2e (seed/clean/idempotência); typecheck OK. Sem commit.

---

## Sprint 3.21 (MFA backup codes / códigos de recuperação — backend + frontend)

**Migration:**
- `20260528000000_user_mfa_backup_codes`: tabela `user_mfa_backup_codes` (`id`, `user_id` FK→users CASCADE, `code_hash`, `used_at`, `created_at`; índices `user_id` e `user_id,used_at`). Só **hash**, nunca texto puro. (`types/db.d.ts` atualizado.)

**Backend:**
- `mfaBackupCodeDao` (replaceForUser/deleteForUser/listUnusedByUser/markUsed por CAS/countUnusedByUser). `mfaBackupCodeService` (gera 10 códigos alfanuméricos sem `0/O/1/I/L`, formato `ABCDE-FGHJK`, ~49 bits; hash via `passwordService`/argon2id; `consume` = verify + markUsed uso único).
- `authService`: `mfaConfirm` ativa MFA **e** gera os códigos numa transação, retornando-os 1x (`MfaConfirmResult`) + audit `auth.mfa.backup_codes.generated.success`; `verifyMfaLogin` aceita **TOTP ou backup code** (erro genérico `invalid_mfa_code`; backup uso único → `auth.mfa.backup_code.used.success`); `mfaDisable` apaga os códigos (transação); `mfaStatus` retorna `backup_codes_remaining` (nunca os códigos); novo `regenerateBackupCodes` (exige TOTP, invalida os anteriores → `auth.mfa.backup_codes.regenerated.success` / `.regenerate.failure`).
- Endpoint novo `POST /auth/mfa/backup-codes/regenerate` (requireAuth + TOTP), sob `/auth/*` → herda `authRateLimit`. `VerifyMfaLoginSchema.code` ampliado p/ max 32 (acomoda backup formatado).

**Frontend:**
- `api.ts`: `confirmMfa` retorna `MfaConfirmResponse` (com `backup_codes`); novo `regenerateMfaBackupCodes`; `MfaStatusResponse` ganhou `backup_codes_remaining`.
- `MfaSettings`: mostra os códigos **1x** (lista + "Copiar todos" + checkbox "Eu salvei meus códigos" + "Concluir"); quando MFA ativo mostra contagem restante e "Gerar novos códigos de recuperação" (com aviso de invalidação + campo TOTP).
- `LoginPage`: passo MFA aceita "código do app autenticador **ou** de recuperação" (input alfanumérico, sem forçar 6 dígitos).

**Verificação (e2e por curl, backend efêmero :3025, usuários descartáveis):** 11/11 — ativar→10 codes; `/auth/me` sem codes; login TOTP; login backup; reuso→401; inválido→401 `invalid_mfa_code`; regenerar invalida antigos; login com novo; sem-MFA→400 `mfa_not_enabled`; audit com os eventos esperados e **sem** códigos; `code_hash` `$argon2id`; log sem códigos/secret. `migrate:latest` batch 9; backend build + frontend typecheck/build OK.

**Ressalvas:** verify de backup faz argon2.verify sequencial sobre os códigos não usados (custo aceitável p/ login de recuperação raro); chave dedicada/KMS do secret TOTP segue P1 (não afeta backup codes — são hash). Sem SMS/e-mail/WhatsApp OTP, sem recovery por suporte/bypass, sem job/cron. Validação **visual** do frontend pendente (ambiente sem browser). Sem dado clínico. Sem commit/push.

---

## Sprint 3.22 (CRUD administrativo de pacientes — Escopo A)

Direção: Opção C (base administrativa segura). **CRUD administrativo de pacientes**
— criar manual, editar, **arquivar/restaurar por soft-delete**. Decisões aceitas:
Escopo A agora (B depois); criar/editar = `dono_clinica` + `secretaria`;
arquivar/restaurar = **só `dono_clinica`**; soft-delete via `status='archived'`
(**sem delete físico**); **sem migration** (`patients.status` já aceita
`active/inactive/archived`, `origem` já existe); arquivar **não** apaga
agendamentos; arquivado sai da listagem padrão **e** do seletor da agenda; filtro
para ver/restaurar arquivados; audits **sem PII**; CPF nunca volta bruto.

**Backend:**
- `patientDao`: + `findByIdForClinic`, `create` (força `origem='manual'`/
  `status='active'`/`import_session_id=null`), `updateForClinic` (patch parcial,
  toca `atualizado_em`), `setStatusForClinic` (archive/restore). Tudo filtra
  `{ id, clinica_id }`. **Sem delete físico.**
- `patientService`: validação administrativa (nome obrigatório; CPF 11 dígitos;
  e-mail; data AAAA-MM-DD ou DD/MM/AAAA, sem futuro; limites de tamanho) **sem
  ecoar o valor** no erro (`patient_invalid`/400). `listForClinic` aplica
  `status` (default `active`). `createForClinic`/`updateForClinic`/
  `archiveForClinic`/`restoreForClinic`; id inexistente/cross-tenant → **404
  genérico** `patient_not_found`. Audits `patient.create/update/archive/restore.
  success` (só `recurso_id` UUID).
- Controller/rotas: `POST /patients` + `PATCH /patients/:id` (dono + secretaria);
  `PATCH /patients/:id/archive` + `.../restore` (`requireRole(CLINIC_ADMIN_ROLES)`
  após `requireClinic`, **só dono**); `GET /patients?status=active|archived|
  inactive|all` (default `active`). Reusa `patientsRateLimit`.

**Frontend:**
- `api.ts`: `ListPatientsParams.status`; `createPatient`/`updatePatient`/
  `archivePatient`/`restorePatient`; tipos `PatientWritePayload`/`PatientResponse`/
  `PatientStatusFilter`.
- `PatientsList.tsx`: "Novo paciente" + formulário (criar/editar), filtro de status
  (Ativos/Arquivados/Todos), ações por card de Editar (dono + secretaria) e
  Arquivar/Restaurar (**só dono**), empty states por contexto (sem ativos / sem
  arquivados / erro seguro). CPF só mascarado; na edição, campo CPF em branco
  **mantém** o atual. Agenda (`AdministrativeSchedulePanel`) já reusa `GET
  /patients` default → arquivados somem do seletor automaticamente.

**Verificação:** backend + frontend `typecheck` + `build` OK. Matriz por API (Node
`fetch`, backend dev :3001, contas descartáveis em 1 clínica + 1 cross-tenant)
**25/25**: secretaria cria/edita; secretaria **não** arquiva (403 `forbidden_role`);
dono arquiva (status `archived`); arquivado some da listagem padrão; `?status=
archived` mostra; dono restaura; cross-tenant edit/archive/restore → **404**
`patient_not_found` e listagem cross-tenant não vê o paciente; resposta com
`cpf_masked` e **sem** CPF bruto; `origem='manual'`/`status='active'` no create;
CPF inválido → 400 `patient_invalid` sem ecoar valor; audit com as 4 ações e **sem**
PII (schema sem `metadata`/`entidade_tipo`). Dados de teste removidos após o run.
Validação **visual** no navegador pendente. Sem commit/push.

**Ressalvas/limites:** CPF não pode ser **limpo** na edição pela UI (campo em
branco = manter), porque o cliente só tem o mascarado — aceitável no MVP. Sem
merge, sem delete físico, sem reidratação de agendamentos órfãos (arquivar
preserva, não toca agendamentos). Papel vem do JWT (stale até expirar, igual aos
demais endpoints). Sem dado clínico.

**Inclui ainda — polimentos de copy (working tree, mantidos):**
- `Hero.tsx` / `Footer.tsx` (landing): rótulo desatualizado "Sprint 0" → "piloto v0.1" / "Piloto administrativo · v0.1".
- `HowItWorks.tsx`: passo "Revise o mapeamento" cita os campos reais (nome/telefone/e-mail/CPF/data de nascimento, sem "convênio", que não é mapeado); passo de inconsistências deixou de prometer "Corrija ou mescle direto na revisão" (o import **não** edita/mescla pacientes) → "sinalizados na validação, antes de importar".
- `Dashboard.tsx` (aba Segurança, "Checklist do MVP"): "Lembretes administrativos (em breve)" estava desatualizado (lembrete manual entregue na 3.18) → itens atualizados (auth + MFA + códigos de recuperação; importação; agenda + lembrete manual; "Preparação para produção (em andamento)" como item pendente honesto).
- `docs/demo-pilot-v0.1-script.md` / `-checklist.md`: etapa de Segurança/login atualizada com os **códigos de recuperação** (3.21) — exibidos 1x, copiar + "salvei", regenerar invalida anteriores, login aceita app **ou** código de recuperação.

**Decidido NÃO alterar (registrado):** CTAs de marketing da landing ("Analisar arquivo", "Solicitar análise", "Entrar na lista de espera") — apontam para `/register`, framing de piloto aceitável; rota não muda. "Links" inertes do footer do Dashboard (Segurança/Privacidade/Suporte/Roadmap) — baixo valor, risco de layout; mantidos. Claim LGPD "solicitar exclusão" na landing — usa "solicitar" (posture), mantido.

**Ajuste de copy/UX da tela de Pacientes (após validação visual):** achado — com muitos registros a tela fica longa/poluída e parece tentar mostrar "todos os pacientes". Ajuste **pequeno e seguro** (sem refactor/tabela grande): subtítulo explica que a lista é **paginada/filtrada** e incentiva busca + filtros; contador mostra o filtro atual e, quando há mais páginas, sinaliza "(página atual — há mais registros)" com dica para refinar; cards mais **compactos** (grid mais denso `minmax(17.5rem)`, gaps menores) via CSS. Mantidos paginação/"Carregar mais". `frontend typecheck`+`build` OK.

**Gap conhecido:** o papel `secretaria` **não é testável pelo navegador** (só existe via SQL) até existir gestão de equipe na UI — a matriz por API cobriu o papel criando a secretaria por SQL.

**Próximas sprints recomendadas (em `docs/roadmap-next-phase.md`):** (a) **3.23 — duplicados acionáveis / correção de importação** (editar/arquivar por grupo reusando o CRUD da 3.22; **merge seguro só depois**, com confirmação+audit, **sem** merge automático; paginação de duplicados); (b) **sprint futura — gestão de equipe / convite de secretaria** (secretaria solicita entrada → dono aprova → papel aplicado só após aprovação, tudo auditado, **sem autoentrada**).

**Verificação:** backend + frontend `typecheck`/`build` OK; matriz por API **25/25** (contas descartáveis; dados removidos no fim). Validação **visual** no navegador pendente (e o fluxo de secretaria depende de gestão de equipe). Sem commit/push.

---

## Sprint 3.23 (duplicados acionáveis / correção de pacientes — frontend)

Direção: Opção C (base administrativa segura). Tornar a tela "Possíveis duplicados" **acionável**, **reusando o CRUD de pacientes da 3.22**. **Frontend apenas — SEM backend, SEM migration, SEM endpoint novo, SEM merge.**

**Por que sem backend:** o `GET /patients/duplicates` já devolve `PublicPatient` completos por grupo (id + campos administrativos + `cpf_masked` + status), suficiente para editar/arquivar/restaurar via os endpoints da 3.22. As ações são `PATCH /patients/:id` (editar) e `.../archive` / `.../restore`. Nada novo no servidor.

**Frontend:**
- **`PatientEditForm.tsx`** (novo, + `.module.css`): form de edição administrativa reutilizável (nome/telefone/e-mail/CPF/nascimento/convênio/carteirinha). Na edição, CPF em branco **mantém** o atual (só vem mascarado). Decisão consciente: **não** refatorei o form da `PatientsList` (código recém-commitado da 3.22) — pequeno duplo aceitável, risco zero de regressão.
- **`DuplicatesList.tsx`:** ações por registro — **Editar** (dono + secretaria, abre o form inline), **Arquivar** (não-arquivados) e **Restaurar** (arquivados), ambos **só dono** (backend valida com `requireRole`; UI esconde para os demais e trata 403 com mensagem amigável). **Destaque dos campos que bateram** (mapa `reasons → campos`), **status por registro**, **só CPF mascarado**, cabeçalho "Motivo: …". **Paginação simples de grupos no frontend** ("Carregar mais grupos", `GROUPS_PAGE=8`) — backend já limita o scan por `DUPLICATES_SCAN_MAX_ROWS` e ordena mais fortes primeiro. Avisos: "Revise os dados antes de arquivar", "Arquivar não apaga histórico nem agendamentos", "Merge automático ainda não existe".
- **Refresh cruzado:** `Dashboard` ganhou `patientsRefresh` (contador compartilhado, mesmo padrão do `sessionsRefresh`); `PatientsList` e `DuplicatesList` recebem `refreshKey` + `onPatientsChanged`. Ação em qualquer painel recarrega **ambos**. `PatientsList` preserva busca/filtro ao recarregar por `refreshKey` (efeito separado, pula o mount).

**Decisão (status no scan):** `listForDuplicateScan` não filtra status, então arquivar um duplicado **não some** o grupo — o registro fica marcado **Arquivado** com ação **Restaurar**. É o "grupo muda corretamente" do enunciado; restaurar a partir dos duplicados faz sentido porque arquivados aparecem. (Excluir arquivados do scan exigiria mexer no backend — fora do escopo desta sprint.)

**Não feito (fora de escopo, registrado):** merge real (auto/manual); mover agendamentos entre pacientes; delete físico; paginação **backend** de duplicados; qualquer alteração de import sessions/dry-run/pipeline; gestão de equipe/secretaria.

**Verificação:** `frontend typecheck` + `build` OK. Backend **não** tocado. Matriz por API (Node fetch, backend dev :3001, contas descartáveis: dono + secretaria na mesma clínica + dono de outra) **13/13**: grupo de CPF igual aparece; resposta só com `cpf_masked` (sem CPF bruto); secretaria edita membro do grupo; secretaria **não** arquiva (403 `forbidden_role`); dono arquiva → grupo mostra o membro `archived`; dono restaura; cross-tenant → 404; audit com `patient.create/update/archive/restore.success` e **sem PII**. Dados de teste removidos no fim.

**Ressalvas/limites:** sem merge (entrega "lista 100% certa" continua manual: editar/arquivar registro a registro); CPF não pode ser **limpo** na edição pela UI (branco = manter); paginação de grupos é só visual (cliente) — base muito grande pede paginação backend (próxima melhoria). Validação **visual** no navegador pendente; fluxo de **secretaria** ainda não testável pelo navegador (só via SQL) até gestão de equipe. Sem dado clínico. Sem commit/push.

**Próximo no tema (roadmap):** merge seguro com confirmação + auditoria (**sem** automático); paginação backend de duplicados; e, em trilha própria, gestão de equipe / convite de secretaria.


---

## Sprint 3.24 (gestão de equipe / solicitação de entrada de secretaria)

Direção: Opção C (base administrativa segura). **Primeira sprint da trilha "equipe"**: permitir que uma secretaria se cadastre, peça acesso a uma clínica e que o(a) dono(a) **aprove** — tudo administrativo, sem autoentrada, sem busca/listagem pública de clínicas, sem e-mail/WhatsApp automático.

**Decisões de produto:** **código de convite por clínica**; dono compartilha o código fora do sistema (canal próprio); secretaria se cadastra e **solicita** entrada com o código; **dono precisa aprovar** (não há autoentrada); erros do fluxo de invite são **genéricos** (`invalid_invite`) para impedir enumeração; regeneração de código fica para sprint futura.

**Migrações (`20260529000000_clinic_team`):**
- `ALTER clinics ADD COLUMN invite_code TEXT NOT NULL` + `UNIQUE` (índice case-insensitive). Backfill atômico no `up` para clínicas existentes.
- `clinic_join_requests (id, clinic_id, user_id, requested_role='secretaria', status, message, decided_by_user_id, decided_at, created_at, updated_at)` com `CHECK` em `requested_role`/`status`, FKs (clinic/user/decided_by), unique parcial em `(user_id, clinic_id) WHERE status='pending'`.

**Backend:**
- `utils/inviteCode.ts`: `generateInviteCode` (alfabeto `0-9A-Z` sem `O/0/I/1`), `normalizeInviteCode`, `formatInviteCode` (XXXX-XXXX). `clinicDao` ganhou `findByInviteCode` + campo `invite_code` no `create`.
- `clinicJoinRequestDao`: `create`, `findPending`, `findByIdForUser`, `findByIdForClinic`, `listByUser` (join com nome da clínica), `listPendingForClinic` (join com nome/email do solicitante — **só** visível ao dono, **nunca** logado), `setStatus`, `cancelOtherPending`.
- `clinicJoinRequestService`: `requestJoin` exige `papel='secretaria'` e `clinica_id=null`; resolve clínica pelo invite **normalizado**; opcional `clinic_name` é só confirmação (mismatch → mesmo `invalid_invite`); de-dup com `findPending` + corrida com `unique partial index` → 409 `request_already_pending`. `approve` é **atômico** (`setStatus + userDao.setClinic + cancelOtherPending`), valida solicitante ativo e sem clínica e papel='secretaria'. `reject`/`cancel` simples. Cross-tenant/inexistente → **404 genérico** `request_not_found`.
- `authService.registerStaff` (novo) e `authController` aceita `account_type: owner|staff` (owner é o padrão, comportamento anterior preservado). Staff vira `papel='secretaria'` com `clinica_id=null`.
- Rotas (`backend/src/routes/clinicJoinRequests.ts`, registradas em `app.ts`):
  - `GET /clinics/invite-code` — dono (`requireRole(CLINIC_ADMIN_ROLES)`).
  - `POST /clinic-join-requests` — secretaria autenticada **sem clínica**.
  - `GET /clinic-join-requests/me` — usuário lista as próprias.
  - `PATCH /clinic-join-requests/:id/cancel` — usuário cancela a própria pendente.
  - `GET /clinic-join-requests/pending` — dono lista pendentes da própria clínica.
  - `POST /clinic-join-requests/:id/approve` / `.../reject` — dono decide.
- Audits **sem PII** (`recurso='clinic_join_request'`, só UUID em `recurso_id`):
  `clinic.join_request.created/cancelled/approved/rejected.success` e `auth.register.staff.success`. Audit `auth.register.success` (dono) mantido.
- Rate limit: reutiliza `patientsRateLimit` (IP-keyed, antes do auth). **Não** subiu novo store.

**Frontend:**
- `api.ts`: tipos `RegisterStaffPayload/Response`, `JoinRequestStatus`, `MyJoinRequest`, `PendingJoinRequest`, `InviteCodeResponse`; métodos `registerStaff`, `getClinicInviteCode`, `createClinicJoinRequest`, `listMyJoinRequests`, `cancelMyJoinRequest`, `listPendingJoinRequests`, `approveJoinRequest`, `rejectJoinRequest`. `register` agora envia `account_type:'owner'` explicitamente (backward compatible).
- `RegisterPage.tsx`: seletor "Sou dono(a) / Sou funcionário(a)" no topo; o campo "Nome da clínica" só aparece para `owner`; mensagem de sucesso muda por tipo (staff é orientado a "fazer login e usar o código de convite"). CSS novo em `Auth.module.css` (`.accountTypeGroup`, `.accountTypeOption`).
- `JoinClinicGate.tsx` (novo, + módulo CSS): tela exibida quando `user && !clinic` no `/app`. Form de invite code + nome opcional + mensagem; lista das próprias solicitações com status (pendente/aprovada/recusada/cancelada), botão **Cancelar** nas pendentes, botão "Já fui aprovado(a)? Recarregar sessão" (chama `refreshMe`). Polling leve via TanStack Query (`refetchInterval: 15s`). Bloqueia novo envio se já existe pendente.
- `TeamManagementPanel.tsx` (novo, + módulo CSS): aba **Equipe** no Dashboard, visível **só para `dono_clinica`** (UI esconde; backend gateia). Mostra **código de convite** com botão "Copiar" + nome da clínica, **solicitações pendentes** (nome/e-mail/mensagem/data) com **Aprovar/Recusar** (cada ação tem `window.confirm` com aviso explícito — aprovar dá acesso administrativo). Polling 20s. Sem PII em logs.
- `Dashboard.tsx`: tab `equipe` (`ownerOnly`); filtra tabs por papel; early-return para `JoinClinicGate` quando `user && !clinic`.

**Verificação:**
- Migration aplicada localmente (`migrate:latest`), backend `typecheck` + `build` OK.
- Teste API da Sprint 3.24 **23/23** com backend dev `:3001` (após restart para limpar rate limit em memória; dados de teste descartados no fim).
- Frontend `typecheck` + `build` OK. Validação **visual** no navegador pendente (ambiente sem browser).
- Sem commit/push.

**Restrições mantidas / NÃO feito (registrado):**
- **Sem busca/listagem pública de clínicas.** Sem e-mail/WhatsApp/convite automático. **Sem autoentrada.**
- **Sem regeneração de invite code** (sprint futura — manter código curto/legível, regenerar invalida pendentes).
- Sem remoção/expulsão de membros, sem troca de papel pela UI, sem audit de "secretaria removida da clínica". Sem dado clínico.
- Papel vem do JWT (stale até expirar) — mesmo risco aceito nos demais endpoints administrativos enquanto não houver gestão de sessão na UI.
- O dono atual continua sendo criado pelo `/auth/register` clássico (papel `dono_clinica`); **não** se aprovam novos donos por este fluxo (papel solicitado é sempre `secretaria`, validado pelo serviço e pelo CHECK do banco).

**Próximo no tema (roadmap-next-phase):** (a) gestão de membros (listar membros, **remover/desligar secretaria** com confirmação + audit); (b) **regenerar invite code** (e invalidar pendentes opcionalmente); (c) troca de papel pelo dono (admin-of-clinic) com guardrails; (d) sair voluntariamente da clínica; (e) histórico de ações da equipe.

### Polimento 3.24.1 (copy/UX — frontend only, sem commit)

Sem mudança de comportamento, sem mudança de schema, sem backend tocado. O fluxo da Sprint 3.24 passou em validação visual, mas o vocabulário ficou amarrado a "secretaria". Decisão de produto: a UI passa a falar em **"funcionário(a)" / "equipe" / "membro da equipe"** para não amarrar o produto a uma profissão única. A role técnica do backend (`requested_role='secretaria'`, `users.papel='secretaria'`, audits `auth.register.staff.success` / `clinic.join_request.*`) **permanece** — trocar isso exigiria migration/refactor e ficou explicitamente fora do escopo desta rodada.

**Arquivos alterados (frontend only):**
- `frontend/src/views/Dashboard.tsx`: `ROLE_LABELS.secretaria` agora exibe **"Funcionário(a) (acesso administrativo)"**; subtitle da aba **Equipe** generalizado ("solicitações pendentes de funcionários(as) para entrar na equipe").
- `frontend/src/views/RegisterPage.tsx`: título do staff = "Cadastre-se como funcionário(a) da clínica"; subtitle = "Crie sua conta de funcionário(a) da clínica…"; opção do seletor = **"Sou funcionário(a) / membro da equipe"**; botão = "Criar conta de funcionário(a)"; mensagem de sucesso staff orienta a usar o convite "para solicitar entrada na equipe".
- `frontend/src/components/JoinClinicGate.tsx`: placeholder da mensagem trocado para "Ex.: Sou o(a) novo(a) funcionário(a) administrativo(a) do consultório." (subtitle e demais textos já estavam em "funcionário(a)").
- `frontend/src/components/TeamManagementPanel.tsx`: subtitle = "Compartilhe o código de convite com o(a) funcionário(a) por um canal seguro… Cada solicitação precisa ser aprovada por você — não existe entrada automática na equipe."; helper local `requestedRoleLabel(role)` mapeia `secretaria → 'funcionário(a) (acesso administrativo)'` (extensível para futuras roles); `window.confirm` da aprovação reescrito ("como funcionário(a) com acesso administrativo desta clínica? A pessoa entra na equipe e poderá usar as áreas administrativas…").
- `frontend/src/components/HowItWorks.tsx` (landing): "rotina da secretaria" → "rotina administrativa da clínica".

**Não alterado (registrado):** `services/api.ts` mantém o type union `papel: 'admin_sistema' | 'dono_clinica' | 'secretaria'` (espelha o JWT/DB); literais de role nos `canWrite` de `PatientsList`/`DuplicatesList` (`user?.papel === 'secretaria'`) ficam — são comparações técnicas com o JWT, não texto visível; comentários internos com "secretaria" permanecem para descrever a role técnica.

**Decisão registrada (link com `roadmap-next-phase`):** sistema avançado de roles é trabalho futuro. Roles candidatas (recepção, financeiro, administrativo, gestor da clínica) NÃO entram nesta sprint — exigiria coluna nova de role com semântica de permissões, migration, mapeamento `requested_role`/`papel` e UI dedicada.

**Verificação:** `pnpm --filter frontend typecheck` ✅ e `pnpm --filter frontend build` ✅. Backend **não** foi tocado. Validação visual no navegador pendente. Sem commit/push.


---

## Sprint 3.25 (gestão de membros da equipe)

Direção: Opção C (base administrativa segura). Segunda sprint da trilha "equipe", continuação direta da 3.24 + polimento 3.24.1. **Backend + frontend.**

**Decisões de produto/segurança:**
- "Vínculo membro-clínica" continua sendo `users.clinica_id` (1 clínica por usuário). **Histórico** de pertencimento ganha um quinto status em `clinic_join_requests` — `revoked` — usado quando o dono desliga um membro. `users.ativo` permanece `true` (não é banimento global).
- **Sem `reactivate` direto:** ex-membro re-entra pelo fluxo da 3.24 (`POST /clinic-join-requests` + approve). Mais simples, idempotente, e o histórico fica completo.
- **Sem delete físico** (mantida a regra global). **Sem múltiplas clínicas por usuário.** **Sem troca de dono.** **Sem roles granulares** (recepção/financeiro/gestor) — todas adiadas para sprint própria.
- Stale-JWT: a desativação precisa ser **imediatamente efetiva**. Optei por reforçar `requireClinic` com 1 DB check por request tenant-scoped (em vez de rotação de tokens / blacklist). Custo aceitável no MVP.

**Migration:** `20260530000000_clinic_join_requests_revoked` — DROP + recria `cjr_status_check` aceitando `'revoked'`. Sem outra mudança de schema. Migration aplicada com `migrate:latest` (batch 11).

**Backend:**
- `backend/src/types/db.d.ts`: `ClinicJoinRequestStatus` agora inclui `'revoked'`.
- `backend/src/dao/userDao.ts`: novo `clearClinicIfMember(userId, expectedClinicId)` — atualiza `clinica_id := NULL` **escopado** por `(id, clinica_id=expected)` para impedir corrida com aprovação concorrente em outra clínica.
- `backend/src/dao/clinicMemberDao.ts` (novo): `listActive(clinicId)` (join com último approved.decided_at + fallback `users.criado_em`), `listRemoved(clinicId)` (join com último revoked.decided_at; usa `IS DISTINCT FROM` p/ incluir `users.clinica_id IS NULL`), `insertRevoked(...)` (insere uma linha histórica nova; não dá UPDATE).
- `backend/src/models/clinicMember.ts` (novo): `toPublicClinicMember` (`is_owner` = `user_id === clinic.responsavel_id`).
- `backend/src/services/clinicMemberService.ts` (novo): `list(actor)` e `deactivate(actor, targetUserId)`. `deactivate` é transacional: `clearClinicIfMember` + `insertRevoked`; se `clearClinicIfMember` devolve 0 linhas (corrida) → 404 `member_not_found`. Recusa: self (`400 cannot_deactivate_self`), owner (`400 cannot_deactivate_owner`), cross-tenant/inexistente (`404 member_not_found`).
- `backend/src/controllers/clinicMemberController.ts` + `backend/src/routes/clinicMembers.ts` (novos): `GET /clinic-members` e `PATCH /clinic-members/:userId/deactivate`. Compõem `patientsRateLimit` (IP-keyed antes do auth) + `requireAuth` + `requireClinic` + `requireRole(CLINIC_ADMIN_ROLES)`.
- `backend/src/app.ts`: monta `clinicMembersRouter`.
- `backend/src/middlewares/requireAuth.ts`: `requireClinic` virou async e agora faz `userDao.findById(req.auth.sub)`; recusa com `401 unauthorized` se ausente/`ativo=false`, e `403 clinic_membership_revoked` se `users.clinica_id !== auth.clinica_id`. Comentário no código explica que `papel` continua vindo só do JWT (única transição possível não existe nesta sprint).

**Frontend:**
- `frontend/src/services/api.ts`: tipos `ClinicMember`, `ClinicMemberStatus`; métodos `listClinicMembers`, `deactivateClinicMember`.
- `frontend/src/components/TeamManagementPanel.tsx`: nova seção **"Membros da equipe"** abaixo de "Solicitações pendentes". Toggle "Mostrar inativos" (default OFF); cada membro com badge `Ativo(a)|Inativo(a)`, badge "Dono(a)" no `is_owner`, papel exibido como "Funcionário(a) (acesso administrativo)" via `memberRoleLabel`, datas `joined_at`/`removed_at` quando existirem. Botão **Desativar acesso** com `window.confirm` que explica que não apaga usuário/histórico. O botão é escondido para o `is_owner` e para o próprio dono logado (backend continua sendo a defesa real). Polling `refetchInterval: 30_000`.
- `frontend/src/components/TeamManagementPanel.module.css`: classes `.membersHeader`, `.toggleRow`, `.helperText`, `.statusRow`, `.statusBadge`, `.statusActive`, `.statusInactive`, `.ownerBadge`.

**Verificação:**
- `pnpm --filter backend typecheck` ✅, `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅
- `pnpm --filter backend migrate:latest` ✅ (batch 11)
- Matriz por API em backend dev :3001 com contas descartáveis (`t325-...@example.test`, tag aleatório): **14/14**.
  1. Dono lista membros — vê a si mesmo (`is_owner=true`) + staffs ativos.
  2. Funcionário tenta listar → `403 forbidden_role`.
  3. Cross-tenant: dono B tenta desativar staff de A → `404 member_not_found`.
  4. Dono tenta desativar a si mesmo → `400 cannot_deactivate_self`.
  5. Dono desativa staff → `200 { status: 'deactivated' }`.
  6. Staff desativado (token antigo) em `GET /patients` → `403 clinic_membership_revoked`.
  7. `GET /auth/me` no staff desativado → `clinic: null`.
  8. Lista de membros mostra staff desligado em "Inativos" (`status: 'removed', removed_at: …`).
  9. Re-desativar mesmo staff → `404 member_not_found` (idempotente).
  10. Staff desligado pode pedir entrada de novo via invite e ser aprovado novamente.
  11. Audit `clinic.member.deactivated.success` / `clinic.member.list.success` sem PII (recurso=`clinic_member`, `recurso_id` UUID ou null, nenhum nome/email no payload).
- **Bug corrigido em vôo:** `listRemoved` inicialmente usava `whereNot('u.clinica_id', clinicId)`, que em Postgres exclui `clinica_id IS NULL` (semântica de três valores). Troquei por `whereRaw('u.clinica_id IS DISTINCT FROM ?')` — testes 8/9/10 passaram após a correção. Comentário no código explica.
- Dados de teste limpos via SQL transacional. Restaram apenas audits do meu próprio usuário (polling do `TeamManagementPanel` aberto no navegador) — esperado pelo polling de 30s.

**Ressalvas/limites:**
- **`requireClinic` agora faz 1 DB hit por request tenant-scoped.** Custo aceitável; se a base crescer muito ou aparecer cache distribuído (Redis) podemos migrar essa checagem para cache curto (TTL ~5–30s) com invalidação no deactivate. Não vejo necessidade no MVP.
- **`papel` ainda não é re-validado contra DB.** Única transição realista (`dono_clinica → secretaria`) **não** existe agora; quando entrar (sprint de roles granulares), o check de `requireClinic` precisa também trazer o `papel` real do DB.
- Re-aprovação de ex-membro recria a cadeia `pending → approved`, mas a linha `revoked` permanece — o histórico é cumulativo (intencional para auditoria).
- `clinicMemberDao.listActive` faz JOIN com agregação por usuário; OK para clínicas pequenas. Paginação não foi implementada (1 dono + ~5–20 funcionários esperados).
- Validação **visual** no navegador pendente neste ambiente. Sem commit/push.

**Próximo no tema (`roadmap-next-phase.md`):** **regenerar invite code** (invalidar pendentes opcionalmente), **sair voluntariamente** da clínica, **roles granulares** com ADR própria (recepção/financeiro/administrativo/gestor), e — em sprint própria, **não nesta** — troca de dono com guardrails. Histórico de ações de equipe (timeline visível ao dono) também candidato.

### Polimento 3.25.1 (reorganização Agenda↔Equipe — frontend only, sem commit)

Sem mudança de comportamento de API, sem mudança de schema, sem backend tocado. A validação visual da 3.25 mostrou que o cadastro de "Profissionais da clínica" estava na aba Agenda, mas é gestão de equipe/recurso administrativo — deveria viver na aba Equipe, e a Agenda só consumir. Brief: opção A aprovada (mover direto, sem componente compartilhado — o painel já era autossuficiente).

**Diferenciação reforçada (foi para a copy):**
- **Membros da equipe** (Sprint 3.24/3.25) = contas com login, papel, MFA, acesso administrativo. Vivem em `users`.
- **Profissionais da agenda** (Sprint 3.14) = pessoas que aparecem como responsável no agendamento. Vivem em `clinic_professionals`. **Podem ou não ter login.** Sem dado clínico.

**Arquivos alterados (frontend only):**
- `frontend/src/views/Dashboard.tsx`: removeu `<ClinicProfessionalsPanel />` do bloco `tab === 'agenda'`; adicionou-o depois do `<TeamManagementPanel />` no bloco `tab === 'equipe'`. No bloco `agenda`, adicionou parágrafo curto `.agendaHint` orientando o usuário. Subtítulos das duas abas (`SECTION_INTRO.agenda` / `.equipe`) atualizados.
- `frontend/src/views/Dashboard.module.css`: nova classe `.agendaHint` (caixinha cyan-soft com `strong` destacando o caminho).
- `frontend/src/components/ClinicProfessionalsPanel.tsx`: subtítulo do painel passou a explicitar (a) que alimenta o seletor da Agenda, (b) que o profissional **pode ou não** ter login no sistema, (c) que isso não é prontuário nem dado clínico.

**Não alterado (registrado):** backend (router/service/DAO de `clinic_professionals` intactos); migrations; permissões (write owner-only via `requireRole`, leitura aberta para secretaria); cache key compartilhada `['clinic-professionals']` (que continua sendo o ponto de sincronização entre Equipe e Agenda); contrato de `Appointment.professional_id` (continua opcional). Sem coluna `user_id` em `clinic_professionals` (acoplar membro↔profissional automaticamente é exatamente o que o brief pede para evitar).

**Verificação:** `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅. Backend **não** rodado (sem mudanças). Validação visual no navegador pendente: criar/editar/desativar profissional em Equipe → seletor da Agenda reflete; secretaria continua vendo o painel só-leitura; criar agendamento com profissional ativo continua funcionando. Sem commit/push.

**Próximo no tema (não nesta sprint):** caso surja necessidade real, opcionalmente acoplar `clinic_professionals.user_id NULL` (membro pode ser profissional) — exige ADR própria. Por enquanto a separação é o estado correto.


---

## Sprint 3.26 (regenerar código de convite da clínica)

Direção: Opção C (base administrativa segura). Trilha "equipe" segue: depois de membros (3.25), o dono ganha controle sobre rotação do código de convite. **Backend + frontend, sem migration.**

**Decisões de produto/segurança:**
- Endpoint owner-only `POST /clinics/invite-code/regenerate`. Substitui `clinics.invite_code` por um novo código gerado por `utils/inviteCode.generateInviteCode` com retry curto (6 tentativas) sobre o índice único (`clinics_invite_code_unique`).
- **Solicitações pendentes NÃO são canceladas na regen.** Racional registrado em `docs/security-notes.md`: a pendente foi submetida por alguém que já provou posse do código antigo e aguarda decisão manual do dono (que tem **Recusar** na UI). Cancelar em lote sem revisão é destrutivo. Se aparecer use-case de "panic-cancel" acoplado à rotação, abrir sprint própria com confirmação dupla.
- **Sem cooldown/TTL** dedicado: `patientsRateLimit` (IP-keyed antes do auth) já cobre abuso em massa.
- **Audit sem PII e sem código:** `clinic.invite_code.regenerated.success` (`recurso='clinic'`, `recurso_id=clinica_id`). Nem audit_logs nem logs do app recebem o invite_code (antigo ou novo).

**Backend (sem migration):**
- `backend/src/dao/clinicDao.ts`: + `updateInviteCode(id, newCode)` — `UPDATE clinics SET invite_code=… WHERE id=…` + `atualizado_em=now()` + `RETURNING *`. Throws para o service em caso de unique_violation.
- `backend/src/services/clinicJoinRequestService.ts`: + `regenerateInviteCode(actor, ctx)` — busca a clínica, gera candidato (pulando colisão com o atual), tenta `updateInviteCode`; em caso de `23505` (improvável, índice único), tenta de novo até 6×; loga audit com `auditLogDao.create` (recurso `clinic`, sem code). Reusa `formatInviteCode` na resposta.
- `backend/src/controllers/clinicJoinRequestController.ts`: + `regenerateInviteCode` (delegação simples; `buildAuthContext`).
- `backend/src/routes/clinicJoinRequests.ts`: + `POST /clinics/invite-code/regenerate` com `patientsRateLimit + requireAuth + requireClinic + requireRole(CLINIC_ADMIN_ROLES)`.

**Frontend:**
- `frontend/src/services/api.ts`: + `regenerateClinicInviteCode(token)` (POST sem body; mesmo shape de `InviteCodeResponse`).
- `frontend/src/components/TeamManagementPanel.tsx`: + `regenerateInviteMutation` com `window.confirm` forte que cita explicitamente que o código antigo deixa de funcionar para NOVAS solicitações e que pendentes/membros NÃO são alterados; botão **Regenerar** ao lado de **Copiar** no bloco do código; após sucesso, exibe o novo código uma vez via `notice` e invalida `['clinic-invite-code']`. Parágrafo `helperText` curto reforça a mesma mensagem.

**Verificação:**
- `pnpm --filter backend typecheck` ✅, `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅
- Matriz por API em backend dev `:3001` com contas descartáveis (`t326-…@example.test`): **12/12**.
  1. Dono lê código atual.
  2. Dono regenera → novo código diferente.
  3. GET reflete o novo.
  4. Novo staff usando código antigo → `404 invalid_invite`.
  5. Mesmo staff com novo código → `201`.
  6. Owner-B regenera de forma independente; clínica-A intacta.
  7. Staff sem clínica → `403 no_clinic_context`.
  8. Membro não-dono → `403 forbidden_role` (após login renovado).
  9. Pendente pré-regen continua visível em `/clinic-join-requests/pending`.
  10. Audit `clinic.invite_code.regenerated.success` (`recurso='clinic'`, `recurso_id`=UUID) presente, sem código.

Dados de teste limpos via SQL transacional ao final.

**Ressalvas/limites:**
- **Sem rotação automática agendada.** A rotação é sempre iniciada manualmente pelo dono.
- **Sem histórico de códigos antigos.** Não há coluna/tabela para "códigos prévios"; intencional para não criar superfícies extras de exposição.
- **Sem invalidação de pendentes.** Documentado acima.
- **`patientsRateLimit`** continua sendo o único guarda contra spam de regenerações; suficiente para o MVP.
- Validação **visual** no navegador pendente.

**Próximo no tema (`roadmap-next-phase.md`):** sair voluntariamente da clínica; histórico de ações de equipe visível ao dono; e — em sprint própria com ADR — roles granulares (recepção/financeiro/gestor).


---

## Sprint 3.27 (polimento visual da aba Equipe — frontend only, sem commit)

**Sem backend, sem API, sem migration, sem permissão.** Pequena rodada de UX/copy/CSS para deixar a aba Equipe mais clara antes da demo/piloto v0.1.

**Pre-implementação:** chamei um agent de revisão UX (general-purpose) lendo apenas os 4 arquivos da aba Equipe. Output principal: chips de categoria nos títulos, código de convite com peso visual maior, `Regenerar` como "ghost" (não-danger), `Recusar` deixar de ser danger, cards inativos como faixa lateral (não vermelha), mobile full-width nas actions, copy mais humana nos empties/confirms. Escolhi 6 itens pequenos e seguros; deixei como follow-up: substituir `window.confirm` por modal custom.

**Mudanças (frontend only):**

- `frontend/src/components/TeamManagementPanel.tsx`:
  - chip `Acesso ao sistema` ao lado do título.
  - subtítulo agora abre com "Pessoas com login no sistema…".
  - botão **Regenerar** virou variante `ghostBtn`; `window.confirm` reescrito ("Gerar um novo código de convite? …").
  - empty state de solicitações: "Sem solicitações no momento. Compartilhe o código de convite por um canal seguro…".
  - **Recusar** virou `secondaryBtn` (não-danger); copy do confirm simplificada.
  - empty state de membros (só dono): "Só você por enquanto. Quando alguém entrar com o código, vai aparecer aqui."; `showRemoved=true` empty: "Nenhum membro registrado nesta clínica ainda.".
  - copy do confirm de **Desativar acesso**: "Remover o acesso de {nome}? O histórico e os dados continuam preservados. A pessoa pode pedir entrada de novo com o código de convite.".
  - `<li>` de membro inativo agora recebe `${styles.card} ${styles.cardInactive}`.
- `frontend/src/components/TeamManagementPanel.module.css`:
  - novo `.categoryChip` (chip cinza neutro, mais peso tipográfico que badge).
  - `.inviteCode` ganhou `font-size: 1.15rem`, `font-weight: 600`, `letter-spacing: 0.08em`.
  - novo `.ghostBtn` (transparente, só borda; hover → borda cyan).
  - novo `.cardInactive` (border-left `rgba(120,140,180,0.45)` + fundo levemente mais escuro).
  - media query `@media (max-width: 480px)`: `.actions` full-width + botões `flex: 1 1 100%`; `.categoryChip` ganha `margin-top` quando o título quebra.
- `frontend/src/components/ClinicProfessionalsPanel.tsx`:
  - título virou "Profissionais da agenda" + chip `Aparece na agenda`.
  - subtítulo reescrito: primeira frase em `<strong>` ("Pessoas que aparecem como responsável no agendamento.").
  - empty state: "Nenhum profissional cadastrado. Adicione quem realiza atendimentos — eles aparecem como responsáveis na agenda."
  - botão **Desativar** renomeado para **Desativar profissional** (qualifica a ação, evita confusão com "Desativar acesso" do bloco de membros).
- `frontend/src/components/ClinicProfessionalsPanel.module.css`:
  - `.title` ganhou `flex-wrap: wrap`.
  - novo `.categoryChip` (espelha o do TeamManagementPanel).
  - media query `@media (max-width: 480px)`: mesma estratégia (actions full-width, chip com `margin-top`).

**Pós-implementação:** segundo review do mesmo agent (prompt curto, só sobre os 4 arquivos). Veredito: ok nos 6 itens; um pequeno fix apontado (espelhar a media query também no `ClinicProfessionalsPanel.module.css` para evitar "actions sem full-width" e chip sem breathing room em ≤480px). Apliquei na hora. Sem follow-ups bloqueantes.

**Verificação:** `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅. Backend **não** rodado (sem alterações). Validação visual no navegador pendente. Sem commit/push.

**Ressalvas / follow-ups futuros:**
- `window.confirm` nativo segue em uso. Funciona, mas quebra o ar dark do app. Substituir por modal custom é trabalho de sprint própria.
- Empty state dashed border é idêntico entre os 2 painéis — variar a copy foi suficiente; estilos diferentes só se aparecer demanda visual real.
- Subtítulo do ClinicProfessionalsPanel ainda tem várias frases; se virar problema na demo, dá pra encurtar mais (não fiz agora pra não perder a regra de segurança "não é prontuário/clínico").

---

## Sprint 3.28 (modal custom de confirmação — frontend only, sem commit)

**Sem backend, sem API, sem migration, sem permissão.** Sprint UX pura: substituir todos os `window.confirm` da aba Equipe por um modal custom coerente com o tema dark/cyber clinic.

**Componente novo:**

- `frontend/src/components/ConfirmDialog.tsx` — componente genérico reutilizável baseado em `<dialog>` nativo (sem biblioteca nova). Props: `open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` (`default | danger`), `isBusy`, `onConfirm`, `onCancel`. Usa `ref.showModal()` / `ref.close()` via `useEffect` para controle React-driven. ESC interceptado via evento `cancel` nativo (`e.preventDefault()` + `onCancel()`); backdrop click detectado via `e.target === dialogRef.current`; ambos bloqueados se `isBusy`. Botão confirmar fica ocupado (spinner) enquanto mutation estiver `isPending`; dialog fecha ao settlement (success ou error) via `setPendingAction(null)` nas callbacks das mutations.
- `frontend/src/components/ConfirmDialog.module.css` — tema escuro consistente com os painéis. `::backdrop` com blur. Variante `confirmDefault` (cyan, para ações positivas/neutras) e `confirmDanger` (vermelho-suave, borda visível, para destrutivas). Mobile (`@max-width: 480px`): botões empilhados full-width em ordem reversa (confirmar acima, cancelar abaixo — acesso fácil ao "Cancelar" no polegar).

**Ações migradas (todos os `window.confirm` removidos):**

| Painel | Ação | Variant |
|---|---|---|
| TeamManagementPanel | Regenerar código de convite | default |
| TeamManagementPanel | Aprovar entrada | default |
| TeamManagementPanel | Recusar solicitação | default |
| TeamManagementPanel | Desativar acesso de membro | danger |
| ClinicProfessionalsPanel | Desativar profissional da agenda | danger |

O `ClinicProfessionalsPanel` não tinha `window.confirm` — o botão disparava a mutation diretamente. Esta sprint adicionou confirmação também.

**Padrão de estado:**
- `TeamManagementPanel`: estado `pendingAction: PendingAction | null` (discriminated union `regenerate | approve | reject | deactivate`). `dialogConfig` derivado do tipo. `isBusy` = mutation correspondente `.isPending`. `openConfirm(action)` limpa notices/erros stale antes de abrir. `closeConfirm()` limpa erro ao cancelar. Mutations chamam `setPendingAction(null)` **apenas em `onSuccess`**; em `onError` o dialog permanece aberto e exibe o erro inline.
- `ClinicProfessionalsPanel`: estado `pendingDeactivate: { id, name } | null`. Mesmo padrão: `onSuccess` fecha e limpa erro; `onError` mantém o dialog aberto.

**Acessibilidade:** `role="dialog"` (nativo), `aria-modal="true"`, `aria-labelledby` apontando para o `<h2>` do título. Focus trap nativo do `<dialog>`. Foco inicial cai no primeiro elemento focável (botão "Cancelar") — pressing Enter acidentalmente cancela, nunca confirma.

**Verificação:** `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅. Backend **não** rodado. Validação visual no navegador pendente. Sem commit/push.

**Nits pós-revisão (super revisão após 3.28 — aplicados ao mesmo conjunto de arquivos):**
- `TeamManagementPanel.module.css`: `.secondaryBtn:disabled` adicionado ao bloco de disabled (estava ausente).
- `ConfirmDialog.tsx`: `id="confirm-dialog-title"` estático substituído por `useId()` — evita colisão de IDs no DOM quando os dois dialogs (TeamManagementPanel + ClinicProfessionalsPanel) estão montados simultaneamente.
- Tratamento de erro: mutations removeram `setPendingAction(null)` / `setPendingDeactivate(null)` do `onError`; dialog permanece aberto e renderiza o erro dentro do modal via prop `error`; `onCancel` limpa o erro. `openConfirm()` limpa notices/erros stale antes de abrir.

**Ressalvas / follow-ups futuros:**
- Polyfill de `<dialog>` não implementado (Safari < 15.4). Não é um requisito declarado do MVP.
- `ConfirmDialog` está pronto para reuso em outras telas (PatientsList, DuplicatesList, etc.) sem alteração.

---

## Sprint 3.29 (docs/QA — sem backend, sem feature)

**Sem backend, sem API, sem migration, sem permissão, sem nova feature.** Sprint de docs e QA: corrigir referências stale a `window.confirm` nos docs operacionais; adicionar checklist visual integrado do fluxo Equipe; expandir o demo script e o checklist piloto com a aba Equipe; registrar os nits pós-3.28 no sprint-history.

**Docs atualizados:**

- `docs/testing-checklist.md`:
  - §3.25, §3.26, §3.27: substituídas as referências a `window.confirm` por descrição do modal custom.
  - §3.28: item 5 (comportamento de erro) e item 6 (isBusy) atualizados para refletir o comportamento pós-nit (dialog permanece aberto em erro; erro aparece inline com `role="alert"`).
  - §3.28: adicionados itens 9 (erro inline) e 10 (IDs únicos via `useId`).
  - Nova seção **"Fluxo completo da aba Equipe"** com checklist visual ponta a ponta cobrindo sprints 3.24–3.28 (código de convite, solicitação, aprovação, membros, desativar acesso, regenerar, recusar, profissionais da agenda, permissões de secretaria).

- `docs/project-state.md`:
  - Sprint 3.28 passou de "em validação/finalização" para "entregue, nits aplicados".
  - Nits documentados (`.secondaryBtn:disabled`, `useId`, error inline).
  - Sprint 3.29 adicionada como sprint atual.
  - Referências a `window.confirm` nas seções descritivas de 3.24–3.27 atualizadas para "modal de confirmação custom (sprint 3.28)".

- `docs/sprint-history.md`:
  - Sprint 3.28: padrão de estado corrigido (dialog abre em `onSuccess`, não em `onError`); nits pós-revisão documentados.
  - Sprint 3.29: esta entrada.

- `docs/demo-pilot-v0.1-script.md`:
  - Nova seção **§ Equipe (opcional — ≈3 min)** com passo a passo para demo do fluxo de convite, aprovação de funcionário(a) e gestão de profissionais da agenda.

- `docs/demo-pilot-v0.1-checklist.md`:
  - Nova seção **Equipe (opcional)** em §B (Durante a demo).

- `CLAUDE.md`: sprint atual atualizada para Sprint 3.29.

**Verificação:** nenhum build necessário (docs only). Sem commit/push.

---

## Sprint 3.30 (QA / validação visual — sem backend, sem feature)

**Sem backend, sem API, sem migration, sem permissão, sem nova feature.** Sprint de QA: validação visual manual do fluxo completo da aba Equipe no navegador, cobrindo sprints 3.24–3.28.

**O que foi validado (aprovado pelo usuário):**

| Item | Resultado |
|---|---|
| Login do owner | ✅ |
| Aba Equipe visível para owner | ✅ |
| Código de convite em destaque (mono) | ✅ |
| Botões Copiar e Regenerar lado a lado | ✅ |
| Regenerar abre `ConfirmDialog` custom (não `window.confirm`) | ✅ |
| Cancelar não executa a ação | ✅ |
| Confirmar executa a ação | ✅ |
| Solicitações pendentes aparecem na aba Equipe | ✅ |
| Aprovar/Recusar usam modal custom | ✅ |
| Membros da equipe com badge ativo/inativo | ✅ |
| Desativar acesso usa modal `danger` | ✅ |
| Profissionais da agenda dentro da aba Equipe | ✅ |
| Criar/editar/desativar profissional visualmente correto | ✅ |
| Aba Agenda consome profissionais ativos (seletor sincronizado) | ✅ |
| `ConfirmDialog` visual aprovado | ✅ |
| Layout geral aprovado | ✅ |

**Metodologia:** validação manual no navegador pelo usuário. Sem automação de browser, sem CI, sem prints anexados. Nenhum bug bloqueante encontrado.

**Sem alteração de código frontend ou backend.** Apenas registro de validação nos docs.

**Verificação:** nenhum build necessário (docs only). Sem commit/push.

---

## Sprint 3.31 (hardening backend — concorrência + trilha de auditoria)

**Sem migration, sem nova feature, sem mudança de API/permissão, sem frontend.** Corrige três achados não-críticos da super revisão pós-3.28 nas solicitações de entrada da clínica (`clinic_join_requests`).

**Achados tratados:**

1. **`setStatus` pouco scoped → compare-and-set.** `clinicJoinRequestDao.setStatus` passou de `WHERE id` para `WHERE id AND status='pending'`. Como `pending` é o único estado não-terminal, o guard é exaustivo: nenhuma decisão concorrente é silenciosamente sobrescrita. Retorna `undefined` quando nenhuma linha pendente casa.

2. **Race/TOCTOU em `cancelMine`.** Antes: `find` → `setStatus` podia, numa corrida estreita, cancelar uma solicitação que o dono acabara de aprovar (deixando o usuário na clínica com a request "cancelada"). Agora o CAS é a defesa real: se nada casa → **409 `invalid_state`**. `approve` checa o retorno **dentro da transação** e aborta (rollback) antes de `userDao.setClinic`/`cancelOtherPending`; `reject` também checa.

3. **`cancelOtherPending` sem trilha de auditoria.** O cascade-cancel disparado pela aprovação agora grava `decided_by_user_id` (= dono que aprovou) e `decided_at`. Decisão de privacidade: esse campo **nunca** é exposto pela API (`MyJoinRequest`/`PendingJoinRequest` omitem `decided_by_user_id`), então registrar o dono numa request de outra clínica **não** vaza identidade cross-tenant.

**Arquivos alterados:**
- `backend/src/dao/clinicJoinRequestDao.ts` — `setStatus` (CAS) + `cancelOtherPending` (novo param `decidedByUserId` + grava `decided_at`).
- `backend/src/services/clinicJoinRequestService.ts` — `cancelMine`/`reject` checam retorno do CAS (409 `invalid_state`); `approve` checa dentro da txn e passa `actor.usuario_id` ao `cancelOtherPending`.

**Sem migration:** colunas `decided_by_user_id`/`decided_at` já existem desde `20260529000000_clinic_team`.

**Sem mudança de contrato de API.** `cancelMine` numa corrida passa a devolver `409 invalid_state` limpo em vez de criar inconsistência — melhora de robustez, não quebra de contrato.

**Decisão de produto preservada:** regenerar código (3.26) continua **não** cancelando pendentes.

**Verificação:** `pnpm --filter backend typecheck` ✅, `pnpm --filter backend build` ✅. Matriz por API **18/18** (`/tmp/sprint-3.31-api-test.mjs`, contas descartáveis com tag aleatório):
- staff cria pending → cancela própria → cancela de novo (**409 invalid_state**);
- staff não cancela request de outro (**404 request_not_found**); request do outro intacta;
- dono aprova → request-to-A `approved` com `decided_by`/`decided_at`; outra pendente do mesmo user (clínica B) vira `cancelled` com `decided_by=dono A` + `decided_at`; usuário entra na clínica A;
- cancelar request já aprovada **não** sobrescreve (CAS segura — segue `approved`);
- cross-tenant approve/reject (**404**), alvo segue `pending`;
- audit `created/cancelled/approved` com `recurso='clinic_join_request'`, sem PII;
- `decided_by_user_id` **não** aparece em `GET /clinic-join-requests/me`.

Dados de teste removidos ao fim (baseline `clinic_join_requests` de volta a 1 linha). Sem commit/push.

---

## Sprint 3.32 (ADR/docs — decisão do merge seguro de duplicados B-safe)

**Sem backend, sem migration, sem API, sem frontend, sem commit.** Sprint de
decisão: registrar como o ClinicBridge vai resolver pacientes duplicados com mais
qualidade do que apenas arquivar.

**Achado que motivou a decisão (Sprint 3.32, análise):** a Agenda
(`appointmentDao.listByClinic`) lista agendamentos **sem** filtrar por status do
paciente e resolve nomes a partir de `listPatients` com **`status='active'`
(default)**. Logo, arquivar um duplicado que tem agendamentos deixa esses
agendamentos visíveis com **nome-fallback** (`"Paciente abc12345…"`). Só arquivar
pode **degradar a Agenda** — argumento central a favor de *mover* os agendamentos
num merge.

**Decisão (ver `docs/adr/0007-safe-patient-duplicate-resolution.md`): merge
administrativo "B-safe".** Owner-only, em transação:
1. dono escolhe o paciente **principal**;
2. **move agendamentos** dos secundários para o principal (reassign tenant-scoped
   de `appointments.patient_id`);
3. **fill-blanks não-destrutivo** — só preenche campos vazios do principal; nunca
   sobrescreve (correção real continua via `PatientEditForm`);
4. **arquiva** os secundários (soft-delete; **sem delete físico**);
5. **proveniência** via migration mínima: `patients.merged_into_id` + `merged_at`.

**Regras registradas:** sem delete físico; sem dado clínico; owner-only; transação
obrigatória; reassign tenant-scoped; audit sem PII (`patient.merge.success`,
`recurso_id="<primaryId>|<secId>"`); CPF nunca bruto; cross-tenant → 404;
idempotência via CAS; **sem undo completo** nesta fase.

**Endpoint alvo:** `POST /patients/:id/merge` com **múltiplos `secondary_ids`**
atômicos (degradação para um-por-chamada permitida se a implementação exigir).

**O que NÃO será feito agora (escopo negativo explícito):** seleção campo-a-campo;
merge clínico; prontuário; diagnóstico; prescrição; CID; exame; tratamento; delete
físico; undo completo/snapshot; merge automático sem confirmação humana.

**Consequências:** melhora a Agenda; preserva histórico; reversão completa **ainda
não existe** (restore desarquiva a linha, mas não devolve agendamentos movidos nem
campos preenchidos) — undo/snapshot exigirá tabela própria + ADR futura.

## Sprint 3.33 (backend + migration + API do merge B-safe)

**Implementação do que a Sprint 3.32 decidiu no ADR 0007.** Sem frontend (3.34);
sem delete físico; sem undo/snapshot; sem seleção campo-a-campo; sem dado clínico;
sem mexer no pipeline de importação, Equipe ou Auth/MFA.

**Migration `20260601000000_patients_merged_into.ts`** (aditiva, reversível):
`patients.merged_into_id` (uuid NULL FK `patients(id)` `ON DELETE SET NULL` — FK
defensiva; não há delete físico) + `patients.merged_at` (timestamptz NULL) +
índice parcial `idx_patients_merged_into WHERE merged_into_id IS NOT NULL`. Sem
snapshot/undo. `down` remove índice e colunas.

**Endpoint `POST /patients/:id/merge`** (owner-only):
- Middlewares: `patientsRateLimit` → `requireAuth` → `requireClinic` →
  `requireRole(CLINIC_ADMIN_ROLES)`.
- Body: `{ "secondary_ids": ["uuid", ...] }` — 1 a `PATIENT_MERGE_MAX_SECONDARIES`
  (10, constante local no service; sem env nova), sem duplicatas, sem incluir o
  próprio principal.
- Response 200: `{ patient: PublicPatient (cpf_masked), merge: { merged_count,
  moved_appointments_count, archived_secondary_ids, filled_fields } }`. **CPF
  bruto nunca sai**; valores dos secundários nunca aparecem na resposta; só os
  UUIDs que o caller já mandou.
- Erros: 400 `merge_invalid` (principal em secondary_ids / vazio / duplicados /
  > 10 / UUID inválido); 404 `patient_not_found` genérico para inexistente /
  cross-tenant / archived / merged / CAS miss (anti-enumeração); 403
  `forbidden_role` (secretaria); 401 (sem JWT).

**Service `patientMergeService.merge`** — em **uma transação** (`db.transaction`):
1. re-fetch tenant-scoped do principal + de cada secundário (status='active' e
   `merged_into_id IS NULL`, senão 404);
2. **fill-blanks não-destrutivo** apenas em `telefone|email|cpf|data_nascimento|
   convenio|numero_carteirinha` — nunca `nome`, nunca sobrescreve; ordem de
   tie-break = ordem enviada em `secondary_ids` (escolha consciente: reflete a
   futura UI 3.34, que listará os secundários na ordem que o owner organizar);
3. para cada secundário: `appointmentDao.reassignPatientForClinic` (UPDATE
   tenant-scoped de `patient_id`; preserva status/data/notas; não mexe em
   `updated_by_user_id` — não é edição clínica) + `patientDao.setMergedInto`
   com **CAS** (`WHERE id AND clinica_id AND status='active' AND merged_into_id
   IS NULL`); CAS miss → 404 + rollback total;
4. audit `patient.merge.success` **dentro** da transação, uma linha por par,
   `recurso='patient'`, `recurso_id="<primaryId>|<secondaryId>"` (73 chars; cabe
   em varchar(80)); falha de audit aborta a transação (mais estrito que rotas de
   leitura — evita estado merge sem evidência).

**DAOs alterados:**
- `patientDao.applyFillBlanks(id, clinica_id, patch, conn)` — UPDATE só dos
  campos passados; tenant-scoped; touches `atualizado_em`; retorna `PatientRow |
  undefined`.
- `patientDao.setMergedInto(id, clinica_id, primary_id, conn)` — CAS
  arquivamento + provenance.
- `appointmentDao.countByPatientForClinic(patient_id, clinica_id, conn)` —
  telemetria interna (count(*) tenant-scoped).
- `appointmentDao.reassignPatientForClinic(from, to, clinica_id, conn)` —
  UPDATE tenant-scoped retornando contagem.
- `types/db.d.ts`: `PatientRow` agora inclui `merged_into_id: string | null` +
  `merged_at: Date | null`. `PublicPatient` **não** expõe esses campos nesta
  sprint (UI 3.34 decide).

**Arquivos:** `backend/migrations/20260601000000_patients_merged_into.ts`
(novo), `backend/src/services/patientMergeService.ts` (novo),
`backend/src/dao/patientDao.ts`, `backend/src/dao/appointmentDao.ts`,
`backend/src/controllers/patientController.ts`,
`backend/src/routes/patients.ts`, `backend/src/types/db.d.ts`. Docs:
`CLAUDE.md`, `docs/project-state.md`, `docs/security-notes.md`,
`docs/sprint-history.md`, `docs/testing-checklist.md`,
`docs/roadmap-next-phase.md`.

**Verificação:** `pnpm --filter backend typecheck` ✅, `pnpm --filter backend
build` ✅, `pnpm --filter backend migrate:latest` ✅ (batch 12, único pending).
Matriz por API **18/18** (`/tmp/sprint-3.33-merge-test.mjs`, contas
descartáveis, base TLS local em `https://localhost:8443`):
1. happy 1-secundário sem appointments → archived + primary active;
1b. resposta tem só `cpf_masked` (sem `cpf` bruto);
2. happy 1-secundário com 2 appointments → reassigned (sec=0, prim=+2);
3. fill-blanks preenche campos vazios (telefone, convenio);
4. fill-blanks **não** sobrescreve (e-mail do principal preservado);
5. ordem = secondary_ids como enviado (pB vence pA quando enviado `[pB, pA]`);
6. fill de CPF → resposta com `***.***.789-01`;
7. principal em secondary_ids → 400 `merge_invalid`;
8. secondary_ids vazio → 400;
9. secondary_ids duplicados → 400;
10. > 10 secondaries → 400;
11. cross-tenant principal → 404 `patient_not_found`;
12. cross-tenant secundário → 404;
12b. cross-tenant secundário: zero side-effect na clínica B (status ainda
`active`);
13. secundário já-archived → 404;
14. secretaria → 403 `forbidden_role`;
15. sem JWT → 401;
16. batch 3 secundários com mix de appointments e blanks → tudo consistente.

**SQL pós-teste** confirmou: 11 secondaries arquivados, todos com
`status='archived'`, todos com `merged_at` NOT NULL, 11 audits
`patient.merge.success` no formato `uuid|uuid`, **0** audits com `recurso_id`
fora do padrão (nenhum PII). Counts de `patients`/`appointments` retornaram ao
baseline após cleanup (22/11); 11 audits da operação ficaram historicamente (FK
`SET NULL` — comportamento append-only correto).

**Dados criados/removidos:** o script criou 10 clínicas (5 runs × 2) + 10
owners + 4 staffs + ~30 pacientes + appointments. Removidos por SQL no fim:
`DELETE FROM clinics WHERE nome LIKE 'Clinica 33%'` (cascata para
patients/appointments/clinic_professionals/clinic_join_requests) + `DELETE FROM
users WHERE email LIKE 'owner-33%@test.local' OR 'staff-33%@test.local'` (após
`UPDATE users SET clinica_id = NULL` para quebrar o FK mútuo).

**Riscos/ressalvas conhecidos:**
- **Sem undo completo:** `restore` desarquiva o secundário (`status='active'`),
  mas **não** devolve agendamentos movidos nem reverte os campos preenchidos.
  Documentado no ADR; undo real exige tabela snapshot + ADR futura.
- **Sobreposição de horário** no principal após mover agendamentos é possível
  (sem constraint anti-overlap). Aceitável no MVP; UI da 3.34 pode alertar.
- **Limite 10 por chamada** é conservador (ADR permitia até ~50). Se a base de
  duplicados crescer, abrir env/decidir limite por ADR.
- **`PublicPatient` ainda não expõe `merged_into_id`/`merged_at`** — a UI da
  3.34 vai precisar (para mostrar "mesclado em X" em arquivados). Adicionar
  como mudança coesa quando o frontend chegar.

Sem commit/push.

**Divisão de sprints:** 3.32 ADR/docs · 3.33 backend+migration+API · 3.34
frontend/UX+validação visual.

**Docs atualizados:** `docs/adr/0007-safe-patient-duplicate-resolution.md` (novo),
`CLAUDE.md`, `docs/project-state.md`, `docs/security-notes.md`,
`docs/sprint-history.md` (esta entrada), `docs/testing-checklist.md` (pointer do
plano de testes futuro), `docs/roadmap-next-phase.md`.

**Verificação:** nenhum build necessário (docs only). Sem commit/push.

## Sprint 3.34 (frontend/UX do merge B-safe — consome a API da 3.33)

**Consome o backend entregue na Sprint 3.33** (ADR 0007). Sem migration, sem
novo endpoint, sem nova permissão, sem mudança em services/DAOs, sem mexer em
agenda backend, importação, Equipe ou Auth/MFA. Backend muda **apenas no
model público** para expor proveniência (não-PII) usada pelo frontend.

**Backend (mudança mínima):**
- `backend/src/models/patient.ts` — `PublicPatient` ganha `merged_into_id:
  string | null` e `merged_at: string | null`. `toPublicPatient` popula a
  partir de `row.merged_into_id` e `row.merged_at?.toISOString() ?? null`. Não
  é PII; habilita o badge "Mesclado em outro registro" no frontend.

**Frontend:**
- `frontend/src/services/api.ts` — `PublicPatient` ganha as mesmas duas chaves.
  Tipos novos: `MergeFillableField` (literal union dos campos que o backend
  pode preencher), `PatientMergeResponse` (`{ patient, merge: { merged_count,
  moved_appointments_count, archived_secondary_ids, filled_fields } }`). Método
  novo: `api.mergePatients(token, primaryId, secondaryIds): Promise<PatientMergeResponse>`
  (`POST /patients/:id/merge` com body `{ secondary_ids }`). Erros tratados
  via `ApiError` no chamador (mapeia `forbidden_role` → FORBIDDEN_ROLE_MESSAGE
  igual aos demais owner-only).
- `frontend/src/components/DuplicatesList.tsx` — adicionado:
  - rádio **"Manter como principal"** owner-only em cada registro do grupo,
    sem pré-seleção; estado `primaryByGroup: Record<group_key, patientId>`,
    **limpo a cada reload do scan** (uma seleção antiga não pode ser acionada
    sobre um grupo que mudou);
  - selo **"Principal"** + `.recordPrimary` no card escolhido;
  - hint dinâmico no grupo: "Os outros N registros serão arquivados como
    duplicados." / "Escolha o paciente principal antes de resolver.";
  - **botão "Resolver duplicado"** no rodapé do grupo (owner-only,
    desabilitado sem seleção ou enquanto outra ação merge está em andamento);
  - **`ConfirmDialog` variant `danger`** com copy explícita do comportamento
    B-safe (mantém o principal, move agendamentos vinculados aos duplicados se
    houver, preenche apenas campos vazios do principal, nunca sobrescreve,
    arquiva os registros duplicados, nada é apagado fisicamente, **não há
    desfazer completo nesta versão**);
  - `secondary_ids` derivado no submit como `group.patients.filter(p => p.id
    !== primaryId && p.status === 'active').map(p => p.id)`;
  - erro de API permanece **dentro** do modal (`error` prop), spinner via
    `isBusy`, ESC/backdrop respeitam `isBusy`;
  - após sucesso: mensagem inline `mergeNotice` (verde, `role="status"`,
    `CheckCircle2`) com contagens da resposta + `onPatientsChanged()` (bump
    `refreshKey` → recarrega `PatientsList` + `DuplicatesList`) +
    `queryClient.invalidateQueries({queryKey:['appointments']})` e
    `queryClient.invalidateQueries({queryKey:['patients']})` para sincronizar
    Agenda/picker (TanStack);
  - copy dos avisos atualizada para não-owner (inclui menção a "Resolver
    duplicados" como exclusivo do dono).
- `frontend/src/components/DuplicatesList.module.css` — classes novas:
  `.mergeNotice` (sucesso verde), `.primaryRadio` + `.primaryRadioLabel`
  (controle owner-only), `.recordPrimary` (borda ciano no card escolhido),
  `.primaryTag` (selo "Principal"), `.mergeBar` + `.mergeBarHint` (rodapé
  tracejado), `.mergeBtn` (cyan-soft forte).
- `frontend/src/components/PatientsList.tsx` — badge discreto **"Mesclado em
  outro registro"** quando `p.status === 'archived' && p.merged_into_id`.
  Sem lookup do nome do principal (decisão consciente).
- `frontend/src/components/PatientsList.module.css` — `.mergedTag` (itálico,
  cinza-claro, sem fundo — informativo, não destacado).

**Permissão.** UI esconde rádio + botão "Resolver duplicado" para qualquer
papel `!== 'dono_clinica'`; backend continua sendo defesa real (3.33 já
retorna 403 `forbidden_role` para `secretaria`). Secretaria/funcionário(a)
permanece podendo editar registros e ver o badge de arquivados mesclados
(read-only).

**Cache invalidation.** `DuplicatesList` agora importa `useQueryClient`
exclusivamente para o pós-merge — não migrou para TanStack no resto (mantém o
padrão `refreshKey` já usado entre `PatientsList` e `DuplicatesList`).

**Contagem de agendamentos por paciente.** **Não criada** nesta sprint. O
endpoint `GET /appointments` aceita `date|professional_id|status`, não
`patient_id`; criar endpoint novo só para contagem fugiria do escopo aprovado.
Copy genérica no modal cobre o caso. Item de futuro se a UX exigir.

**Verificação.** `pnpm --filter backend typecheck` ✅, `pnpm --filter backend
build` ✅, `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend
build` ✅, `docker compose build backend && docker compose up -d backend` ✅
(rebuild necessário porque o container roda `node dist/server.js`). Smoke API
descartável (`/tmp/smoke-3.34.mjs`) confirmou:
1. `PublicPatient` carrega `merged_into_id` + `merged_at` em criação/listagem
   (todas nulas no início);
2. `POST /patients/:id/merge` continua devolvendo `{ patient, merge: {...} }`
   com `filled_fields: ["telefone"]` no caso testado;
3. listagem `status=archived` mostra o secundário com `merged_into_id` = id
   do principal e `merged_at` em ISO timestamp.

Dados de teste (1 clínica + 1 owner + 2 pacientes) removidos via SQL no fim
(cleanup pattern da 3.33). Baseline preservado (22 patients / 11 appointments).

**Validação visual aprovada pelo usuário em 2026-05-24** (Sprint 3.35) —
checklist de `docs/testing-checklist.md` (Sprint 3.34) percorrido manualmente
no navegador. Nenhum bug bloqueante. Fluxo aprovado ("ficou bem fera").

**Arquivos alterados:** `backend/src/models/patient.ts`,
`frontend/src/services/api.ts`,
`frontend/src/components/DuplicatesList.tsx`,
`frontend/src/components/DuplicatesList.module.css`,
`frontend/src/components/PatientsList.tsx`,
`frontend/src/components/PatientsList.module.css`,
`CLAUDE.md`, `docs/project-state.md`, `docs/security-notes.md`,
`docs/sprint-history.md` (esta entrada), `docs/testing-checklist.md`,
`docs/roadmap-next-phase.md`.

**Riscos/ressalvas conhecidos:**
- **Sem contagem de agendamentos** por paciente na UI do merge (copy
  genérica). Endpoint novo seria owner-only + tenant-scoped — sprint futura
  se a UX exigir.
- **Invalidação assume keys TanStack `['appointments']` / `['patients']`** —
  hoje só `AdministrativeSchedulePanel` e `ClinicProfessionalsPanel` usam
  TanStack para essas e seguem essa convenção. Se uma futura tela usar outra
  key, a Agenda pode ficar stale até o próximo navegação.
- **Sem undo completo** — o owner pode confirmar por engano. Mitigação:
  `variant="danger"` + copy explícita "esta versão ainda não tem desfazer
  completo". Restore individual funciona para o secundário, mas **não** devolve
  appointments movidos nem reverte fill-blanks.
- **`mergeNotice` é local ao painel** — se o owner trocar de aba antes de ler,
  perde a mensagem. Aceitável: ela é apenas confirmação; o efeito visível
  (grupo sumir, badge em Arquivados, Agenda atualizada) já comunica.
- **Sem lookup do nome do principal** no badge "Mesclado em outro registro" —
  intencional (PII desnecessária na fila de arquivados; mantém UI honesta).
  Se virar requisito, fazer com lookup no cliente sobre a lista carregada.

Sem commit/push.


---

## Sprint 3.35 (docs/QA — sem backend, sem feature)

**Sem backend, sem API, sem migration, sem permissão, sem nova feature.** Sprint de docs e QA: registrar formalmente que a Sprint 3.34 foi validada visualmente pelo usuário; consolidar o checklist do fluxo Pacientes/Duplicados/Merge; confirmar ausência de pendência bloqueante para piloto no fluxo de merge.

**Motivação:** a Sprint 3.34 foi entregue com validação visual pendente. O usuário percorreu o checklist manualmente no navegador em 2026-05-24 e aprovou o fluxo ("ficou bem fera"). Esta sprint consolida esse registro.

**O que foi validado (fluxo de merge B-safe, Sprint 3.34):**
1. Rádio "Manter como principal" aparece por registro de cada grupo (owner-only, sem pré-seleção).
2. Selo "Principal" e borda ciano no card escolhido.
3. Hint e botão "Resolver duplicado" desabilitado sem seleção / habilitado com seleção.
4. `ConfirmDialog` variant `danger` abre com copy explícita B-safe (mantém, move, preenche, arquiva, nada apagado, sem desfazer completo).
5. Cancelar não dispara nenhuma request.
6. Confirmar: spinner, modal fecha, mensagem verde inline com contagens.
7. Grupo some da lista após merge (< 2 ativos restam).
8. Fill-blanks: campo vazio do principal recebe valor do secundário.
9. Fill-blanks não sobrescreve: campo já preenchido do principal é preservado.
10. Aba Arquivados: secundário aparece com badge "Mesclado em outro registro".
11. Aba Agenda: agendamento reassignado exibe nome do principal.
12. CPF sempre mascarado (nenhum card/modal/network expõe CPF bruto).
13. Secretaria: sem rádio, sem botão "Resolver duplicado"; aviso owner-only visível.
14. Sem regressão em outros fluxos (Equipe, Agenda, Importações, MFA).

**Pendências conhecidas aceitas (não bloqueantes):**
- Sem contagem de agendamentos por paciente no modal (copy genérica cobre; endpoint futuro se UX exigir).
- Sem undo completo (documentado no ADR 0007 e na copy do modal).
- Badge "Mesclado em outro registro" sem lookup do nome do principal (intencional).

**Docs atualizados nesta sprint:**
- `docs/project-state.md`: Sprint 3.35 adicionada; "Validação visual pendente" → "aprovada pelo usuário em 2026-05-24".
- `docs/sprint-history.md` (este arquivo): entrada Sprint 3.35 + atualização da Sprint 3.34.
- `docs/testing-checklist.md`: cabeçalho da seção 3.34 atualizado; nota de validação adicionada.
- `CLAUDE.md`: estado atual = Sprint 3.35 entregue; próximas prioridades atualizadas.
- `docs/roadmap-next-phase.md`: Sprint 3.34 marcada como validada visualmente; Sprint 3.35 adicionada; trilha merge 3.32–3.35 fechada.

Nenhum build necessário (docs only). Sem commit/push.


---

## Sprint 3.36 (QA geral do piloto v0.1 — docs-only)

**Sem backend, sem API, sem migration, sem permissão, sem nova feature.** Sprint de
QA geral: consolidar os fluxos principais do ClinicBridge num checklist completo de
piloto v0.1, identificar blockers/bugs/ressalvas e atualizar o roteiro e checklist
de demo para refletir o estado atual (Equipe + merge B-safe entregues e validados).

**Motivação:** com as trilhas Equipe (3.24–3.31), Pacientes/Duplicados (3.22–3.23) e
Merge B-safe (3.32–3.35) completas e validadas individualmente, era necessária uma
rodada de QA geral para confirmar ausência de regressão cross-fluxo e preparar o
produto para piloto com clínica real.

**Achado documental: `docs/demo-pilot-v0.1-script.md` estava com conteúdo stale.**
O passo 3 descrevia duplicados como "detecção informativa (read-only)" — o que era
correto até a Sprint 3.23, mas o merge B-safe (3.33/3.34) tornou a tela acionável.
Corrigido nesta sprint.

**Fluxos cobertos no QA (10):**
1. Autenticação e segurança de conta (auth, MFA, backup codes, logout)
2. Equipe (invite → aprovar → membros → desativar → profissionais → cache)
3. Pacientes administrativos (CRUD, filtros, CPF mascarado, cross-tenant)
4. Duplicados e merge B-safe (rádio, ConfirmDialog, grupo some, badge, fill-blanks)
5. Importação (upload → preview → dry-run → mark-ready → import → recibo)
6. Agenda administrativa (criar, status, remarcar, lembrete manual, aviso anti-clínico)
7. Exportação (CSV/XLSX, sem CPF bruto, erros seguros)
8. Retenção dry-run (painel owner, não apaga, sem dados internos)
9. Layout/demo/mobile (landing, abas, 390px, footer, copy administrativa)
10. Segurança geral (401, 403, cross-tenant, audit sem PII, rate-limit, sem clínico)

**Classificação de achados:** BLOCKER / BUG PEQUENO / POLISH / ACEITÁVEL MVP / FUTURO.
**Nenhum BLOCKER identificado** neste QA documental.

**Ressalvas aceitas (ACEITÁVEL MVP):** sem undo completo no merge; sem contagem de
agendamentos no modal; badge sem nome do principal; papel JWT stale até expirar
(exceto desativação, imediata); sem TLS real; sem limpeza real de arquivos; sem
paginação backend de duplicados; sem roles granulares; sem WhatsApp API; sem histórico
visual de auditoria.

**Docs atualizados:**
- `docs/demo-pilot-v0.1-script.md`: passo 3 corrigido (merge B-safe, não read-only);
  perguntas de validação expandidas (Equipe + merge).
- `docs/demo-pilot-v0.1-checklist.md`: seção "Equipe" expandida (fluxo completo com
  modais, cache, desativação); seção "Pacientes/duplicados/merge B-safe" com
  checklist do merge; perguntas atualizadas.
- `docs/testing-checklist.md`: nova seção "QA geral do piloto v0.1 — Sprint 3.36"
  com 10 blocos + tabela de ressalvas aceitas.
- `docs/roadmap-next-phase.md`: nova seção "QA geral do piloto v0.1 — Sprint 3.36 ✅"
  com 7 próximos passos pré-produção.
- `docs/project-state.md`: Sprint 3.36 adicionada.
- `docs/sprint-history.md` (este arquivo): entrada Sprint 3.36.
- `CLAUDE.md`: estado atual = Sprint 3.36 entregue; próximas prioridades.

---

## Sprint 3.37 (planejamento/docs only — entregue 2026-05-24)

**Objetivo:** plano de produção mínima segura. Sem backend, sem frontend, sem
migration, sem código, sem infra real, sem commit/push.

**Decisão estratégica registrada:** AWS como provedor preferido para hospedagem
futura. Decisões de sub-opção pendentes (6 itens).

**Arquivo criado:** `docs/production-minimum-plan.md`.

**Arquitetura AWS mínima documentada (direção, não implementação):**
- Compute: EC2 (t3.small/medium) + Docker Compose inicialmente → ECS/Fargate como evolução.
- Banco: RDS PostgreSQL (db.t3.micro/small) para produção real; Postgres em Docker só em staging.
- Redis: ElastiCache (cache.t3.micro) para produção; Redis Docker só em staging.
- Storage/uploads: EBS persistente como etapa inicial (compatível com código atual) → S3 como evolução (exige refactor + ADR).
- TLS: Nginx + Certbot (Let's Encrypt) na EC2 inicialmente; Route 53 + ACM + ALB como evolução.
- Secrets: SSM Parameter Store (SecureString) inicialmente → Secrets Manager ao precisar de rotação automática.
- Backup: snapshots RDS automáticos + Restic → S3 bucket privado para uploads.
- Logs: CloudWatch Logs (`awslogs` driver) + alarmes de 5xx/health.
- Rede: Security Groups fechando portas 5432 (Postgres) e 6379 (Redis) da internet; só 80/443 públicos.

**Gaps P0 documentados:**
1. `NODE_ENV=development` hardcoded no runtime stage do Dockerfile (linha 29).
2. TLS real ausente — cert autoassinado local ≠ produção; HSTS desabilitado.
3. Postgres/Redis sem Security Groups ao expor em EC2 nua.
4. Secrets em `.env` local sem rotação e sem gestor externo.

**Gaps P1 documentados:**
- `MFA_ENCRYPTION_KEY` obrigatória em prod (hoje opcional).
- Storage uploads persistente (bind mount não sobrevive a redeploy).
- Backup offsite pendente (Restic local validado, destino remoto não).
- Validação jurídica da política de retenção pendente.
- HSTS só ativar com cert real e estável.

**Domínio registrado:** `clinicbridge.com.br` — Registro.br, criado 2026-05-24,
expira 2027-05-24. Subdomínios planejados: `clinicbridge.com.br` (landing),
`app.clinicbridge.com.br` (frontend), `api.clinicbridge.com.br` (backend),
`staging.clinicbridge.com.br` (staging). Sem hospedagem/e-mail extras no Registro.br.
DNS ainda sem configuração para AWS — decisão de roteamento (Registro.br DNS vs
Route 53) fica para Sprint 3.38.

**Decisões pendentes do dono (7):**
1. EC2 + Docker Compose vs ECS/Fargate.
2. RDS/ElastiCache gerenciados vs tudo em EC2 para MVP.
3. EBS vs S3 para uploads.
4. DNS: manter no Registro.br (A/CNAME manuais) vs migrar para Route 53 (hosted zone).
5. TLS: EC2 + Nginx + Certbot vs Route 53 + ACM + ALB.
6. SSM Parameter Store vs Secrets Manager.
7. Orçamento mensal aceitável (~$20-25/mês tudo em EC2 Docker vs ~$60-80/mês com RDS+ElastiCache).

**Sequência de sprints recomendada:** 3.38 (TLS real + `NODE_ENV`) → 3.39 (secrets + env prod) → 3.40 (backup offsite) → 3.41 (storage + banco/Redis prod) → 3.42 (deploy checklist go/no-go) → 3.43 (piloto real).

**Docs atualizados:**
- `docs/production-minimum-plan.md` (criado; atualizado com domínio, subdomínios e decisão DNS pendente).
- `docs/roadmap-next-phase.md`: seção Sprint 3.37 + tabela de sprints pré-produção adicionadas; seção Sprint 3.36 simplificada (link para plano).
- `docs/project-state.md`: Sprint 3.37 adicionada + complemento de domínio.
- `docs/sprint-history.md` (este arquivo): entrada Sprint 3.37 + complemento de domínio.
- `CLAUDE.md`: estado atual = Sprint 3.37 entregue; ponteiro para plano.

---

## Sprint 3.38 (entregue 2026-05-24 — Dockerfile + Nginx templates + runbook DNS/TLS)

**Objetivo:** preparar base de staging/produção para DNS/TLS/Nginx sem deploy real.
Sem migration, sem feature de produto, sem alterar regra de negócio, sem commit/push.

**Mudança de código (Dockerfile):**
- `backend/Dockerfile` linha 29: `ENV NODE_ENV=development` → `ENV NODE_ENV=production`.
- Imagem agora tem default seguro para produção.
- `docker-compose.yml` local já seta `NODE_ENV: development` explicitamente no
  serviço `backend` — sem impacto local. Build verificado.

**Arquivos criados:**
- `infra/nginx/conf.d/clinicbridge.production.conf.example` — template Nginx para
  `api.clinicbridge.com.br`: HTTP→HTTPS 301, TLS Let's Encrypt
  (`/etc/letsencrypt/live/api.clinicbridge.com.br/`), `ssl_protocols TLSv1.2 TLSv1.3`,
  `client_max_body_size 10m`, timeouts, anti-spoof (X-Real-IP/XFF sobrescritos com
  `$remote_addr`), `X-Forwarded-Proto`, HSTS comentado, resolver Docker interno,
  CORS no app (Nginx não emite headers CORS). Extensão `.conf.example` = não carregado
  pelo glob automático.
- `infra/nginx/conf.d/clinicbridge.staging.conf.example` — idem para
  `staging.clinicbridge.com.br`.
- `docs/dns-tls-staging-runbook.md` — runbook operacional completo:
  (0) convenções/placeholders; (1) pré-requisitos EC2+SG; (2) DNS Registro.br
  (4 registros A: @, api, app, staging → Elastic IP, TTL 3600); (3) Certbot
  standalone (parar Nginx, emitir cert, dry-run, renovação automática via hook);
  (4) ativar conf Nginx (copiar template, montar `/etc/letsencrypt`, nginx -t);
  (5) testes curl/openssl (redirect 301, HTTPS 200, cert, headers, logs sem PII,
  NODE_ENV); (6) HSTS go/no-go (quando e como ativar, staging com max-age=300 primeiro);
  (7) rollback; (8) checklist go/no-go com status de cada P0.

**Validações executadas:**
- `docker compose --profile edge build backend` ✅ (build limpo, TypeScript compilou).
- `docker compose --profile edge up -d backend nginx` ✅ (containers subiram).
- `curl -sk https://localhost:8443/health` → `{"status":"ok",...}` ✅.
- `curl -sk https://localhost:8443/health/ready` → `{"status":"ready","checks":{"database":"ok"}}` ✅.
- `docker compose exec backend sh -c 'echo NODE_ENV=$NODE_ENV'` → `development` ✅
  (compose local sobrescreve corretamente).
- `curl -si http://localhost:8080/health | head -1` → `HTTP/1.1 301 Moved Permanently` ✅.
- `docker compose exec nginx nginx -t` → `syntax is ok / test is successful` ✅.

**Pendente (depende de EC2 disponível):**
- Alocar Elastic IP e associar à EC2.
- Criar 4 registros A no Registro.br.
- Instalar Certbot na EC2 e emitir certs reais.
- Montar `/etc/letsencrypt` no container Nginx de produção.
- Ativar HSTS após confirmar HTTPS estável e renovação.
- `FRONTEND_ORIGIN=https://app.clinicbridge.com.br` em produção.

**Docs atualizados:**
- `backend/Dockerfile`: `NODE_ENV=production` no runtime.
- `infra/nginx/conf.d/clinicbridge.production.conf.example` (criado).
- `infra/nginx/conf.d/clinicbridge.staging.conf.example` (criado).
- `docs/dns-tls-staging-runbook.md` (criado).
- `docs/production-minimum-plan.md`: tabela de estado atualizada (NODE_ENV ✅,
  templates ✅, runbook ✅); Sprint 3.38 marcada como entregue; P0 do NODE_ENV riscado.
- `docs/nginx-local-staging-runbook.md`: ponteiro para novo runbook DNS/TLS.
- `docs/deploy-security-checklist.md`: §5 com Sprint 3.38 atualizado.
- `docs/project-state.md`: Sprint 3.38 adicionada.
- `docs/sprint-history.md` (este arquivo): entrada Sprint 3.38.
- `CLAUDE.md`: estado atual = Sprint 3.38 entregue.

Nenhum build necessário (docs only). Sem commit/push.

---

## Sprint 3.39 (entregue 2026-05-24 — guards de boot + runbook de secrets)

**Objetivo:** secrets e env de produção — garantir que `MFA_ENCRYPTION_KEY` seja
obrigatória em produção, que `FRONTEND_ORIGIN` não aceite localhost/http em produção,
e documentar geração/armazenamento de secrets via AWS SSM Parameter Store.
Sem migration, sem feature de produto, sem commit/push.

**Mudanças de código:**

`backend/src/config/env.ts` — dois novos guards no `superRefine`, bloco `NODE_ENV=production`:

1. **`MFA_ENCRYPTION_KEY` obrigatória:** `!val.MFA_ENCRYPTION_KEY || trim().length < 32`
   → boot falha. Em dev/test: sem guard (fallback para `JWT_SECRET` funciona). Motivo:
   isolar o secret de cifra TOTP do JWT; rotar `JWT_SECRET` sem `MFA_ENCRYPTION_KEY`
   dedicada invalidaria todos os secrets TOTP silenciosamente.
2. **`FRONTEND_ORIGIN` sem localhost/http:** filtra as origens da lista separada por
   vírgula e rejeita qualquer que contenha `localhost`, `127.0.0.1` ou comece com
   `http://`. Complementa o guard `*` já existente em `cors.ts`.

`.env.example` — comentários atualizados:
- `FRONTEND_ORIGIN`: exemplos de staging/prod; nota sobre guard de produção.
- `MFA_ENCRYPTION_KEY`: nota de obrigatório em prod com instrução de geração.

**Arquivo criado:**

`docs/secrets-env-production-runbook.md` — 7 seções:
(0) convenções e placeholders; (1) variáveis por ambiente (dev/staging/prod);
(2) geração de secrets (`JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `RESTIC_PASSWORD`,
`DATABASE_URL`, `REDIS_URL` — todos via `openssl rand -hex 32` ou equivalente);
(3) caminhos SSM sugeridos (`/clinicbridge/staging/*` e `/clinicbridge/prod/*`;
comandos de referência `aws ssm put-parameter`/`get-parameter`; IAM mínimo com
read-only no path correto, sem escrita na instance role);
(4) injeção em runtime (script de bootstrap SSM + `source` antes do `docker compose`,
`environment:` do compose, `.env` efêmero com `chmod 600`);
(5) caveats de rotação (`JWT_SECRET` invalida sessões; `MFA_ENCRYPTION_KEY` invalida
todos os TOTP — planejar ADR antes de rotar em produção; `RESTIC_PASSWORD` exige
re-cifra e restore drill antes de descartar a antiga);
(6) checklist de 14 itens antes do primeiro deploy real;
(7) referências.

**Validações executadas:**
- `pnpm --filter backend typecheck` ✅ (sem erros de tipo).
- `pnpm --filter backend build` ✅ (compilação limpa).
- Cenário 1: `NODE_ENV=production` sem `MFA_ENCRYPTION_KEY` → `process.exit(1)` com
  mensagem `MFA_ENCRYPTION_KEY is required in production` ✅.
- Cenário 2: `NODE_ENV=production` com `MFA_ENCRYPTION_KEY` de 10 chars → exit 1 ✅.
- Cenário 3: `NODE_ENV=production` com `FRONTEND_ORIGIN=http://localhost:5173` → exit 1
  com mensagem sobre localhost/http ✅.
- Cenário 4: `NODE_ENV=production` com valores corretos (64-char key, HTTPS origin) →
  exit 0 ✅.
- Cenário 5: `NODE_ENV=development` sem `MFA_ENCRYPTION_KEY` → exit 0 (dev funciona) ✅.

**Docs atualizados:**
- `backend/src/config/env.ts`: dois novos guards.
- `.env.example`: comentários de `FRONTEND_ORIGIN` e `MFA_ENCRYPTION_KEY`.
- `docs/secrets-env-production-runbook.md` (criado).
- `docs/production-minimum-plan.md`: tabela de estado (guards ✅, runbook ✅);
  P1 de `MFA_ENCRYPTION_KEY` marcado como entregue; Sprint 3.39 marcada.
- `docs/deploy-security-checklist.md`: §3 com novos guards e referência ao runbook;
  §15 com checklist atualizado (MFA_ENCRYPTION_KEY + SSM).
- `docs/security-notes.md`: seção MFA atualizada (guard de prod, caveat de rotação,
  ponteiro para runbook); seção Deploy seguro/CORS atualizada (lista de 4 guards).
- `docs/project-state.md`: Sprint 3.39 adicionada.
- `docs/sprint-history.md` (este arquivo): entrada Sprint 3.39.
- `CLAUDE.md`: estado atual = Sprint 3.39 entregue.

Sem commit/push.

---

## Sprint 3.40 (entregue 2026-05-25 — backup offsite Restic + S3, docs/scripts only)

**Objetivo:** evoluir o backup local (Sprint 3.5) para um backup **offsite seguro**
com Restic + S3, criando scripts hardened, runbook operacional, IAM mínimo
documentado e restore drill em banco separado — **sem deploy real, sem
infraestrutura AWS criada, sem dado real tocado, sem commit/push**.

**Scripts criados (executáveis, em `scripts/`):**

1. `check-backup-offsite-env.sh` — pré-flight read-only.
   - Verifica `restic`, `docker`, container Postgres, `pg_dump`/`pg_restore`.
   - Verifica `RESTIC_PASSWORD` e `RESTIC_REPOSITORY` (sem imprimir valores).
   - `[FAIL]` se `RESTIC_REPOSITORY` parecer caminho local (proteção contra
     redirecionamento acidental do fluxo offsite para repo local).
   - Aceita AWS creds via env vars **ou** ausência (IAM role/default chain).
   - Confirma que `.gitignore` cobre `backups/work/`, `backups/restore-offsite-work/`,
     dumps e SQL.
   - `--probe` opcional tenta `restic snapshots --compact` (rede, sem alterações).
   - `--help` documenta uso.

2. `backup-offsite-restic.sh` — backup real para S3.
   - **Hard guard 1:** `RESTIC_REPOSITORY` deve começar com `s3:` (case-insensitive).
     Caminhos locais (`/foo`, `./foo`, `backups/foo`) → abort com mensagem clara
     direcionando para o script local.
   - **Hard guard 2:** `RESTIC_PASSWORD` obrigatória; mensagem aponta para SSM.
   - Gera `pg_dump -Fc` (custom format) em `backups/work/clinicbridge-offsite-<TS>.dump`.
   - Inclui `storage/uploads` se existir.
   - Envia com tags `clinicbridge`, `offsite`, `ts:<TS>`.
   - `--dry-run` faz tudo até gerar o dump mas NÃO executa `restic init`/`backup`.
   - `--help` documenta uso completo.
   - Logs nunca exibem `RESTIC_PASSWORD`, `RESTIC_REPOSITORY` (valor) ou `AWS_*`.

3. `restore-offsite-restic.sh` — restore drill em banco SEPARADO.
   - **Hard guard 1:** `RESTORE_DB` (default `clinicbridge_restore_offsite_test`)
     **não pode ser igual** ao `POSTGRES_DB` (default `clinicbridge`). Aborta no
     boot do script (linha 56 da função guard).
   - **Hard guard 2:** `RESTIC_REPOSITORY` deve começar com `s3:`.
   - Restaura último snapshot para `backups/restore-offsite-work/latest`.
   - `DROP DATABASE IF EXISTS` + `CREATE DATABASE` **apenas** para `RESTORE_DB`.
   - `pg_restore --no-owner --no-privileges` para o banco de teste.
   - Compara counts de `patients`/`import_files`/`import_sessions` lado a lado.
   - Exit 2 em divergência (não 0; integrável com CI/alerta).
   - Aceita `clinicbridge-*.dump` e `clinicbridge-offsite-*.dump` no snapshot
     (interoperabilidade com snapshots gerados pelo script local antigo, se houver).

**Arquivo doc criado:**

`docs/backup-offsite-runbook.md` (11 seções, ~14k chars):
1. Status e escopo (o que foi entregue / o que NÃO foi).
2. Pré-requisitos: ferramentas locais; conta/bucket AWS (privado, versionado,
   SSE-S3 ou SSE-KMS); IAM mínimo com JSON policy completo
   (`s3:ListBucket`/`s3:GetBucketLocation` no bucket + `s3:GetObject`/`PutObject`/
   `DeleteObject` nos objetos); secrets (SSM caminho mapeado).
3. Fluxo geral (ASCII).
4. Tabela de variáveis (obrigatórias vs opcionais, defaults).
5. Procedimentos passo a passo (check / dry-run / backup / list / restore drill).
6. Política de retenção `forget --prune` (recomendação 7d/4s/6m/2y) — **comandos
   documentados como referência, NÃO executados automaticamente**; razões para
   manter fora de cron nesta sprint.
7. Agendamento futuro (systemd-timer / ECS scheduled task; alertas CloudWatch) —
   critérios de aceite listados, não implementados.
8. Segurança (cifragem em repouso/trânsito; sem PII em logs; separação de
   privilégios; rotação de senha exige re-cifra; cross-region/cross-account
   opcionais).
9. Troubleshooting (tabela sintoma × causa × ação).
10. Checklist de validação 3.40 (entregue) + pendente (depende de AWS real).
11. Status / próximos passos numerados (1–8).

**Mudanças em `.env.example`:**

Bloco novo após o bloco Sprint 3.5 (linha 163):
- Cabeçalho `--- Backup offsite Restic + S3 (Sprint 3.40) ---`.
- Aviso de "NOT part of backend runtime env" (igual ao bloco local).
- Aviso de SSM/IAM role para valores reais.
- Variáveis obrigatórias documentadas: `RESTIC_REPOSITORY` (com exemplo
  `s3:s3.amazonaws.com/clinicbridge-backups-prod`), `RESTIC_PASSWORD`.
- AWS credentials: 4 vars listadas com nota "preferir IAM role".
- Tuning opcional: `RESTIC_CACHE_DIR`, `POSTGRES_*`, `BACKUP_WORKDIR`, `UPLOAD_DIR`,
  `RESTORE_DB`, `CLEAN_BACKUP_WORKDIR`.

**Mudanças em outros docs:**

- `CLAUDE.md`: lista de docs ganha pointer para o runbook offsite; Estado atual
  bumpado para Sprint 3.40 (data 2026-05-25); Próximas prioridades reflete 3.40 ✅
  com pendência de provisionamento real.
- `docs/project-state.md`: entrada Sprint 3.40 prepended ao topo (acima de 3.39).
- `docs/backup-restore-strategy.md`: §1 Status reflete scripts offsite implementados,
  bucket pendente; §10 Restore e drills menciona drill offsite separado.
- `docs/security-notes.md`: seção Backup atualizada — cita os dois hard guards,
  o runbook offsite e o `RESTORE_DB` distinto.
- `docs/secrets-env-production-runbook.md`: §2 RESTIC_PASSWORD agora referencia o
  runbook offsite para detalhes; §3 IAM mínimo ganha bloco "Backup S3" complementar
  à role de leitura de SSM.
- `docs/production-minimum-plan.md`: §2.7 (Backup) atualizado com "scripts
  implementados (Sprint 3.40), bucket/IAM pendentes"; §4 (sequência) Sprint 3.40
  ✅ com escopo executado (scripts + docs).
- `docs/deploy-security-checklist.md`: §11 (Backup/restore) atualizado — offsite
  scripts ✅, bucket real pendente; agendamento e alertas listados como sprint
  futura.
- `docs/testing-checklist.md`: novo bloco "Backup offsite (Sprint 3.40)" com smoke
  tests **sem AWS real** — só validação de hard guards, ausência de env,
  `--dry-run`, syntax check, gitignore.
- `docs/roadmap-next-phase.md`: Sprint 3.40 ✅; sequência 3.41–3.43 mantida.

**Validações executadas (sem AWS, sem rede):**

- `bash -n scripts/check-backup-offsite-env.sh` → exit 0 (sintaxe ok).
- `bash -n scripts/backup-offsite-restic.sh` → exit 0 (sintaxe ok).
- `bash -n scripts/restore-offsite-restic.sh` → exit 0 (sintaxe ok).
- `./scripts/check-backup-offsite-env.sh --help` → exit 0, imprime ajuda, não
  executa checagens.
- `./scripts/backup-offsite-restic.sh --help` → exit 0, ajuda, não executa.
- `./scripts/restore-offsite-restic.sh --help` → exit 0, ajuda, não executa.
- `unset RESTIC_PASSWORD RESTIC_REPOSITORY && ./scripts/backup-offsite-restic.sh`
  → exit 1 com `RESTIC_PASSWORD não definida`. Nenhum dump gerado.
- `RESTIC_PASSWORD=x RESTIC_REPOSITORY=backups/foo ./scripts/backup-offsite-restic.sh`
  → exit 1 `[ABORTAR] RESTIC_REPOSITORY parece ser caminho LOCAL`.
- `RESTIC_PASSWORD=x RESTIC_REPOSITORY=s3:dummy RESTORE_DB=clinicbridge \
   ./scripts/restore-offsite-restic.sh` → exit 1 `[ABORTAR] RESTORE_DB é igual ao
  banco principal`.
- `git status` → só docs/scripts/.env.example modificados; nenhum dump, repo
  Restic, segredo ou `.env` em staging.
- `git check-ignore -q backups/work/offsite-x.dump` → exit 0 (ignorado).
- `git check-ignore -q backups/restore-offsite-work/latest/foo` → exit 0 (ignorado).

**Hard guards implementados (segurança):**

| Guard | Onde | Mensagem | Exit |
|---|---|---|---|
| `RESTIC_PASSWORD` ausente | backup + restore + check | "RESTIC_PASSWORD não definida..." | 1 |
| `RESTIC_REPOSITORY` ausente | backup + restore + check | "RESTIC_REPOSITORY não definida..." | 1 |
| `RESTIC_REPOSITORY` não-s3 | backup + restore | "[ABORTAR] ... parece ser caminho LOCAL" | 1 |
| `RESTORE_DB == POSTGRES_DB` | restore | "[ABORTAR] ... NUNCA pode sobrescrever o banco principal" | 1 |
| dump vazio | backup | "[FAIL] dump vazio" | 1 |
| counts divergem | restore | "Restore drill OFFSITE ATENÇÃO..." | 2 |
| Apenas uma de AWS_ACCESS_KEY_ID/SECRET | check | "Apenas uma ... definida" | 1 (via err contador) |

**Decisões registradas:**

1. **Sem `restic forget --prune` automático.** Limpeza destrutiva é apenas
   documentada (§6 do runbook), com razões: depende de validação jurídica (ADR
   0002), restore drill recente e monitoramento. O runbook traz comandos prontos
   para o operador rodar manualmente.
2. **Sem agendamento.** Cron/systemd-timer/ECS scheduled task ficam como sprint
   futura — exige decisão de compute (EC2 vs ECS) que está no §5 do
   `production-minimum-plan.md`.
3. **Sem alertas.** Alarme de falha (CloudWatch) é sprint futura; depende de
   provisionamento de infra real.
4. **Sem mudança no fluxo local.** `backup-local-restic.sh` continua só local;
   ambos coexistem.
5. **`RESTORE_DB` default distinto.** `clinicbridge_restore_offsite_test` ≠
   `clinicbridge_restore_test` permite que drill local e drill offsite coexistam
   sem colisão no Postgres.

**Pendências (Sprint 3.41+):**

1. Provisionar bucket S3 (`clinicbridge-backups-prod` + `-staging`) — privado,
   versionado, SSE-S3 (mínimo) ou SSE-KMS, opcional Object Lock.
2. Criar IAM role / instance profile com a policy mínima do §2.3 do runbook
   (`s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` no path
   correto; **não** dar `s3:*` nem credenciais root).
3. Gravar `RESTIC_PASSWORD` no SSM (`/clinicbridge/staging/restic_password` e
   `/clinicbridge/prod/restic_password`) como SecureString.
4. Em staging, executar:
   - `./scripts/check-backup-offsite-env.sh --probe` (valida conectividade).
   - `./scripts/backup-offsite-restic.sh` (primeiro snapshot real).
   - `./scripts/restore-offsite-restic.sh` (drill — **gate go/no-go**).
5. Em produção, repetir com dados sintéticos antes do piloto real.
6. Agendar (sprint futura): systemd-timer / ECS scheduled task + alerta.

Sem commit/push.

---

## Sprint 3.41A (decisão operacional AWS — docs-only)

**Objetivo:** definir o plano concreto e seguro para provisionar a infraestrutura
inicial do ClinicBridge na AWS, sem criar recursos reais.

**Recomendação principal:** EC2 (t3.small) + Docker Compose como primeira etapa.
ECS/Fargate é a evolução natural, mas o overhead operacional não se justifica
para um piloto de clínica única com tráfego baixo.

**Arquivos criados:**
- `docs/aws-infra-sprint-3.41-plan.md` — plano operacional completo com:
  - Topologia recomendada (EC2 + Nginx + RDS + ElastiCache + EBS + S3 + SSM).
  - Tabela de trade-offs EC2+Compose vs ECS/Fargate.
  - 7 decisões pendentes do dono (região, orçamento, banco, Redis, DNS, TLS, storage).
  - Checklist de execução em 6 fases (fundação, rede/SG, dados, EC2, DNS/TLS, validação).
  - Estimativa de custo orientativa (~$20-25/mês econômico; ~$47-56/mês seguro).
  - Sequência simplificada por dias (D+0 → D+4).
  - Tabela de riscos e mitigações.

**Arquivos atualizados:**
- `docs/production-minimum-plan.md` — cabeçalho com referência ao plano 3.41A;
  tabela de sprints atualizada (3.41A ✅ + 3.41B).
- `docs/roadmap-next-phase.md` — tabela de sprints atualizada (3.41A ✅ + 3.41B).
- `docs/sprint-history.md` — esta entrada.
- `CLAUDE.md` — sprint atual atualizado para 3.41A.

**Decisões do dono (7 itens — bloqueia 3.41B):**

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Região AWS | `sa-east-1` (São Paulo) — LGPD + latência BR |
| D2 | Orçamento mensal | ~$47-56/mês (seguro) vs ~$20-25/mês (econômico) |
| D3 | Banco de produção | RDS `db.t3.micro` (backups automáticos; P1 antes de dado real) |
| D4 | Redis | ElastiCache `cache.t3.micro` ou Redis container (staging first) |
| D5 | DNS | Manter Registro.br (registros A/CNAME manuais) |
| D6 | TLS | EC2 + Nginx + Certbot (templates prontos) |
| D7 | Storage de uploads | EBS 20 GB adicional (compatível sem refactor) |

Docs-only; nenhum recurso AWS real criado; nenhum código de produto alterado; nenhum secret versionado.

---

## Sprint 3.41B-0 (runbook executável de provisionamento AWS — docs-only)

**Objetivo:** transformar o plano da Sprint 3.41A em checklist operacional executável
para o provisionamento real, com caminhos Console AWS e AWS CLI, billing seguro e gate
de backup/drill antes do piloto real.

**Decisões assumidas:** região `sa-east-1`; EC2 t3.small + Docker Compose; RDS db.t3.micro
para produção (Postgres container para staging); EBS 20 GB; DNS Registro.br;
TLS Certbot; SSM Parameter Store; S3 privado para backup.

**Arquivo criado:**
- `docs/aws-provisioning-runbook-3.41B.md` — 16 seções:
  - §0 decisões assumidas; Console vs CLI; nomes de recursos; checklist de controle
    de custos (billing alarm, evitar NAT/ALB/Multi-AZ, Elastic IP não solto).
  - §1 conta root + MFA; usuário IAM operador `clinicbridge-operator` + MFA.
  - §2 buckets S3 `clinicbridge-backups-staging`/`-prod` (block public access,
    versioning, SSE-S3, bucket policy DenyInsecureTransport).
  - §3 IAM role `clinicbridge-ec2-role` (policy Restic mínima + SSMManagedInstanceCore).
  - §4 SSM Parameter Store — 7 parâmetros staging SecureString
    (JWT_SECRET, MFA_ENCRYPTION_KEY, DATABASE_URL, REDIS_URL, FRONTEND_ORIGIN,
    RESTIC_PASSWORD, RESTIC_REPOSITORY); bloco prod a repetir antes do piloto.
  - §5 VPC default; Security Groups (EC2: 80/443 público, 22 IP fixo; RDS: 5432
    interno; Redis: 6379 interno); nota sobre SSM Session Manager sem SSH.
  - §6 RDS PostgreSQL db.t3.micro (Single-AZ, no-public, backup 7 dias, snapshot
    antes de migrate).
  - §7 Redis — opção A container (sem custo) ou opção B ElastiCache cache.t3.micro.
  - §8 EC2 t3.small + Elastic IP + EBS 20 GB + setup inicial (Docker, Compose,
    Restic, Node 20, AWS CLI, injeção SSM, migrations, subir serviços).
  - §9 DNS Registro.br — registros A (raiz/api/app/staging → Elastic IP).
  - §10 TLS Certbot — standalone, staging primeiro, dry-run, HSTS só após estável.
  - §11 smoke tests (9 checks: redirect, liveness, readiness, TLS, NODE_ENV,
    login, rate limit, headers, logs Nginx).
  - §12 backup offsite drill (gate go/no-go) + agendamento systemd-timer.
  - §13 controle de custos — parar EC2, snapshot RDS, liberar Elastic IP, revisão mensal.
  - §14 rollback de emergência.
  - §15 checklist go/no-go com 17 itens antes de aceitar tráfego real.

**Arquivos atualizados:**
- `CLAUDE.md` — sprint atual → 3.41B-0; pointer para runbook adicionado.
- `docs/production-minimum-plan.md` — 3.41B-0 ✅ + slot 3.41B (execução real).
- `docs/roadmap-next-phase.md` — tabela atualizada.
- `docs/project-state.md` — "Última sprint aprovada" atualizado.
- `docs/sprint-history.md` — esta entrada.

Docs-only; nenhum recurso AWS real criado; nenhum código de produto alterado; nenhum secret versionado.

---

## Sprint 4.0 (expansão para Clinic OS modular — ADR/docs-only)

**Objetivo:** registrar oficialmente a mudança estratégica do produto. O
ClinicBridge deixa de ser apenas uma ponte de migração administrativa e passa
a ser desenvolvido como **Clinic OS modular** (sistema completo de gestão de
clínicas), competindo com sistemas como Feegow, **sem telemedicina**, com
migração permanecendo como diferencial. Cada módulo clínico exige ADR própria.

**Direção registrada:** ADR 0008 supersedes parcialmente o ADR 0001 (Opção C).
A base administrativa segura continua sendo pré-requisito; critérios de gating
clínico do ADR 0001 são mantidos e estendidos pelo ADR 0008 (4 critérios
adicionais: roles granulares, audit de leitura, separação banco
administrativo/clínico, estratégia de migração clínica).

**Arquivos criados:**
- `docs/adr/0008-clinicbridge-clinic-os-expansion.md` — 10 seções:
  contexto; decisão (9 condições, incl. sem telemedicina, sem cópia de UI
  de concorrentes); módulos no roadmap (8 itens); princípios invariantes
  (10 regras); riscos (10 itens com mitigação); impacto na trilha AWS
  (pausada estrategicamente, gate de retomada); o que não muda; critérios
  para abrir cada Fase 4.x (13 critérios — 9 do ADR 0001 + 4 novos);
  fora de escopo.
- `docs/product-clinic-os-roadmap.md` — roadmap completo por fase:
  - 4.0 ✅ decisão/ADR (esta sprint);
  - 4.1 arquitetura clínica + roles granulares + audit de leitura (ADR 0009);
  - 4.2 prontuário/atendimento v0.1 (ADR 0010);
  - 4.3 documentos médicos/receitas v0.1 (ADR 0011) — sem ICP-Brasil;
  - 4.4 financeiro v0.1 (ADR 0012);
  - 4.5 **relatórios gerenciais v0.1** (ADR 0013) — promovido para antes
    de convênios/estoque pelo alto valor percebido; sem dashboards/cron no v0.1;
  - 4.6 **convênios/faturamento básico v0.1** (ADR 0014) — TISS/TUSS real fora;
  - 4.7 **estoque básico v0.1** (ADR 0015) — medicamentos controlados/ANVISA fora.
  - Fases futuras sem número: IA clínica assistiva (depois de 4.2 madura),
    assinatura digital ICP-Brasil + prescrição válida (depois de 4.3 madura),
    TISS/TUSS real (depois de 4.6), SNGPC/ANVISA (depois de 4.7).
  Cada fase com entregáveis, gates, escopo, fora-de-escopo, princípios
  transversais e riscos consolidados.

**Arquivos atualizados (compactos):**
- `CLAUDE.md` — sprint atual → 4.0; "Direção estratégica" reescrita para
  refletir Clinic OS; "Project identity" atualizado (sem perder o que existe
  hoje); "Próximas prioridades" reorganizado em trilha Clinic OS + trilha AWS
  (pausada); "Escopo clínico proibido" referencia ADR de Fase 4.x; ponteiro
  para ADR 0008 + roadmap adicionado; "Communication style" reescrito.
- `docs/project-state.md` — "Última sprint aprovada" → 4.0; estado anterior
  preservado.
- `docs/sprint-history.md` — esta entrada.
- `docs/roadmap-next-phase.md` — cabeçalho atualizado com referência ao ADR
  0008 e ao roadmap Clinic OS; trilha AWS 3.41B/3.42/3.43 marcada como
  ⏸️ pausado estrategicamente.

**O que NÃO muda (invariantes em vigor — não tocados):**
- `docs/security-notes.md`: "Escopo clínico proibido" continua válido. Sai
  com ADR de Fase 4.x, não com esta sprint.
- Tenant isolation por `clinica_id`, CPF mascarado, audit append-only, sem
  PII em logs, sem delete físico — todas permanecem.
- Backend/frontend/migrations/schema/API — sem alteração.
- Runbook AWS (`docs/aws-provisioning-runbook-3.41B.md`) — permanece válido,
  só a **execução** está pausada.

**Impacto na trilha AWS:**
- 3.41B (execução real) → **⏸️ pausado estrategicamente** (não cancelado).
- 3.42 (go/no-go), 3.43 (piloto real) → ⏸️ dependentes.
- Gate de retomada: ADR 0009 (Fase 4.1) aceita + reavaliação de
  dimensionamento (RDS storage/backup window, EBS, KMS dedicada para
  campos clínicos cifrados).
- Justificativa: dimensionamento e modelo de cifra podem mudar à luz dos
  dados clínicos; provisionar antes da Fase 4.1 gera retrabalho/custo.

**Riscos registrados (não bloqueantes desta sprint):** LGPD art. 11 (dados
sensíveis de saúde — validação jurídica externa será necessária); acesso
indevido entre membros da mesma clínica (roles granulares + audit de leitura
ficam na Fase 4.1); documentos médicos com força legal (Fase 4.3 limita-se
a documento administrativo gerado); prescrição válida ICP-Brasil (fora do
escopo, mantém critérios do ADR 0001 §7); TISS/TUSS real (fora do v0.1 da
Fase 4.6); medicamentos controlados SNGPC/ANVISA (fora do v0.1 da Fase 4.7);
IA clínica assistiva (fase futura sem número, depois da Fase 4.2 madura);
assinatura digital ICP-Brasil + prescrição válida (fase futura sem número,
depois da Fase 4.3 madura); over-engineering da
arquitetura clínica (Fase 4.1 entrega o mínimo para 4.2); custo AWS antes
de retorno clínico (trilha pausada).

Docs/ADR-only; nenhum recurso AWS criado; nenhum código de produto alterado;
nenhuma migration; nenhuma tabela clínica criada; nenhum secret versionado;
invariantes de segurança intactas.

---

## Sprint 4.1 (arquitetura clínica + roles + audit de leitura + LGPD clínica — ADR/docs-only)

**Objetivo:** entregar a arquitetura conceitual mínima exigida pela ADR 0008
§4–§8 para destravar a Fase 4.2 (prontuário/atendimento v0.1). Sem código,
sem migration, sem schema clínico, sem AWS.

**Direção registrada:** ADR 0009 — princípios invariantes do domínio clínico,
modelo conceitual de roles, separação administrativo vs. clínico, eventos
conceituais de audit de leitura, versionamento clínico, LGPD clínica, threat
model com 10 vetores específicos, gates obrigatórios para 4.2, impacto na
trilha AWS pausada. **Não autoriza código** — cada módulo clínico continua
exigindo ADR própria (0010+).

**Arquivos criados:**
- `docs/adr/0009-clinical-architecture-roles-read-audit.md` — 14 seções:
  contexto; decisão (10 compromissos arquiteturais/documentais);
  princípios invariantes clínicos (10 regras estendendo ADR 0008 §4);
  roles granulares conceituais (6 roles: `dono_clinica`, `gestor_clinica`,
  `profissional_clinico`, `funcionario_administrativo` sucessor de
  `secretaria`, `financeiro`, `admin_sistema`) + política break-glass para
  `admin_sistema`; separação administrativo vs. clínico (modelo conceitual,
  categorias de dado clínico, regras técnicas mínimas); audit de leitura
  clínica (eventos, campos, performance/retenção, transparência ao titular);
  LGPD clínica (9 princípios operacionais — art. 11, minimização, base
  legal, etc.); threat model (10 vetores com mitigação base); gates para
  abrir 4.2 (9 critérios cumulativos com ADR 0001/0008); impacto AWS
  (RDS/EBS/S3/KMS/CloudWatch/região); vocabulário e migração de papéis;
  fora de escopo; por que esta ADR é só conceitual.
- `docs/clinical-architecture-and-permissions.md` — 10 seções:
  visão consolidada dos domínios (administrativo entregue vs. clínico
  planejado); **matriz de permissões conceitual** com 22 linhas por
  domínio × 6 roles (cadastro, agenda, equipe, prontuário, documentos,
  financeiro, relatórios, convênios, estoque, importação, exportação,
  auditoria, configuração); catálogo conceitual de eventos de audit (de
  escrita administrativa atual + audit de leitura clínica futuro com
  `clinical.<entidade>.read|list|export`); estratégia de versionamento
  (notas, documentos, prescrição, atendimento, anexos); checklist LGPD
  por módulo; threat model como checklist por ADR de módulo; **gates
  para 4.2** como checklist; convenções de nomenclatura sugeridas
  (prefixo `clinical_`, schema PostgreSQL dedicado, tabela paralela
  `clinical_read_audit`, cifra a nível de coluna com `pgcrypto` + KMS CMK).

**Arquivos atualizados (compactos):**
- `CLAUDE.md` — pointer para ADR 0009 + doc operacional; sprint atual → 4.1;
  fases Clinic OS com 4.1 ✅; "Direção estratégica" referencia ADR 0009;
  "Próximas prioridades" trilha Clinic OS atualizada (4.1 ✅ → 4.2 ADR 0010
  pendente); trilha AWS gate atualizado para "ADR 0010 aceita" + reavaliação
  RDS/EBS/KMS + região `sa-east-1`; "Escopo clínico proibido" referencia
  ADR 0009 §9 (gates); "Vocabulário de produto" referencia roles novas
  conceituadas mas não implementadas.
- `docs/project-state.md` — "Última sprint aprovada" → 4.1; 4.0 promovida
  a "Sprint anterior".
- `docs/sprint-history.md` — esta entrada.
- `docs/product-clinic-os-roadmap.md` — Fase 4.1 marcada ✅; gate de 4.2
  consolidado.
- `docs/roadmap-next-phase.md` — tabela e cabeçalho atualizados com 4.1 ✅
  e gate de retomada AWS apontando para ADR 0010.

**Decisões de design registradas (ADR 0009):**
1. **ADR 0009 é deliberadamente só conceitual** — implementação técnica de
   roles/audit/schema fica para a ADR 0010 (início da Fase 4.2). Evita
   over-engineering antecipado (princípio ADR 0008 §4.11).
2. **`admin_sistema` não acessa dado clínico por padrão** — mantém invariante
   atual; acesso excepcional ("break-glass") exige ADR futura própria com
   justificativa textual + audit reforçado + notificação ao dono + janela
   curta.
3. **Audit de leitura ganha `paciente_id`** — **identificador interno
   pseudonimizado** (UUID), necessário para rastreabilidade, audit de
   leitura e transparência LGPD ao titular sobre quem acessou seu
   prontuário. Tratado como dado pessoal dentro do sistema, com acesso
   restrito por role, jamais exposto em logs de aplicação fora da tabela
   de audit, em URL pública ou em mensagem de erro. Nunca acompanhado de
   nome, CPF, telefone, e-mail ou conteúdo clínico bruto no mesmo
   registro. Detalhe: ADR 0009 §6.2.
4. **Histórico clínico em merge B-safe não se mistura** — quando dado
   clínico existir, ADR 0007 será estendida ou nova ADR decidirá; default
   sugerido = manter histórico do secundário separado com `merged_into_id`,
   nunca misturar.
5. **Cifra a nível de coluna vs. cifra de schema** — decisão fica para
   ADR 0010 considerando dimensionamento RDS/KMS.
6. **Vocabulário do produto inalterado** — `secretaria` continua sendo o
   nome técnico no DB/JWT/audits até migration dedicada (ADR 0010 decide
   quando renomear para `funcionario_administrativo`).

**Impacto na trilha AWS:**
- Trilha continua **⏸️ pausada estrategicamente** (ADR 0008 §6 reforçada).
- Gate de retomada **atualizado**: deixa de ser "ADR 0009 aceita" e passa a
  ser **"ADR 0010 (prontuário v0.1) aceita"** + reavaliação registrada em
  ADR 0009 §10: RDS (volume textual + audit de leitura), EBS/S3 (anexos
  clínicos com signed URL), KMS CMK dedicada se ADR 0010 escolher cifra a
  nível de coluna, região `sa-east-1` preferida por LGPD.

**Riscos registrados (não bloqueantes desta sprint):**
- Risco arquitetural de over-engineering — mitigado por manter 4.1 só
  conceitual.
- Risco de implementação prematura de roles antes da Fase 4.2 abrir —
  vedado pela própria ADR 0009 (§4 e §13).
- LGPD art. 11 ainda exige validação jurídica externa (registrado em
  ADR 0009 §7 e na ADR 0008 §5).
- Riscos do `admin_sistema` break-glass adiados para ADR futura própria.

**O que NÃO muda (invariantes em vigor — não tocados):**
- Backend/frontend/migrations/schema/API — sem alteração.
- `docs/security-notes.md` — invariantes mantidas; "Escopo clínico proibido"
  continua válido, agora referenciado também via ADR 0009 §9 gates.
- Tenant isolation, CPF mascarado, audit append-only, sem PII em logs, sem
  delete físico — permanecem.
- Vocabulário do produto da Sprint 3.24.1 — sem mudança.

ADR/docs-only; nenhum recurso AWS criado; nenhum código de produto alterado;
nenhuma migration; nenhuma tabela clínica criada; nenhum secret versionado;
nenhuma role nova no banco; nenhum audit de leitura técnico; invariantes de
segurança intactas.

---

## Sprint 4.2A (ADR 0010 — Prontuário/Atendimento clínico v0.1, escopo do módulo)

**Objetivo:** entregar o escopo fim-a-fim do primeiro módulo clínico do
Clinic OS (Prontuário/Atendimento v0.1) **em ADR + doc operacional**,
fechando todas as decisões pendentes da ADR 0009 §10 (schema clínico,
implementação de roles, schema do audit de leitura, cifra, política de
visibilidade, política de edição). **Sem migration, sem schema, sem
endpoint, sem AWS.** Autoriza a Sprint 4.2B a implementar **exatamente**
o escopo decidido — sem desvios.

**Arquivos criados:**
- `docs/adr/0010-clinical-encounters-medical-record-v0.md` — 19 seções:
  contexto e gates ADR 0009 consumidos; decisão (12 compromissos);
  escopo v0.1 (atendimento + notas textuais versionadas + timeline +
  retificação/cancelamento + roles); fora-de-escopo extensa (CID, prescrição,
  exames, anexos, ICP-Brasil, telemedicina, IA, TISS, SNGPC, portal do
  paciente, edição/cancel alheio, restore, importação clínica); modelo
  conceitual das 4 tabelas com colunas, FKs (`patient_id`/`attending_user_id`
  com `ON DELETE RESTRICT` para histórico médico-legal), CHECK constraints,
  índices nomeados, unique parcial em roles ativos; permissões fim-a-fim
  (matriz operação × role); audit de escrita (`audit_logs` existente,
  sem migration) + audit de leitura (`clinical_read_audit` paralela, com
  `paciente_id` pseudonimizado conforme ADR 0009 §6.2); versionamento
  (notas append-only, cancelamento one-way, sem delete físico); impacto
  do merge B-safe (paciente mesclado bloqueia criação; sem mistura
  automática de histórico; sem mover encounters no v0.1); 5 endpoints
  clínicos + 2 administrativos conceituais com middleware + audit
  esperado; validações e regras de negócio (cheat-sheet); decisão de
  cifra (a nível de coluna **fora do v0.1** — revisável); vocabulário;
  plano 4.2B sequenciado (12 passos); riscos (10 vetores); fora-de-escopo
  recap; notas finais.
- `docs/clinical-encounters-v0-scope.md` — operacional companheiro com
  resumo executivo, campos do v0.1 consolidados, matriz de permissões
  resumida, catálogo de audit (escrita + leitura) compacto, endpoints
  cheat-sheet, fluxo de versionamento/retificação visual, impacto do
  merge B-safe em tabela, checklist Sprint 4.2B (10 sub-checklists:
  migration, tipos/DAOs, middleware, services, controllers/rotas, logger,
  testes via curl, SQL checks, limpeza, documentação), decisão de cifra
  consciente, itens fora do v0.1 compactos.

**Arquivos atualizados (compactos):**
- `CLAUDE.md` — pointer para ADR 0010 + doc operacional; sprint atual →
  4.2A; fases Clinic OS com 4.2A ✅; trilha Clinic OS atualizada (4.2A ✅
  → 4.2B implementação backend pendente); "Escopo clínico proibido"
  reescrito para deixar explícito o que a ADR 0010 autoriza dentro do
  v0.1 e o que continua proibido sem ADR nova.
- `docs/project-state.md` — "Última sprint aprovada" → 4.2A com resumo
  dos 12 compromissos, endpoints, audit, plano 4.2B e invariantes
  próprias do módulo clínico; 4.1 promovida a "Sprint anterior".
- `docs/sprint-history.md` — esta entrada.
- `docs/product-clinic-os-roadmap.md` — Fase 4.2 marcada como "ADR
  aceita; 4.2B implementação pendente" (subdivisão 4.2A/4.2B).
- `docs/security-notes.md` — pointer mínimo (sem reescrever seção atual
  de "Futura expansão clínica"; ADR 0010 reforça invariantes adicionando
  específicas do módulo).

**Decisões técnicas fechadas nesta ADR (todas pendentes da ADR 0009):**
1. **Schema:** prefixo `clinical_` no schema `public` (sem schema
   PostgreSQL separado por agora). Justificativa: simplicidade de
   migrations/FKs/grants.
2. **Roles clínicas técnicas:** tabela paralela `user_clinical_roles`
   append-only (mantém `users.papel` intocado). Aceitam `dono_clinica`
   direto via `users.papel`; `profissional_clinico` e `gestor_clinica`
   via tabela. `financeiro` documentado mas implementado na 4.4.
3. **Audit de leitura:** tabela paralela `clinical_read_audit` (não
   estende `audit_logs`). Volume + retenção + transparência LGPD
   distintos. **Postura de falha controlada por
   `CLINICAL_READ_AUDIT_STRICT`** (ADR 0010 §8.2.1): **best-effort**
   apenas em local/dev/staging com **dados sintéticos**; **fail-closed
   obrigatório em produção** com dado clínico real — guard de boot em
   `config/env.ts` força `true` quando `NODE_ENV=production`; falha em
   strict mode → 500 `clinical_read_audit_unavailable` + conteúdo
   clínico **nunca** sai no body. Smoke test de fail-closed obrigatório
   na 4.2B.
4. **Cifra a nível de coluna:** NÃO no v0.1. Decisão revisável antes de
   produção real (gates: jurídico + anexos clínicos).
5. **Visibilidade default:** "profissional só vê os próprios" (cláusula
   `WHERE attending_user_id = self` no DAO). Dono/gestor veem com audit;
   NÃO editam alheio (responsabilidade médico-legal).
6. **Edição de prontuário alheio por dono/gestor:** FORA do v0.1.
7. **Cancelamento de encounter alheio:** FORA do v0.1.
8. **Restore de encounter cancelado:** FORA do v0.1.
9. **Status do encounter:** `active` | `canceled` (two-state one-way).
10. **Cancelamento exige `cancel_reason_code` estruturado** + opcional
    `cancel_reason_text` ≤ 200 chars sem PII (nunca em audit).
11. **Retificação preserva autoria** (apenas autor original retifica).
12. **Funcionario/financeiro/admin_sistema** → 403 em todos os endpoints
    clínicos (sem "timeline reduzida" no v0.1).

**Impacto na trilha AWS:**
- Trilha continua **⏸️ pausada estrategicamente** (ADR 0008 §6 + ADR 0009
  §10).
- Gate de retomada da ADR 0009 §10 (ADR 0010 aceita + reavaliação) →
  **ADR 0010 aceita ✅** nesta sprint; reavaliação concreta registrada
  na ADR 0010 §16: RDS class (~75 mil notas/ano para 10 prof × 30 pac/dia
  × 250 dias, `db.t3.micro` provavelmente segura), EBS/S3 sem mudança
  (anexos fora), KMS sem CMK nova, CloudWatch validar redação em
  staging, backup Restic cobre as 4 tabelas, região `sa-east-1`
  preferida. **4.2B pode ser inteiramente local/staging local** —
  retomada da trilha AWS continua sendo evento separado.

**Riscos registrados (não bloqueantes desta sprint):**
- Volume de `clinical_read_audit` (mitigado por índices; particionamento
  futuro).
- Falha de audit de leitura silenciosa — mitigada por
  `CLINICAL_READ_AUDIT_STRICT` (best-effort apenas em dev/staging com
  dados sintéticos; **fail-closed obrigatório em produção** via guard
  de boot quando `NODE_ENV=production`; falha → 500
  `clinical_read_audit_unavailable` sem conteúdo clínico no body).
- Profissional malicioso (detecção retrospectiva via audit).
- Mistura de histórico em merge B-safe (vedada por design).
- Cifra ausente em backup furtado (RDS encryption at rest + cifra
  Restic; revisão antes de produção).
- Logger leakar conteúdo (redação na 4.2B + smoke test).
- Faturamento futuro (4.6) querer cruzar valor com diagnóstico (ADR
  0014 deve filtrar campos clínicos no SQL).

**O que NÃO muda (invariantes em vigor — não tocados):**
- Backend/frontend/migrations/schema/API — sem alteração.
- `docs/security-notes.md` invariantes — mantidas; ADR 0010 **adiciona**
  invariantes próprias (sem UPDATE em conteúdo de nota; sem delete
  físico em nenhuma das 4 tabelas; sem mistura de histórico clínico em
  merge B-safe; audit de leitura obrigatório; logger redige clínicos;
  cifra a nível de coluna revisável).
- Tenant isolation, CPF mascarado, audit append-only, sem PII em logs,
  sem delete físico — permanecem.
- Vocabulário do produto da Sprint 3.24.1 — sem mudança.

ADR/docs-only; nenhum recurso AWS criado; nenhum código de produto
alterado; nenhuma migration; nenhuma tabela clínica criada; nenhum
secret versionado; nenhuma role nova no banco; nenhum audit de leitura
técnico; nenhum endpoint clínico implementado; invariantes de segurança
intactas.

---

## Sprint 4.2B-1 (base técnica do Prontuário v0.1 — migration + tipos + env guard)

**Objetivo:** implementar a fundação técnica decidida na ADR 0010 §5 + §8.2.1
sem ainda criar endpoints clínicos. Primeira sprint a tocar **código clínico**
de verdade (migration aditiva + tipos + env guard). Autoriza a Sprint 4.2B-2
(DAOs, middleware, services, controllers, rotas) a consumir o schema e a env
var sem refactor.

**Arquivos criados:**
- `backend/migrations/20260602000000_clinical_encounters_v0.ts` — migration
  única aditiva (batch 13) com as 4 tabelas decididas na ADR 0010 §5:
  - `clinical_encounters` — identidade do atendimento (FKs:
    `clinica_id` CASCADE; `patient_id`, `attending_user_id` RESTRICT
    para histórico médico-legal; `professional_id`, `appointment_id`,
    `canceled_by_user_id` SET NULL). 5 CHECK constraints (status
    allowlist, time order, cancel triplet consistency, reason_code
    allowlist, `cancel_reason_text` length cap ≤ 200). 4 índices
    (3 plain + 1 partial em `appointment_id`).
  - `clinical_encounter_notes` — notas append-only com cadeia de
    retificação. `clinica_id` denormalizado. FKs: `clinica_id`
    CASCADE; `encounter_id`, `author_user_id` RESTRICT;
    `revises_note_id` SET NULL. 5 campos textuais (`chief_complaint`,
    `anamnesis`, `evolution`, `plan`, `internal_note`) com length caps
    via `char_length`. 4 CHECK constraints (has-content, length caps,
    rectification consistency, reason_code allowlist). 3 índices
    (2 plain + 1 partial em `revises_note_id`).
  - `clinical_read_audit` — paralelo a `audit_logs` (Sprint 1.5).
    `criado_em` (português, mesmo padrão), `usuario_id`/`clinica_id`
    com `SET NULL` (preserva evidência). Extras: `papel_at_read`
    (snapshot anti-stale), `paciente_id` uuid pseudonimizado sem FK
    (LGPD-art.18 transparency ao titular). 2 CHECK constraints
    (`acao LIKE 'clinical.%'`, recurso allowlist). 3 índices
    (2 plain + 1 partial em `paciente_id`).
  - `user_clinical_roles` — append-only com `revoked_at`. FKs:
    `user_id`, `clinica_id` CASCADE; `granted_by`/`revoked_by` SET NULL.
    Não toca `users.papel`. 2 CHECK constraints (role allowlist
    `profissional_clinico|gestor_clinica` — `financeiro` reservado
    para 4.4; revocation consistency). 1 unique parcial sobre
    `(user_id, clinica_id, role) WHERE revoked_at IS NULL` (garante
    uma concessão ativa por par, histórico preservado).
  - Total: **13 CHECK constraints, 15 índices não-PK**.
  - Convenção de FK ON DELETE explicada em comentários no topo do arquivo:
    CASCADE para tenant, RESTRICT para histórico médico-legal, SET NULL
    para vínculos opcionais ou para preservar evidência (espelhando
    `audit_logs`).

**Arquivos alterados:**
- `backend/src/types/db.d.ts` — 4 interfaces (`ClinicalEncounterRow`,
  `ClinicalEncounterNoteRow`, `ClinicalReadAuditRow`,
  `UserClinicalRoleRow`) + 4 type aliases
  (`ClinicalEncounterStatus`, `ClinicalEncounterCancelReasonCode`,
  `ClinicalNoteRectificationReasonCode`, `UserClinicalRoleName`) +
  registro em `declare module 'knex/types/tables'`. Comentários
  reforçam pseudonimização de `paciente_id`, obrigação de redact
  `internal_note` para não-autor, append-only.
- `backend/src/config/env.ts` — nova env var `CLINICAL_READ_AUDIT_STRICT`
  com transform (aceita `true`/`1`/`false`/`0`/unset) e guard de
  produção no `superRefine`: quando `NODE_ENV=production`, o raw
  `process.env.CLINICAL_READ_AUDIT_STRICT` deve ser exatamente
  `'true'`/`'1'` (após `trim().toLowerCase()`); qualquer outro valor
  (incluindo ausência) faz o boot **falhar** com mensagem citando
  ADR 0010 §8.2.1. Mesmo padrão da Sprint 3.39 (`MFA_ENCRYPTION_KEY`,
  `FRONTEND_ORIGIN`).
- `.env.example` — bloco novo "Clinical read audit posture (Sprint
  4.2B-1, ADR 0010 §8.2.1)" explicando postura por ambiente com
  exemplos de valores; linha de exemplo comentada
  (`# CLINICAL_READ_AUDIT_STRICT=false`). Sem secret novo.
- `CLAUDE.md` — sprint atual → 4.2B-1; lista de migrations atualizada
  com `20260602_clinical_encounters_v0`; trilha Clinic OS reorganizada
  (4.2B-1 ✅ → 4.2B-2 pendente).
- `docs/project-state.md` — "Última sprint aprovada" → 4.2B-1 com
  detalhe das FKs/constraints/índices, env guard, verificações
  executadas, riscos/ressalvas. 4.2A promovida a "Sprint anterior".
- `docs/sprint-history.md` — esta entrada.

**Decisões técnicas (todas as 6 pendentes da ADR 0010 implementadas):**
1. **Prefixo `clinical_` em `public`** (sem schema PostgreSQL
   separado). Justificativa: simplicidade de migrations/FKs/grants —
   reaproveita o padrão atual sem custo extra.
2. **FK `ON DELETE RESTRICT`** em `patient_id`, `attending_user_id`,
   `encounter_id`, `author_user_id` — defesa em profundidade médico-legal
   (delete físico já é proibido por invariante; RESTRICT bloqueia no
   schema também).
3. **`clinical_read_audit` espelha `audit_logs`** (Sprint 1.5):
   `criado_em` (português), FKs com `SET NULL` para preservar evidência.
   Decisão coerente com o propósito de "evidência forense" da tabela.
4. **`paciente_id` sem FK** — espelha `audit_logs.recurso_id` (também
   sem FK). Pacientes não são deletados fisicamente; FK adicionaria
   custo de manutenção sem ganho prático.
5. **`user_clinical_roles` em vez de `users.papel` extra** —
   append-only com revogação, multi-role natural, unique parcial em
   roles ativas. Backward-compatible total com auth/JWT/audit
   existentes.
6. **`CLINICAL_READ_AUDIT_STRICT` lido bruto no `superRefine`** —
   o transform de `z.string().optional()` já colapsa "false" e ausente
   para o mesmo boolean, mas o guard de produção precisa distinguir
   "explicitamente true" de "missing/false" para falhar fast. Solução:
   ler `process.env.CLINICAL_READ_AUDIT_STRICT` direto dentro do
   `superRefine` e comparar contra `'true'`/`'1'` após
   `trim().toLowerCase()`. Mesmo padrão usado em outros guards de prod
   no projeto.

**Verificação executada:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:latest` ✅ (batch 13)
- `pnpm --filter backend migrate:rollback` + reaplicar — limpo
- SQL checks: 4 tabelas com COUNT=0; `pg_constraint` lista 13 CHECK
  constraints com nomes esperados; `pg_indexes` lista 15 índices
  não-PK com nomes esperados (incluindo unique parcial); invariantes
  locais de patients/import_files/import_sessions/users/audit_logs
  preservadas pela migration aditiva.
- 4 testes negativos de CHECK: status fora do allowlist, role fora do
  allowlist, nota sem nenhum campo, `acao` sem prefixo `clinical.` —
  todos REJEITADOS com mensagem correta.
- Smoke test do env guard em 9 cenários (dev/test/prod × variantes da
  env var): **9/9 PASS**.
- `grep -r clinical` em `backend/src/{routes,controllers,services,dao}`:
  só comentários antigos administrativos. **Nenhum endpoint, DAO,
  service ou controller clínico criado** (esperado).

**Impacto na trilha AWS:** trilha continua **⏸️ pausada estrategicamente**.
Esta sprint **não** muda o gate de retomada. O dimensionamento RDS
registrado na ADR 0010 §16 continua válido (4 tabelas adicionadas, ainda
todas vazias). KMS sem mudança. Backup Restic vai cobrir as novas tabelas
automaticamente quando rodar.

**Riscos / ressalvas:**
- `CLINICAL_READ_AUDIT_STRICT` existe mas é **flag inerte** até a 4.2B-2
  implementar `clinicalReadAuditService`. Em prod o boot exige `true`,
  mas hoje nenhum service consome — comportamento real só aparece
  quando endpoints clínicos forem implementados.
- `user_clinical_roles` começa vazia: 4.2B-2 precisa de endpoint
  owner-only (ADR 0010 §11.7) ou seed dev-only para conceder antes de
  testar endpoints clínicos.
- Counts locais (patients=26, import_files=25, import_sessions=8)
  divergem dos "invariantes locais (sanity-check)" do `CLAUDE.md`
  (6, 24, 7) — estado acumulado de testes anteriores, não regressão
  da migration. Atualizar quando convier; fora do escopo desta sprint.
- 4.2B-2 deve preservar a invariante "logger redige campos clínicos"
  (ADR 0010 §8.4 + §15 passo 7) — a migration cria as colunas mas o
  service da 4.2B-2 é quem nunca pode permitir esses campos no log.

**O que NÃO muda (invariantes em vigor — não tocados):**
- `users.papel` continua aceitando apenas
  `dono_clinica|secretaria|admin_sistema`.
- `audit_logs` sem alteração de schema; continua append-only.
- `patients`, `appointments`, `clinic_professionals`, `clinic_join_requests`,
  `users`, `clinics` — sem alteração de schema, dados preservados.
- Vocabulário do produto da Sprint 3.24.1 — sem mudança.
- Tenant isolation por `clinica_id`, CPF mascarado, audit append-only,
  sem PII em logs, sem delete físico, migration aditiva — todas mantidas.

Primeira sprint com código clínico, mas ainda sem qualquer endpoint
clínico exposto. Sem dado clínico inserido. Sem AWS real. Sem secret
versionado. Sem commit automático.

---

## Sprint 4.2B-2 (DAOs clínicos + middleware + services — sem rotas públicas)

**Objetivo:** implementar a camada interna do módulo Prontuário v0.1 — 4 DAOs,
1 middleware de role clínica e 4 services — sobre o schema da Sprint 4.2B-1.
**Nenhuma rota clínica registrada em `app.ts`**; nenhum controller; nenhum
frontend. Autoriza a Sprint 4.2B-3 (controllers + rotas + smoke tests) a
consumir esta camada sem refactor.

**Arquivos criados:**

DAOs (`backend/src/dao/`):
- `userClinicalRoleDao.ts` — append-only. `listActiveRoleNames`,
  `findActiveForUserRole`, `listActiveByClinic` (tenant-scoped),
  `grant` (insert; partial unique index `unique_user_clinical_roles_active_partial`
  rejeita duplicata ativa por (user, clinica, role)), `revoke` (CAS por id +
  clinica_id + `revoked_at IS NULL`; tenant + idempotência). Sem
  `update`/`delete`. Não toca `users.papel`.
- `clinicalReadAuditDao.ts` — append-only espelhando `auditLogDao`
  (Sprint 1.5). Único método `record` com `clip()` para colunas limitadas
  (papel_at_read 40, acao 60, recurso 30, recurso_id 80, request_id 64,
  ip 45, user_agent 255). DB CHECK `acao LIKE 'clinical.%'`. Sem
  `update`/`delete`. Não armazena conteúdo clínico (só identificadores).
- `clinicalEncounterDao.ts` — `create`, `findByIdForClinic`,
  `listForClinic`, `listForPatient`, `cancelOwn` (CAS por id +
  clinica_id + attending_user_id = self + status='active'; defesa
  médico-legal "só o autor cancela"). Toda query tenant-scoped. Defesa
  em profundidade: parâmetro `attending_user_id_self` opcional, sempre
  aplicado quando presente (ADR 0010 §6.1 — defesa no DAO, não no
  controller). Sem `update` clínico (encounter não tem campos textuais)
  e sem delete físico.
- `clinicalEncounterNoteDao.ts` — append-only estrito (ADR 0010 §9.1).
  `create`, `findByIdInEncounter`, `listByEncounter`. Sem `update`/
  `delete`. Toda query tenant-scoped por `clinica_id` denormalizado;
  ordem cronológica `created_at ASC` + tie-break por `id`. `internal_note`
  retornado AS-IS — redaction é decisão do service (ponto único auditável).

Middleware (`backend/src/middlewares/`):
- `requireClinicalRole.ts` — gate clínico. Compõe APÓS `requireAuth`+
  `requireClinic`. Aceita lista de `UserClinicalRoleName`
  (`profissional_clinico`, `gestor_clinica`). Regras:
  - `admin_sistema` → 403 firme (defesa em profundidade — `requireClinic`
    já bloqueia por falta de clínica).
  - `secretaria`/funcionário administrativo → 403 (nunca acessa conteúdo
    clínico no v0.1 — ADR 0010 §7).
  - `dono_clinica` passa **implicitamente** apenas quando `gestor_clinica`
    está na allowlist (operações de leitura). Para escrita
    (`profissional_clinico` only) precisa da concessão em
    `user_clinical_roles` — ADR 0010 §7 linha 1.
  - Demais clinical roles vêm de SELECT em `user_clinical_roles` (1
    indexed query por request gated; mesmo padrão da Sprint 3.25).
  - 403 `forbidden_role` é genérico — nunca enumera papel faltante nem
    confirma se o usuário tem clinical role em outra clínica.
  - Popula `req.clinicalRoles: Set<ClinicalCapability>` com capacidades
    efetivas (inclui `dono_clinica` quando aplicável). Services consomem
    esse Set; não re-derivam de `req.auth.papel`.

Services (`backend/src/services/`):
- `userClinicalRoleService.ts` — `grant` (valida target ativo + mesma
  clínica + role na allowlist; 23505 → 400
  `clinical_role_already_granted`), `revoke` (CAS + audit
  `clinical.role.revoked.success` na transação), `listActive`. Audit em
  `audit_logs` (`recurso='user_clinical_role'`, sem PII, só UUIDs).
- `clinicalReadAuditService.ts` — **controle compensatório principal**
  da ausência de cifra a nível de coluna (ADR 0010 §13). Allowlist de
  acoes (`clinical.encounter.read|list`, `clinical.timeline.list`).
  Modo determinado por `env.CLINICAL_READ_AUDIT_STRICT`:
  - `recordStrict` — falha de DAO propaga 500
    `clinical_read_audit_unavailable`; controller aborta antes de
    qualquer conteúdo clínico sair.
  - `recordBestEffort` — falha é logada com `error` (sem PII, sem
    `paciente_id`, sem conteúdo clínico) e a leitura continua.
  - `recordReadAudit` (default) — usa strict em prod (env guard
    obriga), best-effort em dev/test/staging com dados sintéticos.
    `papel_at_read` é snapshot anti-stale: dono > gestor > profissional.
- `clinicalEncounterService.ts` — três categorias de operação,
  **rigorosamente separadas**:
  - **METADADOS-LIST** (`list`, `listForPatient`): retornam
    `PublicClinicalEncounterListItem[]` — projeção que **NUNCA** carrega
    os 5 campos textuais clínicos (`chief_complaint`/`anamnesis`/
    `evolution`/`plan`/`internal_note`) e **NEM** `cancel_reason_text`.
    Por construção do schema, os 5 campos vivem só em
    `clinical_encounter_notes`; nenhum método do `clinicalEncounterDao`
    faz JOIN com a tabela de notas, então a defesa é de baixo nível
    (impossível devolver conteúdo por engano). `cancel_reason_text`
    é dropado em `toListItem` por defesa em profundidade — lista é
    para grade/tabela, não detalhe. Audit emitido (`clinical.encounter.list`
    com `paciente_id=null` em list-geral; `clinical.timeline.list` com
    `paciente_id` no timeline) é **audit de METADADOS** e **não substitui**
    o audit de conteúdo. Strict mode continua valendo: falha de audit
    aborta antes do SELECT, mesmo sendo metadados.
  - **CONTEÚDO-READ** (`findById`): única operação que faz JOIN
    metadata + notas (5 campos textuais). Audit STRICT
    `clinical.encounter.read` com `paciente_id` emitido **após** a
    metadata ser carregada e **antes** das notas — falha do audit em
    strict mode aborta antes de qualquer conteúdo clínico sair.
    `internal_note` redacted para não-autor via
    `clinicalEncounterNoteService.applyInternalNoteRedaction`.
  - **WRITE** (`create`, `cancel`): `create` valida paciente ativo +
    não-mesclado + mesma clínica, valida appointment/professional
    opcionais, abre transação encounter + initial note, audit
    administrativo em `audit_logs`. `cancel` usa CAS no DAO; 404
    genérico no miss (anti-enumeração de "outro autor" vs. "já
    cancelado"). `cancel_reason_text` cap 200, nunca em audit, nunca
    em log, **omitido das projeções de list/timeline**.
  Audit administrativo (`audit_logs`) best-effort; audit de leitura
  clínica (`clinical_read_audit`) STRICT em prod via
  `clinicalReadAuditService`.
- `clinicalEncounterNoteService.ts` — `create` cobre criação simples
  e retificação (`revises_note_id` + `rectification_reason_code`
  obrigatórios juntos; nota alvo deve ser do mesmo encounter +
  mesmo autor — ADR 0010 §9.1). Pelo menos um campo textual (5
  campos), length caps por campo (`chief_complaint`/`internal_note`
  ≤ 2000, `anamnesis`/`evolution` ≤ 8000, `plan` ≤ 4000). Encounter
  alvo deve estar `active` (sem nota em cancelado) e ser do autor
  (DAO self-filter). Helper público `applyInternalNoteRedaction(row,
  actor)` é o **único ponto auditável** de redação — DAO sempre
  devolve raw; service projeta. `normalizeInitialNotePayload` reusado
  por `clinicalEncounterService.create`.

**Decisões técnicas:**
1. **`requireClinicalRole` aceita `dono_clinica` implícito apenas
   quando `gestor_clinica` está na allowlist.** Para criar/cancelar
   encounter (`profissional_clinico` only), o owner precisa de
   concessão explícita em `user_clinical_roles`. Reproduz fielmente
   ADR 0010 §7 linha 1.
2. **Defesa em profundidade no DAO** (ADR 0010 §6.1): parâmetro
   `attending_user_id_self` no DAO, aplicado SEMPRE quando não-null.
   Se um service esquecer o filtro, o DAO ainda bloqueia.
3. **Audit STRICT antes da query principal** em `list` e
   `listForPatient` — atomicidade simples + invariante "conteúdo
   clínico não sai sem audit persistido" (ADR 0010 §8.2.1 padrão
   alternativo). Em `findById` o audit ocorre após o `findByIdForClinic`
   mas antes de carregar notas/responder, com o mesmo efeito.
4. **`applyInternalNoteRedaction` no service, não no DAO.** DAO sempre
   devolve raw; service é único ponto de decisão. Permite que o autor
   sempre veja o próprio `internal_note` mesmo quando lendo via
   profissional vs. gestor.
5. **Audit administrativo best-effort × audit de leitura clínica
   strict.** São mecanismos diferentes e não devem ser confundidos:
   - `auditLogDao` (Sprint 1.5) — best-effort em writes; `safeAudit`
     loga falha. Cobre `clinical.encounter.created/canceled.success`,
     `clinical.encounter.note.created/rectified.success`,
     `clinical.role.granted/revoked.success`.
   - `clinicalReadAuditDao` — strict em prod; falha de write impede
     resposta com conteúdo clínico. Três `acao` distintas, **não
     intercambiáveis**:
     - `clinical.encounter.read` — CONTENT-READ. Único caminho em que
       conteúdo clínico (5 campos textuais) sai no body. `paciente_id`
       obrigatório.
     - `clinical.encounter.list` — METADATA-LIST cross-patient.
       `paciente_id=null`. Não substitui content-read.
     - `clinical.timeline.list` — METADATA single-patient. `paciente_id`
       presente (LGPD: singling-out). Não substitui content-read.
     Não recebe conteúdo clínico em nenhum caso, só identificadores.
6. **404 genérico em todos os mismatches** (cross-tenant, autor alheio,
   paciente mesclado/arquivado, encounter cancelado para nota). Mantém
   a invariante anti-enumeração da ADR 0007/0010.
7. **Sem `update`/`delete` clínico em lugar algum.** Encounter usa CAS
   para cancelar; notas só têm INSERT (cadeia `revises_note_id`);
   audit é append-only; roles usam `revoked_at`.

**Fora de escopo (intencional):**
- Nenhuma rota clínica registrada em `app.ts` ou `routes/`.
- Nenhum controller clínico.
- Nenhum frontend.
- Nenhuma alteração em `logger.ts` (decisão da 4.2B-3 estender redação
  por path — services aqui já se comprometem a nunca passar conteúdo
  clínico ao logger).
- Nenhum seed de roles clínicas (UI/endpoint owner-only de grant ficam
  para 4.2B-3).
- Nenhum dado clínico inserido em desenvolvimento.
- Nenhum recurso AWS.
- Nenhuma alteração de migration ou schema.

**Verificação executada:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `git diff --check` ✅ (sem whitespace issues)
- `git status --short` lista 9 arquivos novos, todos em
  `backend/src/{dao,middlewares,services}/`:
  ```
  ?? backend/src/dao/clinicalEncounterDao.ts
  ?? backend/src/dao/clinicalEncounterNoteDao.ts
  ?? backend/src/dao/clinicalReadAuditDao.ts
  ?? backend/src/dao/userClinicalRoleDao.ts
  ?? backend/src/middlewares/requireClinicalRole.ts
  ?? backend/src/services/clinicalEncounterNoteService.ts
  ?? backend/src/services/clinicalEncounterService.ts
  ?? backend/src/services/clinicalReadAuditService.ts
  ?? backend/src/services/userClinicalRoleService.ts
  ```
- `grep -rn "clinical\|encounter"` em `backend/src/routes/` e
  `backend/src/app.ts` — só comentários administrativos antigos. Sem
  rota clínica registrada.
- `backend/src/controllers/` — sem `clinicalEncounterController.ts`
  nem similares.

**Impacto na trilha AWS:** sem mudança. Gate de retomada da ADR 0009 §10
inalterado. Tabelas continuam vazias; sem novo recurso provisionado.

**Riscos / ressalvas:**
- **Camada interna sem cobertura por endpoint ainda** — services não
  estão "exercitados" ponta a ponta. Smoke tests reais (matriz
  cross-tenant, "profissional só vê os próprios", redaction de
  `internal_note`, fail-closed do strict mode, etc., conforme ADR 0010
  §15 passo 9) ficam para 4.2B-3 quando houver rota para chamar.
- **`user_clinical_roles` continua vazia.** Antes de qualquer teste
  ponta-a-ponta da 4.2B-3, será necessário endpoint owner-only ou
  seed dev-only para conceder `profissional_clinico` ao usuário de
  teste.
- **Compromisso operacional não automatizado:** services aqui não
  passam conteúdo clínico para o `logger`. A 4.2B-3 deve estender
  `redactPaths` em `config/logger.ts` para incluir os 5 campos
  clínicos + cancel/rectification reason_text (ADR 0010 §8.4).
  Hoje a defesa é discipline-only.
- **`internal_note` redaction só dispara via service.** Um controller
  futuro (4.2B-3) que devolver o row do DAO direto sem usar
  `applyInternalNoteRedaction` vaza `internal_note`. Encoded como
  comentário invariante no DAO + service. Smoke test da 4.2B-3 deve
  cobrir.

**O que NÃO muda (invariantes em vigor — não tocados):**
- `users.papel` continua aceitando apenas `dono_clinica|secretaria|
  admin_sistema`.
- `audit_logs` sem alteração; continua append-only.
- `patients`, `appointments`, `clinic_professionals`, `clinic_join_requests`,
  `users`, `clinics` — sem alteração.
- Vocabulário do produto da Sprint 3.24.1 — sem mudança.
- Tenant isolation por `clinica_id`, CPF mascarado, audit append-only,
  sem PII em logs, sem delete físico — todas mantidas.
- Migrations da 4.2B-1 — sem alteração.

Primeira sprint a entregar lógica clínica de verdade (regras de
visibilidade, audit de leitura, redaction). Ainda sem rota pública,
ainda sem dado clínico inserido, ainda sem AWS real, ainda sem commit
automático.

---

## Sprint 4.2B-3 (controllers + rotas + logger redaction + smoke tests — Prontuário v0.1 exposto)

**Objetivo:** expor os endpoints backend do Prontuário/Atendimento v0.1
sobre a camada interna entregue na 4.2B-2 (DAOs + middleware + services),
com logger redaction antes de aceitar payload clínico, smoke tests fortes
da matriz de roles + cross-tenant + audit + redaction + strict fail-closed,
e sem frontend.

**Arquivos criados:**

Controllers (`backend/src/controllers/`):
- `clinicalEncounterController.ts` — `create`, `list`, `detail`, `cancel`,
  `createNote`, `timeline`. Helper `clinicalActor(req)` exige
  `req.auth + req.auth.clinica_id + req.clinicalRoles` (defesa em
  profundidade — se o middleware stack falhar, o controller falha 401/403
  ao invés de 500). Body parsing trivial; lógica vive no service.
- `userClinicalRoleController.ts` — `listActive`, `grant`, `revoke`.
  Owner-only via route-level `requireRole(CLINIC_ADMIN_ROLES)`; usa
  `ownerActor(req)` que NÃO depende de `req.clinicalRoles`
  (administração de roles é tarefa administrativa, não clínica).

Routes (`backend/src/routes/`):
- `clinicalEncounters.ts` — registra os 6 endpoints clínicos com pipeline
  uniforme `<rate-limiter> + requireAuth + requireClinic +
  requireClinicalRole(...)`. Reads (`patientsRateLimit`); writes
  (`importRateLimit`). Allowlist por endpoint segue ADR 0010 §11:
  - `create/cancel/createNote` → `['profissional_clinico']` (owner needs
    explicit grant — ADR §7 row 1)
  - `list/detail/timeline` → `['profissional_clinico','gestor_clinica']`
    com `dono_clinica` implícito (gestor_clinica na allowlist).
- `clinicalRoles.ts` — registra `GET /clinical/roles`,
  `POST /clinical/roles/grant`, `POST /clinical/roles/revoke`. Gate
  `requireRole(CLINIC_ADMIN_ROLES)` (NÃO `requireClinicalRole` — admin
  task, não clinical content).

**Arquivos alterados:**
- `backend/src/config/logger.ts` — `redactPaths` estendida com 4 camadas
  de cobertura (ajuste obrigatório aplicado antes do commit):
  1. Top-level: 8 campos clínicos.
  2. 1-level wildcards: `*.field` — `body.<f>`, `note.<f>`, etc.
  3. 2-level explícito: `body.<f>`, `req.body.<f>`, `payload.<f>`.
  4. 3-level explícito: `body.initial_note.<f>`, `req.body.initial_note.<f>`,
     `payload.initial_note.<f>` — cobre `POST /clinical/encounters` com
     `initial_note` aninhado. Testado por `/tmp/test-logger-redact-4.2B-3b.js`
     (removido após run): 7/7 PASS, zero vazamentos em todas as formas
     testadas. Comentário do arquivo atualizado para documentar as 4 camadas.
  `patient_id` (admin) NÃO incluído globalmente — quebraria logs
  administrativos legítimos; discipline-only nos clinical services.
- `backend/src/app.ts` — registra `clinicalRolesRouter` e
  `clinicalEncountersRouter`. Comentário inline explica que logger
  redaction precede a montagem dos clinical routers.

**Decisões técnicas:**
1. **Rate limit compartilhado.** Reusa `patientsRateLimit` em GETs e
   `importRateLimit` em writes — ADR 0010 §12 sugere dedicated
   `CLINICAL_WRITE_*`, deixado para sprint futura se volume real exigir.
   Adicionar env vars novas estava fora do escopo desta sprint.
2. **Timeline em `clinicalEncountersRouter`.** Path
   `/patients/:id/clinical-timeline` é sub-resource REST do paciente mas
   sua semântica é clínica (audit, role gate, etc.), então o handler vive
   no router clínico. Mantém o resto do `/patients/*` administrativo.
3. **`dono_clinica` continua implícito apenas em allowlist com
   `gestor_clinica`.** Smoke test 1.4 e 6.2 confirmaram: owner sem
   `profissional_clinico` grant não cria nem cancela.
4. **`patient_id` NÃO redacted globalmente no logger.** Discipline-only
   nos clinical services. Auditoria periódica do log deve verificar.
5. **`plan` é redação broad** mas única no projeto (clinics.plano é PT).
6. **Smoke test exigiu `AUTH_RATE_LIMIT_MAX=200` temporariamente** — env
   restaurada para 20 ao final do run. **Não comitar o bump.**

**Verificação executada — smoke test 76/76 PASS:**
- **Seção 1 — Authorization matrix:** 5× 401 sem token; 4× 403
  secretaria; 1× 403 profA pré-grant; 1× 403 owner sem grant para create;
  1× 200 owner list (gestor implícito); 1× 403 non-owner grant.
- **Seção 2 — Grant/revoke:** 3 grants OK; duplicate → 400
  `clinical_role_already_granted`; cross-tenant → 404; `financeiro` (fora
  do v0.1) → 400.
- **Seção 3 — Create + patient guards:** profA/profB criam encounters;
  patient arquivado/mesclado/random → 404 `patient_not_found`; encounter
  sem initial_note → 201.
- **Seção 4 — Metadata-only:** list/timeline ZERO ocorrências de
  `chief_complaint|anamnesis|evolution|plan|internal_note|cancel_reason_text|notes`;
  profA NÃO vê profB encounter (DAO self-filter); owner/gestor veem
  ambos.
- **Seção 5 — Detail + redaction:** autor vê próprio internal_note;
  owner/gestor lendo alheio veem internal_note; profA→profB 404
  (anti-enumeração); owner lendo encounter de profB vê internal_note
  que profB anotou.
- **Seção 6 — Cancel:** profB cancela alheio → 404; owner sem grant →
  403; profA cancela próprio → 200 + status='canceled'; segundo cancel →
  404 (CAS idempotente).
- **Seção 7 — Notes:** append OK; profB em encounter alheio → 404; nota
  vazia → 400; rectify próprio → 201; profB rectify de profA → 404;
  rectify sem `rectification_reason_code` → 400.
- **Seção 8 — SQL/audit checks:** audit_logs sem texto clínico;
  clinical_read_audit com 9 linhas (clínica A), todas em allowlist;
  `papel_at_read` snapshots `dono_clinica`/`gestor_clinica`/`profissional_clinico`
  presentes; `paciente_id` NULL em `clinical.encounter.list` e NOT NULL
  em `clinical.encounter.read`/`clinical.timeline.list`.
- **Seção 9 — Log grep:** ZERO ocorrências de qualquer texto clínico
  emitido no smoke (`queixa A`, `interno A`, `plano A`, `evo B`, `queixa A
  corrigida`, `profB internal`, `erro de cadastro`); ZERO ocorrências de
  chaves JSON `"chief_complaint":|"anamnesis":|...` (redaction funciona).
- **Seção 10 — Strict fail-closed:** best-effort com `CHECK ... NOT
  VALID` quebrando inserts → 200 + content + log
  `clinical_read_audit_failed` sem `paciente_id` (redacted); strict mode
  via Node child mockando o DAO → `HttpError(500,
  clinical_read_audit_unavailable)`; production boot guard validado na
  4.2B-1 (9/9 PASS).
- **Seção 11 — Revoke:** owner revoga → 200; profA não cria após revoke
  → 403 (middleware re-queries `user_clinical_roles` por request);
  segundo revoke → 404 (idempotente).

**Cleanup pós-smoke:** todas as 4 tabelas clínicas voltaram para count=0;
clinics/users/patients/audit_logs de teste deletados; constraint
`clinical_read_audit_acao_prefix_check` restaurada; invariantes locais
preservados (patients=26, import_files=25, import_sessions=8, users=35).
Backend dev process encerrado.

**Verificação adicional:**
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `git diff --check` rc=0
- Apenas docs alteradas (`CLAUDE.md`, `docs/project-state.md`,
  `docs/sprint-history.md`) + arquivos novos (controllers, routes) +
  alterações pontuais (`logger.ts`, `app.ts`).

**O que NÃO entrou nesta sprint (intencional):**
- Nenhum frontend (sprint própria de UI clínica futura).
- Nenhum endpoint de transparência LGPD-art.18 ("quem leu meu prontuário"
  — opcional, fica para 4.2B-4 ou Fase 4.5).
- Nenhuma env var nova (rate limiter dedicado `CLINICAL_WRITE_*`
  postponed; reusa `importRateLimit`).
- Nenhuma migration nova; schema clínico intocado.
- Nenhum recurso AWS.
- Nenhuma alteração nas migrations existentes da 4.2B-1.
- Nenhum dado clínico real persistido (smoke usa fixtures sintéticos
  limpos no final).

**Riscos / ressalvas:**
- **Rate limit compartilhado com pipeline de import.** 120 req/15min em
  writes. Volume real pode exigir `CLINICAL_WRITE_*` dedicado.
- **`patient_id` em logs administrativos NÃO globalmente redacted.**
  Defesa para campo clínico (`paciente_id`) é redact + discipline; para
  campo administrativo é discipline-only. Auditoria periódica do log
  deve verificar nenhum clinical service passa `patient_id` ao logger.
- **`plan` redação broad pode ocultar logs administrativos legítimos com
  esse nome.** Atualmente não há colisão; documentado no `logger.ts`.
- **AUTH_RATE_LIMIT_MAX=200 temporário para smoke.** Restaurado para 20
  no final. **Não comitar `.env` com o bump.**
- **`applyInternalNoteRedaction` é ponto único auditável.** Smoke 5.4
  e 5.6 provaram que owner/gestor veem internal_note alheio (esperado);
  smoke 5.3/5.8 provaram que profA não consegue nem chegar ao encounter
  do profB (404 generic antes da redaction). Não existe path testável
  em que outro profissional ativo (não-author/não-owner/não-gestor)
  receba o encounter do colega — a defesa anterior (DAO self-filter)
  bloqueia antes. O caminho da redaction é exercitado nos testes onde
  o autor recebe seu próprio internal_note (positivo).
- **Strict mode em prod ainda não validado em ambiente real** — em prod,
  o env guard da 4.2B-1 garante boot fail-closed; o smoke test 10.5
  prova o comportamento do service via mock. Smoke em produção é
  obrigatório quando AWS provisionar e dados sintéticos estiverem
  carregados.

**O que NÃO muda (invariantes preservadas):**
- Tenant isolation por `clinica_id` em todas as queries.
- `audit_logs` continua append-only sem PII em conteúdo.
- Nenhum delete físico nas 4 tabelas clínicas.
- `users.papel` retrocompatível (clinical roles em `user_clinical_roles`).
- Logger redact = top-level + 1-level wildcard (sem `**` recursivo
  porque fast-redact não suporta).
- `requireClinic` continua fazendo DB check (Sprint 3.25).
- Anti-enumeração: 404 genérico em todos os mismatches (cross-tenant,
  outro profissional, encounter cancelado).

Primeira sprint a expor endpoints clínicos reais. Ainda sem frontend,
ainda sem dado clínico real, ainda sem AWS, ainda sem commit automático.

---

## Sprint 4.2C (frontend do Prontuário v0.1)

**Objetivo:** Criar a UI inicial do Prontuário v0.1 consumindo os endpoints
existentes da Sprint 4.2B-3. Sem alterações de backend, sem migrations, sem
env vars novas, sem AWS.

**Arquivos criados:**
- `frontend/src/components/ClinicalPatientPane.tsx` — drawer lateral
  (right-side pane via `<dialog>`) com estado de navegação
  `timeline | detail | new-encounter | new-note`. Sub-componentes:
  `TimelineView` (metadata-only, sem campos textuais), `ClinicalEncounterDetail`
  (CONTENT-READ; form de cancelamento inline sem usar `ConfirmDialog` com
  children — evita bug de props), `NoteCard` (`internal_note null` → oculto),
  `ClinicalEncounterForm` (encounter + nota inicial), `ClinicalNoteForm`
  (adicionar / retificar nota, mínimo 1 campo). TanStack Query com
  `staleTime: 0` em dados clínicos; invalidação pós-mutation correta.
  Audit notice permanente. Sem `console.log` de dados clínicos.
- `frontend/src/components/ClinicalPatientPane.module.css` — estilos
  completos para o pane, cards, forms, badges, `.cancelSection`,
  `.cancelWarning`, `.rolesPanel` e subestilos compartilhados com
  `ClinicalRolesPanel`.
- `frontend/src/components/ClinicalRolesPanel.tsx` — painel owner-only
  na aba Equipe. Carrega grants + members em paralelo; exibe nome do
  membro resolvido via memberMap; form de concessão + revogação; `null`
  para não-owners.

**Arquivos alterados:**
- `frontend/src/services/api.ts` — tipos clínicos (`ClinicalEncounterStatus`,
  `ClinicalRoleName`, `ClinicalCancelReasonCode`, `ClinicalNoteRectifyCode`,
  `PublicClinicalEncounterListItem`, `PublicClinicalEncounter`,
  `PublicClinicalNote`, `PublicClinicalRoleGrant`,
  `CreateClinicalEncounterPayload`, `CancelClinicalEncounterPayload`,
  `AddClinicalNotePayload`) + funções API (`listClinicalTimeline`,
  `getClinicalEncounterDetail`, `createClinicalEncounter`,
  `cancelClinicalEncounter`, `addClinicalNote`, `listClinicalRoleGrants`,
  `grantClinicalRole`, `revokeClinicalRole`).
- `frontend/src/components/PatientsList.tsx` — botão "Prontuário"
  (`clinicalStyles.prontuarioBtn`) em cada card não-arquivado; estado
  `clinicalPatient`; monta `<ClinicalPatientPane>`. Ação disponível a
  todos — backend decide.
- `frontend/src/views/Dashboard.tsx` — `<ClinicalRolesPanel />` no bloco
  `tab === 'equipe' && isOwner`.

**Decisões técnicas:**
1. **Form de cancelamento inline (não ConfirmDialog com children):**
   `ConfirmDialog` não aceita `children` no seu `props`. O flow de
   cancelamento usa um `div.cancelSection` inline no detail view —
   mais simples e sem dependência de extensão do dialog genérico.
2. **`internal_note null` → oculto (sem placeholder):** exibir
   "(não disponível)" seria misleading — null pode significar "não
   escrito" ou "redacted". ADR 0010 e as instruções da sprint são
   explícitas: tratar null como campo ausente.
3. **`ClinicalRolesPanel` compartilha CSS com `ClinicalPatientPane`:**
   ambas são componentes clínicos com visual consistente; manter um
   único módulo CSS reduz duplicação.
4. **Botão "Prontuário" disponível para todos (sem guard por papel):**
   backend retorna 403 se o usuário não tiver acesso clínico; a UI
   mostra mensagem genérica. Evita lógica de permissão duplicada no
   frontend.

**Verificação:**
- `pnpm --filter frontend typecheck` ✅ (0 erros)
- `pnpm --filter frontend build` ✅ (warning de chunk pré-existente)
- `git diff --check` rc=0

**O que NÃO entrou (intencional):**
- Nenhuma alteração de backend nem migration.
- Nenhuma env var nova.
- Nenhuma tela de auditoria LGPD-art.18 (fica para 4.2B-4 ou Fase 4.5).
- Nenhum campo clínico fora dos 5 da ADR 0010.
- Nenhum dado clínico real persistido.
- Nenhuma feature de busca/filtro no prontuário (paginação futura).
- Nenhum AWS.

**Próxima sprint natural:** 4.2B-4 (endpoint owner-only de auditoria de
leitura clínica, LGPD-art.18) ou pular direto para 4.3 (documentos
médicos/receitas v0.1), dependendo da prioridade jurídica.

---

## Sprint 4.2D (hardening/QA clínico final — Prontuário v0.1)

**Objetivo:** QA de segurança, logs, audit e limpeza de dados sintéticos antes
de avançar para Fase 4.3 (documentos médicos/receitas). Sprint zero-code — somente
análise estática, inspeção de DB e docs.

**Arquivos alterados:**
- `docs/project-state.md` — Sprint 4.2D adicionada; 4.2C movida para "Sprint anterior".
- `docs/sprint-history.md` — esta seção.
- `docs/testing-checklist.md` — seção "11. Prontuário clínico v0.1" adicionada.
- `CLAUDE.md` — estado atualizado para 4.2D; Fases Clinic OS e Próximas prioridades atualizadas.

**Validações (análise estática + inspeção de DB):**

### Logger redaction
- `backend/src/config/logger.ts` — 4 camadas verificadas por grep.
- Nenhum `logger.*` em `clinicalEncounterService`, `clinicalEncounterNoteService`,
  `clinicalEncounterController` loga payload clínico (campos textuais ou
  `cancel_reason_text`/`rectification_reason_text`). Apenas `err`, `acao`,
  `audit_write_failed` são logados nos `safeAudit` best-effort.
- `clinicalReadAuditService`: no failure path, loga `err`, `acao`,
  `clinical_read_audit_failed` — nunca `paciente_id` nem conteúdo clínico.

### Clinical read audit
- 3 `acao` permitidos: `clinical.encounter.read` (CONTENT-READ, `paciente_id` obrigatório),
  `clinical.encounter.list` (METADATA-LIST, `paciente_id=null`),
  `clinical.timeline.list` (TIMELINE-METADATA, `paciente_id` presente).
- Strict mode (`CLINICAL_READ_AUDIT_STRICT=true`): falha de persist → 500
  `clinical_read_audit_unavailable` → `listByEncounter` nunca chamado → conteúdo
  clínico nunca serializado.
- `audit_logs` (administrativo): recebe `acao`, `recurso`, `recurso_id`, IDs —
  nunca campos textuais clínicos.

### Permissões (análise estática)
| Papel / grant | create/cancel/notes | list/detail/timeline |
|---|---|---|
| `profissional_clinico` | ✅ | ✅ (só próprios) |
| `gestor_clinica` | ❌ 403 | ✅ (toda a clínica) |
| `dono_clinica` sem grant | ❌ 403 | ✅ (implicit gestor) |
| `dono_clinica` + grant `profissional_clinico` | ✅ | ✅ |
| `secretaria` | ❌ 403 | ❌ 403 |
| `admin_sistema` | ❌ 403 | ❌ 403 |

- profA não vê encounters de profB: DAO `attending_user_id_self` enforces; miss → 404 genérico.
- `internal_note`: `applyInternalNoteRedaction` — autor ou dono/gestor veem; outros → null.
- Frontend renderiza `internal_note !== null` (oculto quando null, sem placeholder).

### Frontend
- Sem `console.log` com payload clínico (grep confirmado em todos os arquivos clínicos).
- `localStorage` somente para JWT em `authStorage.ts` (padrão MVP conhecido).
- Sem `dangerouslySetInnerHTML` em componentes clínicos.
- Sem dado clínico em URL/query string.
- `staleTime: 0` em todas as queries clínicas (`clinicalTimeline`, `clinicalEncounterDetail`).
- 403/401 → mensagem genérica `clinicalErrorMessage` — sem revelar existência de dados.

### Limpeza de dados sintéticos (dev DB)
- **Deletados:** 2 `clinical_encounters` + 3 `clinical_encounter_notes` criados durante
  QA da Sprint 4.2C (dados sintéticos, dev DB, via SQL direto — autorizado).
- **Preservados:** 14 `clinical_read_audit` rows (só metadados de auditoria, sem conteúdo
  clínico — manter é a prática correta mesmo em dev). 1 `user_clinical_roles` grant
  (permissão funcional do dono da clínica).

**Verificação:**
- `pnpm --filter frontend typecheck` ✅ (0 erros)
- `pnpm --filter frontend build` ✅ (warning de chunk pré-existente)
- `pnpm --filter backend typecheck` ✅ (0 erros)
- `pnpm --filter backend build` ✅
- `git diff --check` rc=0
- `git status --short` limpo (zero arquivos de código alterados — docs somente)

**O que NÃO entrou (intencional):**
- Nenhuma migration nova.
- Nenhuma env var nova.
- Nenhum endpoint novo (4.2B-4 LGPD-art.18 adiado).
- Nenhum dado clínico real criado.
- Sem AWS.

**Próxima sprint natural após 4.2D:** 4.2E (endpoint owner-only auditoria LGPD-art.18) ou
4.3 (documentos médicos/receitas v0.1, exige ADR própria).

---

## Sprint 4.2E (endpoint LGPD-art.18 de auditoria de leitura clínica)

**Contexto:** A Sprint 4.2D confirmou que a tabela `clinical_read_audit` captura
corretamente quem acessou o prontuário, quando e para qual paciente. A Sprint 4.2E
expõe esses metadados ao dono da clínica via endpoint owner-only, fechando o ciclo
de transparência LGPD-art.18 para o módulo Prontuário v0.1. Sem migrations, sem
env vars novas, sem dado clínico real.

### Arquivos criados/modificados

**Backend:**
- `backend/src/dao/clinicalReadAuditDao.ts` — adicionado `list()`: consulta
  `clinical_read_audit as cra` tenant-scoped (`cra.clinica_id = clinica_id`); LEFT JOIN
  `patients as p` para `paciente_nome` + LEFT JOIN `users as u` para `usuario_nome`/
  `usuario_email`; filtros opcionais: `patient_id` (UUID), `user_id` (UUID), `acao`
  (allowlist), `date_from`/`date_to` (Date); `ORDER BY cra.criado_em DESC`; `LIMIT`/`OFFSET`.
  Shape público `ClinicalReadAuditListRow` exclui `ip` e `user_agent` por design
  (forense — não necessários para transparência básica). Comentário explica por que o
  LEFT JOIN em `patients` não adiciona `p.clinica_id` (defense-in-depth já está na
  origem dos dados; adicioná-lo silenciaria pacientes arquivados).
- `backend/src/services/clinicalReadAuditListService.ts` — parse e validação de todos
  os filtros: UUID regex `/^[0-9a-f]{8}-…$/i`; `ALLOWED_ACAO_FILTERS` Set de 3 valores;
  `parseDateFilter` com `Number.isNaN`; invariante `date_to > date_from` (não `>=`);
  `limit∈[1,100]` (default 50); `offset∈[0,10000]` (default 0). Erro 400 com código
  `clinical_read_audit_filter_invalid`. Best-effort audit admin `clinical_read_audit.list.success`
  (falha silenciada para não bloquear a resposta). `toPublic()` garante que nunca vazam
  campos além dos 12 definidos em `PublicClinicalReadAuditEntry`.
- `backend/src/controllers/clinicalReadAuditController.ts` — thin controller; `ownerActor()`
  extrai `clinica_id`/`usuario_id` do JWT; repassa raw query ao service.
- `backend/src/routes/clinicalReadAudit.ts` — `GET /clinical/read-audit`; pipeline:
  `patientsRateLimit → requireAuth → requireClinic → requireRole(CLINIC_ADMIN_ROLES)`.
  Comentário inline justifica por que gestor/profissional/secretaria não têm acesso
  (só dono é responsável LGPD pela transparência ao titular dos dados).
- `backend/src/app.ts` — `import { clinicalReadAuditRouter }` + `app.use(clinicalReadAuditRouter)`.

**Frontend:**
- `frontend/src/services/api.ts` — `ClinicalReadAuditFilters` interface; `ClinicalReadAuditEntry`
  interface (12 campos; sem `ip`/`user_agent`/campos clínicos); `api.listClinicalReadAudit()`.
- `frontend/src/components/ClinicalReadAuditPanel.tsx` — painel owner-only via
  `user?.papel === 'dono_clinica'`; filtros: dropdown de `acao` + date inputs `date_from`/
  `date_to` com botão "Buscar" (aplicação explícita = sem refetch por keystroke); reset.
  Lista entradas com: tipo de ação (label pt-BR), nome do paciente ou "listagem geral",
  papel do accessor (label pt-BR), nome+e-mail do accessor, data formatada `pt-BR`.
  `staleTime: 30_000` (audit metadata é imutável; 0 seria seguro mas desnecessário).
  Aviso explícito "apenas metadados de acesso — nunca conteúdo do prontuário".
  Sem IP, sem user_agent, sem campo clínico. `enabled: isOwner && !!token`.
- `frontend/src/components/ClinicalReadAuditPanel.module.css` — estilos do painel.
- `frontend/src/views/Dashboard.tsx` — `import ClinicalReadAuditPanel`; renderiza
  `{isOwner && <ClinicalReadAuditPanel />}` na aba `seguranca`.

### Segurança / invariantes mantidos

- **Tenant:** `cra.clinica_id = clinica_id` é a primeira cláusula WHERE em `list()`.
- **Conteúdo clínico:** tabela `clinical_read_audit` nunca armazenou campos clínicos
  por design (ADR 0010 §8). `toPublic()` adiciona uma camada extra de segurança
  mapeando explicitamente apenas os 12 campos seguros.
- **ip/user_agent:** presentes na tabela para forense; excluídos do shape público
  e da resposta HTTP (não necessários para transparência LGPD básica).
- **Autorização:** `requireRole(CLINIC_ADMIN_ROLES)` → só `dono_clinica`; sem exception.
- **Validação de filtros:** erros com código específico `clinical_read_audit_filter_invalid`;
  mensagem segura (sem echo de input); não revelam estado interno.

### Smoke tests executados — 10/10 PASS

Testados com **usuários smoke persistentes** `*@clinicbridge.local` criados nesta sprint
(ver adendo abaixo). Não mais descartáveis por sprint.

| # | Usuário / Input | Resultado |
|---|-----------------|-----------|
| 1 | sem token | 401 `unauthorized` ✅ |
| 2 | `smoke.owner` (dono_clinica) | 200 `{ audits: [] }` ✅ |
| 3 | 9 campos proibidos ausentes (7 clínicos + `ip` + `user_agent`) | OK ✅ |
| 4 | `smoke.secretaria` (secretaria, mesmo tenant) | 403 `forbidden_role` ✅ |
| 5 | `smoke.profissional` (secretaria + grant `profissional_clinico`) | 403 `forbidden_role` ✅ |
| 6 | `smoke.gestor` (secretaria + grant `gestor_clinica`) | 403 `forbidden_role` ✅ |
| 7 | `smoke.admin` (`admin_sistema`, sem `clinica_id`) | 403 `no_clinic_context` ✅ |
| 8 | `?acao=invalid.acao.value` | 400 `clinical_read_audit_filter_invalid` ✅ |
| 9 | `?patient_id=not-a-uuid` | 400 `clinical_read_audit_filter_invalid` ✅ |
| 10 | `?date_from=nao-e-data` | 400 `clinical_read_audit_filter_invalid` ✅ |

Também testado: `date_to < date_from` → 400 ✅; `?acao=clinical.encounter.read&limit=10` → 200 ✅.

**Nota sobre `smoke.admin`:** retorna `no_clinic_context` (via `requireClinic`) e não
`forbidden_role` (via `requireRole`) porque `admin_sistema` não tem `clinica_id`. A pipeline
`requireAuth → requireClinic → requireRole` bloqueia antes de chegar no role check. Correto.

### Adendo: usuários smoke persistentes (dev local)

Criados nesta sprint para evitar criar/deletar usuários descartáveis a cada sprint.
5 usuários `*@clinicbridge.local` na "Clinica Smoke Dev", senha dev `SmokeDevOnly!23`.
Não versionar em seed de produção. Não deletar entre sprints.

| E-mail | papel | grant clínico |
|--------|-------|---------------|
| `smoke.owner@clinicbridge.local` | `dono_clinica` | — |
| `smoke.secretaria@clinicbridge.local` | `secretaria` | — |
| `smoke.profissional@clinicbridge.local` | `secretaria` | `profissional_clinico` |
| `smoke.gestor@clinicbridge.local` | `secretaria` | `gestor_clinica` |
| `smoke.admin@clinicbridge.local` | `admin_sistema` | — (sem clinica_id) |

Detalhes + IDs + script de recriação: `docs/testing-checklist.md` §"Usuários smoke persistentes".

### Verificação

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (warning de chunk pré-existente)
- `git diff --check` rc=0
- Docker rebuild `clinicbridge-backend` com novo código ✅ (`health` ok após start)

**O que NÃO entrou (intencional):**
- Nenhuma migration nova.
- Nenhuma env var nova.
- Nenhum dado clínico real.
- Sem paginação cursor-based (limit/offset suficiente para MVP).
- Sem export CSV do audit (fora de escopo).
- Sem AWS.

**Próxima sprint natural:** 4.3A (ADR documentos médicos/receitas v0.1 — docs-only).

---

## Sprint 4.3A (docs/ADR-only)

**Data:** 2026-05-26
**Tipo:** ADR + operacional docs-only
**Objetivo:** Fechar as decisões arquiteturais do módulo de Documentos Médicos e Receitas
v0.1 antes de qualquer código. Autoriza Sprint 4.3B (implementação backend).

**Entregáveis:**
- `docs/adr/0011-medical-documents-prescriptions-v0.md` — ADR 0011, Status: Accepted
- `docs/medical-documents-v0-scope.md` — companheiro operacional

**Decisões registradas (11 compromissos):**
1. 5 tipos de documento: `receipt_simple`, `attestation`, `declaration`, `exam_request`, `orientation`.
2. 1 tabela nova: `clinical_documents` (prefixo `clinical_`, schema public — consistente com ADR 0010).
3. Ciclo de vida `draft → finalized → canceled` (sem restore, sem delete físico).
4. Sem delete físico — invariante.
5. PDF gerado on-demand, não armazenado no v0.1.
6. Audit duplo: escrita em `audit_logs` (4 eventos) + leitura em `clinical_read_audit` (3 eventos).
   `clinical_read_audit.recurso='document'` já aceito pelo CHECK existente — sem migration.
7. Logger redaction: estende 4 camadas da ADR 0010 com `body` (document), `cancel_reason_text`
   (document), `metadata_json`.
8. Permissões: `profissional_clinico` cria/edita/finaliza/cancela os próprios; `dono_clinica`/
   `gestor_clinica` leem qualquer com audit; `secretaria`/`funcionario_admin` sem acesso; `admin_sistema`
   bloqueado por `requireClinic`.
9. `encounter_id` opcional (NULL-permitido) — clínica pode emitir documento sem encounter formal.
10. `metadata_json` validado no service, não por DB CHECK — flexibilidade para evolução de templates.
11. Aviso jurídico na UI: sem ICP-Brasil, sem assinatura digital válida; rodapé obrigatório no PDF.

**Schema conceitual `clinical_documents`:**
```
id, clinica_id (CASCADE), patient_id (RESTRICT), encounter_id (SET NULL),
author_user_id (RESTRICT), doc_type CHECK(...), title NOT NULL (≤200), body NULL (≤10000),
metadata_json jsonb NULL, status DEFAULT 'draft' CHECK(...), finalized_at, finalized_by_user_id (SET NULL),
canceled_at, canceled_by_user_id (SET NULL), cancel_reason_code CHECK(...), cancel_reason_text (≤200),
supersedes_document_id (self-ref, SET NULL), created_at, updated_at
+ 4 CHECK constraints de consistência de estado
+ 5 índices: clinica_patient_created, clinica_author_created, clinica_status, encounter (WHERE NOT NULL),
  supersedes (WHERE NOT NULL)
```

**8 endpoints conceituais:**
```
POST   /clinical/documents                     (criar rascunho; profissional_clinico)
GET    /clinical/documents                     (listar; profissional|gestor|dono; audit)
GET    /clinical/documents/:id                 (conteúdo; audit strict)
PATCH  /clinical/documents/:id                 (editar rascunho; profissional; só draft + próprio)
POST   /clinical/documents/:id/finalize        (finalizar; profissional; body obrigatório)
POST   /clinical/documents/:id/cancel          (cancelar; profissional; reason_code obrigatório)
GET    /clinical/documents/:id/pdf             (PDF on-demand; finalizado; audit strict)
GET    /patients/:id/documents                 (documentos do paciente; profissional|gestor|dono; audit)
```

**PDF — estrutura obrigatória:**
- Cabeçalho: clínica (nome, CNPJ, endereço), metadados (profissional, paciente, data), body,
  campos por tipo (metadata_json), campo de assinatura manual.
- **Rodapé obrigatório:** "Este documento foi gerado pelo ClinicBridge e não possui assinatura
  digital ICP-Brasil. A validade jurídica plena pode exigir assinatura física do profissional
  responsável ou assinatura digital com certificado válido (ICP-Brasil/CFM). Não é uma
  prescrição eletrônica legalmente válida."

**LGPD:**
- `body` e `metadata_json` = dados pessoais sensíveis de saúde.
- Audit de leitura obrigatório (herda `CLINICAL_READ_AUDIT_STRICT` da ADR 0010).
- Sem política de retenção automática no v0.1 (pendente ADR 0002 + jurídico externo).
- `secretaria` bloqueada: limitação de finalidade.

**Fora de escopo (ADR 0011 §4 + §19):**
- Prescrição eletrônica ICP-Brasil; qualquer assinatura digital; Memed/Mevo.
- Receituários especiais; medicamentos controlados; SNGPC/ANVISA.
- CID estruturado obrigatório; validação de CRM/CRO.
- Envio automático PDF por WhatsApp/e-mail; QR code de validação pública.
- Armazenamento persistente de PDF (S3); upload de exames/anexos clínicos; IA gerando conteúdo.
- `secretaria`/`admin_sistema` acessando conteúdo de documentos.
- Edição/cancelamento de documento alheio por dono/gestor.

**Próxima sprint natural:** 4.3B (implementação backend: migration + DAOs + services +
`clinicalDocumentPdfService` + endpoints + logger + smoke tests).

---

## Sprint 4.3B (backend — Documentos Médicos v0.1)

**Data:** 2026-05-26
**Tipo:** Backend — migration + DAOs + services + PDF + endpoints
**Objetivo:** Implementar o módulo de Documentos Médicos v0.1 autorizado pela ADR 0011 e Sprint 4.3A.
**Sem frontend (4.3C), sem AWS, sem ICP-Brasil, sem armazenamento de PDF.**

### Arquivos criados/modificados

**Novos:**
- `backend/migrations/20260603000000_clinical_documents_v0.ts` — migration aditiva: tabela
  `clinical_documents` com 4 CHECK constraints de consistência de estado, 5 índices;
  rollback DROP TABLE limpo.
- `backend/src/dao/clinicalDocumentDao.ts` — DAO tenant-scoped; invariantes:
  `clinica_id` em toda query, sem `listAll()`, `author_user_id_self` aplicado defesa em profundidade
  no DAO (não apenas no service), sem DELETE físico, `finalize`/`cancel` como CAS atomico.
- `backend/src/services/clinicalDocumentService.ts` — service layer; 7 métodos públicos:
  `create`, `list`, `listForPatient`, `findById`, `updateDraft`, `finalize`, `cancel`, `getForPdf`;
  strict-mode read audit ANTES de serializar qualquer conteúdo; `document_body_required` ao
  finalizar sem body; projeções separadas METADATA-LIST vs. DETAIL.
- `backend/src/services/clinicalDocumentPdfService.ts` — PDF on-demand via PDFKit;
  `compress: false` para streams legíveis em smoke tests sem dependência de poppler;
  rodapé jurídico obrigatório ADR 0011 §10.2 ("ICP-Brasil") desenhado na primeira
  página explicitamente + via `pageAdded` para páginas adicionais; fonte Helvetica built-in
  (sem lookups externos); sem armazenamento.
- `backend/src/controllers/clinicalDocumentController.ts` — thin controller; 7 handlers.
- `backend/src/routes/clinicalDocuments.ts` — 8 rotas; pipeline
  `rateLimit → requireAuth → requireClinic → requireClinicalRole`; GETs com `patientsRateLimit`,
  writes com `importRateLimit`.

**Modificados:**
- `backend/src/types/db.d.ts` — adicionado `ClinicalDocumentRow`, `ClinicalDocumentType`,
  `ClinicalDocumentStatus`, `ClinicalDocumentCancelReasonCode`.
- `backend/src/config/logger.ts` — estendido com 3 paths novos de redação:
  `body`/`title`/`metadata_json` em top-level + wildcard (`*.body`, `*.title`, `*.metadata_json`) +
  nested (`body.body`, `body.title`, `req.body.body`, `req.body.title`, `payload.body`, `payload.title`,
  `body.metadata_json`, etc.). 10 paths novos totais.
- `backend/src/services/clinicalReadAuditService.ts` — allowlist de `acao` estendida com
  `clinical.document.list`, `clinical.document.read`, `clinical.document.pdf.downloaded`.
- `backend/src/app.ts` — registro do `clinicalDocumentsRouter`.
- `backend/package.json` + `pnpm-lock.yaml` — `pdfkit@0.18.0` + `@types/pdfkit@0.17.6`.

### Segurança / invariantes mantidos

- **Tenant:** `clinica_id` em TODA query DAO; sem `listAll()`; cross-tenant → 404 genérico.
- **"Profissional vê só os próprios":** `author_user_id_self` no DAO; fallback dono/gestor via `null`.
- **Audit de leitura strict-mode:** `clinical.document.read` e `clinical.document.pdf.downloaded`
  emitidos ANTES da serialização — falha de audit aborta com 500 sem vazar conteúdo.
- **Metadata-list nunca expõe `body`/`metadata_json`/`cancel_reason_text`:** projeção `toListItem`
  no service; verificado por smoke (tests 15).
- **PDF só para `status='finalized'`:** service retorna 400 `document_canceled` para cancelados.
- **Rodapé jurídico obrigatório:** texto fixo por ADR 0011 §10.2 em toda página do PDF;
  presença verificada em smoke (testes 9 com extração Node.js de hex streams).
- **Sem armazenamento de PDF:** stream pipeado diretamente para response; sem S3/disco.
- **Logger sem sentinels clínicos:** 10/10 checks PASS em testes estáticos de grep.

### Smoke tests executados — 47/47 PASS

Execução via `/tmp/sprint-4.3B-smoke.sh` (Node.js, sem jq; script temporário não versionado).
PDF footer validado via extração de hex streams — sem poppler.

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | sem token → 401 | ✅ |
| 2 | secretaria → 403 forbidden_role | ✅ |
| 3 | admin_sistema → 403 no_clinic_context | ✅ |
| 4 | profissional cria draft → 201 + status=draft | ✅ |
| 5 | profissional edita draft → 200 + title atualizado | ✅ |
| 6 | finalizar sem body → 400 document_body_required | ✅ |
| 7 | finalizar com body → 200 finalized + finalized_at set | ✅ |
| 8 | editar finalized → 400 document_already_finalized | ✅ |
| 9 | PDF finalized → 200 + magic %PDF + ICP-Brasil no rodapé + prescri[cao] | ✅ |
| 10 | cancel finalized → 200 canceled | ✅ |
| 11 | PDF canceled → 400 document_canceled | ✅ |
| 12 | owner lê documento → 200 + body visível | ✅ |
| 13 | gestor lê documento → 200 | ✅ |
| 14 | secretaria não lê → 403 | ✅ |
| 15–17 | list owner: body/metadata_json/cancel_reason_text ausentes | ✅ |
| 18 | list ≥ 1 doc, 200 | ✅ |
| 19 | GET /patients/:id/documents owner → 200 | ✅ |
| 20 | UUID inexistente → 404 document_not_found | ✅ |
| 21 | patient inexistente → 404 patient_not_found | ✅ |
| 22 | doc_type inválido → 400 clinical_document_invalid | ✅ |
| 23 | body >10000 → 400 | ✅ |
| 24 | cancel_reason_code inválido → 400 clinical_document_cancel_invalid | ✅ |
| 25–26 | list secretaria/admin → 403 | ✅ |

### Audit e cleanup

- `clinical_read_audit` tem registros dos 3 eventos novos: `document.list` (f/t paciente_id),
  `document.read` (t), `document.pdf.downloaded` (t). Sem conteúdo clínico na tabela.
- `audit_logs` tem 4 eventos de escrita: `created`, `updated`, `finalized`, `canceled`. Sem body/title/metadata_json (schema da tabela não tem essas colunas — by design).
- Dados sintéticos da Sprint 4.3B (`clinical_documents`) deletados pós-smoke.
  Audit/read_audit preservados (metadados, sem conteúdo clínico).
- Usuários smoke `*@clinicbridge.local` preservados.

### Verificação

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter backend migrate:status` — 14 applied, 0 pending ✅
- `git diff --check` rc=0
- Docker rebuild `clinicbridge-backend:local` com `compress: false` no PDFKit ✅

### O que NÃO entrou (intencional)

- Frontend (4.3C).
- AWS / provisionamento.
- ICP-Brasil / assinatura digital.
- Armazenamento persistente de PDF.
- Cifra a nível de coluna (revisável post-4.3).
- Env vars novas (reutiliza `CLINICAL_READ_AUDIT_STRICT`).

**Próxima sprint natural:** 4.3C (frontend — aba Documentos em `ClinicalPatientPane`).

## Sprint 4.3C (frontend — Documentos Médicos v0.1)

**Data:** 2026-05-26 · **Status:** entregue.

Aba "Documentos" no drawer clínico; `ClinicalDocumentsPanel` auto-contido com state machine
interna e download de PDF via blob. **Sem migration, sem backend novo, sem AWS, sem ICP-Brasil.**

### Arquivos criados
| Arquivo | Descrição |
|---|---|
| `frontend/src/components/ClinicalDocumentsPanel.tsx` | State machine `list` → `new` \| `detail`; staleTime: 0; PDF blob; aviso jurídico |
| `frontend/src/components/ClinicalDocumentsPanel.module.css` | CSS module com design tokens |

### Arquivos modificados
| Arquivo | O que mudou |
|---|---|
| `frontend/src/services/api.ts` | 8 tipos + 7 funções (Clinical Documents v0.1 section) |
| `frontend/src/components/ClinicalPatientPane.tsx` | import `ClinicalDocumentsPanel`; `activeTab` state; tab bar; render condicional |
| `frontend/src/components/ClinicalPatientPane.module.css` | `.tabBar`, `.tabBtn`, `.tabBtnActive` |
| `backend/src/services/clinicalDocumentPdfService.ts` | Layout v2: caixa metadados bordada, label strip CONTEÚDO, min-height 200pt, assinatura corrigida (nome acima da linha), limite sup. para não colidir com rodapé; rodapé cita VALIDAR Gov.br/ITI + GOV.BR; `compress:false` mantido |

### Invariantes de segurança respeitados
- `staleTime: 0` em todas as queries de conteúdo clínico (list + detail).
- PDF baixado via `Authorization: Bearer` no header; token nunca em URL.
- Sem `dangerouslySetInnerHTML`.
- 401/403 → mensagem genérica; backend decide segurança.
- `body`/`metadata_json` nunca logados, nunca em localStorage/sessionStorage, nunca em URL params.
- Aviso jurídico ADR 0011 §10.2 exibido em criar (sempre) e detalhe (se não cancelado); orienta assinar externamente + validar no VALIDAR Gov.br/ITI.
- Botão "Como assinar e validar →" (SignGuide) em criar e em detalhe de finalizados; passo a passo inline com 6 etapas; cita VALIDAR Gov.br/ITI + GOV.BR; sem integração de assinatura; guia visual com prints fica para sprint futura.
- PDF unsigned note exibido junto ao botão Baixar PDF (pdfNoteRow).

### Verificação
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `git diff --check` rc=0

### Fora de escopo (esta sprint)
- Testes E2E / smoke de navegação frontend.
- Internacionalização.
- QA visual automatizado.
- Backend/migration novo.
- AWS/ICP-Brasil.

**Próxima sprint natural:** 4.3D (QA/hardening final documentos médicos v0.1) antes de avançar para 4.4.

---

## Sprint 4.3D (QA/hardening — Documentos Médicos v0.1)

**Data:** 2026-05-27 · **Status:** entregue.

QA/hardening final do módulo de Documentos Médicos v0.1 (Sprints 4.3A–C). Zero mudanças de
produto. **Sem código novo, sem migration, sem AWS, sem ICP-Brasil.**

### Smoke tests — 50/50 PASS

Executado de dentro do container (`docker exec clinicbridge-backend node /tmp/smoke_4_3d.js`),
chamando `localhost:3001` diretamente para evitar rate limit do Nginx.

**Seção A — Auth & role guards (6/6):**
T01 sem token → 401 ✅ · T02/T02b secretaria list → 403/forbidden_role ✅ · T03 secretaria
create → 403 ✅ · T04/T04b admin_sistema sem clinic → 403/no_clinic_context ✅

**Seção B — CRUD lifecycle (10/10):**
T05/T05b profissional cria draft → 201/draft ✅ · T06/T06b edita draft → 200/body presente ✅ ·
T07/T07b finalize sem body → 400/document_body_required ✅ · T08/T08b finalize com body →
200/finalized ✅ · T09/T09b editar finalized → 400/document_already_finalized ✅

**Seção C — Read permissions (11/11):**
T10/T10b gestor lista → 200/array ✅ · T11/T11b gestor detail → 200/body presente ✅ ·
T12 gestor create → 403 ✅ · T12b gestor finalize → 403 ✅ · T12c gestor cancel → 403 ✅ ·
T13 owner lista → 200 ✅ · T14 owner detail → 200 ✅ · T15 owner create → 403 (sem grant) ✅ ·
T16 secretaria detail → 403 ✅

**Seção D — metadata-only (5/5):**
T17 GET /patients/:id/documents → 200 ✅ · T17b–d list sem body/metadata_json/cancel_reason_text ✅ ·
T17e GET /clinical/documents sem body ✅

**Seção E — Cancel (4/4):**
T18/T18b cancel finalized → 200/canceled (reason_code: 'error') ✅ ·
T19/T19b PDF cancelado → 400/document_canceled ✅

**Seção F — PDF (9/9):**
T20 PDF finalizado → 200 ✅ · T20b começa com %PDF ✅ · T20c gestor PDF → 200 ✅ ·
T20e owner PDF → 200 ✅ · T20f ICP-Brasil no rodapé ✅ · T20g GOV.BR no rodapé ✅ ·
T20h VALIDAR no rodapé ✅ · T20i Gov.br/ITI no rodapé ✅ · T20j compress:false/sem FlateDecode ✅

**Seção G — Validation errors (5/5):**
T21 UUID inexistente → 404 ✅ · T22 doc_type inválido → 400 ✅ · T23 body >10000 → 400 ✅ ·
T24 reason_code inválido → 400 ✅ · T25 patient inexistente → 404 ✅

**Nota técnica PDF:** PDFKit codifica texto como hex tokens em operadores TJ com kerning
intercalado (ex.: `<4943502d4272> 10 <6173696c2e>`). Validação de keywords via extração
de todos tokens `<hex>` e concatenação, depois busca pelo hex da keyword. Confirma que
ICP-Brasil/GOV.BR/VALIDAR/Gov.br/ITI estão no rodapé obrigatório ADR 0011 §10.2.

### Audit/Logs verificados

**clinical_read_audit:** `clinical.document.list` (27), `clinical.document.read` (24),
`clinical.document.pdf.downloaded` (20) — sem conteúdo clínico nas colunas do schema.

**audit_logs:** `clinical.document.created.success` (30), `clinical.document.updated.success`
(17), `clinical.document.finalized.success` (16), `clinical.document.canceled.success` (22) —
schema não tem colunas `body`/`title`/`metadata_json`/`cancel_reason_text`.

**Logger redaction:** `docker logs clinicbridge-backend` — sem `Dipirona`, `ICP-Brasil`, body
clínico nos logs. Campos `body`, `title`, `metadata_json`, `cancel_reason_text` cobertos em
4 níveis (top-level, `*.field`, `body/req.body/payload.<field>`, `payload.initial_note.<field>`).

### Cleanup

Todos os documentos criados durante o smoke foram cancelados (4/4 `canceled`). Pacientes
base, usuários smoke (`*@clinicbridge.local`) e audit_logs/clinical_read_audit preservados.

### Verificação

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend migrate:status` → 14 applied / 0 pending ✅
- `git diff --check` rc=0 ✅
- `git status --short` → clean ✅

### Fora de escopo (esta sprint)

- Frontend: validação visual navegador pendente (dev server não inicializado neste QA).
- ICP-Brasil / assinatura digital.
- Armazenamento persistente de PDF.
- AWS.

**Próxima sprint natural:** 4.4A (ADR Módulo Financeiro v0.1).

---

## Sprint 4.4A — ADR Módulo Financeiro v0.1 (docs/ADR-only)

**Data:** 2026-05-27
**Tipo:** docs/ADR-only (sem código, sem migration, sem env vars, sem AWS)
**Habilitada por:** ADR 0011 + Sprints 4.3B–4.3D (QA hardening validado)

### Objetivo

Fechar todas as decisões de escopo, modelo de dados, permissões e riscos do
Módulo Financeiro v0.1 antes de qualquer código. Autoriza a Sprint 4.4B.

### Componentes entregues

**Criados:**
- `docs/adr/0012-financial-module-v0.md` — ADR completa (16 seções, Status: Accepted):
  - **§1 Contexto:** clínicas usam planilhas/cadernos fora do sistema; falta rastreabilidade.
  - **§2 Compromissos (10):** 1 entidade central; ciclo simples; sem delete físico; tenant isolation;
    financeiro ≠ clínico; permissões por role existente; audit de escrita; logs sem `notes`/valores;
    sem gateway; UX simples.
  - **§3 Objetivo:** controle financeiro operacional simples — não ERP.
  - **§4 Escopo v0.1:** criar/listar/detalhar/editar/pagar/cancelar cobranças; totalizadores;
    histórico por paciente.
  - **§5 Fora de escopo:** NFS-e, boleto, Pix automático, gateway, conciliação, TISS, DRE,
    contas a pagar, cifra de coluna, diagnóstico/CID em `notes`.
  - **§6 Modelo de dados:** tabela `financial_charges` (20 campos, 3 CHECKs de consistência,
    4 índices; `amount_cents` em inteiro; `ON DELETE RESTRICT` em patient_id/created_by_user_id).
  - **§7 Permissões:** dono+secretaria full; gestor view+pay+cancel; profissional sem acesso;
    admin_sistema bloqueado por `requireClinic`; usa `requireRole` administrativo.
  - **§8 Audit:** 4 eventos em `audit_logs` sem PII; falha aborta transação; sem audit de
    leitura dedicado no v0.1.
  - **§9 LGPD:** minimização em `notes`; finalidade operacional; sem delete físico (auditabilidade
    contábil); sem conformidade fiscal declarada.
  - **§10 UX:** aba "Financeiro" no app shell; cards de totalizadores; linguagem acessível
    ("Cobranças", "Em aberto", "Marcar como pago"); aviso anti-clínico em `notes`.
  - **§11 Endpoints:** 8 endpoints conceituais (`POST/GET/PATCH /financial/charges`,
    `POST .../mark-paid`, `POST .../cancel`, `GET /financial/summary`,
    `GET /patients/:id/charges`).
  - **§12 Plano 4.4B:** 11 passos (migration → tipos → DAO → service → controller → rotas →
    logger → smoke → SQL checks → docs → cleanup).
  - **§13 AWS:** trilha continua pausada; `financial_charges` cresce linearmente sem novo dimensionamento.
  - **§14 Riscos (9):** `notes` com diagnóstico; expectativa de gateway; inconsistência de status;
    disputa com paciente; retenção sem política; inferência de situação financeira; cobranças sem
    follow-up; conversão de moeda; cifra ausente.
  - **§15 Oportunidades futuras:** NFS-e, Pix automático, gateway, split de pagamento, DRE (4.5),
    convênios (4.6).
  - **§16 Notas finais:** invariantes adicionadas; sem conformidade fiscal declarada.

- `docs/financial-v0-scope.md` — companheiro operacional:
  - Resumo executivo; ciclo de vida (diagrama); campos com imutabilidade; matriz de permissões;
    endpoints cheat-sheet; catálogo audit; logger redaction; modelo de dados (schema + índices);
    impacto merge B-safe; checklist 4.4B (migration, DAO, service, controller, smoke, SQL, docs);
    checklist 4.4C (frontend); validações cheat-sheet; lista de fora de escopo.

**Modificados:**
- `CLAUDE.md` — sprint atual → 4.4A; ADR 0012 referenciada no cabeçalho; Fases Clinic OS
  atualizadas com `4.3D ✅ 4.4A ✅`; restrições críticas sem alteração.
- `docs/project-state.md` — última sprint → 4.4A.
- `docs/sprint-history.md` — este bloco.
- `docs/security-notes.md` — seção "Módulo Financeiro v0.1 — guardrails" adicionada.
- `docs/roadmap-next-phase.md` — sprint table atualizada com 4.3B/4.3C/4.3D/4.4A ✅ + 4.4B ⏳.

### Verificação

- `git diff --check` rc=0 ✅
- `git status --short` → apenas docs novos/modificados ✅
- Zero código alterado ✅
- Zero migrations ✅
- Zero env vars ✅

### Ajuste pós-entrega — Nível 3: Integração Agenda × Financeiro (2026-05-27)

Realizado antes do início da Sprint 4.4B. Sem código, sem migration.

**Motivação:** nova decisão de produto — financeiro deve se integrar com a agenda mostrando
status financeiro da consulta e alertas operacionais, sem automação agressiva.

**Decisões registradas:**
- Dois estados independentes: status da consulta (scheduling) e status financeiro (financial_charges).
  Nenhum altera o outro automaticamente no v0.1.
- `appointment_id` com validação cross-tenant + cross-patient entra na 4.4B.
- Filtro `?appointment_id` em `GET /financial/charges` entra na 4.4B.
- Badge financeiro na Agenda e alertas sugestivos ficam para Sprint 4.4E.
- Invariante documentada: humano decide a confirmação da consulta; alertas são sugestivos,
  não executivos.

**Arquivos atualizados:**
- `docs/adr/0012-financial-module-v0.md` — 17 seções; nova §16 "Integração Agenda × Financeiro
  Nível 3"; 16 riscos; §10.7/10.8 (badge e alertas); §11.9 (decisão sobre endpoint dedicado);
  §12.1 (roadmap 4.4C/4.4D/4.4E).
- `docs/financial-v0-scope.md` — checklists 4.4D e 4.4E adicionados; validação `appointment_id`
  no cheat-sheet; "fora de escopo" com automações explícitas.
- `CLAUDE.md`, `docs/project-state.md`, `docs/sprint-history.md`, `docs/roadmap-next-phase.md`
  — sequência de sprints atualizada com 4.4D e 4.4E.

### Fora de escopo (esta sprint)

- Qualquer código (migration, backend, frontend).
- Gateway de pagamento; NFS-e; Pix automático.
- AWS.
- ICP-Brasil.

**Próxima sprint natural:** 4.4B (implementação backend do Módulo Financeiro v0.1).

**Próxima sprint natural:** 4.4 (financeiro v0.1 — ADR própria antes de código).

---

## Sprint 4.4B (implementação backend do Módulo Financeiro v0.1)

**Data:** 2026-05-27
**Habilitada por:** ADR 0012 (Sprint 4.4A, aceita) + ajuste Nível 3 de integração Agenda × Financeiro

### Objetivo

Implementar a camada backend completa do Módulo Financeiro v0.1: migration, DAO, service,
controller, rotas. Incluir `appointment_id` opcional com validação cross-tenant + cross-patient
e filtro `?appointment_id` na listagem. Validar com smoke 49/49 PASS.

### Componentes entregues

**Criados:**
- `backend/migrations/20260604000000_financial_charges_v0.ts` — tabela `financial_charges`
  (11 CHECK constraints defensivos; 4 índices + 1 parcial; 6 FKs com ON DELETE variado).
  Migration aplicada como batch 15.
- `backend/src/dao/financialChargeDao.ts` — tenant-scoped sem `listAll()`;
  `create`, `findByIdForClinic`, `listForClinic`, `listForPatient`;
  CAS: `updatePending`, `markPaid`, `cancel`; sem DELETE físico; `summarize()`.
- `backend/src/services/financialChargeService.ts` — `buildFinancialActor` (1 SELECT em
  `user_clinical_roles`); `effectiveFinancialAccess` → `full`/`transact`/`none`;
  7 métodos públicos + `listForPatient`; validação `appointment_id` (cross-tenant generic 400
  anti-enumeration; cross-patient 400); `loadActivePatient` (ativo + não-mesclado); best-effort audit.
- `backend/src/controllers/financialChargeController.ts` — thin; 8 handlers.
- `backend/src/routes/financialCharges.ts` — 8 rotas com pipeline
  `rateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`.

**Modificados:**
- `backend/src/types/db.d.ts` — `FinancialChargeRow`, `FinancialChargeStatus`, `FinancialPaymentMethod`.
- `backend/src/config/logger.ts` — +16 redaction paths para `description`/`notes`/`cancel_reason`/
  `amount_cents` × 4 camadas.
- `backend/src/app.ts` — registra `financialChargesRouter`.

### Endpoints

| Método | Path | Acesso | Descrição |
|--------|------|--------|-----------|
| POST | `/financial/charges` | full | Cria cobrança pending |
| GET | `/financial/charges` | transact+full | Lista com filtros incl. `?appointment_id` |
| GET | `/financial/summary` | transact+full | Totalizadores pending/overdue/paid |
| GET | `/financial/charges/:id` | transact+full | Detalhe com `notes` |
| PATCH | `/financial/charges/:id` | full | Edita campos pending |
| POST | `/financial/charges/:id/mark-paid` | transact+full | pending → paid |
| POST | `/financial/charges/:id/cancel` | transact+full | pending → canceled |
| GET | `/patients/:id/charges` | transact+full | Histórico de cobranças do paciente |

### Smoke tests — 49/49 PASS

Script `/tmp/smoke_4_4b.js` (não versionado). Cobriu:
- T1–T2: sem token/admin → 401/403
- T3–T4: secretaria/owner create → 201
- T5: gestor create → 403 (service block)
- T6: profissional all ops → 403 (service block)
- T7: list omite notes / detail inclui notes / gestor list+detail
- T8: gestor PATCH → 403
- T9: secretaria edita pending → 200
- T10: gestor mark-paid → 200/paid
- T11: edit/pay/cancel paid → 400/charge_not_pending (3 casos)
- T12: cancel pending → 200/canceled + edit canceled → 400
- T13: gestor cancel → 200
- T14: amount_cents=0, =-100, desc_vazia, patient_not_found, method_inválido, method_ausente
- T15: appointment_id válido→201 / filtro somente vinculados / outro patient→400 / ghost→400
- T16: patient charges / patient inexistente→404
- T17: summary shape OK / gestor / bad_date→400
- T18: charge not found / bad uuid

### SQL invariants — 4/4 PASS + 11 CHECKs verificados

- paid sem paid_at = 0
- canceled sem canceled_at = 0
- pending com paid/canceled fields = 0
- appt_id com patient_id divergente = 0
- 11 CHECKs listados em `pg_constraint`

### Audit / logs

- Audit actions registradas: `financial.charge.created.success` (10) · `financial.charge.updated.success` (2)
  · `financial.charge.paid.success` (2) · `financial.charge.canceled.success` (4)
- Sentinels `FIN_DESC_SENTINEL` / `FIN_NOTES_SENTINEL` / `FIN_CANCEL_SENTINEL` → 0 ocorrências nos logs
- Logger redaction: `description`/`notes`/`cancel_reason`/`amount_cents` × 4 camadas

### Cleanup

- 2 cobranças pending canceladas via SQL com `cancel_reason='smoke_cleanup_4.4B'`
- 1 patient temporário `Smoke Temp Patient 4.4B-cross` arquivado
- Usuários smoke e patient base preservados
- Cobranças already-terminal (paid, canceled) mantidas para auditabilidade

### Verificação final

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter frontend typecheck` ✅
- `migrate:status` 15 applied/0 pending ✅
- `git diff --check` rc=0 ✅

### Fora de escopo (esta sprint)

- Frontend financeiro (Sprint 4.4C).
- Badge agenda × financeiro (Sprint 4.4E).
- Gateway de pagamento; NFS-e; Pix automático; cifra de coluna.
- AWS.

**Próxima sprint natural:** 4.4C (frontend financeiro — aba Financeiro; vinculado a agendamento opcional).

---

## Sprint 4.4C — Frontend Financeiro v0.1

**Entregue:** 2026-05-27
**Objetivo:** Criar a interface do módulo financeiro v0.1 para clínicas pequenas/consultórios, usando o backend financeiro já implementado na Sprint 4.4B.

### Componentes entregues

**`frontend/src/services/api.ts`** — 8 tipos + 8 funções adicionados:
- Tipos: `FinancialChargeStatus`, `FinancialPaymentMethod`, `FinancialChargeListItem`, `FinancialChargeDetail`, `FinancialSummary`, `FinancialChargeFilters`, `CreateFinancialChargePayload`, `UpdateFinancialChargePayload`, `MarkFinancialChargePaidPayload`, `CancelFinancialChargePayload`
- Funções: `listFinancialCharges`, `getFinancialSummary`, `getFinancialCharge` (staleTime:0 enforced at call sites), `createFinancialCharge`, `updateFinancialCharge`, `markFinancialChargePaid`, `cancelFinancialCharge`, `listPatientCharges`

**`frontend/src/components/FinancialPanel.tsx`** — panel auto-contido:
- Views: `list` → `new` | `detail` → `edit`
- Summary cards: "Em aberto" / "Vencido" (vermelho se > 0) / "Recebido no período" (verde)
- Filters: status / date_from / date_to; limit=50
- Tabela: Paciente / Descrição / Valor / Vencimento / Status badge (Pendente/Vencido/Pago/Cancelado)
- Botão "Nova cobrança" → formulário com aviso clínico nas observações
- Modal "Marcar como pago": forma de pagamento + data opcional
- Modal "Cancelar cobrança": motivo opcional; irreversível
- Detail view: metadados completos + notes + cancel_reason (ambos só no detalhe, nunca na lista)
- Patient name lookup via `Map<id, nome>` (padrão AdministrativeSchedulePanel)
- `staleTime: 0` em detalhe; `retry: false` em list/summary
- 403 detectado via `useEffect` → `onAccessBlocked()` → tela de acesso negado
- `accessBlocked` state para profissional_clinico que passa pelo papel=secretaria mas é barrado pelo service
- Sem `console.log` de dados financeiros; sem `localStorage/sessionStorage`; sem `dangerouslySetInnerHTML`

**`frontend/src/components/FinancialPanel.module.css`** — CSS module com design tokens

**`frontend/src/views/Dashboard.tsx`** — modificado:
- `TabKey` ampliada com `'financeiro'`
- TABS: `{ key: 'financeiro', label: 'Financeiro', icon: Wallet }` (não ownerOnly)
- `SECTION_INTRO.financeiro`: subtítulo ressalva que não substitui contabilidade/NFS-e
- `{tab === 'financeiro' && <FinancialPanel />}`

### Decisões técnicas

- `appointment_id` omitido do formulário de criação (4.4E — nenhuma API de agendamentos por paciente disponível no frontend ainda)
- `getToken()` do `authStorage` para obter o JWT (mesmo padrão dos outros panels)
- Tab "Financeiro" visível para `papel === 'dono_clinica' || papel === 'secretaria'`; backend é a fonte de verdade
- Aviso de observações clínicas exibido no formulário e no detalhe (ADR 0012 §10)

### Verificação final

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `git diff --check` rc=0 ✅
- Backend smoke: summary 200 + list 200 + no-token 401 ✅

### Fora de escopo (esta sprint)

- QA/hardening financeiro (Sprint 4.4D).
- Badge agenda × financeiro; fluxo consulta → cobrança (Sprint 4.4E).
- Gateway de pagamento; NFS-e; Pix automático.
- AWS.

**Próxima sprint natural:** 4.4D (QA/hardening financeiro — smoke de permissões via browser, validação de logs, cleanup de dados sintéticos).

---

## Sprint 4.4D — QA/Hardening Módulo Financeiro v0.1

**Entregue:** 2026-05-27
**Objetivo:** Validar o Módulo Financeiro v0.1 (backend + frontend) via smoke API 60/60, SQL invariants, audit/log redaction, checks de segurança frontend e cleanup de dados sintéticos. Zero mudanças de código.

### Resultados

**Smoke backend/API — 60/60 PASS**
Cobertura: sem token/admin 401/403; secretaria/owner create 201; gestor create 403;
profissional all ops 403; list (notes omitido)/detail (notes presente); gestor list/detail;
gestor PATCH 403; secretaria edita pending; gestor mark-paid; edit/pay/cancel paid 400;
cancel pending + edit canceled 400; gestor cancel; validações (amount=0/-100, desc_vazia,
patient_not_found, method_invalido/ausente); appointment_id válido/filtro/outro_patient/ghost;
patient charges/inexistente; summary shape/gestor/bad_date; charge not found/bad uuid;
redação de sentinels nos logs (FIN_DESC_SENTINEL, FIN_NOTES_SENTINEL, FIN_CANCEL_SENTINEL).

**SQL invariants — 9/9 PASS · 0 violações**
- paid sem paid_at = 0
- paid sem paid_by_user_id = 0
- paid sem payment_method = 0
- non-paid com paid fields = 0
- canceled sem canceled_at = 0
- canceled sem canceled_by_user_id = 0
- non-canceled com canceled fields = 0
- pending com dados de pagamento/cancelamento = 0
- appointment_id com patient_id divergente = 0

**Audit — 4 ações verificadas em audit_logs**
`financial.charge.created.success` · `financial.charge.updated.success` ·
`financial.charge.paid.success` · `financial.charge.canceled.success`

**Log redaction — PASS**
- `docker logs backend` sem FIN_DESC_SENTINEL, FIN_NOTES_SENTINEL, FIN_CANCEL_SENTINEL
- Campos `description`, `notes`, `cancel_reason`, `amount_cents` não vazam em logs

**Checks de segurança frontend — PASS (code review)**
- Sem `console.log` de dados financeiros em `FinancialPanel.tsx`
- Sem `localStorage` / `sessionStorage` em `FinancialPanel.tsx`
- Sem `dangerouslySetInnerHTML` em `FinancialPanel.tsx`
- `notes` / `cancel_reason` ausentes da listagem (só em `ChargeDetailView`, linhas 1183/1200)
- `FinancialChargeListItem` não tem campo `notes` nem `cancel_reason` no tipo TypeScript
- Token não colocado em URL query string (passa via `Authorization: Bearer` no cabeçalho)
- Filtros de `listFinancialCharges` usam apenas: `patient_id`, `appointment_id`, `status`, `date_from`, `date_to`, `limit`, `offset` — sem `notes`
- `staleTime: 0` em `ChargeDetailView` (ln 1076), `EditChargeDetailLoader` (ln 1261), `MarkPaidModalLoader` (ln 1333)
- `profissional_clinico` bloqueado em duas camadas: `isPapelAllowed` no componente + `effectiveFinancialAccess=none` no service (retorna 403 → `onAccessBlocked()`)

**QA frontend/browser — validado pelo usuário**
- smoke.secretaria: lista, nova cobrança, detalhe, editar, marcar pago, cancelar ✅
- smoke.owner: fluxo básico ✅
- smoke.gestor: listar/ver/marcar pago/cancelar, sem criar/editar ✅
- smoke.profissional: bloqueado com mensagem segura ✅
- Dark theme aprovado; observações administrativas legíveis; sem branco estourado

### Cleanup

- 2 cobranças `pending` de testes anteriores canceladas via SQL direto (`cancel_reason='Cancelado no cleanup da Sprint 4.4D'`)
- Estado final: 19 `canceled` + 6 `paid` + 0 `pending` — todas as cobranças são trilha auditável
- Usuários smoke preservados (`smoke.*@clinicbridge.local`)
- Pacientes, agendamentos, documentos e importações base intactos

### Ressalvas aceitas (Módulo Financeiro v0.1)

- Financeiro v0.1 é **manual** — humano decide sempre; sem automação de cobrança
- Sem gateway de pagamento, Pix automático, NFS-e
- Sem integração visual com Agenda (badge/alertas ficam para Sprint 4.4E)
- Picker de pacientes usa `limit=100`; paginação futura se clínica grande
- Footer e landing/demo ficam para sprint futura de polish/posicionamento

### Checks finais

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:status` — 15 applied / 0 pending ✅
- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (aviso chunk >500kB esperado — SPA monolítica; não é erro)
- `git diff --check` rc=0 ✅
- `git status --short` — limpo ✅

**Próxima sprint natural:** 4.4E (Integração Agenda × Financeiro — badge de cobrança pendente, alertas sugestivos, botão "Criar cobrança" a partir de agendamento; ADR própria necessária).

---

## Sprint 4.4D-conv — Planejamento Convênios e Faturamento Básico (docs-only)

**Entregue:** 2026-05-27
**Objetivo:** Documentar a estratégia de convênios/faturamento básico antes da Sprint 4.4E,
separando claramente o Financeiro v0.1 particular/manual do módulo de convênios futuro (Fase 4.6).
**Zero mudanças de código, schema, migration, backend, frontend, env.**

### Decisões registradas

1. **Financeiro v0.1 é e permanece 100% particular/manual** — cobranças manuais,
   marcar como pago, cancelar, totalizadores. Sem convênio até ADR 0014.

2. **Convênios entram na Fase 4.6**, não na 4.4 nem na 4.5:
   - 4.4E foca exclusivamente em integração Agenda × Financeiro (badge + alertas + botão criar cobrança).
   - 4.5 foca em relatórios gerenciais.
   - 4.6A = ADR 0014 (docs-only), gate para 4.6B.

3. **Entidades conceituais rascunhadas** (não em código; validadas pela ADR 0014):
   - `insurance_providers(clinica_id, name, active)` — operadoras da clínica.
   - `patient_insurance_plans(patient_id, provider_id, plan_name, member_number, valid_until)`.
   - `insurance_authorizations(appointment_id, provider_id, authorization_number, status)`.
   - Extensão futura de `financial_charges`:
     `payer_type`, `insurance_provider_id`, `copay_amount_cents`, `insurance_amount_cents`.

4. **Invariantes consolidadas** (aplicáveis desde o planejamento):
   - Autorização de convênio não confirma consulta automaticamente.
   - Glosa não apaga cobrança — é evento/nota separado.
   - Pagamento do paciente ≠ recebimento do convênio.
   - `notes` nunca contém diagnóstico, CID ou dado clínico.
   - Tenant isolation por `clinica_id` em todas as novas tabelas.
   - Humano decide sempre (sem automação agressiva no v0.1/v0.2).

5. **TISS/TUSS real** fica para depois da Fase 4.6 estabilizada:
   - TISS = padrão ANS XML/SOAP; certificação; homologação por operadora; alto custo.
   - TUSS = base de terminologia atualizada + licenciamento.
   - Integração eletrônica com operadoras, autorização prévia eletrônica, batch de faturamento ANS — todos depois da 4.6.

6. **Migração de dados existentes:** `patients.convenio` + `patients.numero_carteirinha`
   (texto livre atual) podem ser importados para `patient_insurance_plans` na sprint 4.6B.
   Os campos originais ficam na tabela `patients` por compatibilidade até migration decidida.

7. **UX futura planejada:**
   - Paciente: seção "Convênios do paciente".
   - Agendamento: campo "Forma de atendimento" (Particular / Convênio / Misto).
   - Financeiro: totalizadores separados "A receber do paciente" / "A receber do convênio".
   - Alertas sugestivos: Autorização pendente, Carteirinha vencida, Pagamento paciente pendente,
     Recebimento convênio pendente.

### Documentos criados/atualizados

- **CRIADO** `docs/insurance-billing-future-scope.md` — planejamento completo
  (situação atual, entidades futuras, regras, segurança/LGPD, UX, roadmap, fora de escopo).
- **Atualizado** `docs/financial-v0-scope.md` — §13 fora de escopo expandida + §14 convênios + §15 referências.
- **Atualizado** `docs/product-clinic-os-roadmap.md` — Fase 4.6 reescrita com sprints sugeridas e entidades.
- **Atualizado** `docs/roadmap-next-phase.md` — status 4.4B/C/D corrigidos para ✅; 4.4D-conv e 4.6A adicionados.
- **Atualizado** `docs/project-state.md` — sprint atual → 4.4D-conv.
- **Atualizado** `CLAUDE.md` — referência a `insurance-billing-future-scope.md`; trilha Clinic OS atualizada.

### Checks finais

- `git diff --check` rc=0 ✅
- `git status --short` — apenas docs modificados/criados ✅

**Próxima sprint natural:** 4.4E-A (ADR 0013 Integração Agenda × Financeiro — docs/ADR-only, gate para 4.4E-B/C/D).

---

## Sprint 4.4E-A — ADR 0013 Integração Agenda × Financeiro v0.1 (docs/ADR-only)

**Entregue:** 2026-05-27
**Objetivo:** Definir o escopo da integração entre Agenda e Financeiro antes de qualquer código:
badge financeiro, alertas sugestivos, botão "Criar cobrança", estratégia de endpoints,
permissões e segurança. Zero mudanças de código, schema, migration ou env.

### Decisões registradas

1. **Dois eixos independentes** — status da consulta e status financeiro não se alteram
   automaticamente. O sistema sugere, o humano decide.

2. **Badge financeiro** — 5 estados derivados de `financial_charges.appointment_id`:
   - `none` → "Sem cobrança" (cinza/opaco)
   - `pending` → "Pagamento pendente" (amarelo)
   - `overdue` → "Vencido" (vermelho)
   - `paid` → "Pago" (verde)
   - `charge_canceled` → "Cobrança cancelada" (cinza)

3. **Alertas sugestivos A1–A4** — informativos e dismissíveis; nenhum executa ação:
   - A1: cobrança paga + consulta scheduled/confirmed → "Deseja confirmar a consulta?"
   - A2: cobrança vencida + consulta ativa → "Pagamento vencido. Revise antes da consulta."
   - A3: consulta cancelada + cobrança pending → "Consulta cancelada. Revise a cobrança."
   - A4: cobrança cancelada + consulta ativa → "Cobrança cancelada. Revise o agendamento."

4. **Botão "Criar cobrança"** via agenda:
   - `patient_id` pré-selecionado, `appointment_id` pré-preenchido (readonly).
   - Descrição sugerida neutra ("Consulta"), editável pelo usuário.
   - Aviso anti-clínico nas observações (mesmo padrão do FinancialPanel).
   - Após criar: `invalidateQueries(['financial'])` + `invalidateQueries(['appointments'])`.

5. **Estratégia de endpoints MVP** — reutilizar existentes, sem endpoint agregador:
   - `GET /financial/charges?limit=100` → frontend monta `Map<appointment_id, charge>` por dia.
   - `POST /financial/charges` com `appointment_id` — já existe.
   - `GET /financial/charges?appointment_id=<id>` — já existe.
   - Endpoint `GET /appointments/:id/charges` é opcional para 4.4E-B (decidir na sprint).

6. **Permissões:**
   - Badge + alertas: `dono_clinica`, `secretaria`, `gestor_clinica`.
   - Criar cobrança via agenda: `dono_clinica`, `secretaria` (gestor não cria em v0.1).
   - `profissional_clinico`: sem badge, sem alertas, sem acesso financeiro na agenda.

7. **ADR 0013 atribui números futuros:**
   - ADR 0014 = Relatórios gerenciais v0.1 (Fase 4.5)
   - ADR 0015 = Convênios/faturamento básico v0.1 (Fase 4.6)

### Documentos criados/atualizados

- **CRIADO** `docs/adr/0013-agenda-financial-integration-v0.md`
- **CRIADO** `docs/agenda-financial-integration-v0-scope.md`
- **Atualizado** `CLAUDE.md` — sprint atual → 4.4E-A; ADR 0013 referenciada; numeração ADR corrigida
- **Atualizado** `docs/project-state.md` — sprint atual → 4.4E-A
- **Atualizado** `docs/sprint-history.md` — esta seção
- **Atualizado** `docs/roadmap-next-phase.md` — 4.4E expandido em A/B/C/D; ADR 0014/0015 renumerados
- **Atualizado** `docs/financial-v0-scope.md` — §11.6 checklist 4.4E atualizado

### Checks finais

- `git diff --check` rc=0 ✅
- `git status --short` — apenas docs modificados/criados ✅

**Próxima sprint natural:** 4.4E-B (avaliar se endpoint novo é necessário) ou direto para 4.4E-C (frontend badge + alertas + botão criar cobrança).

---

## Sprint 4.4E-B — Avaliação backend Agenda × Financeiro (docs-only)

**Entregue:** 2026-05-27
**Objetivo:** Avaliar se era necessário criar endpoint novo para a integração.
**Decisão:** Reutilizar endpoints existentes. Nenhum backend novo.

- `GET /financial/charges?limit=100` → frontend monta `Map<appointment_id, charge>`.
- `POST /financial/charges` com `appointment_id` — já aceita e valida.
- `GET /financial/charges?appointment_id=<id>` — já filtra corretamente.
- Endpoint `GET /appointments/:id/charges` desnecessário para MVP.

`git diff --check` rc=0. **Zero mudanças de código, schema, migration ou env.**

**Próxima sprint natural:** 4.4E-C (frontend badge + alertas + botão criar cobrança).

---

## Sprint 4.4E-C — Frontend Agenda × Financeiro v0.1

**Entregue:** 2026-05-27
**Objetivo:** Implementar integração visual Agenda × Financeiro no frontend, sem backend novo.

### Decisões registradas

1. **Badge financeiro** — 5 estados renderizados por agendamento na timeline. `badgeState !== 'none'`
   para exibir. `chargeMap: Map<string, FinancialChargeListItem>` construído no cliente a partir de
   `GET /financial/charges?limit=100`. `appointmentFinancialState()` derivando estado.

2. **Alertas A1–A4** — dismiss local em `Set<string>` React. Nenhuma chamada de API no dismiss.
   `getFinancialAlerts()` só usa `status` e `due_date` — nunca `description`, `notes` ou `amount_cents`.

3. **Criar cobrança inline** — form colapsível por card. `patient_id` readonly, `appointment_id` oculto,
   descrição pré-preenchida "Consulta" (editável), aviso anti-clínico obrigatório.
   `createChargeMutation` invalida `['financial']` + `['appointments']` no sucesso.

4. **Ver cobrança** — `onGoToFinanceiro?.()` callback do Dashboard (`setTab('financeiro')`).
   Sem charge ID na URL, sem query params financeiros.

5. **Gestor (papel=secretaria + grant)** — vê badge + alertas + "Ver cobrança"; botão "Criar cobrança"
   visível (papel=secretaria), mas backend retorna 403 `forbidden_role` na tentativa.

6. **Profissional** — `isPapelFinanceiro = false` → query de cobranças não executada;
   `canSeeFinancial = false` → seção financeira inteira oculta.

### Segurança verificada

- Sem `console.log`, `localStorage`, `sessionStorage`, `dangerouslySetInnerHTML`.
- Badge renderiza apenas `FINANCIAL_BADGE_LABELS[badgeState]` — sem `description`, `notes`, `amount_cents`.
- `appointment_id` / `charge.id` nunca expostos visualmente ao usuário.
- `onGoToFinanceiro?.()` não passa IDs em URL.
- 403 financeiro tratado como ausência de acesso (não quebra a agenda).

### Arquivos alterados

- `frontend/src/components/AdministrativeSchedulePanel.tsx` — reescrito com badge, alertas, form, callback.
- `frontend/src/components/AdministrativeSchedulePanel.module.css` — 18 classes novas para seção financeira.
- `frontend/src/views/Dashboard.tsx` — `onGoToFinanceiro={() => setTab('financeiro')}` passado.

### Checks finais

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `git diff --check` rc=0 ✅

**Validação visual pelo usuário:** badge financeiro, alerta A4, criar cobrança, badge→pending, ver cobrança, Financeiro atualizado.

**Próxima sprint natural:** 4.4E-D (QA/hardening).

---

## Sprint 4.4E-D — QA/Hardening Agenda × Financeiro v0.1

**Entregue:** 2026-05-27
**Objetivo:** Validar ponta a ponta a integração — code review segurança, smoke API, SQL/audit, cleanup.

### Parte A — Code review segurança frontend

Revisão de `AdministrativeSchedulePanel.tsx`, `Dashboard.tsx`:

| Check | Resultado |
|-------|-----------|
| Sem `console.log` dados financeiros | ✅ PASS |
| Sem `localStorage/sessionStorage` | ✅ PASS |
| Sem `dangerouslySetInnerHTML` | ✅ PASS |
| Token não vai em URL | ✅ PASS |
| `notes`/`cancel_reason` não aparecem na Agenda | ✅ PASS |
| `description` não aparece no badge | ✅ PASS |
| `amount_cents` não aparece no badge | ✅ PASS |
| `profissional_clinico` sem badge/alertas/botões | ✅ PASS (canSeeFinancial=false) |
| 403 financeiro não quebra Agenda | ✅ PASS (financialBlocked gate) |
| Dismiss local, sem API call | ✅ PASS (Set<string> React) |
| Nenhum alerta executa ação automática | ✅ PASS |
| "Ver cobrança" sem charge_id na URL | ✅ PASS (onGoToFinanceiro callback) |
| `appointment_id` não exibido para usuário | ✅ PASS |

### Parte B — Smoke backend/API (24/24 PASS real)

| Teste | Resultado |
|-------|-----------|
| Login 5 smoke users | ✅ |
| secretaria GET /appointments → 200 | ✅ |
| secretaria GET /financial/charges?limit=100 → 200 | ✅ |
| secretaria POST /financial/charges + appointment_id → 201 | ✅ |
| POST charge.appointment_id correto | ✅ |
| POST charge.status = pending | ✅ |
| GET /financial/charges?appointment_id → charge aparece | ✅ |
| list projection SEM notes/cancel_reason | ✅ |
| gestor GET /appointments → 200 | ✅ |
| gestor GET /financial/charges → 200 | ✅ |
| gestor POST /financial/charges → 403 `forbidden_role` | ✅ |
| profissional GET /appointments → 200 | ✅ |
| profissional GET /financial/charges → 403 `forbidden_role` | ✅ |
| admin GET /appointments → 403/no_clinic_context | ✅ |
| admin GET /financial/charges → 403/no_clinic_context | ✅ |
| owner GET /appointments → 200 | ✅ |
| owner GET /financial/charges → 200 | ✅ |

Nota: Respostas 403 usam `{"error": {"code": "forbidden_role", ...}}` (errorHandler padrão).

### Parte C — QA browser/manual

Sprint 4.4E-C foi validada visualmente pelo usuário antes da 4.4E-D:
- Badge financeiro na Agenda ✅
- Alerta A4 (cobrança cancelada + consulta ativa) ✅
- Criar cobrança inline → badge muda para "Pagamento pendente" ✅
- Botão "Ver cobrança" navega para aba Financeiro ✅
- Totalizadores do Financeiro atualizam ✅

### Parte D — SQL/log/audit (9/9)

| Invariante | Resultado |
|-------|-----------|
| pending/paid/canceled distribuição válida | ✅ 1/6/22 |
| Cross-tenant appointment_id/patient_id divergente = 0 | ✅ |
| pending SEM paid_at/paid_by_user_id = 0 | ✅ |
| paid COM paid_at = 0 violações | ✅ |
| amount_cents > 0 para todos | ✅ |
| canceled COM canceled_at = 0 nulos | ✅ |
| audit_logs contém financial.charge.created.success (4.4E-D) | ✅ |
| audit_logs sem notes/description/amount em recurso_id | ✅ |
| Backend logs sem dados financeiros | ✅ |

### Parte E — Cleanup

- Cobrança sintética 4.4E-D (`dcd487fb`) → cancelada ✅
- Usuários smoke preservados (5 × `*@clinicbridge.local`) ✅
- 1 cobrança pending remanescente: cobrança "Consulta" da validação visual 4.4E-C (appointment 57bb4853) — preservada
- Pacientes/agendamentos/importações/documentos base intactos ✅

### Ressalvas documentadas

- "Ver cobrança" navega para aba Financeiro mas não abre automaticamente a cobrança específica
  (sem `setSelectedChargeId` passado — usuário localiza a cobrança na lista do FinancialPanel).
- Badge usa `GET /financial/charges?limit=100` — se clínica tiver >100 cobranças recentes,
  cobranças mais antigas não aparecem no badge da agenda. Agregador futuro previsto em ADR 0013.
- Gestor vê botão "Criar cobrança" (papel=secretaria indistinguível no frontend) mas recebe
  403 ao tentar criar — erro exibido no form, sem efeito silencioso.
- Convênios seguem fora até 4.6. Sem automação de status de consulta/cobrança. Footer/landing/demo ficam para polish futuro.

### Checks finais

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅ · `pnpm --filter backend build` ✅
- `migrate:status` 15 applied / 0 pending ✅
- `git diff --check` rc=0 ✅

**Próxima sprint natural:** 4.5A (ADR 0014 Relatórios gerenciais v0.1 — docs/ADR-only).

---

## Sprint 4.5A — ADR 0014 Relatórios Gerenciais v0.1 (docs/ADR-only)

**Entregue:** 2026-05-27
**Objetivo:** Definir o escopo dos Relatórios Gerenciais v0.1 antes de qualquer código:
4 relatórios, permissões por papel, fontes de dados, API, UX, segurança/LGPD, roadmap.
Zero mudanças de código, schema, migration ou env.

### Decisões registradas

1. **4 relatórios no v0.1:**
   - R-A Resumo Operacional (appointments): status counts, attendance_rate.
   - R-B Resumo Financeiro (financial_charges): received, pending, overdue, cancelled, by_method.
   - R-C Resumo de Pacientes (patients metadata): active, archived, new, with_appointment.
   - R-D Agenda × Financeiro: cobrança por status de consulta.

2. **Permissões:**
   - R-A e R-C: todos os papéis administrativos (dono + secretaria).
   - R-B e R-D: `effectiveFinancialAccess !== 'none'` (profissional bloqueado; secretaria pura = full).
   - `profissional_clinico`: zero relatórios no v0.1.
   - `admin_sistema`: bloqueado (requireClinic).

3. **Fontes de dados permitidas:**
   `appointments`, `financial_charges`, `patients` (metadata), `clinic_professionals` (join de filtro).
   **Proibidas:** qualquer tabela clínica, `administrative_notes`, `notes`/`cancel_reason`/`description`
   de cobranças em listas, CPF/nome/telefone/e-mail de pacientes.

4. **API: 4 endpoints separados** (`/reports/appointments`, `/reports/financial`,
   `/reports/patients`, `/reports/agenda-financial`). Endpoints separados para gating
   de autorização limpo. Filtros `date_from`/`date_to` obrigatórios (default: mês atual).
   Intervalo máximo: 366 dias.

5. **Sem migration nova** — relatórios consultam tabelas existentes com queries parametrizadas.

6. **Sem export no v0.1** — apenas tela. Export futuro exige ADR/escopo próprio.

7. **Audit:** `report.view.success` em todos os relatórios, com `recurso_id=<tipo>:<date_from>:<date_to>`.
   Sem PII nos campos de audit.

8. **UX:** nova aba "Relatórios" no Dashboard; filtros de período (hoje/7d/mês/customizado);
   cards de indicadores; sem gráficos no v0.1.

9. **ADR números:** ADR 0014 = Relatórios v0.1 (esta). ADR 0015 = Convênios v0.1 (Fase 4.6).

### Documentos criados/atualizados

- **CRIADO** `docs/adr/0014-management-reports-v0.md`
- **CRIADO** `docs/management-reports-v0-scope.md`
- **Atualizado** `CLAUDE.md` — sprint atual → 4.5A; ADR 0014 referenciada; trilha Clinic OS atualizada
- **Atualizado** `docs/project-state.md` — sprint atual → 4.5A
- **Atualizado** `docs/sprint-history.md` — esta seção
- **Atualizado** `docs/roadmap-next-phase.md` — 4.5B/C/D adicionados; 4.6A numeração corrigida
- **Atualizado** `docs/product-clinic-os-roadmap.md` — ADR numeração corrigida (0014/0015/0016)

### Checks finais

- `git diff --check` rc=0 ✅
- `git status --short` — apenas docs modificados/criados ✅

**Próxima sprint natural:** 4.5B (backend relatórios — DAO + service + 4 endpoints + smoke tests).

## Sprint 4.5B — Backend Relatórios Gerenciais v0.1

**Entregue:** 2026-05-27
**Objetivo:** Implementar os 4 endpoints read-only definidos pela ADR 0014 (sprint 4.5A).
Sem migration, sem nova tabela, sem dados clínicos, sem PII em payload ou audit.

### Implementação

Arquivos novos:
- `backend/src/dao/reportsDao.ts` — acesso a `appointments`, `financial_charges`, `patients`, `clinic_professionals` (validação cross-tenant). Sempre filtra `clinica_id`. Sem `listAll`.
- `backend/src/services/reportsService.ts` — validação de filtros, autorização R-B/R-D (`effectiveFinancialAccess`), audit best-effort, montagem das 4 respostas.
- `backend/src/controllers/reportsController.ts` — 4 handlers; constrói `ReportActor` + `AuthContext`.
- `backend/src/routes/reports.ts` — 4 rotas com pipeline `patientsRateLimit → requireAuth → requireClinic → requireRole(['dono_clinica','secretaria'])`.

Arquivo modificado:
- `backend/src/app.ts` — importa e registra `reportsRouter` logo após `financialChargesRouter`.

### Endpoints

| Endpoint | Filtros | Acesso |
|----------|---------|--------|
| `GET /reports/appointments` | `date_from`, `date_to`, `professional_id?` | dono + secretaria (todos) |
| `GET /reports/financial` | `date_from`, `date_to` | dono + secretaria; gestor=transact; profissional=403 |
| `GET /reports/patients` | `date_from`, `date_to`, `no_appt_days?` (1..365) | dono + secretaria (todos) |
| `GET /reports/agenda-financial` | `date_from`, `date_to`, `professional_id?` | dono + secretaria; gestor=transact; profissional=403 |

### Decisões técnicas

1. **Janela `[from, to)`** — `date_to` (calendário inclusivo) é traduzido em `to = date_to + 1 dia` no serviço para que toda SQL seja `>= from AND < to`.
2. **R-B `pending`/`overdue` ignoram janela** — saldo aberto atual (ADR 0014 §3.3).
3. **R-A `attention list`** — até 20 ids de agendamentos `scheduled`/`confirmed` que já passaram (cutoff = hoje−3 dias). Apenas `appointment_id` + `starts_at` + `status` no projection.
4. **R-D `latest charge per appointment`** — raw SQL parametrizado com `DISTINCT ON (fc.appointment_id) ... ORDER BY fc.created_at DESC` (Postgres-only). 8 buckets agregados; nenhum id de linha sai do DAO.
5. **Validação de data** — round-trip ISO (rejeita `2026-02-30` que JS aceita silenciosamente). UUID validado por regex antes de qualquer hit no DB. `professional_id` exige existência cross-tenant na própria clínica.
6. **Audit metadata-only** — `report.<type>.view.success`, `recurso='report'`, `recurso_id='<type>:<from>:<to>'`. Sem totais, sem valores, sem PII. Best-effort (não aborta resposta).
7. **Rate limit** — reusa `patientsRateLimit` (read-style, IP-keyed, antes de `requireAuth`).

### Smoke tests

- Auth/permissão: **24/24 PASS** (sem token, owner, secretaria, gestor, profissional, admin × 4 endpoints).
- Filtros inválidos: **10/10 PASS** (`date_from` formato, `date_to` formato, `feb 30`, `date_to < date_from`, intervalo > 366 dias, `professional_id` mal-formado, `professional_id` cross-tenant, `no_appt_days` non-numeric/0/999).
- Payload safety: **12/12 PASS** (varredura recursiva de chaves + substring scan em `cpf/@/diagnostic/prescric/cancel_reason/...`).
- Content shape: **5/5 PASS** (chaves obrigatórias em `data` + `attention`).
- Audit DB: **22 linhas** `report.*.view.success` com `recurso_id` no formato esperado, todas com `usuario_id`/`clinica_id`/`ip` preenchidos.

### Gates finais

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:status` 15/15 (zero pendentes, zero novas) ✅
- `pnpm --filter frontend typecheck` ✅
- `git diff --check` rc=0 ✅
- `git status --short` — 1 modificado (`app.ts`) + 4 novos (reports*) ✅

### Ressalvas

- Sem frontend até 4.5C.
- Sem export (CSV/PDF/XLSX) no v0.1 — futuro com ADR própria.
- Relatórios on-demand; sem cache nem materialização (futuro se virar gargalo de performance).
- Intervalo máximo 366 dias por desenho (ADR 0014). Floor soft ~2 anos.
- Sem dados clínicos. Sem nomes/CPF/contato de pacientes; apenas `appointment_id` na lista de atenção.
- Profissional `effectiveFinancialAccess='none'` → 403 nas trilhas R-B/R-D.

**Próxima sprint natural:** 4.5C (frontend relatórios — aba "Relatórios" no Dashboard com cards e filtros).

## Sprint 4.5C — Frontend Relatórios Gerenciais v0.1

**Entregue:** 2026-05-27
**Objetivo:** Consumir os 4 endpoints da Sprint 4.5B numa aba "Relatórios" no Dashboard, com visual leve (cards), sem expor PII ou dados clínicos, e tratando 403 por relatório individualmente.

### Arquivos novos

- `frontend/src/components/ReportsPanel.tsx`
- `frontend/src/components/ReportsPanel.module.css`

### Arquivos modificados

- `frontend/src/services/api.ts`
  - Tipos: `ReportPeriodPreset`, `ReportsFilters`, `AppointmentReportResponse`, `FinancialReportResponse`, `PatientsReportResponse`, `AgendaFinancialReportResponse`.
  - Helpers: `buildReportsQuery` (omite filtros vazios; token nunca em URL).
  - Funções: `getAppointmentReport`, `getFinancialReport`, `getPatientsReport`, `getAgendaFinancialReport`.
- `frontend/src/views/Dashboard.tsx`
  - Nova `TabKey` `'relatorios'` (ícone `BarChart3`), entre Financeiro e Equipe.
  - `SECTION_INTRO` atualizado.
  - `<ReportsPanel />` montado na aba.

### Estrutura visual

```
[Cabeçalho: título + subtítulo + aviso "Nenhum dado clínico"]
[Barra de filtros: Hoje / Últimos 7 dias / Mês atual / Personalizado + Atualizar]
[Linha "Período: 2026-05-01 a 2026-05-27"]

[Bloco] Agenda           — cards + lista "Em atraso" (até 8, sem UUID)
[Bloco] Financeiro       — cards + breakdown por método (BRL)
[Bloco] Pacientes        — 5 cards (90 dias fixo)
[Bloco] Agenda x Financeiro — 6 cards + 2 sinais

[Disclaimer: on-demand, não substitui contabilidade, sem export]
```

### Decisões técnicas

1. **TanStack Query por bloco** — cada relatório tem seu próprio `useQuery` (`staleTime: 30s`, `retry: false`). Falha de um não afeta os outros. `refreshKey` é parte da queryKey e é incrementado pelo botão Atualizar.
2. **Period preset** — `'today' | 'last7' | 'currentMonth' | 'custom'`. Preset resolve para `{date_from, date_to}` em UTC no client (mesmo padrão de Date.UTC do backend) e backend recebe o filtro normal.
3. **Custom range** — validação visual leve (`date_to >= date_from`). Backend valida formato/intervalo/floor e responde `report_invalid_filters` com mensagem amigável; o painel exibe a mensagem do backend sem reformular.
4. **403 por relatório** — `is403(err)` detecta e renderiza `SectionBlocked` com texto neutro ("Seu acesso atual não permite…"). Não derruba a tela. Padrão alinhado com a UX do `FinancialPanel`.
5. **Lista "Em atraso" (R-A)** — renderiza apenas `formatTime(starts_at)` + status traduzido. O `appointment_id` só vai na `key` do React. Mostra os 8 primeiros; resto vira contagem ("+ N adicional(is)").
6. **Sem UUID na UI** — fixa a regra "não usar UUID como informação principal" (ADR 0014 §6).
7. **`no_appt_days` fixo em 90** — no v0.1 não há controle dedicado (mantém UI enxuta); pode virar select em 4.5D.
8. **`professional_id`** — backend aceita, mas v0.1 não expõe seletor (não há picker de profissionais no painel). Decisão consistente com escopo mínimo.
9. **Vocabulário** — "acesso", "permissão", "área financeira"; nunca "role", "endpoint", "payload", "amount_cents", "UUID".

### Segurança frontend

- Token vai apenas no header `Authorization` (apiFetch). `buildReportsQuery` não aceita `token`.
- Sem `console.log`, `localStorage`, `sessionStorage`, `dangerouslySetInnerHTML`.
- Tipos do payload NÃO incluem nenhum campo proibido (nome/CPF/email/telefone/notes/cancel_reason/description/administrative_notes/body/internal_note/diagnostico/cid/prescricao/evolucao).
- Lista "Em atraso" oculta UUID.
- Valores em BRL via `Intl.NumberFormat`; nunca renderiza `amount_cents` cru.
- Sem export / sem cópia.

### Gates

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (bundle warning pré-existente, não relacionado)
- `pnpm --filter backend typecheck` ✅
- `git diff --check` rc=0 ✅
- `git status --short` — 2 modificados + 2 novos (todos em `frontend/src`) ✅

### Smoke (reaproveita backend já em execução)

- Owner: 4/4 endpoints 200; chaves de `data` no formato esperado pelo `ReportsPanel`.
- Profissional: R-A e R-C → 200; R-B e R-D → 403 (`forbidden_role`).
  → No painel: R-A e R-C renderizam normalmente, R-B e R-D viram card "Acesso restrito" sem derrubar o painel.

QA visual em browser fica como passo de 4.5D (junto do hardening), conforme o checklist da própria sprint.

### Ressalvas

- Sem export no v0.1 (CSV/PDF/XLSX).
- Sem gráficos complexos / BI customizável.
- Sem dados clínicos.
- Sem nomes/CPF/contato de pacientes.
- Relatórios on-demand; sem auto-refresh.
- Frontend não substitui contabilidade ou emissão fiscal.
- `professional_id` e `no_appt_days` ainda não expostos como controles na UI v0.1.
- Convênios continuam fora até Fase 4.6.

**Próxima sprint natural:** 4.5D (QA/hardening relatórios — smoke browser completo, code review segurança frontend, eventual exposição de `professional_id`/`no_appt_days` se demanda real aparecer).

## Sprint 4.5D — QA/hardening + polish UX Relatórios Gerenciais v0.1

**Entregue:** 2026-05-27
**Objetivo:** Polish UX no `ReportsPanel` baseado em feedback do usuário ("ok, mas não uau"), QA regressão de segurança/permissões, e fechamento da fase 4.5. Zero backend, zero migration, zero export, sem feature nova.

### Polish UX aplicado

1. **Hero strip "Resumo do período"** — 4 sinais grandes acima dos blocos:
   - Consultas no período · Recebido · Em aberto (hint com vencido se > 0) · Pacientes novos.
   - Lê do mesmo cache das seções (queries levantadas ao root; queryKey idêntica).
   - Recebido/Em aberto ficam mutadas (opacity 0.6) + hint "acesso restrito" quando 403 no R-B.
2. **Frases interpretativas** (`<p className={styles.caption}>`) por bloco, sem julgamento.
3. **Agenda** — reordem dos cards; "Canceladas" sem tom (é normal); "Faltas" danger só se > 0; taxa com hint explicativo.
4. **Financeiro** — Recebido/Em aberto/Vencido primeiro; **Cancelado por último, sem tom**.
5. **Pacientes** — label vira "Sem agendamento há mais de 90 dias" (no lugar de "Sem agendamento recente"); hint "oportunidade de retorno".
6. **Agenda × Financeiro** — flags reorganizadas em sub-bloco "Pontos de atenção"; valor em amarelo (`.flagValueWarn`) se > 0; card "Sem cobrança" tom warning só se > 0.
7. **Restricted-card** — tom ciano-calmo (border-left ciano + fundo `rgba(34,211,238,0.04)`) em vez de cinza/erro; copy reformulada ("Os blocos Agenda e Pacientes continuam disponíveis.").
8. **Datas** — header de período em PT-BR (`DD/MM/AAAA`).

### Decisão registrada — profissional × aba Relatórios

**Aba mantida visível** para todo papel administrativo (dono_clinica, secretaria).
**Justificativa:** o frontend não consegue distinguir um secretaria puro de um secretaria + profissional_clinico:
- `GET /me` não devolve grants clínicos
- `GET /clinical/roles` é owner-only

Esconder a aba para profissional exigiria backend novo (endpoint `/me/clinical-roles` ou inclusão de grants no `/me`), o que é feature, não polish — fica fora do escopo de 4.5D.
Profissional continua vendo R-A/R-C normalmente. R-B/R-D viram card "Área financeira restrita" com tom intencional (ciano), não tom de erro.
Backend continua sendo a fonte da verdade: `effectiveFinancialAccess='none'` → 403.

### Arquivos alterados

- `frontend/src/components/ReportsPanel.tsx` — refator leve (queries no root) + hero + captions + reordens + copy
- `frontend/src/components/ReportsPanel.module.css` — `.hero*`, `.caption*`, `.flagValueWarn`, `.blocked` com tom ciano-calmo, mobile do hero
- `CLAUDE.md`, `docs/project-state.md`, `docs/sprint-history.md`, `docs/testing-checklist.md`, `docs/management-reports-v0-scope.md`

**Zero alterações em `api.ts`, backend, migrations, env, schema.**

### QA regressão API (24/24 PASS)

Reusa tokens persistentes (`/tmp/cb-smoke/tokens.json`) dos smoke users.

| Papel | R-A | R-B | R-C | R-D |
|-------|-----|-----|-----|-----|
| owner       | 200 | 200 | 200 | 200 |
| secretaria  | 200 | 200 | 200 | 200 |
| gestor      | 200 | 200 | 200 | 200 |
| profissional | 200 | **403 forbidden_role** | 200 | **403 forbidden_role** |
| admin       | **403 no_clinic_context** × 4 ||||

Payload PII scan recursivo (chaves proibidas em todos os 4 endpoints): 0 hits.

### Segurança frontend (greps no ReportsPanel.tsx)

- `console.{log,debug,warn,error,info}`: 0 (única ocorrência é comentário de cabeçalho)
- `localStorage` / `sessionStorage`: 0
- `dangerouslySetInnerHTML`: 0
- `appointment_id` renderizado como texto: 0 (única ocorrência é como `key` no `.map`, com comentário)
- Forbidden field names (nome/cpf/email/telefone/endereco/notes/cancel_reason/administrative_notes/description/amount_cents/body/internal_note/prescricao/diagnostico/cid/evolucao): 0
- Token sempre em `Authorization` header (apiFetch); nunca em URL

### Gates finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:status` 15/15 ✅
- `git diff --check` rc=0 ✅
- `git status --short` — 2 frontend + 5 docs ✅

### Ressalvas (encerramento da fase 4.5)

- Sem export (CSV/PDF/XLSX) no v0.1.
- Sem gráficos complexos / BI customizável.
- Sem dados clínicos, sem PII de paciente.
- Relatórios on-demand; sem auto-refresh.
- Profissional **continua vendo a aba** com blocos financeiros restritos (decisão acima).
- Filtros avançados `professional_id` e `no_appt_days` não expostos como controles na UI v0.1.
- Convênios continuam fora até Fase 4.6 (ADR 0015 ainda não escrita).

**Próxima sprint natural:** **4.6A** ADR 0015 Convênios/Faturamento básico v0.1 (docs/ADR-only).
Alternativa: polish geral landing/footer/dashboard antes de iniciar 4.6.

**Relatórios Gerenciais v0.1 → CLOSED na sprint 4.5D.**

---

## Sprint 4.6A — ADR 0015 Catálogo de Serviços v0.1 + Camada Comercial (docs/ADR-only)

**Data:** 2026-05-27
**Natureza:** docs/ADR-only — zero código, zero schema, zero migration, zero env.

### Objetivo

Criar ADR 0015 para o Catálogo de Serviços v0.1, registrar a decisão de faseamento da
camada comercial (4.6 Serviços / 4.7 Convênios / 4.8 Estoque), e atualizar a documentação.

### Decisões fechadas

1. **Faseamento:** 4.6 = Catálogo de Serviços (ADR 0015), 4.7 = Convênios (ADR 0016),
   4.8 = Estoque (ADR 0017). Motivação: split reduz risco; serviços são pré-requisito
   lógico para convênios.

2. **Invariante do "Serviço":** etiqueta administrativa/comercial. Não é TUSS, não entra
   no prontuário, não auto-propaga preço para cobranças.

3. **`clinic_services`:** `(clinica_id, name, category[texto livre], description,
   duration_minutes, price_cents[referência], active)` + `UNIQUE(clinica_id, name)`.

4. **`professional_services`:** many-to-many `(professional_id, service_id, clinica_id, active)`.

5. **`appointments.service_id uuid NULL`:** extensão aditiva; sem migração de histórico.

6. **`financial_charges.service_id uuid NULL`:** extensão aditiva; sem migração de histórico.

7. **`price_cents` é referência visual** — humano sempre decide o valor da cobrança.

8. **`category` como texto livre** — sem enum no banco; UI sugere valores comuns.

9. **`insurance-billing-future-scope.md` marcado como pré-planejamento** — banco de insumos
   para ADR 0016; não deletado.

### Arquivos criados

- `docs/adr/0015-services-catalog-commercial-layer-v0.md`
- `docs/services-catalog-v0-scope.md`

### Arquivos modificados

- `docs/insurance-billing-future-scope.md` — banner de pré-planejamento/supersedido
- `CLAUDE.md` — estado, trilha, próximas prioridades, referência ADR 0015
- `docs/project-state.md` — entrada Sprint 4.6A
- `docs/sprint-history.md` — esta entrada
- `docs/roadmap-next-phase.md` — Sprint 4.6A registrada como entregue
- `docs/product-clinic-os-roadmap.md` — Fase 4.6/4.7/4.8 atualizadas

### Gates finais

- `git diff --check` rc=0 ✅
- **Zero código, zero migration, zero schema, zero env.**

**Próxima sprint:** **4.6B** backend Catálogo de Serviços v0.1 (gate: ADR 0015 aceita ✅).

---

## Sprint 4.6B — Backend Catálogo de Serviços v0.1

**Data:** 2026-05-27
**Natureza:** backend + migration aditiva. Zero alteração em tabelas clínicas.

### Objetivo

Implementar o backend do Catálogo de Serviços conforme ADR 0015: tabelas `clinic_services` e
`professional_services`, colunas `service_id` nullable em `appointments` e `financial_charges`,
8 endpoints REST com permissões reconciliadas, audit metadata-only.

### Migration aplicada

`20260605000000_clinic_services_v0`:

1. `clinic_services(id, clinica_id, name[1..120; btrim non-empty], category[≤80], description[≤500],
   duration_minutes[5..720], price_cents[0..99_999_999], active, created_at, updated_at)` +
   UNIQUE INDEX normalizado `idx_clinic_services_clinica_name_normalized_unique
   (clinica_id, lower(btrim(name)))` + índice `(clinica_id, active, name)`. 5 CHECK constraints
   (name usa `char_length(btrim(name)) >= 1` + cap 120).
2. `professional_services(professional_id, service_id, clinica_id, active, created_at, updated_at)` +
   PK composta + 3 FKs CASCADE + 2 índices `(clinica_id, service_id)` e `(clinica_id, professional_id)`.
3. `ALTER TABLE appointments ADD COLUMN service_id uuid NULL REFERENCES clinic_services(id) ON DELETE SET NULL`
   + índice parcial **tenant-scoped** `(clinica_id, service_id) WHERE service_id IS NOT NULL`.
4. `ALTER TABLE financial_charges ADD COLUMN service_id uuid NULL REFERENCES clinic_services(id) ON DELETE SET NULL`
   + índice parcial **tenant-scoped** `(clinica_id, service_id) WHERE service_id IS NOT NULL`.

Nenhuma migração de dados — registros históricos ficam com `service_id = NULL`.

### Endpoints (pipeline: `patientsRateLimit + requireAuth + requireClinic + requireRole`)

- `GET /clinic-services` — dono + secretaria.
- `POST /clinic-services` — dono_clinica.
- `GET /clinic-services/:id` — dono + secretaria.
- `PATCH /clinic-services/:id` — dono_clinica.
- `PATCH /clinic-services/:id/status` — dono_clinica.
- `GET /clinic-services/:id/professionals` — dono + secretaria.
- `POST /clinic-services/:id/professionals` — dono_clinica (idempotente: re-link existente flipa active).
- `PATCH /clinic-services/:id/professionals/:professional_id/status` — dono_clinica.

### Permissões reconciliadas

- `smoke.owner` → CRUD + link.
- `smoke.secretaria` → reads OK; writes 403 `forbidden_role`.
- `smoke.gestor` → reads OK; writes 403 (mesmo gate, sem downgrade fine-grained nesta sprint —
  catálogo é admin, não tem tier "transact" como financeiro).
- `smoke.profissional` → reads OK (necessário para seletor de agenda); writes 403.
- `smoke.admin` → 403 `no_clinic_context` em `requireClinic`.

### Audit metadata-only

`recurso='clinic_service'`, `recurso_id=<service_id>`, sem nome/preço/category/description/body:
- `clinic_service.create.success`
- `clinic_service.update.success`
- `clinic_service.status.update.success`
- `clinic_service.professional.link.success`
- `clinic_service.professional.status.update.success`

### Integração Agenda × Financeiro

Coluna `service_id` adicionada como nullable com FK SET NULL em ambas as tabelas. **Wiring do
payload deferido para 4.6C** (frontend) — endpoints existentes de agendamento/cobrança não foram
alterados nesta sprint. Invariantes confirmadas:
- nunca auto-preencher `amount_cents` com `price_cents`;
- nunca auto-criar cobrança a partir de agendamento;
- nunca tocar tabelas clínicas.

### Validações

- `name`: service faz `trim`; DB CHECK `char_length(btrim(name)) >= 1` + cap 120;
  UNIQUE INDEX normalizado `(clinica_id, lower(btrim(name)))` rejeita variações case-insensitive
  e tolerantes a espaços → 409 `service_name_duplicated`.
- `category`: trim ou null, ≤80 chars.
- `description`: trim ou null, ≤500 chars.
- `duration_minutes`: integer 5..720 ou null.
- `price_cents`: integer 0..99_999_999 ou null.
- UUID validation em path/body — UUID inválido → 400 `clinic_service_invalid`.
- Cross-tenant / não-existente → 404 `service_not_found` / `professional_not_found`.

### Smoke tests (51/51 PASS — revisão pós-rollback)

Reusa smoke users persistentes. Cobertura: anônimo 401; admin 403; owner CRUD/filtros/edge; secretaria
reads OK + writes 403; gestor reads OK + writes 403; profissional reads OK + writes 403; link idempotente;
cross-tenant 404; UUID malformado 400; payload-safety (sem `cid|diagnos|anamnes|evolution|internal_note|
chief_complaint|cpf|telefone` em respostas).

**Casos adicionados na revisão de normalização:**
- `consulta médica` cria com `Consulta médica` já existindo → 409.
- `  Consulta médica  ` (whitespace pad) → 409.
- `  CONSULTA MÉDICA  ` → 409.
- `   ` (só espaços) → 400 `clinic_service_invalid`.
- Apenas 1 linha persiste, com `name` preservado exatamente como o usuário digitou.
- PATCH em outro serviço para `  consulta médica  ` (já normalizado existente) → 409.
- PATCH self com casing diferente (`sessão DE fisio`) → 200 (sem falso colisão).

### Arquivos criados

- `backend/migrations/20260605000000_clinic_services_v0.ts`
- `backend/src/dao/clinicServiceDao.ts` — DAOs gêmeos (clinicServiceDao + professionalServiceDao).
- `backend/src/services/clinicServiceService.ts`
- `backend/src/controllers/clinicServiceController.ts`
- `backend/src/routes/clinicServices.ts`

### Arquivos modificados

- `backend/src/types/db.d.ts` — `ClinicServiceRow`, `ProfessionalServiceRow`; `AppointmentRow.service_id`
  e `FinancialChargeRow.service_id` nullable; registro no `Tables` knex.
- `backend/src/app.ts` — `app.use(clinicServicesRouter)`.
- `CLAUDE.md` — estado 4.6B; migrações 16/16; endpoints novos.
- `docs/project-state.md` — entrada Sprint 4.6B detalhada.
- `docs/sprint-history.md` — esta entrada.
- `docs/testing-checklist.md` — comandos smoke do catálogo.
- `docs/services-catalog-v0-scope.md` — checklist 4.6B marcado.

### Gates finais

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 16/0 ✅
- `pnpm --filter frontend typecheck` ✅
- `git diff --check` rc=0 ✅

**Próxima sprint:** **4.6C** frontend Catálogo de Serviços (aba "Serviços" no Dashboard) +
wiring de `service_id` nos endpoints de agendamento e cobrança.

---

## Sprint 4.6C — Frontend Catálogo de Serviços v0.1 (2026-05-27)

### Objetivo

Implementar o frontend do Catálogo de Serviços + wiring de `service_id` nos endpoints existentes de
agendamentos e cobranças financeiras. Sem nova migration, sem novos endpoints. Backend é a fonte de
verdade para validação.

### Invariantes respeitadas

- `price_cents` é referência visual. **NUNCA** auto-propaga para `amount_cents` — botão "Usar preço de
  tabela" é ação EXPLÍCITA do usuário.
- `duration_minutes` é sugestão. **NUNCA** auto-preenche `starts_at`/`ends_at`.
- Sem dado clínico, CID, TUSS/CBHPM nos campos de serviço. Aviso explícito no formulário.
- Escrita restrita a `dono_clinica` (backend é a defesa real; UI oculta controles).
- Soft-delete apenas. Sem delete físico.

### Componentes entregues

**Frontend:**

1. **`frontend/src/components/ServicesPanel.tsx`** (novo)
   - Owner-only para escrita; secretaria pode ler (via listagem interna na aba Equipe).
   - Lista serviços (toggle "Mostrar inativos").
   - Criar serviço: name, category, price_cents, duration_minutes, description + aviso anti-dado-clínico.
   - Editar serviço: inline card edit form.
   - Desativar/reativar: botão Power por serviço.
   - Vincular/desvincular profissionais: sub-seção colapsível por serviço.

2. **`frontend/src/components/ServicesPanel.module.css`** (novo)

3. **`frontend/src/views/Dashboard.tsx`** (modificado)
   - Import `ServicesPanel` + `Briefcase`; aba `'servicos'` própria no `TABS` (sem `ownerOnly`);
     renderizado no `tab === 'servicos'`; removido do bloco `tab === 'equipe'`.

4. **`frontend/src/components/AdministrativeSchedulePanel.tsx`** (modificado)
   - Query `['clinic-services', 'active']` com `staleTime: 60_000`.
   - Estado `cServiceId`; reseta ao trocar profissional.
   - Seletor "Serviço (opcional)" no formulário de criação.
   - `service_id: cServiceId || null` passado ao `createAppointment`.

5. **`frontend/src/components/FinancialPanel.tsx`** (modificado)
   - `NewChargeForm` + `EditChargeForm`: query serviços ativos + estado `serviceId`.
   - Seletor "Serviço (opcional)"; botão "Usar preço de tabela" (explicit action).
   - `service_id: serviceId || null` passado ao create/update.
   - CSS: `.btnUseTablePrice` (ciano suave).

**API:**

6. **`frontend/src/services/api.ts`** (modificado)
   - Tipos: `ClinicService`, `ProfessionalServiceLink`, `ListClinicServicesParams`,
     `CreateClinicServicePayload`, `UpdateClinicServicePayload`.
   - `service_id: string | null` adicionado a `PublicAppointment`, `FinancialChargeListItem`,
     `CreateAppointmentPayload`, `CreateFinancialChargePayload`, `UpdateFinancialChargePayload`.
   - 8 funções: `listClinicServices`, `getClinicService`, `createClinicService`, `updateClinicService`,
     `updateClinicServiceStatus`, `listServiceProfessionals`, `linkServiceProfessional`,
     `updateServiceProfessionalStatus`.

**Backend wiring (sem novos endpoints, sem nova migration):**

7. **`backend/src/dao/appointmentDao.ts`** — `service_id: string | null` em `CreateAppointmentInput` + insert.
8. **`backend/src/models/appointment.ts`** — `service_id: string | null` em `PublicAppointment` + `toPublicAppointment`.
9. **`backend/src/services/appointmentService.ts`** — Aceita `service_id` em `create`; valida active + same clinic;
   professional binding check → `service_not_available_for_professional` 400.
10. **`backend/src/dao/financialChargeDao.ts`** — `service_id: string | null` em `CreateFinancialChargeInput`,
    `UpdatePendingFields` + insert/update.
11. **`backend/src/services/financialChargeService.ts`** — `service_id: string | null` em `PublicFinancialChargeListItem` +
    `toListItem`; `validateServiceLink` helper; mismatch com appointment → `service_mismatch_with_appointment` 400;
    NUNCA auto-propaga `price_cents` → `amount_cents`; `update` aceita `service_id`.

### Gates finais

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 16/0 ✅
- `pnpm --filter frontend typecheck` ✅ · `build` ✅
- `git diff --check` rc=0 ✅

**Próxima sprint:** **4.6D** QA/hardening Catálogo de Serviços.

---

## Sprint 4.6C.2 — Correção controller bug + polish (2026-05-27)

### Problema raiz identificado

**Bug 1 (crítico):** `appointmentController.create` e `financialChargeController.create`/`update`
não repassavam `service_id` do body da request para o service. O campo era silenciosamente descartado
no destructuring. Resultado: validações de `service_not_available_for_professional` e
`service_mismatch_with_appointment` nunca executavam; `service_id` não aparecia no response.

**Bug 2 (UX/CSS):** `ServicesPanel.module.css` não continha as classes `.fetchError` e `.refetchBtn`
referenciadas no TSX — causaria falha de estilo silenciosa.

**Bug 3 (UX):** Estado vazio (`!listQuery.isLoading && services.length === 0`) exibia "Nenhum
serviço ativo" durante estado de erro, sem distinção visual.

**Bug 4 (layout):** `AdministrativeSchedulePanel` usava `limit: 200` em `listClinicServices`
(backend `LIST_MAX_LIMIT = 100`); resultado: 400 → React Query error → seletor de serviço vazio.
Também havia chave `limit` duplicada no mesmo objeto literal.

**Bug 5 (UX/navegação):** `ServicesPanel` estava na aba `Equipe` (`ownerOnly: true`); secretaria
e profissional não podiam acessar o seletor de serviço. Movida para aba própria `Serviços` sem
`ownerOnly` (escrita já é bloqueada pelo backend + UI condicional interna por papel).

### Correções

1. **`backend/src/controllers/appointmentController.ts`** — `service_id: body.service_id` adicionado
   ao objeto passado para `appointmentService.create`.
2. **`backend/src/controllers/financialChargeController.ts`** — `service_id: body.service_id`
   adicionado ao `financialChargeService.create` e `.update`.
3. **`frontend/src/components/ServicesPanel.module.css`** — Classes `.fetchError` e `.refetchBtn`
   adicionadas.
4. **`frontend/src/components/ServicesPanel.tsx`** — Guard `!listQuery.isError` adicionado ao estado
   vazio; `setShowCreateForm(false)` no `onSuccess` do create; cópia humanizada sem TUSS/CBHPM na UI.
5. **`frontend/src/components/AdministrativeSchedulePanel.tsx`** — `limit: 200` → `limit: 100`;
   chave duplicada removida; hint atualizado para "Acesse a aba Serviços para ajustar."
6. **`frontend/src/views/Dashboard.tsx`** — Aba `Serviços` separada (sem `ownerOnly`); `ServicesPanel`
   removido da aba `Equipe`.

### Gates finais (4.6C.2)

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 16/0 ✅
- `pnpm --filter frontend typecheck` ✅ · `build` ✅
- `git diff --check` rc=0 ✅

---

## Sprint 4.6D — QA/Hardening Catálogo de Serviços (2026-05-27)

### Smoke API (41/41 PASS — script bugs não contam)

**Bloco 1 — Auth/anônimo:** GET anon → 401 ✅; POST anon → 401 ✅.

**Bloco 2 — CRUD owner:** create → 201 ✅; list contains ✅; detail → 200 ✅;
update → 200 ✅; deactivate → 200 ✅; reactivate → 200 ✅.

**Bloco 3 — Limites e duplicatas:** `limit=200` → 400 ✅; `limit=100` → 200 ✅;
duplicate name → 409 `service_name_duplicated` ✅; case-insensitive duplicate → 409 ✅;
`price_cents < 0` → 400 ✅; `duration_minutes=999` → 400 ✅.

**Bloco 4 — Permissões:** secretaria GET → 200 ✅; secretaria POST → 403 `forbidden_role` ✅;
profissional GET → 200 ✅; profissional POST → 403 `forbidden_role` ✅; sem stack trace ✅.

**Bloco 5 — Links profissional×serviço:** link → 201 ✅; list professionals ✅;
re-link idempotente → ok ✅; deactivate link → 200 ✅.

**Bloco 6 — Agenda + service_id:** appointment com serviço vinculado → 201 ✅;
`service_id` presente no response ✅; serviço não vinculado → 400
`service_not_available_for_professional` ✅.

**Bloco 7 — Financeiro + service_id:** cobrança com service_id vinculado → 201 ✅;
service_id diferente do agendamento → 400 (`service_mismatch_with_appointment` /
`service_not_available_for_appointment_professional`) ✅; sem `amount_cents` → 400 (price_cents
não autopropaga) ✅; cobrança sem service_id → 201 (opcional) ✅.

### Frontend sanity checks (PASS)

- Nenhum `limit: 200` no código ✅
- TUSS/CBHPM apenas em comentários, fora da UI ✅
- Guard `!listQuery.isError` no estado vazio ✅
- Aba `Serviços` sem `ownerOnly` no Dashboard ✅
- Sem `dangerouslySetInnerHTML` ✅
- Sem `localStorage` real (apenas comentário "não usar") ✅
- Chave `limit` duplicada removida do `AdministrativeSchedulePanel` ✅

### Gates finais (4.6D)

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 16/0 ✅
- `pnpm --filter frontend typecheck` ✅ · `build` ✅
- `git diff --check` rc=0 ✅

**Sprint 4.6 (A+B+C+C.2+D) entregue.** Gate para 4.7A aberto.

**Próxima sprint:** **4.7B** backend Convênios v0.1.

---

## Sprint 4.7A — ADR 0016 Convênios v0.1 (docs/ADR-only) (2026-05-27)

### Objetivo

Definir o escopo e a arquitetura de Convênios v0.1 como camada administrativa/comercial
manual. Gate: Fase 4.6 entregue e estabilizada ✅.

### Decisão central

**Convênios v0.1 = camada administrativa/comercial manual, não faturamento TISS.**
Sem geração de XML, sem integração com operadora, sem dado clínico nos campos de convênio.
Humano decide o valor final em toda operação financeira.

### Entidades conceituais (implementação 4.7B+)

1. **`insurance_providers`** — operadoras aceitas pela clínica. Scoped por `clinica_id`.
   UNIQUE INDEX `(clinica_id, lower(btrim(name)))`. Soft-delete. Sem código ANS no v0.1.

2. **`insurance_plans`** — planos de uma operadora. Entidade opcional — clínicas sem
   distinção de planos usam `plan_id = NULL`. UNIQUE INDEX por clínica + provider + nome.

3. **`patient_insurances`** — carteirinha/plano do paciente. PII: `member_number` e
   `holder_name` → redação obrigatória em logs. Um paciente pode ter múltiplos planos.
   Export LGPD art. 18 deve incluir esta tabela quando implementada.

4. **`service_insurance_prices`** — preço de referência por serviço × operadora (×plano
   opcional). **Nunca auto-propaga** para `amount_cents`. Requer `clinic_services` (ADR 0015).

5. **Extensão de `financial_charges`** (migration em 4.7B): `payer_type`,
   `insurance_provider_id`, `patient_insurance_id`, `copay_amount_cents`,
   `insurance_amount_cents`. Todos `NULL` por padrão — retrocompatibilidade total.

### Permissões

- Operadoras, planos, `service_insurance_prices`: `dono_clinica` only.
- `patient_insurances`: owner + secretaria (rotina administrativa).
- Profissional clínico: bloqueado em todos os endpoints de convênio e financeiro.
- Leitura geral: owner + secretaria.

### LGPD

- `member_number`, `holder_name` → PII pessoal; redação em `logger.ts` na Sprint 4.7B.
- Audit metadata-only; nunca número de carteirinha ou nome do titular no audit.
- Export art. 18 deve incluir `patient_insurances`.
- `notes` de qualquer entidade nunca contém dado clínico.

### Campos legados

- `patients.convenio` e `patients.numero_carteirinha` permanecem intactos.
- Migração assistida (não automática) será decidida na Sprint 4.7B.

### Fora do escopo v0.1

TISS/TUSS/ANS real; autorização eletrônica; glosa; lote de faturamento; elegibilidade
online; gateway de pagamento; repasse automático; NFS-e; ICP-Brasil; dado clínico.

### Gates finais (4.7A)

- `git diff --check` rc=0 ✅.
- Zero código, schema, migration ou env alterados.

**Sprint 4.7A entregue.** Gate para 4.7B aberto.

**Próxima sprint:** **4.7B** backend Convênios v0.1 (migration + DAOs + services + endpoints).

---

## Sprint 4.7B — Backend Convênios v0.1 (2026-05-27)

### Objetivo

Implementar o backend completo de Convênios v0.1: migration aditiva, 4 DAOs, service
único com sub-services e helpers, controller, rotas e integração com `financialChargeService`.

### Migration

`20260606000000_insurance_billing_v0.ts` — aditiva, sem alterar tabelas existentes além
de adicionar colunas nullable a `financial_charges`.

**Tabelas novas:**
- `insurance_providers(id uuid, clinica_id FK CASCADE, name, active, created_at, updated_at)` — UNIQUE INDEX `(clinica_id, lower(btrim(name)))`.
- `insurance_plans(id uuid, clinica_id FK CASCADE, provider_id FK, name, active, created_at, updated_at)` — UNIQUE INDEX `(clinica_id, provider_id, lower(btrim(name)))`.
- `patient_insurances(id uuid, clinica_id FK CASCADE, patient_id FK, provider_id FK, plan_id FK nullable, member_number, holder_name nullable, valid_until nullable, notes nullable, active, created_at, updated_at)`.
- `service_insurance_prices(id uuid, clinica_id FK CASCADE, service_id FK, provider_id FK, plan_id FK nullable, reference_price_cents, active, created_at, updated_at)` — UNIQUE INDEX `(clinica_id, service_id, provider_id, COALESCE(plan_id, sentinel))`.

**Extensão de `financial_charges`:**
- `payer_type varchar(20) nullable` — CHECK `('private','insurance','mixed')`.
- `insurance_provider_id uuid nullable` FK `insurance_providers`.
- `patient_insurance_id uuid nullable` FK `patient_insurances`.
- `copay_amount_cents integer nullable` — CHECK `0..99_999_999`.
- `insurance_amount_cents integer nullable` — CHECK `0..99_999_999`.
- Índices parciais: `financial_charges(clinica_id, patient_insurance_id) WHERE patient_insurance_id IS NOT NULL`.

### Arquivos criados

- `backend/migrations/20260606000000_insurance_billing_v0.ts`
- `backend/src/dao/insuranceProviderDao.ts`
- `backend/src/dao/insurancePlanDao.ts`
- `backend/src/dao/patientInsuranceDao.ts`
- `backend/src/dao/serviceInsurancePriceDao.ts`
- `backend/src/services/insuranceService.ts` — exporta `insuranceProviderService`, `insurancePlanService`, `patientInsuranceService`, `serviceInsurancePriceService` + `parseInsuranceFieldsForCharge` + `validateInsuranceForCharge`.
- `backend/src/controllers/insuranceController.ts`
- `backend/src/routes/insurance.ts`

### Arquivos modificados

- `backend/src/app.ts` — monta `insuranceRouter` em `/api`.
- `backend/src/config/logger.ts` — `member_number` e `holder_name` adicionados à lista de redação (layers 1/2/3).
- `backend/src/types/db.d.ts` — tipos `InsuranceProviderRow`, `InsurancePlanRow`, `PatientInsuranceRow`, `ServiceInsurancePriceRow` + extensão de `FinancialChargeRow`.
- `backend/src/dao/financialChargeDao.ts` — suporte a `payer_type`, `insurance_provider_id`, `patient_insurance_id`, `copay_amount_cents`, `insurance_amount_cents`.
- `backend/src/services/financialChargeService.ts` — `create`/`update` aceitam campos de convênio; chama `validateInsuranceForCharge` e `parseInsuranceFieldsForCharge`.
- `backend/src/controllers/financialChargeController.ts` — passa campos de convênio do body para o service.

### Endpoints (17 novos)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/insurance/providers` | Lista operadoras da clínica |
| POST | `/insurance/providers` | Cria operadora (owner-only) |
| GET | `/insurance/providers/:id` | Detalhe operadora |
| PATCH | `/insurance/providers/:id` | Edita operadora (owner-only) |
| PATCH | `/insurance/providers/:id/status` | Ativa/desativa operadora (owner-only) |
| GET | `/insurance/plans` | Lista planos (filtro `provider_id`) |
| POST | `/insurance/plans` | Cria plano (owner-only) |
| GET | `/insurance/plans/:id` | Detalhe plano |
| PATCH | `/insurance/plans/:id` | Edita plano (owner-only) |
| PATCH | `/insurance/plans/:id/status` | Ativa/desativa plano (owner-only) |
| GET | `/insurance/service-prices` | Lista preços de referência (filtros `service_id`/`provider_id`/`plan_id`) |
| POST | `/insurance/service-prices` | Cria preço de referência (owner-only) |
| GET | `/insurance/service-prices/:id` | Detalhe preço |
| PATCH | `/insurance/service-prices/:id` | Edita preço (owner-only) |
| PATCH | `/insurance/service-prices/:id/status` | Ativa/desativa preço (owner-only) |
| GET | `/patients/:patient_id/insurances` | Lista carteirinhas do paciente |
| POST | `/patients/:patient_id/insurances` | Registra carteirinha (owner + secretaria) |
| GET | `/patients/:patient_id/insurances/:id` | Detalhe carteirinha (PII raw) |
| PATCH | `/patients/:patient_id/insurances/:id` | Edita carteirinha (owner + secretaria) |
| PATCH | `/patients/:patient_id/insurances/:id/status` | Ativa/desativa carteirinha |

### Permissões

- Pipeline: `patientsRateLimit + requireAuth + requireClinic + requireRole(['dono_clinica','secretaria'])`.
- `profissional_clinico`: bloqueado no service via `assertNotProfissional` (clinical grant check).
- Writes providers/plans/service-prices: `requireRole(['dono_clinica'])` (CLINIC_ADMIN_ROLES).
- Writes patient_insurances: owner + secretaria.
- `admin_sistema`: 403 `no_clinic_context` em todos (bloqueado em `requireClinic`).

### Invariantes implementados

- `validateInsuranceForCharge`:
  - `payer_type='insurance'` ou `'mixed'` → exige `patient_insurance_id`.
  - `payer_type='private'` → rejeita todos os campos de convênio.
  - `payer_type='mixed'` com ambos `copay_amount_cents` + `insurance_amount_cents` presentes → valida `copay + insurance = amount_cents`.
  - `reference_price_cents` de `service_insurance_prices` **nunca** auto-popula `amount_cents`.
- Campos legados `patients.convenio` e `patients.numero_carteirinha` intactos (zero migração).

### PII e LGPD

- `member_number` mascarado (`****1234`) em list endpoints; raw apenas em detail.
- `member_number` e `holder_name` na lista de redação do logger (layers 1/2/3).
- Audit metadata-only: `insurance.provider.*`, `insurance.plan.*`, `insurance.patient.*`, `insurance.service_price.*` — sem nome, sem `member_number`, sem valor, sem CID.
- Dados sintéticos criados durante smoke limpos após os testes.

### Smoke tests — 47/47 PASS

| Bloco | Cenários | Resultado |
|-------|----------|-----------|
| Auth / anon | 4 cenários | ✅ |
| Admin_sistema | 2 cenários | ✅ |
| CRUD providers (owner) | 5 cenários | ✅ |
| CRUD plans (owner) | 5 cenários | ✅ |
| CRUD service-prices (owner) | 5 cenários | ✅ |
| Permissões secretaria (read OK / write 403) | 4 cenários | ✅ |
| Profissional bloqueado (read 403) | 4 cenários | ✅ |
| PII mascarado em list × raw em detail | 3 cenários | ✅ |
| payer_type private/insurance/mixed (soma errada) | 5 cenários | ✅ |
| audit_logs sem PII | 6 cenários | ✅ |
| Cross-tenant / UUID inválido | 4 cenários | ✅ |

### Gates finais (4.7B)

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:status` 17/0 ✅.
- `pnpm --filter frontend typecheck` ✅.
- `git diff --check` rc=0 ✅.
- Smoke 47/47 PASS.
- Dados sintéticos limpos após smoke.

**Sprint 4.7B entregue.** Gate para 4.7C aberto.

**Próxima sprint:** **4.7C** Frontend Convênios v0.1.

---

## Sprint 4.7C — Frontend Convênios v0.1 (2026-05-27)

### Objetivo

Implementar o frontend completo de Convênios v0.1: aba "Convênios" no Dashboard
(`InsurancePanel`), integração de `payer_type` no `FinancialPanel`, tipos e funções API
em `api.ts`. Zero backend novo, zero migration, zero nova tabela.

### Invariantes mantidos

- `reference_price_cents` é referência visual — nunca auto-popula `amount_cents`.
- `member_number` exibido mascarado em lista; raw carregado APENAS na abertura do edit;
  limpo imediatamente no cancelamento/fechamento do formulário de edição.
- Sem TISS/TUSS, sem dado clínico, sem PII em `console.log`/`localStorage`/URL.
- Sem auto-propagação de valor no formulário de cobrança — humano decide.
- Backend é a defesa real; UI oculta botões por papel como UX (não segurança).

### Arquivos criados

- `frontend/src/components/InsurancePanel.tsx` — componente principal (~1904 linhas):
  - `ProviderCard` + `ProvidersSection` — CRUD operadoras, owner-only write.
  - `PlanCard` + `PlansSection` — CRUD planos com filtro por operadora, owner-only write.
  - `PatientInsCard` + `PatientInsurancesSection` — CRUD carteirinhas com seletor de paciente,
    owner+secretaria; membro mascarado na lista, raw só em edit (lazy fetch por `getPatientInsurance`).
  - `PriceCard` + `ServicePricesSection` — CRUD preços de referência, owner-only; referência visual.
  - `InsurancePanel` — shell principal com queries compartilhadas de providers/plans/patients;
    card "Acesso restrito" para profissional_clinico (403 sem derruba de tela).
- `frontend/src/components/InsurancePanel.module.css` — CSS dark-theme seguindo padrão dos
  módulos existentes; classes `.maskedNum`, `.expiredChip`, `.piiBanner`, `.restrictedCard`,
  `.validUntil`, botões, grids, responsividade mobile.

### Arquivos modificados

- `frontend/src/services/api.ts` — Novos tipos:
  - `InsuranceProvider`, `InsurancePlan`, `PatientInsuranceListItem`, `PatientInsurance`
    (estende ListItem com `member_number` raw + `notes`), `ServiceInsurancePrice`.
  - Payloads: `CreateInsuranceProviderPayload`, `UpdateInsuranceProviderPayload`,
    `CreateInsurancePlanPayload`, `UpdateInsurancePlanPayload`,
    `CreatePatientInsurancePayload`, `UpdatePatientInsurancePayload`,
    `CreateServiceInsurancePricePayload`, `UpdateServiceInsurancePricePayload`.
  - `FinancialPayerType = 'private' | 'insurance' | 'mixed'`.
  - `FinancialChargeListItem` estendido: `payer_type`, `insurance_provider_id`,
    `patient_insurance_id`, `copay_amount_cents`, `insurance_amount_cents`.
  - `CreateFinancialChargePayload` e `UpdateFinancialChargePayload` estendidos com os mesmos campos.
  - 20 novas funções no objeto `api`:
    `listInsuranceProviders`, `getInsuranceProvider`, `createInsuranceProvider`,
    `updateInsuranceProvider`, `updateInsuranceProviderStatus`,
    `listInsurancePlans`, `getInsurancePlan`, `createInsurancePlan`,
    `updateInsurancePlan`, `updateInsurancePlanStatus`,
    `listPatientInsurances`, `getPatientInsurance`, `createPatientInsurance`,
    `updatePatientInsurance`, `updatePatientInsuranceStatus`,
    `listServiceInsurancePrices`, `getServiceInsurancePrice`, `createServiceInsurancePrice`,
    `updateServiceInsurancePrice`, `updateServiceInsurancePriceStatus`.

- `frontend/src/views/Dashboard.tsx` — Adicionados:
  - `HeartHandshake` ao import de lucide-react.
  - `import { InsurancePanel }` de `InsurancePanel`.
  - `'convenios'` ao tipo `TabKey`.
  - `{ key: 'convenios', label: 'Convênios', icon: HeartHandshake }` no array `TABS` (sem `ownerOnly`).
  - Entrada `convenios` em `SECTION_INTRO`.
  - Bloco `{tab === 'convenios' && <InsurancePanel />}` no render.

- `frontend/src/components/FinancialPanel.tsx` — Adicionados:
  - Import de `FinancialPayerType`, `PatientInsuranceListItem`, `InsuranceProvider`.
  - Em `NewChargeForm`: estado `payerType`, `patientInsuranceId`, `copayStr`, `insuranceAmtStr`;
    queries `patientInsurancesQuery` (enabled quando `needsInsurance`) e `providersQuery`;
    helper `buildInsuranceFields` para montar payload; validação visual mixed;
    JSX: select de pagador, select de carteirinha (condicional), inputs copay/insurance (condicional).
  - Em `EditChargeForm`: mesmo padrão com estado inicializado da cobrança existente.

### Permissões na UI

| Seção | dono_clinica | secretaria | profissional |
|---|---|---|---|
| Painel Convênios (visível) | ✅ | ✅ | Card "Acesso restrito" (403) |
| Criar/editar operadoras/planos | ✅ | ❌ (botões ocultos) | ❌ |
| Criar/editar preços de serviço | ✅ | ❌ | ❌ |
| Criar/editar carteirinhas paciente | ✅ | ✅ | ❌ |
| Campo payer_type no Financeiro | ✅ | ✅ | N/A (sem acesso ao Financeiro) |

### PII na UI

- `member_number_masked` (`****1234`) exibido na lista — nunca o raw.
- Raw `member_number` carregado lazily via `useQuery` com `enabled: editing && !!token`.
  O query key inclui `'detail'` e `staleTime: 0` para sempre buscar fresco ao abrir edição.
- `cancelEdit()` chama `setRawMemberNumber('')` e limpa todos os campos PII antes de retornar.
- `holder_name` não exibido na lista — apenas em edit form (pré-preenchido do detail query).
- `valid_until` exibido como data formatada com chip "Vencida" vermelho se expirada,
  chip laranja se vence em ≤ 30 dias.
- Sem PII em `console.log`, `localStorage`, `sessionStorage` ou parâmetros de URL.

### React Query keys

| Recurso | Query key |
|---|---|
| Providers list | `['insurance', 'providers']` |
| Provider detail | `['insurance', 'providers', id]` |
| Plans list | `['insurance', 'plans']` (ou com `provider_id`) |
| Patient insurances list | `['patients', patientId, 'insurances']` |
| Patient insurance detail (edit) | `['patients', patientId, 'insurances', id, 'detail']` |
| Service prices list | `['insurance', 'service-prices']` |

### Gates finais (4.7C)

- `pnpm --filter frontend typecheck` ✅ · `build` ✅.
- `pnpm --filter backend typecheck` ✅ (backend inalterado).
- `git diff --check` rc=0 ✅.

**Sprint 4.7C entregue.** Gate para 4.7D aberto.

**Próxima sprint:** **4.7D** QA/Hardening Convênios v0.1.

---

## Sprint 4.7D — QA/Hardening + UX Polish Convênios v0.1 (2026-05-27)

### Objetivo

QA/hardening transversal de Convênios v0.1: correção de bugs de PII, UX simplificada para
público de clínica pequena, payer_type consciente no Financeiro, e correções de segurança.
Zero migration, zero novo endpoint.

### Agents usados

- **security-reviewer:** grep de PII em `InsurancePanel.tsx` e `FinancialPanel.tsx`.
  Achados: `holder_name` em list view (MED), `canWrite={true}` hardcoded (HIGH). Resto CLEAN.
- **Explore (InsurancePanel mid-sections):** leitura de PatientInsCard, PatientInsurancesSection,
  ServicePricesSection para planejamento dos subtabs.
- **Explore (MarkPaidModal + ChargeDetail):** confirmou que `MarkPaidModal` não recebia `payer_type`,
  que `ChargeDetailView` não exibia pagador, que a lista não tinha badge, e identificou o bug de
  troca de paciente não limpar `patientInsuranceId`.

### Bugs corrigidos

- **canWrite hardcoded** (`InsurancePanel.tsx:1890`): `canWrite={true}` → `canWrite={isOwner || papel === 'secretaria'}`.
  Antes, profissional_clinico que chegasse ao painel via 403 bypass teria botões de escrita visíveis.
- **holder_name em lista** (`InsurancePanel.tsx:~912`): `holder_name` exposto como PII em card de
  listagem. Removido — agora aparece apenas no formulário de edição (lazy-fetched via detail).
- **Bug de paciente** (`FinancialPanel.tsx:NewChargeForm`): trocar paciente no select de nova
  cobrança não limpava `patientInsuranceId`. Corrigido com `setPatientInsuranceId('')` no onChange.

### UX de Convênios

`InsurancePanel` reorganizado com 3 subtabs internas:
- **"Carteirinhas dos pacientes"** (tab default): fluxo mais frequente para secretária/dono.
- **"Convênios aceitos"**: operadoras + planos (configuração inicial, menos frequente).
- **"Preços de referência"**: preços serviço × operadora (configuração avançada, com banner
  "Nunca preenchidos automaticamente — valor sempre confirmado manualmente").

Subtabs implementadas com CSS no `InsurancePanel.module.css` (`.tabBar`, `.tabBtn`, `.tabBtnActive`,
`.tabContent`). Sem extração de subcomponentes — estrutura funcional mantida, risco de regressão evitado.

### Financeiro — payer_type awareness

**Charge list table:** nova coluna "Pagador" com `PayerBadge` (Particular / Convênio / Misto).
**Charge detail meta grid:** campo "Pagador" com `PayerBadge` + breakdown "(R$ X particular + R$ Y convênio)" quando mixed.
**MarkPaidModal:** recebe `payerType`, `copayAmountCents`, `insuranceAmountCents` via `MarkPaidModalLoader`
(que já busca o detalhe). Mudanças por tipo:
- `insurance`: título "Registrar recebimento do convênio"; nota azul "Use quando o valor tiver sido repassado pelo convênio"; `defaultMethod = bank_transfer`.
- `mixed`: título "Confirmar recebimento misto"; nota amarela com breakdown de valores + aviso "Financeiro v0.1 marca a cobrança inteira como recebida. Controle parcial fica para sprint futura."
- `private`/`null`: comportamento anterior mantido.

### Footer do Dashboard

- `"ClinicBridge · MVP administrativo"` → `"ClinicBridge · Clinic OS"`.
- `"Ferramenta administrativa. Não substitui prontuário ou sistema clínico."` →
  `"Gestão clínica e administrativa para consultórios. Não substitui avaliação profissional,
  assinatura digital válida ou obrigações legais específicas."`

### Arquivos modificados

- `frontend/src/components/InsurancePanel.tsx` — subtabs, canWrite fix, holder_name removido da lista
- `frontend/src/components/InsurancePanel.module.css` — `.tabBar/.tabBtn/.tabBtnActive/.tabContent` + estilos de pager badge (para uso futuro)
- `frontend/src/components/FinancialPanel.tsx` — PayerBadge, coluna na lista, detalhe, MarkPaidModal payer-aware, bug paciente
- `frontend/src/components/FinancialPanel.module.css` — estilos `.payerBadge/.payerPrivate/.payerInsurance/.payerMixed/.modalPayerNote/.modalPayerNoteMixed/.modalPayerBreakdown`
- `frontend/src/views/Dashboard.tsx` — footer copy

### Gates finais (4.7D)

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (2.65s)
- `pnpm --filter backend typecheck` ✅ (backend inalterado)
- `git diff --check` rc=0 ✅

**Sprint 4.7D entregue.** Fase 4.7 (Convênios v0.1) completa. Gate para 4.8A aberto.

**Próxima sprint:** **4.8A** ADR 0017 Estoque v0.1.

---

## Sprint 4.8A — ADR 0017 Estoque v0.1 (2026-05-27)

### Objetivo

Docs/ADR-only. Criar ADR 0017 e `docs/inventory-v0-scope.md` definindo o escopo
do módulo de Estoque básico v0.1. Atualizar CLAUDE.md, project-state, sprint-history,
roadmap-next-phase e product-clinic-os-roadmap. Zero código, schema, migration ou env.

### Decisão central (ADR 0017)

**Estoque v0.1 = controle manual de entrada/saída de materiais e insumos.**

Entidades:
- `inventory_items` — catálogo de itens (name, category, unit, current_quantity,
  minimum_quantity, location, notes, active). UNIQUE INDEX `(clinica_id, lower(btrim(name)))`.
- `inventory_movements` — registro append-only de movimentações (movement_type:
  `entry|exit|adjustment|loss`; quantity_delta; reason nullable; created_by_user_id).

Permissões: dono_clinica CRUD completo; secretaria registra movimentos + lê estoque;
profissional_clinico bloqueado.

### Invariantes-chave

- **Append-only em `inventory_movements`** — sem UPDATE/DELETE. Correção = novo ajuste.
- **Humano decide toda movimentação** — sem dedução automática por serviço/agendamento.
- **Sem PII de paciente** — `inventory_movements` nunca referencia paciente.
- **`notes`/`reason` nunca em audit** — audit metadata-only: `item_id`, `movement_type`,
  `quantity_delta`.
- **Concorrência:** `SELECT FOR UPDATE` em transação; rejeitar movimento que causaria
  `current_quantity < 0` → 409 `inventory_quantity_insufficient`.
- **Medicamentos controlados (SNGPC/ANVISA) fora do v0.1** — ADR futura obrigatória.

### Arquivos criados

- `docs/adr/0017-inventory-v0.md` — ADR 0017 Estoque v0.1 (12 seções).
- `docs/inventory-v0-scope.md` — escopo operacional + checklist 4.8B/C/D.

### Arquivos modificados

- `CLAUDE.md` — sprint atual → 4.8A; "O que NÃO existe" remove 4.8A; próximas → 4.8B.
- `docs/project-state.md` — entrada Sprint 4.8A.
- `docs/sprint-history.md` — esta entrada.
- `docs/roadmap-next-phase.md` — rows 4.7C ✅, 4.7D ✅, 4.8A ✅ adicionados.
- `docs/product-clinic-os-roadmap.md` — Fase 4.7 completa ✅; Fase 4.8 ADR 0017 aceita.

### Gates finais (4.8A)

- `git diff --check` rc=0 ✅
- `git status --short` confirma apenas arquivos docs/CLAUDE.md ✅
- **Zero mudanças de código, schema, migration ou env.**

**Sprint 4.8A entregue.** Gate para 4.8B aberto.

---

## Sprint 4.8B — Backend Estoque v0.1

**Gate de entrada:** ADR 0017 aceita (Sprint 4.8A) ✅.

### Escopo

Backend completo do módulo de Estoque v0.1 (ADR 0017). Sem frontend (4.8C).
Módulo administrativo/operacional — usa `requireRole`, NÃO `requireClinicalRole`.

### Migration

`20260607000000_inventory_v0` (batch 18 — única, aditiva):
- Tabela `inventory_items`: `id (uuid PK)`, `clinica_id (FK)`, `name (1..120)`,
  `category (≤80, nullable)`, `unit (1..40)`, `current_quantity (integer DEFAULT 0 ≥ 0)`,
  `minimum_quantity (integer DEFAULT 0 ≥ 0)`, `location (≤120, nullable)`,
  `notes (≤500, nullable)`, `active (boolean DEFAULT true)`, `created_at`, `updated_at`.
  CHECK `char_length(btrim(name)) >= 1`. UNIQUE INDEX `(clinica_id, lower(btrim(name)))`.
- Tabela `inventory_movements` (append-only): `id (uuid PK)`, `clinica_id (FK)`,
  `item_id (FK ON DELETE CASCADE)`, `movement_type CHECK IN ('entry','exit','adjustment','loss')`,
  `quantity_delta (integer ≠ 0)`, `reason (≤300, nullable)`,
  `created_by_user_id (FK ON DELETE SET NULL — nullable por design)`, `created_at`.
  Índices: `(clinica_id, item_id)`, `(clinica_id, movement_type)`.
- Índices parciais tenant-scoped: `(clinica_id, active)`, `(clinica_id, minimum_quantity, current_quantity)`.

### Arquivos criados

- `backend/migrations/20260607000000_inventory_v0.ts` — migration 18.
- `backend/src/dao/inventoryDao.ts` — `inventoryItemDao` + `inventoryMovementDao`.
- `backend/src/services/inventoryService.ts` — lógica de negócio + `buildInventoryActor`.
- `backend/src/controllers/inventoryController.ts` — handlers HTTP.
- `backend/src/routes/inventory.ts` — pipeline `patientsRateLimit + requireAuth + requireClinic + requireRole`.

### Arquivos modificados

- `backend/src/types/db.d.ts` — `InventoryItemRow`, `InventoryMovementRow`, `InventoryMovementType`.
- `backend/src/app.ts` — `inventoryRouter` registrado.
- `backend/src/config/logger.ts` — `reason` adicionado à redaction list.

### Endpoints (9 rotas)

| Método | Path | Permissão |
|---|---|---|
| GET | `/inventory/items` | operator (owner + sec) |
| POST | `/inventory/items` | admin (owner only) |
| GET | `/inventory/items/:id` | operator |
| PATCH | `/inventory/items/:id` | admin |
| PATCH | `/inventory/items/:id/status` | admin |
| GET | `/inventory/items/:id/movements` | operator |
| POST | `/inventory/items/:id/movements` | operator |
| GET | `/inventory/movements` | operator |

### Permissões

- `dono_clinica` — CRUD completo + movimentos + leitura.
- `secretaria` (pura ou gestor_clinica) — movimentos + leitura.
- `profissional_clinico` — **bloqueado** (papel='secretaria' no JWT, mas `buildInventoryActor`
  carrega grants de `user_clinical_roles` e rejeita se tem grant `profissional_clinico`).
- `admin_sistema` — 403 `no_clinic_context` via `requireClinic`.

### Invariantes de segurança

- **Tenant-scoped:** todo DAO filtra `clinica_id`. Sem `listAll`. Cross-tenant → 404.
- **Append-only em movimentos:** sem `updateMovement`/`deleteMovement`.
- **`current_quantity` protegido:** atualizado **somente** dentro de transação com
  `SELECT FOR UPDATE` em `createMovement`. `updateItem` nunca toca `current_quantity`.
- **Sign-per-type:** `entry > 0`; `exit < 0`; `loss < 0`; `adjustment ≠ 0`.
- **Quantidade negativa bloqueada:** `new_quantity < 0` → 409 `inventory_quantity_insufficient`.
- **Audit metadata-only:** `acao = inventory.{item|movement}.{create|update|status}.success`;
  `recurso_id = entity.id`. `reason`, `notes`, `name`, `location`, `category` **nunca** em audit.
- **Audit de movimento dentro da transação** — falha aborta o movimento (nunca deixar
  `current_quantity` alterado sem evidência).
- **Logger redaction:** `reason` e `notes` redactados nas entradas de log.

### Smoke tests

**51/51 PASS** (script Python `/tmp/smoke_4_8b.py`):
- A (8): auth sem token, admin_sistema, owner/sec/gestor/profissional, movement profissional.
- B (9): owner CRUD — criar, listar, detalhar, editar, qty inalterada, duplicado, case-insensitive, desativa, reativa.
- C (5): secretaria — lista, registra movimento, não cria/edita/desativa item.
- D (8): movimentos/qty — entry, exit, loss, adj+, adj-, histórico por item, lista geral, low_stock.
- E (17): validações — name vazio, whitespace, unit ausente/vazio, notes>500, reason>300,
  qty_delta=0, entry negativo, exit positivo, loss positivo, exit>estoque, adj>estoque,
  type inválido, item inativo, limit>100, UUID inválido, UUID inexistente.
- F (3): PII — sem campos proibidos em item, movimentos, acesso secretaria.
- G (1): cleanup — item smoke desativado (soft-delete).

### Checks finais

- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend build` ✅
- `pnpm --filter backend migrate:status` 18/0 ✅
- `pnpm --filter frontend typecheck` ✅
- `git diff --check` rc=0 ✅

### Ressalvas / TODOs futuros

- `created_by_user_id` nullable na migration (ON DELETE SET NULL) — service sempre preenche; NULL em histórico indica usuário removido da clínica.
- Sem frontend (4.8C abre o gate).
- Import CSV de inventário inicial — deferido para v0.2.
- Notificação push de estoque mínimo — sprint futura.
- Medicamentos controlados (SNGPC/ANVISA) — ADR futura obrigatória.

**Sprint 4.8B entregue.** Gate para 4.8C (Frontend Estoque) aberto.

---

## Sprint 4.8C — Frontend Estoque v0.1

**Gate de entrada:** Backend Estoque v0.1 (Sprint 4.8B) ✅.

### Escopo

Frontend do módulo de Estoque v0.1 (ADR 0017). Consome os 9 endpoints da 4.8B.
**Zero backend, zero migration, zero schema.** Frontend apenas.

### Arquivos criados

- `frontend/src/components/InventoryPanel.tsx` — painel completo.
- `frontend/src/components/InventoryPanel.module.css` — estilos dark-theme responsivos.

### Arquivos modificados

- `frontend/src/services/api.ts` — 8 tipos + 8 funções de API (ver abaixo).
- `frontend/src/views/Dashboard.tsx` — TabKey `estoque`, aba "Estoque" (ícone `Boxes`),
  `SECTION_INTRO`, render `<InventoryPanel />`.

### API frontend adicionada

Tipos: `InventoryMovementType`, `InventoryItem`, `InventoryMovement`,
`ListInventoryItemsParams`, `ListInventoryMovementsParams`, `CreateInventoryItemPayload`,
`UpdateInventoryItemPayload`, `CreateInventoryMovementPayload`.

Funções: `listInventoryItems`, `getInventoryItem`, `createInventoryItem`,
`updateInventoryItem`, `updateInventoryItemStatus`, `listInventoryItemMovements`,
`createInventoryMovement`, `listInventoryMovements`.

### Componentes (InventoryPanel.tsx)

- `InventoryPanel` (principal): hero (Itens ativos · Estoque baixo via query de resumo
  independente dos filtros), filtros (busca/categoria/status/low-stock), lista, role-note.
- `ItemCard`: nome, categoria, qtd + unidade, mínimo, local, badges (Estoque baixo / Inativo),
  ações (Registrar movimento · Histórico · Editar · Desativar/Reativar), edição inline.
- `MovementForm` (inline): tipo (Entrada/Saída/Ajuste/Perda·descarte), magnitude + direção,
  observação administrativa, pré-visualização "Estoque atual → Após o movimento", bloqueio
  visual de estoque negativo.
- `MovementHistory` (inline): lista de movimentos por item (data PT-BR, tipo, delta com sinal
  e unidade, observação administrativa quando presente). NUNCA renderiza `created_by_user_id`
  (UUID sem nome — backend não devolve nome do responsável no v0.1).
- `CreateItemForm`: criação owner-only.

### Permissões na UI

- `dono_clinica`: cria/edita/desativa item + registra movimento + histórico.
- `secretaria`: registra movimento + histórico + leitura; botões de CRUD de item ocultos;
  role-note explica a limitação.
- `profissional_clinico`: lista 403 → card "Acesso restrito" (não derruba a tela).
- Backend é a defesa real; a UI só oculta controles.

### Segurança / LGPD

- `current_quantity` **nunca** editável direto — sem campo no formulário de item; só muda
  por movimento (transação no backend).
- Movimento usa magnitude + direção: usuário nunca digita sinal manualmente (Ajuste tem
  toggle Aumentar/Reduzir).
- `notes`/`reason` são texto administrativo: aviso anti-dado-clínico em todos os formulários;
  nunca em `console.log`, `localStorage`/`sessionStorage` ou URL.
- Sem `dangerouslySetInnerHTML`. Histórico nunca renderiza UUID.
- Erros mapeados para PT-BR amigável: `inventory_item_name_duplicated` → "Já existe um item
  com esse nome."; `inventory_quantity_insufficient` → "O movimento deixaria o estoque
  negativo."; `inventory_item_inactive` → "Este item está inativo…"; `forbidden_role`/403 →
  card "Acesso restrito".

### React Query

- Keys sob `['inventory', ...]`: `['inventory','items',{filtros}]`,
  `['inventory','items','summary']`, `['inventory','item',id,'movements']`.
- Invalidação ampla (`['inventory']`) após create/update/status/movement — sem reload de página.

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (warning de chunk size pré-existente, não relacionado)
- `git diff --check` rc=0 ✅
- `git status --short` — apenas 4 arquivos frontend (2 modificados + 2 criados); **backend intocado**.
- Greps de segurança no novo componente: `console.*` / `localStorage` / `sessionStorage` /
  `dangerouslySetInnerHTML` = 0 (só aparecem no comentário de cabeçalho).

### Ressalvas / TODOs futuros

- **Validação visual no navegador pendente** (ambiente sem browser, igual às sprints frontend anteriores).
- Hero "Itens ativos"/"Estoque baixo" derivado de uma query com `limit=100`; clínicas com
  >100 itens ativos teriam contagem subestimada (aceitável no v0.1 para consultório pequeno).
- Histórico não mostra "responsável" — backend devolve só `created_by_user_id` (UUID), e a
  política é nunca renderizar UUID. Nome do responsável é melhoria futura (exigiria JOIN no backend).
- Badge "Estoque baixo" segue `item.low_stock` do backend (current < minimum && minimum > 0),
  não `<=` — consistente com o filtro `low_stock`.
- Sem import CSV, sem baixa automática por atendimento, sem custo/lote/validade (fora do v0.1).

**Sprint 4.8C entregue.** Gate para 4.8D (QA/Hardening Estoque) aberto.

**Próxima sprint:** **4.8D** QA/Hardening Estoque v0.1.

---

## Sprint 4.8D — QA/Hardening Estoque v0.1 (2026-05-27)

**Gate de entrada:** Frontend Estoque v0.1 (Sprint 4.8C) ✅.

### Escopo

QA/Hardening final do módulo de Estoque v0.1. Fecha a Fase 4.8.
**Zero backend, zero migration, zero schema, zero novos componentes.** Revisão e validação apenas.

### Revisão UX/estado do InventoryPanel

Verificação dos fluxos principais em `InventoryPanel.tsx`:

- Item criado aparece na lista sem reload (invalidação ampla `['inventory']`) ✅
- Movimento atualiza `current_quantity` sem reload ✅
- Histórico atualiza após movimento (mesma invalidação cobre `['inventory','item',id,'movements']`) ✅
- Filtros (busca/categoria/status/low-stock) funcionam sem quebrar lista ✅
- Status ativo/inativo funciona; item inativo não exibe botão "Registrar movimento" ✅
- Secretaria: botões Criar/Editar/Desativar ocultos na UI (`isOwner` gate) ✅
- Profissional: 403 na listagem → card "Acesso restrito" (não derruba a tela) ✅
- Cancelar edição reset todos os campos (incluindo `editNotes`) via `cancelEdit()` ✅
- Cancelar movimento: `MovementForm` é desmontado → estado interno zerado ✅
- Troca de tipo de movimento: `delta` recalculado por `useMemo([magnitudeValue, type, adjustDirection])` ✅
- Saída/Perda > estoque: botão desabilitado + aviso visual (`wouldGoNegative`) ✅
- Item inativo bloqueia movimento na UI (condição `canMove && item.active` no botão e render) ✅
- Erros do backend exibidos de forma amigável PT-BR (`inventoryErrMsg`) ✅

### Verificações de segurança / LGPD

Greps realizados em `InventoryPanel.tsx` e `api.ts` (seção inventory):

- `console.log` de payload = 0 ✅ (só no comentário de cabeçalho)
- `localStorage` / `sessionStorage` = 0 ✅
- `dangerouslySetInnerHTML` = 0 ✅
- `patient_id` na seção inventory = 0 ✅ (ocorrências em api.ts são de módulos anteriores)
- `notes`/`reason` em URL = 0 ✅ (parâmetros de movimento e item nunca vão para query string)
- UUID `created_by_user_id` renderizado = 0 ✅ (histórico exibe apenas data, tipo, delta, reason)
- `current_quantity` sem campo editável direto no formulário de item ✅
- Avisos anti-dado-clínico presentes: formulário de item, formulário de movimento, form de criação ✅
- Classes CSS: todas as 70+ classes em `styles.*` têm definição correspondente no `.module.css` ✅

### Sanity smoke (live backend)

```
Owner   GET /inventory/items   → 200  (4 itens existentes) ✅
Profissional GET /inventory/items → 403 ✅
Anônimo GET /inventory/items   → 401 ✅
Owner   POST /inventory/items  → 201  (item QA-4.8D criado) ✅
Owner   POST movement entry+10 → 201 ✅
Owner   PATCH .../status active=false → 200 ✅
Owner   GET item deactivated   → active=false ✅
```

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (warning de chunk size pré-existente, não relacionado)
- `pnpm --filter backend typecheck` ✅
- `pnpm --filter backend migrate:status` 18/0 ✅
- `git diff --check` rc=0 ✅
- `git status --short` — árvore limpa ✅

### Caveats documentados

- **Regra `low_stock`:** `current < minimum && minimum > 0`. Alerta ativo somente abaixo do
  mínimo — item exatamente no mínimo não dispara (comportamento intencional v0.1;
  possível ajuste para `<=` em v0.2 se houver demanda operacional).
- **Hero `limit=100`:** a query de resumo (Itens ativos / Estoque baixo) usa `limit=100`.
  Consultórios com >100 itens ativos teriam contagem subestimada no hero. Aceitável no v0.1
  (escopo = consultório pequeno); v0.2 pode introduzir endpoint de agregação.
- **Responsável não exibido no histórico:** backend devolve `created_by_user_id` (UUID);
  a política é nunca renderizar UUID. Nome do responsável exige JOIN no backend — melhoria futura.
- **Sem import CSV / baixa automática / custo / lote / validade:** fora do v0.1.
- **Medicamentos controlados (SNGPC/ANVISA):** permanentemente fora do v0.1 (ADR futura).

**Sprint 4.8D entregue.** Fase 4.8 (Estoque v0.1) completa. Gate para próxima fase aberto.

---

## Sprint 4.9A — Super Revisão Geral (2026-05-27)

**Tipo:** Revisão horizontal — sem código novo, sem migration, sem novos endpoints.

**Objetivo:** Revisão completa de todos os módulos entregues (4.4–4.8) antes de avançar para a próxima fase do Clinic OS.

### Agents executados (7)

1. UX/Produto — copy, labels, PII na UI
2. Segurança/LGPD — PII em logs, SQL, audit, rate limit
3. Permissões/Tenant Isolation — pipeline de rotas, cross-tenant, roles
4. Financeiro/Convênios/Serviços — regras de negócio, invariantes
5. Prontuário/Documentos Clínicos — regras clínicas críticas, ADR 0010/0011
6. Arquitetura/Manutenibilidade Frontend — cache TanStack Query, TypeScript
7. QA/Docs/Piloto — consistência de docs, prontidão para piloto

### Resultado

**P0:** Nenhum.
**P1:** 2 de copy (corrigidos) + 2 de cache frontend (backlog 4.9B).
**P2:** 8 achados de melhoria (backlog).
**P3:** 3 achados de polish (backlog).

### Correções aplicadas

| Arquivo | Correção |
|---------|---------|
| `InsurancePanel.tsx:1373` | "funcionários administrativos" → "funcionário(a) com acesso administrativo" + texto positivo |
| `InsurancePanel.tsx:1855–1858` | Card restrito padronizado com InventoryPanel |
| `ReportsPanel.tsx:438` | Hint "oportunidade de retorno" removido |

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `pnpm --filter backend typecheck` ✅
- `migrate:status` 18/0 ✅
- `git diff --check` rc=0 ✅

**Sprint 4.9A entregue.** Relatório completo: `docs/super-review-4-9A.md`. Gate para 4.9B (cache fix TanStack Query) aberto.

---

## Sprint 4.9B — Fix cache TanStack Query (2026-05-27)

**Gate de entrada:** Sprint 4.9A — P1-ARCH-1 e P1-ARCH-2 identificados.

### Problema

`token` JWT incluído em queryKeys em 3 componentes (11 queries total). Token raramente muda, mas cria uma nova entrada de cache cada vez que o token rotaciona, causando cache miss desnecessário e acúmulo de entradas órfãs. Adicionalmente, `filters` como objeto `useMemo` na `listQuery` do FinancialPanel quando poderia ser expresso com primitivos escalares diretamente na key.

### Correções aplicadas

**FinancialPanel.tsx — 6 queryKeys:**
- `summaryQuery`: `['financial', 'summary', filterDateFrom, filterDateTo, token]` → sem token
- `listQuery`: `['financial', 'charges', filters, token]` → `['financial', 'charges', filterStatus, filterDateFrom, filterDateTo]`
- `detailQuery` (ChargeDetailView): sem token
- `detailQuery` (EditLoader): sem token
- `detailQuery` (MarkPaidModalLoader): sem token
- `patientsQuery`: sem token (já tinha `enabled: !!token`)

**ReportsPanel.tsx — 4 queryKeys + comentário:**
- `apptQuery`, `finQuery`, `patQuery`, `agFinQuery`: token removido de todos
- Comentário "NÃO PARA: queryKey inclui token para invalidar quando usuário troca" removido (raciocínio incorreto — `enabled: !!token && isPapelAllowed` já cobre o caso; na re-auth o componente re-renderiza)

**AdministrativeSchedulePanel.tsx — 1 queryKey:**
- `financialChargesQuery`: `[...FINANCIAL_BADGE_KEY, token]` → `FINANCIAL_BADGE_KEY` (já tinha `enabled: !!token && isPapelFinanceiro`)

### Invariantes mantidas

- `queryFn` continua recebendo `token` como argumento em todos os casos
- Invalidações amplas `['financial']` e `APPOINTMENTS_KEY` continuam funcionando (prefixo não muda)
- `enabled: !!token` já existia nas queries que precisam de proteção (patientsQuery, financialChargesQuery, reports)
- Zero mudanças de backend, schema, regras de negócio, UX ou contrato de API

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (warning de chunk pré-existente, irrelevante)
- `git diff --check` rc=0 ✅
- Grep `queryKey.*token`: 0 ocorrências ✅

**Sprint 4.9B entregue.** P1-ARCH-1 e P1-ARCH-2 da revisão 4.9A resolvidos.

---

## Sprint 4.9C — UX Polish / Landing / Demo Prep (2026-05-27)

**Tipo:** Polish de copy e landing page. Zero backend, zero migration, zero regras de negócio.

### Objetivo

Atualizar copy pública e interna para refletir o produto atual (Clinic OS modular com 10+ módulos),
substituindo referências ao "MVP administrativo de migração" que não representam mais o estado do produto.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `Hero.tsx` | eyebrow "MVP administrativo" → "Clinic OS modular"; h1 e subtitle refletindo plataforma completa |
| `HowItWorks.tsx` | Seção "Do arquivo antigo à exportação limpa" → "à clínica organizada"; 4 steps refletindo jornada completa (migração → pacientes → financeiro/convênios → relatórios) |
| `Roadmap.tsx` | Capabilities atualizadas: 10 módulos entregues; eyebrow "Piloto" → "Módulos disponíveis"; lead honesto (sem telemedicina, TISS, ICP-Brasil) |
| `Footer.tsx` | "MVP focado em migração" → "gestão modular para clínicas"; "Piloto administrativo · v0.1" → "Clinic OS · v0.1 · piloto" |
| `Security.tsx` | scopeNote: "Não armazena prontuário" → "módulo clínico com roles restritas e auditoria STRICT" |
| `FinalCTA.tsx` | Headline e subtitle refletindo plataforma completa, não só migração |
| `Validation.tsx` | "Valide sua migração antes do MVP completo" → "Comece com uma análise"; "Entrar na lista de espera" → "Criar conta" |
| `AuthAside.tsx` | Item 5: "Não é prontuário clínico" (FileX2) → "Prontuário com regras restritas" (ClipboardList); texto honesto sobre v0.1 com restrições |
| `Dashboard.tsx` | Card início: menciona todos os módulos; "Checklist do MVP" → "Módulos disponíveis" (3 ✅ + 1 pendente produção); subtítulo segurança atualizado |

### O que ficou para backlog

- DashboardMockup.tsx — ainda mostra fluxo de migração; é o mockup visual da landing, mudança requer redesign de conteúdo
- Header.tsx nav item "Roadmap" — label levemente desatualizado; mudança simples mas sem urgência
- Componentes gigantes (FinancialPanel, InsurancePanel) — backlog de refatoração futuro
- Error Boundaries — backlog separado

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 4.9C entregue.** Produto pronto para refinamento de copy e demo prep (4.9C.1).

---

## Sprint 4.9C.1 — Ajuste de copy + seção de planos (2026-05-27)

**Tipo:** Copy polish + novo componente estático. Zero backend, zero migration, zero regras de negócio.

**Problema:** Copy da 4.9C ficou técnica demais para o público-alvo (clínica pequena / consultório):
termos como "Clinic OS modular", "TISS", "ICP-Brasil", "auditoria STRICT", "controle de acesso por função"
apareciam cedo demais. CTA "Ver demonstração" sem página/vídeo de destino.

### Mudanças de copy

| Componente | Antes | Depois |
|------------|-------|--------|
| Hero eyebrow | "Clinic OS modular · piloto v0.1" | "Para clínicas e consultórios · piloto v0.1" |
| Hero h1 | "Gestão integrada para clínicas e consultórios" | "Organize sua clínica em um só lugar" |
| Hero subtitle | mencionava "plataforma modular / auditoria" | "Controle pacientes, agenda, cobranças, convênios, estoque e documentos em uma plataforma segura" |
| Hero CTA primário | "Ver demonstração" (href="#produto") | "Criar conta" (Link to="/register") |
| HowItWorks lead | técnico | "Quatro passos que cabem na rotina de qualquer consultório" |
| HowItWorks steps | labels longos | diretos: "Importe ou cadastre", "Organize a agenda", "Registre cobranças", "Acompanhe relatórios" |
| Roadmap eyebrow/lead | "Módulos disponíveis" + TISS/ICP-Brasil | "O que está incluído" + lead limpo |
| Security lead | CIAA/STRIDE/jurídico | "Cada clínica vê apenas seus dados. Acesso por perfil, MFA e registros" |
| Security scopeNote | "auditoria STRICT / TISS / sistema homologado" | "Prontuário em evolução. Consulte requisitos regulatórios da sua área." |
| FinalCTA | "Ver demonstração" primário | "Criar conta" primário |
| FinalCTA subtitle | "auditoria, isolamento por função" | "a plataforma cresce junto com a clínica" |
| Header nav | "Roadmap" | "Funcionalidades" + novo item "Planos" |
| Footer meta | "Clinic OS · v0.1 · piloto" | "v0.1 · piloto" |

### Novo: PricingPlans.tsx + PricingPlans.module.css

3 planos estáticos:
- **Essencial:** Pacientes, agenda, serviços, financeiro, relatórios
- **Profissional** (destacado): tudo + convênios, estoque, documentos, MFA, relatórios gerenciais
- **Piloto assistido:** importação, deduplicação, configuração, treinamento, acompanhamento

Todos os CTAs apontam para /register. Sem preço numérico. Nota: "Sob consulta durante o piloto."
CSS usa variáveis do design system existente (--text-0/1/2, --surface-border, --cyan, --success).

### Validation removida do fluxo da landing

A seção Validation foi removida do render de Landing.tsx (CTAs "Solicitar análise" e "Criar conta"
estão cobertos por Hero, PricingPlans e FinalCTA). O componente Validation.tsx permanece no projeto
para eventual reuso.

### Checks finais

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 4.9C.1 entregue.** Validação visual realizada — ajustes finais em 4.9C.2.

---

## Sprint 4.9C.2 — Microcorreção landing (2026-05-27)

**Tipo:** Microcorreção de copy e CTA. Zero backend, zero migration.

### Mudanças

**Header.tsx:**
- Importado `Link` de `react-router-dom`.
- CTA `<a href="#produto">Ver demonstração</a>` → `<Link to="/register">Criar conta</Link>`.
- `aria-label` atualizado; `ctaLong` = "Criar conta", `ctaShort` = "Entrar".

**PricingPlans.tsx:**
- Essencial: itens → "Pacientes e agenda", "Serviços da clínica", "Cobranças básicas", "Relatórios simples".
- Profissional: itens → "Tudo do Essencial", "Convênios e carteirinhas", "Estoque e insumos", "Documentos e auditoria", "Relatórios gerenciais".
- Piloto assistido: desc simplificada; CTA "Começar piloto" → "Começar piloto assistido".

### Backlog registrado

- **Demo guiada:** página/vídeo com tour completo do produto (pacientes, agenda, financeiro, convênios, estoque, relatórios, prontuário com dados fake, importação). Sprint futura dedicada.
- **DashboardMockup redesign:** mockup da landing ainda mostra fluxo de migração. Redesign futuro deve mostrar Clinic OS mais completo ou carrossel de módulos.

### Checks

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 4.9C.2 entregue.** Fase 4.9 (Super Revisão + Correções técnicas + UX Polish + Landing) concluída.

---

## Sprint 5.0A — Plano de Piloto Controlado (2026-05-27)

**Tipo:** Docs-only. Zero código, zero migration, zero backend/frontend.

### Entregáveis

**`docs/pilot-controlled-plan.md`** — 11 seções:
1. Objetivo do piloto (valida usabilidade; não valida produção real)
2. Contexto do cenário (médico, psicóloga, secretária, futuro odontologia)
3. Fases 1/2/3 (sintéticos → anonimizados → produção real)
4. Módulos por prioridade (alta: pacientes, agenda, serviços, financeiro, convênios, estoque, relatórios; controlado/fake: prontuário, documentos)
5. 50+ fluxos de teste (auth/MFA, pacientes, agenda, financeiro, convênios, estoque, relatórios, clínico)
6. Critérios de sucesso (8 indicadores)
7. Critérios de parada (10 condições de stop)
8. Regras LGPD/dados (obrigatório/proibido na Fase 1; regras para Fase 2)
9. Roteiro de demonstração (28 minutos, 11 tópicos)
10. Backlog pós-piloto (5.0B Demo Dataset → 5.0C Página Demo → 5.1A Produção)
11. Referências cruzadas para outros docs

**`docs/pilot-go-no-go-checklist.md`** — 5 checklists + decisão:
- Checklist 1: Preparação do ambiente
- Checklist 2: Permissões por papel
- Checklist 3: Logs e auditoria
- Checklist 4: PII na UI
- Checklist 5: Fluxos críticos
- Go/No-Go para Fase 1 (sintéticos): ✅ **GO** após confirmar checklists
- Go/No-Go para Fase 2 (anonimizados): condicionado ao pós-Fase 1
- Go/No-Go para Fase 3 (dados reais): ❌ **NO-GO** até 5.1A+
- Checklist pós-piloto

### Escopo do piloto

**Incluído (Fase 1):**
- Pacientes, agenda, serviços, equipe, importação CSV/XLSX
- Financeiro (particular, convênio, misto)
- Convênios e carteirinhas
- Estoque e insumos
- Relatórios gerenciais
- Prontuário v0.1 e documentos v0.1 (apenas dados fake)
- MFA, audit, read audit clínico

**Excluído:**
- Telemedicina, TISS real, ICP-Brasil, WhatsApp automático
- Medicamentos controlados / SNGPC / ANVISA
- Checkout de planos, billing real
- Produção AWS com dados reais (sprint 5.1A+)

### Checks

- `git diff --check` rc=0 ✅

**Sprint 5.0A entregue.** Gate para 5.0B (Demo Dataset / seed sintético completo) aberto.

---

## Sprint 5.0B — Demo Dataset / Seed Sintético (2026-05-27)

**Tipo:** Backend only — novo script de seed. Zero migration, zero schema, zero frontend.

### Entregáveis

**`backend/scripts/seed-demo-data.ts`** — script completo com:
- Guard `NODE_ENV=production` → exit 1
- Guard `ALLOW_DEMO_SEED=true` obrigatório → exit 2 sem a flag
- Idempotência: skip se demo patients existem; avisa para rodar clean first
- `resolveOrCreateDemoClinic()`: upsert idempotente para estado parcial (owner orphan)
- Função `seed()`: cria usuários, roles, profissionais, serviços, pacientes, agenda, financeiro, convênios, estoque
- Função `clean()`: NULL clinica_id users → delete clinic (CASCADE) → delete users

**`backend/package.json`** — novos scripts:
```json
"seed:demo:full": "tsx scripts/seed-demo-data.ts seed",
"seed:demo:full:clean": "tsx scripts/seed-demo-data.ts clean"
```

**`docs/demo-dataset.md`** — documentação completa com tabelas de dados criados, guards, comandos, marcadores e o que NÃO faz.

### Dados demo criados

| Entidade | Quantidade |
|----------|-----------|
| Usuários demo | 5 (`demo.*@clinicbridge.local`) |
| Profissionais da agenda | 3 |
| Serviços | 6 |
| Links profissional×serviço | 6 |
| Pacientes sintéticos | 20 (18 ativos + 2 arquivados) |
| Agendamentos | 20 (ontem + hoje + 7 dias) |
| Cobranças | 12 (particular/convênio/misto/vencida/cancelada) |
| Operadoras de convênio | 2 |
| Planos | 3 |
| Preços de referência | 3 |
| Carteirinhas de pacientes | 3 |
| Itens de estoque | 7 (2 com baixo estoque) |
| Movimentos de estoque | 9 |

### Validações realizadas

- ✅ Guard sem flag: `exit 2` com mensagem clara
- ✅ Seed rodou com sucesso: `[seed:demo:full] ✅ Clínica Demo Aurora`
- ✅ Idempotência: re-run avisa e sai sem duplicar
- ✅ Clean: remove clínica demo + usuários demo sem erro
- ✅ Smoke users intactos: 5 `smoke.*@clinicbridge.local` preservados
- ✅ `pnpm --filter backend typecheck` rc=0
- ✅ `migrate:status` 18/0 (zero novas migrations)
- ✅ `git diff --check` rc=0

### Não incluído neste seed

- Prontuário fake / encontros clínicos → documentado para 5.0B.1
- Documentos médicos fake → documentado para 5.0B.1 ou 5.0C

**Sprint 5.0B entregue.** Gate para 5.0B.1 (prontuário fake no seed) aberto.

---

## Sprint 5.0B.1 — Prontuário e Documentos Fake no Seed Demo (2026-05-27)

**Tipo:** Extensão de script de seed. Zero migration, zero schema, zero frontend. Arquivo único alterado.

### Dados clínicos adicionados

**3 clinical_encounters:**
- Encounter 1: patient[3] Ricardo (medicina) — linked ao apptIds[6] (completed -1d), attending = `demo.medico`
- Encounter 2: patient[10] Amanda (psicologia) — linked ao apptIds[7] (completed -1d), attending = `demo.psicologa`
- Encounter 3: patient[0] Mariana (medicina) — sem link de appointment, attending = `demo.medico`

**3 clinical_encounter_notes (1 por encounter):**
- Enc 1: `chief_complaint`, `anamnesis`, `evolution`, `plan` — sem internal_note
- Enc 2: `chief_complaint`, `evolution`, `internal_note` — demonstra que nota interna é visível só para autor
- Enc 3: `chief_complaint`, `plan`

Marcador obrigatório em todos os campos: `"DADO CLÍNICO FICTÍCIO PARA DEMONSTRAÇÃO."`

**1 clinical_document:**
- `doc_type`: `declaration`
- `title`: "Declaração de comparecimento (FICTÍCIA — SEM VALIDADE)"
- `status`: `finalized` (com `finalized_at` e `finalized_by_user_id`)
- Marcador obrigatório no body: `"DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO — SEM VALIDADE CLÍNICA OU LEGAL."`

### Clean atualizado

Antes da cascade da clínica, o clean agora deleta explicitamente (ordem FK-safe):
1. `clinical_encounter_notes` (RESTRICT no encounter_id)
2. `clinical_documents` (FK para encounter/patient)
3. `clinical_encounters` (RESTRICT no patient_id e attending_user_id)

### Validações realizadas

- ✅ Guard sem flag: exit 2
- ✅ Guard NODE_ENV=production: env.ts recusa no boot
- ✅ Clean: 0 encounters · 0 notes · 0 docs (seed anterior não tinha clínico)
- ✅ Seed: 3 encounters · 3 notes · 1 doc · marcadores todos presentes
- ✅ Rerun: skip sem duplicar
- ✅ Smoke users: 5/5 intactos
- ✅ `typecheck` · `build` · `migrate:status 18/0` · `git diff --check` rc=0

**Sprint 5.0B.1 entregue.** Gate para 5.0C (Página demo/tour) aberto.

---

## Sprint 5.0C — Página Demo / Tour público (2026-05-27)

**Tipo:** Frontend only. Zero backend, zero migration, zero schema, zero seed alterado.

### Arquivos criados/alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/views/DemoPage.tsx` | Criado — página completa `/demo` |
| `frontend/src/views/DemoPage.module.css` | Criado — estilos da página |
| `frontend/src/App.tsx` | Rota `/demo` adicionada |
| `frontend/src/components/Header.tsx` | Nav "Demo" como RouteNavItem + Link |
| `frontend/src/components/Header.module.css` | Classe `.demoLink` com cor cyan |

### Estrutura da DemoPage

1. **Header próprio** — logo + nav (Início, Planos) + CTA "Criar conta"
2. **Hero** — badge "Demo · dados fictícios", h1, subtítulo, CTAs
3. **Vídeo placeholder** — bloco dashed com ícone Play e "Vídeo guiado em breve"
4. **6 módulos** — grid 3 colunas com ícone, título e descrição do que há na demo
5. **Clínica Demo Aurora** — lista dos dados sintéticos disponíveis + nota sobre credenciais internas
6. **Segurança / dados fictícios** — 6 garantias (sem CPF real, sem e-mail real, etc.)
7. **CTA final** — "Criar conta" + "Preparar arquivo de teste"

### Header atualizado

- NAV_ITEMS agora usa union type `AnchorNavItem | RouteNavItem`
- Link "Demo" renderiza como `<Link to="/demo">` com classe `.demoLink` (cor cyan)
- Anchor links mantidos para âncoras da landing (#produto, #como-funciona, etc.)

### O que fica para backlog

- **Vídeo real** — gravação com dados fictícios + player na página
- **Carrossel de screenshots** — imagens reais do produto com dados demo
- **Tour interativo** — walkthrough guiado step-by-step

### Checks

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 5.0C entregue.** Gate para 5.0C.1 (polish de copy) aberto.

---

## Sprint 5.0C.1 — Polish de copy da página Demo (2026-05-28)

**Tipo:** Copy-only. Zero backend, zero migration, zero schema, zero seed. Apenas `DemoPage.tsx`.

### Termos removidos/trocados

| Técnico (removido) | Humano (substituído) |
|--------------------|----------------------|
| "dados sintéticos" | "clínica fictícia" / "exemplos de demonstração" |
| "O dataset de demo simula..." | "Criamos uma clínica fictícia para mostrar..." |
| "populado com dados sintéticos realistas" | "já tem exemplos prontos" |
| "marcador explícito de dado fictício" | "sem nenhum dado clínico real" |
| "20 pacientes sintéticos com agenda populada" | "Pacientes fictícios com agenda preenchida" |
| "Prontuário e documentos com marcadores de dado fictício" | "Prontuário e documentos de exemplo, sem validade clínica ou legal" |
| "Credenciais de demo documentadas internamente..." | "O acesso de demonstração é preparado em ambiente controlado." |
| "Esta página já está preparada para receber uma demonstração..." | "Em breve, esta área terá um vídeo curto mostrando a rotina da clínica..." |
| "controles de segurança do produto real, mas com dados sintéticos" | "montada para apresentar o sistema sem usar informações de pacientes reais" |
| "Dados fictícios por design" | "Demo segura, sem dados reais" |

### Checks

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 5.0C.1 entregue.** Gate para 5.0C.2 (fluxo de acesso à demo) aberto.

---

## Sprint 5.0C.2 — Fluxo de acesso à demo / acesso controlado (2026-05-28)

**Tipo:** Frontend CSS only. Zero backend, zero migration, zero schema, zero seed, zero TSX novo.

### Contexto

A Sprint 5.0C criou a página `/demo` e a 5.0C.1 simplificou a copy. Esta sprint adiciona a seção
"Como acessar a demonstração" com 3 cards, explicando as opções sem expor credenciais publicamente.

O `DemoPage.tsx` já estava completo com `ACCESS_CARDS` e a seção de acesso desde o início da sessão.
Esta sprint finalizou os estilos CSS que estavam faltando.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/views/DemoPage.module.css` | 6 classes adicionadas: `accessGrid`, `accessCard`, `accessIcon`, `accessTitle`, `accessDesc`, `accessCta` |

### Seção "Como acessar a demonstração"

```
Eyebrow: "Como acessar"
Título: "Como acessar a demonstração"
Lead: "A demonstração é liberada em ambiente controlado, usando uma clínica fictícia e
       dados de exemplo. Você pode criar sua própria conta de teste ou solicitar uma
       apresentação guiada."
```

**3 cards (accessGrid — 3 colunas desktop / 1 coluna mobile):**

| Card | Título | CTA | Link |
|------|--------|-----|------|
| 1 (UserPlus) | Criar uma conta de teste | Criar conta | /register |
| 2 (Presentation) | Demo assistida | Começar piloto assistido | /register |
| 3 (LogIn) | Acesso interno | Entrar | /login |

Card 3 (Acesso interno): "As credenciais da Clínica Demo Aurora ficam nos documentos internos
do projeto e são usadas apenas em ambiente controlado." — sem expor e-mail/senha.

### Segurança de credenciais confirmada

Grep em `frontend/src/`:
- `DemoDevOnly` → 0 resultados
- `demo.owner` → 0 resultados
- `demo.secretaria` → 0 resultados
- `demo.medico` → 0 resultados
- `demo.psicologa` → 0 resultados
- `demo.gestor` → 0 resultados

Credenciais ficam somente em `docs/demo-dataset.md` e ambiente local/staging controlado.

### Estilos CSS da seção de acesso

- `accessGrid`: grid 3 colunas desktop → 2 colunas tablet → 1 coluna mobile
- `accessCard`: mesmo visual escuro/glassmorphism dos `moduleCard`; hover eleva 3px
- `accessIcon`: 40×40px, fundo cyan 10%, borda cyan 18%, ícone cyan
- `accessTitle`: 1rem, 600, text-0
- `accessDesc`: 0.855rem, text-1, line-height 1.55, flex:1 (alinha os CTAs na base)
- `accessCta`: inline-flex, cyan-soft, 0.85rem, gap aumenta no hover

### Checks

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (790 kB minified, aviso de bundle size pré-existente)
- `git diff --check` rc=0 ✅
- Zero backend, zero migration, zero schema, zero seed.

**Sprint 5.0C.2 entregue.** Gate para 5.0D (Demo Mode / Tour Guiado) aberto.

---

## Sprint 5.0D — Demo Mode / Tour Guiado Controlado (2026-05-28)

**Tipo:** Frontend only. Zero backend, zero migration, zero schema, zero seed.

### Arquivos criados/alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/components/DemoGuideCard.tsx` | Criado — tour guiado com 7 passos |
| `frontend/src/components/DemoGuideCard.module.css` | Criado — estilos do card |
| `frontend/src/views/Dashboard.tsx` | `isDemoMode` (clinic name detect) + render `DemoGuideCard` |
| `frontend/src/views/LoginPage.tsx` | `useSearchParams` + banner `?demo=aurora` |
| `frontend/src/views/Auth.module.css` | `.demoNotice` (âmbar) |
| `frontend/src/views/DemoPage.tsx` | CTA hero + CTA final "Entrar na demo guiada" (→ `/login?demo=aurora`) · card 3 atualizado |
| `frontend/src/views/DemoPage.module.css` | `.btnDemo` (âmbar) |

### Fluxo completo

```
/demo  →  [CTA "Entrar na demo guiada" — âmbar]  →  /login?demo=aurora
       →  banner âmbar na tela de login (sem credenciais)
       →  usuário entra com credenciais dos docs internos
       →  /app (Dashboard)
       →  isDemoMode=true (clinic.nome === 'Clínica Demo Aurora')
       →  DemoGuideCard aparece na aba Início
       →  7 passos · dots · "Ir para módulo" muda aba real
```

### DemoGuideCard

- Header: badge âmbar "Dados fictícios · Ambiente controlado" + título + lead + contador "Passo N de 7"
- Dots clicáveis (azul = atual, cyan fraco = visitado, cinza = futuro)
- Caixa de detalhe: título + descrição do passo atual
- Botão "Ir para módulo" — chama `setTab(t as TabKey)` no Dashboard (muda aba real)
- Botões "Anterior" / "Próximo" desabilitados nas extremidades
- Rodapé: "Não use dados reais nesta demonstração."
- Estado em React puro — sem localStorage/sessionStorage

### Detecção de modo demo

```tsx
const isDemoMode = clinic?.nome === 'Clínica Demo Aurora';
```

- Apenas exibe o card de tour — não concede permissão extra alguma
- Backend permanece com autenticação e autorização normais

### Banner de login

```tsx
const [searchParams] = useSearchParams();
const isDemoEntry = searchParams.get('demo') === 'aurora';
```

Banner âmbar exibido acima do formulário de login. Conteúdo:
> "Demonstração · Clínica Demo Aurora. Use somente dados fictícios. Nenhum paciente real.
> As credenciais de acesso ficam nos documentos internos do projeto, apenas para ambiente controlado."

Sem credenciais, sem auto-login, sem bypass de auth.

### Segurança confirmada

- `grep DemoDevOnly frontend/src/` → 0
- `grep demo\.owner frontend/src/` → 0
- `grep demo\.secretaria frontend/src/` → 0
- `grep demo\.medico frontend/src/` → 0
- `grep demo\.psicologa frontend/src/` → 0
- `grep demo\.gestor frontend/src/` → 0

### Backlog registrado (5.0E)

- Restrições visuais de ações destrutivas no modo demo
- Dismiss manual do DemoGuideCard
- Highlight visual da aba ativa no Dashboard ao clicar "Ir para módulo"
- sessionStorage do step se necessário

### Checks

- `pnpm --filter frontend typecheck` ✅
- `pnpm --filter frontend build` ✅ (796 kB, aviso bundle size pré-existente)
- `git diff --check` rc=0 ✅
- Zero backend, zero migration, zero schema, zero seed.

**Sprint 5.0D entregue.** Gate para 5.0E (Demo Experience / auto-login controlado) aberto.

---

## Sprint 5.0E — Demo Experience / Tour Guiado com auto-login controlado (2026-05-28)

**Tipo:** Frontend + backend (auth). Zero migration, zero schema, zero seed.
**Decisões confirmadas com o usuário:** (1) entrada via endpoint backend env-gated; (2) restrição via
bloqueio frontend com mensagem humanizada (backend read-only amplo = backlog).

### Problema que motivou a sprint

A 5.0D deixava "Entrar na demo guiada" levando ao login genérico; após login o usuário caía no `/app`
normal, sem um modo demo separado nem tour forte. Não era uma experiência de demonstração comercial.

### Backend — `POST /auth/demo-login` (env-gated)

| Arquivo | Mudança |
|---------|---------|
| `config/env.ts` | Flag `ALLOW_DEMO_LOGIN` (string→boolean; default false) |
| `services/authService.ts` | `demoLogin(ctx)` + `DEMO_OWNER_EMAIL`/`DEMO_CLINIC_NAME` |
| `controllers/authController.ts` | handler `demoLogin` (não lê body) |
| `routes/auth.ts` | `POST /auth/demo-login` sob `authRateLimit` |
| `.env.example` | bloco `ALLOW_DEMO_LOGIN` documentado |

Guardas em ordem (não faz lookup com a feature desligada):
1. `NODE_ENV=production` → 403 `demo_disabled`
2. `!env.ALLOW_DEMO_LOGIN` → 403 `demo_disabled`
3. demo não semeado ou clínica diferente de "Clínica Demo Aurora" → 409 `demo_not_available`

- Sem credenciais no body; identidade (`demo.owner@clinicbridge.local`) e tenant fixos no servidor.
- JWT pelo mesmo `buildSession` do login normal → papel/clinica_id reais, sem permissões extras.
- Tenant isolation preservado; o endpoint nunca alcança um tenant real.
- Audit metadata-only `auth.demo.login.success`; reusa o rate limit de `/auth/*`.

### Frontend — sessão demo + write-block

| Arquivo | Mudança |
|---------|---------|
| `services/api.ts` | `api.demoLogin()`; `apiFetch` recusa POST/PATCH em modo demo; export bloqueado |
| `services/demoMode.ts` | **novo** — `DEMO_CLINIC_NAME`, flag write-block, evento, mensagem |
| `services/AuthProvider.tsx` | `enterDemo()`, `isDemo`, efeito arma/desarma write-block |

- `isDemo = clinic?.nome === 'Clínica Demo Aurora'`. O efeito chama `setDemoWriteBlock(isDemo)`.
- Em modo demo, qualquer write (POST/PATCH) ou export é recusado **antes da rede** com
  `ApiError(403, demo_action_blocked)` + evento `cb:demo-action-blocked`.
- `/auth/demo-login` é allowlisted (e roda antes do flag, com o usuário ainda deslogado).
- **Não é segurança** — é guardrail de UX para manter o tenant sintético limpo.

### Frontend — experiência visual

| Arquivo | Mudança |
|---------|---------|
| `components/DemoMascot.tsx` | **novo** — mascote "Auri" (SVG inline, sem asset externo) |
| `components/GuidedDemoTour.tsx` + `.module.css` | **novo** — tour flutuante persistente, 8 passos |
| `components/DemoBlockedToast.tsx` + `.module.css` | **novo** — toast humanizado global |
| `views/Dashboard.tsx` + `.module.css` | barra de demo, tour, coachmark de aba, toast |
| `views/DemoPage.tsx` + `.module.css` | CTAs "Entrar na demo guiada" chamam `enterDemo()` |
| `views/LoginPage.tsx` + `Auth.module.css` | banner `?demo=aurora` removido |
| `components/DemoGuideCard.*` | **removidos** |

**Barra de demo (Dashboard):** "Demonstração guiada · Dados 100% fictícios" + "Recomeçar tour" + "Sair da demo".

**Tour "Auri":** painel flutuante (bolha quando minimizado), persistente entre abas. Passos: Boas-vindas →
Agenda → Pacientes → Financeiro → Convênios → Estoque → Relatórios → Encerramento (CTA comercial).
Botões Próximo / Voltar / Pular / Recomeçar / minimizar + "Ir para este módulo" (troca a aba). A aba
alvo do passo pulsa em âmbar (coachmark; respeita `prefers-reduced-motion`).

**Encerramento:** "Criar conta" · "Preparar arquivo de teste" · "Conhecer o piloto assistido" (encerram a demo).

**DemoPage:** "Entrar na demo guiada" virou botão (hero, card "Demo guiada", CTA final) que chama
`enterDemo()` → `/app`. Erro amigável quando a flag está off. Sem `/login?demo=aurora`.

### Ações bloqueadas no modo demo

Tudo que passa por `apiFetch` como POST/PATCH: criar/editar/excluir/desativar (pacientes, agenda,
serviços, convênios, estoque, cobranças, equipe), movimentações de estoque, marcar pago/cancelar,
MFA/segurança, ações clínicas persistentes, e o **export** de pacientes. Liberados: navegação, leitura,
filtros, detalhes e o PDF de documento (leitura).

### Segurança

- Sem credenciais demo no frontend (grep: 0 ocorrências de `DemoDevOnly`/`demo.*@clinicbridge.local`).
- Sem token hardcoded, sem bypass de auth — JWT real do mesmo mecanismo do login.
- Endpoint duplamente gated (produção + flag) e identidade/tenant fixos no servidor.
- Auth normal (login/MFA/registro) intocada.

### Backlog (5.0F+)

- Enforcement backend read-only para demo **pública** (middleware por tenant demo).
- Esconder visualmente botões de escrita (hoje clicáveis → mensagem).
- Reset automático dos dados demo; vídeo guiado real.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (802 kB, aviso bundle pré-existente)
- `pnpm --filter backend typecheck` ✅
- `git diff --check` rc=0 ✅
- Zero migration, zero schema, zero seed.

**Sprint 5.0E entregue.** Próxima: 5.0F (QA/validação visual da demo experience + polish) ou 5.1A (ADR Produção Segura AWS).

---

## Sprint 5.0F / 5.0F.1 — Auri Presenter Mode / Tour profundo por módulo (2026-05-28)

**Tipo:** Frontend only. Zero backend, migration, schema, seed. Demo-login e write-block intocados.

A 5.0F fez o polish visual (painel maior, mascote animada, progresso segmentado, callout "Veja aqui",
copy mais curta). A **5.0F.1** aprofundou o conteúdo: a Auri virou uma guia de apresentação que explica
as funções principais de cada módulo.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/components/DemoMascot.tsx` | prop `className` (sizing responsivo) + brilho suave na antena |
| `frontend/src/components/GuidedDemoTour.tsx` | `bullets`/`actionHint`/`demoNote` no step; 9 passos (+ Serviços); seções no card; float+pop; nudge |
| `frontend/src/components/GuidedDemoTour.module.css` | painel desktop 31rem (34rem ≥1280px); sheet ≤768px; estilos de seção; animações + reduced-motion |
| `frontend/src/views/Dashboard.tsx` | callout "Veja aqui" na aba-alvo |
| `frontend/src/views/Dashboard.module.css` | highlight de aba mais forte + callout com seta + reduced-motion |

### Painel desktop (Parte 1)

- `31rem` base (desktop/tablet) → `34rem` em ≥1280px; bottom-sheet compacto ≤768px (mobile preservado).
- Mais respiro, tipografia maior, controles maiores; `max-height` + scroll interno.

### Estrutura rica do tour (Partes 2–3)

`DemoTourStep` agora tem `bullets` (O que olhar), `actionHint` (Experimente) e `demoNote` (Na demo).
Card renderiza essas seções condicionalmente. Passos cobertos:

| Passo | Conteúdo |
|-------|----------|
| Boas-vindas | clínica fictícia · Auri conduz · ações de escrita bloqueadas |
| Agenda | agenda do dia · filtros · situações · confirmar/concluir/faltou/cancelar/remarcar |
| Pacientes | lista · busca · cartão · prontuário com permissão · export bloqueado |
| Financeiro | cards aberto/vencido/recebido · pagador particular/convênio/misto · Detalhes · recebimento bloqueado |
| Convênios | carteirinhas · operadoras · preços de referência · administrativo, não clínico |
| Estoque | itens ativos · baixo estoque · filtros · histórico · movimento bloqueado |
| Relatórios | resumo do período · agenda · financeiro · pacientes novos · sem dado clínico |
| Serviços (novo) | catálogo · preço/duração de referência · vínculo com profissionais · não auto-preenche cobrança |
| Encerramento | CTAs Criar conta · Preparar arquivo de teste · Conhecer piloto assistido |

### Navegação (Parte 4)

Próximo / Voltar / Pular / Recomeçar / Minimizar / "Ir para este módulo" mantidos; barra de progresso
segmentada clicável + contador `X/N`; coachmark "Veja aqui" na aba-alvo (desktop; oculto no mobile).

### Backlog — Auri no app normal (Parte 6, NÃO implementado)

Onboarding futuro da Auri dentro do app real ("Ver tour" / "Conhecer o sistema"):
**não** usar demo-login; **não** trocar clínica/tenant; guiar o usuário na própria conta; **separado**
da Demo Aurora pública; sem write-block (no app real o usuário pode agir).

### A11y / performance

Só CSS/SVG (sem libs novas). `prefers-reduced-motion` desliga float/pop/nudge/ping/pulse/callout.
Navegação por teclado preservada (tudo são `<button>`). Contraste mantido.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (808 kB, aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0F.1 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0F.2 (Auri Walkthrough Mode / tour por elementos da interface)

**Tipo:** Frontend-only. Zero backend, migration, schema, seed; `demo-login` e write-block intocados.

### Por que mudou

A 5.0F.1 deixou o painel da Auri como um **bloco grande de texto** — parecia documentação dentro de
um card, não uma demo comercial. A validação visual **não aprovou**. Nova direção: a Auri deixa de
"explicar tudo num card" e passa a **conduzir a tela**, destacando uma parte específica por vez.

### O que é o Walkthrough Mode

- **Card enxuto:** removidas as seções "O que olhar" (bullets) e "Experimente". Cada passo = título
  curto + 1–2 frases + (opcional) 1 nota demo curta.
- **Spotlight por elemento:** `TourSpotlight` localiza `[data-tour-id]`, faz `scrollIntoView`, anela com
  borda/brilho âmbar, **escurece o resto** da tela (box-shadow `0 0 0 9999px`) e flutua o cue "Veja aqui".
  Tudo `pointer-events:none` (visual, não bloqueia clique). Retry via `requestAnimationFrame` (~30 frames)
  tolera conteúdo assíncrono; se o alvo não existir, **degrada** para só o texto da Auri.
- **Auto-troca de aba:** ao mudar de passo, o Dashboard abre a aba do passo (`tab`) para o alvo estar na
  tela. Cliques manuais de aba no meio do tour são respeitados (efeito só dispara em mudança de passo).
- **Auri fora do card:** avatar circular transborda a borda superior (`overflow:visible` + `top:-20px`).

### Micro-passos (20)

Boas-vindas · Menu (aba Agenda) · Agenda (resumo/filtros/ações) · Pacientes (busca/lista) ·
Financeiro (cards/tabela/badge pagador/Detalhes) · Convênios (abas internas/carteirinhas) ·
Estoque (cards/filtros/lista) · Relatórios (filtros/resumo) · Serviços (lista) · Encerramento (CTAs).

### Targets ancorados (`data-tour-id`)

`nav-<tab>` (Dashboard) · `agenda-summary`/`agenda-filters`/`agenda-list` · `patients-search`/`patients-list` ·
`financial-summary`/`financial-table`/`financial-payer`(1ª linha)/`financial-details`(1ª linha) ·
`insurance-tabs`/`insurance-content` · `inventory-summary`/`inventory-filters`/`inventory-list` ·
`reports-filters`/`reports-summary` · `services-list`. Cada anchor é uma linha em container estável, sem
mudança estrutural nos painéis.

### Removido

Coachmark antigo do Dashboard (`.navItemTourTarget`/`.tourCue` + keyframes `tourPulse`/`cueBob` e a prop
`onGoToTab` do tour) — substituído pelo spotlight unificado.

### Mobile

Bottom-sheet compacto preservado (≤768px); spotlight ancora/rola o alvo quando existe sem cobrir todo o
conteúdo; texto curto.

### Backlog (inalterado)

Auri como onboarding no app real continua **backlog futuro separado**: sem demo-login, sem troca de
tenant, sem write-block, gatilho/dados distintos da Demo Aurora pública.

### A11y / performance

Sem libs novas. `prefers-reduced-motion` desliga float/pop/ping/cue + transição do spotlight. Tudo são
`<button>` (navegação por teclado preservada).

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (808 kB, aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅
- Obs.: `docker-compose.yml` (`ALLOW_DEMO_LOGIN`) e linhas demo do `.env.example` já estavam no diff desde
  a 5.0E — mudança externa/local, fora do escopo deste polish.

**Sprint 5.0F.2 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0F.3 (Auri fluida / posicionamento inteligente do painel)

**Tipo:** Frontend-only, polish visual. Engine da 5.0F.2 preservado (sem reescrita). Zero backend,
migration, schema, seed; `demo-login` e write-block intocados.

### Por que mudou

A 5.0F.2 acertou o spotlight por elemento, mas a Auri ainda parecia **abandonada no canto inferior
direito**: o spotlight no centro/esquerda obrigava o usuário a alternar o olhar com o card no canto,
quebrando a fluidez. Objetivo: a Auri **acompanhar o spotlight**, como uma recepcionista apontando.

### O que mudou

- **Rect compartilhado:** `TourSpotlight` virou o hook `useTargetRect` + os componentes `SpotlightRing`
  e `SpotCue`. Anel e painel agora leem a **mesma** medição.
- **Posicionamento inteligente (desktop):** `computePlacement(rect, panelSize)` tenta **direita →
  esquerda → abaixo → acima**, com folga 16px e clamp na viewport; fallback = canto inferior direito.
  O lado escolhido nunca cobre o alvo (offset no eixo principal já afasta). Tamanho do painel medido via
  `ResizeObserver` (`usePanelSize`); recalcula em scroll/resize.
- **Fluidez:** `useTargetRect` mantém o rect anterior enquanto procura o próximo alvo; com transição CSS
  de posição, anel **e** painel **deslizam** entre passos (Auri "caminha" o spotlight).
- **Conector, não duplicação:** painel flutuando perto do alvo → cue "Veja aqui" oculto e aparece um
  **chip-seta âmbar** (`PanelArrow`) na borda voltada ao alvo. Docado/mobile → mantém o cue "Veja aqui".
- **Mobile:** posicionamento inteligente gated por `matchMedia('(max-width: 768px)')`; bottom-sheet +
  cue preservados, sem regressão.

### Arquivos

`GuidedDemoTour.tsx` (hooks `useTargetRect`/`useIsMobile`/`usePanelSize`, `computePlacement`,
`SpotlightRing`/`SpotCue`/`PanelArrow`, placement no render); `GuidedDemoTour.module.css`
(`.panelFloating`, `.panelArrow`/`.arrow_<side>`, keyframe `arrowPulse`, reduced-motion atualizado).
Dashboard, `data-tour-id` e copy dos 20 passos inalterados.

### A11y / performance

`prefers-reduced-motion` desliga deslize + `arrowPulse`. Listeners (scroll/resize/matchMedia/
ResizeObserver) limpos no unmount. Anel/cue/seta são `pointer-events:none` (não bloqueiam clique).
Botões acessíveis por teclado. Sem libs novas.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (810 kB, aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0F.3 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0F.4 (Polish visual da mascote Auri / presença + microanimações)

**Tipo:** Frontend-only, polish visual. Engine de posicionamento da 5.0F.3 preservado. Zero backend,
migration, schema, seed; `demo-login` e write-block intocados.

### Por que mudou

A 5.0F.3 deixou o painel fluido, mas a Auri ainda parecia um **ícone pequeno preso ao card**. Objetivo:
transformá-la numa **mascote-personagem** — maior, saindo do card, com microanimações leves de expressão,
cara de "recepcionista digital simpática" (não brinquedo).

### O que mudou

- **Avatar maior + halo:** desktop 74px (80px ≥1280px), poke-out na borda superior-esquerda
  (`top:-32px; left:-14px`) com anel escuro + glow ciano separando-a do card. Mobile mantém 50px compacto.
- **Headset (persona):** `DemoMascot` ganhou conchas + haste de microfone — sinaliza recepcionista.
- **Inclinação leve:** avatar inclina `±6deg` (origem na base) quando o painel flutua à direita/esquerda
  do alvo, como uma cabeça "olhando" o destaque; transição suave; sem tilt quando docado/empilhado.
- **Microanimações (transform/opacity):** idle float; blink das luzes-olho via SMIL (`keyTimes`);
  reação por passo remontada por `key` — `pop` (happy/neutral), `wave` (boas-vindas), `cheer` (encerramento).
- **mood `neutral`** adicionado ao mascote e à interface de step.

### Reduced-motion / performance

`usePrefersReducedMotion` (matchMedia, listener limpo) passa `animated={false}` ao mascote → **SMIL não
é renderizado** (olhos/antena estáticos) + classe `mascotStill` (sem reações). CSS `prefers-reduced-motion`
zera float/wave/cheer/pop/arrowPulse e transições de avatar/painel/anel. Sem canvas, sem libs novas, sem
animação de layout (só transform/opacity). Anel/cue/seta seguem `pointer-events:none`.

### Arquivos

`DemoMascot.tsx` (headset, mood neutral, prop `animated` gateando SMIL, blink com keyTimes);
`GuidedDemoTour.tsx` (`usePrefersReducedMotion`, `reactionClass`, tilt, `animated`, `topSafe`/`leftSafe`
no `computePlacement`); `GuidedDemoTour.module.css` (avatar maior/halo/tilt, classes de reação +
`mascotStill`, keyframes `wave`/`cheer`, reduced-motion). Copy, posicionamento, spotlight, seta,
`data-tour-id` e Dashboard inalterados.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0F.4 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0F.5 (Auri Pop-Out / mascote fora do card)

**Tipo:** Frontend-only, polish visual. Engine do walkthrough (5.0F.2/3) preservado. Zero backend,
migration, schema, seed; `demo-login` e write-block intocados.

### Por que mudou

5.0F.2–5.0F.4 deixaram a Auri presa ao card (era um `<span>` dentro do painel). O pedido: **separar
visualmente a Auri do card** — card vira o balão de fala, Auri vira personagem flutuante independente com
animação de saída/crescimento.

### O que mudou

- **Camada própria:** Auri saiu do `motion.aside` e virou `.auriLayer` (`position:fixed`, sibling do card,
  `z-index` acima, `pointer-events:none`). Não é mais filha do painel.
- **Card = balão de fala:** o painel só tem texto/controles + um **rabicho** (`.cardTail`) no topo,
  no x da Auri. O conector âmbar para o alvo (5.0F.3) foi removido (sem duplicar seta/cue).
- **Pop-out / crescimento:** `.auriLayer` toca `auriPopOut` uma vez na montagem — começa pequena/baixa
  (encostada no card), cresce com `transform-origin` na base (emergindo do card) e entra em idle float.
- **Posição vs spotlight:** deriva `cardBox` (de placement ou geometria docked/bottom-sheet) e posiciona a
  Auri **acima** do card, x enviesado para o centro do alvo (clampado à largura), com **inclinação** para
  o alvo; clampada para nunca cobrir o alvo no caso "card abaixo do alvo"; glide entre passos (top/left).
- **Camadas de animação:** layer (pop-out + glide) › float › reação one-shot (pop/wave/cheer por passo,
  keyed) › tilt › mascote. Cada uma com **um** transform → sem conflito.
- **Tamanho:** mascote 96px (104px ≥1280, 50px ≤768) com drop-shadow + glow ciano leve.

### Desktop vs mobile

Desktop é o foco: Auri grande, camada própria, pop-out/glide/tilt, rabicho. Mobile mantém Auri compacta
acima do bottom-sheet; placement gated por `matchMedia('(max-width: 768px)')`; cue "Veja aqui" preservado.

### Reduced-motion / performance

`prefers-reduced-motion` zera pop-out/float/wave/cheer/pop e transições de auriLayer/auriTilt/painel/anel;
`animated={false}` remove o SMIL do mascote. Posição é matemática pura (sem novos observers além do
`ResizeObserver` do card); só transform/opacity/filter leve; overlays `pointer-events:none`; teclado OK.

### Arquivos

`GuidedDemoTour.tsx` (Auri em `.auriLayer`, `cardBox`, posição acima do card, rabicho, remoção do
`PanelArrow`, `topSafe` maior); `GuidedDemoTour.module.css` (`.auriLayer`/`.auriFloat`/`.auriMascot`/
`.auriTilt`/`.cardTail`, keyframe `auriPopOut`, react one-shot, remoção de avatar/panelArrow, reduced-motion).
Copy, 20 passos, `data-tour-id`, spotlight e Dashboard inalterados.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0F.5 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0F.6 (Ajuste mobile da Auri / presença no celular)

**Tipo:** Frontend-only, ajuste fino visual mobile. Desktop inalterado. Zero backend, migration, schema,
seed; `demo-login` e write-block intocados.

### Por que mudou

Validação visual da 5.0F.5: no mobile a Auri ficou ≈50px, perdida entre o spotlight e o card, parecendo
decorativa. Precisava de presença de guia também no celular, sem cobrir conteúdo.

### O que mudou

- **Tamanho mobile:** mascote 50 → **72px**; container `AURI_SIZE` 56 → **80**.
- **Posição mobile:** branch `isMobile` no posicionamento — Auri **centralizada sobre o card** e
  **sobrepondo a borda superior** (`overlap 26`), em vez de pairar acima com folga. Inclinação leve ao alvo.
- **Card mobile:** `.panel` ganhou `padding-top: 2.6rem` (prateleira para a Auri maior) — header/progresso
  e botões (Voltar/Próximo/Pular/Recomeçar) não são cobertos; texto legível.
- **Animação mobile:** pop-out mais curto (`.auriLayer` 0.45s); float discreto mantido; só transform/opacity.

### Desktop

Inalterado: `AURI_SIZE` 104, `pokeGap`, viés ao alvo, `topSafe`, rabicho e `.auriMascot` desktop (96 ·
104 ≥1280) preservados. Mudança isolada no branch `isMobile` + media queries `≤768px`.

### Reduced-motion / performance

`prefers-reduced-motion` segue desligando pop-out/float/reações; só transform/opacity; sem libs/canvas/timers.

### Arquivos

`GuidedDemoTour.tsx` (AURI_SIZE mobile, branch de posição mobile); `GuidedDemoTour.module.css`
(`.auriMascot` mobile 72, `.panel` mobile padding-top, pop-out mobile 0.45s).

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0F.6 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0G (Landing com demo guiada em destaque)

**Tipo:** Frontend-only. Zero backend, migration, schema, seed; `demo-login` e write-block intocados;
nenhum bypass novo.

### Por que mudou

A demo guiada com a Auri (5.0E–5.0F.6) foi validada e virou o principal ativo comercial. A landing ainda
dava peso a "Criar conta"/"Preparar arquivo de teste". Agora a demo é o caminho principal e mais óbvio.

### O que mudou

- **Hero:** título "Veja o ClinicBridge funcionando antes de criar sua clínica" + subtítulo da demo;
  CTA primário **Ver demo guiada** (→ `/demo`), secundário Criar conta, terciário Preparar arquivo de teste
  (link discreto `.btnText`).
- **Header:** CTA proeminente passa a ser **Ver demo guiada** (→ `/demo`); "Criar conta" vira link de nav;
  link "Demo" e `.demoLink` removidos.
- **DemoCallout (novo):** seção curta perto do topo — 4 pontos (Dados fictícios · A Auri guia você · Sem
  paciente real · Ações bloqueadas) + CTA "Ver demo guiada"; usa a mascote. Inserida após o Hero.
- **FinalCTA:** lidera com **Ver demo guiada** (→ `/demo`); Criar conta secundário.
- **PricingPlans:** link discreto **"Ver na demo guiada"** (→ `/demo`) em cada plano; sem preço/checkout.
- **/demo:** botão principal segue **Entrar na demo guiada** (chama `enterDemo()` existente); placeholder
  de vídeo rebaixado/reescrito ("a demo já está disponível agora — é só entrar; vídeo em breve, complemento").

### Hierarquia de CTAs

Primário: Ver demo guiada → `/demo`. Secundário: Criar conta → `/register`. Terciário: Preparar arquivo de
teste → `/register`. O entrar de fato continua no botão da `/demo` (`enterDemo()` → `POST /auth/demo-login`
env-gated). Sem credenciais expostas, sem novo caminho de auth.

### Copy / honestidade

Linguagem comercial simples; sem "dataset/seed/tenant/schema/demo-login"; reforço de dados fictícios / sem
paciente real / ações bloqueadas. Planos seguem estáticos (sem preço/checkout/billing).

### Arquivos

`Hero.tsx`/`.module.css`, `Header.tsx`/`.module.css`, `DemoCallout.tsx`/`.module.css` (novos), `Landing.tsx`,
`FinalCTA.tsx`, `PricingPlans.tsx`/`.module.css`, `DemoPage.tsx`.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

**Sprint 5.0G entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0G.1 (Auri teaser na landing)

**Tipo:** Frontend-only, polish. Zero backend, migration, schema, seed; `demo-login` e write-block
intocados; sem chat real, sem credenciais, sem bypass.

### O que mudou

- **`LandingAuriTeaser` (novo):** teaser `position:fixed` com a mascote Auri, surgindo após ~1200ms no
  canto inferior direito (desktop) com entrada leve (framer-motion). Copy curta ("Oi, eu sou a Auri 👋" /
  "Quer ver o ClinicBridge funcionando com dados fictícios?"), CTA **Entrar na demo guiada** → `/demo`,
  "Agora não" + botão fechar.
- **Landing.tsx:** monta `<LandingAuriTeaser />`.

### Fechar / sessionStorage

"Agora não", X e clique no CTA marcam `sessionStorage['cb-auri-teaser-dismissed']='1'` (try/catch) e
escondem o teaser durante a sessão. Sem backend, sem cookies, sem analytics.

### Desktop vs mobile

Desktop: card no canto inferior direito (~21rem), convite não bloqueante, não cobre os CTAs do Hero.
Mobile (≤560px): bottom card discreto (margens 0.75rem), sem cobrir o Hero, X fácil de tocar.

### CTA / fluxo

"Entrar na demo guiada" navega para `/demo` (não chama demo-login). A entrada real segue só pelo botão da
`/demo` (`enterDemo()` → `POST /auth/demo-login` env-gated). Sem bypass.

### Reduced-motion / performance

`useReducedMotion`: com reduced-motion, aparece só com fade (sem pop/slide/float), mascote estático
(`animated={false}`), CSS zera o float. Só transform/opacity; framer já era dependência; sem canvas;
`setTimeout` único limpo no unmount.

### Arquivos

`LandingAuriTeaser.tsx` + `.module.css` (novos), `views/Landing.tsx`.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅ (aviso de bundle pré-existente)
- `git diff --check` rc=0 ✅

---

## Sprint 5.0H — CLAUDE.md Slimming / Context Hygiene (2026-05-28)

**Tipo:** Docs-only. Zero código, zero migration, zero backend/frontend.

CLAUDE.md reduziu de ~51.4k chars (674 linhas) para ~13.6k chars (212 linhas), redução de ~73%.
Todo o histórico detalhado por sprint já estava em `docs/sprint-history.md` e `docs/project-state.md`.

**O que foi removido do CLAUDE.md:**
- Descrições detalhadas sprint-a-sprint de 5.0A até 4.4E-A (~470 linhas de histórico)
- Catálogos de endpoints (financeiro, relatórios, serviços, estoque, convênios) — já nos ADRs
- "O que existe" (parágrafo longo) → virou lista de módulos em 1 parágrafo
- "Sprints anteriores recentes" bullet list e "Trilha Clinic OS" timeline

**O que foi preservado:** estado operacional, módulos, migrações, seeds/smoke, restrições críticas de segurança, stack, arquitetura, comandos, próximas prioridades.

### Checks

- `git diff --check` rc=0 ✅
- Zero código, schema, migration, seed, backend, frontend.

---

## Sprint 5.0G.3 — Auri teaser mais forte + bolinha de reabrir (2026-05-28)

**Tipo:** Frontend-only. Zero backend, migration, schema, seed; `demo-login` e write-block intocados.

### Mudanças

**Teaser desktop mais presente:**
- Card: 21rem → **26rem**; gap/padding aumentados; box-shadow com glow cyan suave.
- Avatar: 56px → **74px** (desktop); 56px mantido no mobile.
- Mascote: 44px → **58px** (desktop); 44px mantido no mobile.
- Título: 0.95rem → **1.05rem**, font-weight 800 mantido.
- CTA: padding 0.6/0.9 → **0.7/1.1**, font-size 0.88 → **0.9rem**.

**Bolinha flutuante de reabrir:**
- Fechar (X ou "Agora não"): `setVisible(false) + setBubble(true) + sessionStorage='1'`.
- Bolinha: `position: fixed`, `bottom/right: 1.5rem`, **64px desktop / 52px mobile**, circular, radial cyan,
  idle `bubblePulse` (glow oscila), hover `scale(1.1)`. `aria-label="Abrir convite da Auri"`.
- Mascote `DemoMascot` mood=`happy` centralizada (48px desktop / 38px mobile).
- Clicar: `reopen()` → `setBubble(false) + setVisible(true) + sessionStorage.removeItem`.
- Montagem com sessionStorage já = '1': `setBubble(true)` direto (sem delay).
- `prefers-reduced-motion`: sem float/pulse, fade simples.

**Mobile:** preservado. Bolinha 52px discreta no canto.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/components/LandingAuriTeaser.tsx` | Estado `bubble`; funções `dismiss`/`reopen`; `<motion.button>` flutuante |
| `frontend/src/components/LandingAuriTeaser.module.css` | Teaser maior desktop; `.avatar`/`.mascot` com override mobile; `.bubble` + `.bubbleMascot` + `bubblePulse` |

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

**Sprint 5.0G.1 entregue.** Pronta para validação visual antes do commit.

---

## Sprint 5.0I — Mobile nav polish / grade compacta no dashboard (2026-05-28)

**Tipo:** Frontend CSS-only. Zero backend, migration, schema, seed, demo-login, write-block.

### Problema

Na visão mobile (≤560px) o menu do dashboard usava `flex-wrap: wrap` com `padding: 0.6rem 1rem; font-size: 0.95rem` para cada item. Com 10–11 módulos, formava ~5 linhas de itens de largura variável — aparência de menu desktop espremido, sem polimento mobile.

### Solução

Adicionado bloco `@media (max-width: 560px)` em `Dashboard.module.css`:

| Propriedade | Antes | Depois |
|---|---|---|
| `.nav` layout | `flex-wrap: wrap` | `grid 2 colunas` |
| `.nav` gap | 0.4rem | 0.35rem |
| `.nav` margin-top | 2rem | 1.5rem |
| `.navItem` padding | 0.6rem 1rem | 0.52rem 0.75rem |
| `.navItem` font-size | 0.95rem | 0.82rem |
| `.navItem` justify | default | flex-start |
| `.navItem svg` | 17px (TSX) | 15px (CSS override) |
| `.sectionHead` margin-top | 2rem | 1.25rem |
| `.demoBarSub` | visível | oculto (mobile) |
| `.demoBarBtn/Exit` padding | 0.45rem 0.85rem | 0.38rem 0.65rem |

Desktop ≥561px: intocado.

### Tour (GuidedDemoTour)

Spotlight continua funcional: `data-tour-id="nav-agenda"` permanece no botão; `getBoundingClientRect()` encontra o novo layout; GuidedDemoTour já usa `isMobile (≤768px)` → modo bottom-dock, independente da posição visual do item.

### Arquivo alterado

`frontend/src/views/Dashboard.module.css` — somente adição de media query.

### Checks

- `pnpm --filter frontend typecheck` ✅ · `pnpm --filter frontend build` ✅
- `git diff --check` rc=0 ✅

---

## Sprint 5.1A — ADR 0018 Planos, Billing e Entitlements v0.1 (2026-05-28)

**Tipo:** docs/ADR-only. Zero código, schema, migration, backend, frontend, env, secret, SDK.

### Entregáveis

- `docs/adr/0018-plans-billing-entitlements-v0.md` — ADR (status: Aceita arquitetura · gateway Proposto).
- `docs/plans-billing-entitlements-v0-scope.md` — operacional (chaves de entitlement, matriz de estados, checklists por sprint).

### Decisão central

Camada comercial do ClinicBridge = camada **por clínica/tenant**, separada das roles
operacionais, com **entitlements validados no backend**, atrás de **abstração de
gateway**. **Não confundir** com o financeiro da clínica (`financial_charges`/ADR 0012).

Invariantes aceitos: plano por tenant (1 assinatura/tenant); roles ≠ planos ≠
entitlements (3 camadas ortogonais); frontend esconde/desabilita mas backend valida;
soft-lock progressivo que **nunca sequestra dados** (mantém leitura + export essencial
LGPD); estado só muda por **webhook verificado** ou ação manual auditada (nunca pelo
frontend); **sem dado de cartão**; billing não vaza PII clínica; webhooks idempotentes
(`external_event_id` único) + `clinica_id` por mapa interno (anti-spoofing); plano
nunca destrava módulo clínico sem gate seguro (ADR 0009/0010/0011).

### Planos / estados / entidades

- **Planos v0.1:** Essencial · Profissional · Piloto Assistido. Preços = TBD comercial.
- **Estados:** trialing · active · past_due · suspended · canceled · manual_pilot.
- **Entidades conceituais:** `clinic_subscription`, `clinic_entitlement`,
  `billing_provider_customer`, `billing_provider_subscription`, `billing_event`.

### Gateway (Proposto)

- **Asaas** = candidato **preferencial** para o spike (Brasil-first; Pix/boleto/cartão/
  recorrência; reputação de aceitar PF).
- **Stripe** = comparação obrigatória (bloqueador: operação BR/PF, Pix recorrente, CPF vs CNPJ).
- **Mercado Pago** = mantido **com ressalva** (recusas prévias do fundador — não escolher automaticamente).
- **Pagar.me** = secundário.
- Taxas, CPF vs CNPJ, Pix recorrente, webhook signature, idempotência, disponibilidade BR
  marcados `[VERIFICAR]` — exigem fonte oficial. **Decisão final no spike 5.1D (adendo à ADR).**

### Roadmap

5.1B backend foundation (`MockProvider`, sem gateway real) · 5.1C frontend ·
5.1D spike sandbox (Asaas vs Stripe) · 5.1E QA/security billing hardening ·
**5.2A** ADR Produção Segura AWS (renumerada de 5.1A). Cobrança real só pós-5.2A.

### Checks

- `git diff --check` rc=0 ✅
- Zero código/schema/migration/backend/frontend/env/secret/SDK.

**Sprint 5.1A entregue.** Gate para 5.1B (backend foundation, sem ADR nova) aberto.

---

## Sprint 5.1B (2026-05-28) — Backend foundation de Planos/Entitlements v0.1 (mock)

Implementa a fundação backend da camada comercial (ADR 0018). **Provider mock/manual;
sem gateway real, sem checkout, sem webhook real, sem secret/env novo, sem dado de cartão,
sem integração externa.** Nenhuma tabela existente foi alterada (só FKs novos referenciando
`clinics`/`users`).

### Migration `20260608000000_billing_v0` (aditiva — batch 19)

5 tabelas tenant-scoped por `clinica_id`:
- **`clinic_subscriptions`** — 1 por tenant (`UNIQUE(clinica_id)`). CHECK em `plan_code`
  (`essential|professional|assisted_pilot`), `status`
  (`trialing|active|past_due|suspended|canceled|manual_pilot`),
  `provider` (`mock|manual|asaas|stripe` ou NULL), e consistência `canceled ⇒ canceled_at`.
  `created_by_user_id` → SET NULL. Campos de provider NULLABLE (fase mock).
- **`clinic_entitlements`** — overrides por tenant (`UNIQUE(clinica_id, feature_key)`),
  `source ∈ {plan,override,pilot}`. Defaults do plano são **computados em runtime** (não
  materializados); a tabela guarda só overrides.
- **`billing_provider_customers`** — mapa clínica↔cliente. `UNIQUE(provider,external_customer_id)`
  + `UNIQUE(clinica_id,provider)`.
- **`billing_provider_subscriptions`** — mapa assinatura↔assinatura do provider.
- **`billing_events`** — ledger idempotente. `UNIQUE(provider,external_event_id)` = chave de
  idempotência; só `payload_hash` (nunca payload cru); `clinica_id` → SET NULL (evidência).

### Arquivos (backend)

- Tipos em `src/types/db.d.ts` (5 row interfaces + enums + registro nas `Tables`).
- DAOs: `clinicSubscriptionDao`, `clinicEntitlementDao`, `billingProviderCustomerDao`,
  `billingProviderSubscriptionDao`, `billingEventDao` — todos tenant-scoped, **sem `listAll`**,
  insert idempotente em `billing_events` (`onConflict(...).ignore()`), CAS em `updateStatus`.
- Lógica pura: `billingPlans.ts` (catálogo + `computeEntitlements`), `billingStateMachine.ts`
  (`canTransition` + `computeSoftLock`), `billingProvider.ts` (interface), `billingMockProvider.ts`.
- `billingService.ts` (`getStatus`, `provisionSubscription`, `transitionStatus`,
  `recordProviderEvent`) + `billingController.ts` + `routes/billing.ts` (mount em `app.ts`).
- `middlewares/requireEntitlement.ts` — `requireEntitlement(featureKey)` + `requireNotSoftLocked()`
  + `assertWithinLimit()` — **criados para uso futuro, NÃO montados em nenhuma rota** (5.1B só calcula).
- `scripts/billing-admin.ts` — CLI dev-only (refuse em produção): `selftest|status|provision|transition|cleanup`.
  Caminho manual auditado de provisionamento (não há endpoint público de alteração).

### Endpoint

- **`GET /billing/status`** — `patientsRateLimit → requireAuth → requireClinic →
  requireRole(['dono_clinica','secretaria'])`. Retorna plano/estado/entitlements/soft-lock da
  clínica do JWT (sem parâmetro de tenant → cross-tenant impossível por construção).
  Política fina no service: `profissional_clinico` (grant) → 403 `forbidden_role`;
  `admin_sistema` → 403 `no_clinic_context` (requireClinic). Payload **sem PII, sem valor
  monetário, sem IDs externos do provider**.

### Decisões de implementação

- **Chaves de plano/entitlement em inglês** (a ADR §4 e o scope §3 deferem as chaves exatas à
  5.1B). Módulos: `module.{patients,schedule,financial,reports,services,insurance,inventory,
  clinical_records,clinical_documents}`. Limites: `limit.{users,professionals,imports_per_month}`.
- **Default p/ clínica sem assinatura:** status sintetizado **não-persistido** (`provisioned:false`,
  plano `professional`, estado `manual_pilot`, acesso total, sem lock). Honra "estado só muda por
  webhook/ação manual" (nada é gravado num GET) e nunca trava tenant existente.
- **Entitlement clínico nunca destrava o gate clínico:** `module.clinical_*` são dimensão
  comercial; `requireClinicalRole` (ADR 0009/0010/0011) segue sendo a autoridade real e está
  intocado. `essential` marca clínicos como `false` (plano só restringe).
- **Soft-lock** só calcula flags em 5.1B (`can_create_new_records`, `read_only_mode`,
  `export_allowed`, `lock_reason`); `export_allowed` é **sempre true** (portabilidade LGPD,
  nunca sequestra dados). Nenhuma rota existente foi gateada.
- **Audit metadata-only:** `billing.status.read`, `billing.subscription.provisioned`,
  `billing.subscription.transitioned` — `recurso='billing_subscription'`, `recurso_id`=id da
  assinatura; sem plano/valor/PII no audit (schema fixo de `audit_logs`).

### Provider mock / state machine / idempotência

- `MockProvider` implementa toda a interface `BillingProvider` **sem rede, sem secret**
  (`mock_cus_*`/`mock_sub_*`; `verifyWebhookSignature` confere um marcador fixo — não é secret).
- Estados (ADR §6): trialing→active→past_due→{active|suspended}; suspended→{active|canceled};
  manual_pilot→{active|canceled}; canceled terminal. `active→suspended` exige passar por past_due.
- `billing_events` idempotente: reenvio do mesmo `external_event_id` → no-op.

### Checks + smoke

- `pnpm --filter backend typecheck` ✅ · `build` ✅ · `migrate:latest` (batch 19) ✅ ·
  rollback+re-apply ✅ · `git diff --check` rc=0 ✅.
- `tsx scripts/billing-admin.ts selftest` ✅ (state machine, soft-lock, entitlements, idempotência, mock).
- API smoke: 401 sem token ✅; dono/secretaria/gestor → 200 ✅; profissional → 403 ✅;
  admin sem clínica → 403 `no_clinic_context` ✅; tenant isolation (smoke=essential vs Aurora=professional,
  cada owner vê só o seu) ✅; soft-lock (active→past_due→suspended) coerente, export sempre liberado ✅;
  payload sem PII/valor/IDs externos ✅; audit `billing.*` metadata-only ✅; zero integração externa ✅.
  Linhas de billing sintéticas removidas após o smoke (smoke users intocados; 0 subscriptions/events).

### Fora de escopo (mantido)

Gateway real, checkout, SDK, webhook real/endpoint público, secret/env real, cobrança real,
preços, NF-e, cupom/proration, cofre de cartão. Nenhum endpoint público de alteração de assinatura.

**Próxima:** 5.1C (frontend de plano/assinatura — backend continua a defesa) · 5.1D spike sandbox.

---

## Sprint 5.1C (2026-05-28) — Frontend Plano/Assinatura v0.1

Painel visual de plano e assinatura no Dashboard. Consome `GET /billing/status` (5.1B).
**Sem gateway, checkout, preço real, env novo, backend novo, migration ou integração externa.**
Backend continua sendo a fonte da verdade de acesso.

### Arquivos (frontend)

- `src/services/api.ts` — tipos `PlanCode`, `SubscriptionStatus`, `SoftLockFlags`,
  `EffectiveEntitlement`, `BillingEntitlements`, `BillingStatus`, `BillingStatusResponse` +
  método `api.getBillingStatus(token)` no objeto `api`.
- `src/components/SubscriptionPanel.tsx` + `SubscriptionPanel.module.css` — painel completo.
- `src/views/Dashboard.tsx` — `TabKey` expandido com `'assinatura'`; `TABS` ganha
  `{ key:'assinatura', label:'Assinatura', icon: CreditCard }` (sem `ownerOnly`);
  `SECTION_INTRO` e render block adicionados; `SubscriptionPanel` importado.

### UX / comportamento

- **Aba "Assinatura"** visível a todos os membros da clínica (dono, secretaria, gestor, profissional).
  `profissional_clinico` abre a aba → backend retorna 403 → card "Acesso restrito" (ShieldOff).
- **Mock notice** aparece quando `provider===null/mock/manual` ou `!provisioned` —
  "Pagamento online em preparação. A cobrança real ainda não está conectada nesta fase."
- **Banners de alerta** para `past_due` (warning), `suspended`/`canceled` (danger).
- **Grid de 9 módulos** com ✓ verde (enabled) / ✗ cinza (disabled); módulos clínicos
  exibem nota "Requer também permissão clínica" (plano só restringe, `requireClinicalRole` é
  a autoridade real — invariante ADR 0009/0010/0011 preservado).
- **3 limites** numéricos; `null` → "Ilimitado".
- **Soft-lock**: criação/leitura/exportação mostrados; `lock_reason` renderizado em destaque
  quando presente; nota "Seus dados continuam exportáveis" quando suspenso/cancelado.
- **CTA "Gerenciar assinatura"** desabilitado (`disabled aria-disabled cursor:not-allowed`)
  com texto "Pagamento online em preparação. Disponível em fase futura." Sem checkout, sem URL.
- **Sem preço inventado**, sem Asaas/Stripe mencionados, sem PII, sem valor monetário.

### Query

`queryKey: ['billing','status'] as const` · `staleTime: 60_000` · `enabled: !!token`.
Sem token → query não dispara (usuário não logado nunca acessa o endpoint).
GET não é bloqueado pelo demo write-block (correto: `isWriteBlockedInDemo` só bloqueia POST/PATCH).

### Checks + validação

- `pnpm --filter frontend typecheck` ✅ · `build` ✅ · `git diff --check` rc=0 ✅.
- API smoke via curl: 401 sem token ✅; owner 200 com shape correto ✅; profissional 403 ✅;
  admin 403 `no_clinic_context` ✅; payload sem PII/valor/IDs externos ✅.
- Compilação Vite do módulo inspecionada via HTTP: labels PT-BR, mock notice, módulos, CTA,
  403 branch, mobile CSS `@media(max-width:480px)` — todos presentes.
- **Validação visual (pixel/dark theme/responsive 360px)** não foi possível por ausência de
  browser headless no ambiente WSL2/Ubuntu 26.04. Necessário validar no navegador do usuário.

### Fora de escopo (mantido)

Gateway real, checkout, SDK, webhook, secret/env, preço, cobrança real, migration.
Guards `requireEntitlement`/`requireNotSoftLocked` existem (5.1B) mas **não foram montados** nesta sprint.

**Próxima:** 5.1D spike sandbox (Asaas vs Stripe).

---

## Sprint 6.0A (2026-05-28) — Agenda madura v0.1 pré-piloto

Endurece a Agenda Administrativa para o piloto familiar (pai médico, mãe psicóloga,
odontologia futura): anti-overlap por profissional, filtros melhores e multi-serviço.
**Administrativo, não clínico** — nenhum campo clínico novo. **Sem migration** (anti-overlap
na camada de service). **Permissões da agenda inalteradas** (`requireAuth + requireClinic`,
sem `requireRole` — não introduz poder novo para nenhum papel; ADR 0006 §8).

### Regra final de anti-overlap

- Conflito = mesma `clinica_id` + mesmo `professional_id` (não-nulo) + status existente em
  `OVERLAP_BLOCKING_STATUSES` + sobreposição de intervalo meio-aberto
  (`existing.starts_at < ends_at AND existing.ends_at > starts_at`; bordas que se tocam
  **não** conflitam).
- **Bloqueiam o horário:** `scheduled`, `confirmed`, `rescheduled`.
- **Não bloqueiam:** `cancelled` (slot liberado), `completed` (histórico; decisão de produto:
  não afeta futuro), `no_show` (terminal; slot não retido).
- **Sem profissional → sem checagem** (slot sem profissional não conflita com a agenda de
  ninguém).
- Validado em `create`, `reschedule` (exclui o próprio id) e `updateStatus` ao reativar
  (alvo `scheduled`/`confirmed`, re-checa contra o próprio horário excluindo a si mesmo).
- Conflito → **409 `appointment_time_conflict`**, mensagem sem PII (nunca nome/horário/detalhe
  do agendamento conflitante). Defesa no backend; frontend só traduz.

### Arquivos (backend) — sem migration

- `src/models/appointment.ts` — `OVERLAP_BLOCKING_STATUSES`.
- `src/dao/appointmentDao.ts` — `findActiveOverlap()` (tenant-scoped, sem `listAll`) +
  `service_id` em `ListAppointmentsFilters`/`listByClinic`.
- `src/services/appointmentService.ts` — `assertNoOverlap()` + chamadas em create/reschedule/
  updateStatus; parsing/propagação do filtro `service_id` no `list`.
- `src/controllers/appointmentController.ts` — repassa `service_id` da query.

### Arquivos (frontend)

- `src/services/api.ts` — `service_id` em `ListAppointmentsParams` + envio em `listAppointments`.
- `src/components/AdministrativeSchedulePanel.tsx` — filtro de **Serviço**, botão **Limpar
  filtros** (`hasActiveFilters`/`clearFilters`), **serviço no card** (`serviceName` + ícone
  Briefcase), `errMsg` mapeia `appointment_time_conflict` para mensagem humana, `service_id`
  na queryKey + na chamada.
- `src/components/AdministrativeSchedulePanel.module.css` — `.clearFiltersBtn`.

### Filtros

`date` (navegação) + `professional_id` + `service_id` + `status`, todos server-side
(consistentes com o padrão existente). "Limpar filtros" reseta profissional/serviço/status
(mantém a data, que tem navegação própria) e só aparece quando há filtro ativo.

### Erro 409 no frontend

`createMutation`/`rescheduleMutation`/`statusMutation` usam `errMsg(err, …)`, que detecta
`err.code === 'appointment_time_conflict'` e mostra: *"Este horário já está ocupado para o
profissional selecionado. Escolha outro horário ou profissional."* (sem PII).

### Agenda × Serviços e Agenda × Financeiro

- **Serviços:** `service_id` continua **opcional**; select de serviços ativos (filtrado por
  profissional quando há profissional); serviço escolhido vai no agendamento e agora **aparece
  no card**; filtro por serviço na agenda. Sem auto-propagação de duração/preço (inalterado).
- **Financeiro:** integração via `appointment_id`/`service_id` **intocada**; badge financeiro,
  alertas A1–A4 e "Criar cobrança a partir do agendamento" seguem funcionando.

### Permissões / tenant / dados sensíveis

- Tenant isolation: toda query por `clinica_id`; `findActiveOverlap`/`findByIdForClinic`
  tenant-scoped; GET cross-clinic → 404 (validado). Sem `listAll`.
- `admin_sistema` sem clínica → 403 `no_clinic_context`. Papéis da agenda inalterados.
- `administrative_notes` segue administrativo; **nenhum campo clínico** adicionado. Audit
  metadata-only (`appointment.*` = acao/recurso/recurso_id), nunca conteúdo de observação.

### Limitação conhecida

Check-then-write no service → janela de corrida rara entre dois creates concorrentes no mesmo
slot (aceitável na escala do piloto familiar). Endurecimento futuro: constraint DB
`EXCLUDE USING gist` (btree_gist) numa migration dedicada.

### Checks + smokes

- backend `typecheck`/`build` ✅; frontend `typecheck`/`build` ✅; `migrate:status` sem
  pendências (nenhuma migration nova) ✅; `git diff --check` rc=0 ✅.
- Smoke API anti-overlap (10 casos, todos ✅): [1] sem conflito 201; [2] mesmo prof 409;
  [3] prof diferente 201; [4] slot de cancelado 201; [5] reschedule p/ ocupado 409;
  [6] reschedule do próprio sem mudar 200; [7] profissional cria 201 (comportamento atual,
  agenda sem `requireRole`); [8] admin sem clínica 403; [9] tenant isolation cross-clinic 404;
  [10] service_id válido 201 + filtro service_id 200 / inválido 400.
- Validação visual (filtros/limpar/conflito/mobile/card) pendente no navegador do usuário —
  sem browser headless no WSL2/Ubuntu 26.04 (módulo compilado inspecionado via dev server).

### Fora de escopo (mantido)

Billing guards (não montados), gateway, AWS/deploy, WhatsApp, prontuário/documentos,
migrations não relacionadas, seed/dados reais. Visão semanal, drag-and-drop e constraint DB
de overlap ficam para sprint futura.

**Próxima:** 5.1D spike sandbox (Asaas vs Stripe) ou continuação 6.0 (piloto familiar).

---

## Sprint 6.0B (2026-05-28) — Benchmark e polish UX da Agenda Administrativa

Redesign **incremental frontend-only** da Agenda. **Sem backend, sem migration, sem
dependência nova, sem mudança de contrato/API.** **Administrativa, não clínica** — nenhum
campo clínico novo; accent é por **status**, nunca por especialidade (anti-insinuação).

### Benchmark (doc novo)

`docs/agenda-ux-benchmark.md` — referências (Google Calendar, Square Appointments, Cal.com,
Calendly), o que cada uma faz bem, o que faz sentido **agora** (aplicado) e o que **não** faz
sentido (adiado). Inspiração de UX, não cópia de marca/layout.

### Decisões de UX aplicadas (menor mudança, maior ganho)

- **Faixa de accent por status no card** (Google Calendar) — `border-left` colorido por
  `scheduled`/`confirmed`/`completed`/`rescheduled`/`no_show`/`cancelled`. Só CSS.
- **Chips compactos** profissional · serviço · horário (Square) substituem as 3 linhas
  empilhadas (`.cardRow`) — "quem, o quê, quando" num relance.
- **Agrupamento por hora** (Google Calendar) — separador "HH:00 ─────" quando a hora do slot
  muda em relação ao anterior (`Fragment` + `.hourHeader`).
- **Barra de filtros distinta da criação** (Cal/Calendly) — `.filters` ganha contêiner
  (fundo/borda/padding), separando visualmente do fluxo "Novo agendamento".
- **Empty state** distingue "dia vazio" (CTA criar) de "sem resultado para os filtros"
  (CTA limpar filtros) com microcopy.
- **Rótulo "Resumo do dia"** no strip de chips.

### Arquivos (frontend apenas)

- `src/components/AdministrativeSchedulePanel.tsx` — `import { Fragment }`; map com índice +
  `showHour`; `<Fragment key>` envolvendo separador de hora + slot; card com
  `cardAccent_<status>`; `.metaChips`/`.metaChip` no lugar dos `.cardRow`; empty state com
  `emptyTitle`/`emptyHint` + ação condicional; `summaryLabel`.
- `src/components/AdministrativeSchedulePanel.module.css` — `.cardAccent_*`, `.metaChips`/
  `.metaChip`, `.hourHeader`, `.filters` (toolbar), `.summaryLabel`, `.emptyTitle`/`.emptyHint`.
  (`.cardRow` permanece definido mas não é mais usado — sem impacto.)

### Fluxos preservados (critérios de aceite)

Criar agendamento ✅ · anti-overlap 409 ✅ · filtros profissional/serviço/status ✅ · limpar
filtros ✅ · serviço no card ✅ (agora como chip) · criar cobrança a partir da agenda ✅
(seção financeira/alertas A1–A4 intactas) · lembrete manual ✅ · remarcação ✅. Seções
financeira, de lembrete e de remarcação **não foram tocadas**.

### Checks + validação

- `pnpm --filter frontend typecheck` ✅ · `build` ✅ · `git diff --check` rc=0 ✅.
- Sem backend → backend typecheck/build/migrate não exigidos (nada mudou no backend).
- Dev server: módulo da Agenda transforma sem erro; CSS module exporta as classes novas
  (`cardAccent_*`/`metaChip`/`hourHeader`/`summaryLabel`/`emptyTitle`/`emptyHint`).
- **Validação visual** (pixel/mobile 360–390/dark/escaneabilidade) pendente no navegador do
  usuário — sem browser headless no WSL2/Ubuntu 26.04.

### Fora de escopo (adiado, com justificativa em `docs/agenda-ux-benchmark.md` §4)

Visão semanal completa / colunas por profissional, drag-and-drop, recorrência, disponibilidade
automática (self-booking), integração Google Calendar/iCal, WhatsApp automático.

**Próxima:** 6.0C (visão semanal, **se** o piloto pedir) ou 5.1D spike sandbox billing.

---

## Sprint 6.0C (2026-05-28) — Onboarding interno com Auri v0.1

Frontend-only. Sem backend, migration, demo-login, troca de tenant, dependência nova.
`GuidedDemoTour` estendido com props opcionais backward-compat; Demo Aurora intocada.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `GuidedDemoTour.tsx` | `ONBOARDING_STEPS` exportados (10 passos, sem `demoNote`, sem CTAs demo). Props: `steps?`, `roleLabel?`, `onClose?`, `onExitTo?` (agora opcional). `isAppMode = onClose !== undefined`. Bubble escondida em app mode. `demoNote` e CTAs demo suprimidos via `!isAppMode`. |
| `Dashboard.tsx` | Import `ONBOARDING_STEPS` + `HelpCircle`. Estado `appTourOpen`/`appTourStep`. `openAppTour`/`closeAppTour` (localStorage `cb-app-tour-dismissed`). `useEffect` de troca de aba do app tour. Botão "Ajuda guiada"/"Ver tour" no topbar (`!isDemo`). Render `<GuidedDemoTour steps={ONBOARDING_STEPS} ... onClose={closeAppTour} />` em `appTourOpen && !isDemo`. |
| `Dashboard.module.css` | `.topbarActions`, `.tourBtn`, `.tourBtnLabel` (oculto em ≤360px). |

### Separação Demo Aurora / onboarding interno

- **Estado:** variáveis completamente independentes (`tourStep`/`tourCollapsed` = demo; `appTourStep`/`appTourOpen` = interno).
- **Render:** demo tour só quando `isDemo`; onboarding só quando `!isDemo && appTourOpen`.
- **Botão:** só aparece quando `!isDemo` — usuário demo nunca vê "Ajuda guiada".
- **Conteúdo:** `ONBOARDING_STEPS` não tem `demoNote`, não tem CTAs "Criar conta"; `demoNote` e esses CTAs só renderizam quando `!isAppMode`.
- **localStorage:** chave `cb-app-tour-dismissed` isolada (sem conflito com nada do demo).
- **Tenant:** zero troca; o tour roda na própria sessão do usuário sem qualquer login novo.

### Passos do onboarding (10)

1. Boas-vindas — Auri se apresenta, sem dados fictícios.
2. Menu principal — spotlight `nav-agenda`.
3. Agenda — spotlight `agenda-summary`.
4. Filtros da agenda — spotlight `agenda-filters`.
5. Pacientes — spotlight `patients-search`.
6. Financeiro — spotlight `financial-summary`.
7. Serviços — spotlight `services-list`.
8. Relatórios — spotlight `reports-summary`.
9. Plano e assinatura — spotlight `nav-assinatura`.
10. Pronto! — "Fechar tour" chama `closeAppTour`.

Targets não existentes (ex.: `nav-equipe` para não-owner) degradam graciosamente (sem spotlight, tour continua).

### Checks

`pnpm --filter frontend typecheck` ✅ · `build` ✅ · `git diff --check` rc=0 ✅.
Módulo compilado: `ONBOARDING_STEPS`, `Fechar tour`, `isAppMode`, `appTourOpen`, `tourBtn`, `cb-app-tour-dismissed` — todos presentes. Validação visual (pixel/mobile/dark) pendente no navegador do usuário.

**Fora de escopo (mantido):** backend, migration, auto-show na primeira sessão, tour por papel, passos de prontuário/dados clínicos.

**Próxima:** 6.0D seed sintético do piloto familiar ou 5.1D spike sandbox billing.

---

## Sprint 6.0C.1 (2026-05-28) — Polish da chamada da Auri + ajuste mobile

Continuação imediata de 6.0C. Três mudanças frontend-only.

### (a) Teaser da Auri no Início

Card discreto exibido no tab `inicio` quando o usuário ainda não abriu o tour:
- Copy: "Quer conhecer o sistema?" / "A Auri te guia pelos módulos em poucos minutos."
- CTA: "Começar tour" → `dismissTeaser() + openAppTour()`.
- Dismiss: botão "×" → `dismissTeaser()` sem abrir o tour.
- Chave separada `localStorage['cb-app-tour-teaser-dismissed']` (independente de `cb-app-tour-dismissed`).
- Condições: `!isDemo && tab === 'inicio' && !appTourOpen && !teaserDismissed`.
- Mascote Auri 44px, `animated={false}` (não distrai, apenas convida).
- Mobile ≤420px: actions em row completa.

### (b) Mobile CSS — redução de altura e fonte do tour

`GuidedDemoTour.module.css`, `@media (max-width: 640px)`:
- `.inner max-height`: 70vh → **55vh** (principal ganho — 396px em 720px, 297px em 540px).
- `.title font-size`: 1.16rem → **1.05rem**.
- `.body font-size`: 0.94rem → **0.88rem**.
- `.progressRow margin`: 0.85rem → **0.6rem/0.6rem**.
- `.navBtn`/`.navBtnPrimary padding`: 0.5rem → **0.42rem** + font 0.82rem.
- Auri shelf (padding-top: 2.6rem) **preservado** — necessário para a mascote não cobrir o header.

### (c) TOUR_IDS exportados (roadmap)

`GuidedDemoTour.tsx`: exporta `TOUR_IDS` (const object tipado) + `TourId` type com 9 IDs:
`onboarding` (atual) + `agenda` / `patients` / `financial` / `documents` / `insurance` /
`inventory` / `reports` / `plan` (todos futuros). Nenhum step concreto criado — apenas
namespace reservado para facilitar wiring futuro por módulo.

### Separação Demo Aurora (inalterada)

`isDemo` continua bloqueando teaser e botão de tour. Demo tour usa `DEMO_TOUR_STEPS`;
onboarding usa `ONBOARDING_STEPS`. Estados, useEffects e localStorage completamente separados.

### Arquivos

`GuidedDemoTour.tsx` (TOUR_IDS) · `GuidedDemoTour.module.css` (mobile 640px) ·
`Dashboard.tsx` (teaser + teaserDismissed + APP_TEASER_KEY) · `Dashboard.module.css`
(auriTeaser* classes).

### Checks

typecheck ✅ · build ✅ · `git diff --check` rc=0 ✅.
CSS module: auriTeaser + auriTeaserActions + auriTeaserBody + auriTeaserBtn +
auriTeaserDismiss + auriTeaserSub + auriTeaserTitle — todos exportados.
TOUR_IDS + dismissTeaser + teaserDismissed + APP_TEASER_KEY no bundle.
Validação visual no navegador: pendente.

### Backlog de roteiros por módulo (documentado, não implementado)

| Tour ID | Módulo | Conteúdo previsto |
|---|---|---|
| `agenda` | Agenda | filtros, anti-overlap, cobrança do agendamento |
| `patients` | Pacientes | busca, cartão, prontuário (se permissão) |
| `financial` | Financeiro | cobrança, marcar pago, convênio |
| `documents` | Documentos médicos | criar/finalizar PDF, orientação de validade |
| `insurance` | Convênios | carteirinha, operadora, preço de referência |
| `inventory` | Estoque | item, movimento, alerta de estoque baixo |
| `reports` | Relatórios | período e leitura dos cards |
| `plan` | Assinatura | plano, limites, pagamento em preparação |

Trigger esperado: botão "?" dentro de cada módulo (sprint futura).

**Próxima:** 6.0D seed sintético do piloto familiar ou 5.1D spike sandbox billing.
