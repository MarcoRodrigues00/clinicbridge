# ADR 0004 — Deploy Security Baseline — reverse-proxy/HTTPS first, explicit prod config

- **Status:** Accepted
- **Data:** 2026-05-23
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/deploy-security-checklist.md`, `docs/security-notes.md`,
  `docs/adr/0002-data-retention-governance.md`, `docs/adr/0003-backup-restore-strategy.md`,
  `.env.example`

## Contexto

Deploy seguro + revisão de CORS/env de produção é item **P1** (antes de produção)
na Fase 3. A Sprint 3.6 auditou a configuração atual (env, CORS, Helmet, trust
proxy, rate limit, secrets, docker-compose, healthcheck) **sem** fazer deploy
real. A base já é boa (CORS recusa `*` em prod, errorHandler não vaza, logger
redige PII, fail-fast de Redis em redis mode, trust proxy configurável), mas
faltava registrar a **baseline** de deploy e fechar dois buracos de configuração
de produção.

Achados que motivam decisão:
- O placeholder de `JWT_SECRET` no `.env.example` tem >48 chars e **passava** na
  validação `min(48)` — produção poderia bootar com um segredo público.
- `RATE_LIMIT_STORE=memory` em produção era aceito **sem aviso** (em
  multi-instância o limite vira inútil), enquanto `TRUST_PROXY` já tinha warning.
- `docker-compose.yml` é local/dev, mas isso não estava decidido formalmente.

## Decisão

1. **Reverse-proxy/HTTPS first:** em produção a API fica **atrás de um reverse
   proxy com TLS** (Nginx/Traefik/Cloudflare). A API não termina TLS sozinha.
   (Requisito documentado; não implementado nesta sprint.)
2. **Configuração de produção explícita:** com `NODE_ENV=production`,
   `FRONTEND_ORIGIN` deve ser explícito (sem `*`, HTTPS) e os **placeholders** do
   `.env.example` (`JWT_SECRET`, `DATABASE_URL`) são **rejeitados no boot**.
3. **Trust proxy conforme hop count real:** atrás de proxy, `TRUST_PROXY` recebe o
   número de hops; default `false` (sem proxy) emite warning forte em produção.
4. **Rate limit compartilhado em multi-instância:** `RATE_LIMIT_STORE=redis`
   (com `REDIS_URL`) em produção multi-instância; `memory` em produção emite
   **warning** (mantido fail-fast só para o caso redis sem conexão).
5. **`docker-compose.yml` é local/dev**, não definição de produção. Produção usa
   banco/Redis gerenciados ou protegidos, secrets seguros, backups offsite e
   monitoramento (ver `docs/deploy-security-checklist.md`).

Mudanças de código desta sprint (pequenas, só produção): guardas de placeholder
em `config/env.ts` e warning de `RATE_LIMIT_STORE=memory` em `app.ts`. **Sem**
migration, schema, dependência, deploy real ou serviço externo.

## Consequências positivas

- Produção não sobe com segredo placeholder nem com CORS `*`.
- Postura de proxy/TLS, trust proxy e rate-limit store fica explícita e verificável.
- Checklist único (§15/§16 do documento) reduz erro humano antes de staging/prod.
- Dev permanece intacto (guardas só disparam em `NODE_ENV=production`).

## Consequências negativas / trade-offs

- HTTPS/proxy reais, secrets manager e offsite continuam **pendentes** (decisão é
  baseline + requisitos, não implementação).
- Guardas de placeholder são heurísticas (cobrem os placeholders conhecidos do
  `.env.example`), não uma política de força de segredo completa.
- Readiness com checagem de DB fica como melhoria futura (só liveness hoje).

## O que fica fora do escopo por enquanto

- deploy real / IaC (Terraform) / CI/CD completo;
- domínio, certificado e HTTPS reais; serviço externo real;
- secrets manager real e offsite real do backup;
- endpoint de readiness com checagem de dependências;
- afirmar produção pronta ou conformidade completa com LGPD/HIPAA/CFM.

## Critérios para considerar o deploy "pronto para produção" (futuro)

1. Reverse proxy + HTTPS reais (HTTP→HTTPS), HSTS efetivo.
2. `FRONTEND_ORIGIN`, `TRUST_PROXY`, `RATE_LIMIT_STORE`/`REDIS_URL` de produção
   definidos e verificados.
3. Postgres/Redis gerenciados/protegidos (sem porta pública).
4. Secrets manager + rotação de `JWT_SECRET`.
5. Backup offsite + gestão de chave + monitoramento (liga ao ADR 0003 e ao
   critério #10 do ADR 0002).
6. Logs centralizados + alertas; retenção validada juridicamente.
7. Revisão de segurança dedicada concluída.

> Nota: este ADR descreve **baseline e requisitos**. Não afirma conformidade
> completa nem produção pronta.
