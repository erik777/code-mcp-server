# MCP Git Gateway with Google OAuth 2.0

An MCP (Model Context Protocol) server that provides secure, authenticated access to Git repository contents using Google OAuth 2.0 authentication.

## Features

- 🔐 **Google OAuth 2.0 Authentication** - Secure access control
- 📂 **Git Repository Access** - Browse and search repository files
- 🔍 **Multi-Strategy Search** - Filename and content-based search
- 📖 **File Content Retrieval** - Get complete file contents with metadata
- 🛡️ **Domain-Based Authorization** - Restrict access to specific email domains
- 🌐 **Production Ready** - Built for reverse proxy deployment

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure OAuth** (see OAuth Setup section below)

3. **Set Environment Variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Start the Server**
   ```bash
   npm start
   ```

## OAuth Setup

### 1. Create Google OAuth Application

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google+ API** (if not already enabled)
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth 2.0 Client IDs**
6. Set application type to **Web application**
7. Add authorized redirect URI:
   ```
   https://www.example.com/reverse/proxypath/oauth/callback
   ```

### 2. Configure Environment

Copy `env.example` to `.env` and update:

```env
# Required OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=generate-a-secure-random-string

# Server Configuration  
BASE_URL=https://www.example.com/reverse/proxypath
PORT=3131
REPO_PATH=./repo

# Email Domain Restriction
ALLOWED_EMAIL_DOMAIN=@yourdomain.com
```

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. OAuth Endpoints

- **Login**: `GET /oauth/login` - Initiate OAuth flow
- **Callback**: `GET /oauth/callback` - OAuth callback handler
- **Status**: `GET /oauth/status` - Check authentication status
- **Logout**: `GET /oauth/logout` - Clear session

## Usage

### 1. Authenticate
Visit `/oauth/login` to start OAuth flow:
```
https://www.example.com/reverse/proxypath/oauth/login
```

### 2. Access MCP Endpoint
After authentication, access the MCP endpoint:
```
POST https://www.example.com/reverse/proxypath/mcp
```

### 3. Available Tools

**Search Tool** - Find files by content or filename:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "README"
    }
  }
}
```

**Fetch Tool** - Get complete file content:
```json
{
  "jsonrpc": "2.0", 
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "fetch",
    "arguments": {
      "id": "README.md"
    }
  }
}
```

## Security

- **Domain Restriction**: Only users with email addresses ending with the configured domain are authorized
- **Session Management**: Secure session-based authentication
- **CSRF Protection**: OAuth state parameter validation
- **Path Traversal Prevention**: Repository boundary enforcement

## Deployment

The server is designed for reverse proxy deployment where:
- Public URL: `https://www.example.com/reverse/proxypath`
- Internal Path: `/` (mapped by reverse proxy)
- MCP Endpoint: `/mcp`

## API Reference

### Health Check
```bash
GET /health
```
Returns server status and configuration.

### OAuth Workflow
1. `GET /oauth/login` - Redirect to Google OAuth
2. User authorizes application
3. `GET /oauth/callback` - Handle OAuth response
4. Session established for MCP access

### MCP Protocol
Standard MCP server supporting:
- `initialize` - Server initialization
- `tools/list` - Available tool listing  
- `tools/call` - Tool execution

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | - | Google OAuth client secret |
| `SESSION_SECRET` | Yes | Random | Session encryption key |
| `BASE_URL` | No | https://www.example.com/reverse/proxypath | Public base URL |
| `PORT` | No | 3131 | Server port |
| `REPO_PATH` | No | ./repo | Repository path |
| `ALLOWED_EMAIL_DOMAIN` | No | @example.com | Allowed email domain for authorization |

## Development

```bash
# Development mode with auto-reload
npm run dev

# Run tests (if available)
npm test
```

## License

MIT
