#!/usr/bin/env bash
# ClinicBridge — restore-offsite-restic.sh
# Restore drill OFFSITE: restaura o último snapshot do Restic em S3 e carrega o
# dump em um banco SEPARADO (clinicbridge_restore_offsite_test). NUNCA toca no
# banco principal. Sprint 3.40. Nunca grava/imprime senha.
# Hard guards:
#   1) RESTIC_REPOSITORY DEVE começar com 's3:' (impede repo local por engano).
#   2) RESTORE_DB != POSTGRES_DB (impede sobrescrever o banco principal).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Flags ---
SHOW_HELP=false
for arg in "$@"; do
  case "$arg" in
    -h|--help) SHOW_HELP=true ;;
    *) echo "[warn] flag desconhecida: $arg" >&2 ;;
  esac
done

if $SHOW_HELP; then
  cat <<'EOF'
restore-offsite-restic.sh — restore drill offsite (Restic S3 -> banco separado).

Uso:
  ./scripts/restore-offsite-restic.sh             # drill em clinicbridge_restore_offsite_test
  ./scripts/restore-offsite-restic.sh --help

Garantias:
  - NUNCA sobrescreve o banco principal (RESTORE_DB == POSTGRES_DB -> abort).
  - NUNCA aceita repo local (RESTIC_REPOSITORY precisa começar com 's3:').
  - Nunca imprime senha/credenciais.

Variáveis obrigatórias:
  RESTIC_REPOSITORY (s3:...), RESTIC_PASSWORD

Variáveis opcionais:
  POSTGRES_CONTAINER (default 'clinicbridge-postgres')
  POSTGRES_DB (default 'clinicbridge')
  POSTGRES_USER (default 'clinicbridge')
  RESTORE_DB (default 'clinicbridge_restore_offsite_test')
  RESTORE_WORKDIR (default 'backups/restore-offsite-work')
EOF
  exit 0
fi

# --- Config (defaults seguros; sobrescreva via env) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"                       # banco PRINCIPAL (intocável)
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
RESTORE_DB="${RESTORE_DB:-clinicbridge_restore_offsite_test}"    # banco de teste (separado)
RESTORE_WORKDIR="${RESTORE_WORKDIR:-backups/restore-offsite-work}"

echo "== ClinicBridge :: restore-offsite-restic (RESTORE DRILL offsite) =="

# 0) Hard guard: nunca restaurar no banco principal
if [ "$RESTORE_DB" = "$POSTGRES_DB" ]; then
  echo "[ABORTAR] RESTORE_DB ('$RESTORE_DB') é igual ao banco principal ('$POSTGRES_DB')." >&2
  echo "          O restore drill NUNCA pode sobrescrever o banco principal." >&2
  exit 1
fi

# 1) RESTIC_PASSWORD obrigatória
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD não definida. Em prod, ler de SSM (/clinicbridge/<env>/restic_password).}"

# 2) RESTIC_REPOSITORY obrigatória + guard 's3:'
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY não definida. Exemplo: s3:s3.amazonaws.com/clinicbridge-backups-prod}"
case "$RESTIC_REPOSITORY" in
  s3:*|S3:*) : ;;
  /*|./*|backups/*|backup/*)
    echo "[ABORTAR] RESTIC_REPOSITORY parece ser caminho LOCAL. Este script é só para OFFSITE." >&2
    echo "          Para restore local, use scripts/restore-local-restic.sh." >&2
    exit 1 ;;
  *)
    echo "[ABORTAR] RESTIC_REPOSITORY não começa com 's3:'." >&2
    exit 1 ;;
esac
export RESTIC_REPOSITORY

# 3) Pré-checagens
command -v restic >/dev/null 2>&1 || { echo "restic não instalado." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker não disponível." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
  || { echo "container '$POSTGRES_CONTAINER' não está rodando." >&2; exit 1; }
restic cat config >/dev/null 2>&1 \
  || { echo "repositório Restic offsite não acessível. Verifique RESTIC_REPOSITORY, RESTIC_PASSWORD e credenciais AWS." >&2; exit 1; }

# 4) Restaurar o último snapshot para uma pasta de trabalho local
echo "[info] restaurando último snapshot do Restic offsite -> $RESTORE_WORKDIR/latest"
rm -rf "$RESTORE_WORKDIR/latest"
mkdir -p "$RESTORE_WORKDIR/latest"
restic restore latest --target "$RESTORE_WORKDIR/latest"

# 5) Localizar o dump mais recente entre os arquivos restaurados
#    (aceita 'clinicbridge-*.dump' e 'clinicbridge-offsite-*.dump')
DUMP_FILE="$(find "$RESTORE_WORKDIR/latest" -type f \( -name 'clinicbridge-offsite-*.dump' -o -name 'clinicbridge-*.dump' \) | sort | tail -n1 || true)"
if [ -z "$DUMP_FILE" ] || [ ! -s "$DUMP_FILE" ]; then
  echo "[FAIL] nenhum dump 'clinicbridge*.dump' encontrado no snapshot restaurado." >&2
  exit 1
fi
echo "[info] dump recuperado do snapshot: $DUMP_FILE"

# 6) Recriar APENAS o banco de teste (drop/create no banco de teste, nunca no principal)
echo "[info] recriando banco de teste '$RESTORE_DB' (o principal '$POSTGRES_DB' não é tocado)"
docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" \
  -c "CREATE DATABASE \"$RESTORE_DB\" OWNER \"$POSTGRES_USER\";"

# 7) pg_restore para o banco de teste
echo "[info] restaurando dump em '$RESTORE_DB' ..."
set +e
docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" \
  --no-owner --no-privileges -d "$RESTORE_DB" < "$DUMP_FILE"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo "[warn] pg_restore retornou $rc (pode haver avisos não-fatais; os counts abaixo confirmam o conteúdo)."
fi

# 8) Counts no banco de teste e no principal
counts_for() {
  local db="$1"
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$db" -t -A -F'|' \
    -c "SELECT
          (SELECT count(*) FROM patients),
          (SELECT count(*) FROM import_files),
          (SELECT count(*) FROM import_sessions);" 2>/dev/null | tr -d ' '
}
MAIN_COUNTS="$(counts_for "$POSTGRES_DB")"
REST_COUNTS="$(counts_for "$RESTORE_DB")"
IFS='|' read -r M_PAT M_FIL M_SES <<< "$MAIN_COUNTS"
IFS='|' read -r R_PAT R_FIL R_SES <<< "$REST_COUNTS"

# 9) Resultado lado a lado
echo "== counts: principal ($POSTGRES_DB) vs restore ($RESTORE_DB) =="
printf '  %-18s %-12s %-12s %s\n' "tabela" "main" "restore" "match"
row() { printf '  %-18s %-12s %-12s %s\n' "$1" "$2" "$3" "$([ "$2" = "$3" ] && echo OK || echo DIVERGE)"; }
row "patients"        "${M_PAT:-?}" "${R_PAT:-?}"
row "import_files"    "${M_FIL:-?}" "${R_FIL:-?}"
row "import_sessions" "${M_SES:-?}" "${R_SES:-?}"

# 10) Resumo
echo "== resumo =="
echo "  banco de teste restaurado : $RESTORE_DB"
echo "  pasta de restore (mantida): $RESTORE_WORKDIR/latest"
echo "  para limpar o banco de teste: docker exec $POSTGRES_CONTAINER psql -U $POSTGRES_USER -d postgres -c 'DROP DATABASE IF EXISTS \"$RESTORE_DB\";'"
echo "  AVISO: NÃO commitar '$RESTORE_WORKDIR' (já ignorado pelo .gitignore)."

if [ "${M_PAT:-x}" = "${R_PAT:-y}" ] && [ "${M_FIL:-x}" = "${R_FIL:-y}" ] && [ "${M_SES:-x}" = "${R_SES:-y}" ]; then
  echo "Restore drill OFFSITE OK: counts do restore batem com o banco principal."
else
  echo "Restore drill OFFSITE ATENÇÃO: counts divergem (verifique a saída acima)." >&2
  exit 2
fi
