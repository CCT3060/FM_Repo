# tunnel.ps1 - opens SSH tunnel: localhost:14000 -> EC2:4000
$key = "$env:USERPROFILE\.ssh\Key.pem"
$existing = Get-NetTCPConnection -LocalPort 14000 -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Tunnel already running on port 14000" -ForegroundColor Green
    exit 0
}
Write-Host "Starting SSH tunnel: localhost:14000 -> EC2:4000..." -ForegroundColor Cyan
ssh -i $key -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -N -L 14000:localhost:4000 ec2-user@3.110.166.39
