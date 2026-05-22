#!/usr/bin/env bash
# ClinicBridge — check-backup-env.sh
# Verifica se o ambiente local está pronto para o backup/restore com Restic.
# LOCAL/DEV ONLY. Read-only: não cria backup, não toca no banco, não imprime senha.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Config (defaults seguros; sobrescreva via env, nunca com senha em arquivo) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
RESTORE_DB="${RESTORE_DB:-clinicbridge_restore_test}"
BACKUP_WORKDIR="${BACKUP_WORKDIR:-backups/work}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-backups/restic-repo}"
UPLOAD_DIR="${UPLOAD_DIR:-storage/uploads}"

ok=0; warn=0; err=0
say()  { printf '  %s\n' "$*"; }
pass() { printf '  [ ok ]  %s\n' "$*"; ok=$((ok+1)); }
note() { printf '  [warn]  %s\n' "$*"; warn=$((warn+1)); }
fail() { printf '  [FAIL]  %s\n' "$*"; err=$((err+1)); }

echo "== ClinicBridge :: check-backup-env (LOCAL/DEV) =="

# 1) restic
if command -v restic >/dev/null 2>&1; then
  pass "restic: $(restic version 2>/dev/null | head -n1)"
else
  fail "restic não encontrado. Instale: sudo apt update && sudo apt install -y restic"
fi

# 2) docker + container Postgres
if command -v docker >/dev/null 2>&1; then
  pass "docker disponível"
  if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    pass "container Postgres '$POSTGRES_CONTAINER' está rodando"
    # 3) pg_dump / pg_restore dentro do container
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
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      pass "Postgres aceita conexões (db '$POSTGRES_DB')"
    else
      fail "Postgres não está pronto (pg_isready falhou)"
    fi
  else
    fail "container '$POSTGRES_CONTAINER' não está rodando. Suba com: docker compose up -d postgres"
  fi
else
  fail "docker não encontrado neste shell (ative a WSL integration do Docker Desktop)"
fi

# 4) RESTIC_PASSWORD (nunca imprimir o valor)
if [ -n "${RESTIC_PASSWORD:-}" ]; then
  pass "RESTIC_PASSWORD está definida no ambiente (valor não exibido)"
else
  fail "RESTIC_PASSWORD não definida. Exporte no shell (NÃO em arquivo): export RESTIC_PASSWORD='dev-local-only-change-me'"
fi

# 5) RESTIC_REPOSITORY
say "RESTIC_REPOSITORY = $RESTIC_REPOSITORY (default local; sem offsite)"
if [ -d "$RESTIC_REPOSITORY" ]; then
  pass "repositório Restic já existe em '$RESTIC_REPOSITORY'"
else
  note "repositório Restic ainda não existe — backup-local-restic.sh fará 'restic init'"
fi

# 6) .gitignore cobre backups/dumps/restic
check_ignored() {
  if git -C "$REPO_ROOT" check-ignore -q -- "$1"; then
    pass ".gitignore ignora '$1'"
  else
    fail ".gitignore NÃO ignora '$1' (risco de versionar dado sensível)"
  fi
}
check_ignored "backups/work/exemplo.dump"
check_ignored "backups/restic-repo/config"
check_ignored "dump-exemplo.sql"
check_ignored "exemplo.tar.gz"

# 7) Resumo (sem segredos)
echo "== resumo =="
say "POSTGRES_CONTAINER = $POSTGRES_CONTAINER"
say "POSTGRES_DB        = $POSTGRES_DB"
say "RESTORE_DB         = $RESTORE_DB"
say "BACKUP_WORKDIR     = $BACKUP_WORKDIR"
say "RESTIC_REPOSITORY  = $RESTIC_REPOSITORY"
say "UPLOAD_DIR         = $UPLOAD_DIR ($( [ -d "$UPLOAD_DIR" ] && echo 'existe' || echo 'ausente — será ignorado no backup'))"
say "RESTIC_PASSWORD    = $( [ -n "${RESTIC_PASSWORD:-}" ] && echo 'definida (oculta)' || echo 'NÃO definida')"
echo "== ok=$ok warn=$warn fail=$err =="

if [ "$err" -gt 0 ]; then
  echo "Ambiente NÃO está pronto. Resolva os [FAIL] acima." >&2
  exit 1
fi
echo "Ambiente pronto para backup/restore local."
