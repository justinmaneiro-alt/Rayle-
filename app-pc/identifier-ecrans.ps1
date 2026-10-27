# Rayle - « identifier les ecrans » : un grand numero s'affiche quelques secondes sur chaque ecran (comme Windows).
# Les numeros sont ceux de Windows (Parametres > Affichage). Marche meme si le mode multi-ecrans est coupe. ASCII (PowerShell 5.1).
param([int]$Duree = 3)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[void][Dpi]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$formes = @()
$i = 0
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
    $i++
    $m = [regex]::Match($s.DeviceName, '(\d+)\s*$'); $n = if ($m.Success) { $m.Groups[1].Value } else { "$i" }
    $f = New-Object System.Windows.Forms.Form
    $f.FormBorderStyle = 'None'; $f.StartPosition = 'Manual'; $f.ShowInTaskbar = $false; $f.TopMost = $true
    $f.BackColor = [System.Drawing.Color]::FromArgb(3, 1, 6); $f.Opacity = 0.92
    $cote = [int]([Math]::Min($s.Bounds.Width, $s.Bounds.Height) * 0.55)
    $f.Bounds = New-Object System.Drawing.Rectangle(($s.Bounds.X + [int](($s.Bounds.Width - $cote) / 2)), ($s.Bounds.Y + [int](($s.Bounds.Height - $cote) / 2)), $cote, $cote)
    $e = New-Object System.Windows.Forms.Label
    $e.Dock = 'Fill'; $e.TextAlign = 'MiddleCenter'; $e.ForeColor = [System.Drawing.Color]::FromArgb(77, 227, 255)
    $e.Font = New-Object System.Drawing.Font('Segoe UI', [single]($cote * 0.42 * 0.72), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $e.Text = $n
    $p = New-Object System.Windows.Forms.Label
    $p.Dock = 'Bottom'; $p.Height = [int]($cote * 0.14); $p.TextAlign = 'MiddleCenter'; $p.ForeColor = [System.Drawing.Color]::FromArgb(255, 179, 217)
    $p.Font = New-Object System.Drawing.Font('Segoe UI', [single]($cote * 0.055), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $p.Text = ("ECRAN {0}  -  {1} x {2}" -f $n, $s.Bounds.Width, $s.Bounds.Height) + $(if ($s.Primary) { '  -  principal' } else { '' })
    $f.Controls.Add($e); $f.Controls.Add($p)
    $formes += $f
}
$minuteur = New-Object System.Windows.Forms.Timer
$minuteur.Interval = [Math]::Max(1, $Duree) * 1000
$minuteur.Add_Tick({ $minuteur.Stop(); foreach ($f in $formes) { $f.Close() }; [System.Windows.Forms.Application]::ExitThread() })
foreach ($f in $formes) { $f.Show() }
$minuteur.Start()
[System.Windows.Forms.Application]::Run()
foreach ($f in $formes) { $f.Dispose() }
