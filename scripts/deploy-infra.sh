#!/usr/bin/env bash
# deploy-infra.sh — Build Lambda and apply Terraform infrastructure.
# Mirrors the GitHub Actions infra.yml workflow for local use.
#
# Usage:
#   ./scripts/deploy-infra.sh              # plan + apply to dev (default)
#   ./scripts/deploy-infra.sh prod         # plan + apply to prod
#   ./scripts/deploy-infra.sh dev --plan   # plan only, no apply
set -euo pipefail

ENV="${1:-dev}"
PLAN_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--plan" ]] && PLAN_ONLY=true
done

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPTS_DIR}/.." && pwd)"
LAMBDA_DIR="${REPO_ROOT}/infrastructure/lambda"
TF_DIR="${REPO_ROOT}/infrastructure/environments/${ENV}"

# ── Validate env ───────────────────────────────────────────────────────────────

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Error: environment must be 'dev' or 'prod' (got '${ENV}')"
  exit 1
fi

if [[ ! -d "$TF_DIR" ]]; then
  echo "Error: no Terraform environment found at ${TF_DIR}"
  exit 1
fi

echo "▶ Deploying infrastructure to ${ENV}"

# ── Build Lambda ───────────────────────────────────────────────────────────────
# Produces infrastructure/lambda/dist/handler.zip — referenced by Terraform.
# Use deploy-lambda.sh directly for a Lambda-only hotfix without touching infra.

echo ""
echo "── Step 1/3: Build Lambda ────────────────────────────────────────────────"
cd "$LAMBDA_DIR"
echo "→ Installing dependencies..."
npm ci --silent
echo "→ Building..."
npm run build
ZIP_SIZE=$(du -sh dist/handler.zip | cut -f1)
echo "→ Built handler.zip (${ZIP_SIZE})"

# ── Terraform Init ─────────────────────────────────────────────────────────────

echo ""
echo "── Step 2/3: Terraform Init ──────────────────────────────────────────────"
cd "$TF_DIR"
terraform init -upgrade

# ── Terraform Plan ─────────────────────────────────────────────────────────────

echo ""
echo "── Step 3/3: Terraform Plan ──────────────────────────────────────────────"
terraform plan -out=tfplan

if [[ "$PLAN_ONLY" == true ]]; then
  echo ""
  echo "✓ Plan complete (--plan flag set, skipping apply)."
  exit 0
fi

# ── Terraform Apply ────────────────────────────────────────────────────────────

echo ""
read -r -p "Apply the above plan to '${ENV}'? [y/N] " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

terraform apply tfplan

echo ""
echo "✓ Done — ${ENV} infrastructure is live."
