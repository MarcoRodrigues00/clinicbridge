# ClinicBridge — Roadmap AWS-First + Trilha de Crescimento (sem CNPJ)

> **Criado 2026-06-03.** Define a direção decidida pelo fundador após a revisão
> competitiva (vs iClinic/Feegow) e a ADR 0020 (assistente de IA). **Decisão
> central: Opção B** — o **agendamento online** é o gatilho para **priorizar a
> Produção Segura na AWS (ADR 5.2A) primeiro**. O foco imediato vira a fundação
> AWS; em paralelo andam as features **sem CNPJ e de integração fácil** (assistente
> de IA + e-mail, agendamento online em construção). **Nada implementado ainda —
> este é o plano; cada item exige ADR própria antes de código.**
>
> **Não confundir com** `docs/roadmap-next-phase.md` (fases administrativas) e
> `docs/product-clinic-os-roadmap.md` (fases clínicas Clinic OS). Este doc é a
> **trilha estratégica atual**.

---

## 1. Posicionamento (onde competimos)

Em **amplitude/maturidade** estamos atrás de iClinic/Feegow (anos de produto +
integrações regulatórias). **Não competimos por amplitude agora.** Nosso *wedge*:

- **Migração inteligente** (custo de troca é o que prende clínicas a sistemas ruins).
- **Simplicidade para leigos de saúde** (UX guiada / Auri / copy sem jargão).
- **Segurança/LGPD-first + arquitetura limpa** (menos dívida, iteração segura).

A trilha abaixo **dobra a aposta nesse wedge** (experiência, suporte, baixa fricção)
em vez de tentar empatar feature-a-feature.

## 2. Princípios de priorização

1. **Fundação primeiro.** Produção segura na AWS (5.2A) é pré-requisito de qualquer
   dado real de paciente. Foi promovida a **prioridade nº 1**.
2. **Sem CNPJ por hora.** Só entram agora features que **não** exigem CNPJ
   (cobrança real, NFS-e, TISS ficam para depois).
3. **Integrar > construir.** Quando houver feature pesada, preferir parceiro
   (Memed, API fiscal) a construir do zero. TISS é a exceção sem atalho bom.
4. **Reversível e isolado.** Tudo desligável por env; sem dado de paciente em
   serviços externos de IA.
5. **Cada item tem ADR própria** antes de código (gate do CLAUDE.md / ADR 0008).

---

## 3. Trilha 0 — Fundação: Produção Segura AWS (ADR 5.2A) · **PRIORIDADE Nº 1**

**Por que agora:** Opção B — o agendamento online coleta **PII real de paciente**
(quem marca dá nome/telefone/e-mail). Para ir à rua com isso, precisamos de produção
segura. Decisão: **arrumar a AWS primeiro** e focar nisso.

**Não precisa de CNPJ** (é infraestrutura/segurança).

**Escopo (a detalhar na ADR 5.2A):**
- **ADR 5.2A** "Produção Segura AWS" — obrigatória antes de dados reais e de cobrança real.
- **S3 bucket real** para storage privado de uploads (hoje local).
- **Banco e Redis gerenciados** (RDS Postgres + ElastiCache/Redis).
- **WAF + edge** (sobre o que `docs/adr/0005` já desenhou) e **deploy** reproduzível.
- **Secrets gerenciados** (Secrets Manager) — fim de `.env` em produção.
- **`TRUST_PROXY` / `REDIS_URL`** corretos atrás do proxy (rate limit/`req.ip` válidos).
- **AWS SES** (e-mail transacional) — **provedor de e-mail escolhido = SES**, por
  alinhar com o foco AWS. Habilita o fallback do assistente e confirmações.
- **CLINICAL_READ_AUDIT_STRICT=true** e demais flags de produção.

**Insumos existentes:** `docs/production-minimum-plan.md`,
`docs/aws-infra-sprint-3.41-plan.md`, `docs/secrets-env-production-runbook.md`,
`docs/dns-tls-staging-runbook.md`, `docs/backup-restore-local-runbook.md`,
`docs/adr/0004` (deploy baseline), `docs/adr/0005` (edge/WAF).

**Realismo:** é a peça **mais substancial** do roadmap — deve ser **faseada**
(ex.: storage S3 → banco/Redis gerenciados → deploy/WAF → secrets → SES) e tem
**custo AWS recorrente**. Não é um sprint; é a fundação.

---

## 4. Trilha A — Suporte & Experiência (sem CNPJ) · em paralelo

### A1. Assistente de IA de suporte "Auri Ajuda" + e-mail (ADR **0020** — já escrita)
- **Suporte ao uso do produto, NUNCA IA clínica.** Não toca PII de paciente.
- **Sprint A (sem IA):** base de FAQ + **e-mail via SES** + botão "Falar com a
  equipe" → já entrega o **fallback humano** sozinho.
- **Sprint B (IA ancorada):** `aiAssistantService` + `POST /assistant/ask` +
  grounding na FAQ + recusa de escopo + rate limit + audit. Auri vira chat.
- **Provedor:** Claude API (Haiku) com prompt caching, atrás de abstração `AiProvider`.
- **Gate:** a parte de **IA não depende da 5.2A** (não usa dado de tenant). O e-mail
  transacional se beneficia do SES da Trilha 0 (pode usar SES sandbox antes).

### A2. Confirmações/lembretes — **padrão manual existente** (decisão do fundador)
- **NÃO** integrar gateway automático de SMS/WhatsApp (Meta exige verificação/CNPJ + custo).
- **Reusar o padrão que a app já tem:** `frontend/src/utils/reminders.ts` (monta
  link `wa.me` com mensagem pré-pronta) + botão "Abrir WhatsApp" da agenda
  (`AdministrativeSchedulePanel`). O **humano clica e envia**, e **muda o estado
  manualmente**. Pode-se acrescentar e-mail (SES) no mesmo modelo manual/assistido.
- **WhatsApp/SMS oficial automático = fora de escopo** (futura ADR, se um dia).

---

## 5. Trilha B — Agendamento Online (construir agora, **go-live após 5.2A**) · Opção B

- **Construir** a página de marcação pelo próprio paciente (disponibilidade por
  profissional, regras de horário, anti-abuso, sem enumeração/PII vazada).
- **Confirmação no padrão manual** da Trilha A2 (click-to-send + status manual) +
  e-mail SES opcional. Sem gateway automático.
- **Coleta PII real → liberar com paciente real só após a 5.2A.** Até lá, validar
  em **piloto/dados sintéticos**. **Este é o gatilho** que justifica priorizar a AWS.
- **Não precisa de CNPJ.**
- **ADR própria** antes de código (superfície pública nova = cuidado de segurança).

---

## 6. Trilha Bloqueada por gate (CNPJ / fiscal / clínico maduro) — **depois**

| Item | Bloqueado por | Caminho |
|---|---|---|
| **Cobrança real do SaaS** | CNPJ + contrato/LGPD + 5.2A | Gateway (ADR 0018 / spike Asaas) — após fundação |
| **NFS-e** | CNPJ + setup fiscal da clínica | **Integrar API fiscal** (Focus NFe/eNotas/PlugNotas) |
| **Prescrição digital** | CRM do médico + prontuário maduro (+ conta parceiro) | **Integrar Memed/Nexodata** (eles carregam a validade legal) |
| **TISS / convênio real** | Credenciamento ANS + complexidade | Por último; *table stakes*, não diferencial; manutenção eterna |

Cada um exige **ADR própria** quando desbloqueado.

## 7. Fora de escopo (decisão atual)

- **Teleconsulta** — evitada (vídeo + regras CFM + LGPD sensível).
- **App mobile nativo / PWA agora** — fora da trilha atual (foco na AWS). Revisitar depois.
- **API automática de WhatsApp/SMS** — mantemos o padrão manual.

---

## 8. Sequência e marcos

1. **ADR 5.2A** (Produção Segura AWS) → executar faseado: S3 → RDS/ElastiCache →
   deploy/WAF → Secrets → **SES**. *(prioridade nº 1)*
2. **Em paralelo:** ADR 0020 **Sprint A** (e-mail/FAQ/"Falar com a equipe") — usa SES.
3. **ADR Agendamento Online** + construção (go-live gated pela 5.2A).
4. **ADR 0020 Sprint B** (assistente de IA ancorado).
5. **Go-live** (após 5.2A sólida): agendamento com paciente real + IA + e-mail.
6. **Pós-fundação (gated):** cobrança real → NFS-e → prescrição (Memed) → TISS.

**Estado das ADRs:** 0020 (IA) ✅ escrita. A abrir: **5.2A** (AWS prod),
**Agendamento Online**, e as da trilha bloqueada.

## 9. Riscos e reversibilidade

| Risco | Mitigação |
|---|---|
| 5.2A é grande e custosa | Fasear; começar pelo mínimo (S3 + banco gerenciado); monitorar custo AWS |
| Agendamento expõe superfície pública | ADR de segurança própria; anti-abuso/rate limit; sem enumeração; PII só pós-5.2A |
| IA: alucinação / PII | Grounding + recusa de escopo + fallback e-mail; nada de PII de paciente ao provedor (ADR 0020) |
| Confirmação manual não escala | Aceitável no início; gateway automático é ADR futura quando houver demanda/CNPJ |
| Dependência de SES | SES sandbox cobre o começo; produção exige verificação de domínio |

**Reversibilidade:** alta — IA e e-mail desligáveis por env; agendamento atrás de
flag até a 5.2A; nenhuma feature bloqueada some por estar adiada.
