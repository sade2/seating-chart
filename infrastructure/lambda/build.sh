#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "→ Building Lambda handler..."

# Bundle everything into a single file (no node_modules dir in zip)
npx esbuild src/handler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:@aws-sdk/* \
  --outfile=dist/handler.js \
  --format=cjs \
  --minify

echo "→ Creating handler.zip..."
mkdir -p dist
cd dist
zip -q handler.zip handler.js

echo "→ Done. Size: $(du -sh handler.zip | cut -f1)"
