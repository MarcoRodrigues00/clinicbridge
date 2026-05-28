# ClinicBridge — Escopo do Módulo de Agenda Administrativa

> Documento de escopo (docs-only, Sprint 3.12). Prepara a implementação **futura**
> de uma **agenda administrativa** (não clínica). **Nada de código nesta sprint.**
> Decisão: `docs/adr/0006-administrative-scheduling-module.md`. Direção: Opção C
> (`docs/adr/0001-product-direction-option-c.md`).
>
> ⚠️ A agenda **não** é prontuário nem substituto de sistema clínico. Não afirma
> produção pronta nem conformidade completa com LGPD/HIPAA/CFM. Relacionado:
> `docs/security-notes.md`, `docs/data-retention-policy.md`.

## 1. Status e objetivo

- **Status:** escopo aprovado (ADR 0006); **backend (Sprint 3.14)** e **frontend
  (Sprint 3.15)** implementados (tabelas/endpoints tenant-scoped, sem dado clínico,
  sem DELETE, auditado; painéis no Dashboard com status em PT e aviso anti-clínico);
  **lembretes (3.16+) ainda pendentes**.
- **Objetivo:** dar ao ClinicBridge um módulo de **agendamento administrativo**
  para fortalecer o piloto **v0.1**, mantendo a fronteira administrativo/clínico.

## 2. Por que agenda faz sentido no produto

- Clínicas pequenas pedem agenda como funcionalidade central do dia a dia.
- Alto valor comercial e baixo risco regulatório **se** ficar administrativa.
- Reaproveita o que já existe: pacientes administrativos, papéis, tenant, audit.
- Boa vitrine para o piloto v0.1 sem entrar em domínio clínico.

## 3. Escopo administrativo (o que entra)

- Cadastro de **profissionais da clínica** (administrativo).
- **Agendamentos**: paciente administrativo + profissional (opcional) + janela de
  horário + status.
- Ações: criar, confirmar, remarcar, cancelar (soft), marcar no_show, concluir.
- Visualização da agenda por **dia** e filtro por **profissional**.
- **Observação administrativa** curta e opcional.
- Auditoria das ações; isolamento por `clinica_id`.

## 4. Fora do escopo clínico (proibido)

- prontuário, evolução, anamnese, ficha clínica;
- diagnóstico, CID, prescrição, medicação, exames/resultados;
- "queixa"/"motivo clínico"/procedimento clínico;
- telemedicina, assinatura médica, faturamento de convênio;
- edição/exclusão/merge de pacientes;
- lembretes automáticos (WhatsApp/e-mail/SMS) no MVP;
- exclusão física de agendamento no MVP (usar `cancelled`);
- qualquer conteúdo clínico em `administrative_notes`.

## 5. Usuários e papéis

Reutiliza os papéis atuais (`users.papel`), sem RBAC novo. `requireRole` roda
**após** `requireAuth` + `requireClinic` (nunca burla tenant — padrão Sprint 3.1).

| Ação | dono_clinica | secretaria | admin_sistema |
|---|---|---|---|
| Criar profissional | ✅ | ❌ | ❌ (sem clínica) |
| Editar/desativar profissional | ✅ | ❌ | ❌ |
| Criar agendamento | ✅ | ✅ | ❌ |
| Confirmar | ✅ | ✅ | ❌ |
| Remarcar | ✅ | ✅ | ❌ |
| Cancelar | ✅ | ✅ | ❌ |
| Marcar no_show | ✅ | ✅ | ❌ |
| Marcar concluído | ✅ | ✅ | ❌ |
| Visualizar agenda | ✅ | ✅ | ❌ |
| Configurações sensíveis | ✅ | ❌ | ❌ |

`admin_sistema` não tem `clinica_id` → `requireClinic` o barra das rotas
tenant-scoped (inclui toda a agenda).

## 6. Entidades conceituais

> Proposta; campos finais e tipos ficam para a sprint de migrations. Tudo
> tenant-scoped por `clinica_id`. **Nenhum campo clínico.**

**ClinicProfessional** (profissional da clínica):
- `id`
- `clinica_id`
- `nome`
- `especialidade` (rótulo administrativo **opcional/livre**; não é dado clínico)
- `ativo` (boolean)
- `criado_em`, `atualizado_em`

**Appointment** (agendamento):
- `id`
- `clinica_id`
- `patient_id` (FK paciente administrativo existente)
- `professional_id` (FK profissional; opcional)
- `starts_at`, `ends_at`
- `status` (ver §8)
- `administrative_notes` (opcional, curta, **administrativa**)
- `created_by_user_id`, `updated_by_user_id`
- `criado_em`, `atualizado_em`

## 7. Fluxos principais

1. **Criar profissional** (dono_clinica).
2. **Ver agenda do dia** (owner/secretaria).
3. **Filtrar por profissional**.
4. **Criar agendamento** para um paciente administrativo.
5. **Confirmar** agendamento.
6. **Remarcar** (nova janela; status `rescheduled`).
7. **Cancelar** (soft; status `cancelled`).
8. **Marcar falta** (`no_show`).
9. **Marcar concluído** (`completed`).
10. **Ver histórico/auditoria** do agendamento (sem PII além do necessário).

## 8. Status de agendamento

`scheduled` · `confirmed` · `cancelled` · `rescheduled` · `no_show` · `completed`

- Status internos em inglês (consistente com o padrão do projeto); **labels em
  português** na UI futura.
- Transições válidas a definir na implementação; status inválido → 400.

## 9. Regras de negócio iniciais

- Todo agendamento pertence a **uma clínica** (`clinica_id` obrigatório).
- Todo agendamento referencia um **paciente administrativo** da mesma clínica.
- Profissional é **opcional**, mas, se houver, deve ser da mesma clínica.
- **Sem acesso cross-tenant** (403); DAOs sempre filtram `clinica_id`; sem `listAll`.
- **Sem status inválido**; `ends_at` > `starts_at`.
- **Anti-overlap por profissional (implementado na Sprint 6.0A):** dois agendamentos
  **ativos** do mesmo profissional na mesma clínica não podem se sobrepor.
  - Conflito = mesmo `professional_id` (não-nulo) + sobreposição de intervalo meio-aberto
    (`existing.starts_at < ends_at AND existing.ends_at > starts_at`; bordas que se tocam não
    conflitam).
  - **Reservam o horário:** `scheduled`, `confirmed`, `rescheduled` (`OVERLAP_BLOCKING_STATUSES`).
    **Não reservam:** `cancelled` (liberado), `completed` (histórico — decisão de produto: não
    afeta agendamento futuro), `no_show` (terminal — slot não retido).
  - Validado em `create`, `reschedule` (exclui o próprio id) e `updateStatus` ao reativar
    (alvo `scheduled`/`confirmed`). Agendamento **sem profissional** não sofre checagem.
  - Conflito → **409 `appointment_time_conflict`**, mensagem **sem PII**.
  - **Limitação:** check-then-write no service tem janela de corrida rara entre dois creates
    concorrentes; endurecimento futuro = constraint DB `EXCLUDE USING gist` (btree_gist).
- **Sem delete físico** no MVP — cancelar via status `cancelled`.
- Registrar ações importantes em `audit_logs` (sem PII/observação).

## 10. Segurança e LGPD

- Tenant isolation por `clinica_id` em tudo; acesso por papel (§5).
- A agenda expõe **dados pessoais** (presença/horário) e pode **insinuar** contexto
  sensível conforme o tipo de profissional → minimização + acesso restrito.
- **`administrative_notes`**: opcional, curta, **administrativa**.
  - ✅ permitido: "paciente pediu contato por telefone", "remarcou por viagem".
  - ❌ proibido: "dor intensa", "ansiedade", "uso de remédio X", "diagnóstico Y",
    "queixa", "procedimento clínico".
  - UI futura deve exibir aviso e (idealmente) validar/limitar tamanho.
- Logs/audit **sem PII excessiva**; erros genéricos.
- **Export** e **lembretes** da agenda: fora do MVP; sprint própria.
- **Retenção** da agenda: planejar alinhado à `docs/data-retention-policy.md`.

## 11. Auditoria

- Ações auditadas: criar/confirmar/remarcar/cancelar/no_show/concluir agendamento;
  criar/editar/desativar profissional.
- Padrão atual de `audit_logs` (append-only; colunas reais `acao/recurso/
  recurso_id/usuario_id/clinica_id/ip/user_agent/request_id/criado_em`; **sem**
  `metadata`). **Não** gravar conteúdo de `administrative_notes` nem PII.

## 12. UX esperada

- Português, para usuários não técnicos (secretária/dono).
- Visão de **agenda do dia** + filtro por profissional; estados vazios claros.
- Criar/alterar status em poucos cliques; remarcação simples.
- Aviso explícito de "observação administrativa — não inserir dados clínicos".
- Responsiva (mobile), seguindo o padrão do dashboard atual.
- Defesa real no backend; o frontend é só UX (esconder ações sem permissão).
- **Polish UX (Sprint 6.0B):** card com faixa de accent **por status** (nunca por
  especialidade — anti-insinuação clínica), chips de profissional/serviço/horário,
  agrupamento por hora, barra de filtros distinta da criação, empty state contextual.
  Benchmark e decisões (e o que ficou adiado: visão semanal, drag-and-drop, recorrência,
  disponibilidade automática, Google Calendar, WhatsApp automático) em
  `docs/agenda-ux-benchmark.md`. Frontend-only; mantém escopo administrativo.

## 13. Roadmap de implementação

> Numeração atualizada na Sprint 3.13 (escopo de lembretes/WhatsApp).

- **Sprint 3.14 — Backend da Agenda:** migrations (ClinicProfessional,
  Appointment), DAO/service/controller/routes, validação, `requireAuth`/
  `requireClinic`/`requireRole`, audit, testes curl.
- **Sprint 3.15 — Frontend da Agenda:** tela, filtros, criação, alteração de
  status, remarcação, UX para não técnicos.
- **Sprint 3.16 — Lembrete manual/assistido:** "Copiar mensagem" + "Abrir
  WhatsApp" com texto neutro; humano decide enviar; registro interno opcional
  (ver Parte II). Sem API oficial.
- **Sprint 3.17 — Dados sintéticos + demo/piloto v0.1:** seed sintético, roteiro
  de demo, perguntas de validação, polish.
- **Sprint 3.18 — Polimento UX/dashboard v0.1:** navegação, cards, estados vazios,
  responsividade, textos amigáveis.
- **Sprint futura — WhatsApp API oficial:** opt-in, templates aprovados, logs de
  status, opt-out, config por clínica — só com ADR/sprint própria.

## 14. Dados sintéticos para demo

- Seed **sintético** (sem PII real): profissionais fictícios + agendamentos
  fictícios sobre os pacientes administrativos de teste já existentes.
- Nunca usar dados reais de paciente em demo; nunca commitar dados de seed com PII.
- Observações de exemplo devem ser **administrativas** (ver §10).

## 15. Perguntas para validação com usuários reais

- Quais status de agendamento são realmente usados no dia a dia?
- A clínica precisa de visão semanal além da diária?
- Profissional é sempre obrigatório ou às vezes a sala/horário basta?
- Quais observações administrativas são úteis (sem entrar no clínico)?
- Há necessidade de bloquear sobreposição de horário desde o MVP?
- Lembretes (WhatsApp/SMS/e-mail) são prioridade pós-MVP?
- Export da agenda (CSV/PDF) é necessário para a rotina?

## 16. Critérios de aceite para o MVP da agenda

- [ ] CRUD de profissionais (criar/editar/desativar) restrito a `dono_clinica`.
- [ ] Criar/confirmar/remarcar/cancelar/no_show/concluir agendamento
      (owner + secretaria); todos tenant-scoped.
- [ ] Visão da agenda do dia + filtro por profissional.
- [ ] `clinica_id` obrigatório; cross-tenant → 403; sem `listAll`.
- [ ] Status validado; `ends_at > starts_at`; cancelamento é soft.
- [ ] Auditoria das ações sem PII; observação administrativa validada (sem clínico).
- [ ] **Nenhum** campo/dado clínico em nenhuma camada.
- [ ] Testes de cross-tenant e cross-role passando.
- [ ] UX em português, com estados vazios e aviso anti-clínico.

---

# Parte II — Comunicação e lembretes (escopo FUTURO, Sprint 3.13)

> **Escopo/decisão futura — nada implementado.** Sem envio real, sem WhatsApp API,
> sem SDK, sem job/cron, sem fila, sem migration. Decisão: adendo no ADR 0006
> ("Lembretes e comunicação administrativa"). Tudo aqui é **administrativo e
> neutro** — nunca clínico. Não afirma conformidade completa com LGPD.

## II.1 Lembretes administrativos

- Objetivo: reduzir faltas (no_show) lembrando o paciente do **horário** do
  agendamento — sem revelar motivo/contexto clínico.
- **Manual-first:** o primeiro passo é lembrete **assistido/manual** (operador
  prepara o texto e decide enviar), não automação total.
- Conteúdo sempre **administrativo**: nome, clínica, data/hora, instrução de
  confirmar/remarcar. Nada de diagnóstico/especialidade sensível/medicação.

## II.2 WhatsApp manual/assistido (primeiro passo)

- A UI futura oferece **"Copiar mensagem"** (texto neutro pronto) e/ou um link
  **"Abrir WhatsApp"** (ex.: `https://wa.me/<numero>?text=<texto neutro>`), que
  abre o app do WhatsApp do **próprio operador** com a mensagem pré-preenchida.
- **Um humano decide e envia** — **sem** API oficial, **sem** envio automático,
  **sem** token/credencial no sistema.
- Nenhum conteúdo clínico no texto (ver II.7).

## II.3 WhatsApp automático (futuro, gated)

- Envio automático via **API oficial** (WhatsApp Business/Cloud API ou provedor)
  fica **fora do MVP** e exige **ADR/sprint própria** com análise jurídica/técnica.
- Pré-requisitos mínimos: **opt-in** explícito, **templates aprovados/neutros**,
  **logs de status** (enviado/entregue/falha), tratamento de **falhas**,
  **opt-out**, **configuração por clínica**, credenciais em secrets manager
  (**nunca** no Git).

## II.4 Opt-in e preferências de contato

- Antes de **qualquer automação real**, o paciente precisa de **opt-in** explícito
  e registrado; deve poder fazer **opt-out** a qualquer momento.
- Preferência de canal por paciente (administrativa), conceitual:
  `none | whatsapp | phone | email`.
- Sem opt-in → sem envio automático (o lembrete manual/assistido continua sendo
  decisão humana caso a caso).

## II.5 Templates neutros

- Mensagens vêm de **templates administrativos** versionados e **neutros**;
  variáveis apenas administrativas (`{{nome}}`, `{{clinica}}`, `{{data}}`, `{{hora}}`).
- **Exemplo permitido:**
  > "Olá, {{nome}}! Passando para lembrar do seu atendimento agendado na
  > {{clinica}} para {{data}} às {{hora}}. Para confirmar ou remarcar, responda
  > esta mensagem ou entre em contato com a clínica."
- **Exemplos proibidos** (contêm dado clínico — NÃO usar):
  - "Sua **consulta psicológica**..."
  - "Seu **tratamento de ansiedade**..."
  - "Sua **avaliação odontológica para dor**..."
  - "Seu **retorno do medicamento X**..."
  - qualquer diagnóstico, motivo, especialidade sensível, tratamento, remédio ou
    dado clínico.

## II.6 Logs de envio

- Registrar **metadados** do lembrete: canal, horário agendado/enviado, status,
  `template_key` — **nunca** o texto renderizado com PII nem dado clínico.
- Auditoria no padrão atual (`audit_logs` append-only; sem `metadata`); logs de
  aplicação sem PII excessiva. Conteúdo da mensagem **não** é persistido.

## II.7 Regras anti-dado-clínico nas mensagens

- A mensagem é **administrativa**: lembrete de horário + confirmar/remarcar.
- **Proibido** no texto: motivo da consulta, diagnóstico, especialidade sensível,
  procedimento clínico, medicação, tratamento, "queixa".
- Especialidade do profissional **não** deve aparecer na mensagem se puder revelar
  contexto sensível (ex.: psiquiatria, oncologia) — preferir "atendimento" genérico.
- Validação/aviso na UI futura para impedir conteúdo clínico em campos livres.

## II.8 Roadmap de comunicação (fases)

- **Fase A — Agenda manual:** criar agendamento, status, filtros. **Sem lembrete.**
- **Fase B — Lembrete assistido/manual:** "Copiar mensagem" + "Abrir WhatsApp" com
  texto neutro; **humano decide enviar**; **sem API oficial**. **✅ Implementada na
  Sprint 3.18** (`utils/reminders.ts` + botões por card; `wa.me`; mensagem
  **editável localmente** sem persistência + aviso anti-clínico; sem envio
  automático/registro de envio).
- **Fase C — Registro interno de lembrete:** registrar que um lembrete foi
  preparado/enviado manualmente (canal + horário); **sem** conteúdo clínico.
- **Fase D — WhatsApp automático (futuro):** só com **opt-in**, **templates
  aprovados/neutros**, logs de status, controle de falhas, **opt-out**, config por
  clínica e **análise jurídica/técnica** antes (ADR/sprint própria).

## II.9 Modelo conceitual futuro (NÃO implementar agora)

> Conceitual; sem tabelas/migrations/envio agora. Tenant-scoped por `clinica_id`
> quando aplicável. **Nenhum campo clínico.**

**PatientContactPreference:**
- `patient_id`
- `preferred_channel` (`none | whatsapp | phone | email`)
- `whatsapp_opt_in` (boolean)
- `opt_in_at`, `opt_out_at`

**AppointmentReminder:**
- `appointment_id`
- `channel`
- `scheduled_for`
- `status`
- `sent_at`
- `delivery_status`
- `template_key`  (referência ao template; **não** o texto)
- `created_by_user_id`

**MessageTemplate:**
- `key`
- `channel`
- `content`  (texto **neutro/administrativo**; variáveis administrativas só)
- `active`
- `version`

> Estes modelos são **futuros**: não criar tabelas, migrations nem envio real
> nesta fase. WhatsApp automático só após ADR/sprint dedicada.
