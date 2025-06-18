**MCP Dual-Mode Server Refactor Plan with Optional Auth**

**Overview**
This plan outlines a refactor of the MCP server to support two runtime modes:

1. A minimal, known-good MCP server using the original custom JSON-RPC implementation.
2. A standards-compliant MCP SDK-based server with streaming support.

Both modes will optionally support OAuth-based authentication via an environment flag. This structure provides clear separation between reliable baseline behavior and experimental/advanced protocol features.

**Goals**

* Restore full Deep Research functionality using the original handler.
* Preserve the SDK-based implementation for future streaming use cases.
* Enable authentication as a reusable, toggleable component.
* Allow configuration via environment flags.
* Validate each phase using the `mcp-tester.js` tool created by Cursor.
* Provide clear documentation of configuration and usage to protect against accidental breakage by automated tools (e.g. Cursor).

**Implementation Steps**

1. **Document the current configuration and usage for authorization and Hydra integration**

   * Clearly document the current structure and logic for OAuth2/Hydra integration, including token validation and session handling.
   * Capture any required environment variables, expected token flows, and assumptions about session cookies or domains.
   * This serves as a reference point for future maintenance and for Cursor to avoid introducing regressions.

2. **Document Configuration and Usage of new feature toggling**

   * Clearly document the purpose and structure of:

     * `USE_STANDARD` (switch between simple and standard modes)
     * `ENABLE_AUTH` (toggle authentication)
     * Dependencies: `auth.js`, `hydra/`, `simple.js`, `standard.js`
   * Include expected inputs/outputs for `mcp-tester.js`
   * Ensure Cursor references these docs when suggesting edits or merges
   * Output in `docs/config-toggles.md`

3. **Restore and Rename Original MCP Server**

   * Use the `No_Auth` tag as a reference only.
   * Extract `index.js` directly from the `No_Auth` tag without checking it out fully.
   * Copy the file into `src/simple.js`.
   * This file will serve as the JSON-RPC-only version of the server.
   * Create a `src/hydra` folder and move `hydra-init.js` and \`hydra-routes.js\` into the folder ensuring imports in src/index.js reference the files in the new locations.

4. **Rename SDK-Based Server and Create Unified Entry Point**

   * Move `src/index.js` to `src/standard.js`.

   * This file contains the current SDK-based implementation with streaming.

   * Create a new `src/index.js` that loads either `simple.js` or `standard.js`.

   * Use `USE_STANDARD` environment variable to select mode.

   * Pass `{ enableAuth }` to selected mode via a `start()` function.

   * Ensure the server runs and is testable in both modes before proceeding.

   * Create a new `src/index.js` that loads either `simple.js` or `standard.js`.

   * Use `USE_STANDARD` environment variable to select mode.

   * Pass `{ enableAuth }` to selected mode via a `start()` function.

5. **Refactor Authentication Logic**

   * Extract `requireMCPAuth`, session handling, and Hydra integrations into `src/auth.js`.
   * Preserve existing `hydra/*.js` helpers and routes.
   * Ensure both `simple.js` and `standard.js` can consume `auth.js`.

6. **Inject Auth Conditionally**

   * Add logic to both `start()` methods to apply `requireMCPAuth` only when `enableAuth` is true.
   * In `simple.js`, support only Bearer token-based validation (no sessions).
   * In `standard.js`, support both token-based and session-based validation, including cookie-based sessions managed by `express-session`.
   * Clearly isolate these behaviors so that Cursor understands: **simple.js uses stateless auth**, while **standard.js may maintain session state** via middleware.

7. **Logging and Mode Confirmation**

   * On startup, print mode summary:

     ```
     [BOOT MODE] MCP Server mode: SIMPLE | AUTH: ENABLED
     ```

8. **Validation and Regression Testing**

   * After each structural change, validate:

     * `POST /mcp` with `initialize` and `tools/list`
     * Tool execution via `search`, `fetch`
     * Stream completion (`event: done`) if in standard mode
     * Authentication flow (if enabled)
   * Use `mcp-tester.js` for all validation to avoid consuming Deep Research quota.
   * The user can test ChatGPT validation of each mode

**Environment Variables**

* `USE_STANDARD=true` → Use SDK-based `standard.js` server
* `ENABLE_AUTH=true` → Enable OAuth-based access control

**Directory Layout (after refactor)**

```bash
src/
├── index.js         # Bootstrap mode selector
├── simple.js        # Original JSON-RPC server
├── standard.js      # SDK-based MCP server with streaming
├── auth.js          # Shared auth middleware (Hydra, session)
└── hydra/           # Hydra config, routes, helpers
```

**Next Steps**

* Begin with restoring `simple.js` and confirming Deep Research works without auth.
* Incrementally introduce auth, then switch to SDK and retest.
* Use `mcp-tester.js` at each step to catch regressions early.

**Outcome**
A fully flexible MCP gateway supporting both MVP-proven reliability and forward-compatible streaming, with toggled authentication and minimal surface area for bugs.
