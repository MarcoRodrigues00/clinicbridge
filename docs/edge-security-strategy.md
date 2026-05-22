# ClinicBridge — Estratégia de Borda Segura (Nginx + WAF)

> Documento técnico **inicial**. Define a borda segura do ClinicBridge — **Nginx
> reverse proxy first** + **WAF (ModSecurity + OWASP CRS) em rollout progressivo**
> — antes de implementar qualquer proxy real. Criado na Sprint 3.8 (docs/ADR-first).
>
> ⚠️ **Nada de borda é implementado nesta sprint:** sem Nginx, sem ModSecurity, sem
> `nginx.conf` real, sem TLS/domínio, sem alterar `docker-compose.yml`. Não afirma
> produção pronta nem conformidade completa com LGPD/HIPAA/CFM; o MVP **não está
> pronto para produção** (ver ressalvas P1 em `docs/security-notes.md`).
>
> Decisão: `docs/adr/0005-edge-security-reverse-proxy-waf.md`. Relacionado:
> `docs/deploy-security-checklist.md`, `docs/adr/0004-deploy-security-baseline.md`,
> `docs/security-notes.md`.

## 1. Status e escopo

- **Status:** rascunho técnico inicial; sujeito à definição do ambiente de produção.
- **Escopo:** decidir e documentar a borda (reverse proxy + WAF) — **sem
  implementar**. A implementação (Nginx/`nginx.conf`/TLS/WAF) é sprint futura.
- **Decisão central:** Nginx como reverse proxy baseline; WAF futuro com
  ModSecurity + OWASP CRS começando em **detection-only**.

## 2. Arquitetura de borda proposta

```
Internet
  → DNS
    → Nginx reverse proxy (HTTPS/TLS termina aqui)
      → WAF futuro (ModSecurity + OWASP CRS) — começa em detection-only/log-only
        → backend HTTP interno (Express, sem TLS próprio)
          → Postgres / Redis / storage (rede privada, não expostos à internet)
```

- O **backend não fica exposto diretamente** na internet — só via Nginx.
- Postgres/Redis/storage ficam em rede privada/interna.
- O Nginx é a única superfície pública (HTTPS).

## 3. Por que Nginx

- Estável, maduro, amplamente usado em produção.
- O time **já domina Nginx** → menor risco operacional.
- Controle fino de headers, TLS, `client_max_body_size`, timeouts, logs, upstreams.
- Caminho direto para **ModSecurity + OWASP CRS** (WAF futuro).
- Combina com `TRUST_PROXY` e com a separação frontend/backend + controle de upload.

## 4. Alternativas avaliadas

| Opção | Pontos fortes | Por que não agora |
|---|---|---|
| **Nginx** (escolhida) | maduro; time domina; ModSecurity/CRS direto; controle fino | — |
| Caddy | HTTPS automático; config limpa | time domina Nginx; Nginx dá caminho mais direto a ModSecurity/CRS |
| Traefik | bom p/ containers + service discovery | abstração desnecessária para o MVP atual |

## 5. O que o reverse proxy deve fazer

- Terminar **HTTPS/TLS**; redirecionar HTTP → HTTPS.
- Encaminhar para o backend HTTP interno (upstream).
- Definir **`X-Real-IP`/`X-Forwarded-For`** corretamente (IP real do cliente).
- Aplicar **`client_max_body_size`** alinhado a `UPLOAD_MAX_BYTES` (ver §10).
- Definir **timeouts** de proxy (considerar upload de CSV/XLSX, sem abrir demais).
- Gerar **access logs sem PII** (sem corpo, sem `Authorization`/`Cookie`).
- Consultar `GET /health/live` (liveness) e `GET /health/ready` (readiness).
- (Futuro) hospedar o WAF (ModSecurity + CRS).

## 6. O que o reverse proxy NÃO deve fazer

- **Não** substituir o CORS do app (CORS continua no backend).
- **Não** substituir `requireAuth`/`requireClinic`/`requireRole`.
- **Não** substituir o rate limit do app.
- **Não** registrar corpo de request, `Authorization` ou `Cookie` nos logs.
- **Não** repassar `X-Forwarded-For` do cliente sem controle (anti-spoof).
- **Não** terminar regras de negócio nem tocar dados.

## 7. WAF: estratégia progressiva

1. **Detection-only / log-only:** ModSecurity + OWASP CRS apenas **observa** e
   loga o que bloquearia. Nenhum tráfego é barrado.
2. **Tuning por rota/grupo:** revisar os falsos positivos (upload, import, export,
   auth, JSON de mapeamento) e ajustar regras/exceções.
3. **Blocking progressivo:** ligar blocking gradualmente, por rota/grupo, só após
   validar que fluxos legítimos não quebram.

## 8. Regras recomendadas inicialmente

- Habilitar OWASP CRS em **DetectionOnly** (`SecRuleEngine DetectionOnly`).
- Coletar logs de auditoria do ModSecurity por tempo suficiente para ver os fluxos
  reais (upload/import/export/auth) antes de qualquer blocking.
- Definir **paranoia level** conservador no início; subir só com tuning.
- Tratar uploads e endpoints JSON como áreas de **alto risco de falso positivo**.

## 9. Regras perigosas / falso positivo

OWASP CRS tende a marcar como suspeito conteúdo legítimo do ClinicBridge:

- **upload CSV/XLSX** (binário/planilha; bytes "estranhos");
- **JSON de mapeamento** de colunas;
- **nomes com acentos** e caracteres variados (dados administrativos);
- **payloads grandes**;
- **export/download**;
- **endpoints de auth** e **JWT no header `Authorization`**;
- nomes de pacientes / dados administrativos diversos.

→ Por isso o WAF começa **detection-only** e só evolui para blocking após tuning.

## 10. Uploads CSV/XLSX e body limits

- **Alinhamento crítico:** `client_max_body_size` no Nginx deve ser ≥
  `UPLOAD_MAX_BYTES` (default **5 MB**). Abaixo disso o Nginx corta uploads válidos
  com 413 **antes** do app.
- Camadas independentes permanecem:
  - **JSON:** Express `express.json({ limit: '100kb' })` (endpoints de API).
  - **Upload:** multer com `UPLOAD_MAX_BYTES` (multipart).
  - **Borda:** Nginx `client_max_body_size` = teto de entrada (≈ `UPLOAD_MAX_BYTES`).
- Timeouts de proxy devem permitir o upload, sem abrir demais (evitar slowloris).

## 11. CORS atrás do Nginx

- **CORS continua no backend** (allowlist por `FRONTEND_ORIGIN`; `*` recusado em
  produção). O Nginx não emite CORS para evitar header duplicado/conflito.
- Em produção, `FRONTEND_ORIGIN` = domínio HTTPS real (ex.:
  `https://app.clinicbridge.com.br`, sem barra final).

## 12. TRUST_PROXY e IP real

- Com Nginx na frente, `req.ip` passa a vir do `X-Forwarded-For`.
- `TRUST_PROXY` deve confiar **apenas no número real de proxies** (ex.: `1` para um
  único Nginx). Confiar cegamente deixaria qualquer cliente forjar o IP, quebrando
  rate limit e a precisão do `audit_logs`.
- O Nginx deve **setar** `X-Real-IP`/`X-Forwarded-For` e não confiar no XFF do
  cliente.

## 13. Rate limit: borda vs app

- O **rate limit do app** (por grupo, IP-keyed, antes do auth; memory/redis)
  **continua existindo** — o Nginx/WAF não o substitui.
- Multi-instância: manter `RATE_LIMIT_STORE=redis` no app (ADR 0004).
- (Futuro) Nginx pode adicionar rate limit de borda **complementar** (anti-flood
  antes do app), sem remover o do app.

## 14. Headers, TLS e HSTS

- TLS termina no Nginx; HTTP **redireciona** para HTTPS.
- **HSTS só** quando o HTTPS estiver correto/estável (Helmet já emite HSTS,
  efetivo apenas sob HTTPS).
- Decidir, na implementação, a **fonte de cada header de borda** para não duplicar
  entre Helmet (app) e Nginx.
- `x-powered-by` já desabilitado no Express.

## 15. Logs e privacidade

- Access logs do Nginx **sem** corpo, **sem** `Authorization`/`Cookie`, **sem** PII.
- IP real via `X-Real-IP`/`X-Forwarded-For`; o `audit_logs` do app continua sem PII.
- Retenção/rotação dos logs de borda alinhada à `docs/data-retention-policy.md`.
- Logs do ModSecurity (futuros) podem conter trechos de payload → tratar como
  sensíveis (acesso restrito, retenção limitada).

## 16. Health / live / ready no proxy

- **Liveness:** `GET /health` / `GET /health/live` (sem DB) → probe de vida.
- **Readiness:** `GET /health/ready` (DB `select 1` + timeout; 200/503) → o proxy/
  orquestrador só envia tráfego quando 200.
- Esses endpoints já não vazam segredo/PII (Sprint 3.7).

## 17. Checklist local/staging (futuro — quando implementar)

- [ ] `nginx.conf` de exemplo revisado (TLS, upstream, `client_max_body_size`,
  timeouts, `X-Real-IP`/`X-Forwarded-For`, logs sem PII).
- [ ] `TRUST_PROXY` = hop count real; IP real verificado no rate limit/audit.
- [ ] `FRONTEND_ORIGIN` apontando para o host de staging (HTTPS).
- [ ] Upload de 5 MB passa pelo Nginx (sem 413 indevido).
- [ ] `/health/live` e `/health/ready` acessíveis pelo proxy.
- [ ] WAF (se ligado) em **DetectionOnly**; logs revisados.

## 18. Checklist produção (futuro — quando implementar)

- [ ] HTTPS real + redirect HTTP→HTTPS; HSTS após HTTPS estável.
- [ ] Backend **não** exposto direto na internet (só via Nginx).
- [ ] Postgres/Redis/storage em rede privada.
- [ ] `FRONTEND_ORIGIN` de produção (HTTPS, sem `*`).
- [ ] WAF detection-only → tuning por rota → blocking gradual.
- [ ] Logs de borda sem PII; retenção definida.
- [ ] Rate limit do app ativo (`RATE_LIMIT_STORE=redis` se multi-instância).
- [ ] Revisão de segurança dedicada antes do blocking do WAF.

## 19. Próxima sprint recomendada

**Sprint de implementação do Nginx reverse proxy (sem WAF blocking):** criar um
`nginx.conf` de exemplo (marcado como local/staging), validar TLS local/staging,
`TRUST_PROXY`, `client_max_body_size` ≥ `UPLOAD_MAX_BYTES`, IP real e logs sem PII;
ligar `/health/live` e `/health/ready` no proxy. **WAF entra depois**, em
detection-only, com tuning antes de qualquer blocking.

---

> **Exemplo ILUSTRATIVO (NÃO APLICADO, NÃO É PRODUÇÃO)** — apenas para orientar a
> futura implementação; não é um `nginx.conf` real e não deve ser usado como está:
>
> ```nginx
> # ILUSTRATIVO — revisar/endurecer antes de qualquer uso real.
> # server { listen 443 ssl; server_name app.exemplo;
> #   client_max_body_size 5m;            # >= UPLOAD_MAX_BYTES
> #   location / {
> #     proxy_pass http://backend_interno;  # Express HTTP interno
> #     proxy_set_header X-Real-IP $remote_addr;
> #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
> #     proxy_set_header X-Forwarded-Proto $scheme;
> #   }
> #   # access_log sem corpo; nunca logar Authorization/Cookie.
> # }
> # WAF futuro: ModSecurity + OWASP CRS -> SecRuleEngine DetectionOnly (primeiro).
> ```
