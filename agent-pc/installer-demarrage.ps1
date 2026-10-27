# Rayle Agent - active ou retire le demarrage automatique du service de l'agent avec Windows (raccourci dans le dossier Demarrage de l'utilisateur).
# Commande : powershell -ExecutionPolicy Bypass -File agent-pc\installer-demarrage.ps1          (active)
#            powershell -ExecutionPolicy Bypass -File agent-pc\installer-demarrage.ps1 -Retirer  (retire)
#            ... -Etat   (affiche si le raccourci existe)
# ASCII uniquement (PowerShell 5.1). Rien d'autre n'est modifie.
param([switch]$Retirer, [switch]$Etat)
$ErrorActionPreference = 'Stop'
$dossierApp = $PSScriptRoot
$demarrage  = [Environment]::GetFolderPath('Startup')
$lien       = Join-Path $demarrage 'Rayle Agent.lnk'
if ($Etat)    { if (Test-Path $lien) { 'actif' } else { 'inactif' }; exit 0 }
if ($Retirer) { if (Test-Path $lien) { Remove-Item $lien -Force; 'retire' } else { 'deja retire' }; exit 0 }
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lien)
$s.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments        = '"' + (Join-Path $dossierApp 'RayleAgent.vbs') + '"'
$s.WorkingDirectory = Split-Path -Parent $dossierApp
$s.Description      = 'Rayle Agent : agent de marche en arriere-plan'
$s.WindowStyle      = 7
$s.Save()
'active'
