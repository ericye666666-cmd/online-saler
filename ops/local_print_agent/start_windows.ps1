$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8719/health" -TimeoutSec 2
  if ($health.capabilities -contains "online_saler_raster_v1") {
    Write-Host "The shared ERP / Online Saler print agent is already running. Return to the website and click Detect."
    exit 0
  }
  throw "PORT_IN_USE"
} catch {
  if ($_.Exception.Message -eq "PORT_IN_USE") {
    Write-Host "Close the old ERP print helper window first, then run this launcher again. No processes were stopped."
    exit 1
  }
}
$pythonExe = $null
foreach ($candidate in @("$env:LOCALAPPDATA\Programs\Python\Python312\python.exe", "python", "py")) {
  try {
    & $candidate -c "import sys; assert sys.version_info >= (3, 10)" 2>$null
    if ($LASTEXITCODE -eq 0) { $pythonExe = $candidate; break }
  } catch {}
}
if (-not $pythonExe) {
  Write-Host "Python 3.10+ is required. Installing Python 3.12 using Windows Package Manager..."
  winget install --id Python.Python.3.12 --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
  $pythonExe = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
  if (-not (Test-Path $pythonExe)) { throw "Python installation did not complete. Install Python 3.12 from python.org, then run this launcher again." }
}
Write-Host "Shared ERP / Online Saler Deli 720 helper: http://127.0.0.1:8719"
Write-Host "Keep this window open. Return to Operations and click Detect."
& $pythonExe .\agent.py local-api
