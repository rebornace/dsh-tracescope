# Publish TraceScope packages to registry.npmjs.org (dependency order).
# Requires a Granular Access Token with:
#   - Packages and scopes: scope "@rebornace" (Read and write / publish+stage)
#   - Bypass two-factor authentication: enabled
# Do NOT only grant "Organizations" access — that cannot publish packages.
#
# Example:
#   $env:NODE_AUTH_TOKEN = "npm_xxx"
#   pnpm run publish:npm

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:NODE_AUTH_TOKEN -and -not $env:NPM_TOKEN) {
  Write-Host "Set NODE_AUTH_TOKEN (npm granular token) before publishing." -ForegroundColor Yellow
  exit 1
}

if ($env:NPM_TOKEN -and -not $env:NODE_AUTH_TOKEN) {
  $env:NODE_AUTH_TOKEN = $env:NPM_TOKEN
}

npm config set "//registry.npmjs.org/:_authToken" $env:NODE_AUTH_TOKEN | Out-Null

$packages = @(
  "@rebornace/tracescope-core",
  "@rebornace/dsh-tracescope",
  "@rebornace/tracescope-mcp"
)

foreach ($pkg in $packages) {
  Write-Host ""
  Write-Host "=== Publishing $pkg ===" -ForegroundColor Cyan
  pnpm --filter $pkg publish --access public --no-git-checks
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: $pkg (exit $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "Token must grant scope @rebornace (Packages and scopes, Read and write) and Bypass 2FA." -ForegroundColor Yellow
    Write-Host "Do not only select Organizations — that cannot publish packages." -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
  Write-Host "OK: $pkg" -ForegroundColor Green
}

Write-Host ""
Write-Host "All published: $($packages -join ', ')@0.1.1" -ForegroundColor Green
