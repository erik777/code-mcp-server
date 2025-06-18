**MCP Three-Mode Server Architecture Plan with Optional Auth**

**Overview**
This plan outlines a refactor of the MCP server to support three runtime modes, each serving a distinct use case. The goal is to enable secure Deep Research support via OAuth while preserving a proven baseline and maintaining flexibility for future needs.

### 🚦 Mode Breakdown

#### **Mode 1: Simple (No Auth)**

* ✅ Proven compatibility with ChatGPT Deep Research
* 📄 Based on the original `No_Auth` JSON-RPC implementation
* 🔒 No authentication — used for open or local development
* 🧪 Always test this first to confirm baseline functionality

#### **Mode 2: Simple + OAuth (Experimental)**

* 🎯 Primary objective of this refactor
* 🧪 Simple Mode with just enough OAuth to support ChatGPT login/token flows
* 💡 Adds minimal session middleware *only* for `state` handling during OAuth handshake
* ✅ Targeted for secure code sharing with ChatGPT
* 🔍 Subject to ongoing testing — may fail, and that’s acceptable (Mode 1 is fallback)

#### **Mode 3: Standard (SDK-Based)**

* 🔮 Reserved for future non-ChatGPT use cases
* ✅ Full MCP SDK, sessions, SSE streaming, etc.
* ❌ Not compatible with ChatGPT Deep Research
* 🧰 Useful for future integrations or advanced clients

---

**Primary Goals**

* Enable **OAuth-protected Deep Research support** in Simple Mode (Mode 2)
* Preserve a **proven stateless baseline** for rapid fallback (Mode 1)
* Maintain SDK-based infrastructure for future use (Mode 3)
* Isolate risks and testing scope across modes
* Prevent architectural contradictions by making capabilities explicit per mode

---

**Implementation Steps**

1. **Document the current configuration and usage for authorization and Hydra integration**

   * Describe token validation, OAuth endpoints, session handling, and CSRF logic
   * Clarify that this applies to Mode 2 and Mode 3, not Mode 1

2. **Document Configuration and Usage of Feature Toggles**

   * Define `MCP_MODE=simple`, `simple-auth`, or `standard`
   * Define `ENABLE_AUTH=true` if needed to separate auth toggling further
   * Map out file/module responsibilities (e.g. `auth/`, `modes/`, `hydra/`)

3. **Restore and Rename Original MCP Server**

   * Extract the `No_Auth` version as the base for Mode 1 and Mode 2
   * Save it as `src/modes/simple.js`
   * Verify it works immediately with ChatGPT (Mode 1)

4. **Create Separate Entrypoints for All Three Modes**

   * `src/modes/simple.js`: Mode 1 — No auth
   * `src/modes/simple-auth.js`: Mode 2 — Minimal OAuth
   * `src/modes/standard.js`: Mode 3 — Full SDK-based
   * Add `src/index.js` to load based on `MCP_MODE`

5. **Refactor Shared Auth Logic**

   * Create `auth/bearer-only.js` for Mode 2
   * Create `auth/oauth-session.js` for login + token flow (Mode 2 + 3)
   * Move `hydra/` helpers under `auth/`

6. **Implement Conditional OAuth Support**

   * In Mode 2, support only what’s needed for ChatGPT’s connector flow:

     * `/oauth/login`, `/oauth/callback`, token exchange
     * Short-lived session for `state`
   * In Mode 3, support full session + consent flows + `express-session`

7. **Add Startup Mode Confirmation**

   ```
   [BOOT MODE] MCP Server mode: SIMPLE-AUTH | AUTH: ENABLED
   ```

8. **Validation and Regression Testing**

   * Use `mcp-tester.js` to validate all three modes independently
   * Run Deep Research against Mode 1 and Mode 2 only
   * Track failures, fallback to Mode 1 when needed

---

**Environment Variables**

* `MCP_MODE=simple` → Stateless, no auth (Mode 1)
* `MCP_MODE=simple-auth` → Simple + OAuth (Mode 2)
* `MCP_MODE=standard` → SDK + full auth (Mode 3)
* `ENABLE_AUTH=true` → Optional (used to toggle logic in Mode 2/3)

**Directory Layout (after refactor)**

```bash
src/
├── index.js               # Loads appropriate mode
├── modes/
│   ├── simple.js          # Mode 1
│   ├── simple-auth.js     # Mode 2
│   └── standard.js        # Mode 3
├── auth/
│   ├── bearer-only.js     # Stateless validator
│   ├── oauth-session.js   # Lightweight OAuth flow handler
│   └── hydra/             # Hydra-specific tools
```

**Outcome**
A cleanly separated, testable, and scalable three-mode MCP architecture:

* ✅ Immediate support for ChatGPT without auth (Mode 1)
* 🧪 Experimental OAuth support for secure ChatGPT usage (Mode 2)
* 🔮 Streaming/advanced capabilities for future applications (Mode 3)
