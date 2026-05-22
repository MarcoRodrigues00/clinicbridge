# ClinicBridge — Runbook do Nginx Reverse Proxy (Local/Staging)

> **LOCAL/STAGING ONLY.** Reverse proxy Nginx para o ClinicBridge implementado na
> Sprint 3.9. **Sem TLS real, sem domínio real, sem WAF/ModSecurity, sem
> AWS/Cloudflare.** Não é produção e não afirma conformidade completa com
> LGPD/HIPAA/CFM. O MVP **não está pronto para produção** (ver `docs/security-notes.md`).
>
> Decisão/estratégia de borda: `docs/adr/0005-edge-security-reverse-proxy-waf.md` +
> `docs/edge-security-strategy.md`. Config: `infra/nginx/`.

## Status e escopo

- Nginx reverse proxy **opcional** (profile `edge`) proxyando o **backend/API**.
- Proxy → backend HTTP interno; **sem TLS aqui** (TLS termina no Nginx só em
  produção, futuro). Frontend via Nginx fica para sprint futura.
- WAF (ModSecurity + OWASP CRS) **não** entra nesta sprint (detection-only first
  no futuro).

## Arquitetura (local/staging)

```
curl/browser
  → Nginx (container, 127.0.0.1:8080 → :80)   # headers de borda, body size, logs
    → backend HTTP interno (host :3001 via host.docker.internal)
      → Postgres / Redis (compose)
```

## Pré-requisitos

- Docker + Docker Compose (Postgres/Redis já no compose).
- Backend rodando em `:3001` e **alcançável a partir do host do Docker**
  (ver "Limitação conhecida" abaixo).

## Como subir

```bash
# Postgres/Redis (se ainda não estiverem de pé)
docker compose up -d postgres redis

# Backend no host (porta 3001). Atrás do proxy, use TRUST_PROXY=1:
TRUST_PROXY=1 pnpm --filter backend dev

# Nginx (opcional, profile edge — NÃO sobe no `docker compose up` padrão):
docker compose --profile edge up -d nginx

# Validar a config:
docker compose exec nginx nginx -t
```

Porta do proxy: `127.0.0.1:8080` (ajustável via `NGINX_PORT`).

## TRUST_PROXY (IP real)

- Atrás do Nginx, rode o backend com **`TRUST_PROXY=1`** (um hop) para que
  `req.ip`, rate limit e `audit_logs` usem o IP real do cliente.
- O Nginx **sobrescreve** `X-Forwarded-For`/`X-Real-IP` com o IP da conexão
  (`$remote_addr`), descartando qualquer `X-Forwarded-For` forjado pelo cliente
  (anti-spoof). Se um dia houver **outro** proxy na frente do Nginx, trocar para
  `$proxy_add_x_forwarded_for` e ajustar `TRUST_PROXY` ao hop count real.

## Testar via proxy

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8080/health/live
curl -i http://localhost:8080/health/ready
```

Esperado (quando o Nginx alcança o backend): `200` em `/health` e `/health/live`;
`/health/ready` `200` com `{"checks":{"database":"ok"}}` (Postgres up) ou `503`
`not_ready` quando o DB cai.

## client_max_body_size

- Definido em **10m** (`infra/nginx/nginx.conf` + server block), **≥
  `UPLOAD_MAX_BYTES`** (5 MB default). Abaixo disso o Nginx cortaria uploads
  legítimos com 413 antes do app.
- Camadas independentes: JSON limitado a 100kb no Express; upload (multer) a
  `UPLOAD_MAX_BYTES`; Nginx é o teto de entrada.

## Logs (seguros)

- Formato `clinicbridge_safe`: IP, `fwd="<XFF de entrada>"`, `"<método> <path>"`
  (path **sem query string**), status, bytes, tempo.
- **Nunca** registra corpo de request, `Authorization` nem `Cookie` (verificado).
- Ver: `docker compose logs nginx --tail=50`.

## O que NÃO está incluído

- TLS real / certificado; domínio real; HTTPS obrigatório;
- WAF / ModSecurity / OWASP CRS;
- AWS / Cloudflare / deploy real;
- proxy do frontend (futuro);
- produção pronta / compliance completo.

## Limitação conhecida (Docker Desktop + WSL2)

Quando o backend roda **dentro da distro WSL** (não em container) e o Docker usa o
**Docker Desktop (VM)**, o container Nginx vive numa rede separada e **não alcança**
o backend do host em `:3001` (testado: `host.docker.internal`/gateway/IP da WSL →
`connection refused`/`timeout`; o proxy retorna **502**). Não é bug de config — é
isolamento de rede do ambiente.

Como obter um proxy funcional ponta a ponta:
- **Docker nativo Linux** (ou staging VM): `host.docker.internal:3001` com
  `extra_hosts: host.docker.internal:host-gateway` (já no compose) alcança o
  backend do host.
- **Backend containerizado** na mesma rede do compose: trocar o upstream para o
  nome do serviço (sprint futura).
- A config do Nginx em si foi **validada** (`nginx -t` OK) e o encaminhamento +
  headers `X-Real-IP`/`X-Forwarded-For` (com anti-spoof) + logs seguros foram
  **comprovados** com um upstream de eco acessível na rede do Docker; o readiness
  com DB já foi validado direto no backend na Sprint 3.7.

## Troubleshooting

- **502 Bad Gateway:** o Nginx não alcança o backend `:3001` — ver "Limitação
  conhecida"; confirme o backend de pé e alcançável a partir do host do Docker.
- **413 Request Entity Too Large:** subir `client_max_body_size` (≥ `UPLOAD_MAX_BYTES`).
- **IP errado no rate limit/audit:** confirme `TRUST_PROXY=1` no backend atrás do proxy.
- **Nginx não sobe:** `docker compose exec nginx nginx -t` para ver o erro de config.

## Parar o proxy

```bash
docker compose --profile edge stop nginx     # ou: docker compose --profile edge down
```
