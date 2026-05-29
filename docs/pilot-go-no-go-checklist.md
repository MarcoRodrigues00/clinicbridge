# ClinicBridge — Checklist Go/No-Go do Piloto

> **Sprint:** 5.0A (docs-only)
> **Data:** 2026-05-27
> **Contexto:** Usar este checklist antes de iniciar cada fase do piloto.
> Ver `docs/pilot-controlled-plan.md` para o plano completo.
>
> **Nota 2026-05-29 (6.1E):** **GOV-NEW-1 resolvido** — clínica recém-registrada agora
> nasce com titular de governança (validado por smoke: 1 titular + promote 201). O piloto
> familiar com **conta real limpa** deixa de estar bloqueado por esse item. **Pendências
> conhecidas a comunicar aos participantes:** revoke de administrador e transferência de
> titularidade ainda não existem. **Este checklist está desatualizado** (migrations 20/0,
> ADR renomeada 5.1A→5.2A, itens de governança) — refresh completo é item PILOT-3 da
> `docs/super-review-6-2A.md`. Dados reais e cobrança real seguem **NO-GO** (gate 5.2A).

---

## Checklist 1 — Preparação do ambiente (antes de começar)

### Ambiente e infraestrutura

- [ ] Docker Compose rodando sem erro (`docker compose up -d` + `curl localhost:3001/health`)
- [ ] Frontend acessível (`localhost:5173` ou staging TLS)
- [ ] Banco de dados limpo ou com dados sintéticos conhecidos
- [ ] Migrations aplicadas sem pendências (`pnpm --filter backend migrate:status` → 18/0)
- [ ] Seed demo carregado se necessário (`pnpm --filter backend seed:demo`)
- [ ] Nenhum arquivo `.env` com credenciais reais versionado

### Usuários de teste

- [ ] Usuário `dono_clinica` criado e acessível
- [ ] Usuário `secretaria` (acesso administrativo) criado
- [ ] Usuário `profissional_clinico` criado (pelo menos 1, idealmente 2 — médico e psicóloga)
- [ ] Nenhum usuário usando e-mail real identificável (usar @piloto.local ou similar)
- [ ] MFA ativado e testado para pelo menos o usuário `dono_clinica`

### Dados sintéticos

- [ ] Pacientes cadastrados são fictícios (nome, CPF inválido, telefone/e-mail fictícios)
- [ ] Nenhum dado real de paciente importado
- [ ] Serviços cadastrados são genéricos (ex.: "Consulta Inicial", "Retorno", "Sessão")
- [ ] Convênios cadastrados com operadoras fictícias (ex.: "Plano Piloto")
- [ ] Itens de estoque genéricos (ex.: "Luva M", "Álcool Gel")
- [ ] Agendamentos com dados fictícios

### Segurança mínima

- [ ] MFA funcionando (TOTP ou backup codes)
- [ ] Rate limit ativo (testar tentativas repetidas de login)
- [ ] CORS restrito à origem correta (não `*`)
- [ ] Nenhum token/segredo em URL (verificar Network tab)
- [ ] `errorHandler` não expõe stack traces (verificar resposta de erro)

---

## Checklist 2 — Permissões (validar antes do piloto)

### Papel `profissional_clinico`

- [ ] Não acessa aba Financeiro → card "Acesso restrito" ou 403
- [ ] Não acessa aba Convênios → card "Acesso restrito" ou 403
- [ ] Não acessa aba Estoque → card "Acesso restrito" ou 403
- [ ] Não acessa relatórios financeiros (R-B/R-D) → card "Acesso restrito"
- [ ] Acessa apenas os próprios atendimentos clínicos (prontuário)
- [ ] Não acessa atendimentos de outro profissional

### Papel `secretaria`

- [ ] Não acessa prontuário clínico → 403
- [ ] Pode criar agendamento
- [ ] Pode criar cobrança
- [ ] Pode cadastrar carteirinha de paciente
- [ ] Pode registrar movimento de estoque
- [ ] Não pode criar/editar itens de estoque (CRUD)
- [ ] Não pode criar/editar operadoras/planos/preços de convênio

### Papel `dono_clinica`

- [ ] Acesso completo aos módulos administrativos
- [ ] Acesso ao read audit clínico (aba Segurança → Auditoria clínica)
- [ ] Pode convidar e aprovar membros
- [ ] Pode desativar membro
- [ ] Pode criar/editar/desativar itens de estoque
- [ ] Pode criar/editar operadoras e planos de convênio

### Isolamento entre clínicas

- [ ] Usuário de clínica A não vê dados da clínica B (cross-tenant → 404 ou 403)
- [ ] Pacientes de clínica A não aparecem em clínica B

---

## Checklist 3 — Logs e auditoria (verificar antes e durante)

- [ ] `audit_logs` não contém CPF, telefone, e-mail ou nome do paciente
- [ ] `audit_logs` não contém conteúdo clínico (chief_complaint, diagnóstico, prescrição)
- [ ] `audit_logs` de estoque não contém `reason` ou `notes` do movimento
- [ ] `audit_logs` de convênio não contém `member_number` ou `holder_name`
- [ ] Logger redige campos sensíveis (verificar output do backend em dev)
- [ ] Read audit clínico registra corretamente quando owner lê prontuário
- [ ] PDF de documento médico gera audit antes de servir

---

## Checklist 4 — PII na UI (verificar antes do piloto)

- [ ] `cpf_masked` na lista de pacientes (nunca CPF bruto)
- [ ] `member_number_masked` na lista de carteirinhas
- [ ] Número de carteirinha raw só aparece ao abrir edição (lazy fetch)
- [ ] Número de carteirinha limpo ao cancelar edição
- [ ] `holder_name` não aparece na lista de carteirinhas (apenas no formulário de edição)
- [ ] Nenhum UUID renderizado em telas de usuário final
- [ ] Nenhum `console.log` com dados sensíveis (verificar DevTools)
- [ ] Nenhum dado em `localStorage`/`sessionStorage` além do token

---

## Checklist 5 — Fluxos críticos sem erro (smoke rápido)

- [ ] Login → Dashboard carrega sem erro 500
- [ ] Criar paciente → salva e aparece na lista
- [ ] Criar agendamento → aparece na agenda
- [ ] Criar cobrança → aparece no financeiro
- [ ] Marcar cobrança como paga → status atualiza
- [ ] Criar item de estoque → aparece na lista
- [ ] Registrar movimento → quantidade atualiza (nunca negativa se saída > estoque)
- [ ] Gerar relatório do mês → carrega sem 500
- [ ] PDF de documento médico → download funciona

---

## Decisão Go/No-Go

### Go — Fase 1 (dados sintéticos)

**Pode iniciar o piloto controlado se:**

- [x] Checklists 1–5 completos (ou desvios documentados como aceitáveis)
- [x] Dados 100% sintéticos confirmados
- [x] MFA funcionando para o dono
- [x] Escopo explicado a todos os participantes
- [x] Critérios de parada aceitos (ver `pilot-controlled-plan.md` §7)
- [x] Backup local documentado (mesmo que simples)

**Veredicto:** ✅ **GO para Fase 1** após confirmar os checklists acima.

---

### No-Go — Fase 1

**Não iniciar se qualquer item abaixo for verdadeiro:**

- [ ] Dados reais necessários para demonstrar (substitua por sintéticos)
- [ ] MFA não testado
- [ ] Permissões de acesso cruzado não validadas
- [ ] Frontend quebrado em fluxo essencial (login, agenda, financeiro)
- [ ] Logs com PII detectados
- [ ] Token visível em URL ou localStorage além do padrão
- [ ] Dúvida jurídica/LGPD sem mitigação documentada

---

### Go — Fase 2 (dados anonimizados)

**Pode avançar para dados anonimizados se:**

- [ ] Fase 1 concluída sem critérios de parada acionados
- [ ] Processo de anonimização documentado e seguido
- [ ] Consentimento ou base legal definida (mesmo que operacional)
- [ ] Backup de staging documentado
- [ ] Logs revisados e sem PII confirmado
- [ ] Todos os participantes cientes do novo nível de dado

---

### No-Go — Fase 2

**Não avançar para dados anonimizados se:**

- [ ] Anonimização não documentada ou incompleta
- [ ] CPF, telefone, e-mail ou nome real ainda presente
- [ ] Conteúdo clínico identificável presente
- [ ] Logs ainda mostrando PII
- [ ] Backup insuficiente para ambiente com dados sensíveis

---

### Go — Fase 3 (dados reais / produção)

**Requer sprint 5.1A+ completa:**

- [ ] S3 bucket real configurado
- [ ] Banco de dados gerenciado (RDS ou equivalente)
- [ ] Redis gerenciado para sessões e rate limit
- [ ] WAF configurado
- [ ] HTTPS com domínio real e certificado válido
- [ ] Secrets em gerenciador (SSM ou Secrets Manager)
- [ ] Backup offsite agendado e testado (restore validado)
- [ ] Validação jurídica LGPD (prazos, base legal, fluxo art. 18)
- [ ] Política de retenção aprovada
- [ ] Termos de uso e privacidade publicados
- [ ] TRUST_PROXY configurado corretamente
- [ ] REDIS_URL em produção

**Veredicto:** ❌ **NO-GO para produção real** até sprint 5.1A+ concluída. Ver `docs/production-minimum-plan.md`.

---

## Checklist Pós-piloto

Após concluir o piloto controlado, antes de avançar:

- [ ] Feedback de UX coletado por persona (dono, secretária, profissional)
- [ ] Lista de bugs/ajustes registrada no backlog
- [ ] Fluxos que travaram documentados
- [ ] Tempo de treinamento registrado
- [ ] Módulos com melhor e pior recepção identificados
- [ ] Decisão documentada: avançar para Fase 2 ou aguardar correções
- [ ] Dados sintéticos limpos do ambiente (`seed:demo:clean` se aplicável)
- [ ] Nenhum dado do piloto exportado para canais inseguros
