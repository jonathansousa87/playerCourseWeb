@echo off
mode con: cols=80 lines=20
title Servidor Backend - Porta 3001
color 0A
cd /d "%~dp0"
node server.js
pause
