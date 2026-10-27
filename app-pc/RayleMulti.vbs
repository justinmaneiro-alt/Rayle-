' Rayle Multi-ecrans - lanceur sans fenetre de console : demarre Rayle ET le mode multi-ecrans (fenetres sur les autres ecrans).
' Le raccourci "Rayle" (Rayle.vbs) reste inchange : un seul ecran.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dossier & "\lancer-rayle.ps1"" -Multi", 0, False
