# ClinicBridge — Checklist de Testes

> Consolidado na compactação de 2026-05-22 a partir das verificações das sprints
> (`docs/sprint-history.md`). Use como roteiro de smoke test / regressão local.
> Endpoints tenant-scoped exigem `Authorization: Bearer <token>` (de `/auth/login`).

## Usuários smoke persistentes (dev local apenas)

> Existem apenas no ambiente local/dev. **Nunca usar em produção. Nunca versionar
> em arquivos de deploy ou seed de produção.** Senha dev-only documentada abaixo
> — claramente falsa, sem valor de segurança.

| E-mail | `users.papel` | Grant clínico (`user_clinical_roles`) | Clínica |
|--------|--------------|---------------------------------------|---------|
| `smoke.owner@clinicbridge.local` | `dono_clinica` | — | Clinica Smoke Dev |
| `smoke.secretaria@clinicbridge.local` | `secretaria` | — | Clinica Smoke Dev |
| `smoke.profissional@clinicbridge.local` | `secretaria` | `profissional_clinico` | Clinica Smoke Dev |
| `smoke.gestor@clinicbridge.local` | `secretaria` | `gestor_clinica` | Clinica Smoke Dev |
| `smoke.admin@clinicbridge.local` | `admin_sistema` | — | (sem clínica) |

**Senha dev:** `SmokeDevOnly!23` — claramente fake, apenas para testes locais.

**Obter tokens:**

```bash
PASS="SmokeDevOnly!23"
get_token() {
  curl -sk -X POST https://localhost:8443/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${1}\",\"senha\":\"${PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token','LOGIN_FAILED'))"
}
TOKEN_OWNER=$(get_token "smoke.owner@clinicbridge.local")
TOKEN_SEC=$(get_token "smoke.secretaria@clinicbridge.local")
TOKEN_PROF=$(get_token "smoke.profissional@clinicbridge.local")
TOKEN_GESTOR=$(get_token "smoke.gestor@clinicbridge.local")
TOKEN_ADMIN=$(get_token "smoke.admin@clinicbridge.local")
```

**Regras de uso:**
- Não apagar esses usuários ao final de sprints.
- Pode criar dados clínicos sintéticos com eles e deletar os *dados* ao final; os *usuários* ficam.
- Se precisar recriar (ex.: after `docker compose down -v`), verificar por e-mail primeiro:
  ```sql
  SELECT email, papel FROM users WHERE email LIKE '%@clinicbridge.local';
  ```
- Não existe seed de produção que inclua esses usuários.
- `smoke.admin` não tem `clinica_id` (papel `admin_sistema`); retorna `no_clinic_context` em
  endpoints tenant-scoped — comportamento correto.

**IDs atuais (dev DB — podem mudar após `down -v` / recreate):**
```
smoke.owner        id=06026581-4595-47f6-b1ae-ce0221c70d8a  clinica_id=c48d1ac4-362d-4f10-9cf8-71771efd43c8
smoke.secretaria   id=031d9227-5946-4069-bce0-4b5a87c56077
smoke.profissional id=5730f0c3-e867-4384-813c-b8fb2122468f
smoke.gestor       id=9d17215b-9c6e-4fbf-8d18-d1c6c7af43c0
smoke.admin        id=9a408925-e7d1-4797-95c2-ff6795f3953d  (sem clinica_id)
```

**Recriar do zero (se necessário após `docker compose down -v`):**
```bash
# 1. Registrar owner (cria hash argon2 + clínica)
curl -sk -X POST https://localhost:8443/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nome":"Smoke Owner","email":"smoke.owner@clinicbridge.local","senha":"SmokeDevOnly!23","nome_clinica":"Clinica Smoke Dev","consentimento_lgpd":true}'

# 2. Obter hash e clinica_id
CLINICA_ID=$(docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -t -c \
  "SELECT id FROM clinics WHERE nome='Clinica Smoke Dev';" | tr -d ' \n')
OWNER_ID=$(docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -t -c \
  "SELECT id FROM users WHERE email='smoke.owner@clinicbridge.local';" | tr -d ' \n')
HASH=$(docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -t -c \
  "SELECT senha_hash FROM users WHERE email='smoke.owner@clinicbridge.local';" | tr -d ' \n')

# 3. Inserir demais usuários
docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -c "
INSERT INTO users (nome, email, senha_hash, papel, clinica_id, ativo) VALUES
  ('Smoke Secretaria',   'smoke.secretaria@clinicbridge.local',   '${HASH}', 'secretaria',   '${CLINICA_ID}', true),
  ('Smoke Profissional', 'smoke.profissional@clinicbridge.local', '${HASH}', 'secretaria',   '${CLINICA_ID}', true),
  ('Smoke Gestor',       'smoke.gestor@clinicbridge.local',       '${HASH}', 'secretaria',   '${CLINICA_ID}', true),
  ('Smoke Admin',        'smoke.admin@clinicbridge.local',        '${HASH}', 'admin_sistema', NULL,            true)
ON CONFLICT (email) DO NOTHING;"

PROF_ID=$(docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -t -c \
  "SELECT id FROM users WHERE email='smoke.profissional@clinicbridge.local';" | tr -d ' \n')
GESTOR_ID=$(docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -t -c \
  "SELECT id FROM users WHERE email='smoke.gestor@clinicbridge.local';" | tr -d ' \n')

# 4. Grants clínicos
docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge -c "
INSERT INTO user_clinical_roles (user_id, clinica_id, role, granted_by_user_id) VALUES
  ('${PROF_ID}',   '${CLINICA_ID}', 'profissional_clinico', '${OWNER_ID}'),
  ('${GESTOR_ID}', '${CLINICA_ID}', 'gestor_clinica',       '${OWNER_ID}')
ON CONFLICT DO NOTHING;"
```

## MFA / TOTP (Sprint 3.19)

App autenticador (TOTP); sem SMS/e-mail OTP/serviço externo. Backend e2e (backend
+ Postgres up). Para computar um código TOTP a partir do secret no teste:
`node -e "const {generateSync}=require('otplib'); console.log(generateSync({secret:process.argv[1]}))" <SECRET>` (rode em `backend/`).

```bash
# Usuário SEM MFA: login normal devolve token (comportamento atual).
# Setup (com Bearer de sessão):
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3001/auth/mfa/setup
#   -> { otpauth_url, manual_key, qr_data_url }   (secret só aqui, durante o setup)
# Confirmar (código do app):
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"123456"}' http://localhost:3001/auth/mfa/confirm        # -> mfa_enabled true
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/auth/mfa/status  # sem secret
# Login com MFA: devolve mfa_required + mfa_challenge_token (SEM token):
curl -s -X POST -H "Content-Type: application/json" -d '{"email":"...","senha":"..."}' \
  http://localhost:3001/auth/login
# Verificar login (challenge + código) -> token final:
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"challenge_token":"...","code":"123456"}' http://localhost:3001/auth/mfa/verify-login
# Desativar (exige TOTP válido):
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"123456"}' http://localhost:3001/auth/mfa/disable        # -> mfa_enabled false
```

Esperado: código errado em confirm → 400; em verify-login → 401; em disable → 400.
`status` nunca retorna o secret; logs não contêm secret/código; audit `auth.mfa.*`
sem PII. Usuários sem MFA continuam logando normalmente. Frontend: aba Segurança
→ "Ativar MFA" (QR + chave manual) → confirmar; login pede código; "Desativar MFA".

## MFA backup codes / códigos de recuperação (Sprint 3.21)

Códigos de recuperação de uso único (só hash argon2). Para gerar um TOTP a partir
do `manual_key` no teste: `node -e "const {generateSync}=require('otplib');
console.log(generateSync({secret:process.argv[1]}))" <SECRET>` (rodar em `backend/`).

```bash
B=http://localhost:3001; H='Content-Type: application/json'
# Ativar MFA (setup -> confirm) devolve os backup codes UMA vez:
curl -s -X POST -H "$H" -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"<TOTP>"}' $B/auth/mfa/confirm
#   -> { mfa_enabled:true, backup_codes_remaining:10, backup_codes:[ "ABCDE-FGHJK", ... ] }
# /auth/me NÃO contém backup codes:
curl -s $B/auth/me -H "Authorization: Bearer $TOKEN"          # sem 'backup_codes'
# status só mostra a contagem (nunca os códigos):
curl -s $B/auth/mfa/status -H "Authorization: Bearer $TOKEN"  # backup_codes_remaining: N
# Login com backup code (em vez do TOTP), no passo verify-login:
curl -s -X POST -H "$H" -d '{"challenge_token":"<CH>","code":"ABCDE-FGHJK"}' \
  $B/auth/mfa/verify-login                                    # -> token
# Regenerar (exige TOTP); invalida os anteriores e devolve novos 1x:
curl -s -X POST -H "$H" -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"<TOTP>"}' $B/auth/mfa/backup-codes/regenerate  # -> { backup_codes:[...10], count:10 }
```

Esperado (validado e2e por curl — 11/11):
1. ativar MFA → 10 backup codes; `backup_codes_remaining=10`.
2. `/auth/me` **não** contém backup codes.
3. login com TOTP continua funcionando.
4. login com backup code funciona (uso único).
5. reutilizar o mesmo backup code → **401** `invalid_mfa_code`.
6. backup code inválido → **401** `invalid_mfa_code` (genérico; não revela TOTP×backup).
7. regenerar (com TOTP) invalida os antigos; novo conjunto de 10.
8. login com código novo funciona.
9. usuário **sem MFA** não regenera → **400** `mfa_not_enabled`.
10. `audit_logs` têm `auth.mfa.backup_codes.generated/regenerated.success` e
    `auth.mfa.backup_code.used.success`, **sem** nenhum código; `code_hash` começa
    com `$argon2id`; log do backend sem códigos/secret.

> Dica: o backend em execução pode estar com código antigo. Para testar o fluxo
> novo, suba uma instância efêmera do código atual numa porta livre
> (`AUTH_RATE_LIMIT_MAX=2000 BACKEND_PORT=3025 pnpm exec tsx src/server.ts`) e use
> um usuário descartável (`register` → `login`). Encerre o listener da porta ao fim.
> Frontend: aba Segurança mostra os códigos 1x (copiar + checkbox "salvei"),
> contagem restante e "Gerar novos códigos"; login aceita "código do app **ou** de
> recuperação".

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
curl "http://localhost:3001/patients?search=&limit=50&offset=0" -H "Authorization: Bearer $TOKEN"   # default status=active
curl "http://localhost:3001/patients?status=archived" -H "Authorization: Bearer $TOKEN"             # só arquivados
curl "http://localhost:3001/patients/duplicates" -H "Authorization: Bearer $TOKEN"

# CRUD administrativo (Sprint 3.22) — criar/editar: dono + secretaria
curl -X POST "http://localhost:3001/patients" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Fulano","telefone":"11999990000","cpf":"11144477735","data_nascimento":"1990-05-20"}'
curl -X PATCH "http://localhost:3001/patients/$PID" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"telefone":"11888887777"}'   # CPF em branco/omitido = mantém
# arquivar/restaurar: SÓ dono (secretaria -> 403 forbidden_role)
curl -X PATCH "http://localhost:3001/patients/$PID/archive" -H "Authorization: Bearer $OWNER_TOKEN"
curl -X PATCH "http://localhost:3001/patients/$PID/restore" -H "Authorization: Bearer $OWNER_TOKEN"

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

## CRUD de pacientes (Sprint 3.22)

Matriz obrigatória (verificada por API, **25/25** no último run; contas
descartáveis: 1 dono + 1 secretaria na mesma clínica + 1 dono de outra clínica):

1. secretaria cria paciente → 201; `origem='manual'`, `status='active'`
2. secretaria edita paciente → 200 (campos atualizados; CPF mantido)
3. secretaria **não** arquiva → 403 `forbidden_role`
4. dono arquiva → 200, `status='archived'`
5. arquivado **some** da listagem padrão (`GET /patients`, default `active`)
6. `GET /patients?status=archived` mostra o arquivado (`status=all` também)
7. dono restaura → 200, `status='active'`
8. cross-tenant edita/arquiva/restaura → **404 `patient_not_found`** (e não aparece na listagem do outro tenant)
9. resposta pública só com `cpf_masked` — **nunca** CPF bruto
10. audit com `patient.create/update/archive/restore.success`, **sem PII** (schema sem `metadata`/`entidade_tipo`)

Extras: CPF inválido → 400 `patient_invalid` **sem ecoar o valor**; nome vazio → 400.

```sql
-- audit das ações da 3.22 (sem PII; recurso_id = UUID do paciente)
SELECT acao, recurso, recurso_id FROM audit_logs
WHERE acao LIKE 'patient.%' ORDER BY criado_em DESC LIMIT 10;
```

> Soft-delete: arquivar **não** apaga linha nem agendamentos. Não há delete físico.
> Limpe contas/pacientes de teste após o run para não poluir os invariantes.

## Duplicados acionáveis (Sprint 3.23 — só frontend, sem endpoint novo)

A tela reusa o CRUD da 3.22 (`PATCH /patients/:id`, `.../archive`, `.../restore`).
Não há endpoint de duplicados além do `GET /patients/duplicates` (read-only).
Matriz por API verificada (**13/13**); criar 2 pacientes com o **mesmo CPF** forma
um grupo `cpf_match`:

1. `GET /patients/duplicates` mostra o grupo com os 2 registros (CPF só `cpf_masked`, **nunca** bruto; `group_key` não-reversível)
2. secretaria edita um membro (`PATCH /patients/:id`) → 200
3. secretaria arquivar membro → **403 `forbidden_role`**
4. dono arquiva membro → 200; ao reanalisar, o membro aparece **`archived`** (scan inclui todos os status — grupo **muda**, não some)
5. dono restaura o membro → 200 `active`
6. cross-tenant arquivar/editar → **404 `patient_not_found`**
7. audit com `patient.update/archive/restore.success`, **sem PII**

```sql
-- scan de duplicados inclui arquivados (sem filtro de status):
SELECT status, count(*) FROM patients GROUP BY status;
```

> UX: editar = dono + secretaria; arquivar/restaurar = só dono (UI esconde, backend
> valida). Destaque dos campos que bateram; paginação de grupos é **client-side**
> ("Carregar mais grupos"). **Sem merge**, sem mover agendamentos, sem delete físico.

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

## Agenda Administrativa (Sprint 3.12) — ESCOPO/ADR, ainda NÃO implementada

Sem testes ainda: a agenda é **escopo/ADR-only** (ADR 0006 +
`docs/administrative-scheduling-scope.md`) — não há migrations/endpoints/telas.
Checklist a exercitar **quando** for implementada (Sprints 3.14+): CRUD de
profissionais restrito a `dono_clinica`; criar/confirmar/remarcar/cancelar/no_show/
concluir agendamento (owner+secretaria); `clinica_id` obrigatório e cross-tenant →
403; status validado e `ends_at > starts_at`; cancelamento soft (`cancelled`);
auditoria sem PII; **nenhum** dado clínico em nenhum campo.

**Backend implementado (Sprint 3.14).** Endpoints (tenant-scoped; `requireAuth`+
`requireClinic`; writes de profissional só `dono_clinica`; sem DELETE):

```bash
# Tokens: assine localmente com o tokenService (mesmo JWT_SECRET), variando papel,
# usando um sub = id de user REAL da clínica (FK created_by_user_id) e o clinica_id
# real (ver SQL de papéis abaixo). Backend em :3001 (host ou container).
B=http://localhost:3001; H='Content-Type: application/json'
# Sem token -> 401
curl -s -o /dev/null -w "%{http_code}\n" $B/clinic-professionals          # 401
# Owner: profissionais
curl -s -X POST -H "$H" -H "Authorization: Bearer $OWNER" -d '{"name":"Dr. A","specialty_label":"Geral"}' $B/clinic-professionals   # 201
curl -s -H "Authorization: Bearer $OWNER" "$B/clinic-professionals?active=true"   # 200
curl -s -X PATCH -H "$H" -H "Authorization: Bearer $OWNER" -d '{"name":"Dr. B"}' $B/clinic-professionals/<id>            # 200
curl -s -X PATCH -H "Authorization: Bearer $OWNER" $B/clinic-professionals/<id>/deactivate                              # 200
# Secretaria: NÃO cria profissional
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "$H" -H "Authorization: Bearer $SEC" -d '{"name":"x"}' $B/clinic-professionals   # 403
# Agendamentos (owner + secretaria)
curl -s -X POST -H "$H" -H "Authorization: Bearer $SEC" -d '{"patient_id":"<pid>","starts_at":"2026-06-01T10:00:00Z","ends_at":"2026-06-01T11:00:00Z"}' $B/appointments   # 201
curl -s -H "Authorization: Bearer $OWNER" "$B/appointments?date=2026-06-01"   # 200
curl -s -X PATCH -H "$H" -H "Authorization: Bearer $SEC" -d '{"status":"confirmed"}' $B/appointments/<id>/status         # 200
curl -s -X PATCH -H "$H" -H "Authorization: Bearer $SEC" -d '{"starts_at":"2026-06-02T10:00:00Z","ends_at":"2026-06-02T11:00:00Z"}' $B/appointments/<id>/reschedule  # 200
# Negativos: status inválido/ends<=starts/patient ou professional de outra clínica/notes>500 -> 400; DELETE -> 404
```

Esperado também: `clinic_professionals`/`appointments` tenant-scoped (cross-tenant
→ 400/404); audit `appointment.*`/`clinic_professional.*` sem PII/notes; counts de
patients/import_files/import_sessions inalterados.

**Frontend da Agenda (Sprint 3.15)** — Dashboard, dois painéis. Build:
`pnpm --filter frontend typecheck && pnpm --filter frontend build`. Manual (backend
+ frontend rodando, login owner e secretaria):
- Painel "Profissionais da clínica": owner cria/edita/desativa; secretaria vê lista
  + nota (sem botões de gestão).
- Painel "Agenda administrativa": filtra por data/profissional/status; cria
  agendamento (buscar paciente → selecionar; profissional opcional; início/fim;
  observação com **aviso anti-clínico**); confirma/conclui/falta/cancela; remarca.
- Estados: vazio "Nenhum agendamento para esta data."; sucesso "Agendamento
  criado."/"Status atualizado."/"Agendamento remarcado."; 403 vira mensagem amigável.
- Status em PT (Agendado/Confirmado/Cancelado/Remarcado/Faltou/Concluído).
- Responsivo: cards (não tabela espremida); ações empilham < 32rem.
> Tempos tratados em UTC no MVP (o horário digitado é exibido verbatim).

**App shell / navegação / cache (Sprint 3.16):** Build:
`pnpm --filter frontend typecheck && pnpm --filter frontend build`. Manual:
- `/app` em abas: Início/Importações/Pacientes/Agenda/Segurança — alternar não
  quebra nenhum painel; cada aba mostra só o seu conteúdo (página mais curta).
- **Cache/invalidação (corrige bug 3.15):** na aba Agenda, criar/editar/desativar
  um profissional no painel "Profissionais da clínica" deve atualizar o select de
  profissional da "Agenda administrativa" **sem F5** (chave `['clinic-professionals']`).
- Criar/alterar status/remarcar agendamento atualiza a lista automaticamente
  (`['appointments']`).
- Footer aparece no app autenticado com o aviso administrativo.
- Mobile: nav e footer quebram linha sem corte horizontal.

**QA visual da Agenda + Landing (Sprint 3.17):** Build: `pnpm --filter frontend
typecheck && build`. Manual:
- Aba Agenda: cabeçalho mostra "Agenda de {dia da semana}, {DD de mês de AAAA}";
  botões Anterior/Hoje/Próximo mudam o dia e recarregam a lista.
- Resumo do dia (chips Total/Agendados/Confirmados/Concluídos/Faltas-Cancelados)
  reflete os agendamentos do dia.
- Lista em timeline ordenada por horário (início em destaque); estado vazio com
  botão "+ Novo agendamento".
- Formulário só aparece ao clicar "+ Novo agendamento"; "Fechar" recolhe; criar
  fecha e atualiza a lista.
- Profissionais: campo "Função/rótulo interno" (não "especialidade").
- Landing pública (`/`): seção mostra "O que o ClinicBridge entrega no piloto"
  (sem "Sprint 0/1/2/3"); responsiva.
- Mobile: timeline colapsa (trilha de horário vira linha), sem corte horizontal.

**Lembrete manual/assistido (Sprint 3.18):** em cards `scheduled`/`confirmed`/
`rescheduled` aparece a linha "Lembrete administrativo".
- **Copiar lembrete:** copia a mensagem neutra ("Olá, {nome}! …na {clínica} para
  {data} às {hora}…"); feedback "Mensagem copiada.". Conferir que o texto **não**
  tem profissional/rótulo/observação/CPF/e-mail/dado clínico.
- **Abrir WhatsApp:** com telefone do paciente → abre `wa.me` em nova aba com o
  texto preenchido (telefone normalizado: 10/11 dígitos → prefixa 55; já com 55
  mantém). Sem telefone → "Paciente sem telefone disponível.".
- **Ver/editar mensagem:** abre textarea prefilled; editar muda o texto usado por
  "Copiar lembrete" e "Abrir WhatsApp"; "Restaurar padrão" volta ao template
  neutro; "Fechar"/reabrir mantém o draft enquanto a tela está aberta. Draft
  **não** persiste após reload/troca de dia (só memória; sem localStorage/backend).
  Contador + maxLength 700 + aviso anti-clínico ao lado do textarea.
- Status `completed`/`cancelled`/`no_show`: linha de lembrete **não** aparece.
- **Nada é enviado pelo sistema** — só prepara; humano decide. Sem API/job.
- Mobile: botões quebram linha sem overflow; textarea ocupa largura total.

**Lembretes / WhatsApp (Sprint 3.13) — ESCOPO/ADR, ainda NÃO implementados:** sem
testes (sem envio real/WhatsApp API/SDK/job/cron). Escopo: ADR 0006 (adendo) +
`docs/administrative-scheduling-scope.md` Parte II. Quando houver lembrete
manual/assistido (3.16): validar que o texto é **neutro** (sem dado clínico), que
o envio é **decisão humana** (sem API), e que logs guardam só metadados (canal/
horário/status/`template_key`), nunca o conteúdo. WhatsApp automático só após ADR
própria (opt-in/opt-out/templates aprovados).

## Nginx + backend containerizado + TLS local, e2e (Sprint 3.10/3.11) — sem WAF

Detalhe: `docs/nginx-local-staging-runbook.md`. Profile `edge` (não sobe no
`docker compose up` padrão). Tudo containerizado; TLS local com cert autoassinado.

```bash
# 0) Gerar o cert autoassinado LOCAL (uma vez; gitignored) — senão o Nginx não sobe:
./scripts/generate-local-nginx-cert.sh

# 1) Build + subir a stack edge:
docker compose --profile edge build backend
docker compose --profile edge up -d postgres redis backend nginx
docker compose ps                              # nginx: 127.0.0.1:8080->80 e 8443->443
docker compose exec nginx nginx -t             # syntax is ok / test is successful

# 2) HTTP -> HTTPS redirect:
curl -i http://localhost:8080/health           # 301 Location: https://localhost:8443/health

# 3) HTTPS (cert autoassinado -> -k). Nginx -> backend:3001 -> Postgres/Redis:
curl -k -i https://localhost:8443/health        # 200
curl -k -i https://localhost:8443/health/live   # 200
curl -k -i https://localhost:8443/health/ready  # 200 {"checks":{"database":"ok"}}

# 4) Conferir o cert (SAN) apresentado:
echo | openssl s_client -connect localhost:8443 -servername localhost 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

# 5) Readiness com DB parado (volta sozinho ao religar):
docker compose stop postgres
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/health/ready   # 503
docker compose --profile edge up -d postgres   # ready volta a 200 quando healthy

# 6) Logs seguros + segurança da imagem:
docker compose logs nginx --tail=20            # sem Authorization/Cookie/corpo
docker compose exec backend id                 # uid=1000(node) — non-root
docker compose exec backend sh -c 'ls -a /repo/backend | grep "^\.env$" || echo "(sem .env)"'

# Parar a stack edge:
docker compose --profile edge stop nginx backend
```

> **TLS:** cert autoassinado em `infra/nginx/certs/` (gitignored; `curl -k` ou
> `--cacert`). **HSTS** desligado em local (comentado no `conf.d`). Produção usa
> cert **real** (ACME/gerenciado) + domínio real.

> **Anti-spoof XFF:** o Nginx sobrescreve `X-Forwarded-For`/`X-Real-IP` com o IP
> real da conexão; um `X-Forwarded-For` forjado é descartado. Com
> `RATE_LIMIT_STORE=redis`, dá p/ confirmar pela chave de rate limit no Redis (usa
> o IP real do Nginx, não o forjado):
> `docker compose exec redis redis-cli --scan --pattern 'clinicbridge:ratelimit:*'`.
>
> **Fallback host-run (modo 3.9):** trocar o upstream para `host.docker.internal:3001`
> + `TRUST_PROXY=1 pnpm --filter backend dev` — sujeito à limitação Docker Desktop +
> WSL2 (502); ver runbook.

## Edge security — Nginx + WAF (Sprint 3.8) — estratégia (WAF ainda NÃO implementado)

Sem comandos reais ainda (não há Nginx/WAF nesta fase). Detalhe:
`docs/edge-security-strategy.md` + ADR 0005. Checklist a exercitar **quando** o
Nginx for implementado (sprint futura):

- [ ] backend **não** acessível direto pela internet (só via Nginx).
- [ ] HTTP redireciona para HTTPS; HSTS só após HTTPS estável.
- [ ] upload de ~5 MB passa pelo Nginx (sem 413 indevido) → `client_max_body_size`
  ≥ `UPLOAD_MAX_BYTES`.
- [ ] `TRUST_PROXY` = hop count real → `req.ip`/rate limit/`audit_logs` usam o IP
  real do cliente (não o IP do Nginx).
- [ ] `FRONTEND_ORIGIN` HTTPS real; CORS segue no app (sem header CORS duplicado no Nginx).
- [ ] access logs do Nginx sem corpo, sem `Authorization`/`Cookie`, sem PII.
- [ ] `/health/live` e `/health/ready` acessíveis pelo proxy (readiness 200/503).
- [ ] WAF (se ligado) em `SecRuleEngine DetectionOnly`; logs revisados antes de
  qualquer blocking; tuning por rota (upload/import/export/auth).

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

## Backup OFFSITE Restic + S3 (Sprint 3.40) — sem AWS real

Pré: `restic` instalado, Docker/Postgres de pé. **NÃO exportar credenciais AWS
reais** ao rodar estes smoke tests; eles validam apenas os hard guards e a
falha-segura. Detalhe: `docs/backup-offsite-runbook.md`.

### A. Ajuda e sintaxe (sem efeitos colaterais)

```bash
bash -n scripts/check-backup-offsite-env.sh
bash -n scripts/backup-offsite-restic.sh
bash -n scripts/restore-offsite-restic.sh
# Esperado: nenhum erro de sintaxe, exit 0.

./scripts/check-backup-offsite-env.sh --help
./scripts/backup-offsite-restic.sh --help
./scripts/restore-offsite-restic.sh --help
# Esperado: imprime ajuda, exit 0, nenhuma alteração no FS / DB / rede.
```

### B. Falha segura quando env obrigatória está ausente

```bash
unset RESTIC_PASSWORD RESTIC_REPOSITORY
./scripts/backup-offsite-restic.sh
# Esperado: exit 1, mensagem 'RESTIC_PASSWORD não definida...'.
# Nenhum dump gerado.

unset RESTIC_PASSWORD
RESTIC_REPOSITORY=s3:s3.amazonaws.com/fake-bucket ./scripts/backup-offsite-restic.sh
# Esperado: exit 1 antes de tocar em qualquer recurso remoto.
```

### C. Hard guard: RESTIC_REPOSITORY local (deve ABORTAR)

```bash
RESTIC_PASSWORD=x RESTIC_REPOSITORY=backups/foo ./scripts/backup-offsite-restic.sh
# Esperado: exit 1, '[ABORTAR] RESTIC_REPOSITORY parece ser caminho LOCAL'.
RESTIC_PASSWORD=x RESTIC_REPOSITORY=./backups/foo ./scripts/restore-offsite-restic.sh
# Esperado: exit 1, mesmo motivo. Banco principal intocado.
```

### D. Hard guard: RESTORE_DB == POSTGRES_DB (deve ABORTAR)

```bash
RESTIC_PASSWORD=x RESTIC_REPOSITORY=s3:dummy/bucket RESTORE_DB=clinicbridge \
  ./scripts/restore-offsite-restic.sh
# Esperado: exit 1, '[ABORTAR] RESTORE_DB ... é igual ao banco principal'.
# Banco principal (clinicbridge) NUNCA é acessado.
```

### E. Pré-flight check sem AWS

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_REGION
export RESTIC_PASSWORD='dev-only-check-me'
export RESTIC_REPOSITORY='s3:s3.amazonaws.com/example-bucket'
./scripts/check-backup-offsite-env.sh
# Esperado: pass em RESTIC_PASSWORD/REPOSITORY (valores ocultos);
# warn (não fail) sobre AWS creds ausentes (IAM role / default chain é ok).
# Conclui com 'Ambiente pronto para backup offsite (rede ainda não foi validada...)'.
# Valor de RESTIC_REPOSITORY NUNCA é exibido.
```

### F. `--dry-run` do backup (gera dump, NÃO envia)

> Requer Postgres de pé. Útil quando há credenciais AWS mas você não quer ainda
> escrever no bucket. Aqui, sem credenciais, ele falha no `init`/`backup` — mas
> em `--dry-run` ele para antes:

```bash
export RESTIC_PASSWORD='dev-only-dry'
export RESTIC_REPOSITORY='s3:s3.amazonaws.com/example-bucket'
docker compose up -d postgres
./scripts/backup-offsite-restic.sh --dry-run
# Esperado: gera dump em backups/work/clinicbridge-offsite-<TS>.dump,
# imprime '[info] dry-run: pularia restic backup ... (valor não exibido)',
# imprime alvos. Nenhuma chamada de rede a S3.
```

### G. `.gitignore` cobre artefatos offsite

```bash
git check-ignore -q backups/work/clinicbridge-offsite-20260525-120000.dump && echo OK
git check-ignore -q backups/restore-offsite-work/latest/whatever && echo OK
git check-ignore -q .env.production && echo OK
# Esperado: três OK; nenhum exit code != 0.

git status --short
# Esperado: nenhum dump, repo Restic, arquivo .env ou credencial em staging.
```

> Segurança: scripts nunca imprimem `RESTIC_PASSWORD`, `RESTIC_REPOSITORY` (valor)
> ou `AWS_*`; `backups/work/` e `backups/restore-offsite-work/` são git-ignored;
> sem bucket real, sem rede, sem AWS — tudo verificável localmente.

## Responsividade mobile (Sprint 2.26)

Testar `/app` no DevTools em 360, 390, 414 (iPhone XR), 430 e 768px e desktop:
- sem scroll horizontal / sem corte lateral no topo
- "ClinicBridge" + "Sair" cabem ou quebram corretamente; selo "Sessão ativa" não estoura
- nome do usuário e e-mail longos quebram linha (não cortam)
- cards de identidade e do rodapé colapsam para 1 coluna no mobile
- painel "Arquivos antigos de importação": inputs/botões quebram linha; card não estoura; rótulos longos quebram
- validação de input: dias 0/366 ou "Mostrar até" 0/101 → mensagem amigável, **sem** chamada à API

## Gestão de membros — Equipe (Sprint 3.25)

Pré-requisitos: backend dev `:3001` rodando (`pnpm --filter backend dev`), migration aplicada (`pnpm --filter backend migrate:latest`).

Smoke por API (contas descartáveis com sufixo aleatório; limpar via SQL no fim):

```bash
# Owner (dono A) — cria conta + clínica + pega invite code
# Owner B em outra clínica — para o cross-tenant
# Staff 1, Staff 2 — funcionário(a)s solicitam entrada na clínica A; dono aprova

# Matriz 14/14 já automatizada em /tmp/sprint-3.25-api-test.mjs.
# Para verificar pontos individuais por curl, seguir a sequência abaixo (substitua TOKEN_*).
```

Cenários obrigatórios:

1. **Dono lista membros:** `GET /clinic-members` → 200; vê a si mesmo (`is_owner=true`, `status=active`), staffs aprovados em ativos, `joined_at` preenchido.
2. **Funcionário tenta listar:** `GET /clinic-members` com token de staff → 403 `forbidden_role`.
3. **Cross-tenant:** dono B faz `PATCH /clinic-members/<staff-de-A>/deactivate` → 404 `member_not_found` (sem distinção de "outra clínica" vs "inexistente").
4. **Dono tenta a si mesmo:** `PATCH /clinic-members/<owner-id>/deactivate` com token do próprio owner → 400 `cannot_deactivate_self`. (E se for o `responsavel_id` da clínica → 400 `cannot_deactivate_owner`.)
5. **Desativar funcionário:** `PATCH /clinic-members/<staff-id>/deactivate` → 200 `{ status: 'deactivated' }`. Persistência: `users.clinica_id IS NULL` e linha nova em `clinic_join_requests` com `status='revoked'` e `decided_by_user_id` do dono.
6. **Stale-JWT bloqueado imediatamente:** com o token antigo do staff, `GET /patients` → 403 `clinic_membership_revoked`. Idem qualquer rota tenant-scoped.
7. **/auth/me coerente:** `GET /auth/me` no staff desativado → `clinic: null` (mesmo token).
8. **Inativos aparecem:** dono em `GET /clinic-members` agora vê staff com `status='removed'` e `removed_at` preenchido. UI: toggle "Mostrar inativos".
9. **Idempotência:** desativar duas vezes seguidas → segunda chamada retorna 404 `member_not_found`.
10. **Re-entrada:** staff desligado consegue `POST /clinic-join-requests` (mesmo invite code) → 201; dono pode aprovar de novo (`approve` cria nova cadeia `pending→approved`; a linha `revoked` permanece como histórico).
11. **Audit sem PII:** `SELECT acao, recurso, recurso_id IS NOT NULL FROM audit_logs WHERE acao LIKE 'clinic.member.%' ORDER BY criado_em DESC LIMIT 10;` → ver `clinic_member` em recurso, `recurso_id` UUID (deactivate) ou NULL (list). Nenhum nome/email.

Limpeza (substituir `<TAG>` pelo sufixo aleatório usado):

```sql
BEGIN;
DELETE FROM audit_logs WHERE usuario_id IN (SELECT id FROM users WHERE email LIKE 't325-%<TAG>@example.test');
DELETE FROM clinic_join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE 't325-%<TAG>@example.test');
UPDATE users SET clinica_id = NULL WHERE email LIKE 't325-%<TAG>@example.test';
DELETE FROM clinics WHERE responsavel_id IN (SELECT id FROM users WHERE email LIKE 't325-%<TAG>@example.test');
DELETE FROM users WHERE email LIKE 't325-%<TAG>@example.test';
COMMIT;
```

> A FK de `audit_logs.usuario_id`/`clinica_id` é `ON DELETE SET NULL` (invariante append-only), então rows de audit anteriores ficam preservadas com FK nulada após a limpeza. Esperado.

Validação **visual** no navegador (pendente automatizar):
- Aba **Equipe** mostra "Membros da equipe" abaixo de "Solicitações pendentes".
- Membros ativos por padrão; checkbox "Mostrar inativos" alterna.
- Badge "Dono(a)" no `is_owner`; botão "Desativar acesso" ausente para o dono e para o usuário logado.
- Botão "Desativar acesso" abre **modal de confirmação custom** (sprint 3.28) com nome do membro; confirmar executa a desativação; cancelar/ESC/backdrop fecha sem ação.
- Polling 30s atualiza a lista após uma ação.

## Reorganização Agenda↔Equipe (Sprint 3.25.1)

Validação visual no navegador (sem mudança de API):

1. **Aba Equipe** mostra, na ordem:
   - Código de convite + Solicitações pendentes;
   - Membros da equipe (acesso ao sistema) com Ativos/Inativos;
   - **Profissionais da agenda** (cadastro/edição/desativação).
2. **Aba Agenda** mostra:
   - Parágrafo curto `agendaHint` apontando para "Equipe → Profissionais da agenda".
   - O painel de agendamentos (`AdministrativeSchedulePanel`) com o seletor de profissionais ativos.
   - **Sem** form/lista de cadastro de profissionais.
3. **Sincronização (cache compartilhada `['clinic-professionals']`):**
   - Em Equipe, criar/editar/desativar um profissional → trocar para Agenda → o seletor reflete a mudança imediatamente, sem reload da página.
4. **Permissões inalteradas:**
   - Owner: form de cadastro/edição/desativação visível na Equipe; secretaria vê só a lista (mensagem "A gestão de profissionais é feita pelo dono(a)…").
   - A agenda continua aceitando `professional_id` opcional na criação de agendamento.
5. **Copy diferencia conceitos:**
   - Subtítulo do painel reforça: alimenta o seletor da Agenda, profissional **pode ou não** ter login, não é dado clínico.

## Regenerar código de convite (Sprint 3.26)

Pré-requisitos: backend dev `:3001` rodando.

Smoke por API (contas descartáveis com tag aleatório; matriz automatizada em `/tmp/sprint-3.26-api-test.mjs`).

Cenários obrigatórios:

1. **Dono lê código atual:** `GET /clinics/invite-code` → 200, `{ invite_code, clinic_name }`.
2. **Dono regenera:** `POST /clinics/invite-code/regenerate` → 200; novo `invite_code` **diferente** do anterior; `clinic_name` igual.
3. **GET reflete:** `GET /clinics/invite-code` casa com o valor retornado pelo `POST`.
4. **Código antigo rejeitado:** `POST /clinic-join-requests` com o invite_code antigo → 404 `invalid_invite`.
5. **Código novo aceito:** mesma rota com o novo → 201.
6. **Owner-B regenera independentemente:** clínica A não é afetada (cross-tenant não existe via path).
7. **Permissões:**
   - Staff sem clínica → 403 `no_clinic_context`.
   - Membro não-dono (após aprovação) → 403 `forbidden_role`.
8. **Pendente preservada:** uma `clinic-join-request` `status='pending'` criada antes da regen continua visível em `GET /clinic-join-requests/pending`.
9. **Audit:**
   ```sql
   SELECT acao, recurso, recurso_id IS NOT NULL AS has_recurso_id, usuario_id IS NOT NULL AS has_uid, clinica_id IS NOT NULL AS has_cid
   FROM audit_logs WHERE acao = 'clinic.invite_code.regenerated.success' ORDER BY criado_em DESC LIMIT 5;
   ```
   Esperado: `recurso='clinic'`, `recurso_id` UUID da clínica, `usuario_id`/`clinica_id` preenchidos. **Nenhuma** coluna carrega o invite_code (não existe).

Limpeza:

```sql
BEGIN;
DELETE FROM audit_logs WHERE usuario_id IN (SELECT id FROM users WHERE email LIKE 't326-%<TAG>@example.test');
DELETE FROM clinic_join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE 't326-%<TAG>@example.test');
UPDATE users SET clinica_id = NULL WHERE email LIKE 't326-%<TAG>@example.test';
DELETE FROM clinics WHERE responsavel_id IN (SELECT id FROM users WHERE email LIKE 't326-%<TAG>@example.test');
DELETE FROM users WHERE email LIKE 't326-%<TAG>@example.test';
COMMIT;
```

Validação **visual** no navegador (pendente automatizar):
- Aba **Equipe** mostra "Código de convite" com **dois** botões: **Copiar** e **Regenerar**.
- Botão Regenerar aparece **apenas para o dono** (UI esconde para secretaria; backend é a defesa real).
- Clicar **Regenerar** abre **modal de confirmação custom** (sprint 3.28) com título "Gerar um novo código de convite?" e descrição que cita: "código antigo deixará de funcionar para NOVAS solicitações", "pendentes e membros atuais NÃO são alterados", "compartilhe apenas com funcionários autorizados".
- Após confirmar, o novo código aparece em destaque no campo de código + mensagem de sucesso (`notice`) mostra o novo código uma vez.
- **Copiar** continua funcionando com o novo código.
- Após regenerar, qualquer aba aberta com `JoinClinicGate` que use o código antigo recebe `invalid_invite` ao tentar submeter (a aba do dono não é afetada — ele lê o atualizado).

## Polimento visual da aba Equipe (Sprint 3.27)

Sem mudança de API. Validação puramente visual no navegador:

1. **Chips de categoria:**
   - `TeamManagementPanel` (topo): título "Equipe da clínica" + chip neutro "Acesso ao sistema".
   - `ClinicProfessionalsPanel` (abaixo): título "Profissionais da agenda" + chip neutro "Aparece na agenda".
   - Os dois chips são cinza neutro — não devem virar status badges (verde/laranja).
2. **Código de convite:**
   - Aparece em mono, fundo cyan suave, levemente maior que antes (1.15rem, letter-spacing 0.08em).
   - Botão **Copiar** mantém o peso visual (solid surface).
   - Botão **Regenerar** está claramente menos atrativo (variante ghost — transparente, só borda).
3. **Modais de confirmação custom (sprint 3.28 — substituem os `window.confirm` anteriores):**
   - Regenerar: modal abre, título "Gerar um novo código de convite?", descrição cita que o código atual deixa de aceitar NOVAS solicitações e que membros/pedidos pendentes continuam intactos.
   - Desativar acesso: modal abre, título com nome do membro, descrição cita preservação de histórico e dados.
   - Recusar solicitação: modal abre, tom neutro, "A pessoa pode pedir de novo com o mesmo código."
4. **Hierarquia de risco:**
   - "Recusar" virou neutro (não-danger). É correto: não é destrutivo.
   - "Desativar acesso" (membro) é o único `dangerBtn` no card de membro — coerente com a gravidade real.
   - "Desativar profissional" (no painel de profissionais) usa estilo `actionBtn` (não-danger). Suficiente para a sprint.
5. **Estado vazio:**
   - Solicitações: "Sem solicitações no momento. Compartilhe o código de convite por um canal seguro para receber pedidos de entrada."
   - Membros (só dono): "Só você por enquanto. Quando alguém entrar com o código, vai aparecer aqui."
   - Membros (showRemoved=true sem nenhum): "Nenhum membro registrado nesta clínica ainda."
   - Profissionais: "Nenhum profissional cadastrado. Adicione quem realiza atendimentos — eles aparecem como responsáveis na agenda."
6. **Card de membro inativo:** ao marcar "Mostrar inativos" e ver um ex-membro, o card deve ter `border-left` cinza-azulado fino (não vermelho) e fundo levemente mais escuro.
7. **Mobile (`@max-width: 480px`):**
   - Botões de ação (Aprovar/Recusar/Desativar) ocupam linha inteira.
   - Chip de categoria pode quebrar para a linha de baixo do título com folga.
   - Painel de profissionais segue o mesmo comportamento.

## Modal de confirmação — Sprint 3.28

Sem mudança de API. Validação puramente visual no navegador:

1. **Modal abre** para cada ação sensível:
   - Regenerar código → modal abre com título "Gerar um novo código de convite?" e botão "Regenerar código".
   - Aprovar solicitação → modal abre com nome+email do solicitante, botão "Aprovar entrada".
   - Recusar solicitação → modal abre com nome do solicitante, botão "Recusar solicitação".
   - Desativar acesso (membro) → modal abre com nome do membro, botão "Desativar acesso" em vermelho.
   - Desativar profissional → modal abre com nome do profissional, botão "Desativar profissional" em vermelho.
2. **Cancelar não executa:** clicar "Cancelar" fecha o modal sem disparar nenhuma chamada de API.
3. **ESC não executa:** pressionar ESC fecha o modal sem disparar nenhuma chamada de API.
4. **Backdrop click não executa:** clicar fora da caixa do modal fecha sem disparar ação.
5. **Confirmar executa a ação existente:** mesma mutation de antes. Em sucesso: modal fecha, mensagem verde aparece no banner do painel. Em erro: **modal permanece aberto** com a mensagem de erro exibida dentro do modal (com `role="alert"`); o usuário pode tentar de novo ou clicar Cancelar.
6. **isBusy:** ao confirmar, o botão confirmar mostra spinner e fica desabilitado; o botão cancelar também fica desabilitado; ambos desbloqueiam ao término (success ou error).
7. **Variante danger:** apenas "Desativar acesso" e "Desativar profissional" têm botão confirmar em vermelho-suave. Regenerar/Aprovar/Recusar usam cyan (default).
8. **Mobile:** em viewport ≤ 480px, os botões do modal empilham full-width (confirmar em cima, cancelar embaixo).
9. **Erro inline (pós-3.28 nit):** ao testar uma falha (ex.: desativar com backend offline) o modal **não fecha** — o erro aparece em painel vermelho dentro do modal com `role="alert"`. Clicar Cancelar limpa o erro e fecha o modal.
10. **IDs únicos (pós-3.28 nit):** dois dialogs podem estar montados ao mesmo tempo (TeamManagementPanel + ClinicProfessionalsPanel); inspecionar o DOM confirma que cada `<dialog>` tem `aria-labelledby` com IDs distintos (gerados por `useId()`).

## Fluxo completo da aba Equipe — checklist visual integrado (Sprint 3.29)

> **Sprint 3.30:** fluxo validado visualmente no navegador pelo usuário em
> 2026-05-24. Nenhum bug bloqueante encontrado. Todos os itens abaixo foram
> aprovados manualmente. Validação sem automação de browser.

> Roteiro de validação ponta a ponta do fluxo Equipe, com contas descartáveis.
> Cobre sprints 3.24–3.28 num único passe. Exige backend `:3001` rodando.

### Pré-condições

- Owner cadastrado com clínica (conta A).
- Staff cadastrado **sem** clínica (conta B, `account_type: staff` no cadastro).
- Ambas as contas com login acessível no navegador (pode usar duas abas/janelas em modo normal/privado).

### Passos e verificações

1. **Código de convite (owner):**
   - Login como owner → aba **Equipe** → bloco "Código de convite" visível.
   - Código em fonte mono, maior; botão **Copiar** (solid) e **Regenerar** (ghost/transparente) lado a lado.
   - Copiar → copia para a área de transferência sem abrir modal.

2. **Solicitação de entrada (staff):**
   - Login como staff → tela `JoinClinicGate` (antes do `/app`).
   - Inserir o código copiado + nome da clínica (confirmatório) → submeter.
   - Mensagem de "pendente" aparece; botão **Cancelar** disponível.

3. **Aprovar solicitação (owner):**
   - Owner → aba **Equipe** → seção "Solicitações pendentes" mostra a solicitação do staff (nome/e-mail/mensagem).
   - Clicar **Aprovar** → **modal abre** com nome+e-mail, botão "Aprovar entrada" (cyan).
   - Confirmar → modal fecha, solicitação some da lista, `notice` aparece.
   - Staff (outra aba) → recarregar → acessa `/app` normalmente.

4. **Membros da equipe:**
   - Seção "Membros da equipe" lista owner + staff aprovado.
   - Owner tem badge "Dono(a)"; staff aparece como "Funcionário(a) (acesso administrativo)".
   - Botão "Desativar acesso" **ausente** no card do owner e no card do próprio usuário logado.

5. **Desativar acesso (owner):**
   - Clicar "Desativar acesso" no card do staff → **modal danger abre** com nome do membro.
   - Cancelar → modal fecha, membro continua ativo.
   - Confirmar → modal fecha, `notice` aparece; membro some da lista ativa.
   - Ativar "Mostrar inativos" → membro aparece com `border-left` cinza-azulado e badge "Inativo(a)".

6. **Regenerar código (owner):**
   - Clicar **Regenerar** → **modal default abre** com título "Gerar um novo código de convite?".
   - Confirmar → código no bloco muda; `notice` mostra o novo código uma vez.
   - Código antigo usado no `JoinClinicGate` → erro `invalid_invite`.

7. **Recusar solicitação (owner):**
   - Staff (nova conta) envia solicitação com o novo código.
   - Owner → Recusar → **modal default abre** (botão "Recusar solicitação", não-danger/cyan).
   - Confirmar → modal fecha, solicitação some.

8. **Profissionais da agenda (owner):**
   - Seção "Profissionais da agenda" na aba Equipe (abaixo de Membros).
   - Criar → nome + rótulo opcional → aparece na lista.
   - Editar (inline) → salvar → atualiza.
   - Desativar → **modal danger** → confirmar → profissional some da lista ativa.
   - Trocar para aba **Agenda** → seletor de profissional no novo agendamento **não** exibe o profissional desativado (cache `['clinic-professionals']` invalidada).

9. **Secretaria vê mas não gerencia:**
   - Login como staff aprovado → aba Equipe **não aparece** (UI esconde para não-owner).
   - Aba Agenda: seletor de profissional mostra ativos; criar agendamento funciona normalmente.

## Hardening de join requests — matriz por API (Sprint 3.31)

Pré-requisitos: backend dev `:3001` rodando; Postgres acessível via
`docker compose exec postgres psql`. Script automatizado com contas descartáveis
(tag aleatório) em `/tmp/sprint-3.31-api-test.mjs` — verifica colunas via SQL e
limpa os dados ao fim.

Sem mudança de API/contrato. Cenários (18/18):

1. **Criar pendente:** staff sem clínica `POST /clinic-join-requests` (código válido) → 201, `status=pending`.
2. **Cancelar própria pendente:** `PATCH /clinic-join-requests/:id/cancel` → 200, `status=cancelled`.
3. **Cancelar de novo:** mesma rota/ id → **409 `invalid_state`** (CAS não sobrescreve).
4. **Cancelar de outro usuário:** staff B tenta cancelar request do staff A → **404 `request_not_found`**; request de A segue `pending`.
5. **Aprovação + cascade com trilha:** staff com pendentes em A e B; dono A aprova a de A → `approved` com `decided_by_user_id`=dono A e `decided_at` setado (SQL); a de B vira `cancelled` com **`decided_by_user_id`=dono A** e `decided_at` setado; `users.clinica_id` do staff = clínica A.
6. **Cancelar já aprovada:** staff tenta cancelar a request aprovada → **409 `invalid_state`**; SQL confirma que segue `approved`.
7. **Cross-tenant:** dono B tenta `approve`/`reject` de request da clínica A → **404 `request_not_found`** nas duas; alvo segue `pending`.
8. **Audit sem PII:** linhas `clinic.join_request.created/cancelled/approved.success` com `recurso='clinic_join_request'`, `recurso_id`=UUID; nenhum nome/e-mail/tag embutido em `acao`.
9. **Sem leak de decisor:** `GET /clinic-join-requests/me` **não** inclui `decided_by_user_id` no JSON.

> Atenção ao rate limit de auth (`AUTH_RATE_LIMIT_MAX=20`/15min, IP-keyed): o
> script usa ~6 contas (12 requests de auth). Reexecuções em sequência podem
> precisar aguardar a janela ou reiniciar o backend (store em memória no dev).

## Merge seguro de duplicados — Sprint 3.33 (backend entregue) + 3.34 (visual)

**Sprint 3.33 entregue:** matriz API descartável em `/tmp/sprint-3.33-merge-test.mjs`
(18/18 passou). Reproduz: cria 2 clínicas isoladas, faz fluxo owner/staff
completo, executa todos os casos abaixo, limpa os dados criados pelo cleanup
SQL (segue abaixo).

### Como rodar (3.33)

```bash
# 1) sobe stack local (Postgres + Redis + backend + nginx TLS)
docker compose up -d
# 2) garante o build mais recente do backend (após editar código)
docker compose build backend && docker compose up -d backend
# 3) roda matriz por API (usa nginx TLS local com cert autoassinado)
node /tmp/sprint-3.33-merge-test.mjs
# 4) se atingir rate limit (login/register repetido), libera o redis:
docker compose exec -T redis redis-cli FLUSHALL
```

### Matriz API (3.33 — 18/18)

1. happy 1-secundário sem appointments → archived + primary active.
1b. response tem `cpf_masked`, **sem** `cpf` bruto.
2. 1-secundário com 2 appointments → reassigned (sec=0, primary recebe os 2).
3. fill-blanks preenche campos vazios do principal (telefone + convenio).
4. fill-blanks **nunca** sobrescreve campo já preenchido (e-mail preservado).
5. ordem = `secondary_ids` como enviado (envia `[pB, pA]` → pB vence).
6. CPF fill mantém resposta com `***.***.789-01` (sem CPF bruto).
7. principal em `secondary_ids` → 400 `merge_invalid`.
8. `secondary_ids` vazio → 400 `merge_invalid`.
9. duplicados em `secondary_ids` → 400 `merge_invalid`.
10. > 10 secundários → 400 `merge_invalid`.
11. cross-tenant principal (clínica B) → 404 `patient_not_found`.
12. cross-tenant secundário (clínica B) → 404 `patient_not_found`.
12b. cross-tenant secundário: zero side-effect (paciente B permanece `active`).
13. secundário já-archived → 404 `patient_not_found`.
14. secretaria → 403 `forbidden_role`.
15. sem JWT → 401.
16. batch 3 secundários com mix appointments/blanks → 3 archived, 3 appts
    movidos, fill-blanks combina telefone/email/convenio dos 3.

### SQL de validação (3.33)

```bash
docker compose exec -T postgres psql -U clinicbridge -d clinicbridge -c "
-- secundários arquivados têm provenance setada
SELECT count(*) FROM patients WHERE merged_into_id IS NOT NULL AND status <> 'archived';
SELECT count(*) FROM patients WHERE merged_into_id IS NOT NULL AND merged_at IS NULL;
-- audit no formato uuid|uuid, sem PII
SELECT count(*) FROM audit_logs WHERE acao='patient.merge.success'
  AND recurso_id !~ '^[0-9a-f-]{36}\\|[0-9a-f-]{36}\$';
"
```

Esperado: 3 contagens = 0.

### Cleanup descartável após rodar a matriz

```bash
docker compose exec -T postgres psql -U clinicbridge -d clinicbridge -c "
BEGIN;
UPDATE users SET clinica_id = NULL
  WHERE email LIKE 'owner-33%@test.local' OR email LIKE 'staff-33%@test.local';
DELETE FROM clinics WHERE nome LIKE 'Clinica 33%';
DELETE FROM users
  WHERE email LIKE 'owner-33%@test.local' OR email LIKE 'staff-33%@test.local';
COMMIT;
"
```

Audits permanecem (FK `SET NULL` — append-only correto).

### Visual (Sprint 3.34 — entregue; **validado pelo usuário em 2026-05-24** — Sprint 3.35)

> **Sprint 3.35:** fluxo validado visualmente no navegador pelo usuário em
> 2026-05-24. Nenhum bug bloqueante encontrado. Fluxo de merge B-safe aprovado
> ("ficou bem fera"). Os passos abaixo permanecem como referência de regressão.

UI entregue na Sprint 3.34 sobre a API da 3.33. Sem endpoint novo, sem
seleção campo-a-campo, sem undo, sem delete físico, sem lookup do nome do
principal. Use este checklist no navegador como **dono da clínica**, com a
stack local rodando (`docker compose up -d`; frontend em `pnpm --filter
frontend dev`).

**Pré-condições:**
1. Faça login como `dono_clinica` de uma clínica.
2. Na aba **Pacientes**, crie 2 ou 3 pacientes que devem casar como duplicados
   (mesmo CPF, ou mesmo telefone, ou mesmo nome + data de nascimento).
3. Confirme que aparecem na seção "Possíveis duplicados" do mesmo painel.

**Passos e verificações:**
1. Em cada card do grupo, deve aparecer o rádio **"Manter como principal"**.
   Nenhum vem pré-selecionado.
2. O rodapé do grupo mostra a hint "Escolha o paciente principal antes de
   resolver." e o botão **"Resolver duplicado"** está desabilitado.
3. Marque um rádio. O card escolhido ganha borda ciano + selo **"Principal"**.
   A hint vira "Os outros N registros serão arquivados como duplicados.". O
   botão "Resolver duplicado" habilita.
4. Clique em "Resolver duplicado". O `ConfirmDialog` abre com:
   - título "Resolver pacientes duplicados?";
   - descrição explicando: mantém o principal, move agendamentos vinculados
     aos duplicados se houver, preenche apenas campos vazios do principal,
     nunca sobrescreve, arquiva os duplicados, nada é apagado fisicamente,
     **esta versão ainda não tem desfazer completo**;
   - botão de confirmação rotulado "Resolver duplicado", variante **danger**;
   - botão "Cancelar".
5. Clique em **Cancelar**. Nada muda; nenhuma request sai (verifique no
   DevTools › Network).
6. Reabra o modal e clique em **Resolver duplicado**. O botão mostra spinner;
   ao concluir, o modal fecha e aparece a mensagem verde **"Duplicado
   resolvido. N registros arquivados; M agendamentos movidos para o
   principal."**.
7. O grupo **some** da lista (se sobrou <2 ativos). A lista de Pacientes
   (mesma aba, acima) recarrega automaticamente.
8. **Fill-blanks:** se o principal estava sem telefone/convenio e o
   secundário tinha valor, o card do principal em "Pacientes" agora mostra
   esse valor.
9. **Fill-blanks não sobrescreve:** se o principal tinha e-mail A e o
   secundário tinha e-mail B, o principal continua com A.
10. Vá até a aba **Pacientes › Arquivados**. O secundário aparece como
    "Arquivado" + o badge discreto **"Mesclado em outro registro"** abaixo do
    cabeçalho do card. O nome do principal NÃO é mostrado (intencional).
11. Se o secundário tinha agendamentos, abra a aba **Agenda**. O agendamento
    aparece **com o nome do principal** (não mais "Paciente abc12345…").
12. **CPF mascarado:** em nenhum card, modal ou rede o CPF aparece bruto;
    sempre `***.***.XXX-XX`.
13. **Permissão:** faça logout, entre como `secretaria`/funcionário(a) da
    mesma clínica. Na aba Pacientes › "Possíveis duplicados":
    - os rádios e o botão "Resolver duplicado" **não devem aparecer**;
    - o aviso superior diz "Resolver duplicados são exclusivos do dono da
      clínica";
    - "Corrigir" (PatientEditForm) continua disponível;
    - "Excluir duplicado" (arquivar) continua **escondido** para esse papel.
14. **Erro de backend (opcional, com curl):** chame
    `POST /patients/<id>/merge` autenticado como `secretaria` →
    `403 forbidden_role` (cobertura backend; a UI já esconde).
15. **3+ membros no grupo:** crie um grupo com 3 ativos. Marque 1 como
    principal e resolva. Os outros 2 são arquivados em **uma única chamada**
    (verifique no Network: 1 request `POST .../merge` com `secondary_ids`
    com 2 UUIDs).
16. **Atualizar análise** depois do sucesso: o grupo não volta; a seleção
    anterior é limpa (não trazer estado stale entre scans).

**Console/DevTools:** verifique que nenhum log do console exibe CPF,
e-mail, telefone, valores de campo, ou valores dos secundários. Verifique
`localStorage`: nenhum dado de paciente persistido.

### Visual — borda e regressão

- Secundário sem agendamentos: merge funciona; `moved_appointments_count = 0`.
- Restore do arquivado (Pacientes › Arquivados → Restaurar): desarquiva mas
  **não devolve appointments** movidos nem reverte fill-blanks (limite
  documentado no ADR 0007).
- Horário coincidente entre principal e secundário após reassign: permitido
  sem alerta (UI da agenda pode/deve evoluir; backend não bloqueia).
- Outras telas continuam funcionando (Equipe, Agenda, Importações, MFA).

### Borda

- Secundário sem agendamentos (testado — case 1).
- Restore do arquivado: hoje desarquiva a linha, mas **não** devolve
  agendamentos movidos nem reverte fill-blanks (limite documentado no ADR).
- Horário coincidente principal × secundário após reassign: permitido sem
  alerta no backend; UI da 3.34 pode avisar.

---

## QA geral do piloto v0.1 — Sprint 3.36

> Checklist de regressão consolidado para validar o produto como um todo antes do
> piloto com clínica real. Cobrir manualmente no navegador com stack local rodando
> (`docker compose up -d`, backend `:3001`, frontend `:5173`). Usar contas
> descartáveis; não usar dados reais; rodar `seed:demo` se precisar de
> agendamentos populados.
>
> Classificação de achados:
> - **BLOCKER** — impede piloto ou cria risco de segurança/dados.
> - **BUG PEQUENO** — corrigir antes do piloto se simples.
> - **POLISH** — sprint visual separada.
> - **ACEITÁVEL MVP** — documentado e aceito.
> - **FUTURO** — pós-piloto.

### 1. Autenticação e segurança de conta

- [ ] Cadastro como owner: preenche nome, e-mail, senha, nome da clínica → login
      bem-sucedido.
- [ ] Cadastro como funcionário(a): seleciona "Sou funcionário(a)" → sem campo
      de clínica → cria conta e vai para `JoinClinicGate`.
- [ ] Login com credencial correta → entra no `/app`.
- [ ] Login com senha errada → mensagem genérica, sem ecoar senha/e-mail.
- [ ] (Se MFA ativo) login → passo de código → app autenticador ou backup code →
      entra; código errado → 401 genérico `invalid_mfa_code`.
- [ ] Logout → token inativo; navegação direta p/ `/app` redireciona ao login.
- [ ] Console do navegador: sem token, segredo TOTP, CPF ou PII exibidos.

### 2. Equipe

- [ ] Aba Equipe visível só para owner (secretaria sem login ativo não vê a aba).
- [ ] Código de convite em destaque; **Copiar** funciona; **Regenerar** abre modal
      custom (não `window.confirm`); código muda; antigo rejeitado.
- [ ] Funcionário(a): usa `JoinClinicGate`, insere código + nome da clínica →
      solicitação "aguardando".
- [ ] Owner aprova → modal custom cyan → staff acessa `/app`.
- [ ] Owner recusa → modal custom neutro → solicitação some.
- [ ] "Membros da equipe": ambos listados; badge "Dono(a)" no owner.
- [ ] "Desativar acesso" → modal danger → confirmar → membro some da lista ativa;
      token antigo do membro → 403 `clinic_membership_revoked` imediato.
- [ ] "Mostrar inativos" exibe ex-membros.
- [ ] "Profissionais da agenda": criar profissional → aparece no seletor da aba
      Agenda sem reload (cache `['clinic-professionals']`).
- [ ] Desativar profissional → some do seletor.

### 3. Pacientes administrativos

- [ ] Criar paciente manual (owner ou secretaria): campos válidos → 201, `status=active`.
- [ ] Editar paciente (owner ou secretaria): atualiza; CPF em branco mantém o atual.
- [ ] CPF sempre mascarado em todos os cards e na resposta da API.
- [ ] Arquivar (owner): paciente some da lista ativa → aparece em "Arquivados".
- [ ] Secretaria tenta arquivar → UI esconde botão; backend → 403 `forbidden_role`.
- [ ] Restaurar (owner): volta para lista ativa.
- [ ] Cross-tenant: token de outra clínica → 404 `patient_not_found`.
- [ ] Nenhum campo de dado clínico presente (diagnóstico, prescrição, CID, prontuário).

### 4. Duplicados e merge B-safe

- [ ] "Possíveis duplicados" lista grupos com destaque dos campos que bateram.
- [ ] (Owner) rádio "Manter como principal" visível por registro; nenhum pré-selecionado.
- [ ] Sem seleção: botão "Resolver duplicado" desabilitado.
- [ ] Com seleção: card escolhido ganha borda ciano + selo "Principal"; botão habilita.
- [ ] ConfirmDialog danger abre com copy B-safe; cancelar → nenhuma request.
- [ ] Confirmar: spinner; grupo some; mensagem verde com contagens (`N arquivados; M agendamentos movidos`).
- [ ] Secundário em Pacientes › Arquivados → badge "Mesclado em outro registro".
- [ ] Agendamento do secundário → aba Agenda mostra nome do principal (não fallback).
- [ ] Fill-blanks: campo vazio do principal recebeu valor do secundário; campo já preenchido preservado.
- [ ] CPF sempre mascarado; valores dos secundários nunca exibidos.
- [ ] (Secretaria) rádio + botão "Resolver duplicado" não aparecem; aviso owner-only visível.
- [ ] `POST /patients/:id/merge` com token de secretaria → 403 `forbidden_role`.

### 5. Importação

- [ ] Upload CSV aceito; XLSX aceito; arquivo binário → `invalid_file_content`.
- [ ] Preview sugere mapeamento pelos cabeçalhos.
- [ ] Validação mostra linhas válidas + duplicados detectados no arquivo.
- [ ] Dry-run roda sem gravar pacientes.
- [ ] Mark-ready e import (owner-only): gera recibo com contagens, sem PII.
- [ ] Secretaria tenta import → nota explicativa (sem botão de ação destrutiva).
- [ ] Resposta de preview/validação **nunca ecoa** conteúdo de célula em erros.
- [ ] Import de arquivo com CPF → listagem de pacientes mostra só `cpf_masked`.

### 6. Agenda administrativa

- [ ] Criar agendamento (owner ou secretaria): paciente + horário → 201.
- [ ] Aviso anti-clínico visível no campo de observações.
- [ ] Confirmar / Concluir / Faltou / Cancelar funcionam.
- [ ] Remarcar: novo horário substitui o anterior.
- [ ] "Lembrete administrativo" aparece em cards `scheduled`/`confirmed`/`rescheduled`.
- [ ] "Copiar lembrete": texto **neutro** (sem profissional, CPF, dado clínico).
- [ ] "Abrir WhatsApp": abre `wa.me` sem enviar nada pelo sistema.
- [ ] Paciente sem telefone → aviso "Paciente sem telefone disponível."
- [ ] Nenhum campo de diagnóstico, especialidade sensível ou dado clínico presente.

### 7. Exportação

- [ ] Export CSV e XLSX baixam arquivo com `cpf_masked`.
- [ ] `include_cpf_raw=true` → 400 `patients_export_cpf_raw_not_allowed`.
- [ ] Formato inválido → 400 `patients_export_invalid_format`.
- [ ] `Content-Disposition` com filename fixo; sem signed URL / link público.

### 8. Retenção dry-run

- [ ] Painel aparece para owner (secretaria vê nota explicativa ou não executa).
- [ ] Dry-run **não apaga** nenhum arquivo/sessão/paciente (`SELECT count` antes/depois igual).
- [ ] Resposta nunca carrega `nome_original`, path, SHA-256 ou conteúdo interno.
- [ ] `retention_days` fora de 1–365 ou `limit` fora de 1–MAX → 400 `invalid_retention_params`.

### 9. Layout / demo / mobile

- [ ] Landing `/` coerente com framing administrativo; sem promessa de prontuário.
- [ ] App shell `/app` em abas: Início/Importações/Pacientes/Agenda/Equipe/Segurança.
- [ ] Alternar abas não quebra nenhum painel; polling não gera erro no console.
- [ ] Mobile 390px (DevTools): sem scroll horizontal, nav funcional, cards colapsam.
- [ ] Footer aparece em `/app` com aviso administrativo.
- [ ] Estados vazios amigáveis em português em cada painel.
- [ ] Nenhum texto visível diz "prontuário", "prescrição", "diagnóstico", "CID".

### 10. Segurança geral

- [ ] Endpoints sensíveis sem token → 401 (ex.: `GET /patients`, `POST /import-sessions/:id/import`).
- [ ] Ações owner-only com token de secretaria → 403 `forbidden_role` (export, archive, merge, mark-ready, import, approve/reject join, deactivate member, invite code).
- [ ] Cross-tenant: dados de outra clínica não vazam (paciente/arquivo/sessão/membros de outra clínica → 404 genérico).
- [ ] `audit_logs` sem PII: nenhum nome/CPF/e-mail/telefone/conteúdo de campo em `acao/recurso/recurso_id`.
- [ ] `errorHandler`: respostas 4xx/5xx nunca contêm stack/SQL/path.
- [ ] Rate-limit: headers `RateLimit`/`Retry-After` presentes após 429.
- [ ] `localStorage`: nenhum dado de paciente, token ou segredo persistido.
- [ ] Dado clínico: nenhum campo de diagnóstico/prescrição/CID/prontuário em qualquer resposta de API.

### Ressalvas aceitas (ACEITÁVEL MVP — não bloqueantes)

| Item | Detalhe |
|------|---------|
| Sem undo completo no merge | Documentado ADR 0007 + copy do modal |
| Sem contagem de agendamentos no modal | Copy genérica; endpoint futuro |
| Badge sem nome do principal | Intencional — evita PII desnecessária |
| Papel JWT stale até expirar | Exceto desativação de membro (imediata) |
| Sem TLS real em produção | Só local/staging (cert autoassinado) |
| Sem limpeza real de arquivos | Dry-run only; limpeza real é P2 |
| Paginação de duplicados client-side | Base pequena; paginação backend é P2 |
| Sem roles granulares | Só dono/secretaria no MVP |
| Sem WhatsApp API/automático | Manual-first; API é sprint futura |
| Histórico visual de auditoria | Leitura de `audit_logs` na UI é Fase 4 |

---

## Prontuário clínico v0.1 — Sprint 4.2D (QA hardening)

> Smoke tests e verificações de segurança para o módulo clínico (ADR 0010).
> Backend: `http://localhost:3001`. Requer `TOKEN` do usuário com grant clínico.
> Verificações de DB requerem `docker compose exec postgres psql -U clinicbridge -d clinicbridge`.

### Setup de pré-condição

```bash
# 1. Verificar se o usuário tem grant profissional_clinico
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
  SELECT ucr.role, u.email FROM user_clinical_roles ucr
  JOIN users u ON u.id = ucr.user_id WHERE ucr.revoked_at IS NULL;"

# 2. Obter token (usuário com grant clínico)
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"...","senha":"..."}' http://localhost:3001/auth/login | jq -r '.token')

# 3. Obter um patient_id ativo
PID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/patients | jq -r '.patients[0].id')
```

### 1. Logger redaction (validação estática)

```bash
# Grep: nenhum logger.* com campo clínico em controllers/services
grep -n "logger\." backend/src/controllers/clinicalEncounterController.ts  # esperado: NONE
grep -n "logger\." backend/src/services/clinicalEncounterService.ts | grep -v "audit_write_failed\|clinical_read_audit_failed"  # esperado: NONE
# Verificar cobertura no logger.ts:
grep -c "chief_complaint\|anamnesis\|evolution\|internal_note" backend/src/config/logger.ts  # esperado: >= 16
```

### 2. Permissões — profissional_clinico

```bash
# Criar encounter (deve retornar 201)
ENC=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"patient_id\":\"$PID\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  http://localhost:3001/clinical/encounters)
EID=$(echo $ENC | jq -r '.encounter.id')
echo "Encounter: $EID"

# Timeline (deve retornar 200, SEM campos textuais clínicos)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/patients/$PID/clinical-timeline | jq '.encounters[0] | keys'
# Esperado: campos de metadata apenas (id, started_at, status…) — sem chief_complaint/anamnesis

# Detalhe (deve retornar 200 + audit criado)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/clinical/encounters/$EID | jq '.encounter.id, (.notes | length)'

# Cancelar (deve retornar 200)
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason_code":"data_error"}' \
  http://localhost:3001/clinical/encounters/$EID/cancel | jq '.encounter.status'  # esperado: "canceled"
```

### 3. Permissões — secretaria (deve retornar 403)

```bash
# Obter token de secretaria (sem grant clínico)
STOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"...secretaria...","senha":"..."}' http://localhost:3001/auth/login | jq -r '.token')

curl -s -H "Authorization: Bearer $STOKEN" \
  http://localhost:3001/patients/$PID/clinical-timeline | jq '.error.code'
# Esperado: "forbidden_role"

curl -s -X POST -H "Authorization: Bearer $STOKEN" -H 'Content-Type: application/json' \
  -d "{\"patient_id\":\"$PID\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  http://localhost:3001/clinical/encounters | jq '.error.code'
# Esperado: "forbidden_role"
```

### 4. Permissões — dono_clinica sem grant (leitura ✅, escrita ❌)

```bash
# Com token do dono (sem grant profissional_clinico):
# Timeline → 200 (implicit gestor para leitura)
# POST /clinical/encounters → 403 (owner precisa de grant explícito para escrever)
```

### 5. Audit clínico — clinical_read_audit

```bash
# Após acessar detalhe de um encounter, verificar registro de audit:
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
  SELECT acao, papel_at_read, recurso, paciente_id IS NOT NULL AS has_paciente
  FROM clinical_read_audit ORDER BY criado_em DESC LIMIT 5;"
# Esperado:
#   clinical.encounter.read  | <papel> | encounter | t
#   clinical.timeline.list   | <papel> | timeline  | t
#   clinical.encounter.list  | <papel> | encounter | f  (paciente_id NULL na listagem geral)
```

### 6. internal_note — redação para não-autor

```bash
# Criar nota com internal_note
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"chief_complaint\":\"teste\",\"internal_note\":\"nota privada\"}" \
  http://localhost:3001/clinical/encounters/$EID/notes | jq '.note.internal_note'
# Esperado: "nota privada" (autor vê)

# Acessar o mesmo encounter com token de outro profissional (com grant mas não autor)
# Esperado: internal_note == null no NoteCard
```

### 7. Invariantes de banco

```bash
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
  SELECT 'encounters' AS t, count(*) FROM clinical_encounters
  UNION ALL SELECT 'notes', count(*) FROM clinical_encounter_notes
  UNION ALL SELECT 'audit', count(*) FROM clinical_read_audit
  UNION ALL SELECT 'roles', count(*) FROM user_clinical_roles;"
# Pós-Sprint 4.2D: encounters=0, notes=0 (dados sintéticos limpos); audit>=14; roles>=1
```

## Auditoria de leitura clínica — Sprint 4.2E (LGPD-art.18)

> Usa os **usuários smoke persistentes** definidos acima. Obtenha os tokens com `get_token()` antes de rodar.

```bash
# Pré-requisito: executar get_token() da seção "Usuários smoke persistentes" acima.

# --- Permissões ---
# 1. Sem token → 401
curl -sk -o /dev/null -w "%{http_code}" https://localhost:8443/clinical/read-audit
# → 401

# 2. smoke.owner (dono_clinica) → 200
curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_OWNER" \
  https://localhost:8443/clinical/read-audit
# → 200

# 3. smoke.secretaria → 403 forbidden_role
curl -sk -H "Authorization: Bearer $TOKEN_SEC" https://localhost:8443/clinical/read-audit \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → forbidden_role

# 4. smoke.profissional (secretaria + grant profissional_clinico) → 403 forbidden_role
curl -sk -H "Authorization: Bearer $TOKEN_PROF" https://localhost:8443/clinical/read-audit \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → forbidden_role

# 5. smoke.gestor (secretaria + grant gestor_clinica) → 403 forbidden_role
curl -sk -H "Authorization: Bearer $TOKEN_GESTOR" https://localhost:8443/clinical/read-audit \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → forbidden_role

# 6. smoke.admin (admin_sistema, sem clinica_id) → 403 no_clinic_context
curl -sk -H "Authorization: Bearer $TOKEN_ADMIN" https://localhost:8443/clinical/read-audit \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → no_clinic_context

# --- Ausência de campos proibidos ---
# 7. Resposta não contém campos clínicos nem ip/user_agent
RESP=$(curl -sk -H "Authorization: Bearer $TOKEN_OWNER" https://localhost:8443/clinical/read-audit)
for f in chief_complaint anamnesis evolution plan internal_note cancel_reason_text rectification_reason_text ip user_agent; do
  echo -n "$f: "; echo "$RESP" | grep -q "\"$f\"" && echo "FAIL" || echo "OK"
done
# → OK para todos os 9 campos

# --- Validação de filtros ---
# 8. acao inválida → 400 clinical_read_audit_filter_invalid
curl -sk -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://localhost:8443/clinical/read-audit?acao=x" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → clinical_read_audit_filter_invalid

# 9. patient_id inválido → 400
curl -sk -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://localhost:8443/clinical/read-audit?patient_id=abc" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → clinical_read_audit_filter_invalid

# 10. date_from inválido → 400
curl -sk -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://localhost:8443/clinical/read-audit?date_from=not-a-date" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → clinical_read_audit_filter_invalid

# 11. date_to < date_from → 400
curl -sk -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://localhost:8443/clinical/read-audit?date_from=2026-05-26&date_to=2026-05-20" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])"
# → clinical_read_audit_filter_invalid

# 12. Filtro válido com acao + limit
curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_OWNER" \
  "https://localhost:8443/clinical/read-audit?acao=clinical.encounter.read&limit=10"
# → 200
```

### Ressalvas aceitas (Prontuário v0.1)

| Item | Detalhe |
|------|---------|
| Sem cifra a nível de coluna | ADR 0010 §13: audit como compensating control; cifra é fase futura |
| Sem tela LGPD-art.18 separada | `ClinicalReadAuditPanel` entregue na aba Segurança (Sprint 4.2E) |
| Sem delete físico de encounter | Cancelamento é one-way; restore fora do escopo |
| Sem undo de nota | Append-only por design (ADR 0010 §9) |
| Sem CID/diagnóstico estruturado | Fora do escopo v0.1 (ADR 0010 §2.4) |
| `staleTime: 0` nas queries clínicas | Sem cache de dado clínico; recarrega sempre |
| `staleTime: 30s` no audit panel | Metadados imutáveis; 30s é seguro sem risco de exibir conteúdo stale |

---

## Documentos Médicos e Receitas — Sprint 4.3D (QA/hardening final)

> Smoke executado em 2026-05-27 via `docker exec clinicbridge-backend node /tmp/smoke_4_3d.js`.
> Script temporário em `/tmp/smoke_4_3d.js` (não versionado).
> **Resultado: 50/50 PASS.** Cleanup completo (4 docs cancelados). Sem mudanças de código.

### Nota técnica: validação de keywords no PDF (PDFKit)

PDFKit armazena texto como hex tokens em operadores TJ com kerning intercalado. Por exemplo,
"ICP-Brasil" aparece como `<4943502d4272> 10 <6173696c2e>`. Para validar keywords:

```javascript
// Extrai todos tokens <hex> do PDF e concatena
function extractPdfHexText(pdfLatin1) {
  const tokens = [];
  const re = /<([0-9a-f]+)>/gi;
  let m;
  while ((m = re.exec(pdfLatin1)) !== null) tokens.push(m[1].toLowerCase());
  return tokens.join('');
}
function kwHex(str) { return Buffer.from(str, 'ascii').toString('hex'); }

const allHex = extractPdfHexText(buf.toString('latin1'));
allHex.includes(kwHex('ICP-Brasil'))  // true ✅
allHex.includes(kwHex('GOV.BR'))      // true ✅
allHex.includes(kwHex('VALIDAR'))     // true ✅
allHex.includes(kwHex('Gov.br/ITI')) // true ✅
```

### Smoke tests 50/50 PASS (Sprint 4.3D)

| # | Cenário | Resultado |
|---|---------|-----------|
| T01 | sem token → 401 | ✅ |
| T02/T02b | secretaria list → 403/forbidden_role | ✅ |
| T03 | secretaria create → 403 | ✅ |
| T04/T04b | admin_sistema sem clinic → 403/no_clinic_context | ✅ |
| T05/T05b | profissional cria draft → 201/draft | ✅ |
| T06/T06b | profissional edita draft → 200/body presente | ✅ |
| T07/T07b | finalize sem body → 400/document_body_required | ✅ |
| T08/T08b | finalize com body → 200/finalized | ✅ |
| T09/T09b | editar finalized → 400/document_already_finalized | ✅ |
| T10/T10b | gestor lista → 200/array | ✅ |
| T11/T11b | gestor detail → 200/body presente | ✅ |
| T12 | gestor create → 403 | ✅ |
| T12b | gestor finalize → 403 | ✅ |
| T12c | gestor cancel → 403 | ✅ |
| T13 | owner lista → 200 | ✅ |
| T14 | owner detail → 200 | ✅ |
| T15 | owner create → 403 (sem grant profissional) | ✅ |
| T16 | secretaria detail → 403 | ✅ |
| T17–T17e | /patients/:id/documents → 200; sem body/metadata_json/cancel_reason_text | ✅ |
| T18/T18b | cancel finalized (reason_code: 'error') → 200/canceled | ✅ |
| T19/T19b | PDF cancelado → 400/document_canceled | ✅ |
| T20/T20b | PDF finalizado → 200 + começa %PDF | ✅ |
| T20c | gestor PDF → 200 | ✅ |
| T20e | owner PDF → 200 | ✅ |
| T20f | rodapé contém ICP-Brasil (hex extraction) | ✅ |
| T20g | rodapé contém GOV.BR (hex extraction) | ✅ |
| T20h | rodapé contém VALIDAR (hex extraction) | ✅ |
| T20i | rodapé contém Gov.br/ITI (hex extraction) | ✅ |
| T20j | compress:false → sem /FlateDecode no PDF | ✅ |
| T21 | UUID inexistente → 404 | ✅ |
| T22 | doc_type inválido → 400 | ✅ |
| T23 | body >10000 → 400 | ✅ |
| T24 | reason_code inválido → 400 | ✅ |
| T25 | patient inexistente → 404 | ✅ |

---

## Documentos Médicos e Receitas — Sprint 4.3B (ADR 0011)

> Smoke executado em 2026-05-26. Script temporário em `/tmp/sprint-4.3B-smoke.sh` (não versionado).
> PDF footer validado via extração de hex streams com Node.js — sem poppler.

### Smoke tests 47/47 PASS

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | sem token → 401 | ✅ |
| 2 | secretaria → 403 forbidden_role | ✅ |
| 3 | admin_sistema → 403 no_clinic_context | ✅ |
| 4 | profissional cria draft → 201 + status=draft + id | ✅ |
| 5 | profissional edita draft → 200 + title atualizado | ✅ |
| 6 | finalizar sem body → 400 document_body_required | ✅ |
| 7 | finalizar com body → 200 status=finalized + finalized_at | ✅ |
| 8 | editar finalized → 400 document_already_finalized | ✅ |
| 9 | PDF finalized → 200 + magic %PDF + "ICP-Brasil" + "Gov.br/ITI" + "VALIDAR" no rodapé | ✅ |
| 10 | cancel finalized → 200 status=canceled | ✅ |
| 11 | PDF canceled → 400 document_canceled | ✅ |
| 12 | owner lê documento → 200 + body visível | ✅ |
| 13 | gestor lê documento → 200 | ✅ |
| 14 | secretaria não lê → 403 | ✅ |
| 15 | list owner → 200 + body ausente na lista | ✅ |
| 16 | list owner → metadata_json ausente na lista | ✅ |
| 17 | list owner → cancel_reason_text ausente na lista | ✅ |
| 18 | list owner → ≥ 1 documento | ✅ |
| 19 | GET /patients/:id/documents owner → 200 | ✅ |
| 20 | UUID inexistente → 404 document_not_found | ✅ |
| 21 | patient inexistente → 404 patient_not_found | ✅ |
| 22 | doc_type inválido → 400 clinical_document_invalid | ✅ |
| 23 | body >10000 chars → 400 | ✅ |
| 24 | cancel_reason_code inválido → 400 clinical_document_cancel_invalid | ✅ |
| 25 | list secretaria → 403 | ✅ |
| 26 | list admin_sistema → 403 | ✅ |

### Logger leak — 10/10 PASS

```bash
# clinicalDocumentController sem logger.*
grep -c "logger\." backend/src/controllers/clinicalDocumentController.ts
# esperado: 0

# clinicalDocumentService sem logger exceto audit fail
grep "logger\." backend/src/services/clinicalDocumentService.ts | grep -v "audit_write_failed"
# esperado: sem output

# clinicalDocumentPdfService sem logger
grep -c "logger\." backend/src/services/clinicalDocumentPdfService.ts
# esperado: 0

# logger.ts tem body/title/metadata_json (>=2 cada)
grep -c "'body'\|'title'" backend/src/config/logger.ts    # >= 2
grep -c "metadata_json" backend/src/config/logger.ts       # >= 1

# logger.ts cobertura clínica total (>=16)
grep -c "chief_complaint\|anamnesis\|evolution\|internal_note" backend/src/config/logger.ts
# esperado: >= 16
```

### Audit/read_audit SQL checks

```bash
# Eventos de clinical_read_audit para documentos
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
SELECT acao, recurso, paciente_id IS NOT NULL AS has_paciente
FROM clinical_read_audit
WHERE acao LIKE 'clinical.document.%'
ORDER BY criado_em DESC LIMIT 10;"
# Esperado: clinical.document.list (false/true), clinical.document.read (true),
#           clinical.document.pdf.downloaded (true)

# Eventos de audit_logs para documentos (sem body/title/metadata_json)
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
SELECT acao FROM audit_logs WHERE acao LIKE 'clinical.document.%' ORDER BY criado_em DESC LIMIT 10;"
# Esperado: created, updated, finalized, canceled

# Invariantes de banco (pós-cleanup)
docker compose exec postgres psql -U clinicbridge -d clinicbridge -c "
SELECT 'clinical_documents' AS t, count(*) FROM clinical_documents
UNION ALL SELECT 'clinical_read_audit', count(*) FROM clinical_read_audit
UNION ALL SELECT 'smoke_users', count(*) FROM users WHERE email LIKE '%@clinicbridge.local';"
# Pós-Sprint 4.3B: clinical_documents=0 (dados sintéticos limpos); smoke_users=5
```

### Ressalvas aceitas (Documentos Médicos v0.1)

| Item | Detalhe |
|------|---------|
| `compress: false` no PDFKit | PDFs ligeiramente maiores; aceitável para docs on-demand não armazenados |
| Sem cifra de coluna | `body`/`metadata_json` em plaintext no DB; audit como compensating control |
| Sem delete físico | `canceled` é estado terminal; sem restore |
| Sem validação de CRM/CRO | Profissional pode incluir no `body` |
| `metadata_json` sem schema per-type no DB | Validação light no service; flexível para evolução de templates |

### Pré-requisitos para executar (Sprint 4.3B)

- Migration `clinical_documents` aplicada: `pnpm --filter backend migrate:latest`
- Backend rebuild com novo código: `docker compose --profile edge up -d --build backend`
- Usuários smoke persistentes disponíveis (ver §"Usuários smoke persistentes" acima)

### Smoke tests previstos (Sprint 4.3B)

| # | Teste | Resultado esperado |
|---|-------|--------------------|
| 1 | Criar rascunho (`receipt_simple`) com `smoke.profissional` | 201; `status='draft'` |
| 2 | Editar rascunho | 200; campos atualizados |
| 3 | Finalizar rascunho (body preenchido) | 200; `status='finalized'` |
| 4 | Tentar finalizar sem body | 400 `document_body_required` |
| 5 | Tentar editar após finalizar | 400 `document_already_finalized` |
| 6 | Baixar PDF do documento finalizado | 200; `Content-Type: application/pdf`; rodapé presente |
| 7 | Cancelar documento finalizado | 200; `status='canceled'` |
| 8 | Tentar PDF de documento cancelado | 400 `document_canceled` |
| 9 | Profissional B lê documento do profissional A | 404 (anti-enumeração) |
| 10 | Profissional B cancela documento do profissional A | 404 |
| 11 | Dono lê documento alheio | 200 + row em `clinical_read_audit` |
| 12 | Gestor lê documento alheio | 200 + audit |
| 13 | Secretaria (`smoke.secretaria`) → qualquer endpoint | 403 `forbidden_role` |
| 14 | Admin sistema (`smoke.admin`) → qualquer endpoint | 403 `no_clinic_context` |
| 15 | Cross-tenant | 404 |
| 16 | Paciente arquivado → criar documento | 404 `patient_not_found` |
| 17 | Strict mode fail-closed: `GET .../id` com audit failure | 500 sem conteúdo; PDF não entregue |
| 18 | Body do documento nunca em logs | grep sem resultado |

### SQL checks previstos (Sprint 4.3B)

```sql
SELECT count(*) FROM clinical_documents WHERE status='finalized' AND finalized_at IS NULL; -- 0
SELECT count(*) FROM clinical_documents WHERE status='canceled' AND cancel_reason_code IS NULL; -- 0
SELECT acao, recurso FROM audit_logs WHERE acao LIKE 'clinical.document.%' ORDER BY criado_em DESC LIMIT 5;
SELECT acao, recurso FROM clinical_read_audit WHERE recurso='document' ORDER BY criado_em DESC LIMIT 5;
```

### Ressalvas aceitas (documentadas para referência)

| Ressalva | Decisão |
|---|---|
| PDF sem armazenamento | On-demand no v0.1; S3 revisável quando AWS provisionada |
| Sem ICP-Brasil | ADR 0011 §4; aviso obrigatório no PDF e UI |
| `body` sem cifra de coluna | ADR 0011 §18; audit como compensating control; revisável |
| Sem delete físico de documento | `canceled` é o estado final; invariante |
| Sem cancelamento de doc alheio por dono/gestor | Preserva responsabilidade médico-legal |

---

## Módulo Financeiro v0.1 — Sprint 4.4B (ADR 0012)

> Smoke executado em 2026-05-27. Script temporário em `/tmp/smoke_4_4b.js` (não versionado).

### Smoke tests 49/49 PASS

| # | Cenário | Resultado |
|---|---------|-----------|
| T1 | sem token → 401 (GET /financial/charges) | ✅ |
| T1b | sem token → 401 (GET /financial/summary) | ✅ |
| T2 | admin_sistema GET /financial/charges → 403 no_clinic_context | ✅ |
| T2 | admin_sistema GET /financial/summary → 403 no_clinic_context | ✅ |
| T2c | admin_sistema POST → 403 no_clinic_context | ✅ |
| T3 | secretaria create → 201 + status=pending | ✅ |
| T4 | owner create (com sentinel notes) → 201 + status=pending | ✅ |
| T5 | gestor create → 403 forbidden_role (service block) | ✅ |
| T6 | profissional create → 403 forbidden_role | ✅ |
| T6b | profissional list → 403 | ✅ |
| T6c | profissional summary → 403 | ✅ |
| T6d | profissional detail → 403 | ✅ |
| T6e | profissional patient charges → 403 | ✅ |
| T7 | secretaria list → 200 + count >= 2 | ✅ |
| T7b | list item NÃO tem campo `notes` | ✅ |
| T7c | detail TEM campo `notes` (sentinel visível) | ✅ |
| T7d | gestor list → 200 | ✅ |
| T7e | gestor detail → 200 | ✅ |
| T8 | gestor PATCH pending → 403 forbidden_role | ✅ |
| T9 | secretaria PATCH pending → 200 + valor atualizado | ✅ |
| T10 | gestor mark-paid → 200 + status=paid + payment_method=pix | ✅ |
| T11 | PATCH paid → 400 charge_not_pending | ✅ |
| T11b | mark-paid paid → 400 charge_not_pending | ✅ |
| T11c | cancel paid → 400 charge_not_pending | ✅ |
| T12 | cancel pending → 200 + status=canceled + cancel_reason=sentinel | ✅ |
| T12b | PATCH canceled → 400 charge_not_pending | ✅ |
| T13 | gestor cancel pending → 200 + status=canceled | ✅ |
| T14 | amount_cents=0 → 400 financial_charge_invalid | ✅ |
| T14b | amount_cents=-100 → 400 financial_charge_invalid | ✅ |
| T14c | description="" → 400 financial_charge_invalid | ✅ |
| T14d | patient_id inexistente → 404 patient_not_found | ✅ |
| T14e | payment_method inválido → 400 financial_charge_invalid | ✅ |
| T14f | payment_method ausente → 400 payment_method_required | ✅ |
| T15 | appointment_id válido (mesmo patient) → 201 + campo presente | ✅ |
| T15b | GET ?appointment_id= → 200 apenas cobranças vinculadas | ✅ |
| T15c | appointment_id de outro patient_id → 400 financial_charge_invalid | ✅ |
| T15d | appointment_id inexistente → 400 financial_charge_invalid | ✅ |
| T16 | GET /patients/:id/charges → 200 + lista | ✅ |
| T16b | GET /patients/00000000.../charges → 404 patient_not_found | ✅ |
| T17 | GET /financial/summary → 200 + shape correto (6 campos numéricos) | ✅ |
| T17b | gestor GET /financial/summary → 200 | ✅ |
| T17c | GET /financial/summary?date_from=not-a-date → 400 financial_charge_invalid | ✅ |
| T18 | GET /financial/charges/00000000... → 404 charge_not_found | ✅ |
| T18b | GET /financial/charges/not-a-uuid → 400 financial_charge_invalid | ✅ |

### SQL invariants — 4/4 PASS

```sql
-- paid sem paid_at = 0
SELECT COUNT(*) FROM financial_charges WHERE status='paid' AND paid_at IS NULL;

-- canceled sem canceled_at = 0
SELECT COUNT(*) FROM financial_charges WHERE status='canceled' AND canceled_at IS NULL;

-- pending com paid/canceled fields = 0
SELECT COUNT(*) FROM financial_charges
WHERE status='pending' AND (paid_at IS NOT NULL OR canceled_at IS NOT NULL OR cancel_reason IS NOT NULL);

-- appointment_id com patient_id divergente = 0
SELECT COUNT(*) FROM financial_charges fc
JOIN appointments a ON a.id = fc.appointment_id
WHERE fc.patient_id != a.patient_id;
```

### Logger leak — redaction financeiro

```bash
# Nenhum sentinel financeiro nos logs
docker logs clinicbridge-backend | grep -E 'FIN_DESC_SENTINEL|FIN_NOTES_SENTINEL|FIN_CANCEL_SENTINEL'
# esperado: nenhuma linha

# logger.ts cobre description/notes/cancel_reason/amount_cents
grep -c "description" backend/src/config/logger.ts   # >= 4
grep -c "'notes'" backend/src/config/logger.ts        # >= 4
grep -c "cancel_reason" backend/src/config/logger.ts  # >= 4
grep -c "amount_cents" backend/src/config/logger.ts   # >= 4
```

### Ressalvas aceitas (Módulo Financeiro v0.1)

| Item | Detalhe |
|------|---------|
| Sem cifra de coluna | `description`/`notes`/`amount_cents` em plaintext; logger redaction + audit como compensating controls |
| Sem delete físico | `canceled` é estado terminal; sem restore |
| Sem gateway de pagamento | Registro manual de pagamentos no v0.1 |
| Sem audit de leitura dedicado | Audit de escrita best-effort em `audit_logs`; financeiro não é clínico |
| `notes` sem validação de conteúdo clínico | Aviso a ser exibido no frontend (4.4C) |
| appointment_id sem UNIQUE constraint | Uma consulta pode ter 0..N cobranças (retornos, extras) |

### Pré-requisitos para executar (Sprint 4.4B)

- Migration `financial_charges` aplicada: `pnpm --filter backend migrate:latest`
- Backend rebuild: `docker compose --profile edge up -d --build backend`
- Usuários smoke persistentes disponíveis (ver §"Usuários smoke persistentes" acima)

---

## Sprint 4.4C — Frontend Financeiro v0.1

### Testes visuais/manuais (browser com smoke users)

| # | Ação | Esperado |
|---|------|---------|
| 1 | Login smoke.owner → aba "Financeiro" | Tab visível |
| 2 | Cards resumo | "Em aberto", "Vencido", "Recebido no período" com valores |
| 3 | Tabela de cobranças | Linha com badges Pendente/Vencido/Pago/Cancelado |
| 4 | "Nova cobrança" → preencher → "Criar cobrança" | 201 criado; redireciona para detalhe |
| 5 | Formulário criar — campo Observações | Aviso clínico ⚠️ visível |
| 6 | Detalhe de cobrança pendente | Botões "Marcar como pago", "Editar", "Cancelar cobrança" |
| 7 | "Marcar como pago" → modal → confirmar | Cobrança aparece como "Pago" no detalhe |
| 8 | "Cancelar cobrança" → modal → confirmar | Cobrança aparece como "Cancelado" |
| 9 | Detalhe de pago/cancelado | Sem botões de ação |
| 10 | Filtro status=Pago | Apenas cobranças pagas |
| 11 | Login smoke.profissional (papel=secretaria + grant profissional_clinico) | Tab "Financeiro" visível, mas lista retorna 403 → tela "Acesso não autorizado" |
| 12 | Notes na listagem | Ausentes (só no detalhe) |
| 13 | Notes no detalhe | Presente se preenchido, com aviso clínico |

### Checklist de segurança frontend

```bash
# Sem console.log de dados financeiros
grep -n "console\." frontend/src/components/FinancialPanel.tsx
# esperado: sem ocorrências

# Sem localStorage/sessionStorage
grep -n "localStorage\|sessionStorage" frontend/src/components/FinancialPanel.tsx
# esperado: sem ocorrências

# Sem dangerouslySetInnerHTML
grep -n "dangerouslySetInnerHTML" frontend/src/components/FinancialPanel.tsx
# esperado: sem ocorrências

# notes não em URL/query string
grep -n "notes.*url\|url.*notes\|URLSearchParams.*notes" frontend/src/components/FinancialPanel.tsx
# esperado: sem ocorrências
```

### Verificação de build

```bash
pnpm --filter frontend typecheck  # deve ser 0 erros
pnpm --filter frontend build      # deve compilar sem erros
pnpm --filter backend typecheck   # sem regressão
git diff --check                  # sem whitespace errors
```

---

## Sprint 4.4D — QA/Hardening Financeiro v0.1 (entregue 2026-05-27)

### Resultados

| Check | Resultado |
|-------|-----------|
| Smoke backend/API | **60/60 PASS** |
| SQL invariants | **9/9 · 0 violações** |
| Audit logs (4 ações) | ✅ |
| Log redaction (sentinels) | ✅ PASS |
| Frontend security (code review) | ✅ PASS |
| QA browser (usuário) | ✅ PASS |
| Cleanup (0 pending) | ✅ |
| `pnpm --filter backend typecheck` | ✅ |
| `pnpm --filter backend build` | ✅ |
| `pnpm --filter frontend typecheck` | ✅ |
| `pnpm --filter frontend build` | ✅ |
| `migrate:status` | 15 applied / 0 pending ✅ |
| `git diff --check` | rc=0 ✅ |

### Checks de segurança frontend (verificados)

- `FinancialPanel.tsx` — sem `console.log`, `localStorage`, `sessionStorage`, `dangerouslySetInnerHTML`
- `notes` / `cancel_reason` ausentes da listagem; presentes apenas em `ChargeDetailView`
- Token não aparece em URL (passa via `Authorization: Bearer` header)
- Filtros não expõem `notes`; apenas: `status`, `date_from`, `date_to`, `patient_id`, `appointment_id`, `limit`, `offset`
- `staleTime: 0` em todas as queries de detalhe
- `profissional_clinico` bloqueado em duas camadas (componente + service)

### Cleanup pós-4.4D

Estado final `financial_charges`: 0 pending · 6 paid · 19 canceled.
Usuários smoke preservados. Pacientes/agendamentos/documentos/importações base intactos.

---

## Smoke Agenda × Financeiro (Sprint 4.4E-D)

> Smoke API executado via Python3 direto no host contra `https://localhost:8443`.
> Não usa `jq`.

### Script de referência

```python
# Ver /tmp/smoke_4_4e_d.py (histórico desta sprint)
# Variáveis-chave:
# APPT_ID    = "f2744f04-ba56-421b-841d-64234355198d" (scheduled, patient eaa7f3ea)
# PATIENT_ID = "eaa7f3ea-6b32-45c8-ac03-6546216699cc" (Paciente Smoke 4.3B, active)
```

### Resultados 4.4E-D (24/24 PASS real)

| # | Papel | Endpoint | Esperado | Resultado |
|---|-------|----------|----------|-----------|
| 1 | secretaria | POST /auth/login | 200 + token | ✅ |
| 2 | secretaria | GET /appointments?date=YYYY-MM-DD | 200 lista | ✅ |
| 3 | secretaria | GET /financial/charges?limit=100 | 200 charges[] | ✅ |
| 4 | secretaria | POST /financial/charges + appointment_id | 201 charge.pending | ✅ |
| 5 | secretaria | charge.appointment_id correto | match | ✅ |
| 6 | secretaria | charge.status = pending | pending | ✅ |
| 7 | secretaria | GET /financial/charges?appointment_id=X | charge aparece | ✅ |
| 8 | secretaria | list projection sem notes/cancel_reason | ausentes | ✅ |
| 9 | gestor | GET /appointments | 200 | ✅ |
| 10 | gestor | GET /financial/charges | 200 | ✅ |
| 11 | gestor | POST /financial/charges | 403 forbidden_role | ✅ |
| 12 | profissional | GET /appointments | 200 | ✅ |
| 13 | profissional | GET /financial/charges | 403 forbidden_role | ✅ |
| 14 | admin_sistema | GET /appointments | 403/no_clinic | ✅ |
| 15 | admin_sistema | GET /financial/charges | 403/no_clinic | ✅ |
| 16 | owner | GET /appointments | 200 | ✅ |
| 17 | owner | GET /financial/charges | 200 | ✅ |

**Nota:** Código 403 usa `{"error": {"code": "forbidden_role", ...}}` — estrutura correta do errorHandler.

### Checks de segurança frontend (AdministrativeSchedulePanel.tsx — 4.4E-D)

- Sem `console.log` dados financeiros ✅
- Sem `localStorage`/`sessionStorage` ✅
- Sem `dangerouslySetInnerHTML` ✅
- Token não vai em URL ✅
- `notes`/`cancel_reason` ausentes na Agenda ✅
- Badge renderiza só `FINANCIAL_BADGE_LABELS[badgeState]` — sem `description`/`amount_cents` ✅
- `profissional_clinico`: `canSeeFinancial=false` → seção financeira não renderizada ✅
- 403 financeiro: `financialBlocked=true` → agenda não quebra ✅
- Dismiss: `Set<string>` React local, sem chamada de API ✅
- "Ver cobrança": `onGoToFinanceiro?.()` callback — sem charge_id na URL ✅
- `appointment_id` oculto no form, nunca exibido ao usuário ✅

### SQL invariants pós-4.4E-D

Estado final `financial_charges`: 1 pending · 6 paid · 22 canceled.
(pending: cobrança "Consulta" da validação visual 4.4E-C — appointment 57bb4853)

### Cleanup pós-4.4E-D

Cobrança sintética `dcd487fb` (4.4E-D) → cancelada.
Usuários smoke preservados. Pacientes/agendamentos/importações/documentos base intactos.

## Smoke Backend Relatórios Gerenciais v0.1 — Sprint 4.5B (ADR 0014)

> 4 endpoints read-only. Sem migration, sem PII, sem dados clínicos.

### Endpoints
- `GET /reports/appointments` (R-A)
- `GET /reports/financial` (R-B)
- `GET /reports/patients` (R-C)
- `GET /reports/agenda-financial` (R-D)

### Filtros aceitos
- `date_from`, `date_to` — `YYYY-MM-DD`. Default: 1º do mês corrente → hoje. Intervalo ≤ 366 dias. Floor ~2 anos.
- `professional_id` — apenas R-A e R-D. UUID v4. Validado contra `clinic_professionals` da clínica (cross-tenant → 400).
- `no_appt_days` — apenas R-C. Inteiro 1..365, default 90.

### Pipeline (toda rota)
1. `patientsRateLimit` (IP-keyed, antes do auth)
2. `requireAuth`
3. `requireClinic`
4. `requireRole(['dono_clinica','secretaria'])`
5. Serviço (R-B/R-D): `effectiveFinancialAccess !== 'none'`

### Matriz de permissão (Sprint 4.5B — 24/24 PASS)

| Usuário | R-A | R-B | R-C | R-D |
|---------|-----|-----|-----|-----|
| (sem token) | 401 | 401 | 401 | 401 |
| `smoke.owner` (dono_clinica) | 200 | 200 | 200 | 200 |
| `smoke.secretaria` (secretaria, sem grants) | 200 | 200 | 200 | 200 |
| `smoke.gestor` (secretaria + gestor_clinica) | 200 | 200 | 200 | 200 |
| `smoke.profissional` (secretaria + profissional_clinico) | 200 | **403 forbidden_role** | 200 | **403 forbidden_role** |
| `smoke.admin` (admin_sistema, sem clínica) | **403 no_clinic_context** | **403 no_clinic_context** | **403 no_clinic_context** | **403 no_clinic_context** |

### Roteiro Python (sem jq)

```python
import json, ssl, urllib.request
BASE = "https://localhost:8443"; PASS = "SmokeDevOnly!23"
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def post(p,b):
    req=urllib.request.Request(f"{BASE}{p}",data=json.dumps(b).encode(),method="POST")
    req.add_header("Content-Type","application/json")
    try:
        with urllib.request.urlopen(req,context=ctx) as r: return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read())
def get(p,t=None):
    req=urllib.request.Request(f"{BASE}{p}",method="GET")
    if t: req.add_header("Authorization",f"Bearer {t}")
    try:
        with urllib.request.urlopen(req,context=ctx) as r: return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: b=json.loads(e.read())
        except Exception: b=None
        return e.code,b
T={k:post("/auth/login",{"email":f"smoke.{k}@clinicbridge.local","senha":PASS})[1]["token"]
   for k in ["owner","secretaria","profissional","gestor","admin"]}
for ep in ["/reports/appointments","/reports/financial","/reports/patients","/reports/agenda-financial"]:
    print(ep, "→", {k:get(ep,T[k])[0] for k in T})
```

### Filtros inválidos (10/10 PASS — esperado `400 report_invalid_filters`)

| Caso | Esperado |
|------|----------|
| `date_from=2026/05/01` (formato errado) | 400 |
| `date_to=27-05-2026` (formato errado) | 400 |
| `date_from=2026-02-30` (data impossível, round-trip ISO) | 400 |
| `date_from=2026-05-20&date_to=2026-05-10` (ordem invertida) | 400 |
| `date_from=2024-01-01&date_to=2026-05-27` (intervalo > 366 dias) | 400 |
| `professional_id=not-a-uuid` | 400 |
| `professional_id=00000000-0000-0000-0000-000000000000` (não existe na clínica) | 400 |
| `no_appt_days=abc` | 400 |
| `no_appt_days=0` (abaixo do mínimo) | 400 |
| `no_appt_days=999` (acima do máximo) | 400 |

### Payload safety (varredura recursiva — 12/12 PASS)

Chaves proibidas (jamais aparecem nas 4 respostas):
`cpf, email, telefone, endereco, nome, name, notes, cancel_reason, description, clinical,
diagnostico, cid, prescricao, evolucao, body, private_note, internal_note, administrative_notes`.

Substrings proibidas no JSON serializado:
`cpf, @, prescric, diagnostic, cid (isolado), evolu, cancel_reason`.

### Content shape esperado

```jsonc
// R-A
{ "report":"appointments", "date_from":"…", "date_to":"…", "professional_id":null,
  "data":{"total":N,"scheduled":N,"confirmed":N,"completed":N,"cancelled":N,"rescheduled":N,"no_show":N,"attendance_rate":0..1},
  "attention":[{"appointment_id":"uuid","starts_at":"ISO","status":"…"}, …max 20],
  "generated_at":"ISO" }

// R-B
{ "report":"financial", "date_from":"…", "date_to":"…",
  "data":{"received_cents":N,"pending_cents":N,"overdue_cents":N,"canceled_cents":N,
          "count_paid":N,"count_pending":N,"count_overdue":N,"count_canceled":N,
          "by_payment_method":[{"method":"cash|pix|card|bank_transfer|other","total_cents":N,"count":N}, …]},
  "generated_at":"ISO" }

// R-C
{ "report":"patients", "date_from":"…", "date_to":"…", "no_appt_days":N,
  "data":{"total_active":N,"total_archived":N,"new_in_period":N,
          "with_appointment_in_period":N,"without_recent_appointment":N},
  "generated_at":"ISO" }

// R-D
{ "report":"agenda-financial", "date_from":"…", "date_to":"…", "professional_id":null,
  "data":{"appointments_total":N,"with_pending_charge":N,"with_paid_charge":N,
          "with_overdue_charge":N,"with_canceled_charge":N,"without_charge":N,
          "cancelled_with_pending":N,"charge_canceled_appt_active":N},
  "generated_at":"ISO" }
```

### Audit (metadata-only)

```sql
SELECT acao, recurso, recurso_id, usuario_id IS NOT NULL, clinica_id IS NOT NULL, ip IS NOT NULL
FROM audit_logs
WHERE acao LIKE 'report.%'
ORDER BY criado_em DESC LIMIT 12;
```

Esperado: `acao='report.<type>.view.success'`, `recurso='report'`,
`recurso_id='<type>:<date_from>:<date_to>'` (sem valores, sem PII).

### Ressalvas (Sprint 4.5B)

- Sem frontend até 4.5C.
- Sem export (CSV/PDF/XLSX) no v0.1.
- Relatórios on-demand, sem cache nem materialização.
- Intervalo máximo 366 dias por desenho.
- Sem dados clínicos; sem nomes/CPF/contato.
- Profissional → 403 em R-B/R-D (mesma matriz do Financeiro v0.1).

## Smoke Frontend Relatórios Gerenciais v0.1 — Sprint 4.5C (ADR 0014)

> Aba "Relatórios" no Dashboard. 4 blocos consumindo os endpoints da Sprint 4.5B.
> Manual em browser. Sem export, sem PII, sem dados clínicos.

### Pré-requisitos

```bash
docker compose --profile edge up -d --build backend nginx
VITE_API_BASE_URL=https://localhost:8443 pnpm --filter frontend dev --host 0.0.0.0
# abrir https://localhost:5173 (aceitar self-signed se necessário)
```

### Roteiro — `smoke.owner` (dono_clinica)

| # | Passo | Esperado |
|---|-------|----------|
| 1 | Login com `smoke.owner@clinicbridge.local` | Dashboard abre |
| 2 | Clicar aba **Relatórios** | Painel monta; cabeçalho com aviso "Nenhum dado clínico" |
| 3 | Default = **Mês atual** | Período mostrado: `1º do mês atual → hoje` |
| 4 | Bloco **Agenda** carrega | Cards Total/Agendadas/Confirmadas/Realizadas/Canceladas/Faltas/Taxa; nenhum nome de paciente; sem UUID visível |
| 5 | Se houver atrasos: aviso amarelo aparece | Lista mostra apenas horário `DD/MM HH:MM` + status traduzido; sem UUID; "+ N adicional(is)" se >8 |
| 6 | Bloco **Financeiro** carrega | Cards Recebido/Em aberto/Vencido/Cancelado/Cobranças (pagas/pendentes); breakdown por método em BRL |
| 7 | Bloco **Pacientes** carrega | Ativos/Novos/Com agendamento/Sem agendamento recente (90d)/Arquivados |
| 8 | Bloco **Agenda × Financeiro** carrega | 6 cards + 2 sinais ("cancelada com cobrança pendente", "cobrança cancelada com consulta ativa") |
| 9 | Trocar para **Hoje** | Período = hoje/hoje; dados recarregam |
| 10 | Trocar para **Últimos 7 dias** | Período = hoje-6/hoje |
| 11 | Trocar para **Personalizado** + datas válidas + **Atualizar** | Período aplicado; dados recarregam |
| 12 | Personalizado com `date_to < date_from` + **Atualizar** | Mensagem vermelha "A data final deve ser maior ou igual à data inicial." |
| 13 | Personalizado com intervalo > 366 dias | Backend retorna `report_invalid_filters`; UI exibe a mensagem do backend |
| 14 | Network tab (DevTools) | Token vai em `Authorization: Bearer …` (header); nenhum request com token na URL |
| 15 | Console | Sem `console.log` de payload; sem stack trace |

### Roteiro — `smoke.secretaria` (papel=secretaria, sem grants)

- Mesmo fluxo do owner; backend retorna 200 nos 4 endpoints (`effectiveFinancialAccess='full'`).

### Roteiro — `smoke.gestor` (secretaria + gestor_clinica)

- Mesmo fluxo do owner; backend retorna 200 nos 4 endpoints (`effectiveFinancialAccess='transact'`).
- Painel não diferencia visualmente — só leitura.

### Roteiro — `smoke.profissional` (secretaria + profissional_clinico)

| # | Passo | Esperado |
|---|-------|----------|
| 1 | Login com `smoke.profissional@clinicbridge.local` → aba **Relatórios** | Painel monta |
| 2 | Bloco **Agenda** | 200 OK — cards normais |
| 3 | Bloco **Financeiro** | Card cinza "Área financeira restrita" — não derruba painel |
| 4 | Bloco **Pacientes** | 200 OK — cards normais |
| 5 | Bloco **Agenda × Financeiro** | Card cinza "Área financeira restrita" |
| 6 | Console | Sem stack trace; mensagens não vazam código técnico |

### Roteiro — `smoke.admin` (admin_sistema, sem clínica)

- Login direciona para `JoinClinicGate` (sem `clinica_id`); aba Relatórios não é alcançada.
- Se forçar request manual: backend responde 403 `no_clinic_context`.

### Segurança visual (todos os usuários)

- [ ] Nenhum nome de paciente aparece em qualquer card/lista
- [ ] Nenhum CPF/e-mail/telefone aparece
- [ ] Nenhum `notes`/`description`/`cancel_reason` aparece
- [ ] Nenhum dado clínico (diagnóstico/CID/prescrição/evolução)
- [ ] Nenhum UUID exibido como informação principal (lista "Em atraso" mostra só horário + status)
- [ ] Valores monetários em BRL (R$ 1.234,56) — não `amount_cents`
- [ ] Status traduzidos em PT ("Realizadas", "Faltas", "Cancelada") — não em inglês
- [ ] Sem `console.log` de payload no DevTools
- [ ] Sem `localStorage`/`sessionStorage` com dados de relatório (apenas o token de auth padrão da sessão)

### Responsividade (devtools mobile)

- [ ] Cabeçalho empilha em telas estreitas
- [ ] Barra de filtros vira coluna; inputs date 100% width
- [ ] Cards viram grid 2 colunas (`<640px`)
- [ ] Botão **Atualizar** ocupa largura total
- [ ] Sem scroll horizontal estranho

## QA Regressão Relatórios v0.1 — Sprint 4.5D

> Sprint de polish + regressão. Reusa os roteiros das sprints 4.5B/4.5C.

### API regressão (24/24 PASS — Sprint 4.5D)

Reusa tokens persistentes dos smoke users (em `/tmp/cb-smoke/tokens.json` localmente).
Confirma que o polish do frontend não introduziu regressão em rotas/policies.

| # | Caso | Esperado |
|---|------|----------|
| 1-4 | owner × 4 endpoints | 200 |
| 5-8 | secretaria × 4 endpoints | 200 |
| 9-12 | gestor × 4 endpoints | 200 |
| 13-14 | profissional R-A / R-C | 200 |
| 15-16 | profissional R-B / R-D | 403 `forbidden_role` |
| 17-20 | admin × 4 endpoints | 403 `no_clinic_context` |
| 21-24 | payload PII scan (owner × 4 endpoints) | 0 chaves proibidas |

### Polish UX (Sprint 4.5D) — smoke browser manual

Subir:
```bash
docker compose --profile edge up -d --build backend nginx
VITE_API_BASE_URL=https://localhost:8443 pnpm --filter frontend dev --host 0.0.0.0
```

Verificar na aba **Relatórios** (smoke.owner):

- [ ] **Hero "Resumo do período"** aparece acima dos 4 blocos com 4 sinais grandes (Consultas no período / Recebido / Em aberto / Pacientes novos).
- [ ] "Em aberto" mostra hint "X vencido" se houver vencido; senão "saldo atual".
- [ ] Cada bloco tem **uma frase interpretativa** acima dos cards.
- [ ] **Agenda** — Realizadas / Confirmadas / Agendadas vêm primeiro; Canceladas sem cor (não warning); Faltas em vermelho só se > 0.
- [ ] **Financeiro** — Recebido (verde) / Em aberto (ciano) / Vencido (vermelho só se > 0); Cancelado no fim, sem cor.
- [ ] **Pacientes** — label "Sem agendamento há mais de 90 dias"; hint "oportunidade de retorno".
- [ ] **Agenda × Financeiro** — sub-bloco "Pontos de atenção" com 2 linhas; valor em amarelo se > 0.
- [ ] **Datas** no cabeçalho de período em PT-BR (DD/MM/AAAA).

Verificar com **smoke.profissional**:

- [ ] Aba Relatórios continua visível.
- [ ] Hero strip: Recebido e Em aberto mutados (opacidade reduzida + hint "acesso restrito").
- [ ] Blocos Agenda / Pacientes carregam normalmente.
- [ ] Blocos Financeiro / Agenda × Financeiro mostram card **ciano-calmo** ("Área financeira restrita...") — não vermelho/erro.
- [ ] Copy: "Os blocos Agenda e Pacientes continuam disponíveis."

Verificar **regressão de segurança**:

- [ ] Network tab: nenhum request com token na URL.
- [ ] Network tab: nenhum request a `localhost:3001` direto (tudo via `https://localhost:8443`).
- [ ] Console DevTools: zero `console.log` de payload de relatório.
- [ ] DOM inspector: nenhum `appointment_id` (UUID) renderizado como texto.
- [ ] DOM: nenhum nome de paciente, CPF, e-mail, telefone.
- [ ] DOM: nenhum `amount_cents` cru (só `R$ X,XX`).

### Decisão registrada (4.5D)

A aba **Relatórios continua visível para todo papel administrativo** (dono + secretaria). O frontend não consegue distinguir `secretaria` pura de `secretaria + profissional_clinico` no v0.1 (o `/me` não devolve grants; `/clinical/roles` é owner-only).
Profissional recebe blocos financeiros como "acesso restrito" intencional, com tom calmo.

**Relatórios Gerenciais v0.1 → CLOSED na sprint 4.5D.**

---

## Sprint 4.6B — Backend Catálogo de Serviços v0.1 (smoke API)

Reusa smoke users persistentes (`*@clinicbridge.local`).

**Pipeline:** `patientsRateLimit → requireAuth → requireClinic → requireRole(...)`.

```bash
PASS="SmokeDevOnly!23"
get_token() {
  curl -sk -X POST https://localhost:8443/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${1}\",\"senha\":\"${PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token','LOGIN_FAILED'))"
}
TOK_OWNER=$(get_token "smoke.owner@clinicbridge.local")
TOK_SEC=$(get_token "smoke.secretaria@clinicbridge.local")
TOK_PROF=$(get_token "smoke.profissional@clinicbridge.local")
TOK_GESTOR=$(get_token "smoke.gestor@clinicbridge.local")
TOK_ADMIN=$(get_token "smoke.admin@clinicbridge.local")
```

### Cobertura mínima

- [ ] `GET /clinic-services` sem token → 401 `unauthorized`.
- [ ] `POST /clinic-services` com `TOK_ADMIN` → 403 `no_clinic_context`.
- [ ] `POST /clinic-services` com `TOK_OWNER` body `{name, category, description, duration_minutes, price_cents}` → 201.
- [ ] `POST /clinic-services` body com `name` duplicado → 409 `service_name_duplicated`.
- [ ] Variações case-insensitive (`consulta médica` vs `Consulta médica`) → 409 normalizado.
- [ ] Variações com espaços (`  Consulta médica  `) → 409 normalizado.
- [ ] `name` só com espaços (`"   "`) → 400 `clinic_service_invalid`.
- [ ] PATCH renomeando um serviço para o nome normalizado de outro → 409; PATCH self com casing
      diferente → 200 (sem falso colisão).
- [ ] `POST /clinic-services` `name=""` → 400 `clinic_service_invalid`.
- [ ] `POST /clinic-services` `duration_minutes=4` ou `=721` → 400 `clinic_service_invalid`.
- [ ] `POST /clinic-services` `price_cents=-1` ou `=100000000` → 400 `clinic_service_invalid`.
- [ ] `POST /clinic-services` com `TOK_SEC|TOK_GESTOR|TOK_PROF` → 403 `forbidden_role`.
- [ ] `GET /clinic-services` com `TOK_SEC|TOK_GESTOR|TOK_PROF` → 200 (seletor de agenda).
- [ ] `GET /clinic-services/:id` cross-tenant ou UUID inexistente → 404 `service_not_found`.
- [ ] `GET /clinic-services/not-a-uuid` → 400 `clinic_service_invalid`.
- [ ] `PATCH /clinic-services/:id` com `TOK_OWNER` → 200 + campos aplicados.
- [ ] `PATCH /clinic-services/:id/status` `{active:false}` → 200 (soft-delete).
- [ ] `GET /clinic-services?active=true` exclui soft-deletados; `?active=false` mostra só desativados.
- [ ] `POST /clinic-services/:id/professionals` com `TOK_OWNER` body `{professional_id}` → 201.
- [ ] Re-link mesmo par → 201 idempotente (mesma linha, `active=true`; sem duplicata).
- [ ] `PATCH /clinic-services/:id/professionals/:professional_id/status` → 200.
- [ ] Re-link após desativação reativa o vínculo.
- [ ] `POST /clinic-services/:id/professionals` com `professional_id` inexistente → 404 `professional_not_found`.

### Audit verification

```sql
SELECT acao, COUNT(*) FROM audit_logs
WHERE recurso='clinic_service' AND criado_em > now() - interval '5 minutes'
GROUP BY acao ORDER BY acao;
```

Deve listar apenas: `clinic_service.create.success`, `.update.success`, `.status.update.success`,
`.professional.link.success`, `.professional.status.update.success`. Nenhuma audit ação de **leitura**
(catálogo é administrativo, mesmo padrão do financeiro).

### Payload safety

```bash
curl -sk -H "Authorization: Bearer $TOK_OWNER" https://localhost:8443/clinic-services \
  | python3 -c "import sys,json; t=json.dumps(json.load(sys.stdin)).lower(); \
    forbid=['cid','diagnos','anamnes','evolution','internal_note','chief_complaint','cpf','telefone']; \
    leaks=[k for k in forbid if k in t]; print('LEAKS' if leaks else 'CLEAN', leaks)"
```

Esperado: `CLEAN []`.

### SQL — schema

```sql
\d clinic_services
\d professional_services
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE column_name='service_id' AND table_schema='public';
```

Esperado: `appointments.service_id` e `financial_charges.service_id` ambos `YES` (nullable).

### Limpeza de dados sintéticos

Política de smoke users persistentes em §"Usuários smoke persistentes" no topo do arquivo
(usuários ficam; dados sintéticos podem ser apagados). Para limpar serviços criados em testes:

```sql
-- Em desenvolvimento local apenas. Bindings em professional_services somem em CASCADE.
DELETE FROM clinic_services
WHERE clinica_id = (SELECT id FROM clinics WHERE nome = 'Clinica Smoke Dev')
  AND name IN ('Consulta médica', 'Sessão de fisio');
```

**Catálogo de Serviços v0.1 → backend entregue na Sprint 4.6B. Frontend + wiring `service_id` na 4.6C.**

---

## Sprint 4.6C — Frontend Catálogo de Serviços v0.1

### Smoke API — wiring service_id em appointments

```bash
# Variáveis: TOK_OWNER (dono_clinica), CLINIC_ID, SERVICE_ID (serviço ativo), PROF_ID (profissional)
# Criar agendamento COM serviço vinculado
curl -sk -X POST -H "Authorization: Bearer $TOK_OWNER" \
  -H "Content-Type: application/json" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"professional_id\":\"$PROF_ID\",\"service_id\":\"$SERVICE_ID\",\"starts_at\":\"2026-06-01T09:00:00Z\",\"ends_at\":\"2026-06-01T10:00:00Z\"}" \
  https://localhost:8443/appointments | python3 -m json.tool
# Esperado: 201 com service_id preenchido.

# Criar agendamento com service_id de serviço inativo → 400 service_inactive
# Criar agendamento com service_id de outra clínica → 400 service_not_found
# Criar agendamento com service_id + profissional sem vínculo → 400 service_not_available_for_professional
# Criar agendamento sem service_id → 201 com service_id=null (retrocompatibilidade)
```

### Smoke API — wiring service_id em financial charges

```bash
# Criar cobrança COM service_id
curl -sk -X POST -H "Authorization: Bearer $TOK_OWNER" \
  -H "Content-Type: application/json" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"description\":\"Consulta\",\"amount_cents\":15000,\"service_id\":\"$SERVICE_ID\"}" \
  https://localhost:8443/financial/charges | python3 -m json.tool
# Esperado: 201 com service_id preenchido.

# PATCH cobrança pendente — alterar service_id → 200 com novo service_id
# Criar cobrança com service_id + appointment_id cujo service_id difere → 400 service_mismatch_with_appointment
# Criar cobrança sem service_id → 201 com service_id=null (retrocompatibilidade)
```

### Frontend security greps

```bash
# Sem console.log, sem localStorage, sem dangerouslySetInnerHTML, sem token em URL
grep -rn "console\.log\|localStorage\|sessionStorage\|dangerouslySetInnerHTML" \
  frontend/src/components/ServicesPanel.tsx
# Esperado: zero ocorrências

# Sem dado clínico nos labels
grep -in "cid|diagnos|prontuár|prescrição|queixa|anamnes" \
  frontend/src/components/ServicesPanel.tsx
# Esperado: zero ocorrências (apenas no aviso textual)
```

### Smoke browser — ServicesPanel (owner)

- [ ] Login como `smoke.owner@clinicbridge.local` → aba Equipe → scroll até "Serviços".
- [ ] Painel visível com subtítulo "etiqueta administrativa/comercial".
- [ ] "Novo serviço" cria serviço com name, category, price, duration, description.
- [ ] Aviso anti-dado-clínico visível no formulário.
- [ ] Editar serviço (nome, preço) → 200; card atualiza.
- [ ] Desativar → fica com chip "Inativo" / opacidade reduzida.
- [ ] Reativar → volta ao normal.
- [ ] Vincular profissional → aparece na lista de profissionais do serviço.
- [ ] Desvincular → some da lista.

### Smoke browser — AgendaPanel (seletor de serviço)

- [ ] Formulário "Novo agendamento" mostra seletor "Serviço (opcional)".
- [ ] Lista serviços ativos da clínica.
- [ ] Trocar profissional reseta seleção de serviço.
- [ ] Criar agendamento com serviço → detalhe do agendamento mostra service_id.
- [ ] Criar agendamento sem serviço → funciona normalmente (retrocompatibilidade).

### Smoke browser — FinancialPanel (seletor de serviço)

- [ ] Nova cobrança: seletor "Serviço (opcional)" aparece antes da descrição.
- [ ] Selecionar serviço com price_cents → botão "Usar preço de tabela (R$ X,XX)" aparece.
- [ ] Clicar "Usar preço de tabela" → preenche campo de valor (não automático).
- [ ] Criar cobrança com serviço → charge.service_id preenchido.
- [ ] Editar cobrança pendente → service_id editável; "Usar preço de tabela" funciona.
- [ ] Criar cobrança sem serviço → funciona normalmente (retrocompatibilidade).

### Permissões frontend

- [x] `smoke.owner@clinicbridge.local` — aba Serviços: painel completo com botões de criação/edição.
- [x] `smoke.secretaria@clinicbridge.local` — aba Serviços: ServicesPanel visível mas sem botões de escrita.
  (Backend: 403 `forbidden_role` em qualquer mutação.)
- [x] `smoke.profissional@clinicbridge.local` — aba Serviços: catálogo visível (read-only). Seletor de
  serviço na Agenda funciona normalmente (leitura via GET /clinic-services).

**Sprint 4.6C entregue. Sprint 4.6C.2 e 4.6D entregues. Gate 4.7A aberto.**

---

## Sprint 4.6D — QA/Hardening Catálogo de Serviços v0.1 (entregue 2026-05-27)

### Bug crítico corrigido (4.6C.2)

`appointmentController.create` e `financialChargeController.create`/`update` não repassavam
`service_id` do body request para o service — campo descartado silenciosamente no destructuring.
Validações `service_not_available_for_professional` e `service_mismatch_with_appointment` nunca
executavam. Corrigido em 3 pontos dos 2 controllers.

### Smoke API executado (41/41 PASS)

```bash
# Setup tokens
BASE="https://localhost:8443"
TOK_OWNER=$(curl -sk -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke.owner@clinicbridge.local","senha":"SmokeDevOnly!23"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

PROF_ID="c43e700c-31ad-4357-b39b-aded682312da"
PAT_ID="eaa7f3ea-6b32-45c8-ac03-6546216699cc"

# Serviço vinculado (criado em 4.6B smoke)
SVC_VINC_ID="7cf1e714-e68e-4a31-8a9b-c508a2494481"  # Smoke Vinculo
SVC_SENV_ID="9287258c-0e90-45e5-86da-54b2151df7b6"  # Smoke Sem Vinculo
```

**Resultados por bloco:**

- **Bloco 1 (auth/anon):** GET anon → 401 ✅; POST anon → 401 ✅.
- **Bloco 2 (CRUD owner):** create 201 ✅; list ✅; detail 200 ✅; update 200 ✅; deactivate 200 ✅; reactivate 200 ✅.
- **Bloco 3 (limites/duplicatas):** `limit=200` → 400 ✅; `limit=100` → 200 ✅; nome duplicado → 409 ✅;
  case-insensitive → 409 ✅; `price_cents=-1` → 400 ✅; `duration_minutes=999` → 400 ✅.
- **Bloco 4 (permissões):** secretaria GET 200 ✅; secretaria POST 403 `forbidden_role` ✅;
  profissional GET 200 ✅; profissional POST 403 ✅; sem stack trace ✅.
- **Bloco 5 (links):** link → ok ✅; list professionals ✅; re-link idempotente ✅; deactivate link 200 ✅.
- **Bloco 6 (Agenda+service_id):** appointment com serviço vinculado → 201 ✅; `service_id` no response ✅;
  serviço não vinculado → 400 `service_not_available_for_professional` ✅.
- **Bloco 7 (Financeiro+service_id):** cobrança com service_id → 201 ✅;
  service_id diferente do agendamento → 400 ✅; sem amount_cents → 400 (price_cents não autopropaga) ✅;
  cobrança sem service_id → 201 ✅.

### Frontend sanity greps (PASS)

```bash
# Nenhum limit: 200
grep -rn "limit: 200" frontend/src/  # → 0 ocorrências

# TUSS/CBHPM só em comentários
grep -n "TUSS\|CBHPM" frontend/src/components/ServicesPanel.tsx  # → apenas linhas //

# isError guard no empty-state
grep -n "isError" frontend/src/components/ServicesPanel.tsx
# → linha com !listQuery.isError na condição do empty-state

# ServicesPanel na aba Serviços (sem ownerOnly)
grep -n "servicos\|ServicesPanel" frontend/src/views/Dashboard.tsx
# → { key: 'servicos', label: 'Serviços', icon: Briefcase }  (sem ownerOnly)
```

---

## Convênios — Sprint 4.7B (Backend Convênios v0.1)

> Smoke executado em 2026-05-27. 47/47 PASS. Dados sintéticos limpos após os testes.

### Smoke tests 47/47 PASS

| # | Bloco | Cenário | Resultado |
|---|-------|---------|-----------|
| 1 | Auth/anon | GET /insurance/providers sem token → 401 | ✅ |
| 2 | Auth/anon | POST /insurance/providers sem token → 401 | ✅ |
| 3 | Auth/anon | GET /patients/:id/insurances sem token → 401 | ✅ |
| 4 | Auth/anon | POST /patients/:id/insurances sem token → 401 | ✅ |
| 5 | Admin_sistema | GET /insurance/providers como admin_sistema → 403 no_clinic_context | ✅ |
| 6 | Admin_sistema | POST /insurance/providers como admin_sistema → 403 no_clinic_context | ✅ |
| 7 | CRUD providers | POST → 201 + id + name + active=true | ✅ |
| 8 | CRUD providers | GET list → 200 + array com provider criado | ✅ |
| 9 | CRUD providers | GET :id → 200 + campos completos | ✅ |
| 10 | CRUD providers | PATCH :id → 200 + campos atualizados | ✅ |
| 11 | CRUD providers | PATCH :id/status (deactivate) → 200 + active=false | ✅ |
| 12 | CRUD plans | POST → 201 + id + provider_id | ✅ |
| 13 | CRUD plans | GET list (filtro provider_id) → 200 + plano correto | ✅ |
| 14 | CRUD plans | GET :id → 200 | ✅ |
| 15 | CRUD plans | PATCH :id → 200 | ✅ |
| 16 | CRUD plans | PATCH :id/status → 200 + active=false | ✅ |
| 17 | CRUD service-prices | POST → 201 + id + reference_price_cents | ✅ |
| 18 | CRUD service-prices | GET list (filtros) → 200 + item correto | ✅ |
| 19 | CRUD service-prices | GET :id → 200 | ✅ |
| 20 | CRUD service-prices | PATCH :id → 200 | ✅ |
| 21 | CRUD service-prices | PATCH :id/status → 200 + active=false | ✅ |
| 22 | Permissões secretaria | GET /insurance/providers → 200 (leitura OK) | ✅ |
| 23 | Permissões secretaria | POST /insurance/providers → 403 forbidden_role | ✅ |
| 24 | Permissões secretaria | POST /patients/:id/insurances → 201 (escrita OK) | ✅ |
| 25 | Permissões secretaria | POST /insurance/plans → 403 forbidden_role | ✅ |
| 26 | Profissional bloqueado | GET /insurance/providers → 403 | ✅ |
| 27 | Profissional bloqueado | GET /insurance/plans → 403 | ✅ |
| 28 | Profissional bloqueado | GET /patients/:id/insurances → 403 | ✅ |
| 29 | Profissional bloqueado | POST /patients/:id/insurances → 403 | ✅ |
| 30 | PII mascarado em list | GET /patients/:id/insurances → member_number mascarado (****1234) | ✅ |
| 31 | PII raw em detail | GET /patients/:id/insurances/:id → member_number completo | ✅ |
| 32 | PII holder_name | holder_name ausente em audit_logs | ✅ |
| 33 | payer_type private | POST /financial/charges com payer_type=private → 201; campos convênio rejeitados | ✅ |
| 34 | payer_type insurance | POST /financial/charges com payer_type=insurance + patient_insurance_id → 201 | ✅ |
| 35 | payer_type insurance | POST /financial/charges com payer_type=insurance sem patient_insurance_id → 400 | ✅ |
| 36 | payer_type mixed | POST com mixed + copay + insurance = amount_cents → 201 | ✅ |
| 37 | payer_type mixed | POST com mixed + copay + insurance ≠ amount_cents → 400 | ✅ |
| 38 | audit sem PII (provider) | audit_log insurance.provider.create → sem name, sem PII | ✅ |
| 39 | audit sem PII (plan) | audit_log insurance.plan.create → sem name | ✅ |
| 40 | audit sem PII (patient) | audit_log insurance.patient.create → sem member_number, sem holder_name | ✅ |
| 41 | audit sem PII (price) | audit_log insurance.service_price.create → sem valor | ✅ |
| 42 | audit sem PII (financial) | audit_log financial.charge.create com payer_type → sem PII | ✅ |
| 43 | audit sem PII (log grep) | grep member_number/holder_name em logs → 0 ocorrências | ✅ |
| 44 | Cross-tenant provider | GET /insurance/providers/:id de outra clínica → 404 | ✅ |
| 45 | Cross-tenant patient_ins | GET /patients/:id/insurances de outra clínica → 404 | ✅ |
| 46 | UUID inválido | GET /insurance/providers/not-a-uuid → 400 | ✅ |
| 47 | reference_price não auto-popula | POST /financial/charges sem amount_cents + service_price existente → 400 (amount_cents obrigatório) | ✅ |

### Sanity checks (código)

```bash
# Sem auto-propagação de reference_price_cents para amount_cents
grep -n "reference_price_cents" backend/src/services/financialChargeService.ts  # → 0 ocorrências

# member_number e holder_name na lista de redação do logger
grep -n "member_number\|holder_name" backend/src/config/logger.ts  # → presente em redactKeys

# Audit sem PII de convênio
grep -n "member_number\|holder_name\|nome\|name" backend/src/services/insuranceService.ts \
  | grep -i "audit"  # → 0 ocorrências com dados pessoais
```

---

## Convênios — Sprint 4.7C (Frontend Convênios v0.1)

> Frontend smoke visual + sanity greps. Executar após `pnpm --filter frontend dev` estar rodando.

### Sanity greps (código)

```bash
# member_number raw nunca em lista — só mascarado
grep -n "member_number[^_]" frontend/src/components/InsurancePanel.tsx | grep -v "masked\|raw\|detail\|getPatient\|setRaw\|rawMember\|member_number_masked\|//\|member_number:"
# → 0 ocorrências de exposição acidental

# member_number_masked usado na lista
grep -n "member_number_masked" frontend/src/components/InsurancePanel.tsx
# → presente na renderização da lista de carteirinhas

# cancelEdit limpa rawMemberNumber
grep -n "setRawMemberNumber\|rawMemberNumber" frontend/src/components/InsurancePanel.tsx
# → setRawMemberNumber('') presente no cancelEdit e no clearCreateForm

# Sem PII em console.log
grep -n "console\." frontend/src/components/InsurancePanel.tsx  # → 0 ocorrências

# Sem localStorage/sessionStorage
grep -rn "localStorage\|sessionStorage" frontend/src/components/InsurancePanel.tsx  # → 0

# reference_price_cents nunca auto-popula amount_cents
grep -n "reference_price_cents" frontend/src/components/InsurancePanel.tsx | grep -v "//\|label\|hint\|display\|render\|sectionHint\|nota"
# → apenas referências visuais (label/display), nunca atribuído a amount_cents

# payer_type no FinancialPanel
grep -n "payerType\|payer_type" frontend/src/components/FinancialPanel.tsx | head -20
# → presente em NewChargeForm e EditChargeForm

# aba convenios no Dashboard
grep -n "convenios\|HeartHandshake\|InsurancePanel" frontend/src/views/Dashboard.tsx
# → { key: 'convenios', label: 'Convênios', icon: HeartHandshake } + InsurancePanel import + render
```

### Checklist de validação visual (manual)

| # | Cenário | Esperado |
|---|---------|---------|
| 1 | Owner acessa aba Convênios | Painel carrega; seções Operadoras, Planos, Preços, Carteirinhas visíveis |
| 2 | Owner cria operadora | POST bem-sucedido; item aparece na lista |
| 3 | Owner cria plano para a operadora | POST bem-sucedido; plano aparece com filtro por operadora |
| 4 | Owner cria preço de serviço × operadora | POST bem-sucedido; reference_price_cents visível como referência |
| 5 | Owner adiciona carteirinha a paciente | POST bem-sucedido; `member_number` visível mascarado na lista |
| 6 | Owner abre edição da carteirinha | Raw `member_number` aparece no campo; `holder_name` pré-preenchido |
| 7 | Owner cancela edição da carteirinha | Campos PII limpos; lista volta a mostrar mascarado |
| 8 | Secretaria lê Convênios | Lista operadoras/planos/preços: 200; botões de criação ocultos |
| 9 | Secretaria adiciona carteirinha | POST bem-sucedido (escrita liberada para secretaria) |
| 10 | Profissional acessa aba Convênios | Card "Acesso restrito" exibido; sem dados expostos |
| 11 | Carteirinha vencida | Chip vermelho "Vencida" ao lado da data |
| 12 | Financeiro → Nova cobrança com Convênio | Select de pagador aparece; ao escolher "Convênio", seletor de carteirinha aparece |
| 13 | Financeiro → Nova cobrança mista | Campos "Valor particular" e "Valor convênio" aparecem |
| 14 | Mixed com soma errada | Erro visual "Particular + convênio (R$ X,XX) deve ser igual ao valor total" |
| 15 | Mixed com soma correta | Cobrança criada com sucesso; payer_type=mixed gravado |
| 16 | Edição de cobrança com payer_type existente | Estado inicial carregado corretamente (private/insurance/mixed) |

---

## Convênios — Sprint 4.7D (QA/Hardening + UX Polish)

> Security review por agents. Checks de regressão frontend. Visual manual esperado.

### Security greps (PASS)

```bash
# holder_name não aparece em list view — só em edit
grep -n "holder_name" frontend/src/components/InsurancePanel.tsx | grep -v "edit\|Edit\|new\|New\|create\|Create\|form\|Form\|setEdit\|setNew\|update\|Update\|state\|State\|payload\|Payload\|//\|holder_name_\|holder_name:"
# → apenas referências dentro de formulários de edição/criação

# canWrite não hardcoded
grep -n "canWrite" frontend/src/components/InsurancePanel.tsx
# → canWrite={canWriteCards} onde canWriteCards = isOwner || papel === 'secretaria'

# bug paciente corrigido
grep -n "setPatientInsuranceId" frontend/src/components/FinancialPanel.tsx
# → presente no onChange do select de paciente em NewChargeForm

# PayerBadge presente na lista e detalhe
grep -n "PayerBadge" frontend/src/components/FinancialPanel.tsx
# → 2+ ocorrências (lista + detalhe)

# MarkPaidModal recebe payerType
grep -n "payerType\|payer_type" frontend/src/components/FinancialPanel.tsx | grep "MarkPaid"
# → payerType={...} nos props

# subtabs no InsurancePanel
grep -n "tabBar\|tabBtn\|tabContent\|activeTab" frontend/src/components/InsurancePanel.tsx | head -10
# → presentes no main panel

# footer atualizado
grep -n "Clinic OS\|MVP administrativo" frontend/src/views/Dashboard.tsx
# → "ClinicBridge · Clinic OS" (sem "MVP administrativo")
```

### Checklist de validação visual (manual — 4.7D)

| # | Cenário | Esperado |
|---|---------|---------|
| 1 | Aba Convênios abre | Tab "Carteirinhas dos pacientes" ativa por default |
| 2 | Tab "Convênios aceitos" | Operadoras + Planos visíveis no mesmo painel |
| 3 | Tab "Preços de referência" | Banner "nunca preenchido automaticamente" + lista de preços |
| 4 | Secretaria abre tab Carteirinhas | Botões "Registrar carteirinha" e editar visíveis |
| 5 | Secretaria tenta criar operadora | Botão "Nova operadora" ausente na tab "Convênios aceitos" |
| 6 | Carteirinha na lista | `member_number` mascarado · holder_name **não aparece** na lista |
| 7 | Abre edição de carteirinha | holder_name aparece pré-preenchido no campo de edição |
| 8 | Cancela edição | holder_name sumido do estado; lista volta sem ele |
| 9 | Nova cobrança: seleciona paciente A, convênio X; troca para paciente B | Campo de carteirinha reset (sem carteirinha do paciente A pré-selecionada) |
| 10 | Lista de cobranças | Coluna "Pagador" visível: Particular / Convênio / Misto / — |
| 11 | Detalhe de cobrança com convênio | Meta "Pagador: Convênio" visível |
| 12 | Detalhe de cobrança mista | "Pagador: Misto" + breakdown "(R$ X particular + R$ Y convênio)" |
| 13 | "Marcar como pago" em cobrança particular | Modal: "Confirmar recebimento", método default Pix |
| 14 | "Marcar como pago" em cobrança convênio | Título: "Registrar recebimento do convênio"; nota azul; método default Transferência |
| 15 | "Marcar como pago" em cobrança mista | Título: "Confirmar recebimento misto"; nota amarela com breakdown; aviso v0.1 |
| 16 | Footer do Dashboard | "ClinicBridge · Clinic OS" (sem "MVP administrativo") |

---

## Sprint 4.8B — Estoque v0.1 (Backend)

> Smoke executado em 2026-05-27 via Python (`/tmp/smoke_4_8b.py`).
> **51/51 PASS.** Dados sintéticos limpos após os testes (item soft-deletado; movimentos append-only).
> Rate limit auth em Redis — limpar `clinicbridge:ratelimit:auth:*` antes de reexecutar
> se o limite de 20 req/15min for atingido.

### Smoke tests 51/51 PASS

**A — Auth / Permissões (8 testes)**
- sem token GET /inventory/items → 401 ✅
- sem token POST /inventory/items → 401 ✅
- admin_sistema GET /inventory/items → 403 ✅
- owner GET /inventory/items → 200 ✅
- secretaria GET /inventory/items → 200 ✅
- gestor GET /inventory/items → 200 ✅
- profissional_clinico GET /inventory/items → 403 ✅ (bloqueado via grants)
- profissional_clinico POST movement → 403 ✅

**B — CRUD Item owner (9 testes)**
- POST /inventory/items → 201 ✅
- GET /inventory/items list → 200 ✅
- GET /inventory/items/:id detail → 200 ✅
- PATCH metadata (minimum_quantity=10) → 200 ✅
- PATCH metadata não altera current_quantity (=0) ✅
- POST duplicado exato → 409 ✅
- POST duplicado case-insensitive → 409 ✅
- PATCH /status desativa → active=false ✅
- PATCH /status reativa → active=true ✅

**C — Secretaria (5 testes)**
- GET /inventory/items → 200 ✅
- POST movement entry → 201 ✅
- POST /inventory/items (criar item) → 403 ✅
- PATCH metadata → 403 ✅
- PATCH /status → 403 ✅

**D — Movimentos / Quantidade (8 testes)**
- entry +10 aumenta qty (=10) ✅
- exit -3 reduz qty (=7) ✅
- loss -2 reduz qty (=5) ✅
- adjustment +5 → 201 ✅
- adjustment -3 → 201 ✅
- GET /items/:id/movements (count ≥ 5) ✅
- GET /inventory/movements lista geral → 200 ✅
- low_stock filter retorna item abaixo do mínimo ✅

**E — Validações (17 testes)**
- name vazio → 400 ✅
- name whitespace-only → 400 ✅
- unit vazio → 400 ✅
- unit ausente → 400 ✅
- notes > 500 chars → 400 ✅
- reason > 300 chars → 400 ✅
- quantity_delta=0 → 400 ✅
- entry negativo → 400 ✅
- exit positivo → 400 ✅
- loss positivo → 400 ✅
- exit acima do estoque → 409 `inventory_quantity_insufficient` ✅
- adjustment negativo acima do estoque → 409 `inventory_quantity_insufficient` ✅
- movement_type inválido → 400 ✅
- movimento em item inativo → 400 `inventory_item_inactive` ✅
- limit > 100 → 400 ✅
- UUID inválido → 400 ✅
- UUID inexistente → 404 ✅

**F — Audit / PII (3 testes)**
- sem campos proibidos (patient_id/encounter_id/diagnosis/prescription) na resposta de item ✅
- sem campos proibidos na resposta de movimentos ✅
- secretaria pode ver movimentos (GET /items/:id/movements) ✅

**G — Cleanup (1 teste)**
- item smoke desativado (soft-delete) ✅
- movimentos persistem por design (append-only, sem delete)

### Invariantes verificados

- `current_quantity` jamais alterado por PATCH metadata — verificado (B5).
- `exit`/`loss` com quantidade negativa bloqueados — verificado (E8, E10).
- `entry` negativo bloqueado — verificado (E8).
- `adjustment` sinal livre mas ≠ 0 — verificado (D4, D5, E7).
- Estoque negativo bloqueado → 409 `inventory_quantity_insufficient` — verificado (E11, E12).
- Movimento em item inativo bloqueado → 400 `inventory_item_inactive` — verificado (E14).
- profissional_clinico bloqueado em ALL endpoints (não só reads) — verificado (A7, A8).
