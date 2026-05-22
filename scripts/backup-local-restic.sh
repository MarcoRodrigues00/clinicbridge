#!/usr/bin/env bash
# ClinicBridge — backup-local-restic.sh
# Backup LOCAL/DEV do Postgres (pg_dump -Fc) + storage/uploads para um
# repositório Restic LOCAL e cifrado. Sem offsite, sem AWS/S3.
# Read-only quanto ao banco principal (apenas pg_dump). Nunca grava senha.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Config (defaults seguros; sobrescreva via env) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
BACKUP_WORKDIR="${BACKUP_WORKDIR:-backups/work}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-backups/restic-repo}"
UPLOAD_DIR="${UPLOAD_DIR:-storage/uploads}"
# Manter o dump temporário por padrão (facilita debug local; já é git-ignored).
CLEAN_BACKUP_WORKDIR="${CLEAN_BACKUP_WORKDIR:-false}"
export RESTIC_REPOSITORY

echo "== ClinicBridge :: backup-local-restic (LOCAL/DEV, sem offsite) =="

# 1) RESTIC_PASSWORD obrigatória (nunca vem de arquivo versionado)
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD não definida. Exporte no shell: export RESTIC_PASSWORD='dev-local-only-change-me'}"

# Pré-checagens rápidas
command -v restic >/dev/null 2>&1 || { echo "restic não instalado. sudo apt install -y restic" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker não disponível neste shell." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
  || { echo "container '$POSTGRES_CONTAINER' não está rodando. docker compose up -d postgres" >&2; exit 1; }

# 2) Criar workdir e pasta-mãe do repo
mkdir -p "$BACKUP_WORKDIR"
mkdir -p "$(dirname "$RESTIC_REPOSITORY")"

# 3) Inicializar o repositório Restic se necessário (idempotente)
if restic -r "$RESTIC_REPOSITORY" cat config >/dev/null 2>&1; then
  echo "[info] repositório Restic já inicializado em '$RESTIC_REPOSITORY'"
else
  echo "[info] inicializando repositório Restic em '$RESTIC_REPOSITORY' ..."
  restic -r "$RESTIC_REPOSITORY" init
fi

# 4) Dump do Postgres (custom format) com timestamp, gravado no host
TS="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_WORKDIR/clinicbridge-${TS}.dump"
echo "[info] gerando dump do banco '$POSTGRES_DB' -> $DUMP_FILE"
# pg_dump roda DENTRO do container; o arquivo .dump é escrito no host via stdout.
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DUMP_FILE"
if [ ! -s "$DUMP_FILE" ]; then
  echo "[FAIL] dump vazio — abortando." >&2
  exit 1
fi
echo "[info] dump gerado ($(du -h "$DUMP_FILE" | cut -f1))"

# 5) Alvos do backup: o dump + storage/uploads (se existir)
BACKUP_TARGETS=("$DUMP_FILE")
if [ -d "$UPLOAD_DIR" ]; then
  echo "[info] incluindo storage de uploads: $UPLOAD_DIR"
  BACKUP_TARGETS+=("$UPLOAD_DIR")
else
  echo "[warn] '$UPLOAD_DIR' não existe neste ambiente — backup só do banco (sem arquivos físicos)."
fi

# 6) Backup no Restic (com tags para facilitar a localização)
echo "[info] enviando snapshot para o repositório Restic ..."
restic -r "$RESTIC_REPOSITORY" backup \
  --tag clinicbridge --tag local-dev --tag "ts:${TS}" \
  "${BACKUP_TARGETS[@]}"

# 7) Listar snapshots
echo "== snapshots =="
restic -r "$RESTIC_REPOSITORY" snapshots --compact || true
LATEST_ID="$(restic -r "$RESTIC_REPOSITORY" snapshots latest --json 2>/dev/null \
  | grep -o '"short_id":"[a-f0-9]*"' | tail -n1 | cut -d'"' -f4 || true)"

# 8) Limpeza opcional do workdir
if [ "$CLEAN_BACKUP_WORKDIR" = "true" ]; then
  echo "[info] CLEAN_BACKUP_WORKDIR=true -> removendo dump temporário $DUMP_FILE"
  rm -f "$DUMP_FILE"
fi

# 9/10) Resumo + aviso de não versionar
echo "== resumo do backup =="
echo "  snapshot (short id) : ${LATEST_ID:-ver lista acima}"
echo "  dump temporário     : $DUMP_FILE $( [ -f "$DUMP_FILE" ] && echo '(mantido)' || echo '(removido)')"
echo "  repositório Restic  : $RESTIC_REPOSITORY"
echo "  AVISO: NÃO commitar '$BACKUP_WORKDIR' nem '$RESTIC_REPOSITORY' (já ignorados pelo .gitignore)."
echo "Backup local concluído."
