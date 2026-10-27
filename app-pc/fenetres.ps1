# Rayle - gestion des fenetres et des ecrans (mode multi-ecrans). Appele par app-pc/multi-ecrans.mjs ; ne fait RIEN d'autre.
# Ce fichier est en ASCII (PowerShell 5.1 lit mal l'UTF-8 sans BOM). La sortie est une ligne JSON.
# Actions :
#   ecrans                                  liste des ecrans (position et taille en pixels reels), plus l'ecran de la fenetre principale de Rayle
#   fenetres -Profil P                      fenetres visibles du navigateur de Rayle (profil dedie P)
#   placer   -Profil P -Marque M -X -Y -W -H   attend la fenetre dont le titre contient M, la place sur l'ecran, sans bordure (comme un plein ecran)
#   fermer   -Profil P [-Marque M | -Tout]  ferme proprement (WM_CLOSE : la fenetre se ferme comme avec la croix) les fenetres dont le titre contient M, ou toutes celles du profil
# Les fenetres qui ne sont PAS du profil de Rayle ne sont jamais touchees.
param(
    [Parameter(Mandatory = $true)][ValidateSet('ecrans', 'fenetres', 'placer', 'fermer', 'contexte')][string]$Action,
    [string]$Profil = '', [string]$Marque = '', [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0, [switch]$Tout, [int]$Attente = 20
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Fen {
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    // une ligne par fenetre : handle \t pid \t x \t y \t largeur \t hauteur \t titre   (fenetres visibles de la famille Chromium appartenant a l'un des processus donnes)
    public static string[] Lister(uint[] pids) {
        var set = new HashSet<uint>(pids); var res = new List<string>();
        EnumWindows(delegate (IntPtr h, IntPtr p) {
            if (!IsWindowVisible(h)) return true;
            uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
            var cl = new StringBuilder(64); GetClassName(h, cl, 64); if (cl.ToString() != "Chrome_WidgetWin_1") return true;
            var t = new StringBuilder(300); GetWindowText(h, t, 300); if (t.Length == 0) return true;
            RECT r; GetWindowRect(h, out r);
            res.Add(h.ToInt64() + "\t" + pid + "\t" + r.L + "\t" + r.T + "\t" + (r.R - r.L) + "\t" + (r.B - r.T) + "\t" + t.ToString());
            return true;
        }, IntPtr.Zero);
        return res.ToArray();
    }
    // sans bordure ni barre de titre, a la position et a la taille de l'ecran
    public static void Placer(long handle, int x, int y, int w, int h) {
        IntPtr hw = new IntPtr(handle);
        ShowWindow(hw, 9);                                   // SW_RESTORE : sort d'un eventuel plein ecran / agrandissement
        int style = GetWindowLong(hw, -16);
        style &= ~(0x00C00000 | 0x00040000 | 0x00010000 | 0x00020000);   // WS_CAPTION, WS_THICKFRAME, WS_MAXIMIZEBOX, WS_MINIMIZEBOX
        SetWindowLong(hw, -16, style);
        SetWindowPos(hw, IntPtr.Zero, x, y, w, h, 0x0020 | 0x0040 | 0x0004);   // SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOZORDER
    }
    public static void Fermer(long handle) { PostMessage(new IntPtr(handle), 0x0010, IntPtr.Zero, IntPtr.Zero); }   // WM_CLOSE
}
'@
[void][Fen]::SetProcessDPIAware()    # coordonnees en pixels reels, quelle que soit la mise a l'echelle de Windows

# Processus du navigateur : ceux du profil donne (-Profil), ou, sans profil, TOUS ceux d'Edge et de Chrome (navigateur normal : les fenetres de Rayle sont alors
# reperees par leur titre, jamais par le processus ; une fenetre qui n'est pas Rayle n'est jamais fermee ni deplacee).
function PidsProfil {
    $l = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { (-not $Profil) -or ($_.CommandLine -and $_.CommandLine -like "*$Profil*") } | ForEach-Object { [uint32]$_.ProcessId })
    return [uint32[]]$l
}
function Fenetres {
    $pids = PidsProfil
    if ($pids.Count -eq 0) { return @() }
    $sortie = @()
    foreach ($ligne in [Fen]::Lister($pids)) {
        $c = $ligne.Split("`t", 7)
        $sortie += [pscustomobject]@{ handle = [int64]$c[0]; pid = [int]$c[1]; x = [int]$c[2]; y = [int]$c[3]; w = [int]$c[4]; h = [int]$c[5]; titre = $c[6] }
    }
    return $sortie
}
function Sortie($objet) { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Write-Output (ConvertTo-Json -InputObject $objet -Compress -Depth 5) }

switch ($Action) {
    'ecrans' {
        Add-Type -AssemblyName System.Windows.Forms
        $liste = @()
        foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
            $m = [regex]::Match($s.DeviceName, '(\d+)\s*$'); $n = if ($m.Success) { [int]$m.Groups[1].Value } else { $liste.Count + 1 }
            $liste += [pscustomobject]@{ id = $s.DeviceName; numero = $n; x = $s.Bounds.X; y = $s.Bounds.Y; w = $s.Bounds.Width; h = $s.Bounds.Height; primaire = [bool]$s.Primary }
        }
        # ecran de la fenetre principale de Rayle (titre commencant par RAYL, jamais un satellite)
        $principal = $null
        foreach ($f in @(Fenetres)) {
            if ($f.titre.StartsWith('RAYL') -and -not $f.titre.Contains('[rayle-sat-')) {
                $cx = $f.x + $f.w / 2; $cy = $f.y + $f.h / 2
                foreach ($e in $liste) { if ($cx -ge $e.x -and $cx -lt $e.x + $e.w -and $cy -ge $e.y -and $cy -lt $e.y + $e.h) { $principal = $e.id } }
            }
        }
        Sortie @{ ok = $true; ecrans = @($liste); principal = $principal }
    }
    'fenetres' { Sortie @{ ok = $true; fenetres = @(Fenetres) } }
    'contexte' {
        # Dans quel navigateur tourne la fenetre PRINCIPALE de Rayle ? (application Edge « --app », ou onglet d'un navigateur normal) : les satellites doivent s'ouvrir dans le MEME profil,
        # sinon les fenetres ne peuvent pas se parler (BroadcastChannel et stockage sont propres a chaque profil).
        $procs = @{}
        foreach ($q in @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'")) { $procs[[int]$q.ProcessId] = $q }
        $principale = @(Fenetres) | Where-Object { $_.titre.StartsWith('RAYL') -and -not $_.titre.Contains('[rayle-sat-') } | Select-Object -First 1
        if (-not $principale -or -not $procs.ContainsKey([int]$principale.pid)) { Sortie @{ ok = $true; trouve = $false }; break }
        $q = $procs[[int]$principale.pid]; $cmd = [string]$q.CommandLine
        $dir = $null; $m = [regex]::Match($cmd, '--user-data-dir=(?:"([^"]+)"|(\S+))'); if ($m.Success) { $dir = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value } }
        $prof = $null; $m = [regex]::Match($cmd, '--profile-directory=(?:"([^"]+)"|(\S+))'); if ($m.Success) { $prof = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value } }
        Sortie @{ ok = $true; trouve = $true; exe = [string]$q.ExecutablePath; userDataDir = $dir; profileDirectory = $prof; application = [bool]($cmd -match '--app='); pid = [int]$principale.pid; titre = $principale.titre }
    }
    'placer' {
        if (-not $Marque -or $W -le 0 -or $H -le 0) { Sortie @{ ok = $false; erreur = 'marque ou taille manquante' }; break }
        $fin = (Get-Date).AddSeconds($Attente); $trouve = $null
        while ((Get-Date) -lt $fin) {
            $trouve = @(Fenetres) | Where-Object { $_.titre.Contains($Marque) } | Select-Object -First 1
            if ($trouve) { break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $trouve) { Sortie @{ ok = $false; erreur = 'fenetre introuvable' }; break }
        Start-Sleep -Milliseconds 400                      # laisse la fenetre finir de s'afficher avant de la deplacer
        # le navigateur peut retoucher la taille de sa fenetre juste apres (fenetre qui finit de s'afficher) ; Windows peut aussi garder 1 pixel pour une barre des taches masquee :
        # on replace, puis on s'arrete quand la taille ne bouge plus (deux lectures identiques de suite)
        $stable = 0; $apres = $null; $avant = ''
        for ($i = 0; $i -lt 10 -and $stable -lt 2; $i++) {
            [Fen]::Placer($trouve.handle, $X, $Y, $W, $H)
            Start-Sleep -Milliseconds 350
            $apres = @(Fenetres) | Where-Object { $_.handle -eq $trouve.handle } | Select-Object -First 1
            $lu = if ($apres) { "$($apres.x),$($apres.y),$($apres.w),$($apres.h)" } else { '' }
            if ($lu -ne '' -and $lu -eq $avant) { $stable++ } else { $stable = 0 }
            $avant = $lu
        }
        Sortie @{ ok = $true; handle = $trouve.handle; x = $apres.x; y = $apres.y; w = $apres.w; h = $apres.h }
    }
    'fermer' {
        if (-not $Tout -and -not $Marque) { Sortie @{ ok = $false; erreur = 'marque ou -Tout requis' }; break }
        # -Tout : toutes les fenetres du profil de Rayle ; sans profil (navigateur normal), seulement les fenetres de Rayle elles-memes (titre « RAYL… » ou satellite)
        $cibles = @(Fenetres) | Where-Object { ($Tout -and ($Profil -or $_.titre.StartsWith('RAYL') -or $_.titre.Contains('[rayle-sat-'))) -or ((-not $Tout) -and $_.titre.Contains($Marque)) }
        foreach ($f in $cibles) { [Fen]::Fermer($f.handle) }
        Sortie @{ ok = $true; fermees = @($cibles | ForEach-Object { $_.titre }) }
    }
}
