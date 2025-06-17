# Google OAuth 2.0 Setup Guide

## Overview

Your MCP server has been successfully migrated from a simple Express server to use the official `@modelcontextprotocol/sdk` with Google OAuth 2.0 authentication. This provides secure access control ensuring only authorized users can access the MCP endpoint.

## What's Been Implemented

### 1. **OAuth 2.0 Integration**
- ✅ Google OAuth 2.0 provider configuration
- ✅ Session-based authentication management  
- ✅ Configurable domain-based user authorization
- ✅ CSRF protection with OAuth state parameter
- ✅ Secure token validation and user info retrieval

### 2. **MCP SDK Migration**
- ✅ Migrated from custom Express routes to `StreamableHTTPServerTransport`
- ✅ Proper MCP protocol implementation with initialization handshake
- ✅ OAuth integration using `authorize` and `onTokenReceived` hooks
- ✅ All existing tools (`search` and `fetch`) preserved and enhanced

### 3. **Security Features**
- ✅ Path traversal protection
- ✅ Repository boundary enforcement
- ✅ Session management with secure secrets
- ✅ Email domain validation
- ✅ Token expiration handling

## Required Configuration

### Step 1: Google Cloud Console Setup

1. **Create/Select Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing one

2. **Enable APIs**
   - Navigate to "APIs & Services" > "Library"
   - Enable "Google+ API" (for user profile access)

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: **Web application**
   - Name: `MCP Git Gateway`

4. **Configure Redirect URI**
   - Add authorized redirect URI:
     ```
     https://www.example.com/reverse/proxypath/oauth/callback
     ```

5. **Save Credentials**
   - Copy the generated Client ID and Client Secret

### Step 2: Environment Configuration

1. **Copy Environment Template**
   ```bash
   cp env.example .env
   ```

2. **Configure OAuth Settings**
   ```env
   # Required OAuth Configuration
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   SESSION_SECRET=generate-secure-random-string
   
   # Server Configuration  
   BASE_URL=https://www.example.com/reverse/proxypath
   PORT=3131
   REPO_PATH=./repo
   
   # Email Domain Restriction
   ALLOWED_EMAIL_DOMAIN=@yourdomain.com
   ```

3. **Generate Session Secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### Step 3: Verification

1. **Test Configuration**
   ```bash
   npm run test:oauth
   ```

2. **Test Basic Setup**
   ```bash
   npm run test:basic
   ```

3. **Start Server**
   ```bash
   npm start
   ```

## OAuth Workflow

### 1. **Authentication Flow**
```
User → /oauth/login → Google OAuth → /oauth/callback → Session Created
```

### 2. **MCP Access Flow**
```
Client → /mcp → Session Check → Token Validation → MCP Request Processing
```

### 3. **Available Endpoints**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/login` | GET | Initiate OAuth flow |
| `/oauth/callback` | GET | Handle OAuth response |
| `/oauth/status` | GET | Check authentication status |
| `/oauth/logout` | GET | Clear session |
| `/mcp` | POST | MCP protocol endpoint (protected) |
| `/health` | GET | Server health check |

## Development & Testing

### Local Development
```bash
# Start with auto-reload
npm run dev

# Test OAuth configuration
npm run test:oauth

# Test basic MCP functionality
npm run test:basic
```

### Testing OAuth Flow
1. Start server: `npm start`
2. Visit: `http://localhost:3131/oauth/login`
3. Complete Google OAuth flow
4. Test MCP endpoint: `POST http://localhost:3131/mcp`

### Production Deployment
- Ensure `BASE_URL` matches your public domain
- Set `SESSION_SECRET` to a secure random value
- Configure reverse proxy to route `/reverse/proxypath` to your application
- Use HTTPS in production (set `cookie.secure: true`)

## Security Considerations

### Domain Restriction
- Only users with email addresses ending with the configured domain are authorized
- This is configured via the `ALLOWED_EMAIL_DOMAIN` environment variable
- Default value is `@example.com` - change this to your organization's domain

### Session Security
- Sessions use secure random secrets
- CSRF protection via OAuth state parameters
- Session cookies are HTTP-only (configure `secure: true` for HTTPS)

### Token Validation
- Google OAuth tokens are validated on each MCP request
- User email is re-verified on token validation
- Invalid tokens result in authentication failure

## Troubleshooting

### Common Issues

1. **OAuth Redirect Mismatch**
   - Ensure redirect URI in Google Console exactly matches:
     `https://www.example.com/reverse/proxypath/oauth/callback`

2. **Session Issues**
   - Check `SESSION_SECRET` is set and consistent
   - Verify session middleware configuration

3. **Domain Authorization Fails**
   - Confirm user email ends with the configured `ALLOWED_EMAIL_DOMAIN`
   - Check user info retrieval from Google API

4. **MCP Connection Issues**
   - Verify OAuth authentication completed successfully
   - Check session is maintained between requests
   - Ensure `authorize` function in transport is working

### Debug Mode
```bash
# Enable detailed logging
DEBUG=* npm start
```

### Health Check
```bash
curl http://localhost:3131/health
```

## Migration Summary

### What Changed
- **Before**: Custom Express server with manual JSON-RPC handling
- **After**: Official MCP SDK with `StreamableHTTPServerTransport`
- **Security**: Added OAuth 2.0 authentication layer
- **Architecture**: Proper MCP protocol compliance

### What Stayed the Same
- All existing tool functionality (`search` and `fetch`)
- File search algorithms and capabilities
- Repository access patterns
- Tool schemas and response formats

### New Features
- Secure OAuth 2.0 authentication
- Configurable domain-based access control
- Session management
- CSRF protection
- Enhanced error handling
- Comprehensive logging

The server is now production-ready with enterprise-grade authentication while maintaining all existing MCP tool functionality. 