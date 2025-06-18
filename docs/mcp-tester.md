# MCP Protocol Tester

The `mcp-tester.js` script simulates ChatGPT Deep Research client behavior to test MCP server compliance without consuming OpenAI quota. It performs a complete MCP protocol handshake and can test tool invocations.

## Overview

This tester validates that your MCP server properly implements the [Model Context Protocol (MCP)](https://spec.modelcontextprotocol.io/) specification by:

1. **Initialize Connection**: Sends a proper `initialize` request with protocol version and capabilities
2. **Send Notification**: Follows up with `notifications/initialized` as required by the spec
3. **List Tools**: Requests available tools via `tools/list`
4. **Call Tools**: Optionally invokes specific tools like `search`
5. **Verify Responses**: Validates JSON-RPC 2.0 compliance and proper MCP structure

## Prerequisites

```bash
# Install dependencies
npm install node-fetch

# Make the script executable
chmod +x mcp-tester.js
```

## Usage

### Basic Usage

```bash
node mcp-tester.js --url <server-url> --token <bearer-token>
```

### Complete Example

```bash
node mcp-tester.js \
  --url "https://www.servicecraze.com/corsair/mcp1/mcp" \
  --token "your-oauth-token-here" \
  --session-id "custom-session-id" \
  --tool "search" \
  --query "find recent commits" \
  --timeout 10000
```

## Command Line Options

| Option | Required | Description | Default |
|--------|----------|-------------|---------|
| `--url` | Yes | Base MCP server URL endpoint | `http://localhost:3131/mcp` |
| `--token` | Yes | Bearer token for Authorization header | - |
| `--session-id` | No | Custom session ID for MCP requests | Random UUID |
| `--tool` | No | Name of tool to invoke (e.g., "search", "fetch") | - |
| `--query` | No | Query parameter for search tool | - |
| `--timeout` | No | Stream timeout in milliseconds | 5000 |

## Example Outputs

### Successful Test

```
🧪 MCP Protocol Tester
======================
📍 Server URL: https://www.servicecraze.com/corsair/mcp1/mcp
🆔 Session ID: 550e8400-e29b-41d4-a716-446655440000
🔧 Tool: search
⏱️  Timeout: 5000ms

🚀 Phase 1: Initialize MCP Connection
=====================================
📤 POST https://www.servicecraze.com/corsair/mcp1/mcp
📦 Body: {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": { "tools": {} },
    "clientInfo": { "name": "mcp-tester", "version": "1.0.0" }
  }
}
📨 Response: 200 OK
📄 Body: {
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": { "tools": { "listChanged": true } },
    "serverInfo": { "name": "code-mcp-server", "version": "1.0.0" }
  },
  "jsonrpc": "2.0",
  "id": 1
}
✅ Initialize successful

📡 Phase 2: Send Initialized Notification
=========================================
📨 Response: 200 OK
✅ Notification sent

🔧 Phase 3: List Available Tools
================================
📨 Response: 200 OK
📄 Body: {
  "result": {
    "tools": [
      { "name": "search", "description": "Search through repository files" },
      { "name": "fetch", "description": "Fetch file contents" }
    ]
  },
  "jsonrpc": "2.0",
  "id": 2
}
✅ Tools list retrieved

🛠️  Phase 4: Call Tool "search"
============================
📨 Response: 200 OK
📄 Body: {
  "result": {
    "content": [
      { "type": "text", "text": "Found 15 files matching 'recent commits'" }
    ]
  },
  "jsonrpc": "2.0",
  "id": 3
}
✅ Tool call completed

📊 Test Results Summary
======================
✅ Initialize: SUCCESS
✅ Tools List: SUCCESS
✅ Tool Call: SUCCESS
🎯 Overall: SUCCESS
```

### Failed Test

```
🧪 MCP Protocol Tester
======================
📍 Server URL: http://localhost:3131/mcp
🆔 Session ID: 550e8400-e29b-41d4-a716-446655440000
🔧 Tool: none
⏱️  Timeout: 5000ms

🚀 Phase 1: Initialize MCP Connection
=====================================
📤 POST http://localhost:3131/mcp
📦 Body: { ... }
📨 Response: 400 Bad Request
📄 Body: {
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: Server not initialized"
  },
  "id": null
}
❌ Error: Initialize failed: 400 Bad Request

💥 Test Failed
==============
❌ Error: Initialize failed: 400 Bad Request
```

## Testing Different Scenarios

### Test Basic Protocol Compliance

```bash
# Minimal test - just initialize and list tools
node mcp-tester.js \
  --url "http://localhost:3131/mcp" \
  --token "your-token"
```

### Test Search Tool

```bash
# Test search functionality
node mcp-tester.js \
  --url "http://localhost:3131/mcp" \
  --token "your-token" \
  --tool "search" \
  --query "package.json"
```

### Test with Custom Session

```bash
# Use specific session ID for debugging
node mcp-tester.js \
  --url "http://localhost:3131/mcp" \
  --token "your-token" \
  --session-id "debug-session-123"
```

### Test with Extended Timeout

```bash
# Increase timeout for slow servers
node mcp-tester.js \
  --url "http://localhost:3131/mcp" \
  --token "your-token" \
  --timeout 30000
```

## Troubleshooting

### Authentication Errors (401)

```
❌ Error: Initialize failed: 401 Unauthorized
```

**Solution**: Verify your bearer token is valid and not expired.

### Server Not Initialized (400)

```
❌ Error: Initialize failed: 400 Bad Request
📄 Body: { "error": { "message": "Bad Request: Server not initialized" } }
```

**Solution**: This indicates the MCP transport wasn't properly initialized. Check server logs for transport creation issues.

### Network Connection Errors

```
❌ Error: Network error: connect ECONNREFUSED 127.0.0.1:3131
```

**Solution**: Verify the server is running and the URL is correct.

### Protocol Version Mismatch

```
📄 Body: { "error": { "message": "Unsupported protocol version" } }
```

**Solution**: Update the protocol version in the tester or server to match.

## Integration with CI/CD

You can use this tester in automated testing:

```bash
#!/bin/bash
# test-mcp-server.sh

# Start your MCP server
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Run MCP protocol test
node mcp-tester.js \
  --url "http://localhost:3131/mcp" \
  --token "$TEST_OAUTH_TOKEN" \
  --tool "search" \
  --query "test" \
  --timeout 10000

TEST_RESULT=$?

# Clean up
kill $SERVER_PID

# Exit with test result
exit $TEST_RESULT
```

## Comparison with ChatGPT Behavior

This tester closely mimics how ChatGPT Deep Research interacts with MCP servers:

1. **Identical Headers**: Uses same `mcp-session-id`, `Authorization`, and `Content-Type` headers
2. **Proper Sequencing**: Follows initialize → notify → tools/list → tools/call pattern
3. **JSON-RPC 2.0**: Strict adherence to JSON-RPC protocol format
4. **Error Handling**: Similar timeout and error response processing

The main differences are:
- No SSE stream processing (ChatGPT uses Server-Sent Events for streaming responses)
- Simplified capability negotiation
- Fixed protocol version rather than dynamic negotiation

## Extending the Tester

To test additional tools or capabilities, modify the script:

```javascript
// Add new tool parameters
if (config.tool === 'fetch' && config.path) {
    toolParams.path = config.path;
}

// Add new command line options
case '--path':
    config.path = value;
    break;
```

## how to get a token for testing

```bash
curl -X POST https://<your-hydra-host>/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=mcp-client" \
  -d "client_secret=mcp-secret" \
  -d "scope=openid profile email"
```

---

This tester provides a reliable way to validate MCP server compliance and debug protocol issues without relying on external services. 