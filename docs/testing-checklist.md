# ClinicBridge — Checklist de Testes

> Consolidado na compactação de 2026-05-22 a partir das verificações das sprints
> (`docs/sprint-history.md`). Use como roteiro de smoke test / regressão local.
> Endpoints tenant-scoped exigem `Authorization: Bearer <token>` (de `/auth/login`).

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
