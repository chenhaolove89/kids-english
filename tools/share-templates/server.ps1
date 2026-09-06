$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8137

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
try {
  $listener.Start()
} catch {
  Write-Host "Port $port is busy. Please reboot the PC or run this again later."
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host "==============================================="
Write-Host "  Happy Words - local server is RUNNING"
Write-Host "  URL: http://127.0.0.1:$port/"
Write-Host "  Keep this window OPEN while playing."
Write-Host "  Close this window to stop the server."
Write-Host "==============================================="
Start-Process ("http://127.0.0.1:{0}/" -f $port)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript'
  '.css'  = 'text/css'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.mp3'  = 'audio/mpeg'
  '.webmanifest' = 'application/manifest+json'
  '.ico'  = 'image/x-icon'
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $s = $client.GetStream()
    $line = (New-Object System.IO.StreamReader($s)).ReadLine()
    if ($line) {
      $p = $line.Split(' ')[1].Split('?')[0]
      if ($p -eq '/') { $p = '/index.html' }
      $f = [System.IO.Path]::GetFullPath((Join-Path $root ($p -replace '/', '\')))
      $ok = $f.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $f -PathType Leaf)
      if ($ok) {
        $ext = [System.IO.Path]::GetExtension($f).ToLowerInvariant()
        $ct = 'application/octet-stream'
        if ($mime.ContainsKey($ext)) { $ct = $mime[$ext] }
        $b = [System.IO.File]::ReadAllBytes($f)
        $h = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($b.Length)`r`nConnection: close`r`n`r`n"
      } else {
        $b = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $h = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($b.Length)`r`nConnection: close`r`n`r`n"
      }
      $hb = [System.Text.Encoding]::ASCII.GetBytes($h)
      $s.Write($hb, 0, $hb.Length)
      if ($ok) { $s.Write($b, 0, $b.Length) }
    }
  } catch {}
  try { $client.Close() } catch {}
}
