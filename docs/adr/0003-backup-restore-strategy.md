# ADR 0003 — Backup & Restore Strategy — Restic-first, Bacula as future enterprise option

- **Status:** Accepted
- **Data:** 2026-05-23
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/backup-restore-strategy.md` (estratégia completa),
  `docs/adr/0002-data-retention-governance.md`, `docs/data-retention-policy.md`,
  `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`

## Contexto

Backup/restore é item **P1** (antes de produção) na Fase 3 e é **pré-requisito
explícito** da limpeza real de arquivos: o ADR 0002 exige, no critério #10,
"backup/restore validado de ponta a ponta antes de habilitar exclusão". Hoje
**não existe** estratégia nem implementação de backup.

O que precisaria ser protegido:

- **PostgreSQL** (volume Docker `clinicbridge_postgres_data`): users, clinics,
  tokens, `audit_logs`, `import_files` (inclui `nome_original` = PII),
  `import_sessions`, `patients` (PII administrativa).
- **Storage de uploads** (`UPLOAD_DIR=./storage/uploads`): os CSV/XLSX enviados,
  com PII administrativa.
- **Redis**: efêmero (`--save "" --appendonly no`; só contadores de rate limit) →
  **não** precisa de backup.
- **Segredos** (`.env`/`JWT_SECRET`): necessários para um restore funcional, mas
  **nunca** versionados nem incluídos em backup em texto puro — tratados à parte.

Como qualquer backup do banco + storage **conteria PII**, a estratégia precisa de
**cifragem em repouso** e gestão de chave. Era preciso decidir a ferramenta base
sem implementar nada ainda (o produto **não está pronto para produção**).

Esta ADR é **docs-only**: não introduz script, cron/job, secret, repositório,
backup real, dependência, migration nem alteração de banco/código/compose.

## Decisão

1. **Restic-first** para o MVP: a ferramenta base de backup será o **Restic**
   (repositório **cifrado por padrão**, deduplicação, snapshots, single-binary,
   suporta destino local e offsite — S3/B2/SFTP, restore testável).
2. **Bacula** fica como **opção futura enterprise** (frota multi-host, tape,
   catálogo central, retenção corporativa) — **não** adotado agora por ser
   overkill para o setup single-host/Docker do MVP.
3. **Nada é implementado nesta sprint**: sem scripts, sem cron, sem secrets, sem
   repositório, sem backups reais. Apenas a direção e os requisitos ficam
   registrados (`docs/backup-restore-strategy.md`).
4. A implementação futura (sprint dedicada) deve começar **em ambiente
   local/dev**, com **restore drill** validado, **antes** de qualquer storage
   externo/offsite real.
5. Esta decisão **não** afirma conformidade completa com LGPD/HIPAA/CFM — fala em
   **preparação e requisitos**. Prazos/retenção de backups e base legal dependem
   de **validação jurídica** (ver `docs/backup-restore-strategy.md`).

## Opções consideradas

- **Restic (escolhida):** cifrado por padrão, dedup, snapshots, simples de operar,
  um binário, vários backends (local/S3/B2/SFTP), restore granular e testável.
  Contras: requer disciplina de gestão da senha/chave do repo; não tem catálogo
  central nem suporte a tape.
- **Bacula:** robusto/enterprise (director + storage daemon + file daemon +
  catálogo em DB), bom para frota grande, tape e retenção corporativa. Contras:
  pesado/complexo demais para um único host Docker; alto custo operacional para o
  MVP. → **adiado** como opção futura.
- **Só `pg_dump` manual/ad-hoc:** simples, mas sem cifragem nativa, sem dedup, sem
  cobertura do storage de arquivos e sem rotina/retenção — frágil para o objetivo.
- **Snapshots gerenciados de cloud (ex.: snapshot de volume/RDS):** úteis quando
  houver provedor definido, mas amarram a um fornecedor e ainda não há ambiente de
  produção/cloud decidido. Podem complementar o Restic no futuro.

## Consequências positivas

- **Cifragem desde o início:** o backup de dados com PII nasce cifrado em repouso.
- **Simplicidade proporcional ao MVP:** Restic cobre Postgres + storage sem a
  complexidade do Bacula.
- **Caminho claro e seguro:** requisitos (restore drill, gestão de chave, offsite,
  RPO/RTO) ficam explícitos antes de qualquer implementação.
- **Destrava o P1 e o pré-requisito do ADR 0002:** com a estratégia decidida, a
  limpeza real futura tem o caminho desbloqueado (após backup real validado).
- **Porta aberta para enterprise:** Bacula permanece como evolução documentada se
  a escala exigir.

## Consequências negativas / trade-offs

- **Valor adiado:** a proteção real só existe quando a implementação for feita
  (sprint futura) — até lá, o ambiente segue **sem backup**.
- **Gestão de chave é crítica:** perder a senha/chave do repo Restic = backup
  irrecuperável; exige processo bem definido antes de produção.
- **Documento sujeito a mudança:** RPO/RTO e retenção de backups são propostas que
  podem mudar após validação jurídica e definição do ambiente de produção.

## O que fica fora do escopo por enquanto

- implementação de backup (scripts, cron/job, agendador);
- criação de repositório Restic, chaves/senhas ou secrets;
- backups ou dumps reais (de banco ou storage);
- destino offsite/externo real (S3/B2/SFTP);
- adoção/instalação de Bacula;
- afirmar conformidade total com LGPD ou que o produto está pronto para produção.

## Critérios para implementar backup real futuro

A implementação (sprint/ADR futura dedicada) só avança quando **todos**
estiverem satisfeitos e testados:

1. Implementação **primeiro em local/dev**, com **restore drill** comprovado,
   antes de qualquer storage externo real.
2. Gestão segura da senha/chave do repositório Restic (fora do repo, sem commit).
3. Cifragem em repouso confirmada (e em trânsito quando offsite).
4. Cobertura consistente de **Postgres + storage** (dump do banco + arquivos),
   com consistência entre os dois.
5. RPO/RTO definidos e aceitos.
6. Retenção de backups definida e **validada juridicamente** (alinhada à
   `docs/data-retention-policy.md`).
7. Monitoramento/alerta de falha de backup.
8. Restore drills **periódicos** documentados (backup sem restore testado não
   conta).
9. Destino offsite definido (provedor, região, transferência) só **após** o passo
   local/dev validado.
10. Tratamento de segredos (`.env`/`JWT_SECRET`) no processo de restore, sem
    versioná-los em texto puro.

> Nota: esta ADR descreve **preparação e requisitos**. Não afirma conformidade
> completa com LGPD/HIPAA/CFM — isso depende das fases e validações futuras
> acima.
