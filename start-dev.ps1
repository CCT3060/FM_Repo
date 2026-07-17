# =============================================================================
# FM App - Local Development Starter
# Run from FM_Repo root:  .\start-dev.ps1
# Optionally pass PEM key: .\start-dev.ps1 -PemFile "C:\path\to\key.pem"
#
# What this does:
#   1. Opens SSH tunnel  localhost:5433  ->  EC2 PostgreSQL (3.110.166.39:5432)
#      Uses port 5433 so it never conflicts with a local PostgreSQL on 5432.
#      Auto-reconnects if the tunnel drops.
#   2. Starts backend    on  localhost:4000
#   3. Starts frontend   on  localhost:5173
# =============================================================================
param(
    [string]$PemFile = ""
)

$EC2_IP   = "3.110.166.39"
$EC2_USER = "ec2-user"

# -- Locate PEM file ----------------------------------------------------------
$candidatePaths = @(
    $PemFile,
    "$env:USERPROFILE\.ssh\Key.pem",
    "$env:USERPROFILE\.ssh\fm-ec2.pem",
    "$env:USERPROFILE\.ssh\ec2.pem",
    "$env:USERPROFILE\Downloads\Key.pem",
    "$env:USERPROFILE\Desktop\Key.pem"
)
$PEM_FILE = $candidatePaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $PEM_FILE) {
    Write-Host ""
    Write-Host "ERROR: EC2 SSH key (.pem) not found." -ForegroundColor Red
    Write-Host "  Option 1 - Copy your .pem key to: $env:USERPROFILE\.ssh\Key.pem" -ForegroundColor Cyan
    Write-Host "  Option 2 - .\start-dev.ps1 -PemFile 'C:\path\to\key.pem'" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  FM App - Local Dev Environment" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. SSH Tunnel on port 5433 (avoids conflict with local PostgreSQL) --------
Write-Host "[1/3] Opening SSH tunnel  localhost:5433 -> EC2 PostgreSQL..." -ForegroundColor Yellow

$tunnelJob = Start-Job -ScriptBlock {
    param($pem, $user, $ip)
    while ($true) {
        & ssh -i $pem `
            -L 5433:localhost:5432 `
            -o StrictHostKeyChecking=no `
            -o ServerAliveInterval=20 `
            -o ServerAliveCountMax=3 `
            -o TCPKeepAlive=yes `
            -o ExitOnForwardFailure=yes `
            -N `
            "$user@$ip"
        Start-Sleep -Seconds 2
    }
} -ArgumentList $PEM_FILE, $EC2_USER, $EC2_IP

Start-Sleep -Seconds 4

if ($tunnelJob.State -eq "Failed") {
    Write-Host "ERROR: SSH tunnel failed to start. Check your PEM file and EC2 IP." -ForegroundColor Red
    exit 1
}

Write-Host "    Tunnel running on localhost:5433 (Job ID: $($tunnelJob.Id))" -ForegroundColor Green

# -- 2. Backend ----------------------------------------------------------------
Write-Host "[2/3] Starting backend on http://localhost:4000 ..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\backend"
    node src/server.js
} -ArgumentList $PSScriptRoot

Write-Host "    Backend starting..." -ForegroundColor Green

# -- 3. Frontend ---------------------------------------------------------------
Write-Host "[3/3] Starting frontend on http://localhost:5173 ..." -ForegroundColor Yellow

$frontendJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\frontend"
    npm run dev
} -ArgumentList $PSScriptRoot

Write-Host "    Frontend starting..." -ForegroundColor Green
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend   ->  http://localhost:4000" -ForegroundColor White
Write-Host "  Frontend  ->  http://localhost:5173" -ForegroundColor White
Write-Host "  Database  ->  EC2 PostgreSQL via SSH tunnel :5433" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) {
        foreach ($job in @($backendJob, $frontendJob)) {
            $out = Receive-Job -Job $job -ErrorAction SilentlyContinue
            if ($out) { Write-Host $out }
        }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    $allJobs = @($tunnelJob, $backendJob, $frontendJob) | Where-Object { $_ -ne $null }
    Stop-Job   -Job $allJobs -ErrorAction SilentlyContinue
    Remove-Job -Job $allJobs -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
