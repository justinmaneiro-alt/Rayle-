# Genere des enregistrements de test avec la voix francaise de Windows (Hortense). ASCII seulement (les accents sont construits).
Add-Type -AssemblyName System.Speech
$e = [char]0xE9; $dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Hortense Desktop')
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$phrases = @{
  'rayle'        = "Rayl$e"
  'he-rayle'     = "H$e Rayl$e"
  'rayle-heure'  = "Rayl$e, quelle heure est-il ?"
  'conversation' = "Bonjour, il fait beau aujourd'hui, je vais me promener dans le parc avec ma s${e}ur."
  'rallye'       = "Le rallye de Monte-Carlo commence demain matin, c'est un grand $e$([char]0xE9)v$([char]0xE9)nement."
  'coupe-micro'  = "Rayl$e, coupe le micro"
  'veille'       = "Rayl$e, mets-toi en veille"
}
foreach ($k in $phrases.Keys) {
  $f = Join-Path $dir ($k + '.wav')
  $s.SetOutputToWaveFile($f, $fmt); $s.Speak($phrases[$k]); $s.SetOutputToNull()
  Write-Host $k (Get-Item $f).Length
}
