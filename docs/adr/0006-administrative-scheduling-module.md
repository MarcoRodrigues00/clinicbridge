# ADR 0006 — Administrative Scheduling Module — agenda administrativa, não clínica

- **Status:** Accepted
- **Data:** 2026-05-23
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/administrative-scheduling-scope.md` (escopo completo),
  `docs/adr/0001-product-direction-option-c.md` (Opção C),
  `docs/data-retention-policy.md`, `docs/security-notes.md`,
  `docs/project-state.md`, `docs/roadmap-next-phase.md`

## 1. Contexto

O ClinicBridge hoje é um produto de **migração administrativa** (upload/validação/
import de pacientes administrativos, duplicados, export, retenção dry-run) com
auth, papéis (`dono_clinica`/`secretaria`/`admin_sistema`), tenant isolation por
`clinica_id`, rate limit, audit logs e borda (Nginx/TLS local). O dono do produto
quer evoluir para um **piloto v0.1 mais forte** em ~1 mês e identificou o
**agendamento** como funcionalidade de alto valor comercial para clínicas pequenas.

A direção estratégica vigente é a **Opção C** (ADR 0001): administrativo primeiro;
expansão clínica só com ADR futura dedicada. Uma agenda pode facilmente "vazar"
para o domínio clínico (queixa, diagnóstico, procedimento) se o escopo não for
explícito.

## 2. Problema

Era preciso decidir **se** e **como** o ClinicBridge terá um módulo de agenda,
**sem** transformá-lo em sistema clínico/prontuário e **sem** escrever código
ainda. Faltava uma fronteira formal entre "agenda administrativa" (permitida) e
"dados clínicos" (bloqueados até ADR clínica).

## 3. Decisão

1. O ClinicBridge **terá** um módulo de **Agenda Administrativa** (agendamento de
   horários), como expansão **administrativa/comercial** — **não** clínica.
2. A agenda **não** conterá diagnóstico, prescrição, evolução, CID, anamnese,
   exames, medicação nem prontuário.
3. A agenda trabalha sobre os **pacientes administrativos já existentes** e sobre
   **profissionais da clínica** (entidade administrativa nova, sem dado clínico).
4. **Observações** em agendamentos são **administrativas, opcionais e mínimas** —
   nunca clínicas (com aviso explícito na UI futura).
5. **Nada é implementado nesta sprint.** Implementação (migrations/API/UI) ocorre
   em sprints separadas, **após** este ADR, respeitando tenant/`requireRole`/audit.
6. Esta decisão **não** afirma produção pronta nem conformidade completa com
   LGPD/HIPAA/CFM.

## 4. Escopo do módulo

Gestão de **horários administrativos**: cadastrar profissionais da clínica, criar/
confirmar/remarcar/cancelar agendamentos de pacientes administrativos, marcar
falta (no_show)/concluído, visualizar a agenda por dia/profissional, com auditoria
e isolamento por `clinica_id`. Detalhe em `docs/administrative-scheduling-scope.md`.

## 5. O que entra (administrativo)

- **Profissionais da clínica** (nome, especialidade administrativa **opcional/
  rótulo livre**, ativo/inativo).
- **Agendamentos** ligando paciente administrativo + (opcional) profissional, com
  janela de horário (`starts_at`/`ends_at`) e **status**.
- Transições de status (scheduled/confirmed/cancelled/rescheduled/no_show/completed).
- Visualização/filtros da agenda (por dia, por profissional).
- **Observação administrativa** curta e opcional (ex.: "paciente pediu contato por
  telefone").
- Auditoria das ações relevantes (sem PII desnecessária).

## 6. O que fica fora do escopo (clínico / proibido)

- prontuário, evolução clínica, anamnese, ficha clínica;
- diagnóstico, CID, prescrição, medicação, exames/resultados;
- "queixa", "motivo clínico da consulta", procedimento clínico;
- telemedicina, assinatura médica, faturamento de convênio;
- edição/exclusão/merge de pacientes (continua fora — ADR/sprint própria);
- lembretes automáticos (WhatsApp/e-mail/SMS) no MVP da agenda;
- exclusão física de agendamento no MVP (usar status `cancelled`);
- qualquer dado clínico sensível em `administrative_notes`.

## Lembretes e comunicação administrativa (adendo — Sprint 3.13)

> Escopo/decisão **futura**; **nada implementado** (sem envio real, sem WhatsApp
> API, sem job/cron). Detalhe operacional em `docs/administrative-scheduling-scope.md`.

Decisão:

- A agenda **poderá** evoluir para **lembretes administrativos** de agendamento.
- O **primeiro passo** é **lembrete assistido/manual** (o operador prepara e
  decide enviar), **não** automação total.
- **WhatsApp** pode ser um canal futuro, mas **com opt-in** e **templates
  neutros**. **WhatsApp automático / API oficial fica FORA do MVP** da agenda e
  exige **ADR/sprint própria** (análise jurídica + técnica) antes de qualquer
  implementação.
- **Nenhuma mensagem** pode conter dado clínico: motivo da consulta, diagnóstico,
  especialidade sensível, medicação ou tratamento. Mensagem é **administrativa e
  neutra** (lembrete de horário, confirmação/remarcação).
- Todo envio futuro deve ser **auditável sem armazenar conteúdo sensível** (só
  metadados: canal, horário, status, `template_key` — nunca o texto com PII/clínico).
- O **paciente pode optar por não receber** lembretes (opt-out); automação real só
  com **opt-in** explícito e registrado.
- Credenciais/API keys de qualquer provedor **nunca** no Git/docs.

## 7. Modelo conceitual inicial

Duas entidades novas, tenant-scoped por `clinica_id` (detalhe e campos em
`docs/administrative-scheduling-scope.md`):

- **ClinicProfessional** — profissional da clínica (administrativo).
- **Appointment** — agendamento (paciente administrativo + profissional opcional +
  janela de horário + status + observação administrativa opcional).

Reaproveita `patients` (administrativo) e `users` (papéis). Nada clínico.

## 8. Papéis e permissões

Reutiliza os papéis existentes (sem RBAC novo):

- **`dono_clinica`:** gerencia profissionais (criar/editar/desativar) + todas as
  ações de agendamento + visualizar.
- **`secretaria`:** cria/remarca/cancela/confirma agendamentos, marca
  no_show/concluído, visualiza — **não** gerencia profissionais nem configurações
  sensíveis.
- **`admin_sistema`:** papel de sistema sem `clinica_id` — `requireClinic` já o
  barra das rotas tenant-scoped (sem exceção para a agenda).

`requireRole` roda **após** `requireAuth` + `requireClinic` (nunca burla tenant),
seguindo o padrão da Sprint 3.1.

## 9. LGPD e segurança

- Tudo escopado por `clinica_id`; cross-tenant → 403; sem `listAll`.
- Mesmo "administrativa", a agenda **revela dados pessoais** (quem tem horário,
  quando) e, dependendo do tipo de profissional, pode **insinuar** contexto
  sensível → tratar com cuidado, minimização e acesso restrito por papel.
- **`administrative_notes`**: opcional, curta, **administrativa**; proibido
  conteúdo clínico. Exemplos no escopo.
- Logs/audit **sem PII excessiva**; mensagens de erro genéricas.
- Export/lembretes da agenda: **fora do MVP**, planejados em sprint própria.

## 10. Auditoria

Ações relevantes (criar/confirmar/remarcar/cancelar/no_show/concluir; criar/
desativar profissional) gravam em `audit_logs` no padrão atual (`acao`, `recurso`,
`recurso_id`, `usuario_id`, `clinica_id`, `ip`, `user_agent`, `request_id`,
`criado_em`) — **sem** PII e **sem** conteúdo de observação. `audit_logs` continua
append-only (a tabela não tem `metadata`).

## 11. Riscos

- **Vazamento de escopo:** pressão por adicionar "motivo clínico"/diagnóstico →
  mitigado por este ADR + validação/aviso na UI.
- **PII indireta:** a agenda expõe presença/horário de pacientes → controle por
  papel + minimização + auditoria.
- **Sobreposição de horário** do mesmo profissional → regra opcional na
  implementação (não bloqueante para o conceito).
- **Crescimento de dados** → retenção da agenda a planejar (alinhar à
  `docs/data-retention-policy.md`).

## 12. Trade-offs

- Entregar valor comercial cedo **vs.** disciplina de escopo (não virar clínico).
- Simplicidade do MVP (sem lembretes/anti-overlap forte) **vs.** completude.
- Reuso dos papéis atuais (rápido) **vs.** RBAC mais granular (adiado).

## 13. Critérios para implementação futura

1. Migrations dedicadas (sem tocar schema existente de forma destrutiva).
2. MVC + DAO + Service com `clinica_id` em toda query; sem `listAll`.
3. `requireAuth` + `requireClinic` + `requireRole` em todos os endpoints.
4. Validação de input no edge (status válido, janela de horário coerente).
5. Soft-cancel (status `cancelled`), sem delete físico no MVP.
6. Auditoria sem PII; observação administrativa validada (sem clínico).
7. Sem dado clínico em nenhum campo; testes de cross-tenant/cross-role.
8. UX para usuários não técnicos (português, estados vazios, avisos).

## 14. Relação com a estratégia Opção C

Coerente com a **Opção C**: é expansão **administrativa**, mantendo a fronteira
administrativo/clínico **explícita**. **Não** abre o domínio clínico — qualquer
campo/feature clínica continua exigindo **ADR clínica dedicada** (ADR 0001).
A agenda é um passo administrativo de alto valor que **prepara** o produto sem
assumir risco clínico/regulatório.

## 15. Consequências positivas

- Valor comercial claro para o piloto v0.1 (clínicas pequenas pedem agenda).
- Escopo fechado e auditável; fronteira anti-clínica documentada.
- Reuso de auth/papéis/tenant/audit já existentes (implementação mais simples).

## 16. Consequências negativas

- Mais superfície de dados pessoais (agendamentos) para proteger/reter.
- Exige disciplina contínua para barrar campos clínicos.
- Trabalho de UX/validação para manter observações administrativas.

## 17. Próximas sprints recomendadas

> Numeração atualizada na Sprint 3.13 (escopo de lembretes/WhatsApp consumiu o
> número antes previsto para o backend).

- **3.14 — Backend da Agenda** (migrations, DAO/service/controller/routes,
  validação, requireAuth/requireClinic/requireRole, audit, testes curl).
- **3.15 — Frontend da Agenda** (tela, filtros, criação, status, remarcação, UX).
- **3.16 — Lembrete manual/assistido** (copiar mensagem / abrir WhatsApp com texto
  neutro; sem API oficial; registro interno opcional do lembrete).
- **3.17 — Dados sintéticos + demo/piloto v0.1** (seed sintético, roteiro de demo,
  perguntas de validação).
- **3.18 — Polimento UX/dashboard v0.1** (navegação, cards, estados vazios,
  responsividade, textos amigáveis).
- **Sprint futura — WhatsApp API oficial** (opt-in, templates aprovados, logs de
  status, opt-out, config por clínica) — **só com ADR/sprint própria** e análise
  jurídica/técnica.

> Nota: este ADR descreve **decisão e escopo**. Não afirma produção pronta nem
> conformidade completa; a agenda **não** é substituto de um sistema clínico.
