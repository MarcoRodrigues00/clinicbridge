# ADR 0001 — Product Direction — Opção C: base administrativa segura com expansão clínica futura

- **Status:** Accepted
- **Data:** 2026-05-22
- **Decisores:** dono do produto (ClinicBridge)
- **Relacionado:** `docs/roadmap-next-phase.md`, `docs/security-notes.md`, `docs/project-state.md`

## Contexto

A Sprint 2 foi fechada com sucesso. O ClinicBridge hoje é um SaaS / Micro SaaS
focado em **migração segura de dados administrativos** de clínicas: auth, upload
CSV/XLSX validado por magic bytes, preview, mapeamento, validação full-file,
sessões de migração, dry-run, mark-ready, importação controlada, recibo
persistido, listagem de pacientes administrativos (CPF mascarado), detecção de
duplicados read-only, export CSV/XLSX, hardening/rate limit, retenção dry-run
(backend + painel frontend) e responsividade mobile.

O produto **não** está pronto para produção (ver ressalvas P1 em
`docs/security-notes.md`) e **não** contém prontuário, diagnóstico, prescrição,
exames, CID, medicamentos ou qualquer dado clínico.

Era preciso decidir oficialmente o rumo da próxima fase. As opções consideradas,
em resumo:

- **Opção A — só administrativo:** congelar o escopo administrativo, sem nenhuma
  preparação para o domínio clínico. Simples, mas fecha portas de evolução.
- **Opção B — pivot clínico agressivo:** começar prontuário/prescrição logo.
  Alto valor potencial, mas alto risco regulatório/jurídico/segurança e desvio do
  que já está validado e vendável.
- **Opção C — híbrido inteligente (escolhida):** consolidar primeiro a base
  administrativa segura e vendável, **mantendo a arquitetura preparada** para uma
  futura expansão clínica que só acontecerá em fase separada, com requisitos
  próprios e decisão/ADR dedicada antes de qualquer código.

## Decisão

Adotar a **Opção C**:

1. O ClinicBridge será **consolidado primeiro** como produto de migração
   administrativa segura, auditável e vendável.
2. A arquitetura será **mantida preparada** para expansão clínica futura
   (fronteiras claras, isolamento por tenant, auditoria, papéis), **sem** criar
   tabelas, entidades ou endpoints clínicos agora.
3. Prontuário, prescrição e dados clínicos **não** serão implementados no MVP
   atual.
4. A entrada no domínio clínico exigirá uma **ADR futura dedicada** (e, para
   prescrição, análise regulatória) **antes de qualquer código**.

Esta decisão é uma direção de produto/arquitetura. Não introduz feature, tabela,
migration nem dependência.

## Consequências positivas

- Foco: termina de tornar a base administrativa pronta para produção e venda
  (governança da Fase 3) antes de assumir complexidade clínica.
- Risco controlado: evita risco regulatório/jurídico/segurança prematuro
  (LGPD, CFM, ICP-Brasil) enquanto o valor administrativo é capturado.
- Evolução preservada: a arquitetura permanece extensível; nenhuma porta é
  fechada para o domínio clínico.
- Clareza de escopo: cada tarefa futura sabe o que é administrativo (permitido
  agora) versus clínico (bloqueado até ADR futura).

## Consequências negativas / trade-offs

- O valor clínico (maior diferenciação) fica adiado.
- Exige disciplina contínua para **não** vazar features clínicas dentro de
  sprints administrativas.
- Algum trabalho de "preparação" (papéis, auditoria, fronteiras) é feito antes do
  retorno clínico aparecer.
- Risco de over-engineering se a "preparação para o clínico" for longe demais sem
  necessidade — manter a preparação proporcional e documentada, não especulativa.

## O que entra no escopo agora

- Tudo que é **administrativo**: evolução do pipeline de importação/migração,
  pacientes administrativos (listar/duplicados/export read-only), auditoria,
  governança e endurecimento para produção (Fase 3) e melhorias de operação/UX
  administrativa (Fase 4).
- **Preparação arquitetural** que também serve ao administrativo: `requireRole`/
  papéis, fronteiras de módulo, auditoria de acesso, separação conceitual
  administrativo vs. clínico (sem entidades clínicas).

## O que fica fora do escopo agora

- prontuário / dados clínicos;
- diagnóstico;
- prescrição;
- exames;
- CID;
- medicamentos;
- qualquer tabela, entidade, endpoint, migration ou tela clínica;
- edição/exclusão/merge de pacientes (continua fora até sprint explícita);
- promessa de produto "pronto para produção";
- afirmação de conformidade total com LGPD/HIPAA/CFM/ICP-Brasil (falamos em
  **preparação e requisitos**, não em compliance completo).

## Critérios para abrir uma fase clínica no futuro

Uma fase clínica (ex.: Fase 6 do roadmap) só pode ser aberta quando **todos**
estiverem satisfeitos e registrados em uma ADR futura dedicada:

1. Base administrativa em produção com governança da Fase 3 concluída
   (`requireRole`, rate limit com shared store, trust proxy, backup/restore,
   deploy seguro, CORS/env de produção revisados).
2. Modelo de papéis/permissões implementado e testado (testes de autorização).
3. Auditoria forte de **acesso/leitura** disponível (não só de escrita).
4. Separação clara administrativo vs. clínico no domínio e no banco.
5. Threat model específico do domínio clínico revisado.
6. Política LGPD específica para dado clínico (base legal, consentimento,
   retenção, export/exclusão) definida.
7. Estratégia de versionamento de notas clínicas definida.
8. Backup/restore validado de ponta a ponta.
9. Decisão regulatória inicial registrada (o que é permitido guardar/exibir).

## Critérios para abrir prescrição no futuro

Prescrição eletrônica (Fase 7) é o tópico de maior risco e só entra após a fase
clínica e com ADR própria, exigindo no mínimo:

1. Estudo regulatório do Brasil concluído (CFM e normas aplicáveis).
2. Definição de assinatura digital com **ICP-Brasil** (avaliação de viabilidade,
   custo e provedor).
3. Workflow de emissão/cancelamento/validade com auditoria completa.
4. Regras de retenção e logs/audit específicos para prescrição.
5. Avaliação de risco jurídico e responsabilidade profissional.
6. Plano de integração futura (farmácias/órgãos), se aplicável.

> Nota: este ADR descreve **preparação e requisitos**. Não afirma conformidade
> completa com LGPD/HIPAA/CFM/ICP-Brasil — essa conformidade dependerá das fases
> e decisões futuras acima.
