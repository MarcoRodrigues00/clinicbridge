# Dados sintéticos de demonstração — ClinicBridge

Conjunto **fictício** para demonstrar o fluxo de importação administrativa do
ClinicBridge (piloto v0.1). Usado pelo roteiro em
[`../demo-pilot-v0.1-script.md`](../demo-pilot-v0.1-script.md) e pelo checklist em
[`../demo-pilot-v0.1-checklist.md`](../demo-pilot-v0.1-checklist.md).

## Aviso (importante)

- **Todos os dados são fictícios.** Nomes, CPFs, telefones e e-mails **não**
  pertencem a pessoas reais.
- Os **CPFs são placeholders inválidos** (padrões sintéticos que não passam no
  dígito verificador). Não use CPF real em demo.
- Os **e-mails** usam o domínio reservado `@example.com` (RFC 2606 — nunca entrega
  para uma caixa real).
- **Nenhum dado clínico.** Apenas dados administrativos do paciente (nome, contato,
  documento, nascimento, convênio). Sem diagnóstico/prescrição/exame/CID/prontuário.

## Arquivo

### `pacientes-demo.csv`

CSV (UTF-8, separador vírgula) com 12 linhas de pacientes fictícios. Cabeçalhos
escolhidos para baterem com o **auto-mapeamento** do import:

| Coluna no CSV        | Campo no ClinicBridge | Observação                                  |
|----------------------|-----------------------|---------------------------------------------|
| `Nome completo`      | `nome`                | obrigatório                                 |
| `CPF`                | `cpf`                 | mascarado na exibição/export                |
| `Telefone`           | `telefone`            | aceita (DDD) 9XXXX-XXXX                      |
| `E-mail`             | `email`               |                                             |
| `Data de nascimento` | `data_nascimento`     | formato `DD/MM/AAAA`                         |
| `Convênio`           | *(não mapeado)*       | coluna extra; o MVP não importa convênio    |

> O import do MVP mapeia **só** `nome/telefone/email/cpf/data_nascimento`. A coluna
> `Convênio` aparece na tela de mapeamento como coluna existente porém **não
> mapeada** — ilustra o caso real de exports legados com colunas a mais.

## O que o arquivo demonstra de propósito

- **Caso feliz:** 10 linhas limpas (nome válido, contato, CPF com 11 dígitos, data
  de nascimento válida no passado) → importam sem erro.
- **Duplicado intencional:** "Ana Beatriz Martins" aparece **2x** (linhas 1 e 11)
  com o mesmo CPF/telefone/e-mail → exercita a **detecção de duplicados** na
  validação/dry-run e no painel `GET /patients/duplicates` (se importada).
- **Contato parcial:** "Camila Andrade Teixeira" (última linha) **sem telefone**,
  só com e-mail → continua válida (basta telefone **ou** e-mail).

## Como usar (resumo)

1. `/app` → aba **Importações** → enviar `pacientes-demo.csv`.
2. Conferir o **mapeamento sugerido** (já casa pelos cabeçalhos) e a pré-visualização.
3. **Validar** o arquivo → o relatório mostra linhas válidas + o grupo duplicado.
4. Criar **sessão** → **dry-run** (simulação, não grava) → **marcar pronto** →
   **importar** (ação de `dono_clinica`).
5. Ver em **Pacientes** (CPF mascarado), **Duplicados** e **Exportar** (CSV/XLSX).

> Importar num tenant que já tem pacientes **soma** estas linhas ao total. Em
> ambiente de demo dedicado, comece com a base vazia para contagens previsíveis.
</content>
