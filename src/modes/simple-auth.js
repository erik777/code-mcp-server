// Mode 2: Simple MCP Server + OAuth (Minimal OAuth, ChatGPT compatible)
// Based on simple.js but with minimal OAuth flows for ChatGPT's connector
// Supports both OAuth authorization_code flow and Bearer token validation

const express = require("express");
const simpleGit = require("simple-git");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("../logger");
const session = require("express-session");
const crypto = require("crypto");

// Import authentication modules
const { createBearerAuth } = require("../auth/bearer-only");
const { parseOAuthConfig, validateOAuthConfig, logOAuthConfig } = require("../auth/oauth-config");

// Configuration
const REPO_PATH = process.env.REPO_PATH || "/home/erik/dev/ws/cursor/oc-sc/oc-ui";
const PORT = process.env.PORT || 3131;
const BASE_URL = process.env.BASE_URL;
const EFFECTIVE_BASE_URL = BASE_URL || `http://localhost:${PORT}`;

logger.info("[SIMPLE-AUTH] Starting Mode 2: Simple MCP Server + OAuth (Minimal flows)");
logger.info("[SIMPLE-AUTH] 🎯 EXPERIMENTAL: Testing minimal OAuth flows with ChatGPT Deep Research");
logger.info("[SIMPLE-AUTH] 📋 Features: MCP Tools + OAuth flows + Bearer token validation");

// Parse OAuth configuration
let oauthConfig;
try {
    oauthConfig = parseOAuthConfig(EFFECTIVE_BASE_URL);
    validateOAuthConfig(oauthConfig);
    logOAuthConfig(oauthConfig);
} catch (error) {
    logger.error("[SIMPLE-AUTH] ❌ OAuth configuration error:", error.message);
    process.exit(1);
}

// Utility functions (same as simple.js)

function walkDirectory(dir) {
    const files = [];
    const git = simpleGit(REPO_PATH);

    function walk(currentDir) {
        const items = fs.readdirSync(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory() && !item.startsWith(".")) {
                walk(itemPath);
            } else if (stat.isFile()) {
                const relativePath = path.relative(REPO_PATH, itemPath);
                files.push(relativePath);
            }
        }
    }

    try {
        walk(dir);
        return files;
    } catch (error) {
        logger.error("Error walking directory:", error);
        return [];
    }
}

// File operations (same as simple.js)
async function handleFileRead(args) {
    try {
        logger.info(`File read request: ${args.id}`);

        const filePath = path.join(REPO_PATH, args.id);

        if (!filePath.startsWith(REPO_PATH)) {
            throw new Error("Access denied: path outside repository");
        }

        if (!fs.existsSync(filePath)) {
            throw new Error("File not found");
        }

        const content = fs.readFileSync(filePath, "utf8");
        const stats = fs.statSync(filePath);

        logger.info(`File read successful: ${args.id} (${content.length} chars)`);

        return {
            id: args.id,
            title: `File: ${args.id}`,
            text: content,
            url: null,
            metadata: {
                size: stats.size.toString(),
                modified: stats.mtime.toISOString(),
                extension: path.extname(filePath),
            },
        };
    } catch (error) {
        logger.error(`File read failed for ${args.id}:`, error.message);
        throw error;
    }
}

async function handleFileSearch(args) {
    try {
        logger.info(`File search request: "${args.query}"`);

        const searchTerm = args.query.toLowerCase();
        const allFiles = walkDirectory(REPO_PATH);

        const results = [];
        let processedFiles = 0;

        for (const file of allFiles) {
            try {
                const filePath = path.join(REPO_PATH, file);
                const content = fs.readFileSync(filePath, "utf8");
                const lines = content.split("\n");

                const fileNameMatch =
                    file.toLowerCase().includes(searchTerm) ||
                    path.basename(file).toLowerCase().includes(searchTerm);

                const matchingLines = [];
                let contentMatches = 0;

                lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(searchTerm)) {
                        contentMatches++;
                        if (matchingLines.length < 10) {
                            matchingLines.push({
                                lineNumber: index + 1,
                                content: line.trim(),
                            });
                        }
                    }
                });

                if (fileNameMatch || contentMatches > 0) {
                    const priority = fileNameMatch ? 2 : contentMatches > 5 ? 1 : 0;
                    results.push(createResult(file, matchingLines, priority));
                }

                processedFiles++;
            } catch (error) {
                if (error.code !== "EISDIR" && !error.message.includes("ENOENT")) {
                    logger.warn(`Skipping file ${file}:`, error.message);
                }
            }
        }

        results.sort((a, b) => {
            const priorityDiff = (b.priority || 0) - (a.priority || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return a.id.localeCompare(b.id);
        });

        const limitedResults = results.slice(0, 50);

        logger.info(
            `Search completed: "${args.query}" → ${limitedResults.length} results (processed ${processedFiles} files)`
        );

        return { results: limitedResults };
    } catch (error) {
        logger.error(`Search failed for "${args.query}":`, error.message);
        throw error;
    }

    function createResult(file, matchingLines, priority = 0) {
        let snippet = `File: ${file}`;

        if (matchingLines.length > 0) {
            snippet += `\n\nMatching lines:\n`;
            matchingLines.forEach((match) => {
                snippet += `Line ${match.lineNumber}: ${match.content}\n`;
            });

            if (matchingLines.length === 10) {
                snippet += "... (showing first 10 matches)\n";
            }
        }

        return {
            id: file,
            title: `${path.basename(file)} (${file})`,
            text: snippet,
            url: null,
            priority,
        };
    }
}

// MCP JSON-RPC handler (similar to simple.js but with auth)
async function handleMCPRequest(req, res) {
    const { id, method, params } = req.body;

    logger.debug(`🚀 === ${method.toUpperCase()} METHOD ===`);

    try {
        let result;

        switch (method) {
            case "initialize":
                logger.info("Client requesting server capabilities");
                result = {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: { name: "mcp-git-gateway", version: "1.0.0" },
                    instructions: "You are a helpful assistant with access to a Git repository."
                };
                break;

            case "tools/list":
                logger.info("Client requesting available tools");
                result = {
                    tools: [{
                            name: "search",
                            description: "STEP 1: Search for files in the Git repository by filename or content.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: { type: "string", description: "Search query for filenames or file content" }
                                },
                                required: ["query"]
                            },
                            outputSchema: {
                                type: "object",
                                properties: {
                                    results: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string", description: "ID of the resource." },
                                                title: { type: "string", description: "Title or headline of the resource." },
                                                text: { type: "string", description: "Text snippet or summary from the resource." },
                                                url: { type: ["string", "null"], description: "URL of the resource. Optional but needed for citations to work." }
                                            },
                                            required: ["id", "title", "text"]
                                        }
                                    }
                                },
                                required: ["results"]
                            }
                        },
                        {
                            name: "fetch",
                            description: "STEP 2: Get the complete content of any file using its file path.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "File path relative to the repository root (e.g., 'README.md', 'src/index.js', 'package.json'). This should be the exact 'id' value returned from search results." }
                                },
                                required: ["id"]
                            },
                            outputSchema: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "ID of the resource." },
                                    title: { type: "string", description: "Title or headline of the fetched resource." },
                                    text: { type: "string", description: "Complete textual content of the resource." },
                                    url: { type: ["string", "null"], description: "URL of the resource. Optional but needed for citations to work." },
                                    metadata: { type: ["object", "null"], additionalProperties: { type: "string" }, description: "Optional metadata providing additional context." }
                                },
                                required: ["id", "title", "text"]
                            }
                        }
                    ]
                };
                break;

            case "tools/call":
                const { name, arguments: toolArgs } = params;
                logger.info(`Tool '${name}' called with args: ${JSON.stringify(toolArgs)}`);

                if (name === "search") {
                    const searchResult = await handleFileSearch(toolArgs);
                    result = { content: [{ type: "text", text: JSON.stringify(searchResult, null, 2) }] };
                } else if (name === "fetch") {
                    const fetchResult = await handleFileRead(toolArgs);
                    result = { content: [{ type: "text", text: JSON.stringify(fetchResult, null, 2) }] };
                } else {
                    throw new Error(`Unknown tool: ${name}`);
                }
                break;

            default:
                throw new Error(`Unknown method: ${method}`);
        }

        const response = { jsonrpc: "2.0", id, result };
        logger.info(`📤 === OUTGOING MCP RESPONSE ===`);
        logger.debug(`Response: ${JSON.stringify(response)}`);
        res.json(response);

    } catch (error) {
        logger.error(`❌ ${method} error: ${error.message}`);
        const errorResponse = {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: error.message }
        };
        res.status(500).json(errorResponse);
    }
}

// Handle notifications
async function handleMCPNotification(req, res) {
    const { method } = req.body;

    if (method === "notifications/initialized") {
        logger.info("🎉 === INITIALIZED NOTIFICATION ===");
        logger.info("Client has completed initialization and is ready for normal operations");
    }

    res.status(200).end(); // Notifications don't require responses
}

// Start function for mode system
async function start({ enableAuth = true }) {
    try {
        logger.info("[SIMPLE-AUTH] 🚀 Starting MCP Git Gateway Server (Bearer-only OAuth)");
        logger.info(`[SIMPLE-AUTH] 📂 Repository path: ${REPO_PATH}`);
        logger.info(`[SIMPLE-AUTH] 🌐 Port: ${PORT}`);

        // Create Express app
        const app = express();
        app.use(express.json());

        logger.info("[SIMPLE-AUTH] 📨 === MCP REQUEST LOGGING ===");

        // Request logging middleware
        app.use((req, res, next) => {
            if (req.path === "/mcp") {
                logger.info("📨 === INCOMING MCP REQUEST ===");
                logger.info(`Method: ${req.method}`);
                logger.info(`Content-Type: ${req.get("content-type")}`);
                logger.info(`Body: ${JSON.stringify(req.body)}`);
            }
            next();
        });

        // Response logging middleware
        const originalSend = app.response.send;
        app.response.send = function(body) {
            if (this.req.path === "/mcp") {
                logger.info("📤 === OUTGOING MCP RESPONSE ===");
                logger.info(`Response: ${body}`);
            }
            return originalSend.call(this, body);
        };

        // Create Bearer authentication middleware
        const bearerAuth = createBearerAuth(oauthConfig);

        // Add minimal session support (only for OAuth state parameter)
        app.use(session({
            secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex"),
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false, // Set to true in production with HTTPS
                httpOnly: true,
                maxAge: 10 * 60 * 1000, // 10 minutes (minimal for OAuth flow)
            },
        }));

        // CORS middleware
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Comprehensive HTTP request logging middleware
        app.use((req, res, next) => {
            const startTime = Date.now();
            logger.info(`📨 [HTTP] ${req.method} ${req.url} - Start`);
            logger.info(`📨 [HTTP] Headers: ${JSON.stringify(req.headers)}`);

            // Override res.send, res.json, etc. to capture responses
            const originalSend = res.send;
            const originalJson = res.json;
            const originalStatus = res.status;

            let statusCode = 200;
            let responseBody = null;

            res.status = function(code) {
                statusCode = code;
                return originalStatus.call(this, code);
            };

            res.send = function(body) {
                const duration = Date.now() - startTime;
                responseBody = body;
                logger.info(`📤 [HTTP] ${req.method} ${req.url} - ${statusCode} (${duration}ms)`);
                if (statusCode >= 400) {
                    logger.error(`❌ [HTTP] Error response body: ${body}`);
                }
                return originalSend.call(this, body);
            };

            res.json = function(obj) {
                const duration = Date.now() - startTime;
                responseBody = JSON.stringify(obj);
                logger.info(`📤 [HTTP] ${req.method} ${req.url} - ${statusCode} (${duration}ms)`);
                if (statusCode >= 400) {
                    logger.error(`❌ [HTTP] Error response JSON: ${JSON.stringify(obj)}`);
                }
                return originalJson.call(this, obj);
            };

            // Handle unhandled errors
            res.on('finish', () => {
                if (!res.headersSent) {
                    const duration = Date.now() - startTime;
                    logger.info(`📤 [HTTP] ${req.method} ${req.url} - ${res.statusCode || statusCode} (${duration}ms)`);
                }
            });

            next();
        });

        // OAuth discovery endpoint with error handling
        app.get('/.well-known/oauth-authorization-server', (req, res) => {
            try {
                logger.info('🔍 OAuth discovery request received');

                const issuer = process.env.ISSUER || `http://localhost:${PORT}`;
                const config = {
                    issuer: issuer,
                    authorization_endpoint: `${issuer}/oauth/login`,
                    token_endpoint: `${issuer}/oauth/callback`,
                    registration_endpoint: `${issuer}/oauth/register`,
                    response_types_supported: ["code"],
                    grant_types_supported: ["authorization_code"],
                    token_endpoint_auth_methods_supported: ["client_secret_post"],
                    scopes_supported: ["openid", "profile", "email"]
                };

                logger.info('✅ OAuth authorization server metadata served for Mode 2');
                res.json(config);
            } catch (error) {
                logger.error('❌ Error serving OAuth discovery endpoint:', error);
                res.status(500).json({ error: 'Internal server error', message: error.message });
            }
        });

        // OAuth registration endpoint with error handling
        app.post('/oauth/register', (req, res) => {
            try {
                logger.info('📝 OAuth client registration request received');

                // Simple client registration - return client ID
                const clientId = crypto.randomUUID();
                const clientSecret = crypto.randomBytes(32).toString('hex');

                const registrationData = {
                    client_id: clientId,
                    client_secret: clientSecret,
                    client_id_issued_at: Math.floor(Date.now() / 1000),
                    grant_types: ["authorization_code"],
                    response_types: ["code"],
                    token_endpoint_auth_method: "client_secret_post"
                };

                logger.info(`✅ OAuth client registered: ${clientId}`);
                res.json(registrationData);
            } catch (error) {
                logger.error('❌ Error in OAuth registration:', error);
                res.status(500).json({ error: 'Registration failed', message: error.message });
            }
        });

        // OAuth login endpoint with error handling  
        app.get('/oauth/login', (req, res) => {
            try {
                logger.info('🚪 OAuth login request received');

                const { client_id, redirect_uri, response_type, state, scope } = req.query;

                if (!client_id || !redirect_uri || response_type !== 'code') {
                    logger.error('❌ Invalid OAuth login parameters');
                    return res.status(400).json({ error: 'invalid_request', error_description: 'Missing or invalid parameters' });
                }

                // Store state for validation
                req.session.oauth_state = state;
                req.session.oauth_client_id = client_id;
                req.session.oauth_redirect_uri = redirect_uri;

                // Generate authorization code
                const authCode = crypto.randomBytes(32).toString('hex');
                req.session.auth_code = authCode;

                logger.info(`✅ OAuth authorization code generated for client: ${client_id}`);

                // Redirect back with code
                const redirectUrl = new URL(redirect_uri);
                redirectUrl.searchParams.set('code', authCode);
                if (state) redirectUrl.searchParams.set('state', state);

                res.redirect(redirectUrl.toString());
            } catch (error) {
                logger.error('❌ Error in OAuth login:', error);
                res.status(500).json({ error: 'server_error', error_description: error.message });
            }
        });

        // OAuth callback/token endpoint with error handling
        app.post('/oauth/callback', (req, res) => {
            try {
                logger.info('🔄 OAuth token exchange request received');

                const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

                if (grant_type !== 'authorization_code' || !code) {
                    logger.error('❌ Invalid token exchange parameters');
                    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid grant type or code' });
                }

                // Validate the authorization code (in real implementation, check against stored codes)
                if (!req.session.auth_code || req.session.auth_code !== code) {
                    logger.error('❌ Invalid authorization code');
                    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid authorization code' });
                }

                // Generate bearer token
                const accessToken = crypto.randomBytes(32).toString('hex');

                const tokenResponse = {
                    access_token: accessToken,
                    token_type: 'Bearer',
                    expires_in: 3600, // 1 hour
                    scope: 'openid profile email'
                };

                logger.info(`✅ OAuth token issued for client: ${client_id}`);
                res.json(tokenResponse);

                // Clear session data
                delete req.session.auth_code;
                delete req.session.oauth_state;
                delete req.session.oauth_client_id;
                delete req.session.oauth_redirect_uri;

            } catch (error) {
                logger.error('❌ Error in OAuth token exchange:', error);
                res.status(500).json({ error: 'server_error', error_description: error.message });
            }
        });

        // Health check endpoint (no auth required)
        app.get("/health", (req, res) => {
            logger.debug("Health check requested");
            res.json({
                status: "ok",
                server: "MCP Git Gateway (Simple + OAuth)",
                version: "1.0.0",
                mode: "simple-auth",
                repo: REPO_PATH,
                oauth: {
                    enabled: true,
                    provider: oauthConfig.provider,
                    allowedDomain: oauthConfig.allowedDomain,
                    authType: "minimal-oauth",
                    flows: ["authorization_code", "bearer_token"],
                    endpoints: {
                        discovery: `${EFFECTIVE_BASE_URL}/.well-known/oauth-authorization-server`,
                        login: `${EFFECTIVE_BASE_URL}/oauth/login`,
                        callback: `${EFFECTIVE_BASE_URL}/oauth/callback`,
                        register: `${EFFECTIVE_BASE_URL}/oauth/register`
                    },
                    note: "Minimal OAuth flows for ChatGPT connector + Bearer token validation"
                },
            });
        });

        // MCP endpoint with Bearer authentication
        app.post("/mcp", bearerAuth, async(req, res) => {
            logger.info("📨 MCP POST request received");

            // Handle notifications differently (they don't expect responses)
            if (req.body.method && req.body.method.startsWith("notifications/")) {
                await handleMCPNotification(req, res);
            } else {
                await handleMCPRequest(req, res);
            }
        });

        // Disable other HTTP methods for MCP endpoint
        app.get("/mcp", bearerAuth, (req, res) => {
            res.status(405).json({
                jsonrpc: "2.0",
                error: {
                    code: -32601,
                    message: "Method not allowed. Use POST for MCP requests.",
                },
                id: null,
            });
        });

        app.delete("/mcp", bearerAuth, (req, res) => {
            res.status(405).json({
                jsonrpc: "2.0",
                error: {
                    code: -32601,
                    message: "Method not allowed. Use POST for MCP requests.",
                },
                id: null,
            });
        });

        // Start the server
        app.listen(PORT, () => {
            logger.info("[SIMPLE-AUTH] 🎉 MCP Git Gateway Server started successfully");
            logger.info(`[SIMPLE-AUTH] 📡 Server is listening on http://localhost:${PORT}`);
            logger.info(`[SIMPLE-AUTH] 🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
            logger.info(`[SIMPLE-AUTH] 💊 Health check: http://localhost:${PORT}/health`);
            logger.info("[SIMPLE-AUTH] 🔐 Authentication: OAuth flows + Bearer token");
            logger.info(`[SIMPLE-AUTH] 🎯 Provider: ${oauthConfig.provider} (${oauthConfig.allowedDomain})`);
            logger.info(`[SIMPLE-AUTH] 🔍 Discovery: ${EFFECTIVE_BASE_URL}/.well-known/oauth-authorization-server`);
            logger.info(`[SIMPLE-AUTH] 🚪 Login: ${EFFECTIVE_BASE_URL}/oauth/login`);
            logger.info("[SIMPLE-AUTH] ✨ Ready for ChatGPT OAuth connector!");
        });

    } catch (error) {
        logger.error("[SIMPLE-AUTH] ❌ Failed to start server:", error);
        process.exit(1);
    }
}

module.exports = { start };