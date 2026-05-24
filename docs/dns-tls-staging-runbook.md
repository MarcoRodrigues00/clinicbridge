# ClinicBridge — Runbook DNS / TLS / Nginx Staging+Produção

> **Sprint 3.38 — Documentação apenas.** Nenhum recurso AWS foi criado, nenhum
> DNS foi configurado, nenhum certificado foi emitido durante esta sprint. Este
> runbook é o guia operacional para quando a EC2 estiver disponível e o DNS
> propagado.
>
> Domínio: **`clinicbridge.com.br`** (Registro.br). DNS ainda sem configuração
> para AWS. Provedor: **AWS** (EC2 + Nginx + Let's Encrypt/Certbot).
>
> Relacionado: `docs/production-minimum-plan.md`, `docs/nginx-local-staging-runbook.md`,
> `docs/deploy-security-checklist.md`, `docs/adr/0005-edge-security-reverse-proxy-waf.md`.

---

## 0. Convenções

| Símbolo | Significado |
|---|---|
| `<ELASTIC_IP>` | Endereço IPv4 público da EC2 (Elastic IP alocado no AWS) |
| `<EC2_USER>` | Usuário SSH da EC2 (normalmente `ubuntu` para Ubuntu AMI) |
| `admin@clinicbridge.com.br` | E-mail para registro do cert Let's Encrypt |

Substitua todos os `<PLACEHOLDER>` antes de executar qualquer comando.

---

## 1. Pré-requisitos

Antes de iniciar este runbook, confirmar que:

- [ ] **EC2 provisionada** (t3.small ou maior, Ubuntu 22.04 LTS recomendado).
- [ ] **Elastic IP alocado e associado** à EC2 no console AWS.
- [ ] **Security Group** configurado:
  - Porta **80 (HTTP)** — entrada pública (0.0.0.0/0) — necessário para Certbot standalone challenge e redirect HTTP→HTTPS.
  - Porta **443 (HTTPS)** — entrada pública (0.0.0.0/0).
  - Porta **22 (SSH)** — entrada restrita ao IP fixo do operador (ex.: `x.x.x.x/32`).
  - Porta **5432 (PostgreSQL)** — **sem** entrada pública; acesso somente interno (SG do app → SG do RDS, ou loopback se tudo na mesma EC2).
  - Porta **6379 (Redis)** — **sem** entrada pública; acesso somente interno.
  - Porta **3001 (backend Express)** — **sem** entrada pública; acesso via Nginx na mesma rede do Docker Compose.
- [ ] **Docker + Docker Compose** instalados na EC2.
- [ ] **Repositório clonado** na EC2 (ou artefatos copiados via rsync/scp).
- [ ] **Migrations aplicadas** na EC2: `pnpm --filter backend migrate:latest`.
- [ ] **Domínio `clinicbridge.com.br`** registrado no Registro.br (feito em 2026-05-24).
- [ ] DNS ainda **não configurado** para AWS — esta é a próxima etapa (Seção 2).

> **Não seguir adiante com dados reais** se qualquer P0 do `docs/production-minimum-plan.md`
> estiver aberto (TLS, secrets, Security Groups).

---

## 2. DNS no Registro.br

### 2.1 Acessar o painel de DNS

1. Acessar [registro.br](https://registro.br) → fazer login.
2. Ir em **Meus Domínios** → clicar em `clinicbridge.com.br`.
3. Ir em **Configurar DNS** ou **Editar Zona**.

### 2.2 Criar os registros A

Adicionar os seguintes registros **tipo A** apontando para o Elastic IP da EC2:

| Tipo | Nome (host) | Valor | TTL |
|---|---|---|---|
| A | `@` (raiz) | `<ELASTIC_IP>` | 3600 |
| A | `api` | `<ELASTIC_IP>` | 3600 |
| A | `app` | `<ELASTIC_IP>` | 3600 |
| A | `staging` | `<ELASTIC_IP>` | 3600 |

> **TTL:** 3600 segundos (1 hora) é seguro para começar. Pode baixar para 300
> segundos em staging para propagar mudanças mais rápido. Voltar para 3600 após
> estabilizar.

> **Nota:** Se o Registro.br estiver usando DNS próprio (não migrado para Route 53),
> os registros acima são criados diretamente na interface do Registro.br. Não é
> necessário configurar Route 53 neste momento.

### 2.3 Aguardar propagação

```bash
# Verificar propagação de fora da EC2 (pode usar o host local WSL)
dig api.clinicbridge.com.br +short        # deve retornar <ELASTIC_IP>
dig staging.clinicbridge.com.br +short

# Alternativa online: https://dnschecker.org (verificar múltiplas regiões)

# Na EC2, confirmar que resolve corretamente:
curl -I http://api.clinicbridge.com.br/health
# Esperado: resposta do backend (mesmo sem TLS ainda) ou connection refused
# se Nginx ainda não estiver rodando com a conf de produção.
```

Propagação pode levar de alguns minutos a algumas horas (geralmente < 30 min).

---

## 3. Certbot — emitir certificado Let's Encrypt

### 3.1 Instalar Certbot na EC2

```bash
# Ubuntu 22.04 (recomendado):
sudo apt update && sudo apt install -y certbot

# Verificar instalação:
certbot --version
```

### 3.2 Emitir o certificado (modo standalone)

O modo standalone usa a porta 80 diretamente. O Nginx (ou qualquer serviço na porta 80) **precisa estar parado** durante a emissão.

```bash
# 1. Parar o Nginx (se já estiver rodando):
docker compose --profile edge stop nginx
# ou: sudo systemctl stop nginx  (se Nginx rodando no host)

# 2. Emitir cert para staging (começar com staging antes de produção):
sudo certbot certonly --standalone \
  -d staging.clinicbridge.com.br \
  --agree-tos \
  --email admin@clinicbridge.com.br \
  --non-interactive

# 3. Após validar staging, emitir para produção:
sudo certbot certonly --standalone \
  -d api.clinicbridge.com.br \
  --agree-tos \
  --email admin@clinicbridge.com.br \
  --non-interactive

# 4. Verificar arquivos gerados:
sudo ls /etc/letsencrypt/live/api.clinicbridge.com.br/
# Esperado: cert.pem  chain.pem  fullchain.pem  privkey.pem  README
```

> **Ordem recomendada:** validar staging primeiro (erro aqui não afeta prod). Só
> depois emitir para `api.clinicbridge.com.br`.

> **Rate limits Let's Encrypt:** limite de 5 certificados por domínio por 7 dias.
> Não repetir emissão desnecessariamente.

### 3.3 Testar renovação automática (dry-run)

```bash
# Simula renovação sem emitir cert real:
sudo certbot renew --dry-run
# Esperado: "Congratulations, all simulated renewals succeeded"
```

### 3.4 Configurar renovação automática

```bash
# Certbot adiciona um timer systemd automaticamente no Ubuntu 22.04.
# Verificar:
sudo systemctl status certbot.timer
# ou: sudo crontab -l (se via cron)

# Adicionar reload do Nginx após renovação (editar /etc/letsencrypt/renewal-hooks/deploy/):
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
# Reload Nginx após renovação do cert.
# Ajuste o caminho do docker compose conforme o diretório do projeto.
cd /home/<EC2_USER>/clinicbridge
docker compose exec nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## 4. Nginx — ativar configuração de produção/staging

### 4.1 Preparar o template

```bash
# Na EC2, dentro do diretório do repositório:

# Para staging:
cp infra/nginx/conf.d/clinicbridge.staging.conf.example \
   infra/nginx/conf.d/clinicbridge.staging.conf

# Para produção:
cp infra/nginx/conf.d/clinicbridge.production.conf.example \
   infra/nginx/conf.d/clinicbridge.production.conf
```

> **Importante:** em produção, o `clinicbridge.local.conf` deve ser **removido**
> ou não montado, pois ele tem `server_name localhost clinicbridge.local` e não
> serve ao domínio real. Em staging no mesmo servidor, remover o `.local.conf`
> do volume montado no container Nginx.

### 4.2 Montar Let's Encrypt no container Nginx

No `docker-compose.yml` de **produção** (não alterar o local), adicionar o volume
do Let's Encrypt ao serviço nginx:

```yaml
# Exemplo de override ou compose de produção:
services:
  nginx:
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/nginx/conf.d:/etc/nginx/conf.d:ro
      # Cert Let's Encrypt (montado read-only; gerado pelo certbot no host):
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 4.3 Testar sintaxe da config e subir

```bash
# 1. Testar sintaxe antes de subir:
docker compose exec nginx nginx -t
# Esperado: "syntax is ok" e "test is successful"

# 2. Subir (ou recarregar se já estiver rodando):
docker compose --profile edge up -d nginx
# ou: docker compose exec nginx nginx -s reload

# 3. Verificar logs:
docker compose logs nginx --tail=30
```

---

## 5. Testes de validação

### 5.1 HTTP → HTTPS redirect

```bash
# Deve retornar 301 com Location: https://...
curl -I http://api.clinicbridge.com.br/health
# Esperado:
# HTTP/1.1 301 Moved Permanently
# Location: https://api.clinicbridge.com.br/health
```

### 5.2 HTTPS e health checks

```bash
# Health (liveness):
curl -I https://api.clinicbridge.com.br/health
# Esperado: 200 OK

# Liveness explícita:
curl -s https://api.clinicbridge.com.br/health/live | jq .
# Esperado: {"status":"ok"}

# Readiness (DB check):
curl -s https://api.clinicbridge.com.br/health/ready | jq .
# Esperado: 200 {"status":"ready","checks":{"database":"ok"}}
# ou 503 {"status":"not_ready",...} se DB não estiver acessível
```

### 5.3 Certificado TLS

```bash
# Verificar cert (validade, emissor, domínio):
curl -v https://api.clinicbridge.com.br/health 2>&1 | grep -E 'subject|issuer|expire|SSL'

# Alternativa: openssl
echo | openssl s_client -connect api.clinicbridge.com.br:443 -servername api.clinicbridge.com.br 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
# Esperado: issuer=C=US, O=Let's Encrypt, CN=R...
```

### 5.4 Headers de segurança

```bash
# Verificar que X-Forwarded-For não vaza informações indevidas:
curl -s -I -H "X-Forwarded-For: 1.2.3.4" https://api.clinicbridge.com.br/health \
  | grep -i forwarded
# Não deve retornar o XFF do cliente (o Nginx sobrescreve com $remote_addr).

# Verificar que Server header não expõe versão Nginx:
curl -s -I https://api.clinicbridge.com.br/health | grep -i server
# Esperado: Server: nginx  (sem versão — server_tokens off)
```

### 5.5 Logs Nginx — sem PII

```bash
docker compose logs nginx --tail=20
# Verificar formato clinicbridge_safe:
# <IP> fwd="..." "GET /health" 200 bytes=... rt=...
# Confirmar: sem Authorization, sem Cookie, sem body, sem query string.
```

### 5.6 NODE_ENV no container

```bash
docker compose exec backend sh -c 'echo NODE_ENV=$NODE_ENV'
# Em staging/produção (sem compose local override): → production
# Em local (com compose.yml que seta NODE_ENV=development): → development
```

---

## 6. HSTS — quando e como ativar

**Não ativar HSTS** até que todos os itens abaixo sejam confirmados:

- [ ] HTTPS funcionando (cert válido, sem warning de browser).
- [ ] HTTP→HTTPS redirect testado de cliente externo (não apenas localhost).
- [ ] `certbot renew --dry-run` executado com sucesso.
- [ ] Reload automático do Nginx após renovação testado.
- [ ] Ciente que HSTS pina o browser por 1 ano (`max-age=31536000`) e é muito difícil de desfazer.

**Quando estiver pronto**, descomentar em `clinicbridge.production.conf`:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Recomendação: testar primeiro em staging com `max-age=300` (5 minutos) antes de ir para produção com 1 ano.

---

## 7. Rollback de emergência

Se algo der errado após ativar o domínio real:

```bash
# 1. Parar Nginx (para de servir tráfego externo):
docker compose --profile edge stop nginx

# 2. No Registro.br: remover ou alterar os registros A que apontam para a EC2.
#    (Propagação leva TTL segundos.)

# 3. Voltar ao modo local se necessário (sem impacto em dados):
docker compose --profile edge up -d nginx  # com local.conf e cert autoassinado

# 4. NÃO apagar dados do Postgres — dados são preservados no volume Docker.
# 5. NÃO apagar certs do /etc/letsencrypt — manter para reuso.
```

---

## 8. Checklist go/no-go antes de aceitar tráfego real

Não usar dados de pacientes reais se qualquer item abaixo estiver aberto:

| Item | Status |
|---|---|
| TLS real com cert válido e verificado | Pendente |
| HTTP→HTTPS redirect funcionando | Pendente |
| `certbot renew --dry-run` OK | Pendente |
| `NODE_ENV=production` no container de produção | ✅ Corrigido (Dockerfile Sprint 3.38) |
| Secrets fora do `.env` (SSM/Secrets Manager) | Pendente (Sprint 3.39) |
| Postgres/Redis sem porta pública | Pendente (Security Groups + RDS/ElastiCache) |
| Backup offsite configurado e testado | Pendente (Sprint 3.40) |
| `FRONTEND_ORIGIN` aponta para domínio HTTPS real | Pendente |
| `TRUST_PROXY=1` configurado (atrás do Nginx) | ✅ Já implementado (profile edge) |
| Logs Nginx sem PII confirmados | ✅ Formato `clinicbridge_safe` |
| Validação jurídica da política de retenção | Pendente |

> **Regra:** todos os itens P0 do `docs/production-minimum-plan.md` devem estar
> ✅ antes de aceitar qualquer dado real de clínica.

---

## 9. Referências

- `docs/production-minimum-plan.md` — plano completo com decisões pendentes
- `docs/nginx-local-staging-runbook.md` — runbook do Nginx local/staging com cert autoassinado
- `docs/deploy-security-checklist.md` — checklist §15 (staging) e §16 (produção)
- `docs/adr/0005-edge-security-reverse-proxy-waf.md` — decisão Nginx + WAF
- `infra/nginx/conf.d/clinicbridge.production.conf.example` — template Nginx produção
- `infra/nginx/conf.d/clinicbridge.staging.conf.example` — template Nginx staging
- `infra/nginx/conf.d/clinicbridge.local.conf` — config local (cert autoassinado; não usar em produção)
- `scripts/generate-local-nginx-cert.sh` — gerador de cert autoassinado local
