#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# deploy-frontend.sh — Deploys frontend static files to S3 and invalidates CloudFront
# Usage: ./scripts/deploy-frontend.sh [--profile=<aws-profile>]
# =============================================================================

STACK_NAME="eventhub-webinar"
REGION="us-east-1"
FRONTEND_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
PROFILE_ARG=""

# Parse arguments
for arg in "$@"; do
  case $arg in
    --profile=*)
      PROFILE_ARG="--profile ${arg#*=}"
      ;;
  esac
done

echo "📦 Fetching stack outputs from ${STACK_NAME}..."

BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendDistributionId'].OutputValue" \
  --output text)

API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

FRONTEND_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  $PROFILE_ARG \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text)

if [[ -z "$BUCKET_NAME" || "$BUCKET_NAME" == "None" ]]; then
  echo "❌ Could not resolve FrontendBucketName from stack outputs."
  exit 1
fi

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
  echo "❌ Could not resolve FrontendDistributionId from stack outputs."
  exit 1
fi

echo "  Bucket:       ${BUCKET_NAME}"
echo "  Distribution: ${DISTRIBUTION_ID}"
echo "  API URL:      ${API_URL}"
echo ""

# Inject API_URL into app.js (replace placeholder or existing value)
if [[ -f "${FRONTEND_DIR}/app.js" ]]; then
  echo "🔧 Injecting API_URL into app.js..."
  sed -i "s|const API_BASE_URL = .*|const API_BASE_URL = '${API_URL}';|" "${FRONTEND_DIR}/app.js"
fi

echo "🚀 Syncing frontend files to s3://${BUCKET_NAME}..."
aws s3 sync "$FRONTEND_DIR" "s3://${BUCKET_NAME}" \
  --delete \
  --region "$REGION" \
  $PROFILE_ARG \
  --cache-control "public, max-age=300"

echo "🔄 Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  $PROFILE_ARG \
  --query "Invalidation.Id" \
  --output text)

echo "  Invalidation ID: ${INVALIDATION_ID}"
echo ""
echo "✅ Frontend deployed successfully!"
echo "  URL: ${FRONTEND_URL}"
