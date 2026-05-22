# ADR 0005 — Edge Security Baseline — Nginx reverse proxy first, WAF staged rollout

- **Status:** Accepted
- **Data:** 2026-05-23
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/edge-security-strategy.md`, `docs/deploy-security-checklist.md`,
  `docs/adr/0004-deploy-security-baseline.md`, `docs/security-notes.md`,
  `docs/project-state.md`, `docs/roadmap-next-phase.md`

## 1. Contexto

O ADR 0004 fixou a baseline de deploy seguro com **reverse-proxy/HTTPS first** como
requisito de produção, mas sem escolher a ferramenta de borda nem detalhar a
estratégia. O backend hoje:

- é Express exposto direto em `http://localhost:3001` (dev), **sem TLS próprio**;
- tem `trust proxy` configurável (`TRUST_PROXY`, default `false`);
- CORS por allowlist (`FRONTEND_ORIGIN`; `*` recusado em produção);
- rate limit por grupo, IP-keyed, antes do `requireAuth` (memory/redis);
- `express.json({ limit: '100kb' })` para JSON e upload multipart via multer com
  `UPLOAD_MAX_BYTES` (default 5 MB);
- liveness `GET /health` + `GET /health/live` e readiness `GET /health/ready`;
- Helmet com defaults + `x-powered-by` desabilitado;
- logger que redige `authorization/cookie/password/senha/cpf/token/...`.

Falta a camada de **borda**: TLS, headers de borda, IP real, body size, logs de
acesso e (futuro) WAF.

## 2. Problema

Sem uma borda definida, produção não tem onde terminar TLS, normalizar o IP do
cliente, limitar o tamanho do corpo na entrada nem (futuramente) filtrar tráfego
malicioso. Era preciso **decidir a ferramenta de reverse proxy e a estratégia de
WAF antes de implementar qualquer proxy real**, para evitar configuração ad-hoc e
falso positivo de WAF quebrando fluxos legítimos (upload, importação, export, auth).

## 3. Decisão

1. **Nginx** será o **reverse proxy baseline inicial** do ClinicBridge.
2. **HTTPS/TLS termina no Nginx**; o backend Express continua **HTTP interno**
   (não serve TLS).
3. O Nginx é responsável por: headers de borda, `client_max_body_size`, timeouts
   de proxy, logs de acesso (sem PII) e encaminhamento do **IP real**
   (`X-Forwarded-For`/`X-Real-IP`).
4. `TRUST_PROXY` no Express deve refletir o **hop count real** do Nginx/proxy.
5. `FRONTEND_ORIGIN` deve apontar para o **domínio HTTPS real** em produção.
6. **WAF futuro:** ModSecurity + OWASP CRS no Nginx, começando em
   **detection-only/log-only**; blocking só após tuning e validação dos fluxos.
7. **Nada disso é implementado nesta sprint** — sem Nginx, sem ModSecurity, sem
   `nginx.conf` real, sem TLS/domínio, sem alterar `docker-compose.yml`.

## 4. Por que Nginx

- Estável, maduro e amplamente usado em produção.
- O time já **domina Nginx** → menor risco operacional.
- Controle fino de headers, TLS, `client_max_body_size`, logs, upstreams e timeouts.
- Caminho mais direto para **ModSecurity + OWASP CRS** (WAF futuro).
- Combina com a necessidade de configurar `TRUST_PROXY` corretamente.
- Facilita separar frontend/backend e controlar uploads.

## 5. Alternativas consideradas e não escolhidas

- **Caddy:** HTTPS automático e config limpa; **não escolhido agora** porque o
  time domina Nginx e este dá caminho mais direto a ModSecurity/OWASP CRS.
- **Traefik:** bom para ambientes containerizados com service discovery; **não
  escolhido agora** porque adiciona abstração desnecessária para o MVP atual.
- **Nginx:** **escolhido** como baseline.

## 6. WAF strategy

- Ferramenta futura preferencial: **ModSecurity + OWASP CRS** sobre Nginx.
- Rollout **progressivo**: (1) detection-only/log-only; (2) tuning por
  rota/grupo; (3) blocking gradual após validar os fluxos reais.
- Foco inicial em **observar** o que as regras marcariam, sem bloquear tráfego
  legítimo.

## 7. Por que WAF não entra em blocking de primeira

OWASP CRS é agressivo por padrão e gera **falso positivo** em payloads legítimos do
ClinicBridge: upload de CSV/XLSX, JSON de mapeamento, nomes com acentos/caracteres
variados, payloads grandes, export/download, headers com JWT. Blocking direto
quebraria fluxos reais. Por isso: detection-only → tuning → blocking por rota.

## 8. Integração com TRUST_PROXY

- Com Nginx na frente, o `req.ip` do Express passa a vir do `X-Forwarded-For`.
- `TRUST_PROXY` deve confiar **apenas no número real de proxies** (ex.: `1` para um
  único Nginx). Confiar cegamente deixaria clientes forjarem o IP, quebrando rate
  limit e a precisão do `audit_logs`.
- O Nginx deve **setar** `X-Real-IP`/`X-Forwarded-For` corretamente (e não repassar
  XFF do cliente sem controle).

## 9. Integração com CORS

- O **CORS continua no backend** (allowlist por `FRONTEND_ORIGIN`). O Nginx **não**
  substitui o CORS do app.
- Em produção, `FRONTEND_ORIGIN` aponta para o domínio HTTPS real (sem `*`).
- Evitar duplicar headers CORS no Nginx (evita conflito/origem dupla).

## 10. Upload / body size

- **Alinhamento crítico:** o Nginx `client_max_body_size` deve acomodar o maior
  corpo legítimo — o **upload** (`UPLOAD_MAX_BYTES`, default 5 MB) — não os 100kb do
  JSON. Se ficar abaixo de `UPLOAD_MAX_BYTES`, o Nginx corta uploads válidos com 413
  antes do app.
- Camadas independentes permanecem: Express `express.json({limit:'100kb'})` para
  JSON e multer `UPLOAD_MAX_BYTES` para upload. O Nginx é o **teto de entrada**.
- Timeouts de proxy devem considerar o upload de CSV/XLSX, sem abrir demais.

## 11. Logs e IP real

- Access logs do Nginx **não** devem registrar corpo de request nem
  `Authorization`/`Cookie`.
- Nginx encaminha `X-Real-IP`/`X-Forwarded-For`; o app usa `req.ip` (via
  `TRUST_PROXY`) no rate limit e no `audit_logs` (que continua **sem PII**).
- Sem PII desnecessária nos logs de borda (alinhar à política de retenção).

## 12. Headers / TLS / HSTS

- TLS termina no Nginx; HTTP **redireciona** para HTTPS.
- **HSTS só** quando o HTTPS estiver correto e estável (o Helmet já emite HSTS,
  efetivo apenas sob HTTPS).
- Evitar duplicação de headers entre Helmet (app) e Nginx; decidir a fonte de cada
  header de borda na implementação.

## 13. Rate limiting de borda vs rate limiting do app

- O **rate limit do app continua existindo** (por grupo, IP-keyed, antes do auth,
  memory/redis). O WAF/Nginx **não** o substitui.
- O Nginx pode, no futuro, adicionar um rate limit de borda **complementar**
  (proteção contra flood antes de chegar ao app), sem remover o do app.
- Multi-instância: manter `RATE_LIMIT_STORE=redis` no app (ADR 0004).

## 14. Health / live / ready atrás do proxy

- **Liveness:** `GET /health` / `GET /health/live` (sem DB) para o probe de
  vida do orquestrador.
- **Readiness:** `GET /health/ready` (DB `select 1` + timeout) para o proxy/
  orquestrador só mandar tráfego quando 200; 503 quando o DB cai.
- O Nginx deve poder consultar esses endpoints internamente (sem expô-los a mais
  do que o necessário; eles já não vazam segredo/PII).

## 15. O que fica fora do escopo agora

- implementar Nginx, `nginx.conf` real de produção, TLS/certificado, domínio;
- instalar/configurar ModSecurity/OWASP CRS;
- alterar `docker-compose.yml`, AWS/Cloudflare, CI/CD, IaC;
- qualquer deploy real;
- afirmar produção pronta ou conformidade completa com LGPD/HIPAA/CFM.

## 16. Consequências positivas

- Borda decidida e documentada antes de qualquer config real (menos ad-hoc).
- Caminho claro para TLS, IP real, body size e WAF.
- WAF progressivo evita quebrar fluxos legítimos (upload/import/export/auth).
- Reaproveita o que já existe (TRUST_PROXY, CORS, rate limit, health/ready).

## 17. Consequências negativas / trade-offs

- Valor real (TLS/WAF) só aparece na implementação (sprint futura).
- Nginx + ModSecurity adicionam superfície operacional (config, tuning, manutenção).
- Risco de falso positivo do CRS exige tempo de tuning antes do blocking.
- Headers podem duplicar entre Helmet e Nginx se a fonte não for decidida.

## 18. Critérios para implementar Nginx/WAF na próxima sprint

1. `nginx.conf` de exemplo revisado (TLS, `client_max_body_size` ≥ `UPLOAD_MAX_BYTES`,
   timeouts, `X-Real-IP`/`X-Forwarded-For`, logs sem PII, upstream para o backend).
2. `TRUST_PROXY` ajustado ao hop count real e verificado (IP real no rate
   limit/audit).
3. HTTPS real + redirect HTTP→HTTPS; HSTS só após HTTPS estável.
4. `FRONTEND_ORIGIN` de produção (HTTPS, sem `*`).
5. Backend **não** exposto direto na internet (só via Nginx).
6. WAF (ModSecurity + CRS) em **detection-only**, com logs revisados antes de
   qualquer blocking.
7. Plano de tuning por rota (upload/import/export/auth) antes do blocking.

> Nota: este ADR descreve **baseline e requisitos**. Não afirma produção pronta nem
> conformidade completa com LGPD/HIPAA/CFM.
