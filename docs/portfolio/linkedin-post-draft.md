# ClinicBridge — Rascunhos de Post para LinkedIn

> Dois rascunhos com tom **honesto e profissional**, sem exagero comercial. Regras:
> não mencionar colegas/grupo; não dizer que está em produção; não chamar de produto
> certificado; não prometer conformidade completa (LGPD/HIPAA/CFM/ICP-Brasil).
> Ajuste o link do repositório/vídeo antes de publicar.

---

## Versão 1 — Curta

> 🏥 **ClinicBridge** — um projeto que venho desenvolvendo: um **Clinic OS modular**
> para clínicas pequenas, com foco em **segurança e privacidade desde o início**.
>
> É um **MVP local / case acadêmico**, rodando com **dados sintéticos** — não está em
> produção e não trata dados reais de paciente.
>
> O que ele faz hoje:
> 🔐 Autenticação JWT + MFA (TOTP)
> 🏢 Isolamento multi-tenant por clínica
> 📥 Migração de planilhas (CSV/XLSX) com validação real e import transacional
> 🗓️ Agenda, 💰 financeiro, 📋 prontuário v0.1, convênios, estoque e relatórios
> 🛡️ 10 requisitos de segurança (R01–R10) verificados por **64 testes automatizados**
> ⚙️ CI no GitHub Actions: typecheck, build, testes e gate de arquivos sensíveis
>
> Stack: TypeScript (Node/Express + React/Vite), PostgreSQL, Docker, pnpm.
>
> A ideia foi tratar **privacidade como requisito**, não como detalhe: CPF mascarado,
> auditoria sem PII, autorização por papel e bloqueios de configuração insegura em
> produção.
>
> Próximo passo honesto: piloto controlado com dados sintéticos antes de qualquer
> evolução para produção.
>
> Feedback é muito bem-vindo. 👇
>
> #SoftwareEngineering #Security #Privacidade #TypeScript #HealthTech #Portfolio

---

## Versão 2 — Mais técnica

> Compartilhando o **ClinicBridge**, um **Clinic OS modular** que desenvolvi como
> **MVP local e entrega acadêmica de segurança** (dados sintéticos, **não** é produção
> e **não** afirma conformidade completa com LGPD/HIPAA/CFM/ICP-Brasil).
>
> **Arquitetura:** MVC + DAO + Service, multi-tenant por `clinica_id`. A defesa de
> segurança é sempre no backend; o frontend só ajusta UX. Nenhum DAO tem `listAll`;
> entidades sensíveis não têm delete físico (arquivamento preserva histórico).
>
> **Segurança organizada em 10 requisitos guarda-chuva (R01–R10)**, agrupando **64
> controles catalogados** e ligados a testes:
> • R01 Autenticação/JWT · R02 Autorização por papel/grants/governança ·
> R03 Multi-tenant · R04 LGPD/PII · R05 Auditoria metadata-only ·
> R06 MFA/TOTP (segredo cifrado em AES-256-GCM) · R07 Upload/import/export (magic
> bytes, anti-formula-injection) · R08 Rate limiting · R09 Config segura/bloqueios de
> produção · R10 Higiene operacional/git.
>
> **Verificação automatizada:**
> • `pnpm test:security` → 64 testes (unitários + checagens estáticas, runner nativo
> do Node) cobrindo 401 sem token, 403 por papel, tenant-spoofing, mascaramento de
> PII, cifra do segredo MFA, validação de upload e guards de boot de produção.
> • Suíte de integração contra Postgres (tenant, governança, financeiro).
> • GitHub Actions `security-checks`: gate de arquivos sensíveis → typecheck → build →
> testes → integração com **Postgres efêmero**.
>
> **Decisões que tenho orgulho de explicar:** read-audit clínico como controle
> compensatório (LGPD art. 18) na ausência de cifra de coluna no v0.1; webhook de
> billing record-only + idempotente com tenant resolvido por mapa interno
> (anti-spoofing); e o sistema **recusando subir** em produção com segredo placeholder
> ou CORS inseguro.
>
> **Limitações honestas:** módulos clínicos são administrativos v0.1; cobrança real
> bloqueada (integração Asaas em sandbox); sem cifra de coluna ainda; não é produto de
> produção.
>
> Stack: TypeScript strict (Node 20/Express + React/Vite/TanStack Query), PostgreSQL
> 15, Redis opcional, Docker Compose, Nginx local.
>
> Aberto a discussões sobre threat modeling, multi-tenancy e privacidade por padrão.
>
> #SecurityEngineering #AppSec #TypeScript #PostgreSQL #Privacidade #LGPD #HealthTech #SoftwareArchitecture
