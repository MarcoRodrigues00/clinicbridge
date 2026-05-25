# ClinicBridge — Plano Operacional AWS Sprint 3.41B

> **Sprint 3.41A — docs-only.** Este documento é o produto da sprint de decisão
> operacional. Nenhum recurso AWS real é criado aqui. O ClinicBridge **não está
> pronto para produção** (ver P1 em `docs/security-notes.md`).
>
> Relacionado: `docs/production-minimum-plan.md` (arquitetura e gaps),
> `docs/deploy-security-checklist.md` (checklist §15/§16),
> `docs/backup-offsite-runbook.md` (IAM + Restic),
> `docs/secrets-env-production-runbook.md` (SSM + geração de secrets),
> `docs/dns-tls-staging-runbook.md` (Certbot + Registro.br).

---

## 1. Recomendação principal: EC2 + Docker Compose

**Decisão recomendada: EC2 (t3.small) + Docker Compose como primeira etapa de infra.**

### Por quê não ECS/Fargate agora

| Critério | EC2 + Compose | ECS/Fargate |
|---|---|---|
| Complexidade de setup | Baixa — mesma stack do dev local | Alta — task definitions, ECR, ALB, IAM roles de task |
| Custo mínimo | ~$17/mês (t3.small) | ~$33+/mês (Fargate + ALB obrigatório para HTTPS) |
| Familiaridade do time | Alta — mesmo Compose | Curva de aprendizado extra |
| Tempo até primeiro deploy | 1-2 dias | 3-5+ dias |
| Adequação ao escopo | Piloto de 1 clínica, tráfego baixo | Justificado após crescimento horizontal |
| Path de migração | Gradual — Compose → Copilot → ECS | — |

**ECS/Fargate é a evolução natural**, mas adiciona overhead operacional
prematuro para um piloto de clínica única com tráfego baixo. Migrar quando
houver múltiplas clínicas ou necessidade real de escala horizontal.

### Topologia recomendada (MVP)

```
Internet
    │ 80/443
    ▼
EC2 t3.small (Amazon Linux 2023 ou Ubuntu 22.04 LTS)
  ├── Nginx (Docker, profile edge) ─── TLS (Certbot / Let's Encrypt)
  ├── backend (Docker, porta interna 3001)
  ├── Redis (Docker, porta interna 6379) ─── ou ElastiCache (ver §3)
  └── EBS volume (./storage/uploads, 20 GB)

EC2 SG: 80+443 público, 22 IP fixo do operador
    │ porta 5432 (rede interna VPC)
    ▼
RDS PostgreSQL db.t3.micro
  └── SG dedicado: porta 5432 só do SG da EC2

S3 Bucket (backup offsite Restic)
  └── IAM Instance Profile na EC2 (policy mínima do runbook §2.3)

SSM Parameter Store
  └── Secrets injetados como env no container (nunca em .env commitado)
```

---

## 2. Decisões que o dono precisa tomar

As 7 decisões abaixo **bloqueiam** o início da Sprint 3.41B. Sem elas, não é
possível provisionar recursos sem risco de refatoração cara.

| # | Decisão | Opção A (recomendada) | Opção B | Impacto |
|---|---|---|---|---|
| **D1** | **Região AWS** | `sa-east-1` (São Paulo) — proximidade com BR, conforto LGPD | `us-east-1` (mais barato ~15%, mais serviços) | Localização dos dados; latência |
| **D2** | **Orçamento mensal** | ~$50-60/mês (EC2 + RDS + ElastiCache) | ~$20-25/mês (EC2 + tudo em Docker) | Define D3, D4, D5 |
| **D3** | **Banco de produção** | RDS `db.t3.micro` (~$15-20/mês; backups automáticos; failover) | Postgres em container na EC2 (mais barato; backup só via Restic) | Segurança dos dados; custo |
| **D4** | **Redis de produção** | ElastiCache `cache.t3.micro` (~$12/mês; gerenciado) | Redis em container na EC2 (sem custo; risco se container cair) | Disponibilidade do rate limit |
| **D5** | **DNS** | Manter no Registro.br (registros A/CNAME manuais → EC2 IP) | Migrar para Route 53 (~$0.50/hosted zone/mês; integração ACM/ALB) | Custo; facilidade de TLS |
| **D6** | **TLS** | EC2 + Nginx + Certbot (gratuito; templates prontos) | Route 53 + ACM + ALB (~$16-20/mês; cert gerenciado) | Custo; complexidade |
| **D7** | **Storage de uploads** | EBS adicional 20 GB (~$1.60/mês; compatível com código atual) | S3 privado (requer sprint de refactor do upload service) | Compatibilidade; custo |

**Nota sobre D2 (orçamento):**
- **Caminho econômico (~$20-25/mês):** EC2 t3.small + Postgres container + Redis
  container. Adequado para staging/sandbox. **Risco de perda de dados em
  produção real** (sem backups automáticos do banco).
- **Caminho seguro (~$50-60/mês):** EC2 t3.small + RDS db.t3.micro + ElastiCache
  cache.t3.micro. Recomendado antes de qualquer dado real de clínica.

**Nota sobre D3:** se optar por Postgres em container para a Sprint 3.41B
(staging), o Restic offsite cobre o backup — mas antes de qualquer dado real
de paciente, RDS é a recomendação forte.

---

## 3. Checklist de execução Sprint 3.41B

Execute em ordem. Cada fase pode ser bloqueante para a seguinte.

### Fase 1 — Fundação AWS (sem EC2 ainda)

- [ ] **1.1** Confirmar conta AWS ativa; root account com MFA ativado.
- [ ] **1.2** Criar usuário IAM `clinicbridge-operator` (admin IAM, MFA obrigatório,
       nunca usar root para operações diárias).
- [ ] **1.3** Criar bucket S3 `clinicbridge-backups-prod` (região = D1):
  - Block all public access: **ativado**.
  - Versioning: **ativado**.
  - Default encryption: SSE-S3 (mínimo) ou SSE-KMS com CMK.
  - Bucket policy: negar HTTP puro (`aws:SecureTransport: false → Deny`).
- [ ] **1.4** Criar bucket S3 `clinicbridge-backups-staging` (mesmas configs; uso
       para o drill inicial).
- [ ] **1.5** Criar IAM role `clinicbridge-ec2-role` (type: EC2 instance profile):
  - Anexar policy mínima de Restic do `docs/backup-offsite-runbook.md` §2.3
    (escopo: `clinicbridge-backups-prod` e `clinicbridge-backups-staging`).
  - Anexar `AmazonSSMManagedInstanceCore` (para SSM Session Manager — evita SSH).
  - **Sem** permissões de `s3:*` nem credenciais root.
- [ ] **1.6** Criar SSM Parameters (SecureString; região = D1) seguindo
       `docs/secrets-env-production-runbook.md`:
  - `/clinicbridge/staging/JWT_SECRET`
  - `/clinicbridge/staging/DATABASE_URL`
  - `/clinicbridge/staging/MFA_ENCRYPTION_KEY`
  - `/clinicbridge/staging/REDIS_URL` (se ElastiCache) ou deixar vazio (Redis container)
  - `/clinicbridge/staging/RESTIC_PASSWORD` (nunca em `.env`)
  - `/clinicbridge/staging/RESTIC_REPOSITORY` (s3:`clinicbridge-backups-staging/...`)
  - Repetir bloco `/clinicbridge/prod/` (pode ser feito depois, antes do piloto real).

### Fase 2 — Rede e Security Groups

- [ ] **2.1** Usar VPC default (suficiente para MVP) ou criar VPC dedicada se
       preferir isolamento total.
- [ ] **2.2** Criar Security Group `sg-ec2` (descrição: ClinicBridge EC2):
  - Ingress: TCP 80 `0.0.0.0/0`; TCP 443 `0.0.0.0/0`; TCP 22 `<IP_OPERADOR>/32`.
  - Egress: all traffic (default).
- [ ] **2.3** Criar Security Group `sg-rds` (descrição: ClinicBridge RDS):
  - Ingress: TCP 5432 source `sg-ec2` apenas. **Nenhuma regra pública.**
- [ ] **2.4** Criar Security Group `sg-redis` (se ElastiCache — decisão D4):
  - Ingress: TCP 6379 source `sg-ec2` apenas. **Nenhuma regra pública.**

### Fase 3 — Camada de dados

- [ ] **3.1 (se D3 = RDS)** Provisionar RDS PostgreSQL:
  - Engine: PostgreSQL 15 ou 16; instância `db.t3.micro`.
  - VPC: mesma da EC2; subnet group privado; Security Group `sg-rds`.
  - Multi-AZ: desabilitado para MVP (habilitar antes de produção real).
  - Backups automáticos: **7 dias** de retenção (mínimo).
  - Storage: 20 GB gp2; autoscaling opcional.
  - `DATABASE_URL` resultante → SSM `/clinicbridge/staging/DATABASE_URL`.
- [ ] **3.2 (se D4 = ElastiCache)** Provisionar ElastiCache Redis:
  - Engine: Redis 7.x; instância `cache.t3.micro`; single node para MVP.
  - VPC/subnet/SG: mesmo padrão do RDS; Security Group `sg-redis`.
  - `REDIS_URL` resultante → SSM `/clinicbridge/staging/REDIS_URL`.

### Fase 4 — Compute (EC2)

- [ ] **4.1** Lançar EC2 `t3.small`:
  - AMI: Amazon Linux 2023 ou Ubuntu 22.04 LTS (LTS; sem Amazon Linux 2 — EOL 2025).
  - Região/AZ: D1.
  - Instance profile: `clinicbridge-ec2-role`.
  - Security Group: `sg-ec2`.
  - Key pair: criar ou usar existente (ou dispensar se usar SSM Session Manager).
  - EBS root: 20 GB gp3.
  - EBS adicional: 20 GB gp3, mountado em `/data/uploads` (se D7 = EBS).
- [ ] **4.2** Setup inicial na EC2 (via SSH ou SSM Session Manager):
  ```bash
  # Instalar Docker + Compose (Amazon Linux 2023)
  sudo dnf install -y docker git
  sudo systemctl enable --now docker
  sudo usermod -aG docker ec2-user
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose

  # Instalar Restic
  sudo dnf install -y restic   # ou baixar binário de releases.restic.net

  # Instalar pnpm + Node (para rodar migrations e seeds)
  curl -fsSL https://get.pnpm.io/install.sh | sh
  # reiniciar sessão para pnpm no PATH
  pnpm env use --global 20   # Node 20 LTS

  # Montar volume EBS (se D7 = EBS)
  sudo mkfs -t ext4 /dev/xvdf
  sudo mkdir -p /data/uploads && sudo mount /dev/xvdf /data/uploads
  echo "/dev/xvdf /data/uploads ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

  # Clonar repositório
  git clone <repo_url> /opt/clinicbridge && cd /opt/clinicbridge

  # Instalar dependências (apenas para migrations — sem devDependencies)
  pnpm install --frozen-lockfile
  ```
- [ ] **4.3** Injetar secrets do SSM em `.env` (nunca commitado):
  ```bash
  # Exemplo de injeção via AWS CLI (ec2 já tem instance profile)
  get_param() { aws ssm get-parameter --name "$1" --with-decryption \
    --query Parameter.Value --output text --region <REGION>; }

  cat > /opt/clinicbridge/.env <<EOF
  NODE_ENV=production
  JWT_SECRET=$(get_param /clinicbridge/staging/JWT_SECRET)
  DATABASE_URL=$(get_param /clinicbridge/staging/DATABASE_URL)
  MFA_ENCRYPTION_KEY=$(get_param /clinicbridge/staging/MFA_ENCRYPTION_KEY)
  REDIS_URL=$(get_param /clinicbridge/staging/REDIS_URL)
  FRONTEND_ORIGIN=https://app.clinicbridge.com.br
  TRUST_PROXY=1
  RATE_LIMIT_STORE=redis
  UPLOAD_DIR=/data/uploads
  EOF
  chmod 600 /opt/clinicbridge/.env
  ```
- [ ] **4.4** Rodar migrations:
  ```bash
  cd /opt/clinicbridge && pnpm --filter backend migrate:latest
  # Verificar: pnpm --filter backend migrate:status
  ```
- [ ] **4.5** Subir serviços:
  ```bash
  docker compose --profile edge up -d postgres redis backend nginx
  # Checar: docker compose ps
  # Liveness:  curl -s http://localhost:8080/health
  # Readiness: curl -s http://localhost:8080/health/ready
  ```

### Fase 5 — DNS e TLS

> Seguir `docs/dns-tls-staging-runbook.md` para o fluxo completo.

- [ ] **5.1** Apontar registros A no Registro.br:
  - `api.clinicbridge.com.br` → IP público da EC2.
  - `app.clinicbridge.com.br` → IP público da EC2 (frontend servido pelo Nginx).
  - Aguardar propagação (5-60 min; TTL do Registro.br).
- [ ] **5.2** Copiar template Nginx de produção:
  ```bash
  cp infra/nginx/conf.d/clinicbridge.production.conf.example \
     infra/nginx/conf.d/clinicbridge.production.conf
  # Editar server_name com domínios reais
  ```
- [ ] **5.3** Obter certificado Let's Encrypt via Certbot:
  ```bash
  # Nginx precisa estar rodando (porta 80 acessível)
  sudo certbot --nginx -d api.clinicbridge.com.br -d app.clinicbridge.com.br
  # Renovação automática: certbot renew --dry-run
  ```
- [ ] **5.4** Habilitar HSTS (descomentar no conf Nginx) **apenas após** HTTPS
       confirmado e estável. Verificar: `curl -I https://api.clinicbridge.com.br/health`.

### Fase 6 — Validação e backup

- [ ] **6.1** Smoke tests do `docs/testing-checklist.md`:
  - `GET /health` → 200.
  - `GET /health/ready` → 200 com DB up; 503 quando DB cai.
  - Login, upload CSV, dry-run.
- [ ] **6.2** Check de pré-flight do backup offsite:
  ```bash
  RESTIC_PASSWORD=$(get_param /clinicbridge/staging/RESTIC_PASSWORD) \
  RESTIC_REPOSITORY=$(get_param /clinicbridge/staging/RESTIC_REPOSITORY) \
  ./scripts/check-backup-offsite-env.sh --probe
  ```
- [ ] **6.3** Primeiro snapshot real:
  ```bash
  ./scripts/backup-offsite-restic.sh   # sem --dry-run
  ```
- [ ] **6.4** Restore drill offsite (**gate go/no-go**):
  ```bash
  RESTORE_DB=clinicbridge_restore_offsite_test \
  ./scripts/restore-offsite-restic.sh
  # Counts devem bater. Banco principal intocado.
  ```
- [ ] **6.5** Configurar agendamento do backup:
  - systemd-timer diário às 02:00 (horário de menor uso).
  - Alertar falha via CloudWatch Alarm em `/aws/events/...` ou e-mail SNS.

---

## 4. Estimativa de custo orientativa

> Valores aproximados (região sa-east-1); sem IVA/impostos locais; sujeito a
> variação. Não usar como orçamento fixo — verificar AWS Pricing Calculator.

| Componente | Opção econômica | Opção segura | Notas |
|---|---|---|---|
| EC2 t3.small | ~$17/mês | ~$17/mês | t3.micro ~$8/mês (apertado) |
| Postgres | $0 (container EC2) | ~$15-20/mês (RDS db.t3.micro) | RDS tem backups automáticos |
| Redis | $0 (container EC2) | ~$12/mês (ElastiCache t3.micro) | Container aceitável para rate limit |
| EBS uploads (20 GB gp3) | ~$1.60/mês | ~$1.60/mês | — |
| S3 backup (< 5 GB) | ~$0.10/mês | ~$0.10/mês | + requests e retrieval |
| Tráfego de saída | ~$1-5/mês | ~$1-5/mês | Baixo para piloto |
| SSM Parameters | ~$0/mês | ~$0/mês | Standard tier gratuito |
| CloudWatch Logs (básico) | ~$0.50/mês | ~$0.50/mês | Depende de volume |
| **Total estimado** | **~$20-25/mês** | **~$47-56/mês** | — |

**Recomendação:** opção segura (RDS) antes de qualquer dado real de paciente.
A diferença de ~$25-30/mês é baixa diante do risco de perda irreversível de dados.

---

## 5. Sequência simplificada (visão de dias)

| Dia | Atividade | Duração estimada |
|---|---|---|
| D+0 | Tomar decisões D1–D7; criar conta AWS / IAM operator | 1-2h |
| D+1 | Fase 1 (bucket S3 + IAM + SSM) | 2-3h |
| D+2 | Fase 2 (Security Groups) + Fase 3 (RDS/ElastiCache) | 2-4h |
| D+3 | Fase 4 (EC2 + setup + migrations + services up) | 3-5h |
| D+4 | Fase 5 (DNS + Certbot + HSTS) | 2-3h |
| D+4 | Fase 6 (smoke tests + backup drill) | 1-2h |
| **Total** | — | **~3-4 dias de trabalho (não contínuo)** |

---

## 6. Riscos e ressalvas

| Risco | Mitigação |
|---|---|
| IP da EC2 muda ao restartar (sem Elastic IP) | Alocar Elastic IP na EC2 antes de apontar DNS. Sem Elastic IP, o IP público muda a cada restart. |
| Secrets em logs acidentais | Boot guard em `config/env.ts`; logger redige campos sensíveis; `chmod 600 .env`. |
| EC2 sem Multi-AZ | Aceitável para piloto; planejar failover antes de usuários reais. |
| Migrations em produção sem snapshot prévio | Tirar snapshot manual do RDS antes de qualquer `migrate:latest` em produção. |
| HSTS ativado antes de HTTPS estável | Só habilitar HSTS após confirmar renovação automática do cert e sem rollback para HTTP. |
| Agendamento backup não configurado | Sem agendamento, backup depende de execução manual. Gate: 6.5 deve ser feito antes do piloto real. |
| `RESTIC_PASSWORD` perdida | Backup vira irrecuperável. Gravar no SSM antes de qualquer snapshot real. |
| Porta 22 com range amplo | `sg-ec2` deve restringir SSH ao IP fixo do operador. Preferir SSM Session Manager para evitar SSH completamente. |

---

## 7. Referências cruzadas

- `docs/production-minimum-plan.md` — arquitetura detalhada, opções, decisões pendentes §5
- `docs/deploy-security-checklist.md` — §15 (staging) e §16 (produção)
- `docs/backup-offsite-runbook.md` — IAM mínimo, SSM, restore drill
- `docs/secrets-env-production-runbook.md` — geração de secrets, SSM paths
- `docs/dns-tls-staging-runbook.md` — Certbot + Registro.br → HSTS
- `docs/security-notes.md` — ressalvas P1/P2/P3
- `infra/nginx/conf.d/clinicbridge.production.conf.example` — template Nginx prod
