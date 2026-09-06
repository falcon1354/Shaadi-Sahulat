# Start all ShaadiSahulat local services (frontend, backend, ML, visual ML).
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-local.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Install it from https://nodejs.org then re-run this script."
}
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm packages..."
  npm install
}
if (-not (Test-Path "ml-service\.venv")) {
  Write-Error "ML virtualenv missing. Create it with: python -m venv ml-service\.venv"
}

Write-Host "Starting ShaadiSahulat on http://localhost:3000 ..."
npm run dev:all
