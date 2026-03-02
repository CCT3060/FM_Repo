// @ts-nocheck
// Test Mobile Auth API
// Run this script to verify if login API is working correctly
// Usage: node test-mobile-auth.js <username> <password>

const API_BASE = 'http://localhost:4000';

async function testLogin(username, password) {
  console.log('🧪 Testing Mobile Auth API');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    console.log(`📡 Calling: POST ${API_BASE}/api/mobile-auth/login`);
    console.log(`📝 Username: ${username}`);
    console.log(`🔐 Password: ${'*'.repeat(password.length)}\n`);
    
    const response = await fetch(`${API_BASE}/api/mobile-auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    console.log(`✨ Response Status: ${response.status} ${response.statusText}\n`);

    const data = await response.json();

    if (!response.ok) {
      console.log('❌ Login FAILED');
      console.log('Error:', data.message || 'Unknown error');
      console.log('\nTroubleshooting:');
      
      if (response.status === 401) {
        console.log('  • Check if username exists in database');
        console.log('  • Verify password is correct');
        console.log('  • Ensure password was set when creating employee');
      } else if (response.status === 403) {
        console.log('  • Check employee status is "Active" not "Inactive"');
      }
      
      return false;
    }

    console.log('✅ Login SUCCESSFUL!\n');
    console.log('👤 User Details:');
    console.log(`   Name:         ${data.user.fullName}`);
    console.log(`   Email:        ${data.user.email}`);
    console.log(`   Role:         ${data.user.role}`);
    console.log(`   Company:      ${data.user.companyName}`);
    console.log(`   Supervisor:   ${data.user.supervisorId || 'None'}`);
    console.log(`\n🎫 Token: ${data.token.substring(0, 30)}...`);
    
    console.log('\n📱 Expected Navigation:');
    if (data.user.role === 'supervisor') {
      console.log('   → /tech-dashboard (Supervisor Portal)');
    } else {
      console.log('   → /dashboard (Employee Portal)');
    }

    return true;
  } catch (error) {
    console.log('❌ Network Error');
    console.log('Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('  • Ensure backend server is running: node src/server.js');
    console.log('  • Check if port 4000 is accessible');
    console.log('  • Verify API_BASE URL is correct');
    return false;
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('❌ Missing arguments\n');
  console.log('Usage: node test-mobile-auth.js <username> <password>');
  console.log('Example: node test-mobile-auth.js ahmad.hassan Test1234\n');
  process.exit(1);
}

const [username, password] = args;

testLogin(username, password).then((success) => {
  console.log('\n═══════════════════════════════════════════════════════════');
  process.exit(success ? 0 : 1);
});
