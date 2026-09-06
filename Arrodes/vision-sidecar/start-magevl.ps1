[CmdletBinding()]
param(
    [string]$PythonPath = (Join-Path $PSScriptRoot '.venv\Scripts\python.exe'),
    [ValidateRange(1, 65535)]
    [int]$Port = $(if ($env:MAGEVL_PORT) { [int]$env:MAGEVL_PORT } else { 12002 })
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "Python not found: $PythonPath. Follow vision-sidecar/README.md to create .venv and install requirements.txt, or pass -PythonPath with an existing environment's python.exe."
}

# No activation, downloads, .env parsing, or global execution-policy changes.
# Paths resolve relative to this script, not the caller's working directory.
& $PythonPath -u (Join-Path $PSScriptRoot 'mage_vl_sidecar.py') --port $Port
exit $LASTEXITCODE
