# ADR 0018 — Planos, Billing e Entitlements v0.1

> **Status:** Aceita (arquitetura) · **Gateway de pagamento: Proposto** — decisão
> final no spike da Sprint 5.1D.
>
> **Sprint:** 5.1A (docs/ADR-only)
>
> **Data:** 2026-05-28
>
> **Relacionado:**
> `docs/adr/0008-clinicbridge-clinic-os-expansion.md` ·
> `docs/adr/0009-clinical-architecture-roles-read-audit.md` ·
> `docs/adr/0012-financial-module-v0.md` (financeiro **da clínica** — não confundir) ·
> `docs/plans-billing-entitlements-v0-scope.md` (operacional desta ADR) ·
> `docs/product-clinic-os-roadmap.md` ·
> `docs/security-notes.md` · `docs/deploy-security-checklist.md`
>
> **O que esta ADR autoriza:** docs e planejamento da camada comercial (planos,
> assinatura por tenant, entitlements, abstração de gateway). **Nenhum código,
> schema, migration, endpoint, env, secret, SDK, checkout ou integração real foi
> criado nesta sprint.**

---

## 1. Contexto

O ClinicBridge entregou a base administrativa + módulos operacionais e clínicos
v0.1 (pacientes, agenda, financeiro da clínica, serviços, convênios, estoque,
relatórios, prontuário, documentos) e a experiência de demo guiada (Auri). A
landing pública já apresenta três planos **estáticos** (Essencial · Profissional ·
Piloto assistido) em `PricingPlans.tsx` — sem preço, sem checkout, sem backend.

A próxima fronteira estratégica é a **trilha de produção segura na AWS**. A decisão
do fundador é que, **quando a primeira implementação na AWS subir, o produto já
deve nascer vendável** — mesmo que o pagamento comece em sandbox/test mode ou em
rollout controlado. Para isso, a camada comercial (planos, assinatura,
entitlements, gateway) precisa estar **arquiteturalmente decidida e documentada
antes** de qualquer código de billing ou de qualquer corte de infraestrutura.

**Distinção crítica (não confundir dois "financeiros"):**

| Conceito | O que é | ADR |
|---|---|---|
| **Financeiro da clínica** (`financial_charges`) | A clínica cobra **seus pacientes** por consultas/serviços. Dado operacional do tenant. | ADR 0012 |
| **Billing do ClinicBridge** (esta ADR) | O ClinicBridge cobra **a clínica** pela assinatura do SaaS. Camada comercial do produto. | ADR 0018 |

Esta ADR trata **exclusivamente** do segundo. Nada aqui altera o módulo financeiro
da clínica (ADR 0012).

**Contexto comercial do fundador (insumo de decisão):**

- Stripe parece tecnicamente forte para SaaS/Billing, **mas** precisa de confirmação
  oficial sobre operação no Brasil (Pix, boleto, recorrência, CPF vs CNPJ, PF vs PJ).
- Experiência prévia **ruim** com Mercado Livre/Mercado Pago (muitas recusas) →
  **Mercado Pago não deve ser escolhido automaticamente.**
- Asaas é candidato a ser avaliado **com carinho** como principal, por ser
  Brasil-first (Pix/boleto/cartão/recorrência). A viabilidade **PF/MEI** deve ser
  confirmada oficialmente no spike 5.1D.
- Pagar.me como opção secundária — sem necessidade de decidir agora.

---

## 2. Decisão central

**A camada comercial do ClinicBridge é uma camada por clínica/tenant, separada das
roles operacionais, com entitlements calculados e validados no backend, atrás de
uma abstração de provider de pagamento.**

Decisões arquiteturais **aceitas** nesta ADR:

1. **Plano comercial é por clínica (tenant = `clinica_id`), não por usuário.** Uma
   clínica tem **uma** assinatura ativa. Todos os usuários daquela clínica herdam o
   plano da clínica.

2. **Roles operacionais ≠ planos comerciais ≠ entitlements.** São três camadas
   ortogonais (ver §3). `dono_clinica`, `secretaria`, `profissional_clinico`,
   `gestor_clinica`, `admin_sistema` continuam sendo **permissões internas** e
   **não** mudam de significado por causa do plano.

3. **Entitlements são a fonte de verdade de "o que este tenant pode fazer".** São
   **calculados e validados no backend** a partir do plano + estado da assinatura.
   O frontend pode esconder/desabilitar botões, mas **o backend sempre valida**.

4. **Provider de pagamento é abstraído** (interface `BillingProvider`) para permitir
   troca futura sem reescrever a lógica de assinatura/entitlement. Implementações:
   `MockProvider` (5.1B), depois o gateway escolhido no spike (5.1D).

5. **Soft-lock progressivo, nunca sequestro de dados.** Assinatura vencida →
   avisos → tolerância → bloqueio de **criação/ações novas** → mantém
   **leitura e exportação essencial** (portabilidade LGPD). **Nunca** apaga,
   esconde destrutivamente ou retém dados da clínica como refém.

6. **Nunca atualizar plano pelo retorno do frontend.** O estado da assinatura só
   muda por **webhook verificado** do provider (assinatura/signature conferida) ou
   por ação **manual auditada** do `admin_sistema` (piloto assistido).

7. **Não armazenar dados de cartão.** O ClinicBridge guarda apenas IDs externos,
   status e metadados mínimos. PAN/CVV/validade **nunca** tocam o nosso backend
   (responsabilidade do gateway/PCI).

8. **Billing não vaza PII clínica.** Para o provider vai apenas a **identidade de
   cobrança** da clínica (razão social/nome, e-mail de cobrança, CPF/CNPJ do
   responsável financeiro). **Nenhum dado de paciente** (nome, CPF de paciente,
   dado clínico) é enviado ao gateway, jamais.

9. **Webhooks idempotentes.** Todo evento de provider é registrado por
   `external_event_id` único; reprocessar o mesmo evento é no-op.

10. **Plano comercial nunca destrava módulo clínico que não esteja seguramente
    habilitado.** Entitlement clínico = `plano permite` **E** `gate clínico
    seguro atendido` (ADR 0009/0010/0011). O plano pode **restringir**, nunca
    **liberar** o que o gating clínico não liberou.

**Status do gateway:** **Proposto** — Asaas é o **candidato preferencial** para o
spike (ver §11/§12), mas a decisão final exige o spike comparativo da Sprint 5.1D
(Asaas vs. Stripe em sandbox). Esta ADR **não** crava o gateway.

---

## 3. Três camadas ortogonais (roles × planos × entitlements)

```
┌──────────────────────────────────────────────────────────────────┐
│ ROLE OPERACIONAL  (quem é o usuário dentro da clínica)             │
│  dono_clinica · secretaria · profissional_clinico ·               │
│  gestor_clinica · admin_sistema                                    │
│  → governa AUTORIZAÇÃO (requireRole / requireClinicalRole)         │
├──────────────────────────────────────────────────────────────────┤
│ PLANO COMERCIAL  (o que a clínica contratou)                       │
│  essencial · profissional · piloto_assistido                       │
│  → 1 por clínica/tenant; define o pacote de entitlements           │
├──────────────────────────────────────────────────────────────────┤
│ ENTITLEMENT  (o que este tenant pode fazer AGORA)                  │
│  módulos habilitados + limites numéricos                           │
│  = f(plano, estado da assinatura, gates clínicos)                  │
│  → calculado e validado no BACKEND                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Composição na prática:** uma ação é permitida quando **(a)** a role autoriza
**E (b)** o entitlement do tenant permite o módulo/limite **E (c)**, se for módulo
clínico, o gate clínico seguro está atendido. As três checagens são independentes —
nenhuma substitui a outra.

Exemplo: uma `secretaria` numa clínica do plano `essencial` tenta abrir Estoque.
A role autorizaria leitura, mas o **entitlement** `module.inventory` está `false`
no plano essencial → backend retorna 403 `feature_not_in_plan` (mensagem de
upgrade, não de erro). Nenhum dado é destruído.

---

## 4. Planos v0.1

**Preços são decisão comercial futura — TBD, fora do escopo desta ADR.** Os
pacotes abaixo são conceituais; a implementação (5.1B) define as chaves exatas.

### 4.1 Essencial — clínica pequena começando

- Módulos: pacientes, agenda, financeiro básico, serviços, relatórios simples.
- **Sem:** convênios, estoque (ou limitados — decisão de produto na 5.1B).
- Módulos clínicos (prontuário/documentos): conforme habilitação segura — **não**
  destravados só pelo plano.
- Limites **menores**: usuários, profissionais da agenda, importações/mês.

### 4.2 Profissional — plano principal

- Tudo do Essencial **+** convênios, estoque, relatórios completos.
- Módulos clínicos: conforme habilitação segura (ADR 0009/0010/0011).
- Limites **maiores**.

### 4.3 Piloto Assistido — venda manual/assistida

- Estado de assinatura próprio: `manual_pilot` (não self-service no início).
- Inclui migração/importação assistida, treinamento, acompanhamento.
- Pode **converter** para Profissional.
- Entitlements equivalentes ao Profissional (ou conjunto definido na venda),
  porém **sem** cobrança automática via gateway nesta fase — controlado por
  ação manual auditada do `admin_sistema`.

> **Limites numéricos exatos** (quantos usuários/profissionais/importações por
> plano) = decisão de produto na Sprint 5.1B. Esta ADR só fixa que **existem**
> limites e que são validados no backend.

---

## 5. Modelo conceitual (entidades)

Entidades **conceituais** — nenhum schema/migration existe até a 5.1B. Campos
orientativos; a implementação pode ajustar tamanhos/constraints sem nova ADR,
desde que os invariantes de segurança e tenant sejam mantidos. Tudo tenant-scoped
por `clinica_id`.

### 5.1 `clinic_subscription` — assinatura da clínica (1 por tenant)

```
id                    uuid        PK
clinica_id            uuid        NOT NULL FK clinics(id)  -- UNIQUE (1 ativa/tenant)
plan_code             text        NOT NULL  -- essencial | profissional | piloto_assistido
status                text        NOT NULL  -- ver §6
trial_ends_at         timestamptz NULL
current_period_start  timestamptz NULL
current_period_end    timestamptz NULL
grace_until           timestamptz NULL      -- fim da tolerância pós-past_due
canceled_at           timestamptz NULL
provider              text        NULL       -- asaas | stripe | manual | null(mock)
created_at            timestamptz NOT NULL
updated_at            timestamptz NOT NULL
```

### 5.2 `clinic_entitlement` — entitlements efetivos por tenant

Snapshot calculado a partir do plano + estado. Pode ser **derivado em runtime**
(função pura `computeEntitlements(subscription)`) e/ou materializado para
performance. Overrides pontuais (ex.: liberar um módulo para um piloto) ficam aqui.

```
id            uuid        PK
clinica_id    uuid        NOT NULL FK clinics(id)
feature_key   text        NOT NULL  -- module.inventory | limit.users | ...
enabled       boolean     NOT NULL
limit_value   integer     NULL       -- numérico quando aplicável (null = ilimitado/não-aplicável)
source        text        NOT NULL   -- plan | override | pilot
updated_at    timestamptz NOT NULL
UNIQUE (clinica_id, feature_key)
```

### 5.3 `billing_provider_customer` — mapa clínica ↔ cliente no provider

```
id                    uuid  PK
clinica_id            uuid  NOT NULL FK clinics(id)
provider              text  NOT NULL  -- asaas | stripe | ...
external_customer_id  text  NOT NULL
created_at            timestamptz NOT NULL
UNIQUE (provider, external_customer_id)
UNIQUE (clinica_id, provider)
```

### 5.4 `billing_provider_subscription` — mapa assinatura ↔ assinatura no provider

```
id                        uuid  PK
clinica_id                uuid  NOT NULL FK clinics(id)
subscription_id           uuid  NOT NULL FK clinic_subscription(id)
provider                  text  NOT NULL
external_subscription_id  text  NOT NULL
external_status_raw       text  NULL    -- string crua do provider (diagnóstico)
last_synced_at            timestamptz NULL
UNIQUE (provider, external_subscription_id)
```

### 5.5 `billing_event` / `webhook_event` — log idempotente de eventos

```
id                 uuid        PK
provider           text        NOT NULL
external_event_id  text        NOT NULL   -- id do evento no provider
event_type         text        NOT NULL   -- subscription.activated | payment.overdue | ...
clinica_id         uuid        NULL        -- resolvido via mapa interno (nunca confiando no payload)
status             text        NOT NULL    -- received | processed | ignored | failed
payload_hash       text        NULL        -- hash do payload (NÃO o payload com PII)
received_at        timestamptz NOT NULL
processed_at       timestamptz NULL
UNIQUE (provider, external_event_id)        -- chave de idempotência
```

> **Não existe tabela de cartão.** Nenhum PAN/CVV/validade é modelado. O provider
> é o responsável PCI.

---

## 6. Estados da assinatura

```
                ┌──────────┐
   (novo)──────▶│ trialing │
                └────┬─────┘
                     │ pagamento confirmado (webhook)
                     ▼
                ┌──────────┐   pagamento falha/vence    ┌──────────┐
                │  active  │───────────────────────────▶│ past_due │
                └────┬─────┘◀──────────────────────────┐└────┬─────┘
                     │            pagamento ok (webhook)│     │ fim da tolerância
                     │ cancelamento                     │     ▼
                     ▼                                  │┌───────────┐
                ┌──────────┐                            ││ suspended │
                │ canceled │◀───────────────────────────┘└─────┬─────┘
                └──────────┘   cancelamento definitivo         │ pagamento ok
                                                                └─▶ active

   manual_pilot ──(conversão)──▶ active   (piloto assistido vira Profissional)
```

| Estado | Acesso | Origem |
|---|---|---|
| `trialing` | Acesso completo do plano. Banner de trial. | Cadastro/início do trial |
| `active` | Acesso completo do plano. | Webhook de pagamento confirmado |
| `past_due` | Acesso completo **+ avisos**; dentro da tolerância (`grace_until`). | Webhook de falha/vencimento |
| `suspended` | **Soft-lock** (§7): só leitura + export essencial; sem ações novas. | Fim da tolerância sem pagamento |
| `canceled` | Leitura + export essencial por janela de retenção; sem ações novas. | Cancelamento (clínica ou definitivo) |
| `manual_pilot` | Acesso conforme venda; cobrança manual auditada; sem gateway automático. | Venda assistida (`admin_sistema`) |

---

## 7. Soft-lock progressivo (nunca sequestrar dados)

**Princípio:** vencer a assinatura é um problema comercial, não uma punição de
dados. A clínica **sempre** consegue ler e exportar o que é dela.

Sequência:

1. **`active` → `past_due`:** mostra avisos (banner não-bloqueante). **Acesso
   completo continua** durante a tolerância (`grace_until`). Duração da tolerância
   = **TBD comercial** (ex.: 7–14 dias — *a definir com o fundador*, não inventado
   aqui).
2. **Fim da tolerância → `suspended`:** o backend passa a **bloquear criação e
   ações de escrita novas** (criar paciente, criar cobrança, criar agendamento,
   registrar movimento de estoque, etc.) com 403 `subscription_suspended`
   (mensagem de regularização, não de erro).
3. **Mantido mesmo suspenso:** **leitura** dos dados existentes e **exportação
   essencial** (CSV/XLSX de pacientes/financeiro) — portabilidade LGPD. Login e
   visualização continuam.
4. **`canceled`:** leitura + export essencial por uma **janela de retenção** (TBD,
   alinhada à política de retenção `docs/data-retention-policy.md`); depois,
   arquivamento conforme retenção — **nunca delete destrutivo imediato como
   "punição"**.

**Invariante:** nenhum estado de billing apaga, oculta destrutivamente ou impede a
exportação dos dados da clínica. Sem "data hostage".

---

## 8. Segurança

- **Sem dado de cartão no ClinicBridge.** Só IDs externos, status e metadados mínimos.
- **Plano só muda por evento verificado:** webhook com assinatura/signature do
  provider conferida, **ou** ação manual auditada do `admin_sistema`. **Nunca**
  pelo retorno do checkout no frontend (o frontend pode apenas redirecionar e
  mostrar "processando").
- **Webhooks:**
  - Endpoint dedicado, público via HTTPS (só viável em produção — §10).
  - **Verificação de assinatura obrigatória** antes de qualquer processamento.
    Evento sem assinatura válida → descartado + audit `billing.webhook.rejected`.
  - **Idempotência** por `external_event_id` único (§5.5): reprocessar = no-op.
  - `clinica_id` **sempre resolvido pelo mapa interno** (§5.3/§5.4) a partir do
    customer/subscription id — **nunca** confiando num `clinica_id` que viesse no
    payload (anti-tenant-spoofing).
  - Rate limit no endpoint de webhook (IP-keyed, como o resto).
- **Entitlement no backend é a defesa real.** Middleware conceitual
  `requireEntitlement(featureKey)` + checagem de limite nos services. Frontend
  esconde/desabilita por UX, nunca como segurança.
- **errorHandler** mantém invariante: sem stack/SQL/path; 403 de billing usam
  códigos genéricos (`feature_not_in_plan`, `subscription_suspended`,
  `limit_reached`).

---

## 9. LGPD

- **Minimização para o provider:** envia-se apenas a identidade de cobrança
  necessária (nome/razão social da clínica, e-mail de cobrança, CPF/CNPJ do
  responsável financeiro). **Nenhum dado de paciente** (nome, CPF, telefone, dado
  clínico) é compartilhado com o gateway.
- **Base legal:** execução de contrato (relação comercial clínica ↔ ClinicBridge).
  O CPF/CNPJ do responsável é dado do **cliente do SaaS**, não do paciente.
- **Audit metadata-only:** eventos de billing entram no `audit_logs` existente
  (schema real: `acao/recurso/recurso_id/usuario_id/clinica_id/ip/user_agent/
  request_id/criado_em` — **sem** coluna `metadata`). Eventos conceituais:
  `billing.subscription.activated`, `billing.subscription.past_due`,
  `billing.subscription.suspended`, `billing.subscription.canceled`,
  `billing.webhook.received`, `billing.webhook.rejected`,
  `billing.pilot.granted`. `recurso_id` = id da assinatura/evento. **Sem** valor
  monetário, **sem** PII, **sem** payload no audit.
- **Logger** redige qualquer credencial/segredo de provider (chaves de API,
  signing secret) — entram na lista de redação junto com `authorization/cookie/
  token` (5.1B).
- **Retenção** de `billing_event` alinhada à política de retenção; payload cru não
  é guardado (só `payload_hash` + metadados).

---

## 10. Tenant isolation

- `clinic_subscription`, `clinic_entitlement` e os mapas de provider são **sempre**
  keyed por `clinica_id`.
- Toda leitura/escrita de billing passa por `requireAuth + requireClinic` (exceto o
  endpoint de webhook, que é autenticado pela **assinatura do provider**, não por
  JWT, e resolve o tenant pelo mapa interno).
- **Webhook nunca confia em `clinica_id` do payload** — resolve via
  `billing_provider_customer` / `billing_provider_subscription` (§5). Um payload
  forjado apontando para outro tenant não tem efeito (o mapa interno é a verdade).
- Gestão de planos por `admin_sistema` (piloto) é auditada e tenant-explícita.

---

## 11. Comparativo de gateways

> **AVISO DE RESPONSABILIDADE:** taxas, exigências de CPF vs CNPJ, disponibilidade
> de Pix recorrente e condições atuais de operação no Brasil **mudam com
> frequência e não estão cravados aqui**. Todas as células marcadas
> **[VERIFICAR]** exigem **confirmação oficial na documentação do provider antes
> da implementação** (spike 5.1D). As demais são avaliação técnica de
> adequação, não promessa de fato.

| Critério | Asaas | Stripe Billing | Mercado Pago | Pagar.me |
|---|---|---|---|---|
| Assinatura/recorrência | Sim (cobrança recorrente nativa) | Sim (Stripe Billing, forte) | Sim (preapproval/assinaturas) | Sim (assinaturas) |
| Pix | Sim | Sim (Pix como método BR) **[VERIFICAR cobertura atual]** | Sim | Sim |
| **Pix recorrente** | **[VERIFICAR]** (Pix automático/recorrente) | **[VERIFICAR]** | **[VERIFICAR]** | **[VERIFICAR]** |
| Boleto | Sim | **[VERIFICAR]** (boleto + recorrência) | Sim | Sim |
| Cartão | Sim | Sim | Sim | Sim |
| Cartão com retentativas (dunning) | **[VERIFICAR]** | Sim (Smart Retries) | **[VERIFICAR]** | **[VERIFICAR]** |
| Checkout hospedado | Sim (payment links/checkout) | Sim (Checkout/Payment Links) | Sim | **[VERIFICAR]** |
| Portal do cliente | **[VERIFICAR]** | Sim (Customer Portal) | **[VERIFICAR]** | **[VERIFICAR]** |
| Webhooks | Sim | Sim | Sim (IPN/webhooks) | Sim |
| Verificação de assinatura de webhook | **[VERIFICAR]** (mecanismo/token) | Sim (signing secret) | **[VERIFICAR]** | **[VERIFICAR]** |
| Idempotência (API) | **[VERIFICAR]** | Sim (idempotency keys) | **[VERIFICAR]** | **[VERIFICAR]** |
| Sandbox/test mode | Sim (sandbox) | Sim (test mode) | Sim | Sim |
| **CPF vs CNPJ / PF vs PJ** | **[VERIFICAR]** — reputação de aceitar PF/MEI (apelo principal) | **[VERIFICAR]** — historicamente exige PJ/CNPJ no BR | **[VERIFICAR]** | **[VERIFICAR]** |
| Taxas/repasses | **[VERIFICAR]** | **[VERIFICAR]** | **[VERIFICAR]** | **[VERIFICAR]** |
| Risco de recusa/antifraude | **[VERIFICAR]** | **[VERIFICAR]** | ⚠️ **experiência prévia ruim do fundador** | **[VERIFICAR]** |
| Adequação SaaS (billing) | Boa (Brasil-first) | **Excelente** (referência global) | Média | Boa |
| Adequação clínica pequena BR | **Forte** (Brasil-first, PF/Pix/boleto) | **[VERIFICAR operação BR/PF]** | Média (recusas) | Boa |
| Complexidade técnica | Baixa–média | Média | Média | Média |
| Risco de lock-in | Mitigado pela abstração (§2.4) | Mitigado pela abstração | Mitigado | Mitigado |
| Qualidade da documentação | Boa (PT-BR) | **Excelente** | Média | Boa |

**Leitura responsável da tabela:**

- **Asaas:** melhor encaixe aparente para clínica pequena brasileira (Brasil-first,
  Pix/boleto/cartão/recorrência, reputação de aceitar PF). Pontos a confirmar:
  verificação de assinatura de webhook, idempotência da API, portal do cliente,
  Pix recorrente, taxas.
- **Stripe:** tecnicamente o mais forte para SaaS/Billing (portal, dunning,
  idempotência, docs). **Bloqueador a confirmar:** operação no Brasil para
  **pessoa física / CPF**, cobertura de Pix/boleto e recorrência via Pix. Se exigir
  CNPJ, pode não servir ao fundador no curto prazo.
- **Mercado Pago:** mantido como candidato **com ressalva explícita** — experiência
  prévia ruim do fundador (recusas/antifraude). **Não** escolher automaticamente.
- **Pagar.me:** opção secundária; não precisa decidir agora.

---

## 12. Critérios para escolher o gateway no spike (5.1D)

O spike 5.1D deve, **em sandbox/test mode**, validar para Asaas (e, em paralelo,
Stripe):

1. Criar cliente + assinatura recorrente programaticamente.
2. Receber e **verificar a assinatura** de um webhook de pagamento.
3. Provar **idempotência** (reenviar o mesmo evento → no-op).
4. Confirmar **CPF vs CNPJ / PF vs PJ** para operar e receber (bloqueador real).
5. Confirmar **Pix + boleto + cartão** e, se existir, **Pix recorrente**.
6. Confirmar **retentativa de cartão** (dunning) e **portal/checkout hospedado**.
7. Levantar **taxas/repasses** reais (fonte oficial).
8. Avaliar **antifraude/recusa** no contexto de cobrança recorrente B2B.

**Tendência de decisão (responsável, sem inventar fato):**
**Asaas é o candidato preferencial** para o spike, por ser Brasil-first e por
aceitar (reputação a confirmar) pessoa física — o que destrava o fundador mais
cedo. **Stripe entra no mesmo spike como comparação obrigatória** caso a operação
BR/PF/Pix recorrente se confirme viável. A escolha final é registrada num
**adendo a esta ADR** ao fim da 5.1D.

---

## 13. Abstração de provider (anti-lock-in)

Interface conceitual `BillingProvider` (implementação na 5.1B/5.1D):

```
createCustomer(clinicBillingIdentity) -> externalCustomerId
createSubscription(externalCustomerId, planCode) -> externalSubscriptionId + checkoutUrl?
cancelSubscription(externalSubscriptionId) -> void
getSubscription(externalSubscriptionId) -> providerStatus
verifyWebhookSignature(rawBody, headers) -> boolean
parseWebhookEvent(rawBody) -> { externalEventId, type, externalCustomerId?, externalSubscriptionId? }
getCustomerPortalUrl(externalCustomerId)? -> url   // se o provider oferecer
```

- **`MockProvider`** (5.1B): implementa a interface sem rede; permite construir e
  testar toda a lógica de assinatura/entitlement/soft-lock **sem gateway real**.
- A **lógica de negócio** (estados, entitlements, soft-lock, idempotência) vive no
  ClinicBridge, **não** no provider — trocar de gateway troca só o adapter.

---

## 14. Fora de escopo (v0.1)

- **Qualquer código, schema, migration, endpoint, env, secret, SDK** (esta sprint é
  docs/ADR-only).
- **Preços fixos** — decisão comercial futura.
- **Cobrança real / dinheiro real** — só após produção segura (ADR 5.2A) e spike.
- **Faturas/NF-e do SaaS** (emissão fiscal da assinatura) — ADR própria futura.
- **Cupons, descontos, trials por cartão, upgrade/downgrade com proration
  complexo** — podem entrar em v0.2 com demanda real.
- **Multi-moeda / mercados fora do Brasil.**
- **Cobrança por uso (usage-based/metered)** — v0.1 é por assinatura de plano fixo.
- **Marketplace/split de pagamento** entre clínicas.
- **Armazenamento de cartão / cofre de cartão** (sempre no gateway).
- **Mudar o módulo financeiro da clínica (ADR 0012)** — intocado.

---

## 15. Roadmap de implementação

| Sprint | Escopo | Gateway real? |
|---|---|---|
| **5.1A** ✅ (esta) | ADR + escopo operacional (docs-only) | Não |
| **5.1B** | Backend foundation: migration (entidades §5) + DAOs + services + `MockProvider` + middleware `requireEntitlement` + estados/soft-lock + audit. **Sem gateway real.** | Mock |
| **5.1C** | Frontend: tela de plano/assinatura, estado da assinatura, avisos de past_due/suspended, limites na UI (esconder/desabilitar). Backend continua a defesa. | Mock |
| **5.1D** | **Spike/integração sandbox**: Asaas (preferencial) vs. Stripe — validar §12. Adendo à ADR com a escolha. | Sandbox |
| **5.1E** | QA/security billing hardening: idempotência, verificação de assinatura, tenant isolation de webhook, soft-lock, sem PII/cartão, greps de segurança. | Sandbox |
| **5.2A** | **ADR Produção Segura AWS** (renumerada de 5.1A): S3, RDS, WAF, HTTPS, secrets manager, webhooks públicos. Habilita cobrança real em rollout controlado. | — |

> A cobrança **real** (dinheiro) só é ligada depois de 5.2A (produção segura com
> HTTPS público para webhooks + secrets manager) **e** de uma **validação
> jurídica/contábil mínima** + **termos/política comercial** definidos + **go/no-go
> comercial**. Até lá, tudo roda em mock (5.1B/C) e sandbox (5.1D/E).

---

## 16. Riscos

| Risco | Mitigação |
|---|---|
| Escolher gateway errado (recusa/antifraude, exige CNPJ) | Spike 5.1D obrigatório + abstração de provider (troca barata) |
| Plano atualizado por checkout forjado no frontend | Só webhook verificado ou ação manual auditada muda estado (§2.6/§8) |
| Webhook duplicado causa cobrança/estado dobrado | Idempotência por `external_event_id` único (§5.5/§8) |
| Tenant spoofing via payload de webhook | `clinica_id` resolvido pelo mapa interno, nunca pelo payload (§10) |
| Vazar PII de paciente para o gateway | Só identidade de cobrança da clínica vai ao provider (§9) |
| Vazar dado de cartão | Nunca armazenado; responsabilidade PCI do gateway (§2.7) |
| "Sequestro" de dados ao vencer | Soft-lock progressivo mantém leitura/export (§7) |
| Lock-in no provider | Lógica no ClinicBridge + adapter fino (§13) |
| Confundir billing do SaaS com financeiro da clínica | Distinção explícita §1; ADR 0012 intocada |
| Over-engineering de billing | v0.1 mínimo: 1 assinatura/tenant, 3 planos, sem proration/cupom |

---

## 17. Referências

- ADR 0008 — `docs/adr/0008-clinicbridge-clinic-os-expansion.md`
- ADR 0009 — `docs/adr/0009-clinical-architecture-roles-read-audit.md` (gates clínicos)
- ADR 0012 — `docs/adr/0012-financial-module-v0.md` (financeiro **da clínica**)
- Operacional desta ADR — `docs/plans-billing-entitlements-v0-scope.md`
- Roadmap Clinic OS — `docs/product-clinic-os-roadmap.md`
- Notas de segurança — `docs/security-notes.md`
- Checklist de deploy — `docs/deploy-security-checklist.md`
- Plano de produção mínima — `docs/production-minimum-plan.md`
