$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Starting Online Saler Print Agent on http://127.0.0.1:8719"
Write-Host "Keep this window open while printing labels."

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found. Install Python 3, then run this script again."
}

python .\agent.py local-api
