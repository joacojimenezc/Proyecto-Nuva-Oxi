# sync-drive.ps1 — Sube los archivos del deploy de wp3-deploy a la carpeta espejo en Google Drive.
# Se ejecuta automáticamente desde el git hook post-commit y tras cada push.
# Requiere rclone configurado con un remote llamado "gdrive" (Google Drive).
# Excluye node_modules/, .git/ y .claude/ (no se espejan).

$ErrorActionPreference = 'Stop'

$RepoDir   = Split-Path -Parent $PSScriptRoot           # carpeta raíz del repo (padre de .claude)
$Rclone    = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.74.3-windows-amd64\rclone.exe"
if (-not (Test-Path $Rclone)) { $Rclone = "rclone" }    # fallback al PATH

# Ruta destino en Drive (remote:ruta). Ajustar DriveBase si cambia la estructura en Drive.
$DriveBase = "WP3 Respaldo Ordenado/Plataforma WEB WP3 - Rubrica Cross-Assessment /wp3-deploy"
$Remote    = "gdrive:$DriveBase"

Write-Host "[sync-drive] Sincronizando $RepoDir -> $Remote"

& $Rclone sync "$RepoDir" "$Remote" `
    --exclude "node_modules/**" `
    --exclude ".git/**" `
    --exclude ".claude/**" `
    --exclude "*.tmp" `
    --create-empty-src-dirs `
    --transfers 4 `
    --checkers 8 `
    -v

if ($LASTEXITCODE -ne 0) {
    Write-Host "[sync-drive] ERROR: rclone devolvió código $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "[sync-drive] OK"
