# MCP Server Three-Mode Configuration & Feature Toggles

**Date**: Step 2 Documentation (Three-Mode Auth Plan)  
**Purpose**: Document the new three-mode architecture with progressive authentication capabilities  
**Status**: 🚧 **PLANNED ARCHITECTURE** - Documentation for post-refactor system

---

## Overview

After the three-mode refactor, the MCP server will support **three distinct runtime modes** with **progressive authentication capabilities**. This document defines the configuration system, expected behavior, and file structure for the new architecture.

## Core Environment Variable

### Primary Mode Selection

```bash
# Three-Mode Selection
MCP_MODE=simple        # Mode 1: No Auth (proven ChatGPT compatibility)
MCP_MODE=simple-auth   # Mode 2: Simple + OAuth (experimental ChatGPT auth)
MCP_MODE=standard      # Mode 3: Full SDK + Auth (future/non-ChatGPT)
```

### Optional Authentication Toggle

```bash
# Additional Auth Control (if needed for Mode 2/3)
ENABLE_AUTH=false     # Disable authentication 
ENABLE_AUTH=true      # Enable OAuth-based authentication
```

---

## Three Mode Architecture

| Mode | `MCP_MODE` | Authentication | ChatGPT Compatible | Use Case |
|------|------------|----------------|-------------------|----------|
| **Mode 1: Simple** | `simple` | ❌ None | ✅ **Proven** | Local development, open access |
| **Mode 2: Simple + OAuth** | `simple-auth` | ✅ Minimal OAuth | 🧪 **Experimental** | Secure ChatGPT Deep Research |
| **Mode 3: Standard** | `standard` | ✅ Full OAuth | ❌ **Not Compatible** | Future MCP clients, streaming |

---

## File Structure After Refactor

```
src/
├── index.js               # Bootstrap entry point (3-way mode selector)
├── modes/
│   ├── simple.js          # Mode 1: No Auth (from No_Auth tag)
│   ├── simple-auth.js     # Mode 2: Simple + OAuth (experimental)
│   └── standard.js        # Mode 3: Current SDK implementation
├── auth/
│   ├── bearer-only.js     # Lightweight validation for Mode 2
│   ├── oauth-session.js   # OAuth flows for Mode 2/3
│   └── hydra/             # Hydra-specific OAuth logic
│       ├── hydra-init.js   # Hydra client registration
│       └── hydra-routes.js # Hydra OAuth flow routes
```

### File Dependencies

```javascript
// src/index.js - Bootstrap
const { simple } = require('./modes/simple.js');           // Mode 1
const { simpleAuth } = require('./modes/simple-auth.js');  // Mode 2  
const { standard } = require('./modes/standard.js');       // Mode 3

// src/modes/simple.js - Mode 1
// No auth dependencies

// src/modes/simple-auth.js - Mode 2
const { bearerOnly } = require('../auth/bearer-only.js');
const { oauthSession } = require('../auth/oauth-session.js');

// src/modes/standard.js - Mode 3
const { setupFullOAuth } = require('../auth/oauth-session.js');
const hydraRoutes = require('../auth/hydra/hydra-routes.js');

// src/auth/oauth-session.js - Shared OAuth
const { initHydra } = require('./hydra/hydra-init.js');
```

---

## Bootstrap Entry Point (`src/index.js`)

### Expected Structure

```javascript
// Load environment configuration
const MCP_MODE = process.env.MCP_MODE || 'simple';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

// Boot mode logging
console.log(`[BOOT MODE] MCP Server mode: ${MCP_MODE.toUpperCase()} | AUTH: ${ENABLE_AUTH ? 'ENABLED' : 'DISABLED'}`);

// Load appropriate mode implementation
switch (MCP_MODE) {
    case 'simple':
        const { simple } = require('./modes/simple.js');
        simple.start({ enableAuth: false }); // Mode 1: Always no auth
        break;
        
    case 'simple-auth':
        const { simpleAuth } = require('./modes/simple-auth.js');
        simpleAuth.start({ enableAuth: true }); // Mode 2: Experimental OAuth
        break;
        
    case 'standard':
        const { standard } = require('./modes/standard.js');
        standard.start({ enableAuth: ENABLE_AUTH }); // Mode 3: Configurable
        break;
        
    default:
        console.error(`❌ Invalid MCP_MODE: ${MCP_MODE}. Valid options: simple, simple-auth, standard`);
        process.exit(1);
}
```

### Startup Logging Format

```
[BOOT MODE] MCP Server mode: SIMPLE | AUTH: DISABLED
[BOOT MODE] MCP Server mode: SIMPLE-AUTH | AUTH: ENABLED
[BOOT MODE] MCP Server mode: STANDARD | AUTH: ENABLED
[BOOT MODE] MCP Server mode: STANDARD | AUTH: DISABLED
```

---

## Mode 1: Simple (No Auth)

### Purpose
- **Proven baseline**: Original No_Auth implementation
- **ChatGPT Deep Research**: Guaranteed compatibility (fallback option)
- **Local development**: Fast, simple testing
- **Open access**: No authentication barriers

### Configuration
```bash
MCP_MODE=simple
# ENABLE_AUTH ignored (always false)
```

### Expected Interface

```javascript
// src/modes/simple.js
function start({ enableAuth = false }) {
    // Ignore enableAuth - this mode never has auth
    console.log(`[SIMPLE] Starting simple MCP server (no auth)`);
    
    // Original JSON-RPC handler implementation from No_Auth tag
    app.post('/mcp', handleMCPRequest);
    
    app.listen(PORT, () => {
        console.log(`[SIMPLE] Server listening on port ${PORT}`);
    });
}

module.exports = { start };
```

### Capabilities
- ✅ **MCP Protocol**: JSON-RPC implementation
- ✅ **Tool Execution**: `search` and `fetch` tools  
- ✅ **ChatGPT Deep Research**: Proven compatibility
- ❌ **Authentication**: None
- ❌ **Sessions**: Stateless
- ❌ **OAuth Flows**: Not supported
- ❌ **Streaming**: No SSE support

---

## Mode 2: Simple + OAuth (Experimental)

### Purpose
- **Primary refactor objective**: Enable authentication for ChatGPT Deep Research
- **Experimental**: May fail, Mode 1 always available as fallback
- **Minimal OAuth**: Just enough for secure code sharing
- **ChatGPT Integration**: Targeted for Deep Research compatibility

### Configuration
```bash
MCP_MODE=simple-auth
# ENABLE_AUTH automatically true for this mode
```

### Expected Interface

```javascript
// src/modes/simple-auth.js
function start({ enableAuth = true }) {
    console.log(`[SIMPLE-AUTH] Starting simple OAuth MCP server`);
    
    // Minimal OAuth setup - just enough for ChatGPT
    const { setupMinimalOAuth, bearerValidation } = require('../auth/bearer-only.js');
    setupMinimalOAuth(app); // Lightweight OAuth endpoints
    
    // Bearer token validation for MCP endpoint
    app.use('/mcp', bearerValidation);
    
    // Same JSON-RPC handler as Mode 1
    app.post('/mcp', handleMCPRequest);
    
    app.listen(PORT, () => {
        console.log(`[SIMPLE-AUTH] Server listening on port ${PORT}`);
    });
}

module.exports = { start };
```

### OAuth Implementation Strategy

#### **Minimal Session Usage**
```javascript
// Temporary session only for OAuth state
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 600000,  // 10 minutes only
        name: 'oauth_temp' // Specific name
    }
}));
```

#### **Simplified OAuth Flow**
```
1. User -> GET /oauth/login
2. MCP -> Generate state (temp session)
3. MCP -> Redirect to OAuth provider
4. OAuth -> Callback with code
5. MCP -> Exchange code for token
6. MCP -> Return token to user (for ChatGPT Bearer usage)
7. MCP -> Clean temp session
```

#### **Bearer Token Validation**
```javascript
// Simple Bearer validation for /mcp endpoint
function bearerValidation(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Bearer token required' });
    }
    // Validate token with OAuth provider
    validateUser(token).then(valid => {
        if (valid) next();
        else res.status(403).json({ error: 'Invalid token' });
    });
}
```

### Capabilities
- ✅ **MCP Protocol**: Same JSON-RPC as Mode 1
- ✅ **Tool Execution**: `search` and `fetch` tools
- 🧪 **ChatGPT Deep Research**: Experimental compatibility
- ✅ **Authentication**: Bearer token validation
- ✅ **OAuth Flow**: Minimal implementation
- ❌ **Sessions**: Temporary only (for OAuth state)
- ❌ **Streaming**: No SSE support

### Risk Profile
- **High Risk**: May break ChatGPT compatibility
- **Acceptable Risk**: Mode 1 always available as fallback
- **Testing Strategy**: Extensive local testing before Deep Research

---

## Mode 3: Standard (Future Tech)

### Purpose
- **Future MCP clients**: Non-ChatGPT integrations
- **Full feature set**: Complete SDK implementation with streaming
- **Preserve current**: Maintain existing functionality
- **Not ChatGPT compatible**: Explicitly acknowledged

### Configuration
```bash
MCP_MODE=standard
ENABLE_AUTH=true/false  # Configurable
```

### Expected Interface

```javascript
// src/modes/standard.js (current index.js renamed)
function start({ enableAuth = false }) {
    console.log(`[STANDARD] Starting MCP SDK server (auth: ${enableAuth})`);
    
    if (enableAuth) {
        // Full OAuth setup - current implementation
        const { setupFullOAuth, requireMCPAuth } = require('../auth/oauth-session.js');
        setupFullOAuth(app); // Session middleware, OAuth routes, etc.
        app.use('/mcp', requireMCPAuth);
    }
    
    // MCP SDK transport setup - current implementation
    const transport = new StreamableHTTPServerTransport(...);
    await server.connect(transport);
    
    app.listen(PORT, () => {
        console.log(`[STANDARD] Server listening on port ${PORT}`);
    });
}

module.exports = { start };
```

### Capabilities
- ✅ **Full MCP SDK**: Standards-compliant implementation
- ✅ **Streaming Support**: Server-Sent Events for real-time responses
- ✅ **Session Management**: Full OAuth flows with session state
- ✅ **Complete OAuth**: All current authentication features
- ✅ **Hydra Integration**: Full challenge-response flows
- ❌ **ChatGPT Deep Research**: Not compatible

---

## Authentication Module Architecture

### Mode-Specific Auth Strategies

#### **Mode 1: No Authentication**
```javascript
// No auth module usage
```

#### **Mode 2: Minimal OAuth** (`auth/bearer-only.js`)
```javascript
function setupMinimalOAuth(app) {
    // Minimal session for OAuth state only
    app.use(session({ /* minimal config */ }));
    
    // Essential OAuth endpoints
    app.get('/oauth/login', handleLogin);
    app.get('/oauth/callback', handleCallback);
    
    // No Hydra routes, no session management beyond OAuth
}

function bearerValidation(req, res, next) {
    // Stateless Bearer token validation
    const token = extractBearerToken(req);
    validateUser(token).then(valid => valid ? next() : reject());
}
```

#### **Mode 3: Full OAuth** (`auth/oauth-session.js`)
```javascript
function setupFullOAuth(app) {
    // Full session middleware - current implementation
    app.use(session({ /* full config */ }));
    app.use(cookieParser());
    
    // All OAuth endpoints
    app.use('/oauth', oauthRoutes);
    app.use('/hydra', hydraRoutes);
    
    // Full authentication middleware
    app.use('/mcp', requireMCPAuth);
}
```

### Authentication Capability Matrix

| Feature | Mode 1 | Mode 2 | Mode 3 |
|---------|--------|--------|--------|
| Bearer Tokens | ❌ | ✅ | ✅ |
| OAuth Login Flow | ❌ | ✅ | ✅ |
| Session Storage | ❌ | ⚠️ Minimal | ✅ |
| Hydra Integration | ❌ | ⚠️ Basic | ✅ |
| CSRF Protection | ❌ | ⚠️ OAuth only | ✅ |
| Token Refresh | ❌ | ❌ | ✅ |
| Consent Flows | ❌ | ❌ | ✅ |

---

## Environment Variable Reference

### Core Mode Selection

```bash
# Primary mode selection (required)
MCP_MODE=simple        # Mode 1: No Auth
MCP_MODE=simple-auth   # Mode 2: Simple + OAuth
MCP_MODE=standard      # Mode 3: Full SDK

# Optional auth toggle (mainly for Mode 3)
ENABLE_AUTH=false      # Default: disable auth
ENABLE_AUTH=true       # Enable auth (ignored for Mode 1)
```

### OAuth Configuration (Mode 2 & 3)

```bash
# OAuth Provider Configuration
OAUTH_PROVIDER=hydra         # hydra|google|custom
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=mcp-secret
SESSION_SECRET=<64-char-hex>
ALLOWED_EMAIL_DOMAIN=@example.com

# Hydra Configuration
HYDRA_ADMIN_URL=http://localhost:4445
HYDRA_BROWSER_URL=http://localhost:4444

# URL Configuration
BASE_URL=<public-url>        # Optional: production reverse proxy
MCP_INTERNAL_URL=http://localhost:3131
```

---

## Testing Strategy Integration

### Expected `mcp-tester.js` Behavior

#### Test Scenarios by Mode

```javascript
// Mode 1: Simple (No Auth)
process.env.MCP_MODE = 'simple';
// Expected: Direct MCP access, JSON-RPC responses, no auth

// Mode 2: Simple + OAuth  
process.env.MCP_MODE = 'simple-auth';
process.env.OAUTH_TOKEN = '<token>';
// Expected: Bearer token required, JSON-RPC responses

// Mode 3: Standard
process.env.MCP_MODE = 'standard';
process.env.ENABLE_AUTH = 'false';
// Expected: MCP SDK responses, streaming support, no auth

// Mode 3: Standard + Auth
process.env.MCP_MODE = 'standard';
process.env.ENABLE_AUTH = 'true';
process.env.OAUTH_TOKEN = '<token>';
// Expected: Full OAuth + sessions + streaming
```

#### Test Matrix

| Test Case | Environment | Expected Response | Authentication |
|-----------|-------------|-------------------|----------------|
| **Mode 1** | `MCP_MODE=simple` | JSON-RPC only | None required |
| **Mode 2** | `MCP_MODE=simple-auth` | JSON-RPC only | Bearer token |
| **Mode 3 (No Auth)** | `MCP_MODE=standard`<br>`ENABLE_AUTH=false` | JSON-RPC + SSE | None required |
| **Mode 3 (Auth)** | `MCP_MODE=standard`<br>`ENABLE_AUTH=true` | JSON-RPC + SSE | Bearer + Sessions |

#### Sample Usage

```bash
# Test Mode 1 - baseline
MCP_MODE=simple node mcp-tester.js

# Test Mode 2 - experimental OAuth  
MCP_MODE=simple-auth OAUTH_TOKEN=<token> node mcp-tester.js

# Test Mode 3 - future tech
MCP_MODE=standard ENABLE_AUTH=false node mcp-tester.js
MCP_MODE=standard ENABLE_AUTH=true OAUTH_TOKEN=<token> node mcp-tester.js
```

---

## Configuration Examples

### Local Development (Mode 1)

```bash
# .env.local
MCP_MODE=simple       # Proven baseline, no auth
PORT=3131
REPO_PATH=./repo
```

### Experimental ChatGPT Auth (Mode 2)

```bash
# .env.experimental
MCP_MODE=simple-auth  # Primary refactor objective
OAUTH_PROVIDER=hydra
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=<secret>
ALLOWED_EMAIL_DOMAIN=@company.com
BASE_URL=https://api.company.com
```

### Future Tech Development (Mode 3)

```bash
# .env.future
MCP_MODE=standard     # Full SDK features
ENABLE_AUTH=false     # Test without auth first
PORT=3131
REPO_PATH=./repo
```

### Production Standard (Mode 3)

```bash
# .env.production
MCP_MODE=standard     # Full feature set
ENABLE_AUTH=true      # Full OAuth integration
OAUTH_PROVIDER=hydra
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=<secret>
SESSION_SECRET=<64-char-hex>
ALLOWED_EMAIL_DOMAIN=@company.com
BASE_URL=https://api.company.com
HYDRA_ADMIN_URL=https://hydra-admin.company.com
HYDRA_BROWSER_URL=https://hydra.company.com
```

---

## Migration Path

### Phase 1: Preparation ✅
1. ✅ Document current auth system (`config-auth.md`)
2. ✅ Document three-mode toggle system (`config-toggles.md`)
3. ✅ Document testing strategy (`dual-mode-test-plan.md`)

### Phase 2: File Restructuring  
4. Extract simple server from `No_Auth` tag → `src/modes/simple.js`
5. Move current `src/index.js` → `src/modes/standard.js`
6. Create experimental `src/modes/simple-auth.js`
7. Create new three-way bootstrap `src/index.js`
8. Move Hydra files → `src/auth/hydra/`

### Phase 3: Authentication Extraction
9. Extract auth logic → `src/auth/bearer-only.js` and `src/auth/oauth-session.js`
10. Implement mode-specific auth injection
11. Test all three mode combinations locally

### Phase 4: Validation
12. Validate with `mcp-tester.js` (all modes)
13. Test Mode 1 with ChatGPT (baseline confirmation)
14. Test Mode 2 with ChatGPT (experimental objective)
15. Regression test Mode 3

---

## Risk Assessment & Fallback Strategy

### Mode Risk Levels

#### **Mode 1: Simple** - 🟢 **LOW RISK**
- **Risk**: Minimal (proven implementation)
- **Fallback**: N/A (this IS the fallback)
- **Testing**: Single Deep Research validation

#### **Mode 2: Simple + OAuth** - 🟡 **HIGH RISK**
- **Risk**: May break ChatGPT compatibility  
- **Fallback**: Mode 1 (proven baseline)
- **Testing**: Extensive local + limited Deep Research

#### **Mode 3: Standard** - 🟢 **LOW RISK**
- **Risk**: Minimal (preserve current implementation)
- **Fallback**: Current working system
- **Testing**: Regression testing only

### Fallback Strategy

```javascript
// If Mode 2 fails ChatGPT testing:
// 1. Document failure mode
// 2. Switch to Mode 1 for production
// 3. Continue development on Mode 2 without pressure
// 4. Mode 1 ensures no service interruption
```

---

## Validation Checklist

### ✅ Mode Functionality
- [ ] Mode 1 works identical to No_Auth tag
- [ ] Mode 2 provides minimal OAuth without breaking core functionality
- [ ] Mode 3 preserves all current features
- [ ] Bootstrap correctly selects mode based on `MCP_MODE`
- [ ] All combinations start and serve requests successfully

### ✅ Authentication Integration  
- [ ] Mode 1: No auth middleware (stateless)
- [ ] Mode 2: Bearer token validation only (minimal sessions)
- [ ] Mode 3: Full OAuth flows preserved
- [ ] Auth modules work independently
- [ ] No cross-mode authentication leakage

### ✅ ChatGPT Compatibility
- [ ] Mode 1: Confirmed working with Deep Research
- [ ] Mode 2: Experimental validation with Deep Research
- [ ] Mode 3: Confirmed NOT working (acceptable)
- [ ] No regression in Mode 1 compatibility

### ✅ Configuration Management
- [ ] `MCP_MODE` correctly switches between modes
- [ ] Environment variables work as documented
- [ ] Boot logging shows correct mode selection
- [ ] Error messages clear for misconfigurations
- [ ] Backward compatibility with existing `.env` files

### ✅ Tool Integration
- [ ] `mcp-tester.js` validates all three modes
- [ ] ChatGPT Deep Research works in Mode 1 (baseline)
- [ ] ChatGPT Deep Research tested in Mode 2 (experimental)
- [ ] Streaming features work in Mode 3
- [ ] Performance meets baseline requirements

---

**END OF THREE-MODE TOGGLE DOCUMENTATION**

*This document defines the three-mode architecture for progressive authentication capabilities. Reference this when implementing or modifying the mode system to ensure consistent behavior across all combinations while preserving ChatGPT compatibility where possible.* 