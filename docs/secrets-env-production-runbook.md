# ClinicBridge — Runbook de Secrets e Env de Produção

> **Sprint 3.39** (2026-05-24). Criado junto com os guards de boot em
> `backend/src/config/env.ts` (MFA_ENCRYPTION_KEY obrigatória em prod;
> FRONTEND_ORIGIN sem localhost/http em prod). Não configura recursos AWS reais.
>
> Relacionado: `.env.example` (fonte de verdade das variáveis), `docs/deploy-security-checklist.md`
> (checklist §15/§16), `docs/production-minimum-plan.md` (decisão AWS + SSM),
> `docs/dns-tls-staging-runbook.md` (TLS + DNS real).

---

## 0. Convenções e placeholders

```
<JWT_SECRET>          → saída de: openssl rand -hex 32   (64 hex chars)
<DB_PASS>             → senha forte do Postgres de produção
<DB_HOST>             → host do RDS ou IP interno da EC2 (nunca público)
<MFA_KEY>             → saída de: openssl rand -hex 32   (64 hex chars)
<REDIS_PASS>          → senha do Redis/ElastiCache de produção
<REDIS_HOST>          → endpoint interno do ElastiCache (nunca público)
```

Nunca usar os valores do `.env.example`. Nunca commitar `.env` real.
Nunca logar nenhuma dessas variáveis.

---

## 1. Variáveis por ambiente

### 1.1 Desenvolvimento local

Arquivo: `.env` (nunca commitado; baseado em `.env.example`).

```bash
NODE_ENV=development
JWT_SECRET=qualquer-string-de-dev-com-48-chars-no-minimo
MFA_ENCRYPTION_KEY=   # pode ficar vazio; o sistema usa JWT_SECRET como fallback
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://clinicbridge:change-me-locally@localhost:5432/clinicbridge
RATE_LIMIT_STORE=memory
# REDIS_URL não precisa ser setado em dev (memory store)
```

Guards de boot **não disparam** em desenvolvimento (NODE_ENV=development).
O fallback `JWT_SECRET → MFA_ENCRYPTION_KEY` funciona em dev/test para simplificar.

### 1.2 Staging

Ambiente com `NODE_ENV=production` (guards ativos). Injetar via variáveis de
ambiente do container ou SSM (ver §4).

```bash
NODE_ENV=production
BACKEND_PORT=3001
LOG_LEVEL=info

DATABASE_URL=postgresql://clinicbridge:<DB_PASS>@<DB_HOST>:5432/clinicbridge
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=1h
MFA_ENCRYPTION_KEY=<MFA_KEY>    # obrigatório em produção
FRONTEND_ORIGIN=https://staging.clinicbridge.com.br

TRUST_PROXY=1
RATE_LIMIT_STORE=redis
REDIS_URL=redis://:<REDIS_PASS>@<REDIS_HOST>:6379

UPLOAD_DIR=/data/uploads         # volume persistente
IMPORT_MAX_ROWS=100
# demais variáveis: usar defaults do .env.example
```

### 1.3 Produção

Idêntico ao staging, apenas com os valores de produção:

```bash
NODE_ENV=production
FRONTEND_ORIGIN=https://app.clinicbridge.com.br
DATABASE_URL=postgresql://clinicbridge:<DB_PASS>@<DB_HOST>:5432/clinicbridge
JWT_SECRET=<JWT_SECRET_PROD>
MFA_ENCRYPTION_KEY=<MFA_KEY_PROD>
TRUST_PROXY=1
RATE_LIMIT_STORE=redis
REDIS_URL=redis://:<REDIS_PASS_PROD>@<REDIS_HOST_PROD>:6379
UPLOAD_DIR=/data/uploads
```

---

## 2. Geração de secrets

### JWT_SECRET

```bash
openssl rand -hex 32
# → 64 chars hex, ~256 bits de entropia
# Requisito: ≥ 48 chars e não pode conter "replace-with" ou "change-me"
```

### MFA_ENCRYPTION_KEY

```bash
openssl rand -hex 32
# → 64 chars hex
# Requisito em produção: ≥ 32 chars (guard em config/env.ts)
# AVISO: mudar esta chave invalida TODOS os secrets TOTP armazenados.
# Todos os usuários com MFA ativo precisarão se re-inscrever.
# Planejar rotação em ADR dedicada antes de trocar em produção.
```

### RESTIC_PASSWORD (backup)

```bash
openssl rand -base64 32
# NUNCA colocar no .env nem em arquivo commitado.
# Guardar no SSM Parameter Store como SecureString (ver §3).
# Perder esta senha = backup irrecuperável.
```

### DATABASE_URL / credenciais Postgres

- Gerar senha forte para o usuário `clinicbridge` no Postgres/RDS.
- Usar `openssl rand -base64 24` ou similar.
- O usuário deve ter apenas privilégios necessários (sem SUPERUSER, sem CREATEDB
  em produção).
- URL nunca é logada (o backend não loga DATABASE_URL).

### REDIS_URL

```bash
# Redis com autenticação (ElastiCache com AUTH token ou Redis standalone):
REDIS_URL=redis://:<REDIS_AUTH_TOKEN>@<REDIS_HOST>:6379
# Token gerado com: openssl rand -hex 32
```

---

## 3. AWS SSM Parameter Store — caminhos sugeridos

> **Não executar** `aws ssm put-parameter` agora — apenas documentação de
> caminhos. Executar quando a EC2/staging estiver provisionada.

### Estrutura de caminhos

```
/clinicbridge/staging/
  jwt_secret                  (SecureString)
  database_url                (SecureString)
  mfa_encryption_key          (SecureString)
  redis_url                   (SecureString)
  restic_password             (SecureString)

/clinicbridge/prod/
  jwt_secret                  (SecureString)
  database_url                (SecureString)
  mfa_encryption_key          (SecureString)
  redis_url                   (SecureString)
  restic_password             (SecureString)
```

### Comandos de referência (executar somente quando EC2 disponível)

```bash
# Colocar um secret (nunca passar o valor como argumento — usar stdin ou arquivo):
aws ssm put-parameter \
  --name "/clinicbridge/staging/jwt_secret" \
  --type "SecureString" \
  --value "$(cat /tmp/jwt_secret.txt)" \
  --description "JWT signing secret — staging" \
  --region sa-east-1

# Ler para verificar (retorna o valor cifrado; --with-decryption para decifrar):
aws ssm get-parameter \
  --name "/clinicbridge/staging/jwt_secret" \
  --with-decryption \
  --region sa-east-1
```

> **Segurança:** nunca passar o valor via `--value '...'` na linha de comando
> (o valor vai para o histórico do shell). Prefira `$(cat arquivo)` ou
> `--value file://path`.

### IAM mínimo (princípio do mínimo privilégio)

A role IAM da EC2 (instance profile) deve ter **apenas**:

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": "arn:aws:ssm:sa-east-1:<account-id>:parameter/clinicbridge/staging/*"
}
```

Para produção, substituir `staging` por `prod` e limitar a role a um path separado.
Nenhuma permissão de escrita na role da EC2 (escrita fica na role do operador local).

---

## 4. Injeção em runtime

### 4.1 Via script de bootstrap na EC2

Criar `scripts/inject-env-from-ssm.sh` (não commitado com valores reais):

```bash
#!/usr/bin/env bash
# Lê secrets do SSM e exporta como variáveis de ambiente para o container.
# Executar antes de `docker compose up` na EC2.
set -euo pipefail
REGION=sa-east-1
ENV_PATH=/clinicbridge/staging   # ou /prod

get_param() {
  aws ssm get-parameter \
    --name "${ENV_PATH}/$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text \
    --region "$REGION"
}

export JWT_SECRET="$(get_param jwt_secret)"
export DATABASE_URL="$(get_param database_url)"
export MFA_ENCRYPTION_KEY="$(get_param mfa_encryption_key)"
export REDIS_URL="$(get_param redis_url)"
```

Uso:
```bash
source scripts/inject-env-from-ssm.sh
docker compose --profile edge up -d
```

O script **não** salva valores em arquivo; as variáveis ficam na sessão do shell
e são passadas ao Compose via `environment:` herdado do shell.

### 4.2 Via docker-compose.yml `environment:` block

Adicionar ao bloco `environment:` do serviço `backend` no compose de produção
(não no compose local/dev):

```yaml
environment:
  NODE_ENV: production
  JWT_SECRET: "${JWT_SECRET}"
  DATABASE_URL: "${DATABASE_URL}"
  MFA_ENCRYPTION_KEY: "${MFA_ENCRYPTION_KEY}"
  REDIS_URL: "${REDIS_URL}"
  TRUST_PROXY: "1"
  RATE_LIMIT_STORE: redis
  FRONTEND_ORIGIN: "https://app.clinicbridge.com.br"
```

O Compose lerá as variáveis do ambiente do shell (injetadas pelo script do §4.1).
Nunca commitar um compose com valores reais hard-coded.

### 4.3 Via arquivo .env efêmero (alternativa simples para staging inicial)

```bash
# Na EC2, criar .env a partir do SSM — nunca commitar:
source scripts/inject-env-from-ssm.sh
cat > .env << EOF
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
MFA_ENCRYPTION_KEY=${MFA_ENCRYPTION_KEY}
REDIS_URL=${REDIS_URL}
TRUST_PROXY=1
RATE_LIMIT_STORE=redis
FRONTEND_ORIGIN=https://staging.clinicbridge.com.br
EOF
chmod 600 .env   # apenas o dono pode ler
```

Risco: o arquivo em disco vira superficie de ataque se a EC2 for comprometida.
Preferir §4.1 ou §4.2 quando possível.

---

## 5. Caveats de rotação

### JWT_SECRET

- Rodar o secret invalida **todos os tokens JWT ativos** (todos os usuários
  precisam fazer login novamente).
- Não há blacklist/refresh token no MVP — a rotação é disruptiva.
- Planejar uma janela de manutenção ou um período de superposição (dois secrets
  aceitos) em ADR dedicada antes de rotar em produção.
- Em staging: rotar sem impacto (sem usuários reais).

### MFA_ENCRYPTION_KEY

- Rotar esta chave invalida **todos os secrets TOTP armazenados** (todos os
  usuários com MFA ativo precisam se re-inscrever).
- O sistema não tem migração automática de re-cifra (a chave antiga não está
  disponível para re-cifrar com a nova).
- **Antes de rotar em produção:** abrir ADR dedicada cobrindo: migração de
  re-cifra, janela de suporte, comunicação com usuários.
- Em staging: ok rotar (sem usuários reais com MFA ativo persistente).

### DATABASE_URL / credenciais Postgres

- Rotação exige: gerar nova senha no Postgres/RDS, atualizar SSM, reiniciar
  containers com nova env, validar conectividade.
- Em RDS com Secrets Manager: rotação automática gerenciada (não configurado ainda).

### RESTIC_PASSWORD

- Rotar esta senha exige re-criptografar o repositório Restic inteiro.
- A senha antiga **nunca** deve ser descartada antes de confirmar que o novo
  repositório está completo e restaurável.
- Preferir não rotar; se necessário, planejar restore drill completo antes e
  depois.

---

## 6. Checklist de secrets antes do primeiro deploy real

```
[ ] JWT_SECRET gerado com openssl rand -hex 32 (≥ 64 chars)
[ ] MFA_ENCRYPTION_KEY gerado com openssl rand -hex 32 (≥ 64 chars)
[ ] DATABASE_URL com senha forte (sem "change-me-locally")
[ ] REDIS_URL com autenticação (token gerado com openssl rand -hex 32)
[ ] RESTIC_PASSWORD gerado e guardado SOMENTE no SSM (nunca em arquivo)
[ ] Todos os secrets armazenados no SSM Parameter Store como SecureString
[ ] IAM instance profile com permissão apenas de leitura no path correto
[ ] .env local não commitado (.gitignore cobre .env/.env.*)
[ ] Nenhum secret nos logs (pino redact + errorHandler genérico)
[ ] NODE_ENV=production ativo no container (Dockerfile já tem o default)
[ ] FRONTEND_ORIGIN=https://app.clinicbridge.com.br (sem localhost, sem http://)
[ ] pnpm --filter backend build executa sem erro de validação de env
[ ] Backend sobe e /health retorna {"status":"ok"} sem erros de boot
[ ] /health/ready retorna {"status":"ready","checks":{"database":"ok"}}
```

---

## 7. Referências

- `.env.example` — fonte de verdade de todas as variáveis e defaults
- `backend/src/config/env.ts` — validação Zod + guards de produção
- `backend/src/config/mfaCrypto.ts` — uso de MFA_ENCRYPTION_KEY (HKDF-SHA256)
- `docs/deploy-security-checklist.md` — checklist §15 (staging) + §16 (produção)
- `docs/production-minimum-plan.md` — arquitetura AWS, gaps P0/P1
- `docs/dns-tls-staging-runbook.md` — TLS real (Certbot), DNS Registro.br
- `docs/backup-restore-local-runbook.md` — RESTIC_PASSWORD (shell-only)
- `docs/adr/0004-deploy-security-baseline.md` — decisão de baseline de deploy
