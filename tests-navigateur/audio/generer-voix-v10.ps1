# v10 : enregistrements de test avec la voix francaise de Windows (Hortense). ASCII seulement.
Add-Type -AssemblyName System.Speech
$e = [char]0xE9; $dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Hortense Desktop')
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$phrases = [ordered]@{
  'rayle-point-or' = "Rayl$e, fais-moi un point sur l'or"
  'rail-gare'      = "Le rail de la gare est en panne depuis ce matin"
  'reel'           = "C'est r$($e)el, regarde, c'est un vrai probl$($e)me"
  'rayle-stop'     = "Rayl$e, stop"
  'rayle-pause'    = "Rayl$e, mets-toi en pause"
  'rayle-reprends' = "Rayl$e, reprends"
  'rayle-h4'       = "Rayl$e, et en H quatre ?"
}
foreach ($k in $phrases.Keys) {
  $f = Join-Path $dir ($k + '.wav')
  $s.SetOutputToWaveFile($f, $fmt); $s.Speak($phrases[$k]); $s.SetOutputToNull()
  Write-Host $k (Get-Item $f).Length
}
