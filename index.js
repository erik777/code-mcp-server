// MCP Git Gateway using official @modelcontextprotocol/sdk
// Stack: Node.js + Express + MCP SDK + simple-git

const express = require('express');

// Load environment files in priority order: .env.local > .env > defaults
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

// Configuration
const PORT = process.env.PORT || 3131;
const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, 'repo');
const git = simpleGit(REPO_PATH);

console.log('🚀 Starting MCP Git Gateway Server');
console.log(`📂 Repository path: ${REPO_PATH}`);
console.log(`🌐 Port: ${PORT}`);

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    console.error(`❌ ERROR: Missing repo at ${REPO_PATH}. Please set REPO_PATH environment variable.`);
    process.exit(1);
}

// Helper function to walk directory and find files
function walkDirectory(dir) {
    const results = [];

    function walk(currentDir) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                const relativePath = path.relative(REPO_PATH, fullPath);

                if (entry.isDirectory()) {
                    // Skip common build/cache directories
                    if (!['node_modules', '.git', 'target', 'build', 'dist'].includes(entry.name)) {
                        walk(fullPath);
                    }
                } else {
                    results.push(relativePath);
                }
            }
        } catch (error) {
            console.warn(`⚠️  Could not read directory ${currentDir}: ${error.message}`);
        }
    }

    walk(dir);
    return results;
}



// Tool implementations
async function handleFileRead(args) {
    const { path: filePath } = args;

    if (!filePath) {
        throw new Error('File path is required');
    }

    const fullPath = path.join(REPO_PATH, filePath);

    // Security check
    if (!fullPath.startsWith(REPO_PATH)) {
        throw new Error('Invalid file path - outside repository');
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error('File not found');
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
        throw new Error('Path is not a file');
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`📖 Read file: ${filePath} (${content.length} characters)`);

    return {
        content: [{
            type: 'text',
            text: content
        }]
    };
}

async function handleFileSearch(args) {
    const { query, file_pattern } = args;

    if (!query) {
        throw new Error('Search query is required');
    }

    const results = [];
    const files = walkDirectory(REPO_PATH);

    for (const file of files) {
        // Apply file pattern filter if provided
        if (file_pattern && !file.match(new RegExp(file_pattern.replace('*', '.*')))) {
            continue;
        }

        try {
            const fullPath = path.join(REPO_PATH, file);
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        file,
                        line: index + 1,
                        content: line.trim()
                    });
                }
            });
        } catch (error) {
            // Skip files that can't be read (binary, permissions, etc.)
            continue;
        }
    }

    console.log(`🔍 Search for "${query}" found ${results.length} matches`);

    return {
        content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
        }]
    };
}

async function handleListFiles(args) {
    const { directory = '' } = args;

    const targetDir = path.join(REPO_PATH, directory);

    // Security check
    if (!targetDir.startsWith(REPO_PATH)) {
        throw new Error('Invalid directory path - outside repository');
    }

    if (!fs.existsSync(targetDir)) {
        throw new Error('Directory not found');
    }

    const files = walkDirectory(targetDir);
    console.log(`📁 Listed ${files.length} files in ${directory || 'repository root'}`);

    return {
        content: [{
            type: 'text',
            text: JSON.stringify(files, null, 2)
        }]
    };
}

// Create Express app
const app = express();
app.use(express.json());

// Add CORS headers for OpenAI connector
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Handle POST requests for client-to-server communication
app.post('/mcp', async(req, res) => {
    const { jsonrpc, method, params, id } = req.body;

    console.log('📥 === INCOMING MCP REQUEST ===');
    console.log(`Method: ${method}`);
    console.log(`Body:`, JSON.stringify(req.body, null, 2));

    if (jsonrpc !== "2.0") {
        console.log("❌ INVALID JSON-RPC VERSION:", jsonrpc);
        return res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid Request" },
            id: null,
        });
    }

    try {
        let response;

        if (method === "initialize") {
            console.log("🚀 === INITIALIZE METHOD ===");
            response = {
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2025-03-26",
                    serverInfo: {
                        name: "code-mcp-server",
                        version: "1.0.0",
                    },
                    capabilities: {
                        tools: {},
                    },
                },
            };
        } else if (method === "tools/list") {
            console.log("🔧 === TOOLS/LIST METHOD ===");
            response = {
                jsonrpc: "2.0",
                id,
                result: {
                    tools: [{
                            name: "search",
                            description: "Search for text content within files in the repository",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: {
                                        type: "string",
                                        description: "Text to search for within files",
                                    },
                                    file_pattern: {
                                        type: "string",
                                        description: "Optional file pattern to limit search (e.g., '*.js', '*.vue', '*.md')",
                                    },
                                },
                                required: ["query"],
                            },
                        },
                        {
                            name: "fetch",
                            description: "Fetch and return the contents of a specific file from the repository",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    path: {
                                        type: "string",
                                        description: "Relative path to the file to fetch",
                                    },
                                },
                                required: ["path"],
                            },
                        },
                    ],
                },
            };
        } else if (method === "notifications/initialized") {
            console.log("🎉 === INITIALIZED NOTIFICATION ===");
            console.log("Client has completed initialization and is ready for normal operations");
            // Notifications don't expect a JSON-RPC response, just HTTP 200
            res.status(200).send();
            return;
        } else if (method === "tools/call") {
            console.log("⚡ === TOOLS/CALL METHOD ===");
            const { name, arguments: args } = params;
            console.log(`🎯 Tool: ${name}`);
            console.log(`📦 Arguments:`, JSON.stringify(args, null, 2));

            if (name === "fetch") {
                const result = await handleFileRead(args);
                response = {
                    jsonrpc: "2.0",
                    id,
                    result
                };
            } else if (name === "search") {
                const result = await handleFileSearch(args);
                response = {
                    jsonrpc: "2.0",
                    id,
                    result
                };
            } else {
                response = {
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32601,
                        message: `Tool not found: ${name}`
                    }
                };
            }
        } else {
            console.log("❓ === UNKNOWN METHOD ===");
            console.log(`🚨 UNHANDLED METHOD: "${method}"`);
            response = {
                jsonrpc: "2.0",
                id,
                error: {
                    code: -32601,
                    message: "Method not found"
                }
            };
        }

        console.log('📤 === OUTGOING MCP RESPONSE ===');
        console.log(`Response:`, JSON.stringify(response, null, 2));

        res.json(response);
    } catch (error) {
        console.error('❌ Error handling MCP request:', error);
        res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: 'Internal server error',
                data: error.message
            },
            id: req.body ? req.body.id : null
        });
    }
});

// Handle GET requests (optional SSE endpoint)
app.get('/mcp', (req, res) => {
    console.log('📡 GET request to /mcp - Server-to-client communication not implemented');
    res.status(405).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Method not allowed. Use POST for client-to-server communication.'
        },
        id: null
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'MCP Git Gateway',
        version: '1.0.0',
        repo: REPO_PATH
    });
});

// Start the server
async function main() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('🎉 MCP Git Gateway Server started successfully');
        console.log(`📡 Server is listening on http://localhost:${PORT}`);
        console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
        console.log(`💊 Health check: http://localhost:${PORT}/health`);
    });
}

// Handle graceful shutdown
process.on('SIGINT', async() => {
    console.log('\n🛑 Shutting down MCP server...');
    process.exit(0);
});

// Start the server
main().catch((error) => {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
});