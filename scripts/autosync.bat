@echo off
REM Madav auto-sync: stage, commit (only if there are changes), and push.
REM Runs as you, so it uses your saved GitHub credentials.
cd /d "C:\Projects\ClaudeCodeUI\Madav"

git add -A
REM Exit quietly if nothing is staged.
git diff --cached --quiet && echo [autosync] no changes && exit /b 0

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH:mm"') do set TS=%%i
git -c user.email="chaithru@gmail.com" -c user.name="Chaithrodaya Sukruth" commit -m "auto-sync %TS%"
git push origin main
echo [autosync] pushed at %TS%
