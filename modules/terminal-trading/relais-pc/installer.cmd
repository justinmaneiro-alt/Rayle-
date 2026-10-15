@echo off
rem Installe le relais PC de Raylé (double-clic). Node.js doit être installé.
chcp 65001 >nul
cd /d "%~dp0"
node installer.mjs
