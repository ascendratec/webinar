# Implementation Plan: EventHub Webinar

## Overview

Implementação incremental da plataforma EventHub Serverless em 6 fases, utilizando AWS SAM com TypeScript, seguindo o padrão Repository, com observabilidade via Lambda Powertools Layer.

## Tasks

- [x] 1. Estrutura Inicial do Projeto (SAM + TypeScript + API Gateway + Health)
  - [x] 1.1 Criar estrutura do projeto SAM com TypeScript e esbuild
    - Inicializar projeto com package.json, tsconfig.json e samconfig.toml
    - No samconfig.toml, incluir `parameter_overrides` com `AdminEmail` e `NATInstanceAMI` (AMI do fck-nat para a região)
    - Para obter o AMI: `aws ec2 describe-images --owners 568608671756 --filters 'Name=name,Values=fck-nat-al2023-*-x86_64*' --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text --region us-east-1`
    - Configurar esbuild para bundling das funções Lambda
    - Criar estrutura de pastas: src/handlers, src/services, src/repositories, src/shared, src/types, tests/unit, tests/property
    - Instalar dependências de desenvolvimento (typescript, esbuild, @types/aws-lambda, @types/node@^22, jest, ts-jest)
    - _Requisitos: 1.1_

  - [x] 1.2 Criar template.yaml base com Globals, API Gateway e Lambda Layer
    - Definir Globals com runtime nodejs22.x, timeout 30s, memória 256MB, tracing Active e tags Project=EventHub, Environment=Workshop
    - Definir API Gateway HTTP API (AWS::Serverless::HttpApi) com CORS habilitado (Access-Control-Allow-Origin: "*")
    - Definir Lambda Layer para Powertools (AWS::Serverless::LayerVersion) com CompatibleRuntimes nodejs22.x e Metadata BuildMethod nodejs22.x
    - Definir parâmetro AdminEmail do tipo String
    - **IMPORTANTE**: Runtime DEVE ser nodejs22.x (NÃO nodejs20.x que está deprecated/EOL)
    - _Requisitos: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [x] 1.3 Implementar módulos compartilhados (shared)
    - Criar src/shared/logger.ts — wrapper do Lambda Powertools Logger
    - Criar src/shared/correlation-id.ts — extractOrGenerateCorrelationId(event)
    - Criar src/shared/response.ts — funções success() e error() com formato padronizado (statusCode, message, correlationId)
    - Criar src/shared/errors.ts — classes AppError, ValidationError, NotFoundError, ConflictError, InvalidStateError
    - Criar src/shared/validator.ts — funções de validação (validateEventId, validateRegistrationId, etc.)
    - _Requisitos: 8.1, 8.2, 8.3, 10.4, 10.6_

  - [x] 1.4 Implementar tipos TypeScript (src/types)
    - Criar src/types/event.ts — interface Event com campos eventId, title, description, date, location, capacity, availableSlots, status
    - Criar src/types/registration.ts — interface Registration e tipo RegistrationStatus
    - Criar src/types/participant.ts — interface Participant
    - Criar src/types/api.ts — interfaces ApiErrorResponse, UploadUrlResponse, CreateRegistrationRequest, RejectRegistrationRequest
    - _Requisitos: 10.5_

  - [x] 1.5 Implementar handler GET /health e definir função no template
    - Criar src/handlers/health.ts retornando status 200 com { status: "healthy", timestamp: ISO 8601 }
    - Adicionar HealthFunction no template.yaml com evento HttpApi GET /health
    - Utilizar correlation-id e response builder
    - _Requisitos: 1.3_

- [x] 2. Checkpoint — Validar estrutura inicial
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Catálogo de Eventos com DynamoDB
  - [x] 3.1 Adicionar DynamoDB EventsCatalogTable no template.yaml
    - Definir tabela com partition key "pk" (String), billing PAY_PER_REQUEST
    - Habilitar PITR e criptografia em repouso
    - _Requisitos: 2.1, 2.2_

  - [x] 3.2 Implementar interfaces e repository do catálogo de eventos
    - Criar src/repositories/interfaces/event-repository.ts com interface EventRepository (listActiveEvents, getEventById, decrementAvailableSlots)
    - Criar src/repositories/dynamo-event-repository.ts implementando EventRepository com DynamoDB DocumentClient
    - Usar variáveis de ambiente para nome da tabela
    - _Requisitos: 2.6, 10.2_

  - [x] 3.3 Implementar event-service e handlers de listagem/detalhe
    - Criar src/services/event-service.ts com lógica de negócio
    - Criar src/handlers/list-events.ts — GET /events retornando eventos ACTIVE com todos os campos
    - Criar src/handlers/get-event.ts — GET /events/{eventId} com validação de formato e tratamento 404
    - Adicionar funções ListEventsFunction e GetEventFunction no template.yaml com DynamoDBReadPolicy
    - _Requisitos: 2.3, 2.4, 2.5, 2.7_

  - [x] 3.4 Criar script de seed para popular DynamoDB com eventos de exemplo
    - Criar scripts/seed-events.ts com 4 eventos de exemplo (variando status ACTIVE/INACTIVE)
    - Aceitar argumentos: `--profile=<aws-profile> [--region=<region>] [--stack=<stack-name>]`
    - --profile é obrigatório, --region default us-east-1, --stack default eventhub-webinar
    - Resolver TABLE_NAME automaticamente via CloudFormation DescribeStackResource (LogicalResourceId: EventsCatalogTable)
    - Usar `fromIni({ profile })` de `@aws-sdk/credential-providers` para autenticação
    - Usar `@aws-sdk/client-cloudformation` para resolver o nome físico da tabela
    - Passar region explicitamente ao DynamoDBClient e CloudFormationClient
    - Instalar `@aws-sdk/credential-providers` e `@aws-sdk/client-cloudformation` como dependências
    - Uso: `npx tsx scripts/seed-events.ts --profile=meu-profile`
    - _Requisitos: 2.3_

  - [x] 3.5 Implementar endpoints administrativos de criação e exclusão de eventos
    - Criar src/handlers/create-event.ts — POST /admin/events com validação (title 3-200, description 10-2000, date ISO 8601, location 3-200, capacity 1-10000)
    - Criar src/handlers/delete-event.ts — DELETE /admin/events/{eventId} com validação UUID e tratamento 404
    - Adicionar createEvent(event) e deleteEvent(eventId) na interface EventRepository e implementação DynamoDB
    - Adicionar CreateEventFunction e DeleteEventFunction no template.yaml com DynamoDBCrudPolicy
    - _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 4. Checkpoint — Validar catálogo de eventos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. VPC + Aurora Serverless + Módulo de Inscrições
  - [x] 5.1 Definir VPC completa no template.yaml
    - VPC com CIDR block 10.0.0.0/16, 2 public subnets e 2 private subnets em AZs distintas
    - Internet Gateway associado à VPC com route table pública
    - NAT Instance usando **fck-nat** AMI (owner 568608671756) — NÃO usar AMI genérica com UserData manual
    - Parâmetro NATInstanceAMI do tipo AWS::EC2::Image::Id com default do fck-nat para us-east-1
    - Para obter o AMI ID: `aws ec2 describe-images --owners 568608671756 --filters 'Name=name,Values=fck-nat-al2023-*-x86_64*' --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text --region us-east-1`
    - EC2 t3.micro na public subnet com SourceDestCheck: false e Elastic IP
    - **SEM UserData** — fck-nat configura ip_forward e iptables automaticamente no boot
    - Route tables privadas com rota 0.0.0.0/0 via NAT Instance
    - _Requisitos: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Definir Security Groups e Aurora Serverless no template.yaml
    - Security Group do Aurora: inbound TCP 5432 do SG Lambda
    - Security Group das Lambdas: egress TCP 5432 para SG Aurora E egress TCP 443 para 0.0.0.0/0 (necessário para acessar DynamoDB, S3 e outros serviços AWS via NAT)
    - **IMPORTANTE**: Quando se adiciona um SecurityGroupEgress explícito, o AWS remove a regra default "allow all outbound". Portanto DEVE ter egress 443 para 0.0.0.0/0 além do egress 5432 para Aurora.
    - DB Subnet Group com as 2 private subnets
    - Aurora Serverless v2 cluster PostgreSQL (0.5-2 ACUs) com criptografia, Secrets Manager e **EnableHttpEndpoint: true** (Data API — necessário para o script apply-schema.ts que roda localmente sem acesso VPC)
    - _Requisitos: 3.5, 3.6, 4.1_

  - [x] 5.3 Criar schema SQL do Aurora PostgreSQL
    - Criar sql/schema.sql com tabelas participants, registrations e registration_audit_logs
    - Incluir constraints, índices e CHECK para status válidos
    - Criar scripts/apply-schema.ts que:
      - Aceita `--profile=<aws-profile> [--region=<region>] [--stack=<stack-name>]`
      - Usa **RDS Data API** (`@aws-sdk/client-rds-data`) — NÃO conexão direta pg (Aurora está em private subnet, inacessível localmente)
      - Resolve clusterArn e secretArn via RDS DescribeDBClusters
      - Executa cada statement SQL individualmente via ExecuteStatementCommand
      - Trata "already exists" como skip (idempotente)
      - Verifica tabelas criadas ao final
    - Instalar `@aws-sdk/client-rds-data` e `@aws-sdk/client-rds` como dependências
    - Uso: `npx tsx scripts/apply-schema.ts --profile=meu-profile`
    - **IMPORTANTE**: Requer `EnableHttpEndpoint: true` no AuroraCluster (task 5.2)
    - _Requisitos: 4.1, 4.2_

  - [x] 5.4 Implementar repository de inscrições (Aurora)
    - Criar src/repositories/interfaces/registration-repository.ts com interface RegistrationRepository
    - Criar src/repositories/aurora-registration-repository.ts com implementação usando pg (PostgreSQL client)
    - **IMPORTANTE — Autenticação Aurora via Secrets Manager**: Como o Aurora usa `ManageMasterUserPassword: true`, a senha NÃO está em variável de ambiente. O repository DEVE:
      - Usar lazy initialization do Pool (função `getPool()` assíncrona)
      - Na primeira chamada, buscar a senha via `@aws-sdk/client-secrets-manager` usando `DB_SECRET_ARN` (env var)
      - Parsear o JSON do secret (`{ password: "..." }`) e passar ao Pool
      - Cachear o Pool para reutilizar nas chamadas seguintes
    - Implementar transação ACID para createParticipantAndRegistration com timeout de 10s
    - Implementar findByEmailAndEvent, getRegistrationById, updateStatus, createAuditLog, listAllRegistrations, getRegistrationWithParticipant
    - Instalar `@aws-sdk/client-secrets-manager` como dependência
    - _Requisitos: 4.2, 4.6, 4.8_

  - [x] 5.5 Implementar registration-service e handler POST /registrations
    - Criar src/services/registration-service.ts com lógica de criação de inscrição
    - Validar inputs (name 2-150 chars, email RFC 5322 max 254, eventId UUID v4)
    - Verificar evento existe e tem vagas (DynamoDB)
    - Verificar duplicidade de email+evento
    - Criar participante + inscrição (Aurora) + decrementar availableSlots (DynamoDB conditional)
    - Implementar compensação: rollback Aurora se DynamoDB falhar
    - Criar src/handlers/create-registration.ts
    - Adicionar CreateRegistrationFunction no template.yaml com VPCAccessPolicy e DynamoDBCrudPolicy
    - **Environment Variables para TODAS as funções Lambda que acessam Aurora**: PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_SSL, DB_SECRET_ARN
    - **Policies para TODAS as funções Lambda que acessam Aurora**: VPCAccessPolicy + inline Statement com `secretsmanager:GetSecretValue` no Resource `!GetAtt AuroraCluster.MasterUserSecret.SecretArn`
    - Emitir métrica customizada EventHub/RegistrationsCreated
    - _Requisitos: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.11, 4.12, 8.4_

  - [x] 5.6 Implementar handler GET /registrations/{id}
    - Criar src/handlers/get-registration.ts com validação de ID e tratamento 404
    - Adicionar GetRegistrationFunction no template.yaml com VPCAccessPolicy
    - _Requisitos: 4.9, 4.10_

- [x] 6. Checkpoint — Validar VPC, Aurora e inscrições
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Upload de Documentos com S3 e Processamento Assíncrono
  - [x] 7.1 Implementar handler de processamento assíncrono (S3 Event → Lambda)
    - Criar src/handlers/process-uploaded-document.ts disparado por S3 Event (s3:ObjectCreated:* no prefixo registrations/)
    - Extrair registrationId da chave S3 e atualizar status para DOCUMENT_UPLOADED
    - Ignorar com log warning se status ≠ PENDING_DOCUMENT
    - Criar registro de Audit_Log
    - Configurar DLQ com MaximumRetryAttempts: 2 via EventInvokeConfig na função Lambda
    - Adicionar ProcessUploadedDocumentFunction no template.yaml com VPCAccessPolicy
    - **IMPORTANTE — EVITAR DEPENDÊNCIA CIRCULAR**:
      - NÃO usar `S3ReadPolicy: { BucketName: !Ref DocumentsBucket }` — isso cria referência circular
      - NÃO usar `!Ref DocumentsBucket` em Environment Variables
      - Usar policy inline com ARN construído via `!Sub "arn:aws:s3:::${AWS::StackName}-documents-${AWS::AccountId}/*"`
      - Usar `!Sub "${AWS::StackName}-documents-${AWS::AccountId}"` para DOCUMENTS_BUCKET_NAME env var
      - NÃO adicionar Events do tipo S3 nesta função
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.2 Adicionar S3 bucket e DLQ no template.yaml
    - Definir DocumentsBucket com BucketName `!Sub "${AWS::StackName}-documents-${AWS::AccountId}"`, criptografia em repouso e bloqueio de acesso público
    - Habilitar VersioningConfiguration (Status: Enabled)
    - Habilitar LoggingConfiguration apontando para um bucket de logs separado (DocumentsLogsBucket)
    - Criar DocumentsLogsBucket com criptografia, bloqueio de acesso público e versionamento
    - **IMPORTANTE — EVITAR DEPENDÊNCIA CIRCULAR**:
      - Definir NotificationConfiguration diretamente no DocumentsBucket (LambdaConfigurations com Event s3:ObjectCreated:*, Function !GetAtt ProcessUploadedDocumentFunction.Arn, Filter prefix registrations/)
      - Criar recurso AWS::Lambda::Permission (ProcessUploadedDocumentS3Permission) com SourceArn usando `!Sub "arn:aws:s3:::${AWS::StackName}-documents-${AWS::AccountId}"` (NÃO `!GetAtt DocumentsBucket.Arn`) e **SourceAccount: !Ref AWS::AccountId** para restringir o principal
      - O DocumentsBucket DEVE ter `DependsOn: ProcessUploadedDocumentS3Permission`
      - O DocumentsBucket DEVE ser definido APÓS a ProcessUploadedDocumentFunction no template
      - A ProcessUploadedDocumentFunction NÃO deve ter nenhuma referência a DocumentsBucket (nem !Ref nem !GetAtt)
    - Definir ProcessDocumentDLQ (SQS) com retenção de 14 dias
    - _Requisitos: 5.1, 6.1, 6.6_

  - [x] 7.3 Implementar document-service e handler POST /registrations/{id}/upload-url
    - Criar src/services/document-service.ts com generateS3Key e extractRegistrationIdFromS3Key
    - Implementar geração de presigned URL com expiração de 5 min
    - **IMPORTANTE**: NÃO setar ContentLength no PutObjectCommand — isso faz a presigned URL exigir upload com tamanho exato. Apenas setar Bucket, Key e ContentType.
    - **IMPORTANTE**: Configurar o S3Client com `requestChecksumCalculation: 'WHEN_REQUIRED'` e `responseChecksumValidation: 'WHEN_REQUIRED'` — sem isso, o SDK v3 adiciona checksum CRC32 na presigned URL que causa SignatureDoesNotMatch quando o upload é feito via curl
    - Validar: inscrição existe, status = PENDING_DOCUMENT, fileName válido, contentType permitido
    - Criar src/handlers/generate-upload-url.ts
    - Adicionar GenerateUploadUrlFunction no template.yaml com VPCAccessPolicy
    - **IMPORTANTE**: Para evitar dependência circular, NÃO usar `S3CrudPolicy: { BucketName: !Ref DocumentsBucket }`. Usar policy inline com ARN via `!Sub`. Usar `!Sub "${AWS::StackName}-documents-${AWS::AccountId}"` para DOCUMENTS_BUCKET_NAME env var.
    - _Requisitos: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 8. Checkpoint — Validar upload e processamento assíncrono
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Painel Administrativo
  - [x] 9.1 Implementar handlers administrativos de listagem
    - Criar src/handlers/admin-list-registrations.ts — GET /admin/registrations
    - Criar src/handlers/admin-get-registration.ts — GET /admin/registrations/{id} com dados do participante
    - Adicionar AdminListRegistrationsFunction e AdminGetRegistrationFunction no template.yaml com VPCAccessPolicy
    - _Requisitos: 7.1, 7.2, 7.8_

  - [x] 9.2 Implementar handlers de aprovação e rejeição
    - Criar src/handlers/approve-registration.ts — POST /admin/registrations/{id}/approve
    - Criar src/handlers/reject-registration.ts — POST /admin/registrations/{id}/reject com validação de reason (1-500 chars)
    - Validar status = DOCUMENT_UPLOADED antes de permitir operação
    - Criar Audit_Log com old_status, new_status, reason e timestamp
    - Adicionar ApproveRegistrationFunction e RejectRegistrationFunction no template.yaml com VPCAccessPolicy
    - _Requisitos: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 9.3 Implementar handler de simulação de erro
    - Criar src/handlers/simulate-error.ts — POST /admin/simulate-error
    - Retornar status 500 com formato de erro padronizado e log ERROR com indicação de erro simulado
    - Adicionar SimulateErrorFunction no template.yaml
    - _Requisitos: 11.1, 11.2_

- [x] 10. Checkpoint — Validar painel administrativo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Observabilidade, Alarmes e Notificações
  - [x] 11.1 Adicionar SNS Topic e alarmes CloudWatch no template.yaml
    - Definir AlarmNotificationTopic (SNS) com subscription email usando parâmetro AdminEmail
    - Definir ApiGateway5xxAlarm: Sum 5xx > 5 em 5 min → SNS. **IMPORTANTE**: Para a dimensão ApiId, usar `!Ref EventHubApi` — isso é seguro desde que não haja ciclo com o S3 bucket (o ciclo S3 é resolvido nas tasks 7.x usando !Sub em vez de !Ref para o bucket)
    - Definir DLQMessagesAlarm: NumberOfMessagesSent >= 1 em 1 min → SNS
    - Definir ProcessDocumentErrorsAlarm: Errors > 3 em 5 min → SNS. Para a dimensão FunctionName, usar `!Ref ProcessUploadedDocumentFunction`
    - **NOTA**: Todos os alarmes DEVEM ser definidos APÓS todos os recursos que referenciam (API Gateway, DLQ, Lambda functions) no template.yaml
    - _Requisitos: 8.5, 9.1, 9.2, 9.5, 9.6_

  - [x] 11.2 Integrar observabilidade em todos os handlers
    - Garantir que todos os handlers utilizam logger estruturado com correlation ID
    - Garantir emissão de métrica RegistrationsCreated no handler de criação
    - Garantir log ERROR com stack trace em todos os catch blocks
    - Garantir que respostas de erro não expõem detalhes internos
    - Verificar IAM policies com princípio de menor privilégio em todas as funções
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 9.3, 9.4, 9.7, 10.3, 10.6, 11.3_

- [x] 12. Checkpoint Final — Validar sistema completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Criar script de demonstração da API
  - [x] 13.1 Criar scripts/demo-api.sh
    - Script bash com menu interativo (loop com `select`/`case`) que agrupa TODAS as operações
    - Aceitar AWS_PROFILE como primeiro argumento obrigatório
    - Obter API_URL automaticamente via CloudFormation
    - Manter estado da sessão (EVENT_ID, REGISTRATION_ID, UPLOAD_URL) entre operações
    - Menu de opções:
      - **[Setup]**: 1) Aplicar schema SQL (chama `npx tsx scripts/apply-schema.ts`), 2) Seed eventos (chama `npx tsx scripts/seed-events.ts`)
      - **[API — Eventos]**: 3) GET /health, 4) GET /events, 5) GET /events/{id}
      - **[API — Inscrições]**: 6) POST /registrations, 7) GET /registrations/{id}, 8) POST upload-url, 9) PUT upload
      - **[API — Admin]**: 10) Listar, 11) Detalhe, 12) Aprovar, 13) Rejeitar
      - **[Observabilidade]**: 14) Simular 6 erros 5xx, 15) Verificar alarme
      - **[Validação]**: 16) Testar inputs inválidos
      - 0) Sair
    - Capturar IDs automaticamente das respostas para uso nas operações seguintes
    - Usar `jq` para formatar, `curl -s` para chamadas
    - Tornar executável com chmod +x
    - NÃO criar scripts .ts separados para seed e schema — esses já existem e são chamados pelo menu

## Notes

- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental entre fases
- Lambda Powertools é utilizado via Layer (NÃO via npm install)
- O padrão Repository separa lógica de negócio do acesso a dados
- Todas as funções Lambda que acessam Aurora devem estar na VPC

### ⚠️ RESTRIÇÕES CRÍTICAS — Evitar Erros de Build

1. **Runtime**: Usar `nodejs22.x` em TODOS os lugares (Globals, Layer CompatibleRuntimes, Layer Metadata BuildMethod). O `nodejs20.x` está deprecated/EOL e causa falha no `sam validate --lint`.
2. **S3 Circular Dependency — SOLUÇÃO COMPLETA**: A dependência circular ocorre quando `DocumentsBucket` referencia a Lambda (via NotificationConfiguration) E a Lambda referencia `DocumentsBucket` (via !Ref ou SAM policy templates). Para quebrar o ciclo:
   - **NÃO usar `!Ref DocumentsBucket`** em NENHUM recurso Lambda (nem em Policies, nem em Environment)
   - **NÃO usar `S3ReadPolicy` ou `S3CrudPolicy` com `!Ref DocumentsBucket`** — esses SAM policy templates expandem para `!Ref` internamente
   - Para variáveis de ambiente: usar `!Sub "${AWS::StackName}-documents-${AWS::AccountId}"` (string literal, sem referência ao recurso)
   - Para permissões S3: usar policy inline (`Statement`) com ARN construído via `!Sub "arn:aws:s3:::${AWS::StackName}-documents-${AWS::AccountId}/*"`
   - A notificação S3 é configurada no `DocumentsBucket` via `NotificationConfiguration.LambdaConfigurations`
   - Criar `AWS::Lambda::Permission` com SourceArn via `!Sub` (NÃO `!GetAtt DocumentsBucket.Arn`)
   - O `DocumentsBucket` DEVE aparecer APÓS `ProcessUploadedDocumentFunction` no template
   - O `DocumentsBucket` DEVE ter `DependsOn: ProcessUploadedDocumentS3Permission` para garantir que a permission existe antes da notification ser criada
3. **Ordem no template.yaml**: Recursos que referenciam outros devem aparecer depois dos referenciados.
4. **Lambda Layer**: O `@aws-lambda-powertools/logger` e `@aws-lambda-powertools/metrics` são importados do Layer em runtime. Em devDependencies do package.json, incluir para type-checking apenas.
5. **Validação**: Executar `sam validate --lint` após cada modificação no template.yaml para garantir zero erros.
6. **ApiGateway5xxAlarm**: Se o alarme referenciar `!Ref EventHubApi` e isso causar ciclo com as permissions das Lambdas, usar `DependsOn` explícito ou mover o alarme para depois de todas as funções Lambda no template.
7. **@types/node**: Usar `@types/node@^22` no devDependencies para corresponder ao runtime nodejs22.x.
8. **Padrão YAML comprovado para S3 → Lambda (copiar exatamente)**:
```yaml
  # Lambda function SEM Events S3 e SEM !Ref DocumentsBucket
  ProcessUploadedDocumentFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: process-uploaded-document.handler
      CodeUri: src/handlers/
      Environment:
        Variables:
          DOCUMENTS_BUCKET_NAME: !Sub "${AWS::StackName}-documents-${AWS::AccountId}"
      Policies:
        - VPCAccessPolicy: {}
        - Statement:
            - Effect: Allow
              Action:
                - s3:GetObject
              Resource: !Sub "arn:aws:s3:::${AWS::StackName}-documents-${AWS::AccountId}/*"
      EventInvokeConfig:
        MaximumRetryAttempts: 2
        DestinationConfig:
          OnFailure:
            Type: SQS
            Destination: !GetAtt ProcessDocumentDLQ.Arn

  # Permission ANTES do bucket, com SourceAccount para cfn-guard
  ProcessUploadedDocumentS3Permission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ProcessUploadedDocumentFunction
      Action: lambda:InvokeFunction
      Principal: s3.amazonaws.com
      SourceArn: !Sub "arn:aws:s3:::${AWS::StackName}-documents-${AWS::AccountId}"
      SourceAccount: !Ref AWS::AccountId

  # Bucket de logs para S3 access logging (cfn-guard requirement)
  DocumentsLogsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${AWS::StackName}-documents-logs-${AWS::AccountId}"
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      VersioningConfiguration:
        Status: Enabled

  # Bucket DEPOIS da Lambda e Permission, com DependsOn
  DocumentsBucket:
    Type: AWS::S3::Bucket
    DependsOn: ProcessUploadedDocumentS3Permission
    Properties:
      BucketName: !Sub "${AWS::StackName}-documents-${AWS::AccountId}"
      VersioningConfiguration:
        Status: Enabled
      LoggingConfiguration:
        DestinationBucketName: !Ref DocumentsLogsBucket
        LogFilePrefix: access-logs/
      NotificationConfiguration:
        LambdaConfigurations:
          - Event: s3:ObjectCreated:*
            Function: !GetAtt ProcessUploadedDocumentFunction.Arn
            Filter:
              S3Key:
                Rules:
                  - Name: prefix
                    Value: registrations/
```

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.4"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2", "5.3"] },
    { "id": 8, "tasks": ["5.4"] },
    { "id": 9, "tasks": ["5.5", "5.6"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2", "7.3"] },
    { "id": 12, "tasks": ["9.1"] },
    { "id": 13, "tasks": ["9.2", "9.3"] },
    { "id": 14, "tasks": ["11.1"] },
    { "id": 15, "tasks": ["11.2"] },
    { "id": 16, "tasks": ["13.1"] }
  ]
}
```
