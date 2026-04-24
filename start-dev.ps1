# =============================================================================
# FM App — Local Development Starter
# Run from FM_Repo root:  .\start-dev.ps1
#
# What this does:
#   1. Opens SSH tunnel  localhost:5432  →  EC2 PostgreSQL (13.203.194.93:5432)
#   2. Starts backend    on  localhost:4000
#   3. Starts frontend   on  localhost:5173
#
# Mobile app (Expo) must be started separately:
#   cd mobile-app && npx expo start
# =============================================================================

$EC2_IP    = "13.203.194.93"
$EC2_USER  = "ec2-user"
# Key.pem copied here with correct permissions during first-time setup
$PEM_FILE  = "$env:USERPROFILE\fm-ec2.pem"

# ── Validate PEM file ─────────────────────────────────────────────────────────
if (-not (Test-Path $PEM_FILE)) {
    Write-Error "PEM file not found: $PEM_FILE"
    Write-Error "Run once: copy your EC2 Key.pem to $PEM_FILE with user-only read permissions."
    Write-Error "  Get-Content 'C:\path\to\Key.pem' | Set-Content '$PEM_FILE'"
    exit 1
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  FM App — Local Dev Environment" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. SSH Tunnel ─────────────────────────────────────────────────────────────
Write-Host "[1/3] Opening SSH tunnel  localhost:5432 → EC2 PostgreSQL..." -ForegroundColor Yellow

$tunnelJob = Start-Job -ScriptBlock {
    param($pem, $user, $ip)
    ssh -i $pem `
        -L 5432:localhost:5432 `
        -o StrictHostKeyChecking=no `
        -o ServerAliveInterval=60 `
        -N `
        "$user@$ip"
} -ArgumentList $PEM_FILE, $EC2_USER, $EC2_IP

# Give the tunnel a moment to establish
Start-Sleep -Seconds 3

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
Write-Host "  Mobile app: cd mobile-app && npx expo start" -ForegroundColor White
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
