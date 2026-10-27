# Rayle - installe le modele vocal francais LOCAL (Vosk, licence Apache-2.0, environ 41 Mo) pour reconnaitre le mot "Rayle" en veille SANS envoyer le son sur Internet.
# A lancer une seule fois :  powershell -ExecutionPolicy Bypass -File app-pc\installer-voix-locale.ps1
# Le fichier est range dans core\voice\vendor\modele-fr.tar.gz (ignore par git : il n'est jamais publie). ASCII seulement.
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cible = Join-Path $racine 'core\voice\vendor\modele-fr.tar.gz'
if (Test-Path $cible) { Write-Host "Le modele est deja installe : $cible"; exit 0 }
$tmp = Join-Path $env:TEMP ('rayle-vosk-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'modele.zip'
  Write-Host 'Telechargement du modele (environ 41 Mo)...'
  Invoke-WebRequest -Uri 'https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip' -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  if (-not (Test-Path (Join-Path $tmp 'vosk-model-small-fr-0.22\am\final.mdl'))) { throw 'archive inattendue : am\final.mdl introuvable' }
  & tar.exe -czf $cible -C $tmp 'vosk-model-small-fr-0.22'
  if ($LASTEXITCODE -ne 0) { throw 'tar.exe a echoue' }
  Write-Host "Modele installe : $cible"
  Write-Host 'Relance Rayle : la veille reconnaitra le mot "Rayle" sur ce PC.'
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
