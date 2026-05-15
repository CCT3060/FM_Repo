# =============================================================================
# FM App — SSH Tunnel (auto-reconnect)
# Run from anywhere:  .\tunnel.ps1
# Optionally pass your key path: .\tunnel.ps1 -PemFile "C:\path\to\key.pem"
# Keeps localhost:5432 → EC2 PostgreSQL alive. Auto-reconnects on drop.
# Press Ctrl+C to stop.
# =============================================================================
param(
    [string]$PemFile = ""
)

$EC2_IP   = "3.110.166.39"
$EC2_USER = "ec2-user"

# --- Locate PEM file ---------------------------------------------------------
$candidatePaths = @(
    $PemFile,                                              # explicit arg
    "$env:USERPROFILE\.ssh\Key.pem",                       # default location
    "$env:USERPROFILE\.ssh\fm-ec2.pem",                    # common alt name
    "$env:USERPROFILE\.ssh\ec2.pem",                       # common alt name
    "$env:USERPROFILE\Downloads\Key.pem",                  # fresh download
    "$env:USERPROFILE\Desktop\Key.pem"                     # desktop
)

$PEM_FILE = $candidatePaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $PEM_FILE) {
    Write-Host ""
    Write-Host "ERROR: EC2 SSH key (.pem) not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix, do ONE of the following:" -ForegroundColor Yellow
    Write-Host "  Option 1 — Copy your .pem key to the default location:" -ForegroundColor Cyan
    Write-Host "             $env:USERPROFILE\.ssh\Key.pem" -ForegroundColor White
    Write-Host "             (create the .ssh folder if it doesn't exist)"
    Write-Host ""
    Write-Host "  Option 2 — Pass the path directly:" -ForegroundColor Cyan
    Write-Host "             .\tunnel.ps1 -PemFile `"C:\full\path\to\your-key.pem`"" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "SSH tunnel  localhost:5432 → EC2 ($EC2_IP)  [auto-reconnect ON]" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

$attempt = 0
while ($true) {
    $attempt++
    if ($attempt -gt 1) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Reconnecting (attempt $attempt)..." -ForegroundColor Yellow
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Connecting..." -ForegroundColor Yellow
    }

    & ssh -i $PEM_FILE `
        -L 5432:localhost:5432 `
        -o StrictHostKeyChecking=no `
        -o ServerAliveInterval=20 `
        -o ServerAliveCountMax=3 `
        -o TCPKeepAlive=yes `
        -o ExitOnForwardFailure=yes `
        -N `
        "$EC2_USER@$EC2_IP"

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel dropped. Retrying in 2s..." -ForegroundColor Red
    Start-Sleep -Seconds 2
}
