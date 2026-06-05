@echo off
mode con: cols=80 lines=20
title Cliente Frontend - Porta 5173
color 0B
cd /d "%~dp0"
npm run dev
pause
