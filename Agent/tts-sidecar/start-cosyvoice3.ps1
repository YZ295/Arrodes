param(
  [Parameter(Mandatory = $true)]
  [string]$ModelDir,
  [string]$Python = "D:\Anaconda\envs\cosyvoice3\python.exe",
  [int]$Port = 12003,
  [string]$ProjectDir = ""
)

$resolvedModel = (Resolve-Path -LiteralPath $ModelDir).Path
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
  throw "CosyVoice3 Python 不存在: $Python"
}

$env:COSYVOICE_MODEL_DIR = $resolvedModel
if ($ProjectDir) {
  $env:COSYVOICE_PROJECT_DIR = (Resolve-Path -LiteralPath $ProjectDir).Path
}

& $Python "$PSScriptRoot\tts_sidecar.py" --port $Port
