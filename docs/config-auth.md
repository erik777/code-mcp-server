# MCP Server Current Authentication Configuration

**Date**: Step 1 Documentation (Three-Mode Auth Plan)  
**Purpose**: Document current OAuth2/Hydra integration for reference during three-mode refactoring  
**Update**: Revised to reflect new 3-mode architecture approach

---

## Overview

The MCP server currently implements **mandatory OAuth-based authentication** using a unified architecture that supports multiple OAuth providers. This document captures the current implementation structure, configuration, and flows to serve as a reference during the **three-mode refactor**.

**Post-Refactor Vision**: The current monolithic auth system will be split into three distinct modes:
- **Mode 1**: Simple (No Auth) - Proven ChatGPT compatibility
- **Mode 2**: Simple + OAuth - Experimental ChatGPT with authentication  
- **Mode 3**: Standard - Future/non-ChatGPT applications

## Current Authentication Architecture

### Core Files Structure

```
src/
├── index.js           # Main server with integrated OAuth logic (1760 lines)
├── hydra-init.js      # Hydra client auto-registration (197 lines) 
├── hydra-routes.js    # Hydra-specific OAuth routes (335 lines)
└── jwks.json          # Empty JWKS placeholder
```

**Post-Refactor Target Structure**:
```
src/
├── index.js               # Mode selector bootstrap
├── modes/
│   ├── simple.js          # Mode 1: No Auth (from No_Auth tag)
│   ├── simple-auth.js     # Mode 2: Simple + OAuth (experimental)
│   └── standard.js        # Mode 3: Current implementation
├── auth/
│   ├── bearer-only.js     # Lightweight validation for Mode 2
│   ├── oauth-session.js   # OAuth flows for Mode 2/3
│   └── hydra/             # Hydra-specific components
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

**Note**: Current authentication will be preserved as **Mode 3 (Standard)** in the new architecture.

---

## Environment Variables Configuration

### Current Variables (Mode 3 Implementation)

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

### Planned Mode Variables (Post-Refactor)

```bash
# Three-Mode Selection
MCP_MODE=simple        # Mode 1: No Auth (proven ChatGPT compatibility)
MCP_MODE=simple-auth   # Mode 2: Simple + OAuth (experimental ChatGPT auth)
MCP_MODE=standard      # Mode 3: Current implementation (future/non-ChatGPT)

# Optional Auth Toggle (if needed)
ENABLE_AUTH=true       # Additional toggle for Mode 2/3
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

**Post-Refactor Mapping**:
- **Mode 1**: No session middleware (stateless)
- **Mode 2**: Minimal session middleware (OAuth state only)
- **Mode 3**: Full session middleware (current implementation)

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

**Post-Refactor Usage**:
- **Mode 1**: Not used (no authentication)
- **Mode 2**: Shared validation logic (`auth/bearer-only.js`)
- **Mode 3**: Current implementation preserved

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

**Post-Refactor Distribution**:
- **Mode 1**: No authentication middleware
- **Mode 2**: Simplified Bearer-only middleware
- **Mode 3**: Current implementation preserved

---

## OAuth Flow Endpoints

### Standard OAuth Endpoints

| Endpoint | Method | Purpose | Mode 1 | Mode 2 | Mode 3 |
|----------|--------|---------|--------|--------|--------|
| `/oauth/login` | GET | Initiate OAuth flow | ❌ | ✅ | ✅ |
| `/oauth/callback` | GET | Handle OAuth callback | ❌ | ✅ | ✅ |
| `/oauth/logout` | GET | Destroy session | ❌ | ✅ | ✅ |
| `/oauth/status` | GET | Check auth status | ❌ | ✅ | ✅ |
| `/oauth/register` | POST | Dynamic client registration | ❌ | ❌ | ✅ |

### Hydra-Specific Endpoints

| Endpoint | Method | Purpose | Mode 1 | Mode 2 | Mode 3 |
|----------|--------|---------|--------|--------|--------|
| `/hydra/login` | GET/POST | Hydra login challenge | ❌ | ✅* | ✅ |
| `/hydra/consent` | GET/POST | Hydra consent challenge | ❌ | ❌ | ✅ |

*Mode 2 may support simplified Hydra login if needed for ChatGPT

### MCP Endpoints (Core Functionality)

| Endpoint | Method | Purpose | Mode 1 | Mode 2 | Mode 3 |
|----------|--------|---------|--------|--------|--------|
| `/mcp` | POST | MCP JSON-RPC requests | ✅ | ✅ | ✅ |
| `/mcp` | GET | MCP SSE streams | ❌ | ❌ | ✅ |
| `/mcp` | DELETE | MCP session termination | ❌ | ❌ | ✅ |

---

## Current OAuth Flow Sequences

### 1. Standard OAuth Flow (Google/Custom)

**Current Implementation** (will become Mode 3):
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

**Planned Mode 2 Flow** (simplified for ChatGPT):
```
User -> MCP: GET /oauth/login
MCP -> MCP: Generate state (minimal session)
MCP -> User: Redirect to OAuth Provider
User -> OAuth: Authenticate
OAuth -> MCP: GET /oauth/callback?code=...&state=...
MCP -> MCP: Validate state, clean session
MCP -> OAuth: POST /token (exchange code)
OAuth -> MCP: access_token
MCP -> User: Token response (for ChatGPT to use as Bearer)
```

### 2. Hydra OAuth Flow

**Current Implementation** (will become Mode 3):
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

**Post-Refactor Mapping**:
- **Mode 1**: No CSRF protection needed (no auth)
- **Mode 2**: Minimal CSRF for OAuth state only
- **Mode 3**: Full CSRF protection (current implementation)

### Session Security

- **Session Secret**: 64-byte random hex (auto-generated if not configured)
- **Cookie Security**: `secure: false` for development, should be `true` in production
- **Session Storage**: In-memory (Express default)

### Token Storage

- **Access Tokens**: Stored in Express session (`req.session.accessToken`)
- **Session-based**: No JWT validation, relies on OAuth provider introspection
- **Domain Restriction**: Email domain validation via `ALLOWED_EMAIL_DOMAIN`

**Post-Refactor Strategy**:
- **Mode 1**: No token storage
- **Mode 2**: Minimal token handling (Bearer validation only)
- **Mode 3**: Full session-based token storage (current)

---

## Current Dependencies

### OAuth & Session Management
- `express-session` - Session middleware
- `cookie-parser` - Cookie parsing
- `axios` - HTTP client for OAuth API calls
- `crypto` - State/secret generation

### MCP Integration
- `@modelcontextprotocol/sdk` - Official MCP SDK (Mode 3 only)
- `StreamableHTTPServerTransport` - HTTP transport with streaming (Mode 3 only)

**Post-Refactor Dependencies by Mode**:
- **Mode 1**: Minimal (express, basic JSON-RPC)
- **Mode 2**: Light OAuth (express, axios, minimal session)
- **Mode 3**: Full stack (current dependencies)

---

## Hydra Integration Details

### Auto-Registration Logic

**Location**: `src/hydra-init.js:33-133`

1. **Client Existence Check**: GET `/clients/{client_id}`
2. **Auto-Creation**: POST `/clients` if not exists
3. **Redirect URI Updates**: PUT `/clients/{client_id}` for REDIRECT_URI2
4. **Error Handling**: Graceful fallbacks for network/auth errors

**Post-Refactor Usage**:
- **Mode 1**: Not used
- **Mode 2**: May be used if Hydra provider selected
- **Mode 3**: Full Hydra integration (current)

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

**Post-Refactor Resolution**:
- **Mode Selection**: Three distinct modes with different capabilities
- **Authentication Optional**: Mode 1 (no auth), Mode 2/3 (optional auth)
- **Appropriate Complexity**: Each mode gets suitable architecture

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

## Breaking Points for Refactor

### Authentication Toggleability
**Current State**: Authentication is hardcoded and cannot be disabled
**Refactor Solution**: Mode 1 (no auth), Mode 2/3 (optional auth)

### Code Separation
**Current State**: OAuth and MCP logic intermixed in single file
**Refactor Solution**: Separate mode files with shared auth modules

### Session Decoupling
**Current State**: MCP sessions tied to Express sessions
**Refactor Solution**: Mode-appropriate session strategies

### Transport Management
**Current State**: Transport creation coupled with auth middleware
**Refactor Solution**: Mode-specific transport handling

---

## Reference Points for Refactor

### Key Functions to Preserve
- `validateUser()` - Token validation logic (Mode 2/3)
- `requireMCPAuth()` - Authentication middleware structure (Mode 3)
- Hydra client auto-registration flow (Mode 3)
- CSRF protection mechanisms (Mode 2/3)

### Configuration to Maintain
- Multi-provider OAuth support (Mode 2/3)
- Environment variable naming (extend with MCP_MODE)
- Redirect URI handling (Mode 2/3)
- Email domain validation (Mode 2/3)

### Flows to Preserve
- Standard OAuth authorization code flow (Mode 3)
- Hydra challenge-response flow (Mode 3)
- Session-based token storage (Mode 3)
- Bearer token authentication (Mode 2/3)

### New Requirements for Mode 2
- **Minimal OAuth**: Just enough for ChatGPT compatibility
- **Stateless Preference**: Minimal session usage
- **ChatGPT Integration**: Must work with Deep Research
- **Fallback Safety**: Mode 1 always available if Mode 2 fails

---

**END OF DOCUMENTATION**

*This document serves as a comprehensive reference for the current authentication implementation and its mapping to the new three-mode architecture. It should be consulted before making changes during the refactor to ensure backward compatibility and prevent regressions.* 