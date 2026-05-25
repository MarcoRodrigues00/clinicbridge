# ClinicBridge — Runbook de Provisionamento AWS Real (Sprint 3.41B)

> **Sprint 3.41B — execução real, passo a passo.** Siga em ordem. Cada seção tem
> um caminho via **Console AWS** e um caminho via **AWS CLI**. Escolha um ou outro
> — não é necessário misturar.
>
> **REGRAS:**
> - Nenhum bloco CLI deve ser executado sem leitura prévia da seção inteira.
> - Placeholders em `<MAIÚSCULAS>` devem ser substituídos antes de qualquer execução.
> - Nenhum secret real é gerado ou armazenado neste documento.
> - Recursos que geram custo estão marcados com 💰.
> - Operações destrutivas estão marcadas com ⚠️.
>
> Relacionado: `docs/aws-infra-sprint-3.41-plan.md` (decisões e arquitetura),
> `docs/production-minimum-plan.md`, `docs/secrets-env-production-runbook.md`,
> `docs/backup-offsite-runbook.md`, `docs/dns-tls-staging-runbook.md`.

---

## 0. Antes de começar

### 0.1 Decisões já tomadas para este runbook

| Decisão | Valor |
|---|---|
| Região | `sa-east-1` (São Paulo) |
| Compute | EC2 t3.small + Docker Compose |
| DNS | Registro.br (registros A manuais) |
| TLS | Nginx + Certbot (Let's Encrypt) |
| Banco (staging) | Postgres container na EC2 (sem custo extra) |
| Banco (produção real) | RDS `db.t3.micro` (provisionar antes do piloto real) |
| Redis (staging) | Redis container na EC2 (sem custo extra) |
| Redis (produção real) | ElastiCache `cache.t3.micro` ou Redis container com AOF |
| Storage | EBS adicional 20 GB |
| Backup offsite | S3 privado `clinicbridge-backups-staging` / `-prod` |
| Secrets | SSM Parameter Store (SecureString) |

### 0.2 Console AWS vs AWS CLI

| Abordagem | Quando usar |
|---|---|
| **Console AWS** (navegador) | Preferível para o primeiro provisionamento — visual, confirmação antes de criar |
| **AWS CLI** | Útil para repetibilidade; todos os comandos abaixo são exemplos, **NÃO executar sem leitura** |

Para instalar/configurar a CLI (quando for usar):
```bash
# ⚠️ NÃO EXECUTAR automaticamente — só quando decidir usar CLI
# Instalar AWS CLI v2 (WSL / Linux):
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install

# Configurar com o usuário operador (seção 1.2):
aws configure --profile clinicbridge
# → pede: Access Key ID, Secret Access Key, Região (sa-east-1), Output (json)

# Testar:
aws sts get-caller-identity --profile clinicbridge
```

### 0.3 Convenções e nomes de recursos

| Recurso | Nome sugerido |
|---|---|
| Bucket backup staging | `clinicbridge-backups-staging` |
| Bucket backup produção | `clinicbridge-backups-prod` |
| IAM role EC2 | `clinicbridge-ec2-role` |
| IAM policy backup | `clinicbridge-restic-s3-policy` |
| SSM prefix staging | `/clinicbridge/staging/` |
| SSM prefix produção | `/clinicbridge/prod/` |
| SG da EC2 | `sg-clinicbridge-ec2` |
| SG do RDS | `sg-clinicbridge-rds` |
| SG do Redis | `sg-clinicbridge-redis` |
| EC2 (tag Name) | `clinicbridge-staging` / `clinicbridge-prod` |
| RDS identifier | `clinicbridge-db-staging` / `clinicbridge-db-prod` |
| ElastiCache cluster | `clinicbridge-redis-staging` |
| EBS (tag Name) | `clinicbridge-uploads-staging` |

### 0.4 Checklist de controle de custos 💰

Executar **antes** de criar qualquer recurso pago:

- [ ] Ativar **AWS Budgets** com alerta de e-mail ao atingir $30/mês (staging) e $80/mês (produção).
  - Console → Billing → Budgets → Create Budget → Cost budget → amount + e-mail alert.
- [ ] Ativar **CloudWatch Billing Alarm** em `us-east-1` (billing metrics só ficam lá):
  - CloudWatch → Alarms → Create → `BillingEstimatedCharges` > $30 → SNS → e-mail.
- [ ] **Evitar** NAT Gateway (custo ~$32/mês + tráfego). Não é necessário para este MVP.
- [ ] **Evitar** ALB (custo ~$16-20/mês). Certbot + Nginx na EC2 substitui com custo zero.
- [ ] **Evitar** Multi-AZ no RDS para staging e piloto inicial. Habilitar só para produção real estável.
- [ ] **Evitar** Elastic IP não associado (custo $0.005/hora enquanto desassociado). Associar imediatamente após criar ou liberar antes de terminar a EC2.
- [ ] **Nunca usar credenciais root** para operações diárias. Criar usuário IAM operador (seção 1).
- [ ] Marcar todos os recursos com tag `Project=clinicbridge` para rastrear custos no Cost Explorer.

---

## 1. Conta AWS — segurança e usuário operador

### 1.1 Proteger a conta root

- [ ] Acessar https://console.aws.amazon.com/ com a conta root (e-mail de cadastro).
- [ ] Ativar **MFA na conta root**:
  - Menu direito superior → Security Credentials → Multi-Factor Authentication (MFA) → Assign MFA device → Authenticator app → escanear QR code.
- [ ] **Nunca usar a conta root para operações diárias** após este passo.
- [ ] Anotar o Account ID (12 dígitos) — aparece em "My Account" → Account ID.

### 1.2 Criar usuário IAM operador com MFA

#### Modo Console AWS

1. IAM → Users → **Create user**.
2. Username: `clinicbridge-operator`. Marcar **"Provide user access to the AWS Management Console"** → I want to create an IAM user → custom password.
3. Permissions: **Attach policies directly** → `AdministratorAccess` (suficiente para o provisionamento inicial; restringir depois).
4. Tags: `Project=clinicbridge`, `Role=operator`.
5. Após criar, clicar no usuário → **Security credentials** → **Assign MFA device** → Authenticator app.
6. Gerar **Access Keys** para CLI: Security credentials → Create access key → CLI use case. Baixar `.csv` e guardar em local seguro (gerenciador de senhas — nunca em arquivo do projeto).

#### Modo CLI (a partir da conta root temporariamente)

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
# Criar usuário
aws iam create-user \
  --user-name clinicbridge-operator \
  --tags Key=Project,Value=clinicbridge Key=Role,Value=operator

# Anexar política de administrador
aws iam attach-user-policy \
  --user-name clinicbridge-operator \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# MFA deve ser ativado pelo Console (exige escanear QR code)

# Criar access key (substituir <ACCOUNT_ID> pelo ID real)
aws iam create-access-key --user-name clinicbridge-operator
# → guarda AccessKeyId e SecretAccessKey em gerenciador de senhas
```

> **Após criar o operador:** trocar para as credenciais do `clinicbridge-operator`
> e não usar mais a conta root. Se estiver usando CLI, `aws configure --profile clinicbridge`
> com as credenciais do operador.

---

## 2. S3 — Buckets de backup offsite 💰

> Custo: S3 Standard `sa-east-1` ~$0.023/GB/mês + requests. Para < 5 GB de backups,
> o custo fica em ~$0.10-0.50/mês.

### 2.1 Criar buckets (staging primeiro)

#### Modo Console AWS

1. S3 → **Create bucket**.
2. Bucket name: `clinicbridge-backups-staging`.
3. AWS Region: **sa-east-1** (South America / São Paulo).
4. **Object Ownership:** ACLs disabled (recomendado — ACL desabilitadas).
5. **Block Public Access:** ✅ todas as 4 opções marcadas (padrão AWS — não desmarcar).
6. **Bucket Versioning:** ✅ **Enable** (protege contra delete acidental de snapshots Restic).
7. **Default encryption:** ✅ Server-side encryption → SSE-S3 (AES-256) — mínimo aceitável.
   Opcional: SSE-KMS com CMK dedicada (custo adicional $1/mês pela CMK).
8. Tags: `Project=clinicbridge`, `Environment=staging`.
9. Create bucket.
10. Repetir para `clinicbridge-backups-prod` com `Environment=production`.

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
REGION=sa-east-1
PROFILE=clinicbridge

# Criar bucket staging
aws s3api create-bucket \
  --bucket clinicbridge-backups-staging \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION \
  --profile $PROFILE

# Bloquear acesso público
aws s3api put-public-access-block \
  --bucket clinicbridge-backups-staging \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile $PROFILE

# Habilitar versionamento
aws s3api put-bucket-versioning \
  --bucket clinicbridge-backups-staging \
  --versioning-configuration Status=Enabled \
  --profile $PROFILE

# Habilitar criptografia SSE-S3
aws s3api put-bucket-encryption \
  --bucket clinicbridge-backups-staging \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  --profile $PROFILE

# Adicionar tags
aws s3api put-bucket-tagging \
  --bucket clinicbridge-backups-staging \
  --tagging 'TagSet=[{Key=Project,Value=clinicbridge},{Key=Environment,Value=staging}]' \
  --profile $PROFILE

# Verificar configuração
aws s3api get-bucket-versioning --bucket clinicbridge-backups-staging --profile $PROFILE
aws s3api get-bucket-encryption --bucket clinicbridge-backups-staging --profile $PROFILE
aws s3api get-public-access-block --bucket clinicbridge-backups-staging --profile $PROFILE

# Repetir tudo para clinicbridge-backups-prod (substituir staging → prod)
```

### 2.2 Negar HTTP puro no bucket (hardening adicional)

#### Modo Console AWS

S3 → `clinicbridge-backups-staging` → Permissions → Bucket policy → Edit → colar:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::clinicbridge-backups-staging",
        "arn:aws:s3:::clinicbridge-backups-staging/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

> Repetir para `clinicbridge-backups-prod`.

---

## 3. IAM Role — Instance Profile da EC2

> Sem custo adicional. A role permite que a EC2 acesse S3 (backup) e SSM (secrets)
> sem credenciais explícitas no código ou no `.env`.

### 3.1 Criar policy mínima para Restic

#### Modo Console AWS

1. IAM → Policies → **Create policy** → JSON → colar (substituir os ARNs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ResticBucketList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::clinicbridge-backups-staging",
        "arn:aws:s3:::clinicbridge-backups-prod"
      ]
    },
    {
      "Sid": "ResticBucketObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::clinicbridge-backups-staging/*",
        "arn:aws:s3:::clinicbridge-backups-prod/*"
      ]
    }
  ]
}
```

2. Policy name: `clinicbridge-restic-s3-policy`. Tags: `Project=clinicbridge`.

#### Modo Console AWS — criar a role

1. IAM → Roles → **Create role**.
2. Trusted entity: **AWS service** → EC2.
3. Permissions: adicionar `clinicbridge-restic-s3-policy` + `AmazonSSMManagedInstanceCore`.
   - `AmazonSSMManagedInstanceCore` permite **SSM Session Manager** (acesso à EC2 sem SSH) e leitura de SSM Parameters.
4. Role name: `clinicbridge-ec2-role`. Tags: `Project=clinicbridge`.

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
PROFILE=clinicbridge

# Criar policy de backup Restic (substituir <ACCOUNT_ID>)
aws iam create-policy \
  --policy-name clinicbridge-restic-s3-policy \
  --policy-document file://docs/aws-iam-restic-policy.json \
  --tags Key=Project,Value=clinicbridge \
  --profile $PROFILE

# Criar role EC2
aws iam create-role \
  --role-name clinicbridge-ec2-role \
  --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --tags Key=Project,Value=clinicbridge \
  --profile $PROFILE

# Anexar policies (substituir <ACCOUNT_ID>)
aws iam attach-role-policy \
  --role-name clinicbridge-ec2-role \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/clinicbridge-restic-s3-policy \
  --profile $PROFILE

aws iam attach-role-policy \
  --role-name clinicbridge-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore \
  --profile $PROFILE

# Criar instance profile e associar a role
aws iam create-instance-profile \
  --instance-profile-name clinicbridge-ec2-profile \
  --profile $PROFILE

aws iam add-role-to-instance-profile \
  --instance-profile-name clinicbridge-ec2-profile \
  --role-name clinicbridge-ec2-role \
  --profile $PROFILE
```

---

## 4. SSM Parameter Store — secrets 💰

> Custo: Standard parameters são gratuitos (sem limite). Advanced parameters:
> $0.05/parâmetro/mês. Para MVP, Standard é suficiente.
>
> ⚠️ Todos os valores aqui são **placeholders** — nunca usar valores deste arquivo.
> Gerar conforme `docs/secrets-env-production-runbook.md`.

### 4.1 Gerar os secrets antes de criar os parâmetros

```bash
# ⚠️ NÃO executar no terminal do projeto — rodar em terminal seguro, anotar em gerenciador de senhas
# Gerar JWT_SECRET e MFA_ENCRYPTION_KEY:
openssl rand -hex 32   # JWT_SECRET → 64 chars hex
openssl rand -hex 32   # MFA_ENCRYPTION_KEY → 64 chars hex (DIFERENTE do JWT_SECRET)

# Gerar senha do Postgres:
openssl rand -base64 24   # DB_PASS → ~32 chars
# ou: LC_ALL=C tr -dc 'A-Za-z0-9!@#$%' </dev/urandom | head -c 32

# Gerar senha do Redis (se ElastiCache):
openssl rand -base64 24   # REDIS_PASS

# Gerar RESTIC_PASSWORD (salvar em gerenciador de senhas — nunca em arquivo/repo):
openssl rand -base64 32   # RESTIC_PASSWORD — PERDA = backup irrecuperável
```

### 4.2 Criar os parâmetros SSM (staging)

#### Modo Console AWS

Para cada parâmetro abaixo:
1. Systems Manager → Parameter Store → **Create parameter**.
2. Name: conforme a tabela.
3. Type: **SecureString**.
4. KMS key source: **My current account** → `aws/ssm` (chave gerenciada AWS, sem custo extra no Standard tier).
5. Value: o valor gerado no passo 4.1 (nunca o placeholder).

| Nome SSM | Descrição | Tipo |
|---|---|---|
| `/clinicbridge/staging/JWT_SECRET` | JWT signing secret (≥ 48 chars) | SecureString |
| `/clinicbridge/staging/MFA_ENCRYPTION_KEY` | Chave AES-GCM para TOTP (≥ 32 chars; ≠ JWT_SECRET) | SecureString |
| `/clinicbridge/staging/DATABASE_URL` | `postgresql://clinicbridge:<DB_PASS>@<DB_HOST>:5432/clinicbridge` | SecureString |
| `/clinicbridge/staging/REDIS_URL` | `redis://:<REDIS_PASS>@<REDIS_HOST>:6379` ou `redis://localhost:6379` se container | SecureString |
| `/clinicbridge/staging/FRONTEND_ORIGIN` | `https://app.clinicbridge.com.br` | String |
| `/clinicbridge/staging/RESTIC_PASSWORD` | Senha do repositório Restic (nunca em `.env`) | SecureString |
| `/clinicbridge/staging/RESTIC_REPOSITORY` | `s3:s3.sa-east-1.amazonaws.com/clinicbridge-backups-staging/staging` | String |

> Repetir bloco `/clinicbridge/prod/` antes do piloto real (mesmo padrão, valores distintos).

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
# Substituir <VALOR_REAL> pelo valor gerado no passo 4.1
PROFILE=clinicbridge
REGION=sa-east-1

put_param() {
  aws ssm put-parameter \
    --name "$1" \
    --value "$2" \
    --type "$3" \
    --region $REGION \
    --profile $PROFILE \
    --tags Key=Project,Value=clinicbridge Key=Environment,Value=staging
}

put_param "/clinicbridge/staging/JWT_SECRET" "<VALOR_REAL>" "SecureString"
put_param "/clinicbridge/staging/MFA_ENCRYPTION_KEY" "<VALOR_REAL>" "SecureString"
put_param "/clinicbridge/staging/DATABASE_URL" "postgresql://clinicbridge:<DB_PASS>@<DB_HOST>:5432/clinicbridge" "SecureString"
put_param "/clinicbridge/staging/REDIS_URL" "redis://localhost:6379" "SecureString"
put_param "/clinicbridge/staging/FRONTEND_ORIGIN" "https://app.clinicbridge.com.br" "String"
put_param "/clinicbridge/staging/RESTIC_PASSWORD" "<VALOR_REAL>" "SecureString"
put_param "/clinicbridge/staging/RESTIC_REPOSITORY" "s3:s3.sa-east-1.amazonaws.com/clinicbridge-backups-staging/staging" "String"

# Verificar (sem revelar valor):
aws ssm get-parameter --name /clinicbridge/staging/JWT_SECRET \
  --region $REGION --profile $PROFILE --query Parameter.Type
# → deve retornar "SecureString"
```

---

## 5. VPC e Security Groups

> Sem custo para VPC e Security Groups. Usar a **VPC default** é suficiente para MVP.

### 5.1 Verificar VPC default

#### Modo Console AWS

1. VPC → Your VPCs → verificar que existe a VPC com tag `Name=default` e `isDefault=Yes`.
2. Anotar o **VPC ID** (ex.: `vpc-0abc1234`) — será necessário nos próximos passos.
3. VPC → Subnets → anotar os IDs de pelo menos 2 subnets na VPC default (ex.: `subnet-0abc`, `subnet-0def`).

### 5.2 Security Group da EC2

#### Modo Console AWS

1. VPC → Security Groups → **Create security group**.
2. Name: `sg-clinicbridge-ec2`. Description: `ClinicBridge EC2 — public HTTP/HTTPS + SSH operator`.
3. VPC: selecionar a VPC default.
4. Inbound rules:

| Type | Protocol | Port | Source | Descrição |
|---|---|---|---|---|
| HTTP | TCP | 80 | 0.0.0.0/0 | Let's Encrypt challenge + redirect |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Tráfego público |
| SSH | TCP | 22 | `<SEU_IP>/32` | ⚠️ **Somente IP fixo do operador** |

> **Sobre SSH:** se preferir usar **SSM Session Manager** (recomendado), não é necessário
> abrir a porta 22. A instância profile `AmazonSSMManagedInstanceCore` já permite acesso
> via console/browser sem SSH. Nesse caso, omitir a regra de SSH.
>
> Para descobrir seu IP: `curl -s https://checkip.amazonaws.com`

5. Outbound rules: manter o padrão (all traffic).
6. Tags: `Project=clinicbridge`, `Name=sg-clinicbridge-ec2`.

### 5.3 Security Group do RDS

1. VPC → Security Groups → **Create security group**.
2. Name: `sg-clinicbridge-rds`. Description: `ClinicBridge RDS — PostgreSQL internal only`.
3. VPC: VPC default.
4. Inbound rules:

| Type | Protocol | Port | Source | Descrição |
|---|---|---|---|---|
| PostgreSQL | TCP | 5432 | `sg-clinicbridge-ec2` | **Apenas da EC2** |

> **Porta 5432 nunca deve ser aberta para 0.0.0.0/0.**

5. Outbound rules: manter o padrão.
6. Tags: `Project=clinicbridge`, `Name=sg-clinicbridge-rds`.

### 5.4 Security Group do Redis/ElastiCache (se usar ElastiCache)

1. VPC → Security Groups → **Create security group**.
2. Name: `sg-clinicbridge-redis`. Description: `ClinicBridge Redis — internal only`.
3. VPC: VPC default.
4. Inbound rules:

| Type | Protocol | Port | Source | Descrição |
|---|---|---|---|---|
| Custom TCP | TCP | 6379 | `sg-clinicbridge-ec2` | **Apenas da EC2** |

> **Porta 6379 nunca deve ser aberta para 0.0.0.0/0.**

5. Tags: `Project=clinicbridge`, `Name=sg-clinicbridge-redis`.

#### Modo CLI (SGs)

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
PROFILE=clinicbridge
REGION=sa-east-1
VPC_ID=<VPC_ID_DEFAULT>   # obter no console
MEU_IP=<SEU_IP>           # curl -s https://checkip.amazonaws.com

# SG da EC2
SG_EC2=$(aws ec2 create-security-group \
  --group-name sg-clinicbridge-ec2 \
  --description "ClinicBridge EC2 public HTTP/HTTPS + SSH operator" \
  --vpc-id $VPC_ID \
  --region $REGION --profile $PROFILE \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_EC2 \
  --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTP public"}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTPS public"}]' \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${MEU_IP}/32,Description=\"SSH operator only\"}]" \
  --region $REGION --profile $PROFILE

# SG do RDS
SG_RDS=$(aws ec2 create-security-group \
  --group-name sg-clinicbridge-rds \
  --description "ClinicBridge RDS PostgreSQL internal" \
  --vpc-id $VPC_ID \
  --region $REGION --profile $PROFILE \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_RDS \
  --ip-permissions \
    "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=${SG_EC2},Description=\"From EC2 only\"}]" \
  --region $REGION --profile $PROFILE

# SG do Redis (opcional)
SG_REDIS=$(aws ec2 create-security-group \
  --group-name sg-clinicbridge-redis \
  --description "ClinicBridge Redis internal" \
  --vpc-id $VPC_ID \
  --region $REGION --profile $PROFILE \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_REDIS \
  --ip-permissions \
    "IpProtocol=tcp,FromPort=6379,ToPort=6379,UserIdGroupPairs=[{GroupId=${SG_EC2},Description=\"From EC2 only\"}]" \
  --region $REGION --profile $PROFILE
```

---

## 6. RDS PostgreSQL 💰

> 💰 Custo: `db.t3.micro` em `sa-east-1` ~$15-20/mês (Single-AZ). Storage 20 GB gp2 ~$2/mês.
> **Provisionar para produção real** — para staging, Postgres container na EC2 é suficiente
> e elimina este custo.

### Modo Console AWS

1. RDS → **Create database**.
2. Engine: **PostgreSQL**. Version: **PostgreSQL 16** (ou 15).
3. Template: **Free tier** (usa `db.t3.micro`; disponível nas primeiras 12 meses na conta nova).
4. Settings:
   - DB instance identifier: `clinicbridge-db-staging`.
   - Master username: `clinicbridge`.
   - Master password: `<DB_PASS>` (o gerado no passo 4.1 — não usar o placeholder).
5. Instance configuration: `db.t3.micro`.
6. Storage: 20 GB, gp2. **Storage autoscaling: desmarcar** para controlar custos no piloto.
7. Connectivity:
   - VPC: VPC default.
   - Public access: **No** (nunca público).
   - VPC security group: selecionar `sg-clinicbridge-rds` (remover o `default`).
8. Additional configuration:
   - Initial database name: `clinicbridge`.
   - Backup retention: **7 days** (mínimo aceitável para produção).
   - Enable deletion protection: ✅ (recomendado para produção; pode desabilitar para staging de teste).
9. Tags: `Project=clinicbridge`, `Environment=staging`.
10. Create database. Aguardar ~5 min para ficar `Available`.
11. Após criar: copiar o **Endpoint** (ex.: `clinicbridge-db-staging.xyz.sa-east-1.rds.amazonaws.com`).
    - Atualizar SSM `/clinicbridge/staging/DATABASE_URL` com o endpoint real.

> ⚠️ **Antes de qualquer migration**, tirar um snapshot manual:
> RDS → Databases → `clinicbridge-db-staging` → Actions → Take snapshot.

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha antes
PROFILE=clinicbridge
REGION=sa-east-1

aws rds create-db-instance \
  --db-instance-identifier clinicbridge-db-staging \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "16.3" \
  --master-username clinicbridge \
  --master-user-password "<DB_PASS>" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --no-publicly-accessible \
  --vpc-security-group-ids <SG_RDS_ID> \
  --db-name clinicbridge \
  --backup-retention-period 7 \
  --no-deletion-protection \
  --tags Key=Project,Value=clinicbridge Key=Environment,Value=staging \
  --region $REGION --profile $PROFILE

# Aguardar disponibilidade (~5 min):
aws rds wait db-instance-available \
  --db-instance-identifier clinicbridge-db-staging \
  --region $REGION --profile $PROFILE

# Obter endpoint:
aws rds describe-db-instances \
  --db-instance-identifier clinicbridge-db-staging \
  --query "DBInstances[0].Endpoint.Address" \
  --region $REGION --profile $PROFILE --output text
```

---

## 7. Redis 💰

### Opção A — Redis container na EC2 (staging / orçamento limitado)

> Sem custo extra. Rode junto com o Docker Compose na EC2 (já está no `docker-compose.yml`).
> Lembrete: Redis container perde dados ao reiniciar o container (aceitável para rate limiting).

Não há nada a provisionar na AWS. O `docker-compose.yml` já inclui o serviço `redis`.
Atualizar SSM `/clinicbridge/staging/REDIS_URL` para `redis://redis:6379` (nome do container
na rede do Compose) ou `redis://127.0.0.1:6379`.

### Opção B — ElastiCache Redis 💰 (produção real recomendada)

> 💰 Custo: `cache.t3.micro` em `sa-east-1` ~$12/mês.

#### Modo Console AWS

1. ElastiCache → **Create Redis OSS cache**.
2. Deployment option: **Design your own cache** → Cluster cache.
3. Cluster info: name `clinicbridge-redis-staging`.
4. Node type: `cache.t3.micro`.
5. Number of replicas: **0** (Single node para staging/piloto).
6. Subnet group: criar novo → usar as subnets da VPC default.
7. Security groups: selecionar `sg-clinicbridge-redis`.
8. **In-transit encryption:** Enable (se suportado; exige `REDIS_URL` com TLS `rediss://`).
9. Tags: `Project=clinicbridge`, `Environment=staging`.
10. Após criar, copiar o endpoint primário → atualizar SSM `/clinicbridge/staging/REDIS_URL`.

---

## 8. EC2 + EBS 💰

> 💰 Custo: `t3.small` em `sa-east-1` ~$17/mês + EBS 20 GB gp3 ~$1.60/mês.

### 8.1 Alocar Elastic IP (antes de lançar a EC2)

> ⚠️ **Elastic IP não associado cobra $0.005/hora (~$3.60/mês).** Associar à EC2 imediatamente.

#### Modo Console AWS

1. EC2 → Elastic IPs → **Allocate Elastic IP address**.
2. Network border group: `sa-east-1`.
3. Tags: `Project=clinicbridge`, `Name=clinicbridge-eip`.
4. Anotar o IP alocado (ex.: `54.123.45.67`). **Não criar DNS ainda** — configurar depois.

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente
EIP=$(aws ec2 allocate-address \
  --domain vpc \
  --region sa-east-1 --profile clinicbridge \
  --query AllocationId --output text)
echo "EIP Allocation ID: $EIP"
```

### 8.2 Lançar a EC2

#### Modo Console AWS

1. EC2 → **Launch instance**.
2. Name: `clinicbridge-staging`.
3. AMI: **Ubuntu Server 22.04 LTS** (free tier eligible; buscar em "Quick Start" → Ubuntu).
4. Instance type: **t3.small**.
5. Key pair: criar novo ou selecionar existente (guardar a `.pem` em local seguro).
   > Se usar SSM Session Manager, key pair pode ser omitido — sem SSH necessário.
6. Network settings:
   - VPC: VPC default.
   - Subnet: qualquer subnet pública da VPC default.
   - Auto-assign public IP: **Disable** (vamos usar o Elastic IP alocado).
   - Security group: selecionar `sg-clinicbridge-ec2`.
7. Storage: root volume **20 GB gp3** (mínimo para OS + Docker images).
8. Advanced details → IAM instance profile: `clinicbridge-ec2-profile`.
9. Tags: `Project=clinicbridge`, `Environment=staging`, `Name=clinicbridge-staging`.
10. Launch instance. Aguardar ficar `Running`.
11. **Associar Elastic IP:** EC2 → Elastic IPs → selecionar o EIP → Actions → Associate →
    Instance: `clinicbridge-staging`. **Fazer isso imediatamente após a instância subir.**

### 8.3 Volume EBS adicional para uploads

> 💰 Custo: 20 GB gp3 ~$1.60/mês.

#### Modo Console AWS

1. EC2 → Volumes → **Create volume**.
2. Volume type: `gp3`. Size: `20` GiB. AZ: **mesma AZ** da EC2 (ex.: `sa-east-1a`).
3. Tags: `Project=clinicbridge`, `Name=clinicbridge-uploads-staging`.
4. Create volume.
5. Após criar: selecionar o volume → Actions → **Attach volume** →
   Instance: `clinicbridge-staging`. Device: `/dev/sdf` (ou aceitar sugestão).

### 8.4 Setup inicial na EC2

> Acessar via SSH ou SSM Session Manager. Todos os comandos abaixo rodam **dentro** da EC2.

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha

# — Conectar via SSH:
ssh -i <PATH_TO_PEM> ubuntu@<ELASTIC_IP>
# — OU via SSM Session Manager (sem SSH):
# AWS Console → EC2 → Instances → selecionar instância → Connect → Session Manager → Connect

# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y docker.io git curl unzip jq

# Habilitar Docker
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
# → sair e reconectar para o grupo Docker ter efeito

# Instalar Docker Compose v2
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version   # deve retornar 2.x

# Instalar Restic
sudo apt install -y restic
restic version   # deve retornar 0.16+

# Instalar AWS CLI v2 (para injeção de secrets do SSM)
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
aws --version   # deve retornar aws-cli/2.x

# Instalar pnpm + Node 20 (para migrations)
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc   # ou abrir novo shell
pnpm env use --global 20
node --version     # deve retornar v20.x

# Montar volume EBS de uploads
sudo lsblk   # identificar o disco (ex.: nvme1n1 ou xvdf)
# Se não formatado:
sudo mkfs -t ext4 /dev/nvme1n1   # ⚠️ ajustar o device conforme lsblk
sudo mkdir -p /data/uploads
sudo mount /dev/nvme1n1 /data/uploads
# Persistir no fstab (usar UUID para evitar erro em reboot):
DISK_UUID=$(sudo blkid /dev/nvme1n1 -s UUID -o value)
echo "UUID=$DISK_UUID /data/uploads ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
# Verificar:
sudo mount -a && df -h /data/uploads   # deve mostrar ~20G available

# Clonar repositório
git clone <URL_DO_REPO> /opt/clinicbridge
cd /opt/clinicbridge

# Instalar dependências (somente para migrations — sem devDependencies em produção)
pnpm install --frozen-lockfile
```

### 8.5 Injetar secrets do SSM e criar `.env`

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar cada linha
# Na EC2 — a instance profile já permite acesso ao SSM
cd /opt/clinicbridge

get_param() {
  aws ssm get-parameter \
    --name "$1" \
    --with-decryption \
    --region sa-east-1 \
    --query Parameter.Value \
    --output text
}

# Criar .env de produção/staging (nunca commitar este arquivo)
cat > /opt/clinicbridge/.env << EOF
NODE_ENV=production
BACKEND_PORT=3001
LOG_LEVEL=info

DATABASE_URL=$(get_param /clinicbridge/staging/DATABASE_URL)
JWT_SECRET=$(get_param /clinicbridge/staging/JWT_SECRET)
JWT_EXPIRES_IN=1h
MFA_ENCRYPTION_KEY=$(get_param /clinicbridge/staging/MFA_ENCRYPTION_KEY)

FRONTEND_ORIGIN=$(get_param /clinicbridge/staging/FRONTEND_ORIGIN)

REDIS_URL=$(get_param /clinicbridge/staging/REDIS_URL)
RATE_LIMIT_STORE=redis

TRUST_PROXY=1
UPLOAD_DIR=/data/uploads
UPLOAD_MAX_BYTES=5242880
IMPORT_MAX_ROWS=100
EOF

chmod 600 /opt/clinicbridge/.env
# Verificar que não está versionado:
git -C /opt/clinicbridge check-ignore -q .env && echo ".env ignorado OK"
```

> ⚠️ Nunca logar o conteúdo do `.env`. Nunca commitar o `.env`. Verificar que `.gitignore`
> cobre `.env` antes de qualquer `git add`.

### 8.6 Rodar migrations

```bash
# ⚠️ NÃO EXECUTAR automaticamente
# ⚠️ Para RDS de produção: tirar snapshot manual antes de qualquer migrate:latest
cd /opt/clinicbridge

# Verificar status antes de migrar:
pnpm --filter backend migrate:status

# Aplicar migrations:
pnpm --filter backend migrate:latest

# Verificar novamente (todas as migrations devem aparecer como "Ran"):
pnpm --filter backend migrate:status
```

### 8.7 Subir serviços

```bash
# ⚠️ NÃO EXECUTAR automaticamente
cd /opt/clinicbridge

# Subir com profile edge (Nginx + backend + redis container):
docker compose --profile edge up -d

# Verificar containers:
docker compose ps
# Esperado: postgres (se using local), redis, backend, nginx — todos Up

# Liveness check (ainda sem HTTPS):
curl -s http://localhost/health
# Esperado: {"status":"ok","service":"clinicbridge",...}

# Readiness check:
curl -s http://localhost/health/ready
# Esperado: {"status":"ready","checks":{"database":"ok"}}
# ou 503 se RDS não estiver acessível (verificar SG e DATABASE_URL)
```

---

## 9. DNS no Registro.br

> Seguir os passos detalhados em `docs/dns-tls-staging-runbook.md` §2.
> Resumo executável:

- [ ] **9.1** Acessar https://registro.br → login com a conta do domínio.
- [ ] **9.2** Meus Domínios → `clinicbridge.com.br` → Configurar DNS / Editar Zona.
- [ ] **9.3** Criar registros A:

| Tipo | Host | Valor | TTL |
|---|---|---|---|
| A | `@` (raiz) | `<ELASTIC_IP>` | 3600 |
| A | `api` | `<ELASTIC_IP>` | 3600 |
| A | `app` | `<ELASTIC_IP>` | 3600 |
| A | `staging` | `<ELASTIC_IP>` | 3600 |

- [ ] **9.4** Aguardar propagação (~5-60 min):
  ```bash
  # ⚠️ NÃO EXECUTAR automaticamente
  # Verificar propagação (rodar na máquina local / WSL):
  dig api.clinicbridge.com.br +short       # deve retornar <ELASTIC_IP>
  dig staging.clinicbridge.com.br +short
  # Ferramenta visual: https://dnschecker.org
  ```

---

## 10. TLS com Certbot

> Seguir `docs/dns-tls-staging-runbook.md` §3–4 para o fluxo completo.
> Resumo executável (rodar **na EC2** após DNS propagado):

```bash
# ⚠️ NÃO EXECUTAR automaticamente — verificar pré-requisitos antes
# Pré-requisitos: DNS propagado, porta 80 aberta no SG, Nginx parado

# Instalar Certbot:
sudo apt install -y certbot

# Parar Nginx temporariamente (modo standalone usa porta 80 diretamente):
docker compose --profile edge stop nginx

# Emitir cert para staging primeiro (erro não afeta domínio real):
sudo certbot certonly --standalone \
  -d staging.clinicbridge.com.br \
  --agree-tos \
  --email admin@clinicbridge.com.br \
  --non-interactive

# Após confirmar staging OK, emitir para domínio principal:
sudo certbot certonly --standalone \
  -d api.clinicbridge.com.br \
  --agree-tos \
  --email admin@clinicbridge.com.br \
  --non-interactive

# Verificar certs gerados:
sudo ls /etc/letsencrypt/live/api.clinicbridge.com.br/
# Esperado: cert.pem  chain.pem  fullchain.pem  privkey.pem

# Testar renovação automática (sem emitir cert real):
sudo certbot renew --dry-run
# Esperado: "Congratulations, all simulated renewals succeeded"

# Copiar template Nginx e ativar configuração de produção:
cp infra/nginx/conf.d/clinicbridge.production.conf.example \
   infra/nginx/conf.d/clinicbridge.production.conf
# Editar server_name e caminhos do cert no arquivo copiado.

# Subir Nginx novamente:
docker compose --profile edge up -d nginx
```

> ⚠️ **HSTS:** NÃO ativar ainda. Só descomentar `Strict-Transport-Security` após:
> HTTPS confirmado, renovação automática testada, sem necessidade de voltar para HTTP.

---

## 11. Smoke tests

Executar em sequência após DNS e TLS ativos. Ver `docs/testing-checklist.md` para a lista completa.

```bash
# ⚠️ NÃO EXECUTAR automaticamente — executar manualmente, verificar cada resposta

# 1. Redirect HTTP → HTTPS
curl -I http://api.clinicbridge.com.br/health
# Esperado: 301 Location: https://api.clinicbridge.com.br/health

# 2. Liveness
curl -s https://api.clinicbridge.com.br/health | jq .
# Esperado: {"status":"ok","service":"clinicbridge",...}

# 3. Readiness (DB)
curl -s https://api.clinicbridge.com.br/health/ready | jq .
# Esperado: {"status":"ready","checks":{"database":"ok"}}

# 4. Certificado TLS
echo | openssl s_client -connect api.clinicbridge.com.br:443 \
  -servername api.clinicbridge.com.br 2>/dev/null \
  | openssl x509 -noout -dates -issuer
# Esperado: issuer=Let's Encrypt, notAfter=daqui ~90 dias

# 5. NODE_ENV no container
docker compose exec backend sh -c 'echo NODE_ENV=$NODE_ENV'
# Esperado: production

# 6. Login básico (substituir credenciais de teste)
curl -s -X POST https://api.clinicbridge.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<EMAIL_TESTE>","password":"<SENHA_TESTE>"}' | jq .status
# Esperado: 200 com token ou {"error":...} — nunca stack/SQL

# 7. Rate limit (deve retornar 429 após muitas tentativas em <60s)
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://api.clinicbridge.com.br/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}'
done
# Esperado: 429 em algum momento (AUTH_RATE_LIMIT_MAX=20 por default)

# 8. Headers de segurança
curl -s -I https://api.clinicbridge.com.br/health | grep -iE 'x-frame|x-content|server'
# Esperado: X-Frame-Options, X-Content-Type-Options; Server: nginx (sem versão)

# 9. Logs Nginx sem PII
docker compose logs nginx --tail=20
# Verificar: sem Authorization, sem Cookie, sem query string com tokens
```

---

## 12. Backup offsite drill (gate go/no-go) ⚠️

> **Não prosseguir para o piloto real sem este gate aprovado.**
> Seguir `docs/backup-offsite-runbook.md` para o fluxo completo.

```bash
# ⚠️ NÃO EXECUTAR automaticamente — executar com calma, verificar cada etapa

# 1. Injetar RESTIC_PASSWORD do SSM (nunca salvar em arquivo):
export RESTIC_PASSWORD=$(aws ssm get-parameter \
  --name /clinicbridge/staging/RESTIC_PASSWORD \
  --with-decryption --region sa-east-1 --query Parameter.Value --output text)
export RESTIC_REPOSITORY=$(aws ssm get-parameter \
  --name /clinicbridge/staging/RESTIC_REPOSITORY \
  --region sa-east-1 --query Parameter.Value --output text)

# 2. Pré-flight check:
./scripts/check-backup-offsite-env.sh --probe
# Esperado: todos os checks OK, conectividade com S3 confirmada

# 3. Primeiro snapshot real:
./scripts/backup-offsite-restic.sh
# Esperado: snapshot criado sem erros, tags clinicbridge/offsite/ts:<TS>

# 4. Restore drill em banco SEPARADO (⚠️ NUNCA apontar para o banco principal):
RESTORE_DB=clinicbridge_restore_offsite_test \
./scripts/restore-offsite-restic.sh
# Esperado:
#   - Counts de patients/import_files/import_sessions batem com o banco principal
#   - Banco principal intocado (verificar via psql ou health/ready)

# 5. Limpar banco de restore após drill:
# (opcional — o script já isola em banco separado)
dropdb -h <DB_HOST> -U clinicbridge clinicbridge_restore_offsite_test

# 6. Revogar variáveis de ambiente da sessão:
unset RESTIC_PASSWORD RESTIC_REPOSITORY
```

### 12.1 Agendar backup periódico (após drill aprovado)

```bash
# ⚠️ NÃO EXECUTAR automaticamente — configurar apenas após drill aprovado
# systemd-timer (Ubuntu 22.04):
sudo tee /etc/systemd/system/clinicbridge-backup.service << 'EOF'
[Unit]
Description=ClinicBridge offsite backup (Restic → S3)
After=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/opt/clinicbridge
EnvironmentFile=/opt/clinicbridge/.env.backup
ExecStart=/opt/clinicbridge/scripts/backup-offsite-restic.sh
EOF

sudo tee /etc/systemd/system/clinicbridge-backup.timer << 'EOF'
[Unit]
Description=ClinicBridge backup diário 02:00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now clinicbridge-backup.timer
sudo systemctl list-timers clinicbridge-backup.timer
```

> `.env.backup` deve conter apenas `RESTIC_PASSWORD` e `RESTIC_REPOSITORY`, com
> `chmod 600`. Nunca commitar. Alternativa: injetar do SSM no ExecStart com script wrapper.

---

## 13. Controle de custos — desligamento seguro ⚠️

Use esta seção quando quiser **pausar o ambiente de staging** para evitar custo
contínuo sem uso.

### 13.1 Parar a EC2 (preserva EBS, para o custo da instância)

> 💰 Parar a EC2 **não elimina** o custo de EBS (volumes continuam cobrados).
> Parar reduz o custo de `t3.small` (~$17/mês → ~$0).

#### Modo Console AWS

EC2 → Instances → selecionar `clinicbridge-staging` → Instance State → **Stop**.

#### Modo CLI

```bash
# ⚠️ NÃO EXECUTAR automaticamente
aws ec2 stop-instances \
  --instance-ids <INSTANCE_ID> \
  --region sa-east-1 --profile clinicbridge
```

### 13.2 ⚠️ Terminar a EC2 (DESTRUTIVO — apaga instância e volumes não separados)

> ⚠️ **AÇÃO IRREVERSÍVEL.** Só executar se quiser encerrar o ambiente completamente.
> Os volumes EBS nomeados com "Delete on termination = No" **sobrevivem** (verificar
> configuração ao lançar).

### 13.3 Desligar RDS (snapshot antes de parar)

> RDS pode ser **parado temporariamente** por até 7 dias (após 7 dias, reinicia automaticamente).

#### Modo Console AWS

1. ⚠️ Tirar snapshot manual: RDS → `clinicbridge-db-staging` → Actions → **Take snapshot**.
2. RDS → `clinicbridge-db-staging` → Actions → **Stop temporarily**.

### 13.4 Liberar Elastic IP não associado

> 💰 Elastic IP não associado cobra $0.005/hora. Se parar a EC2 (sem terminar),
> o EIP **continua associado** e sem custo enquanto a instância está parada.
> Se terminar a EC2, **liberar o EIP imediatamente**.

#### Modo Console AWS

EC2 → Elastic IPs → selecionar → Actions → **Release Elastic IP address**.

### 13.5 Checklist de revisão mensal de custos

- [ ] AWS Cost Explorer → filtrar por tag `Project=clinicbridge`.
- [ ] Verificar billing alarm (SNS alerta se estimativa > threshold).
- [ ] Verificar recursos sem tag `Project=clinicbridge` (possível lixo não rastreado).
- [ ] Verificar volumes EBS sem attachment (cobrados mesmo sem EC2).
- [ ] Verificar snapshots antigos do RDS (cobrados por GB/mês).

---

## 14. Rollback de emergência

Se algo der errado após ativar DNS/TLS real:

```bash
# ⚠️ NÃO EXECUTAR automaticamente — executar por etapas conforme o problema

# 1. Parar Nginx (para de servir tráfego externo):
docker compose --profile edge stop nginx

# 2. Remover/alterar registros A no Registro.br (propagação = TTL segundos).

# 3. NÃO apagar dados do Postgres — preservados no RDS ou no volume Docker.
# 4. NÃO apagar certs do /etc/letsencrypt — manter para reuso.
# 5. NÃO terminar a EC2 sem tirar snapshot de EBS/RDS antes.
```

---

## 15. Checklist go/no-go antes de aceitar tráfego real

> Complementa `docs/deploy-security-checklist.md` §15 (staging) e §16 (produção).

| # | Item | Status |
|---|---|---|
| 1 | Usuário IAM operador com MFA criado; conta root com MFA; root não usada operacionalmente | ⬜ |
| 2 | Billing alarm ativo; budget alert configurado | ⬜ |
| 3 | Buckets S3 com Block Public Access + Versioning + SSE-S3 | ⬜ |
| 4 | Secrets em SSM SecureString; `.env` com `chmod 600`; nunca commitado | ⬜ |
| 5 | Security Groups: 80/443 público; 22 só IP operador (ou SSM sem SSH); 5432/6379 interno | ⬜ |
| 6 | RDS sem acesso público; conexão testada da EC2 | ⬜ |
| 7 | Elastic IP associado; DNS propagado e verificado | ⬜ |
| 8 | Certbot emitido; TLS validado (`openssl s_client`); renovação `--dry-run` OK | ⬜ |
| 9 | `NODE_ENV=production` no container (`docker compose exec backend env`) | ⬜ |
| 10 | `MFA_ENCRYPTION_KEY` definida e distinta do `JWT_SECRET` | ⬜ |
| 11 | `FRONTEND_ORIGIN` aponta para `https://app.clinicbridge.com.br` | ⬜ |
| 12 | `TRUST_PROXY=1` + `RATE_LIMIT_STORE=redis` em produção | ⬜ |
| 13 | `/health/ready` → 200; `/health/ready` → 503 quando DB cai | ⬜ |
| 14 | Migrations aplicadas; `migrate:status` limpo | ⬜ |
| 15 | Smoke tests 1-9 da §11 todos passando | ⬜ |
| 16 | Backup offsite drill (§12) aprovado; `RESTIC_PASSWORD` no SSM | ⬜ |
| 17 | Agendamento de backup configurado e ativo (`systemctl list-timers`) | ⬜ |

---

## 16. Referências cruzadas

- `docs/aws-infra-sprint-3.41-plan.md` — decisões e arquitetura
- `docs/production-minimum-plan.md` — sequência de sprints 3.37–3.43
- `docs/deploy-security-checklist.md` — checklist §15 (staging) e §16 (produção)
- `docs/backup-offsite-runbook.md` — IAM mínimo, SSM, restore drill completo
- `docs/secrets-env-production-runbook.md` — geração de secrets, SSM paths, rotação
- `docs/dns-tls-staging-runbook.md` — DNS Registro.br + Certbot + HSTS
- `docs/security-notes.md` — ressalvas P1/P2/P3
- `infra/nginx/conf.d/clinicbridge.production.conf.example` — template Nginx prod
- `scripts/{check,backup,restore}-*-offsite-restic.sh` — scripts de backup offsite
