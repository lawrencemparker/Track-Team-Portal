# push-to-github.ps1
# Run this from inside your Next.js project folder.

$ErrorActionPreference = "Stop"

Write-Host "=== Track-Team-Portal GitHub Push Script ==="

if (!(Test-Path ".\package.json")) {
  Write-Host "WARNING: package.json not found in this folder."
  Write-Host "Make sure you are in your Next.js project root before running."
}

# Ensure git exists
git --version | Out-Null

# Init git if needed
if (!(Test-Path ".\.git")) {
  git init
}

# Ensure a user identity exists (commit/merge will fail without this)
$gitName = git config user.name
$gitEmail = git config user.email
if ([string]::IsNullOrWhiteSpace($gitName) -or [string]::IsNullOrWhiteSpace($gitEmail)) {
  Write-Host "Git user.name / user.email not set. Setting local defaults..."
  git config user.name "Lawrence Parker"
  git config user.email "lawrencemparker@users.noreply.github.com"
}

# Stage changes
git add -A

# Commit if there is anything to commit
$hasChanges = git status --porcelain
if ($hasChanges) {
  git commit -m "Update"
} else {
  Write-Host "No changes to commit. Continuing..."
}

# Ensure branch is main
git branch -M main

# Set remote
$remoteNames = git remote
if ($remoteNames -notcontains "origin") {
  git remote add origin https://github.com/lawrencemparker/Track-Team-Portal.git
} else {
  git remote set-url origin https://github.com/lawrencemparker/Track-Team-Portal.git
}

# Fetch remote refs
git fetch origin

# Only sync if origin/main exists
$remoteMainExists = git ls-remote --heads origin main
if ($remoteMainExists) {
  # Prefer rebase to avoid merge commits / editor prompts
  try {
    git pull --rebase origin main
  } catch {
    Write-Host "Pull --rebase failed. You may have conflicts. Run:"
    Write-Host "  git status"
    Write-Host "  git rebase --abort   (to cancel)"
    throw
  }
} else {
  Write-Host "Remote main not found yet. First push will create it."
}

# Push
git push -u origin main

Write-Host "=== Done. Repo pushed to main. ==="
