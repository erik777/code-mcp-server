# MCP Server Dual-Mode Configuration & Feature Toggles

**Date**: Step 2 Documentation (Dual-Mode Auth Plan)  
**Purpose**: Document the new dual-mode architecture with optional authentication  
**Status**: 🚧 **PLANNED ARCHITECTURE** - Documentation for post-refactor system

---

## Overview

After the dual-mode refactor, the MCP server will support **two distinct runtime modes** with **optional authentication**. This document defines the configuration system, expected behavior, and file structure for the new architecture.

## Core Environment Variables

### Primary Mode Toggle

```bash
# Server Implementation Mode
USE_STANDARD=false    # Use simple JSON-RPC server (default: false)
USE_STANDARD=true     # Use MCP SDK server with streaming support
```

### Authentication Toggle

```bash
# Authentication Control
ENABLE_AUTH=false     # Disable authentication (default: false)
ENABLE_AUTH=true      # Enable OAuth-based authentication
```

---

## Mode Combinations & Behavior

| `USE_STANDARD` | `ENABLE_AUTH` | Server Mode | Authentication | Use Case |
|---------------|---------------|-------------|----------------|-----------|
| `false` | `false` | **Simple + No Auth** | None | Local development, testing |
| `false` | `true` | **Simple + Auth** | Bearer tokens only | Production minimal |
| `true` | `false` | **Standard + No Auth** | None | SDK development, streaming tests |
| `true` | `true` | **Standard + Auth** | Full OAuth + Sessions | Production full-featured |

---

## File Structure After Refactor

```
src/
├── index.js           # Bootstrap entry point (mode selector)
├── simple.js          # Original JSON-RPC server (from No_Auth tag)
├── standard.js        # Current SDK-based server (renamed from index.js)
├── auth.js            # Shared authentication middleware
└── hydra/             # Hydra-specific OAuth logic
    ├── hydra-init.js   # Hydra client registration
    └── hydra-routes.js # Hydra OAuth flow routes
```

### File Dependencies

```javascript
// src/index.js - Bootstrap
const simple = require('./simple.js');      // Simple mode
const standard = require('./standard.js');  // Standard mode
const auth = require('./auth.js');          // Shared auth (when enabled)

// src/simple.js - Simple mode
const auth = require('./auth.js');          // Conditional import

// src/standard.js - Standard mode  
const auth = require('./auth.js');          // Conditional import
const hydraRoutes = require('./hydra/hydra-routes.js');

// src/auth.js - Shared authentication
const hydraInit = require('./hydra/hydra-init.js');
```

---

## Bootstrap Entry Point (`src/index.js`)

### Expected Structure

```javascript
// Load environment configuration
const USE_STANDARD = process.env.USE_STANDARD === 'true';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

// Boot mode logging
console.log(`[BOOT MODE] MCP Server mode: ${USE_STANDARD ? 'STANDARD' : 'SIMPLE'} | AUTH: ${ENABLE_AUTH ? 'ENABLED' : 'DISABLED'}`);

// Load appropriate server implementation
if (USE_STANDARD) {
    const standard = require('./standard.js');
    standard.start({ enableAuth: ENABLE_AUTH });
} else {
    const simple = require('./simple.js');
    simple.start({ enableAuth: ENABLE_AUTH });
}
```

### Startup Logging Format

```
[BOOT MODE] MCP Server mode: SIMPLE | AUTH: DISABLED
[BOOT MODE] MCP Server mode: SIMPLE | AUTH: ENABLED  
[BOOT MODE] MCP Server mode: STANDARD | AUTH: DISABLED
[BOOT MODE] MCP Server mode: STANDARD | AUTH: ENABLED
```

---

## Simple Mode (`src/simple.js`)

### Purpose
- **Reliable baseline**: Original custom JSON-RPC implementation
- **Deep Research compatibility**: Known-good implementation for ChatGPT
- **Minimal dependencies**: No MCP SDK, basic Express server
- **Fast startup**: Lightweight initialization

### Authentication Capabilities
- **No Auth Mode**: Direct MCP access, no middleware
- **Auth Mode**: Bearer token validation only (no sessions)

### Expected Interface

```javascript
// src/simple.js
function start({ enableAuth = false }) {
    console.log(`[SIMPLE] Starting simple MCP server (auth: ${enableAuth})`);
    
    if (enableAuth) {
        const { requireMCPAuth } = require('./auth.js');
        app.use('/mcp', requireMCPAuth);
    }
    
    // Original JSON-RPC handler implementation
    app.post('/mcp', handleMCPRequest);
    
    app.listen(PORT, () => {
        console.log(`[SIMPLE] Server listening on port ${PORT}`);
    });
}

module.exports = { start };
```

### Limitations in Simple Mode
- **No Streaming**: No Server-Sent Events support
- **No Sessions**: Stateless authentication only
- **Bearer Tokens Only**: No OAuth flows (when auth enabled)
- **No Hydra Integration**: Direct token validation only

---

## Standard Mode (`src/standard.js`)

### Purpose
- **Full MCP SDK**: Standards-compliant implementation
- **Streaming Support**: Server-Sent Events for real-time responses
- **Session Management**: Full OAuth flows with session state
- **Future-Ready**: Support for advanced MCP features

### Authentication Capabilities
- **No Auth Mode**: Direct MCP SDK access
- **Auth Mode**: Full OAuth flows + Bearer tokens + Sessions

### Expected Interface

```javascript
// src/standard.js  
function start({ enableAuth = false }) {
    console.log(`[STANDARD] Starting MCP SDK server (auth: ${enableAuth})`);
    
    if (enableAuth) {
        const { setupAuth, requireMCPAuth } = require('./auth.js');
        setupAuth(app); // Session middleware, OAuth routes, etc.
        app.use('/mcp', requireMCPAuth);
    }
    
    // MCP SDK transport setup
    const transport = new StreamableHTTPServerTransport(...);
    await server.connect(transport);
    
    app.listen(PORT, () => {
        console.log(`[STANDARD] Server listening on port ${PORT}`);
    });
}

module.exports = { start };
```

### Advanced Features in Standard Mode
- **SSE Streaming**: Real-time response streaming
- **Session State**: Persistent user sessions
- **Full OAuth Flows**: Login/consent/callback handling
- **Hydra Integration**: Complete OAuth provider support

---

## Authentication Module (`src/auth.js`)

### Purpose
- **Shared Logic**: Reusable auth across both modes
- **Token Validation**: OAuth provider userinfo validation
- **Mode-Specific Behavior**: Adapt to simple vs standard capabilities

### Expected Interface

```javascript
// src/auth.js
function requireMCPAuth(req, res, next) {
    // Unified auth middleware for both modes
    // Simple mode: Bearer tokens only
    // Standard mode: Bearer tokens + sessions
}

function setupAuth(app) {
    // Standard mode only: full OAuth setup
    // Session middleware, OAuth routes, Hydra integration
}

function validateUser(token) {
    // Shared token validation logic
    // Call OAuth provider userinfo endpoint
}

module.exports = { 
    requireMCPAuth, 
    setupAuth, 
    validateUser 
};
```

### Authentication Behavior by Mode

| Feature | Simple Mode | Standard Mode |
|---------|-------------|---------------|
| Bearer Tokens | ✅ Supported | ✅ Supported |
| Session Storage | ❌ No sessions | ✅ Full sessions |
| OAuth Flows | ❌ External only | ✅ Built-in flows |
| Hydra Integration | ❌ Not available | ✅ Full integration |
| CSRF Protection | ❌ Stateless | ✅ Session-based |

---

## Environment Variable Reference

### Mode Control (New)

```bash
# Server Implementation Selection
USE_STANDARD=false           # Default: simple mode
USE_STANDARD=true            # Enable: standard mode with SDK

# Authentication Control  
ENABLE_AUTH=false            # Default: no authentication required
ENABLE_AUTH=true             # Enable: OAuth-based authentication
```

### Existing OAuth Variables (Unchanged)

```bash
# OAuth Provider Configuration (only used when ENABLE_AUTH=true)
OAUTH_PROVIDER=hydra         # hydra|google|custom
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=mcp-secret
SESSION_SECRET=<64-char-hex>
ALLOWED_EMAIL_DOMAIN=@example.com

# Hydra Configuration (when OAUTH_PROVIDER=hydra)
HYDRA_ADMIN_URL=http://localhost:4445
HYDRA_BROWSER_URL=http://localhost:4444

# URL Configuration
BASE_URL=<public-url>        # Optional: production reverse proxy
MCP_INTERNAL_URL=http://localhost:3131
```

---

## MCP Tester Integration

### Expected `mcp-tester.js` Behavior

The `mcp-tester.js` tool should validate all four mode combinations:

#### Test Scenarios

```javascript
// 1. Simple + No Auth
process.env.USE_STANDARD = 'false';
process.env.ENABLE_AUTH = 'false';
// Expected: Direct MCP access, JSON-RPC responses

// 2. Simple + Auth  
process.env.USE_STANDARD = 'false';
process.env.ENABLE_AUTH = 'true';
// Expected: Bearer token required, JSON-RPC responses

// 3. Standard + No Auth
process.env.USE_STANDARD = 'true'; 
process.env.ENABLE_AUTH = 'false';
// Expected: Direct MCP access, streaming support

// 4. Standard + Auth
process.env.USE_STANDARD = 'true';
process.env.ENABLE_AUTH = 'true';  
// Expected: Full OAuth, sessions, streaming
```

#### Test Matrix

| Test Case | Environment | Expected Response | Authentication |
|-----------|-------------|-------------------|----------------|
| **Simple/NoAuth** | `USE_STANDARD=false`<br>`ENABLE_AUTH=false` | JSON-RPC only | None required |
| **Simple/Auth** | `USE_STANDARD=false`<br>`ENABLE_AUTH=true` | JSON-RPC only | Bearer token |
| **Standard/NoAuth** | `USE_STANDARD=true`<br>`ENABLE_AUTH=false` | JSON-RPC + SSE | None required |
| **Standard/Auth** | `USE_STANDARD=true`<br>`ENABLE_AUTH=true` | JSON-RPC + SSE | Bearer + Sessions |

#### Sample mcp-tester.js Usage

```bash
# Test simple mode without auth
USE_STANDARD=false ENABLE_AUTH=false node mcp-tester.js

# Test simple mode with auth  
USE_STANDARD=false ENABLE_AUTH=true OAUTH_TOKEN=<token> node mcp-tester.js

# Test standard mode without auth
USE_STANDARD=true ENABLE_AUTH=false node mcp-tester.js

# Test standard mode with auth
USE_STANDARD=true ENABLE_AUTH=true OAUTH_TOKEN=<token> node mcp-tester.js
```

---

## Configuration Examples

### Local Development (No Auth)

```bash
# .env.local
USE_STANDARD=false    # Use simple, reliable mode
ENABLE_AUTH=false     # Skip authentication
PORT=3131
REPO_PATH=./repo
```

### Testing SDK Features (No Auth)

```bash
# .env.test  
USE_STANDARD=true     # Use SDK with streaming
ENABLE_AUTH=false     # Skip authentication for testing
PORT=3131
REPO_PATH=./repo
```

### Production Minimal (Simple + Auth)

```bash
# .env.production.minimal
USE_STANDARD=false    # Reliable simple mode
ENABLE_AUTH=true      # Require authentication
OAUTH_PROVIDER=hydra
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=<secret>
ALLOWED_EMAIL_DOMAIN=@company.com
BASE_URL=https://api.company.com
```

### Production Full-Featured (Standard + Auth)

```bash
# .env.production.full
USE_STANDARD=true     # Full SDK features
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

### Phase 1: Preparation
1. ✅ Document current auth system (`config-auth.md`)
2. ✅ Document planned toggle system (`config-toggles.md`)

### Phase 2: File Restructuring  
3. Extract simple server from `No_Auth` tag → `src/simple.js`
4. Move current `src/index.js` → `src/standard.js`
5. Move Hydra files → `src/hydra/`
6. Create new bootstrap `src/index.js`

### Phase 3: Authentication Extraction
7. Extract auth logic → `src/auth.js`
8. Implement conditional auth injection
9. Test all four mode combinations

### Phase 4: Validation
10. Validate with `mcp-tester.js`
11. Test ChatGPT compatibility
12. Performance verification

---

## Cursor Integration Guidelines

### **⚠️ CRITICAL: Automated Tool Safety**

When suggesting changes to this codebase, **always reference this documentation first**:

1. **Check Mode Compatibility**: Ensure changes work in all four mode combinations
2. **Preserve Backward Compatibility**: Don't break existing OAuth flows
3. **Respect File Boundaries**: Don't merge `simple.js` and `standard.js` logic
4. **Test Environment Variables**: Validate all toggle combinations
5. **Document Breaking Changes**: Update this file if changing behavior

### **Common Pitfalls to Avoid**

❌ **Don't**: Merge authentication logic back into main server files  
✅ **Do**: Use `auth.js` for shared authentication logic

❌ **Don't**: Remove environment variable checks  
✅ **Do**: Preserve `USE_STANDARD` and `ENABLE_AUTH` toggles

❌ **Don't**: Break simple mode compatibility  
✅ **Do**: Keep simple mode as minimal JSON-RPC only

❌ **Don't**: Force dependencies on optional features  
✅ **Do**: Use conditional imports and graceful degradation

---

## Validation Checklist

After refactor completion, verify:

### ✅ Mode Functionality
- [ ] Simple mode works without MCP SDK dependencies
- [ ] Standard mode preserves all current streaming features  
- [ ] Bootstrap correctly selects mode based on `USE_STANDARD`
- [ ] All combinations start and serve requests successfully

### ✅ Authentication Integration
- [ ] `ENABLE_AUTH=false` bypasses all auth middleware
- [ ] `ENABLE_AUTH=true` preserves current OAuth flows
- [ ] Simple mode auth uses Bearer tokens only (stateless)
- [ ] Standard mode auth supports sessions + Bearer tokens

### ✅ Configuration Management
- [ ] Environment variables work as documented
- [ ] Boot logging shows correct mode selection
- [ ] Error messages are clear for misconfigurations
- [ ] Backward compatibility with existing `.env` files

### ✅ Tool Integration
- [ ] `mcp-tester.js` validates all four combinations
- [ ] ChatGPT Deep Research works in simple mode
- [ ] Streaming features work in standard mode
- [ ] Performance meets baseline requirements

---

**END OF TOGGLE DOCUMENTATION**

*This document defines the planned dual-mode architecture. Reference this when implementing or modifying the toggle system to ensure consistent behavior across all mode combinations.* 