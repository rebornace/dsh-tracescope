# Publish TraceScope packages to registry.npmjs.org (dependency order).
# Requires a Granular Access Token with Packages:write and "Bypass 2FA" (npm policy).
# Example:
#   $env:NODE_AUTH_TOKEN = "npm_xxx"
#   pnpm run publish:npm

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:NODE_AUTH_TOKEN -and -not $env:NPM_TOKEN) {
  Write-Host "Set NODE_AUTH_TOKEN (npm granular token with bypass 2FA) before publishing." -ForegroundColor Yellow
  exit 1
}

if ($env:NPM_TOKEN -and -not $env:NODE_AUTH_TOKEN) {
  $env:NODE_AUTH_TOKEN = $env:NPM_TOKEN
}

pnpm --filter @rebornace/tracescope-core publish --access public --no-git-checks
pnpm --filter @rebornace/dsh-tracescope publish --access public --no-git-checks
pnpm --filter @rebornace/tracescope-mcp publish --access public --no-git-checks

Write-Host "Published @rebornace/{tracescope-core,dsh-tracescope,tracescope-mcp}@0.1.0"
