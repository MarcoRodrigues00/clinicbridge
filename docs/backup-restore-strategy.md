# ClinicBridge — Estratégia de Backup e Restore

> Documento técnico **inicial**. Define a estratégia de backup/restore do
> ClinicBridge — **Restic-first**, com **Bacula como opção futura enterprise** —
> e os requisitos para uma futura implementação. Criado na Sprint 3.4 (docs-only).
>
> ⚠️ **Nada de backup é implementado nesta sprint** (sem scripts, cron, secrets,
> repositório ou backups reais). Este documento **não afirma conformidade
> completa com LGPD/HIPAA/CFM** e **deve ser revisado juridicamente antes de
> produção** (retenção de backups, base legal, transferência offsite). O
> ClinicBridge **não está pronto para produção** (ver ressalvas P1 em
> `docs/security-notes.md`).
>
> Relacionado: `docs/adr/0003-backup-restore-strategy.md` (decisão),
> `docs/adr/0002-data-retention-governance.md` (limpeza real exige backup
> validado), `docs/data-retention-policy.md`, `docs/security-notes.md`.

---

## 1. Status e escopo

- **Status:** rascunho técnico inicial, sujeito a revisão jurídica e à definição
  do ambiente de produção. Não é procedimento operacional validado.
- **Escopo:** proteger os dados administrativos e artefatos do pipeline
  (PostgreSQL + storage de uploads) com backup cifrado e restore testável.
- **Estado atual:** **não há backup.** Esta sprint apenas decide a ferramenta
  (Restic) e registra requisitos; a implementação fica para uma sprint futura
  dedicada.
- **Motivação:** backup/restore é P1 (antes de produção) e é **pré-requisito** da
  limpeza real de arquivos (critério #10 do ADR 0002).

## 2. O que precisa de backup (e o que não precisa)

**Precisa:**
- **PostgreSQL** (volume `clinicbridge_postgres_data`): users, clinics, tokens,
  `audit_logs`, `import_files` (inclui `nome_original` = PII), `import_sessions`,
  `patients` (PII administrativa).
- **Storage de uploads** (`UPLOAD_DIR=./storage/uploads`): os CSV/XLSX enviados,
  com PII administrativa.

**Não precisa:**
- **Redis**: efêmero (`--save "" --appendonly no`), só contadores de rate limit.
  Reconstruído sozinho; backup desnecessário.

**Tratado à parte (não vai no backup em texto puro):**
- **Segredos** (`.env`/`JWT_SECRET`/credenciais do DB): necessários para um restore
  funcional, mas **nunca** versionados nem incluídos no backup em claro. O
  processo de restore deve documentar como reprovisioná-los com segurança.

> Backup do banco + storage **contém PII** → ver seção 9 (segurança/cifragem).

## 3. Por que Restic primeiro

Critérios que tornam o Restic adequado ao MVP single-host/Docker:

- **Cifrado por padrão:** o repositório nasce cifrado em repouso (essencial para
  dados com PII).
- **Deduplicação + snapshots:** histórico eficiente, com restauração a um ponto no
  tempo.
- **Simples de operar:** binário único, sem servidor/daemon/catálogo dedicado.
- **Vários backends:** local, S3, Backblaze B2, SFTP — permite começar local e
  migrar para offsite depois.
- **Restore granular e testável:** facilita o **restore drill** (seção 10).
- **Open source, maduro e bem documentado.**

Contras (assumidos): exige disciplina de **gestão da senha/chave** do repo (perda
= backup irrecuperável); não tem catálogo central nem suporte a tape (cobertos
pelo Bacula, se um dia necessários).

## 4. Bacula como opção futura enterprise

Bacula permanece **documentado como evolução**, não adotado agora. Quando
reconsiderar:

- frota **multi-host** / muitos servidores a coordenar;
- necessidade de **tape** ou mídia corporativa;
- **catálogo central** de jobs/mídias e relatórios corporativos;
- políticas de retenção corporativas e compliance de TI mais pesadas.

Trade-off: Bacula traz director + storage daemon + file daemon + catálogo (em DB)
— robusto, porém **complexo e pesado** para um único host Docker. Por isso fica
para um cenário enterprise futuro.

## 5. Comparação Restic × Bacula

| Critério | Restic (MVP) | Bacula (enterprise futuro) |
|---|---|---|
| Complexidade operacional | Baixa (1 binário) | Alta (vários daemons + catálogo) |
| Cifragem em repouso | Nativa, por padrão | Configurável (mais setup) |
| Deduplicação | Sim | Parcial/por plugin |
| Escala (multi-host/frota) | Limitada | Forte |
| Tape / mídia corporativa | Não | Sim |
| Catálogo central | Não | Sim |
| Backends offsite | local/S3/B2/SFTP | vários (storage daemons) |
| Custo operacional p/ MVP | Baixo | Alto (overkill) |
| Fit para o ClinicBridge agora | **Alto** | Baixo (futuro) |

## 6. Modelo de backup proposto (conceitual, sem scripts)

> Conceitual — **nenhum script/cron é criado nesta sprint.**

1. **Dump lógico do PostgreSQL** (ex.: `pg_dump`/`pg_dumpall`) gerado de forma
   consistente.
2. **Cópia do storage de uploads** (`storage/uploads`).
3. **Consistência DB + storage:** banco e arquivos devem refletir o mesmo ponto no
   tempo o quanto possível (evitar metadados sem arquivo ou vice-versa).
4. **Envio ao repositório Restic cifrado** (dump + storage como fontes).
5. **Destino:** começar **local/dev**; **só depois** do restore drill validado,
   adicionar destino **offsite** (S3/B2/SFTP).
6. **Agendamento e retenção:** definidos na implementação (seção 8); nesta fase só
   o princípio fica registrado.

## 7. RPO / RTO (alvos propostos, não validados)

- **RPO (perda máxima aceitável):** proposta inicial — backup diário (RPO ~24h).
  **Proposta, não validada.**
- **RTO (tempo máximo para restaurar):** proposta inicial — restauração em poucas
  horas em ambiente local. **Proposta, não validada.**

> Números reais dependem do ambiente de produção e de validação com o negócio/
> jurídico. Não são compromissos.

## 8. Retenção de backups

- Alinhar à `docs/data-retention-policy.md` (minimização + retenção limitada).
- Proposta inicial de política de snapshots Restic (ex.: manter alguns diários,
  semanais e mensais via `forget`/`prune`) — **sujeita a validação jurídica** de
  prazos e base legal.
- Backups contêm PII → reter só o necessário; expurgo de snapshots antigos faz
  parte da política (a definir na implementação).

## 9. Segurança dos backups

- **Cifragem em repouso** obrigatória (nativa do Restic) — backup com PII nunca em
  claro.
- **Cifragem em trânsito** quando offsite.
- **Gestão da senha/chave do repo** fora do repositório de código, sem commit; com
  procedimento de recuperação documentado (perda da chave = backup irrecuperável).
- **Acesso restrito** ao repositório e às credenciais do destino.
- **Sem PII em logs** de backup (nomes de arquivo/`nome_original`/conteúdo nunca
  logados além do necessário).
- **Nunca commitar** backups, dumps, `.env` ou chaves.
- **Segregação de segredos** (`.env`/`JWT_SECRET`) do conteúdo do backup.

## 10. Restore e restore drills

- **Restore drill = teste real de restauração**, periódico e documentado. **Backup
  sem restore testado não é confiável** e não pode ser considerado "validado".
- O drill deve verificar: integridade do dump do Postgres, integridade do storage,
  e que a aplicação sobe sobre os dados restaurados (com os segredos
  reprovisionados).
- **A próxima sprint (implementação) deve fazer o primeiro ciclo backup→restore
  inteiramente em ambiente local/dev, com restore drill comprovado, ANTES de
  configurar qualquer storage externo/offsite real.** Só depois desse ciclo
  validado o offsite entra.

## 11. Responsabilidades

- **Infra/DBA (operador de deploy):** executa backups, restore drills,
  monitoramento e gestão de chave/credenciais (itens de implementação futura).
- **`dono_clinica`:** dono dos dados administrativos da sua clínica; consumidor da
  garantia de recuperação (não opera o backup diretamente).
- **Produto:** mantém esta estratégia e os critérios atualizados conforme o
  ambiente de produção for definido.

## 12. Requisitos mínimos antes de produção

- [ ] Backup implementado e rodando em local/dev com **restore drill** comprovado.
- [ ] Cifragem em repouso confirmada; gestão de chave segura e recuperável.
- [ ] Cobertura consistente de Postgres + storage.
- [ ] Retenção de backups definida e **validada juridicamente**.
- [ ] RPO/RTO definidos e aceitos.
- [ ] Monitoramento/alerta de falha de backup.
- [ ] Destino offsite definido **após** o ciclo local/dev validado.
- [ ] Procedimento de segredos no restore documentado (sem versioná-los).

## 13. Riscos e ressalvas

- **Sem backup hoje:** até a implementação futura, o ambiente segue **sem
  proteção** — risco assumido nesta fase docs-only.
- **Backups contêm PII:** exigem cifragem e acesso restrito (mas nada é
  criado/cifrado agora).
- **Perda de chave:** o maior risco operacional do Restic — sem a chave, o backup
  é irrecuperável.
- **RPO/RTO e retenção** são propostas, não validadas.
- **Offsite prematuro:** subir dados com PII para storage externo antes de validar
  o ciclo local/dev é arriscado — por isso a ordem local/dev → drill → offsite.
- **Sem promessa:** não afirma produção pronta nem compliance completo.

## 14. Checklist para implementação futura

Sequência sugerida (cada item exige sua própria validação; nada autoriza
implementar agora):

1. Implementar dump do Postgres + cópia do storage em **local/dev**.
2. Configurar repositório **Restic cifrado local** + gestão da chave.
3. Rodar o primeiro **restore drill** local/dev e documentar o resultado.
4. Definir agendamento (cron/job) e política de retenção de snapshots.
5. Adicionar monitoramento/alerta de falha.
6. **Só então** configurar destino **offsite** (provedor/região/credenciais).
7. Repetir restore drill a partir do offsite.
8. Validar retenção/base legal com jurídico (seção 15).
9. Atualizar esta estratégia, `security-notes.md` e o roadmap; destravar a limpeza
   real (ADR 0002) somente após backup validado.

## 15. O que precisa de validação jurídica

- **Retenção de backups** (prazos por tipo de dado, alinhada à política de
  retenção) com base legal e finalidade.
- **Transferência/armazenamento offsite** de dados com PII (provedor, região,
  cláusulas de tratamento, eventual transferência internacional).
- **Tratamento de incidentes** envolvendo backups (perda/vazamento).
- **Direito ao esquecimento vs. backups** (como exclusões a pedido do titular se
  refletem em snapshots já feitos).

> Enquanto esses pontos não forem validados, este documento permanece **rascunho
> técnico** e o backup permanece **não implementado**.
