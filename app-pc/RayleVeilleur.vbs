' Rayle Veilleur - lanceur sans fenetre de console (utilise par le raccourci de demarrage de Windows et par l'application).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
racine = fso.GetParentFolderName(dossier)
sh.CurrentDirectory = racine
sh.Run "cmd.exe /c node """ & dossier & "\veilleur\veilleur.mjs""", 0, False
