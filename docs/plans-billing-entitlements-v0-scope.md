# ClinicBridge — Planos, Billing e Entitlements v0.1 (operacional)

> **Sprint:** 5.1A (docs-only) · **Data:** 2026-05-28
> **Fonte autoritativa do escopo:** `docs/adr/0018-plans-billing-entitlements-v0.md`.
> Este arquivo é o **operacional** da ADR 0018 — checklists, chaves de
> entitlement candidatas, matriz de estados e plano de implementação por sprint.
> **Nada aqui autoriza código** além do que a ADR 0018 decide. Preços = TBD comercial.

---

## 1. Resumo em uma frase

O ClinicBridge passa a ter uma **camada comercial por clínica/tenant** (assinatura +
entitlements) atrás de uma **abstração de gateway**, com **soft-lock que nunca
sequestra dados** e **estado de plano alterado só por webhook verificado** — começando
em **mock (5.1B/C)** e **sandbox (5.1D/E)**, antes da produção segura (5.2A).

> Não confundir com o **financeiro da clínica** (`financial_charges`, ADR 0012),
> que é a clínica cobrando os pacientes dela. Aqui é o ClinicBridge cobrando a clínica.

---

## 2. As três camadas (resumo operacional)

| Camada | Pergunta que responde | Onde mora | Exemplos |
|---|---|---|---|
| **Role operacional** | Quem é o usuário? | JWT/DB (`papel` + `user_clinical_roles`) | `dono_clinica`, `secretaria`, `profissional_clinico`, `gestor_clinica`, `admin_sistema` |
| **Plano comercial** | O que a clínica contratou? | `clinic_subscription` (1/tenant) | `essencial`, `profissional`, `piloto_assistido` |
| **Entitlement** | O que este tenant pode fazer agora? | `clinic_entitlement` (backend) | `module.inventory=true`, `limit.users=3` |

**Regra de ouro:** ação permitida = role autoriza **E** entitlement permite **E**
(se clínico) gate clínico seguro atendido. Independentes — nenhuma substitui a outra.

---

## 3. Chaves de entitlement candidatas (5.1B define as finais)

> Orientativas. Nomes/limites exatos = decisão de produto na 5.1B.

**Módulos (booleanos):**

```
module.patients          module.agenda            module.financial
module.services          module.reports.basic     module.reports.full
module.insurance         module.inventory         module.imports
module.clinical          # prontuário/documentos — SÓ se gate clínico seguro atender
```

**Limites (numéricos; null = ilimitado/não-aplicável):**

```
limit.users              # usuários ativos na clínica
limit.professionals      # profissionais da agenda
limit.imports_per_month  # importações/mês
```

**Mapa plano → entitlement (conceitual; preencher na 5.1B):**

| Chave | Essencial | Profissional | Piloto Assistido |
|---|---|---|---|
| module.patients / agenda / financial / services | ✅ | ✅ | ✅ |
| module.reports.basic | ✅ | ✅ | ✅ |
| module.reports.full | ❌ | ✅ | ✅ |
| module.insurance | ❌ | ✅ | ✅ |
| module.inventory | ❌ | ✅ | ✅ |
| module.clinical | gate clínico* | gate clínico* | gate clínico* |
| limit.users | menor (TBD) | maior (TBD) | conforme venda |
| limit.professionals | menor (TBD) | maior (TBD) | conforme venda |
| limit.imports_per_month | menor (TBD) | maior (TBD) | conforme venda |

\* `module.clinical` **nunca** é destravado só pelo plano — exige o gating clínico
seguro (ADR 0009/0010/0011). O plano pode **restringir**, nunca **liberar** o que o
gate clínico não liberou.

---

## 4. Estados da assinatura (matriz operacional)

| Estado | Lê dados? | Exporta? | Cria/edita? | Banner | Como entra |
|---|---|---|---|---|---|
| `trialing` | ✅ | ✅ | ✅ | "Período de avaliação" | início do trial |
| `active` | ✅ | ✅ | ✅ | — | webhook pagamento ok |
| `past_due` | ✅ | ✅ | ✅ (na tolerância) | ⚠️ "Pagamento pendente" | webhook falha/vencimento |
| `suspended` | ✅ | ✅ | ❌ `subscription_suspended` | 🔒 "Regularize para voltar a criar" | fim da tolerância |
| `canceled` | ✅ (janela) | ✅ (janela) | ❌ | "Assinatura encerrada" | cancelamento |
| `manual_pilot` | ✅ | ✅ | ✅ (conforme venda) | "Piloto assistido" | venda assistida (`admin_sistema`) |

**Tolerância (`grace_until`) e janela de retenção pós-`canceled`:** valores **TBD
comercial** — alinhar com o fundador e com `docs/data-retention-policy.md`. **Não
inventados aqui.**

---

## 5. Soft-lock — o que bloqueia e o que mantém

**Bloqueia em `suspended`/`canceled` (403 `subscription_suspended`):**
- Criar paciente · criar/editar cobrança · criar/remarcar agendamento ·
  registrar movimento de estoque · criar serviço/convênio · importar dados ·
  qualquer escrita nova.

**Mantém sempre (mesmo suspenso):**
- Login e leitura dos dados existentes.
- **Exportação essencial** (CSV/XLSX de pacientes/financeiro) — portabilidade LGPD.
- Visualização de relatórios já gerados.

**Nunca:**
- Apagar, ocultar destrutivamente ou impedir export como punição. Sem "data hostage".

---

## 6. Webhooks — regras inegociáveis

1. **Assinatura verificada** antes de qualquer processamento. Inválida → descarta +
   `billing.webhook.rejected`.
2. **Idempotência** por `external_event_id` único. Reenvio → no-op.
3. **`clinica_id` resolvido pelo mapa interno** (`billing_provider_customer` /
   `billing_provider_subscription`) — **nunca** confiar no payload.
4. **Rate limit** IP-keyed no endpoint.
5. **`payload_hash`** guardado, **não** o payload cru com PII.
6. Endpoint público HTTPS só existe de fato em produção (5.2A) — em 5.1D/E roda em
   sandbox com túnel/staging.

---

## 7. O que NÃO armazenamos / NÃO enviamos

| Nunca armazenar | Nunca enviar ao gateway |
|---|---|
| PAN / CVV / validade de cartão | Nome/CPF/telefone de **paciente** |
| Payload cru de webhook com PII | Qualquer dado clínico |
| Segredos do provider em texto claro no log | Conteúdo de prontuário/documento |

**Enviado ao gateway (mínimo):** nome/razão social da clínica, e-mail de cobrança,
CPF/CNPJ do **responsável financeiro** (cliente do SaaS, não paciente).

---

## 8. Gateways — quadro de decisão (resumo; detalhe na ADR §11)

| | Asaas | Stripe | Mercado Pago | Pagar.me |
|---|---|---|---|---|
| Papel | **Candidato preferencial (spike)** | Comparação obrigatória (spike) | Ressalva (recusas prévias) | Secundário |
| Força | Brasil-first; PF/Pix/boleto | SaaS/Billing referência | — | BR, ok |
| Bloqueador a confirmar | webhook signature, idempotência, taxas | **operação BR/PF, Pix recorrente** | antifraude/recusa | — |

**[VERIFICAR oficialmente antes de implementar]:** taxas/repasses, CPF vs CNPJ,
PF vs PJ, Pix recorrente, verificação de assinatura de webhook, idempotência da API,
portal do cliente, disponibilidade atual no Brasil. **Não cravar sem fonte oficial.**

---

## 9. Checklist por sprint

### 5.1B — Backend foundation (mock)
- [ ] Migration aditiva: `clinic_subscription`, `clinic_entitlement`,
      `billing_provider_customer`, `billing_provider_subscription`, `billing_event`.
- [ ] Tipos em `db.d.ts`.
- [ ] DAOs tenant-scoped (sem `listAll`; sempre `clinica_id`).
- [ ] `computeEntitlements(subscription)` (função pura) + catálogo de planos (config).
- [ ] `BillingProvider` interface + `MockProvider`.
- [ ] Máquina de estados da assinatura + soft-lock.
- [ ] Middleware `requireEntitlement(featureKey)` + checagem de limite nos services.
- [ ] Audit metadata-only (`billing.*`) + logger redige segredos de provider.
- [ ] Smoke por role × plano × estado × tenant.

### 5.1C — Frontend
- [ ] Tela de plano/assinatura (estado atual, plano, próximo ciclo).
- [ ] Banners `trialing`/`past_due`/`suspended`/`canceled`.
- [ ] Esconder/desabilitar ações fora do plano (UX) — backend continua a defesa.
- [ ] Mensagens de upgrade (não de erro) para `feature_not_in_plan`/`limit_reached`.
- [ ] typecheck/build.

### 5.1D — Spike sandbox
- [ ] Asaas: criar cliente+assinatura, webhook+verificação, idempotência, CPF/CNPJ,
      Pix/boleto/cartão, (Pix recorrente?), retentativa, portal, taxas.
- [ ] Stripe: mesmos itens, com foco em **operação BR/PF**.
- [ ] **Adendo à ADR 0018** com a escolha + fontes oficiais consultadas.

### 5.1E — QA/security billing hardening
- [ ] Idempotência (reenvio de evento = no-op).
- [ ] Verificação de assinatura (evento forjado rejeitado).
- [ ] Tenant isolation de webhook (payload com `clinica_id` alheio não tem efeito).
- [ ] Soft-lock validado (suspended bloqueia escrita, mantém leitura/export).
- [ ] Greps: sem PAN/cartão, sem PII de paciente para gateway, sem segredo em log.

---

## 10. Fora de escopo v0.1

Preços fixos · cobrança real (só pós-5.2A) · NF-e do SaaS · cupons/descontos ·
proration complexo · multi-moeda · usage-based/metered · split/marketplace ·
cofre de cartão · alterar o financeiro da clínica (ADR 0012).

---

## 11. Relação com produção/AWS

A cobrança **real** depende de: HTTPS público (webhooks), secrets manager, banco
gerenciado — tudo em **5.2A (ADR Produção Segura AWS)**. Por isso 5.1B/C usam
**mock** e 5.1D/E usam **sandbox**. O objetivo é que, **quando a AWS subir, o
produto já nasça vendável** em rollout controlado.

---

## 12. Referências

- ADR 0018 — `docs/adr/0018-plans-billing-entitlements-v0.md`
- ADR 0012 — `docs/adr/0012-financial-module-v0.md` (financeiro da clínica)
- ADR 0009 — gates clínicos (`module.clinical` nunca destravado só pelo plano)
- `docs/security-notes.md` · `docs/deploy-security-checklist.md`
- `docs/data-retention-policy.md` (janelas de retenção/tolerância)
- `docs/product-clinic-os-roadmap.md` · `docs/roadmap-next-phase.md`
