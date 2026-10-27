# Rayle Veilleur - active ou retire le demarrage automatique avec Windows (raccourci dans le dossier Demarrage de l'utilisateur).
# Commande : powershell -ExecutionPolicy Bypass -File app-pc\veilleur\installer-demarrage.ps1          (active)
#            powershell -ExecutionPolicy Bypass -File app-pc\veilleur\installer-demarrage.ps1 -Retirer  (retire)
#            ... -Etat   (affiche si le raccourci existe)
# ASCII uniquement (PowerShell 5.1). Rien d'autre n'est modifie.
param([switch]$Retirer, [switch]$Etat)
$ErrorActionPreference = 'Stop'
$dossierApp = Split-Path -Parent $PSScriptRoot
$demarrage  = [Environment]::GetFolderPath('Startup')
$lien       = Join-Path $demarrage 'Rayle Veilleur.lnk'
if ($Etat)    { if (Test-Path $lien) { 'actif' } else { 'inactif' }; exit 0 }
if ($Retirer) { if (Test-Path $lien) { Remove-Item $lien -Force; 'retire' } else { 'deja retire' }; exit 0 }
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lien)
$s.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments        = '"' + (Join-Path $dossierApp 'RayleVeilleur.vbs') + '"'
$s.WorkingDirectory = Split-Path -Parent $dossierApp
$s.Description      = 'Rayle Veilleur : alertes Bitcoin en arriere-plan'
$s.WindowStyle      = 7
$s.Save()
'active'
