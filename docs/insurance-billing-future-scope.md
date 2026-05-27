# ClinicBridge — Convênios e Faturamento Básico (pré-planejamento)

> **⚠️ Documento histórico — pré-planejamento supersedido.**
>
> Este documento foi criado na Sprint 4.4D-conv (2026-05-27) como rascunho
> conceitual antes da ADR de convênios. Foi usado como insumo para a ADR 0016.
>
> **A fonte de verdade atual para Convênios v0.1 é:**
>
> - `docs/adr/0016-insurance-billing-v0.md` (ADR 0016, aceita 2026-05-27)
> - `docs/insurance-billing-v0-scope.md` (escopo operacional da Sprint 4.7)
>
> Em caso de conflito entre este documento e a ADR 0016, seguir a ADR 0016.
>
> ---
>
> **Após a Sprint 4.6A (2026-05-27):**
>
> - **Catálogo de Serviços v0.1** → decidido na **ADR 0015**
>   (`docs/adr/0015-services-catalog-commercial-layer-v0.md`) +
>   escopo operacional em `docs/services-catalog-v0-scope.md`.
>   Implementação: Fase 4.6 (sprints 4.6B/C/D) — entregue ✅.
>
> - **Convênios manual básico v0.1** → decidido na **ADR 0016** (Sprint 4.7A ✅).
>   Este documento serviu de insumo para a ADR 0016 — não a substitui.
>
> **O conteúdo abaixo é histórico e de referência.** Para o planejamento
> executável e atualizado, ver os documentos acima.
>
> **Relacionado:** `docs/financial-v0-scope.md` · `docs/adr/0012-financial-module-v0.md` ·
> `docs/adr/0015-services-catalog-commercial-layer-v0.md` ·
> `docs/services-catalog-v0-scope.md` ·
> `docs/product-clinic-os-roadmap.md` · `docs/security-notes.md`.

---

## 1. Situação atual (Financeiro v0.1)

O Financeiro v0.1 (Sprints 4.4A–4.4D) é **100% manual e particular**:

- Cobrança criada manualmente pela secretaria/dono.
- Ciclo de vida: `pending → paid | canceled`.
- Forma de pagamento registrada na mão: dinheiro, pix, cartão, transferência.
- Sem convênio, sem autorização, sem glosa, sem lote, sem TISS/TUSS.

A tabela `patients` já guarda dois campos de texto livre herdados do cadastro:
- `convenio` — nome livre do convênio (ex.: "Unimed", "Bradesco Saúde")
- `numero_carteirinha` — número do beneficiário (sem validação)

Esses campos são **texto administrativo não-estruturado** — não são entidades.
O merge B-safe (ADR 0007) faz fill-blanks nesses campos (só preenche vazios).

---

## 2. O que o Financeiro v0.1 cobre e o que não cobre

### Cobre (v0.1 — hoje)

| Funcionalidade | Status |
|---|---|
| Cobrança particular manual | ✅ v0.1 |
| Ciclo pending → paid / canceled | ✅ v0.1 |
| Formas de pagamento allowlist | ✅ v0.1 |
| Totalizadores (em aberto / vencido / recebido) | ✅ v0.1 |
| Observações administrativas (sem dado clínico) | ✅ v0.1 |
| Vínculo opcional com agendamento (`appointment_id`) | ✅ v0.1 |
| Cobrança por convênio | ❌ futuro |
| Cobrança mista particular + convênio | ❌ futuro |
| Cadastro de convênios | ❌ futuro |
| Carteirinha estruturada por paciente | ❌ futuro |
| Autorização de convênio | ❌ futuro |
| Glosa | ❌ futuro |
| Repasse / recebimento do convênio | ❌ futuro |
| TISS/TUSS real | ❌ fase futura (pós-4.6 estabilizado) |
| Integração com operadoras | ❌ fase futura |
| Lote de faturamento | ❌ fase futura |
| NFS-e | ❌ fora de escopo MVP |

---

## 3. Entidades conceituais futuras (Convênio Manual Básico v0.1)

> Rascunho conceitual para orientar a ADR 0014. Nada aqui está em código.

### 3.1 `insurance_providers` — cadastro de operadoras da clínica

```
id              uuid PK
clinica_id      uuid FK clinics — tenant isolation obrigatório
name            text NOT NULL   — "Unimed Centro-Oeste", "Bradesco Saúde", etc.
active          boolean DEFAULT true
notes           text NULL       — observações administrativas; sem dado clínico
created_at      timestamptz
updated_at      timestamptz
```

**Regras:**
- Escopo `clinica_id` — cada clínica cadastra os convênios que aceita.
- Soft-delete via `active = false` (sem delete físico).
- Sem TISS/TUSS, sem ANS code, sem contrato eletrônico no v0.1.

---

### 3.2 `patient_insurance_plans` — plano do paciente

```
id                    uuid PK
clinica_id            uuid FK clinics  — tenant isolation
patient_id            uuid FK patients
provider_id           uuid FK insurance_providers
plan_name             text NULL       — "Unipart Flex", "Nacional Flex", etc.
member_number         text NULL       — número do beneficiário/carteirinha
valid_until           date NULL       — validade da carteirinha
holder_name           text NULL       — nome do titular (se dependente)
notes                 text NULL       — observações administrativas
created_at            timestamptz
updated_at            timestamptz
```

**Regras:**
- Um paciente pode ter múltiplos planos (ex.: Unimed + Bradesco).
- `member_number` é dado pessoal sensível operacionalmente — sujeito a logs
  redaction (não em logs/audit).
- `valid_until` gera alerta de "Carteirinha vencida" na UX futura.
- Esta tabela normaliza o atual `patients.convenio` + `patients.numero_carteirinha`
  (texto livre). A migration da 4.6 pode importar esses campos.
- Sem ICP-Brasil, sem assinatura, sem validação ANS de carteirinha no v0.1.

---

### 3.3 `insurance_authorizations` — autorização de procedimento

```
id                  uuid PK
clinica_id          uuid FK clinics  — tenant isolation
appointment_id      uuid FK scheduling NULL
patient_id          uuid FK patients
provider_id         uuid FK insurance_providers
plan_id             uuid FK patient_insurance_plans NULL
authorization_number text NULL       — número emitido pela operadora
status              text            — pending | authorized | denied | expired
valid_until         date NULL
notes               text NULL
requested_at        timestamptz
decided_at          timestamptz NULL
created_by_user_id  uuid FK users
created_at          timestamptz
updated_at          timestamptz
```

**Regras:**
- Autorização **não confirma consulta automaticamente** — humano decide.
- `status='denied'` não cancela o agendamento; é um alerta.
- Sem integração eletrônica com operadora no v0.1 — número inserido manualmente.
- Soft-delete implícito via `status='expired'`.

---

### 3.4 Extensão futura de `financial_charges`

Campos a adicionar na ADR 0014 / migration futura:

```
payer_type              text NULL    — 'private' | 'insurance' | 'mixed'
insurance_provider_id   uuid NULL    FK insurance_providers ON DELETE SET NULL
patient_plan_id         uuid NULL    FK patient_insurance_plans ON DELETE SET NULL
authorization_id        uuid NULL    FK insurance_authorizations ON DELETE SET NULL
copay_amount_cents      integer NULL — parte do paciente (coparticipação)
insurance_amount_cents  integer NULL — parte do convênio
```

**Regras:**
- `amount_cents` permanece como valor total da cobrança.
- `copay_amount_cents + insurance_amount_cents` devem somar `amount_cents`
  (CHECK futuro).
- Pagamento do paciente e recebimento do convênio são **dois fluxos distintos**.
- Status `paid` no v0.1 significa "o ciclo desta cobrança foi encerrado manualmente".
  No v0.2, poderá haver estados separados: `patient_paid` / `insurance_received` /
  `partially_received` — **escopo da ADR 0014, não agora**.
- Glosa não apaga cobrança — cria um evento/nota ligado a ela.

---

## 4. Regras de negócio consolidadas

| Regra | Versão |
|---|---|
| Uma consulta pode ser particular, convênio ou mista | v0.2 (ADR 0014) |
| Pagamento do paciente ≠ recebimento do convênio | v0.2 |
| Status financeiro da consulta não depende só do pagamento do paciente | v0.2 |
| Autorização do convênio não confirma consulta automaticamente | invariante |
| Glosa não apaga cobrança — é evento/nota separado | invariante |
| Humano decide em v0.1 e v0.2 — sem automação agressiva | invariante |
| Sem TISS/TUSS, sem integração eletrônica com operadora | até fase futura |
| `notes` nunca contém diagnóstico, CID ou dado clínico | invariante |

---

## 5. Segurança e LGPD

### 5.1 Classificação de dados

| Dado | Classificação | Tratamento |
|---|---|---|
| Nome do convênio | Dado pessoal operacional | OK em UI; nunca em logs |
| Número da carteirinha | Dado pessoal sensível operacional | Redação em logs; nunca bruto em audit |
| Número de autorização | Dado operacional | OK em UI; sem exposição cross-tenant |
| `holder_name` (titular) | Dado pessoal | Redação em logs |
| `notes` dos planos | Texto livre | Jamais dado clínico; aviso na UI |

### 5.2 Invariantes de segurança (aplicáveis desde hoje)

- **Tenant isolation por `clinica_id`** em todas as tabelas futuras — sem exceção.
- **Cross-tenant → 404 genérico** (anti-enumeração) — mesmo padrão do restante.
- **Sem delete físico** — soft-delete em tudo.
- **Redação de logs:** `member_number`, `holder_name`, `authorization_number`
  devem entrar no `logger.ts` redaction quando implementados.
- **`notes` administrativas nunca contêm dado clínico** — aviso na UI.
  Diagnóstico, CID, queixa, prescrição → pertencem ao prontuário (ADR 0010).
- **Audit de escrita** em toda transição de status relevante.
- **Sem audit de leitura dedicado no v0.2** — financeiro é administrativo, não
  clínico (mesmo postura da ADR 0012 §6.2).
- **LGPD:** `patient_insurance_plans` contém dados pessoais; titular tem direito
  de acesso (art. 18). O export de pacientes existente deverá incluir planos
  quando o módulo existir.

### 5.3 O que não entra em `notes` de cobrança financeira

> Aviso explícito para usuários — a ser exibido na UI (como no Financeiro v0.1 hoje).

Não incluir em observações financeiras:
- Diagnóstico ou hipótese diagnóstica
- CID (Código Internacional de Doenças)
- Queixa clínica do paciente
- Resultado de exame
- Nome de medicamento ou prescrição
- Conteúdo de evolução clínica

Esses dados pertencem ao prontuário clínico (ADR 0010).

---

## 6. UX futura

### 6.1 No cadastro do paciente

- Seção **"Convênios do paciente"**: lista os planos ativos; permite adicionar/editar/
  desativar; exibe alerta se `valid_until` < hoje + 30 dias.

### 6.2 No agendamento

- Campo **"Forma de atendimento"** (select):
  - Particular
  - Convênio (select do convênio do paciente)
  - Particular + Convênio / Coparticipação
- Badge visual na agenda: **"Convênio"** / **"Particular"** / **"Copart."**

### 6.3 No Financeiro

- Coluna "Pagador" na listagem: Particular / Convênio / Misto
- Totalizadores separados: "A receber do paciente" + "A receber do convênio"
- Detalhe da cobrança: split copay × insurance com status independentes

### 6.4 Alertas sugestivos (não automáticos)

| Alerta | Gatilho | Ação humana |
|---|---|---|
| Autorização pendente | agendamento com convênio sem `authorization_number` | Secretaria insere manualmente |
| Carteirinha vencida | `valid_until` < hoje | Secretaria solicita atualização |
| Pagamento do paciente pendente | `copay_amount_cents > 0` sem `patient_paid_at` | Secretaria registra recebimento |
| Recebimento do convênio pendente | `insurance_amount_cents > 0` sem `insurance_received_at` | Secretaria registra recebimento |

---

## 7. Roadmap sugerido para Convênios

| Sprint | Escopo | Natureza | Gate |
|---|---|---|---|
| **4.4E** | Integração Agenda × Financeiro (badge + alertas + botão criar cobrança) | Operacional | ADR adendo à 0012 |
| **4.5** | Relatórios gerenciais v0.1 | Operacional | ADR 0013 |
| **4.6A** | ADR 0014 — Convênios/faturamento básico v0.1 | Docs/ADR-only | ADR 0014 aceita |
| **4.6B** | Backend convênios manual básico (`insurance_providers` + `patient_insurance_plans` + alertas) | Implementação | 4.6A entregue |
| **4.6C** | Frontend convênios manual básico (seção paciente + badge agenda + split financeiro) | Implementação | 4.6B entregue |
| **4.6D** | QA/hardening convênios | QA | 4.6C entregue |
| **Fase futura** | `insurance_authorizations` + split copay × convênio em `financial_charges` | Módulo | 4.6D estabilizado |
| **Fase futura** | TISS/TUSS real, integração eletrônica com operadoras | Regulatório | ADR própria + análise jurídica |

**Observações:**
- 4.4E **não vira módulo de convênios** — foco em badge financeiro + fluxo básico
  consulta→cobrança com os dados que já existem (particular).
- Convênios entram pela trilha 4.6, não na 4.4 nem na 4.5.
- TISS/TUSS real exige certificação ANS, homologação por operadora e contrato
  jurídico com a operadora — **nunca sem ADR própria + análise jurídica**.

---

## 8. Fora do escopo de qualquer v0.x do ClinicBridge

Os itens abaixo exigem ADR separada, análise regulatória/jurídica e, na maioria
dos casos, parceria ou certificação com entidades externas:

- **Integração eletrônica com operadoras** (TISS XML/SOAP; webservice ANS)
- **Certificação ANS** para envio de guias eletrônicas
- **Lote de faturamento** e reconciliação automática de glosa
- **Autorização prévia eletrônica** (ePrior, operadora-a-operadora)
- **NFS-e** (nota fiscal de serviço eletrônica — depende do município)
- **Repasse automático** ao médico/convênio
- **SNGPC / ANVISA** (medicamentos controlados — ligado ao Estoque, não ao Financeiro)
- **ICP-Brasil com força legal** para documentos do convênio
- **Gateway de pagamento** (Pix automático, débito automático, cobrança recorrente)

---

## 9. Impacto nos módulos existentes

### 9.1 Financeiro v0.1 — sem mudança imediata

- `financial_charges` permanece inalterado até a ADR 0014.
- `payer_type`, `insurance_provider_id`, etc. **não entram agora**.
- O campo `notes` continua com o aviso de "não inclua dado clínico".

### 9.2 Pacientes — migração futura

- Quando `patient_insurance_plans` for implementado, a migration da 4.6 pode
  importar `patients.convenio` + `patients.numero_carteirinha` para a nova tabela.
- Os campos originais devem ser mantidos na tabela `patients` por compatibilidade
  retroativa durante a transição (não remover sem ADR).

### 9.3 Merge B-safe (ADR 0007)

- Na 4.6, o merge deverá considerar transferência de `patient_insurance_plans`
  do secundário para o principal (mesmo padrão do reassign de agendamentos).
- Regra: **merge não apaga planos** — agrega ao principal (fill-blanks ou union).
- Decisão final fica para a ADR 0014.

### 9.4 Agenda administrativa

- Na 4.6C, o seletor de agendamento pode ganhar campo "Forma de atendimento"
  usando os convênios do paciente já cadastrados.
- Badge "Convênio" / "Particular" pode ser antecipado na 4.4E como placeholder
  estático (sem lógica de convênio) para não bloquear a sprint.
