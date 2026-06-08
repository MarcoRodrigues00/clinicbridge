# ClinicBridge — Guia de Gravação do Vídeo Demo

> Como gravar o vídeo de 3–5 min do ClinicBridge para portfólio/LinkedIn, usando
> **somente a demo local com dados sintéticos** ("Clínica Demo Aurora"). O roteiro
> de narração está em [`demo-script.md`](demo-script.md). **Não grave** `.env`,
> tokens, secrets, terminais com chaves, logs sensíveis ou dados reais. O vídeo
> **não** entra no Git (a pasta `screenshots/` ignora `*.mp4`/`*.webm`).

## 1. Subir o ambiente (dados sintéticos)

```bash
# Infra
docker compose up -d postgres        # (redis é opcional)
pnpm --filter backend migrate:latest

# Seed da demo (só se ainda não houver "Clínica Demo Aurora")
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full

# Backend (host dev): demo-login on + rate limit folgado p/ gravação
ALLOW_DEMO_LOGIN=true AUTH_RATE_LIMIT_MAX=5000 pnpm --filter backend dev

# Frontend: falar DIRETO com o backend (evita o proxy /api → nginx:8443 do
# frontend/.env quando o nginx-edge não está rodando)
VITE_API_BASE_URL=http://localhost:3001 VITE_PORT=5174 pnpm --filter frontend dev
```

Confirme: `curl http://localhost:3001/health` → `status: ok`; abra `http://localhost:5174`.

> **Por que o override do frontend?** `frontend/.env` aponta `/api` para o nginx
> local (`https://localhost:8443`). Sem o perfil `edge` no ar, as chamadas de API
> falham (500) e o `/app` volta para `/login`. O override `VITE_API_BASE_URL` faz o
> browser falar direto com o backend (CORS já permite `localhost:5174`).

## 2. Entrar na demo

- Acesse `http://localhost:5174` → **"Ver demo guiada"** (ou `/demo`).
- A barra "Demonstração guiada" confirma sessão **somente leitura** (o backend
  bloqueia escrita via `blockDemoWrites`).

## 3. Gravar a tela

Escolha uma ferramenta (todas locais, sem nuvem):

### Opção A — Windows Game Bar (nativo, mais simples)
1. `Win + G` → painel de captura.
2. Botão de gravar (ou `Win + Alt + R`) para iniciar/parar.
3. Grave **só a janela do navegador** (Game Bar grava a janela ativa).
4. Saída em `Vídeos/Capturas`. **Mova o arquivo para fora do repositório** ou para
   `docs/portfolio/screenshots/` (lá `*.mp4` é ignorado pelo Git).

### Opção B — OBS Studio (mais controle)
1. Fonte: **Captura de Janela** → selecione o Chrome/Edge com o ClinicBridge.
2. Resolução de saída 1920x1080; 30 fps; formato `.mp4`.
3. `Iniciar Gravação` / `Parar Gravação`.
4. Salve **fora do repositório** (ou na pasta ignorada).

### Dicas de captura limpa
- Janela do navegador em tela cheia, **sem abas/extensões pessoais** visíveis.
- Esconda a barra de favoritos; use uma janela anônima limpa se preferir.
- Não abra DevTools nem o terminal durante a gravação (evita vazar `.env`/token).
- Zoom da página confortável para leitura (Ctrl+ / Ctrl-).

## 4. Seguir o roteiro

Use [`demo-script.md`](demo-script.md) (10 cenas, 3–5 min): landing → demo/login →
dashboard → agenda → pacientes (CPF mascarado) → documentos/prontuário → financeiro
→ convênios/estoque → **segurança/CI** (`pnpm test:security` 64/64 + Actions verde)
→ fechamento. Fale as frases em itálico do roteiro.

## 5. Evidência de segurança/CI no vídeo

- Terminal limpo (sem segredos): `pnpm test:security 2>&1 | tail -12` → mostra **64/64**.
- Print/tela do **GitHub Actions** `security-checks` verde (manual — feito no browser
  logado no GitHub; não automatizado aqui).

## 6. Depois de gravar

- Revise o vídeo inteiro: nenhuma PII real, nenhum `.env`/token/segredo, nenhum
  terminal com chave.
- **Não commitar.** Publique fora do repositório (YouTube não listado / Drive).
- Marque o item correspondente em [`evidence-checklist.md`](evidence-checklist.md).

---

## Alternativa automatizada (screenshots)

As capturas de tela podem ser geradas automaticamente com Playwright via
[`capture-screenshots.mjs`](capture-screenshots.mjs) (desktop 1440x900 + mobile
390x844). O Playwright é instalado num diretório descartável (fora do repo) e as
imagens caem em `screenshots/` (ignoradas pelo Git). Veja o cabeçalho do script.
Para vídeo automatizado, o Playwright também grava `.webm` por contexto
(`recordVideo`), mas a gravação manual costuma render um material mais apresentável.
