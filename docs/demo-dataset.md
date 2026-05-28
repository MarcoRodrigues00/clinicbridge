# ClinicBridge — Demo Dataset (Seed Sintético)

> **Sprint:** 5.0B + 5.0B.1
> **Data:** 2026-05-27
> **Status:** Implementado e validado.

---

## Visão geral

O script `seed:demo:full` cria uma clínica demo completa com dados 100% sintéticos para
demonstrações e piloto controlado. Todos os registros têm marcadores claros de dado fictício.

**IMPORTANTE:** dev/local/staging apenas. Nunca usar em produção.

---

## Como usar

### Pré-requisitos

```bash
cp .env.example .env   # se ainda não tiver .env
docker compose up -d   # banco precisa estar rodando
pnpm install
```

### Criar o demo dataset

```bash
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full
```

### Limpar o demo dataset

```bash
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full:clean
```

### Recriar do zero

```bash
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full:clean
ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full
```

---

## Guards de segurança

| Guard | Comportamento |
|-------|--------------|
| `NODE_ENV=production` | Script recusa e sai com código 1 |
| `ALLOW_DEMO_SEED` não definido | Script recusa e sai com código 2 |
| Demo já existe (idempotência) | Avisa e sai sem fazer nada (run clean + seed para recriar) |
| `SEED_CLINIC_ID` | Não aplicável neste script; usa "Clínica Demo Aurora" fixo |

---

## Dados criados

### Clínica demo

| Campo | Valor |
|-------|-------|
| Nome | Clínica Demo Aurora |
| Plano | free |
| LGPD | consentimento aceito no seed |

### Usuários demo

| E-mail | Papel | Acesso clínico | Senha |
|--------|-------|----------------|-------|
| `demo.owner@clinicbridge.local` | `dono_clinica` | — | `DemoDevOnly!23` |
| `demo.secretaria@clinicbridge.local` | `secretaria` | — | `DemoDevOnly!23` |
| `demo.medico@clinicbridge.local` | `secretaria` + grant | `profissional_clinico` | `DemoDevOnly!23` |
| `demo.psicologa@clinicbridge.local` | `secretaria` + grant | `profissional_clinico` | `DemoDevOnly!23` |
| `demo.gestor@clinicbridge.local` | `secretaria` + grant | `gestor_clinica` | `DemoDevOnly!23` |

**Nota:** `DemoDevOnly!23` é senha dev-only. Nunca usar em produção. Nunca versionar em produção.

### Profissionais da agenda

| Nome | Especialidade (demo) |
|------|---------------------|
| [DEMO] Dr. Rafael Aurora | Clínica médica |
| [DEMO] Dra. Helena Aurora | Psicologia |
| [DEMO] Dra. Clara Aurora | Odontologia |

### Serviços do catálogo

| Serviço | Categoria | Duração | Preço referência |
|---------|-----------|---------|-----------------|
| Consulta médica | Consulta | 30 min | R$ 250,00 |
| Retorno médico | Consulta | 20 min | R$ 120,00 |
| Sessão de psicologia | Sessão | 50 min | R$ 180,00 |
| Consulta odontológica | Odontologia | 40 min | R$ 220,00 |
| Limpeza dental | Odontologia | 60 min | R$ 300,00 |
| Consulta de rotina | Consulta | 25 min | R$ 150,00 |

### Pacientes (20)

| Perfil | Quantidade |
|--------|-----------|
| Medicina (ativos) | 8 |
| Psicologia (ativos) | 6 |
| Odontologia (ativos) | 4 |
| Arquivados | 2 |

- CPF: sempre `null` (sem CPF real ou placeholder)
- Telefone: faixa fictícia `(41) 90001-xxxx`
- E-mail: domínio `@demo.local`
- Nomes: claramente fictícios

### Agendamentos (20)

| Status | Quantidade |
|--------|-----------|
| scheduled | 12 |
| confirmed | 5 |
| completed | 2 |
| no_show | 1 |
| cancelled | 1 (agenda usa 'cancelled') |

Distribuição: ontem (3) + hoje (6) + próximos 7 dias (11)

### Cobranças financeiras (12)

| Tipo | Status | Quantidade |
|------|--------|-----------|
| Particular paga | paid | 3 |
| Particular pendente | pending | 2 |
| Convênio pendente | pending | 2 |
| Convênio pago | paid | 1 |
| Mista (copay + convênio) paga | paid | 1 |
| Cancelada | canceled | 1 |
| Vencida (pending + due passado) | pending | 1 |
| Psicologia convênio pendente | pending | 1 |

### Convênios

| Item | Quantidade |
|------|-----------|
| Operadoras | 2 (Plano Vida Demo, Saúde Aurora Demo) |
| Planos | 3 (Essencial, Plus, Aurora Flex) |
| Preços de referência | 3 |
| Carteirinhas de pacientes | 3 (member_number com sufixo `-DEMO`) |

### Estoque (7 itens)

| Item | Categoria | Atual | Mínimo | Status |
|------|-----------|-------|--------|--------|
| Luvas descartáveis M | EPI | 8 | 5 | Normal |
| Máscaras cirúrgicas | EPI | 3 | 5 | **Estoque baixo** |
| Álcool 70% 500ml | Higiene | 12 | 4 | Normal |
| Papel toalha | Higiene | 2 | 3 | **Estoque baixo** |
| Gaze 10x10cm | Material clínico | 20 | 5 | Normal |
| Canetas recepção | Administrativo | 15 | 0 | Normal |
| Fichas de atendimento | Administrativo | 5 | 2 | Normal |

Cada item tem pelo menos 1 movimento de entrada. Luvas e Papel toalha têm movimentos de saída adicionais.

---

## Dados clínicos fictícios (Sprint 5.0B.1)

> **Aviso:** estes registros não têm validade clínica, jurídica ou legal.
> Existem apenas para demonstrar o fluxo de prontuário e documentos em ambiente controlado.
> Nunca usar dados clínicos reais neste dataset.

### Encontros clínicos (3)

| Paciente (fictício) | Especialidade | Attending | Status |
|---------------------|---------------|-----------|--------|
| Ricardo Demo (medicina) | Clínica médica | `demo.medico` | active |
| Amanda Demo (psicologia) | Psicologia | `demo.psicologa` | active |
| Mariana Demo (medicina) | Clínica médica | `demo.medico` | active |

### Notas clínicas (3)

Uma nota por encontro, com os campos `chief_complaint`, `anamnesis`, `evolution`, `plan` e/ou
`internal_note` conforme relevante. Todos os campos contêm o marcador obrigatório.

**Marcador obrigatório em todos os campos de nota:**
```
DADO CLÍNICO FICTÍCIO PARA DEMONSTRAÇÃO.
```

**Campos `internal_note`:** usados no encontro de psicologia para demonstrar que notas internas
são visíveis apenas para o(a) autor(a) (regra do prontuário v0.1).

### Documento médico (1)

| Campo | Valor |
|-------|-------|
| Tipo | `declaration` (declaração) |
| Título | "Declaração de comparecimento (FICTÍCIA — SEM VALIDADE)" |
| Status | `finalized` |
| Paciente | Ricardo Demo (patient[3]) |
| Autor | `demo.medico` |

**Marcador obrigatório no corpo do documento:**
```
DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO — SEM VALIDADE CLÍNICA OU LEGAL.
```

### Regras para dados clínicos fake

- Nenhum CID real, nenhuma prescrição real, nenhuma conduta clínica real.
- Nenhum nome real de paciente, familiar ou profissional.
- Nenhum caso clínico real ou baseado em situação existente.
- Nenhum texto que possa ser interpretado como recomendação médica.
- Todo campo clínico preenchido começa com o marcador obrigatório.
- `internal_note` não aparece para quem não é o(a) autor(a) — regra do sistema preservada.
- O documento fake não é servido como PDF sem audit STRICT (comportamento normal do sistema).

### O que NÃO está incluído nos dados clínicos fake

- Receitas médicas — fora do escopo v0.1.
- Exames / laudos — fora do escopo v0.1.
- Documentos odontológicos — sem profissional com grant clínico no seed.
- Mais de 1 documento por encontro — suficiente para demonstração.

---

## Módulos não incluídos neste seed

| Módulo | Status |
|--------|--------|
| Prontuário / encontros clínicos | ✅ Incluído na Sprint 5.0B.1 — dados fictícios |
| Documentos médicos fake | ✅ Incluído na Sprint 5.0B.1 — 1 declaração fictícia |
| Receitas / exames / laudos | Fora do escopo v0.1 |
| Usuários smoke (`smoke.*`) | Nunca tocados por este seed |

---

## Marcadores de dado sintético

Todos os registros demo têm marcadores explícitos:

- Notas de itens de estoque: `"... DADO SINTÉTICO."`
- Descrições de cobranças: `"... DADO SINTÉTICO."`
- Notas de convênios: `"Operadora fictícia... DADO SINTÉTICO."`
- Notas de agendamentos: `"... DADO SINTÉTICO."` quando presentes
- **Notas clínicas:** todos os campos contêm `"DADO CLÍNICO FICTÍCIO PARA DEMONSTRAÇÃO."`
- **Documento médico:** corpo contém `"DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO — SEM VALIDADE CLÍNICA OU LEGAL."`
- Clínica: nome `"Clínica Demo Aurora"` é inequivocamente fictício
- Usuários: e-mails `@clinicbridge.local` são domínio reservado
- Pacientes: e-mails `@demo.local` + CPF null + telefones fictícios

---

## Comportamento de rerun (idempotência)

| Cenário | Comportamento |
|---------|--------------|
| Seed nunca rodou | Cria tudo do zero |
| Seed já rodou (demo exists) | Avisa e sai sem duplicar |
| Seed parcialmente rodou (falha mid-run) | Avisa para rodar clean first |
| Clean após seed | Remove clínica demo + usuários demo (dados smoke intactos) |
| Clean em ambiente sem demo | Avisa e sai sem erro |

---

## Variáveis de ambiente relevantes

| Variável | Uso |
|----------|-----|
| `ALLOW_DEMO_SEED=true` | Obrigatória para rodar qualquer modo |
| `NODE_ENV=production` | Bloqueia execução do script |
| `DATABASE_URL` | Banco alvo (vem do `.env`) |

---

## O que NÃO este seed faz

- NÃO altera schema ou migrations
- NÃO toca usuários `smoke.*@clinicbridge.local`
- NÃO usa CPF real, telefone real, e-mail real
- NÃO usa nome real de paciente/familiar
- NÃO usa diagnóstico, prescrição ou queixa clínica real
- NÃO roda automaticamente em startup ou migration
- NÃO funciona com `NODE_ENV=production`
