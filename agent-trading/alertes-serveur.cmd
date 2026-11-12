@echo off
rem Alertes Telegram des fleches (mode Direct). Demande un fichier agent-trading\.env avec TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID (jamais dans git).
cd /d "%~dp0.."
node agent-trading\alertes-serveur.mjs
pause
