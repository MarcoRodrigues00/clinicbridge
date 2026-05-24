# Roteiro de Demo / Piloto v0.1 — ClinicBridge

> Roteiro **operacional** para apresentar o ClinicBridge a uma clínica piloto.
> Acompanha o [checklist](demo-pilot-v0.1-checklist.md) e os
> [dados sintéticos](demo-data/README.md). Duração alvo: ~15–20 min.

## Enquadramento (dizer logo no começo)

ClinicBridge é uma ferramenta **administrativa** para clínicas pequenas: ajuda a
**migrar dados administrativos** de sistemas antigos (CSV/XLSX) para uma base
limpa, revisável e auditável, e oferece uma **agenda administrativa** simples.

**O que dizer:** "foco administrativo", "seguro por design", "escopo enxuto",
"piloto v0.1".
**O que NÃO dizer / NÃO prometer:** que é prontuário/sistema clínico; que está
"pronto para produção"; que é "compliance LGPD completo"; envio automático de
WhatsApp. Nada de diagnóstico/prescrição/exame/CID — **não é** prontuário.

## Pré-requisitos (ver checklist para o passo a passo)

- Serviços de pé (`docker compose up -d`, backend `:3001`, frontend `:5173`).
- Banco com a **agenda demo populada**: `pnpm --filter backend seed:demo`.
- Arquivo de import à mão: [`docs/demo-data/pacientes-demo.csv`](demo-data/pacientes-demo.csv).
- Login de **owner** (`dono_clinica`) da clínica de demo. Opcional: um login de
  **secretaria** para mostrar a diferença de permissões.
- (Opcional) MFA ativado nesse owner para demonstrar o login em 2 passos — ao
  ativar, **anote os códigos de recuperação** (exibidos uma única vez).

> A agenda demo entra na **mesma clínica** do owner que faz login (o seed mira a
> clínica com pacientes). Assim a aba Agenda já aparece com conteúdo.

---

## Roteiro passo a passo

### 1. Abertura e login (≈2 min)

1. Abrir a **landing** (`/`): mostrar a seção "O que o ClinicBridge entrega no
   piloto" — posicionamento administrativo, sem jargão de produção.
2. Ir para **`/login`** e entrar como **owner**.
3. **Se MFA estiver ativo:** a senha leva ao passo de **código** — aceita o código
   do **app autenticador** ou um **código de recuperação** (backup code). Falar:
   "MFA por TOTP, sem SMS/serviço externo; o segredo fica cifrado em repouso."
   Digitar o código → entra no `/app`.

> Mensagem: autenticação real (JWT), com **MFA opcional** (TOTP + códigos de
> recuperação) e **papéis** de acesso.

### 2. Importação administrativa (≈6 min) — coração da demo

Aba **Importações**.

1. **Enviar** `pacientes-demo.csv`. Falar dos controles de upload: extensão +
   MIME + **conteúdo real (magic bytes)**, tamanho limitado, nome interno
   aleatório, armazenamento privado.
2. **Pré-visualização + mapeamento:** o sistema sugere o mapeamento pelos
   cabeçalhos (`Nome completo→nome`, `CPF→cpf`, etc.). Mostrar que `Convênio`
   aparece como coluna **não mapeada** (export legado com colunas a mais).
3. **Validar:** mostrar o relatório — linhas válidas, e o **grupo duplicado**
   ("Ana Beatriz Martins" repetida). Falar: "validação full-file, mensagens
   seguras — o relatório **nunca** ecoa o conteúdo das células."
4. **Criar sessão** → **Dry-run:** "simulação que **não grava nada**; mostra o
   que entraria."
5. **Marcar pronto** → **Importar** (ação de `dono_clinica`). Mostrar o **recibo**
   persistido (contagens, sem PII).

> Mensagem: pipeline revisável — **upload → mapear → validar → simular →
> importar**, com trilha de auditoria.

### 3. Pacientes, duplicados e exportação (≈3 min)

1. Aba **Pacientes:** lista paginada, **CPF mascarado** (`***.***.789-01`),
   busca. "CPF bruto **nunca** sai pela API."
2. **Duplicados:** detecção informativa (read-only) — aparece o par duplicado.
   "Sem merge/edição/exclusão automáticos no MVP — é informativo."
3. **Exportar** CSV/XLSX: arquivo limpo, CPF mascarado, com
   **neutralização de fórmula** (anti CSV-injection). "Read-only; sem link
   público."

### 4. Agenda administrativa (≈4 min)

Aba **Agenda** (já populada pelo seed).

1. **Profissionais da clínica:** owner cria/edita/desativa (campo
   "função/rótulo interno", **não** especialidade clínica). Como secretaria, é
   só leitura.
2. **Agenda do dia:** cabeçalho com a data, navegação **Anterior/Hoje/Próximo**,
   **resumo do dia** e **timeline por horário**. Mostrar o dia de hoje com os
   agendamentos demo.
3. **Criar agendamento:** "+ Novo agendamento" → buscar paciente → horário →
   observação **administrativa** (mostrar o **aviso anti-clínico** ao lado do
   campo). Salvar.
4. **Status:** Confirmar / Concluir / Faltou / Cancelar; **remarcar** inline.
   "Cancelamento é status, não exclusão física."

### 5. Lembrete manual/assistido (≈2 min)

Num card `scheduled`/`confirmed`/`rescheduled`, linha **"Lembrete administrativo"**:

1. **Copiar lembrete:** mensagem **neutra** ("Olá, {nome}! …atendimento na
   {clínica} para {data} às {hora}…"). Mostrar que **não** há profissional/
   observação/CPF/dado clínico no texto.
2. **Abrir WhatsApp:** monta um link `wa.me` com o texto preenchido — abre o
   WhatsApp do operador. **Nada é enviado pelo sistema; o humano decide.**
3. (Opcional) **Ver/editar mensagem:** rascunho local, com aviso anti-clínico.

> Mensagem: lembrete **manual-first**. WhatsApp **automático/API é futuro** (com
> ADR/opt-in próprios), **não** está nesta versão.

### 5b. Equipe (opcional — ≈3 min)

> Esta etapa é opcional: exige ter uma segunda conta (staff) preparada e o código
> de convite à mão. Se a demo for só para o(a) dono(a) da clínica, é o momento
> mais relevante. Pode ser pulada numa demo expressa.

Aba **Equipe** (visível apenas para o owner).

1. **Código de convite:** mostrar o código em destaque (mono, maior). Botão
   **Copiar** ao lado de **Regenerar** (ghost). Falar: "você compartilha esse
   código fora do sistema — por mensagem, e-mail — com quem vai operar o sistema.
   Sem busca pública de clínicas; sem autoentrada."
2. **Solicitar entrada (staff, outra aba):** abrir `/login` como staff → tela
   `JoinClinicGate` → inserir o código + confirmar o nome da clínica → submeter.
   Mostrar que a solicitação fica como "aguardando aprovação".
3. **Aprovar (owner):** voltar à aba do owner → seção "Solicitações pendentes"
   mostra a solicitação com nome/e-mail. Clicar **Aprovar** → **modal abre** com
   os dados; confirmar. Falar: "toda entrada é manual — o dono decide, não existe
   aprovação automática. A ação abre um modal — sem `window.confirm` nativo, sem
   bloqueio do browser."
4. **Membros da equipe:** seção abaixo das solicitações lista owner + funcionário(a)
   aprovado(a) com badge de papel. Mencionar: dono pode **Desativar acesso** (modal
   danger) — não apaga dados, a pessoa pode pedir entrada de novo.
5. **Profissionais da agenda:** painel abaixo de Membros. Criar um profissional
   com nome + rótulo ("Fisioterapeuta" — interno, não clínico). Mostrar que ao
   trocar para a aba **Agenda**, o novo profissional já aparece no seletor.

> Mensagem: **fluxo invite-only** (sem busca pública), **aprovação manual** pelo
> dono, **modal custom** em cada ação sensível, **remoção preserva histórico**.

### 6. Segurança e governança (≈2 min)

Aba **Segurança**:
1. **MFA (2 etapas):** ativar mostra QR + chave manual; ao confirmar, o sistema
   exibe **códigos de recuperação uma única vez** (copiar todos + "Eu salvei").
   Falar: "uso único, só hash no banco, nunca exibidos de novo." Mostrar a
   contagem de **códigos restantes** e a ação **"Gerar novos códigos"** (aviso de
   que invalida os anteriores).
2. Mencionar (sem prometer compliance): **papéis** (owner × secretaria),
   **auditoria sem PII**, **isolamento por clínica** (multi-tenant), **retenção em
   dry-run** (nada é apagado), **backup/restore** validado localmente.

> Backup codes: TOTP + códigos de recuperação cobrem a perda do app autenticador.
> **Sem** SMS/e-mail/WhatsApp OTP, sem recovery por suporte/bypass.

---

## Encerramento

- Recapitular: "migração administrativa revisável + agenda administrativa, com
  segurança por design."
- **Próximos passos honestos:** itens P1 antes de produção (TLS/WAF reais,
  Redis/secrets gerenciados, validação jurídica de retenção, offsite de backup).
  Ver `docs/roadmap-next-phase.md`.
- Coletar feedback (ver perguntas abaixo).

## Perguntas de validação para o piloto

1. O fluxo **upload → mapear → validar → importar** corresponde à dor real de
   migrar a base de vocês? O que falta?
2. Os **campos administrativos** (nome, contato, CPF, nascimento, convênio) são
   suficientes para o cadastro inicial? Falta algum campo administrativo?
3. A **detecção de duplicados** informativa ajuda? Vocês precisariam de
   merge/edição (hoje fora do MVP)?
4. A **agenda administrativa** cobre o dia a dia da recepção? O que é essencial e
   ainda não tem?
5. O **lembrete manual** (copiar / abrir WhatsApp) resolve no curto prazo? Há
   apetite/condições para WhatsApp **automático** (opt-in) no futuro?
6. **MFA** e papéis (owner × secretaria) atendem à realidade de quem opera?
7. Há algum dado que vocês **não** colocariam numa ferramenta administrativa?

## Limpeza pós-demo

- Remover os dados de agenda demo: `pnpm --filter backend seed:demo:clean`.
- Se importou o CSV de demo numa clínica que não é descartável, lembre que isso
  **soma** pacientes — prefira uma clínica de demo dedicada.
</content>
