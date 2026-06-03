#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# psql-tunnel.sh — Opens an SSM tunnel to Aurora and connects via psql
#
# Usage: ./scripts/psql-tunnel.sh --profile=<aws-profile>
#
# This script:
#   1. Fetches the NAT instance ID and Aurora endpoint from stack outputs
#   2. Retrieves the DB password from Secrets Manager
#   3. Starts an SSM port-forwarding tunnel in the background
#   4. Connects psql automatically
#   5. Cleans up the tunnel on exit
#
# Prerequisites:
#   - AWS CLI v2
#   - Session Manager plugin
#   - psql (PostgreSQL client)
#   - jq
# =============================================================================

STACK_NAME="eventhub-webinar"
REGION="us-east-1"
LOCAL_PORT="15432"
PROFILE_ARG=""
PROFILE=""

# Parse arguments
for arg in "$@"; do
  case $arg in
    --profile=*)
      PROFILE="${arg#*=}"
      PROFILE_ARG="--profile ${arg#*=}"
      ;;
    --local-port=*)
      LOCAL_PORT="${arg#*=}"
      ;;
  esac
done

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "🔍 Buscando informações do stack..."

# Get NAT instance ID
NETWORKING_STACK=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "StackResources[?LogicalResourceId=='NetworkingStack'].PhysicalResourceId" \
  --output text)

NAT_INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name "$NETWORKING_STACK" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='NATInstanceId'].OutputValue" \
  --output text)

# Get Aurora endpoint and secret
DATABASE_STACK=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "StackResources[?LogicalResourceId=='DatabaseStack'].PhysicalResourceId" \
  --output text)

AURORA_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$DATABASE_STACK" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='AuroraClusterEndpoint'].OutputValue" \
  --output text)

AURORA_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$DATABASE_STACK" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='AuroraSecretArn'].OutputValue" \
  --output text)

if [[ -z "$NAT_INSTANCE_ID" || "$NAT_INSTANCE_ID" == "None" ]]; then
  echo "❌ NAT instance não encontrada."
  exit 1
fi

if [[ -z "$AURORA_ENDPOINT" || "$AURORA_ENDPOINT" == "None" ]]; then
  echo "❌ Aurora endpoint não encontrado."
  exit 1
fi

# Fetch password from Secrets Manager
echo "🔑 Buscando credenciais..."
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$AURORA_SECRET_ARN" \
  --query 'SecretString' \
  --output text \
  --region "$REGION" \
  $PROFILE_ARG | jq -r .password)

echo "🚀 Iniciando túnel SSM (porta local ${LOCAL_PORT})..."

# Start tunnel in background
aws ssm start-session \
  --target "$NAT_INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${AURORA_ENDPOINT}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
  --region "$REGION" \
  $PROFILE_ARG &>/dev/null &
TUNNEL_PID=$!

# Wait for tunnel to be ready
echo "⏳ Aguardando túnel..."
sleep 5

# Connect
echo "✅ Conectando ao PostgreSQL..."
echo ""
PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U eventhubadmin -d postgres
