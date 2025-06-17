# Code MCP Server

A Model Context Protocol (MCP) server that exposes Git repository contents to Large Language Models, built with the official `@modelcontextprotocol/sdk`.

## Features

- **Search**: Search for resources and return structured results with text snippets
- **Fetch**: Retrieve detailed structured content for specific resources (files) with metadata
- **OpenAI Compatible**: Uses standardized `search` and `fetch` tool names for ChatGPT deep research compatibility
- **Security**: Path traversal protection to keep access within the repository
- **Performance**: Skips common build directories (node_modules, .git, target, build, dist)

## Installation

```bash
npm install
```

## Configuration

The server loads environment variables in the following priority order:

1. **`.env.local`** (highest priority, for local development overrides)
2. **`.env`** (default settings, can be committed to git)
3. **Built-in defaults** (fallback values in code)

### Setup

1. Copy `env.example` to `.env` for default settings:
   ```bash
   cp env.example .env
   ```

2. For local development, create `.env.local` to override defaults:
   ```bash
   # .env.local (not committed to git)
   PORT=3131
   REPO_PATH=repo
   ```

This pattern allows you to:
- Keep default settings in `.env` (committed to git)
- Override locally in `.env.local` (ignored by git)
- Share consistent defaults while allowing personal overrides

## Usage

### Development Mode (Local Repository)

To run the server against your local oc-sc repository:

```bash
npm run dev
```

This will start the MCP server with `REPO_PATH=repo`.

### Testing

To test the server functionality:

```bash
npm test
```

This creates a test repository and verifies all tools work correctly.

### Custom Repository

To use with a different repository:

```bash
REPO_PATH=/path/to/your/repo node index.js
```

## OpenAI Integration

This server is designed to work with OpenAI's custom MCP connector. Here's how to connect it:

### 1. Start the Server

```bash
npm run dev
```

The server will output:
```
🚀 Starting MCP Git Gateway Server
📂 Repository path: /home/user/dev/myrepo
🌐 Port: 3131
🎉 MCP Git Gateway Server started successfully
📡 Server is listening on http://localhost:3131
🔗 MCP endpoint: http://localhost:3131/mcp
💊 Health check: http://localhost:3131/health
```

### 2. Connect via OpenAI ChatGPT

1. Go to ChatGPT and look for the MCP connection option
2. Add a new MCP server with these settings:
   - **Server URL**: `http://localhost:3131/mcp`
   - **Method**: HTTP POST
   - **Content-Type**: `application/json`

### 3. Available Tools

#### OpenAI ChatGPT Compatibility

This MCP server uses standardized tool names (`search` and `fetch`) that are specifically recognized by OpenAI's ChatGPT deep research feature. These tool names are required for proper integration with ChatGPT's MCP connector.

Once connected, ChatGPT will have access to these tools:

#### `search`
Searches for resources using the provided query string and returns matching results.
```json
{
  "query": "function name"
}
```

Returns a structured object with:
- `results`: Array of matching resources
  - `id`: Resource ID (file path)
  - `title`: Generated title from filename
  - `text`: Text snippet showing matching lines
  - `url`: null (for local files)

#### `fetch`
Retrieves detailed content for a specific resource identified by the given ID (file path).
```json
{
  "id": "relative/path/to/file.js"
}
```

Returns a structured object with:
- `id`: The resource ID (file path)
- `title`: Generated title from filename
- `text`: Complete file content
- `url`: null (for local files)
- `metadata`: File information (size, modification date, extension)

## Technical Details

- **Protocol**: Uses official MCP SDK for full specification compliance
- **Transport**: HTTP POST/GET with Express.js server
- **Port**: Configurable via `PORT` environment variable (default: 3131)
- **Endpoints**: 
  - `/mcp` - Main MCP protocol endpoint
  - `/health` - Health check endpoint
- **MCP Methods Supported**:
  - `initialize` - Protocol handshake and capability negotiation
  - `notifications/initialized` - Client readiness notification
  - `tools/list` - List available tools
  - `tools/call` - Execute tools (search, fetch)
- **Security**: Path traversal protection ensures access stays within repository bounds
- **Performance**: Intelligent directory filtering to avoid large build directories
- **Error Handling**: Comprehensive error handling with descriptive messages

## Troubleshooting

### Server Won't Start
- Ensure `REPO_PATH` points to a valid Git repository
- Check that Node.js version supports the MCP SDK

### OpenAI Connection Issues
- Verify the server starts without errors
- Check that the command path and arguments are correct in OpenAI settings
- Ensure environment variables are properly set

### No Files Found
- Verify `REPO_PATH` is correct
- Check repository permissions
- Ensure the directory isn't empty

## Development

The server includes comprehensive logging to help debug any issues:

```bash
# Enable verbose logging
DEBUG=* npm run dev
```

## Dependencies

- `@modelcontextprotocol/sdk`: Official MCP SDK
- `simple-git`: Git repository operations  
- `dotenv`: Environment variable loading
- `fs`: File system operations
- `path`: Path manipulation utilities
