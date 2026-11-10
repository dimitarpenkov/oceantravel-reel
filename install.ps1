# Installs the oceantravel-reel skill for Codex (Windows).
$ErrorActionPreference = "Stop"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$Dest = Join-Path $CodexHome "skills\oceantravel-reel"
$Dict = Join-Path $Dest "references\stress-bg.json"
$Keep = "$Dict.keep"

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
if (Test-Path $Dict) { Copy-Item $Dict $Keep -Force }
Copy-Item -Path (Join-Path $Src "*") -Destination $Dest -Recurse -Force
if (Test-Path $Keep) {
  node (Join-Path $Dest "scripts\merge-dict.mjs") $Dict $Keep
  Remove-Item $Keep
}
Remove-Item -ErrorAction SilentlyContinue (Join-Path $Dest "install.sh"), (Join-Path $Dest "install.ps1")

New-Item -ItemType Directory -Force -Path (Join-Path $HOME "OceanTravel-videos"), (Join-Path $HOME ".ocean-video") | Out-Null
$Cfg = Join-Path $HOME ".ocean-video\config.env"
if (-not (Test-Path $Cfg)) {
  @"
# Ключове за видеата на Ocean Travel. Попълни след "=" без кавички.
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=M1ydWt7KnBCiuv4CnEDC
POSTFORME_API_KEY=
POSTFORME_ACCOUNTS=
PEXELS_API_KEY=
HF_API_KEY_ID=
HF_API_KEY_SECRET=
"@ | Set-Content -Encoding UTF8 $Cfg
}

Write-Host "Skill: $Dest"
Write-Host "Видеата: $(Join-Path $HOME 'OceanTravel-videos')"
Write-Host "Ключове: $Cfg  <- попълни го"
node (Join-Path $Dest "scripts\doctor.mjs")
