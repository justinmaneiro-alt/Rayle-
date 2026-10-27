' Rayle - lanceur sans fenetre de console (double-clic ou raccourci). Appelle lancer-rayle.ps1 en arriere-plan.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dossier & "\lancer-rayle.ps1""", 0, False
