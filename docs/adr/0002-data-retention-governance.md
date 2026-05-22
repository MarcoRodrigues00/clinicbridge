# ADR 0002 — Data Retention Governance — dry-run first, deletion later

- **Status:** Accepted
- **Data:** 2026-05-23
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/data-retention-policy.md` (política completa),
  `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`,
  `docs/adr/0001-product-direction-option-c.md`

## Contexto

O ClinicBridge trata **dados administrativos** de pacientes e os artefatos do
pipeline de migração (arquivos enviados que podem conter PII, sessões de
importação, recibos, auditoria). Já existe, desde a Sprint 2.24, uma **retenção
em modo dry-run**: o endpoint `GET /import-files/retention/dry-run` identifica
arquivos antigos candidatos à limpeza (mais antigos que `IMPORT_FILE_RETENTION_DAYS`,
padrão 30), retorna apenas metadados seguros e **não apaga nada**. Desde a Sprint
3.1 ele é restrito a `dono_clinica`; a Sprint 2.26 adicionou um painel frontend
**somente leitura** ("Arquivos antigos de importação").

A política LGPD de retenção é um item **P1** (antes de produção). Era preciso
decidir oficialmente **como** o ClinicBridge governa retenção de dados — sem
implementar exclusão real ainda, pois o produto **não está pronto para produção**
e faltam salvaguardas (backup/restore validado, soft-delete/quarentena,
auditoria por arquivo) e **validação jurídica** dos prazos e da base legal.

Esta ADR é **docs-only**: não introduz feature, endpoint, migration, dependência
nem alteração de banco/código.

## Decisão

1. O ClinicBridge mantém a retenção de arquivos como **dry-run** (somente
   identificação/visualização) **até** existirem, em conjunto: política definida,
   confirmação explícita, soft-delete/quarentena com janela de recuperação e
   auditoria por arquivo.
2. **Nenhum arquivo, paciente ou registro é apagado automaticamente** no MVP
   atual. Não há endpoint de delete, job/cron, botão destrutivo nem signed URL.
3. A **limpeza real** será uma **sprint futura separada e dedicada**, condicionada
   aos requisitos mínimos (ver "Critérios para implementar limpeza real futura" e
   `docs/data-retention-policy.md`, seções 11/14).
4. A política técnica de retenção fica registrada em
   `docs/data-retention-policy.md` (incluindo a matriz de retenção) e é tratada
   como **rascunho técnico** até **revisão jurídica** dos prazos, base legal e
   fluxos LGPD do titular.
5. Esta decisão **não** afirma conformidade completa com LGPD/HIPAA/CFM — fala em
   **preparação e requisitos**.

## Consequências positivas

- **Risco controlado:** evita perda irreversível de dados enquanto faltam backup
  validado, quarentena e auditoria por arquivo.
- **Visibilidade sem destruição:** o dry-run já dá à clínica visão dos arquivos
  antigos (governança) sem qualquer ação destrutiva.
- **Caminho claro:** os requisitos para a limpeza real ficam explícitos e
  versionados, reduzindo o risco de implementação apressada.
- **Alinhamento com a Opção C:** consolida a governança administrativa (Fase 3)
  antes de qualquer complexidade maior, sem vazar escopo.

## Consequências negativas / trade-offs

- **Acúmulo de PII:** arquivos antigos com PII continuam armazenados até a
  limpeza real existir — superfície de exposição maior nesse intervalo
  (mitigada por storage privado, isolamento por tenant e acesso restrito).
- **Trabalho adiado:** a limpeza real (valor operacional/LGPD) fica para depois.
- **Documento sujeito a mudança:** prazos e base legal podem mudar após a revisão
  jurídica, exigindo atualização da política.

## O que fica proibido por enquanto

- exclusão real de arquivos (físico ou metadados);
- endpoint de delete / botão de apagar / download via signed URL;
- job/cron de limpeza;
- exclusão/edição/merge de pacientes;
- qualquer remoção física sem soft-delete/quarentena, auditoria por arquivo e
  backup validado;
- afirmar conformidade total com LGPD ou que o produto está pronto para produção.

## Critérios para implementar limpeza real futura

A limpeza real só pode ser implementada (em sprint/ADR futura dedicada) quando
**todos** estiverem satisfeitos e testados:

1. `requireRole`/`dono_clinica` aplicado à ação destrutiva (sem burlar tenant/auth).
2. Confirmação explícita do operador (não automática).
3. Soft-delete/quarentena antes da remoção física, com janela de recuperação
   (rollback).
4. Auditoria por arquivo (sem PII; `recurso='import_file'`, `recurso_id`).
5. Idempotência da operação.
6. Lock se houver job/cron (sem execução concorrente).
7. Coordenação consistente banco + storage (sem registros/arquivos órfãos).
8. Logs sem PII desnecessária (sem `nome_original`/path/conteúdo).
9. Política de prazos definida e **validada juridicamente** (base legal,
   finalidade).
10. Backup/restore validado de ponta a ponta antes de habilitar em produção.

> Nota: esta ADR descreve **preparação e requisitos**. Não afirma conformidade
> completa com LGPD/HIPAA/CFM — isso depende das fases e validações futuras
> acima.
