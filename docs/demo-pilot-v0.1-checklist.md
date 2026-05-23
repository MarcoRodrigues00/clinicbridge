# Checklist de Demo / Piloto v0.1 — ClinicBridge

> Lista verificável para preparar, conduzir e encerrar a demo do
> [roteiro](demo-pilot-v0.1-script.md). Marque os itens antes de apresentar.

## A. Pré-demo (preparação)

- [ ] `cp .env.example .env` (se ainda não) e `pnpm install` feitos.
- [ ] `docker compose up -d` — Postgres/Redis de pé.
- [ ] Migrations aplicadas: `pnpm --filter backend migrate:status` sem pendências.
- [ ] Backend `:3001` respondendo: `curl http://localhost:3001/health` → ok.
- [ ] Frontend `:5173` no ar: `pnpm --filter frontend dev`.
- [ ] Existe um **owner** (`dono_clinica`) com clínica e **pelo menos 1 paciente**
      (o seed mira a clínica com mais pacientes). Se necessário, importe o CSV
      antes para garantir pacientes na clínica de demo.
- [ ] Agenda demo populada: `pnpm --filter backend seed:demo`
      → loga "created … 3 professionals, 5 patients, 7 appointments".
- [ ] CSV de import à mão: `docs/demo-data/pacientes-demo.csv`.
- [ ] (Opcional) MFA ativado no owner (aba Segurança) para demonstrar 2 passos.
- [ ] (Opcional) Login de **secretaria** pronto para mostrar permissões.
- [ ] Credenciais e abas testadas 1x antes de apresentar (login entra; aba Agenda
      mostra o dia de hoje com agendamentos).

> **Não usar dados reais** na demo. Tudo é fictício (ver `demo-data/README.md`).

## B. Durante a demo (verificações por etapa)

### Login
- [ ] Landing `/` mostra "O que o ClinicBridge entrega no piloto".
- [ ] Login do owner entra no `/app`.
- [ ] (Se MFA) senha → passo de código → entra; código errado → erro seguro.

### Importação
- [ ] Upload de `pacientes-demo.csv` aceito.
- [ ] Mapeamento sugerido casa (`Nome completo/CPF/Telefone/E-mail/Data de
      nascimento`); `Convênio` fica **não mapeado**.
- [ ] Validação mostra linhas válidas **e** o grupo **duplicado** (Ana Beatriz
      Martins).
- [ ] Dry-run roda sem gravar; mark-ready → import (como owner) gera **recibo**.
- [ ] Como **secretaria**, mark-ready/import aparecem como nota (sem permissão).

### Pacientes / duplicados / export
- [ ] Lista de pacientes com **CPF mascarado** e busca.
- [ ] Painel de **duplicados** mostra o par repetido (read-only).
- [ ] Export CSV/XLSX baixa arquivo limpo (CPF mascarado).

### Agenda
- [ ] Aba Agenda mostra a data de **hoje** com os agendamentos do seed.
- [ ] Navegação Anterior/Hoje/Próximo muda o dia; resumo do dia confere.
- [ ] Owner cria/edita/desativa profissional ("função/rótulo interno").
- [ ] Criar agendamento (paciente + horário) com **aviso anti-clínico** visível.
- [ ] Confirmar/Concluir/Faltou/Cancelar e **remarcar** funcionam.

### Lembrete manual
- [ ] "Copiar lembrete" copia mensagem **neutra** (sem profissional/observação/
      CPF/dado clínico).
- [ ] "Abrir WhatsApp" abre `wa.me` preenchido (paciente sem telefone → aviso).
- [ ] Reforçar: **nada é enviado pelo sistema** — humano decide.

## C. Mensagens-chave (não escorregar)

- [ ] Disse "ferramenta **administrativa**", não "prontuário/sistema clínico".
- [ ] **Não** afirmou "pronto para produção" nem "compliance LGPD completo".
- [ ] **Não** prometeu WhatsApp automático (é futuro, com ADR/opt-in próprios).
- [ ] Citou segurança real: papéis, MFA, auditoria sem PII, multi-tenant,
      retenção em **dry-run**, backup/restore validado localmente.

## D. Perguntas de validação (coletar feedback)

- [ ] Fluxo de importação corresponde à dor real de migração?
- [ ] Campos administrativos suficientes? Falta algum?
- [ ] Detecção de duplicados ajuda? Precisariam de merge/edição?
- [ ] Agenda cobre o dia a dia da recepção? O que falta?
- [ ] Lembrete manual resolve? Há apetite por WhatsApp automático (opt-in)?
- [ ] MFA e papéis atendem à operação?
- [ ] Algum dado que **não** colocariam numa ferramenta administrativa?

## E. Pós-demo (limpeza)

- [ ] Remover dados de agenda demo: `pnpm --filter backend seed:demo:clean`
      → volta ao estado anterior (não toca pacientes/profissionais reais).
- [ ] Conferir baseline da clínica (counts voltaram ao que eram antes do seed).
- [ ] Se importou o CSV numa clínica não descartável, avaliar limpar os pacientes
      de demo (hoje a exclusão de pacientes é manual via SQL — fora do MVP).
- [ ] Anotar feedback coletado num lugar combinado (ver `roadmap-next-phase.md`
      para onde isso entra).
</content>
