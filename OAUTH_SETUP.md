# MCP Server OAuth 2.0 Setup Guide

## Overview

Your MCP server uses the official `@modelcontextprotocol/sdk` with configurable OAuth 2.0 authentication. This provides secure access control ensuring only authorized users can access the MCP endpoint. The server supports multiple OAuth providers with **Hydra** as the default.

## What's Been Implemented

### 1. **Multi-Provider OAuth 2.0 Integration**
- ✅ **Hydra** OAuth 2.0 provider (default)
- ✅ **Google** OAuth 2.0 provider support
- ✅ **Custom** OAuth provider support
- ✅ Session-based authentication management  
- ✅ Configurable domain-based user authorization
- ✅ CSRF protection with OAuth state parameter
- ✅ Secure token validation and user info retrieval

### 2. **MCP SDK Integration**
- ✅ Built on `StreamableHTTPServerTransport`
- ✅ Proper MCP protocol implementation with initialization handshake
- ✅ OAuth integration using `authorize` and `onTokenReceived` hooks
- ✅ All existing tools (`search` and `fetch`) preserved and enhanced

### 3. **Security Features**
- ✅ Path traversal protection
- ✅ Repository boundary enforcement
- ✅ Session management with secure secrets
- ✅ Email domain validation
- ✅ Token expiration handling

### 4. **Dynamic Metadata Generation**
- ✅ Dynamic `.well-known/oauth-authorization-server` endpoint
- ✅ Smart BASE_URL vs provider URL handling
- ✅ Production and development configuration support

### 5. **Automatic Hydra Client Registration**
- ✅ Auto-detects when client doesn't exist in Hydra
- ✅ Automatically registers client with proper configuration
- ✅ Graceful handling of initialization failures
- ✅ Detailed logging for troubleshooting

## Configuration Options

### OAuth Provider Selection

The server supports three OAuth providers via the `OAUTH_PROVIDER` environment variable:

1. **`hydra`** (default) - Ory Hydra OAuth server
2. **`google`** - Google OAuth 2.0
3. **`custom`** - Custom OAuth provider

### URL Configuration Strategy

The server uses a two-tier URL configuration strategy:

#### Production with Reverse Proxy
Set `BASE_URL` to your public HTTPS URL. The server will use this for all OAuth metadata endpoints:
```env
BASE_URL=https://your-domain.com/mcp
OAUTH_PROVIDER=hydra
HYDRA_BROWSER_URL=https://your-domain.com/hydra
```

#### Development/Local Testing
Leave `BASE_URL` undefined. The server will use provider-specific URLs:
```env
# BASE_URL not set
OAUTH_PROVIDER=hydra
HYDRA_BROWSER_URL=http://localhost:4444
```

## Required Configuration

### Step 1: Basic Server Setup

1. **Copy Environment Template**
   ```bash
   cp env.example .env
   ```

2. **Configure Basic Settings**
   ```env
   # Server Configuration
   PORT=3131
   REPO_PATH=./repo
   
   # OAuth Provider (hydra is default)
   OAUTH_PROVIDER=hydra
   
   # Session Security
   SESSION_SECRET=generate-secure-random-string
   
   # Email Domain Restriction
   ALLOWED_EMAIL_DOMAIN=@yourdomain.com
   ```

3. **Generate Session Secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### Step 2: Provider-Specific Configuration

#### Option A: Hydra (Recommended)

```env
# Hydra Configuration
OAUTH_PROVIDER=hydra
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=mcp-secret

# Hydra URLs
HYDRA_ADMIN_URL=http://localhost:4445
HYDRA_BROWSER_URL=http://localhost:4444

# For production with reverse proxy
BASE_URL=https://your-domain.com/mcp
```

**Automatic Client Registration:**
The MCP server automatically registers the client with Hydra on startup if it doesn't exist. You can also manually register if needed:

```bash
curl -X POST http://localhost:4445/clients \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "mcp-client",
    "client_secret": "mcp-secret",
    "grant_types": ["authorization_code"],
    "response_types": ["code"],
    "scope": "openid profile email",
    "redirect_uris": ["https://your-domain.com/mcp/oauth/callback"],
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

#### Option B: Google OAuth

```env
# Google Configuration
OAUTH_PROVIDER=google
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# For production
BASE_URL=https://your-domain.com/mcp
```

**Google Cloud Console Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project
3. Enable Google+ API
4. Create OAuth 2.0 Client ID (Web application)
5. Add redirect URI: `https://your-domain.com/mcp/oauth/callback`

#### Option C: Custom Provider

```env
# Custom Provider Configuration
OAUTH_PROVIDER=custom
OAUTH_CLIENT_ID=your-custom-client-id
OAUTH_CLIENT_SECRET=your-custom-client-secret

# Custom OAuth URLs
OAUTH_AUTH_URL=https://your-provider.com/oauth2/auth
OAUTH_TOKEN_URL=https://your-provider.com/oauth2/token
OAUTH_USERINFO_URL=https://your-provider.com/oauth2/userinfo
OAUTH_JWKS_URL=https://your-provider.com/.well-known/jwks.json
```

### Step 3: URL Configuration

#### For Production (with reverse proxy):
```env
# Your public domain that routes to this MCP server
BASE_URL=https://your-domain.com/mcp

# If using Hydra, this should be your public Hydra URL
HYDRA_BROWSER_URL=https://your-domain.com/hydra
```

#### For Development (localhost):
```env
# Leave BASE_URL commented out for local development
# BASE_URL=https://your-domain.com/mcp

# Local Hydra instance
HYDRA_BROWSER_URL=http://localhost:4444
```

## OAuth Workflow

### 1. **Authentication Flow**
```
User → /oauth/login → OAuth Provider → /oauth/callback → Session Created
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
| `/.well-known/oauth-authorization-server` | GET | OAuth metadata |

**Hydra-specific endpoints (if using Hydra):**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/hydra/login` | GET/POST | Hydra login challenge handler |
| `/hydra/consent` | GET | Hydra consent challenge handler |

## OAuth Metadata Behavior

The server dynamically generates OAuth metadata based on your configuration:

### Production Mode (BASE_URL set)
```json
{
  "issuer": "https://your-domain.com/mcp",
  "authorization_endpoint": "https://your-domain.com/hydra/oauth2/auth",
  "token_endpoint": "https://your-domain.com/hydra/oauth2/token",
  "userinfo_endpoint": "https://your-domain.com/hydra/userinfo",
  "jwks_uri": "https://your-domain.com/hydra/.well-known/jwks.json"
}
```

### Development Mode (BASE_URL not set)
```json
{
  "issuer": "http://localhost:4444",
  "authorization_endpoint": "http://localhost:4444/oauth2/auth",
  "token_endpoint": "http://localhost:4444/oauth2/token",
  "userinfo_endpoint": "http://localhost:4444/userinfo",
  "jwks_uri": "http://localhost:4444/.well-known/jwks.json"
}
```

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
3. Complete OAuth flow with your configured provider
4. Test MCP endpoint: `POST http://localhost:3131/mcp`

### Testing with Hydra
1. Start Hydra:
   ```bash
   docker run --rm \
     -e URLS_SELF_ISSUER=http://localhost:4444 \
     -e URLS_CONSENT=http://localhost:3131/hydra/consent \
     -e URLS_LOGIN=http://localhost:3131/hydra/login \
     -e DSN=memory \
     -p 4444:4444 \
     -p 4445:4445 \
     oryd/hydra:v2.2 \
     serve all --dev
   ```

2. Start MCP server: `npm start` (client will be auto-registered)
3. Test complete flow

## Production Deployment

### Reverse Proxy Configuration
Configure your reverse proxy (nginx/Apache) to route:
- `/mcp/*` → `http://localhost:3131/*`
- `/hydra/*` → `http://localhost:4444/*` (if using Hydra)

### Environment Variables
```env
# Production settings
BASE_URL=https://your-domain.com/mcp
HYDRA_BROWSER_URL=https://your-domain.com/hydra
SESSION_SECRET=secure-random-production-secret
ALLOWED_EMAIL_DOMAIN=@your-organization.com

# Set secure cookies for HTTPS
# (configure in code: cookie.secure: true)
```

## Security Considerations

### Domain Restriction
- Only users with email addresses ending with the configured domain are authorized
- Configure via `ALLOWED_EMAIL_DOMAIN` environment variable
- Default: `@example.com` - **change this for production**

### Session Security
- Sessions use secure random secrets
- CSRF protection via OAuth state parameters
- Configure `cookie.secure: true` for HTTPS in production

### URL Security
- `HYDRA_BROWSER_URL` should point to a trusted Hydra instance
- `BASE_URL` should be your legitimate public domain
- Never expose internal URLs in production metadata

## Troubleshooting

### Common Issues

1. **OAuth Redirect Mismatch**
   - Ensure redirect URI in OAuth provider exactly matches your `BASE_URL`
   - Format: `https://your-domain.com/mcp/oauth/callback`

2. **Metadata Endpoint Issues**
   - Check if `BASE_URL` vs `HYDRA_BROWSER_URL` is set correctly
   - Verify `/.well-known/oauth-authorization-server` returns correct URLs

3. **Hydra Connection Issues**
   - Confirm Hydra is running on expected ports (4444/4445)
   - Check `HYDRA_ADMIN_URL` and `HYDRA_BROWSER_URL` configuration
   - Verify MCP client is registered with Hydra

4. **Session Issues**
   - Check `SESSION_SECRET` is set and consistent
   - Verify session middleware configuration

5. **Domain Authorization Fails**
   - Confirm user email ends with the configured `ALLOWED_EMAIL_DOMAIN`
   - Check user info retrieval from OAuth provider

### Debug Mode
```bash
# Enable detailed logging
DEBUG=* npm start
```

### Health Check
```bash
curl http://localhost:3131/health
```

### Test OAuth Metadata
```bash
curl http://localhost:3131/.well-known/oauth-authorization-server | jq
```

## Migration Notes

### From Previous Versions
- `HYDRA_PUBLIC_URL` is now `HYDRA_BROWSER_URL` (backward compatible)
- OAuth metadata is now dynamically generated
- BASE_URL handling has been improved for production deployments 