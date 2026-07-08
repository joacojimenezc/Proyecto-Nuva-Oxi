# ============================================================
#  gen-instagram.ps1 — baja datos de Instagram (API de Meta Business)
#  y escribe 7 web/instagram.js (shape canonico que consume la web).
#
#  SEGURIDAD: el token NO va en el repo. Se lee de:
#     <USERPROFILE>\NuvaOxi-Sync\ig-config.txt
#  Formato del archivo (una linea por clave):
#     TOKEN=EAAG...tu_token_largo...
#     IG_USER_ID=1784xxxxxxxxx   (opcional; si falta, se descubre por la pagina FB)
#     API_VER=v21.0              (opcional)
#
#  Requisitos de la cuenta: IG Business/Creator vinculada a una pagina de Facebook.
#  Permisos del token: instagram_basic, pages_show_list, pages_read_engagement,
#                      instagram_manage_insights.
#  Sin tildes ni enie en este archivo (Win PowerShell 5.1 lo lee como ANSI).
# ============================================================
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$outFile = Join-Path $here 'instagram.js'
$logDir  = Join-Path $env:USERPROFILE 'NuvaOxi-Sync'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'instagram-sync.log'
$cfgFile = Join-Path $logDir 'ig-config.txt'

function Log($m){ ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) | Out-File -FilePath $logFile -Append -Encoding utf8 }
function WriteIG($obj){
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $content = "/* Generado por gen-instagram.ps1 - NO editar a mano. */`r`nwindow.NUVA_IG = $json;`r`n"
  [System.IO.File]::WriteAllText($outFile, $content, (New-Object System.Text.UTF8Encoding($false)))
}
function Fail($motivo){
  Log "ERROR: $motivo"
  WriteIG @{ ok=$false; generado=(Get-Date -Format 'yyyy-MM-dd HH:mm'); motivo=$motivo }
  exit 1
}

# --- Config / token ---
if (-not (Test-Path $cfgFile)) { Fail "Falta el archivo $cfgFile con TOKEN=..." }
$cfg = @{}
Get-Content $cfgFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1].ToUpper()] = $Matches[2] }
}
$tok = $cfg['TOKEN']
if ([string]::IsNullOrWhiteSpace($tok)) { Fail "TOKEN vacio en ig-config.txt" }
$ver = if ($cfg['API_VER']) { $cfg['API_VER'] } else { 'v21.0' }
$base = "https://graph.facebook.com/$ver"

function Api($path, $query){
  $url = "$base/$path`?$query&access_token=$tok"
  return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
}
function TryApi($path, $query){ try { return Api $path $query } catch { Log "aviso: fallo $path ($($_.Exception.Message))"; return $null } }

# --- IG User ID (config o descubrir por pagina) ---
$igid = $cfg['IG_USER_ID']
if ([string]::IsNullOrWhiteSpace($igid)) {
  $pages = TryApi 'me/accounts' 'fields=name,instagram_business_account'
  if ($pages -and $pages.data) {
    foreach ($pg in $pages.data) { if ($pg.instagram_business_account) { $igid = $pg.instagram_business_account.id; break } }
  }
}
if ([string]::IsNullOrWhiteSpace($igid)) { Fail "No se pudo obtener IG_USER_ID (revisa permisos/pagina vinculada o ponlo en ig-config.txt)" }

# --- Perfil ---
$prof = TryApi $igid 'fields=username,name,followers_count,follows_count,media_count,profile_picture_url,biography'
if (-not $prof) { Fail "No se pudo leer el perfil (token/permesos?)." }
$seguidores = [int]($prof.followers_count)

# --- Media (feed) ---
$mediaOut = @()
$media = TryApi "$igid/media" 'fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12'
if ($media -and $media.data) {
  foreach ($mi in $media.data) {
    $img = if ($mi.media_type -eq 'VIDEO' -and $mi.thumbnail_url) { $mi.thumbnail_url } else { $mi.media_url }
    $mediaOut += @{ id=$mi.id; caption=$mi.caption; tipo=$mi.media_type; img=$img; permalink=$mi.permalink;
                    fecha=$mi.timestamp; likes=[int]$mi.like_count; comentarios=[int]$mi.comments_count }
  }
}

# --- Insights de cuenta (28 dias) ---
$ins = @{ alcance_28d=$null; impresiones_28d=$null; visitas_perfil_28d=$null; engagement_prom=$null }
function InsValue($resp){
  if (-not $resp -or -not $resp.data -or $resp.data.Count -eq 0) { return $null }
  $d = $resp.data[0]
  if ($d.total_value -and $d.total_value.value -ne $null) { return [int]$d.total_value.value }
  if ($d.values -and $d.values.Count -gt 0) { return [int]($d.values[-1].value) }
  return $null
}
$ins.alcance_28d       = InsValue (TryApi "$igid/insights" 'metric=reach&period=days_28&metric_type=total_value')
$ins.visitas_perfil_28d= InsValue (TryApi "$igid/insights" 'metric=profile_views&period=days_28&metric_type=total_value')
$ins.impresiones_28d   = InsValue (TryApi "$igid/insights" 'metric=impressions&period=days_28&metric_type=total_value')
# Engagement promedio estimado: (likes+coment prom por post) / seguidores
if ($mediaOut.Count -gt 0 -and $seguidores -gt 0) {
  $eng = ($mediaOut | Measure-Object -Property { $_.likes + $_.comentarios } -Sum).Sum / $mediaOut.Count
  $ins.engagement_prom = [math]::Round($eng / $seguidores * 100, 1)
}

# --- Demografia / segmentacion (requiere >=100 seguidores) ---
function DemoBreakdown($breakdown){
  # API nueva: follower_demographics con breakdown; fallback a audience_* (API vieja)
  $r = TryApi "$igid/insights" "metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=$breakdown"
  $res = @()
  if ($r -and $r.data -and $r.data[0].total_value -and $r.data[0].total_value.breakdowns) {
    foreach ($it in $r.data[0].total_value.breakdowns[0].results) {
      $res += @{ label = ($it.dimension_values -join ' '); value = [double]$it.value }
    }
  }
  if ($res.Count -eq 0) {
    $legacy = @{ age='audience_gender_age'; gender='audience_gender_age'; country='audience_country'; city='audience_city' }[$breakdown]
    if ($legacy) {
      $r2 = TryApi "$igid/insights" "metric=$legacy&period=lifetime"
      if ($r2 -and $r2.data -and $r2.data[0].values) {
        $obj = $r2.data[0].values[-1].value
        foreach ($k in $obj.PSObject.Properties.Name) { $res += @{ label=$k; value=[double]$obj.$k } }
      }
    }
  }
  $tot = ($res | Measure-Object -Property value -Sum).Sum
  if ($tot -le 0) { return @() }
  return ($res | Sort-Object value -Descending | Select-Object -First 8 | ForEach-Object { @{ label=$_.label; pct=[math]::Round($_.value/$tot,4) } })
}
$demo = @{ edad=@(); genero=@(); paises=@(); ciudades=@() }
if ($seguidores -ge 100) {
  $demo.edad     = DemoBreakdown 'age'
  $demo.genero   = DemoBreakdown 'gender'
  $demo.paises   = DemoBreakdown 'country'
  $demo.ciudades = DemoBreakdown 'city'
}

# --- Escribir instagram.js ---
$data = @{
  ok = $true; generado = (Get-Date -Format 'yyyy-MM-dd HH:mm')
  perfil = @{ usuario=$prof.username; nombre=$prof.name; seguidores=$seguidores; siguiendo=[int]$prof.follows_count;
              publicaciones=[int]$prof.media_count; foto=$prof.profile_picture_url; bio=$prof.biography }
  insights = $ins
  media = $mediaOut
  demografia = $demo
}
WriteIG $data
Log "OK: perfil @$($prof.username), $seguidores seguidores, $($mediaOut.Count) posts."
Write-Output "instagram.js actualizado: @$($prof.username), $seguidores seguidores, $($mediaOut.Count) posts."
