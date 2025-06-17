// Simple OAuth Configuration Test
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const crypto = require("crypto");

console.log("🔧 Testing OAuth Configuration...\n");

// Check required environment variables
const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET'
];

const optionalVars = [
    'BASE_URL',
    'PORT',
    'REPO_PATH',
    'ALLOWED_EMAIL_DOMAIN'
];

console.log("📋 Required Environment Variables:");
let allRequired = true;
requiredVars.forEach(varName => {
    const value = process.env[varName];
    const isSet = value && value !== `your-${varName.toLowerCase().replace('_', '-')}`;
    console.log(`  ${isSet ? '✅' : '❌'} ${varName}: ${isSet ? '[SET]' : '[NOT SET]'}`);
    if (!isSet) allRequired = false;
});

console.log("\n📋 Optional Environment Variables:");
optionalVars.forEach(varName => {
    const value = process.env[varName];
    const defaultValue = {
        'BASE_URL': 'https://www.example.com/reverse/proxypath',
        'PORT': '3131',
        'REPO_PATH': './repo',
        'ALLOWED_EMAIL_DOMAIN': '@example.com'
    }[varName];
    console.log(`  ℹ️  ${varName}: ${value || defaultValue}`);
});

console.log("\n🔐 OAuth Configuration Test:");
const baseUrl = process.env.BASE_URL || 'https://www.example.com/reverse/proxypath';
const redirectUri = `${baseUrl}/oauth/callback`;
const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || '@example.com';
console.log(`  🌐 Base URL: ${baseUrl}`);
console.log(`  📞 Redirect URI: ${redirectUri}`);
console.log(`  📧 Allowed Domain: ${allowedDomain}`);

console.log("\n🎯 Google OAuth URLs:");
console.log(`  🔗 Authorization: https://accounts.google.com/o/oauth2/v2/auth`);
console.log(`  🎫 Token Exchange: https://oauth2.googleapis.com/token`);
console.log(`  👤 User Info: https://www.googleapis.com/oauth2/v3/userinfo`);

console.log("\n🛣️  Server Endpoints:");
const port = process.env.PORT || 3131;
console.log(`  🔐 OAuth Login: http://localhost:${port}/oauth/login`);
console.log(`  📞 OAuth Callback: http://localhost:${port}/oauth/callback`);
console.log(`  📊 OAuth Status: http://localhost:${port}/oauth/status`);
console.log(`  🚪 OAuth Logout: http://localhost:${port}/oauth/logout`);
console.log(`  🔗 MCP Endpoint: http://localhost:${port}/mcp`);
console.log(`  💊 Health Check: http://localhost:${port}/health`);

// Generate sample session secret if needed
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-session-secret-here') {
    console.log("\n🔑 Generated Session Secret (add to .env file):");
    console.log(`SESSION_SECRET=${crypto.randomBytes(64).toString('hex')}`);
}

console.log("\n📝 Next Steps:");
if (!allRequired) {
    console.log("  1. ❌ Configure missing environment variables in .env file");
    console.log("  2. 🌐 Set up Google OAuth application with redirect URI:");
    console.log(`     ${redirectUri}`);
    console.log("  3. 🚀 Start server with: npm start");
} else {
    console.log("  1. ✅ All required environment variables configured");
    console.log("  2. 🌐 Verify Google OAuth application redirect URI:");
    console.log(`     ${redirectUri}`);
    console.log("  3. 🚀 Start server with: npm start");
    console.log("  4. 🔐 Test OAuth flow by visiting /oauth/login");
}

console.log("\n🔧 Configuration Status:", allRequired ? "✅ READY" : "❌ NEEDS SETUP");