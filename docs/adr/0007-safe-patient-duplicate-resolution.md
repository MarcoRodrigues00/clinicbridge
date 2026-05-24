# ADR 0007 — Resolução segura de pacientes duplicados (merge B-safe, administrativo)

- **Status:** Accepted
- **Data:** 2026-05-24
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/adr/0001-product-direction-option-c.md` (Opção C),
  `docs/adr/0006-administrative-scheduling-module.md` (agenda administrativa),
  `docs/security-notes.md`, `docs/project-state.md`, `docs/roadmap-next-phase.md`,
  `docs/testing-checklist.md`

## 1. Contexto

O ClinicBridge tem detecção de duplicados **read-only** (`patientDuplicateService`,
union-find sobre chaves normalizadas: CPF, e-mail, telefone, nome+nascimento,
nome+telefone, nome+e-mail; `group_key` não-reversível; CPF mascarado na saída) e,
desde a Sprint 3.23, uma tela **acionável** (`DuplicatesList`) que reusa o CRUD de
pacientes da 3.22: **editar** registro (dono + secretaria) e **arquivar/restaurar**
(só dono, soft-delete via `status='archived'`, **sem delete físico**).

A ação "Excluir duplicado" hoje é apenas **arquivar** o registro: ele sai da fila
visual de duplicados e continua disponível em Pacientes › Arquivados. Histórico e
agendamentos são preservados (não há delete físico; `appointments.patient_id` é
`ON DELETE CASCADE`, mas nada é deletado).

A direção estratégica vigente é a **Opção C** (ADR 0001): administrativo primeiro,
expansão clínica só com ADR clínica dedicada. Merge de pacientes é **administrativo**
e cabe nesta fronteira — desde que não toque em nenhum dado clínico.

## 2. Problema

Arquivar um duplicado resolve a **fila visual**, mas tem um efeito colateral real
descoberto na análise da Sprint 3.32:

- A Agenda (`appointmentDao.listByClinic`) lista agendamentos **sem filtrar por
  status do paciente** e resolve nomes a partir de `listPatients` com
  **`status='active'` (default)**.
- Logo, **arquivar um duplicado que tem agendamentos deixa esses agendamentos
  visíveis na Agenda com nome-fallback** (`"Paciente abc12345…"`), porque o
  registro arquivado não está mais no mapa de pacientes ativos.

Ou seja: apenas arquivar pode **degradar a Agenda**. Falta uma forma de **resolver
o duplicado consolidando** os vínculos administrativos no registro que vai
permanecer (o "principal"), sem delete físico, sem perder histórico e sem assumir
risco clínico ou de qualidade de dados.

## 3. Decisão

Adotar **merge administrativo "B-safe"** (conservador) para o MVP/piloto:

1. O dono escolhe o **paciente principal** (sobrevivente) e um ou mais
   **secundários** (duplicados) do **mesmo** grupo/clínica.
2. **Mover os agendamentos** administrativos dos secundários para o principal
   (reassign tenant-scoped de `appointments.patient_id`). Resolve o problema da §2.
3. **Preencher apenas campos vazios** do principal com dados dos secundários
   (**fill-blanks não-destrutivo**): nunca sobrescrever um campo já preenchido do
   principal. Correções reais continuam via `PatientEditForm` (antes/depois),
   já auditado como `patient.update`.
4. **Arquivar** o(s) secundário(s) (soft-delete `status='archived'`) — **sem delete
   físico**.
5. **Proveniência** via migration mínima e aditiva: o secundário arquivado aponta
   para o principal (`patients.merged_into_id` + `patients.merged_at`).
6. Tudo em **uma transação**, **owner-only**, **auditado sem PII**, **idempotente**.
7. **Nada é implementado nesta sprint (3.32).** Migration/API/UI vêm em 3.33/3.34.

Esta decisão **não** afirma produção pronta nem conformidade completa com LGPD.

## 4. Regras (invariantes obrigatórias na implementação 3.33/3.34)

- **Sem delete físico.** Resolver = arquivar secundário (soft-delete). Restore
  desarquiva a linha.
- **Sem dado clínico.** Nenhum campo clínico entra (diagnóstico, prescrição, CID,
  exame, tratamento, motivo de consulta, prontuário). Merge opera só sobre campos
  **administrativos** já existentes.
- **Owner-only.** `requireRole(CLINIC_ADMIN_ROLES)` após `requireClinic`, igual a
  arquivar/restaurar. Secretaria/funcionário(a) **não** executa merge (pode editar
  registros, como hoje).
- **Transação obrigatória.** Reassign de appointments + fill-blanks + arquivar +
  `merged_into_id` ocorrem atômicos; falha → rollback total.
- **Mover appointments tenant-scoped.** O reassign filtra por `clinica_id`; jamais
  toca appointments de outra clínica. Sem unique constraint em
  `(patient, starts_at)` — sobreposição de horário após merge é possível e
  **aceitável** no MVP (a UI pode alertar; não bloqueia).
- **Arquivar secundário** ao fim do merge; o principal permanece `active`.
- **Fill-blanks não-destrutivo.** Só preenche campos **nulos** do principal. Com
  múltiplos secundários, ordem **determinística** (secundários por `criado_em` ASC;
  primeiro valor não-nulo vence cada campo vazio). Nunca sobrescreve valor existente.
- **Audit sem PII.** `patient.merge.success`, **uma linha por par** (principal,
  secundário), `recurso='patient'`, `recurso_id = "<primaryId>|<secondaryId>"`
  (cabe em `varchar(80)`). Nunca nome/CPF/e-mail/telefone/valores de campo.
- **CPF nunca bruto** no frontend, no log ou no audit. O "diff" da UI usa só
  `cpf_masked`. Como o operador não vê o CPF bruto, **CPF não é alvo de fill-blanks
  com escolha manual** — o fill-blanks copia o valor do banco apenas quando o
  principal não tem CPF (decisão automática e não-destrutiva).
- **Cross-tenant → 404/erro seguro.** Principal ou secundário de outra clínica
  (ou inexistente) → **404 genérico** `patient_not_found`, sem enumeração.
- **Idempotência.** CAS no status do secundário (`WHERE id AND clinica_id AND
  status='active'`); re-merge de já-arquivado → no-op/erro seguro, sem efeito duplo.
- **Sem undo completo** nesta fase (ver §5 e §7).

## 5. Migration mínima (decidida)

Aditiva, reversível, **sem** tabela de snapshot:

- `patients.merged_into_id uuid NULL REFERENCES patients(id)` — o secundário
  arquivado aponta para o principal.
- `patients.merged_at timestamptz NULL`.
- Índice **parcial** opcional: `WHERE merged_into_id IS NOT NULL` (consultas de
  proveniência só interessam às linhas mescladas).

**Por quê:** proveniência ("este arquivado foi unido a X"), permitir à UI mostrar
"merge em X", e habilitar um **undo futuro** — mantendo a invariante "sem delete
físico". **Não** altera `appointments` (reassign é só `UPDATE` de `patient_id`) nem
`audit_logs` (o par cabe em `recurso_id`).

**Limite explícito:** `merged_into_id` registra **para onde** foi, mas **não**
guarda os valores antigos do secundário nem a lista de appointments movidos. Logo
**não há** reversão automática completa nesta fase.

## 6. Endpoint sugerido (a confirmar detalhes na 3.33)

- `POST /patients/:id/merge` — `:id` = principal; body
  `{ secondary_ids: string[], fill_blanks?: boolean }`. Owner-only.
- **Múltiplos `secondary_ids` por chamada** (decisão final): resolve um grupo
  inteiro em **uma transação atômica** com fill-blanks determinístico (§4). É
  simples e seguro porque o fill-blanks nunca sobrescreve e o reassign é só
  `patient_id`; a atomicidade evita estados parciais. Se a implementação revelar
  complexidade inesperada, é aceitável **degradar para um secundário por chamada**
  sem mudar as demais regras — mas o alvo é o batch atômico.
- **Validações:** todos os ids tenant-scoped (principal + secundários no mesmo
  `clinica_id`); principal ∉ `secondary_ids` (400); principal `active`; secundários
  `active` (CAS); `secondary_ids` não vazio e dentro de um limite são (ex.: ≤ 50).
- **DAOs novos:** `appointmentDao.countByPatientForClinic`,
  `appointmentDao.reassignPatientForClinic`, `patientDao.setMergedInto`.
- **Service:** novo `patientMergeService` (ou método em `patientService`) com a
  transação, CAS e auditoria.

## 7. Consequências

**Positivas:**
- **Melhora a Agenda:** agendamentos consolidam no registro ativo (principal),
  acabando com o fallback de nome em duplicados arquivados.
- **Preserva histórico:** nada é deletado; o secundário vira arquivado com
  proveniência (`merged_into_id`).
- **Qualidade de dados sem risco:** fill-blanks não-destrutivo nunca apaga dado bom.
- Reusa auth/papéis/tenant/audit existentes; escopo administrativo fechado.

**Negativas / limites:**
- **Reversão completa ainda não existe.** `restore` desarquiva a linha, mas **não**
  devolve os appointments movidos nem reverte os campos preenchidos. Um undo real
  exige snapshot (tabela própria) — **fora desta fase**.
- Possível **sobreposição de horário** no principal após mover agendamentos
  (sem constraint anti-overlap); aceitável no MVP, com alerta opcional na UI.
- Mais superfície de escrita sobre `patients`/`appointments` para proteger e testar.

## 8. O que NÃO será feito agora (escopo negativo explícito)

- **Seleção campo-a-campo** (winner por campo escolhido pelo usuário) — só
  fill-blanks não-destrutivo nesta fase.
- **Merge clínico**, prontuário, diagnóstico, prescrição, **CID**, exame,
  tratamento, motivo de consulta — proibidos (Opção C / ADR 0001).
- **Delete físico** de paciente ou de agendamento — continua proibido.
- **Undo completo / snapshot** dos valores antigos e dos vínculos movidos — exige
  tabela própria e ADR/sprint futura.
- **Merge automático sem confirmação humana** — toda resolução passa por escolha
  explícita do dono + confirmação (modal). Sem heurística que mescla sozinha.
- **Reassign de outras entidades** além de `appointments` — não há outras hoje;
  se surgirem, exigem decisão própria.

## 9. Divisão de sprints

- **3.32 — ADR/docs (esta).** Decisão registrada; **sem** código, **sem**
  migration, **sem** frontend.
- **3.33 — Backend + migration + API.** Migration `merged_into_id`/`merged_at`;
  endpoint `POST /patients/:id/merge`; DAOs (`countByPatient`,
  `reassignPatient`, `setMergedInto`); service transacional com CAS; audit sem PII;
  matriz de testes por API (incluindo cross-tenant e idempotência).
- **3.34 — Frontend/UX + validação visual.** `DuplicatesList`: escolher principal,
  ver diffs mascarados, editar antes (reusa `PatientEditForm`), `ConfirmDialog`
  forte, contagem de agendamentos por registro; validação visual (Agenda mostra
  nome certo após mover; arquivado em Pacientes › Arquivados com "merge em X").
- *(opcional)* dividir 3.33 caso o backend cresça.

## 10. Plano de testes (resumo; detalhe na 3.33/3.34)

- **API:** merge move N appointments secundário→principal; secundário fica
  `archived` + `merged_into_id`/`merged_at`; `fill_blanks` só preenche vazios (não
  sobrescreve); re-merge idempotente (no-op/erro seguro); principal/secundário não
  `active` → erro seguro; **cross-tenant** (principal de A + secundário de B → 404;
  appointments de outra clínica intactos); audit `patient.merge.success` com par de
  UUIDs e sem PII; CPF nunca bruto.
- **SQL:** `appointments.patient_id` reassinado; contagem total preservada (nada
  deletado); `merged_into_id`/`merged_at` setados nos secundários.
- **Visual:** escolher principal, diffs mascarados, editar antes, `ConfirmDialog`,
  grupo sai da fila; **Agenda mostra o nome certo após o merge**; arquivado visível
  em Pacientes › Arquivados; secretaria não vê/não executa o merge.
- **Borda:** secundário sem appointments; principal e secundário com horário
  coincidente; restore do arquivado.

## 11. Relação com a estratégia Opção C

Coerente com a **Opção C**: é consolidação **administrativa** de cadastro, com a
fronteira administrativo/clínico **explícita**. Não abre domínio clínico; qualquer
campo/feature clínica continua exigindo **ADR clínica dedicada** (ADR 0001).

> Este ADR descreve **decisão e escopo**. Não afirma produção pronta nem
> conformidade completa; merge B-safe é administrativo e não substitui um sistema
> clínico.
