#!/usr/bin/env bash
# deploy-lambda.sh — Build and deploy the Lambda function to AWS.
# Usage:
#   ./scripts/deploy-lambda.sh           # deploys to dev (default)
#   ./scripts/deploy-lambda.sh prod      # deploys to prod
set -euo pipefail

ENV="${1:-dev}"
FUNCTION_NAME="seating-chart-projects-${ENV}"
REGION="${AWS_REGION:-us-east-1}"
LAMBDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../infrastructure/lambda" && pwd)"

# ── Validate env ───────────────────────────────────────────────────────────────

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Error: environment must be 'dev' or 'prod' (got '${ENV}')"
  exit 1
fi

echo "▶ Deploying Lambda to ${ENV} (function: ${FUNCTION_NAME})"

# ── Install dependencies ───────────────────────────────────────────────────────

echo "→ Installing dependencies..."
cd "$LAMBDA_DIR"
npm install --silent

# ── Build ──────────────────────────────────────────────────────────────────────

echo "→ Building..."
npm run build

ZIP_PATH="${LAMBDA_DIR}/dist/handler.zip"
ZIP_SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
echo "→ Built handler.zip (${ZIP_SIZE})"

# ── Deploy ─────────────────────────────────────────────────────────────────────

echo "→ Uploading to Lambda..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://${ZIP_PATH}" \
  --region "$REGION" \
  --output json \
  --query '{FunctionName: FunctionName, CodeSize: CodeSize, LastModified: LastModified}' \
  | cat

echo ""
echo "✓ Done — ${FUNCTION_NAME} is live."
