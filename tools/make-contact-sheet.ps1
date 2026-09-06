# 生成图片对照表（contact sheet）：把 src/static/img/*.png 拼成大图，每张图下方标注英文词+id，
# 供全量视觉核对 emoji 码点是否配错词。SVG 自绘卡不在此列（本地生成，构建后在浏览器抽查）。
# 用法：powershell -File tools/make-contact-sheet.ps1
param(
    [string]$Root = "$PSScriptRoot\..",
    [string]$OutDir = "$PSScriptRoot\..\tmp\sheets",
    [int]$Cols = 12,
    [int]$Rows = 10
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$imgDir = Join-Path $Root 'src/static/img'
$dataFile = Join-Path $Root 'src/data/words.json'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$map = @{}
if (Test-Path $dataFile) {
    $data = Get-Content $dataFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($cat in $data.categories) {
        foreach ($w in $cat.words) { $map[$w.id] = $w.en }
    }
}

$files = Get-ChildItem $imgDir -Filter *.png | Sort-Object Name
Write-Host "PNG 总数: $($files.Count)"

$cell = 120
$labelH = 34
$sheetW = $Cols * $cell
$sheetH = $Rows * ($cell + $labelH)
$fontBig = New-Object System.Drawing.Font('Arial', 10, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font('Arial', 8)
$brushText = [System.Drawing.Brushes]::Black
$brushGray = [System.Drawing.Brushes]::Gray

$sheetIdx = 0
$i = 0
while ($i -lt $files.Count) {
    $sheetIdx++
    $bmp = New-Object System.Drawing.Bitmap($sheetW, $sheetH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    for ($r = 0; $r -lt $Rows; $r++) {
        for ($c = 0; $c -lt $Cols; $c++) {
            if ($i -ge $files.Count) { break }
            $f = $files[$i]
            $id = [IO.Path]::GetFileNameWithoutExtension($f.Name)
            $x = $c * $cell
            $y = $r * ($cell + $labelH)
            try {
                $img = [System.Drawing.Image]::FromFile($f.FullName)
                $g.DrawImage($img, $x + 4, $y + 4, $cell - 8, $cell - 8)
                $img.Dispose()
            } catch {
                $g.DrawRectangle([System.Drawing.Pens]::Red, $x + 4, $y + 4, $cell - 8, $cell - 8)
            }
            $label = if ($map.ContainsKey($id)) { $map[$id] } else { $id }
            if ($label.Length -gt 16) { $label = $label.Substring(0, 16) }
            $g.DrawString($label, $fontBig, $brushText, [float]$x, [float]($y + $cell))
            $g.DrawString($id, $fontSmall, $brushGray, [float]$x, [float]($y + $cell + 16))
            $g.DrawRectangle([System.Drawing.Pens]::Gainsboro, $x, $y, $cell, $cell + $labelH)
            $i++
        }
    }
    $g.Dispose()
    $out = Join-Path $OutDir ("sheet-{0:d2}.png" -f $sheetIdx)
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "已生成 $out"
}
Write-Host "完成：$sheetIdx 张对照表 → $OutDir"
