# ============================================================
#  Auto-sync watcher BIDIRECCIONAL para Proyecto-Nuva-Oxi
#   - Sube cambios locales (commit + push) ante cualquier cambio en disco.
#   - Baja cambios remotos (fetch + pull --rebase) por sondeo periodico.
#   - Ante conflicto, aborta el rebase de forma segura y lo registra.
#
#  NOTA: las rutas se derivan de $env:OneDrive para NO escribir
#  caracteres no-ASCII (la "n-tilde") en el archivo, que Windows
#  PowerShell 5.1 corrompe al leer .ps1 como ANSI.
# ============================================================

$ErrorActionPreference = 'Continue'   # que un stderr de git no aborte el watcher

# Resolucion robusta de la carpeta base (por si la tarea arranca sin $env:OneDrive):
if ($env:OneDrive) {
    $Escritorio = Join-Path $env:OneDrive 'Escritorio'
} else {
    $od = Get-ChildItem $env:USERPROFILE -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'OneDrive*' } | Select-Object -First 1
    $Escritorio = Join-Path $od.FullName 'Escritorio'
}
$RepoPath        = Join-Path $Escritorio 'Proyecto-Nuva-Oxi'
# El log va FUERA del repo (evita bucles del watcher y no ensucia el repo):
$LogDir          = Join-Path $env:USERPROFILE 'NuvaOxi-Sync'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogPath         = Join-Path $LogDir 'nuva-oxi-sync.log'
$RefreshScript   = Join-Path $LogDir 'refresh-web-data.ps1'  # regenera 7 web\data.js cuando cambia el CRM
$Branch          = 'main'
$DebounceSeconds = 5    # espera de "silencio" antes de sincronizar un lote de cambios locales
$PollSeconds     = 30   # cada cuanto se consulta el remoto por cambios nuevos

# Que git nunca se quede colgado pidiendo credenciales de forma interactiva:
# si faltaran, falla rapido y lo registra en el log en vez de congelar el watcher.
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE     = 'never'

function Write-Log($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "$ts  $msg" | Out-File -FilePath $LogPath -Append -Encoding utf8
}

# Sincronizacion en AMBOS sentidos:
#   1) commitea cambios locales
#   2) integra cambios remotos (pull --rebase)
#   3) empuja si quedamos por delante
function Invoke-Sync {
    Push-Location $RepoPath
    try {
        # --- 0) Si cambio el CRM, regenerar data.js de la web app ---
        $pre = git status --porcelain
        if (($pre -match 'CRM_NUVA_OXI') -and (Test-Path $RefreshScript)) {
            try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RefreshScript 2>&1 | Out-Null; Write-Log "data.js regenerado por cambio en CRM." }
            catch { Write-Log "fallo refresh data.js: $($_.Exception.Message)" }
        }
        # --- 0b) Regenerar manifiesto de facturas PDF de la web (no debe abortar el sync) ---
        $genFac = Join-Path $RepoPath '7 web\gen-facturas.ps1'
        if (Test-Path $genFac) {
            try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $genFac 2>&1 | Out-Null }
            catch { Write-Log "fallo gen-facturas: $($_.Exception.Message)" }
        }
        # --- 1) Commit de cambios locales ---
        git add -A | Out-Null
        $status = git status --porcelain
        $hadLocal = -not [string]::IsNullOrWhiteSpace($status)
        if ($hadLocal) {
            $nfiles = ($status -split "`n").Count
            git commit -m "auto-sync: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-Null
        }

        # --- 2) Traer remoto ---
        git fetch origin $Branch 2>&1 | Out-Null
        $behind = 0
        try { $behind = [int]((git rev-list --count "HEAD..origin/$Branch" 2>$null) | Select-Object -First 1) } catch { $behind = 0 }

        if ($behind -gt 0) {
            git pull --rebase --autostash origin $Branch 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                git rebase --abort 2>&1 | Out-Null
                Write-Log "CONFLICTO con el remoto: rebase abortado, tus cambios locales quedan intactos. Requiere resolucion manual."
                return
            }
            Write-Log "BAJADA - $behind commit(s) remoto(s) integrados (ahora en $(git rev-parse --short HEAD))."
        }

        # --- 3) Empujar si estamos por delante ---
        $ahead = 0
        try { $ahead = [int]((git rev-list --count "origin/$Branch..HEAD" 2>$null) | Select-Object -First 1) } catch { $ahead = 0 }

        if ($ahead -gt 0) {
            git push origin $Branch 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                if ($hadLocal) {
                    Write-Log "SUBIDA - $nfiles archivo(s) local(es) enviados a $Branch (commit $(git rev-parse --short HEAD))."
                } else {
                    Write-Log "SUBIDA - $ahead commit(s) enviados a $Branch."
                }
            } else {
                Write-Log "ERROR en push (exit $LASTEXITCODE). Se reintenta en el proximo ciclo."
            }
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
    Write-Log "ERROR: no se encontro el repo en $RepoPath. Watcher abortado."
    return
}

Write-Log "=== Watcher BIDIRECCIONAL iniciado sobre $RepoPath (poll remoto cada ${PollSeconds}s) ==="

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path                  = $RepoPath
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents   = $true
$fsw.NotifyFilter          = [System.IO.NotifyFilters]::FileName -bor `
                             [System.IO.NotifyFilters]::DirectoryName -bor `
                             [System.IO.NotifyFilters]::LastWrite -bor `
                             [System.IO.NotifyFilters]::Size

# Registro de eventos SIN -Action: se encolan y los consumimos con Wait-Event
# (patron confiable, sin problemas de scope entre runspaces).
Register-ObjectEvent $fsw Changed -SourceIdentifier FswChanged | Out-Null
Register-ObjectEvent $fsw Created -SourceIdentifier FswCreated | Out-Null
Register-ObjectEvent $fsw Deleted -SourceIdentifier FswDeleted | Out-Null
Register-ObjectEvent $fsw Renamed -SourceIdentifier FswRenamed | Out-Null

# Sincroniza al arrancar (sube pendientes y baja remotos).
try { Invoke-Sync } catch { Write-Log "ERROR arranque: $_" }

$lastPull = Get-Date
while ($true) {
    # Espera un evento local hasta 'PollSeconds'. Si vence el tiempo sin eventos,
    # igual hacemos un ciclo para traer cambios del remoto.
    $ev = Wait-Event -Timeout $PollSeconds

    $doLocal = $false
    if ($ev) {
        # Debounce: consume eventos hasta que haya 'DebounceSeconds' de silencio.
        # Ignoramos lo interno de .git (evita bucles: nuestro propio fetch/commit
        # genera eventos en .git que si no, dispararian mas sincronizaciones).
        $relevant = $false
        while ($true) {
            $p = $ev.SourceEventArgs.FullPath
            if ($p -and ($p -notmatch '\\\.git\\') -and ($p -notmatch '\\\.git$')) { $relevant = $true }
            Remove-Event -EventIdentifier $ev.EventIdentifier
            $ev = Wait-Event -Timeout $DebounceSeconds
            if (-not $ev) { break }
        }
        if ($relevant) { $doLocal = $true }
    }

    # Sincroniza si hubo cambio local relevante, o si toca el sondeo remoto periodico.
    $duePull = (((Get-Date) - $lastPull).TotalSeconds -ge $PollSeconds)
    if ($doLocal -or $duePull) {
        try { Invoke-Sync } catch { Write-Log "ERROR: $_" }
        $lastPull = Get-Date
    }
}
