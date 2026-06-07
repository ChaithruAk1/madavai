# BrainEdge — auto-sync to git.
# Commits and pushes any pending changes. Designed to be run on a schedule (e.g. every 30 min).
# One-time setup (run in PowerShell, as your user):
#   schtasks /Create /SC MINUTE /MO 30 /TN "BrainEdge AutoSync" ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Projects\ClaudeCodeUI\BrainEdge\git-autosync.ps1\"" /F
# Remove later with:  schtasks /Delete /TN "BrainEdge AutoSync" /F

param([string]$Repo = "C:\Projects\ClaudeCodeUI\BrainEdge")

Set-Location $Repo

# Nothing to do if the working tree is clean.
$changes = git status --porcelain
if (-not $changes) {
    Write-Host "$(Get-Date -Format u)  nothing to commit"
    exit 0
}

git add -A
git commit -m ("auto-sync: " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
git push
Write-Host "$(Get-Date -Format u)  synced"
