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
- `TeamManagementPanel`: estado `pendingAction: PendingAction | null` (discriminated union `regenerate | approve | reject | deactivate`). `dialogConfig` derivado do tipo. `isBusy` = mutation correspondente `.isPending`. `setPendingAction(null)` em `onSuccess` e `onError` de todas as mutations afetadas.
- `ClinicProfessionalsPanel`: estado `pendingDeactivate: { id, name } | null`. Mesmo padrão.

**Acessibilidade:** `role="dialog"` (nativo), `aria-modal="true"`, `aria-labelledby` apontando para o `<h2>` do título. Focus trap nativo do `<dialog>`. Foco inicial cai no primeiro elemento focável (botão "Cancelar") — pressing Enter acidentalmente cancela, nunca confirma.

**Verificação:** `pnpm --filter frontend typecheck` ✅, `pnpm --filter frontend build` ✅. Backend **não** rodado. Validação visual no navegador pendente. Sem commit/push.

**Ressalvas / follow-ups futuros:**
- Polyfill de `<dialog>` não implementado (Safari < 15.4). Não é um requisito declarado do MVP.
- Um único `id="confirm-dialog-title"` estático é suficiente enquanto só um dialog é aberto por vez. Se no futuro houver múltiplos dialogs simultâneos, usar ID dinâmico (ex.: `useId()`).
- `ConfirmDialog` está pronto para reuso em outras telas (PatientsList, DuplicatesList, etc.) sem alteração.
