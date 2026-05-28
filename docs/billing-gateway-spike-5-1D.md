# Spike 5.1D — Gateway de billing: Asaas vs Stripe

> **Tipo:** research/spike (docs-only). **Data:** 2026-05-28.
> **NÃO é integração real.** Nenhum gateway foi ligado, nenhum secret criado,
> nenhum checkout/webhook real montado, nenhuma cobrança disparada.
> **Fonte autoritativa de arquitetura:** `docs/adr/0018-plans-billing-entitlements-v0.md`
> (esta sprint NÃO altera a ADR; a decisão final entra como **adendo à ADR 0018**
> depois da validação em sandbox).
> **Operacional:** `docs/plans-billing-entitlements-v0-scope.md`.

---

## 0. Aviso de responsabilidade

Taxas, exigências de CPF/CNPJ, disponibilidade de Pix recorrente e condições de
operação no Brasil **mudam com frequência**. Tudo marcado **[VERIFICAR]** exige
confirmação na fonte oficial **antes** de qualquer linha de integração. As células
sem fonte oficial não são afirmadas como fato. Onde a documentação oficial foi
ambígua, está escrito explicitamente.

Esta é uma comparação **de pesquisa documental** (docs oficiais + ajuda oficial).
**Não houve teste em sandbox** (sem conta, sem API key, sem requisição real). As
validações práticas exigidas pela ADR 0018 §12 (criar cliente+assinatura, receber e
verificar webhook, provar idempotência, confirmar PF/CNPJ no cadastro real) ficam
para a **execução** da 5.1D em sandbox / 5.1E — ver §10.

---

## 1. Pergunta do spike

Qual gateway é o melhor encaixe para o ClinicBridge **cobrar a clínica** (camada
comercial do SaaS, ADR 0018 — **não** o financeiro da clínica/ADR 0012) no Brasil,
com foco em: começar cedo (fundador PF/MEI), Pix, cartão, boleto, **recorrência
mensal**, webhook seguro, idempotência, sandbox e viabilidade para o 1º piloto
vendável — **sem ligar dinheiro real** agora?

---

## 2. Fontes oficiais consultadas

**Asaas (docs.asaas.com / asaas.com — oficiais):**

- Sobre webhooks / autenticação por token: <https://docs.asaas.com/docs/sobre-os-webhooks>
- Idempotência em webhooks: <https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks>
- Sandbox (introdução + URL): <https://docs.asaas.com/docs/sandbox> · <https://docs.asaas.com/docs/como-configurar-sua-conta-no-sandbox>
- Chaves de API: <https://docs.asaas.com/docs/chaves-de-api>
- Criando uma assinatura: <https://docs.asaas.com/docs/criando-uma-assinatura>
- Criando um link de pagamentos: <https://docs.asaas.com/docs/criando-um-link-de-pagamentos>
- Checkout com assinatura (recorrente): <https://docs.asaas.com/docs/checkout-com-assinatura-recorrente>
- API de pagamentos (visão geral de métodos): <https://www.asaas.com/api-de-pagamentos>
- Preços e taxas: <https://www.asaas.com/precos-e-taxas>
- Conta digital / cadastro PF·MEI·CNPJ (ajuda/blog oficiais): <https://www.asaas.com/conta-digital> · <https://blog.asaas.com/conta-mei/>

**Stripe (docs.stripe.com / support.stripe.com — oficiais):**

- Pix (disponibilidade BR + Pix Automático invite-only): <https://docs.stripe.com/payments/pix>
- Pix Automático: <https://docs.stripe.com/payments/pix/pix-automatico>
- Informação específica para abrir conta no Brasil: <https://support.stripe.com/questions/brazil-specific-information-to-open-a-stripe-account>
- Atualização tributária de contas no Brasil (CPF/CNPJ): <https://support.stripe.com/questions/updating-tax-information-for-stripe-accounts-in-brazil>
- Métodos aceitos no Brasil: <https://support.stripe.com/questions/accepted-payment-methods-in-brazil>
- Webhooks (assinatura `Stripe-Signature`): <https://docs.stripe.com/webhooks> · <https://docs.stripe.com/webhooks/signature>
- Idempotência (`Idempotency-Key`): <https://docs.stripe.com/api/idempotent_requests>

> Blogs/terceiros foram usados **apenas** como apoio de navegação, nunca como fonte
> primária de fato. Onde só havia terceiro, a célula ficou **[VERIFICAR]**.

---

## 3. Asaas — principais conclusões

- **Cadastro PF / MEI / CNPJ:** Asaas se posiciona como conta digital para negócios
  de todos os tamanhos, **incluindo autônomos e MEI**. PF: documento de identificação
  (RG/CNH); MEI/CNPJ: documento do sócio + documento societário; análise em até ~2
  dias úteis; sem mensalidade. Fonte oficial (asaas.com/blog oficial). **Apelo
  principal para o fundador começar cedo como PF/MEI** — ainda assim **[VERIFICAR]** os
  limites exatos de uma conta PF para *receber recorrência B2B* no cadastro real.
- **Métodos:** Pix, boleto, cartão de crédito/débito (oficial — API de pagamentos).
- **Recorrência nativa:** `POST /v3/subscriptions` com `customer`, `billingType`,
  `nextDueDate`, `value`, `cycle` (ex.: `MONTHLY`). Há também **link de pagamento
  recorrente** (`chargeType = RECURRENT`) e checkout com assinatura. Fonte oficial.
- **Dunning (retentativa):** para cobrança recorrente, Asaas faz **3 tentativas de
  captura no vencimento** (8h/14h/20h) e **+2 a cada 24h** (total 5). Fonte oficial
  (docs — criando assinatura).
- **Webhook — verificação:** **NÃO é HMAC/assinatura criptográfica.** Asaas envia um
  header **`asaas-access-token`** com um **token compartilhado** que você define ao
  criar o webhook. A verificação é **comparar esse token** (ideal: comparação em tempo
  constante). Fonte oficial (sobre-os-webhooks). → **Implicação de arquitetura:**
  nosso `verifyWebhookSignature` para Asaas é uma **igualdade de token**, não um HMAC
  do corpo. Funciona, mas é um modelo de segurança **mais fraco** que o do Stripe
  (não prova integridade do payload, só origem por segredo compartilhado). Aceitável
  **com HTTPS + segredo forte + idempotência + tenant resolvido por mapa interno**.
- **Idempotência (webhook):** entrega **"at least once"**; eventos têm **ID único** e
  o mesmo ID se repete em reenvios — estratégia recomendada é **chave única no banco**
  pelo event id. Isso **casa exatamente** com `billing_events.UNIQUE(provider,
  external_event_id)` da ADR 0018 §5.5. Fonte oficial.
- **Idempotência (API REST de criação):** suporte a header `Idempotency-Key` em POSTs
  de criação **não foi confirmado** na documentação consultada → **[VERIFICAR]**.
- **Robustez do webhook:** se o endpoint falhar **15 vezes seguidas**, a fila de
  sincronização **pausa** (com e-mail de aviso) e reativa via painel/API; eventos
  retidos por **~14 dias**. Fonte oficial. → operacionalmente importante (precisamos
  responder 2xx rápido; processar async).
- **Sandbox:** ambiente dedicado em `https://sandbox.asaas.com` + base de API
  `https://api-sandbox.asaas.com/v3`; API key própria de sandbox (chave
  "irrecuperável", exibida uma vez). Fonte oficial. **Bom para 5.1D sem dinheiro real.**
- **Pagador / fatura:** cliente recebe **fatura por e-mail** com QR Pix / código /
  boleto. Existência de um **"portal do cliente"** self-service equivalente ao do
  Stripe → **[VERIFICAR]** (a experiência documentada é fatura + link, não
  necessariamente um portal de gestão de assinatura pelo próprio pagador).
- **Taxas (oficial, podem mudar):** Pix **R$ 0,99/transação nos 3 primeiros meses,
  R$ 1,99 depois** (com isenção nas 100 primeiras/mês por chave/QR estático); boleto e
  cartão **"paga só quando recebe"** (sem adesão/mensalidade). Percentual de cartão
  **[VERIFICAR]** na tabela oficial vigente.

---

## 4. Stripe — principais conclusões

- **Conta no Brasil — PF e PJ:** contas Stripe no Brasil podem ser abertas como
  **company** ou **individual**, associadas a **CNPJ ou CPF**. Recebimento exige conta
  bancária sob o mesmo CPF/CNPJ. **CPF/CNPJ e tipo não podem ser alterados depois.**
  Fonte oficial (support.stripe.com). → **Atualiza o pressuposto da ADR 0018**, que
  marcava "historicamente exige PJ/CNPJ": **a abertura como PF/CPF é suportada
  oficialmente** (sujeita a verificação BR 2025). **[VERIFICAR]** caso a caso na
  verificação real, sobretudo regras de plataforma/Connect.
- **Cartão:** suporte forte; Stripe Billing é referência global para assinatura,
  dunning ("Smart Retries"), proration, faturas. Fonte oficial.
- **Pix (único):** contas Stripe no Brasil **podem aceitar Pix de pagamento único**,
  liquidação em BRL. Fonte oficial (docs Pix).
- **Pix recorrente (Pix Automático) — BLOQUEADOR:** a doc oficial afirma textualmente
  **"O Pix Automático não está disponível no Brasil. (Invite only)"**. Ou seja, para
  conta **brasileira**, recorrência via Pix **não está disponível** hoje (apenas
  convite). Fonte oficial (docs Pix / Pix Automático). → **Para SaaS recorrente no
  Brasil, onde o Pix domina, isto é uma fricção real.** Recorrência no Stripe-BR
  tenderia a **cartão** (e boleto **[VERIFICAR]**).
- **Boleto (BR, recorrente):** disponibilidade/recorrência para conta brasileira →
  **[VERIFICAR]** na doc oficial vigente.
- **Webhook — verificação:** **assinatura HMAC** via header **`Stripe-Signature`** +
  **signing secret** por endpoint; exige **corpo cru** (raw body) intacto. Modelo de
  segurança **forte** (prova origem **e** integridade). Fonte oficial.
- **Idempotência (API):** header **`Idempotency-Key`** em **todos os POSTs**
  (UUID v4 recomendado); resposta do 1º request é memorizada (~24h). Webhooks: mesmo
  `event.id` pode chegar mais de uma vez (at-least-once, retry até 72h) → dedupe por
  `event.id`. Fonte oficial. **Excelente encaixe com a ADR 0018.**
- **Test mode:** completo (chaves de teste, eventos de teste, Stripe CLI para
  webhooks locais). Fonte oficial.
- **Checkout + Customer Portal:** Checkout hospedado e **Customer Portal**
  self-service (cliente gerencia assinatura/segunda via). Fonte oficial. **Vantagem
  clara** sobre o que se confirmou do Asaas.

---

## 5. Tabela comparativa (resumo)

| Critério | Asaas | Stripe | Fonte / nota |
|---|---|---|---|
| Começar cedo como **PF/MEI** | **Sim** (autônomo/MEI explícito) | **Sim** (CPF ou CNPJ aceitos) | Ambos oficiais; **[VERIFICAR]** limites PF p/ recorrência B2B |
| **Pix único** | Sim | Sim (BR, BRL) | Oficiais |
| **Pix recorrente** | Sim (assinatura com `billingType` Pix) **[VERIFICAR Pix automático específico]** | **Não no BR** ("Pix Automático… invite only") | Stripe docs Pix — **bloqueador BR** |
| **Boleto** | Sim (avulso/parcelado/recorrente) | **[VERIFICAR]** (BR recorrente) | Asaas oficial |
| **Cartão** | Sim | Sim (referência) | Oficiais |
| **Recorrência/assinatura** | Sim, nativa (`/v3/subscriptions`) | Sim, **Stripe Billing** (mais rico) | Oficiais |
| **Dunning/retentativa** | Sim (3+2 = 5 tentativas) | Sim (Smart Retries) | Oficiais |
| **Sandbox/test mode** | Sim (`api-sandbox.asaas.com/v3`) | Sim (test mode + CLI) | Oficiais |
| **Verificação de webhook** | Token compartilhado (`asaas-access-token`) — **mais fraco** | **HMAC** (`Stripe-Signature` + secret) — **forte** | Oficiais |
| **Idempotência webhook** | event id único (at-least-once) | `event.id` (at-least-once) | Oficiais — ambos casam com `billing_events` |
| **Idempotência API (POST)** | **[VERIFICAR]** (`Idempotency-Key`?) | Sim (`Idempotency-Key` em todo POST) | Stripe oficial |
| **Checkout hospedado** | Sim (link de pagamento) | Sim (Checkout) | Oficiais |
| **Customer Portal self-service** | **[VERIFICAR]** (fatura+link confirmados; portal?) | Sim (Customer Portal) | Stripe oficial |
| **Taxas** | Pix R$0,99→R$1,99; boleto/cartão "paga ao receber"; **% cartão [VERIFICAR]** | **[VERIFICAR]** tabela BR vigente | Asaas oficial (parcial) |
| **Antifraude/recusa** | **[VERIFICAR]** | **[VERIFICAR]** | — |
| **Qualidade da doc** | Boa (PT-BR) | Excelente | — |
| **Adequação SaaS BR clínica pequena** | **Forte** (Brasil-first, Pix/boleto recorrente, PF/MEI) | Forte tecnicamente, **fricção Pix recorrente BR** | Avaliação |
| **Risco lock-in** | Mitigado por `BillingProvider` | Mitigado por `BillingProvider` | ADR 0018 §13 |

**Mercado Pago / Pagar.me (alternativas secundárias, sem pesquisa profunda):**
Mercado Pago tem assinaturas/Pix/boleto/cartão, **mas** há histórico ruim do fundador
(recusas/antifraude) → **não escolher automaticamente** (ADR 0018 §11). Pagar.me é
opção secundária BR razoável; **não precisa decidir agora**.

---

## 6. Perguntas ainda pendentes (entram na execução em sandbox)

1. **[VERIFICAR]** Conta **PF** no Asaas tem restrição para **receber recorrência
   B2B** (assinatura mensal de SaaS)? Há teto de volume antes de exigir MEI/CNPJ?
2. **[VERIFICAR]** Asaas **Pix automático/recorrente** funciona como assinatura
   contínua, ou cada ciclo Pix gera uma cobrança/QR novo a pagar manualmente?
3. **[VERIFICAR]** Asaas tem **`Idempotency-Key`** na API REST de criação (POST
   cliente/assinatura/cobrança)?
4. **[VERIFICAR]** Asaas oferece **portal do pagador** self-service (gerir/segunda via)
   além da fatura por e-mail + link?
5. **[VERIFICAR]** Stripe **boleto** para conta **BR** suporta **recorrência**?
6. **[VERIFICAR]** Stripe — abrir como **PF/CPF** habilita cobrança recorrente por
   cartão sem exigir CNPJ na verificação BR 2025? (regras de plataforma/Connect)
7. **[VERIFICAR]** Taxas atuais: **% de cartão** (Asaas e Stripe) e tarifa de boleto.
8. **[VERIFICAR]** Antifraude/recusa de ambos em cobrança recorrente B2B.

---

## 7. Recomendação

**Asaas preferencial** para o 1º piloto vendável — **com a decisão final formalizada
como adendo à ADR 0018 só após validação em sandbox** (as pendências §6 ainda existem;
isto é research, não integração testada).

### Justificativa (responsável)

1. **Pix recorrente é decisivo no Brasil.** O Stripe declara oficialmente que **Pix
   Automático não está disponível no Brasil (invite only)**. Para um SaaS de clínica
   pequena brasileira, onde Pix é o método dominante, depender só de cartão para
   recorrência é fricção comercial real. Asaas oferece assinatura recorrente com
   Pix/boleto/cartão de forma nativa.
2. **Começar cedo como PF/MEI.** Asaas é explicitamente amigável a autônomo/MEI. (O
   Stripe-BR **também** aceita CPF — isso atualiza o pressuposto da ADR 0018 — mas o
   bloqueio de Pix recorrente pesa mais que esse empate.)
3. **Boleto recorrente** confirmado no Asaas; no Stripe-BR é **[VERIFICAR]**.
4. **Encaixe com a arquitetura atual** é direto (§9): idempotência por event id,
   sandbox limpo, abstração já pronta.

### Ressalva honesta (a favor do Stripe)

Stripe é **tecnicamente superior** onde importa para billing: **webhook HMAC** (vs.
token compartilhado do Asaas), **`Idempotency-Key`** nativo em todo POST, **Customer
Portal** self-service e **Stripe Billing** (dunning/proration/faturas). Se o produto
priorizasse cartão internacional ou portal self-service rico, Stripe ganharia. A
**abstração `BillingProvider` (ADR 0018 §13) mantém o Stripe como troca barata** — a
escolha do Asaas **não** é irreversível.

**Não criamos `docs/adr/0019` agora**: a ADR 0018 já prevê registrar a escolha como
**adendo a ela** após a 5.1D, e ainda há **[VERIFICAR]** abertos. Criar ADR separada
seria cravar decisão sem a validação em sandbox.

---

## 8. Go / No-Go para ligar **sandbox**

**GO para sandbox do Asaas** (e, em paralelo, test mode do Stripe), com as condições:

- ✅ Sandbox é **fictício**, sem dinheiro real, sem PII real, sem dado de clínica real
  — alinhado à fase atual (pré-piloto, sem produção).
- ✅ Sem webhook **público** real (sem produção/HTTPS público — isso é 5.2A); em
  sandbox usar túnel/staging efêmero.
- ✅ Secrets de sandbox **nunca** commitados; `.env.example` só placeholder; chave de
  sandbox tratada como segredo (mesmo sendo de teste).
- ⛔ **No-Go para dinheiro real / produção / webhook público** — depende de 5.2A
  (produção segura AWS) + validação jurídica/contábil + termos comerciais + go/no-go
  comercial (ADR 0018 §15).
- ⛔ **No-Go** para enviar qualquer **PII de paciente** ao gateway, em qualquer
  ambiente (ADR 0018 §9).

---

## 9. Encaixe na arquitetura atual (ADR 0018)

A escolha do Asaas **não muda** o desenho — só preenche o adapter:

- **`BillingProvider` (`billingProvider.ts`):** já tem `name: 'asaas' | 'stripe' | …`.
  Implementar `AsaasProvider` ao lado do `MockProvider`, **sem** tocar
  `billingService.ts`/estado/entitlements.
- **`billing_provider_customers`:** `external_customer_id` = id do **cliente** no Asaas
  (`/v3/customers`). `UNIQUE(provider, external_customer_id)` + `UNIQUE(clinica_id,
  provider)` permanecem.
- **`billing_provider_subscriptions`:** `external_subscription_id` = id da assinatura
  Asaas (`/v3/subscriptions`). `external_status_raw` guarda o status cru do Asaas.
- **`billing_events`:** `external_event_id` = **id do evento de webhook do Asaas**.
  `UNIQUE(provider, external_event_id)` **é** a chave de idempotência — casa 1:1 com o
  "mesmo event id em reenvios" do Asaas (at-least-once). `recordIfNew` já implementa.
- **Webhook idempotente + tenant por mapa interno:** o `clinica_id` é resolvido pelos
  mapas `billing_provider_customer/subscription` a partir do customer/subscription id
  do payload — **nunca** confiando num `clinica_id` do payload (anti-spoofing, §10 ADR).
- **`verifyWebhookSignature` para Asaas:** **comparação em tempo constante** do header
  `asaas-access-token` contra o segredo configurado (NÃO é HMAC). Documentar que o
  modelo é "segredo compartilhado", reforçado por HTTPS + idempotência + tenant
  interno. (Para Stripe seria HMAC do raw body com o signing secret.)
- **Soft-lock:** inalterado — continua função do **status** da assinatura
  (`billingStateMachine.ts`); o gateway só **alimenta** transições via webhook
  verificado (5.1E). Estado **nunca** muda pelo frontend (ADR 0018 §2.6).
- **PII:** ao `AsaasProvider` só vai a **identidade de cobrança da clínica**
  (`ClinicBillingIdentity`: nome, e-mail de cobrança, CPF/CNPJ do responsável). Zero
  dado de paciente/clínico.

> **Ajuste pontual de tipo (futuro, não nesta sprint):** `verifyWebhookSignature`
> hoje recebe `(rawBody, headers)` — suficiente para Asaas (lê header) e Stripe (HMAC
> do raw body). Nenhuma mudança de interface necessária.

---

## 10. Próxima sprint recomendada

**5.1E — Provider sandbox adapter (Asaas)**, antes de hardening legal:

1. Criar conta **sandbox Asaas** (fictícia) + API key de sandbox (segredo, não
   commitado).
2. Implementar `AsaasProvider` por trás do `BillingProvider` (sem tocar
   `billingService`): `createCustomer`, `createSubscription` (cycle MONTHLY),
   `getSubscription`, `verifyWebhookSignature` (token), `parseWebhookEvent`.
3. Validar **em sandbox** os itens da ADR 0018 §12 + resolver os **[VERIFICAR]** §6.
4. **Só então** escrever o **adendo à ADR 0018** com a decisão formal + fontes.
5. Hardening de webhook (5.1E original): idempotência (reenvio = no-op), rejeição de
   token inválido, tenant por mapa interno, greps de PII/cartão/segredo.

**Alternativa válida:** se o foco comercial pedir, **voltar ao produto** (validação
visual 6.0x / seed de piloto) antes de codar o adapter — a decisão de gateway já está
**suficientemente encaminhada** (Asaas preferencial) para não bloquear produto.

**Não recomendado agora:** documentos legais/cobrança real — dependem de 5.2A.

---

## 11. Riscos de LGPD / segurança

| Risco | Mitigação (já no desenho) |
|---|---|
| Webhook Asaas usa token compartilhado, não HMAC | HTTPS + segredo forte + idempotência por event id + tenant por mapa interno; comparação de token em tempo constante; rate limit IP-keyed no endpoint |
| Vazar PII de paciente ao gateway | Só `ClinicBillingIdentity` (clínica) vai ao Asaas; nenhum dado de paciente/clínico, jamais (ADR 0018 §9) |
| Secret de sandbox vazar no repo/log | `.env.example` só placeholder; chave tratada como segredo; logger redige credenciais de provider (entra com o adapter, 5.1E) |
| Tenant spoofing via payload de webhook | `clinica_id` resolvido pelos mapas internos, nunca pelo payload (ADR 0018 §10) |
| Evento duplicado (at-least-once) | `billing_events.UNIQUE(provider, external_event_id)` → reprocesso = no-op |
| Estado de plano mudado por retorno do frontend | Só webhook verificado / ação manual auditada altera estado (ADR 0018 §2.6) |
| Dado de cartão | Nunca tocamos PAN/CVV — responsabilidade PCI do gateway (ADR 0018 §2.7) |
| Confundir billing do SaaS com financeiro da clínica | Camadas separadas; ADR 0012 intocada |
| Cobrança real ligada cedo demais | No-Go até 5.2A (produção segura) + validação jurídica/comercial |

---

## 12. Resumo executivo

- **Recomendação:** **Asaas preferencial** (Brasil-first, Pix/boleto recorrente nativo,
  PF/MEI), decisão final como **adendo à ADR 0018** após sandbox.
- **Bloqueador que decidiu:** Stripe declara **Pix Automático indisponível no Brasil
  (invite only)** — fricção real para SaaS recorrente BR.
- **Empate atualizado:** Stripe-BR **aceita PF/CPF** (corrige o pressuposto da ADR
  0018), mas perde no Pix recorrente.
- **Stripe segue como plano B barato** pela abstração `BillingProvider`.
- **Go** para sandbox fictício; **No-Go** para dinheiro/produção/webhook público.
- **Próximo:** 5.1E adapter Asaas em sandbox + resolver os **[VERIFICAR]**.
</content>
</invoke>
