# ClinicBridge — Plano de Produção Mínima Segura

> **Sprint 3.37 — Planejamento/docs somente.**
> Este documento NÃO constitui deploy real, nem configuração de infra, nem criação
> de recursos AWS. É um plano de referência para as sprints seguintes.
>
> Provedor preferido: **AWS** (direção aceita em 2026-05-24; decisões de sub-opção
> ainda pendentes — ver Seção 5). Outras opções (Hetzner, DigitalOcean, Railway)
> continuam válidas como fallback ou sandbox.
>
> Domínio registrado: **`clinicbridge.com.br`** (Registro.br; criado 2026-05-24;
> expira 2027-05-24). DNS ainda sem configuração para AWS — decisão de roteamento
> (Registro.br DNS vs Route 53) fica para Sprint 3.38.

---

## 1. Estado atual da infraestrutura local/staging

| Componente | Estado |
|---|---|
| Docker Compose — dev | ✅ Funcional (Postgres + Redis + backend + frontend) |
| Docker Compose — profile `edge` | ✅ Nginx + backend containerizado, HTTP:8080→HTTPS:8443 |
| TLS local | ✅ Cert autoassinado (`infra/nginx/certs/local/`; gitignored) |
| HTTP→HTTPS redirect | ✅ `clinicbridge.local.conf` retorna 301 |
| HSTS | ⚠️ Comentado intencionalmente (cert autoassinado quebraria localhost) |
| `TRUST_PROXY=1` no edge | ✅ Profile `edge` seta; `RATE_LIMIT_STORE=redis` |
| X-Real-IP / X-Forwarded-For | ✅ Nginx sobrescreve com `$remote_addr` (anti-spoof) |
| CORS | ✅ App-level (`FRONTEND_ORIGIN`); Nginx não emite headers CORS |
| Logs Nginx | ✅ Formato `clinicbridge_safe` (sem Authorization/Cookie/body) |
| Guards de boot | ✅ Falha se JWT_SECRET é placeholder ou DATABASE_URL é "change-me-locally" |
| `NODE_ENV` no container | ⚠️ `development` hardcoded no Dockerfile runtime stage (linha 29) |
| Migrations | ✅ Aplicadas localmente via host; não rodam no container |
| `./storage/uploads` | ⚠️ Bind mount local — não persiste em redeploy sem estratégia |
| Backup | ✅ Restic local validado (Sprint 3.5); **offsite pendente** |
| Domínio | ✅ `clinicbridge.com.br` registrado no Registro.br (2026-05-24; expira 2027-05-24); ⚠️ DNS sem configuração para AWS ainda |
| WAF | ❌ Não implementado (estratégia decidida em ADR 0005) |
| Secrets manager | ❌ Só `.env`; sem rotação, sem gestor externo |
| Logs centralizados | ❌ Stdout do container e arquivo Nginx; sem agregação |

---

## 2. Arquitetura AWS mínima preferida (não implementar agora)

> As opções abaixo são **direção e documentação** — não comprometem a escolha
> final. Cada sub-opção tem decisão pendente (Seção 5). Não criar recursos AWS,
> não configurar DNS, não gerar certificado até sprint específica.

### 2.1 Compute

| Opção | Quando usar |
|---|---|
| **EC2 (t3.small/medium) + Docker Compose** | MVP / piloto — menor overhead, time já domina Compose |
| **ECS/Fargate** | Evolução pós-MVP — managed scheduling, sem gerenciar VM |

**Preferência inicial:** EC2 + Docker Compose. Migrar para ECS/Fargate quando o
volume ou a necessidade de escala horizontal justificar o overhead operacional.

### 2.2 Banco de dados (PostgreSQL)

| Opção | Quando usar |
|---|---|
| **RDS PostgreSQL (db.t3.micro/small)** | Produção real — backups automáticos, patch gerenciado, failover |
| **Postgres em Docker na EC2** | Staging/sandbox controlado apenas |

**Preferência para produção real:** RDS. Fornece snapshots automáticos, Multi-AZ
opcional, rotação de credenciais via Secrets Manager e Security Group fechando a
porta 5432 para a internet.

### 2.3 Redis (rate limit / cache)

| Opção | Quando usar |
|---|---|
| **ElastiCache Redis (cache.t3.micro)** | Produção real — gerenciado, `RATE_LIMIT_STORE=redis` funciona sem mudança de código |
| **Redis em Docker na EC2** | Staging/sandbox apenas |

**Preferência para produção real:** ElastiCache. Redis porta 6379 nunca exposta
à internet (Security Group interno).

### 2.4 Storage de uploads

| Opção | Quando usar |
|---|---|
| **Volume EBS persistente (montado na EC2)** | Etapa inicial mais simples — compatível com `./storage/uploads` atual |
| **S3 (bucket privado + pré-signed URLs)** | Evolução preferida — desacopla storage do compute; exige mudança no upload service |

**Sequência preferida:** EBS no MVP (compatível com código atual), migrar para S3
em sprint futura dedicada (exige ADR de upload/storage + pré-signed URLs).

### 2.5 TLS / domínio / DNS

**Domínio registrado:** `clinicbridge.com.br` — Registro.br, criado 2026-05-24,
expira 2027-05-24. Não contratar hospedagem/e-mail/serviços extras no Registro.br.

**Estrutura de subdomínios planejada:**

| Subdomínio | Propósito |
|---|---|
| `clinicbridge.com.br` | Landing / site principal |
| `app.clinicbridge.com.br` | Aplicação web (frontend) |
| `api.clinicbridge.com.br` | Backend / API |
| `staging.clinicbridge.com.br` | Ambiente de staging |

**Decisão de DNS pendente (Sprint 3.38):**

| Opção | Prós | Contras |
|---|---|---|
| **Manter DNS no Registro.br** (registros A/CNAME apontando para AWS) | Domínio permanece no Registro.br; sem custo extra de Route 53; simples para MVP | Propagação manual; menos integração com ACM/ALB; TTLs do Registro.br |
| **Migrar DNS para Route 53** (hosted zone) | Integração nativa ACM, ALB, CloudFront; failover, health checks, latency routing | Custo ~$0.50/hosted zone/mês; mudança de NS no Registro.br necessária |

**Preferência inicial:** manter domínio e DNS no Registro.br por enquanto (registros
A/CNAME manuais apontando para IP da EC2 ou CNAME do ALB). Migrar para Route 53
se adotar ALB ou precisar de roteamento avançado. **Decidir na Sprint 3.38.**

**TLS — opções:**

| Opção | Quando usar |
|---|---|
| **EC2 + Nginx + Let's Encrypt/Certbot** | Preferência inicial — controle total, gratuito, renovação automática; compatível com Nginx existente (`infra/nginx/`) |
| **Route 53 + ACM + ALB** | Evolução — cert gerenciado automaticamente, integrado AWS; exige ALB (~$16-20/mês) e Route 53 |

**Preferência inicial:** EC2 + Nginx + Certbot. Troca o cert autoassinado local
pelo real; `infra/nginx/clinicbridge.local.conf` vira conf de produção com
`server_name api.clinicbridge.com.br`. HSTS ativado **somente após** HTTPS real
e estável.

### 2.6 Secrets

| Opção | Quando usar |
|---|---|
| **AWS Secrets Manager** | Rotação automática, integração RDS, audit no CloudTrail |
| **AWS SSM Parameter Store (SecureString)** | Mais simples e barato; suficiente para MVP |

**Preferência inicial:** SSM Parameter Store (custo menor). Migrar para Secrets
Manager ao precisar de rotação automática (especialmente `JWT_SECRET` e
credenciais RDS). `RESTIC_PASSWORD` **nunca** em `.env` — shell-only ou SSM.

### 2.7 Backup

| Mecanismo | Escopo |
|---|---|
| **RDS snapshots automáticos** | Banco (ponto no tempo; retenção configurável) |
| **Restic → S3 bucket offsite** | Uploads (`./storage/uploads` ou EBS); complementa RDS |
| **S3 Object Versioning** | Se uploads estiverem em S3, versionamento é backup nativo |

Restic local já está validado (Sprint 3.5). Sprint 3.40 implementa destino offsite
(S3 ou Backblaze B2 via rclone).

### 2.8 Logs

| Opção | Escopo |
|---|---|
| **CloudWatch Logs** | Destino natural em AWS; logs do container (`awslogs` driver no Compose/ECS) + Nginx access log |
| **Alarme CloudWatch** | Alertas de 5xx, taxa de erro, health check falhando |

**Preferência:** CloudWatch Logs como primeiro destino. Sem PII nos logs (log
format `clinicbridge_safe` já garante para Nginx; backend já redige campos
sensíveis).

### 2.9 Rede / Security Groups

Regras mínimas:
- **Porta 80 (HTTP)** — público (redirecionado para 443)
- **Porta 443 (HTTPS)** — público
- **Porta 3001 (backend Express)** — **interno apenas** (Nginx → backend)
- **Porta 5432 (PostgreSQL)** — **interno apenas** (EC2/ECS security group → RDS)
- **Porta 6379 (Redis)** — **interno apenas** (EC2/ECS security group → ElastiCache)
- **Porta 22 (SSH)** — IP fixo do operador apenas (ou AWS SSM Session Manager sem SSH)

Backend Express nunca exposto diretamente à internet. Único ponto de entrada
público: Nginx (80/443) ou ALB (se adotado).

---

## 3. Gaps priorizados para produção

### P0 — bloqueia qualquer deploy real

| Gap | Detalhe | Solução preferida |
|---|---|---|
| TLS real + domínio | Cert autoassinado ≠ produção; HSTS desabilitado | EC2 + Nginx + Certbot ou Route 53 + ACM + ALB |
| `NODE_ENV=development` no container | Linha 29 do Dockerfile hardcoda `development` no runtime | Remover o `ENV NODE_ENV=development` do runtime stage; passar via `environment:` no Compose/ECS |
| Postgres/Redis expostos | docker-compose expõe porta 5432 localmente; em EC2 sem SG seria público | Security Group: só acesso interno; EC2 + RDS + ElastiCache com SG dedicados |
| Secrets fora do `.env` local | `JWT_SECRET`, `DATABASE_URL`, `MFA_ENCRYPTION_KEY` no `.env` manual | SSM Parameter Store → injetar como variáveis de ambiente |

### P1 — necessário antes de primeiro usuário real

| Gap | Detalhe | Solução preferida |
|---|---|---|
| `MFA_ENCRYPTION_KEY` dedicada | Hoje opcional; secret TOTP cifrado não deve derivar de `JWT_SECRET` | Obrigatório em prod; SSM SecureString |
| Storage persistente seguro | `./storage/uploads` bind mount não sobrevive a troca de EC2 | EBS persistente (etapa 1) → S3 (evolução) |
| Backup offsite | Restic local validado; sem destino remoto | Restic → S3 bucket privado + agendamento |
| Validação jurídica de retenção | `docs/data-retention-policy.md` existe; aprovação jurídica pendente | Validação externa dos prazos e base legal |
| HSTS | Só habilitar com cert real e estável | Descomentar header após HTTPS confirmado |

### P2 — melhora segurança e operabilidade

| Gap | Detalhe |
|---|---|
| WAF detection-only | ModSecurity + OWASP CRS em Nginx; rollout progressivo (ADR 0005) |
| Logs centralizados | CloudWatch Logs com alarmes de 5xx/health |
| Readiness probe no orquestrador | `/health/ready` existe; Nginx/ECS deve consultá-lo antes de servir tráfego |
| Rotação de `JWT_SECRET` | Sem invalidação de tokens existentes; aceitar período de transição |
| S3 para uploads | Desacopla storage de compute; exige sprint dedicada (ADR) |
| ALB + Route 53 | Escalabilidade; cert ACM gerenciado; facilita Multi-AZ |

---

## 4. Sequência de sprints recomendada

| Sprint | Escopo | Tipo |
|---|---|---|
| **3.37** (este doc) | Plano de produção mínima + decisão AWS como preferida | Docs/planejamento |
| **3.38** | TLS real + DNS: decidir DNS (Registro.br vs Route 53); criar conf Nginx de prod (`api.clinicbridge.com.br`); cert Let's Encrypt/Certbot ou ACM; corrigir `NODE_ENV` no Dockerfile runtime; HSTS | Infra + código (Dockerfile runtime, nginx conf.d) |
| **3.39** | Secrets + env de prod: SSM Parameter Store para `JWT_SECRET`/`DATABASE_URL`/`MFA_ENCRYPTION_KEY`; script de bootstrap seguro; checklist de variáveis; `FRONTEND_ORIGIN` de prod | Docs + config + script |
| **3.40** | Backup offsite: Restic → S3 bucket privado; job agendado (cron/systemd); restore drill remoto | Scripts + docs |
| **3.41** | Storage persistente + banco/Redis de prod: volume EBS nomeado OU provisionar RDS + ElastiCache (staging first); Security Groups; firewall de porta | Infra + docs |
| **3.42** | Deploy checklist go/no-go: executar `docs/deploy-security-checklist.md` §15/§16; smoke tests em staging; confirmar todos P0/P1 resolvidos | QA/checklist |
| **3.43** | Piloto real: primeiro usuário com dados sintéticos ou anonimizados; monitorar CloudWatch, audit logs, health check; coletar feedback | Operacional |

> **Nota:** 3.38 e 3.39 podem ser reordenadas conforme a disponibilidade de
> domínio e credenciais AWS. 3.40 e 3.41 podem acontecer em paralelo se houver
> capacidade.

---

## 5. Decisões pendentes (dono do produto)

As decisões abaixo **precisam ser tomadas antes de iniciar as sprints de infra**:

| # | Decisão | Opções | Impacto |
|---|---|---|---|
| 1 | **Compute: EC2 + Docker Compose vs ECS/Fargate** | EC2 = simples, menor custo, time domina. ECS = managed, mais robusto a longo prazo. | Define como implantar Dockerfile, gerenciar restarts e escalar |
| 2 | **Banco: RDS/ElastiCache vs tudo em EC2 para MVP** | RDS = mais seguro, backups automáticos, custo ~$15-30/mês extra. EC2 = mais barato, risco de perda de dados. | Define backup de banco, failover, custo mensal |
| 3 | **Storage de uploads: EBS vs S3** | EBS = compatível com código atual (sem mudança), ~$0.08/GB/mês. S3 = pré-signed URLs, exige sprint de refactor. | Define Sprint 3.41 e se há sprint de refactor do upload service |
| 4 | **DNS: manter no Registro.br vs migrar para Route 53** | Registro.br = simples, sem custo extra, registros A/CNAME manuais. Route 53 = integração ACM/ALB, ~$0.50/hosted zone/mês, muda NS no Registro.br. **Domínio `clinicbridge.com.br` já registrado.** | Define Sprint 3.38; impacta opção de TLS e custo |
| 5 | **TLS: EC2 + Nginx + Certbot vs Route 53 + ACM + ALB** | Certbot = controle total, custo zero, renovação automática. ALB+ACM = mais integrado AWS, custo ~$16-20/mês do ALB. | Define Sprint 3.38; depende da decisão de DNS acima |
| 6 | **Secrets: AWS SSM Parameter Store vs Secrets Manager** | SSM SecureString = mais barato (~$0/10.000 req), suficiente para MVP. Secrets Manager = rotação automática, ~$0.40/secret/mês. | Define Sprint 3.39 |
| 7 | **Orçamento mensal aceitável** | Referência orientativa: EC2 t3.small ~$17, RDS t3.micro ~$25, ElastiCache t3.micro ~$12, EBS 20GB ~$1.60, tráfego ~$5. Total mínimo **~$60-80/mês** (RDS+ElastiCache gerenciados) ou **~$20-25/mês** (tudo em EC2 Docker). | Determina qual sub-opção de cada item acima é viável |

---

## 6. O que NÃO muda com este plano

- Código do backend/frontend: sem alteração.
- `Dockerfile`: sem alteração agora (correção do `NODE_ENV` ficará na Sprint 3.38).
- `infra/nginx/nginx.conf` e `clinicbridge.local.conf`: sem alteração agora.
- `.env.example`: sem alteração.
- Migrations: nenhuma nesta sprint.
- DNS/domínio: sem configuração de DNS ainda; `clinicbridge.com.br` apenas registrado.
- Recursos AWS: nenhum criado nesta sprint.
- Dados de produção: inexistentes — piloto ainda usa dados sintéticos/anonimizados.
- Compliance LGPD: validação jurídica pendente — **não afirmar compliance completo**.

---

## 7. Referências

- `docs/deploy-security-checklist.md` — checklist §15 (staging) e §16 (produção)
- `docs/adr/0004-deploy-security-baseline.md` — baseline de deploy e requisitos
- `docs/adr/0005-edge-security-reverse-proxy-waf.md` — estratégia Nginx + WAF
- `docs/adr/0003-backup-restore-strategy.md` — Restic-first
- `docs/data-retention-policy.md` — política técnica de retenção (validação jurídica pendente)
- `docs/nginx-local-staging-runbook.md` — runbook Nginx local/staging
- `docs/backup-restore-local-runbook.md` — runbook Restic local
- `docs/security-notes.md` — ressalvas P1/P2/P3 e invariantes de segurança
