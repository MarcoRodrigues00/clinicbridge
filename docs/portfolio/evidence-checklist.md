# ClinicBridge — Checklist de Evidências (prints / capturas)

> Lista de evidências a capturar para portfólio, vídeo e entrega acadêmica. **Use
> sempre a "Clínica Demo Aurora" (dataset 100% fictício).** Nunca capture dados reais,
> `.env`, segredos, tokens ou terminais com chaves.
>
> ⚠️ **Privacidade:** mesmo com dados fictícios, revise cada imagem antes de salvar.
> **Não versionar imagens no Git** se houver qualquer risco de PII — a pasta
> `docs/portfolio/screenshots/` ignora imagens por padrão (ver o `.gitignore` lá).

## Como marcar

- `[x]` gerado automaticamente (Playwright) · `[~]` gerar/capturar manual · `[ ]` pendente
- Todas as imagens ficam em `docs/portfolio/screenshots/` (**não versionadas** — `.gitignore` local).

## Status da geração (capture-screenshots.mjs — desktop 1440x900 + mobile 390x844)

> Geradas em ambiente local com a "Clínica Demo Aurora" (dados sintéticos). **18 imagens**,
> todas distintas, CPF mascarado, e-mails `@…​.local`, sem `.env`/token/segredo. Reproduzir com
> [`capture-screenshots.mjs`](capture-screenshots.mjs).

## Telas do produto (demo fictícia)

- [x] **Landing** — `01-desktop-landing.png` · `01-mobile-landing.png`.
- [x] **Login / Demo** — `02-desktop-demo-login.png` · `02-mobile-demo-login.png` (página `/demo`).
- [x] **Dashboard** — `03-desktop-dashboard.png` · `03-mobile-dashboard.png` (barra de demo read-only visível).
- [x] **Agenda** — `04-desktop-agenda.png` · `04-mobile-agenda.png`.
- [x] **Pacientes** — `05-desktop-pacientes.png` · `05-mobile-pacientes.png` (**CPF mascarado** confirmado).
- [x] **Documentos / Prontuário** — `06-desktop-documentos-prontuario.png` (detalhe do paciente + aba Prontuário).
- [x] **Financeiro** — `07-desktop-financeiro.png`.
- [x] **Convênios** — `08-desktop-convenios.png`.
- [x] **Estoque** — `09-desktop-estoque.png`.
- [x] **Governança** — `10-desktop-governanca.png` (aba Equipe).
- [x] **Auri / Onboarding** — `11-desktop-auri-onboarding.png` · `06-mobile-auri-onboarding.png`.
- [x] **Segurança no app** — `12-desktop-security-docs.png` (MFA + auditoria de leitura clínica).
- [~] **Importação** — opcional; capturar manualmente um passo do pipeline (preview/dry-run) se desejar.

## Evidências técnicas (segurança / qualidade)

- [~] **GitHub Actions verde** — `13-desktop-github-actions-evidence-placeholder.png` — **MANUAL**:
  abrir o GitHub logado, aba Actions → run `security-checks` verde, e printar (não automatizado aqui).
- [~] **Terminal `pnpm test:security`** — capturar manualmente a saída **64/64**.
  - Dica: `pnpm test:security 2>&1 | tail -12` para um print limpo só com o resumo.
- [~] **Terminal `pnpm --filter backend test:integration`** — invariantes de tenant/governança/financeiro (opcional).
- [~] **README** — print da seção "Segurança em destaque (R01–R10)" e/ou tabela de módulos.
- [~] **Tabela R01–R10** — print de `docs/security-final-10-requirements.md` (índice dos 10 requisitos).
- [~] **Diagrama de arquitetura** — bloco MVC + DAO + Service do README/case-study.

## Materiais externos (fora do repositório)

- [ ] **PDF final da faculdade** — gerado **fora do Git** (não commitar). Guardar localmente/Drive.
- [ ] **Vídeo da demo (3–5 min)** — seguir `demo-script.md`; hospedar fora do repo (YouTube não listado/Drive).
- [ ] **Repositório no GitHub** — print do README renderizado e dos badges (Security/Tests/CI).
- [ ] **Post no LinkedIn** — usar `linkedin-post-draft.md`; revisar antes de publicar.

## Antes de publicar (revisão final)

- [ ] Nenhuma imagem contém CPF/telefone/e-mail/nome reais.
- [ ] Nenhuma imagem contém `.env`, token, chave ou string de conexão.
- [ ] O navegador nas capturas não expõe abas/extensões/identidade pessoal.
- [ ] Linguagem dos textos: "MVP local", "dados sintéticos", "não é produção", sem
      promessa de conformidade completa.
- [ ] PDF final e vídeo **não** estão dentro do repositório Git.
