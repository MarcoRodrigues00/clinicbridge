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
- [ ] (Opcional) MFA ativado no owner (aba Segurança) para demonstrar 2 passos —
      ao ativar, **anote os códigos de recuperação** (exibidos uma única vez).
- [ ] (Opcional) Login de **secretaria** pronto para mostrar permissões.
- [ ] (Opcional, se for demonstrar o fluxo Equipe) Conta de **staff sem clínica**
      cadastrada (`account_type: staff`) e código de convite copiado para usar ao vivo.
- [ ] Credenciais e abas testadas 1x antes de apresentar (login entra; aba Agenda
      mostra o dia de hoje com agendamentos).

> **Não usar dados reais** na demo. Tudo é fictício (ver `demo-data/README.md`).

## B. Durante a demo (verificações por etapa)

### Login
- [ ] Landing `/` mostra "O que o ClinicBridge entrega no piloto".
- [ ] Login do owner entra no `/app`.
- [ ] (Se MFA) senha → passo de código (aceita **app autenticador ou código de
      recuperação**) → entra; código errado → erro seguro genérico.

### Importação
- [ ] Upload de `pacientes-demo.csv` aceito.
- [ ] Mapeamento sugerido casa (`Nome completo/CPF/Telefone/E-mail/Data de
      nascimento`); `Convênio` fica **não mapeado**.
- [ ] Validação mostra linhas válidas **e** o grupo **duplicado** (Ana Beatriz
      Martins).
- [ ] Dry-run roda sem gravar; mark-ready → import (como owner) gera **recibo**.
- [ ] Como **secretaria**, mark-ready/import aparecem como nota (sem permissão).

### Pacientes / duplicados / merge B-safe / export
- [ ] Lista de pacientes com **CPF mascarado** e busca.
- [ ] Painel **"Possíveis duplicados"** mostra o par repetido.
- [ ] (Owner) rádio **"Manter como principal"** visível por registro; nenhum
      pré-selecionado.
- [ ] Selecionar um rádio habilita o botão **"Resolver duplicado"**; sela escolhido
      ganha borda ciano + selo "Principal".
- [ ] Clicar "Resolver duplicado" abre o **ConfirmDialog danger** com copy B-safe
      (move agendamentos, preenche apenas campos vazios, arquiva, nada apagado, sem
      desfazer completo).
- [ ] Confirmar: grupo some da lista; secundário aparece em Pacientes › Arquivados
      com badge **"Mesclado em outro registro"**.
- [ ] (Secretaria) rádio + botão "Resolver duplicado" **não aparecem**.
- [ ] CPF sempre mascarado em todos os cards e no modal.
- [ ] Export CSV/XLSX baixa arquivo limpo (CPF mascarado).

### Agenda
- [ ] Aba Agenda mostra a data de **hoje** com os agendamentos do seed.
- [ ] Navegação Anterior/Hoje/Próximo muda o dia; resumo do dia confere.
- [ ] Owner cria/edita/desativa profissional ("função/rótulo interno").
- [ ] Criar agendamento (paciente + horário) com **aviso anti-clínico** visível.
- [ ] Confirmar/Concluir/Faltou/Cancelar e **remarcar** funcionam.

### Equipe

- [ ] Aba **Equipe** visível apenas para o owner (secretaria não vê a aba).
- [ ] **Código de convite** em destaque (mono, maior); **Copiar** (solid) + **Regenerar**
      (ghost) lado a lado.
- [ ] **Regenerar** abre modal custom (não `window.confirm` nativo) explicando que o
      código antigo para de aceitar novas solicitações; pendentes e membros atuais não
      são afetados. Confirmar exibe o novo código.
- [ ] (Se demo ao vivo) Staff entra no `JoinClinicGate`, insere o código + nome da
      clínica → solicitação "aguardando aprovação".
- [ ] Owner vê a solicitação em "Solicitações pendentes" com nome/e-mail do staff.
- [ ] **Aprovar** abre modal custom (cyan, não danger) com nome+e-mail; confirmar →
      staff acessa `/app`; spinner durante ação; erro inline sem fechar o modal.
- [ ] **Recusar** abre modal custom (não danger — é recusar pedido, não ação destrutiva).
- [ ] Seção **"Membros da equipe"**: lista ativos; badge "Dono(a)" no owner;
      "Funcionário(a) (acesso administrativo)" no staff. Botão "Desativar acesso"
      ausente no próprio dono.
- [ ] **Desativar acesso** abre modal **danger** com nome do membro; cancelar/ESC não
      executa; confirmar desativa; membro some da lista ativa.
- [ ] "Mostrar inativos" exibe ex-membros com `border-left` cinza-azulado.
- [ ] Token stale do ex-membro → `GET /patients` retorna 403 `clinic_membership_revoked`
      (imediato — não espera token expirar).
- [ ] Seção **"Profissionais da agenda"**: criar profissional com nome + rótulo
      → seletor na aba **Agenda** atualiza sem reload da página (cache `['clinic-professionals']`).
- [ ] **Desativar profissional** abre modal danger; após confirmar, some do seletor.
- [ ] Reforçar: **sem autoentrada** — cada aprovação é manual; remoção preserva histórico/dados.

### Lembrete manual
- [ ] "Copiar lembrete" copia mensagem **neutra** (sem profissional/observação/
      CPF/dado clínico).
- [ ] "Abrir WhatsApp" abre `wa.me` preenchido (paciente sem telefone → aviso).
- [ ] Reforçar: **nada é enviado pelo sistema** — humano decide.

### Segurança / MFA (backup codes)
- [ ] Ativar MFA exibe os **códigos de recuperação uma única vez** (lista +
      "Copiar todos" + checkbox "Eu salvei" antes de concluir).
- [ ] Aba Segurança mostra **códigos restantes** e "Gerar novos códigos de
      recuperação" (aviso de que invalida os anteriores).
- [ ] Login digitando um **código de recuperação** funciona (uso único).
- [ ] Reforçar: códigos **não** reaparecem; **sem** SMS/e-mail/WhatsApp OTP.

## C. Mensagens-chave (não escorregar)

- [ ] Disse "ferramenta **administrativa**", não "prontuário/sistema clínico".
- [ ] **Não** afirmou "pronto para produção" nem "compliance LGPD completo".
- [ ] **Não** prometeu WhatsApp automático (é futuro, com ADR/opt-in próprios).
- [ ] Citou segurança real: papéis, MFA, auditoria sem PII, multi-tenant,
      retenção em **dry-run**, backup/restore validado localmente.

## D. Perguntas de validação (coletar feedback)

- [ ] Fluxo de importação corresponde à dor real de migração?
- [ ] Campos administrativos suficientes? Falta algum?
- [ ] Detecção de duplicados acionável (merge B-safe) resolve a dor? O que falta
      (desfazer, contagem de agendamentos antes, seleção campo-a-campo)?
- [ ] Agenda cobre o dia a dia da recepção? O que falta?
- [ ] Lembrete manual resolve? Há apetite por WhatsApp automático (opt-in)?
- [ ] Fluxo de convite + aprovação da equipe é claro? Fricção?
- [ ] MFA, backup codes e papéis (owner × funcionário(a)) atendem à operação?
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
