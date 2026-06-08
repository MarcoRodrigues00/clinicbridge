# ClinicBridge — Estudo de Caso (Case Study)

> **Para portfólio técnico e entrega acadêmica.** ClinicBridge é um **MVP local /
> protótipo funcional** com **dados sintéticos**, construído com boas práticas de
> segurança e privacidade. **Não** está em produção e **não** afirma conformidade
> completa com LGPD/HIPAA/CFM/ICP-Brasil.

---

## 1. Problema

Clínicas pequenas e profissionais de saúde autônomos operam com dados administrativos
espalhados em planilhas e sistemas legados:

- formatos inconsistentes (CPF, telefone, datas);
- cadastros duplicados;
- ausência de trilha de auditoria;
- migrações manuais arriscadas (perda de dados e vazamento de PII);
- operação fragmentada — agenda numa ferramenta, financeiro noutra — sem isolamento
  claro de **quem pode ver o quê**.

O risco central é de **privacidade e integridade**: dados pessoais sensíveis tratados
sem controle de acesso, sem minimização e sem rastreabilidade.

## 2. Solução

ClinicBridge nasceu resolvendo a **migração administrativa segura** (planilha/sistema
legado → cadastro limpo, auditável e isolado por clínica) e evoluiu para um **Clinic OS
modular**: um conjunto de módulos de gestão que compartilham as mesmas invariantes de
segurança — multi-tenant, autorização por papel, auditoria e minimização de PII.

O fluxo de migração é um **pipeline guiado**:

```
Upload (CSV/XLSX) → Preview/mapeamento → Validação full-file →
Dry-run (não grava) → Mark-ready (revalida) → Import transacional (com recibo) →
Operação (listar · duplicados · export · retenção dry-run)
```

Sobre essa base, cada módulo (agenda, financeiro, prontuário v0.1, serviços,
convênios, estoque, relatórios, governança) entra como um recorte conservador, com
**ADR própria**, sem afrouxar nenhuma invariante.

## 3. Stack

- **Backend:** Node.js 20 · Express · TypeScript (strict)
- **Frontend:** React · Vite · TypeScript · TanStack Query
- **Banco:** PostgreSQL 15 (20 migrations) · **Redis 7** opcional (rate-limit store)
- **Infra local/staging:** Docker Compose · Nginx reverse proxy (perfil `edge`, TLS local autoassinado) · `TRUST_PROXY` explícito · suporte a Cloudflare Tunnel para demonstração controlada — exercício de fluxo HTTPS/headers/proxy **sem** afirmar produção, domínio real, certificado real, WAF ou deploy AWS
- **Workspace:** pnpm · **Testes:** runner nativo do Node (`tsx --test`)
- **CI:** GitHub Actions (`security-checks`)

## 4. Arquitetura

**MVC + DAO com camada de Service**, multi-tenant por `clinica_id`:

```
HTTP → Controller (valida input no edge, sem SQL)
         → Service (regra de negócio, testável sem a camada web, auditável)
             → DAO (queries parametrizadas, SEMPRE filtra clinica_id, sem delete físico)
                 → PostgreSQL
```

Princípios:

- **Tenant isolation por construção** — nenhum DAO tem `listAll`; toda query filtra
  `clinica_id`; cross-tenant retorna 403 ou 404 genérico (anti-enumeração).
- **Frontend não decide segurança** — esconde/desabilita por UX, mas a autorização
  real é sempre no backend.
- **Sem delete físico** em entidades sensíveis — arquivar (`status='archived'` /
  `canceled`) preserva histórico e auditabilidade.
- **Auditoria metadata-only** — trilha de ações sem PII/conteúdo clínico.

## 5. Módulos

| Módulo | Recorte v0.1 | Invariante de destaque |
|--------|--------------|------------------------|
| Autenticação / JWT / MFA | login, MFA TOTP, backup codes | senha argon2id; segredo TOTP cifrado (AES-256-GCM) |
| Multi-tenant | `clinica_id` em tudo | `requireAuth + requireClinic`; sem `listAll` |
| Pacientes / Import / Export | pipeline + CRUD + merge B-safe | CPF mascarado; magic bytes; anti-formula-injection |
| Agenda administrativa | profissionais, agendamentos, anti-overlap | sem dado clínico; aviso anti-clínico |
| Financeiro v0.1 | cobranças, resumo, alertas | sem delete físico; profissional bloqueado |
| Prontuário v0.1 | encontros e notas append-only | read-audit LGPD; `internal_note` redacted |
| Documentos médicos v0.1 | draft→finalized→canceled, PDF on-demand | audit STRICT antes de servir; PDF não armazenado |
| Serviços v0.1 | catálogo + serviços por profissional | tenant-scoped; reuso em agenda/financeiro |
| Convênios v0.1 | operadoras, planos, carteirinhas | `member_number`/`holder_name` mascarados |
| Estoque v0.1 | itens e movimentos | `SELECT FOR UPDATE`; quantidade só por movimento |
| Relatórios v0.1 | 4 endpoints + painel | 403 por bloco; sem PII excedente |
| Governança | titular + administradores (ADR 0019) | revogado não "ressuscita"; audit por linha |
| Onboarding / Demo / Auri | landing, `/demo`, tour, persona Auri | demo env-gated; `blockDemoWrites` no backend |
| Billing / Asaas sandbox | camada comercial (mock + sandbox) | webhook record-only/idempotente; **cobrança real bloqueada** |

## 6. Decisões de segurança

- **ADR-first para módulos clínicos** — nada clínico entra sem decisão registrada e
  escopo fechado; fronteira administrativo × clínico é explícita no domínio e no banco.
- **Read-audit como controle compensatório** — na ausência de cifra de coluna no v0.1,
  registra-se **quem leu o quê** de dado clínico (LGPD art. 18), com modo *fail-closed*
  em produção.
- **Webhook de billing record-only + idempotente** — estado de assinatura nunca muda
  pelo frontend; tenant resolvido por mapa interno (anti-spoofing); token comparado em
  tempo constante; cobrança real **bloqueada** até produção segura.
- **Guards de boot de produção** — o backend **recusa subir** com segredo placeholder,
  CORS localhost/HTTP, MFA key ausente ou gateway de pagamento habilitado.
- **Git/secrets hygiene como gate de CI** — o build falha se qualquer `.env`, chave,
  certificado, dump ou planilha for rastreado.

## 7. Os 10 requisitos de segurança (R01–R10)

Organizados como **guarda-chuvas** que agrupam **64 controles catalogados**
(`docs/security-controls-catalog.md`) e ligam cada requisito a testes automatizados
(`docs/security-final-10-requirements.md`):

| # | Requisito |
|---|-----------|
| R01 | Autenticação segura e sessões JWT |
| R02 | Autorização por papéis, grants clínicos e governança |
| R03 | Isolamento multi-tenant por clínica |
| R04 | Proteção LGPD de PII e dados clínicos |
| R05 | Auditoria e rastreabilidade metadata-only |
| R06 | MFA/TOTP e proteção de segredos de autenticação |
| R07 | Validação segura de uploads, importações e exports |
| R08 | Rate limiting e proteção contra abuso |
| R09 | Configuração segura por ambiente e bloqueios de produção |
| R10 | Segurança operacional e infraestrutura local/staging |

## 8. CI / Testes

- **Suíte de segurança (sem banco):** `pnpm test:security` → **64 testes** cobrindo
  R01–R10 (unitários + checagens estáticas) com o runner nativo do Node.
- **Suíte de integração (DB):** `pnpm --filter backend test:integration` → invariantes
  de tenant, governança e financeiro contra Postgres.
- **GitHub Actions `security-checks`** (push/PR para `main`): gate de arquivos sensíveis
  → typecheck backend/frontend → build backend/frontend → testes de segurança → testes
  de integração com **Postgres efêmero**.

## 9. Limitações honestas

- **Não é produção** e não trata dados reais de paciente; demo é 100% fictícia.
- **Sem cifra de coluna** no v0.1 (compensada por read-audit + controles de app).
- Módulos clínicos são **administrativos v0.1** — sem CID estruturado, prescrição legal,
  ICP-Brasil, TISS real, telemedicina ou IA clínica.
- **Cobrança real bloqueada**; Asaas é sandbox com dados fictícios.
- A proibição de conteúdo clínico em campos administrativos depende em parte de
  disciplina do operador (avisos na UI, sem validação automática de conteúdo).
- Verificação de webhook é **token compartilhado**, não HMAC (mitigado por HTTPS +
  idempotência + tenant interno).
- Não declara conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil.

## 10. Próximos passos

- **Piloto controlado** com dados sintéticos/anonimizados (validação de fluxo real).
- **ADR 5.2A — Produção Segura** (AWS, secrets manager, banco/Redis gerenciados, WAF,
  backup offsite real) antes de qualquer dado real.
- **Cobrança real** somente após CNPJ/contador + contrato/termos/política LGPD + 5.2A.
- Hardening incremental: cifra de coluna para dados clínicos; observabilidade; antivírus
  no upload; paginação/streaming em operações pesadas.

---

**Resumo de uma linha:** *Clinic OS modular local, com segurança e privacidade por
padrão (multi-tenant, autorização por papel, auditoria, minimização de PII), 10
requisitos de segurança verificados por 64 testes automatizados em CI — um MVP/case
acadêmico, não um produto de produção.*
