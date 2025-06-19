MCP Project: Status Summary (June 2025 Pause Point)

Overview
The MCP Git Gateway Server project has been successfully refactored into a modular, three-mode system, with substantial progress made on Mode 2 (OAuth-enabled support). We are pausing active development at this point to shift focus back to Ohio Community (OC) development.

Architecture Summary

Mode 1: Simple (No Auth)

✅ Fully functional with Deep Research (DR).

Implements the original JSON-RPC logic from No_Auth tag.

Proven to support initialize, tools/list, search, and fetch successfully.

ChatGPT was able to use search, but did not appear to use fetch.  Could review logs to identify ways to improve.  

Session logs saved in `ownCloud/Documents/projects/code-mcp-server/mcp-2025-Jun-18 mode 1 - ChatGPT - success.tar.xz`

Mode 2: Simple + OAuth (Bearer-only)

🧪 Experimental but near-complete.

Server successfully issues tokens, stores and validates them.

DR validation appears to succeed when connector name is unique.

Confirmed that DR silently ignores connectors that failed initial validation, even if fixed later.

Next step (when resuming): Run full DR test with Mode 2 under a new name.

Mode 3: Standard (Full SDK + Sessions)

💤 Preserved for future use (e.g., streaming, advanced features).

Confirmed incompatible with DR expectations.

Not used for ChatGPT integrations at this time.

OAuth Flow Learnings

Hydra integration works.

DR performs .well-known, /oauth/register, /oauth/login, /oauth/callback, then /mcp.

Server correctly handles these and stores self-generated tokens.

Stateless bearer validation working as intended for Mode 2.

Session-based logic (e.g., cookies) intentionally omitted from Simple modes.

Connector Behavior Insights

DR caches internal connector state (by name + ID).

Once a connector is marked invalid, it is effectively blacklisted.

Recreating the same name or ID does not work.

✅ Using a unique new connector name restores DR functionality.

Logging

Winston logging integrated with support for:

Console output

Plaintext file output (in logs/ directory)

JSON logs (future pipeline-ready)

Each mode prints startup configuration including mode, port, auth provider, and capabilities.

Testing Strategy

mcp-tester.js created and validated against Mode 1.

Planned use: validate initialize, tools/list, and token handshake in Mode 2 before consuming DR quota.

Next Steps (When Resuming)

Run Mode 2 with a new connector name and perform a full DR test.

Optionally test alternate auth strategies (e.g., shared secret injection).

Preserve Mode 1 as a guaranteed baseline.

Reassess need for sessions in Mode 2 depending on ChatGPT behavior.

Extend Winston logging or create a CrateDB HTTP appender if analytics are needed.

Opportunities to improve

Log to structured logging.  Provide to CrateDB.  Analyze queries.  Turn into test cases.  Identify a way to provide better results.

Document fetch better so LLMs use it. 

Have testing with LLMs other than ChatGPT

Status: ✅ Mode 1 complete, 🧪 Mode 2 prepped and queued, 💤 Mode 3 deferred.

Pausing here with confidence in infrastructure and a clear restart path.

