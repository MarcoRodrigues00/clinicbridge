# ClinicBridge — Política de Retenção e Governança de Dados

> Documento técnico **inicial**. Define a postura de retenção e governança de
> dados do ClinicBridge e prepara a **futura** limpeza real de arquivos —
> **sem** implementá-la agora. Criado na Sprint 3.3 (docs-only).
>
> ⚠️ **Este documento NÃO afirma conformidade completa com LGPD/HIPAA/CFM.** É um
> ponto de partida técnico/operacional que **deve ser revisado juridicamente
> antes de qualquer uso em produção** (prazos, base legal, finalidade e fluxos
> precisam de validação legal). O ClinicBridge **não está pronto para produção**
> (ver ressalvas P1 em `docs/security-notes.md`).
>
> Relacionado: `docs/adr/0002-data-retention-governance.md` (decisão),
> `docs/security-notes.md` (segurança), `docs/project-state.md` (estado),
> `docs/roadmap-next-phase.md` (sequência de fases),
> `docs/ClinicBridge_Documentacao_Mestre.md` (LGPD/STRIDE — fonte de verdade).

---

## 1. Status e escopo

- **Status:** rascunho técnico inicial, sujeito a revisão jurídica. Não é
  política juridicamente validada.
- **Escopo do MVP:** o ClinicBridge trata **apenas dados administrativos** de
  pacientes (contato, convênio, identificação básica) e os artefatos do pipeline
  de migração (arquivos enviados, sessões de importação, recibos, auditoria).
- **Fora do escopo do MVP:** dados clínicos de qualquer natureza (ver seção 4).
- **Estado da retenção:** hoje a retenção é **apenas dry-run** — o sistema
  **identifica** arquivos antigos candidatos à limpeza, mas **não apaga nada**.
  Não existe exclusão real, endpoint de delete, job/cron, nem botão destrutivo.
- **Objetivo deste documento:** registrar princípios, mapear o que é tratado,
  definir uma matriz de retenção inicial e listar os **requisitos mínimos** para
  que a limpeza real possa ser implementada numa sprint futura dedicada.

## 2. Princípios

Alinhados ao documento mestre (LGPD) e às notas de segurança:

- **Minimização:** coletar/reter apenas o necessário para a finalidade de
  migração administrativa e auditoria.
- **Limitação de finalidade:** os dados servem à migração administrativa e à
  rastreabilidade; não são reaproveitados para fins não declarados.
- **Retenção limitada:** dados não devem ser mantidos além do necessário —
  porém a definição de prazos legais depende de validação jurídica (seção 17).
- **Segurança por padrão:** isolamento por `clinica_id`, storage privado, nome
  interno aleatório, SHA-256, CPF nunca bruto, logs sem PII desnecessária.
- **Auditabilidade:** ações relevantes são auditadas sem PII (`audit_logs`
  append-only).
- **Reversibilidade antes de destruição:** qualquer limpeza real futura deve
  passar por soft-delete/quarentena antes da remoção física (seção 12).
- **Preparação, não promessa:** falamos em requisitos e preparação, **nunca** em
  "compliance completo".

## 3. Tipos de dados tratados no MVP

- **Arquivos de importação** (CSV/XLSX enviados): podem conter **PII
  administrativa** (nome, telefone, e-mail, CPF, data de nascimento, convênio).
- **Metadados de arquivo** (`import_files`): id, status, extensão, MIME, tamanho,
  datas, hash SHA-256, nome interno aleatório e **nome original** (este último
  pode conter PII — ver seção 5).
- **Sessões de importação** (`import_sessions`): mapeamento, resumo de validação,
  estatísticas por campo, amostra de issues (rótulos seguros), recibo da
  importação (`import_summary_json`) — **sem valores de células de pacientes**.
- **Pacientes administrativos** (`patients`): nome, telefone, e-mail, CPF, data
  de nascimento, convênio, nº de carteirinha, status, origem. **Sem campo
  clínico.**
- **Auditoria** (`audit_logs`): ação, recurso, ids técnicos, IP, user agent,
  request id, timestamp — **sem PII**.
- **Tokens/sessões de autenticação:** credenciais de acesso (não são dados de
  paciente).
- **Logs de aplicação:** mensagens operacionais; logger redige campos sensíveis.
- **Chaves de rate limit (Redis, opcional):** contadores por IP, efêmeros.

## 4. Tipos de dados fora do escopo

O MVP **não trata** e **não deve passar a tratar** sem ADR futura dedicada:

- prontuário / dados clínicos;
- diagnóstico, CID;
- prescrição, medicamentos;
- exames / resultados;
- qualquer conteúdo clínico, assinatura médica ou telemedicina.

Como esses dados **não existem** no sistema, esta política **não** define
retenção clínica. Dado clínico, se um dia existir, exigirá política de retenção
**própria e mais restritiva** (ver `docs/adr/0001-product-direction-option-c.md`
e a seção "Futura expansão clínica" em `docs/security-notes.md`).

## 5. Arquivos de importação

- **O que são:** os CSV/XLSX que a clínica envia para migrar dados
  administrativos. Ficam em **storage privado** (`UPLOAD_DIR/<clinica_id>/<uuid>.<ext>`),
  com nome interno aleatório e SHA-256 registrado.
- **Contêm PII?** Sim — potencialmente nome, telefone, e-mail, CPF, data de
  nascimento e convênio dos pacientes da clínica.
- **Nome original:** o `nome_original` pode conter PII (ex.: "pacientes-joao.csv")
  e **nunca é exposto em URL pública** nem em respostas de API públicas/retorno
  do dry-run. Permanece apenas em metadados internos.
- **Retenção atual:** o arquivo físico e seus metadados **são mantidos**. O
  endpoint `GET /import-files/retention/dry-run` apenas **lista candidatos**
  (arquivos mais antigos que `IMPORT_FILE_RETENTION_DAYS`, padrão 30), com
  metadados seguros — **sem apagar**.
- **Risco:** arquivos antigos com PII acumulada aumentam a superfície de
  exposição. Por isso a limpeza real é um item P1/P2, mas só com as salvaguardas
  da seção 11.

## 6. Pacientes administrativos importados

- **O que são:** registros em `patients` criados pela importação controlada
  (somente dados administrativos).
- **Contêm PII?** Sim (nome, contato, CPF — exposto apenas como `cpf_masked` na
  API; nunca bruto).
- **Retenção atual:** **não há exclusão automática.** Pacientes não são apagados
  por retenção nesta fase. Não existe edição/exclusão/merge de pacientes (fora de
  escopo até sprint explícita).
- **Ação futura (LGPD):** exclusão a pedido do titular / da clínica e exportação
  de dados pessoais por clínica são fluxos LGPD a desenhar numa sprint futura
  (não nesta). Qualquer exclusão precisa respeitar a rastreabilidade da
  auditoria (a auditoria não guarda PII, então sobrevive à exclusão).

## 7. Sessões de importação e recibos

- **O que são:** `import_sessions` guarda o histórico de cada revisão/migração:
  mapeamento, resumo de validação, estatísticas, amostra de issues (rótulos
  seguros) e o **recibo** (`import_summary_json` + `imported_at` +
  `imported_by_user_id`).
- **Contêm PII?** **Não** valores de pacientes — apenas contagens, metadados,
  nome do arquivo e status. O recibo contém só números/metadados da execução.
- **Retenção atual:** **mantidas para rastreabilidade administrativa** (quem
  preparou/importou o quê, quando, quantas linhas). Não são apagadas por
  retenção.
- **Ação futura:** se a limpeza real de arquivos for implementada, decidir se a
  sessão associada permanece (recomendado manter, pois é rastro administrativo
  sem PII de paciente) ou recebe um marcador de "arquivo removido".

## 8. Logs e auditoria

- **`audit_logs`:** append-only no DAO (sem update/delete). Colunas: `acao`,
  `recurso`, `recurso_id`, `usuario_id`, `clinica_id`, `ip`, `user_agent`,
  `request_id`, `criado_em`. **Sem PII** (sem CPF/telefone/e-mail/nome, sem
  contagens). FKs com `SET NULL` para preservar evidência ao apagar user/clinic.
- **Retenção atual:** mantida (retenção maior que a dos arquivos), pois é a
  trilha de rastreabilidade. Como não tem PII, o risco de privacidade é baixo.
- **Logs de aplicação:** o `logger` redige `authorization/cookie/password/senha/
  cpf/token`; mensagens de erro nunca ecoam stack/SQL/path nem conteúdo de
  planilha. Retenção/rotação de logs de aplicação é responsabilidade da infra de
  deploy (a definir no item "deploy seguro").

## 9. Exportações

- **O que são:** `GET /patients/export` gera CSV/XLSX limpo (CPF mascarado,
  anti-formula-injection) **sob demanda**.
- **Onde fica:** o app **não armazena** o export — ele é transmitido na resposta
  (`Content-Disposition` com filename fixo) e baixado pelo usuário. **Não há
  signed URL nem export persistido no servidor.**
- **Retenção:** após o download, o arquivo exportado fica sob responsabilidade do
  **usuário/cliente** (fora do ambiente do app). O app não deve passar a guardar
  exports permanentes sem reavaliar esta política.
- **Aviso ao operador:** exports contêm PII administrativa (mesmo com CPF
  mascarado) e devem ser tratados com cuidado pela clínica (não commitar, não
  subir em local público).

## 10. Retenção dry-run atual

- **Endpoint:** `GET /import-files/retention/dry-run` (requireAuth +
  requireClinic + requireRole `dono_clinica` desde a Sprint 3.1).
- **Comportamento:** **read-only.** Lista arquivos mais antigos que
  `IMPORT_FILE_RETENTION_DAYS` (padrão 30; query `retention_days` 1..365),
  limitado por `IMPORT_FILE_RETENTION_DRY_RUN_MAX` (padrão 100). **Exclui**
  arquivos em fluxo ativo (última sessão `validated`/`ready_for_import`/
  `import_started`).
- **Dados retornados:** apenas metadados seguros (id, status, extensão, MIME,
  tamanho, data, `has_import_session`, `latest_session_status`). **Nunca**
  `nome_original`/`nome_interno`/path/sha256/conteúdo.
- **Frontend:** painel "Arquivos antigos de importação" — **somente
  visualização**, sem botão de apagar/limpar/excluir e sem download.
- **Auditoria:** `import_file.retention.dry_run.success`/`.failure` (sem PII).
- **Garantia:** nada é apagado; `import_files`/`import_sessions`/`patients`
  permanecem inalterados.

## 11. Limpeza real futura

A limpeza real **não existe** e **não é implementada nesta sprint**. Quando for
implementada (sprint futura dedicada), deve obrigatoriamente exigir:

- **`requireRole` / `dono_clinica`:** só o dono da clínica pode executar (nunca
  burlar tenant nem auth).
- **Confirmação explícita:** ação destrutiva confirmada pelo operador (não
  automática, não em um clique acidental).
- **Auditoria por arquivo:** cada remoção auditada individualmente (sem PII),
  com `recurso='import_file'` e `recurso_id` do arquivo.
- **Soft-delete/quarentena antes da remoção física:** marcar/mover para
  quarentena primeiro; remoção física só depois do prazo (seção 12).
- **Idempotência:** repetir a operação não causa efeito duplicado nem erro.
- **Lock (se virar job):** se um dia houver job/cron, usar lock para evitar
  execução concorrente.
- **Coordenação banco + storage:** remover metadados e arquivo físico de forma
  consistente (sem registro órfão nem arquivo órfão); falha parcial deve ser
  tratada/reconciliável.
- **Logs sem PII desnecessária:** nunca logar `nome_original`/path/conteúdo;
  apenas ids técnicos e contagens seguras.
- **Rollback/recuperação dentro da quarentena:** enquanto na quarentena, é
  possível restaurar.
- **Política de prazo definida:** prazos de candidatura, quarentena e remoção
  física definidos e **validados juridicamente** antes de produção.

> Até que **todos** esses itens existam e sejam testados, a retenção permanece
> dry-run. Decisão registrada no ADR `docs/adr/0002-data-retention-governance.md`.

## 12. Quarentena/soft-delete futura (modelo proposto)

Modelo conceitual proposto para a futura limpeza real (não implementado):

1. **Candidato:** arquivo mais antigo que o prazo de retenção e fora de fluxo
   ativo (já é o que o dry-run identifica hoje).
2. **Soft-delete / quarentena:** marcação lógica (ex.: status/flag e timestamp de
   quarentena) e/ou movimentação do arquivo físico para área de quarentena
   privada. O dado some das listagens normais, mas é recuperável.
3. **Janela de recuperação:** período fixo em que a clínica pode restaurar
   (rollback) antes da remoção física.
4. **Remoção física:** apagar o arquivo do storage e/ou expurgar metadados após
   a janela, de forma idempotente, coordenada e auditada.

> Detalhes (nomes de coluna, status, prazos) ficam para a ADR/sprint de
> implementação — esta política só fixa o **princípio**: nunca remover fisicamente
> sem passar por uma etapa reversível e auditada.

## 13. Responsabilidades por papel

- **`dono_clinica` (owner):** único papel que pode executar ações sensíveis de
  governança — hoje, rodar a **retenção dry-run**; no futuro, a **limpeza real**
  (com confirmação). Responsável por decisões de retenção da sua clínica.
- **`secretaria` (operator):** prepara/revisa importações (upload, preview,
  validação, criação de sessão, dry-run de importação) e lê pacientes/duplicados.
  **Não** executa retenção, export, import real nem mark-ready.
- **`admin_sistema`:** papel de sistema, sem `clinica_id`; `requireClinic` já o
  bloqueia das rotas tenant-scoped. Não opera dados de clínica.
- **Operador da infra (deploy/DBA):** responsável por backup/restore, rotação de
  logs e provisionamento de Redis/proxy (itens P1, fora desta sprint).

> O papel vem do JWT (sem hit no DB por request). Tradeoff de papel "stale"
> descrito em `docs/security-notes.md` (seção "Autorização por papel").

## 14. Requisitos mínimos antes de apagar dados

Checklist-resumo (detalhe na seção 11) que precisa estar satisfeito **antes** de
qualquer remoção real de dados:

- [ ] `requireRole`/`dono_clinica` aplicado à ação destrutiva.
- [ ] Confirmação explícita do operador.
- [ ] Soft-delete/quarentena antes de remoção física, com janela de recuperação.
- [ ] Auditoria por arquivo (sem PII).
- [ ] Idempotência garantida.
- [ ] Lock se houver job/cron.
- [ ] Coordenação consistente banco + storage (sem órfãos).
- [ ] Logs sem PII desnecessária.
- [ ] Política de prazos definida e **revisada juridicamente**.
- [ ] Backup/restore validado de ponta a ponta (P1) antes de habilitar exclusão.

## 15. Riscos e ressalvas

- **Acúmulo de PII:** manter arquivos antigos com PII aumenta a superfície de
  exposição — daí a importância de evoluir o dry-run para limpeza real **com
  salvaguardas**.
- **Exclusão prematura/sem rede:** apagar sem soft-delete/quarentena/backup pode
  causar perda irreversível — por isso a limpeza real está bloqueada até os
  requisitos da seção 14.
- **Backup ainda não validado:** habilitar exclusão antes de ter backup/restore
  testado é arriscado (item P1 pendente).
- **Prazos sem base legal:** os prazos sugeridos (ex.: 30 dias para arquivos) são
  **operacionais**, não juridicamente validados — podem mudar após revisão legal.
- **Sem promessa de compliance:** esta política **não** garante conformidade
  total com LGPD; é preparação técnica.
- **Não pronto para produção:** ver ressalvas P1 em `docs/security-notes.md`.

## 16. Checklist para futura implementação

Sequência sugerida para a sprint futura de limpeza real (cada item exige sua
própria validação; nada aqui autoriza implementar agora):

1. Validar prazos/base legal com revisão jurídica (seção 17).
2. Definir modelo de soft-delete/quarentena (colunas/status/storage) em ADR
   dedicada.
3. Implementar marcação de quarentena (reversível) com auditoria por arquivo.
4. Implementar janela de recuperação (restore) + testes.
5. Implementar remoção física idempotente, coordenada banco+storage, auditada.
6. Garantir `requireRole`/`dono_clinica` + confirmação explícita no endpoint.
7. (Se job/cron) lock + idempotência + observabilidade.
8. Validar backup/restore de ponta a ponta antes de habilitar em produção.
9. Atualizar esta política, `security-notes.md` e o roadmap.

## 17. O que ainda precisa de validação jurídica

Itens que **não** podem ser fechados sem assessoria jurídica/DPO antes de
produção:

- **Prazos de retenção** por tipo de dado (arquivos, pacientes, auditoria) com
  base legal e finalidade.
- **Base legal** do tratamento (consentimento, obrigação legal, legítimo
  interesse) por finalidade.
- **Fluxos LGPD do titular:** exportação e exclusão de dados pessoais, prazos de
  resposta, verificação de identidade.
- **Retenção da auditoria** vs. direito ao esquecimento (equilíbrio entre
  rastreabilidade e minimização).
- **Tratamento de incidentes/vazamentos** (comunicação, prazos).
- **Contratos/operador:** papéis de controlador/operador entre ClinicBridge e
  clínicas.

> Enquanto esses pontos não forem validados juridicamente, este documento
> permanece como **rascunho técnico** e a retenção permanece **dry-run**.

---

## Matriz de retenção (inicial)

> Política **inicial e operacional**, sujeita a validação jurídica (seção 17).
> "Ação atual" reflete o estado real do MVP (dry-run); "Ação futura proposta" é
> sugestão para sprints futuras, **não** implementada.

| Tipo de dado | Onde fica | Contém PII? | Retenção MVP | Ação atual | Ação futura proposta | Observações |
|---|---|---|---|---|---|---|
| Metadados de arquivo (`import_files`) | PostgreSQL | Sim (inclui `nome_original`) | Mantido | Nenhuma (mantém) | Expurgo junto com a limpeza real do arquivo, via quarentena/auditoria | `nome_original` nunca exposto publicamente |
| Arquivo físico de upload | Storage privado (`UPLOAD_DIR/<clinica_id>/<uuid>.<ext>`) | Sim | Mantido | Apenas dry-run identifica candidatos (>30 dias) | Candidato após `IMPORT_FILE_RETENTION_DAYS` (30) → quarentena → remoção física | Hoje **não apaga**; só lista |
| Sessões de importação (`import_sessions`) | PostgreSQL | Não (sem valores de paciente) | Mantido | Nenhuma (mantém) | Manter para rastreabilidade; avaliar marcador se o arquivo for removido | Mapeamento/resumo/amostra de issues (rótulos seguros) |
| Recibo de importação (`import_summary_json`) | PostgreSQL (em `import_sessions`) | Não (só contagens/metadados) | Mantido | Nenhuma (mantém) | Manter para rastreabilidade administrativa | Sem PII de paciente |
| Pacientes administrativos (`patients`) | PostgreSQL | Sim (CPF só mascarado na API) | Mantido | Nenhuma (sem exclusão automática) | Fluxo LGPD de exclusão a pedido (sprint futura); sem exclusão automática | Sem dados clínicos; sem edição/merge no MVP |
| Auditoria (`audit_logs`) | PostgreSQL | Não | Retenção maior | Nenhuma (mantém) | Política de retenção longa + revisão jurídica | Append-only; FKs `SET NULL` preservam evidência |
| Exports baixados pelo usuário | Cliente (fora do app) | Sim (CPF mascarado) | Não armazenado pelo app | App não guarda | Responsabilidade do usuário/cliente após download | Sem signed URL; sem export persistido no servidor |
| Tokens/sessões de auth | JWT (cliente) / DB de tokens | Não (credencial, não dado de paciente) | Expira pelo TTL | Expiração natural | Revisar TTL/refresh quando houver gestão de usuários | Papel "stale" até expirar (ver security-notes) |
| Logs de aplicação | Infra de runtime | Não (logger redige sensíveis) | Conforme infra | Redação de campos sensíveis | Rotação/retenção definida no "deploy seguro" (P1) | Nunca stack/SQL/path/conteúdo |
| Chaves de rate limit (Redis, opcional) | Redis (`clinicbridge:ratelimit:<scope>:<ip>`) | Não (contador por IP) | Expira pela janela | Expiração automática | Nenhuma ação manual necessária | Só existe com `RATE_LIMIT_STORE=redis` |
