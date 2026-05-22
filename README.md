# ClinicBridge

> **Migração segura de dados administrativos para clínicas.**

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Security](https://img.shields.io/badge/Security-first-success)
![Status](https://img.shields.io/badge/status-MVP%20local%20(n%C3%A3o%20produ%C3%A7%C3%A3o)-orange)

> ⚠️ **Este projeto é um MVP administrativo. Não é prontuário eletrônico, não emite prescrições e não trata dados clínicos.** Também **não está pronto para produção** nem afirma conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil — veja [Status atual](#-status-atual) e [Avisos importantes](#-avisos-importantes).

---

## 📌 O que é

ClinicBridge é um SaaS / Micro SaaS focado em **migrar dados administrativos** de clínicas pequenas e profissionais de saúde — de sistemas antigos ou planilhas soltas — para exports limpos, organizados e revisáveis, com **segurança e auditabilidade desde o início**.

O foco é **administrativo**: cadastro de pacientes (dados de contato/convênio), importação de CSV/XLSX, mapeamento de colunas, validação, detecção de duplicados, revisão controlada e exportação limpa — sempre com isolamento por clínica e trilha de auditoria.

## 🎯 O problema

Clínicas pequenas frequentemente têm dados espalhados em planilhas e sistemas legados, com:

- formatos inconsistentes (CPF, telefone, datas);
- duplicidades de cadastro;
- nenhuma trilha de auditoria;
- migrações manuais arriscadas (perda de dados, vazamento de PII).

O ClinicBridge transforma esse processo em um **pipeline guiado e seguro**: enviar → revisar → simular → importar de forma controlada → exportar limpo.

## ⚙️ O que o ClinicBridge faz hoje

Pipeline administrativo completo, ponta a ponta, em ambiente local:

### Fluxo resumido

```
1. Upload (CSV/XLSX)        →  validação por extensão + MIME + magic bytes
2. Preview                  →  amostra + mapeamento sugerido
3. Mapeamento               →  você confirma o que cada coluna representa
4. Validação full-file      →  relatório de erros/avisos/duplicados (sem PII)
5. Dry-run (simulação)      →  classifica linhas; NÃO grava pacientes
6. Mark-ready               →  prepara a revisão (revalida no backend)
7. Importação controlada    →  cria pacientes administrativos (transacional, com recibo)
8. Operação                 →  listagem · duplicados (read-only) · export · retenção (dry-run)
```

## ✅ Funcionalidades implementadas

| Área | Recurso |
|------|---------|
| **Auth** | Registro, login JWT, `/auth/me`, rate limit, audit logs |
| **Upload** | CSV/XLSX com validação de extensão, MIME e **conteúdo real (magic bytes)** |
| **Preview** | Amostra limitada + mapeamento de colunas sugerido |
| **Validação** | Validação full-file no backend (relatório de erros/avisos/duplicados) |
| **Sessões** | Sessões de importação (revisões salvas) |
| **Dry-run** | Simulação da importação — **não grava pacientes** |
| **Mark-ready** | Preparação da revisão (revalidada no backend) |
| **Importação** | Importação controlada e **transacional**, com **recibo persistido** |
| **Pacientes** | Listagem read-only com **CPF mascarado** e paginação/busca |
| **Duplicados** | Detecção informativa read-only (sem merge/edit/delete) |
| **Export** | Export CSV/XLSX limpo (CPF mascarado, anti-formula-injection) |
| **Retenção** | Retenção de arquivos em **dry-run** (não apaga) + painel "arquivos antigos" |
| **Autorização** | `requireRole` por papel (`dono_clinica` vs `secretaria`) |
| **Rate limit** | Por grupo, IP-keyed, antes do auth; store **memory** ou **Redis** (opcional) |
| **Infra** | `TRUST_PROXY` configurável; Redis opcional para store compartilhado |
| **Docs** | CLAUDE.md operacional + ADR + roadmap + notas de segurança + checklist |

## 🔐 Segurança e privacidade

Segurança é requisito, não opcional. Posturas em vigor:

- **Multi-tenant:** tudo escopado por `clinica_id`; `requireAuth` + `requireClinic` em rotas tenant-scoped; cross-tenant → `403`.
- **Autorização por papel:** `requireRole` protege ações sensíveis (import real, mark-ready, export, retenção) — só `dono_clinica`.
- **PII:** **CPF nunca sai bruto** (só `cpf_masked`); export bloqueia `include_cpf_raw=true`; issues/audits/logs **sem** CPF/telefone/e-mail/nome.
- **Audit logs:** trilha sem PII desnecessária; append-only no DAO.
- **Upload:** valida o conteúdo real (assinatura ZIP/OOXML p/ XLSX, texto p/ CSV); storage privado, nome interno aleatório, SHA-256.
- **Errors:** handler central nunca vaza stack/SQL/path; 500 → `internal_error` genérico.
- **Rate limit:** roda **antes** do auth; 429 genérico; store **memory** (default) ou **Redis** compartilhado (multi-instância).
- **Trust proxy:** `TRUST_PROXY` explícito — `X-Forwarded-*` só é confiado quando configurado.
- **Retenção:** ainda é **dry-run** — **nada é apagado**. Limpeza real fica para o futuro (com confirmação/auditoria/soft-delete/quarentena).

> Detalhes completos em [`docs/security-notes.md`](docs/security-notes.md).

## 📦 Escopo atual

- Dados **administrativos** de pacientes (contato, convênio).
- Importação/migração CSV/XLSX, mapeamento, validação, duplicados, export.
- Auditoria e isolamento por clínica.

## 🚫 Fora de escopo

Nada disto existe no MVP (entraria só com **ADR futura** — ver [roadmap](docs/roadmap-next-phase.md)):

- prontuário / dados clínicos;
- diagnóstico, prescrição, exames, CID, medicamentos;
- edição / exclusão / merge de pacientes;
- limpeza real de arquivos;
- produção / compliance completo.

## 🏗️ Arquitetura

**MVC + DAO com camada de Service**, multi-tenant por `clinica_id`.

```
HTTP → Controller (valida input no edge)
         → Service (regras de negócio: parse, validação, dedup, export)
             → DAO (acesso a banco, SEMPRE filtra clinica_id)
                 → PostgreSQL
```

- **Controller:** recebe HTTP, valida no edge, chama Service. Sem SQL, sem regra pesada.
- **Service:** regra de negócio, testável sem a camada web.
- **DAO:** acesso a banco parametrizado; **enforce `clinica_id`**.
- **Model:** entidades/DTOs.
- **Frontend:** apresenta/coleta; **não** toma decisões de segurança.

## 🧱 Stack

- **Backend:** Node.js 20 · Express · TypeScript
- **Frontend:** React · Vite · TypeScript
- **Banco:** PostgreSQL 15
- **Cache/rate-limit (opcional):** Redis 7
- **Infra local:** Docker Compose
- **Workspace:** pnpm

## 🚀 Como rodar localmente

**Pré-requisitos:** Node.js ≥ 20 (`nvm use` lê o `.nvmrc`), pnpm ≥ 9, Docker + Docker Compose.

```bash
# 1. Variáveis de ambiente
cp .env.example .env
# Gere um JWT_SECRET forte (≥ 48 chars) e cole no .env:
openssl rand -hex 32

# 2. Dependências
pnpm install

# 3. Infra local (PostgreSQL; Redis é opcional)
docker compose up -d postgres
# (opcional) store de rate limit compartilhado:
# docker compose up -d redis

# 4. Migrations
pnpm --filter backend migrate:latest

# 5. Subir os apps
pnpm --filter backend dev     # API   → http://localhost:3001
pnpm --filter frontend dev    # Web   → http://localhost:5173

# Smoke test
curl http://localhost:3001/health
```

## 🔧 Variáveis de ambiente

Fonte de verdade: [`.env.example`](.env.example). **Nunca** commite o `.env`. Principais grupos:

| Variável | Default | Para quê |
|----------|---------|----------|
| `JWT_SECRET` | — (obrigatória, ≥48 chars) | Assinatura dos tokens |
| `DATABASE_URL` | — (obrigatória) | Conexão PostgreSQL |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowlist de CORS (`*` proibido em prod) |
| `UPLOAD_DIR` / `UPLOAD_MAX_BYTES` | `./storage/uploads` / `5MB` | Storage privado de uploads |
| `IMPORT_MAX_ROWS` | `100` | Teto de linhas por importação (conservador) |
| `TRUST_PROXY` | `false` | Confiar em `X-Forwarded-*` (setar atrás de proxy) |
| `RATE_LIMIT_STORE` | `memory` | `memory` ou `redis` (store compartilhado) |
| `REDIS_URL` | — | Obrigatória se `RATE_LIMIT_STORE=redis` (nunca logada) |
| `<SCOPE>_RATE_LIMIT_WINDOW_MS` / `_MAX` | vários | Rate limit por grupo (AUTH/UPLOAD/PATIENTS/EXPORT/IMPORT) |

> A lista completa (com retenção, validação, dry-run, etc.) está no `.env.example`.

## 🛠️ Comandos úteis

```bash
# Backend (porta 3001)
pnpm --filter backend dev | build | start | typecheck
pnpm --filter backend migrate:latest | migrate:rollback | migrate:status

# Frontend (Vite, porta 5173)
pnpm --filter frontend dev | build | preview | typecheck

# Infra
docker compose up -d         # postgres (+ redis se quiser)
docker compose down
docker compose config
```

## 🧪 Testes / checklist manual

Não há suíte automatizada ainda; a verificação é por **build + smoke tests manuais** (curl/SQL).
O roteiro completo (rate limit memory/redis, trust proxy, upload por magic bytes, export, retenção, papéis) está em [`docs/testing-checklist.md`](docs/testing-checklist.md).

```bash
# Builds (devem passar)
pnpm --filter backend typecheck && pnpm --filter backend build
pnpm --filter frontend build
```

## 🗺️ Roadmap

Direção estratégica: **Opção C — base administrativa segura primeiro, expansão clínica futura planejada** (ver [ADR 0001](docs/adr/0001-product-direction-option-c.md)).

| Fase | Tema | Natureza |
|------|------|----------|
| **3** | Produção & governança administrativa (papéis ✅, trust proxy ✅, Redis ✅, LGPD/backup/deploy ⏳) | código |
| **4** | Operação & UX administrativa (auditoria visual, paginação de duplicados, limpeza real de arquivos) | código |
| **5** | Preparação clínica (domain design, threat model, permissões) — **só documentos** | docs |
| **6** | Clinical Core experimental — **só após ADR futura** | código (gated) |
| **7** | Prescrição eletrônica — **só com estudo regulatório + ICP-Brasil** | código (gated) |

> Detalhe e critérios de gating em [`docs/roadmap-next-phase.md`](docs/roadmap-next-phase.md).

## 📍 Status atual

**MVP local avançado — NÃO pronto para produção.**

Últimas sprints aprovadas: pipeline completo (Sprint 2.x) → CLAUDE.md compactado + docs auxiliares → decisão estratégica Opção C (3.0) → `requireRole` (3.1) → `TRUST_PROXY` + Redis/shared store (3.2).

**Próximos passos P1 (antes de produção):**

- política LGPD de retenção (prazos, base legal, fluxo);
- backup / restore validado;
- deploy seguro;
- revisão de CORS/env de produção;
- provisionar Redis real + definir `TRUST_PROXY` real;
- gestão de usuários/papéis (no futuro).

## 📚 Documentação interna

| Documento | Conteúdo |
|-----------|----------|
| [`CLAUDE.md`](CLAUDE.md) | Guia operacional curto + regras críticas |
| [`docs/project-state.md`](docs/project-state.md) | Estado detalhado e invariantes |
| [`docs/sprint-history.md`](docs/sprint-history.md) | Histórico completo das sprints |
| [`docs/security-notes.md`](docs/security-notes.md) | Segurança detalhada + ressalvas P1/P2/P3 |
| [`docs/testing-checklist.md`](docs/testing-checklist.md) | Checklist de testes (build/curl/SQL) |
| [`docs/roadmap-next-phase.md`](docs/roadmap-next-phase.md) | Roadmap das próximas fases |
| [`docs/adr/0001-product-direction-option-c.md`](docs/adr/0001-product-direction-option-c.md) | ADR da direção estratégica |
| `docs/ClinicBridge_Documentacao_Mestre.md` | Documento mestre (escopo, STRIDE, LGPD) |

## ⚠️ Avisos importantes

- **Não** é prontuário eletrônico; **não** emite prescrições; **não** trata dados clínicos.
- **Não** está pronto para produção (ver pendências P1).
- **Não** afirma conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil — o projeto adota **preparação e requisitos**, não compliance fechado.
- **Nunca** commite `.env`, `storage/`, uploads, exports (CSV/XLSX) ou qualquer dado real de paciente.
- Retenção de arquivos é **dry-run**: nada é apagado por aqui.
