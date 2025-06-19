// MCP Git Gateway using official @modelcontextprotocol/sdk with Google OAuth 2.0
// Stack: Node.js + MCP SDK + OAuth 2.0 + simple-git

// Load environment files in priority order: .env.test.local > .env.local > .env > defaults
require("dotenv").config({ path: ".env.test.local" });
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const logger = require("../logger");

// Compatibility function for logWithTimestamp -> Winston logger
function logWithTimestamp(level, ...messages) {
    const message = messages.join(' ');
    switch (level.toUpperCase()) {
        case 'DEBUG':
            logger.debug(message);
            break;
        case 'INFO':
            logger.info(message);
            break;
        case 'WARN':
        case 'WARNING':
            logger.warn(message);
            break;
        case 'ERROR':
            logger.error(message);
            break;
        case 'SUCCESS':
            logger.info(message);
            break;
        default:
            logger.info(`[${level}] ${message}`);
    }
}

const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const sdkPath = path.join(__dirname, "../../node_modules/@modelcontextprotocol/sdk/dist/cjs");
const { McpServer } = require(path.join(sdkPath, "server/mcp"));
const {
    StreamableHTTPServerTransport,
} = require(path.join(sdkPath, "server/streamableHttp"));
const simpleGit = require("simple-git");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const crypto = require("crypto");

// Import authentication modules
const { createSessionAuth, createSessionMiddleware, setupOAuthRoutes } = require("../auth/oauth-session");
const { parseOAuthConfig, validateOAuthConfig, logOAuthConfig } = require("../auth/oauth-config");

// Configuration
const PORT = process.env.PORT || 3131;
const REPO_PATH = process.env.REPO_PATH || "repo";
const git = simpleGit(REPO_PATH);

// OAuth Configuration
const SESSION_SECRET =
    process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex");
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "@example.com";

// OAuth Provider Configuration
const OAUTH_PROVIDER = (process.env.OAUTH_PROVIDER || "hydra").toLowerCase();
const OAUTH_SCOPES = (process.env.OAUTH_SCOPES || "openid profile email").split(
    " "
);

// Base URL Configuration with fallbacks
const BASE_URL = process.env.BASE_URL;
const MCP_INTERNAL_URL =
    process.env.MCP_INTERNAL_URL || "http://localhost:3131";
const HYDRA_INTERNAL_URL =
    process.env.HYDRA_INTERNAL_URL || "http://localhost:4444";

// Determine effective URLs
const EFFECTIVE_BASE_URL = BASE_URL || MCP_INTERNAL_URL;
const REDIRECT_URI = `${EFFECTIVE_BASE_URL}/oauth/callback`;

// Provider-specific configuration
let OAUTH_AUTH_URL, OAUTH_TOKEN_URL, OAUTH_USERINFO_URL, OAUTH_JWKS_URL;
let OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET;
let HYDRA_BROWSER_URL; // URL that browsers will be redirected to during OAuth flows

switch (OAUTH_PROVIDER) {
    case "hydra":
        HYDRA_BROWSER_URL =
            process.env.HYDRA_BROWSER_URL ||
            process.env.HYDRA_PUBLIC_URL ||
            HYDRA_INTERNAL_URL;
        OAUTH_AUTH_URL = `${HYDRA_BROWSER_URL}/oauth2/auth`;
        OAUTH_TOKEN_URL = `${HYDRA_BROWSER_URL}/oauth2/token`;
        OAUTH_USERINFO_URL = `${HYDRA_BROWSER_URL}/userinfo`;
        OAUTH_JWKS_URL = `${HYDRA_BROWSER_URL}/.well-known/jwks.json`;
        OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || "mcp-client";
        OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || "mcp-secret";
        break;
    case "google":
        OAUTH_AUTH_URL =
            process.env.OAUTH_AUTH_URL ||
            "https://accounts.google.com/o/oauth2/v2/auth";
        OAUTH_TOKEN_URL =
            process.env.OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
        OAUTH_USERINFO_URL =
            process.env.OAUTH_USERINFO_URL ||
            "https://www.googleapis.com/oauth2/v3/userinfo";
        OAUTH_JWKS_URL =
            process.env.OAUTH_JWKS_URL ||
            "https://www.googleapis.com/oauth2/v3/certs";
        OAUTH_CLIENT_ID =
            process.env.GOOGLE_CLIENT_ID ||
            process.env.OAUTH_CLIENT_ID ||
            "your-google-client-id.apps.googleusercontent.com";
        OAUTH_CLIENT_SECRET =
            process.env.GOOGLE_CLIENT_SECRET ||
            process.env.OAUTH_CLIENT_SECRET ||
            "your-google-client-secret";
        break;
    case "custom":
        OAUTH_AUTH_URL = process.env.OAUTH_AUTH_URL;
        OAUTH_TOKEN_URL = process.env.OAUTH_TOKEN_URL;
        OAUTH_USERINFO_URL = process.env.OAUTH_USERINFO_URL;
        OAUTH_JWKS_URL = process.env.OAUTH_JWKS_URL;
        OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || "your-client-id";
        OAUTH_CLIENT_SECRET =
            process.env.OAUTH_CLIENT_SECRET || "your-client-secret";
        if (!OAUTH_AUTH_URL || !OAUTH_TOKEN_URL || !OAUTH_USERINFO_URL) {
            logger.error(
                "❌ ERROR: Custom OAuth provider requires OAUTH_AUTH_URL, OAUTH_TOKEN_URL, and OAUTH_USERINFO_URL to be set"
            );
            process.exit(1);
        }
        break;
    default:
        logger.error(
            `❌ ERROR: Unsupported OAuth provider: ${OAUTH_PROVIDER}. Supported providers: hydra, google, custom`
        );
        process.exit(1);
}

logger.info("🚀 Starting MCP Git Gateway Server with OAuth 2.0");
logger.info(`📂 Repository path: ${REPO_PATH}`);
logger.info(`🌐 Port: ${PORT}`);
logger.info(`🔧 OAuth Provider: ${OAUTH_PROVIDER}`);
logger.info(
    `🌐 Base URL: ${EFFECTIVE_BASE_URL} ${
    BASE_URL ? "(configured)" : "(fallback)"
  }`
);
logger.info(`🔐 OAuth Redirect URI: ${REDIRECT_URI}`);
logger.info(`🔑 OAuth Client ID: ${OAUTH_CLIENT_ID}`);

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    logger.error(
        `❌ ERROR: Missing repo at ${REPO_PATH}. Please set REPO_PATH environment variable.`
    );
    process.exit(1);
}

// Logging now handled by Winston logger

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
            logWithTimestamp(
                "WARN",
                `Could not read directory ${currentDir}:`,
                error.message
            );
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
    logger.debug(`handleFileRead called with args:`, args);

    if (!id) {
        logger.error(`File ID is required - received args:`, args);
        throw new Error(
            "File ID is required - please provide the file path from search results"
        );
    }

    // Treat the ID as a file path for our repository use case
    const filePath = id;
    const fullPath = path.join(REPO_PATH, filePath);
    logWithTimestamp(
        "DEBUG",
        `Attempting to read file: ${filePath} (full path: ${fullPath})`
    );

    // Security check to prevent path traversal attacks
    if (!fullPath.startsWith(REPO_PATH)) {
        logWithTimestamp(
            "ERROR",
            `Security violation: File path '${filePath}' is outside repository bounds`
        );
        throw new Error(
            `Security violation: File path '${filePath}' is outside repository bounds`
        );
    }

    if (!fs.existsSync(fullPath)) {
        logWithTimestamp(
            "ERROR",
            `File not found: '${filePath}' does not exist in the repository`
        );
        throw new Error(
            `File not found: '${filePath}' does not exist in the repository`
        );
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
        logWithTimestamp(
            "ERROR",
            `Invalid target: '${filePath}' is not a file (it may be a directory)`
        );
        throw new Error(
            `Invalid target: '${filePath}' is not a file (it may be a directory)`
        );
    }

    const content = fs.readFileSync(fullPath, "utf8");
    logWithTimestamp(
        "SUCCESS",
        `Fetched resource: ${filePath} (${content.length} characters)`
    );

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
  logger.debug( `handleFileSearch called with args:`, args);

  if (!query) {
    logWithTimestamp(
      "ERROR",
      `Search query is required - received args:`,
      args
    );
    throw new Error(
      "Search query is required - please provide text to search for in files"
    );
  }

  if (typeof query !== "string") {
    logWithTimestamp(
      "ERROR",
      `Invalid query type: expected string, got ${typeof query}`
    );
    throw new Error(`Invalid query type: expected string, got ${typeof query}`);
  }

  if (query.trim().length === 0) {
    logger.error( `Search query cannot be empty`);
    throw new Error(
      "Search query cannot be empty - please provide meaningful search text"
    );
  }

  logger.info( `Enhanced search for: "${query}"`);

  const results = [];
  const files = walkDirectory(REPO_PATH);
  const queryLower = query.toLowerCase();

  logWithTimestamp(
    "DEBUG",
    `Found ${files.length} files in repository to search through`
  );

  // SEARCH STRATEGY 1: Exact filename matching (highest priority)
  // This catches queries like "README" → "README.md", "package.json" → "package.json"
  // Most direct way to find specific files when user knows the filename
  const exactFilenameMatches = files.filter((file) => {
    const fileName = path.basename(file).toLowerCase();
    return (
      fileName === queryLower ||
      fileName === queryLower + ".md" ||
      fileName === queryLower + ".json"
    );
  });

  logWithTimestamp(
    "DEBUG",
    `Found ${exactFilenameMatches.length} exact filename matches:`,
    exactFilenameMatches
  );

  // SEARCH STRATEGY 2: Partial filename matching (medium priority)
  // This catches queries like "package" → "package.json", "read" → "README.md"
  // Useful when user remembers part of filename but not exact name
  const partialFilenameMatches = files.filter((file) => {
    const fileName = path.basename(file).toLowerCase();
    return (
      fileName.includes(queryLower) && !exactFilenameMatches.includes(file)
    );
  });

  logWithTimestamp(
    "DEBUG",
    `Found ${partialFilenameMatches.length} partial filename matches:`,
    partialFilenameMatches
  );

  // SEARCH STRATEGY 3: Content text matching (content-based priority)
  // This searches inside files for the query text - most flexible but slowest
  // Priority is based on number of matches found within each file
  const contentMatches = [];
  for (const file of files) {
    if (
      exactFilenameMatches.includes(file) ||
      partialFilenameMatches.includes(file)
    ) {
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
      logWithTimestamp(
        "WARN",
        `Error reading file ${file} for content search:`,
        error.message
      );
      continue;
    }
  }

  logger.debug( `Found ${contentMatches.length} content matches`);

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
    const title = `${fileName}${
      fileExt ? ` (${fileExt.substring(1).toUpperCase()} file)` : ""
    }`;

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
        snippetText = lines
          .map((line, idx) => `Line ${idx + 1}: ${line.trim()}`)
          .join("\n");
      } catch (error) {
        snippetText = `File: ${fileName}`;
      }
    }

    return {
      id: file, // This is the key field - exact file path for use with fetch()
      title: title,
      text: snippetText,
      url: null,
      _priority: priority, // Internal field for sorting, removed before response
    };
  }

  // RESULT PROCESSING: Combine all matches with priority-based ranking
  // Priority 1: Exact filename matches (score: 100) - user likely wants this specific file
  exactFilenameMatches.forEach((file) => {
    results.push(createResult(file, null, 100));
  });

  // Priority 2: Partial filename matches (score: 50) - probable filename match
  partialFilenameMatches.forEach((file) => {
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
  results.forEach((result) => delete result._priority);

  // Limit results to prevent overwhelming responses
  const limitedResults = results.slice(0, 10);

  logWithTimestamp(
    "SUCCESS",
    `Returning ${limitedResults.length} prioritized results (${results.length} total found) for query: "${query}"`
  );

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
    logWithTimestamp(
      "DEBUG",
      `Validating OAuth token for provider: ${OAUTH_PROVIDER}...`
    );

    // Get user info from the configured OAuth provider
    const response = await axios.get(OAUTH_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userInfo = response.data;
    const email = userInfo.email;
    const name =
      userInfo.name ||
      userInfo.preferred_username ||
      userInfo.sub ||
      "Unknown User";

    logWithTimestamp(
      "INFO",
      `OAuth user: ${name} (${email}) via ${OAUTH_PROVIDER}`
    );

    // Check if email ends with allowed domain
    if (email && email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      logWithTimestamp(
        "SUCCESS",
        `User ${email} authorized (allowed domain: ${ALLOWED_EMAIL_DOMAIN})`
      );
      return true;
    } else {
      logWithTimestamp(
        "WARN",
        `User ${email} not authorized (required domain: ${ALLOWED_EMAIL_DOMAIN})`
      );
      return false;
    }
  } catch (error) {
    logWithTimestamp(
      "ERROR",
      `Error validating OAuth token for ${OAUTH_PROVIDER}:`,
      error.message
    );
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

logger.info( "MCP Server instance created");

// Register search tool
server.tool(
  "search",
  "STEP 1: Find files in any Git repository by searching through their text content.\n\nThis tool searches inside files (not just filenames) and returns matches with file paths as 'id' values. Always use the 'fetch' tool next to get complete file content.\n\n🔄 WORKFLOW: search → fetch\n1. Use 'search' to find files containing your target content\n2. Use 'fetch' with the 'id' from search results to get full file content\n\n📋 COMMON CODEBASE ANALYSIS PATTERNS:\n\n🏗️ PROJECT STRUCTURE & OVERVIEW:\n• search('README') → Find main documentation and project overview\n• search('package.json') or search('requirements.txt') → Find dependencies and project config\n• search('Dockerfile') or search('docker-compose') → Find containerization setup\n• search('.gitignore') → Understand what files are excluded\n\n🔧 TECHNOLOGY STACK DISCOVERY:\n• search('import ') or search('from ') → Find Python imports and dependencies\n• search('require(') or search('import {') → Find JavaScript/Node.js modules\n• search('<dependency>') or search('pom.xml') → Find Java/Maven dependencies\n• search('using ') or search('namespace ') → Find C#/.NET structure\n\n💼 CODE ARCHITECTURE & PATTERNS:\n• search('class ') → Find class definitions and OOP structure\n• search('function ') or search('def ') → Find function definitions\n• search('interface ') or search('type ') → Find TypeScript interfaces and types\n• search('async ') or search('await ') → Find asynchronous code patterns\n• search('TODO') or search('FIXME') → Find code comments and technical debt\n\n🎯 SPECIFIC FUNCTIONALITY:\n• search('API') or search('endpoint') → Find API definitions and routes\n• search('database') or search('DB') → Find database-related code\n• search('auth') or search('login') → Find authentication/authorization\n• search('config') or search('environment') → Find configuration management\n• search('test') or search('spec') → Find test files and testing patterns\n\n🔍 CODE QUALITY & PATTERNS:\n• search('console.log') or search('print(') → Find debugging statements\n• search('try {') or search('except:') → Find error handling patterns\n• search('if __name__') → Find Python entry points\n• search('module.exports') → Find Node.js module exports\n\n⚠️ IMPORTANT: The 'id' field in results is the file path - use it exactly in fetch()!\n\n🎯 BEST PRACTICES FOR CODEBASE ANALYSIS:\n• Start with README, package.json, or similar config files for project overview\n• Use specific technical terms rather than generic words\n• Search for common patterns in the target language (imports, classes, functions)\n• Look for configuration files to understand the tech stack\n• Search for test files to understand expected behavior\n• Use fetch() immediately after finding relevant files to get complete context",
  {
    query: z
      .string()
      .describe(
        "Search term to find files in any codebase. ANALYSIS STRATEGIES:\n\n🎯 PROJECT DISCOVERY:\n• Use exact filenames: 'README', 'package.json', 'requirements.txt', 'Dockerfile'\n• Find config files: 'config', '.env', 'settings', 'webpack', 'babel'\n• Locate build files: 'Makefile', 'pom.xml', 'build.gradle', 'CMakeLists'\n\n🔧 TECHNOLOGY PATTERNS:\n• JavaScript/Node: 'require(', 'import {', 'module.exports', 'async function'\n• Python: 'def ', 'class ', 'import ', 'from ', 'if __name__'\n• Java: 'public class', 'import java', '@Override', 'public static void main'\n• TypeScript: 'interface ', 'type ', 'export type', 'implements'\n• React: 'useState', 'useEffect', 'jsx', 'props'\n• C/C++: '#include', 'int main', 'class ', 'namespace'\n\n💼 ARCHITECTURE ANALYSIS:\n• Find entry points: 'main(', 'index.', 'app.', 'server.'\n• Database patterns: 'SELECT', 'INSERT', 'mongoose', 'sequelize', 'prisma'\n• API patterns: 'router', 'endpoint', 'route', 'controller', 'middleware'\n• Testing: 'test(', 'describe(', 'it(', 'assert', 'expect'\n\n💡 TIPS: Use specific code patterns, language keywords, or unique identifiers rather than generic terms."
      ),
  },
  async ({ query }) => {
    logger.info( `MCP Tool 'search' called with query: "${query}"`);
    try {
      const result = await handleFileSearch({ query });
      logWithTimestamp(
        "SUCCESS",
        `MCP Tool 'search' completed successfully for query: "${query}"`
      );
      return result;
    } catch (error) {
      logWithTimestamp(
        "ERROR",
        `MCP Tool 'search' failed for query: "${query}":`,
        error.message
      );
      throw error;
    }
  }
);

logger.info( "Search tool registered");

// Register fetch tool
server.tool(
  "fetch",
  "STEP 2: Get the complete content of any file using its file path.\n\nUse this IMMEDIATELY AFTER search() to get full file content for analysis. The 'id' parameter must be the exact file path from search results.\n\n🔄 WORKFLOW: search → fetch\n1. search() returns results with 'id' fields (file paths)\n2. fetch() gets complete content using that exact 'id'\n\n📋 CODEBASE ANALYSIS WORKFLOW:\n\n🏗️ PROJECT UNDERSTANDING:\nAfter search('README') → fetch('README.md')\n→ Understand project purpose, setup instructions, and architecture overview\n\nAfter search('package.json') → fetch('package.json')\n→ Analyze dependencies, scripts, project metadata, and technology stack\n\nAfter search('requirements.txt') → fetch('requirements.txt')\n→ Understand Python dependencies and environment setup\n\n💼 CODE ARCHITECTURE ANALYSIS:\nAfter search('class ') → fetch('src/models/User.js')\n→ Analyze class structure, methods, inheritance, and design patterns\n\nAfter search('function ') → fetch('utils/helpers.py')\n→ Examine function implementations, parameters, and logic\n\nAfter search('interface ') → fetch('types/api.ts')\n→ Review TypeScript interfaces and type definitions\n\n🎯 FUNCTIONALITY DEEP-DIVE:\nAfter search('API') → fetch('routes/api.js')\n→ Analyze API endpoints, request/response patterns, and routing logic\n\nAfter search('database') → fetch('config/database.js')\n→ Understand database configuration, connections, and queries\n\nAfter search('test') → fetch('tests/user.test.js')\n→ Examine test cases, expected behavior, and testing patterns\n\n🔧 CONFIGURATION & SETUP:\nAfter search('Dockerfile') → fetch('Dockerfile')\n→ Understand containerization setup and deployment configuration\n\nAfter search('config') → fetch('config/app.js')\n→ Analyze application configuration and environment variables\n\n⚠️ CRITICAL: Always copy the 'id' field exactly - don't modify the path!\n\n✅ Correct: fetch('README.md'), fetch('src/components/App.js'), fetch('tests/integration/api.test.py')\n❌ Wrong: fetch('README'), fetch('App.js'), fetch('api.test')\n\n🎯 ANALYSIS BEST PRACTICES:\n• Fetch configuration files first to understand the tech stack\n• Examine main entry points (index.js, main.py, App.java) for application structure\n• Review test files to understand expected functionality and usage patterns\n• Check documentation files for architecture decisions and design rationale\n• Analyze utility/helper files to understand common patterns and conventions\n• Look at error handling and logging implementations for debugging insights\n\nThe response includes the complete file text plus metadata (size, modified date, file extension) for comprehensive analysis.",
  {
    id: z
      .string()
      .describe(
        "File path relative to the repository root (e.g., 'README.md', 'src/index.js', 'package.json'). This should be the exact 'id' value returned from search results."
      ),
  },
  async ({ id }) => {
    logger.info( `MCP Tool 'fetch' called with id: "${id}"`);
    try {
      const result = await handleFileRead({ id });
      logWithTimestamp(
        "SUCCESS",
        `MCP Tool 'fetch' completed successfully for id: "${id}"`
      );
      return result;
    } catch (error) {
      logWithTimestamp(
        "ERROR",
        `MCP Tool 'fetch' failed for id: "${id}":`,
        error.message
      );
      throw error;
    }
  }
);

logger.info( "Fetch tool registered");

// Create Express app for OAuth handling
const app = express();

// Import Hydra routes
const hydraRoutes = require("../auth/hydra/hydra-routes");

app.use((req, res, next) => {
  logger.info(`[MCP] ${req.method} ${req.originalUrl}`);
  next();
});

// Add comprehensive request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const clientIP = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.get("User-Agent") || "unknown";
  const method = req.method;
  const url = req.originalUrl || req.url;
  const protocol = req.protocol;

  logWithTimestamp(
    "INFO",
    `🌐 HTTP ${method} ${url} - IP: ${clientIP} - UA: ${userAgent.substring(
      0,
      100
    )}`
  );

  // Log request headers (for debugging)
  logWithTimestamp(
    "DEBUG",
    `📋 Request headers:`,
    Object.keys(req.headers).reduce((acc, key) => {
      acc[key] = key.toLowerCase().includes("authorization")
        ? "[REDACTED]"
        : req.headers[key];
      return acc;
    }, {})
  );

  // Log session info if available
  if (req.session) {
    logWithTimestamp(
      "DEBUG",
      `🔐 Session info: authenticated=${!!req.session
        .accessToken}, sessionID=${req.sessionID?.substring(0, 8)}...`
    );
  }

  // Capture response details
  const originalSend = res.send;
  res.send = function (body) {
    let size = 0;
    if (body !== undefined && body !== null) {
      if (Buffer.isBuffer(body)) {
        size = body.length;
      } else if (typeof body === "string") {
        size = body.length;
      } else {
        size = JSON.stringify(body).length;
      }
    }
    logWithTimestamp(
      "INFO",
      `📤 HTTP ${method} ${url} - Status: ${res.statusCode} - Size: ${size} bytes`
    );
    return originalSend.call(this, body);
  };

  next();
});

// Session middleware for OAuth state management
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// Global middleware
app.use((req, res, next) => {
  if (req.path.startsWith("/mcp")) return next(); // skip for /mcp
  express.json()(req, res, next);
});

// Add cookie parser for CSRF handling
app.use(cookieParser());

// Add body parser for Hydra form submissions
app.use(express.urlencoded({ extended: true }));

// Mount Hydra routes
app.use("/hydra", hydraRoutes);
logger.info( "Hydra routes mounted on /hydra");

// --- Dynamic Client Registration stub for ChatGPT ---
app.post("/oauth/register", (req, res) => {
  logger.info( "Dynamic client registration requested");
  logger.debug( "Registration request body:", req.body);

  if (process.env.OAUTH_PROVIDER !== "hydra") {
    logWithTimestamp(
      "WARN",
      `Dynamic registration not supported for provider: ${process.env.OAUTH_PROVIDER}`
    );
    return res.status(400).json({
      error: "Dynamic registration only supported under Hydra",
      provider: process.env.OAUTH_PROVIDER,
    });
  }

  // Return static client credentials for ChatGPT
  const registrationResponse = {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    token_endpoint_auth_method: "client_secret_post",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    redirect_uris: [REDIRECT_URI],
    scope: OAUTH_SCOPES.join(" "),
  };

  logWithTimestamp(
    "SUCCESS",
    `Dynamic registration completed for client: ${OAUTH_CLIENT_ID}`
  );
  logger.debug( "Registration response:", {
    client_id: registrationResponse.client_id,
    grant_types: registrationResponse.grant_types,
    redirect_uris: registrationResponse.redirect_uris,
    scope: registrationResponse.scope,
  });

  return res.json(registrationResponse);
});
// -----------------------------------------------------

// OAuth initiation endpoint
app.get("/oauth/login", (req, res) => {
  logWithTimestamp(
    "INFO",
    `OAuth login initiated with provider: ${OAUTH_PROVIDER}`
  );

  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");
  req.session.oauthState = state;

  const authUrl = new URL(OAUTH_AUTH_URL);
  authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);

  logWithTimestamp(
    "INFO",
    `Redirecting to ${OAUTH_PROVIDER} OAuth: ${authUrl.toString()}`
  );
  res.redirect(authUrl.toString());
});

// OAuth callback endpoint
app.get("/oauth/callback", async (req, res) => {
  logger.info( "Processing OAuth callback");
  logger.debug( "OAuth callback query params:", req.query);

  const { code, state, error } = req.query;

  if (error) {
    logger.error( "OAuth error:", error);
    return res.status(400).json({ error: `OAuth error: ${error}` });
  }

  if (!code) {
    logWithTimestamp(
      "ERROR",
      "No authorization code received in OAuth callback"
    );
    return res.status(400).json({ error: "No authorization code received" });
  }

  if (state !== req.session.oauthState) {
    logWithTimestamp(
      "ERROR",
      `Invalid OAuth state parameter. Expected: ${req.session.oauthState}, Got: ${state}`
    );
    return res.status(400).json({ error: "Invalid state parameter" });
  }

  try {
    // Exchange code for token
    logWithTimestamp(
      "INFO",
      `Exchanging authorization code for access token with ${OAUTH_PROVIDER}`
    );
    const tokenResponse = await axios.post(OAUTH_TOKEN_URL, {
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    });

    const { access_token } = tokenResponse.data;
    logger.info( "Successfully obtained access token");

    // Validate user
    const isAuthorized = await validateUser(access_token);

    if (isAuthorized) {
      // Store token in session
      req.session.accessToken = access_token;
      logWithTimestamp(
        "SUCCESS",
        "OAuth authentication successful and user authorized"
      );
      res.json({
        success: true,
        message:
          "Authentication successful! You can now access the MCP endpoint.",
        redirect: "/mcp",
      });
    } else {
      logger.warn( "User not authorized for this service");
      res.status(403).json({
        error: `Access denied. Only users with ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.`,
      });
    }
  } catch (error) {
    logger.error( "Error during OAuth callback:", error.message);
    if (error.response) {
      logger.error( "OAuth API response error:", {
        status: error.response.status,
        data: error.response.data,
      });
    }
    res.status(500).json({ error: "Authentication failed" });
  }
});

// OAuth logout endpoint
app.get("/oauth/logout", (req, res) => {
  logger.info( "User logging out");
  req.session.destroy();
  res.json({ success: true, message: "Logged out successfully" });
});

// OAuth status endpoint
app.get("/oauth/status", async (req, res) => {
  logger.debug( "OAuth status check requested");

  if (req.session.accessToken) {
    try {
      const isValid = await validateUser(req.session.accessToken);
      if (isValid) {
        logger.info( "User authentication status: valid");
        res.json({ authenticated: true, message: "User is authenticated" });
      } else {
        logWithTimestamp(
          "WARN",
          "User authentication status: invalid, destroying session"
        );
        req.session.destroy();
        res.json({
          authenticated: false,
          message: "Token invalid or user not authorized",
        });
      }
    } catch (error) {
      logger.error( "Authentication check failed:", error.message);
      req.session.destroy();
      res.json({
        authenticated: false,
        message: "Authentication check failed",
      });
    }
  } else {
    logger.debug( "User authentication status: not authenticated");
    res.json({ authenticated: false, message: "User not authenticated" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  logger.debug( "Health check requested");
  res.json({
    status: "ok",
    server: "MCP Git Gateway with OAuth",
    version: "1.0.0",
    repo: REPO_PATH,
    oauth: {
      enabled: true,
      provider: OAUTH_PROVIDER,
      allowedDomain: ALLOWED_EMAIL_DOMAIN,
      baseUrl: EFFECTIVE_BASE_URL,
      redirectUri: REDIRECT_URI,
    },
  });
});

// OAuth authorization server metadata endpoint
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  logWithTimestamp(
    "DEBUG",
    `OAuth authorization server metadata requested for provider: ${OAUTH_PROVIDER}`
  );
  try {
    // Determine the base URL for OAuth endpoints
    // If BASE_URL is defined, use it; otherwise fall back to provider-specific URL
    let oauthBaseUrl;
    if (BASE_URL) {
      // Production case: use BASE_URL for all OAuth endpoints
      oauthBaseUrl = BASE_URL;
      logWithTimestamp(
        "DEBUG",
        `Using BASE_URL for OAuth endpoints: ${oauthBaseUrl}`
      );
    } else if (OAUTH_PROVIDER === "hydra") {
      // Dev/testing case: use HYDRA_BROWSER_URL for Hydra endpoints
      oauthBaseUrl = HYDRA_BROWSER_URL;
      logWithTimestamp(
        "DEBUG",
        `Using HYDRA_BROWSER_URL for OAuth endpoints: ${oauthBaseUrl}`
      );
    } else {
      // For other providers, extract base URL from auth endpoint
      oauthBaseUrl =
        OAUTH_AUTH_URL.split("/oauth2/auth")[0] ||
        OAUTH_AUTH_URL.split("/o/oauth2")[0];
      logWithTimestamp(
        "DEBUG",
        `Using extracted base URL for OAuth endpoints: ${oauthBaseUrl}`
      );
    }

    // Generate dynamic OAuth metadata based on configuration
    const metadata = {
      issuer: oauthBaseUrl,
      authorization_endpoint:
        BASE_URL && OAUTH_PROVIDER === "hydra"
          ? `${oauthBaseUrl}/oauth2/auth`
          : OAUTH_AUTH_URL,
      token_endpoint:
        BASE_URL && OAUTH_PROVIDER === "hydra"
          ? `${oauthBaseUrl}/oauth2/token`
          : OAUTH_TOKEN_URL,
      userinfo_endpoint:
        BASE_URL && OAUTH_PROVIDER === "hydra"
          ? `${oauthBaseUrl}/userinfo`
          : OAUTH_USERINFO_URL,
      scopes_supported: OAUTH_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
      ],
    };

    // Add JWKS URI if available
    if (OAUTH_JWKS_URL) {
      metadata.jwks_uri =
        BASE_URL && OAUTH_PROVIDER === "hydra"
          ? `${oauthBaseUrl}/.well-known/jwks.json`
          : OAUTH_JWKS_URL;
    }

    // Add dynamic client registration endpoint for ChatGPT
    metadata.registration_endpoint = `${EFFECTIVE_BASE_URL}/oauth/register`;

    // Add MCP-specific endpoints
    metadata.mcp_endpoints = {
      login: `${EFFECTIVE_BASE_URL}/oauth/login`,
      callback: `${EFFECTIVE_BASE_URL}/oauth/callback`,
      logout: `${EFFECTIVE_BASE_URL}/oauth/logout`,
      status: `${EFFECTIVE_BASE_URL}/oauth/status`,
      mcp: `${EFFECTIVE_BASE_URL}/mcp`,
    };

    res.setHeader("Content-Type", "application/json");
    
    // 🔍 LOG THE EXACT JSON BEING SENT TO CHATGPT
    logger.info("🔍 === OAUTH DISCOVERY RESPONSE ===");
    logger.info(`📤 Sending OAuth metadata to ${req.ip} (${req.get('user-agent')})`);
    logger.info(`📄 JSON Response: ${JSON.stringify(metadata, null, 2)}`);
    logger.info("🔍 === END OAUTH DISCOVERY RESPONSE ===");
    
    res.json(metadata);

    logWithTimestamp(
      "SUCCESS",
      `OAuth authorization server metadata served for ${OAUTH_PROVIDER} (base: ${oauthBaseUrl})`
    );
  } catch (error) {
    logWithTimestamp(
      "ERROR",
      "Error generating OAuth metadata:",
      error.message
    );
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to generate OAuth authorization server metadata",
    });
  }
});

// JWKS (JSON Web Key Set) endpoint for OAuth token verification
app.get("/.well-known/jwks.json", (req, res) => {
  logger.debug( "JWKS endpoint requested");
  try {
    const jwksPath = path.join(__dirname, "jwks.json");
    const jwks = JSON.parse(fs.readFileSync(jwksPath, "utf8"));

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(jwks);

    logger.info( "JWKS served successfully");
  } catch (error) {
    logger.error( "Error serving JWKS:", error.message);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to load JWKS",
    });
  }
});

// 🔍 ADD MCP PROTOCOL RESPONSE LOGGING
// Intercept all response methods to log MCP protocol details
function addMCPResponseLogging(res, sessionId) {
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.send = function (data) {
    logWithTimestamp(
      "DEBUG",
      `🔍 📤 MCP RESPONSE SEND (${sessionId}): Status=${res.statusCode}, Data=${
        typeof data === "string"
          ? data.substring(0, 500)
          : JSON.stringify(data).substring(0, 500)
      }`
    );
    return originalSend(data);
  };

  res.json = function (data) {
    logWithTimestamp(
      "DEBUG",
      `🔍 📤 MCP RESPONSE JSON (${sessionId}): Status=${
        res.statusCode
      }, Data=${JSON.stringify(data).substring(0, 500)}`
    );

    // 🎯 SPECIAL LOGGING FOR INITIALIZE RESPONSES
    if (data && data.result && data.result.protocolVersion) {
      logger.info( `🔧 === INITIALIZE RESPONSE ANALYSIS ===`);
      logWithTimestamp(
        "INFO",
        `🔧 Protocol Version: ${data.result.protocolVersion}`
      );
      logWithTimestamp(
        "INFO",
        `🔧 Server Info: ${JSON.stringify(data.result.serverInfo)}`
      );
      logWithTimestamp(
        "INFO",
        `🔧 Capabilities: ${JSON.stringify(data.result.capabilities)}`
      );

      if (data.result.capabilities && data.result.capabilities.tools) {
        logWithTimestamp(
          "INFO",
          `🔧 Tools Capability: ${JSON.stringify(
            data.result.capabilities.tools
          )}`
        );
      } else {
        logWithTimestamp(
          "ERROR",
          `❌ MISSING TOOLS CAPABILITY IN INITIALIZE RESPONSE!`
        );
      }
    }

    return originalJson(data);
  };

  res.write = function (chunk) {
    if (chunk) {
      const chunkStr = chunk.toString();
      logWithTimestamp(
        "DEBUG",
        `🔍 📤 MCP RESPONSE WRITE (${sessionId}): ${chunkStr.substring(0, 200)}`
      );

      // Check for specific MCP protocol patterns
      if (chunkStr.includes("protocolVersion")) {
        logWithTimestamp(
          "INFO",
          `🔧 === PROTOCOL VERSION DETECTED IN RESPONSE ===`
        );
        logger.info( `🔧 Response chunk: ${chunkStr}`);
      }

      if (chunkStr.includes("tools") && chunkStr.includes("search")) {
        logger.info( `🔧 === SEARCH TOOL DETECTED IN RESPONSE ===`);
        logWithTimestamp(
          "INFO",
          `🔧 Search tool chunk: ${chunkStr.substring(0, 300)}`
        );
      }
    }
    return originalWrite(chunk);
  };

  res.end = function (chunk) {
    if (chunk) {
      const chunkStr = chunk.toString();
      logWithTimestamp(
        "DEBUG",
        `🔍 📤 MCP RESPONSE END (${sessionId}): Status=${
          res.statusCode
        }, Final chunk: ${chunkStr.substring(0, 200)}`
      );
    } else {
      logWithTimestamp(
        "DEBUG",
        `🔍 📤 MCP RESPONSE END (${sessionId}): Status=${res.statusCode}, No final chunk`
      );
    }
    return originalEnd(chunk);
  };
}

// Track MCP transports by session ID
const transports = new Map();
const requestCounts = {}; // Track concurrent requests per session

// 🔍 Helper function to generate short IDs for request tracking
function generateShortId() {
  return Math.random().toString(36).substring(2, 8);
}

// Start the server with OAuth-protected MCP transport
async function main() {
  logWithTimestamp(
    "INFO",
    "Setting up StreamableHTTPServerTransport with OAuth..."
  );

  // Create MCP transport with proper initialization
  async function createTransport(sessionId = null) {
    const finalSessionId = sessionId || crypto.randomBytes(16).toString("hex");
    logWithTimestamp(
      "DEBUG",
      `🔧 Creating transport with sessionId: ${finalSessionId}`
    );

    const transport = new StreamableHTTPServerTransport(
      async (req, res) => {
        // This callback handles HTTP requests for the transport
        logWithTimestamp(
          "DEBUG",
          "🔧 StreamableHTTPServerTransport callback invoked"
        );
      },
      {
        // Use the provided sessionId
        sessionIdGenerator: () => finalSessionId,
      }
    );

    // 🔥 CRITICAL FIX: Connect and start the transport SYNCHRONOUSLY
    try {
      await server.connect(transport);
      logWithTimestamp(
        "SUCCESS",
        `✅ MCP server connected to new transport: ${finalSessionId}`
      );
    } catch (error) {
      logWithTimestamp(
        "ERROR",
        `❌ Failed to connect MCP transport ${finalSessionId}: ${error.message}`
      );
      throw error;
    }

    return transport;
  }

  // MCP authorization middleware
  const requireMCPAuth = async (req, res, next) => {
    logger.debug( "MCP authorization check initiated");

    // 1. Detect token sources
    const bearerHeader = req.headers.authorization || req.headers.Authorization;
    const bearerMatch = bearerHeader?.match(/^Bearer\s+(.+)$/i);
    const bearerToken = bearerMatch ? bearerMatch[1] : null;
    const sessionToken = req.session?.accessToken || null;
    const token = bearerToken || sessionToken; // prefer explicit Bearer

    logWithTimestamp(
      "DEBUG",
      `Auth sources → bearer=${!!bearerToken}, session=${!!sessionToken}`
    );

    // 2. No token at all → 401
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Supply an Authorization: Bearer <token> header or login via /oauth/login",
      });
    }

    try {
      // 3. Validate token (Hydra / Google / Custom)
      const isAuthorized = await validateUser(token);
      if (!isAuthorized) {
        return res.status(403).json({
          error: "User not authorized",
          message: `Only users with ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed.`,
        });
      }

      // 4. Stash the validated token on the request for downstream handlers
      req.mcpUserToken = token;
      next();
    } catch (err) {
      logger.error( "MCP authorization error:", err.message);
      return res.status(500).json({
        error: "Authorization check failed",
        message: err.message,
      });
    }
  };

  // MCP POST endpoint handler
  const mcpPostHandler = async (req, res) => {
    const userAgent = req.get("User-Agent") || "unknown";
    const ip = req.ip || req.connection?.remoteAddress || "unknown";

    logWithTimestamp(
      "INFO",
      `🌐 HTTP POST /mcp - IP: ${ip} - UA: ${userAgent}`
    );
    logWithTimestamp(
      "DEBUG",
      `📋 Request headers: ${JSON.stringify(req.headers)}`
    );

    try {
      // Add MCP response logging
      const sessionIdForLogging = req.get("mcp-session-id") || "unknown";
      addMCPResponseLogging(res, sessionIdForLogging);

      logger.info( "📨 MCP POST request received");
      logWithTimestamp(
        "DEBUG",
        `🔍 MCP POST body: ${JSON.stringify(req.body)}`
      );

      const mcpSessionId = req.get("mcp-session-id");
      const contentType = req.get("content-type");

      logWithTimestamp(
        "DEBUG",
        `🔍 MCP POST headers: mcp-session-id=${mcpSessionId}, content-type=${contentType}`
      );

      // Session ID resolution (use MCP header or fallback to Express session)
      const sessionIdResolution = mcpSessionId || req.sessionID || "default";
      logWithTimestamp(
        "DEBUG",
        `🔍 Session ID resolution: header=${mcpSessionId}, session=${req.sessionID}, final=${sessionIdResolution}`
      );

      const requestId = generateShortId();

      // Track concurrent requests per session
      if (!requestCounts[sessionIdResolution]) {
        requestCounts[sessionIdResolution] = 0;
      }
      requestCounts[sessionIdResolution]++;
      logWithTimestamp(
        "WARNING",
        `🚨 CONCURRENCY: Session ${sessionIdResolution} now has ${requestCounts[sessionIdResolution]} active requests: POST:${requestId}`
      );

      try {
        // Check if we have an existing transport for this session
        let transport = transports.get(sessionIdResolution);

        if (!transport) {
          logWithTimestamp(
            "INFO",
            `🚀 Bootstrap case: creating transport for requested session ${sessionIdResolution}`
          );
          transport = await createTransport(sessionIdResolution);

          // Store transport
          transports.set(sessionIdResolution, transport);
          logWithTimestamp(
            "INFO",
            `✅ ✅ Bootstrapped new transport for session ${sessionIdResolution}`
          );
        } else {
          logWithTimestamp(
            "DEBUG",
            `🔍 Using existing transport: ${sessionIdResolution}`
          );
        }

        // Handle the request through transport
        logWithTimestamp(
          "DEBUG",
          `🔍 About to call transport.handleRequest for session ${
            transport.sessionId || sessionIdResolution
          }`
        );
        logWithTimestamp(
          "DEBUG",
          `🔍 Headers already sent before transport call: ${res.headersSent}`
        );

        await transport.handleRequest(req, res);

        logWithTimestamp(
          "DEBUG",
          `🔍 After transport call - Headers sent: ${res.headersSent}, Status: ${res.statusCode}`
        );
        logWithTimestamp(
          "INFO",
          `📤 MCP POST response sent with status: ${res.statusCode}, size: ${
            res.get("Content-Length") || "unknown"
          } bytes`
        );
      } finally {
        // Decrement request count
        requestCounts[sessionIdResolution]--;
        logWithTimestamp(
          "WARNING",
          `🚨 CONCURRENCY: Session ${sessionIdResolution} request ${requestId} completed, ${requestCounts[sessionIdResolution]} remaining`
        );
      }
    } catch (error) {
      logger.error( `❌ ❌ MCP POST error: ${error.message}`);
      logger.error( `❌ ❌ MCP POST stack: ${error.stack}`);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
          },
          id: null,
        });
      }
    }
  };

  // MCP GET endpoint handler (for SSE streams)
  // This does not work with ChatGPT, but should work with MCP compliant clients.
  const mcpGetHandlerSSE = async (req, res) => {
    logger.info( "📡 MCP GET request received (SSE stream)");

    const headerSessionId = req.headers["mcp-session-id"];
    const sessionSessionId = req.session.mcpSessionId;

    // 🔍 TEMPORARY INSTRUMENTATION - Transport Registry Debug
    logWithTimestamp(
      "DEBUG",
      `🔍 MCP GET headers: mcp-session-id=${headerSessionId}, accept=${req.headers.accept}, last-event-id=${req.headers["last-event-id"]}`
    );
    logWithTimestamp(
      "DEBUG",
      `🔍 Session ID resolution: header=${headerSessionId}, session=${sessionSessionId}, final=${
        headerSessionId || sessionSessionId
      }`
    );
    logWithTimestamp(
      "DEBUG",
      `🔍 Current transports: ${Array.from(transports.keys()).join(",")}`
    );

    let sessionId = headerSessionId || sessionSessionId;
    let transport;

    // Create new transport if none exists
    if (!sessionId || !transports.has(sessionId)) {
      sessionId = headerSessionId || crypto.randomBytes(16).toString("hex");
      const newTransport = await createTransport(sessionId);
      logWithTimestamp(
        "DEBUG",
        `🔧 GET: Created transport with session ID: ${sessionId} (transport ID: ${newTransport.sessionId})`
      );
      transports.set(sessionId, newTransport);
      req.session.mcpSessionId = sessionId;
      transport = newTransport;

      logWithTimestamp(
        "INFO",
        `🌊 Establishing new SSE stream for session ${sessionId}`
      );
    } else {
      transport = transports.get(sessionId);
      logWithTimestamp(
        "DEBUG",
        `🔍 Using existing transport for SSE: ${sessionId}`
      );
    }

    try {
      const lastEventId = req.headers["last-event-id"];
      if (lastEventId) {
        logWithTimestamp(
          "INFO",
          `MCP client reconnecting with Last-Event-ID: ${lastEventId}`
        );
      } else {
        logWithTimestamp(
          "INFO",
          `🌊 Establishing SSE stream for session ${sessionId}`
        );
      }

      logWithTimestamp(
        "DEBUG",
        `🔍 About to call transport.handleRequest for GET session ${sessionId}`
      );
      logWithTimestamp(
        "DEBUG",
        `🔍 Headers already sent before transport call: ${res.headersSent}`
      );
      await transport.handleRequest(req, res);
      logWithTimestamp(
        "DEBUG",
        `🔍 After transport call - Headers sent: ${res.headersSent}, Status: ${res.statusCode}`
      );
    } catch (error) {
      logWithTimestamp(
        "ERROR",
        "Error handling MCP GET request:",
        error.message
      );
      if (!res.headersSent) {
        res.status(500).json({
          error: "SSE stream establishment failed",
          message: error.message,
        });
      }
    }
  };

  // MCP GET endpoint handler - Return 405 like working No_Auth version
  // This works with ChatGPT, but disables the SSE stream.
  const mcpGetHandler405 = async (req, res) => {
    const userAgent = req.get("User-Agent") || "unknown";
    const ip = req.ip || req.connection?.remoteAddress || "unknown";

    logger.info( `🌐 HTTP GET /mcp - IP: ${ip} - UA: ${userAgent}`);
    logWithTimestamp(
      "DEBUG",
      `📋 Request headers: ${JSON.stringify(req.headers)}`
    );

    logWithTimestamp(
      "INFO",
      "📡 GET request to /mcp - Method not allowed (forcing POST handshake)"
    );

    // Return 405 Method Not Allowed to force ChatGPT into proper POST sequence
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed. Use POST for client-to-server communication.",
      },
      id: null,
    });

    logWithTimestamp(
      "INFO",
      `📤 HTTP GET /mcp - Status: 405 - Size: 109 bytes`
    );
  };

  // MCP DELETE endpoint handler (for session termination)
  const mcpDeleteHandler = async (req, res) => {
    logWithTimestamp(
      "INFO",
      "🗑️ MCP DELETE request received (session termination)"
    );

    const headerSessionId = req.headers["mcp-session-id"];
    const sessionSessionId = req.session.mcpSessionId;

    // 🔍 TEMPORARY INSTRUMENTATION - Transport Registry Debug
    logWithTimestamp(
      "DEBUG",
      `🔍 MCP DELETE headers: mcp-session-id=${headerSessionId}`
    );
    logWithTimestamp(
      "DEBUG",
      `🔍 Session ID resolution: header=${headerSessionId}, session=${sessionSessionId}, final=${
        headerSessionId || sessionSessionId
      }`
    );
    logWithTimestamp(
      "DEBUG",
      `🔍 Current transports: ${Array.from(transports.keys()).join(",")}`
    );

    const sessionId = headerSessionId || sessionSessionId;

    // Accept DELETE even if transport doesn't exist
    if (!sessionId || !transports.has(sessionId)) {
      logWithTimestamp(
        "INFO",
        "❌ MCP DELETE request with invalid or missing session ID"
      );
      return res.status(400).json({
        error: "Invalid session",
        message: "Session ID not found or invalid",
      });
    }

    try {
      logger.info( `🔄 Terminating MCP session: ${sessionId}`);
      const transport = transports.get(sessionId);

      logWithTimestamp(
        "DEBUG",
        `🔍 About to call transport.handleRequest for DELETE session ${sessionId}`
      );
      logWithTimestamp(
        "DEBUG",
        `🔍 Headers already sent before transport call: ${res.headersSent}`
      );
      await transport.handleRequest(req, res);
      logWithTimestamp(
        "DEBUG",
        `🔍 After transport call - Headers sent: ${res.headersSent}, Status: ${res.statusCode}`
      );

      // Clean up transport
      transports.delete(sessionId);
      if (req.session.mcpSessionId === sessionId) {
        delete req.session.mcpSessionId;
      }

      logWithTimestamp(
        "SUCCESS",
        `✅ ✅ MCP session cleanup completed: ${sessionId}`
      );
    } catch (error) {
      logWithTimestamp(
        "ERROR",
        "Error handling MCP DELETE request:",
        error.message
      );
      if (!res.headersSent) {
        res.status(500).json({
          error: "Session termination failed",
          message: error.message,
        });
      }
    }
  };

  // Register MCP endpoints with authentication
  app.post("/mcp", requireMCPAuth, mcpPostHandler);
  app.get("/mcp", requireMCPAuth, mcpGetHandler405);
  app.delete("/mcp", requireMCPAuth, mcpDeleteHandler);

  logger.info( "MCP endpoints registered successfully");

  // Add catch-all for unmatched routes AFTER MCP endpoints are set up
  app.use("*", (req, res) => {
    logWithTimestamp(
      "WARN",
      `🚫 Unmatched route: ${req.method} ${req.originalUrl}`
    );
    res.status(404).json({
      error: "Route not found",
      method: req.method,
      path: req.originalUrl,
      message: "This endpoint does not exist on this server",
    });
  });

  // Start the Express server
  app.listen(PORT, "0.0.0.0", async () => {
    logWithTimestamp(
      "SUCCESS",
      `🎉 MCP Git Gateway Server with OAuth started successfully (${OAUTH_PROVIDER})`
    );
    logWithTimestamp(
      "INFO",
      `📡 Server is listening on http://localhost:${PORT}`
    );
    logger.info( `🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
    logWithTimestamp(
      "INFO",
      `🔐 OAuth login: http://localhost:${PORT}/oauth/login`
    );
    if (OAUTH_PROVIDER === "hydra") {
      logWithTimestamp(
        "INFO",
        `🔑 Hydra login: http://localhost:${PORT}/hydra/login`
      );
      logWithTimestamp(
        "INFO",
        `🛡️ Hydra consent: http://localhost:${PORT}/hydra/consent`
      );
    }
    logWithTimestamp(
      "INFO",
      `💊 Health check: http://localhost:${PORT}/health`
    );
    logWithTimestamp(
      "INFO",
      `🌐 Base URL: ${EFFECTIVE_BASE_URL} ${
        BASE_URL ? "(configured)" : "(fallback)"
      }`
    );
    logger.info( `📧 Allowed domain: ${ALLOWED_EMAIL_DOMAIN}`);
    logger.info( `🔧 OAuth Provider: ${OAUTH_PROVIDER}`);

    // Initialize Hydra client if using Hydra provider
    if (OAUTH_PROVIDER === "hydra") {
      try {
        const { initHydra } = require("../auth/hydra/hydra-init");
        await initHydra();
      } catch (error) {
        logWithTimestamp(
          "ERROR",
          "Failed to initialize Hydra client:",
          error.message
        );
        logWithTimestamp(
          "WARN",
          "Server will continue running, but OAuth may not work correctly"
        );
      }
    }
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    logger.info( "\n🛑 Shutting down MCP server...");

    // Close all active transports
    for (const sessionId of transports.keys()) {
      try {
        logger.info( `Closing transport for session ${sessionId}`);
        await transports.get(sessionId).close();
        transports.delete(sessionId);
      } catch (error) {
        logWithTimestamp(
          "ERROR",
          `Error closing transport for session ${sessionId}:`,
          error.message
        );
      }
    }

    logger.info( "Server shutdown complete");
    process.exit(0);
  });
}

function start({ enableAuth = true }) {
  // Mode 3: Standard (Full SDK + Full OAuth)
  logger.info(`[STANDARD] Starting MCP SDK server (auth: ${enableAuth})`);
  
  if (!enableAuth) {
    logger.info(`[STANDARD] WARNING: Running Mode 3 without authentication is unusual`);
    logger.info(`[STANDARD] Consider using Mode 1 (simple) for no-auth scenarios`);
  }
  
  // Start the server
  main().catch((error) => {
    logger.error( "💥 Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = { start };