# ClinicBridge — Catálogo Completo de Controles de Segurança e Privacidade

> **Propósito:** inventário exaustivo dos controles de segurança e privacidade já
> presentes no ClinicBridge, para defesa acadêmica e portfólio. Este catálogo é a
> base do documento de defesa `docs/security-final-10-requirements.md`, que agrupa
> tudo isto em **10 requisitos guarda-chuva (R01–R10)**.
>
> **Natureza do projeto:** MVP local / case acadêmico, **dados sintéticos**,
> construído com boas práticas de segurança e privacidade. **NÃO** está em produção
> e **não** afirma conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil. Fonte de
> verdade dos detalhes: `docs/security-notes.md`, `CLAUDE.md`,
> `docs/ClinicBridge_Documentacao_Mestre.md` e os ADRs em `docs/adr/`.

## Como ler

Cada controle tem:

- **ID** — identificador estável (`C##`).
- **Controle** — nome curto.
- **Objetivo** — o que protege.
- **Onde** — arquivo/módulo/doc principal.
- **Tipo** — Preventivo · Detectivo · Corretivo · Governança.
- **Status** — Implementado · Parcial · Documentado/Planejado.
- **Req.** — requisito guarda-chuva (R01–R10) onde entra.
- **Obs/risco** — ressalva honesta quando existe.

**Total catalogado: 64 controles** (C01–C64), em 25 grupos temáticos.

---

## Grupo 1 — Autenticação e sessões JWT

### C01 — Autenticação JWT obrigatória (`requireAuth`)
- **Objetivo:** toda rota protegida exige `Authorization: Bearer <jwt>` válido; ausência/scheme inválido → 401 genérico.
- **Onde:** `backend/src/middlewares/requireAuth.ts`; verificação em `services/tokenService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01
- **Obs:** 401 nunca distingue "sem token" de "token inválido" (anti-enumeração).

### C02 — Verificação estrita do JWT (`tokenService.verify`)
- **Objetivo:** valida assinatura HS256, formato UUID do `sub`/`clinica_id` e `papel` na allowlist; rejeita payload forjado.
- **Onde:** `services/tokenService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01, R03

### C03 — Hash de senha com argon2id
- **Objetivo:** senhas nunca em texto puro; resistência a brute-force/rainbow tables.
- **Onde:** `services/passwordService.ts` (argon2id); `dao/userDao.ts` (`senha_hash`).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01

### C04 — `/auth/me` e login sem vazamento de identidade
- **Objetivo:** falhas de login genéricas; não revelam se o e-mail existe.
- **Onde:** `services/authService.ts`, `controllers/authController.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01

### C05 — Expiração de sessão JWT (`JWT_EXPIRES_IN`)
- **Objetivo:** tokens têm validade curta (default `1h`); reduz janela de uso de token vazado.
- **Onde:** `config/env.ts`, `services/tokenService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01
- **Obs:** sem refresh token / revogação ativa no MVP; `papel` fica stale até expirar (documentado).

---

## Grupo 2 — MFA / TOTP

### C06 — MFA TOTP com app autenticador
- **Objetivo:** segundo fator opcional (otplib); login em 2 passos com `mfa_challenge_token` curto sem `papel`.
- **Onde:** `services/authService.ts`, `services/tokenService.ts` (`signMfaChallenge`), `dao/userDao.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R01, R06

### C07 — Segredo TOTP cifrado em repouso (AES-256-GCM)
- **Objetivo:** o secret TOTP nunca é gravado/exibido em texto puro; chave via HKDF-SHA256.
- **Onde:** `config/mfaCrypto.ts`; colunas `mfa_secret_encrypted`/`mfa_pending_secret_encrypted`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R06

### C08 — Backup codes de recuperação (argon2, uso único)
- **Objetivo:** recuperação se o app autenticador for perdido; 10 códigos de alta entropia, só hash, consumo por compare-and-set.
- **Onde:** `services/mfaBackupCodeService.ts`, tabela `user_mfa_backup_codes`.
- **Tipo:** Corretivo · **Status:** Implementado · **Req.:** R06
- **Obs:** recuperação total ainda depende de processo operacional (futuro).

### C09 — Segredo MFA nunca exposto após setup
- **Objetivo:** o secret só volta no `/auth/mfa/setup` (QR); `status`/`/auth/me` nunca retornam secret nem códigos.
- **Onde:** `services/authService.ts`, `controllers/authController.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R06

---

## Grupo 3 — Autorização por papel

### C10 — Gate por papel (`requireRole`)
- **Objetivo:** ações sensíveis só para papéis permitidos; `dono_clinica` para admin; 403 `forbidden_role` genérico.
- **Onde:** `middlewares/requireAuth.ts` (`requireRole`, `CLINIC_ADMIN_ROLES`).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02
- **Obs:** papel vem do JWT (stale até expirar); defesa real no backend, frontend só esconde UX.

### C11 — Owner-only em operações destrutivas/sensíveis
- **Objetivo:** import real, export, archive/restore, merge B-safe, invite, aprovação/desativação de membro só `dono_clinica`.
- **Onde:** `routes/*.ts`, services correspondentes.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

### C12 — Separação de capacidades da secretaria
- **Objetivo:** secretaria prepara (upload/preview/criar-editar paciente) mas não executa passos sensíveis.
- **Onde:** `routes/*.ts`, `docs/security-notes.md` (Autorização por papel).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

---

## Grupo 4 — Grants clínicos

### C13 — Gate clínico granular (`requireClinicalRole`)
- **Objetivo:** acesso a prontuário/documentos clínicos por grants (`gestor_clinica`, `profissional_clinico`) em tabela paralela, não pelo papel base.
- **Onde:** `middlewares/requireClinicalRole.ts`, `user_clinical_roles` (ADR 0009/0010).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

### C14 — Isolamento do autor no prontuário
- **Objetivo:** profissional só vê os próprios encontros; `internal_note` redacted para não-autor; secretaria/financeiro → 403.
- **Onde:** `services/clinicalEncounterService.ts` (ADR 0010).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02, R04

### C15 — Financeiro bloqueado para profissional clínico
- **Objetivo:** `effectiveFinancialAccess` impede inferência cruzada; profissional sempre bloqueado no serviço.
- **Onde:** `services/financialChargeService.ts`, convênios via `assertNotProfissional`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

---

## Grupo 5 — Governança administrativa

### C16 — Gate de governança (`requireClinicGovernance`)
- **Objetivo:** vínculos administrativos ativos (`titular`/`administrador`) autorizam ações de governança; membro revogado nunca "ressuscita".
- **Onde:** `middlewares/requireClinicGovernance.ts` (ADR 0019); teste `requireClinicGovernance.test.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

### C17 — Fallback legado dono_clinica controlado
- **Objetivo:** dono sem linha de governança passa por fallback **apenas** se nunca teve linha; revogados são barrados.
- **Onde:** `middlewares/requireClinicGovernance.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

### C18 — Desativação de membro efetiva imediatamente
- **Objetivo:** `requireClinic` confere `users.ativo` + `clinica_id` no DB por request; desligamento vale sem rotação de token.
- **Onde:** `middlewares/requireAuth.ts` (`requireClinic`, Sprint 3.25).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02, R03

### C19 — Compare-and-set em join requests (anti-TOCTOU)
- **Objetivo:** decisões concorrentes (aprovar/recusar/cancelar) não se sobrescrevem; trilha de decisor.
- **Onde:** `dao/clinicJoinRequestDao.ts` (Sprint 3.31).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R02

---

## Grupo 6 — Tenant isolation por `clinica_id`

### C20 — `requireClinic` em toda rota tenant-scoped
- **Objetivo:** exige clínica associada; admin_sistema (sem clínica) barrado; 403 `no_clinic_context`.
- **Onde:** `middlewares/requireAuth.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R03

### C21 — Filtro `clinica_id` obrigatório nos DAOs (sem `listAll`)
- **Objetivo:** toda query filtra por tenant; não existe método de leitura global; cross-tenant → 403/404 genérico.
- **Onde:** `dao/*.ts`; verificado em `tests/integration/tenant.integration.test.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R03

### C22 — 404 genérico anti-enumeração em escritas cross-tenant
- **Objetivo:** paciente/serviço/recurso de outra clínica → `*_not_found` (mesmo código de inexistente).
- **Onde:** `dao/patientDao.ts`, `services/*` (`findByIdForClinic`).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R03

### C23 — Criação de recurso vinculada à clínica do JWT
- **Objetivo:** novos registros herdam `clinica_id` de `req.auth`, nunca do corpo do request (anti tenant-spoofing).
- **Onde:** services de create (pacientes, charges, serviços, etc.).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R03

### C24 — Sem delete físico em entidades sensíveis
- **Objetivo:** arquivar (`status='archived'`/`canceled`) em vez de DELETE; preserva histórico/auditabilidade.
- **Onde:** `dao/patientDao.ts`, `clinical_documents`, `financial_charges`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R03, R04

---

## Grupo 7 — Proteção LGPD / PII

### C25 — CPF nunca exposto bruto (`cpf_masked`)
- **Objetivo:** listas/export/respostas só retornam `***.***.789-01`; `include_cpf_raw=true` → 400.
- **Onde:** `models/patient.ts` (`maskCpf`), `services/patientExportService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04

### C26 — Mascaramento de número de carteirinha
- **Objetivo:** `member_number` mascarado em listas; valor raw só em detail e só para dono/secretaria.
- **Onde:** `models/patient.ts` (`maskMemberNumber`), `services/insuranceService.ts` (ADR 0016).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04

### C27 — Validação que nunca ecoa o valor ofensivo
- **Objetivo:** erros de input (CPF inválido, etc.) não devolvem o número/valor enviado.
- **Onde:** services de paciente/validação.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04

### C28 — Frontend não persiste PII raw
- **Objetivo:** `member_number`/`holder_name` raw só em estado local de edição, com `cancelEdit()` limpando; nunca em console/localStorage/URL.
- **Onde:** `frontend/src/components/InsurancePanel*` (Sprint 4.7C/D).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04

### C29 — Minimização de PII em payloads e identificadores
- **Objetivo:** UUID interno em vez de nome; merge/duplicados sem lookup de nome do principal; metadata-only.
- **Onde:** `services/patientService.ts`, `models/patient.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04, R05

### C30 — Retenção em dry-run (não apaga nada)
- **Objetivo:** `GET /import-files/retention/dry-run` é read-only; só metadados seguros; limpeza real é futura com salvaguardas.
- **Onde:** `services/importFileRetentionService.ts` (ADR 0002).
- **Tipo:** Preventivo/Governança · **Status:** Parcial (dry-run) · **Req.:** R04
- **Obs:** limpeza real exige confirmação/soft-delete/quarentena/validação jurídica.

### C31 — Portabilidade LGPD preservada no soft-lock
- **Objetivo:** mesmo suspenso por billing, `export_allowed` é sempre true; soft-lock nunca sequestra dados.
- **Onde:** `services/billingService.ts` (`computeSoftLock`, ADR 0018).
- **Tipo:** Governança · **Status:** Parcial (calculado, guards não montados) · **Req.:** R04

---

## Grupo 8 — Proteção de dados clínicos

### C32 — Fronteira administrativo × clínico
- **Objetivo:** dado clínico nunca misturado ao administrativo; agenda/financeiro/estoque proíbem conteúdo clínico (avisos na UI).
- **Onde:** ADR 0006/0010/0012/0017; avisos anti-clínico no frontend.
- **Tipo:** Preventivo/Governança · **Status:** Implementado · **Req.:** R04

### C33 — Notas clínicas append-only e imutáveis pós-finalização
- **Objetivo:** sem perda de versões; documento `finalized` é imutável; sem delete físico.
- **Onde:** `services/clinicalDocumentService.ts`, `clinical_encounters` (ADR 0010/0011).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04, R05

### C34 — PDF clínico sem armazenamento e com rodapé legal
- **Objetivo:** documento gerado on-demand, não persistido; rodapé avisa ausência de ICP-Brasil/força legal.
- **Onde:** `services/clinicalDocumentPdf*`, PDFKit (ADR 0011).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R04

---

## Grupo 9 — Auditoria geral

### C35 — `audit_logs` append-only com schema fixo
- **Objetivo:** trilha de escrita imutável (sem update/delete no DAO); colunas fixas sem coluna de conteúdo.
- **Onde:** `dao/auditLogDao.ts`; migração `20260521_audit_logs`.
- **Tipo:** Detectivo · **Status:** Implementado · **Req.:** R05

### C36 — Auditoria metadata-only (sem PII / conteúdo)
- **Objetivo:** audits guardam `acao/recurso/recurso_id` (UUID) — nunca nome/CPF/valor/diagnóstico/payload.
- **Onde:** todos os services que auditam.
- **Tipo:** Detectivo/Preventivo · **Status:** Implementado · **Req.:** R05, R04

### C37 — Falha de audit aborta a transação (escritas sensíveis)
- **Objetivo:** merge/clínico/financeiro não persistem estado sem evidência (audit dentro da transação).
- **Onde:** `services/patientService.ts` (merge), clínico, financeiro (ADRs 0007/0010/0011/0012).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R05

### C38 — FKs de audit com `ON DELETE SET NULL`
- **Objetivo:** apagar user/clínica não destrói a evidência; linha de audit sobrevive anonimizada.
- **Onde:** migração `20260521_audit_logs`.
- **Tipo:** Detectivo · **Status:** Implementado · **Req.:** R05

---

## Grupo 10 — Clinical read audit / transparência LGPD

### C39 — Auditoria de leitura clínica (`clinical_read_audit`)
- **Objetivo:** registra **quem leu o quê** de dado clínico (LGPD art. 18); controle compensatório da ausência de cifra de coluna.
- **Onde:** `clinical_read_audit`, services clínicos (ADR 0010 §8.2.1).
- **Tipo:** Detectivo · **Status:** Implementado · **Req.:** R05

### C40 — Fail-closed em leitura clínica (`CLINICAL_READ_AUDIT_STRICT`)
- **Objetivo:** se a auditoria de leitura falhar com STRICT=true, o conteúdo clínico NÃO é entregue (500).
- **Onde:** `config/env.ts`, services clínicos; download de PDF audita antes de servir.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R05, R09
- **Obs:** obrigatório `true` em produção (guard de boot).

### C41 — Endpoint LGPD de leitura da trilha (owner-only)
- **Objetivo:** `GET /clinical/read-audit` expõe metadados ao dono; sem conteúdo clínico, sem ip/user_agent no payload.
- **Onde:** `routes`/`services` clínicos (Sprint 4.2E).
- **Tipo:** Governança/Detectivo · **Status:** Implementado · **Req.:** R05

---

## Grupo 11 — Redaction de logs

### C42 — Redação multicamada no logger (pino)
- **Objetivo:** rede de segurança que remove (`remove:true`) PII/segredos/conteúdo clínico de qualquer log acidental.
- **Onde:** `config/logger.ts` (camadas 1–4: top-level, wildcard, nested).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R05, R04
- **Cobre:** authorization/cookie/password/senha/token/cpf, campos clínicos, `member_number`/`holder_name`, financeiro, `asaas_api_key`/`asaas_webhook_token`.

### C43 — Disciplina de logging sem conteúdo sensível
- **Objetivo:** services nunca passam corpo clínico/PII ao logger; redação é defesa em profundidade, não a primeira linha.
- **Onde:** convenção em `docs/security-notes.md`; verificado por grep nos logs.
- **Tipo:** Governança · **Status:** Implementado · **Req.:** R05

---

## Grupo 12 — Upload seguro

### C44 — Allowlist de extensão + MIME real (magic bytes)
- **Objetivo:** valida o conteúdo real, não só extensão/MIME; XLSX exige ZIP `PK\x03\x04` + partes OOXML; CSV exige texto.
- **Onde:** `utils/fileContent.ts`, `middlewares/uploadMiddleware.ts`, `services/uploadService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07

### C45 — Scan de nomes sem extrair (anti zip-slip/zip-bomb)
- **Objetivo:** detecta partes OOXML por `buffer.includes` sem descomprimir/temp file.
- **Onde:** `utils/fileContent.ts` (`isValidXlsxContent`).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07

### C46 — Storage privado, nome aleatório, SHA-256, limite de tamanho
- **Objetivo:** arquivos em diretório privado (`UPLOAD_DIR/<clinica_id>/<uuid>.<ext>`), nunca web-served; hash gravado; `UPLOAD_MAX_BYTES`.
- **Onde:** `services/uploadService.ts`, `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07, R10

---

## Grupo 13 — Importação segura / dry-run / limites

### C47 — Pipeline de importação com dry-run e revalidação
- **Objetivo:** preview → validação full-file → dry-run (não grava) → mark-ready (revalida) → import transacional com recibo.
- **Onde:** `services/import*Service.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07

### C48 — Limites operacionais de importação/preview/validação
- **Objetivo:** `IMPORT_MAX_ROWS=100`, `PREVIEW_MAX_*`, `VALIDATION_MAX_*`, `DRY_RUN_MAX_*` evitam leitura/escrita ilimitada.
- **Onde:** `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07, R08

### C49 — Importação transacional com recibo persistido
- **Objetivo:** criação de pacientes é atômica; recibo auditável; falha → rollback total.
- **Onde:** `services/importExecutionService.ts`.
- **Tipo:** Preventivo/Corretivo · **Status:** Implementado · **Req.:** R07

---

## Grupo 14 — Exportação segura / anti formula injection

### C50 — Neutralização de formula injection (CWE-1236)
- **Objetivo:** célula que começa com `= + - @` (ou tab/CR/LF) recebe prefixo `'` em CSV e XLSX.
- **Onde:** `services/patientExportService.ts` (`neutralizeFormula`).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07

### C51 — Export read-only, sem CPF bruto, com teto e filename fixo
- **Objetivo:** não altera `patients`; `cpf_masked`; `PATIENTS_EXPORT_MAX_ROWS` → 413; sem signed URL pública.
- **Onde:** `services/patientExportService.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R07, R04

---

## Grupo 15 — Rate limiting

### C52 — Rate limit por grupo, IP-keyed, antes do auth
- **Objetivo:** rejeita flood antes de auth/DB; 429 genérico `rate_limited`; headers draft-7.
- **Onde:** `middlewares/authRateLimit.ts`, `middlewares/rateLimit.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R08

### C53 — Store de rate limit memory|redis (multi-instância)
- **Objetivo:** `RATE_LIMIT_STORE=redis` dá contadores consistentes entre instâncias; falha de Redis = fail-fast (não degrada).
- **Onde:** `config/rateLimitStore.ts`, `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R08
- **Obs:** Redis gerenciado de produção ainda a provisionar (P1).

---

## Grupo 16 — CORS e trust proxy

### C54 — CORS por allowlist (`FRONTEND_ORIGIN`, sem wildcard em prod)
- **Objetivo:** só origens permitidas; `*` recusado no boot de produção; `credentials:true` nunca com `*`.
- **Onde:** `middlewares/cors.ts`, `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R09

### C55 — Trust proxy explícito (`TRUST_PROXY`)
- **Objetivo:** `X-Forwarded-*` só é confiado quando configurado; default `false` impede spoof de IP (rate limit/audit corretos).
- **Onde:** `app.ts`, `config/env.ts`; Nginx sobrescreve XFF (anti-spoof de borda).
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R08, R10

---

## Grupo 17 — Configuração segura por ambiente / bloqueios de produção

### C56 — Guards de boot de produção (`config/env.ts`)
- **Objetivo:** produção **recusa subir** com `JWT_SECRET`/`DATABASE_URL` placeholder, `MFA_ENCRYPTION_KEY` ausente/curta, `FRONTEND_ORIGIN` localhost/http, `CLINICAL_READ_AUDIT_STRICT≠true`, `ASAAS_ENV≠disabled`.
- **Onde:** `config/env.ts` (`superRefine`); validado por `tests/security/env-guards.security.test.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R09

### C57 — Validação central de env com fail-fast
- **Objetivo:** schema Zod valida todas as envs no boot; config inválida → `process.exit(1)` com mensagem segura.
- **Onde:** `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R09

### C58 — Segredos somente por env (nunca no código/git)
- **Objetivo:** `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `REDIS_URL`, chaves Asaas só de env/secrets manager; `.env.example` só placeholders.
- **Onde:** `config/env.ts`, `.env.example`.
- **Tipo:** Preventivo/Governança · **Status:** Implementado · **Req.:** R09, R10

---

## Grupo 18 — Demo mode seguro / gated

### C59 — Demo login env-gated e bloqueado em produção
- **Objetivo:** `POST /auth/demo-login` só com `ALLOW_DEMO_LOGIN=true` e recusa em `NODE_ENV=production`; identidade fixa server-side, sem senha.
- **Onde:** `controllers/authController.ts`, `config/env.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R09

### C60 — Guard backend de escrita na demo (`blockDemoWrites`)
- **Objetivo:** sessões `is_demo` recebem 403 em qualquer verbo mutante; claim só setado pelo demo-login (nunca afeta clínica real).
- **Onde:** `middlewares/blockDemoWrites.ts`.
- **Tipo:** Preventivo · **Status:** Implementado · **Req.:** R09, R02

---

## Grupo 19 — Asaas sandbox / billing gated

### C61 — Gateway Asaas só sandbox/disabled, secrets por env
- **Objetivo:** não existe valor `production`; rota de webhook só existe em `sandbox` (404 caso contrário); base URL hardcoded; cobrança real bloqueada.
- **Onde:** `services/billingAsaasProvider.ts`, `config/env.ts` (ADR 0018 §13).
- **Tipo:** Preventivo/Governança · **Status:** Implementado (sandbox) · **Req.:** R09

### C62 — Webhook de billing verificado, idempotente e tenant por mapa interno
- **Objetivo:** token via `timingSafeEqual`; `UNIQUE(provider, external_event_id)` (no-op em reenvio); `clinica_id` só por mapa interno; sem PII de paciente/cartão; record-only no v0.1.
- **Onde:** `services/billingWebhookService.ts`, `services/billingAsaasProvider.ts` (`verifyAsaasToken`).
- **Tipo:** Preventivo · **Status:** Implementado (sandbox) · **Req.:** R03, R06, R09
- **Obs:** verificação por token compartilhado (não HMAC) — mitigado por HTTPS + idempotência + tenant interno.

---

## Grupo 20 — Backups / restore / runbooks

### C63 — Backup/restore Restic com hard guards e chave fora do git
- **Objetivo:** `pg_dump -Fc` + uploads via Restic; scripts com `set -euo pipefail`; restore nunca sobrescreve o banco principal; senha do repo só por shell/SSM, nunca versionada; restore drill validado (local).
- **Onde:** `scripts/{check,backup,restore}-*-restic.sh`, ADR 0003, runbooks de backup.
- **Tipo:** Corretivo/Governança · **Status:** Parcial (local ok; offsite por scripts, bucket real pendente) · **Req.:** R10

---

## Grupo 21 — TLS / Nginx local / staging

### C64 — Edge Nginx (TLS local, anti-spoof XFF, headers, body-size)
- **Objetivo:** reverse proxy termina TLS (cert autoassinado local), sobrescreve XFF (IP real), logs sem `Authorization`/`Cookie`/corpo, `client_max_body_size ≥ UPLOAD_MAX_BYTES`; Helmet (HSTS/noSniff/frameguard/CSP) no app.
- **Onde:** `infra/nginx/`, `app.ts` (Helmet), ADR 0005, runbooks de Nginx/DNS-TLS.
- **Tipo:** Preventivo · **Status:** Parcial (local/staging; sem domínio/cert real/WAF) · **Req.:** R10
- **Obs:** WAF (ModSecurity + OWASP CRS) é estratégia futura, detection-only primeiro.

---

## Grupos transversais (já cobertos acima)

- **Tratamento seguro de erros** — `middlewares/errorHandler.ts`: nunca retorna stack/SQL/path; 500 → `internal_error`; erros de parse genéricos (parte de C57/operação segura; reforça R10).
- **Storage privado** — C46.
- **Limites operacionais anti-abuso** — C48, C51, C52, C53.
- **Git/secrets hygiene** — C58 + `.gitignore`/`.dockerignore` (cobre `.env`, `*.pem`/`*.key`/`*.crt`, `*.sql`/`*.dump`, `*.csv`/`*.xlsx`/`*.zip`, `storage/`, `backups/`, `infra/nginx/certs/`) — verificado por `tests/security/sensitive-files.security.test.ts` e pelo gate do workflow (R10).
- **Documentação de produção segura futura** — `docs/production-minimum-plan.md`, `docs/deploy-security-checklist.md`, ADR 5.2A (planejada) — Governança/Planejado (R10).

---

## Mapa controles → requisitos (R01–R10)

| Requisito | Controles |
|-----------|-----------|
| **R01** Autenticação/JWT | C01, C02, C03, C04, C05, C06 |
| **R02** Autorização/grants/governança | C10–C19, C60 |
| **R03** Tenant isolation | C02, C18, C20–C24, C62 |
| **R04** LGPD/PII e dados clínicos | C14, C24, C25–C34, C42, C51 |
| **R05** Auditoria metadata-only | C29, C33, C35–C43 |
| **R06** MFA/segredos de auth | C06–C09, C62 |
| **R07** Upload/import/export seguros | C44–C51 |
| **R08** Rate limiting/anti-abuso | C48, C52, C53, C55 |
| **R09** Config segura/bloqueios de produção | C40, C54, C56–C62 |
| **R10** Operacional/infra local-staging | C46, C55, C58, C63, C64 + git/secrets hygiene |

> Alguns controles aparecem em mais de um requisito (defesa em profundidade). Isso é
> intencional: os 10 requisitos são **guarda-chuvas**, não compartimentos estanques.
