# Fabrique un certificat HTTPS AUTO-SIGNE pour la page « Camera Rayle » du telephone (le navigateur exige une page HTTPS pour ouvrir la camera).
# Le certificat n'est valable que pour le reseau local, il est ecrit dans un fichier .pfx (dossier de donnees de Rayle) et retire du magasin de Windows aussitot apres.
# Ce fichier est ASCII seulement (PowerShell sans console). Appel : powershell -ExecutionPolicy Bypass -File certificat-lan.ps1 -Ip 192.168.1.20 -Sortie C:\...\camera-lan.pfx -Mdp motdepasse
param([string]$Ip = '', [Parameter(Mandatory = $true)][string]$Sortie, [Parameter(Mandatory = $true)][string]$Mdp)
$ErrorActionPreference = 'Stop'
$ext = 'DNS=rayle.local&DNS=localhost'
if ($Ip -ne '') { $ext = $ext + '&IPAddress=' + $Ip }
$c = New-SelfSignedCertificate -Subject 'CN=rayle.local' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(2) -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 -FriendlyName 'Rayle LAN (camera du telephone)' -TextExtension @('2.5.29.17={text}' + $ext)
try {
  $mdpSecure = ConvertTo-SecureString -String $Mdp -AsPlainText -Force
  Export-PfxCertificate -Cert $c -FilePath $Sortie -Password $mdpSecure | Out-Null
} finally {
  Remove-Item -Path ('Cert:\CurrentUser\My\' + $c.Thumbprint) -Force -ErrorAction SilentlyContinue
}
Write-Output 'ok'
