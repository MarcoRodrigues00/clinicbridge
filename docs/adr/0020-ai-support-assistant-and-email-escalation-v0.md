# ADR 0020 — Assistente de Suporte por IA (Auri Ajuda) + Escalonamento por E-mail v0.1

> **Status:** Proposta (docs/ADR-only) — **nenhum código, schema, migration, endpoint, env, secret, SDK ou integração foi criado.**
>
> **Sprint:** docs/ADR-only (a implementar em sprint futura própria, faseada)
>
> **Data:** 2026-06-03
>
> **Relacionado:**
> `docs/adr/0008-clinicbridge-clinic-os-expansion.md` ·
> `docs/adr/0009-clinical-architecture-roles-read-audit.md` (eixo clínico — esta ADR **não** o toca) ·
> `docs/adr/0010-clinical-encounters-medical-record-v0.md` ·
> `docs/adr/0011-medical-documents-prescriptions-v0.md` ·
> `docs/security-notes.md` · `docs/ClinicBridge_Documentacao_Mestre.md` ·
> Persona **Auri** existente (`GuidedDemoTour.tsx`, tour guiado / demo).
>
> **O que esta ADR autoriza:** decidir e documentar a arquitetura de um assistente
> de **suporte ao uso do produto** (não clínico) com **fallback humano por e-mail**.
> **Não autoriza** nenhuma IA clínica, nenhuma ação da IA sobre dados do tenant,
> nenhum código nesta sprint.

---

## 1. Contexto

O ClinicBridge entregou base administrativa + módulos v0.1 e uma experiência de
onboarding guiada com a mascote **Auri** (tour por passos, scriptado). Hoje, quando
um usuário não-técnico (secretária, médico, dono de clínica) tem uma dúvida de
**como usar** o sistema ("onde lanço uma cobrança?", "como importo meus pacientes?",
"por que não vejo o financeiro?"), não há canal de ajuda dentro do app: ou ele
descobre sozinho, ou desiste. Isso afeta diretamente a percepção de "bom serviço".

O fundador quer um **assistente de IA para perguntas simples** e, **quando a IA não
resolver, oferecer ao cliente abrir um chamado por e-mail** para a equipe humana.

Esta ADR define **o que esse assistente é e o que ele nunca pode ser**, porque o
CLAUDE.md lista **"IA clínica" como permanentemente fora de escopo sem ADR própria**.
A fronteira entre "ajuda de produto" e "decisão clínica" é o ponto mais importante
deste documento.

**Distinção crítica (não confundir):**

| Conceito | O que é | Status |
|---|---|---|
| **Assistente de suporte** (esta ADR) | IA que responde **como usar o ClinicBridge** (navegação, funcionalidades, conceitos administrativos). Conhecimento = documentação do produto. | Proposto |
| **IA clínica** (proibida) | Qualquer IA que sugira diagnóstico, conduta, prescrição, triagem, interpretação de exame, ou opere sobre dados de paciente/prontuário. | **Fora de escopo permanente** |

Esta ADR trata **exclusivamente** do primeiro.

---

## 2. Decisão (resumo)

1. Criar um **assistente de suporte conversacional** ("Auri Ajuda"), evolução da
   persona Auri, disponível **dentro do app para usuários autenticados**.
2. Escopo **estritamente de produto/uso**: responde dúvidas sobre como operar o
   ClinicBridge. **Recusa** qualquer pergunta clínica ou que exija dado de paciente.
3. Respostas **ancoradas (grounded)** numa base de conhecimento curada (documentação
   do produto / FAQ), não em "conhecimento livre" do modelo — para minimizar
   alucinação. Tom: linguagem simples, público leigo de saúde.
4. **Fallback humano por e-mail**: quando a IA tem baixa confiança, está fora de
   escopo, ou o usuário não fica satisfeito, o assistente oferece **abrir um chamado
   de suporte por e-mail**. O chamado vai para a equipe ClinicBridge.
5. **Nenhum dado pessoal de paciente** (PII clínica/administrativa) é enviado ao
   provedor de IA. O assistente opera sobre conhecimento do produto, não sobre o
   banco do tenant.
6. **Backend-only** para a chamada de IA: a API key do provedor nunca vai ao
   frontend. Tenant-scoped, com rate limit, audit e teto de custo.
7. Provedor de IA preferido: **Claude API (Anthropic)**, modelo econômico (Haiku)
   para Q&A de suporte, com **prompt caching** do system prompt + base de
   conhecimento. Atrás de uma **abstração de provider** (anti-lock-in).

---

## 3. Escopo do assistente — o que é e o que **nunca** é

### 3.1 Pode (suporte de produto)
- "Como faço para importar meus pacientes?" → explica o fluxo de importação.
- "Onde vejo as cobranças em aberto?" → orienta a aba Financeiro.
- "Por que não consigo ver o prontuário?" → explica papéis/permissões em linguagem simples.
- "O que é um convênio aqui?" → explica o conceito administrativo do módulo.
- "Como exporto meus dados?" → explica export administrativo.

### 3.2 **NUNCA** pode (recusa obrigatória → fallback)
- Qualquer **conteúdo clínico**: diagnóstico, conduta, dosagem, interpretação de
  sintoma/exame, "o que esse paciente tem", prescrição. → Recusa padrão + sugere
  profissional habilitado; **nunca opina**.
- Operar sobre **dados de um paciente específico** ("qual o CPF da Maria?", "liste
  os pacientes diabéticos"). A IA **não tem acesso ao banco do tenant**.
- **Executar ações** (criar/editar/excluir cobrança, paciente, etc.). É somente
  informativa — **nunca** escreve nem dispara mutação.
- Aconselhamento **jurídico, contábil, fiscal ou regulatório** vinculante (LGPD,
  TISS, NFS-e, ANVISA): pode explicar que o produto **não** faz, mas não dá parecer.

### 3.3 Guarda de escopo (mecanismo)
- **System prompt restritivo** define o papel ("você ajuda a usar o ClinicBridge;
  não dá orientação clínica/jurídica; não acessa dados de paciente").
- **Grounding obrigatório**: a resposta deve se apoiar na base de conhecimento de
  produto; se a pergunta sai disso, responder "não sei sobre isso" + oferecer
  fallback — **nunca improvisar**.
- **Classificador de intenção** (barato) antes da resposta: se a pergunta é clínica
  / pede PII / pede ação → curto-circuito para recusa + fallback, sem chamar o
  modelo de geração com qualquer dado sensível.

---

## 4. Arquitetura proposta (sem implementar)

Mantém **MVC + DAO + Service** e as invariantes do projeto.

```
Frontend (Auri Ajuda — chat)            Backend
┌───────────────────────────┐           ┌───────────────────────────────────────┐
│ widget de chat (logado)   │  POST     │ aiAssistantController                  │
│ - sem API key             │ ───────►  │  requireAuth + requireClinic + rate    │
│ - mostra resposta + CTA   │ /assistant│  limit + blockDemoWrites(GET-only? não:│
│   "falar com a equipe"    │  /ask     │  é POST; demo → resposta canned)       │
└───────────────────────────┘           │     │                                  │
                                        │     ▼                                  │
                                        │ aiAssistantService                     │
                                        │  1. sanitiza/recusa (intenção/PII)     │
                                        │  2. monta prompt = system + KB + msg   │
                                        │  3. chama provider (abstração)         │
                                        │  4. pós-filtro + nível de confiança    │
                                        │  5. audit (metadata-only, sem PII)     │
                                        └─────────────┬──────────────────────────┘
                                                      ▼
                                        Billing/AI provider (Anthropic) — server-side
```

- **Rota:** `POST /assistant/ask` (e futura `/assistant/escalate`), gated por
  `requireAuth` + `requireClinic`. Resposta **somente texto de ajuda**, sem PII.
- **Service:** `aiAssistantService` — toda a lógica (sanitização, grounding,
  chamada, confiança, audit). Testável sem a camada web.
- **Provider atrás de interface** (`AiProvider`) — igual ao padrão de billing
  (ADR 0018) para não acoplar ao SDK.
- **Sem novo dado clínico, sem tocar prontuário/financeiro/pacientes.**

---

## 5. Base de conhecimento e grounding (anti-alucinação)

- **v0 (mais simples e barato):** base de conhecimento curada = FAQ/guia de uso do
  produto mantida em `docs/` (ou tabela de artigos de ajuda), injetada no prompt
  (cabe no contexto; usar **prompt caching** para baratear). Sem vetor/RAG no v0.
- **v1 (se a base crescer):** RAG — embeddings dos artigos de ajuda + recuperação
  dos trechos relevantes por pergunta. Decisão adiada; só se o FAQ no prompt ficar
  grande demais.
- **Regra de ouro:** se a resposta não está apoiada na base → "não tenho essa
  informação; quer que eu encaminhe sua dúvida para a equipe?" (fallback). Melhor
  recusar do que inventar — especialmente para público de saúde.

---

## 6. Fallback humano (e-mail / chamado)

Gatilhos para oferecer e-mail:
1. IA **fora de escopo** (clínico/jurídico/PII/ação).
2. IA com **baixa confiança** / sem apoio na base.
3. Usuário **insatisfeito** ("não resolveu", botão "falar com a equipe").

Fluxo:
- O assistente oferece: **"Quer enviar isso para a nossa equipe por e-mail?"**
- Ao confirmar, monta um **chamado de suporte** com: identidade do usuário
  (nome/e-mail do **funcionário/dono**, não de paciente), nome da clínica, a
  **pergunta de produto** e contexto técnico mínimo (aba/rota, navegador) — **nunca
  PII de paciente nem dado clínico**.
- Envia para a caixa de suporte ClinicBridge via **provedor de e-mail transacional**
  (a definir; AWS SES é candidato natural pela preferência de infra, ou SMTP/Resend).
- Confirma ao usuário ("recebemos, respondemos em X") e **audita** (metadata-only).

> O e-mail é **suporte ao usuário do sistema** (funcionário/dono), **não** um canal
> de dados de paciente. O formulário deve impedir/avisar contra colar PII de
> paciente.

---

## 7. Segurança

- **API key do provedor** só no backend (env), **nunca** no frontend; nunca logada.
- Chamada de IA atrás de `requireAuth` + `requireClinic`; **rate limit** por usuário
  e por clínica (anti-abuso e anti-custo).
- **Prompt injection:** tratar a mensagem do usuário como **dado não confiável**; o
  system prompt e a base de conhecimento têm precedência; o modelo **não** tem
  ferramentas/ações (é só geração de texto) — então não há "ação perigosa" possível.
- **Sem ferramentas/function-calling com efeito colateral** no v0 (o assistente não
  cria/edita nada). Se um dia houver "ações guiadas", exige nova ADR.
- `errorHandler` continua sem vazar stack/SQL/chaves; falha da IA → mensagem
  amigável + oferta de e-mail (degradação graciosa).
- **Demo:** na demo guiada, o assistente responde de uma **base canned** (sem
  chamada externa) ou é desabilitado — coerente com o `blockDemoWrites`/`is_demo`.

---

## 8. LGPD

- **Minimização e finalidade:** o provedor de IA recebe **apenas** a pergunta de
  produto + a base de conhecimento. **Nenhum dado pessoal de paciente** (CPF, nome,
  telefone, e-mail, carteirinha, prontuário, diagnóstico) é enviado.
- **Filtro de PII de entrada:** se o usuário colar algo que pareça PII (CPF,
  padrões), o sistema **redige/bloqueia** antes de qualquer envio e orienta.
- **Sub-processador:** usar IA de terceiros torna o provedor um **operador/
  sub-processador**. Exige: cláusula no contrato/política de privacidade, base
  legal, e idealmente **opção de não-treinamento** (zero-retention / no-train) do
  provedor. Documentar antes de produção.
- **Audit:** registrar que houve uma interação de suporte (metadata-only: usuário,
  clínica, timestamp, "escopo: produto", se houve fallback). **Nunca** logar o
  conteúdo se houver risco de PII; preferir hash/contadores.
- **Transparência:** avisar no widget que é um assistente de IA de **suporte ao
  uso**, que **não** dá orientação clínica e **não** acessa dados de pacientes.

---

## 9. Tenant isolation

- A rota é tenant-scoped (`requireClinic`); o chamado/escalação carrega `clinica_id`
  do JWT. O assistente **não consulta** dados de outro tenant — na prática **não
  consulta dado de tenant nenhum** (opera sobre conhecimento de produto).
- Se um dia o assistente puder responder "estado da sua conta" (ex.: "seu plano é
  Profissional"), isso virá de dados **já expostos ao próprio usuário** e
  tenant-filtrados — **nunca** PII de paciente. Decisão adiada.

---

## 10. Custos e guard-rails

- **Modelo econômico** (Haiku) para suporte; **prompt caching** do system+KB para
  cortar custo por mensagem.
- **Tetos:** limite de mensagens por usuário/clínica/dia; `max_tokens` curto;
  truncar histórico. Alertar/curto-circuitar para fallback quando estourar.
- **Kill switch** por env (`AI_ASSISTANT_ENABLED`) para desligar sem deploy.
- Monitorar custo agregado; o fallback por e-mail é o "escape" barato quando a IA
  não agrega.

---

## 11. Escolha de provider / modelo

- **Preferido: Claude API (Anthropic)** — alinhado ao ecossistema, bom custo-benefício
  em Haiku, suporte a prompt caching, e forte em seguir instruções de escopo.
- **Abstração `AiProvider`** isola o SDK (trocar de modelo/provedor sem reescrever o
  service), espelhando o padrão de `BillingProvider` (ADR 0018).
- Decisão final de modelo/limites fica para o **spike de implementação**.

---

## 12. Alternativas consideradas

1. **Só FAQ estático / busca (sem IA).** Mais barato e zero risco de alucinação,
   mas não atende "perguntas em linguagem natural". → Pode ser o **degrau 0**; a IA
   melhora a experiência. Mantemos o FAQ como base de grounding de qualquer forma.
2. **Chatbot de fluxo fixo (árvore de decisão).** Previsível, mas rígido e frustrante.
   Descartado como solução principal.
3. **IA com acesso ao banco do tenant (function-calling/SQL).** Poderoso, mas
   **alto risco** de PII/LGPD, tenant-leak e ação indevida. **Rejeitado no v0** —
   exigiria ADR própria e controles muito mais pesados.
4. **Só e-mail (sem IA).** É o fallback; sozinho não entrega o "responder na hora".

Decisão: **IA de suporte ancorada (alt. principal) + FAQ como base (alt. 1) +
e-mail como fallback (alt. 4).**

---

## 13. Fora de escopo (v0.1)

- IA clínica de qualquer tipo (diagnóstico, conduta, prescrição, triagem, exame).
- IA que **lê** dados de paciente/prontuário/financeiro do tenant.
- IA que **executa ações** (criar/editar/excluir, mutar assinatura, etc.).
- Assistente público pré-login / atendimento ao **paciente** (é interno à equipe da
  clínica no v0).
- Voz, telefonia, WhatsApp, multagente, automações.
- Parecer jurídico/fiscal/regulatório vinculante.

---

## 14. O que **NÃO** fazer agora (guard-rails de implementação)

- Não commitar chave de IA; `.env.example` só com placeholder.
- Não enviar **nenhum** campo de paciente ao provedor.
- Não dar ao modelo ferramentas com efeito colateral.
- Não ligar o assistente na demo com chamada externa real.
- Não prometer no UI que a IA "resolve tudo" — deixar claro que é **suporte** e que
  há um humano por trás (e-mail).

---

## 15. Pré-requisitos para implementar

1. **Base de conhecimento de ajuda** curada (FAQ/guia de uso) — pode começar pequena.
2. **Provedor de e-mail transacional** configurado (SES/SMTP/Resend) + caixa de
   suporte. (Hoje o projeto não tem envio de e-mail — é dependência.)
3. **Conta/credenciais do provedor de IA** + decisão de modelo/limites no spike.
4. Cláusula de **sub-processador de IA** na política de privacidade/contrato (LGPD).
5. Decisão de **custo/teto** e telemetria.

---

## 16. Sequência de sprints proposta (sem código agora)

- **Sprint A — Fundamentos de suporte (sem IA):** base de conhecimento (FAQ) +
  envio de e-mail transacional + botão "Falar com a equipe" (abre chamado por
  e-mail). Já entrega o **fallback humano** sozinho.
- **Sprint B — Assistente ancorado (IA):** `aiAssistantService` + abstração
  `AiProvider` + `POST /assistant/ask` com grounding na base do Sprint A + recusa de
  escopo + rate limit + audit. Auri vira chat.
- **Sprint C — Polimento:** confiança/heurística de fallback, tetos de custo,
  prompt caching, métricas de resolução, kill switch.
- **(Futuro, ADR própria) — RAG** se a base crescer; **"ações guiadas"** se um dia
  o assistente puder operar com confirmação do usuário.

---

## 17. Riscos

| Risco | Mitigação |
|---|---|
| **Alucinação** (resposta errada a leigo de saúde) | Grounding obrigatório; recusar quando sem apoio; fallback humano. |
| **Vazamento de PII** ao provedor | Não enviar dado de tenant; filtro/recusa de PII na entrada; sub-processador com no-train. |
| **Cruzar para conteúdo clínico** | System prompt + classificador de intenção + recusa padrão. |
| **Custo descontrolado** | Modelo econômico, caps por usuário/clínica, caching, kill switch. |
| **Prompt injection** | Mensagem = dado não confiável; sem ferramentas com efeito colateral. |
| **Dependência de e-mail inexistente** | Sprint A entrega o canal de e-mail antes da IA. |
| **Expectativa exagerada** | Copy honesta: "suporte ao uso"; humano por trás. |

---

## 18. Consequências

- **Positivas:** percepção de "bom serviço" (ajuda na hora + humano quando preciso);
  reduz fricção de onboarding; reaproveita a marca Auri; arquitetura isolada e
  reversível (kill switch); fortalece o diferencial de **experiência** frente a
  concorrentes maiores.
- **Negativas/custos:** novo sub-processador (LGPD), custo recorrente de IA,
  necessidade de manter a base de conhecimento, e dependência nova de e-mail
  transacional.
- **Reversibilidade:** alta — desligável por env; sem schema clínico novo; sem dado
  de paciente envolvido.

---

## 19. Referências

- `docs/adr/0008-clinicbridge-clinic-os-expansion.md` (modularidade, gates de ADR)
- `docs/adr/0009-clinical-architecture-roles-read-audit.md` (eixo clínico — não tocado)
- `docs/adr/0018-plans-billing-entitlements-v0.md` (padrão de abstração de provider)
- `docs/security-notes.md` · `docs/ClinicBridge_Documentacao_Mestre.md`
- CLAUDE.md — "IA clínica" fora de escopo sem ADR (esta ADR delimita **suporte**, não clínica)
