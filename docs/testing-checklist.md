# ClinicBridge — Checklist de Testes

> Consolidado na compactação de 2026-05-22 a partir das verificações das sprints
> (`docs/sprint-history.md`). Use como roteiro de smoke test / regressão local.
> Endpoints tenant-scoped exigem `Authorization: Bearer <token>` (de `/auth/login`).

## Build / typecheck

```bash
# Backend (porta 3001)
pnpm --filter backend typecheck
pnpm --filter backend build

# Frontend (Vite, porta 5173)
pnpm --filter frontend typecheck
pnpm --filter frontend build

# Migrations
pnpm --filter backend migrate:status
pnpm --filter backend migrate:latest
```

Não rode builds quando a tarefa só mexe em docs.

## Setup local

```bash
cp .env.example .env
pnpm install
docker compose up -d
curl http://localhost:3001/health
```

## Smoke tests (curl)

```bash
# Health
curl http://localhost:3001/health

# Auth
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","senha":"..."}'
curl http://localhost:3001/auth/me -H "Authorization: Bearer $TOKEN"

# Import files
curl http://localhost:3001/import-files -H "Authorization: Bearer $TOKEN"
# upload: multipart, campo "file" (.csv/.xlsx)
curl -X POST http://localhost:3001/import-files/upload \
  -H "Authorization: Bearer $TOKEN" -F "file=@valid.csv"

# Pacientes (CPF sempre mascarado)
curl "http://localhost:3001/patients?search=&limit=50&offset=0" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3001/patients/duplicates" -H "Authorization: Bearer $TOKEN"

# Export (read-only)
curl "http://localhost:3001/patients/export?format=csv" -H "Authorization: Bearer $TOKEN" -o pacientes.csv

# Retenção (DRY-RUN, não apaga)
curl "http://localhost:3001/import-files/retention/dry-run" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3001/import-files/retention/dry-run?retention_days=60&limit=50" -H "Authorization: Bearer $TOKEN"
```

## SQL de validação (sanity-check de invariantes)

```sql
SELECT count(*) FROM patients;          -- baseline local: 6
SELECT count(*) FROM import_files;       -- baseline local: 24
SELECT count(*) FROM import_sessions;    -- baseline local: 7

-- audit não deve conter PII; colunas reais apenas:
SELECT acao, recurso, recurso_id, usuario_id, clinica_id, ip, user_agent, request_id, criado_em
FROM audit_logs ORDER BY criado_em DESC LIMIT 20;
```

> Os counts são do ambiente local e podem mudar após novos testes. Antes/depois
> de uma operação read-only (export, duplicates, retention dry-run) os counts de
> `patients`/`import_files`/`import_sessions` **não devem mudar**.

## Upload — tipo de arquivo (magic bytes, Sprint 2.23)

Resultados esperados com fixtures reais:
- `empty.csv` → `file_empty`
- arquivo binário → `invalid_file_content`
- `valid.csv` (texto) → ok
- texto renomeado para `.xlsx` → `invalid_file_content`
- ZIP real (stored, não-OOXML) renomeado `.xlsx` → `invalid_file_content`
- XLSX real (gerado por exceljs) → ok
- XLSX válido com MIME fora da allowlist → `invalid_file_type`

## Export (Sprint 2.21–2.22)

- `format` ≠ csv/xlsx → 400 `patients_export_invalid_format`
- `include_cpf_raw=true` → 400 `patients_export_cpf_raw_not_allowed`
- CPF nunca bruto (só `cpf_masked`)
- formula injection neutralizada em CSV e XLSX (célula iniciando com `= + - @` recebe prefixo `'`)
- acima de `PATIENTS_EXPORT_MAX_ROWS` → 413
- `Content-Disposition` filename fixo; sem signed URL

## Retenção dry-run (Sprint 2.24/2.26)

- Resposta só com metadados seguros (sem nome/hash/path/conteúdo)
- `retention_days` fora de 1..365 ou `limit` fora de 1..MAX → 400 `invalid_retention_params`
- arquivos em fluxo ativo (última sessão validated/ready_for_import/import_started) são excluídos dos candidatos
- outra clínica → 0 candidatos (tenant isolation)
- `import_files`/`import_sessions`/`patients` inalterados (nada é apagado)

## Rate limit (Sprint 2.22)

- limiter roda antes do auth: requisições sem token estouram 429 após o teto
- 429 body genérico `{ error: { code: 'rate_limited', ... } }`, headers `RateLimit`/`Retry-After`

## Trust proxy + rate-limit store (Sprint 3.2)

Dica: para não poluir o dev server, suba instâncias efêmeras numa porta livre com
um limite baixo. O `.env` é carregado por `dotenv` mas variáveis passadas inline
têm precedência (dotenv não sobrescreve o que já está no ambiente).

**Memory mode (default):**
```bash
cd backend
RATE_LIMIT_STORE=memory BACKEND_PORT=3010 EXPORT_RATE_LIMIT_MAX=3 \
  pnpm exec tsx src/server.ts &
# boot loga {"store":"memory",...}
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3010/patients/export?format=csv; done   # 401,401,401,429,429
```

**Redis mode (precisa Redis):**
```bash
docker compose up -d redis            # serviço opcional; bound a 127.0.0.1
docker exec clinicbridge-redis redis-cli ping   # PONG
cd backend
RATE_LIMIT_STORE=redis REDIS_URL=redis://localhost:6379 \
  REDIS_PREFIX="clinicbridge:ratelimit:" BACKEND_PORT=3011 EXPORT_RATE_LIMIT_MAX=3 \
  pnpm exec tsx src/server.ts &
# boot loga {"store":"redis","prefix":"clinicbridge:ratelimit:",...} SEM ClientClosedError
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3011/patients/export?format=csv; done   # ... 429
docker exec clinicbridge-redis redis-cli --scan --pattern 'clinicbridge:ratelimit:*'
# Persistência: reinicie o backend (mesmo Redis) e a 1ª chamada de export já dá 429.
```

> Falha-rápido: com `RATE_LIMIT_STORE=redis` e `REDIS_URL` inacessível, o boot
> termina com `process.exit(1)` (não cai para memory). Com `RATE_LIMIT_STORE=redis`
> e `REDIS_URL` ausente, o env falha na validação (REDIS_URL required).

**Trust proxy:**
```bash
# Sem endpoint de debug: observe o IP na chave do Redis.
# TRUST_PROXY=1  -> chave usa o X-Forwarded-For
RATE_LIMIT_STORE=redis REDIS_URL=redis://localhost:6379 REDIS_PREFIX="clinicbridge:tp1:" \
  BACKEND_PORT=3012 TRUST_PROXY=1 pnpm exec tsx src/server.ts &
curl -s -o /dev/null -H "X-Forwarded-For: 203.0.113.7" http://localhost:3012/patients
docker exec clinicbridge-redis redis-cli --scan --pattern 'clinicbridge:tp1:*'   # ...:203.0.113.7
# TRUST_PROXY=false -> chave usa o IP do socket (XFF ignorado)
```

Limpeza: encerre as instâncias efêmeras (mate o **listener**, não só o wrapper
pnpm) e `docker exec clinicbridge-redis redis-cli --scan --pattern 'clinicbridge:*' | xargs -r docker exec clinicbridge-redis redis-cli del`.

## Autorização por papel — requireRole (Sprint 3.1)

Precondição: um token de `dono_clinica` (owner) e um de `secretaria` (operator).
Owner sai do fluxo normal de registro/login. Para um operator de teste local há
duas opções seguras:

```sql
-- Opção A: rebaixar temporariamente um usuário de teste para operator
UPDATE users SET papel = 'secretaria' WHERE email = '<email_de_teste>';
-- ... rode os testes ...
-- Voltar o usuário principal para owner (NÃO deixar o ambiente quebrado):
UPDATE users SET papel = 'dono_clinica' WHERE email = '<email_de_teste>';
```

> Opção B (sem mutar o DB): assinar dois JWTs localmente com o próprio
> `tokenService` (mesmo `JWT_SECRET` do servidor), variando só `papel`
> (`dono_clinica` vs `secretaria`) com um `sub`/`clinica_id` reais. Como
> `requireRole` lê o papel do JWT, isso exercita o gate sem criar usuários.

Matriz esperada:

```bash
B=http://localhost:3001
# 1) Sem token (auth roda antes do role) → 401
curl -s -o /dev/null -w "%{http_code}\n" "$B/patients/export?format=csv"          # 401
curl -s -o /dev/null -w "%{http_code}\n" "$B/import-files/retention/dry-run"        # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/import-sessions/<id>/import"   # 401

# 2) Owner (dono_clinica) → 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$B/patients"                       # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$B/patients/duplicates"            # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$B/patients/export?format=csv"     # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$B/import-files/retention/dry-run" # 200

# 3) Secretaria (operator)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SEC" "$B/patients"                    # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SEC" "$B/patients/duplicates"         # 200
curl -s -H "Authorization: Bearer $SEC" "$B/patients/export?format=csv"                                   # 403 forbidden_role
curl -s -H "Authorization: Bearer $SEC" "$B/import-files/retention/dry-run"                               # 403 forbidden_role
curl -s -X POST -H "Authorization: Bearer $SEC" "$B/import-sessions/<id>/mark-ready"                      # 403 forbidden_role
curl -s -X POST -H "Authorization: Bearer $SEC" "$B/import-sessions/<id>/import"                          # 403 forbidden_role
```

Body 403 esperado: `{ "error": { "code": "forbidden_role", "message": "Você não tem permissão para executar esta ação." } }`.

SQL de papéis: `SELECT id, email, papel, clinica_id FROM users ORDER BY criado_em DESC LIMIT 10;`

UI: como operator (`secretaria`), o painel "Arquivos antigos de importação" não
aparece; em "Pacientes importados" os botões de export viram uma nota; no detalhe
de uma revisão, mark-ready/importação viram nota (recibo e simulação seguem
visíveis). Como owner, tudo aparece normalmente.

## Deploy seguro / CORS / env de produção (Sprint 3.6)

Detalhe: `docs/deploy-security-checklist.md` + ADR 0004. Guardas só disparam com
`NODE_ENV=production` (dev/test intactos). Use instâncias efêmeras numa porta livre
para não tocar o dev server.

```bash
cd backend

# 1) Guarda: JWT_SECRET placeholder em produção → boot DEVE falhar (exit !=0)
NODE_ENV=production BACKEND_PORT=3099 \
  DATABASE_URL='postgresql://u:p@localhost:5432/db' \
  JWT_SECRET='replace-with-output-of-openssl-rand-hex-32-at-least-48-chars' \
  pnpm exec tsx src/config/env.ts; echo "exit=$?"   # espera erro [env] + exit=1

# 2) Guarda: DATABASE_URL com placeholder local em produção → boot DEVE falhar
NODE_ENV=production BACKEND_PORT=3099 \
  DATABASE_URL='postgresql://clinicbridge:change-me-locally@localhost:5432/clinicbridge' \
  JWT_SECRET="$(openssl rand -hex 32)" \
  pnpm exec tsx src/config/env.ts; echo "exit=$?"   # espera erro [env] + exit=1

# 3) Segredos válidos em produção → env carrega (sem erro de placeholder)
NODE_ENV=production BACKEND_PORT=3099 \
  DATABASE_URL='postgresql://u:s3cret@db.internal:5432/clinicbridge' \
  JWT_SECRET="$(openssl rand -hex 32)" \
  pnpm exec tsx src/config/env.ts; echo "exit=$?"   # espera exit=0
```

CORS (com backend rodando):
```bash
# Origem não permitida não recebe Access-Control-Allow-Origin (browser bloqueia)
curl -s -D - -o /dev/null -H "Origin: https://evil.example" http://localhost:3001/health | grep -i access-control || echo "(sem ACAO header — correto)"
# Em produção, FRONTEND_ORIGIN='*' faz o boot falhar; lista vazia também.
```

Health / readiness (Sprint 3.7):
```bash
# Liveness (sem DB): 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health        # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health/live   # 200
curl -s http://localhost:3001/health     # {status:'ok',service,timestamp} — sem env/versão/secret

# Readiness (select 1 leve): 200 com DB up
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health/ready  # 200
curl -s http://localhost:3001/health/ready
# -> {"status":"ready",...,"checks":{"database":"ok"}}

# Readiness com DB fora -> 503, em ~HEALTH_READY_DB_TIMEOUT_MS (default 2000),
# sem stack/DATABASE_URL. Teste SEM parar o Postgres compartilhado: subir uma
# instância efêmera apontando DATABASE_URL para um host inalcançável:
cd backend
BACKEND_PORT=3011 DATABASE_URL='postgresql://u:p@10.255.255.1:5432/db' \
  JWT_SECRET="$(openssl rand -hex 32)" pnpm exec tsx src/server.ts &
sleep 3
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:3011/health/ready  # 503 ~2s
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/health                       # 200 (liveness)
# encerrar a instância efêmera: kill o LISTENER (não só o wrapper pnpm) —
# pgrep -af 'tsx src/server.ts' e mate o PID do node/MainThread em :3011.
```

## Backup/restore local com Restic (Sprint 3.5) — LOCAL/DEV, sem offsite

Pré: `restic` instalado, Docker/Postgres de pé, `RESTIC_PASSWORD` exportada no
shell (nunca em arquivo). Detalhe: `docs/backup-restore-local-runbook.md`.

```bash
export RESTIC_PASSWORD='dev-local-only-change-me'   # só no shell; não versionar
./scripts/check-backup-env.sh        # restic/docker/pg_dump/pg_restore/.gitignore
./scripts/backup-local-restic.sh     # pg_dump -Fc + storage -> snapshot Restic local
./scripts/restore-local-restic.sh    # restaura em clinicbridge_restore_test e compara counts
```

Esperado:
- `check` termina "Ambiente pronto..." (0 fail).
- `backup` cria/usa `backups/restic-repo`, gera dump em `backups/work/`, salva snapshot.
- `restore` recria **clinicbridge_restore_test** (nunca o principal) e imprime:
  `patients`/`import_files`/`import_sessions` → main == restore (OK).
- Banco principal **intacto**; `RESTORE_DB` é separado.
- `git status --short` não mostra backups/dumps/repo Restic (tudo sob `backups/` ignorado).
- Limpar banco de teste (opcional):
  `docker exec clinicbridge-postgres psql -U clinicbridge -d postgres -c 'DROP DATABASE IF EXISTS "clinicbridge_restore_test";'`

> Segurança: `RESTIC_PASSWORD` nunca em arquivo/docs; `backups/` e o repo Restic
> (cifrado, com PII) são git-ignored; sem AWS/S3/offsite nesta fase.

## Responsividade mobile (Sprint 2.26)

Testar `/app` no DevTools em 360, 390, 414 (iPhone XR), 430 e 768px e desktop:
- sem scroll horizontal / sem corte lateral no topo
- "ClinicBridge" + "Sair" cabem ou quebram corretamente; selo "Sessão ativa" não estoura
- nome do usuário e e-mail longos quebram linha (não cortam)
- cards de identidade e do rodapé colapsam para 1 coluna no mobile
- painel "Arquivos antigos de importação": inputs/botões quebram linha; card não estoura; rótulos longos quebram
- validação de input: dias 0/366 ou "Mostrar até" 0/101 → mensagem amigável, **sem** chamada à API
