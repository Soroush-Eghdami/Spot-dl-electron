# Build the standalone download worker into backend/dist.
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$python = Join-Path $root "venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

Push-Location $here
try {
    & $python -m PyInstaller "spotdl-backend.spec" --noconfirm --clean
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }
    Write-Host "Backend ready: $here\dist\spotdl-backend\spotdl-backend.exe"
}
finally {
    Pop-Location
}
