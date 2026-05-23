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
- `patientDao` (Sprint 3.22): leitura + escritas **tenant-scoped** — `create`
  (força `origem='manual'`/`status='active'`/`import_session_id=null`),
  `updateForClinic` (patch parcial), `setStatusForClinic` (archive/restore). **Sem
  delete físico** (arquivar = `status='archived'`; preserva o histórico de
  agendamentos, que é `ON DELETE CASCADE`). `updateForClinic`/`setStatusForClinic`
  filtram `{ id, clinica_id }` e devolvem `undefined` para id de outro tenant →
  service responde **404 genérico** `patient_not_found` (não distingue inexistente
  de cross-tenant; sem enumeração).

## PII e logs

- Issues/mensagens/audits nunca contêm CPF, telefone, e-mail ou nome do paciente.
- `logger` redige `authorization/cookie/password/senha/cpf/token`.
- `errorHandler` nunca retorna stack/SQL/path; 500 vira `internal_error` genérico. Erros de parse de arquivo viram mensagens genéricas (nunca ecoam conteúdo da planilha).
- Nunca expor `nome_original`/`nome_interno`/path/sha256/conteúdo do arquivo na API pública.

## CPF mascarado

- `GET /patients`, `/patients/duplicates`, `/patients/export` nunca retornam CPF bruto — só `cpf_masked` (`***.***.789-01`). `include_cpf_raw=true` no export → 400.
- As escritas de paciente (`POST /patients`, `PATCH /patients/:id`) aceitam CPF bruto no corpo (gravado para mascarar na leitura) mas a resposta volta **só** `cpf_masked`; o CPF bruto nunca é devolvido. A validação de entrada (`patient_invalid`/400) **nunca ecoa o valor** ofensivo (ex.: "CPF deve ter 11 dígitos", sem o número). Na edição, como o CPF só existe mascarado no cliente, o frontend envia o campo CPF em branco para **manter** o atual (não pré-preenche o mascarado).
- **Duplicados acionáveis (Sprint 3.23, só frontend):** a tela de duplicados **não** tem endpoint próprio de ação — ela reusa o CRUD de pacientes (`PATCH /patients/:id`, `.../archive`, `.../restore`). Logo herda as mesmas garantias: tenant por `clinica_id`, **404 genérico** cross-tenant, **arquivar/restaurar só dono** (`requireRole`), editar dono+secretaria, CPF só `cpf_masked`, audits `patient.*` sem PII. O `group_key` continua não-reversível (hash dos ids, nunca CPF/e-mail/telefone). O scan (`/patients/duplicates`) inclui registros **arquivados** (sem filtro de status), então a UI exibe o status por registro; nada é apagado fisicamente.

## audit_logs (schema real)

- Colunas: `acao`, `recurso`, `recurso_id`, `usuario_id`, `clinica_id`, `ip`, `user_agent`, `request_id`, `criado_em`.
- **NÃO existem** colunas `metadata` nem `entidade_tipo`. Audits de pacientes não gravam contagens nem PII (só `acao` + `recurso='patient'` + `recurso_id` = UUID do paciente). Ações da Sprint 3.22: `patient.create.success`, `patient.update.success`, `patient.archive.success`, `patient.restore.success` (nenhuma carrega nome/CPF/telefone/e-mail/valor de campo).
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
  `GET /import-files/retention/dry-run`, **`PATCH /patients/:id/archive`** e
  **`PATCH /patients/:id/restore`** (Sprint 3.22 — arquivar/restaurar paciente).
- `secretaria` mantém: upload, preview, validate, create session, dry-run,
  leitura de `GET /patients` e `GET /patients/duplicates`, e **criar/editar
  paciente** (`POST /patients`, `PATCH /patients/:id`, Sprint 3.22) — mas **não**
  arquivar/restaurar (owner-only).
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

## Backup e restore (estratégia 3.4 + implementação local 3.5)

- **Estratégia/decisão:** `docs/backup-restore-strategy.md` + ADR
  `docs/adr/0003-backup-restore-strategy.md` (**Restic-first**; Bacula como opção
  futura enterprise). **Runbook operacional local:** `docs/backup-restore-local-runbook.md`.
- **Estado atual (Sprint 3.5):** backup/restore **local/dev implementado** com
  Restic — scripts em `scripts/` (`check-backup-env.sh`, `backup-local-restic.sh`,
  `restore-local-restic.sh`). **Restore drill validado**: restore em banco
  **separado** (`clinicbridge_restore_test`), counts batendo com o principal
  (patients/import_files/import_sessions) e banco principal **intacto**.
  **Offsite/produção continuam pendentes** (sem AWS/S3/Backblaze/MinIO).
- **O que é protegido:** PostgreSQL (PII) via `pg_dump -Fc` + storage de uploads
  (se existir). **Redis** é efêmero (não entra). **Segredos** (`.env`/`JWT_SECRET`/
  `RESTIC_PASSWORD`) tratados à parte — **nunca** em arquivo versionado nem no
  backup em texto puro.
- **Segurança dos scripts:** `bash`+`set -euo pipefail`; sem senha/secret
  hardcoded; `RESTIC_PASSWORD` só vem do ambiente (nunca impressa); restore
  **aborta** se `RESTORE_DB == POSTGRES_DB` (protege o principal). `backups/` e o
  repositório Restic são git-ignored (repo cifrado contém PII + chave).
- **Chave do repo Restic:** perda da senha = backup **irrecuperável** — gestão de
  chave em produção é processo próprio (pendente).
- **Liga ao ADR 0002:** a limpeza real de arquivos só é destravada após
  backup/restore validado de ponta a ponta (critério #10) — local validado;
  produção/offsite ainda faltam.
- **Sem promessa de compliance:** prazos/retenção de backups e offsite dependem de
  validação jurídica. Não afirma produção pronta.

## Deploy seguro / CORS / env de produção (Sprint 3.6)

- **Documento principal:** `docs/deploy-security-checklist.md`; **decisão:** ADR
  `docs/adr/0004-deploy-security-baseline.md`. Sprint de auditoria + pequenos
  hardenings (**sem** deploy real, AWS, Terraform, CI/CD, domínio ou HTTPS real).
- **Guardas de produção (`config/env.ts`):** com `NODE_ENV=production`, o boot
  **falha** se `JWT_SECRET` ainda usa o placeholder do `.env.example`
  (`replace-with…`/`change-me`) ou se `DATABASE_URL` contém `change-me-locally`.
  Motivo: o placeholder do `JWT_SECRET` tem >48 chars e passava no `min(48)`. Dev/
  test não são afetados.
- **Warning de produção (`app.ts`):** `RATE_LIMIT_STORE=memory` em produção emite
  warning (contadores por instância → limite inútil em multi-instância). Mantido
  fail-fast só para redis sem conexão. Espelha o warning já existente de `TRUST_PROXY`.
- **CORS:** allowlist por `FRONTEND_ORIGIN`; `*` recusado no boot em produção;
  lista vazia também falha; origem não permitida → sem CORS (browser bloqueia),
  log sem vazar detalhe; chamadas sem `Origin` (curl/health) passam. `credentials:
  true` nunca com `*`. Exemplos: dev `http://localhost:5173`, prod
  `https://app.clinicbridge.com.br`.
- **Headers (Helmet):** defaults (HSTS/noSniff/frameguard/referrer-policy/CSP);
  `x-powered-by` desabilitado. HSTS só vale sob HTTPS (requisito de produção).
- **HTTPS/reverse proxy:** requisito de produção **documentado, não implementado**
  (TLS terminado no proxy; API não serve TLS).
- **Healthcheck (Sprint 3.7):** `GET /health` e o alias `GET /health/live` são
  liveness (status/service/timestamp; sem env/versão/secret; sem DB/auth/PII).
  `GET /health/ready` é readiness: `select 1` leve no pool knex com timeout curto
  (`HEALTH_READY_DB_TIMEOUT_MS`, default 2000) → **200** `{checks:{database:'ok'}}`
  ou **503** `{checks:{database:'error'}}`. **Nunca** vaza `DATABASE_URL`/erro
  bruto/stack/SQL (só `ok`/`error`); sem auth, sem PII, sem `audit_logs`. Falha do
  DB é logada só com mensagem segura (verificado: log não contém host/credencial).
- **docker-compose:** é **local/dev**, não produção (ver `docs/deploy-security-checklist.md` §14).
- **Sem promessa:** não afirma produção pronta nem compliance completo.

## Edge security — Nginx reverse proxy + WAF (estratégia, Sprint 3.8)

- **Documento:** `docs/edge-security-strategy.md`; **decisão:** ADR
  `docs/adr/0005-edge-security-reverse-proxy-waf.md`; **runbook local/staging:**
  `docs/nginx-local-staging-runbook.md`.
- **Implementado (Sprint 3.9 + 3.10, local/staging):** Nginx reverse proxy em
  `infra/nginx/` + serviço `nginx` opcional no compose (profile `edge`,
  127.0.0.1:8080). `client_max_body_size 10m` (≥ `UPLOAD_MAX_BYTES`); headers de
  borda `X-Real-IP`/`X-Forwarded-For` **com anti-spoof** (Nginx sobrescreve o XFF
  do cliente → comprovado: a chave de rate limit usa o IP real, não o forjado);
  logs sem `Authorization`/`Cookie`/corpo; backend atrás do proxy usa `TRUST_PROXY=1`.
- **Backend containerizado (Sprint 3.10):** `backend/Dockerfile` (multi-stage,
  node:20-slim, **non-root** `node`, deps **prod-only**, **sem `.env`** na imagem;
  `.dockerignore` bloqueia `.env`/secrets/`node_modules`/`storage`/`backups` em
  qualquer nível) + serviço `backend` no compose (profile `edge`, **`expose`** sem
  publicar porta). Nginx → `backend:3001` na rede do compose (resolve a limitação
  Docker Desktop + WSL2 da 3.9). Segredos do container via env (placeholder
  local/staging; `NODE_ENV=development` para usar o Postgres de dev). Verificado
  e2e: health/live/ready via proxy, readiness 503 com DB parado, anti-spoof, logs
  seguros, counts do banco intactos (6/24/7).
- **TLS local/staging (Sprint 3.11):** Nginx termina TLS com **certificado
  autoassinado** gerado por `scripts/generate-local-nginx-cert.sh` (SAN: localhost/
  clinicbridge.local/127.0.0.1) em `infra/nginx/certs/` (**gitignored**; chave
  privada nunca versionada — `.gitignore` cobre `infra/nginx/certs/` + `*.key`/
  `*.pem`). Server `:80` faz **301 HTTP→HTTPS**; server `:443` proxya para o backend
  com `X-Forwarded-Proto: https`. Portas host 8080/8443; teste com `curl -k`.
  **HSTS desativado** em local (comentado) — ligar só com HTTPS real estável.
  Verificado: redirect 301, HTTPS health/live/ready 200, readiness 503 com DB
  parado, logs sem `Authorization`/`Cookie`/corpo. **Ainda SEM domínio/cert real
  ou WAF.** Produção usa cert real (ACME/gerenciado).
- **Decisão:** **Nginx** reverse proxy baseline (Caddy/Traefik avaliados, não
  escolhidos). TLS termina no Nginx; backend continua **HTTP interno**, **não**
  exposto direto na internet.
- **WAF futuro:** ModSecurity + OWASP CRS, começando em **detection-only/log-only**;
  blocking só após tuning por rota (upload/import/export/auth) — alto risco de
  falso positivo em CSV/XLSX, JSON de mapeamento, acentos e JWT no header.
- **Integrações:** `TRUST_PROXY` = hop count real do Nginx (IP real p/ rate
  limit/audit); `FRONTEND_ORIGIN` = domínio HTTPS real (CORS continua no app);
  `client_max_body_size` ≥ `UPLOAD_MAX_BYTES` (5 MB); logs de borda sem corpo/
  `Authorization`/`Cookie`/PII; `/health/live` (liveness) e `/health/ready`
  (readiness) atrás do proxy.
- **WAF não substitui:** `requireAuth`/`requireClinic`/`requireRole`, rate limit do
  app, validação por magic bytes, CPF mascarado, CORS, errorHandler seguro.

## Agenda Administrativa — riscos e proibição clínica (escopo 3.12, backend 3.14)

- **Documento/decisão:** `docs/administrative-scheduling-scope.md` + ADR
  `docs/adr/0006-administrative-scheduling-module.md`.
- **Backend implementado (Sprint 3.14):** tabelas `clinic_professionals` e
  `appointments` (tenant-scoped por `clinica_id`; CHECK de status + `ends_at >
  starts_at`); endpoints `/clinic-professionals` (writes só `dono_clinica`) e
  `/appointments` (owner + secretaria). `requireAuth`+`requireClinic`(+`requireRole`);
  tenant isolation no DAO (sem `listAll`); **sem DELETE** (cancelamento por status
  `cancelled`); validação de UUID/datas/status/notes (max 500). Cross-tenant de
  patient/professional → 400 seguro; detalhe cross-tenant → 404. Auditoria
  (`appointment.*`/`clinic_professional.*`) **sem PII e sem `administrative_notes`**;
  o schema do `audit_logs` não tem coluna de conteúdo. **Nenhum dado clínico** em
  nenhuma camada; `administrative_notes` nunca é logado.
- **Frontend implementado (Sprint 3.15):** painéis no Dashboard (profissionais +
  agenda). **Aviso anti-clínico** visível no campo de observação ("Não inclua
  diagnóstico, queixa, medicação, tratamento, exame, CID, prontuário ou informação
  clínica"). A UI esconde a gestão de profissionais para não-owner (defesa real é o
  `requireRole` no backend); 403/400 viram mensagens amigáveis. O cliente API só
  ganhou suporte a **PATCH** (sem mudança de backend). Sem WhatsApp/lembretes.
  Times tratados em UTC no MVP (simplificação para alinhar criação/filtro/exibição).
- **QA visual (Sprint 3.17):** polimento da agenda (cabeçalho de data, timeline,
  form colapsável) e troca de "especialidade" por "função/rótulo interno" — reforça
  que o rótulo do profissional **não** é dado clínico. Landing: seção de Roadmap
  interno (Sprint 0/1/2/3) substituída por capacidades de produto ("piloto
  administrativo"; sem afirmar produção pronta nem compliance completo). Avisos
  anti-clínico da agenda mantidos. Sem mudança de backend/contrato.
- **Lembrete manual/assistido (Sprint 3.18):** `utils/reminders.ts` + botões na
  agenda **apenas preparam** uma mensagem **neutra** para um humano copiar/enviar.
  **Sem envio automático, sem WhatsApp API oficial, sem SDK, sem job/cron/fila/
  webhook, sem token/secret, sem registro de envio.** "Abrir WhatsApp" monta um
  link `wa.me` (telefone normalizado p/ BR; sem telefone → aviso amigável) que abre
  o WhatsApp do operador com o rascunho — **nada é enviado pelo sistema**. A
  mensagem **padrão** usa **só** nome do paciente + nome da clínica + data + hora;
  **nunca** profissional/rótulo, `administrative_notes`, CPF, e-mail, motivo ou
  qualquer dado clínico/área sensível. A mensagem pode ser **editada localmente**
  por agendamento (draft só em memória — **sem backend, sem localStorage, sem
  persistência**), com `maxLength` 700 e **aviso anti-clínico** ao lado do textarea
  (sem bloqueio textual automático, p/ evitar falso positivo). WhatsApp automático/
  API segue gated (ADR futura).
- **App shell (Sprint 3.16):** `/app` em abas + footer; cache via
  `@tanstack/react-query` (sem token persistido no cache — o token segue em
  `authStorage`; as queries leem o token por request via `getToken()`). A
  reorganização não afrouxa nenhuma checagem: defesa continua no backend
  (`requireAuth`/`requireClinic`/`requireRole`). Footer reforça que o produto é
  **administrativo** ("Não substitui prontuário ou sistema clínico").
- **Administrativa, não clínica:** a agenda **não** pode conter diagnóstico,
  prescrição, evolução, CID, anamnese, exames, medicação nem prontuário. Campo
  `administrative_notes` é opcional/curto e **administrativo** (✅ "pediu contato
  por telefone"; ❌ "dor intensa", "ansiedade", "remédio X", "diagnóstico Y").
- **PII indireta:** a agenda revela presença/horário de pacientes e pode insinuar
  contexto sensível conforme o profissional → minimização + acesso por papel +
  tenant isolation (`clinica_id`; cross-tenant → 403; sem `listAll`).
- **Permissões (reuso):** `dono_clinica` gerencia profissionais + todas as ações;
  `secretaria` opera agendamentos; `admin_sistema` barrado por `requireClinic`.
- **Auditoria:** ações relevantes em `audit_logs` (padrão atual, append-only) sem
  PII e **sem** conteúdo de observação.
- **Fora do MVP:** export da agenda e lembretes automáticos; delete físico (usar
  status `cancelled`). Implementação só nas Sprints 3.14+.

### Lembretes / WhatsApp (escopo futuro, Sprint 3.13)

- **Escopo/ADR-only — não implementado** (sem envio real, sem WhatsApp API, sem
  SDK, sem job/cron). Detalhe: `docs/administrative-scheduling-scope.md` (Parte II)
  + adendo no ADR 0006.
- **Mensagem neutra/administrativa:** lembrete de horário + confirmar/remarcar.
  Lembretes podem expor informação sensível **indiretamente** → proibido no texto
  qualquer dado clínico (motivo, diagnóstico, especialidade sensível, tratamento,
  medicação); preferir "atendimento" genérico em vez de especialidade reveladora.
- **Manual-first:** primeiro passo é lembrete assistido/manual ("copiar mensagem"/
  "abrir WhatsApp"); **humano decide enviar**. WhatsApp **automático/API** exige
  **opt-in** + **opt-out** + **ADR/sprint própria** antes de implementar.
- **Logs sem conteúdo:** registrar só metadados (canal/horário/status/`template_key`)
  — **nunca** o texto renderizado nem PII/clínico; audit sem PII excessiva.
- **Segredos:** tokens/API keys de qualquer provedor **nunca** no Git/docs/compose
  — usar secrets manager quando a automação real existir.

## MFA / TOTP no login (Sprint 3.19)

- **TOTP com app autenticador** (`otplib` + `qrcode`). **Sem SMS, sem e-mail OTP,
  sem serviço externo/pago.** Backup codes ficam para sprint futura (ressalva).
- **Secret cifrado em repouso:** AES-256-GCM (`config/mfaCrypto.ts`), chave
  derivada via HKDF-SHA256 do `JWT_SECRET` por padrão, ou de `MFA_ENCRYPTION_KEY`
  (opcional) quando setado. **Ressalva P1:** em produção usar uma chave dedicada/
  KMS; trocar `JWT_SECRET` (quando a chave não é dedicada) invalida os secrets MFA.
- **Secret nunca vaza:** só é retornado durante o setup (`/auth/mfa/setup`, para o
  QR/chave manual); `status` e demais respostas **nunca** retornam o secret; nunca
  é logado (verificado: log de boot/fluxo sem o secret).
- **Login em 2 passos:** se `mfa_enabled`, `/auth/login` valida a senha mas **não**
  emite JWT — retorna `mfa_required` + `mfa_challenge_token` (JWT curto, 5min,
  `typ=mfa_challenge`, sem `papel` → rejeitado por `requireAuth`). `/auth/mfa/
  verify-login` valida o challenge + código e só então emite o JWT de sessão.
- **Setup/disable:** setup guarda um **pending secret cifrado** no DB (expira em
  10min) confirmado por código; `disable` exige um **código TOTP válido** (não só a
  senha). `status` retorna apenas `mfa_enabled` + `mfa_enabled_at`.
- **Compatibilidade:** usuários existentes têm `mfa_enabled=false` → login
  inalterado (aditivo; migration sem backfill destrutivo).
- **Auditoria sem PII/secret:** `auth.mfa.setup.started/confirmed`,
  `auth.mfa.login.challenge/success/failure`, `auth.mfa.disable.success/failure`
  (recurso `auth`, sem código/secret). Erros genéricos (`invalid_mfa_code`), sem
  enumeração. Rate limit de `/auth/*` cobre os endpoints MFA.

## MFA backup codes / códigos de recuperação (Sprint 3.21)

- **Tabela separada `user_mfa_backup_codes`** (`id`, `user_id` FK→users CASCADE,
  `code_hash`, `used_at`, `created_at`; índices `user_id` e `user_id,used_at`). Os
  códigos **nunca** ficam na linha de `users`.
- **Só hash, nunca texto puro:** `code_hash` é argon2id (reusa `passwordService`).
  `mfaBackupCodeService` gera **10** códigos de alta entropia (alfabeto sem
  `0/O/1/I/L`, formato `ABCDE-FGHJK`, ~49 bits) e os exibe ao usuário **uma única
  vez**. `normalize()` (uppercase + só alfanuméricos) torna a entrada tolerante a
  maiúsculas/hífen/espaços sem enfraquecer o casamento.
- **Uso único:** `consume()` verifica o código contra os **não usados** do usuário
  (argon2.verify) e, no match, marca `used_at` por **compare-and-set** (`where
  used_at is null`) — protege contra corrida/duplo uso. Verificação sequencial
  sobre os códigos não usados (custo aceitável: login de recuperação é raro).
- **Só com MFA ativo:** gerados no `mfaConfirm` (transação: ativa MFA **e** grava
  os hashes) e no `regenerateBackupCodes`. **Regenerar invalida os anteriores**
  (substitui o conjunto) e exige um **TOTP válido** (mesmo fator do disable).
  `mfaDisable` apaga todos os códigos (transação com o disable).
- **Login:** `verifyMfaLogin` aceita **TOTP _ou_ backup code**. Erro **idêntico** e
  genérico (`invalid_mfa_code`, 401) em qualquer falha — não revela qual fator nem
  se a conta existe. Backup consumido → audit `auth.mfa.backup_code.used.success` +
  `auth.mfa.login.success`.
- **Nunca exposto/loggado:** os códigos só voltam na resposta de `confirm` e de
  `regenerate` (1x). `GET /auth/me` e `mfaStatus` **nunca** retornam códigos —
  status só devolve `backup_codes_remaining` (contagem). Códigos/secret **nunca**
  em logs (verificado: grep no log do backend = 0).
- **Endpoint:** `POST /auth/mfa/backup-codes/regenerate` (requireAuth + TOTP), sob
  `/auth/*` → herda `authRateLimit`. **Sem** GET que devolva códigos.
- **Auditoria:** `auth.mfa.backup_codes.generated.success`,
  `auth.mfa.backup_codes.regenerated.success`, `auth.mfa.backup_codes.regenerate.failure`,
  `auth.mfa.backup_code.used.success` (recurso `auth`, **sem** código/PII). Mantém o
  prefixo `auth.mfa.*` por consistência com os demais audits de auth.
- **Fora de escopo (não implementado):** SMS/e-mail/WhatsApp OTP, recovery por
  suporte, bypass manual, job/cron. **Ressalva:** backup codes mitigam a perda do
  app autenticador, mas a recuperação total ainda depende de processo
  operacional/admin (futuro).

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
- backup / restore: **estratégia decidida (3.4)** + **backup/restore local
  implementado e restore drill validado (3.5)** — Restic-first; ADR 0003 +
  `docs/backup-restore-strategy.md` + runbook `docs/backup-restore-local-runbook.md`.
  Resta **offsite/produção** (provisionar destino, gestão de chave, agendamento,
  monitoramento) e validar de ponta a ponta em produção
- deploy seguro: **baseline auditada + checklist criado na Sprint 3.6**
  (`docs/deploy-security-checklist.md` + ADR 0004). Resta o deploy real
  (HTTPS/reverse proxy, secrets manager, banco/Redis gerenciados, monitoramento)
- revisão de CORS/env de produção (`FRONTEND_ORIGIN` sem `*`): **revisada na
  Sprint 3.6** + guardas de placeholder (`JWT_SECRET`/`DATABASE_URL`) e warning de
  `RATE_LIMIT_STORE=memory` em produção

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
