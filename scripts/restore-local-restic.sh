#!/usr/bin/env bash
# ClinicBridge — restore-local-restic.sh
# Restore drill LOCAL/DEV: restaura o último snapshot Restic e carrega o dump
# em um banco SEPARADO (clinicbridge_restore_test). NUNCA toca no banco principal.
# Sem offsite. Nunca grava senha.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Config (defaults seguros; sobrescreva via env) ---
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinicbridge-postgres}"
POSTGRES_DB="${POSTGRES_DB:-clinicbridge}"           # banco PRINCIPAL (intocável)
POSTGRES_USER="${POSTGRES_USER:-clinicbridge}"
RESTORE_DB="${RESTORE_DB:-clinicbridge_restore_test}" # banco de teste (separado)
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-backups/restic-repo}"
RESTORE_WORKDIR="${RESTORE_WORKDIR:-backups/restore-work}"
export RESTIC_REPOSITORY

echo "== ClinicBridge :: restore-local-restic (RESTORE DRILL, LOCAL/DEV) =="

# 0) Guarda de segurança: nunca restaurar no banco principal
if [ "$RESTORE_DB" = "$POSTGRES_DB" ]; then
  echo "[ABORTAR] RESTORE_DB ('$RESTORE_DB') é igual ao banco principal ('$POSTGRES_DB')." >&2
  echo "          O restore drill NUNCA pode sobrescrever o banco principal." >&2
  exit 1
fi

# 1) RESTIC_PASSWORD obrigatória
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD não definida. Exporte no shell: export RESTIC_PASSWORD='dev-local-only-change-me'}"

# Pré-checagens
command -v restic >/dev/null 2>&1 || { echo "restic não instalado." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker não disponível." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
  || { echo "container '$POSTGRES_CONTAINER' não está rodando." >&2; exit 1; }
restic -r "$RESTIC_REPOSITORY" cat config >/dev/null 2>&1 \
  || { echo "repositório Restic '$RESTIC_REPOSITORY' não inicializado. Rode o backup primeiro." >&2; exit 1; }

# 2/3) Restaurar o último snapshot do Restic para uma pasta de trabalho
echo "[info] restaurando último snapshot do Restic -> $RESTORE_WORKDIR/latest"
rm -rf "$RESTORE_WORKDIR/latest"
mkdir -p "$RESTORE_WORKDIR/latest"
restic -r "$RESTIC_REPOSITORY" restore latest --target "$RESTORE_WORKDIR/latest"

# 4) Localizar o dump mais recente entre os arquivos restaurados
DUMP_FILE="$(find "$RESTORE_WORKDIR/latest" -type f -name 'clinicbridge-*.dump' | sort | tail -n1 || true)"
if [ -z "$DUMP_FILE" ] || [ ! -s "$DUMP_FILE" ]; then
  echo "[FAIL] nenhum dump 'clinicbridge-*.dump' encontrado no snapshot restaurado." >&2
  exit 1
fi
echo "[info] dump recuperado do snapshot: $DUMP_FILE"

# 5) Recriar APENAS o banco de teste (drop/create no banco de teste, nunca no principal)
echo "[info] recriando banco de teste '$RESTORE_DB' (o principal '$POSTGRES_DB' não é tocado)"
docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" \
  -c "CREATE DATABASE \"$RESTORE_DB\" OWNER \"$POSTGRES_USER\";"

# 6) pg_restore para o banco de teste (--no-owner/--no-privileges p/ evitar problemas de role)
echo "[info] restaurando dump em '$RESTORE_DB' ..."
set +e
docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" \
  --no-owner --no-privileges -d "$RESTORE_DB" < "$DUMP_FILE"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo "[warn] pg_restore retornou $rc (pode haver avisos não-fatais; os counts abaixo confirmam o conteúdo)."
fi

# 7/8) Counts no banco de teste e no principal
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

# 10) Não apagar restore-work automaticamente
echo "== resumo =="
echo "  banco de teste restaurado : $RESTORE_DB"
echo "  pasta de restore (mantida): $RESTORE_WORKDIR/latest"
echo "  para limpar o banco de teste: docker exec $POSTGRES_CONTAINER psql -U $POSTGRES_USER -d postgres -c 'DROP DATABASE IF EXISTS \"$RESTORE_DB\";'"
echo "  AVISO: NÃO commitar '$RESTORE_WORKDIR' (já ignorado pelo .gitignore)."

if [ "${M_PAT:-x}" = "${R_PAT:-y}" ] && [ "${M_FIL:-x}" = "${R_FIL:-y}" ] && [ "${M_SES:-x}" = "${R_SES:-y}" ]; then
  echo "Restore drill OK: counts do restore batem com o banco principal."
else
  echo "Restore drill ATENÇÃO: counts divergem (verifique a saída acima)." >&2
  exit 2
fi
