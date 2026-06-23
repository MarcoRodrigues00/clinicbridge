# ClinicBridge — Documentação Inicial Completa

> Documento mestre do projeto. Reúne plano, arquitetura, banco, fluxo, segurança, modelagem de ameaças, backlog, roteiro de apresentação e conteúdo do relatório.
>
> Versão: 1.0 — Data: maio/2026
> Autor: Marco Rodrigues

---

## Sumário

1. Plano do Projeto
2. Arquitetura MVC + DAO
3. Banco de Dados
4. Fluxo Principal do Sistema
5. Segurança
6. Modelagem de Ameaças (STRIDE)
7. Backlog por Sprints
8. Roteiro da Apresentação (13 slides)
9. Conteúdo do Relatório (formato PDF)
10. Próximos Passos para Implementação
11. Referências aos Documentos da pasta "Ciber"

---

## 1. Plano do Projeto

### 1.1 Nome do projeto
**ClinicBridge** — ponte entre o sistema antigo da clínica e um repositório de dados limpo, organizado e pronto para ser usado.

### 1.2 Descrição do problema
Clínicas pequenas e profissionais de saúde autônomos costumam usar sistemas antigos, planilhas em Excel, agendas em papel ou softwares descontinuados. Quando precisam mudar de ferramenta — porque o sistema saiu do ar, ficou caro, deixou de receber atualizações ou simplesmente não atende mais — eles travam em um problema bem comum: como tirar os dados de lá sem perder paciente, sem perder agenda e sem se enrolar em arquivos cheios de campos quebrados, duplicados e mal preenchidos.

Hoje, esse processo costuma ser feito “na mão”, por alguém da secretaria ou um filho da família com paciência. Isso é demorado, propenso a erro e, pior, expõe dados sensíveis de pacientes em planilhas espalhadas em e-mails e pen drives.

### 1.3 Público-alvo
- Clínicas pequenas e médias (1 a 10 profissionais).
- Consultórios individuais (médicos, dentistas, psicólogos, fisioterapeutas, nutricionistas).
- Secretárias e gestoras administrativas que cuidam da agenda e cadastro.
- Consultores e revendedores de software médico que ajudam clínicas a migrar.

### 1.4 Justificativa
O mercado de software para saúde no Brasil é grande e fragmentado. Sempre há clínica trocando de sistema, sempre há sistema descontinuado e sempre vai existir planilha desorganizada. Um produto que resolva especificamente a “dor de migrar” é vendável porque:

- É uma necessidade pontual mas urgente (o cliente precisa migrar agora).
- Tem ticket aceitável (a clínica paga para não perder dados).
- Não compete diretamente com prontuários eletrônicos consolidados (não vamos brigar com gigantes).
- Pode evoluir para um SaaS recorrente depois (organização, backups, conformidade LGPD).

Além disso, dados de saúde são sensíveis e exigem cuidado com LGPD, autenticação, controle de acesso e auditoria. Construir o produto com segurança desde o começo é parte do diferencial.

### 1.5 Objetivo geral
Oferecer uma plataforma web que ajude clínicas pequenas a migrar, limpar, organizar e exportar dados administrativos de pacientes e agenda, de forma segura, auditável e em conformidade com a LGPD.

### 1.6 Objetivos específicos
- Permitir o upload de arquivos CSV e XLSX exportados de sistemas antigos.
- Detectar automaticamente colunas comuns (nome, telefone, CPF, e-mail, data de nascimento, convênio).
- Identificar dados duplicados, campos incompletos e formatos inválidos.
- Permitir que o usuário revise e corrija dados antes da exportação final.
- Gerar arquivos limpos em CSV ou XLSX prontos para importar em outro sistema.
- Manter logs de auditoria de tudo que foi feito.
- Garantir separação de dados por clínica (multi-tenant).
- Cumprir requisitos básicos de LGPD (consentimento, exportação, exclusão).

### 1.7 Escopo do MVP
Dentro da primeira versão:
- Cadastro e autenticação de usuário.
- Cadastro de clínica.
- Upload de arquivo CSV/XLSX.
- Leitura, parse e preview do conteúdo.
- Detecção de colunas e sugestão de mapeamento.
- Validação de campos (telefone, e-mail, CPF, data).
- Detecção de duplicados (por nome + telefone, por CPF).
- Tela de revisão dos dados.
- Exportação limpa em CSV e XLSX.
- Logs de auditoria.
- Painel básico do usuário com histórico de migrações.

### 1.8 Fora do escopo da primeira versão
Para manter o MVP factível e reduzir risco de LGPD desde o começo, o produto **não** vai tratar na v1:
- Prontuário clínico completo.
- Diagnóstico médico, prescrição, laudos, exames.
- Telemedicina, videochamadas, assinatura digital de receitas.
- Faturamento e integração com convênios.
- Aplicativo móvel.
- Integração direta (API) com outros sistemas de prontuário.

Esses pontos podem entrar em versões futuras, mas só depois do produto provar tração.

### 1.9 Proposta de valor
"Sair do sistema antigo sem perder paciente, sem perder agenda e sem precisar pagar uma consultoria cara para isso."

### 1.10 Diferenciais
- Foco específico em **migração** (não tenta ser tudo).
- Segurança e LGPD desde o desenho, não como remendo.
- Preview, revisão e correção antes de exportar (o cliente vê o que está saindo).
- Relatório de migração que vira evidência de qualidade do trabalho.
- Interface simples, voltada para quem é da secretaria e não da TI.

### 1.11 Modelo de monetização
- **Plano avulso (one-shot):** valor único por migração, pago por arquivo ou por volume de pacientes (ex.: R$ 199 até 500 pacientes, R$ 399 até 2.000, R$ 799 acima disso).
- **Plano recorrente (mensal):** mantém o histórico, permite novas migrações, gera relatórios, mantém backup criptografado, dá acesso a integrações futuras.
- **Plano de parceria:** com consultores e revendedores que ajudam clínicas a migrar — eles usam o ClinicBridge como ferramenta e pagam um valor por cliente atendido.

### 1.12 Riscos
- **Risco regulatório (LGPD):** dado de saúde é categoria especial. Mitigação: contrato de tratamento de dados, criptografia em repouso, logs, exclusão sob demanda, minimização (não armazenar diagnóstico).
- **Risco técnico:** arquivos vêm em formatos imprevisíveis. Mitigação: parser tolerante, preview, validação manual, log de erros por linha.
- **Risco de adoção:** cliente não confia em subir dados para a nuvem. Mitigação: comunicação clara, contrato, opção de exportar e apagar tudo após uso.
- **Risco de concorrência:** sistemas grandes oferecem migração “grátis” como isca. Mitigação: foco em clínicas que não estão indo para esses sistemas grandes (ou que querem ferramenta neutra).
- **Risco operacional:** processar arquivos grandes pode quebrar servidor. Mitigação: limite de tamanho, fila assíncrona, timeout.

### 1.13 Requisitos funcionais
- RF01 — O sistema deve permitir cadastro de usuário com e-mail e senha.
- RF02 — O sistema deve permitir login com autenticação por sessão/token.
- RF03 — O sistema deve permitir cadastrar uma clínica vinculada ao usuário.
- RF04 — O sistema deve aceitar upload de arquivos CSV e XLSX.
- RF05 — O sistema deve fazer parse e gerar um preview do conteúdo enviado.
- RF06 — O sistema deve sugerir um mapeamento automático de colunas.
- RF07 — O sistema deve permitir que o usuário ajuste o mapeamento manualmente.
- RF08 — O sistema deve validar campos (telefone, e-mail, CPF, data de nascimento).
- RF09 — O sistema deve detectar duplicados e marcar para revisão.
- RF10 — O sistema deve mostrar dados incompletos em uma tela de revisão.
- RF11 — O sistema deve gerar exportação limpa em CSV e XLSX.
- RF12 — O sistema deve registrar logs de auditoria (quem fez o quê e quando).
- RF13 — O sistema deve permitir excluir uma migração e seus arquivos relacionados.
- RF14 — O sistema deve permitir baixar o arquivo limpo e o relatório de migração.

### 1.14 Requisitos não funcionais
- RNF01 — A aplicação deve responder em até 2 segundos em telas simples (p95).
- RNF02 — O parse de arquivos deve rodar de forma assíncrona em background.
- RNF03 — O sistema deve suportar pelo menos 50 clínicas ativas simultaneamente no MVP.
- RNF04 — O sistema deve registrar todos os acessos a dados sensíveis.
- RNF05 — Backups diários criptografados, com retenção mínima de 30 dias.
- RNF06 — Disponibilidade alvo: 99% mensal (aceitável para MVP).
- RNF07 — Logs centralizados, com timestamp confiável (NTP).
- RNF08 — Código com testes automatizados nos fluxos críticos (upload, exportação, login).

### 1.15 Requisitos de segurança
Baseados em CIAA (Confidencialidade, Integridade, Disponibilidade, Autenticidade) e em práticas do OWASP:
- RS01 — Senhas armazenadas com hash forte (bcrypt/argon2), nunca em texto puro.
- RS02 — Autenticação obrigatória em todas as rotas, exceto landing/login.
- RS03 — Controle de acesso baseado em clínica (multi-tenant): usuário só acessa dados da própria clínica.
- RS04 — Validação rigorosa de tipo, tamanho e MIME de arquivo enviado.
- RS05 — Uso de consultas parametrizadas / ORM para evitar SQL Injection.
- RS06 — Saída sempre escapada/encodada para evitar XSS.
- RS07 — Cabeçalhos de segurança (CSP, HSTS, X-Content-Type-Options, X-Frame-Options).
- RS08 — Conexão HTTPS obrigatória (TLS 1.2+).
- RS09 — Tokens de sessão curtos, com renovação, e invalidação no logout.
- RS10 — Rate limit em login e em upload.
- RS11 — Criptografia em repouso para arquivos enviados (chave gerenciada pelo serviço).
- RS12 — Logs de auditoria imutáveis (somente append).
- RS13 — Princípio do menor privilégio: usuário comum não vê o painel administrativo.

### 1.16 Requisitos de privacidade / LGPD
- RP01 — Finalidade clara e documentada do tratamento dos dados (migração).
- RP02 — Aceite explícito dos Termos de Uso e Política de Privacidade no cadastro.
- RP03 — Contrato de tratamento de dados (operador) com a clínica.
- RP04 — Direito de exportar todos os dados a qualquer momento.
- RP05 — Direito de excluir todos os dados a qualquer momento (com confirmação).
- RP06 — Retenção limitada: arquivos brutos apagados em até 30 dias após a migração.
- RP07 — Minimização: não pedir dado clínico no MVP.
- RP08 — Registro de quem acessou o quê, para responder a incidentes.
- RP09 — Plano de resposta a incidentes documentado.
- RP10 — Encarregado (DPO) definido, com canal público de contato.

### 1.17 Tecnologias recomendadas
- **Backend:** Node.js 20 + Express + TypeScript.
- **Banco de dados:** PostgreSQL 15+.
- **ORM/Acesso:** Prisma ou Knex (DAO bem isolado).
- **Frontend:** React + Vite (ou Next.js, se quiser SSR depois).
- **Auth:** JWT curto + refresh token, OU sessão server-side com cookie httpOnly.
- **Upload e parse:** Multer + parsers nativos (csv-parse, exceljs).
- **Filas assíncronas:** BullMQ + Redis para parse de arquivos grandes.
- **Armazenamento:** S3-compatível (AWS S3, Cloudflare R2 ou Backblaze B2) com criptografia em repouso.
- **Logs:** pino + um agregador (Grafana Loki, Datadog ou simples arquivo + rotação).
- **Infra:** Docker + um VPS ou Fly.io/Render no início.
- **Observabilidade:** logs estruturados, métricas básicas, alerta por e-mail.

### 1.18 Cronograma sugerido
| Etapa | Duração | O que entrega |
|---|---|---|
| Sprint 1 | 2 semanas | Auth, cadastro de clínica, upload, preview |
| Sprint 2 | 2 semanas | Mapeamento, validação, duplicados, revisão, exportação |
| Sprint 3 | 2 semanas | Segurança forte, auditoria, backup, hardening |
| Sprint 4 | 2 semanas | Landing, leads, plano pago, painel admin |
| Soft launch | 1 semana | Primeiros 3 clientes-piloto, ajustes |
| Versão 1.0 pública | — | Cobrança ativa, suporte por e-mail |

Total estimado: cerca de 9 a 10 semanas para chegar em um produto vendável.

### 1.19 Backlog inicial (resumido)
Detalhado na seção 7.

### 1.20 Critérios de aceite (gerais)
- Um usuário consegue se cadastrar, criar uma clínica e migrar um arquivo de exemplo em menos de 10 minutos sem ajuda externa.
- O arquivo final exportado pode ser aberto em Excel/LibreOffice sem erro.
- Todos os campos sensíveis aparecem em log de auditoria.
- Tentativas de acesso a dados de outra clínica retornam 403.
- A senha não aparece em log algum.
- O upload rejeita arquivos acima do limite e arquivos com extensão errada.

### 1.21 Próximos passos
Detalhados na seção 10.

---

## 2. Arquitetura MVC + DAO

### 2.1 Por que MVC + DAO no ClinicBridge
A escolha de MVC + DAO segue a ideia básica de separar responsabilidades. O material de Padrões de Projeto consultado deixa claro que MVC organiza a aplicação em três papéis (Model, View, Controller), e o DAO complementa esse desenho isolando o acesso a banco em classes específicas. Para um produto que mexe com dados sensíveis, essa separação ajuda em três pontos práticos:

- **Manutenção:** quando o SQL muda, mexe-se no DAO, não na regra de negócio.
- **Testabilidade:** dá para testar o Controller mockando o DAO.
- **Segurança:** o ponto único de acesso ao banco facilita aplicar parametrização, escape, controle de tenant e auditoria — porque tudo passa pelo DAO.

### 2.2 Papel de cada camada

**Model**
Representa o domínio. São as classes/objetos que descrevem entidades como Usuario, Clinica, Paciente, ArquivoImportacao. Não acessam banco diretamente. Servem para carregar dados, aplicar regras simples (ex: validar formato de CPF) e ser transportadas entre camadas.

**View**
É a interface com o usuário. No ClinicBridge, são as telas React do frontend (landing, login, cadastro, dashboard, upload, preview, revisão, exportação). A View nunca contém SQL nem regra de negócio crítica — só apresentação e captura de input.

**Controller**
Recebe as requisições HTTP, valida entrada, chama os Services e DAOs corretos, decide o status de resposta e devolve para a View. É o coordenador. No Express, são as funções vinculadas às rotas.

**DAO (Data Access Object)**
Concentra todo o acesso ao banco. Cada entidade principal tem seu DAO. É aqui que vivem as queries parametrizadas (ou chamadas ao Prisma/Knex). O DAO é o único que fala SQL — ninguém mais.

**Service (camada auxiliar)**
Para regras de negócio mais pesadas (ex.: detectar duplicados, normalizar telefone, comparar registros), usamos uma camada Service entre Controller e DAO. Isso evita que o Controller fique cheio de lógica e o DAO fique fazendo coisa que não é dele.

### 2.3 Comunicação entre camadas
```
[ View (React) ]
       │  HTTP (JSON)
       ▼
[ Controller (Express) ] ── valida input, autentica, autoriza
       │
       ▼
[ Service ] ── regra de negócio (parse, normalização, duplicados)
       │
       ▼
[ DAO ] ── queries parametrizadas, transações
       │
       ▼
[ Banco PostgreSQL ]
```

A View nunca fala direto com DAO. O Controller nunca executa SQL. O DAO nunca decide regra de negócio.

### 2.4 Estrutura de pastas sugerida
```
/clinicbridge
├── /backend
│   ├── /src
│   │   ├── /config         # variáveis de ambiente, conexão DB, logger
│   │   ├── /models         # entidades de domínio (TS types/classes)
│   │   ├── /dao            # acesso ao banco
│   │   ├── /services       # regras de negócio (parse, dedupe, validação)
│   │   ├── /controllers    # handlers HTTP
│   │   ├── /routes         # roteamento Express
│   │   ├── /middlewares    # auth, tenant, rate-limit, audit
│   │   ├── /utils          # helpers (cpf, telefone, datas)
│   │   ├── /jobs           # workers de fila (BullMQ)
│   │   └── server.ts
│   ├── /migrations         # SQL versionado
│   ├── /tests              # unitários e integração
│   └── package.json
├── /frontend
│   ├── /src
│   │   ├── /views          # páginas (Login, Dashboard, Upload, Review)
│   │   ├── /components     # componentes reutilizáveis
│   │   ├── /services       # chamadas HTTP ao backend
│   │   ├── /hooks
│   │   └── /utils
│   └── package.json
├── /docs                   # plano, arquitetura, STRIDE, etc.
└── docker-compose.yml
```

### 2.5 Entidades principais (Models)

**Usuario**
- id (UUID)
- nome
- email (único)
- senha_hash
- papel (admin_sistema, dono_clinica, secretaria)
- clinica_id
- ativo (bool)
- ultimo_login_em
- criado_em / atualizado_em

**Clinica**
- id (UUID)
- nome
- cnpj (opcional)
- responsavel_id (FK Usuario)
- plano (free, avulso, mensal)
- consentimento_lgpd (bool)
- contrato_aceito_em
- criado_em / atualizado_em

**Paciente** (dados administrativos, não clínicos)
- id (UUID)
- clinica_id (FK)
- nome_completo
- nome_social (opcional)
- cpf (opcional, validado)
- data_nascimento
- telefone_principal
- telefone_secundario
- email
- convenio
- numero_carteirinha
- observacoes_administrativas
- status (ativo, inativo, duplicado_suspeito)
- origem_migracao_id (FK Migracao)
- criado_em / atualizado_em

**ArquivoImportacao**
- id (UUID)
- clinica_id (FK)
- nome_original
- tamanho_bytes
- mime
- caminho_armazenamento (S3 key)
- hash_sha256
- status (recebido, em_parse, parseado, erro)
- enviado_por (FK Usuario)
- criado_em

**Migracao**
- id (UUID)
- clinica_id (FK)
- arquivo_id (FK ArquivoImportacao)
- mapeamento_colunas (JSONB)
- total_linhas
- total_validas
- total_invalidas
- total_duplicados
- status (em_revisao, aprovada, exportada, cancelada)
- iniciada_em / finalizada_em

**ErroImportacao**
- id (UUID)
- migracao_id (FK)
- linha
- coluna
- valor_recebido
- motivo (ex: "telefone inválido", "cpf duplicado")
- severidade (warning, error)
- criado_em

**LogAuditoria**
- id (UUID)
- usuario_id (FK)
- clinica_id (FK)
- acao (login, upload, export, delete, view_paciente, …)
- recurso (tabela ou objeto afetado)
- recurso_id
- ip
- user_agent
- request_id
- criado_em

### 2.6 DAOs principais

**UsuarioDAO** — buscar por id e por e-mail, criar, atualizar, marcar inativo, atualizar último login. Nunca devolve `senha_hash` para fora do backend.

**ClinicaDAO** — criar, buscar por id, listar por usuário (sempre filtrando pelo dono), atualizar plano e consentimento.

**PacienteDAO** — criar em lote (bulk insert via transação), buscar por id, listar por clínica (sempre com `WHERE clinica_id = $1`), atualizar, deletar. É o DAO mais sensível e por isso ele já carrega o tenant_id no método.

**ArquivoImportacaoDAO** — registrar metadados do arquivo, atualizar status, buscar por id, listar por clínica.

**MigracaoDAO** — criar migração, atualizar contadores, marcar como exportada, listar histórico por clínica.

**ErroImportacaoDAO** — gravar em lote, listar por migração.

**LogAuditoriaDAO** — gravar evento (apenas insert, nunca update/delete), consultar com filtro por clínica e por janela de tempo.

### 2.7 Vantagens dessa arquitetura no projeto
- O SQL não vaza para o resto da aplicação — facilita revisar segurança.
- Quando trocar de Postgres para outro banco, mexe-se só nos DAOs.
- Cada Controller fica curto e legível — fácil de revisar em pull request.
- A camada Service permite cobrir as regras com testes unitários sem precisar do banco.
- Logs de auditoria podem ser injetados via middleware sem alterar Controllers.

---

## 3. Banco de Dados

### 3.1 Tecnologia
PostgreSQL 15+. Motivos: tipos JSONB (bom para mapeamento de colunas), suporte forte a UUID, integridade referencial, extensão `pgcrypto` para chaves e hashes.

### 3.2 Tabelas principais

```sql
-- users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) UNIQUE NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  papel         VARCHAR(30)  NOT NULL CHECK (papel IN ('admin_sistema','dono_clinica','secretaria')),
  clinica_id    UUID,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login_em TIMESTAMP,
  criado_em     TIMESTAMP NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

-- clinics
CREATE TABLE clinics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                VARCHAR(160) NOT NULL,
  cnpj                VARCHAR(20),
  responsavel_id      UUID NOT NULL REFERENCES users(id),
  plano               VARCHAR(20)  NOT NULL DEFAULT 'free',
  consentimento_lgpd  BOOLEAN NOT NULL DEFAULT FALSE,
  contrato_aceito_em  TIMESTAMP,
  criado_em           TIMESTAMP NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_clinica
  FOREIGN KEY (clinica_id) REFERENCES clinics(id);

-- patients
CREATE TABLE patients (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id                  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  nome_completo               VARCHAR(200) NOT NULL,
  nome_social                 VARCHAR(200),
  cpf                         VARCHAR(14),
  data_nascimento             DATE,
  telefone_principal          VARCHAR(20),
  telefone_secundario         VARCHAR(20),
  email                       VARCHAR(180),
  convenio                    VARCHAR(120),
  numero_carteirinha          VARCHAR(60),
  observacoes_administrativas TEXT,
  status                      VARCHAR(30) NOT NULL DEFAULT 'ativo'
                              CHECK (status IN ('ativo','inativo','duplicado_suspeito')),
  origem_migracao_id          UUID,
  criado_em                   TIMESTAMP NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_clinica ON patients(clinica_id);
CREATE INDEX idx_patients_cpf     ON patients(clinica_id, cpf);

-- import_files
CREATE TABLE import_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id            UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  nome_original         VARCHAR(255) NOT NULL,
  tamanho_bytes         BIGINT NOT NULL,
  mime                  VARCHAR(80)  NOT NULL,
  caminho_armazenamento VARCHAR(500) NOT NULL,
  hash_sha256           CHAR(64)     NOT NULL,
  status                VARCHAR(20)  NOT NULL DEFAULT 'recebido',
  enviado_por           UUID NOT NULL REFERENCES users(id),
  criado_em             TIMESTAMP NOT NULL DEFAULT now()
);

-- migrations
CREATE TABLE migrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id          UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  arquivo_id          UUID NOT NULL REFERENCES import_files(id),
  mapeamento_colunas  JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_linhas        INTEGER NOT NULL DEFAULT 0,
  total_validas       INTEGER NOT NULL DEFAULT 0,
  total_invalidas     INTEGER NOT NULL DEFAULT 0,
  total_duplicados    INTEGER NOT NULL DEFAULT 0,
  status              VARCHAR(20) NOT NULL DEFAULT 'em_revisao',
  iniciada_em         TIMESTAMP NOT NULL DEFAULT now(),
  finalizada_em       TIMESTAMP
);

ALTER TABLE patients
  ADD CONSTRAINT fk_patients_migracao
  FOREIGN KEY (origem_migracao_id) REFERENCES migrations(id);

-- migration_errors
CREATE TABLE migration_errors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migracao_id     UUID NOT NULL REFERENCES migrations(id) ON DELETE CASCADE,
  linha           INTEGER NOT NULL,
  coluna          VARCHAR(80),
  valor_recebido  TEXT,
  motivo          VARCHAR(200) NOT NULL,
  severidade      VARCHAR(10)  NOT NULL CHECK (severidade IN ('warning','error')),
  criado_em       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_errors_migracao ON migration_errors(migracao_id);

-- audit_logs
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID REFERENCES users(id),
  clinica_id   UUID REFERENCES clinics(id),
  acao         VARCHAR(60)  NOT NULL,
  recurso      VARCHAR(60),
  recurso_id   VARCHAR(80),
  ip           VARCHAR(45),
  user_agent   VARCHAR(255),
  request_id   VARCHAR(64),
  criado_em    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_clinica_data ON audit_logs(clinica_id, criado_em);
```

### 3.3 Relacionamentos principais
- Um **usuário** pertence a uma **clínica** (1:N). Um usuário pode ter papel admin_sistema sem clínica.
- Uma **clínica** tem um **responsável** (usuário dono) e zero ou mais **secretárias**.
- Uma **clínica** tem N **pacientes**.
- Uma **clínica** tem N **arquivos de importação**.
- Cada **arquivo** gera uma ou mais **migrações** (na prática, geralmente uma).
- Cada **migração** pode gerar N **erros**.
- Cada **paciente** pode apontar para a **migração** que o originou.
- Todos os recursos sensíveis estão ligados a `clinica_id` — é o tenant.
- **audit_logs** referencia `clinica_id` e `usuario_id`, mas é tabela de inserção contínua (somente append).

### 3.4 Boas práticas adicionais
- Toda query no DAO de Paciente, Migração e Arquivo deve carregar `clinica_id` no `WHERE`. Isso é tratado por convenção e validado em testes.
- `ON DELETE CASCADE` é usado com cuidado: deletar uma clínica apaga seus dados. Usado para atender LGPD (direito ao apagamento).
- `audit_logs` não tem `ON DELETE CASCADE` para usuário/clínica — ele preserva o registro do evento mesmo se o usuário sair (substituímos por NULL na FK).

---

## 4. Fluxo Principal do Sistema

### 4.1 Fluxo do usuário (visão de quem usa)
1. O usuário acessa o ClinicBridge e cria uma conta com nome, e-mail e senha.
2. Faz login e cadastra a clínica (nome, CNPJ opcional, aceite de termos e LGPD).
3. No painel, clica em "Nova migração" e envia o arquivo exportado do sistema antigo (CSV ou XLSX).
4. O sistema lê o arquivo e mostra um preview com as primeiras linhas e as colunas detectadas.
5. O usuário confirma ou ajusta o mapeamento (qual coluna do arquivo é nome, qual é telefone, etc.).
6. O sistema processa o arquivo inteiro em background, valida cada campo, detecta duplicados e marca dados incompletos.
7. O usuário entra na tela de revisão, corrige o que faltar, decide o que fazer com duplicados.
8. Confirma a migração. O sistema gera um arquivo limpo em CSV e XLSX, junto com um relatório de migração.
9. O usuário baixa os arquivos e, se quiser, exclui o original do sistema.
10. Cada passo importante fica registrado em log de auditoria.

### 4.2 Fluxo técnico (visão de backend)
1. Cliente envia `POST /auth/login` → Controller valida credenciais via UsuarioDAO → gera JWT/sessão.
2. Cliente envia `POST /imports` com multipart/form-data → middleware verifica:
   - sessão válida;
   - tenant (clínica do usuário);
   - tamanho ≤ limite;
   - extensão e MIME na allowlist (CSV, XLSX).
3. Controller chama `ImportService.receberArquivo()` → grava metadados via `ArquivoImportacaoDAO`, salva o blob no S3 (chave única, criptografia em repouso), registra hash SHA-256.
4. Um job de fila (`parseImportJob`) é enfileirado no Redis/BullMQ.
5. Worker pega o job, faz parse com `csv-parse` ou `exceljs` em streaming (não carrega tudo em memória), gera preview (primeiras 20 linhas) e devolve para o frontend via endpoint `GET /imports/:id/preview`.
6. Usuário confirma mapeamento → `POST /migrations` cria registro em `migrations` e enfileira `validateMigrationJob`.
7. Worker valida linha a linha, grava erros em `migration_errors`, atualiza contadores. Detecção de duplicados roda dentro do tenant.
8. Frontend faz polling (ou usa WebSocket/SSE) para acompanhar progresso.
9. Quando terminar, usuário entra em `GET /migrations/:id/review`, corrige itens, e dispara `POST /migrations/:id/export`.
10. Worker gera os arquivos finais (CSV + XLSX + PDF de relatório), guarda no S3 e libera link temporário assinado (validade curta).
11. Em todos os endpoints sensíveis, um middleware `auditLogger` grava entrada em `audit_logs` antes de retornar a resposta.

### 4.3 Diagrama de fluxo de dados (DFD nível 1, simplificado)
```
[ Usuário Web ]
      │ HTTPS
      ▼
[ Frontend React ] ─────────► [ API Backend (Express) ]
                                    │
                                    ├──► [ Banco PostgreSQL ]
                                    ├──► [ Fila Redis/BullMQ ] ──► [ Worker Parser ]
                                    └──► [ Storage S3-compatível ]
```
Fronteiras de confiança (trust boundaries):
- Internet ↔ Frontend (TLS).
- Frontend ↔ API (token de sessão).
- API ↔ Banco / Fila / Storage (rede privada, credenciais isoladas).

---

## 5. Segurança

A base desta seção vem dos princípios discutidos nas aulas de Software Seguro: CIAA, design seguro (OWASP A06 — Insecure Design), modelagem de ameaças com STRIDE, codificação segura (ASVS e SEI CERT), e do material de Resposta a Incidentes (NIST CSF + NIST SP 800-61).

### 5.1 Autenticação
- Senhas com hash forte (argon2id ou bcrypt cost ≥ 12).
- Política mínima de senha: 10 caracteres, com letra e número.
- Limite de tentativas e bloqueio temporário após 5 falhas seguidas.
- Login registrado em audit_logs (sucesso e falha).
- Recuperação de senha por token único por e-mail (sem "perguntas e respostas", que o material classifica como controle fraco).

### 5.2 Autorização
- Verificação dupla: papel do usuário (RBAC) e tenant (clínica).
- Middleware `requireAuth` + `requireSameClinic`.
- Ações administrativas (apagar clínica, ver logs) só com papel `dono_clinica` ou `admin_sistema`.

### 5.3 Controle de acesso por clínica (multi-tenant)
- Cada request autenticada carrega `clinica_id` no contexto.
- Toda query passa por DAO que recebe `clinica_id` como parâmetro obrigatório.
- Teste automatizado: tentativa de acessar paciente de outra clínica retorna 403.

### 5.4 Criptografia de senhas
- argon2id como padrão; bcrypt como alternativa.
- Nunca logar senha, mesmo mascarada.
- Trocar de algoritmo é trocar de função no `AuthService`.

### 5.5 Proteção contra SQL Injection
- 100% das queries via ORM ou queries parametrizadas (`$1, $2`).
- Proibido concatenar string para montar SQL.
- Lint regra bloqueando `+` em strings que contenham `SELECT|UPDATE|DELETE`.

### 5.6 Proteção contra XSS
- React por padrão escapa conteúdo. Evitar `dangerouslySetInnerHTML`.
- Sanitização adicional em campos livres (observações administrativas).
- Cabeçalhos `Content-Security-Policy` restritivos.

### 5.7 Validação de upload
- Allowlist de extensões: `.csv`, `.xlsx`.
- Verificação de MIME real (`file-type`), não só do nome.
- Limite de tamanho: 20 MB por arquivo no MVP.
- Limite de tempo de parse: 5 minutos por arquivo.
- Arquivo salvo com nome aleatório (UUID) — nunca o nome original na URL.
- Hash SHA-256 calculado e armazenado para integridade.

### 5.8 Logs de auditoria
- Eventos registrados: login (sucesso/falha), upload, export, delete, visualização de paciente em massa, troca de senha, troca de plano.
- Cada log carrega: usuário, clínica, ação, recurso, IP, user-agent, request_id, timestamp.
- Tabela `audit_logs` é somente append; não permitimos UPDATE/DELETE no DAO.
- Logs centralizados, sincronizados via NTP (recomendado no material de IR para correlação confiável).

### 5.9 Backup
- Backup diário do banco com retenção mínima de 30 dias.
- Backups criptografados em repouso.
- Restore testado pelo menos uma vez por mês (teste de recuperação).
- Armazenamento em região diferente do banco principal.

### 5.10 Princípio do menor privilégio
- Conta do banco usada pela aplicação não tem `DROP`, `TRUNCATE`, `SUPERUSER`.
- Worker e API têm credenciais separadas com permissões mínimas.
- S3 bucket sem leitura pública; acesso por URL assinada com expiração curta.

### 5.11 Separação por tenant/clínica
- Convenção forte: `clinica_id` em toda tabela sensível.
- Em médio prazo, avaliar Row Level Security (RLS) do PostgreSQL para reforçar isolamento mesmo se um DAO esquecer o filtro.

### 5.12 LGPD
- Termos de Uso e Política de Privacidade visíveis no cadastro.
- Aceite registrado (data, IP, versão do termo).
- Contrato de tratamento de dados (operador) com a clínica.
- Direito de exportar todos os dados em CSV (autoatendimento).
- Direito de excluir todos os dados, com confirmação por e-mail.
- DPO definido, com canal `dpo@clinicbridge.com.br`.

### 5.13 Dados sensíveis
- No MVP, nenhum dado clínico (diagnóstico, exame, prescrição) é armazenado — minimização.
- CPF e dados de contato são considerados sensíveis e protegidos por controle de acesso e auditoria.
- Em médio prazo, criptografia em coluna para CPF.

### 5.14 Consentimento / contrato
- Termo aceito antes de qualquer upload.
- Contrato em PDF disponível para download.
- Versão do termo gravada junto com o aceite.

### 5.15 Exportação e exclusão de dados
- Botão "Exportar tudo" no painel da clínica → gera ZIP com CSV de pacientes + histórico de migrações + logs próprios.
- Botão "Excluir clínica e dados" → confirmação por e-mail; após confirmar, exclusão lógica imediata, exclusão física em 30 dias (janela para arrependimento).

### 5.16 Proteção contra vazamento de arquivos
- Sem URL pública para arquivos.
- Download apenas via endpoint autenticado que gera URL assinada com expiração de 10 minutos.
- Nome do arquivo no S3 é UUID — não vaza nome do paciente nem da clínica.
- Headers de download forçam `Content-Disposition: attachment` para evitar render no browser.

### 5.17 Cabeçalhos e configuração web
- HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY.
- Cookies de sessão `Secure`, `HttpOnly`, `SameSite=Lax`.
- CORS restrito ao domínio do frontend.
- Rate limit por IP em login e upload.

### 5.18 Resposta a incidentes (alinhado ao NIST SP 800-61)
- **Preparação:** playbook escrito para vazamento de dados; contatos definidos; logs com retenção adequada; NTP em todos os hosts.
- **Detecção e análise:** alertas automáticos para falhas de login em massa, picos de upload, erros 5xx.
- **Contenção:** bloqueio de IP, rotação de tokens, isolamento do worker.
- **Erradicação:** patch da causa raiz, troca de credenciais.
- **Recuperação:** restore de backup se necessário.
- **Lições aprendidas:** post-mortem documentado, ajuste de controles.

### 5.19 SDLC seguro
Inspirado no OWASP SAMM (mencionado no material de Modelagem de Ameaças):
- Revisão de código obrigatória em PRs.
- Análise estática automática no CI.
- Testes de fluxos críticos (login, upload, exportação, acesso cross-tenant).
- Pentest anual quando o produto crescer.

---

## 6. Modelagem de Ameaças (STRIDE)

Aplicação da metodologia STRIDE descrita no material de Software Seguro. Para cada categoria, listamos riscos específicos do ClinicBridge.

### 6.1 Spoofing (fingir identidade)
**Descrição:** atacante se passa por outro usuário ou por outra clínica.
**Impacto:** acesso a pacientes alheios, dano à reputação, multa LGPD.
**Mitigação:** autenticação obrigatória, senhas com argon2, MFA opcional para dono_clinica, tokens curtos, rate limit em login, log de tentativa de login.

### 6.2 Tampering (alteração indevida)
**Descrição:** atacante altera dados em trânsito ou em repouso (ex: muda telefone de paciente, edita um arquivo durante o parse).
**Impacto:** dado corrompido, perda de confiança, decisão clínica errada (em versões futuras).
**Mitigação:** HTTPS obrigatório, validação no servidor (não confiar no cliente), hash SHA-256 do arquivo enviado, transações atômicas no banco, ORM com tipos validados, audit_logs registrando mudanças.

### 6.3 Repudiation (negar a ação)
**Descrição:** usuário ou atacante alega que não fez algo (ex: "não fui eu que apaguei a clínica").
**Impacto:** dificuldade jurídica, problema em incidente LGPD.
**Mitigação:** audit_logs imutáveis, request_id em cada chamada, timestamp confiável (NTP), retenção mínima de 1 ano dos logs, e-mail de confirmação para ações destrutivas.

### 6.4 Information Disclosure (vazamento)
**Descrição:** dados sensíveis vazam (URL pública de arquivo, mensagem de erro detalhada, logs com PII, enumeração de e-mail no login).
**Impacto:** alto — dado de saúde é categoria especial pela LGPD.
**Mitigação:** mensagens de erro neutras, sem detalhes técnicos para o usuário final; URLs assinadas com expiração; logs sem senha e sem CPF; respostas iguais para "e-mail não existe" e "senha errada"; criptografia em repouso; revisão de PR focada em logs.

### 6.5 Denial of Service (derrubar/abusar)
**Descrição:** atacante envia muitos arquivos enormes, brute force no login, ou abusa de endpoints caros.
**Impacto:** indisponibilidade, custo de infra alto, clientes legítimos travados.
**Mitigação:** rate limit por IP e por conta, limite de tamanho de arquivo, parse em fila assíncrona com timeout, circuit breaker, monitoramento de uso, captcha em login após N falhas.

### 6.6 Elevation of Privilege (subir privilégio)
**Descrição:** usuário comum consegue ações de admin (ver outra clínica, listar todos os usuários, executar ação destrutiva).
**Impacto:** comprometimento sério da plataforma e dos clientes.
**Mitigação:** controle de acesso baseado em papel e tenant, verificação no Controller e no DAO, separação clara de rotas administrativas, testes automatizados de cross-tenant, princípio do menor privilégio no banco.

### 6.7 Tabela resumo (DFD x STRIDE)
| Fluxo / Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| Usuário ↔ API (login) | Alto | Médio | Médio | Médio | Alto | Médio |
| API ↔ Banco | Baixo | Médio | Médio | Alto | Médio | Alto |
| API ↔ Storage (arquivos) | Médio | Médio | Médio | **Alto** | Médio | Médio |
| Worker ↔ Fila | Baixo | Médio | Baixo | Baixo | Médio | Baixo |
| Admin ↔ Painel | Médio | Médio | Médio | Médio | Baixo | **Alto** |

---

## 7. Backlog por Sprints

Cada item tem um critério de aceite resumido. A divisão segue a sugerida, com ajustes pequenos para encaixar melhor.

### Sprint 1 — MVP base (2 semanas)
- **US-01** Cadastro de usuário (e-mail + senha forte). *Aceite:* senha não trafega em log; hash argon2 no banco.
- **US-02** Login com sessão/token. *Aceite:* token expira em 1h; refresh válido por 7 dias.
- **US-03** Cadastro de clínica com aceite de termos. *Aceite:* aceite gravado com data, IP e versão do termo.
- **US-04** Upload de arquivo CSV/XLSX. *Aceite:* allowlist de extensão e MIME; limite de 20 MB; nome interno é UUID.
- **US-05** Parse e preview das primeiras 20 linhas. *Aceite:* preview disponível em até 30s para arquivo de até 5 MB.
- **US-06** Tela de mapeamento de colunas. *Aceite:* sugestão automática + edição manual.

### Sprint 2 — Migração (2 semanas)
- **US-07** Normalização de telefone, e-mail e CPF. *Aceite:* telefone padronizado em E.164; CPF com checagem de dígito.
- **US-08** Detecção de duplicados por CPF e por nome+telefone. *Aceite:* registros marcados como `duplicado_suspeito`.
- **US-09** Tela de revisão (corrigir, ignorar, mesclar). *Aceite:* alterações geram registro em audit_logs.
- **US-10** Exportação limpa em CSV e XLSX. *Aceite:* arquivos abrem sem erro em Excel e LibreOffice.
- **US-11** Relatório PDF de migração. *Aceite:* mostra total processado, válidos, inválidos, duplicados.

### Sprint 3 — Segurança e auditoria (2 semanas)
- **US-12** Audit_logs cobrindo ações sensíveis. *Aceite:* testes confirmam que login, upload, export e delete geram log.
- **US-13** Controle de acesso multi-tenant. *Aceite:* teste de cross-tenant retorna 403.
- **US-14** Hardening de upload (MIME real, tamanho, hash). *Aceite:* upload de `.exe` renomeado para `.csv` é bloqueado.
- **US-15** Backup diário automatizado e teste de restore. *Aceite:* relatório semanal de backup; restore validado.
- **US-16** Rate limit em login e upload. *Aceite:* 5 falhas em 5 minutos bloqueiam por 15 minutos.
- **US-17** Cabeçalhos de segurança (CSP, HSTS, etc.). *Aceite:* nota A em ferramenta de scan (ex: Mozilla Observatory).

### Sprint 4 — Comercial (2 semanas)
- **US-18** Landing page com descrição e CTA. *Aceite:* página carrega em até 2s; formulário envia lead para CRM/e-mail.
- **US-19** Formulário de lead com double opt-in. *Aceite:* e-mail de confirmação enviado em 1 minuto.
- **US-20** Plano pago (cobrança avulsa via Stripe/Pagar.me). *Aceite:* fluxo de compra termina em "obrigado" + ativação automática.
- **US-21** Painel administrativo simples (usuários, clínicas, migrações). *Aceite:* acessível só por `admin_sistema`.
- **US-22** Página de exclusão/exportação de dados (LGPD). *Aceite:* usuário consegue baixar tudo e apagar tudo sem suporte.

### Sprint 5 (opcional, pós-MVP) — Refino
- Convite de secretária com permissão restrita.
- Integração com WhatsApp Business (apenas para confirmar consulta — ainda sem dado clínico).
- Modo "dry run" para parceiros que migram em volume.
- Importação direta de planilhas vindas dos sistemas mais comuns do mercado.

---

## 8. Roteiro da Apresentação (13 slides)

### Slide 1 — Título
**Título:** ClinicBridge — migração segura de dados para clínicas pequenas.
**Tópicos:** logo do projeto; autor; data; "um SaaS para sair do sistema antigo sem perder paciente".
**Fala:** "Vou apresentar o ClinicBridge, um projeto de SaaS para clínicas pequenas que precisam migrar dados de sistemas antigos. A ideia é ajudar a sair desses sistemas sem perder paciente, sem perder agenda e sem perder noites de sono."

### Slide 2 — Problema
**Título:** O problema real
**Tópicos:** sistemas antigos descontinuados; planilhas espalhadas; risco de perder dado; LGPD.
**Fala:** "Clínicas pequenas trocam de software o tempo todo. Quando isso acontece, alguém da secretaria fica horas copiando dados entre planilhas. É lento, dá erro e expõe informações sensíveis. Esse é o problema que o ClinicBridge resolve."

### Slide 3 — Público-alvo
**Título:** Para quem é
**Tópicos:** clínicas com 1 a 10 profissionais; consultórios individuais; secretárias; revendedores de software.
**Fala:** "O foco são clínicas pequenas e profissionais que ainda usam planilha ou software antigo. Também temos como público secundário consultores que ajudam clínicas a migrar — eles podem usar a ferramenta como serviço."

### Slide 4 — Solução proposta
**Título:** O que o ClinicBridge faz
**Tópicos:** upload CSV/XLSX; preview; mapeamento de colunas; validação; detecção de duplicados; exportação limpa; relatório.
**Fala:** "O fluxo é simples: o cliente sobe o arquivo, vê um preview, ajusta colunas, revisa o que está errado e exporta um arquivo limpo. Tudo isso com auditoria e segurança no caminho."

### Slide 5 — Funcionalidades principais
**Título:** Funcionalidades do MVP
**Tópicos:** auth; clínica; upload; parse; mapeamento; validação; duplicados; revisão; exportação; relatório.
**Fala:** "Para a primeira versão, focamos só nos dados administrativos: nome, telefone, e-mail, data de nascimento, convênio, agenda básica. Nada de prontuário ou prescrição — isso fica para depois."

### Slide 6 — Arquitetura MVC + DAO
**Título:** Arquitetura
**Tópicos:** Model, View, Controller, DAO + Service; estrutura de pastas; comunicação entre camadas.
**Fala:** "Usamos MVC com DAO. O Controller só coordena, o Service tem a regra de negócio, e o DAO é o único que conversa com o banco. Isso facilita revisar segurança e manter o código limpo."

### Slide 7 — Banco de dados
**Título:** Modelo de dados
**Tópicos:** users, clinics, patients, import_files, migrations, migration_errors, audit_logs; multi-tenant via clinica_id.
**Fala:** "PostgreSQL com sete tabelas principais. A peça central é o clinica_id, presente em tudo que é sensível — assim cada clínica enxerga só os próprios dados."

### Slide 8 — Fluxo do sistema
**Título:** Como o sistema funciona
**Tópicos:** cadastro → upload → parse → mapeamento → validação → revisão → exportação → log.
**Fala:** "O usuário entra, cadastra a clínica, sobe o arquivo. Em background a gente faz o parse e a validação. Ele revisa, exporta e baixa. Cada passo crítico vai para o log de auditoria."

### Slide 9 — Segurança e LGPD
**Título:** Segurança desde o desenho
**Tópicos:** auth forte; multi-tenant; criptografia; audit_logs; LGPD (consentimento, exportação, exclusão); backup; rate limit.
**Fala:** "Aplicamos CIAA e princípios do OWASP. Senhas em argon2, controle por clínica, validação rigorosa de upload, logs imutáveis e fluxo de exclusão para atender LGPD. O produto nasce com segurança, não recebe depois."

### Slide 10 — Modelagem de ameaças
**Título:** STRIDE no ClinicBridge
**Tópicos:** Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege; principais mitigações.
**Fala:** "Fizemos uma modelagem de ameaças simples usando STRIDE. As maiores preocupações são vazamento de informação e escalada de privilégio. Para cada uma temos mitigação prática: URLs assinadas, controle por tenant, logs, rate limit."

### Slide 11 — Modelo de monetização
**Título:** Como ganha dinheiro
**Tópicos:** plano avulso por migração; plano recorrente mensal; parceria com consultores.
**Fala:** "Três caminhos: cobrar por migração avulsa para quem precisa só uma vez; assinatura mensal para quem quer manter histórico e backups; e parcerias com consultores que atendem várias clínicas."

### Slide 12 — Roadmap
**Título:** O que vem depois
**Tópicos:** sprints 1 a 4; pós-MVP (convite de secretária, WhatsApp, integrações nativas).
**Fala:** "O MVP cabe em quatro sprints, cerca de oito a dez semanas. Depois entram convites de equipe, integrações com sistemas comuns e, em médio prazo, módulos de agenda recorrente."

### Slide 13 — Conclusão
**Título:** Por que o ClinicBridge faz sentido
**Tópicos:** escopo controlado; segurança real; mercado claro; MVP vendável em pouco tempo.
**Fala:** "O ClinicBridge não tenta ser um prontuário. Ele resolve uma dor pontual, com escopo controlado, segurança séria e potencial real de venda. É um produto que cabe em um MVP curto e que pode evoluir com tração de mercado."

---

## 9. Conteúdo do Relatório (formato PDF)

### Capa
**ClinicBridge — Plataforma de migração segura de dados administrativos para clínicas pequenas**
Autor: Marco Rodrigues · Maio de 2026 · Versão 1.0

### 9.1 Introdução
O ClinicBridge é um projeto de SaaS direcionado a clínicas pequenas e profissionais de saúde autônomos que precisam migrar dados de sistemas antigos para novas ferramentas. O foco inicial é em dados administrativos (pacientes, contatos, agenda), evitando dados clínicos sensíveis na primeira versão para reduzir risco regulatório e manter o escopo controlado.

### 9.2 Justificativa
Migrar dados entre sistemas é uma necessidade frequente em clínicas. Hoje, o processo é manual, demorado e propenso a erro. Além disso, expõe dados pessoais em planilhas e e-mails sem controle. Existe espaço para uma ferramenta especializada que cuide desse processo de forma segura, auditável e com baixo atrito de uso.

### 9.3 Objetivos
**Geral:** oferecer uma plataforma web que ajude clínicas pequenas a migrar, limpar e exportar dados administrativos de forma segura e auditável.
**Específicos:** ler arquivos CSV/XLSX; detectar campos e duplicados; permitir revisão; exportar arquivos limpos; manter trilha de auditoria; atender LGPD; isolar dados por clínica.

### 9.4 Descrição do sistema
O sistema é web, multi-tenant, com upload assíncrono, parser tolerante e tela de revisão antes da exportação final. Mantém histórico, gera relatório de migração e oferece autoatendimento para exportação e exclusão (LGPD).

### 9.5 Arquitetura MVC + DAO
Adotamos MVC para separar responsabilidades (Model, View, Controller) e DAO para isolar acesso ao banco. Uma camada Service mantém regras de negócio. Esse desenho ajuda em manutenção, testes e revisão de segurança, porque o ponto único de acesso ao banco facilita aplicar parametrização, controle de tenant e auditoria. Detalhes na seção 2 deste documento.

### 9.6 Banco de dados
PostgreSQL com sete tabelas centrais: users, clinics, patients, import_files, migrations, migration_errors e audit_logs. O isolamento entre clientes é garantido pelo campo clinica_id em todas as tabelas sensíveis. Detalhes na seção 3.

### 9.7 Segurança
Aplicamos princípios de CIAA (Confidencialidade, Integridade, Disponibilidade, Autenticidade), práticas do OWASP (com atenção a A06 — Insecure Design), validação rigorosa de upload, controle de acesso baseado em papel e tenant, criptografia de senha com argon2, criptografia em repouso para arquivos, logs imutáveis e rate limit. O plano de resposta a incidentes segue o ciclo do NIST SP 800-61. Detalhes na seção 5.

### 9.8 Modelagem de ameaças
Aplicação simplificada de STRIDE sobre o DFD nível 1 do sistema. As categorias com maior risco no ClinicBridge são Information Disclosure (vazamento) e Elevation of Privilege (escalada de privilégio). Mitigações listadas por categoria na seção 6.

### 9.9 Backlog
Quatro sprints de duas semanas para o MVP: base (auth + upload + preview), migração (validação + duplicados + exportação), segurança e auditoria, e camada comercial. Detalhes na seção 7.

### 9.10 Monetização
Três modelos previstos: pagamento avulso por migração, plano mensal recorrente e parcerias com consultores. Para o lançamento, o foco é validar o avulso, que tem ciclo de venda mais curto.

### 9.11 Conclusão
O ClinicBridge tem escopo controlado, segurança aplicada desde o desenho e um caminho claro para validação comercial. O MVP é construível em torno de dez semanas e responde a uma dor recorrente do mercado de clínicas pequenas.

### 9.12 Referências / conceitos utilizados (pasta Ciber)
Os conceitos a seguir foram extraídos diretamente dos materiais da pasta "Ciber" e aplicados no desenho do projeto:

- **Modelagem de Ameaças (aula 02 — SoftwareSeguro):** uso de DFD com fronteiras de confiança e STRIDE como roteiro para identificar ameaças por fluxo. Esta abordagem orientou a seção 6 deste documento.
- **OWASP Top 10 / A06 Insecure Design (aula 02):** ideia de que controles precisam aparecer no desenho do sistema, não só no código. Aplicada no fluxo de upload, autenticação e exclusão.
- **CIAA / requisitos de segurança (aula 02):** transformação de propriedades em requisitos testáveis. Aplicada nos requisitos RS01–RS13.
- **Padrões de Projeto / MVC + DAO (aula 05):** definição de papéis e benefícios da separação. Aplicada na seção 2.
- **Java MVC (aula 04):** referência conceitual sobre como organizar pastas e responsabilidades. Adaptada para Node/Express.
- **Codificação Segura — ASVS e SEI CERT (aula 07):** validação de entrada, tratamento de erro, sanitização. Aplicada nos requisitos RS04, RS05, RS06.
- **Criptografia simétrica e assimétrica (aula 08):** base para escolha de criptografia em repouso para arquivos e TLS em trânsito.
- **Resposta a Incidentes — NIST CSF e NIST SP 800-61 (aulas 02 e 03 de Resposta a Incidentes):** ciclo Preparação → Detecção → Contenção → Erradicação → Recuperação → Lições Aprendidas. Aplicado na seção 5.18.

> Observação: as referências acima são conceituais e foram retiradas do conteúdo das aulas. Não inventamos fontes externas.

---

## 10. Próximos Passos para Implementação

1. **Validar a dor (1 semana):** conversar com 5 a 10 clínicas pequenas. Confirmar se elas pagariam por uma migração organizada e quanto pagariam.
2. **Definir identidade visual mínima (3 dias):** logo, paleta, nome de domínio (clinicbridge.com.br).
3. **Setup do repositório e CI (2 dias):** monorepo com frontend e backend; lint, formatter, testes, GitHub Actions; templates de PR e issue.
4. **Sprint 1 (2 semanas):** auth, cadastro de clínica, upload, preview. Deploy em ambiente de staging.
5. **Sprint 2 (2 semanas):** mapeamento, validação, duplicados, revisão, exportação. Primeira clínica-piloto.
6. **Sprint 3 (2 semanas):** hardening completo, audit_logs, backups, rate limit, headers, testes de cross-tenant.
7. **Sprint 4 (2 semanas):** landing, lead, plano avulso, painel admin. Habilitar pagamento.
8. **Soft launch (1 semana):** 3 a 5 clientes-piloto com desconto, em troca de feedback.
9. **Lançamento público:** anúncio em grupos de gestão de clínica, parcerias com 1 ou 2 consultores.
10. **Pós-lançamento:** medir tempo médio de migração, taxa de conversão, taxa de churn nos primeiros 30 dias; ajustar preço e funcionalidades.

### Critérios para considerar o MVP "validado"
- Pelo menos 5 migrações pagas concluídas.
- NPS médio igual ou maior que 7 entre os primeiros clientes.
- Zero incidentes de segurança graves.
- Tempo médio do upload até a exportação inferior a 30 minutos.

---

## 11. Referências aos Documentos da pasta "Ciber"

Conteúdos da pasta efetivamente utilizados como base deste projeto:

- `SoftwareSeguro/Aulas/2026_aula02_model_ameaca.pdf` — STRIDE, DFD, CIAA, OWASP A06, abuse cases.
- `SoftwareSeguro/Aulas/aula05_ss_padroes.pdf` — Padrões GoF, MVC, MVC + DAO.
- `SoftwareSeguro/Aulas/aule04_java_mvc.pdf` — referência prática de estrutura MVC.
- `SoftwareSeguro/aula_07_ss_sc_docs.pdf` — Codificação segura, ASVS, SEI CERT, validação de entrada.
- `SoftwareSeguro/aula_08_ss_criptografia.pdf` — Criptografia simétrica e assimétrica.
- `Respostas a Incidentes de Ciber/Aula 02 - 09-03.pdf` — NIST CSF, NIST SP 800-61, ciclo de IR.
- `Respostas a Incidentes de Ciber/Aula 03 - 16-03.pdf` — preparação, detecção, comunicação em incidentes.

> Os demais materiais da pasta (Forense, Performance, Network+, ESP32, LOL, Projeto Comunitário) não foram diretamente aplicados porque tratam de outras áreas — mas alguns conceitos gerais (logs, evidência, integridade de dados) reforçam as escolhas feitas aqui.

---

## Revisão final (checklist)

- [x] Projeto coerente — segue uma única ideia (migração) sem inflar.
- [x] Escopo do MVP controlado — sem prontuário, sem prescrição, sem telemedicina.
- [x] Segurança tratada desde o desenho — CIAA, STRIDE, OWASP, LGPD, NIST.
- [x] Arquitetura MVC + DAO clara, com camada Service e estrutura de pastas.
- [x] Banco de dados modelado com multi-tenant via `clinica_id`.
- [x] Backlog dividido por sprints com critérios de aceite.
- [x] Modelagem de ameaças cobrindo as seis categorias STRIDE.
- [x] Roteiro de apresentação completo (13 slides).
- [x] Relatório com capa, introdução, justificativa, objetivos, descrição, arquitetura, banco, segurança, ameaças, backlog, monetização, conclusão e referências.
- [x] Documentos da pasta "Ciber" usados de fato como base.
- [x] Estilo de texto humanizado, sem jargão exagerado nem clichês de marketing.
