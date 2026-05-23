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
- **Sprint 3.10:** o backend agora roda **containerizado** (serviço `backend`),
  então o Nginx proxya para `backend:3001` na rede do compose — o que **resolve a
  limitação Docker Desktop + WSL2** da Sprint 3.9 (ver no fim).
- Proxy → backend HTTP interno; **sem TLS aqui** (TLS termina no Nginx só em
  produção, futuro). Frontend via Nginx fica para sprint futura.
- WAF (ModSecurity + OWASP CRS) **não** entra nesta sprint (detection-only first
  no futuro).

## Arquitetura (local/staging) — Sprint 3.10

```
curl/browser
  → Nginx (container, 127.0.0.1:8080 → :80)   # headers de borda, body size, logs
    → backend (container, backend:3001, NÃO publicado no host)
      → Postgres / Redis (containers, rede do compose)
```

## Pré-requisitos

- Docker + Docker Compose.
- Tudo containerizado via profile `edge` (não precisa de backend no host).
- Migrations aplicadas (rodadas do host: `pnpm --filter backend migrate:latest`).

## Como subir (backend containerizado — recomendado, Sprint 3.10)

```bash
# Build da imagem do backend (multi-stage; contexto = raiz do repo):
docker compose --profile edge build backend

# Sobe Postgres + Redis + backend + Nginx (profile edge não sobe no up padrão):
docker compose --profile edge up -d postgres redis backend nginx

# Validar a config do Nginx:
docker compose exec nginx nginx -t
docker compose ps
```

Porta do proxy: `127.0.0.1:8080` (ajustável via `NGINX_PORT`). O backend **não** é
publicado no host (só `expose: 3001`); o Nginx é a entrada.

> **Fallback host-run:** para rodar o backend no host (modo Sprint 3.9), troque o
> upstream em `infra/nginx/conf.d/clinicbridge.local.conf` de `backend:3001` para
> `host.docker.internal:3001`, recarregue o Nginx (`nginx -s reload`) e rode
> `TRUST_PROXY=1 pnpm --filter backend dev`. Sujeito à limitação WSL2 abaixo.

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

## Limitação Docker Desktop + WSL2 — RESOLVIDA na Sprint 3.10

Na Sprint 3.9, com o backend rodando **dentro da distro WSL** (não em container) e
o Docker no **Docker Desktop (VM)**, o container Nginx vivia numa rede separada e
**não alcançava** o backend do host em `:3001` (`host.docker.internal`/gateway/IP
da WSL → `connection refused`/`timeout`; proxy retornava **502**).

**Resolvido na Sprint 3.10:** com o backend **containerizado** (serviço `backend`
na rede do compose), o Nginx proxya para `backend:3001` e o fluxo ponta a ponta
funciona. Verificado: `/health`, `/health/live`, `/health/ready` → 200 via
`http://localhost:8080`; readiness → 503 com Postgres parado e 200 ao voltar;
anti-spoof confirmado (a chave de rate limit no Redis usa o IP real do Nginx, não
o `X-Forwarded-For` forjado pelo cliente).

O modo **host-run** (backend no host) continua sujeito à limitação acima — use o
fallback documentado em "Como subir" apenas em Docker nativo Linux/staging VM.

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
