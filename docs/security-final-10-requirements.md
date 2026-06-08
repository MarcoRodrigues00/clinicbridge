# ClinicBridge — 10 Requisitos Finais de Segurança (Defesa)

> **Documento oficial da defesa.** Estes são **exatamente os 10 requisitos**
> (R01–R10) que serão apresentados e verificados no código. Cada requisito é um
> **guarda-chuva** que agrupa vários controles do catálogo completo
> (`docs/security-controls-catalog.md`, 64 controles). A versão enxuta para PDF é
> `docs/security-final-10-requirements-pdf.md` (mesmos 10 requisitos).
>
> **Enquadramento honesto:** ClinicBridge é um **MVP local / case acadêmico**, com
> **dados sintéticos**, construído com boas práticas de segurança e privacidade.
> **Não** está em produção e **não** declara conformidade completa com
> LGPD/HIPAA/CFM/ICP-Brasil. Os requisitos descrevem **preparação e controles
> reais**, não certificação.

## Índice dos 10 requisitos

| # | Requisito |
|---|-----------|
| **R01** | Autenticação segura e sessões JWT |
| **R02** | Autorização por papéis, grants clínicos e governança |
| **R03** | Isolamento multi-tenant por clínica |
| **R04** | Proteção LGPD de PII e dados clínicos |
| **R05** | Auditoria e rastreabilidade metadata-only |
| **R06** | MFA/TOTP e proteção de segredos de autenticação |
| **R07** | Validação segura de uploads, importações e exports |
| **R08** | Rate limiting e proteção contra abuso |
| **R09** | Configuração segura por ambiente e bloqueios de produção |
| **R10** | Segurança operacional e infraestrutura local/staging |

Como rodar a verificação automatizada (todos abaixo cobrem R01–R10):

```bash
pnpm test:security          # raiz → backend test:security (suíte sem banco)
# equivalente:
pnpm --filter backend test:security
# cobertura DB-backed adicional (tenant/governança/financeiro):
pnpm --filter backend test:integration
```

---

## R01 — Autenticação segura e sessões JWT

- **Objetivo:** rotas protegidas só respondem a um JWT válido; tokens ausentes/inválidos são recusados com 401 genérico; o fluxo de login não revela informação sensível e suporta MFA quando ativo.
- **Ameaças mitigadas:** acesso não autenticado; uso de token forjado/expirado; enumeração de usuários por mensagens de erro; bypass do segundo fator.
- **Controles incluídos:** C01 (`requireAuth`), C02 (verificação estrita do JWT), C03 (argon2id), C04 (login/`/auth/me` sem vazamento), C05 (expiração de sessão), C06 (challenge token MFA sem `papel`).
- **Implementação:** `backend/src/middlewares/requireAuth.ts`, `services/tokenService.ts`, `services/authService.ts`, `services/passwordService.ts`.
- **Teste automatizado:** `backend/src/tests/security/auth.security.test.ts` — sem header → 401; scheme inválido → 401; token inválido → 401; token válido popula `req.auth`; **challenge token MFA é rejeitado** em rota protegida.
- **Como demonstrar:** `curl` sem `Authorization` em rota protegida → 401; com `Bearer xxx` inválido → 401; rodar `pnpm --filter backend test:security` e mostrar os casos de `auth.security.test.ts`.
- **Limitações honestas:** sem refresh token / revogação ativa; `papel` no JWT fica stale até expirar; expiração default de 1h é um trade-off de usabilidade.

---

## R02 — Autorização por papéis, grants clínicos e governança

- **Objetivo:** ações sensíveis respeitam o papel do usuário, os grants clínicos e os vínculos administrativos **ativos**; negação é 403 genérico.
- **Ameaças mitigadas:** elevação de privilégio; operador executando ação de dono; profissional acessando financeiro/convênios; membro revogado continuando a agir.
- **Controles incluídos:** C10 (`requireRole`), C11 (owner-only), C12 (capacidades da secretaria), C13 (`requireClinicalRole`), C14 (isolamento do autor no prontuário), C15 (financeiro bloqueado p/ profissional), C16–C17 (`requireClinicGovernance` + fallback controlado), C18 (desativação imediata), C19 (CAS anti-TOCTOU), C60 (`blockDemoWrites`).
- **Implementação:** `middlewares/requireAuth.ts` (`requireRole`), `middlewares/requireClinicalRole.ts`, `middlewares/requireClinicGovernance.ts`, services financeiro/convênios/clínico.
- **Teste automatizado:** `backend/src/tests/security/authz.security.test.ts` (secretaria/admin_sistema → 403 `forbidden_role`; dono → OK; sem auth → 401) **+** `backend/src/middlewares/requireClinicGovernance.test.ts` (membro revogado não "ressuscita"; fallback dono só sem linha prévia).
- **Como demonstrar:** logar como secretaria e tentar export/import → 403; mostrar `authz.security.test.ts` e o teste de governança.
- **Limitações honestas:** papel base vem do JWT (stale até expirar); roles granulares são parciais; defesa real é backend (frontend só esconde UX).

---

## R03 — Isolamento multi-tenant por clínica

- **Objetivo:** todo dado/operação é escopado por `clinica_id`; uma clínica nunca lê/edita dados de outra.
- **Ameaças mitigadas:** vazamento/edição cross-tenant; enumeração de recursos de outra clínica; tenant-spoofing via payload/token.
- **Controles incluídos:** C20 (`requireClinic`), C21 (filtro `clinica_id` nos DAOs, sem `listAll`), C22 (404 genérico anti-enumeração), C23 (recurso herda tenant do JWT), C24 (sem delete físico), C02 (UUID de tenant validado), C18 (membership check no DB), C62 (tenant por mapa interno no webhook).
- **Implementação:** `middlewares/requireAuth.ts` (`requireClinic`), `dao/*.ts`, services de create.
- **Teste automatizado:** `backend/src/tests/security/tenant.security.test.ts` (token sem clínica → 403; sem auth → 401; JWT com `clinica_id` forjado não-UUID é rejeitado) **+** `backend/src/tests/integration/tenant.integration.test.ts` (clínica A não lê/edita serviço da B → `service_not_found`; linha de B intacta — **DB real**).
- **Como demonstrar:** rodar `pnpm --filter backend test:integration` e mostrar o teste cross-tenant; mostrar um DAO com `where({ clinica_id })`.
- **Limitações honestas:** o teste cross-tenant profundo exige Postgres (roda na CI com serviço efêmero); enforcement é em app, não há RLS no banco.

---

## R04 — Proteção LGPD de PII e dados clínicos

- **Objetivo:** dados pessoais e clínicos são minimizados, mascarados e nunca expostos indevidamente; privacidade por padrão.
- **Ameaças mitigadas:** vazamento de CPF/carteirinha; exposição de conteúdo clínico a quem não deve; PII em logs/audits/exports; formula injection em planilhas exportadas.
- **Controles incluídos:** C25 (CPF mascarado), C26 (carteirinha mascarada), C27 (validação sem eco), C28 (frontend não persiste PII raw), C29 (minimização/metadata-only), C30 (retenção dry-run), C31 (portabilidade no soft-lock), C32–C34 (fronteira e imutabilidade clínica), C42 (redação de logs), C51 (export sem CPF bruto).
- **Implementação:** `models/patient.ts` (`maskCpf`/`maskMemberNumber`), `services/patientExportService.ts`, `config/logger.ts`, services clínicos.
- **Teste automatizado:** `backend/src/tests/security/pii.security.test.ts` (`maskCpf` esconde os 6 primeiros dígitos; `maskMemberNumber` mantém só os 4 últimos; `neutralizeFormula` prefixa `= + - @`/tab/CR/LF) **+** `models/patient.test.ts`.
- **Como demonstrar:** `GET /patients` mostrando `cpf_masked`; export com célula `=1+1` virando texto `'=1+1`; mostrar `pii.security.test.ts`.
- **Limitações honestas:** sem cifra de coluna no v0.1 (compensada por read-audit); a proibição de conteúdo clínico em campos administrativos depende de disciplina do operador (avisos na UI, sem validação automática); não é compliance LGPD completo.

---

## R05 — Auditoria e rastreabilidade metadata-only

- **Objetivo:** ações sensíveis geram trilha auditável **sem** registrar conteúdo clínico, PII desnecessária ou segredos.
- **Ameaças mitigadas:** falta de rastreabilidade; PII/segredos vazando para a trilha; perda de evidência ao apagar usuário/clínica; conteúdo clínico lido sem registro.
- **Controles incluídos:** C35 (`audit_logs` append-only), C36 (metadata-only), C37 (audit dentro da transação), C38 (FK `SET NULL`), C39 (`clinical_read_audit`), C40 (fail-closed STRICT), C41 (endpoint LGPD owner-only), C42–C43 (redação + disciplina).
- **Implementação:** `dao/auditLogDao.ts`, `clinical_read_audit`, services que auditam, `config/logger.ts`.
- **Teste automatizado:** `backend/src/tests/security/redaction.security.test.ts` (a config de redação cobre `cpf`/`member_number`/campos clínicos/`asaas_*`; `remove:true`) **+** `backend/src/tests/integration/{governance,financial}.integration.test.ts` (ações sensíveis geram audit em **DB real**).
- **Como demonstrar:** executar uma ação e mostrar a linha em `audit_logs` só com UUIDs; mostrar `redaction.security.test.ts` e os campos cobertos.
- **Limitações honestas:** o `audit_logs` não tem coluna de conteúdo por design (não há "diff" de campos); read-audit é o controle compensatório da ausência de cifra de coluna.

---

## R06 — MFA/TOTP e proteção de segredos de autenticação

- **Objetivo:** o segredo TOTP é tratado como dado sensível — cifrado em repouso e nunca exposto após o setup; segredos de webhook conferidos em tempo constante.
- **Ameaças mitigadas:** roubo de segredo TOTP do banco; replay/forja de webhook; timing attack na comparação de token; exposição de segredo em resposta pública.
- **Controles incluídos:** C06 (MFA TOTP), C07 (AES-256-GCM em repouso), C08 (backup codes argon2 uso único), C09 (segredo nunca reexposto), C62 (`verifyAsaasToken` timing-safe).
- **Implementação:** `config/mfaCrypto.ts`, `dao/userDao.ts` (`mfa_secret_encrypted`), `services/billingAsaasProvider.ts` (`verifyAsaasToken`).
- **Teste automatizado:** `backend/src/tests/security/mfa.security.test.ts` — round-trip cifra/decifra; ciphertext nunca contém o plaintext; IV aleatório (dois blobs diferentes); blob adulterado é rejeitado (auth tag GCM); `verifyAsaasToken` só aceita o token exato; DAO persiste `mfa_secret_encrypted` (nunca coluna plaintext).
- **Como demonstrar:** rodar `mfa.security.test.ts`; mostrar a coluna `mfa_secret_encrypted` na migração.
- **Limitações honestas:** chave MFA deriva do `JWT_SECRET` em dev (acoplamento aceito só em dev; produção exige `MFA_ENCRYPTION_KEY` dedicada); verificação de webhook é token compartilhado, **não HMAC** (mitigado por HTTPS + idempotência + tenant interno).

---

## R07 — Validação segura de uploads, importações e exports

- **Objetivo:** arquivos e dados importados/exportados passam por validação real, limites e defesas contra abuso/injeção.
- **Ameaças mitigadas:** upload de binário disfarçado; zip-slip/zip-bomb; importação ilimitada; formula injection em export; vazamento de CPF no export.
- **Controles incluídos:** C44 (magic bytes), C45 (scan sem extrair), C46 (storage privado/SHA-256/limite), C47 (pipeline dry-run + revalidação), C48 (limites de linhas), C49 (import transacional), C50 (anti-formula-injection), C51 (export read-only/sem CPF/teto).
- **Implementação:** `utils/fileContent.ts`, `services/uploadService.ts`, `services/import*Service.ts`, `services/patientExportService.ts`.
- **Teste automatizado:** `backend/src/tests/security/upload-export.security.test.ts` — CSV binário (NUL) rejeitado; ZIP simples renomeado p/ `.xlsx` rejeitado; não-ZIP rejeitado; OOXML real aceito; upload vazio → `empty`; extensão desconhecida → `invalid`; `neutralizeFormula` (em `pii.security.test.ts`).
- **Como demonstrar:** tentar subir um `.xlsx` falso (ZIP qualquer) → rejeitado; mostrar `upload-export.security.test.ts`.
- **Limitações honestas:** sem antivírus/sandbox/DLP (P3); validação OOXML é estrutural mínima (não OPC/XML completa); `IMPORT_MAX_ROWS=100` é conservador por design.

---

## R08 — Rate limiting e proteção contra abuso

- **Objetivo:** rotas sensíveis/pesadas têm limitação de requisições, com store compartilhado opcional e IP correto.
- **Ameaças mitigadas:** brute-force de login/MFA; flood/DoS leve; abuso de export/import; spoof de IP quebrando o limite.
- **Controles incluídos:** C52 (rate limit por grupo, IP-keyed, antes do auth), C53 (store memory|redis com fail-fast), C55 (trust proxy explícito), C48 (limites de pipeline).
- **Implementação:** `middlewares/authRateLimit.ts`, `middlewares/rateLimit.ts`, `config/rateLimitStore.ts`, `config/env.ts`.
- **Teste automatizado:** `backend/src/tests/security/ratelimit.security.test.ts` — limiters são middleware Express; janelas/máximos são inteiros positivos; store ∈ {memory,redis}; o limiter de `/auth` é montado **antes** dos handlers; mensagem 429 genérica (`rate_limited`).
- **Como demonstrar:** disparar muitas requisições a `/auth/login` até 429; mostrar `ratelimit.security.test.ts`.
- **Limitações honestas:** não há teste de carga que dispare 429 real na CI (verificação é estrutural/config, para evitar teste frágil/lento); Redis gerenciado de produção ainda a provisionar (P1).

---

## R09 — Configuração segura por ambiente e bloqueios de produção

- **Objetivo:** o sistema **falha** ao subir com configuração insegura em produção e impede recursos dev/sandbox em ambiente produtivo.
- **Ameaças mitigadas:** boot de produção com segredo placeholder; CORS wildcard/localhost/HTTP; gateway de pagamento real indevido; leitura clínica sem fail-closed; demo login em produção; segredo em código.
- **Controles incluídos:** C56 (guards de boot), C57 (validação central fail-fast), C58 (segredos só por env), C54 (CORS sem wildcard), C40 (`CLINICAL_READ_AUDIT_STRICT`), C59 (demo login gated), C61 (Asaas só sandbox/disabled), C62 (webhook verificado).
- **Implementação:** `config/env.ts` (`superRefine`), `middlewares/cors.ts`, `.env.example`.
- **Teste automatizado:** `backend/src/tests/security/env-guards.security.test.ts` — produção rejeita `JWT_SECRET` placeholder/curto, `DATABASE_URL` placeholder, `FRONTEND_ORIGIN` localhost/http, `MFA_ENCRYPTION_KEY` ausente/curta, `ASAAS_ENV` não-disabled; config de produção válida passa; config de dev com localhost passa.
- **Como demonstrar:** rodar `env-guards.security.test.ts`; mostrar que `NODE_ENV=production` com placeholders aborta o boot.
- **Limitações honestas:** os guards cobrem os erros conhecidos/críticos, não toda configuração possível; produção real (AWS/secrets manager) ainda é planejada (ADR 5.2A).

---

## R10 — Segurança operacional e infraestrutura local/staging

- **Objetivo:** práticas operacionais reduzem risco de vazamento, perda de dados e exposição indevida.
- **Ameaças mitigadas:** commit de segredo/dump/dado real; perda de dados sem backup; imagem Docker com segredo embutido; erro vazando stack/SQL/path.
- **Controles incluídos:** git/secrets hygiene (`.gitignore`/`.dockerignore`), C58 (segredos por env), C46 (storage privado), C63 (backup/restore Restic com guards), C64 (Nginx/TLS local + Helmet), errorHandler seguro.
- **Implementação:** `.gitignore`, `.dockerignore`, `scripts/*restic*.sh`, `infra/nginx/`, `middlewares/errorHandler.ts`, `app.ts` (Helmet), `docs/production-minimum-plan.md`.
- **Teste automatizado:** `backend/src/tests/security/sensitive-files.security.test.ts` — `git ls-files` não rastreia `.env`/`*.pem`/`*.key`/`*.crt`/`*.sql`/`*.dump`/`*.csv`/`*.xlsx`/`*.zip`; `.env` não rastreado mas `.env.example` sim; `.gitignore`/`.dockerignore` cobrem os padrões. **+** gate equivalente no workflow.
- **Como demonstrar:** rodar `sensitive-files.security.test.ts`; mostrar o passo do workflow `Check for tracked sensitive files`.
- **Limitações honestas:** TLS local é cert autoassinado (sem domínio/cert real/WAF); backup offsite validado por scripts mas sem bucket real ainda; produção segura é trilha planejada, não implantada.

---

## Encerramento honesto para a defesa

O ClinicBridge implementa **muito mais que 10 controles** (ver os 64 no catálogo).
Estes **10 requisitos guarda-chuva** existem para organizar a defesa e o PDF
obrigatório, mapeando cada requisito a controles reais **e** a testes automatizados
verificáveis. O projeto é um **MVP local com dados sintéticos**, preparado com boas
práticas; não é, e não se apresenta como, um sistema de produção certificado.
