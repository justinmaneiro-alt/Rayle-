# Rayle - lanceur de l'application PC (aucune fenetre de console : appele par Rayle.vbs).
# 1. demarre le serveur local (node serveur.mjs) s'il ne tourne pas deja ;
# 2. ouvre Rayle dans une fenetre "application" de Microsoft Edge (Chrome en secours), plein ecran, avec un profil dedie et persistant ;
# 3. attend la fermeture de la fenetre, puis arrete le serveur (seulement s'il a ete demarre ici) et les processus du profil.
# Ce fichier est en ASCII (PowerShell 5.1 lit mal l'UTF-8 sans BOM). Journal : %LOCALAPPDATA%\Rayle\lancement.log
# -Multi : lance directement le mode multi-ecrans (fenetres sur les autres ecrans ; voir docs/application-pc.md).
param([int]$Port = $(if ($env:RAYLE_PORT) { [int]$env:RAYLE_PORT } else { 8000 }), [switch]$Multi)   # RAYLE_PORT : tests seulement
$ErrorActionPreference = 'Stop'
$racine  = Split-Path -Parent $PSScriptRoot                     # dossier du projet (app-pc est un sous-dossier)
$donnees = if ($env:RAYLE_DONNEES) { $env:RAYLE_DONNEES } else { Join-Path $env:LOCALAPPDATA 'Rayle' }   # RAYLE_DONNEES : tests seulement
$url     = "http://127.0.0.1:$Port"
New-Item -ItemType Directory -Force -Path $donnees | Out-Null
$journal = Join-Path $donnees 'lancement.log'
function Note($m) { try { Add-Content -Path $journal -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) } catch {} }
function Erreur($m) { Note "ERREUR : $m"; try { Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($m, 'Rayle', 'OK', 'Error') } catch {} }
if ((Test-Path $journal) -and ((Get-Item $journal).Length -gt 200KB)) { Remove-Item $journal -Force }
Note '--- lancement ---'

function ServeurRayle {   # vrai si le serveur local repond ET sert bien Rayle
    try { $r = Invoke-WebRequest -Uri "$url/index.html" -UseBasicParsing -TimeoutSec 2; return ($r.StatusCode -eq 200 -and $r.Content -match 'RAYL') } catch { return $false }
}
function ServeurAJour {   # vrai si le serveur en marche connait le mode multi-ecrans (un serveur lance avant la mise a jour de Rayle repond 404 : il faut le redemarrer)
    try { $r = Invoke-WebRequest -Uri "$url/__multi/etat" -UseBasicParsing -TimeoutSec 3; return ($r.StatusCode -eq 200 -and $r.Content -match '"version"') } catch { return $false }
}
function ArreterServeurLocal {   # arrete le serveur Rayle (node serveur.mjs) qui ecoute sur le port, et rien d'autre
    try {
        $pidEcoute = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1 -ExpandProperty OwningProcess
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$pidEcoute"
        if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine -like '*serveur.mjs*') {
            Stop-Process -Id $pidEcoute -Force
            for ($i = 0; $i -lt 20 -and (PortOccupe); $i++) { Start-Sleep -Milliseconds 250 }
            return (-not (PortOccupe))
        }
    } catch {}
    return $false
}
function DemanderMulti {   # Rayle est deja ouvert : on lui demande d'activer le mode multi-ecrans (la page lit la demande aupres du serveur local)
    try { $r = Invoke-WebRequest -Uri "$url/__multi/demander" -Method Post -UseBasicParsing -TimeoutSec 4 -ContentType 'application/json' -Headers @{ 'X-Rayle-Multi' = '1' } -Body '{"action":"activer"}'; return ($r.StatusCode -eq 200) } catch { return $false }
}
function PortOccupe {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); return $true } catch { return $false }
}

# Navigateur : Edge d'abord (reconnaissance vocale Microsoft), Chrome en secours
$edge   = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { $nav = $edge; $profil = Join-Path $donnees 'profil-edge' } elseif ($chrome) { $nav = $chrome; $profil = Join-Path $donnees 'profil-chrome' } else { Erreur "Ni Microsoft Edge ni Google Chrome ne sont installes."; exit 1 }
Note "navigateur : $nav"

function ProcessusProfil { try { Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$profil*" } } catch { @() } }

# Instance unique : un second clic sur le raccourci ne lance rien de plus (il ramene la fenetre au premier plan).
# Si la fenetre vient d'etre fermee et que le nettoyage n'est pas fini, on attend (20 s au plus) au lieu d'ignorer le clic.
$nomVerrou = 'Local\RayleApplicationPC'; if ($Port -ne 8000) { $nomVerrou += "_$Port" }   # un autre port (tests) = un autre verrou
$mutex = New-Object System.Threading.Mutex($false, $nomVerrou)
if (-not $mutex.WaitOne(0)) {
    if (@(ProcessusProfil).Count -gt 0) {
        if ($Multi) { if (DemanderMulti) { Note 'deja lance : demande du mode multi-ecrans envoyee a la fenetre ouverte' } else { Note 'deja lance : demande du mode multi-ecrans IMPOSSIBLE (serveur ancien : fermez Rayle puis relancez le raccourci)' } }
        else { Note 'deja lance : fenetre ramenee au premier plan' }
        try { [void](New-Object -ComObject WScript.Shell).AppActivate('RAYL') } catch {}; exit 0
    }
    Note 'fermeture precedente en cours : attente'
    if (-not $mutex.WaitOne(20000)) { Note 'verrou toujours pris apres 20 s : abandon'; exit 0 }
}


# Serveur
$serveur = $null
$enMarche = ServeurRayle
if ($enMarche -and -not (ServeurAJour)) {
    Note 'serveur deja en marche mais ANCIEN (il ne connait pas le mode multi-ecrans) : redemarrage'
    if (ArreterServeurLocal) { $enMarche = $false; Note 'ancien serveur arrete' } else { Note 'ancien serveur impossible a arreter (ce n est pas serveur.mjs ?) : on continue avec lui' }
}
if ($enMarche) { Note 'serveur deja en marche (non arrete a la fermeture)' }
else {
    if (PortOccupe) { Erreur "Le port $Port est utilise par un autre programme : Rayle ne peut pas demarrer."; exit 1 }
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { $node = @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
    if (-not $node) { Erreur "Node.js est introuvable : installez-le (https://nodejs.org) puis relancez Rayle."; exit 1 }
    $env:RAYLE_DONNEES = $donnees      # le serveur retrouve ainsi le meme profil de navigateur (mode multi-ecrans)
    $serveur = Start-Process -FilePath $node -ArgumentList @('serveur.mjs', "$Port") -WorkingDirectory $racine -WindowStyle Hidden -PassThru
    Note "serveur demarre (pid $($serveur.Id))"
    $debut = Get-Date
    while (-not (ServeurRayle)) {
        if ($serveur.HasExited) { Erreur "Le serveur s'est arrete aussitot (voir $journal)."; exit 1 }
        if (((Get-Date) - $debut).TotalSeconds -gt 20) { Erreur "Le serveur ne repond pas apres 20 secondes."; try { Stop-Process -Id $serveur.Id -Force } catch {}; exit 1 }
        Start-Sleep -Milliseconds 250
    }
}

# Profil dedie : micro deja autorise pour Rayle (l'autorisation est gardee dans le profil), pas d'application en arriere-plan
$defaut = Join-Path $profil 'Default'
$prefs  = Join-Path $defaut 'Preferences'
if (-not (Test-Path $prefs)) {
    New-Item -ItemType Directory -Force -Path $defaut | Out-Null
    $json = '{"profile":{"content_settings":{"exceptions":{"media_stream_mic":{"' + $url + ',*":{"setting":1}},"notifications":{"' + $url + ',*":{"setting":2}}}}},"background_mode":{"enabled":false},"browser":{"has_seen_welcome_page":true}}'
    [System.IO.File]::WriteAllText($prefs, $json, (New-Object System.Text.UTF8Encoding($false)))
    Note 'profil cree (micro autorise pour Rayle)'
}

# Fenetre application, plein ecran (F11 pour en sortir / y revenir)
$urlApp  = if ($Multi) { "$url/?multi=1" } else { $url }
$options = @("--app=$urlApp", "--user-data-dir=$profil", '--start-fullscreen', '--no-first-run', '--no-default-browser-check', '--disable-background-mode', '--autoplay-policy=no-user-gesture-required', '--disable-features=msEdgeSidebar,Translate,msEdgeShopping')
if ($env:RAYLE_DEBUG_PORT) { $options += "--remote-debugging-port=$($env:RAYLE_DEBUG_PORT)" }   # tests seulement
$lance = Start-Process -FilePath $nav -ArgumentList $options -PassThru
Note 'fenetre ouverte'

# Attente de la fermeture : plus aucun processus du navigateur ne porte notre profil (deux constats de suite)
$vu = $false; $absent = 0
while ($true) {
    Start-Sleep -Seconds 1
    $p = @(ProcessusProfil)
    if ($p.Count -gt 0) { $vu = $true; $absent = 0 } else { $absent++ ; if ($vu -and $absent -ge 2) { break }; if (-not $vu -and $lance.HasExited -and $absent -ge 6) { Note 'fenetre fermee avant d avoir ete vue'; break }; if (-not $vu -and $absent -ge 60) { Note 'la fenetre ne s est jamais ouverte'; break } }
}
Note 'fenetre fermee'

# Nettoyage : aucun processus fantome
foreach ($x in @(ProcessusProfil)) { try { & taskkill.exe /PID $x.ProcessId /T /F 2>&1 | Out-Null } catch {} }
if ($serveur -and -not $serveur.HasExited) { try { Stop-Process -Id $serveur.Id -Force; Note "serveur arrete (pid $($serveur.Id))" } catch { Note "arret du serveur impossible : $_" } }
try { $mutex.ReleaseMutex() } catch {}
Note 'fin'
