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
