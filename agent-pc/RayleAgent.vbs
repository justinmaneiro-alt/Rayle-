' Rayle Agent - lanceur sans fenetre de console du service de l'agent (utilise par le raccourci de demarrage de Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
racine = fso.GetParentFolderName(dossier)
sh.CurrentDirectory = racine
sh.Run "cmd.exe /c node """ & dossier & "\service.mjs""", 0, False
