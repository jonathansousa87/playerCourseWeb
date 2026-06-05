@echo off
cd /d "%~dp0"

REM Inicia uma nova janela do Terminal do Windows com a primeira aba (Servidor)
REM e, em seguida, adiciona uma segunda aba (Cliente) na mesma janela.
wt.exe --profile "Command Prompt" --title "Servidor" cmd /k "%~dp0run-server.bat" ; new-tab --profile "Command Prompt" --title "Cliente" cmd /k "%~dp0run-client.bat"

echo.
echo Servidor e cliente iniciados em abas!