# ClinicBridge — Benchmark de UX da Agenda Administrativa

> Sprint 6.0B (2026-05-28). Benchmark **leve** de sistemas de agenda bem usados,
> com decisões de UX aplicadas (e adiadas) para a Agenda Administrativa do
> ClinicBridge. **Inspiração de UX, não cópia de marca/layout.**
>
> A Agenda é **administrativa, não clínica** (ADR 0006). Nenhuma referência aqui
> autoriza campo clínico (diagnóstico, CID, queixa, procedimento, medicação).
> Relacionado: `docs/administrative-scheduling-scope.md`, `docs/sprint-history.md`.

## 1. Contexto

A 6.0A endureceu a regra (anti-overlap por profissional, filtros profissional/
serviço/status, serviço no card). A 6.0B foca em **polish visual incremental**
(frontend-only) para o piloto familiar multi-serviço (pai médico, mãe psicóloga,
odontologia futura), **sem** refatoração grande, sem dependência nova, sem backend.

## 2. Referências — o que fazem bem

| Referência | O que faz bem (UX) |
|---|---|
| **Google Calendar** | Leitura por dia/semana com **grid por horário**; eventos **coloridos** (cor = categoria/estado) lidos num relance; hierarquia visual clara (hora à esquerda, evento à direita); densidade alta sem poluir. |
| **Square Appointments** | Agenda **operacional** de serviço/staff: cada compromisso mostra **profissional + serviço + cliente + status** de forma escaneável; foco em "quem atende o quê e quando"; filtros por profissional. |
| **Cal.com** | Fluxo **moderno e limpo**; tipos de serviço (event types) bem destacados; espaçamento generoso; estados claros. |
| **Calendly** | **Clareza no fluxo** de seleção de horário; passos enxutos; pouca poluição visual; bom uso de estados vazios e microcopy. |

## 3. O que faz sentido para o ClinicBridge **agora** (aplicado na 6.0B)

- **Cor por estado no card** (inspirado no Google Calendar) — faixa de accent à
  esquerda do card por status (`scheduled`/`confirmed`/`completed`/`rescheduled`/
  `no_show`/`cancelled`). Ganho grande de escaneabilidade, custo só CSS.
- **Chips de profissional · serviço · horário** (inspirado no Square) — substitui
  linhas empilhadas por chips compactos; "quem, o quê, quando" num relance.
- **Agrupamento por hora** (inspirado no Google Calendar) — separador fino
  "HH:00 ─────" quando a hora muda; lê o dia por blocos sem virar grid completo.
- **Barra de filtros distinta da criação** (inspirado no Cal/Calendly) — filtros
  num contêiner próprio, separados visualmente do fluxo "Novo agendamento".
- **Empty state melhor** (inspirado no Calendly) — microcopy que distingue
  "dia vazio" de "sem resultado para os filtros" + ação adequada.
- **Resumo do dia rotulado** — leve, sem virar dashboard.

## 4. O que **NÃO** faz sentido agora (fora de escopo / adiado)

- **Visão semanal completa / grid de colunas por profissional** — exigiria
  refatoração grande de layout e cálculo de posição por minuto. Adiar (sprint
  própria, se o piloto pedir).
- **Drag-and-drop** para mover/remarcar — complexidade alta, risco de regressão
  no anti-overlap; remarcação por formulário já cobre o caso.
- **Disponibilidade automática / slots livres** (estilo Calendly/Cal.com) — é um
  modelo de *self-booking* pelo paciente; o ClinicBridge é operado pela clínica.
  Fora do escopo do piloto.
- **Recorrência** de agendamentos — modelo de dados próprio; adiar.
- **Integração Google Calendar / iCal** — integração externa; fora de escopo.
- **WhatsApp automático / lembrete por API** — segue gated (ADR 0006 adendo); só
  o lembrete **manual/assistido** atual permanece.
- **Cor/insinuação por especialidade** — risco de revelar contexto sensível
  (psiquiatria, etc.). Accent é por **status**, nunca por tipo clínico.

## 5. Princípio anti-clínico (inalterado)

Nenhuma melhoria de UX pode introduzir dado clínico. `administrative_notes`
segue administrativo e curto; o accent do card é por **status administrativo**;
chips mostram **profissional/serviço/horário** (rótulos administrativos), nunca
motivo, diagnóstico, CID, queixa, procedimento ou medicação. Aviso anti-clínico
mantido nos formulários.

## 6. Decisão e próximos passos

A 6.0B aplica os itens da §3 como **polish frontend-only** (sem backend, sem
migration, sem dependência). Itens da §4 ficam para sprints futuras dedicadas,
cada uma avaliada contra a necessidade real do piloto. A visão semanal é a
candidata mais provável para uma 6.0C, **se** o piloto familiar demonstrar
necessidade — caso contrário, manter a visão diária polida.
