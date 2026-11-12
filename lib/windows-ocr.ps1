param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Language = 'zh-Hans',
  [string]$Layout = 'auto',
  [switch]$Preprocess,
  [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$tempPath = $null
if ($Preprocess) {
  try {
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($Path)
    try {
      $targetWidth = [Math]::Min(1600, [Math]::Max(1, [int]($source.Width * 4)))
      $scale = $targetWidth / [Math]::Max(1, $source.Width)
      if ($scale -gt 1.05) {
        $targetHeight = [Math]::Max(1, [int]($source.Height * $scale))
        $bitmap = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
        try {
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
          try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
          } finally {
            $graphics.Dispose()
          }
          $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ("cortex-ocr-" + [Guid]::NewGuid().ToString('N') + ".png")
          $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
          $Path = $tempPath
        } finally {
          $bitmap.Dispose()
        }
      }
    } finally {
      $source.Dispose()
    }
  } catch {
    $tempPath = $null
  }
}

try {
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($operation, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = $null
if ($Language) {
  try {
    $languageObject = [Windows.Globalization.Language]::new($Language)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($languageObject)
  } catch {
    $engine = $null
  }
}
if (-not $engine) {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if (-not $engine) {
  throw "Windows OCR is unavailable for language '$Language' and no user-profile OCR language is installed."
}

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
if ($AsJson) {
  $words = @()
  $lineIndex = 0
  foreach ($line in $result.Lines) {
    $wordIndex = 0
    foreach ($word in $line.Words) {
      $rect = $word.BoundingRect
      $words += [pscustomobject]@{
        text = [string]$word.Text
        x = [double]$rect.X
        y = [double]$rect.Y
        width = [double]$rect.Width
        height = [double]$rect.Height
        line = $lineIndex
        index = $wordIndex
      }
      $wordIndex++
    }
    $lineIndex++
  }
  [pscustomobject]@{ engine = 'windows-ocr'; layout = $Layout; words = $words } | ConvertTo-Json -Depth 4 -Compress
} else {
  $result.Text
}
} finally {
  if ($tempPath -and (Test-Path -LiteralPath $tempPath)) {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  }
}
