# ClinicBridge — Runbook de Backup/Restore Local (Restic)

> **LOCAL/DEV ONLY.** Procedimento operacional para o backup/restore local com
> Restic implementado na Sprint 3.5. **Sem offsite, sem AWS/S3/Backblaze/MinIO.**
> Não cobre produção. Não afirma conformidade completa com LGPD/HIPAA/CFM (ver
> `docs/backup-restore-strategy.md` e ADR `docs/adr/0003-backup-restore-strategy.md`).
>
> Validado em 2026-05-22 (local/dev): backup → restore em banco separado
> (`clinicbridge_restore_test`), counts batendo com o principal e banco principal
> intacto.

## Status e escopo

- Backup do **PostgreSQL** (via `pg_dump -Fc` dentro do container) + **storage de
  uploads** (`storage/uploads`, se existir) para um **repositório Restic local e
  cifrado**.
- Restore em um **banco separado** (`clinicbridge_restore_test`) — o banco
  principal (`clinicbridge`) **nunca** é tocado.
- **Offsite/produção continuam pendentes** (sprint futura).

## Pré-requisitos

- `restic` instalado no WSL (`sudo apt update && sudo apt install -y restic`).
- Docker Desktop rodando + WSL integration ativa.
- Postgres de pé: `docker compose up -d postgres` (container `clinicbridge-postgres`).
- `RESTIC_PASSWORD` exportada **no shell** (nunca em arquivo/Git).

## Exportar a RESTIC_PASSWORD (temporária, só no shell)

```bash
# Senha de DEV apenas — troque por uma sua. NUNCA gravar em arquivo versionado.
export RESTIC_PASSWORD='dev-local-only-change-me'
```

> ⚠️ Perder a senha do repositório Restic = **backup irrecuperável**. Em produção,
> a gestão da chave terá processo próprio (fora do escopo deste runbook).

## 1. Checar o ambiente

```bash
./scripts/check-backup-env.sh
```
Confere restic, docker, container Postgres, `pg_dump`/`pg_restore`,
`RESTIC_PASSWORD` (sem imprimir o valor) e se o `.gitignore` cobre
backups/dumps/repo. Sai com erro se algo estiver faltando.

## 2. Rodar o backup local

```bash
./scripts/backup-local-restic.sh
```
- Inicializa o repo Restic em `backups/restic-repo` na primeira vez (idempotente).
- Gera `backups/work/clinicbridge-YYYYMMDD-HHMMSS.dump` (custom format).
- Inclui `storage/uploads` se existir.
- Cria um snapshot Restic e lista os snapshots; imprime o `short id`.
- Mantém o dump temporário por padrão (`CLEAN_BACKUP_WORKDIR=true` para apagar).

## 3. Rodar o restore drill (banco separado)

```bash
./scripts/restore-local-restic.sh
```
- **Aborta** se `RESTORE_DB` == `POSTGRES_DB` (proteção do banco principal).
- Restaura o último snapshot para `backups/restore-work/latest`.
- Recria **apenas** `clinicbridge_restore_test` e roda `pg_restore`
  (`--no-owner --no-privileges`).
- Compara counts principal × restore e mantém a pasta de restore para inspeção.

## 4. Validar counts

O `restore-local-restic.sh` já imprime a tabela lado a lado, ex.:

```
== counts: principal (clinicbridge) vs restore (clinicbridge_restore_test) ==
  tabela             main         restore      match
  patients           6            6            OK
  import_files       24           24           OK
  import_sessions    7            7            OK
```

Conferência manual (opcional):
```bash
docker exec clinicbridge-postgres psql -U clinicbridge -d clinicbridge_restore_test \
  -c "SELECT count(*) FROM patients;" \
  -c "SELECT count(*) FROM import_files;" \
  -c "SELECT count(*) FROM import_sessions;"
```

## 5. Apagar o banco de teste (quando quiser)

```bash
docker exec clinicbridge-postgres psql -U clinicbridge -d postgres \
  -c 'DROP DATABASE IF EXISTS "clinicbridge_restore_test";'
```
A pasta `backups/restore-work` pode ser removida manualmente (é git-ignored):
`rm -rf backups/restore-work`.

## Variáveis (defaults seguros)

| Variável | Default | Para quê |
|---|---|---|
| `POSTGRES_CONTAINER` | `clinicbridge-postgres` | Container do Postgres |
| `POSTGRES_DB` | `clinicbridge` | Banco principal (intocável no restore) |
| `POSTGRES_USER` | `clinicbridge` | Usuário do banco |
| `RESTORE_DB` | `clinicbridge_restore_test` | Banco de teste do restore |
| `RESTIC_REPOSITORY` | `backups/restic-repo` | Repo Restic local (sem offsite) |
| `BACKUP_WORKDIR` | `backups/work` | Onde o dump temporário é gravado |
| `RESTORE_WORKDIR` | `backups/restore-work` | Saída do `restic restore` |
| `UPLOAD_DIR` | `storage/uploads` | Storage incluído no backup se existir |
| `RESTIC_PASSWORD` | — (obrigatória no env) | Chave do repo; **nunca** em arquivo |
| `CLEAN_BACKUP_WORKDIR` | `false` | `true` apaga o dump após o backup |

## O que NÃO fazer

- **Não** commitar backups, dumps ou o repositório Restic (`.gitignore` já cobre).
- **Não** colocar a `RESTIC_PASSWORD` real em arquivo nem em docs.
- **Não** restaurar no banco principal (`RESTORE_DB` deve ser ≠ `POSTGRES_DB`).
- **Não** usar offsite/AWS/S3 ainda (fica para sprint futura).

## Troubleshooting

- **`RESTIC_PASSWORD não definida`** → `export RESTIC_PASSWORD='...'` no shell atual.
- **`container ... não está rodando`** → `docker compose up -d postgres` e confira `docker ps`.
- **`repositório Restic não inicializado`** (no restore) → rode o backup primeiro.
- **`pg_restore retornou N`** → avisos não-fatais podem ocorrer; os counts confirmam
  o conteúdo. Se os counts divergirem, investigue o dump/snapshot.
- **Snapshot/dump não encontrado** → confira `restic -r backups/restic-repo snapshots`.
