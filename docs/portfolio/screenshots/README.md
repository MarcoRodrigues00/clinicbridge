# Screenshots (placeholder)

Esta pasta guarda **localmente** as capturas de tela do portfólio/demo. **As imagens
não são versionadas no Git** — o `.gitignore` desta pasta ignora `*.png`, `*.jpg`,
`*.mp4`, `*.pdf` etc. Isso evita commitar acidentalmente PII ou segredos, mesmo em
capturas da demo fictícia.

## Como usar

1. Capture as telas seguindo [`../evidence-checklist.md`](../evidence-checklist.md),
   sempre na **"Clínica Demo Aurora" (dataset fictício)**.
2. Salve os arquivos **aqui** (ex.: `01-landing.png`, `09-actions-green.png`).
3. **Revise cada imagem** antes de usar: sem CPF/telefone/e-mail/nome reais, sem
   `.env`, token, chave ou string de conexão visível.
4. Para o portfólio público (LinkedIn/README externo), suba as imagens **fora do
   repositório** (Drive, álbum, ou um repo de assets dedicado) — não as adicione aqui
   com `git add -f`.

## Sugestão de nomes (alinhada ao checklist)

```
01-landing.png
02-login-demo.png
03-dashboard.png
04-agenda.png
05-pacientes-cpf-mascarado.png
06-documentos-prontuario.png
07-financeiro.png
08-convenios-estoque.png
09-governanca.png
10-auri-onboarding.png
11-github-actions-green.png
12-test-security-64-64.png
```

> Se algum dia uma imagem **comprovadamente sem PII** precisar ir para o repositório,
> adicione-a explicitamente com `git add -f <arquivo>` — mas o padrão é manter tudo
> local.
