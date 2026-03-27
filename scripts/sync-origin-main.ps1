#Requires -Version 5.1
# Run in normal PowerShell (Cursor agent cannot write .git/refs on this machine):
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-origin-main.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
  throw "No .git found at $repoRoot"
}
Set-Location $repoRoot

Write-Host "==> Repo: $repoRoot" -ForegroundColor Cyan

# --- 1) Commit chore: gitignore + this script + stop tracking tsbuildinfo ---
git add .gitignore scripts/sync-origin-main.ps1
git ls-files --error-unmatch tsconfig.tsbuildinfo *>$null
if ($LASTEXITCODE -eq 0) {
  git rm --cached -- tsconfig.tsbuildinfo
}
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  Write-Host '==> git commit (chore)' -ForegroundColor Cyan
  git commit -m "chore: gitignore tsbuildinfo, add sync-origin-main script"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- 2) Untracked files that would block checkout during rebase ---
$conflicts = @('list-modules.bat', 'modul-analyse.txt')
foreach ($f in $conflicts) {
  if (Test-Path $f) {
    $bak = "$f.pre-sync-bak"
    if (Test-Path $bak) { Remove-Item -Force $bak }
    Write-Host "==> Renaming conflicting untracked: $f -> $bak" -ForegroundColor Yellow
    Rename-Item -Path $f -NewName $bak
  }
}

# --- 3) Rebase onto GitHub, then push ---
Write-Host '==> git fetch origin main' -ForegroundColor Cyan
git fetch origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> git pull --rebase origin main' -ForegroundColor Cyan
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Rebase stopped. Fix conflicts, then: git add <files>; git rebase --continue; git push origin main' -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host '==> git push origin main' -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Done. Local main matches origin.' -ForegroundColor Green
foreach ($f in $conflicts) {
  $bak = "$f.pre-sync-bak"
  if (Test-Path $bak) {
    Write-Host "==> Your local copy was saved as: $bak" -ForegroundColor DarkGray
  }
}
