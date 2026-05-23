#!/usr/bin/env bash
# ClinicBridge — generate-local-nginx-cert.sh
# Generates a SELF-SIGNED certificate for LOCAL/STAGING Nginx TLS only.
# NOT for production — production must use a real cert (ACME/Let's Encrypt or a
# managed certificate from the deploy environment). The key/cert land in a
# gitignored folder and must NEVER be committed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

CERT_DIR="${CERT_DIR:-infra/nginx/certs/local}"
CRT="$CERT_DIR/clinicbridge.local.crt"
KEY="$CERT_DIR/clinicbridge.local.key"
DAYS="${CERT_DAYS:-365}"
FORCE="${FORCE:-false}"

echo "== ClinicBridge :: generate-local-nginx-cert (LOCAL/STAGING, self-signed) =="

command -v openssl >/dev/null 2>&1 || {
  echo "[FAIL] openssl não encontrado. Instale: sudo apt update && sudo apt install -y openssl" >&2
  exit 1
}

if [ -f "$CRT" ] || [ -f "$KEY" ]; then
  if [ "$FORCE" != "true" ]; then
    echo "[skip] certificado já existe em '$CERT_DIR'."
    echo "       Para regenerar: FORCE=true ./scripts/generate-local-nginx-cert.sh"
    exit 0
  fi
  echo "[info] FORCE=true — sobrescrevendo certificado existente."
fi

mkdir -p "$CERT_DIR"

# Self-signed cert with SAN for the local names. openssl 3.x supports -addext.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$KEY" -out "$CRT" -days "$DAYS" \
  -subj "/CN=clinicbridge.local/O=ClinicBridge Local Dev" \
  -addext "subjectAltName=DNS:localhost,DNS:clinicbridge.local,IP:127.0.0.1" \
  >/dev/null 2>&1

# Restrict the private key (best-effort; mounted read-only into Nginx anyway).
chmod 600 "$KEY" 2>/dev/null || true
chmod 644 "$CRT" 2>/dev/null || true

echo "[ok] certificado local gerado (validade ${DAYS} dias):"
echo "     cert: $CRT"
echo "     key : $KEY  (chmod 600)"
echo
echo "Próximos passos:"
echo "  1) docker compose --profile edge up -d postgres redis backend nginx"
echo "  2) curl -k -i https://localhost:\${NGINX_HTTPS_PORT:-8443}/health"
echo
echo "AVISO: estes arquivos são LOCAIS e gitignored (infra/nginx/certs/). NÃO commitar."
echo "       Produção deve usar certificado REAL (ACME/Let's Encrypt ou gerenciado)."
