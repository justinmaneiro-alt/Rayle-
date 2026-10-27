# Rayle - cree les raccourcis "Rayle" et "Rayle Multi-ecrans" (Bureau et menu Demarrer) avec l'icone du neurone. A relancer si le dossier du projet change de place.
# "Rayle" : un seul ecran (inchange). "Rayle Multi-ecrans" : lance directement le mode multi-ecrans.
# Commande : powershell -ExecutionPolicy Bypass -File app-pc\installer-raccourcis.ps1     (ou : -Retirer pour supprimer les raccourcis)
# ASCII uniquement (PowerShell 5.1).
param([switch]$Retirer)
$ErrorActionPreference = 'Stop'
$ici     = $PSScriptRoot
$donnees = Join-Path $env:LOCALAPPDATA 'Rayle'
$bureau  = [Environment]::GetFolderPath('Desktop')
$menu    = Join-Path ([Environment]::GetFolderPath('Programs')) ''
$nomMulti = 'Rayle Multi-' + [char]0x00E9 + 'crans'
$liens   = @(
    @{ chemin = (Join-Path $bureau 'Rayle.lnk');            vbs = 'Rayle.vbs';      desc = 'Rayle' },
    @{ chemin = (Join-Path $menu 'Rayle.lnk');              vbs = 'Rayle.vbs';      desc = 'Rayle' },
    @{ chemin = (Join-Path $bureau "$nomMulti.lnk");        vbs = 'RayleMulti.vbs'; desc = 'Rayle : mode multi-ecrans' },
    @{ chemin = (Join-Path $menu "$nomMulti.lnk");          vbs = 'RayleMulti.vbs'; desc = 'Rayle : mode multi-ecrans' }
)
if ($Retirer) { foreach ($x in $liens) { if (Test-Path $x.chemin) { Remove-Item $x.chemin -Force; "supprime : $($x.chemin)" } }; exit 0 }
New-Item -ItemType Directory -Force -Path $donnees | Out-Null
$ico = Join-Path $donnees 'rayle.ico'                         # copie locale : l'icone reste lisible meme si OneDrive est hors ligne
Copy-Item (Join-Path $ici 'rayle.ico') $ico -Force
$sh = New-Object -ComObject WScript.Shell
foreach ($x in $liens) {
    $s = $sh.CreateShortcut($x.chemin)
    $s.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
    $s.Arguments        = '"' + (Join-Path $ici $x.vbs) + '"'
    $s.WorkingDirectory = Split-Path -Parent $ici
    $s.IconLocation     = $ico + ',0'
    $s.Description      = $x.desc
    $s.WindowStyle      = 7
    $s.Save()
    "cree : $($x.chemin)"
}
