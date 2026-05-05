# =============================================================================
# FM App — Local Development Starter
# Run from FM_Repo root:  .\start-dev.ps1
#
# What this does:
#   1. Opens SSH tunnel  localhost:5432  →  EC2 PostgreSQL (3.110.166.39:5432)
#      and auto-reconnects if it drops
#   2. Starts backend    on  localhost:4000
#   3. Starts frontend   on  localhost:5173
#
# Mobile app (Expo Go via tunnel QR) must be started separately:
#   cd mobile-app-v2 && npx expo start
# =============================================================================

$EC2_IP    = "3.110.166.39"
$EC2_USER  = "ec2-user"
$PEM_FILE  = "$env:USERPROFILE\.ssh\Key.pem"

# ── Validate PEM file ─────────────────────────────────────────────────────────
if (-not (Test-Path $PEM_FILE)) {
    Write-Error "PEM file not found: $PEM_FILE"
    Write-Error "Expected key at: $PEM_FILE"
    exit 1
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  FM App — Local Dev Environment" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. SSH Tunnel (auto-reconnect loop) ───────────────────────────────────────
Write-Host "[1/3] Opening SSH tunnel  localhost:5432 → EC2 PostgreSQL..." -ForegroundColor Yellow

$tunnelJob = Start-Job -ScriptBlock {
    param($pem, $user, $ip)
    while ($true) {
        & ssh -i $pem `
            -L 5432:localhost:5432 `
            -o StrictHostKeyChecking=no `
            -o ServerAliveInterval=20 `
            -o ServerAliveCountMax=3 `
            -o TCPKeepAlive=yes `
            -o ExitOnForwardFailure=yes `
            -N `
            "$user@$ip"
        # Tunnel dropped — wait 2s then reconnect automatically
        Start-Sleep -Seconds 2
    }
} -ArgumentList $PEM_FILE, $EC2_USER, $EC2_IP

# Give the tunnel a moment to establish
Start-Sleep -Seconds 4

if ($tunnelJob.State -eq "Failed") {
    Write-Error "SSH tunnel failed to start. Check your PEM file and EC2 IP."
    exit 1
}

Write-Host "    Tunnel running (Job ID: $($tunnelJob.Id))" -ForegroundColor Green

# ── 2. Backend ────────────────────────────────────────────────────────────────
Write-Host "[2/3] Starting backend on http://localhost:4000 ..." -ForegroundColor Yellow

$backendJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\backend"
    node src/server.js
} -ArgumentList $PSScriptRoot

Write-Host "    Backend starting..." -ForegroundColor Green

# ── 3. Frontend ───────────────────────────────────────────────────────────────
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
Write-Host "  Backend   →  http://localhost:4000" -ForegroundColor White
Write-Host "  Frontend  →  http://localhost:5173" -ForegroundColor White
Write-Host "  Database  →  EC2 PostgreSQL (via SSH tunnel)" -ForegroundColor White
Write-Host ""
Write-Host "  Mobile app: cd mobile-app && npm run start" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ── Keep alive — stream logs from all jobs until Ctrl+C ──────────────────────
try {
    while ($true) {
        foreach ($job in @($backendJob, $frontendJob)) {
            $output = Receive-Job -Job $job -ErrorAction SilentlyContinue
            if ($output) { Write-Host $output }
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ""
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    Stop-Job    -Job $tunnelJob, $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job  -Job $tunnelJob, $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
