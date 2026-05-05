# =============================================================================
# FM App — SSH Tunnel (auto-reconnect)
# Run from anywhere:  .\tunnel.ps1
# Keeps localhost:5432 → EC2 PostgreSQL alive. Auto-reconnects on drop.
# Press Ctrl+C to stop.
# =============================================================================

$EC2_IP   = "3.110.166.39"
$EC2_USER = "ec2-user"
$PEM_FILE = "$env:USERPROFILE\.ssh\Key.pem"

if (-not (Test-Path $PEM_FILE)) {
    Write-Error "PEM file not found: $PEM_FILE"
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
