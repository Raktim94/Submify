# Thin wrapper: optional .env.auto (strong secrets) + optional .env.
# Default: docker compose up --build -d (no script — defaults are in docker-compose.yml).
#
# First install with random secrets: .\scripts\Compose-Up.ps1 up --build -d
#
# Usage: .\scripts\Compose-Up.ps1 logs -f api

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$autoEnv = if ($env:SUBMIFY_AUTO_ENV) { $env:SUBMIFY_AUTO_ENV } else { Join-Path $Root ".env.auto" }

function New-HexSecret([int] $byteLength) {
    $bytes = New-Object byte[] $byteLength
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Ensure-AutoEnv {
    if (Test-Path -LiteralPath $autoEnv) { return }
    Write-Host "Creating $autoEnv with auto-generated secrets." -ForegroundColor Cyan
    Write-Host "Keep this file with ./data/ - new values will not match an existing database." -ForegroundColor DarkYellow
    $pg = New-HexSecret 32
    $jwt = New-HexSecret 32
    $s3 = New-HexSecret 32
    $content = @"
# Auto-generated - do not commit. Keep with ./data/

POSTGRES_PASSWORD=$pg
JWT_SECRET=$jwt
RUSTFS_ROOT_PASSWORD=$s3
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($autoEnv, $content.TrimEnd() + "`n", $utf8NoBom)
}

# Auto-create strong random secrets unless explicitly disabled.
if ($env:SUBMIFY_GENERATE_AUTO_ENV -ne "0") {
    Ensure-AutoEnv
}

$composeArgs = @("compose", "--project-directory", $Root)
if (Test-Path -LiteralPath $autoEnv) {
    $composeArgs += "--env-file"
    $composeArgs += $autoEnv
}
$dotEnv = Join-Path $Root ".env"
if (Test-Path -LiteralPath $dotEnv) {
    $composeArgs += "--env-file"
    $composeArgs += $dotEnv
}

& docker @composeArgs @args
