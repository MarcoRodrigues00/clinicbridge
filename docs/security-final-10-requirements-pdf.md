---
title: "ClinicBridge — Requisitos de Segurança da Defesa (R01–R10)"
subtitle: "MVP local / case acadêmico · dados sintéticos · boas práticas de segurança e privacidade"
date: "2026-06-08"
---

# ClinicBridge — Requisitos de Segurança (Defesa)

> **Versão para PDF/impressão.** Contém **exatamente os 10 requisitos** R01–R10
> apresentados na defesa. Detalhamento técnico e mapeamento controle-a-controle:
> `docs/security-final-10-requirements.md`. Catálogo completo (64 controles):
> `docs/security-controls-catalog.md`.
>
> **Aviso:** ClinicBridge é um **MVP local / acadêmico** com **dados sintéticos**,
> construído com boas práticas de segurança e privacidade. **Não** está em produção
> e **não** afirma conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil.

## Verificação automatizada

```bash
pnpm test:security
# = pnpm --filter backend test:security  (suíte de segurança sem banco)
```

CI: `.github/workflows/security-checks.yml` roda em `push`/`pull_request` para `main`
(typecheck + build de backend/frontend, testes de segurança, testes de integração e
gate de arquivos sensíveis rastreados).

---

## Tabela-resumo dos 10 requisitos

| # | Requisito | Teste automatizado principal |
|---|-----------|------------------------------|
| R01 | Autenticação segura e sessões JWT | `tests/security/auth.security.test.ts` |
| R02 | Autorização por papéis, grants clínicos e governança | `authz.security.test.ts` + `requireClinicGovernance.test.ts` |
| R03 | Isolamento multi-tenant por clínica | `tenant.security.test.ts` + `tests/integration/tenant.integration.test.ts` |
| R04 | Proteção LGPD de PII e dados clínicos | `pii.security.test.ts` + `models/patient.test.ts` |
| R05 | Auditoria e rastreabilidade metadata-only | `redaction.security.test.ts` + integration governança/financeiro |
| R06 | MFA/TOTP e proteção de segredos de autenticação | `mfa.security.test.ts` |
| R07 | Validação segura de uploads, importações e exports | `upload-export.security.test.ts` |
| R08 | Rate limiting e proteção contra abuso | `ratelimit.security.test.ts` |
| R09 | Configuração segura por ambiente e bloqueios de produção | `env-guards.security.test.ts` |
| R10 | Segurança operacional e infraestrutura local/staging | `sensitive-files.security.test.ts` + gate do CI |

---

## R01 — Autenticação segura e sessões JWT
- **Objetivo:** rotas protegidas exigem JWT válido; ausência/inválido → 401 genérico; login sem vazar identidade; MFA quando ativo.
- **Ameaças:** acesso não autenticado, token forjado/expirado, enumeração de usuários, bypass de 2FA.
- **Implementação:** `middlewares/requireAuth.ts`, `services/tokenService.ts`, `services/authService.ts`, argon2id.
- **Demonstrar:** `curl` sem/`Bearer` inválido → 401; rodar `auth.security.test.ts`.
- **Limitações:** sem refresh/revogação; papel stale até expirar.

## R02 — Autorização por papéis, grants clínicos e governança
- **Objetivo:** ações sensíveis respeitam papel, grants clínicos e vínculos administrativos **ativos**; negação 403 genérica.
- **Ameaças:** elevação de privilégio, operador agindo como dono, profissional vendo financeiro, membro revogado.
- **Implementação:** `requireRole`, `requireClinicalRole`, `requireClinicGovernance`; `effectiveFinancialAccess`.
- **Demonstrar:** secretaria tentando export/import → 403; `authz.security.test.ts` + teste de governança.
- **Limitações:** papel base do JWT (stale); roles granulares parciais; frontend só esconde UX.

## R03 — Isolamento multi-tenant por clínica
- **Objetivo:** tudo escopado por `clinica_id`; nenhuma clínica lê/edita dados de outra.
- **Ameaças:** vazamento/edição cross-tenant, enumeração, tenant-spoofing.
- **Implementação:** `requireClinic`, DAOs com filtro `clinica_id` (sem `listAll`), 404 genérico, recurso herda tenant do JWT.
- **Demonstrar:** `tenant.security.test.ts` + `tests/integration/tenant.integration.test.ts` (clínica A não vê serviço da B).
- **Limitações:** enforcement em app (sem RLS no banco); cross-tenant profundo exige Postgres (roda na CI).

## R04 — Proteção LGPD de PII e dados clínicos
- **Objetivo:** PII/dados clínicos minimizados, mascarados e nunca expostos indevidamente; privacidade por padrão.
- **Ameaças:** vazamento de CPF/carteirinha, exposição clínica indevida, PII em logs/export, formula injection.
- **Implementação:** `maskCpf`/`maskMemberNumber`, export anti-injection, redação de logs, fronteira administrativo×clínico.
- **Demonstrar:** `cpf_masked` em `GET /patients`; célula `=1+1` vira `'=1+1` no export; `pii.security.test.ts`.
- **Limitações:** sem cifra de coluna (compensada por read-audit); proibição de dado clínico em campo administrativo depende do operador; não é compliance completo.

## R05 — Auditoria e rastreabilidade metadata-only
- **Objetivo:** ações sensíveis geram trilha sem conteúdo clínico, PII desnecessária ou segredos.
- **Ameaças:** falta de rastreabilidade, PII/segredos na trilha, perda de evidência, leitura clínica sem registro.
- **Implementação:** `audit_logs` append-only (FK `SET NULL`), audit dentro da transação, `clinical_read_audit`, redação de logs.
- **Demonstrar:** linha de `audit_logs` só com UUIDs; `redaction.security.test.ts` + integration governança/financeiro.
- **Limitações:** sem coluna de conteúdo por design; read-audit compensa ausência de cifra de coluna.

## R06 — MFA/TOTP e proteção de segredos de autenticação
- **Objetivo:** segredo TOTP cifrado em repouso, nunca reexposto; token de webhook em comparação de tempo constante.
- **Ameaças:** roubo de segredo TOTP, replay/forja de webhook, timing attack, exposição em resposta.
- **Implementação:** `config/mfaCrypto.ts` (AES-256-GCM), `mfa_secret_encrypted`, backup codes argon2, `verifyAsaasToken`.
- **Demonstrar:** `mfa.security.test.ts` (round-trip, IV aleatório, blob adulterado rejeitado, token exato).
- **Limitações:** chave deriva do `JWT_SECRET` em dev; webhook por token compartilhado (não HMAC).

## R07 — Validação segura de uploads, importações e exports
- **Objetivo:** arquivos/dados validados de verdade, com limites e defesa contra abuso/injeção.
- **Ameaças:** binário disfarçado, zip-slip/bomb, importação ilimitada, formula injection, CPF no export.
- **Implementação:** magic bytes/OOXML (`utils/fileContent.ts`), storage privado + SHA-256, pipeline dry-run, `neutralizeFormula`, export com teto.
- **Demonstrar:** `.xlsx` falso (ZIP qualquer) rejeitado; `upload-export.security.test.ts`.
- **Limitações:** sem antivírus/DLP; validação OOXML mínima; `IMPORT_MAX_ROWS=100` conservador.

## R08 — Rate limiting e proteção contra abuso
- **Objetivo:** rotas sensíveis/pesadas limitadas, store compartilhado opcional, IP correto.
- **Ameaças:** brute-force, flood/DoS leve, abuso de export/import, spoof de IP.
- **Implementação:** `authRateLimit`/`rateLimit` (IP-keyed, antes do auth), store memory|redis (fail-fast), `TRUST_PROXY`.
- **Demonstrar:** flood em `/auth/login` → 429 genérico; `ratelimit.security.test.ts`.
- **Limitações:** verificação é estrutural/config (sem teste de carga frágil na CI); Redis gerenciado pendente.

## R09 — Configuração segura por ambiente e bloqueios de produção
- **Objetivo:** produção **falha** ao subir com config insegura e bloqueia recursos dev/sandbox.
- **Ameaças:** boot com segredo placeholder, CORS wildcard/localhost/HTTP, gateway real indevido, demo login em prod.
- **Implementação:** guards em `config/env.ts` (`superRefine`), CORS sem wildcard, `CLINICAL_READ_AUDIT_STRICT`, `ASAAS_ENV` só sandbox/disabled, demo gated.
- **Demonstrar:** `env-guards.security.test.ts`; `NODE_ENV=production` com placeholder aborta boot.
- **Limitações:** cobre erros conhecidos/críticos, não toda config; produção real (AWS) ainda planejada (ADR 5.2A).

## R10 — Segurança operacional e infraestrutura local/staging
- **Objetivo:** práticas operacionais reduzem vazamento, perda de dados e exposição indevida.
- **Ameaças:** commit de segredo/dump/dado real, perda sem backup, segredo na imagem Docker, erro vazando stack.
- **Implementação:** `.gitignore`/`.dockerignore`, segredos por env, backup/restore Restic com guards, Nginx/TLS local + Helmet, errorHandler seguro.
- **Demonstrar:** `sensitive-files.security.test.ts`; passo do CI `Check for tracked sensitive files`.
- **Limitações:** TLS local autoassinado (sem domínio/cert real/WAF); offsite sem bucket real; produção segura é trilha planejada.

---

**Conclusão:** ClinicBridge tem mais de 10 controles de segurança reais (catálogo de
64). Os 10 requisitos acima são **guarda-chuvas** para a defesa, cada um ligado a
controles no código **e** a testes automatizados. Projeto **MVP local com dados
sintéticos**, preparado com boas práticas — não um produto de produção certificado.
