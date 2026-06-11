@echo off
rem Madav QA Console — double-click to open the external testing dashboard.
cd /d "%~dp0"
node scripts/qa-external-ui.mjs
pause
