#!/usr/bin/env bash
# ClinicBridge — check-backup-offsite-env.sh
# Pré-flight do backup OFFSITE com Restic + S3-compatible. Sprint 3.40.
# Read-only: não conecta no S3 sem --probe, não cria backup, não imprime senhas.
# Falha-rápido se qualquer requisito obrigatório estiver ausente.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Flags ---
PROBE=false
SHOW_HELP=false
for arg in "$@"; do
  case "$arg" in
    --probe)  PROBE=true ;;
    -h|--help) SHOW_HELP=true ;;
    *) echo "[warn] flag desconhecida: $arg" >&2 ;;
  esac
done

if $SHOW_HELP; then
  cat <<'EOF'
check-backup-offsite-env.sh — pré-flight do backup offsite Restic + S3.

Uso:
  ./scripts/check-backup-offsite-env.sh           # checagens locais (sem rede)
  ./scripts/check-backup-offsite-env.sh --probe   # também tenta 'restic snapshots' (rede)
  ./scripts/check-backup-offsite-env.sh --help    # esta ajuda

Variáveis lidas (nenhum valor sensível é impresso):
  RESTIC_REPOSITORY     ex.: s3:s3.amazonaws.com/clinicbridge-backups-prod
  RESTIC_PASSWORD       senha do repo (obrigatória; nunca em arquivo versionado)
  RESTIC_CACHE_DIR      opcional; default ~/.cache/restic
  AWS_ACCESS_KEY_ID     opcional se o host tiver IAM role / instance profile
  AWS_SECRET_ACCESS_KEY opcional (idem); nunca impresso
  AWS_SESSION_TOKEN     opcional (STS / SSO)
  AWS_DEFAULT_REGION    recomendado (ex.: sa-east-1)
EOF
  exit 0
fi

# --- Config (defaults seguros) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
RESTORE_DB="${RESTORE_DB:-clinicbridge_restore_offsite_test}"
UPLOAD_DIR="${UPLOAD_DIR:-storage/uploads}"

ok=0; warn=0; err=0
say()  { printf '  %s\n' "$*"; }
pass() { printf '  [ ok ]  %s\n' "$*"; ok=$((ok+1)); }
note() { printf '  [warn]  %s\n' "$*"; warn=$((warn+1)); }
fail() { printf '  [FAIL]  %s\n' "$*"; err=$((err+1)); }

echo "== ClinicBridge :: check-backup-offsite-env (OFFSITE / Restic + S3) =="

# 1) restic
if command -v restic >/dev/null 2>&1; then
  pass "restic: $(restic version 2>/dev/null | head -n1)"
else
  fail "restic não encontrado. Instale: sudo apt update && sudo apt install -y restic"
fi

# 2) docker + container Postgres (para o pg_dump no backup real)
if command -v docker >/dev/null 2>&1; then
  pass "docker disponível"
  if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    pass "container Postgres '$POSTGRES_CONTAINER' está rodando"
    if docker exec "$POSTGRES_CONTAINER" pg_dump --version >/dev/null 2>&1; then
      pass "pg_dump: $(docker exec "$POSTGRES_CONTAINER" pg_dump --version 2>/dev/null)"
    else
      fail "pg_dump indisponível no container"
    fi
    if docker exec "$POSTGRES_CONTAINER" pg_restore --version >/dev/null 2>&1; then
      pass "pg_restore: $(docker exec "$POSTGRES_CONTAINER" pg_restore --version 2>/dev/null)"
    else
      fail "pg_restore indisponível no container"
    fi
  else
    note "container '$POSTGRES_CONTAINER' não está rodando (ok para checagem só de env; backup real exige Postgres de pé)"
  fi
else
  fail "docker não encontrado neste shell"
fi

# 3) RESTIC_PASSWORD (nunca imprimir valor)
if [ -n "${RESTIC_PASSWORD:-}" ]; then
  pass "RESTIC_PASSWORD definida no ambiente (valor não exibido)"
else
  fail "RESTIC_PASSWORD não definida. Em produção, ler de SSM Parameter Store /clinicbridge/<env>/restic_password"
fi

# 4) RESTIC_REPOSITORY — obrigatória e PRECISA começar com s3:
if [ -z "${RESTIC_REPOSITORY:-}" ]; then
  fail "RESTIC_REPOSITORY não definida. Exemplo: export RESTIC_REPOSITORY='s3:s3.amazonaws.com/clinicbridge-backups-prod'"
else
  case "$RESTIC_REPOSITORY" in
    s3:*|S3:*)
      pass "RESTIC_REPOSITORY usa S3-compatible (valor não exibido por segurança)"
      ;;
    /*|./*|backups/*|backup/*)
      fail "RESTIC_REPOSITORY parece ser caminho LOCAL — este script é só para OFFSITE. Use scripts/backup-local-restic.sh."
      ;;
    *)
      note "RESTIC_REPOSITORY não começa com 's3:' — confirme manualmente que é um backend remoto cifrado."
      ;;
  esac
fi

# 5) Credenciais AWS — aceitar env vars OU presumir IAM role/instance profile
HAS_KEY=false
HAS_SECRET=false
[ -n "${AWS_ACCESS_KEY_ID:-}" ] && HAS_KEY=true
[ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && HAS_SECRET=true

if $HAS_KEY && $HAS_SECRET; then
  pass "AWS_ACCESS_KEY_ID/SECRET definidos no ambiente (valores não exibidos)"
  [ -n "${AWS_SESSION_TOKEN:-}" ] && pass "AWS_SESSION_TOKEN definido (credenciais temporárias STS/SSO)"
elif $HAS_KEY || $HAS_SECRET; then
  fail "Apenas uma de AWS_ACCESS_KEY_ID/SECRET está definida — defina ambas ou nenhuma (e use IAM role)."
else
  note "AWS_ACCESS_KEY_ID/SECRET não definidos — ok se host usa IAM role/instance profile (recomendado em EC2/ECS)."
fi

if [ -n "${AWS_DEFAULT_REGION:-}" ]; then
  pass "AWS_DEFAULT_REGION = $AWS_DEFAULT_REGION"
else
  note "AWS_DEFAULT_REGION não definida — recomendado setar (ex.: sa-east-1) para evitar latência/erros de region."
fi

# 6) .gitignore cobre artefatos offsite
check_ignored() {
  if git -C "$REPO_ROOT" check-ignore -q -- "$1"; then
    pass ".gitignore ignora '$1'"
  else
    fail ".gitignore NÃO ignora '$1' (risco de versionar dado sensível)"
  fi
}
check_ignored "backups/work/offsite-exemplo.dump"
check_ignored "backups/restore-offsite-work/latest/foo"
check_ignored "dump-offsite.sql"

# 7) Probe opcional: tentar listar snapshots (rede!)
if $PROBE; then
  if [ -n "${RESTIC_PASSWORD:-}" ] && [ -n "${RESTIC_REPOSITORY:-}" ]; then
    echo "[info] --probe: tentando 'restic snapshots --compact' (consome rede; sem alteração)"
    if restic snapshots --compact >/dev/null 2>&1; then
      pass "restic snapshots respondeu — repo acessível e senha correta"
    else
      fail "restic snapshots falhou — verifique RESTIC_REPOSITORY, credenciais AWS, bucket/IAM e RESTIC_PASSWORD"
    fi
  else
    note "--probe ignorado: RESTIC_REPOSITORY ou RESTIC_PASSWORD ausentes"
  fi
fi

# 8) Resumo (sem segredos)
echo "== resumo =="
say "POSTGRES_CONTAINER = $POSTGRES_CONTAINER"
say "POSTGRES_DB        = $POSTGRES_DB (intocável no restore drill)"
say "RESTORE_DB         = $RESTORE_DB (banco separado para drill offsite)"
say "UPLOAD_DIR         = $UPLOAD_DIR ($( [ -d "$UPLOAD_DIR" ] && echo 'existe' || echo 'ausente — backup só do banco' ))"
say "RESTIC_REPOSITORY  = $( [ -n "${RESTIC_REPOSITORY:-}" ] && echo 'definida (valor não exibido)' || echo 'NÃO definida' )"
say "RESTIC_PASSWORD    = $( [ -n "${RESTIC_PASSWORD:-}" ] && echo 'definida (oculta)' || echo 'NÃO definida' )"
say "AWS creds          = $( ($HAS_KEY && $HAS_SECRET) && echo 'env vars (ocultas)' || echo 'IAM role / default chain (recomendado em EC2)' )"
say "AWS_DEFAULT_REGION = ${AWS_DEFAULT_REGION:-'<unset>'}"
echo "== ok=$ok warn=$warn fail=$err =="

if [ "$err" -gt 0 ]; then
  echo "Ambiente NÃO está pronto para backup offsite. Resolva os [FAIL] acima." >&2
  exit 1
fi
echo "Ambiente pronto para backup offsite (rede ainda não foi validada; use --probe para checar)."
