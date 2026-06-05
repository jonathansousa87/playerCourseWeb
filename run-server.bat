@echo off
mode con: cols=80 lines=20
title Servidor Backend - Porta 3001
color 0A
cd /d "%~dp0"
REM --use-system-ca: confia na CA raiz do Windows. Necessario atras de proxy
REM corporativo que intercepta TLS (refaz os certificados HTTPS). Sem isso o
REM Node nao consegue buscar o JWKS do Supabase (SELF_SIGNED_CERT_IN_CHAIN) e
REM a validacao de token falha com 401 em todas as rotas /api.
node --use-system-ca server.js
pause
