<#
.SYNOPSIS
  Environment check for dsh-cortex-extractors.

.DESCRIPTION
  Reports which OCR/ASR engines this machine already has. It never downloads
  anything and never changes configuration.

  The extractor works out of the box on Windows through the built-in Windows OCR
  engine. Tesseract, whisper.cpp and PaddleOCR are optional power paths; this
  script only tells you what is present and where to get the rest.

.EXAMPLE
  .\check-env.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

function Write-Head([string]$text) { Write-Host ''; Write-Host $text; Write-Host ('-' * $text.Length) }

function Find-Command([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Show-Row([string]$name, [string]$value, [string]$hint) {
  if ($value) {
    Write-Host ('  [ok]   {0,-18} {1}' -f $name, $value)
  } else {
    Write-Host ('  [--]   {0,-18} {1}' -f $name, $hint)
  }
}

Write-Host 'dsh-cortex-extractors environment check'
Write-Host ('  OS: {0}   PowerShell: {1}' -f $env:OS, $PSVersionTable.PSVersion)

Write-Head 'Windows OCR (default provider, no install needed)'
$windowsOcr = $null
try {
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
  $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
  if ($langs -and $langs.Count -gt 0) {
    $windowsOcr = ($langs | ForEach-Object { $_.LanguageTag }) -join ', '
  }
} catch {
  $windowsOcr = $null
}
Show-Row 'recognizer languages' $windowsOcr 'not available on this system'
if ($windowsOcr) {
  Write-Host '         Use ocrProvider: windows (the default); no model or extra install.'
}

Write-Head 'Tesseract (optional)'
$tesseract = Find-Command 'tesseract.exe'
Show-Row 'tesseract.exe' $tesseract 'not found; optional'
$tessdata = $env:TESSDATA_PREFIX
if (-not $tessdata) {
  $tessdata = Join-Path $env:LOCALAPPDATA 'cortex-extractors\tessdata'
}
Show-Row 'tessdata' $(if (Test-Path -LiteralPath $tessdata) { $tessdata } else { $null }) "not found at $tessdata; set tessdataPath or install a language pack"
if ($tesseract) {
  $version = & $tesseract --version 2>$null | Select-Object -First 1
  if ($version) { Write-Host ('         {0}' -f $version) }
}

Write-Head 'whisper.cpp (optional, for audio)'
$whisper = Find-Command 'whisper-cli.exe'
if (-not $whisper) { $whisper = Find-Command 'whisper.exe' }
Show-Row 'whisper executable' $whisper 'not found; optional, set whisperPath'
$model = $env:DSH_WHISPER_MODEL
Show-Row 'model (ggml-*.bin)' $(if ($model -and (Test-Path -LiteralPath $model)) { $model } else { $null }) 'set whisperModelPath to a ggml model'

Write-Head 'PaddleOCR (optional, for layout and handwriting)'
$python = Find-Command 'python.exe'
Show-Row 'python.exe' $python 'not found; optional'
if ($python) {
  $hasPaddle = $false
  try {
    $probe = & $python -c "import importlib.util,sys; print('yes' if importlib.util.find_spec('paddleocr') else 'no')" 2>$null
    $hasPaddle = ($probe -eq 'yes')
  } catch {
    $hasPaddle = $false
  }
  Show-Row 'paddleocr module' $(if ($hasPaddle) { 'installed' } else { $null }) 'not installed; pip install paddleocr paddlepaddle'
}

Write-Head 'what this means'
Write-Host '  Nothing above is required: Windows OCR alone is enough for screenshots and'
Write-Host '  plain images. The optional engines only add layout analysis, handwriting or'
Write-Host '  local audio transcription. This script never installs or downloads anything.'
Write-Host ''
Write-Host '  Official sources:'
Write-Host '    Tesseract for Windows: https://github.com/UB-Mannheim/tesseract/wiki'
Write-Host '    whisper.cpp (build it or use a release you trust): https://github.com/ggml-org/whisper.cpp'
Write-Host '    PaddleOCR: https://www.paddleocr.ai/'
