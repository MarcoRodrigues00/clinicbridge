# ClinicBridge — Notas de Segurança e Ressalvas

> Detalhe movido do `CLAUDE.md` na compactação de 2026-05-22. As **restrições
> críticas resumidas continuam no `CLAUDE.md`** (sempre visíveis); este arquivo
> guarda a versão completa + as ressalvas priorizadas. Origem das decisões:
> `docs/sprint-history.md`. Fonte de verdade de produto/ameaças:
> `docs/ClinicBridge_Documentacao_Mestre.md` (STRIDE, LGPD).

## Tenant isolation (clinica_id)

- `clinica_id` obrigatório em todo acesso a `patients`, `import_files`, `import_sessions`, `audit_logs`.
- Todo endpoint tenant-scoped usa `requireAuth` + `requireClinic`. Acesso cross-tenant deve retornar 403 (ou 404 genérico onde aplicável, ex.: `findByIdForClinic`).
- DAOs sempre filtram `clinica_id`; **não existe `listAll`**. O único acesso direto a `patients` em service é o INSERT do import, que carrega `clinica_id`.
- `importFileDao`/`importSessionDao`: sem update/delete livre — só operações explícitas com filtro de tenant (ex.: `updateStatusForClinic`, `markCompletedForClinic` por CAS).
- `patientDao` é read-only (sem create/update/delete; o INSERT de import vive no execution service).

## PII e logs

- Issues/mensagens/audits nunca contêm CPF, telefone, e-mail ou nome do paciente.
- `logger` redige `authorization/cookie/password/senha/cpf/token`.
- `errorHandler` nunca retorna stack/SQL/path; 500 vira `internal_error` genérico. Erros de parse de arquivo viram mensagens genéricas (nunca ecoam conteúdo da planilha).
- Nunca expor `nome_original`/`nome_interno`/path/sha256/conteúdo do arquivo na API pública.

## CPF mascarado

- `GET /patients`, `/patients/duplicates`, `/patients/export` nunca retornam CPF bruto — só `cpf_masked` (`***.***.789-01`). `include_cpf_raw=true` no export → 400.

## audit_logs (schema real)

- Colunas: `acao`, `recurso`, `recurso_id`, `usuario_id`, `clinica_id`, `ip`, `user_agent`, `request_id`, `criado_em`.
- **NÃO existem** colunas `metadata` nem `entidade_tipo`. Audits de pacientes não gravam contagens nem PII (só `acao` + `recurso='patient'`).
- Append-only no DAO (sem update/delete). FKs com SET NULL para preservar evidência ao apagar user/clinic.

## Autorização por papel — requireRole (Sprint 3.1)

- Modelo reutiliza o campo `papel` já existente em `users`: `dono_clinica` (owner,
  faz tudo administrativo), `secretaria` (operator, prepara mas não executa ações
  sensíveis), `admin_sistema` (papel de sistema, sem `clinica_id` — `requireClinic`
  já o bloqueia das rotas tenant-scoped). **Sem migration, sem tabela de
  permissões** (decisão consciente: nada de RBAC complexo no MVP).
- `requireRole(allowed)` (`middlewares/requireAuth.ts`) roda **depois** de
  `requireAuth` e `requireClinic` — **nunca** burla autenticação nem tenant.
  `CLINIC_ADMIN_ROLES = ['dono_clinica']`.
- Endpoints gateados a `dono_clinica`: `POST /import-sessions/:id/import`,
  `POST /import-sessions/:id/mark-ready`, `GET /patients/export`,
  `GET /import-files/retention/dry-run`.
- `secretaria` mantém: upload, preview, validate, create session, dry-run, e
  leitura de `GET /patients` e `GET /patients/duplicates`.
- 403 → `{ error: { code: 'forbidden_role', message: 'Você não tem permissão para
  executar esta ação.' } }` (genérico, sem PII, sem detalhe interno). 403 de papel
  **não** é auditado (decisão: não auditar cada negação).
- **Tradeoff — papel stale:** o papel vem do JWT (sem hit no DB por request,
  consistente com `clinica_id`/`papel` já consumidos das claims). Se o papel de um
  usuário mudar, o token antigo carrega o papel velho até expirar. Aceitável
  enquanto **não há gestão de usuários na UI** (papel só muda no registro ou via
  SQL). Quando entrar gestão de usuários, considerar TTL curto de token + refresh,
  ou lookup no DB no `requireRole`.
- Frontend: ações sem permissão são escondidas/explicadas (export só para owner;
  mark-ready/import só para owner; painel de retenção escondido para operator) e
  qualquer 403 `forbidden_role` vira mensagem amigável. **Defesa real é no
  backend** — o frontend é só UX.

## Rate limit

- Por grupo, IP-keyed; roda **antes** de `requireAuth` (rejeita flood antes de auth/DB).
- 429 sempre retorna `{ error: { code: 'rate_limited', message } }` genérico (sem eco de input); headers draft-7 `RateLimit`/`Retry-After`.
- Padrão de env: `<SCOPE>_RATE_LIMIT_WINDOW_MS` / `<SCOPE>_RATE_LIMIT_MAX` (scopes: AUTH, UPLOAD, PATIENTS, EXPORT, IMPORT). Ver `.env.example`.

## Trust proxy (Sprint 3.2)

- `app.set('trust proxy', env.TRUST_PROXY)` — configurável via `TRUST_PROXY`
  (`config/env.ts` transforma a string em boolean/number/string).
- **Default `false`** = não confia em `X-Forwarded-*`. Correto quando a API é
  exposta diretamente (MVP). Confiar cegamente em XFF deixaria qualquer cliente
  forjar o IP de origem, quebrando rate limit e a precisão de `req.ip` no
  `audit_logs`.
- Atrás de proxy reverso (Nginx/Traefik/Cloudflare): definir o número de hops
  (ex.: `TRUST_PROXY=1`) ou um preset do Express (`loopback`, etc.).
- Em **produção**, se `TRUST_PROXY` não estiver setado, o boot emite **warning
  forte** (não falha — `false` é valor legítimo para API exposta direto).
- Verificado: com `TRUST_PROXY=1` + `X-Forwarded-For`, a chave de rate limit usa
  o IP do XFF; com `false`, usa o IP do socket (XFF ignorado).

## Rate-limit store compartilhado / Redis (Sprint 3.2)

- `RATE_LIMIT_STORE=memory|redis` (default `memory`). Memory = `MemoryStore` por
  instância do `express-rate-limit` (ok p/ dev/instância única). Redis = store
  compartilhado (`rate-limit-redis` + `redis`), necessário antes de escalar
  horizontalmente (contadores consistentes entre instâncias).
- **Conexão única** compartilhada por todos os limiters (auth/upload/patients/
  export/import); cada limiter usa prefixo próprio (`REDIS_PREFIX<scope>:`) para
  manter contadores independentes. Conectada no bootstrap **antes** do app subir
  (import dinâmico do `app` após `initRateLimitStore` garante que o `store.init`
  rode com o cliente já aberto).
- **Falha de Redis em redis mode = falha de boot** (`server.ts` → `process.exit(1)`).
  **Não** degrada silenciosamente para memory (isso tornaria o limite inútil
  entre instâncias). Em dev o default é memory, então Redis não é obrigatório.
- **Segredos:** `REDIS_URL` (pode conter credenciais) **nunca** é logado — só a
  mensagem de erro do cliente. Sem PII/headers sensíveis nos logs do store.
- Redis é opcional no `docker-compose.yml` (serviço `redis`, bound a 127.0.0.1).
  Com `RATE_LIMIT_STORE=memory` o backend nem conecta.
- Verificado: redis mode → 429 após o teto, chave `clinicbridge:ratelimit:export:<ip>`
  no Redis; contador **persiste entre reinícios** (store compartilhado).

## Upload (magic bytes / conteúdo real)

- Valida o CONTEÚDO REAL, não confia só em extensão/MIME (defesa em profundidade: extensão + MIME declarado + conteúdo).
- XLSX: exige assinatura ZIP `PK\x03\x04` (`50 4B 03 04`) + presença das partes OOXML `[Content_Types].xml` e `xl/workbook.xml` (scan de nomes de entrada via `buffer.includes`, sem extrair/descomprimir/temp file → sem zip-slip/zip-bomb).
- CSV: exige texto legível (rejeita NUL/binário).
- vazio → `file_empty`; incompatível → `invalid_file_content`; MIME fora da allowlist → `invalid_file_type`.
- Storage privado; nome interno aleatório (`<uuid>.<ext>`); SHA-256 gravado.

## Export

- Read-only: NÃO altera `patients`. Nunca exporta CPF bruto.
- Anti-formula-injection (CWE-1236): prefixa `'` quando célula começa com `= + - @` (ou tab/CR/LF) — em CSV e XLSX.
- `Content-Disposition` com filename fixo (sem input do usuário). Sem signed URL pública. Teto `PATIENTS_EXPORT_MAX_ROWS` → 413 acima.

## Retenção dry-run (estado atual)

- `GET /import-files/retention/dry-run` é READ-ONLY: NÃO apaga arquivo nem linha, NÃO altera `import_files`/`import_sessions`/`patients`.
- Só metadados seguros (id/status/extensao/mime_type/tamanho_bytes/criado_em/has_import_session/latest_session_status) — NUNCA `nome_original`/`nome_interno`/path/sha256/conteúdo.
- Exclui arquivos em fluxo ativo (última sessão `validated`/`ready_for_import`/`import_started`).
- O painel frontend (Sprint 2.26) é só visualização: sem botão de apagar/limpar/excluir, sem download.
- **Limpeza real é futura** e exige confirmação/auditoria/soft-delete/quarentena (ver P2).

## Política de retenção e governança de dados (Sprint 3.3)

- **Documento principal:** `docs/data-retention-policy.md` (princípios, tipos de
  dado tratados/fora de escopo, matriz de retenção, requisitos para limpeza real,
  o que precisa de validação jurídica).
- **Decisão:** ADR `docs/adr/0002-data-retention-governance.md` ("dry-run first,
  deletion later").
- **Estado atual:** a retenção é **dry-run** — nada é apagado. Não há endpoint de
  delete, job/cron, botão destrutivo nem signed URL.
- **Limpeza real futura** exige (todos): `dono_clinica`, confirmação explícita,
  soft-delete/quarentena antes da remoção física, auditoria por arquivo,
  idempotência, lock se virar job, coordenação banco+storage, logs sem PII,
  política de prazos validada e backup/restore validado.
- **Sem promessa de compliance:** o documento é rascunho técnico inicial e **deve
  ser revisado juridicamente antes de produção**; não afirma conformidade
  completa com LGPD/HIPAA/CFM. O produto **não** está pronto para produção.

## Limites intencionais (MVP)

- `IMPORT_MAX_ROWS=100` — limite conservador intencional para MVP.
- `DRY_RUN_MAX_ROWS=20000`, `DRY_RUN_MAX_ISSUES_RETURNED=100`, `DRY_RUN_SAMPLE_ROWS=20`.

---

## Ressalvas priorizadas

### P1 — antes de produção
- ~~trust proxy configurado~~ **feito na Sprint 3.2** (`TRUST_PROXY`). Falta só
  definir o valor real no ambiente de produção (hop count do proxy usado).
- ~~Redis / shared store para rate limit~~ **feito na Sprint 3.2**
  (`RATE_LIMIT_STORE=redis`). Falta provisionar o Redis gerenciado de produção e
  setar `REDIS_URL`.
- ~~`requireRole` / gating dono-admin para endpoints administrativos sensíveis~~
  **feito na Sprint 3.1** (ver seção "Autorização por papel"). Resta: gestão de
  usuários/papéis e mitigação do papel stale quando isso existir.
- política LGPD de retenção: **política técnica inicial criada na Sprint 3.3**
  (`docs/data-retention-policy.md` + ADR 0002). Resta: **validação jurídica** de
  prazos/base legal/fluxos do titular e a limpeza real futura (com salvaguardas)
- backup / restore
- deploy seguro
- revisão de CORS/env de produção (`FRONTEND_ORIGIN` sem `*`)

### P2
- limpeza real de arquivos com confirmação/soft-delete/quarentena/auditoria/idempotência/lock
- paginação de duplicados
- export streaming/assíncrono para bases grandes
- rate limit dedicado nos GETs leves, se necessário

### P3
- antivírus / sandbox / DLP no upload
- validação XLSX OPC/XML completa, se o risco aumentar
- observabilidade / métricas
- suporte a `.xlsm`/`.xlsb` apenas se houver necessidade real

---

## Futura expansão clínica — requisitos mínimos antes de codar

> Direção definida no ADR `docs/adr/0001-product-direction-option-c.md` (Opção C).
> Esta seção lista **requisitos mínimos** que precisam estar satisfeitos **antes**
> de qualquer código clínico. É preparação/requisito, **não** afirmação de
> conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil. Nada aqui autoriza
> implementar prontuário/prescrição agora — isso exige ADR(s) futura(s).

- **`requireRole` obrigatório** — papéis/permissões implementados e testados antes
  de expor qualquer dado clínico.
- **Audit de acesso/leitura** — auditar não só escrita, mas também quem leu o quê
  (acesso a dado clínico é evento auditável).
- **Versionamento de notas** — notas clínicas versionadas (histórico imutável,
  sem perda de versões anteriores).
- **Separação administrativa vs. clínica** — fronteira explícita em domínio e
  banco; dado clínico nunca misturado ao administrativo por acidente.
- **Política LGPD específica** — base legal, finalidade, retenção, export/exclusão
  próprios para dado clínico (mais sensível que o administrativo).
- **Consentimento / base legal** — registrado e verificável antes de tratar dado
  clínico.
- **Backup/restore validado** — testado de ponta a ponta antes de guardar dado
  clínico.
- **Revisão de threat model** — STRIDE específico do domínio clínico revisado.
- **Logs sem conteúdo clínico sensível desnecessário** — minimização: nunca logar
  conteúdo clínico além do estritamente necessário e auditável.
- **Testes de autorização** — cobertura de cross-role e cross-tenant para os novos
  recursos clínicos.
- **Decisão regulatória** — o que é permitido guardar/exibir, registrado antes do
  código.
- **Prescrição só com análise ICP-Brasil/compliance** — assinatura digital,
  workflow de emissão/cancelamento e risco jurídico avaliados (Fase 7 do
  `docs/roadmap-next-phase.md`).
