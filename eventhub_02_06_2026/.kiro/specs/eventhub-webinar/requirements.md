# Requirements Document

## Introduction

O EventHub Serverless é uma plataforma de gestão de eventos e inscrições construída inteiramente com serviços serverless da AWS. O sistema permite que organizadores publiquem eventos, participantes se inscrevam e façam upload de documentos comprobatórios, e administradores gerenciem as inscrições com aprovação/rejeição. A infraestrutura é definida como código usando AWS SAM com TypeScript, seguindo boas práticas de observabilidade, segurança e otimização de custos.

## Glossary

- **Sistema_EventHub**: A plataforma serverless de gestão de eventos e inscrições
- **API_Gateway**: O serviço AWS API Gateway HTTP que roteia requisições para as funções Lambda
- **Catálogo_Eventos**: Módulo responsável por armazenar e consultar eventos disponíveis no DynamoDB
- **Módulo_Inscrições**: Módulo responsável por gerenciar inscrições de participantes no Aurora Serverless PostgreSQL
- **Módulo_Upload**: Módulo responsável por gerar URLs pré-assinadas e processar documentos no S3
- **Painel_Admin**: Módulo administrativo para aprovar e rejeitar inscrições
- **Módulo_Observabilidade**: Módulo de logs estruturados, métricas customizadas e alarmes CloudWatch
- **Módulo_Notificações**: Módulo responsável por enviar notificações via SNS e e-mail quando alarmes são disparados
- **Participante**: Pessoa que se inscreve em um evento
- **Registro_Inscrição**: Entidade que representa a inscrição de um participante em um evento
- **Máquina_Status**: Fluxo de estados da inscrição: PENDING_DOCUMENT → DOCUMENT_UPLOADED → APPROVED/REJECTED
- **Presigned_URL**: URL temporária gerada pelo S3 que permite upload direto sem passar pela Lambda
- **Correlation_ID**: Identificador único propagado entre serviços para rastreabilidade de requisições
- **Audit_Log**: Registro de auditoria que documenta mudanças de status nas inscrições
- **Template_SAM**: Arquivo template.yaml que define toda a infraestrutura como código
- **SNS_Topic**: Tópico Amazon SNS utilizado para enviar notificações de alarmes por e-mail

## Requirements

### Requisito 1: Estrutura Inicial do Projeto

**User Story:** Como desenvolvedor, eu quero uma estrutura de projeto AWS SAM com TypeScript configurada, para que eu possa desenvolver e fazer deploy de funções Lambda com API Gateway.

#### Critérios de Aceite

1. THE Sistema_EventHub SHALL utilizar AWS SAM com runtime nodejs22.x e TypeScript com esbuild para bundling, definindo na seção Globals do template um timeout de 30 segundos e memória de 256MB para todas as funções Lambda
2. THE Template_SAM SHALL definir um API Gateway HTTP API como ponto de entrada para todas as funções Lambda, incluindo headers CORS (Access-Control-Allow-Origin: "*") nas respostas
3. WHEN uma requisição GET /health é recebida, THE API_Gateway SHALL retornar status 200 com corpo JSON contendo os campos "status" com valor "healthy" e "timestamp" com a data/hora atual em formato ISO 8601
4. THE Template_SAM SHALL habilitar X-Ray tracing para todas as funções Lambda
5. THE Sistema_EventHub SHALL utilizar Lambda Powertools para TypeScript via Lambda Layer para logging estruturado, tracing e métricas
6. THE Template_SAM SHALL incluir tags Project=EventHub e Environment=Workshop em todos os recursos definidos

### Requisito 2: Catálogo de Eventos com DynamoDB

**User Story:** Como participante, eu quero visualizar os eventos disponíveis, para que eu possa escolher em qual evento me inscrever.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir uma tabela DynamoDB EventsCatalogTable com partition key "pk" do tipo String e billing mode PAY_PER_REQUEST
2. THE Template_SAM SHALL habilitar Point-in-Time Recovery (PITR) e criptografia em repouso para a tabela EventsCatalogTable
3. WHEN uma requisição GET /events é recebida, THE Catálogo_Eventos SHALL retornar a lista de todos os eventos com status ACTIVE incluindo eventId, title, description, date, location, capacity e availableSlots, retornando um array JSON vazio caso não existam eventos ativos
4. WHEN uma requisição GET /events/{eventId} é recebida com um eventId válido, THE Catálogo_Eventos SHALL retornar os detalhes completos do evento correspondente incluindo eventId, title, description, date, location, capacity, availableSlots e status
5. IF uma requisição GET /events/{eventId} é recebida com um eventId inexistente, THEN THE Catálogo_Eventos SHALL retornar status 404 com mensagem indicando que o evento não foi encontrado
6. THE Catálogo_Eventos SHALL implementar o padrão Repository para acesso aos dados do DynamoDB
7. IF uma requisição GET /events/{eventId} é recebida com um eventId em formato inválido, THEN THE Catálogo_Eventos SHALL retornar status 400 com mensagem indicando que o identificador fornecido é inválido

### Requisito 3: Infraestrutura de Rede (VPC)

**User Story:** Como desenvolvedor, eu quero uma VPC configurada com subnets públicas e privadas, para que o Aurora Serverless possa operar de forma segura em subnet privada com acesso à internet via NAT Instance.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir uma VPC com 2 subnets públicas e 2 subnets privadas em zonas de disponibilidade distintas
2. THE Template_SAM SHALL definir um Internet Gateway associado à VPC e configurar a route table das subnets públicas com rota 0.0.0.0/0 direcionada ao Internet Gateway
3. THE Template_SAM SHALL definir uma instância EC2 t3.micro como NAT Instance na subnet pública usando a AMI fck-nat (owner 568608671756) com source/destination check desabilitado e Elastic IP associado. A AMI fck-nat configura ip_forward e iptables automaticamente, dispensando UserData manual
4. THE Template_SAM SHALL configurar route tables para que as subnets privadas direcionem tráfego 0.0.0.0/0 via NAT Instance
5. THE Template_SAM SHALL definir um Security Group para o Aurora permitindo tráfego de entrada exclusivamente na porta TCP 5432 originado do Security Group das funções Lambda, e um Security Group para as funções Lambda com dois SecurityGroupEgress explícitos: (a) TCP 5432 para o Security Group do Aurora e (b) TCP 443 para 0.0.0.0/0 (necessário para acessar DynamoDB, S3 e outros serviços AWS via NAT)
6. THE Template_SAM SHALL definir um DB Subnet Group contendo as 2 subnets privadas para uso pelo cluster Aurora Serverless

### Requisito 4: Inscrições com Aurora Serverless PostgreSQL

**User Story:** Como participante, eu quero me inscrever em um evento fornecendo meu nome e e-mail, para que eu possa participar do evento escolhido.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir um cluster Aurora Serverless v2 PostgreSQL nas subnets privadas da VPC com criptografia em repouso habilitada, capacidade mínima de 0.5 ACU e máxima de 2 ACUs, e ManageMasterUserPassword habilitado (senha gerenciada pelo Secrets Manager). Todas as funções Lambda que acessam o Aurora SHALL ter a env var DB_SECRET_ARN e permissão secretsmanager:GetSecretValue para o secret do cluster
2. WHEN uma requisição POST /registrations é recebida com name (entre 2 e 150 caracteres), email (formato válido RFC 5322, máximo 254 caracteres) e eventId (UUID v4 válido), THE Módulo_Inscrições SHALL criar um registro de participante e uma inscrição com status PENDING_DOCUMENT
3. WHEN uma inscrição é criada com sucesso no Aurora, THE Módulo_Inscrições SHALL decrementar o campo availableSlots do evento correspondente no DynamoDB utilizando uma operação condicional que garanta availableSlots > 0
4. IF uma requisição POST /registrations é recebida com um eventId que não existe no Catálogo_Eventos, THEN THE Módulo_Inscrições SHALL retornar status 400 com mensagem indicando evento inexistente
5. IF uma requisição POST /registrations é recebida para um evento com availableSlots igual a zero, THEN THE Módulo_Inscrições SHALL retornar status 409 com mensagem indicando que não há vagas disponíveis
6. IF uma requisição POST /registrations é recebida com um e-mail já registrado para o mesmo evento, THEN THE Módulo_Inscrições SHALL retornar status 409 com mensagem indicando inscrição duplicada
7. WHEN uma inscrição é criada com sucesso, THE Módulo_Inscrições SHALL retornar status 201 com id, participantId, eventId, status e createdAt
8. THE Módulo_Inscrições SHALL executar a criação de participante e inscrição dentro de uma transação ACID no Aurora com timeout de 10 segundos
9. WHEN uma requisição GET /registrations/{id} é recebida com um id válido, THE Módulo_Inscrições SHALL retornar os detalhes da inscrição incluindo status atual
10. IF uma requisição GET /registrations/{id} é recebida com um id inexistente, THEN THE Módulo_Inscrições SHALL retornar status 404 com mensagem descritiva
11. IF uma requisição POST /registrations é recebida com name, email ou eventId ausentes ou em formato inválido, THEN THE Módulo_Inscrições SHALL retornar status 400 com mensagem indicando os campos inválidos
12. IF o decremento de availableSlots no DynamoDB falhar após a criação da inscrição no Aurora, THEN THE Módulo_Inscrições SHALL reverter a transação no Aurora e retornar status 500 com mensagem indicando falha no processamento

### Requisito 5: Upload de Documentos com S3

**User Story:** Como participante, eu quero fazer upload de um documento comprobatório para minha inscrição, para que o administrador possa validar minha participação.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir um bucket S3 com criptografia em repouso e bloqueio de acesso público habilitados. O bucket SHALL ter BucketName definido explicitamente via `!Sub "${AWS::StackName}-documents-${AWS::AccountId}"` para que funções Lambda possam referenciar o nome do bucket sem criar dependência circular (usando !Sub em vez de !Ref DocumentsBucket)
2. WHEN uma requisição POST /registrations/{id}/upload-url é recebida com fileName (máximo 255 caracteres, contendo apenas caracteres alfanuméricos, hífens, underscores e pontos) e contentType pertencente à lista permitida (application/pdf, image/png, image/jpeg), THE Módulo_Upload SHALL retornar status 200 com um objeto contendo uploadUrl (presigned URL com expiração de 5 minutos), key (chave S3 gerada) e expiresIn (tempo de expiração em segundos)
3. IF uma requisição POST /registrations/{id}/upload-url é recebida para uma inscrição com status diferente de PENDING_DOCUMENT, THEN THE Módulo_Upload SHALL retornar status 400 com mensagem indicando que upload não é permitido neste estado
4. IF uma requisição POST /registrations/{id}/upload-url é recebida com um id de inscrição inexistente, THEN THE Módulo_Upload SHALL retornar status 404 com mensagem descritiva
5. THE Módulo_Upload SHALL gerar a chave S3 no formato "registrations/{registrationId}/{fileName}" para organização dos documentos
6. IF uma requisição POST /registrations/{id}/upload-url é recebida com fileName ausente, vazio ou excedendo 255 caracteres, ou com contentType ausente ou não pertencente à lista permitida, THEN THE Módulo_Upload SHALL retornar status 400 com mensagem indicando quais campos são inválidos
7. THE Módulo_Upload SHALL gerar a presigned URL com condição de tamanho máximo de arquivo de 10 MB
8. THE Template_SAM SHALL configurar CorsConfiguration no DocumentsBucket com CorsRules permitindo método PUT de qualquer origem (*) com quaisquer headers (*) e MaxAge de 3600 segundos, para permitir uploads diretos via presigned URL a partir do frontend

### Requisito 6: Processamento Assíncrono de Documentos

**User Story:** Como sistema, eu quero processar uploads automaticamente quando um documento é enviado ao S3, para que o status da inscrição seja atualizado sem intervenção manual.

#### Critérios de Aceite

1. WHEN um objeto é criado no bucket S3 no prefixo "registrations/", THE Módulo_Upload SHALL disparar uma função Lambda de processamento via S3 Event Notification para o evento s3:ObjectCreated:*. A notificação S3 SHALL ser configurada diretamente no recurso DocumentsBucket (propriedade NotificationConfiguration) ao invés de como evento SAM na função Lambda, para evitar dependência circular entre o bucket e a função Lambda
2. WHEN a função de processamento é disparada, THE Módulo_Upload SHALL extrair o registrationId da chave S3 (formato "registrations/{registrationId}/{fileName}") e atualizar o status da inscrição correspondente de PENDING_DOCUMENT para DOCUMENT_UPLOADED no Aurora
3. IF a função de processamento é disparada para uma inscrição com status diferente de PENDING_DOCUMENT, THEN THE Módulo_Upload SHALL ignorar o processamento e registrar um log de warning sem retornar erro
4. WHEN o status de uma inscrição é atualizado pelo processamento, THE Módulo_Upload SHALL criar um registro de Audit_Log com registrationId, old_status, new_status e timestamp
5. IF a função de processamento falhar após 2 tentativas de retry automático, THEN THE Sistema_EventHub SHALL enviar o evento para uma Dead Letter Queue (DLQ) para reprocessamento posterior
6. THE Template_SAM SHALL configurar uma DLQ (SQS) associada à função Lambda de processamento de documentos com período de retenção de mensagens de 14 dias

### Requisito 7: Painel Administrativo

**User Story:** Como administrador, eu quero visualizar, aprovar e rejeitar inscrições, para que eu possa gerenciar quais participantes são aceitos nos eventos.

#### Critérios de Aceite

1. WHEN uma requisição GET /admin/registrations é recebida, THE Painel_Admin SHALL retornar a lista de todas as inscrições incluindo id, participantId, eventId, status e createdAt
2. WHEN uma requisição GET /admin/registrations/{id} é recebida com um id válido, THE Painel_Admin SHALL retornar os detalhes da inscrição incluindo id, eventId, status, createdAt e dados do participante (name e email)
3. WHEN uma requisição POST /admin/registrations/{id}/approve é recebida para uma inscrição com status DOCUMENT_UPLOADED, THE Painel_Admin SHALL atualizar o status para APPROVED, criar um Audit_Log e retornar status 200 com o registro atualizado incluindo id, status e updatedAt
4. WHEN uma requisição POST /admin/registrations/{id}/reject é recebida com um campo "reason" (máximo 500 caracteres) para uma inscrição com status DOCUMENT_UPLOADED, THE Painel_Admin SHALL atualizar o status para REJECTED, armazenar o motivo da rejeição, criar um Audit_Log e retornar status 200 com o registro atualizado incluindo id, status, reason e updatedAt
5. IF uma requisição de aprovação ou rejeição é recebida para uma inscrição com status diferente de DOCUMENT_UPLOADED, THEN THE Painel_Admin SHALL retornar status 400 com mensagem indicando que a operação não é permitida no estado atual
6. IF uma requisição POST /admin/registrations/{id}/reject é recebida sem o campo "reason" ou com "reason" vazio ou excedendo 500 caracteres, THEN THE Painel_Admin SHALL retornar status 400 com mensagem indicando que o motivo é obrigatório e deve ter entre 1 e 500 caracteres
7. THE Painel_Admin SHALL registrar em Audit_Log o old_status, new_status, reason e timestamp para cada mudança de status
8. IF uma requisição GET /admin/registrations/{id} ou POST /admin/registrations/{id}/approve ou POST /admin/registrations/{id}/reject é recebida com um id de inscrição inexistente, THEN THE Painel_Admin SHALL retornar status 404 com mensagem indicando que a inscrição não foi encontrada

### Requisito 8: Observabilidade

**User Story:** Como desenvolvedor, eu quero logs estruturados, métricas customizadas e alarmes, para que eu possa monitorar a saúde do sistema e diagnosticar problemas rapidamente.

#### Critérios de Aceite

1. THE Módulo_Observabilidade SHALL emitir logs em formato JSON estruturado contendo timestamp, level, correlationId, service e message em todas as invocações de funções Lambda
2. WHEN uma requisição é recebida com o header x-correlation-id contendo um valor não vazio, THE Módulo_Observabilidade SHALL propagar esse valor em todos os logs da requisição
3. WHEN uma requisição é recebida sem o header x-correlation-id ou com valor vazio, THE Módulo_Observabilidade SHALL gerar um novo UUID v4 como Correlation_ID e utilizá-lo em todos os logs da requisição
4. WHEN uma inscrição é criada com sucesso, THE Módulo_Observabilidade SHALL emitir uma métrica customizada com namespace "EventHub", nome "RegistrationsCreated", valor 1 e unidade Count no CloudWatch
5. THE Template_SAM SHALL definir um alarme CloudWatch que dispara quando a estatística Sum da métrica de erros 5xx no API Gateway exceder 5 em um período de avaliação de 5 minutos, com ação de notificação direcionada ao SNS_Topic de alarmes
6. THE Sistema_EventHub SHALL utilizar IAM policies com princípio de menor privilégio usando SAM policy templates para cada função Lambda, concedendo acesso apenas aos recursos específicos que cada função necessita
7. WHEN uma operação falha em qualquer função Lambda, THE Módulo_Observabilidade SHALL emitir um log com level ERROR contendo o correlationId, nome do serviço, mensagem de erro e stack trace

### Requisito 9: Notificações por E-mail via SNS

**User Story:** Como administrador, eu quero receber notificações por e-mail quando alarmes forem disparados, para que eu possa reagir rapidamente a problemas no sistema.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir um SNS_Topic para notificações de alarmes do sistema com protocolo de subscrição do tipo "email"
2. THE Template_SAM SHALL aceitar um parâmetro de e-mail do administrador do tipo String para subscrição no SNS_Topic, utilizado como endpoint da subscription
3. WHEN o alarme de erros 5xx do API Gateway é disparado, THE Módulo_Notificações SHALL enviar uma notificação para o SNS_Topic contendo nome do alarme, timestamp de disparo e valor da métrica que excedeu o limiar
4. WHEN uma notificação é enviada ao SNS_Topic, THE Módulo_Notificações SHALL entregar um e-mail ao administrador com subject contendo o nome do alarme e corpo contendo nome do alarme, timestamp, nome da métrica e valor que excedeu o limiar configurado
5. THE Template_SAM SHALL definir um alarme CloudWatch para a DLQ de processamento de documentos que notifica o SNS_Topic quando a métrica NumberOfMessagesSent for maior ou igual a 1 em um período de 1 minuto
6. THE Template_SAM SHALL definir um alarme CloudWatch para erros na função Lambda de processamento de documentos que notifica o SNS_Topic quando a métrica Errors exceder 3 em um período de 5 minutos
7. IF o envio de notificação ao SNS_Topic falhar, THEN THE Módulo_Notificações SHALL registrar o erro nos logs estruturados contendo correlationId, nome do alarme e motivo da falha

### Requisito 10: Segurança e Boas Práticas

**User Story:** Como desenvolvedor, eu quero que o sistema siga boas práticas de segurança e infraestrutura, para que os dados estejam protegidos e a operação seja confiável.

#### Critérios de Aceite

1. THE Sistema_EventHub SHALL validar todos os inputs de requisições antes de processá-los, verificando presença de campos obrigatórios, tipos de dados esperados e limites de comprimento (máximo de 255 caracteres para campos de texto e máximo de 5000 caracteres para campos de descrição), retornando status 400 com indicação dos campos que falharam na validação
2. THE Sistema_EventHub SHALL utilizar variáveis de ambiente para configurar nomes de tabelas, buckets e connection strings nas funções Lambda
3. THE Template_SAM SHALL definir permissões IAM específicas por função Lambda utilizando SAM policy templates ao invés de políticas genéricas
4. THE Sistema_EventHub SHALL retornar respostas de erro padronizadas em formato JSON com campos statusCode, message e correlationId para todas as respostas com código HTTP 4xx e 5xx
5. THE Sistema_EventHub SHALL utilizar tipagem forte TypeScript sem uso de "any" em todo o código-fonte
6. THE Sistema_EventHub SHALL implementar tratamento de erros com try-catch em todos os handlers, logando o erro com nível ERROR nos logs estruturados e retornando status 500 com mensagem genérica ao cliente sem expor detalhes internos, stack traces ou dados sensíveis
7. IF uma requisição contém campos com valores que excedem os limites definidos ou caracteres não permitidos, THEN THE Sistema_EventHub SHALL rejeitar a requisição com status 400 antes de executar qualquer lógica de negócio

### Requisito 11: Simulação de Falhas para Demonstração de Alarmes

**User Story:** Como apresentador do workshop, eu quero um endpoint que simule erros 5xx de forma controlada, para que eu possa demonstrar os alarmes e notificações por e-mail funcionando em tempo real.

#### Critérios de Aceite

1. WHEN uma requisição POST /admin/simulate-error é recebida, THE Sistema_EventHub SHALL retornar status 500 com resposta no formato de erro padronizado contendo statusCode, message indicando erro simulado e correlationId
2. WHEN uma requisição POST /admin/simulate-error é recebida, THE Módulo_Observabilidade SHALL registrar o erro nos logs estruturados com nível ERROR, incluindo correlationId, timestamp e indicação de que se trata de erro simulado
3. WHEN o número de erros 5xx no API Gateway exceder 5 ocorrências em um período de 5 minutos, THE Módulo_Notificações SHALL enviar notificação por e-mail ao administrador via SNS_Topic dentro de 5 minutos após o alarme ser disparado

### Requisito 12: Gestão Administrativa de Eventos

**User Story:** Como administrador, eu quero criar e remover eventos na plataforma, para que eu possa gerenciar o catálogo de eventos disponíveis para inscrição dos participantes.

#### Critérios de Aceite

1. WHEN uma requisição POST /admin/events é recebida com title (entre 3 e 200 caracteres), description (entre 10 e 2000 caracteres), date (formato ISO 8601 válido), location (entre 3 e 200 caracteres) e capacity (número inteiro entre 1 e 10000), THE Painel_Admin SHALL criar um novo evento no Catálogo_Eventos e retornar status 201 com o evento criado incluindo eventId (UUID v4 gerado), title, description, date, location, capacity, availableSlots (igual ao capacity inicial) e status ACTIVE
2. IF uma requisição POST /admin/events é recebida com campos ausentes ou em formato inválido (title fora do intervalo 3-200 caracteres, description fora do intervalo 10-2000 caracteres, date em formato não ISO 8601, location fora do intervalo 3-200 caracteres, ou capacity fora do intervalo 1-10000), THEN THE Painel_Admin SHALL retornar status 400 com mensagem indicando quais campos são inválidos
3. WHEN uma requisição DELETE /admin/events/{eventId} é recebida com um eventId em formato UUID v4 válido, THE Painel_Admin SHALL remover o evento correspondente do Catálogo_Eventos e retornar status 200 com mensagem de confirmação da exclusão
4. IF uma requisição DELETE /admin/events/{eventId} é recebida com um eventId que não existe no Catálogo_Eventos, THEN THE Painel_Admin SHALL retornar status 404 com mensagem indicando que o evento não foi encontrado
5. IF uma requisição DELETE /admin/events/{eventId} é recebida com um eventId em formato inválido (não UUID v4), THEN THE Painel_Admin SHALL retornar status 400 com mensagem indicando que o identificador fornecido é inválido

### Requisito 13: Hospedagem do Frontend (S3 + CloudFront)

**User Story:** Como usuário da plataforma, eu quero acessar a interface web do EventHub via navegador com entrega rápida e segura, para que eu possa interagir com o sistema de forma eficiente sem depender de configuração local.

#### Critérios de Aceite

1. THE Template_SAM SHALL definir um bucket S3 para hospedagem de arquivos estáticos do frontend com bloqueio total de acesso público (BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy e RestrictPublicBuckets habilitados)
2. THE Template_SAM SHALL definir um CloudFront Origin Access Control (OAC) do tipo s3 com signing protocol sigv4 e signing behavior always, para que o CloudFront acesse o bucket S3 de forma segura sem expor o bucket publicamente
3. THE Template_SAM SHALL definir uma distribuição CloudFront com DefaultRootObject configurado como "index.html", utilizando o bucket S3 do frontend como origin com OAC configurado e política de cache CachingOptimized
4. THE Template_SAM SHALL definir uma BucketPolicy no bucket do frontend que permita acesso exclusivamente ao CloudFront OAC via condição StringEquals no aws:SourceArn referenciando o ARN da distribuição CloudFront, com ação s3:GetObject para todos os objetos do bucket
5. THE Template_SAM SHALL exportar nos Outputs os valores FrontendUrl (URL da distribuição CloudFront com prefixo https://), FrontendBucketName (nome do bucket S3 do frontend) e FrontendDistributionId (ID da distribuição CloudFront)
6. THE Sistema_EventHub SHALL incluir um script de deploy do frontend (scripts/deploy-frontend.sh) que: (a) leia os outputs do stack CloudFormation para obter FrontendBucketName, FrontendDistributionId e ApiUrl, (b) substitua o placeholder API_BASE_URL no arquivo app.js pela URL real da API, (c) sincronize os arquivos do diretório frontend/ com o bucket S3 usando aws s3 sync, e (d) crie uma invalidação no CloudFront para o path "/*" garantindo que o conteúdo atualizado seja servido imediatamente
