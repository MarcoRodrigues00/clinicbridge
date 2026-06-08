# ClinicBridge — Roteiro de Vídeo / Demo (3–5 min)

> Roteiro para gravação de tela de uma demonstração local. **Use sempre a "Clínica
> Demo Aurora" (dataset 100% fictício).** Não mostre dados reais, `.env`, segredos
> nem o terminal com chaves. Frases de narração estão em _itálico_ — fale de forma
> simples e honesta. Tempo-alvo: **3 a 5 minutos**.

## Preparação (antes de gravar)

```bash
# Subir infra + apps
docker compose up -d postgres
pnpm --filter backend migrate:latest
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full   # dataset fictício
# .env: ALLOW_DEMO_LOGIN=true  (NUNCA em produção)
pnpm --filter backend dev
pnpm --filter frontend dev
```

- Janela do navegador limpa (sem abas/extensões pessoais visíveis).
- Tenha um segundo terminal pronto só para `pnpm test:security` (sem segredos à vista).
- Resolução 1080p, zoom da UI confortável para leitura.

---

## Cena 1 — Abertura (0:00–0:20)

**Tela:** landing page do ClinicBridge.

> _"Este é o ClinicBridge, um protótipo funcional de Clinic OS modular para clínicas
> pequenas. É um MVP local, com dados sintéticos, feito com foco em segurança e
> privacidade — não é um sistema em produção."_

## Cena 2 — Problema (0:20–0:45)

**Tela:** seção da landing que descreve o problema (ou um slide simples).

> _"Clínicas pequenas guardam dados em planilhas soltas: formatos inconsistentes,
> cadastros duplicados, nenhuma trilha de auditoria e migrações manuais arriscadas.
> O ClinicBridge transforma isso num fluxo guiado e seguro, e adiciona módulos de
> gestão que respeitam quem pode ver o quê."_

## Cena 3 — Login / Demo (0:45–1:10)

**Tela:** entrar via "Ver demo guiada" / demo-login; mostrar a barra de demo.

> _"Entro na demonstração guiada. Repare na barra de demo: esta sessão é somente
> leitura — o próprio backend bloqueia qualquer alteração nos dados de exemplo. O
> login de produção usa JWT, com MFA por aplicativo autenticador disponível."_

- Mostrar rapidamente o tour do **Auri** (persona de ajuda), 1 passo.

## Cena 4 — Agenda (1:10–1:40)

**Tela:** aba Agenda — profissionais e agendamentos do dia.

> _"A agenda é administrativa: profissionais, horários e observações sem nenhum dado
> clínico. Ela impede sobreposição de horários do mesmo profissional e avisa para não
> escrever diagnóstico ou queixa aqui — isso é parte da minimização de dados."_

## Cena 5 — Pacientes / Importação (1:40–2:20)

**Tela:** aba Pacientes; depois o fluxo de importação CSV/XLSX.

> _"Os pacientes aparecem sempre com o CPF mascarado — o número completo nunca sai do
> servidor. A importação valida o conteúdo real do arquivo, não só a extensão, faz uma
> simulação que não grava nada e só então importa de forma transacional, com recibo."_

- Mostrar `cpf_masked` na lista e, se possível, um export com a célula neutralizada.

## Cena 6 — Documentos / Prontuário (2:20–2:50)

**Tela:** prontuário v0.1 e geração de documento/PDF.

> _"O prontuário administrativo v0.1 guarda notas como histórico, sem apagar versões.
> Cada leitura de dado clínico é auditada — registramos quem leu o quê, como controle
> de transparência. O documento em PDF é gerado na hora, não fica armazenado, e traz
> um aviso de que não tem validade legal de assinatura digital."_

## Cena 7 — Financeiro (2:50–3:15)

**Tela:** aba Financeiro — cobranças, badge na agenda.

> _"No financeiro, as cobranças têm ciclo controlado e não podem ser apagadas
> fisicamente — o histórico é preservado. Um profissional clínico não enxerga o
> financeiro por padrão, para evitar inferência cruzada sobre pacientes."_

## Cena 8 — Convênios / Estoque (3:15–3:45)

**Tela:** aba Convênios (carteirinha mascarada) e aba Estoque.

> _"Os convênios também mascaram a carteirinha nas listas. No estoque, a quantidade só
> muda por movimento de entrada ou saída, com trava de concorrência no banco — nada é
> editado direto. Tudo continua isolado por clínica."_

## Cena 9 — Segurança / CI (3:45–4:30)

**Tela:** terminal rodando `pnpm test:security`; depois a tela verde do GitHub Actions.

```bash
pnpm test:security
```

> _"A segurança é organizada em dez requisitos, de R01 a R10, que agrupam 64 controles
> catalogados. Eles são verificados por 64 testes automatizados — autenticação,
> autorização, isolamento de tenant, mascaramento de PII, cifra do segredo de MFA,
> validação de upload e bloqueios de produção. Isso roda no GitHub Actions a cada push,
> junto com typecheck, build e um gate que falha se algum arquivo sensível for
> commitado."_

- Mostrar `64/64` e o check verde do workflow `security-checks`.

## Cena 10 — Fechamento (4:30–5:00)

**Tela:** README aberto na seção "Segurança em destaque" ou no diagrama de arquitetura.

> _"Resumindo: o ClinicBridge é um MVP local e case acadêmico, com arquitetura em
> camadas, multi-tenant, e segurança e privacidade por padrão — verificadas por testes
> e CI. Não é produção e não trata dados reais, mas é uma base honesta para evoluir até
> um piloto controlado. Obrigado por assistir."_

---

## Lembretes finais

- **Nunca** mostrar `.env`, chaves, tokens ou dados reais.
- Manter o tom **honesto**: "MVP local", "dados sintéticos", "não é produção".
- Se algo falhar ao vivo, prefira mostrar o teste/CI verde a improvisar com dados.
- Duração: corte para ficar entre 3 e 5 minutos.
