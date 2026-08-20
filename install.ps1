# Submify one-command installer for Windows (PowerShell).
#
#   irm https://raw.githubusercontent.com/Raktim94/Submify/main/install.ps1 | iex
#
# Clones (or updates) Submify and starts the full stack (Postgres + API + Web + Nginx)
# via Docker Compose, with auto-generated secrets on first run (see
# scripts/Compose-Up.ps1). Re-running this script in an existing install just pulls
# latest and redeploys. Mirrors install.sh's behavior exactly — requires Docker
# Desktop and git already installed rather than auto-installing them, consistent
# with the Linux/macOS installer's own choice not to silently install system
# dependencies on your behalf.

$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:SUBMIFY_REPO_URL) { $env:SUBMIFY_REPO_URL } else { "https://github.com/Raktim94/Submify.git" }
$InstallDir = if ($env:SUBMIFY_INSTALL_DIR) { $env:SUBMIFY_INSTALL_DIR } else { "Submify" }
$Port = if ($env:SUBMIFY_PORT) { $env:SUBMIFY_PORT } else { "2512" }

function Write-Log([string] $Message) {
    Write-Host "`n[submify] $Message"
}

function Exit-WithError([string] $Message) {
    Write-Host "`n[submify] error: $Message" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Exit-WithError "git is required. Install git (https://git-scm.com/download/win) and re-run."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Exit-WithError "Docker is required: install Docker Desktop (https://docs.docker.com/desktop/install/windows-install/)."
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Exit-WithError "Docker Compose v2 plugin is required ('docker compose version' failed) — update Docker Desktop."
}

if (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) {
    Write-Log "Existing clone found at .\$InstallDir — updating."
    Push-Location $InstallDir
    git checkout -- scripts/prune-docker.sh 2>$null
    git pull --ff-only
    Pop-Location
} else {
    Write-Log "Cloning Submify into .\$InstallDir"
    git clone $RepoUrl $InstallDir
}

Set-Location $InstallDir

Write-Log "Building and starting the stack (this can take a few minutes on first run)..."
& .\scripts\Compose-Up.ps1 up --build -d

Write-Log "Submify is starting."
Write-Host "  Dashboard: http://localhost:$Port"
Write-Host "  Health:    http://localhost:$Port/api/v1/system/health"
Write-Host ""
Write-Host "Follow logs with:  cd $InstallDir; docker compose logs -f"
