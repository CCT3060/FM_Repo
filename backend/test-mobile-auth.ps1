# Test Mobile Auth API (PowerShell)
# Run this script to verify if login API is working correctly
# Usage: .\test-mobile-auth.ps1 -username "ahmad.hassan" -password "Test1234"

param(
    [Parameter(Mandatory=$true)]
    [string]$username,
    
    [Parameter(Mandatory=$true)]
    [string]$password
)

$API_BASE = "http://localhost:4000"

Write-Host ""
Write-Host "🧪 Testing Mobile Auth API" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""

try {
    Write-Host "📡 Calling: POST $API_BASE/api/mobile-auth/login" -ForegroundColor Yellow
    Write-Host "📝 Username: $username" -ForegroundColor Yellow
    Write-Host "🔐 Password: " -NoNewline -ForegroundColor Yellow
    Write-Host ("*" * $password.Length) -ForegroundColor Yellow
    Write-Host ""
    
    $body = @{
        username = $username
        password = $password
    } | ConvertTo-Json

    $response = Invoke-WebRequest `
        -Uri "$API_BASE/api/mobile-auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing `
        -ErrorAction Stop

    Write-Host "✨ Response Status: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
    Write-Host ""

    $data = $response.Content | ConvertFrom-Json

    Write-Host "✅ Login SUCCESSFUL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "👤 User Details:" -ForegroundColor Cyan
    Write-Host "   Name:         $($data.user.fullName)"
    Write-Host "   Email:        $($data.user.email)"
    Write-Host "   Role:         $($data.user.role)"
    Write-Host "   Company:      $($data.user.companyName)"
    Write-Host "   Supervisor:   $(if ($data.user.supervisorId) { $data.user.supervisorId } else { 'None' })"
    Write-Host ""
    Write-Host "🎫 Token: $($data.token.Substring(0, 30))..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "📱 Expected Navigation:" -ForegroundColor Cyan
    
    if ($data.user.role -eq "supervisor") {
        Write-Host "   → /tech-dashboard (Supervisor Portal)" -ForegroundColor Magenta
    } else {
        Write-Host "   → /dashboard (Employee Portal)" -ForegroundColor Magenta
    }

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
    Write-Host "✅ API is working correctly! Mobile app should be able to login." -ForegroundColor Green
    Write-Host ""

} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    Write-Host "❌ Login FAILED" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $errorData = $responseBody | ConvertFrom-Json
        
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        Write-Host "Error: $($errorData.message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        
        if ($statusCode -eq 401) {
            Write-Host "  • Check if username exists in database" -ForegroundColor Yellow
            Write-Host "  • Verify password is correct" -ForegroundColor Yellow
            Write-Host "  • Ensure password was set when creating employee" -ForegroundColor Yellow
        } elseif ($statusCode -eq 403) {
            Write-Host "  • Check employee status is 'Active' not 'Inactive'" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Network Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  • Ensure backend server is running: node src/server.js" -ForegroundColor Yellow
        Write-Host "  • Check if port 4000 is accessible" -ForegroundColor Yellow
        Write-Host "  • Verify firewall settings" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
    Write-Host "❌ API test failed. Fix the issues above before testing mobile app." -ForegroundColor Red
    Write-Host ""
    exit 1
}
