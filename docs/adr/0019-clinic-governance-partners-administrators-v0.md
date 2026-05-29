# ADR 0019 — Governança da Clínica, Sócios e Administradores v0.1

> **Status:** Aceita (arquitetura) · **Implementação: Entregue 6.1A–6.1E** (v0.1).
> A arquitetura desta ADR foi proposta em 6.0N (docs-only) e implementada nas
> sprints seguintes: **6.1A** schema/migration `clinic_governance_members` + backfill
> titular + endpoints read-only/promote; **6.1B** `requireClinicGovernance` + enforcement
> nos *writes* do catálogo de Serviços (Titular + Administrador); **6.1C/6.1C.1** frontend
> (`GovernancePanel`) + ajuda Auri; **6.1D** QA/hardening; **6.1E** correção GOV-NEW-1.
> **Reconciliação (6.1E):** novos tenants **nascem com linha de titular** — `register()`
> insere `clinic_governance_members(titular, active)` na mesma transação da criação de
> clínica/usuário, tornando a tabela autoritativa para clínicas novas (o fallback
> `dono_clinica→titular` em `requireClinicGovernance` passa a ser puro legado para clínicas
> anteriores ao backfill). **Ainda NÃO implementado (backlog, exige sprint/ADR própria):**
> revoke de administrador, transferência de titularidade, exclusão de clínica, billing.
>
> **Sprint:** 6.0N (ADR) · 6.1A–6.1E (implementação)
>
> **Data:** 2026-05-29
>
> **Decisores:** dono do produto (ClinicBridge)
>
> **Habilitada por:** ADR 0001 (Opção C — base administrativa segura primeiro) ·
> ADR 0008 (Clinic OS modular)
>
> **Reutiliza/estende:** ADR 0009 (roles granulares clínicos + `user_clinical_roles`
> + audit de leitura + LGPD clínica)
>
> **Relacionado:**
> `docs/adr/0009-clinical-architecture-roles-read-audit.md` ·
> `docs/adr/0018-plans-billing-entitlements-v0.md` (billing por tenant — **não**
> confundir governança com billing) ·
> `docs/clinical-architecture-and-permissions.md` ·
> `docs/security-notes.md` · `docs/roadmap-next-phase.md` ·
> `docs/product-clinic-os-roadmap.md` · `docs/project-state.md`
>
> **O que esta ADR autoriza:** decidir e documentar o **modelo de governança**
> da clínica (titularidade, sócios/administradores, funcionários, grants clínicos,
> ações sensíveis, separação billing × operação, auditoria/LGPD) e a sequência de
> sprints futuras. **NÃO autoriza** nenhuma alteração de código, schema, migration,
> RBAC, billing ou seed. A implementação é deliberadamente adiada (ver §10–§12).

---

## 1. Contexto

O modelo de papéis atual (ADR 0009, Sprint 4.x) é deliberadamente **grosso** em
`users.papel`:

- `admin_sistema` — sem `clinica_id`; bloqueado das rotas tenant-scoped por
  `requireClinic` (`no_clinic_context`).
- `dono_clinica` — **titular único** que hoje concentra todos os poderes altos
  (convites, aprovação/remoção de membros, import/export, merge B-safe, leitura
  de audit clínico, concessão de grants clínicos, etc.).
- `secretaria` — operador com login (exibido na UI como "funcionário(a) com
  acesso administrativo").

Os **grants clínicos finos** (`profissional_clinico`, `gestor_clinica`) vivem
**fora** do `users.papel`, na tabela `user_clinical_roles` (ADR 0009), e **não
entram no JWT** — o `papel` do token continua sendo `dono_clinica`/`secretaria`.
Isso foi reconfirmado na Sprint 6.0M/6.0N: gestor e profissional têm
`users.papel = secretaria` + grant ativo em `user_clinical_roles`.

**Dor nova de produto.** Clínicas pequenas frequentemente têm **sócios** ou
**coadministradores** — duas ou três pessoas que dividem a gestão. O modelo "um
dono absoluto + funcionários" não modela isso:

- só existe **um** `dono_clinica`; não há como dar poderes altos a um sócio sem
  promovê-lo a dono (o que hoje nem é um fluxo existente);
- elevar alguém a "dono" criaria **dois donos equivalentes**, sem titular claro
  — risco de disputa, de remoção mútua e de ambiguidade sobre quem responde
  legalmente pela clínica;
- não há separação entre **poder administrativo alto** e **acesso a dado clínico**
  (um sócio-investidor pode precisar gerir a operação sem nunca ver prontuário).

Esta ADR decide a **arquitetura-alvo** dessa governança, sem implementar.

---

## 2. Decisão (resumo)

1. **Manter um Titular único por clínica** (responsável principal / dono legal).
   Não criar múltiplos donos equivalentes. Titularidade é **transferível por
   fluxo formal**, nunca por simples promoção.
2. **Introduzir um papel administrativo alto distinto do Titular** —
   "Administrador da clínica" (que cobre o caso "sócio/coadministrador"). Tem
   quase todos os poderes operacionais, mas **não** as ações reservadas ao
   Titular (§5 grupo A).
3. **Separar três eixos ortogonais** que hoje se confundem:
   - **Governança administrativa** (Titular > Administrador > Funcionário);
   - **Acesso clínico** (grants em `user_clinical_roles`, ADR 0009) — concedido
     à parte, **nunca** automático por ser sócio/administrador;
   - **Billing/assinatura** (ADR 0018) — atributo do **tenant**, gerido por uma
     responsabilidade específica, **não** acoplado a grant clínico.
4. **Ações críticas exigem Titular** (ou, quando aplicável, dupla confirmação) —
   §5 grupo A.
5. **Nada disso é implementado agora.** Sequência de sprints futuras em §12.

> **Invariante de produto:** "ser sócio/administrador" **não** dá acesso clínico.
> Prontuário, documentos clínicos e audit clínico continuam **somente** via grant
> explícito (ADR 0009), com audit STRICT.

---

## 3. Nomenclatura de produto (decisão)

Distinguir **rótulo de produto (UI/PT-BR)** de **role técnica (backend/JWT/DB)**.
A role técnica **não muda** nesta ADR (continua `dono_clinica`/`secretaria` +
grants). A tabela abaixo é a nomenclatura-alvo de produto.

| Conceito | Rótulo de produto (UI) | Eixo | Mapeamento técnico atual / futuro |
|---|---|---|---|
| Responsável principal | **Titular da clínica** | Governança (topo) | hoje `dono_clinica`; futuro: flag/atributo "titular" |
| Sócio / coadministrador | **Administrador da clínica** | Governança (alto) | **novo** papel administrativo (futuro) |
| Funcionário comum | **Equipe administrativa** / "funcionário(a)" | Governança (operacional) | `secretaria` |
| Acesso ao prontuário | **Profissional clínico** | Acesso clínico (grant) | `user_clinical_roles.profissional_clinico` |
| Supervisão clínica | **Supervisor clínico** / **Gestor clínico** | Acesso clínico (grant) | `user_clinical_roles.gestor_clinica` |

**Decisões de naming:**

- Preferir **"Titular da clínica"** a "Dono" na UI nova — comunica
  responsabilidade legal/única melhor que "dono" (que sugere posse exclusiva e
  conflita com a ideia de sócios). Manter `dono_clinica` no backend/JWT/DB por
  compatibilidade (igual ao precedente "funcionário ≠ `secretaria`", Sprint
  3.24.1) — **não** renomear sem migration/refactor próprios.
- Preferir **"Administrador da clínica"** a "Sócio" como rótulo primário do
  papel técnico, porque o software modela **poder**, não **participação
  societária**. "Sócio" pode aparecer como texto explicativo ("administrador —
  ex.: sócio"), mas o sistema **não** representa cotas/participação/contrato
  social (fora de escopo permanente sem nova ADR).
- Evitar a palavra "admin" sozinha na UI da clínica — já existe
  `admin_sistema` (operador da plataforma, sem clínica); ambiguidade perigosa.
- Manter **"Profissional clínico"** e **"Supervisor/Gestor clínico"** como o eixo
  separado de acesso clínico (ADR 0009), **desacoplado** da governança.

---

## 4. Modelo futuro proposto (sem implementar)

Três eixos ortogonais, resolvidos de forma independente em cada request:

```
Eixo 1 — GOVERNANÇA (quem manda na conta)
  Titular  >  Administrador/Sócio  >  Funcionário (Equipe administrativa)

Eixo 2 — ACESSO CLÍNICO (quem vê dado de paciente)   ← grants ADR 0009
  Profissional clínico | Supervisor/Gestor clínico    (concedidos à parte)

Eixo 3 — BILLING/ASSINATURA (quem paga / contrata)   ← ADR 0018
  Responsabilidade de billing do TENANT (atributo da clínica, não do usuário)
```

**Princípios:**

1. **Um Titular por clínica, sempre.** A clínica nunca fica sem titular. Não há
   "co-titulares equivalentes". Transferência de titularidade = fluxo formal
   explícito (aceite do novo titular + audit + idealmente confirmação do atual).
2. **Administrador/Sócio = poderes altos operacionais, menos o grupo A (§5).**
   Vários administradores são permitidos. Eles **não** podem se autopromover a
   Titular nem remover o Titular.
3. **Governança ≠ acesso clínico.** Ser Titular ou Administrador **não** concede
   acesso a prontuário/documentos/audit clínico. Continua tudo via grant explícito
   (ADR 0009). Um Titular que queira ver prontuário precisa de grant clínico —
   exatamente como hoje (e isso é registrado em audit STRICT).
4. **Billing ≠ operação.** A responsabilidade de assinatura/pagamento é um
   atributo do tenant (ADR 0018: plano por tenant, estado muda só por webhook
   verificado). Não acoplar ao grant clínico nem assumir que "quem paga vê tudo".
   Soft-lock por billing **nunca** sequestra dados (invariante ADR 0018).
5. **Ações críticas exigem Titular** (e, para as irreversíveis, considerar dupla
   confirmação / janela de carência) — §5.
6. **Compatibilidade:** o modelo deve degradar para o estado atual —
   `dono_clinica` vira o Titular inicial; clínicas sem administradores funcionam
   exatamente como hoje.

---

## 5. Classificação de ações por risco

> Esta é a **matriz-alvo**. Não há enforcement novo nesta ADR. Onde o
> comportamento atual difere (ex.: hoje só existe `dono_clinica`), a coluna
> "hoje" registra o estado real.

### Grupo A — **Titular apenas** (poderes reservados, não delegáveis)

| Ação | Hoje | Alvo |
|---|---|---|
| Transferir titularidade | inexistente | Titular (fluxo formal + aceite) |
| Excluir/desativar a clínica | `dono_clinica` | Titular |
| Cancelar assinatura | inexistente (billing real bloqueado) | Titular (eixo billing) |
| Alterar dados legais/fiscais da clínica (CNPJ, razão social) | `dono_clinica` | Titular |
| Exportar **todos** os dados da clínica | `dono_clinica` (export) | Titular |
| Remover outro Administrador/Sócio | inexistente | Titular |
| Mudar configurações **críticas** de segurança | parcial | Titular |

Para ações **irreversíveis** (excluir clínica, transferir titularidade), exigir
**dupla confirmação** e/ou **janela de carência** + notificação aos demais
administradores (anti-sequestro/anti-disputa).

### Grupo B — **Titular + Administrador/Sócio**

- Convidar / aprovar / remover **funcionários comuns** (não administradores).
- Gerenciar **serviços** (catálogo).
- Gerenciar **agenda** e **profissionais da agenda** (cadastro administrativo —
  ≠ acesso clínico).
- Ver **relatórios administrativos**.
- Gerenciar **convênios / estoque / financeiro da clínica** conforme o plano
  (entitlements ADR 0018).

> Hoje todo o grupo B é **owner-only** (ou owner+secretaria em leituras). No
> alvo, o Administrador ganha o grupo B; o Funcionário comum mantém o subconjunto
> operacional atual da `secretaria`.

### Grupo C — **Grants separados** (eixo clínico, ADR 0009 — independe de governança)

- Acesso a **prontuário** (`profissional_clinico`).
- **Documentos clínicos**.
- **Auditoria clínica** (leitura da trilha STRICT).
- **Supervisor/Gestor clínico** (`gestor_clinica`).

> Concedidos **explicitamente** por quem tem poder de conceder grant (hoje:
> Titular; no alvo: Titular, e possivelmente Administrador — **decisão da 6.1A**).
> **Nunca** automáticos por papel de governança.

---

## 6. Impacto analisado

- **Tenant isolation:** inalterado e inegociável. Todo o modelo continua
  `clinica_id`-scoped; um Administrador é administrador **de uma clínica**, nunca
  cross-tenant. `admin_sistema` permanece fora de clínica.
- **LGPD:** governança administrativa **não** amplia base de acesso a dado
  pessoal de paciente — esse acesso segue minimizado e gated por grant clínico
  (ADR 0009). Adicionar administradores **não** pode virar atalho para PII
  clínica. Finalidade/limitação preservadas.
- **Audit logs:** novos eventos a auditar (conceder/revogar administrador,
  transferir titularidade, remover administrador, cancelar assinatura). Respeitar
  o schema real append-only (`acao/recurso/recurso_id/usuario_id/clinica_id/ip/
  user_agent/request_id/criado_em`) — **sem** PII no audit, **sem** `metadata`.
  Eventos de governança são administrativos (não clínicos) → audit normal, não a
  trilha clínica STRICT.
- **Billing/Asaas futuro (ADR 0018):** a responsabilidade de billing é do tenant.
  Definir **quem** pode contratar/cancelar (Titular) sem acoplar a grant clínico.
  Estado de assinatura continua mudando **só por webhook verificado**; soft-lock
  nunca sequestra dados; billing nunca vaza PII clínica.
- **Demo Aurora:** 100% fictícia; deve continuar funcionando. Pode futuramente
  **ilustrar** Titular + Administrador para fins de tour, mas sem nenhum dado real
  e sem mudar a natureza fictícia.
- **Conta real limpa:** conta nova nasce com **um Titular** e zero administradores
  — comportamento idêntico ao atual `dono_clinica`. Sem seed fake automático.
- **Checklist/onboarding:** ganha (futuro) um passo opcional "convide um
  administrador/sócio" — **opcional**, nunca bloqueante; consultório solo
  continua válido (alinha com 6.0K).
- **Convites de equipe:** o convite passa a carregar **nível de governança**
  (funcionário vs administrador). Convidar administrador é ação de Titular (ou
  Administrador, conforme 6.1A). Não confundir com grant clínico no convite.
- **Transferência de propriedade:** novo fluxo formal (aceite do destinatário,
  audit, dupla confirmação). Nunca por edição direta de campo.
- **Offboarding de sócio:** remover um Administrador é ação de Titular; precisa
  preservar dados (sem delete físico), registrar audit e reatribuir o que era
  exclusivo daquele usuário (ex.: grants clínicos do removido são revogados, não
  herdados).
- **Disputa entre sócios:** o **Titular único** é o desempate por design. Sem
  co-titulares equivalentes não há remoção mútua nem clínica "órfã". Ações
  irreversíveis com janela de carência + notificação reduzem o risco de captura.

---

## 7. Alternativas consideradas

1. **Vários `dono_clinica` equivalentes (rejeitada).** Simples de implementar
   (reusar a role existente), mas cria ambiguidade legal, risco de remoção mútua
   e clínica sem responsável. Viola "um Titular sempre".
2. **Acesso clínico automático para Administrador (rejeitada).** Quebra a
   minimização LGPD e a separação ADR 0009. Sócio-investidor não precisa ver
   prontuário.
3. **Billing acoplado a quem "manda" (rejeitada).** Confunde eixos; quebra
   invariantes da ADR 0018 (plano por tenant, webhook como fonte de verdade).
4. **RBAC genérico/ACL por recurso agora (adiada).** Poderoso, porém
   over-engineering para o estágio atual (sem produção, sem dados reais). O
   modelo de 3 eixos + matriz por grupo cobre a dor real com muito menos risco.
   Pode ser revisitado em ADR futura se a granularidade exigir.

---

## 8. Invariantes que esta ADR NÃO altera

- `users.papel` permanece `admin_sistema | dono_clinica | secretaria` **até** a
  6.1A decidir o schema. Os grants clínicos continuam em `user_clinical_roles`,
  fora do JWT.
- Tenant isolation, PII mascarada, audit append-only, sem delete físico,
  separação financeiro-da-clínica × billing-da-plataforma — tudo inalterado.
- Cobrança real continua **bloqueada** (CNPJ + contrato/termos/LGPD + ADR 5.2A).

---

## 9. O que **NÃO** fazer agora (guard-rails)

- **Não** criar vários donos equivalentes sem Titular.
- **Não** dar acesso clínico automático para Administrador/Sócio.
- **Não** permitir remover o Titular sem fluxo formal de transferência.
- **Não** misturar billing/assinatura com grant clínico.
- **Não** modelar participação societária (cotas, contrato social) — fora de
  escopo permanente sem nova ADR.
- **Não** implementar antes da **ADR 5.2A (Produção Segura)** e de um billing mais
  maduro — **salvo** se uma necessidade concreta do piloto exigir (decisão
  explícita do dono do produto, registrada em ADR/sprint).

---

## 10. Pré-requisitos para implementar

1. ADR 5.2A (Produção Segura AWS) — antes de dado real.
2. Billing mais maduro (ADR 0018 → checkout/webhook de produção) **ou** decisão
   explícita de que governança roda sem billing real no piloto.
3. Sinal de necessidade real (clínica-piloto com sócios) — não implementar
   especulativamente.

---

## 11. Riscos

- **Risco de escopo:** governança puxa para RBAC genérico. Mitigação: matriz por
  grupo (A/B/C) fixa e pequena; sem ACL por recurso no v0.1.
- **Risco de segurança:** Administrador mal modelado vira atalho para PII clínica.
  Mitigação: eixo clínico permanece estritamente por grant (ADR 0009) + audit
  STRICT.
- **Risco de captura/disputa:** sócio remove o outro. Mitigação: Titular único +
  janela de carência/dupla confirmação + notificação nas ações do grupo A.
- **Risco de billing:** "quem paga manda em tudo". Mitigação: eixos separados;
  invariantes ADR 0018.
- **Risco de compatibilidade:** quebrar contas existentes. Mitigação:
  `dono_clinica` → Titular inicial; zero administradores = comportamento atual.

---

## 12. Sequência de sprints proposta (sem código agora)

| Sprint | Tipo | Conteúdo |
|---|---|---|
| **6.0N** (esta) | docs/ADR-only | Modelo de governança, nomenclatura, matriz de ações, impacto, guard-rails. |
| **6.1A** (futura) | docs + schema design | Schema de governança: como representar Titular + Administrador (flag em `users`? tabela `clinic_admins`? estender papel?), regras de transferência, eventos de audit. Decide quem pode conceder grant clínico no alvo. Sem migration ainda ou migration mínima revisada. |
| **6.1B** (futura) | backend | Enforcement da matriz A/B/C, fluxo de convite com nível de governança, transferência de titularidade, remoção de administrador, eventos de audit. |
| **6.1C** (futura) | frontend | UI de governança (Titular/Administrador/Equipe), convites por nível, telas de transferência/offboarding, nomenclatura §3. |
| **6.1D** (futura) | audit/QA | Smoke por papel (Titular, Administrador, Funcionário, +grants), tenant isolation, casos de disputa/offboarding, LGPD/audit, regressão Demo Aurora. |

Cada sprint futura exige sua própria autorização; nenhuma é desbloqueada
automaticamente por esta ADR.

---

## 13. Consequências

- **Positivas:** modela a dor real (sócios/coadministradores) sem criar
  ambiguidade de titularidade; separa governança, clínica e billing de forma
  limpa; preserva LGPD e tenant isolation; degrada para o estado atual.
- **Negativas/custos:** introduz um novo eixo de autorização (mais superfície de
  teste); exige fluxo formal de transferência (mais UX); decisões de schema
  adiadas para 6.1A.
- **Reversibilidade:** alta — docs-only. Nada é implementado; a 6.1A pode revisar
  qualquer escolha de naming/modelo antes de qualquer código.
