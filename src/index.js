// MCP Git Gateway using official @modelcontextprotocol/sdk with Google OAuth 2.0
// Stack: Node.js + MCP SDK + OAuth 2.0 + simple-git

// Load environment files in priority order: .env.local > .env > defaults
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const crypto = require("crypto");

// Configuration
const PORT = process.env.PORT || 3131;
const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, "repo");
const git = simpleGit(REPO_PATH);

// OAuth Configuration
// TODO: Replace these with your actual Google OAuth client credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "your-google-client-id.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "your-google-client-secret";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// OAuth URLs
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const OAUTH_SCOPES = ["openid", "email", "profile"];
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "@example.com";

// Public base URL for OAuth callbacks
const BASE_URL = process.env.BASE_URL || "https://www.example.com/reverse/proxypath";
const REDIRECT_URI = `${BASE_URL}/oauth/callback`;

console.log("🚀 Starting MCP Git Gateway Server with OAuth 2.0");
console.log(`📂 Repository path: ${REPO_PATH}`);
console.log(`🌐 Port: ${PORT}`);
console.log(`🔐 OAuth Redirect URI: ${REDIRECT_URI}`);

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    console.error(
        `❌ ERROR: Missing repo at ${REPO_PATH}. Please set REPO_PATH environment variable.`
    );
    process.exit(1);
}

// Utility function for timestamped logging
function logWithTimestamp(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelEmoji = {
        'DEBUG': '🔍',
        'INFO': 'ℹ️',
        'WARN': '⚠️',
        'ERROR': '❌',
        'SUCCESS': '✅'
    };
    console.log(`[${timestamp}] ${levelEmoji[level] || '📝'} ${message}`, ...args);
}

/**
 * Recursively walks through a directory tree and returns all file paths.
 * 
 * This function traverses the directory structure while intelligently
 * skipping common build and cache directories to improve performance
 * and avoid irrelevant results.
 * 
 * @param {string} dir - Root directory to start walking from
 * @returns {string[]} Array of relative file paths from the repository root
 * 
 * @example
 * // Get all files in the repository
 * const files = walkDirectory("/path/to/repo")
 * // Returns: ["README.md", "src/index.js", "package.json", ...]
 */
function walkDirectory(dir) {
    const results = [];

    /**
     * Internal recursive function to walk directory tree
     * @param {string} currentDir - Current directory being processed
     */
    function walk(currentDir) {
        try {
            // Read directory entries with file type information for efficiency
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                const relativePath = path.relative(REPO_PATH, fullPath);

                if (entry.isDirectory()) {
                    // Skip common build/cache directories to improve performance
                    // and avoid scanning irrelevant files
                    if (!["node_modules", ".git", "target", "build", "dist"].includes(
                            entry.name
                        )) {
                        walk(fullPath); // Recursively process subdirectory
                    }
                } else {
                    // Add file to results list
                    results.push(relativePath);
                }
            }
        } catch (error) {
            // Log warning but continue processing other directories
            logWithTimestamp('WARN', `Could not read directory ${currentDir}:`, error.message);
        }
    }

    walk(dir);
    return results;
}

/**
 * Retrieves the complete content of a specific file from the Git repository.
 * 
 * This function fetches the full text content of a file along with metadata
 * including file size, modification date, and file extension. It includes
 * security checks to prevent path traversal attacks.
 * 
 * @param {Object} args - Fetch arguments
 * @param {string} args.id - File path relative to repository root (e.g., "README.md", "src/index.js")
 * @returns {Object} MCP-formatted response with file content and metadata
 * @throws {Error} If id is missing, file not found, or security violation
 * 
 * @example
 * // Fetch README.md content (typically after finding it via search)
 * await handleFileRead({ id: "README.md" })
 * 
 * @example
 * // Fetch a source file
 * await handleFileRead({ id: "src/components/App.js" })
 */
async function handleFileRead(args) {
    const { id } = args;
    logWithTimestamp('DEBUG', `handleFileRead called with args:`, args);

    if (!id) {
        logWithTimestamp('ERROR', `File ID is required - received args:`, args);
        throw new Error("File ID is required - please provide the file path from search results");
    }

    // Treat the ID as a file path for our repository use case
    const filePath = id;
    const fullPath = path.join(REPO_PATH, filePath);
    logWithTimestamp('DEBUG', `Attempting to read file: ${filePath} (full path: ${fullPath})`);

    // Security check to prevent path traversal attacks
    if (!fullPath.startsWith(REPO_PATH)) {
        logWithTimestamp('ERROR', `Security violation: File path '${filePath}' is outside repository bounds`);
        throw new Error(`Security violation: File path '${filePath}' is outside repository bounds`);
    }

    if (!fs.existsSync(fullPath)) {
        logWithTimestamp('ERROR', `File not found: '${filePath}' does not exist in the repository`);
        throw new Error(`File not found: '${filePath}' does not exist in the repository`);
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
        logWithTimestamp('ERROR', `Invalid target: '${filePath}' is not a file (it may be a directory)`);
        throw new Error(`Invalid target: '${filePath}' is not a file (it may be a directory)`);
    }

    const content = fs.readFileSync(fullPath, "utf8");
    logWithTimestamp('SUCCESS', `Fetched resource: ${filePath} (${content.length} characters)`);

    // Generate title from file name and extension
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const title = `${fileName}${
        fileExt ? ` (${fileExt.substring(1).toUpperCase()} file)` : ""
    }`;

    // Get file stats for metadata
    const lastModified = stats.mtime.toISOString();
    const fileSize = stats.size;

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(
                    {
                        id: id,
                        title: title,
                        text: content,
                        url: null, // No URL for local files
                        metadata: {
                            file_path: filePath,
                            file_size: fileSize.toString(),
                            last_modified: lastModified,
                            file_extension: fileExt.substring(1) || "no_extension",
                        },
                    },
                    null,
                    2
                ),
            },
        ],
    };
}

/**
 * Searches for files in the Git repository using a multi-strategy approach.
 * 
 * This function implements three search strategies in priority order:
 * 1. Exact filename matching (highest priority)
 * 2. Partial filename matching (medium priority) 
 * 3. Content text matching (content-based priority)
 * 
 * @param {Object} args - Search arguments
 * @param {string} args.query - The search query string
 * @returns {Object} MCP-formatted response with search results
 * @throws {Error} If query is missing or invalid
 * 
 * @example
 * // Find README.md by filename
 * await handleFileSearch({ query: "README" })
 * 
 * @example  
 * // Find files containing installation instructions
 * await handleFileSearch({ query: "installation" })
 */
async function handleFileSearch(args) {
    const { query } = args;
    logWithTimestamp('DEBUG', `handleFileSearch called with args:`, args);

    if (!query) {
        logWithTimestamp('ERROR', `Search query is required - received args:`, args);
        throw new Error("Search query is required - please provide text to search for in files");
    }

    if (typeof query !== 'string') {
        logWithTimestamp('ERROR', `Invalid query type: expected string, got ${typeof query}`);
        throw new Error(`Invalid query type: expected string, got ${typeof query}`);
    }

    if (query.trim().length === 0) {
        logWithTimestamp('ERROR', `Search query cannot be empty`);
        throw new Error("Search query cannot be empty - please provide meaningful search text");
    }

    logWithTimestamp('INFO', `Enhanced search for: "${query}"`);

    const results = [];
    const files = walkDirectory(REPO_PATH);
    const queryLower = query.toLowerCase();

    logWithTimestamp('DEBUG', `Found ${files.length} files in repository to search through`);

    // SEARCH STRATEGY 1: Exact filename matching (highest priority)
    // This catches queries like "README" → "README.md", "package.json" → "package.json"
    // Most direct way to find specific files when user knows the filename
    const exactFilenameMatches = files.filter(file => {
        const fileName = path.basename(file).toLowerCase();
        return fileName === queryLower || fileName === queryLower + '.md' || fileName === queryLower + '.json';
    });

    logWithTimestamp('DEBUG', `Found ${exactFilenameMatches.length} exact filename matches:`, exactFilenameMatches);

    // SEARCH STRATEGY 2: Partial filename matching (medium priority)
    // This catches queries like "package" → "package.json", "read" → "README.md"
    // Useful when user remembers part of filename but not exact name
    const partialFilenameMatches = files.filter(file => {
        const fileName = path.basename(file).toLowerCase();
        return fileName.includes(queryLower) && !exactFilenameMatches.includes(file);
    });

    logWithTimestamp('DEBUG', `Found ${partialFilenameMatches.length} partial filename matches:`, partialFilenameMatches);

    // SEARCH STRATEGY 3: Content text matching (content-based priority)
    // This searches inside files for the query text - most flexible but slowest
    // Priority is based on number of matches found within each file
    const contentMatches = [];
    for (const file of files) {
        if (exactFilenameMatches.includes(file) || partialFilenameMatches.includes(file)) {
            continue; // Skip files already matched by filename
        }

        try {
            const fullPath = path.join(REPO_PATH, file);
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");

            const matchingLines = [];
            lines.forEach((line, index) => {
                if (line.toLowerCase().includes(queryLower)) {
                    matchingLines.push({
                        lineNumber: index + 1,
                        content: line.trim(),
                    });
                }
            });

            if (matchingLines.length > 0) {
                contentMatches.push({ file, matchingLines });
            }
        } catch (error) {
            logWithTimestamp('WARN', `Error reading file ${file} for content search:`, error.message);
            continue;
        }
    }

    logWithTimestamp('DEBUG', `Found ${contentMatches.length} content matches`);

    // Helper function to create result entry
    /**
     * Creates a standardized result object for the MCP response
     * @param {string} file - File path relative to repository root
     * @param {Array} matchingLines - Array of line matches (for content search) or null (for filename search)
     * @param {number} priority - Priority score for sorting results
     * @returns {Object} Formatted result object
     */
    function createResult(file, matchingLines, priority = 0) {
        const fileName = path.basename(file);
        const fileExt = path.extname(file);
        const title = `${fileName}${fileExt ? ` (${fileExt.substring(1).toUpperCase()} file)` : ""}`;

        let snippetText = "";
        if (matchingLines && matchingLines.length > 0) {
            // For content matches: show the actual matching lines with line numbers
            const snippetLines = matchingLines.slice(0, 3);
            snippetText = snippetLines
                .map((match) => `Line ${match.lineNumber}: ${match.content}`)
                .join("\n");
        } else {
            // For filename matches: show first few lines of file as preview
            try {
                const fullPath = path.join(REPO_PATH, file);
                const content = fs.readFileSync(fullPath, "utf8");
                const lines = content.split("\n").slice(0, 3);
                snippetText = lines.map((line, idx) => `Line ${idx + 1}: ${line.trim()}`).join("\n");
            } catch (error) {
                snippetText = `File: ${fileName}`;
            }
        }

        return {
            id: file, // This is the key field - exact file path for use with fetch()
            title: title,
            text: snippetText,
            url: null,
            _priority: priority // Internal field for sorting, removed before response
        };
    }

    // RESULT PROCESSING: Combine all matches with priority-based ranking
    // Priority 1: Exact filename matches (score: 100) - user likely wants this specific file
    exactFilenameMatches.forEach(file => {
        results.push(createResult(file, null, 100));
    });

    // Priority 2: Partial filename matches (score: 50) - probable filename match
    partialFilenameMatches.forEach(file => {
        results.push(createResult(file, null, 50));
    });

    // Priority 3: Content matches (score: match count) - more matches = higher relevance
    contentMatches.forEach(({ file, matchingLines }) => {
        const priority = matchingLines.length; // More matches = higher priority
        results.push(createResult(file, matchingLines, priority));
    });

    // Sort by priority (highest first)
    results.sort((a, b) => b._priority - a._priority);

    // Remove internal priority field
    results.forEach(result => delete result._priority);

    // Limit results to prevent overwhelming responses
    const limitedResults = results.slice(0, 10);

    logWithTimestamp('SUCCESS', `Returning ${limitedResults.length} prioritized results (${results.length} total found) for query: "${query}"`);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(
                    {
                        results: limitedResults,
                    },
                    null,
                    2
                ),
            },
        ],
    };
}

/**
 * OAuth validation function
 * @param {string} token - OAuth access token
 * @returns {Promise<boolean>} Whether the user is authorized
 */
async function validateUser(token) {
    try {
        logWithTimestamp('DEBUG', 'Validating OAuth token...');
        
        // Get user info from Google
        const response = await axios.get(GOOGLE_USERINFO_URL, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const { email, name, picture } = response.data;
        logWithTimestamp('INFO', `OAuth user: ${name} (${email})`);

        // Check if email ends with allowed domain
        if (email && email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
            logWithTimestamp('SUCCESS', `User ${email} authorized (allowed domain: ${ALLOWED_EMAIL_DOMAIN})`);
            return true;
        } else {
            logWithTimestamp('WARN', `User ${email} not authorized (required domain: ${ALLOWED_EMAIL_DOMAIN})`);
            return false;
        }
    } catch (error) {
        logWithTimestamp('ERROR', 'Error validating OAuth token:', error.message);
        return false;
    }
}

// Create MCP Server
const server = new McpServer(
    {
        name: "code-mcp-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

logWithTimestamp('INFO', 'MCP Server instance created');

// Register search tool
server.tool(
    'search',
    'STEP 1: Find files in any Git repository by searching through their text content.\n\nThis tool searches inside files (not just filenames) and returns matches with file paths as \'id\' values. Always use the \'fetch\' tool next to get complete file content.\n\n🔄 WORKFLOW: search → fetch\n1. Use \'search\' to find files containing your target content\n2. Use \'fetch\' with the \'id\' from search results to get full file content\n\n📋 COMMON CODEBASE ANALYSIS PATTERNS:\n\n🏗️ PROJECT STRUCTURE & OVERVIEW:\n• search(\'README\') → Find main documentation and project overview\n• search(\'package.json\') or search(\'requirements.txt\') → Find dependencies and project config\n• search(\'Dockerfile\') or search(\'docker-compose\') → Find containerization setup\n• search(\'.gitignore\') → Understand what files are excluded\n\n🔧 TECHNOLOGY STACK DISCOVERY:\n• search(\'import \') or search(\'from \') → Find Python imports and dependencies\n• search(\'require(\') or search(\'import {\') → Find JavaScript/Node.js modules\n• search(\'<dependency>\') or search(\'pom.xml\') → Find Java/Maven dependencies\n• search(\'using \') or search(\'namespace \') → Find C#/.NET structure\n\n💼 CODE ARCHITECTURE & PATTERNS:\n• search(\'class \') → Find class definitions and OOP structure\n• search(\'function \') or search(\'def \') → Find function definitions\n• search(\'interface \') or search(\'type \') → Find TypeScript interfaces and types\n• search(\'async \') or search(\'await \') → Find asynchronous code patterns\n• search(\'TODO\') or search(\'FIXME\') → Find code comments and technical debt\n\n🎯 SPECIFIC FUNCTIONALITY:\n• search(\'API\') or search(\'endpoint\') → Find API definitions and routes\n• search(\'database\') or search(\'DB\') → Find database-related code\n• search(\'auth\') or search(\'login\') → Find authentication/authorization\n• search(\'config\') or search(\'environment\') → Find configuration management\n• search(\'test\') or search(\'spec\') → Find test files and testing patterns\n\n🔍 CODE QUALITY & PATTERNS:\n• search(\'console.log\') or search(\'print(\') → Find debugging statements\n• search(\'try {\') or search(\'except:\') → Find error handling patterns\n• search(\'if __name__\') → Find Python entry points\n• search(\'module.exports\') → Find Node.js module exports\n\n⚠️ IMPORTANT: The \'id\' field in results is the file path - use it exactly in fetch()!\n\n🎯 BEST PRACTICES FOR CODEBASE ANALYSIS:\n• Start with README, package.json, or similar config files for project overview\n• Use specific technical terms rather than generic words\n• Search for common patterns in the target language (imports, classes, functions)\n• Look for configuration files to understand the tech stack\n• Search for test files to understand expected behavior\n• Use fetch() immediately after finding relevant files to get complete context',
    {
        query: z.string().describe('Search term to find files in any codebase. ANALYSIS STRATEGIES:\n\n🎯 PROJECT DISCOVERY:\n• Use exact filenames: \'README\', \'package.json\', \'requirements.txt\', \'Dockerfile\'\n• Find config files: \'config\', \'.env\', \'settings\', \'webpack\', \'babel\'\n• Locate build files: \'Makefile\', \'pom.xml\', \'build.gradle\', \'CMakeLists\'\n\n🔧 TECHNOLOGY PATTERNS:\n• JavaScript/Node: \'require(\', \'import {\', \'module.exports\', \'async function\'\n• Python: \'def \', \'class \', \'import \', \'from \', \'if __name__\'\n• Java: \'public class\', \'import java\', \'@Override\', \'public static void main\'\n• TypeScript: \'interface \', \'type \', \'export type\', \'implements\'\n• React: \'useState\', \'useEffect\', \'jsx\', \'props\'\n• C/C++: \'#include\', \'int main\', \'class \', \'namespace\'\n\n💼 ARCHITECTURE ANALYSIS:\n• Find entry points: \'main(\', \'index.\', \'app.\', \'server.\'\n• Database patterns: \'SELECT\', \'INSERT\', \'mongoose\', \'sequelize\', \'prisma\'\n• API patterns: \'router\', \'endpoint\', \'route\', \'controller\', \'middleware\'\n• Testing: \'test(\', \'describe(\', \'it(\', \'assert\', \'expect\'\n\n💡 TIPS: Use specific code patterns, language keywords, or unique identifiers rather than generic terms.'),
    },
    async ({ query }) => {
        logWithTimestamp('INFO', `MCP Tool 'search' called with query: "${query}"`);
        try {
            const result = await handleFileSearch({ query });
            logWithTimestamp('SUCCESS', `MCP Tool 'search' completed successfully for query: "${query}"`);
            return result;
        } catch (error) {
            logWithTimestamp('ERROR', `MCP Tool 'search' failed for query: "${query}":`, error.message);
            throw error;
        }
    }
);

logWithTimestamp('INFO', 'Search tool registered');

// Register fetch tool
server.tool(
    'fetch',
    'STEP 2: Get the complete content of any file using its file path.\n\nUse this IMMEDIATELY AFTER search() to get full file content for analysis. The \'id\' parameter must be the exact file path from search results.\n\n🔄 WORKFLOW: search → fetch\n1. search() returns results with \'id\' fields (file paths)\n2. fetch() gets complete content using that exact \'id\'\n\n📋 CODEBASE ANALYSIS WORKFLOW:\n\n🏗️ PROJECT UNDERSTANDING:\nAfter search(\'README\') → fetch(\'README.md\')\n→ Understand project purpose, setup instructions, and architecture overview\n\nAfter search(\'package.json\') → fetch(\'package.json\')\n→ Analyze dependencies, scripts, project metadata, and technology stack\n\nAfter search(\'requirements.txt\') → fetch(\'requirements.txt\')\n→ Understand Python dependencies and environment setup\n\n💼 CODE ARCHITECTURE ANALYSIS:\nAfter search(\'class \') → fetch(\'src/models/User.js\')\n→ Analyze class structure, methods, inheritance, and design patterns\n\nAfter search(\'function \') → fetch(\'utils/helpers.py\')\n→ Examine function implementations, parameters, and logic\n\nAfter search(\'interface \') → fetch(\'types/api.ts\')\n→ Review TypeScript interfaces and type definitions\n\n🎯 FUNCTIONALITY DEEP-DIVE:\nAfter search(\'API\') → fetch(\'routes/api.js\')\n→ Analyze API endpoints, request/response patterns, and routing logic\n\nAfter search(\'database\') → fetch(\'config/database.js\')\n→ Understand database configuration, connections, and queries\n\nAfter search(\'test\') → fetch(\'tests/user.test.js\')\n→ Examine test cases, expected behavior, and testing patterns\n\n🔧 CONFIGURATION & SETUP:\nAfter search(\'Dockerfile\') → fetch(\'Dockerfile\')\n→ Understand containerization setup and deployment configuration\n\nAfter search(\'config\') → fetch(\'config/app.js\')\n→ Analyze application configuration and environment variables\n\n⚠️ CRITICAL: Always copy the \'id\' field exactly - don\'t modify the path!\n\n✅ Correct: fetch(\'README.md\'), fetch(\'src/components/App.js\'), fetch(\'tests/integration/api.test.py\')\n❌ Wrong: fetch(\'README\'), fetch(\'App.js\'), fetch(\'api.test\')\n\n🎯 ANALYSIS BEST PRACTICES:\n• Fetch configuration files first to understand the tech stack\n• Examine main entry points (index.js, main.py, App.java) for application structure\n• Review test files to understand expected functionality and usage patterns\n• Check documentation files for architecture decisions and design rationale\n• Analyze utility/helper files to understand common patterns and conventions\n• Look at error handling and logging implementations for debugging insights\n\nThe response includes the complete file text plus metadata (size, modified date, file extension) for comprehensive analysis.',
    {
        id: z.string().describe('File path relative to the repository root (e.g., \'README.md\', \'src/index.js\', \'package.json\'). This should be the exact \'id\' value returned from search results.'),
    },
    async ({ id }) => {
        logWithTimestamp('INFO', `MCP Tool 'fetch' called with id: "${id}"`);
        try {
            const result = await handleFileRead({ id });
            logWithTimestamp('SUCCESS', `MCP Tool 'fetch' completed successfully for id: "${id}"`);
            return result;
        } catch (error) {
            logWithTimestamp('ERROR', `MCP Tool 'fetch' failed for id: "${id}":`, error.message);
            throw error;
        }
    }
);

logWithTimestamp('INFO', 'Fetch tool registered');

// Create Express app for OAuth handling
const app = express();

// Import Hydra routes
const hydraRoutes = require('./hydra-routes');

app.use((req, res, next) => {
  console.log(`[MCP] ${req.method} ${req.originalUrl}`);
  next();
});

// Add comprehensive request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;
    const protocol = req.protocol;
    
    logWithTimestamp('INFO', `🌐 HTTP ${method} ${url} - IP: ${clientIP} - UA: ${userAgent.substring(0, 100)}`);
    
    // Log request headers (for debugging)
    logWithTimestamp('DEBUG', `📋 Request headers:`, Object.keys(req.headers).reduce((acc, key) => {
        acc[key] = key.toLowerCase().includes('authorization') ? '[REDACTED]' : req.headers[key];
        return acc;
    }, {}));
    
    // Log session info if available
    if (req.session) {
        logWithTimestamp('DEBUG', `🔐 Session info: authenticated=${!!req.session.accessToken}, sessionID=${req.sessionID?.substring(0, 8)}...`);
    }
    
    // Capture response details
    const originalSend = res.send;
    res.send = function(body) {
        logWithTimestamp('INFO', `📤 HTTP ${method} ${url} - Status: ${res.statusCode} - Size: ${Buffer.isBuffer(body) ? body.length : (typeof body === 'string' ? body.length : JSON.stringify(body).length)} bytes`);
        return originalSend.call(this, body);
    };
    
    next();
});

// Session middleware for OAuth state management
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

app.use(express.json());

// Add body parser for Hydra form submissions
app.use(express.urlencoded({ extended: true }));

// Mount Hydra routes
app.use('/hydra', hydraRoutes);
logWithTimestamp('INFO', 'Hydra routes mounted on /hydra');

// OAuth initiation endpoint
app.get("/oauth/login", (req, res) => {
    logWithTimestamp('INFO', 'OAuth login initiated');
    
    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
    authUrl.searchParams.set('state', state);

    logWithTimestamp('INFO', `Redirecting to Google OAuth: ${authUrl.toString()}`);
    res.redirect(authUrl.toString());
});

// OAuth callback endpoint
app.get("/oauth/callback", async (req, res) => {
    logWithTimestamp('INFO', 'Processing OAuth callback');
    logWithTimestamp('DEBUG', 'OAuth callback query params:', req.query);
    
    const { code, state, error } = req.query;

    if (error) {
        logWithTimestamp('ERROR', 'OAuth error:', error);
        return res.status(400).json({ error: `OAuth error: ${error}` });
    }

    if (!code) {
        logWithTimestamp('ERROR', 'No authorization code received in OAuth callback');
        return res.status(400).json({ error: "No authorization code received" });
    }

    if (state !== req.session.oauthState) {
        logWithTimestamp('ERROR', `Invalid OAuth state parameter. Expected: ${req.session.oauthState}, Got: ${state}`);
        return res.status(400).json({ error: "Invalid state parameter" });
    }

    try {
        // Exchange code for token
        logWithTimestamp('INFO', 'Exchanging authorization code for access token');
        const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        });

        const { access_token } = tokenResponse.data;
        logWithTimestamp('SUCCESS', 'Successfully obtained access token');

        // Validate user
        const isAuthorized = await validateUser(access_token);
        
        if (isAuthorized) {
            // Store token in session
            req.session.accessToken = access_token;
            logWithTimestamp('SUCCESS', 'OAuth authentication successful and user authorized');
            res.json({ 
                success: true, 
                message: "Authentication successful! You can now access the MCP endpoint.",
                redirect: "/mcp"
            });
        } else {
            logWithTimestamp('WARN', 'User not authorized for this service');
            res.status(403).json({ 
                error: `Access denied. Only users with ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.` 
            });
        }
    } catch (error) {
        logWithTimestamp('ERROR', 'Error during OAuth callback:', error.message);
        if (error.response) {
            logWithTimestamp('ERROR', 'OAuth API response error:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).json({ error: "Authentication failed" });
    }
});

// OAuth logout endpoint
app.get("/oauth/logout", (req, res) => {
    logWithTimestamp('INFO', 'User logging out');
    req.session.destroy();
    res.json({ success: true, message: "Logged out successfully" });
});

// OAuth status endpoint
app.get("/oauth/status", async (req, res) => {
    logWithTimestamp('DEBUG', 'OAuth status check requested');
    
    if (req.session.accessToken) {
        try {
            const isValid = await validateUser(req.session.accessToken);
            if (isValid) {
                logWithTimestamp('SUCCESS', 'User authentication status: valid');
                res.json({ authenticated: true, message: "User is authenticated" });
            } else {
                logWithTimestamp('WARN', 'User authentication status: invalid, destroying session');
                req.session.destroy();
                res.json({ authenticated: false, message: "Token invalid or user not authorized" });
            }
        } catch (error) {
            logWithTimestamp('ERROR', 'Authentication check failed:', error.message);
            req.session.destroy();
            res.json({ authenticated: false, message: "Authentication check failed" });
        }
    } else {
        logWithTimestamp('DEBUG', 'User authentication status: not authenticated');
        res.json({ authenticated: false, message: "User not authenticated" });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    logWithTimestamp('DEBUG', 'Health check requested');
    res.json({
        status: "ok",
        server: "MCP Git Gateway with OAuth",
        version: "1.0.0",
        repo: REPO_PATH,
        oauth: {
            enabled: true,
            provider: "Google",
            allowedDomain: ALLOWED_EMAIL_DOMAIN
        }
    });
});

// OAuth authorization server metadata endpoint
app.get("/.well-known/oauth-authorization-server", (req, res) => {
    logWithTimestamp('DEBUG', 'OAuth authorization server metadata requested');
    try {
        const metadataPath = path.join(__dirname, 'oauth-metadata.json');
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        res.setHeader('Content-Type', 'application/json');
        res.json(metadata);
        
        logWithTimestamp('SUCCESS', 'OAuth authorization server metadata served');
    } catch (error) {
        logWithTimestamp('ERROR', 'Error serving OAuth metadata:', error.message);
        res.status(500).json({
            error: "Internal server error",
            message: "Failed to load OAuth authorization server metadata"
        });
    }
});

// Start the server with OAuth-protected MCP transport
async function main() {
    logWithTimestamp('INFO', 'Setting up StreamableHTTPServerTransport with OAuth...');

    // Map to store transports by session ID (for session management)
    const transports = {};

    // Create StreamableHTTPServerTransport
    const createTransport = () => {
        return new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomBytes(16).toString('hex'),
            onsessioninitialized: (sessionId) => {
                logWithTimestamp('INFO', `New MCP session initialized: ${sessionId}`);
            },
            authorize: {
              type: 'oauth2',
              authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
              tokenUrl: 'https://oauth2.googleapis.com/token',
              userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
              scopes: ['openid', 'email', 'profile'],
              clientId: 'YOUR_CLIENT_ID',
              clientSecret: 'YOUR_CLIENT_SECRET',
              onTokenReceived: async (token, userInfo) => {
                if (userInfo.email !== 'you@example.com') {
                  throw new Error('Access denied')
                }
                return userInfo
              }
            }
        });
    };

    // MCP authorization middleware
    const requireMCPAuth = async (req, res, next) => {
        logWithTimestamp('DEBUG', 'MCP authorization check initiated');
        logWithTimestamp('DEBUG', `MCP request details: ${req.method} ${req.url}, sessionID: ${req.sessionID?.substring(0, 8)}...`);
        
        // Check if user has valid session token
        if (!req.session || !req.session.accessToken) {
            logWithTimestamp('ERROR', 'MCP authorization failed: No session or access token');
            return res.status(401).json({
                error: "Authentication required",
                message: "Please authenticate via OAuth first",
                loginUrl: "/oauth/login"
            });
        }

        // Validate the token and user
        logWithTimestamp('DEBUG', 'Validating user token for MCP access');
        try {
            const isAuthorized = await validateUser(req.session.accessToken);
            if (!isAuthorized) {
                logWithTimestamp('ERROR', 'MCP authorization failed: User not authorized');
                return res.status(403).json({
                    error: "User not authorized",
                    message: `Only users with ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.`
                });
            }

            logWithTimestamp('SUCCESS', 'MCP request authorized successfully');
            next();
        } catch (error) {
            logWithTimestamp('ERROR', 'MCP authorization error:', error.message);
            return res.status(500).json({
                error: "Authorization check failed",
                message: error.message
            });
        }
    };

    // MCP POST endpoint handler
    const mcpPostHandler = async (req, res) => {
        logWithTimestamp('INFO', 'MCP POST request received');
        logWithTimestamp('DEBUG', 'MCP POST body:', req.body);
        
        try {
            // Get or create session ID
            let sessionId = req.headers['mcp-session-id'] || req.session.mcpSessionId;
            
            if (!sessionId || !transports[sessionId]) {
                // Create new transport and session
                const transport = createTransport();
                sessionId = transport.sessionId || crypto.randomBytes(16).toString('hex');
                transports[sessionId] = transport;
                req.session.mcpSessionId = sessionId;
                
                // Connect server to transport
                await server.connect(transport);
                logWithTimestamp('SUCCESS', `MCP server connected to new transport: ${sessionId}`);
            }

            const transport = transports[sessionId];
            await transport.handleRequest(req, res, req.body);
            
        } catch (error) {
            logWithTimestamp('ERROR', 'Error handling MCP POST request:', error.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "MCP request processing failed",
                    message: error.message
                });
            }
        }
    };

    // MCP GET endpoint handler (for SSE streams)
    const mcpGetHandler = async (req, res) => {
        logWithTimestamp('INFO', 'MCP GET request received (SSE stream)');
        
        const sessionId = req.headers['mcp-session-id'] || req.session.mcpSessionId;
        if (!sessionId || !transports[sessionId]) {
            logWithTimestamp('ERROR', 'MCP GET request with invalid or missing session ID');
            return res.status(400).json({
                error: "Invalid or missing session ID",
                message: "Please make a POST request first to establish a session"
            });
        }

        try {
            const lastEventId = req.headers['last-event-id'];
            if (lastEventId) {
                logWithTimestamp('INFO', `MCP client reconnecting with Last-Event-ID: ${lastEventId}`);
            } else {
                logWithTimestamp('INFO', `Establishing new SSE stream for session ${sessionId}`);
            }

            const transport = transports[sessionId];
            await transport.handleRequest(req, res);
            
        } catch (error) {
            logWithTimestamp('ERROR', 'Error handling MCP GET request:', error.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "SSE stream establishment failed",
                    message: error.message
                });
            }
        }
    };

    // MCP DELETE endpoint handler (for session termination)
    const mcpDeleteHandler = async (req, res) => {
        logWithTimestamp('INFO', 'MCP DELETE request received (session termination)');
        
        const sessionId = req.headers['mcp-session-id'] || req.session.mcpSessionId;
        if (!sessionId || !transports[sessionId]) {
            logWithTimestamp('ERROR', 'MCP DELETE request with invalid or missing session ID');
            return res.status(400).json({
                error: "Invalid or missing session ID"
            });
        }

        try {
            logWithTimestamp('INFO', `Terminating MCP session: ${sessionId}`);
            const transport = transports[sessionId];
            await transport.handleRequest(req, res);
            
            // Clean up transport
            delete transports[sessionId];
            if (req.session.mcpSessionId === sessionId) {
                delete req.session.mcpSessionId;
            }
            
            logWithTimestamp('SUCCESS', `MCP session terminated: ${sessionId}`);
            
        } catch (error) {
            logWithTimestamp('ERROR', 'Error handling MCP DELETE request:', error.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "Session termination failed",
                    message: error.message
                });
            }
        }
    };

    // Register MCP endpoints with authentication
    app.post('/mcp', requireMCPAuth, mcpPostHandler);
    app.get('/mcp', requireMCPAuth, mcpGetHandler);
    app.delete('/mcp', requireMCPAuth, mcpDeleteHandler);

    logWithTimestamp('SUCCESS', 'MCP endpoints registered successfully');

    // Add catch-all for unmatched routes AFTER MCP endpoints are set up
    app.use('*', (req, res) => {
        logWithTimestamp('WARN', `🚫 Unmatched route: ${req.method} ${req.originalUrl}`);
        logWithTimestamp('DEBUG', 'Available routes:', [
            'GET /oauth/login',
            'GET /oauth/callback', 
            'GET /oauth/status',
            'GET /oauth/logout',
            'GET /hydra/login',
            'POST /hydra/login',
            'GET /hydra/consent',
            'GET /hydra/health',
            'GET /health',
            'GET /.well-known/oauth-authorization-server',
            'POST /mcp (MCP protocol endpoint)',
            'GET /mcp (MCP SSE stream)',
            'DELETE /mcp (MCP session termination)'
        ]);
        
        res.status(404).json({
            error: "Route not found",
            method: req.method,
            path: req.originalUrl,
            message: "This endpoint does not exist on this server",
            availableEndpoints: [
                'GET /oauth/login - Initiate OAuth flow',
                'GET /oauth/callback - OAuth callback handler', 
                'GET /oauth/status - Check authentication status',
                'GET /oauth/logout - Logout user',
                'GET /hydra/login - Hydra login challenge handler',
                'POST /hydra/login - Hydra login form submission',
                'GET /hydra/consent - Hydra consent challenge handler',
                'GET /hydra/health - Hydra health check',
                'GET /health - Server health check',
                'GET /.well-known/oauth-authorization-server - OAuth server metadata',
                'POST /mcp - MCP protocol endpoint (requires authentication)',
                'GET /mcp - MCP SSE stream (requires authentication)',
                'DELETE /mcp - MCP session termination (requires authentication)'
            ]
        });
    });

    // Start the Express server
    app.listen(PORT, "0.0.0.0", () => {
        logWithTimestamp('SUCCESS', '🎉 MCP Git Gateway Server with OAuth started successfully');
        logWithTimestamp('INFO', `📡 Server is listening on http://localhost:${PORT}`);
        logWithTimestamp('INFO', `🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
        logWithTimestamp('INFO', `🔐 OAuth login: http://localhost:${PORT}/oauth/login`);
        logWithTimestamp('INFO', `🔑 Hydra login: http://localhost:${PORT}/hydra/login`);
        logWithTimestamp('INFO', `🛡️ Hydra consent: http://localhost:${PORT}/hydra/consent`);
        logWithTimestamp('INFO', `💊 Health check: http://localhost:${PORT}/health`);
        logWithTimestamp('INFO', `🌐 Public base URL: ${BASE_URL}`);
        logWithTimestamp('INFO', `📧 Allowed domain: ${ALLOWED_EMAIL_DOMAIN}`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        logWithTimestamp('INFO', '\n🛑 Shutting down MCP server...');
        
        // Close all active transports
        for (const sessionId in transports) {
            try {
                logWithTimestamp('INFO', `Closing transport for session ${sessionId}`);
                await transports[sessionId].close();
                delete transports[sessionId];
            } catch (error) {
                logWithTimestamp('ERROR', `Error closing transport for session ${sessionId}:`, error.message);
            }
        }
        
        logWithTimestamp('SUCCESS', 'Server shutdown complete');
        process.exit(0);
    });
}

// Start the server
main().catch((error) => {
    logWithTimestamp('ERROR', '💥 Failed to start server:', error);
    process.exit(1);
});