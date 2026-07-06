# ============================================================
#  Genera 7 web/facturas.js con la lista de PDFs disponibles en
#  4 finanzas/contabilidad/1 facturas sell in.
#
#  - Lo llama el watcher de auto-sync en cada ciclo (automatico),
#    y tambien se puede correr a mano (doble clic / consola).
#  - Idempotente: solo reescribe facturas.js si el contenido cambio,
#    para no disparar eventos/bucles innecesarios en el watcher.
#  - Sin caracteres no-ASCII (Win PowerShell 5.1 lee .ps1 como ANSI).
# ============================================================
$ErrorActionPreference = 'Stop'

$here   = $PSScriptRoot                                   # ...\7 web
$repo   = Split-Path -Parent $here                        # raiz del repo
$facDir = Join-Path $repo '4 finanzas\contabilidad\1 facturas sell in'
$out    = Join-Path $here 'facturas.js'

$files = @()
if (Test-Path $facDir) {
    $files = @(Get-ChildItem -LiteralPath $facDir -Filter *.pdf -File |
               Sort-Object Name | ForEach-Object { $_.Name })
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('/* Generado por gen-facturas.ps1 - NO editar a mano. Lista de PDFs disponibles. */')
$lines.Add('window.NUVA_FACTURAS = [')
for ($i = 0; $i -lt $files.Count; $i++) {
    $name  = $files[$i] -replace '"', '\"'
    $comma = if ($i -lt $files.Count - 1) { ',' } else { '' }
    $lines.Add('  "' + $name + '"' + $comma)
}
$lines.Add('];')
$new = ($lines -join "`r`n") + "`r`n"

$utf8 = New-Object System.Text.UTF8Encoding($false)
$old  = if (Test-Path $out) { [System.IO.File]::ReadAllText($out, $utf8) } else { '' }
if ($new -ne $old) {
    [System.IO.File]::WriteAllText($out, $new, $utf8)
    Write-Output ("facturas.js actualizado: " + $files.Count + " PDF(s).")
} else {
    Write-Output ("facturas.js sin cambios (" + $files.Count + " PDF).")
}
