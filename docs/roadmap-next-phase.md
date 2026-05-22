# ClinicBridge — Roadmap da Próxima Fase

> Direção definida no ADR `docs/adr/0001-product-direction-option-c.md`
> (Opção C — base administrativa segura primeiro, expansão clínica futura
> planejada, não implementada). Este roadmap é **sugestão de sequência**, não um
> compromisso de datas. Nada aqui autoriza código clínico: as Fases 5–7 são de
> planejamento e exigem ADR(s) futura(s) dedicada(s) antes de qualquer
> implementação.

## Princípios

- Consolidar o administrativo até produção antes de assumir complexidade clínica.
- Manter a fronteira administrativo vs. clínico explícita em domínio e banco.
- Cada salto de risco (clínico, prescrição) começa por documentação/decisão, não
  por código.
- Falar em **preparação e requisitos**, nunca em "compliance completo".

---

## Fase 3 — Produção e governança administrativa (próxima prioridade)

Objetivo: tornar a base administrativa apta a produção, com governança real.

- `requireRole` / gating dono-admin nos endpoints administrativos sensíveis
  (inclui retenção e, futuramente, limpeza real) — **feito (Sprint 3.1)**;
- trust proxy configurado (IP correto atrás de proxy para rate limit/logs) —
  **feito (Sprint 3.2)**;
- Redis / shared store para rate limit (substituir o store em memória do MVP) —
  **feito (Sprint 3.2)**;
- política LGPD de retenção (prazos, base legal, fluxo) — **avançada (Sprint 3.3):
  política técnica inicial + ADR 0002 criadas** (`docs/data-retention-policy.md`);
  **pendente: validação jurídica** dos prazos/base legal e a limpeza real futura;
- backup / restore (validado de ponta a ponta) — **pendente**;
- deploy seguro (segredos, hardening de runtime, healthchecks) — **pendente**;
- revisão de CORS/env de produção (`FRONTEND_ORIGIN` sem `*`) — **pendente**;
- signed URL para download de arquivos de importação **apenas se** houver caso de
  uso real (não implementar especulativamente).

## Fase 4 — Operação e UX administrativa

Objetivo: melhorar operação do dia a dia sobre o que já existe.

- histórico visual de auditoria (read-only, sem PII);
- UX de revisões/importações (clareza de status e próximos passos);
- paginação de duplicados;
- export streaming/assíncrono para bases grandes;
- limpeza real de arquivos com soft-delete/quarentena/auditoria/idempotência/lock
  (evolução do dry-run atual; ainda administrativo);
- melhor organização do Dashboard.

## Fase 5 — Preparação clínica (ainda SEM prontuário, SEM código clínico)

Objetivo: planejar o domínio clínico. Entregáveis são **documentos**, não código.

- domain design clínico (entidades, fronteiras, linguagem ubíqua);
- matriz de risco;
- modelo de permissões (papéis, escopos, herança);
- estratégia de audit/versionamento clínico;
- separação clara administrativo vs. clínico (domínio e banco);
- threat model específico do domínio clínico;
- LGPD/termos específicos (base legal, consentimento, retenção).

> Saída esperada da Fase 5: uma ADR clínica que satisfaça os "Critérios para
> abrir uma fase clínica" do ADR 0001. Sem ela, a Fase 6 não começa.

## Fase 6 — Clinical Core experimental (somente após aprovação/ADR futura)

Objetivo (condicional): primeiro núcleo clínico mínimo e seguro.

- encounters / atendimentos;
- notas clínicas versionadas;
- visualização segura;
- auditoria de acesso (leitura e escrita);
- **sem** prescrição inicialmente;
- **sem** medicamentos/CID inicialmente, salvo nova decisão registrada.

## Fase 7 — Prescrição eletrônica (somente muito depois, com ADR própria)

Objetivo (condicional, maior risco):

- estudo regulatório Brasil (CFM e normas aplicáveis);
- ICP-Brasil (viabilidade/custo/provedor);
- assinatura digital;
- workflow de emissão/cancelamento/validade;
- regras de retenção;
- logs/audit específicos;
- avaliação de risco jurídico;
- integração futura (farmácias/órgãos), se aplicável.

---

## Resumo de gating

| Fase | Natureza | Pré-requisito para começar |
|------|----------|----------------------------|
| 3 | Administrativo (código) | nenhuma decisão extra — é a próxima prioridade |
| 4 | Administrativo (código) | Fase 3 em bom estado |
| 5 | Planejamento (docs) | apetite por explorar o clínico |
| 6 | Clínico (código) | ADR clínica aprovada (critérios do ADR 0001) |
| 7 | Prescrição (código) | Fase 6 + ADR de prescrição + análise regulatória/ICP-Brasil |
