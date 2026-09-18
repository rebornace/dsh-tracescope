#!/usr/bin/env bash
# Publish TraceScope npm packages in dependency order (DSH-compatible prebuilt bundles).
# Requires: npm login or NPM_TOKEN / NODE_AUTH_TOKEN for registry.npmjs.org
# Usage:
#   export NODE_AUTH_TOKEN=npm_xxxxxxxx
#   pnpm run publish:npm
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
pnpm --filter @rebornace/tracescope-core publish --access public --no-git-checks
pnpm --filter @rebornace/dsh-tracescope publish --access public --no-git-checks
pnpm --filter @rebornace/tracescope-mcp publish --access public --no-git-checks
echo "Published @rebornace/{tracescope-core,dsh-tracescope,tracescope-mcp}@0.1.1"
