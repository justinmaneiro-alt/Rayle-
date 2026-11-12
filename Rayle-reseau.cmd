@echo off
rem Raylé avec le réseau local ouvert (téléphone, tablette) : puis ouvre connecter-telephone.html
cd /d "%~dp0"
start "" http://127.0.0.1:8000/connecter-telephone.html
rem Option : alertes Telegram des fleches (necessite agent-trading\.env), lancees dans une autre fenetre si tu reponds O dans les 5 s
choice /c ON /d N /t 5 /m "Lancer aussi les alertes Telegram des fleches"
if errorlevel 2 goto suite
start "Alertes fleches" cmd /c agent-trading\alertes-serveur.cmd
:suite
node serveur.mjs --reseau
