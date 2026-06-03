#!/bin/bash
# =============================================================================
# EventHub Webinar — Script de Demonstração e Operações
# =============================================================================
# Uso: ./scripts/demo-api.sh <aws-profile>
#
# Menu interativo com todas as operações disponíveis:
# - Seed de eventos no DynamoDB
# - Aplicar schema SQL no Aurora
# - Demonstrar todos os endpoints da API
# - Disparar alarmes para demo
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Validar AWS_PROFILE
# ---------------------------------------------------------------------------
if [ -z "$1" ]; then
  echo "❌ AWS_PROFILE é obrigatório."
  echo ""
  echo "Uso: ./scripts/demo-api.sh <aws-profile>"
  echo "Exemplo: ./scripts/demo-api.sh meu-profile-dev"
  exit 1
fi

export AWS_PROFILE="$1"
STACK_NAME="eventhub-webinar"
REGION="us-east-1"

# ---------------------------------------------------------------------------
# Obter API URL
# ---------------------------------------------------------------------------
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text --region "$REGION" 2>/dev/null)

if [ -z "$API_URL" ]; then
  echo "⚠️  Stack '$STACK_NAME' não encontrado ou sem outputs. Algumas opções podem não funcionar."
  API_URL="NOT_DEPLOYED"
fi

# ---------------------------------------------------------------------------
# Variáveis de estado (preenchidas durante a sessão)
# ---------------------------------------------------------------------------
EVENT_ID=""
REGISTRATION_ID=""
UPLOAD_URL=""

# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------
header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ---------------------------------------------------------------------------
# Menu principal
# ---------------------------------------------------------------------------
show_menu() {
  echo ""
  echo "============================================="
  echo "🚀 EventHub Webinar — Menu de Operações"
  echo "============================================="
  echo "🔑 Profile: $AWS_PROFILE"
  echo "🌎 Region:  $REGION"
  echo "📡 API:     $API_URL"
  [ -n "$EVENT_ID" ] && echo "📌 Event:   $EVENT_ID"
  [ -n "$REGISTRATION_ID" ] && echo "📌 Reg:     $REGISTRATION_ID"
  echo "============================================="
  echo ""
  echo "  [Setup]"
  echo "    1) Aplicar schema SQL no Aurora"
  echo "    2) Seed de eventos no DynamoDB"
  echo ""
  echo "  [API — Eventos]"
  echo "    3) GET /health"
  echo "    4) GET /events (listar)"
  echo "    5) GET /events/{id} (detalhe)"
  echo ""
  echo "  [API — Inscrições]"
  echo "    6) POST /registrations (criar inscrição)"
  echo "    7) GET /registrations/{id} (consultar)"
  echo "    8) POST /registrations/{id}/upload-url (gerar URL)"
  echo "    9) Upload de documento (PUT na presigned URL)"
  echo ""
  echo "  [API — Admin]"
  echo "   10) GET /admin/registrations (listar todas)"
  echo "   11) GET /admin/registrations/{id} (detalhe)"
  echo "   12) POST /admin/.../approve (aprovar)"
  echo "   13) POST /admin/.../reject (rejeitar)"
  echo ""
  echo "  [Observabilidade]"
  echo "   14) POST /admin/simulate-error (6x — disparar alarme)"
  echo "   15) Verificar status do alarme"
  echo ""
  echo "  [Validação]"
  echo "   16) Testar inputs inválidos"
  echo ""
  echo "    0) Sair"
  echo ""
}

# ---------------------------------------------------------------------------
# Opções
# ---------------------------------------------------------------------------
opt_apply_schema() {
  header "Aplicar Schema SQL no Aurora"
  npx tsx scripts/apply-schema.ts --profile="$AWS_PROFILE" --region="$REGION" --stack="$STACK_NAME"
}

opt_seed_events() {
  header "Seed de Eventos no DynamoDB"
  npx tsx scripts/seed-events.ts --profile="$AWS_PROFILE" --region="$REGION" --stack="$STACK_NAME"
}

opt_health() {
  header "GET /health"
  curl -s "$API_URL/health" | jq .
}

opt_list_events() {
  header "GET /events"
  EVENTS_RESPONSE=$(curl -s "$API_URL/events")
  echo "$EVENTS_RESPONSE" | jq .
  EVENT_ID=$(echo "$EVENTS_RESPONSE" | jq -r '.[0].eventId // empty')
  [ -n "$EVENT_ID" ] && echo "" && echo "📌 EVENT_ID capturado: $EVENT_ID"
}

opt_get_event() {
  header "GET /events/{eventId}"
  if [ -z "$EVENT_ID" ]; then
    read -p "EventId (ou execute opção 4 primeiro): " EVENT_ID
  fi
  curl -s "$API_URL/events/$EVENT_ID" | jq .
}

opt_create_registration() {
  header "POST /registrations"
  if [ -z "$EVENT_ID" ]; then
    read -p "EventId: " EVENT_ID
  fi
  read -p "Nome [João Silva]: " REG_NAME
  REG_NAME=${REG_NAME:-"João Silva"}
  read -p "Email [joao.silva@example.com]: " REG_EMAIL
  REG_EMAIL=${REG_EMAIL:-"joao.silva@example.com"}

  RESPONSE=$(curl -s -X POST "$API_URL/registrations" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$REG_NAME\", \"email\": \"$REG_EMAIL\", \"eventId\": \"$EVENT_ID\"}")
  echo "$RESPONSE" | jq .
  REGISTRATION_ID=$(echo "$RESPONSE" | jq -r '.id // empty')
  [ -n "$REGISTRATION_ID" ] && echo "" && echo "📌 REGISTRATION_ID capturado: $REGISTRATION_ID"
}

opt_get_registration() {
  header "GET /registrations/{id}"
  if [ -z "$REGISTRATION_ID" ]; then
    read -p "Registration ID: " REGISTRATION_ID
  fi
  curl -s "$API_URL/registrations/$REGISTRATION_ID" | jq .
}

opt_generate_upload_url() {
  header "POST /registrations/{id}/upload-url"
  if [ -z "$REGISTRATION_ID" ]; then
    read -p "Registration ID: " REGISTRATION_ID
  fi
  RESPONSE=$(curl -s -X POST "$API_URL/registrations/$REGISTRATION_ID/upload-url" \
    -H "Content-Type: application/json" \
    -d '{"fileName": "comprovante.pdf", "contentType": "application/pdf"}')
  echo "$RESPONSE" | jq .
  UPLOAD_URL=$(echo "$RESPONSE" | jq -r '.uploadUrl // empty')
  [ -n "$UPLOAD_URL" ] && echo "" && echo "📌 Upload URL capturada (expira em 5 min)"
}

opt_upload_document() {
  header "Upload de Documento (PUT presigned URL)"
  if [ -z "$UPLOAD_URL" ]; then
    echo "⚠️  Execute opção 8 primeiro para gerar a URL"
    return
  fi
  echo "%PDF-1.4 fake document for demo" > /tmp/demo-document.pdf
  echo "Uploading file ($(wc -c < /tmp/demo-document.pdf) bytes)..."
  RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$UPLOAD_URL" \
    -H "Content-Type: application/pdf" \
    --data-binary @/tmp/demo-document.pdf)
  STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  rm -f /tmp/demo-document.pdf
  echo "Upload HTTP Status: $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "✅ Upload realizado!"
    echo "⏳ Aguardando processamento assíncrono (5s)..."
    sleep 5
    echo "Status atualizado:"
    curl -s "$API_URL/registrations/$REGISTRATION_ID" | jq '.status'
  else
    echo "❌ Upload falhou"
    echo "Response body:"
    echo "$BODY"
  fi
}

opt_admin_list() {
  header "GET /admin/registrations"
  curl -s "$API_URL/admin/registrations" | jq .
}

opt_admin_get() {
  header "GET /admin/registrations/{id}"
  if [ -z "$REGISTRATION_ID" ]; then
    read -p "Registration ID: " REGISTRATION_ID
  fi
  curl -s "$API_URL/admin/registrations/$REGISTRATION_ID" | jq .
}

opt_admin_approve() {
  header "POST /admin/registrations/{id}/approve"
  if [ -z "$REGISTRATION_ID" ]; then
    read -p "Registration ID: " REGISTRATION_ID
  fi
  curl -s -X POST "$API_URL/admin/registrations/$REGISTRATION_ID/approve" | jq .
}

opt_admin_reject() {
  header "POST /admin/registrations/{id}/reject"
  if [ -z "$REGISTRATION_ID" ]; then
    read -p "Registration ID: " REGISTRATION_ID
  fi
  read -p "Motivo [Documento ilegível]: " REASON
  REASON=${REASON:-"Documento ilegível"}
  curl -s -X POST "$API_URL/admin/registrations/$REGISTRATION_ID/reject" \
    -H "Content-Type: application/json" \
    -d "{\"reason\": \"$REASON\"}" | jq .
}

opt_simulate_errors() {
  header "Simular Erros 5xx (6x para disparar alarme)"
  for i in $(seq 1 6); do
    RESPONSE=$(curl -s -X POST "$API_URL/admin/simulate-error")
    STATUS=$(echo "$RESPONSE" | jq -r '.statusCode')
    echo "  [$i/6] Status: $STATUS ✓"
    sleep 1
  done
  echo ""
  echo "✅ 6 erros disparados! Alarme deve acionar em ~5 min."
  echo "📧 E-mail será enviado via SNS."
}

opt_check_alarm() {
  header "Status do Alarme ApiGateway 5xx"
  aws cloudwatch describe-alarms \
    --alarm-names "${STACK_NAME}-ApiGateway-5xx" \
    --query 'MetricAlarms[0].{State:StateValue,Reason:StateReason}' \
    --output table --region "$REGION"
}

opt_invalid_inputs() {
  header "Testar Inputs Inválidos"
  echo "→ Email inválido + UUID inválido:"
  curl -s -X POST "$API_URL/registrations" \
    -H "Content-Type: application/json" \
    -d '{"name": "X", "email": "not-email", "eventId": "invalid"}' | jq .
  echo ""
  echo "→ Evento inexistente:"
  curl -s -X POST "$API_URL/registrations" \
    -H "Content-Type: application/json" \
    -d '{"name": "Test User", "email": "test@example.com", "eventId": "00000000-0000-4000-8000-000000000000"}' | jq .
  echo ""
  echo "→ Reject sem reason:"
  if [ -n "$REGISTRATION_ID" ]; then
    curl -s -X POST "$API_URL/admin/registrations/$REGISTRATION_ID/reject" \
      -H "Content-Type: application/json" \
      -d '{}' | jq .
  else
    echo "  (sem registration ID para testar)"
  fi
}

# ---------------------------------------------------------------------------
# Loop principal
# ---------------------------------------------------------------------------
while true; do
  show_menu
  read -p "Escolha uma opção: " choice
  case $choice in
    1)  opt_apply_schema ;;
    2)  opt_seed_events ;;
    3)  opt_health ;;
    4)  opt_list_events ;;
    5)  opt_get_event ;;
    6)  opt_create_registration ;;
    7)  opt_get_registration ;;
    8)  opt_generate_upload_url ;;
    9)  opt_upload_document ;;
    10) opt_admin_list ;;
    11) opt_admin_get ;;
    12) opt_admin_approve ;;
    13) opt_admin_reject ;;
    14) opt_simulate_errors ;;
    15) opt_check_alarm ;;
    16) opt_invalid_inputs ;;
    0)  echo "👋 Bye!"; exit 0 ;;
    *)  echo "❌ Opção inválida" ;;
  esac
  echo ""
  read -p "⏎ Enter para voltar ao menu..."
done
