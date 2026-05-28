# ClinicBridge — Plano de Piloto Controlado

> **Sprint:** 5.0A (docs-only)
> **Data:** 2026-05-27
> **Status:** Rascunho operacional — não é contrato jurídico.
> **Próximos passos:** 5.0B Demo Dataset · 5.0C Página Demo/Tour · 5.1A Produção AWS

---

## 1. Objetivo do piloto

Validar usabilidade e valor do ClinicBridge em cenário realista de clínica pequena, com dados
sintéticos e ambiente controlado, **antes** de qualquer uso com dados reais identificáveis.

**O piloto valida:**
- Fluxos administrativos e operacionais do dia a dia.
- Navegação e clareza da interface para diferentes papéis (dono, secretária, profissional).
- Cobertura dos módulos para o cenário de clínica multi-serviço (médico, psicologia, potencialmente odontologia).
- Tempo de treinamento aceitável para equipe pequena.
- Critérios de parada identificados antes que causem dano.

**O piloto NÃO valida (fora de escopo):**
- Produção com dados reais sensíveis.
- Telemedicina, TISS real, ANS, NFS-e.
- Assinatura digital integrada com validade legal (ICP-Brasil).
- Medicamentos controlados ou SNGPC/ANVISA.
- WhatsApp automático.
- Checkout/billing de planos.
- Deploy AWS com dados reais.

---

## 2. Contexto do cenário

O piloto será conduzido em contexto familiar/controlado:

| Persona | Perfil | Papel no sistema |
|---------|--------|-----------------|
| **Médico** | Profissional de saúde | `dono_clinica` ou `profissional_clinico` |
| **Psicóloga** | Profissional de saúde | `profissional_clinico` |
| **Secretária/Admin** | Operacional | `secretaria` (acesso administrativo) |
| **Futuro profissional** | Odontologia ou outra especialidade | `profissional_clinico` (a ser configurado) |
| **Admin técnico** | Suporte técnico | Acesso restrito — sem acesso clínico |

**Importante:** cada profissional acessa apenas os próprios atendimentos clínicos (prontuário/documentos).
O financeiro e os dados administrativos dos pacientes são acessíveis conforme o papel configurado.

---

## 3. Fases do piloto

### Fase 1 — Piloto local com dados sintéticos (agora)

| Item | Detalhe |
|------|---------|
| Ambiente | Local (Docker Compose) ou staging TLS já configurado |
| Dados | 100% sintéticos — nomes fictícios, CPFs inválidos, datas fictícias |
| Objetivo | Validar usabilidade, fluxos e treinamento |
| Critério de saída | Fluxos principais funcionando sem erros críticos; equipe entende a navegação |

### Fase 2 — Piloto staging com dados minimizados (futuro)

| Item | Detalhe |
|------|---------|
| Ambiente | Staging TLS + backup documentado |
| Dados | Anonimizados/minimizados se necessário; nunca CPF/telefone/e-mail reais |
| Pré-requisito | Checklist go/no-go §9 completo; consentimento/base legal definida |
| Critério de saída | Sem vazamento de PII; permissões validadas; logs sem dados sensíveis |

### Fase 3 — Produção real (futura, sprint 5.1A+)

Exige: S3 real, banco gerenciado, WAF, HTTPS com domínio real, secrets manager, validação jurídica
LGPD, backup offsite agendado. Ver `docs/production-minimum-plan.md` §5.

---

## 4. Módulos por prioridade no piloto

### Prioridade alta — demonstrar e validar

| Módulo | Descrição |
|--------|-----------|
| **Pacientes** | Cadastro, busca, deduplicação, exportação |
| **Agenda** | Agendamentos por profissional, serviço, status |
| **Serviços** | Catálogo de consultas, retornos, sessões |
| **Financeiro** | Cobranças, recebimentos, parcular/convênio/misto |
| **Convênios** | Operadoras, planos, carteirinhas de pacientes |
| **Estoque** | Itens, movimentos, alertas de baixo estoque |
| **Relatórios** | Agenda, financeiro, pacientes por período |
| **Equipe** | Invite, papéis, profissionais da agenda |
| **Segurança** | MFA, backup codes, audit, read audit (owner) |
| **Importação** | Upload CSV/XLSX com dados fake, validação, deduplicação |

### Uso controlado com dados fake

| Módulo | Observação |
|--------|-----------|
| **Prontuário v0.1** | Apenas dados fictícios; nunca colar queixa/diagnóstico/prescrição real |
| **Documentos médicos v0.1** | PDF gerado com dados fake; sem armazenamento permanente |
| **Read audit clínico** | Owner valida que logs não contêm dados clínicos reais |

### Fora do piloto (fase 1)

| Item | Motivo |
|------|--------|
| Telemedicina | Fora do escopo permanente |
| WhatsApp automático | Não implementado |
| TISS/TUSS/ANS real | Não implementado; convênios são administrativos v0.1 |
| Assinatura ICP-Brasil | Não implementado |
| Medicamentos controlados | SNGPC/ANVISA fora do escopo |
| Produção AWS com dados reais | Exige sprint 5.1A+ |
| Checkout/billing real dos planos | Não implementado |

---

## 5. Fluxos de teste do piloto

### Autenticação e acesso

- [ ] Registro de clínica e primeiro usuário (dono)
- [ ] Login com e-mail e senha
- [ ] Ativação e uso de MFA (TOTP)
- [ ] Uso de backup code de recuperação
- [ ] Invite e aprovação de membro da equipe
- [ ] Login com papel `secretaria` — verificar abas visíveis
- [ ] Login com papel `profissional_clinico` — verificar acesso restrito a financeiro/convênios/estoque
- [ ] Desativação de membro da equipe

### Pacientes

- [ ] Cadastro manual de paciente fake
- [ ] Upload CSV com dados sintéticos
- [ ] Mapeamento de colunas
- [ ] Validação e revisão de inconsistências
- [ ] Deduplicação — identificar e resolver duplicado
- [ ] Exportação CSV/XLSX
- [ ] Arquivar paciente

### Agenda e serviços

- [ ] Cadastro de profissional na agenda (equipe)
- [ ] Cadastro de serviço (consulta, retorno, sessão)
- [ ] Vinculação profissional × serviço
- [ ] Criar agendamento com paciente, profissional e serviço
- [ ] Confirmar, remarcar e concluir agendamento
- [ ] Badge financeiro na agenda (cobrança pendente)
- [ ] Criar cobrança inline da agenda

### Financeiro

- [ ] Criar cobrança particular
- [ ] Criar cobrança convênio com carteirinha
- [ ] Criar cobrança mista (copay + convênio)
- [ ] Editar cobrança
- [ ] Marcar como pago (particular / convênio / misto)
- [ ] Cancelar cobrança
- [ ] Verificar que `notes` não contém dados clínicos

### Convênios

- [ ] Cadastrar operadora
- [ ] Cadastrar plano
- [ ] Registrar preço de referência de serviço × operadora
- [ ] Cadastrar carteirinha de paciente (secretaria ou dono)
- [ ] Verificar mascaramento de `member_number` em lista
- [ ] Número raw aparece apenas ao editar (lazy fetch)
- [ ] Profissional clínico → card "Acesso restrito" (403)

### Estoque

- [ ] Cadastrar item de estoque
- [ ] Registrar entrada
- [ ] Registrar saída
- [ ] Registrar perda/descarte
- [ ] Ajuste de quantidade
- [ ] Verificar badge "Estoque baixo"
- [ ] Histórico de movimentos
- [ ] Profissional clínico → card "Acesso restrito" (403)

### Relatórios

- [ ] Relatório de agenda (R-A) por período
- [ ] Relatório financeiro (R-B) por período
- [ ] Relatório de pacientes (R-C)
- [ ] Relatório agenda × financeiro (R-D)
- [ ] Filtro personalizado de data
- [ ] Botão "Atualizar" reinvalida dados
- [ ] Profissional clínico → R-B/R-D mostram card "Acesso restrito"

### Módulos clínicos (dados fake)

- [ ] Criar atendimento clínico com dados fictícios
- [ ] Adicionar nota ao atendimento
- [ ] Verificar que profissional só vê os próprios atendimentos
- [ ] Verificar que `internal_note` não aparece para não-autor
- [ ] Dono lê atendimento → audit STRICT registrado
- [ ] Secretaria → 403 no prontuário
- [ ] Criar documento médico (draft → finalizado)
- [ ] Download PDF com dados fake
- [ ] Cancelar documento
- [ ] Owner visualiza read audit via "Auditoria clínica" (aba Segurança)

### Segurança e auditoria

- [ ] Verificar audit logs sem PII (cpf, telefone, e-mail, nome)
- [ ] Verificar que logs de módulos clínicos são metadata-only
- [ ] Verificar que `reason` de estoque não aparece em logs
- [ ] Verificar que `member_number` de convênio não aparece em logs
- [ ] Cross-tenant impossível: testar com outro usuário de outra clínica
- [ ] Rate limit: múltiplas requisições → 429

---

## 6. Critérios de sucesso

| Critério | Como medir |
|----------|-----------|
| Navegação intuitiva | Usuário encontra as principais funções sem instrução técnica detalhada |
| Fluxo secretária | Secretária cria agendamento e cobrança em < 5 minutos sem travar |
| Relatórios compreensíveis | Dono entende relatório financeiro do período sem explicação |
| PII protegido | `member_number` mascarado em lista; CPF nunca exposto em bruto |
| Estoque operacional | Item criado, movimentado e alerta de baixo estoque funciona |
| Permissões respeitadas | Profissional não acessa financeiro/convênios/estoque |
| Prontuário seguro | Dados fake não aparecem misturados; prontuário de um profissional não acessível ao outro |
| Sem erro crítico | Nenhum erro 500 / Console crítico em fluxos principais |
| Treinamento | Equipe entende fluxo básico em 30–60 minutos |

---

## 7. Critérios de parada

Parar o piloto imediatamente se:

- [ ] Vazamento de PII ou dado clínico em log, tela ou export
- [ ] Permissão incorreta permitindo acesso indevido entre profissionais ou clínicas
- [ ] Falha de MFA/autenticação
- [ ] Logs com CPF, telefone, e-mail, nome ou conteúdo clínico
- [ ] Dados reais inseridos por engano (paciente real, diagnóstico real)
- [ ] Backup/restore não documentado para ambiente com dados sensíveis
- [ ] Usuário confundir prontuário fake com prontuário clínico real válido
- [ ] Erros 500 recorrentes em fluxo principal durante piloto
- [ ] Exposição de token/segredo em URL ou localStorage

---

## 8. Regras de dados e LGPD (Fase 1)

**Obrigatório na Fase 1:**
- Usar apenas nomes fictícios (ex.: "Ana Teste", "João Piloto").
- CPF sempre inválido (ex.: 000.000.000-00 ou série repetida).
- Telefone fictício (ex.: (11) 00000-0000).
- E-mail de domínio controlado (ex.: @piloto.local, @teste.invalid).
- Carteirinha de convênio fictícia.
- Datas de nascimento sem correlação com pessoas reais.
- `notes` e campos livres: nunca inserir diagnóstico, prescrição, queixa real.

**Proibido na Fase 1:**
- Importar planilha com dados reais de pacientes.
- Usar CPF/telefone/e-mail real em qualquer campo.
- Colar texto clínico real (queixa, diagnóstico, evolução, prescrição).
- Fazer screenshots com dados pessoais reais para apresentação.
- Exportar e compartilhar os dados via e-mail/WhatsApp sem criptografia.
- Admin técnico acessar conteúdo clínico.

**Para Fase 2 (dados anonimizados — apenas se necessário):**
- Remover nome completo → iniciais ou pseudônimo.
- Substituir CPF → valor fictício.
- Substituir telefone e e-mail → fictícios.
- Remover endereço.
- Remover número de carteirinha real.
- Remover qualquer detalhe clínico identificável.
- Obter consentimento ou definir base legal antes.

---

## 9. Roteiro de demonstração (20–30 minutos)

Guia sugerido para apresentação do piloto a um observador novo:

| # | Tópico | Tempo estimado |
|---|--------|----------------|
| 1 | Login + MFA | 2 min |
| 2 | Visão geral (aba Início, navegação) | 2 min |
| 3 | Pacientes: busca + cadastro fake | 3 min |
| 4 | Agenda: criar agendamento com serviço | 3 min |
| 5 | Financeiro: cobrança particular + convênio | 4 min |
| 6 | Convênios: operadora + carteirinha | 3 min |
| 7 | Estoque: item + movimento | 2 min |
| 8 | Relatórios: financeiro do período | 2 min |
| 9 | Prontuário/Documento fake (se incluso no roteiro) | 3 min |
| 10 | Segurança: audit, MFA, papéis | 2 min |
| 11 | Próximos passos | 2 min |

**Total:** ~28 minutos.

---

## 10. Backlog pós-piloto

Após conclusão do piloto controlado, as próximas entregas previstas são:

| Sprint | Entregável |
|--------|-----------|
| **5.0B** | Demo dataset — seed sintético completo para demonstração |
| **5.0C** | Página/tour de demo pública com dados fake |
| **5.1A** | Produção AWS segura (S3, banco gerenciado, WAF, HTTPS real) |
| **Futura** | Roles granulares v2 (ADR própria) |
| **Futura** | WhatsApp manual/assistido |
| **Futura** | Módulo odontologia ou nova especialidade (ADR própria) |
| **Futura** | Mockup completo Clinic OS na landing |
| **Futura** | Video/página de demo com tour guiado |
| **Futura** | Ajustes UX pós-feedback do piloto |

---

## 11. Referências

| Documento | Conteúdo |
|-----------|---------|
| `docs/security-notes.md` | P1/P2/P3 de segurança e LGPD |
| `docs/production-minimum-plan.md` | O que falta para produção real |
| `docs/testing-checklist.md` | Smoke tests e usuários de teste |
| `docs/pilot-go-no-go-checklist.md` | Checklist go/no-go detalhado |
| `docs/super-review-4-9A.md` | Revisão de segurança completa |
| `CLAUDE.md` | Estado atual do produto |
