# ============================================================
#  Genera 7 web/facturas.js con las listas de PDFs disponibles:
#    - window.NUVA_FACTURAS -> 4 finanzas/contabilidad/1 facturas sell in
#    - window.NUVA_COMPRAS  -> 4 finanzas/contabilidad/2 facturas compras
#
#  - Lo llama el watcher de auto-sync en cada ciclo (automatico),
#    y tambien se puede correr a mano (doble clic / consola).
#  - Idempotente: solo reescribe facturas.js si el contenido cambio,
#    para no disparar eventos/bucles innecesarios en el watcher.
#  - Sin caracteres no-ASCII (Win PowerShell 5.1 lee .ps1 como ANSI).
# ============================================================
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot                              # ...\7 web
$repo = Split-Path -Parent $here                  # raiz del repo
$dirSellIn  = Join-Path $repo '4 finanzas\contabilidad\1 facturas sell in'
$dirCompras = Join-Path $repo '4 finanzas\contabilidad\2 facturas compras'
$out = Join-Path $here 'facturas.js'

function Get-Pdfs($dir) {
    if (Test-Path $dir) {
        return @(Get-ChildItem -LiteralPath $dir -Filter *.pdf -File |
                 Sort-Object Name | ForEach-Object { $_.Name })
    }
    return @()
}

function Emit-Array($varName, $files) {
    $files = @($files | Where-Object { $_ })   # forzar array y descartar nulos/vacios
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('window.' + $varName + ' = [')
    for ($i = 0; $i -lt $files.Count; $i++) {
        $name  = $files[$i] -replace '"', '\"'
        $comma = if ($i -lt $files.Count - 1) { ',' } else { '' }
        $lines.Add('  "' + $name + '"' + $comma)
    }
    $lines.Add('];')
    return $lines
}

$all = New-Object System.Collections.Generic.List[string]
$all.Add('/* Generado por gen-facturas.ps1 - NO editar a mano. Listas de PDFs disponibles. */')
$all.AddRange([string[]](Emit-Array 'NUVA_FACTURAS' (Get-Pdfs $dirSellIn)))
$all.AddRange([string[]](Emit-Array 'NUVA_COMPRAS'  (Get-Pdfs $dirCompras)))
$new = ($all -join "`r`n") + "`r`n"

$utf8 = New-Object System.Text.UTF8Encoding($false)
$old  = if (Test-Path $out) { [System.IO.File]::ReadAllText($out, $utf8) } else { '' }
if ($new -ne $old) {
    [System.IO.File]::WriteAllText($out, $new, $utf8)
    Write-Output "facturas.js actualizado."
} else {
    Write-Output "facturas.js sin cambios."
}
