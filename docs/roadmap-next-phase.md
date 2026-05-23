# ClinicBridge — Roadmap da Próxima Fase

> Direção definida no ADR `docs/adr/0001-product-direction-option-c.md`
> (Opção C — base administrativa segura primeiro, expansão clínica futura
> planejada, não implementada). Este roadmap é **sugestão de sequência**, não um
> compromisso de datas. Nada aqui autoriza código clínico: as Fases 5–7 são de
> planejamento e exigem ADR(s) futura(s) dedicada(s) antes de qualquer
> implementação.

## Princípios

- Consolidar o administrativo até produção antes de assumir complexidade clínica.
- Manter a fronteira administrativo vs. clínico explícita em domínio e banco.
- Cada salto de risco (clínico, prescrição) começa por documentação/decisão, não
  por código.
- Falar em **preparação e requisitos**, nunca em "compliance completo".

---

## Fase 3 — Produção e governança administrativa (próxima prioridade)

Objetivo: tornar a base administrativa apta a produção, com governança real.

- `requireRole` / gating dono-admin nos endpoints administrativos sensíveis
  (inclui retenção e, futuramente, limpeza real) — **feito (Sprint 3.1)**;
- **MFA por TOTP no login — feito (Sprint 3.19)** (app autenticador; secret cifrado;
  sem SMS/e-mail OTP/serviço externo); pendente: backup codes + chave de cifra
  dedicada/KMS em produção;
- trust proxy configurado (IP correto atrás de proxy para rate limit/logs) —
  **feito (Sprint 3.2)**;
- Redis / shared store para rate limit (substituir o store em memória do MVP) —
  **feito (Sprint 3.2)**;
- política LGPD de retenção (prazos, base legal, fluxo) — **avançada (Sprint 3.3):
  política técnica inicial + ADR 0002 criadas** (`docs/data-retention-policy.md`);
  **pendente: validação jurídica** dos prazos/base legal e a limpeza real futura;
- backup / restore (validado de ponta a ponta) — **estratégia decidida (3.4,
  Restic-first; ADR 0003)** + **backup/restore local implementado e restore drill
  validado (3.5)** (scripts em `scripts/` + `docs/backup-restore-local-runbook.md`);
  **pendente: offsite/produção** (destino, gestão de chave, agendamento,
  monitoramento) e validação de ponta a ponta em produção;
- deploy seguro (segredos, hardening de runtime, healthchecks) — **baseline
  auditada + checklist (Sprint 3.6): `docs/deploy-security-checklist.md` + ADR
  0004**; **readiness `/health/ready` + liveness `/health`/`/health/live`
  implementados (Sprint 3.7)**; pendente: deploy real (HTTPS/reverse proxy, secrets
  manager, banco/Redis gerenciados, monitoramento);
- edge security (reverse proxy + WAF) — **estratégia decidida (Sprint 3.8): Nginx
  baseline + WAF ModSecurity/OWASP CRS detection-only first** (ADR 0005) +
  **Nginx reverse proxy local/staging (3.9)** + **backend containerizado e2e
  (3.10)** + **TLS local/staging (cert autoassinado) + HTTP→HTTPS (3.11)**
  (`infra/nginx/` + `backend/Dockerfile` + `scripts/generate-local-nginx-cert.sh`;
  serviços opcionais no compose, profile `edge`; runbook
  `docs/nginx-local-staging-runbook.md`); pendente: **TLS real em produção** (cert
  ACME/gerenciado + domínio + HSTS) e o **WAF** (detection-only → tuning → blocking);
- revisão de CORS/env de produção (`FRONTEND_ORIGIN` sem `*`) — **feita (Sprint
  3.6)**: guardas de placeholder (`JWT_SECRET`/`DATABASE_URL`) + warning de
  `RATE_LIMIT_STORE=memory` em produção;
- signed URL para download de arquivos de importação **apenas se** houver caso de
  uso real (não implementar especulativamente).

## Trilha — Módulo Agenda Administrativa (piloto v0.1)

Objetivo: agendamento **administrativo** (não clínico) para fortalecer o piloto
v0.1. Escopo/decisão: ADR `docs/adr/0006-administrative-scheduling-module.md` +
`docs/administrative-scheduling-scope.md` (Sprint 3.12, docs/ADR-only). Mantém a
fronteira administrativo/clínico (Opção C): **sem** diagnóstico/prescrição/
evolução/CID/anamnese/exames/prontuário; observações administrativas mínimas.

Lembretes/WhatsApp: escopo definido na Sprint 3.13 (adendo ADR 0006 +
`docs/administrative-scheduling-scope.md` Parte II) — **manual-first**, opt-in,
templates neutros, **sem dado clínico**; WhatsApp automático/API é gated (sprint
futura com ADR própria). Sequência (numeração atualizada na 3.13):

- **Sprint 3.14 — Backend da Agenda ✅ (concluída):** migration
  `20260526000000_scheduling` (clinic_professionals, appointments), DAO/service/
  controller/routes, validação, `requireAuth`/`requireClinic`/`requireRole`, audit
  sem PII, testes curl (positivos/negativos/cross-tenant). Sem DELETE; sem dado
  clínico.
- **Sprint 3.15 — Frontend da Agenda ✅ (concluída):** painéis de profissionais e
  agenda no Dashboard; filtros (data/profissional/status), criação com seletor de
  paciente, ações de status, remarcação inline; status em PT; aviso anti-clínico;
  client API com PATCH. typecheck+build OK. (Browser não automatizado no ambiente.)
- **Sprint 3.16 — App shell / navegação / cache ✅ (concluída):** `/app` em abas
  (Início/Importações/Pacientes/Agenda/Segurança) + footer; `@tanstack/react-query`
  para cache/invalidação (corrige sync profissionais→agenda sem F5). Polimento
  estrutural; sem WhatsApp/lembretes.
- **Sprint 3.17 — QA visual da agenda + landing ✅ (concluída):** cabeçalho de data
  legível + navegação dia, resumo do dia, timeline por horário, formulário
  colapsável; landing com "O que o piloto entrega" (Roadmap antigo removido).
- **Sprint 3.18 — Lembrete manual/assistido ✅ (concluída):** `utils/reminders.ts`
  (mensagem neutra) + botões "Copiar lembrete" / "Abrir WhatsApp" (`wa.me`) por
  card; humano decide enviar; sem API oficial/job/envio automático/registro de envio.
- **Sprint 3.20 — Dados sintéticos + demo/piloto v0.1 ✅ (entregue):** CSV demo
  fictício (`docs/demo-data/`), **seed dev-only** de agenda
  (`backend/scripts/seed-demo-scheduling.ts` — pacientes/profissionais/agendamentos
  fictícios, marcado `origem='seed_demo'`, com modo cleanup), roteiro
  (`docs/demo-pilot-v0.1-script.md`) e checklist (`docs/demo-pilot-v0.1-checklist.md`)
  com perguntas de validação. (A Sprint 3.19 foi o **MFA por TOTP**, trilha de
  segurança — por isso a demo virou 3.20.) Sem dado clínico.
- **Sprint futura — WhatsApp API oficial:** opt-in, templates aprovados, logs de
  status, opt-out, config por clínica — **só com ADR/sprint própria** + análise
  jurídica/técnica.

> Nada clínico entra por esta trilha — qualquer dado clínico continua exigindo ADR
> clínica dedicada (ADR 0001). Mensagens de lembrete são neutras/administrativas.

## Trilha — Pacientes (cadastro administrativo)

Objetivo: gerir o cadastro **administrativo** de pacientes e a qualidade dos
dados importados. Nada clínico (Opção C / ADR 0001).

- **Sprint 3.22 — CRUD administrativo de pacientes ✅ (em validação):** criar
  manual, editar, **arquivar/restaurar** (soft-delete via `status='archived'`,
  **sem delete físico**). Criar/editar = `dono_clinica` + `secretaria`;
  arquivar/restaurar = **só `dono_clinica`**. `GET /patients?status=active|archived|
  inactive|all` (default `active`); arquivado sai da listagem padrão **e** do
  seletor da agenda; cross-tenant → 404 genérico; audits sem PII; CPF só
  mascarado. Inclui ajuste de **copy/UX** da tela de Pacientes (deixar claro que é
  uma lista **paginada/filtrada**, não "todos os pacientes"; incentivar busca/
  filtro; cards mais compactos). **Sem migration.**
- **Sprint 3.23 — RECOMENDADA: duplicados acionáveis / correção de importação.**
  Hoje `GET /patients/duplicates` é **só informativo**. Objetivo: permitir corrigir
  e entregar a lista 100% correta, agindo sobre cada grupo. Ações candidatas (a
  detalhar na sprint): **editar** o paciente envolvido (reusa `PATCH /patients/:id`
  da 3.22), **arquivar** o duplicado (reusa archive), e — **possivelmente depois**
  — um **merge seguro** com confirmação + auditoria. **Sem merge automático**; nada
  destrutivo sem confirmação explícita e audit. **Paginação de duplicados** entra
  aqui (movida da Fase 4).
- **Sprint futura — Gestão de equipe / convite de secretaria.** Hoje `secretaria`
  só existe alterando o banco via SQL, então o papel **não é testável pelo
  navegador** (gap conhecido da 3.22). Escopo proposto (exige decisão/ADR própria):
  secretaria **se cadastra e solicita entrada** na clínica do dono; o **dono
  aprova/recusa** no sistema; o papel `secretaria` é aplicado **somente após
  aprovação**; **tudo auditado**; **sem autoentrada** em clínica sem aprovação.
  Inclui a UI de gestão de usuários/papéis (inexistente hoje) e mitiga o tradeoff
  de "papel stale" no JWT.

## Fase 4 — Operação e UX administrativa

Objetivo: melhorar operação do dia a dia sobre o que já existe.

- histórico visual de auditoria (read-only, sem PII);
- UX de revisões/importações (clareza de status e próximos passos);
- paginação de duplicados (ver Trilha — Pacientes, Sprint 3.23 recomendada);
- export streaming/assíncrono para bases grandes;
- limpeza real de arquivos com soft-delete/quarentena/auditoria/idempotência/lock
  (evolução do dry-run atual; ainda administrativo);
- melhor organização do Dashboard.

## Fase 5 — Preparação clínica (ainda SEM prontuário, SEM código clínico)

Objetivo: planejar o domínio clínico. Entregáveis são **documentos**, não código.

- domain design clínico (entidades, fronteiras, linguagem ubíqua);
- matriz de risco;
- modelo de permissões (papéis, escopos, herança);
- estratégia de audit/versionamento clínico;
- separação clara administrativo vs. clínico (domínio e banco);
- threat model específico do domínio clínico;
- LGPD/termos específicos (base legal, consentimento, retenção).

> Saída esperada da Fase 5: uma ADR clínica que satisfaça os "Critérios para
> abrir uma fase clínica" do ADR 0001. Sem ela, a Fase 6 não começa.

## Fase 6 — Clinical Core experimental (somente após aprovação/ADR futura)

Objetivo (condicional): primeiro núcleo clínico mínimo e seguro.

- encounters / atendimentos;
- notas clínicas versionadas;
- visualização segura;
- auditoria de acesso (leitura e escrita);
- **sem** prescrição inicialmente;
- **sem** medicamentos/CID inicialmente, salvo nova decisão registrada.

## Fase 7 — Prescrição eletrônica (somente muito depois, com ADR própria)

Objetivo (condicional, maior risco):

- estudo regulatório Brasil (CFM e normas aplicáveis);
- ICP-Brasil (viabilidade/custo/provedor);
- assinatura digital;
- workflow de emissão/cancelamento/validade;
- regras de retenção;
- logs/audit específicos;
- avaliação de risco jurídico;
- integração futura (farmácias/órgãos), se aplicável.

---

## Resumo de gating

| Fase | Natureza | Pré-requisito para começar |
|------|----------|----------------------------|
| 3 | Administrativo (código) | nenhuma decisão extra — é a próxima prioridade |
| 4 | Administrativo (código) | Fase 3 em bom estado |
| 5 | Planejamento (docs) | apetite por explorar o clínico |
| 6 | Clínico (código) | ADR clínica aprovada (critérios do ADR 0001) |
| 7 | Prescrição (código) | Fase 6 + ADR de prescrição + análise regulatória/ICP-Brasil |
