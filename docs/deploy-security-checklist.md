# ClinicBridge — Checklist de Deploy Seguro

> Checklist técnico de configuração/segurança para preparar **staging/produção**.
> Criado na Sprint 3.6. **Não é deploy real**, **não** afirma produção pronta e
> **não** afirma conformidade completa com LGPD/HIPAA/CFM. Não substitui uma
> revisão de segurança dedicada.
>
> Relacionado: `docs/security-notes.md`, `docs/adr/0004-deploy-security-baseline.md`,
> `docs/backup-restore-strategy.md` + `docs/backup-restore-local-runbook.md`,
> `docs/data-retention-policy.md`, `.env.example` (fonte de verdade das envs).

## 1. Status e escopo

- **Estado:** rascunho técnico inicial. O MVP **não está pronto para produção**
  (ver ressalvas P1 em `docs/security-notes.md`).
- **Escopo desta sprint:** auditar e preparar a configuração de deploy seguro
  (envs, CORS, headers, trust proxy, rate limit, secrets, compose, healthcheck).
  **Sem** deploy real, Terraform, CI/CD, domínio, HTTPS real ou serviço externo.
- **Foco:** dar uma lista verificável antes de subir staging e produção.

## 2. Ambientes

| Ambiente | Uso | Observações |
|---|---|---|
| development | local (WSL/Docker) | `NODE_ENV=development`; CORS aceita `http://localhost:5173`; rate limit memory |
| test | CI/local | igual dev, sem dados reais |
| production | staging/prod | `NODE_ENV=production` ativa as guardas (CORS sem `*`, guardas de placeholder, warnings) |

`NODE_ENV` controla fail-fast/warnings: defina **`production`** em staging e prod
para ligar as proteções.

## 3. Variáveis obrigatórias

Fonte de verdade: `.env.example`. Validação no boot por `config/env.ts` (zod) —
configuração inválida derruba o processo (`process.exit(1)`).

**Obrigatórias (sem default — boot falha se ausentes/ inválidas):**
- `DATABASE_URL` (URL válida).
- `JWT_SECRET` (≥ 48 chars; use `openssl rand -hex 32`).

**Obrigatórias apenas em produção (boot falha se ausentes/inválidas com `NODE_ENV=production`):**
- `MFA_ENCRYPTION_KEY` (≥ 32 chars; use `openssl rand -hex 32`). Em dev/test: opcional
  (fallback para `JWT_SECRET`). **Aviso:** rotar esta chave invalida todos os TOTP armazenados.
- `FRONTEND_ORIGIN` sem localhost/127.0.0.1/http:// (Sprint 3.39). Deve ser HTTPS com domínio real.

**Importantes com default (revisar para produção):**
- `NODE_ENV=production`, `BACKEND_PORT`, `LOG_LEVEL`.
- `FRONTEND_ORIGIN` (ver §4), `JWT_EXPIRES_IN` (default `1h`).
- `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`, `IMPORT_MAX_ROWS`.
- Rate limit por escopo `<AUTH|UPLOAD|PATIENTS|EXPORT|IMPORT>_RATE_LIMIT_*`.
- `TRUST_PROXY` (ver §6), `RATE_LIMIT_STORE` + `REDIS_URL`/`REDIS_PREFIX` (ver §7).

**Guardas de produção (`config/env.ts`):** com `NODE_ENV=production`, o boot **falha** se:
- `JWT_SECRET` contém o placeholder (`replace-with…`/`change-me`) — Sprint 3.6.
- `DATABASE_URL` contém `change-me-locally` — Sprint 3.6.
- `MFA_ENCRYPTION_KEY` ausente ou < 32 chars — Sprint 3.39.
- `FRONTEND_ORIGIN` inclui localhost, 127.0.0.1 ou origem http:// — Sprint 3.39.

Motivo do guard de `JWT_SECRET`: o placeholder tem > 48 chars e passaria no `min(48)`.

> Frontend: `VITE_API_BASE_URL` (build-time, Vite) deve apontar para a URL pública
> da API em produção.
>
> Secrets: gerar com `openssl rand -hex 32` e armazenar no AWS SSM Parameter Store
> (SecureString). Ver `docs/secrets-env-production-runbook.md`.

## 4. CORS

- Allowlist dirigida por `FRONTEND_ORIGIN` (lista separada por vírgula).
  `credentials: true`; métodos e headers explícitos; `X-Request-Id` exposto.
- **Produção:** `*` é **recusado no boot** (`process.exit(1)`); lista vazia também
  falha. Origem não permitida → resposta sem CORS (browser bloqueia), com log
  `cors: origin not allowed` (sem vazar detalhe ao cliente).
- Chamadas sem `Origin` (curl/health/server-to-server) são permitidas — CORS só
  protege browsers.
- **Exemplos:** dev `http://localhost:5173`; prod
  `https://app.clinicbridge.com.br` (HTTPS, sem barra final).
- **Nunca** usar `*` com `credentials: true`.

## 5. HTTPS / reverse proxy + WAF (estratégia)

- **Decisão (Sprint 3.8):** **Nginx** como reverse proxy baseline; WAF futuro com
  **ModSecurity + OWASP CRS** em **detection-only first**. Detalhe:
  `docs/edge-security-strategy.md` + ADR `docs/adr/0005-edge-security-reverse-proxy-waf.md`.
  **Ainda NÃO implementado** (sem Nginx/`nginx.conf`/TLS/WAF nesta fase).
- **Requisito de produção:** TLS termina no **Nginx**; o backend Express fica HTTP
  interno e **não** é exposto direto na internet. Caddy/Traefik avaliados e não
  escolhidos (ver ADR 0005).
- **TLS local/staging (Sprint 3.11):** Nginx termina TLS com **cert autoassinado**
  (`scripts/generate-local-nginx-cert.sh` → `infra/nginx/certs/` gitignored) +
  redirect HTTP→HTTPS; portas host `8080` (HTTP) / `8443` (HTTPS). Teste com
  `curl -k`. `X-Forwarded-Proto: https` enviado ao backend no server TLS. **HSTS
  desativado** em local (comentado no `conf.d`) — ligar só com HTTPS real estável.
  **Produção** usa cert **real** (ACME/Let's Encrypt ou gerenciado) + domínio real.
- HSTS (via Helmet/Nginx) só tem efeito sob HTTPS; HTTP **redireciona** para HTTPS.
- **`client_max_body_size`** do Nginx deve ser ≥ `UPLOAD_MAX_BYTES` (5 MB) — senão
  corta uploads válidos com 413 antes do app (JSON segue limitado a 100kb no Express).
- **`TRUST_PROXY`** = hop count real do Nginx; Nginx seta `X-Real-IP`/`X-Forwarded-For`.
- **CORS** continua no backend (`FRONTEND_ORIGIN` HTTPS real; Nginx não emite CORS).
- **WAF staged:** detection-only/log-only → tuning por rota (upload/import/export/
  auth) → blocking gradual. WAF **não** substitui auth/role/rate limit/validação.
- Logs do Nginx sem corpo, sem `Authorization`/`Cookie`, sem PII.
- **Implementado (Sprint 3.9 + 3.10, local/staging):** Nginx reverse proxy em
  `infra/nginx/` + serviço `nginx` opcional no compose (profile `edge`).
  **Sprint 3.10:** backend **containerizado** (`backend/Dockerfile` multi-stage,
  node:20-slim, **non-root**, prod-only, sem `.env`) + serviço `backend` no compose
  (profile `edge`, `expose: 3001` — não publicado); Nginx proxya para `backend:3001`
  na rede do compose (resolve a limitação WSL2 da 3.9). Subir:
  `docker compose --profile edge up -d postgres redis backend nginx` → proxy em
  `127.0.0.1:8080`. `client_max_body_size 10m` (≥ `UPLOAD_MAX_BYTES`); headers
  `X-Real-IP`/`X-Forwarded-For` com **anti-spoof** (overwrite); backend com
  `TRUST_PROXY=1` + `RATE_LIMIT_STORE=redis`; logs sem `Authorization`/`Cookie`/
  corpo. Verificado e2e: health/live/ready 200, readiness 503 com DB parado.
  Runbook: `docs/nginx-local-staging-runbook.md`.
- **Sprint 3.38 (entregue):** `NODE_ENV=production` no Dockerfile runtime (compose
  local sobrescreve para `development`); templates Nginx para `api.clinicbridge.com.br`
  e `staging.clinicbridge.com.br` em `infra/nginx/conf.d/*.conf.example`; runbook
  DNS/TLS em `docs/dns-tls-staging-runbook.md` (Registro.br → Certbot → validações
  → go/no-go). DNS real e cert real ficam para quando a EC2 estiver disponível.
- **Fora do escopo desta fase:** TLS/certificado real, domínio real ativo, ModSecurity/WAF,
  deploy real (estratégia/ADR + proxy local/staging + templates prontos).

## 6. Trust proxy

- `TRUST_PROXY` (`config/env.ts` → `app.set('trust proxy', …)`). Default `false`
  (não confia em `X-Forwarded-*`) — correto para API exposta direto.
- **Atrás de proxy:** definir o **hop count** real (ex.: `TRUST_PROXY=1`) para que
  `req.ip` (rate limit + `audit_logs`) use o IP real do cliente.
- Em produção, se `TRUST_PROXY` não estiver setado, o boot emite **warning forte**
  (não falha — `false` é legítimo para API exposta direto).
- Confiar cegamente em XFF deixaria qualquer cliente forjar o IP de origem.

## 7. Rate limit / Redis

- Limiters por grupo (auth/upload/patients/export/import), IP-keyed, **antes** do
  `requireAuth`; 429 genérico + headers draft-7.
- `RATE_LIMIT_STORE=memory|redis` (default memory). **memory** = contadores por
  instância (ok dev/instância única). **redis** = store compartilhado (necessário
  em multi-instância).
- **redis mode:** `REDIS_URL` obrigatória (boot falha sem ela) e **fail-fast** se
  não conectar (não degrada para memory).
- **Produção (Sprint 3.6):** com `NODE_ENV=production` e `RATE_LIMIT_STORE=memory`
  o boot emite **warning** (não falha) — multi-instância deve usar `redis`.
- `REDIS_URL` pode conter credenciais e **nunca** é logada; Redis gerenciado/
  protegido em produção (sem exposição pública).

## 8. Banco de dados

- `DATABASE_URL` com credenciais reais e fortes (guarda de produção rejeita o
  placeholder `change-me-locally`).
- **Produção:** Postgres **gerenciado** ou protegido (rede privada, sem porta
  pública), TLS na conexão quando aplicável, usuário com menos privilégios.
- DAOs sempre filtram `clinica_id` (tenant isolation); migrations versionadas e
  aplicadas de forma controlada (`migrate:latest`).
- Backups: ver §11.

## 9. Storage / uploads

- `UPLOAD_DIR` é **storage privado** (nunca servido pela web), nome interno
  aleatório, SHA-256, validação por magic bytes.
- **Produção:** garantir que `UPLOAD_DIR` fique em volume persistente e privado,
  fora de qualquer raiz pública; incluído no backup (ver §11).
- Sem signed URL / download público (fora de escopo até caso de uso real).

## 10. Secrets

- `.env` **nunca** versionado (`.gitignore` cobre `.env`/`.env.*`, mantém
  `.env.example`). Apenas placeholders no `.env.example`.
- `JWT_SECRET` forte (≥ 48 chars); rotação planejada (invalida tokens vigentes).
- `RESTIC_PASSWORD` é **shell-only** (nunca em `.env`/arquivo/Git) — perda = backup
  irrecuperável.
- **Produção:** usar secrets manager / variáveis de ambiente seguras do provedor;
  não imprimir segredos em logs (logger redige `authorization/cookie/password/
  senha/cpf/token/...`).

## 11. Backup / restore

- Estratégia: **Restic-first** (ADR 0003). Backup/restore **local** implementado +
  restore drill validado (Sprint 3.5) — `scripts/` + runbook.
- **Pendente para produção:** destino **offsite**, gestão de chave do repo,
  agendamento, monitoramento/alerta e validação de ponta a ponta.
- Backups contêm PII → cifrados em repouso; nunca versionados.

## 12. Logs e auditoria

- `logger` (pino) com `redact` (`authorization/cookie/password/senha/senha_hash/
  cpf/token/access_token/refresh_token`, `remove: true`).
- `errorHandler` nunca vaza stack/SQL/path; 500 → `internal_error` genérico.
- `audit_logs` append-only, sem PII; `X-Request-Id` em toda resposta.
- **Produção:** centralizar logs, definir retenção/rotação (alinhar à política de
  retenção) e monitorar erros/saturação.

## 13. Healthcheck (liveness vs readiness)

- **Liveness — "o processo está de pé?":** `GET /health` e o alias `GET
  /health/live` → `{status:'ok', service, timestamp}` (200). **Sem** dependências,
  DB, auth ou PII. Use para o liveness probe do orquestrador. `/health` é mantido
  para compatibilidade.
- **Readiness — "consegue servir tráfego?":** `GET /health/ready` faz um `select 1`
  leve no pool knex existente:
  - **200** quando o banco responde:
    `{status:'ready', service, timestamp, checks:{database:'ok'}}`.
  - **503** quando o banco não responde:
    `{status:'not_ready', ..., checks:{database:'error'}}`.
  - Timeout curto (`HEALTH_READY_DB_TIMEOUT_MS`, default 2000) para um 503 rápido
    em vez de pendurar no acquire longo do knex.
  - **Nunca** vaza `DATABASE_URL`, erro bruto, stack ou SQL — só `ok`/`error`. Sem
    auth, sem PII, sem `audit_logs`.
  - Use no readiness probe; o proxy/orquestrador só envia tráfego quando 200.
- Compose já tem healthcheck de Postgres/Redis (container-level).
- **Futuro (não implementado):** adicionar checagem de Redis ao readiness quando
  `RATE_LIMIT_STORE=redis` em produção.

## 14. Docker Compose: local/dev vs produção

- `docker-compose.yml` é **local/dev** — não é definição de produção.
  - Postgres publicado em `${POSTGRES_PORT:-5432}:5432` (host); Redis em
    `127.0.0.1:${REDIS_PORT:-6379}` (apenas loopback).
  - Volumes nomeados; healthchecks; `restart: unless-stopped`; **sem** secrets
    reais (placeholders via env).
- **Recomendações de produção** (não aplicar no compose dev):
  - **não** publicar Postgres em interface pública (rede privada / bind loopback);
  - Postgres/Redis gerenciados ou protegidos;
  - reverse proxy + HTTPS à frente da API;
  - secrets via env segura/secrets manager;
  - backups offsite + logs/monitoramento;
  - CORS restrito (`FRONTEND_ORIGIN` real).

## 15. Checklist antes de staging

- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` forte (≠ placeholder; `openssl rand -hex 32`); `DATABASE_URL` real (≠ `change-me-locally`).
- [ ] `MFA_ENCRYPTION_KEY` definida (≥ 32 chars; `openssl rand -hex 32`). **Não reutilizar `JWT_SECRET`.**
- [ ] `FRONTEND_ORIGIN` explícito (sem `*`, sem `localhost`, sem `http://`), HTTPS.
- [ ] `TRUST_PROXY` = hop count real (se houver proxy).
- [ ] `RATE_LIMIT_STORE=redis` + `REDIS_URL` se multi-instância.
- [ ] Secrets armazenados no SSM Parameter Store (SecureString) — ver `docs/secrets-env-production-runbook.md`.
- [ ] Migrations aplicadas (`migrate:status` limpo).
- [ ] `/health` (e `/health/live`) responde 200; `/health/ready` 200 com DB up
  (e 503 quando o DB cai) — ligar nos probes de liveness/readiness.
- [ ] Backup local validado (restore drill OK).
- [ ] `.env` não versionado; sem secret em logs.

## 16. Checklist antes de produção

- [ ] Tudo de §15 + revisão de segurança dedicada.
- [ ] HTTPS/reverse proxy reais; HTTP→HTTPS.
- [ ] Postgres/Redis gerenciados/protegidos (sem porta pública).
- [ ] Secrets manager; rotação de `JWT_SECRET` planejada.
- [ ] Backup **offsite** + gestão de chave + agendamento + monitoramento.
- [ ] Logs centralizados + alertas; retenção definida (validação jurídica).
- [ ] Revisão de CORS/env de produção concluída.
- [ ] Plano de incidente/restore documentado e testado.

## 17. Itens fora do escopo (desta sprint)

- deploy real / provisionamento (AWS, etc.), Terraform/IaC, CI/CD completo;
- domínio, certificado e HTTPS reais; serviço externo real;
- secrets manager real; offsite real do backup;
- readiness endpoint com checagem de DB (registrado como melhoria futura);
- qualquer dado clínico, limpeza real ou endpoint destrutivo.
