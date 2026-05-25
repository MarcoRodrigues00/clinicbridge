#!/usr/bin/env bash
# ClinicBridge — backup-offsite-restic.sh
# Backup OFFSITE do Postgres (pg_dump -Fc) + storage/uploads para um repositório
# Restic em S3-compatible (AWS S3, Backblaze B2 via S3, MinIO, ...). Sprint 3.40.
# Read-only quanto ao banco principal (apenas pg_dump). Nunca grava/imprime senha.
# Hard guard: RESTIC_REPOSITORY DEVE começar com 's3:' (proteção contra repo local).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Flags ---
DRY_RUN=false
SHOW_HELP=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) SHOW_HELP=true ;;
    *) echo "[warn] flag desconhecida: $arg" >&2 ;;
  esac
done

if $SHOW_HELP; then
  cat <<'EOF'
backup-offsite-restic.sh — backup do Postgres + uploads para Restic em S3.

Uso:
  ./scripts/backup-offsite-restic.sh             # backup real (gera dump + envia)
  ./scripts/backup-offsite-restic.sh --dry-run   # checa env, gera dump, NÃO envia
  ./scripts/backup-offsite-restic.sh --help

Variáveis obrigatórias:
  RESTIC_REPOSITORY   ex.: s3:s3.amazonaws.com/clinicbridge-backups-prod
  RESTIC_PASSWORD     senha do repo (nunca em arquivo versionado)

Variáveis opcionais (recomendadas em EC2 com IAM role: deixar sem env):
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_DEFAULT_REGION
  POSTGRES_CONTAINER (default 'clinicbridge-postgres')
  POSTGRES_DB (default 'clinicbridge')
  POSTGRES_USER (default 'clinicbridge')
  BACKUP_WORKDIR (default 'backups/work')
  UPLOAD_DIR (default 'storage/uploads')
  CLEAN_BACKUP_WORKDIR ('true' apaga o dump após o backup)
  RESTIC_CACHE_DIR (default '~/.cache/restic')

Segurança:
  - Falha se RESTIC_REPOSITORY não começar com 's3:' (impede repo local por engano).
  - Nunca imprime senha ou credenciais AWS.
  - Dump temporário fica em diretório gitignored (backups/work).
EOF
  exit 0
fi

# --- Config (defaults seguros; sobrescreva via env) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
BACKUP_WORKDIR="${BACKUP_WORKDIR:-backups/work}"
UPLOAD_DIR="${UPLOAD_DIR:-storage/uploads}"
CLEAN_BACKUP_WORKDIR="${CLEAN_BACKUP_WORKDIR:-false}"

echo "== ClinicBridge :: backup-offsite-restic (Restic + S3) =="
$DRY_RUN && echo "[info] modo DRY-RUN: dump será gerado mas snapshot NÃO será enviado"

# 1) RESTIC_PASSWORD obrigatória (nunca vem de arquivo versionado)
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD não definida. Em prod, ler de SSM (/clinicbridge/<env>/restic_password).}"

# 2) RESTIC_REPOSITORY obrigatória + guard 's3:' (impede usar repo local por engano)
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY não definida. Exemplo: s3:s3.amazonaws.com/clinicbridge-backups-prod}"
case "$RESTIC_REPOSITORY" in
  s3:*|S3:*) : ;;  # ok
  /*|./*|backups/*|backup/*)
    echo "[ABORTAR] RESTIC_REPOSITORY parece ser caminho LOCAL. Este script é só para OFFSITE." >&2
    echo "          Para backup local, use scripts/backup-local-restic.sh." >&2
    exit 1 ;;
  *)
    echo "[ABORTAR] RESTIC_REPOSITORY não começa com 's3:'. Cancele ou ajuste a variável." >&2
    exit 1 ;;
esac
export RESTIC_REPOSITORY

# 3) Pré-checagens rápidas
command -v restic >/dev/null 2>&1 || { echo "restic não instalado. sudo apt install -y restic" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker não disponível neste shell." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
  || { echo "container '$POSTGRES_CONTAINER' não está rodando. docker compose up -d postgres" >&2; exit 1; }

# 4) Workdir
mkdir -p "$BACKUP_WORKDIR"

# 5) Inicializar o repositório se necessário (idempotente)
# Nota: 'restic cat config' falha silenciosamente se o repo não existe;
# 'init' depois cria. Nunca executar 'forget'/'prune' aqui (limpeza é manual).
if restic cat config >/dev/null 2>&1; then
  echo "[info] repositório Restic já inicializado (S3-compatible)"
else
  if $DRY_RUN; then
    echo "[info] dry-run: pularia 'restic init' (repo aparentemente novo)"
  else
    echo "[info] inicializando repositório Restic remoto ..."
    restic init
  fi
fi

# 6) Dump do Postgres (custom format) com timestamp, gravado no host
TS="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_WORKDIR/clinicbridge-offsite-${TS}.dump"
echo "[info] gerando dump do banco '$POSTGRES_DB' -> $DUMP_FILE"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DUMP_FILE"
if [ ! -s "$DUMP_FILE" ]; then
  echo "[FAIL] dump vazio — abortando." >&2
  exit 1
fi
echo "[info] dump gerado ($(du -h "$DUMP_FILE" | cut -f1))"

# 7) Alvos do backup
BACKUP_TARGETS=("$DUMP_FILE")
if [ -d "$UPLOAD_DIR" ]; then
  echo "[info] incluindo storage de uploads: $UPLOAD_DIR"
  BACKUP_TARGETS+=("$UPLOAD_DIR")
else
  echo "[warn] '$UPLOAD_DIR' não existe — backup só do banco."
fi

# 8) Envio (ou skip em dry-run)
if $DRY_RUN; then
  echo "[info] dry-run: pularia 'restic backup' para $RESTIC_REPOSITORY (valor não exibido)"
  echo "[info] dry-run: alvos seriam:"
  for t in "${BACKUP_TARGETS[@]}"; do echo "        - $t"; done
else
  echo "[info] enviando snapshot para o repositório Restic remoto ..."
  restic backup \
    --tag clinicbridge --tag offsite --tag "ts:${TS}" \
    "${BACKUP_TARGETS[@]}"

  echo "== snapshots (offsite) =="
  restic snapshots --compact --tag offsite || true
  LATEST_ID="$(restic snapshots latest --json 2>/dev/null \
    | grep -o '"short_id":"[a-f0-9]*"' | tail -n1 | cut -d'"' -f4 || true)"
fi

# 9) Limpeza opcional do workdir
if [ "$CLEAN_BACKUP_WORKDIR" = "true" ]; then
  echo "[info] CLEAN_BACKUP_WORKDIR=true -> removendo dump temporário $DUMP_FILE"
  rm -f "$DUMP_FILE"
fi

# 10) Resumo (sem segredos)
echo "== resumo do backup =="
if $DRY_RUN; then
  echo "  modo                : dry-run (nenhum snapshot enviado)"
else
  echo "  snapshot (short id) : ${LATEST_ID:-ver lista acima}"
fi
echo "  dump temporário     : $DUMP_FILE $( [ -f "$DUMP_FILE" ] && echo '(mantido)' || echo '(removido)')"
echo "  repositório Restic  : (valor não exibido por segurança — RESTIC_REPOSITORY está setada)"
echo "  AVISO: NÃO commitar '$BACKUP_WORKDIR' (já ignorado pelo .gitignore)."
echo "Backup offsite $($DRY_RUN && echo 'simulado' || echo 'concluído')."
