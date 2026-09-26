$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".env.local")) { Copy-Item ".env.local.example" ".env.local" }
if (-not (Test-Path "node_modules")) { npm install }
$modeLine = Select-String -Path ".env.local" -Pattern '^PHOTO_LOCAL_DATABASE_MODE=' | Select-Object -First 1
$mode = if ($modeLine) { ($modeLine.Line -split '=', 2)[1].Trim().ToLowerInvariant() } else { "pglite" }
npm run local:setup
if ($mode -ne "pglite") {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run worker:local" -WorkingDirectory $PSScriptRoot
} else {
  Write-Host "PGlite local mode: Photo Worker runs serialized inside the Next.js process; no second worker window is required."
}
npm run local:dev
