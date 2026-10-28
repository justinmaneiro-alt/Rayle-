param([int]$Parent = 0)
# Anti-veille Windows pour l'enregistreur du carnet : demande "systeme requis" (le PC ne se met pas en veille) tant que le processus parent vit.
# L'ecran peut s'eteindre normalement. Quand le parent s'arrete, on rend la main (ES_CONTINUOUS seul).
Add-Type -Namespace Rayle -Name Veille -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
while ($true) {
  if ($Parent -gt 0 -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { [void][Rayle.Veille]::SetThreadExecutionState([uint32]2147483648); break }
  [void][Rayle.Veille]::SetThreadExecutionState([uint32]2147483649)
  Start-Sleep -Seconds 30
}
