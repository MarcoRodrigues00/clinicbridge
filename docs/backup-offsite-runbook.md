# ClinicBridge — Runbook de Backup Offsite (Restic + S3)

> **Sprint 3.40 — docs/scripts-only.** Este runbook documenta o **backup offsite
> seguro** do ClinicBridge usando **Restic** com destino **S3-compatible**
> (AWS S3 preferido; MinIO/Backblaze-via-S3 funcionam pelo mesmo CLI). **Nenhuma
> infraestrutura AWS real é criada por este documento.** O ClinicBridge **não
> está pronto para produção** (ver P1 em `docs/security-notes.md`).
>
> Relacionado: `docs/backup-restore-strategy.md` (decisão + estratégia),
> `docs/backup-restore-local-runbook.md` (backup LOCAL/DEV — Sprint 3.5),
> `docs/secrets-env-production-runbook.md` (SSM / RESTIC_PASSWORD),
> `docs/production-minimum-plan.md` (sequência 3.38–3.43),
> ADR `docs/adr/0003-backup-restore-strategy.md`.

## 1. Status e escopo

- **Implementado nesta sprint:** scripts `scripts/{check,backup,restore}-*-offsite-restic.sh`,
  variáveis de ambiente em `.env.example`, política de retenção **documentada
  (não auto-executada)**, restore drill offsite em **banco separado**
  (`clinicbridge_restore_offsite_test`).
- **NÃO implementado nesta sprint:** bucket S3 real, IAM role real, agendamento
  (cron/systemd-timer/job), alertas de falha, retenção destrutiva (`forget --prune`)
  automática. Esses itens dependem da decisão de provedor/conta AWS (Sprint 3.41+).
- **Garantia:** offsite **só é considerado validado** quando o **restore drill
  offsite** rodar com sucesso (counts batendo, banco principal intocado) — não
  basta criar o snapshot.

## 2. Pré-requisitos

### 2.1 Ferramentas locais

- `restic` ≥ 0.16 (o local-runbook já cobre a instalação no WSL).
- `docker` + `docker compose` rodando, com o container `clinicbridge-postgres` ativo
  (`docker compose up -d postgres`).
- `git` para checagens do `.gitignore`.

### 2.2 Conta / bucket AWS (quando aplicável)

- Conta AWS com permissão para criar bucket S3 + IAM (decisão pendente em
  `docs/production-minimum-plan.md` §5).
- Bucket **privado** com:
  - **Block all public access** ativado (default).
  - **Versionamento** ativado (recomendado — protege contra delete acidental).
  - **Default encryption** SSE-S3 (`AES256`) **ou** SSE-KMS com CMK dedicada.
  - **Object Lock** opcional (modo Compliance/Governance) se a política jurídica
    de retenção exigir imutabilidade.
- Nome sugerido: `clinicbridge-backups-prod` / `clinicbridge-backups-staging`.
- Região: `sa-east-1` (São Paulo) ou outra alinhada com a região do app.

### 2.3 IAM mínimo recomendado (princípio do mínimo privilégio)

A IAM role (instance profile em EC2 ou task role em ECS) ou usuário IAM dedicado
do backup deve ter **apenas**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ResticBucketList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::clinicbridge-backups-prod"
    },
    {
      "Sid": "ResticBucketObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::clinicbridge-backups-prod/*"
    }
  ]
}
```

Notas:
- `s3:DeleteObject` é necessário para `restic forget --prune` (limpeza de
  snapshots). Se a limpeza for **fora** desta role (ex.: rodada manualmente por
  conta admin), pode ser removida — backups continuam funcionando.
- Para SSE-KMS, adicionar permissões `kms:Encrypt|Decrypt|GenerateDataKey` na
  CMK específica.
- **Nunca** usar credenciais de root, nem dar `s3:*`. Nunca compartilhar a role
  com o backend da aplicação (separação de privilégios).

### 2.4 Secrets

| Variável | Valor | Onde guardar |
|---|---|---|
| `RESTIC_PASSWORD` | `openssl rand -base64 32` | SSM `/clinicbridge/<env>/restic_password` (SecureString) |
| `RESTIC_REPOSITORY` | `s3:s3.amazonaws.com/clinicbridge-backups-prod` | SSM `/clinicbridge/<env>/restic_repository` (String) |
| `AWS_*` creds | — | **Preferir IAM role/instance profile** (sem env vars). Em dev/staging local, usar credenciais SSO com sessão curta. |

> ⚠️ **Perder a `RESTIC_PASSWORD` = backup irrecuperável.** A senha **nunca** é
> versionada nem incluída no backup; é guardada apenas no SSM Parameter Store
> (ver `docs/secrets-env-production-runbook.md`).

## 3. Fluxo geral

```
[ Postgres container ] --pg_dump--> [ dump local em backups/work/ ]
                                          |
                                          +-- + storage/uploads (se existir)
                                          v
[ restic backup ] ---encrypted---> [ s3://clinicbridge-backups-prod ]
                                          ^
                                          | (restore drill)
                                          v
[ restic restore --target ] -> [ backups/restore-offsite-work/latest ]
                                          |
                                          v
                                  [ pg_restore -> clinicbridge_restore_offsite_test ]
                                  (banco SEPARADO — principal NUNCA é tocado)
```

## 4. Variáveis de ambiente

| Variável | Obrigatória? | Default | Observação |
|---|---|---|---|
| `RESTIC_REPOSITORY` | sim | — | DEVE começar com `s3:`. Scripts abortam senão. |
| `RESTIC_PASSWORD` | sim | — | Nunca em arquivo; só shell ou SSM. |
| `AWS_ACCESS_KEY_ID` | opcional | — | Preferir IAM role; obrigatória se rodar fora da AWS. |
| `AWS_SECRET_ACCESS_KEY` | opcional | — | Idem. |
| `AWS_SESSION_TOKEN` | opcional | — | STS/SSO temporário. |
| `AWS_DEFAULT_REGION` | recomendada | — | Ex.: `sa-east-1`. |
| `RESTIC_CACHE_DIR` | opcional | `~/.cache/restic` | Acelera operações em repos grandes. |
| `POSTGRES_CONTAINER` | opcional | `clinicbridge-postgres` | |
| `POSTGRES_DB` | opcional | `clinicbridge` | **Intocável** no restore drill. |
| `POSTGRES_USER` | opcional | `clinicbridge` | |
| `BACKUP_WORKDIR` | opcional | `backups/work` | gitignored. |
| `UPLOAD_DIR` | opcional | `storage/uploads` | Incluído no snapshot se existir. |
| `RESTORE_DB` | opcional | `clinicbridge_restore_offsite_test` | Aborta se == `POSTGRES_DB`. |
| `RESTORE_WORKDIR` | opcional | `backups/restore-offsite-work` | gitignored. |
| `CLEAN_BACKUP_WORKDIR` | opcional | `false` | `true` apaga o dump depois do upload. |

## 5. Procedimentos

### 5.1 Checar o ambiente (sem rede)

```bash
export RESTIC_REPOSITORY='s3:s3.amazonaws.com/clinicbridge-backups-staging'
export RESTIC_PASSWORD='<senha-do-repo>'      # nunca commitar
# Em EC2/ECS com IAM role: NÃO setar AWS_ACCESS_KEY_ID/SECRET.
# Em dev local fora de AWS: setar credenciais SSO temporárias.

./scripts/check-backup-offsite-env.sh
# ou: ./scripts/check-backup-offsite-env.sh --probe   # tenta 'restic snapshots' (rede)
```

O check:
1. Verifica `restic`, `docker`, container Postgres, `pg_dump`/`pg_restore`.
2. Confere que `RESTIC_PASSWORD` e `RESTIC_REPOSITORY` estão definidas (sem
   imprimir valor).
3. **ABORTA com [FAIL]** se `RESTIC_REPOSITORY` parecer caminho local.
4. Aceita credenciais AWS via env **ou** via IAM role / default chain.
5. Confirma que `.gitignore` cobre `backups/work/`, `backups/restore-offsite-work/`,
   dumps e arquivos `.sql`.
6. Imprime resumo final sem secrets.

### 5.2 Fazer o primeiro backup offsite

```bash
# (opcional) dry-run: gera o dump mas NÃO envia
./scripts/backup-offsite-restic.sh --dry-run

# Backup real
./scripts/backup-offsite-restic.sh
```

O script:
1. Falha-rápido se faltar `RESTIC_PASSWORD`/`RESTIC_REPOSITORY` ou se a repo
   parecer local.
2. Inicializa o repo se ele não existir (`restic init` — idempotente).
3. Gera `backups/work/clinicbridge-offsite-YYYYMMDD-HHMMSS.dump` (Postgres
   custom format).
4. Inclui `storage/uploads/` se existir.
5. Envia o snapshot com tags `clinicbridge`, `offsite`, `ts:<TS>`.
6. Lista snapshots existentes com `--tag offsite`.
7. Mantém o dump por padrão (`CLEAN_BACKUP_WORKDIR=true` para apagar).
8. Logs **nunca** mostram a senha ou o valor de `RESTIC_REPOSITORY`.

### 5.3 Listar / inspecionar snapshots

```bash
restic snapshots --compact --tag offsite
restic snapshots --json --tag offsite | jq '.[] | {short_id, time, paths, tags}'
restic stats --mode raw-data
restic check          # verifica integridade dos blobs (não restaura, só checa)
restic check --read-data-subset=5%   # baixa 5% e valida (mais caro; periódico)
```

### 5.4 Restore drill offsite (em banco separado)

> **Garantia operacional:** o drill restaura para `clinicbridge_restore_offsite_test`.
> O banco principal (`clinicbridge`) **nunca** é tocado. O script aborta se
> `RESTORE_DB == POSTGRES_DB`.

```bash
./scripts/restore-offsite-restic.sh
```

Etapas:
1. Hard guard: aborta se `RESTORE_DB` for igual ao banco principal.
2. Hard guard: aborta se `RESTIC_REPOSITORY` parecer local.
3. `restic restore latest --target backups/restore-offsite-work/latest`.
4. Localiza o `clinicbridge-offsite-*.dump` mais recente.
5. `DROP DATABASE IF EXISTS` + `CREATE DATABASE` apenas para o banco de teste.
6. `pg_restore --no-owner --no-privileges -d clinicbridge_restore_offsite_test`.
7. Compara `count(*)` de `patients`, `import_files`, `import_sessions` entre
   principal e restore. Imprime tabela lado a lado.
8. Mantém `backups/restore-offsite-work/latest` para inspeção manual.

Limpeza do banco de teste após validar:

```bash
docker exec clinicbridge-postgres psql -U clinicbridge -d postgres \
  -c 'DROP DATABASE IF EXISTS "clinicbridge_restore_offsite_test";'
rm -rf backups/restore-offsite-work
```

## 6. Política de retenção de snapshots (documentada, NÃO auto-executada)

> ⚠️ Sprint 3.40 **não roda limpeza destrutiva automática**. A política
> abaixo é a recomendação operacional; o operador executa manualmente após
> validação. **Antes de prune real, exigir restore drill bem-sucedido recente.**

Recomendação inicial (sujeita à validação jurídica — ADR 0002):

| Política | Manter |
|---|---|
| Diários | últimos **7** |
| Semanais | últimos **4** |
| Mensais | últimos **6** |
| Anuais | últimos **2** |

Comando de referência (NÃO rodar antes de aprovar):

```bash
# Listar o que seria removido (dry-run de retenção):
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --keep-yearly 2 \
  --tag clinicbridge \
  --dry-run

# Execução real (remove + libera espaço):
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --keep-yearly 2 \
  --tag clinicbridge \
  --prune
```

Razões para manter a limpeza fora de cron nesta sprint:
- Limpeza destrutiva exige **revisão jurídica** (ADR 0002 — retenção e direito ao
  esquecimento vs. backups).
- Exige **monitoramento de falha** antes de delegar à automação.
- Exige **restore drill recente** garantindo que a base atual é restaurável.

## 7. Agendamento futuro (NÃO implementado nesta sprint)

Quando o operador de produção quiser agendar:

- **EC2**: `systemd-timer` (preferível) com `OnCalendar=daily` + unit que roda
  `backup-offsite-restic.sh` e captura `stderr` em CloudWatch.
- **ECS/Fargate**: ECS Scheduled Task (cron) executando um container utilitário
  com o script.
- **Alerta de falha**: CloudWatch Alarms sobre o exit code ou ausência de
  snapshot diário (verificação via Lambda + `restic snapshots --json`).

Critérios de aceite do agendamento (sprint futura):
- [ ] Execução diária com janela fora do pico.
- [ ] Alerta em falha (e em ausência de execução).
- [ ] Restore drill semanal automatizado em ambiente isolado.
- [ ] Métrica de duração + tamanho do snapshot.

## 8. Segurança

- **Cifragem em repouso:** nativa do Restic (XChaCha20-Poly1305 + Argon2id na
  chave). O bucket S3 adiciona SSE-S3/SSE-KMS como camada extra (defesa em
  profundidade), mas a confidencialidade primária é da senha Restic.
- **Cifragem em trânsito:** HTTPS (TLS) automático com `s3:` em endpoints AWS.
- **Sem PII em logs:** scripts não imprimem `RESTIC_PASSWORD`, `AWS_*`,
  `RESTIC_REPOSITORY`, nem conteúdo do dump.
- **Sem secrets em `.env`:** `.env.example` só documenta nomes; valores reais
  vivem no SSM (`docs/secrets-env-production-runbook.md`).
- **Sem versionamento de artefatos:** `.gitignore` cobre `backups/`, `*.dump`,
  `*.sql`, `*.tar.gz`, `restic-repo/`, `.restic/`, `.env`/`.env.*`.
- **Separação de privilégios:** a IAM role do backup **não** deve ter acesso à
  database de produção. O backup roda no host operacional (EC2/ECS), não dentro
  do backend.
- **Rotação de `RESTIC_PASSWORD`:** rotação exige re-cifra completa do repo
  (`restic key add` + `restic key remove`). Planejar como sprint dedicada com
  drill antes e depois — ver `docs/secrets-env-production-runbook.md` §5.
- **Cross-account / cross-region:** opcional como hardening adicional
  (replicação S3 cross-region, conta separada para backup). Fora desta sprint.

## 9. Troubleshooting

| Sintoma | Possível causa | Ação |
|---|---|---|
| `RESTIC_PASSWORD não definida` | env não exportada no shell | `export RESTIC_PASSWORD='...'` (sem aspas no histórico) |
| `[ABORTAR] RESTIC_REPOSITORY parece ser caminho LOCAL` | valor não começa com `s3:` | Para offsite, exportar `s3:...`. Para local, usar `scripts/backup-local-restic.sh`. |
| `unable to open repository ... AccessDenied` | IAM/credenciais sem permissão | Conferir IAM policy (§2.3) e `aws sts get-caller-identity` |
| `repository ... does not exist` | repo nunca foi inicializado | Rodar o backup uma vez — script faz `restic init` |
| `wrong password` | senha errada / repo de outra clínica | Verificar `RESTIC_PASSWORD` no SSM da env correta |
| `pg_restore retornou N` no drill | warnings não-fatais | Conferir os counts; só falha se divergirem |
| `region mismatch` no S3 | `AWS_DEFAULT_REGION` errada | Setar corretamente (ex.: `sa-east-1`) |
| `restic snapshots` lento | cache não montado | Setar `RESTIC_CACHE_DIR` em disco rápido |

## 10. Checklist de validação (Sprint 3.40)

- [x] Scripts `check`/`backup`/`restore` offsite criados em `scripts/`.
- [x] Hard guard `s3:` em `RESTIC_REPOSITORY` (impede repo local por engano).
- [x] Hard guard `RESTORE_DB != POSTGRES_DB`.
- [x] `--help` e `--dry-run` (backup) suportados.
- [x] `.env.example` documenta variáveis sem valores reais.
- [x] `.gitignore` cobre `backups/`, dumps, repo, restore workdir.
- [x] Runbook (este arquivo) cobre IAM, secrets, retenção, drill, troubleshooting.
- [ ] Bucket S3 real provisionado e drill executado (depende de conta AWS — Sprint 3.41+).
- [ ] Agendamento (systemd-timer / ECS scheduled task) implementado (sprint futura).
- [ ] Alertas de falha implementados (sprint futura).
- [ ] Validação jurídica de retenção (ADR 0002 — pendente).

## 11. Status / próximos passos

**Esta sprint:** scripts + runbook + .env.example + docs atualizados.
**Pendente para deploy real (Sprint 3.41+):**
1. Provisionar bucket `clinicbridge-backups-prod` (privado, versionado, criptografado).
2. Anexar IAM role mínima (§2.3) à EC2/ECS.
3. Gravar `RESTIC_PASSWORD` no SSM (`/clinicbridge/prod/restic_password`).
4. Executar `check-backup-offsite-env.sh --probe` em staging.
5. Executar `backup-offsite-restic.sh` em staging.
6. Executar `restore-offsite-restic.sh` em staging — **gate go/no-go**.
7. Repetir em prod com dados sintéticos antes do piloto real.
8. Agendar (sprint futura).
