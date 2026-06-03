# EventHub — Plataforma Serverless de Gestão de Eventos

Plataforma completa para gerenciamento de eventos e inscrições, construída com arquitetura 100% serverless na AWS. Projeto de demonstração para webinar Cloud Native + Serverless.

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  CloudFront │────▶│  S3 (Frontend)│     │   API Gateway    │
└─────────────┘     └──────────────┘     │   (HTTP API)     │
                                          └───────┬──────────┘
                                                  │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
                     │ Lambda (Events)│  │Lambda (Registr.)│  │  Lambda (Docs) │
                     └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
                             │                   │                    │
                             ▼                   ▼                    ▼
                     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                     │   DynamoDB   │    │Aurora Serverl.│    │  S3 (Docs)   │
                     │  (Catálogo)  │    │  PostgreSQL   │    │              │
                     └──────────────┘    └──────────────┘    └──────────────┘
```

**Serviços utilizados:**
- **API Gateway** (HTTP API) — Roteamento com CORS habilitado
- **Lambda** (Node.js 22.x) — Lógica de negócio com esbuild
- **DynamoDB** — Catálogo de eventos (baixa latência)
- **Aurora Serverless v2** (PostgreSQL 16) — Inscrições e participantes (transações ACID)
- **S3** — Upload de documentos via presigned URL + hosting do frontend
- **CloudFront** — CDN para o frontend estático
- **SNS + CloudWatch Alarms** — Observabilidade e notificações
- **SQS DLQ** — Dead Letter Queue para processamento de documentos com falha
- **VPC** — Rede privada com NAT Instance (fck-nat) para Lambda acessar Aurora
- **Lambda Powertools** — Logging estruturado, métricas e tracing (X-Ray)

## Pré-requisitos

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configurado com um perfil
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Node.js 22+](https://nodejs.org/)
- [jq](https://jqlang.github.io/jq/) (para os scripts de demo)

## Início Rápido

### 1. Instalar dependências

```bash
npm install
```

### 2. Build do projeto

```bash
sam build
```

Compila todas as Lambda functions usando esbuild (minificado, sourcemaps, target ES2022).

### 3. Deploy na AWS

```bash
sam deploy --guided    # Primeira vez (configura o samconfig.toml)
sam deploy             # Deploys subsequentes
```

O deploy cria toda a infraestrutura: VPC, Aurora, DynamoDB, API Gateway, Lambdas, S3, CloudFront, alarmes, etc.

**Parâmetros configuráveis:**

| Parâmetro | Descrição | Default |
|-----------|-----------|---------|
| `AdminEmail` | E-mail para receber alertas via SNS | `admin@example.com` |
| `NATInstanceAMI` | AMI do fck-nat (us-east-1) | `ami-086c08b98cb348e57` |

### 4. Aplicar schema no banco

Após o deploy, execute o script para criar as tabelas no Aurora PostgreSQL:

```bash
npx tsx scripts/apply-schema.ts --profile=<seu-profile> --region=us-east-1
```

O script:
- Identifica o cluster Aurora automaticamente pelo nome da stack
- Habilita a Data API (HTTP endpoint) se necessário
- Executa cada statement SQL individualmente via RDS Data API
- Verifica as tabelas criadas ao final

### 5. Seed de eventos (dados iniciais)

```bash
npx tsx scripts/seed-events.ts --profile=<seu-profile> --region=us-east-1
```

### 6. Deploy do frontend

```bash
./scripts/deploy-frontend.sh eventhub-webinar
```

O script lê os outputs da stack (ApiUrl, bucket, distribution ID), injeta a URL da API no `app.js`, sincroniza os arquivos com o S3, e invalida o cache do CloudFront.

## Comandos SAM

| Comando | Descrição |
|---------|-----------|
| `sam build` | Compila as funções Lambda com esbuild |
| `sam deploy` | Faz deploy da stack usando `samconfig.toml` |
| `sam validate` | Valida o template CloudFormation com lint |
| `sam logs -n <FunctionName> --tail` | Stream de logs em tempo real |
| `sam delete` | Remove toda a stack |

## Scripts npm

| Comando | Descrição |
|---------|-----------|
| `npm run build` | Alias para `sam build` |
| `npm run deploy` | Alias para `sam deploy` |
| `npm run validate` | Alias para `sam validate` |
| `npm run lint` | Verificação de tipos (`tsc --noEmit`) |
| `npm test` | Executa todos os testes com cobertura |
| `npm run test:unit` | Apenas testes unitários |
| `npm run test:property` | Apenas testes de propriedade (fast-check) |

## Scripts Utilitários

### `scripts/apply-schema.ts`

Aplica o schema SQL (`sql/schema.sql`) no Aurora Serverless v2 via RDS Data API. Idempotente — ignora objetos que já existem.

```bash
npx tsx scripts/apply-schema.ts --profile=<profile> [--region=<region>] [--stack=<stack-name>]
```

### `scripts/deploy-frontend.sh`

Faz deploy dos arquivos estáticos do frontend (HTML + JS) para o S3 e invalida o CloudFront.

```bash
./scripts/deploy-frontend.sh [stack-name]
```

### `scripts/demo-api.sh`

Menu interativo para demonstrar todas as operações da API. Útil para testar o fluxo completo durante apresentações.

```bash
./scripts/demo-api.sh <aws-profile>
```

Operações disponíveis:
- Setup (schema + seed)
- Endpoints de eventos (listar, detalhe)
- Fluxo completo de inscrição (criar → upload → aprovar/rejeitar)
- Simulação de erros para disparo de alarmes
- Validação de inputs inválidos

## Fluxo de Inscrição

```
Participante                        Sistema                         Admin
     │                                │                               │
     │── POST /registrations ─────────▶│                               │
     │                                │── Valida evento + vagas        │
     │                                │── Cria participante + inscrição│
     │◀── status: PENDING_DOCUMENT ───│                               │
     │                                │                               │
     │── POST .../upload-url ─────────▶│                               │
     │◀── presigned URL ──────────────│                               │
     │                                │                               │
     │── PUT (upload S3) ─────────────▶│                               │
     │                                │── S3 Event → Lambda           │
     │                                │── status: DOCUMENT_UPLOADED    │
     │                                │                               │
     │                                │               POST .../approve │──▶
     │                                │◀── status: APPROVED ──────────│
```

**Estados possíveis:**
- `PENDING_DOCUMENT` — Inscrição criada, aguardando upload
- `DOCUMENT_UPLOADED` — Documento recebido, aguardando revisão
- `APPROVED` — Inscrição aprovada pelo admin
- `REJECTED` — Inscrição rejeitada (com motivo)

## Endpoints da API

### Públicos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/events` | Listar eventos ativos |
| GET | `/events/{eventId}` | Detalhes de um evento |
| POST | `/registrations` | Criar inscrição |
| GET | `/registrations/{id}` | Consultar inscrição |
| POST | `/registrations/{id}/upload-url` | Gerar URL para upload |

### Admin

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/events` | Criar evento |
| DELETE | `/admin/events/{eventId}` | Deletar evento |
| GET | `/admin/registrations` | Listar todas as inscrições |
| GET | `/admin/registrations/{id}` | Detalhe com dados do participante |
| POST | `/admin/registrations/{id}/approve` | Aprovar inscrição |
| POST | `/admin/registrations/{id}/reject` | Rejeitar inscrição |
| POST | `/admin/simulate-error` | Simular erro 500 (demo de alarmes) |

## Estrutura do Projeto

```
eventhub_02_06_2026/
├── template.yaml              # SAM template (toda a infraestrutura)
├── samconfig.toml             # Configurações de deploy
├── package.json               # Dependências e scripts
├── sql/
│   └── schema.sql             # Schema do banco PostgreSQL
├── src/
│   ├── handlers/              # Lambda handlers (entry points)
│   ├── services/              # Lógica de negócio
│   ├── repositories/          # Acesso a dados (DynamoDB + Aurora)
│   │   └── interfaces/        # Contratos dos repositórios
│   ├── shared/                # Utilitários (logger, errors, response, validator)
│   └── types/                 # Tipos TypeScript
├── frontend/
│   ├── index.html             # Página pública (eventos + inscrições)
│   ├── admin.html             # Painel administrativo
│   └── app.js                 # API client + componentes Alpine.js
├── layers/
│   └── powertools/            # Lambda Layer (Powertools for TypeScript)
├── scripts/
│   ├── apply-schema.ts        # Aplicar SQL no Aurora via Data API
│   ├── deploy-frontend.sh     # Deploy do frontend (S3 + CloudFront)
│   └── demo-api.sh            # Menu interativo de demonstração
└── tests/
    ├── unit/                  # Testes unitários (Jest)
    └── property/              # Testes de propriedade (fast-check)
```

## Padrões de Código

- **Handler → Service → Repository** — Separação clara de responsabilidades
- **Inversão de dependência** — Repositórios expõem interfaces, handlers injetam implementações
- **Erros tipados** — Hierarquia de `AppError` (ValidationError, NotFoundError, ConflictError, InvalidStateError)
- **Correlation ID** — Propagado via header `x-correlation-id` para rastreio distribuído
- **Compensação** — Rollback no Aurora se a operação no DynamoDB falhar (Saga simplificada)
- **Observabilidade** — Métricas customizadas, logging estruturado, X-Ray tracing

## Banco de Dados

O schema PostgreSQL (`sql/schema.sql`) cria:

- **participants** — Cadastro de participantes (email único)
- **registrations** — Inscrições vinculadas a participante + evento (constraint de unicidade)
- **registration_audit_logs** — Histórico de mudanças de status

## Observabilidade

- **Alarme 5xx do API Gateway** — Dispara se >5 erros em 5 minutos
- **Alarme de DLQ** — Dispara quando mensagens chegam na Dead Letter Queue
- **Alarme de erros no ProcessDocument** — Dispara se >3 erros em 5 minutos
- **SNS** — Todos os alarmes notificam o e-mail configurado em `AdminEmail`

## Frontend

Frontend estático sem build step:
- **HTML** + **Alpine.js** + **PicoCSS**
- Duas páginas: pública (`index.html`) e admin (`admin.html`)
- API client centralizado em `app.js`
- Para desenvolvimento local, deixe `API_BASE_URL` vazio — fallback para `http://localhost:3000`

## Variáveis de Ambiente das Lambdas

Todas são injetadas automaticamente pelo SAM template via outputs dos recursos:

| Variável | Uso |
|----------|-----|
| `EVENTS_TABLE_NAME` | Nome da tabela DynamoDB |
| `DOCUMENTS_BUCKET_NAME` | Bucket S3 para documentos |
| `PG_HOST` | Endpoint do Aurora |
| `PG_PORT` | Porta do Aurora (5432) |
| `PG_DATABASE` | Nome do banco (`postgres`) |
| `PG_USER` | Usuário do banco (`eventhubadmin`) |
| `PG_SSL` | Conexão SSL (`true`) |
| `DB_SECRET_ARN` | ARN do Secrets Manager (senha do banco) |
