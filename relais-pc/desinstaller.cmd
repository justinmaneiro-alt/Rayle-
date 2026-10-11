@echo off
rem Désinstalle le relais PC de Raylé (double-clic).
chcp 65001 >nul
cd /d "%~dp0"
node desinstaller.mjs
