# MCP Server Current Authentication Configuration

**Date**: Step 1 Documentation (Dual-Mode Auth Plan)  
**Purpose**: Document current OAuth2/Hydra integration for reference during refactoring

---

## Overview

The MCP server currently implements **mandatory OAuth-based authentication** using a unified architecture that supports multiple OAuth providers. This document captures the current implementation structure, configuration, and flows to serve as a reference during the dual-mode refactor.

## Current Authentication Architecture

### Core Files Structure

```
src/
├── index.js           # Main server with integrated OAuth logic (1760 lines)
├── hydra-init.js      # Hydra client auto-registration (197 lines) 
├── hydra-routes.js    # Hydra-specific OAuth routes (335 lines)
└── jwks.json          # Empty JWKS placeholder
```

### Authentication Integration Points

1. **Main Server (`index.js`)**:
   - OAuth provider configuration and initialization
   - Session middleware setup
   - `requireMCPAuth` middleware for MCP endpoints
   - Token validation via `validateUser()` function
   - OAuth flow endpoints (`/oauth/login`, `/oauth/callback`, etc.)

2. **Hydra Integration (`hydra-init.js`)**:
   - Automatic client registration with Hydra Admin API
   - Environment-based configuration validation
   - Support for multiple redirect URIs

3. **Hydra Routes (`hydra-routes.js`)**:
   - Login challenge handling (`/hydra/login`)
   - Consent flow management (`/hydra/consent`)
   - CSRF protection via cookies

---

## Environment Variables Configuration

### Required Core Variables

```bash
# OAuth Provider Selection
OAUTH_PROVIDER=hydra                    # hydra|google|custom

# OAuth Client Credentials
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=mcp-secret

# Session Management
SESSION_SECRET=<64-char-hex>            # Auto-generated if not provided

# Access Control
ALLOWED_EMAIL_DOMAIN=@example.com

# URL Configuration
BASE_URL=<public-url>                   # Optional: for production reverse proxy
MCP_INTERNAL_URL=http://localhost:3131  # Fallback URL
```

### Hydra-Specific Variables

```bash
# Hydra Configuration (when OAUTH_PROVIDER=hydra)
HYDRA_ADMIN_URL=http://localhost:4445
HYDRA_INTERNAL_URL=http://localhost:4444
HYDRA_BROWSER_URL=<browser-facing-url>  # Defaults to HYDRA_INTERNAL_URL

# Additional Redirect URI Support
REDIRECT_URI2=<secondary-redirect>      # Optional
```

### Google OAuth Variables

```bash
# Google Configuration (when OAUTH_PROVIDER=google)
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-secret>
```

### Custom Provider Variables

```bash
# Custom Provider (when OAUTH_PROVIDER=custom)
OAUTH_AUTH_URL=<auth-endpoint>
OAUTH_TOKEN_URL=<token-endpoint>
OAUTH_USERINFO_URL=<userinfo-endpoint>
OAUTH_JWKS_URL=<jwks-endpoint>
```

---

## Current Session Management

### Session Middleware Configuration

**Location**: `src/index.js:757-762`

```javascript
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);
```

### Session Data Structure

- `req.session.oauthState` - CSRF protection state parameter
- `req.session.accessToken` - OAuth access token (stored after successful auth)
- `req.session.mcpSessionId` - MCP session identifier
- `req.sessionID` - Express session ID

---

## Authentication Flow Architecture

### Token Validation Logic

**Location**: `src/index.js:552-594` (`validateUser` function)

```javascript
async function validateUser(token) {
  // 1. Call OAuth provider's userinfo endpoint with Bearer token
  const response = await axios.get(OAUTH_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  // 2. Extract email from userinfo response
  const email = response.data.email;
  
  // 3. Validate email domain against ALLOWED_EMAIL_DOMAIN
  return email && email.endsWith(ALLOWED_EMAIL_DOMAIN);
}
```

### MCP Authentication Middleware

**Location**: `src/index.js:1273-1318` (`requireMCPAuth`)

**Token Source Priority**:
1. `Authorization: Bearer <token>` header (preferred)
2. `req.session.accessToken` (session-stored token)

**Authorization Flow**:
1. Extract token from Bearer header or session
2. Return 401 if no token found
3. Call `validateUser(token)` to validate with OAuth provider
4. Return 403 if user not authorized (wrong domain)
5. Store validated token in `req.mcpUserToken` and continue

---

## OAuth Flow Endpoints

### Standard OAuth Endpoints

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/oauth/login` | GET | Initiate OAuth flow | None |
| `/oauth/callback` | GET | Handle OAuth callback | None |
| `/oauth/logout` | GET | Destroy session | None |
| `/oauth/status` | GET | Check auth status | None |
| `/oauth/register` | POST | Dynamic client registration | None |

### Hydra-Specific Endpoints

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/hydra/login` | GET/POST | Hydra login challenge | None |
| `/hydra/consent` | GET/POST | Hydra consent challenge | None |

### MCP Endpoints (Protected)

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/mcp` | POST | MCP JSON-RPC requests | **Required** |
| `/mcp` | GET | MCP SSE streams | **Required** |
| `/mcp` | DELETE | MCP session termination | **Required** |

---

## Current OAuth Flow Sequences

### 1. Standard OAuth Flow (Google/Custom)

```
User -> MCP: GET /oauth/login
MCP -> MCP: Generate state, store in session
MCP -> User: Redirect to OAuth Provider
User -> OAuth: Authenticate
OAuth -> MCP: GET /oauth/callback?code=...&state=...
MCP -> MCP: Validate state parameter
MCP -> OAuth: POST /token (exchange code)
OAuth -> MCP: access_token
MCP -> OAuth: GET /userinfo (validate token)
OAuth -> MCP: User profile
MCP -> MCP: Check email domain
MCP -> MCP: Store token in session
MCP -> User: Success response
```

### 2. Hydra OAuth Flow

```
User -> MCP: GET /oauth/login
MCP -> Hydra: Redirect to /oauth2/auth
Hydra -> MCP: GET /hydra/login?login_challenge=...
MCP -> User: Login form
User -> MCP: POST /hydra/login (email)
MCP -> MCP: Validate email domain
MCP -> Hydra: PUT /admin/oauth2/auth/requests/login/accept
Hydra -> MCP: GET /hydra/consent?consent_challenge=...
MCP -> User: Consent form
User -> MCP: POST /hydra/consent (approve)
MCP -> Hydra: PUT /admin/oauth2/auth/requests/consent/accept
Hydra -> MCP: GET /oauth/callback?code=...
MCP -> Hydra: POST /oauth2/token (exchange code)
Hydra -> MCP: access_token
MCP -> User: Success response
```

---

## Security Configuration

### CSRF Protection

- **OAuth State**: Random 32-byte hex string stored in session
- **Hydra CSRF Cookies**: Challenge-based cookies for login/consent flows
- **Cookie Settings**: `httpOnly: true, sameSite: 'None', secure: <env-dependent>`

### Session Security

- **Session Secret**: 64-byte random hex (auto-generated if not configured)
- **Cookie Security**: `secure: false` for development, should be `true` in production
- **Session Storage**: In-memory (Express default)

### Token Storage

- **Access Tokens**: Stored in Express session (`req.session.accessToken`)
- **Session-based**: No JWT validation, relies on OAuth provider introspection
- **Domain Restriction**: Email domain validation via `ALLOWED_EMAIL_DOMAIN`

---

## Current Dependencies

### OAuth & Session Management
- `express-session` - Session middleware
- `cookie-parser` - Cookie parsing
- `axios` - HTTP client for OAuth API calls
- `crypto` - State/secret generation

### MCP Integration
- `@modelcontextprotocol/sdk` - Official MCP SDK
- `StreamableHTTPServerTransport` - HTTP transport with streaming

---

## Hydra Integration Details

### Auto-Registration Logic

**Location**: `src/hydra-init.js:33-133`

1. **Client Existence Check**: GET `/clients/{client_id}`
2. **Auto-Creation**: POST `/clients` if not exists
3. **Redirect URI Updates**: PUT `/clients/{client_id}` for REDIRECT_URI2
4. **Error Handling**: Graceful fallbacks for network/auth errors

### Client Configuration

```javascript
{
  client_id: OAUTH_CLIENT_ID,
  client_secret: OAUTH_CLIENT_SECRET,
  grant_types: ["authorization_code", "refresh_token", "client_credentials"],
  response_types: ["code"],
  scope: "openid profile email",
  redirect_uris: [REDIRECT_URI, REDIRECT_URI2],
  token_endpoint_auth_method: "client_secret_post"
}
```

---

## Current Limitations & Assumptions

### Architecture Assumptions

1. **Always-On Authentication**: No way to disable OAuth (always required)
2. **Single-Mode Operation**: Cannot switch between auth/no-auth modes
3. **Session-State Coupling**: MCP session IDs tied to Express sessions
4. **In-Memory Sessions**: No persistent session storage
5. **Single-Domain Restriction**: Only one email domain supported

### OAuth Provider Assumptions

1. **Standard Userinfo Endpoint**: Must support `/userinfo` with email field
2. **Bearer Token Support**: Must accept `Authorization: Bearer` headers
3. **Email-Based Authorization**: User authorization based solely on email domain
4. **Session-Based Storage**: Tokens stored in server-side sessions

### Hydra-Specific Assumptions

1. **Admin API Access**: Direct access to Hydra Admin API required
2. **Auto-Registration**: Server auto-registers OAuth client on startup
3. **Browser URL Configuration**: Separate browser-facing URL support
4. **Challenge-Response Flow**: Manual handling of login/consent challenges

---

## Technical Debt & Concerns

### Code Organization
- **Monolithic Structure**: All OAuth logic in single 1760-line file
- **Mixed Concerns**: MCP logic intertwined with OAuth logic
- **No Separation**: Cannot easily disable or mock authentication

### Configuration Complexity
- **URL Fallback Chain**: Complex BASE_URL → MCP_INTERNAL_URL → defaults
- **Provider-Specific Branching**: Scattered provider configuration logic
- **Environment Variable Proliferation**: 15+ environment variables

### Session Management
- **No Persistence**: Sessions lost on server restart
- **Memory Usage**: Unbounded session growth
- **No Cleanup**: No session expiration handling

---

## Breaking Points for Refactor

### Authentication Toggleability
**Current State**: Authentication is hardcoded and cannot be disabled
**Required Change**: Need environment flag to bypass `requireMCPAuth`

### Code Separation
**Current State**: OAuth and MCP logic intermixed in single file
**Required Change**: Extract OAuth logic to separate modules

### Session Decoupling
**Current State**: MCP sessions tied to Express sessions
**Required Change**: Separate MCP session management from OAuth sessions

### Transport Management
**Current State**: Transport creation coupled with auth middleware
**Required Change**: Decouple transport lifecycle from authentication

---

## Reference Points for Refactor

### Key Functions to Preserve
- `validateUser()` - Token validation logic
- `requireMCPAuth()` - Authentication middleware structure
- Hydra client auto-registration flow
- CSRF protection mechanisms

### Configuration to Maintain
- Multi-provider OAuth support
- Environment variable naming
- Redirect URI handling
- Email domain validation

### Flows to Preserve
- Standard OAuth authorization code flow
- Hydra challenge-response flow
- Session-based token storage
- Bearer token authentication

---

**END OF DOCUMENTATION**

*This document serves as a comprehensive reference for the current authentication implementation. It should be consulted before making changes during the dual-mode refactor to ensure backward compatibility and prevent regressions.* 