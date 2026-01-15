# push-to-github.ps1
# Run this from inside your Next.js project folder.

$ErrorActionPreference = "Stop"

Write-Host "=== Track-Team-Portal GitHub Push Script ==="

# Confirm we're in the right folder
if (!(Test-Path ".\package.json")) {
  Write-Host "WARNING: package.json not found in this folder."
  Write-Host "Make sure you are in your Next.js project root before running."
}

# Initialize git only if needed
if (!(Test-Path ".\.git")) {
  git init
}

# Stage + commit (commit will fail if nothing changed; that's OK)
git add -A
try {
  git commit -m "Initial commit"
} catch {
  Write-Host "No new changes to commit (or commit already exists). Continuing..."
}

# Ensure branch is main
git branch -M main

# Add remote if missing
$remoteCheck = git remote 2>$null
if ($remoteCheck -notcontains "origin") {
  git remote add origin https://github.com/lawrencemparker/Track-Team-Portal.git
} else {
  git remote set-url origin https://github.com/lawrencemparker/Track-Team-Portal.git
}

# Sync with existing repo (if it has commits like README)
git fetch origin
try {
  git pull origin main --allow-unrelated-histories
} catch {
  Write-Host "Pull failed (possibly no remote main yet). Continuing to push..."
}

# Push to main
git push -u origin main

Write-Host "=== Done. Repo pushed to main. ==="
