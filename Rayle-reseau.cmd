@echo off
rem Raylé avec le réseau local ouvert (téléphone, tablette) : puis ouvre connecter-telephone.html
cd /d "%~dp0"
start "" http://127.0.0.1:8000/connecter-telephone.html
node serveur.mjs --reseau
