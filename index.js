// MCP Git Gateway using official @modelcontextprotocol/sdk
// Stack: Node.js + Express + MCP SDK + simple-git

const express = require("express");

// Load environment files in priority order: .env.local > .env > defaults
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");

// Configuration
const PORT = process.env.PORT || 3131;
const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, "repo");
const git = simpleGit(REPO_PATH);

console.log("🚀 Starting MCP Git Gateway Server");
console.log(`📂 Repository path: ${REPO_PATH}`);
console.log(`🌐 Port: ${PORT}`);

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    console.error(
        `❌ ERROR: Missing repo at ${REPO_PATH}. Please set REPO_PATH environment variable.`
    );
    process.exit(1);
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
            console.warn(
                `⚠️  Could not read directory ${currentDir}: ${error.message}`
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

    if (!id) {
        throw new Error("File ID is required - please provide the file path from search results");
    }

    // Treat the ID as a file path for our repository use case
    const filePath = id;
    const fullPath = path.join(REPO_PATH, filePath);

    // Security check to prevent path traversal attacks
    if (!fullPath.startsWith(REPO_PATH)) {
        throw new Error(`Security violation: File path '${filePath}' is outside repository bounds`);
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: '${filePath}' does not exist in the repository`);
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
        throw new Error(`Invalid target: '${filePath}' is not a file (it may be a directory)`);
    }

    const content = fs.readFileSync(fullPath, "utf8");
    console.log(
        `📖 Fetched resource: ${filePath} (${content.length} characters)`
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

  if (!query) {
    throw new Error("Search query is required - please provide text to search for in files");
  }

  if (typeof query !== 'string') {
    throw new Error(`Invalid query type: expected string, got ${typeof query}`);
  }

  if (query.trim().length === 0) {
    throw new Error("Search query cannot be empty - please provide meaningful search text");
  }

  console.log(`🔍 Enhanced search for: "${query}"`);

  const results = [];
  const files = walkDirectory(REPO_PATH);
  const queryLower = query.toLowerCase();

  // SEARCH STRATEGY 1: Exact filename matching (highest priority)
  // This catches queries like "README" → "README.md", "package.json" → "package.json"
  // Most direct way to find specific files when user knows the filename
  const exactFilenameMatches = files.filter(file => {
    const fileName = path.basename(file).toLowerCase();
    return fileName === queryLower || fileName === queryLower + '.md' || fileName === queryLower + '.json';
  });

  console.log(`📁 Found ${exactFilenameMatches.length} exact filename matches`);

  // SEARCH STRATEGY 2: Partial filename matching (medium priority)
  // This catches queries like "package" → "package.json", "read" → "README.md"
  // Useful when user remembers part of filename but not exact name
  const partialFilenameMatches = files.filter(file => {
    const fileName = path.basename(file).toLowerCase();
    return fileName.includes(queryLower) && !exactFilenameMatches.includes(file);
  });

  console.log(`📂 Found ${partialFilenameMatches.length} partial filename matches`);

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
      continue;
    }
  }

  console.log(`📄 Found ${contentMatches.length} content matches`);

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

  console.log(`🎯 Returning ${limitedResults.length} prioritized results (${results.length} total found)`);

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

async function handleListFiles(args) {
  const { directory = "" } = args;

  const targetDir = path.join(REPO_PATH, directory);

  // Security check
  if (!targetDir.startsWith(REPO_PATH)) {
    throw new Error("Invalid directory path - outside repository");
  }

  if (!fs.existsSync(targetDir)) {
    throw new Error("Directory not found");
  }

  const files = walkDirectory(targetDir);
  console.log(
    `📁 Listed ${files.length} files in ${directory || "repository root"}`
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(files, null, 2),
      },
    ],
  };
}

// Create Express app
const app = express();
app.use(express.json());

// Add CORS headers for OpenAI connector
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Handle POST requests for client-to-server communication
app.post("/mcp", async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  console.log("📥 === INCOMING MCP REQUEST ===");
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
          tools: [
            {
              name: "search",
              description:
                "STEP 1: Find files in any Git repository by searching through their text content.\n\nThis tool searches inside files (not just filenames) and returns matches with file paths as 'id' values. Always use the 'fetch' tool next to get complete file content.\n\n🔄 WORKFLOW: search → fetch\n1. Use 'search' to find files containing your target content\n2. Use 'fetch' with the 'id' from search results to get full file content\n\n📋 COMMON CODEBASE ANALYSIS PATTERNS:\n\n🏗️ PROJECT STRUCTURE & OVERVIEW:\n• search('README') → Find main documentation and project overview\n• search('package.json') or search('requirements.txt') → Find dependencies and project config\n• search('Dockerfile') or search('docker-compose') → Find containerization setup\n• search('.gitignore') → Understand what files are excluded\n\n🔧 TECHNOLOGY STACK DISCOVERY:\n• search('import ') or search('from ') → Find Python imports and dependencies\n• search('require(') or search('import {') → Find JavaScript/Node.js modules\n• search('<dependency>') or search('pom.xml') → Find Java/Maven dependencies\n• search('using ') or search('namespace ') → Find C#/.NET structure\n\n💼 CODE ARCHITECTURE & PATTERNS:\n• search('class ') → Find class definitions and OOP structure\n• search('function ') or search('def ') → Find function definitions\n• search('interface ') or search('type ') → Find TypeScript interfaces and types\n• search('async ') or search('await ') → Find asynchronous code patterns\n• search('TODO') or search('FIXME') → Find code comments and technical debt\n\n🎯 SPECIFIC FUNCTIONALITY:\n• search('API') or search('endpoint') → Find API definitions and routes\n• search('database') or search('DB') → Find database-related code\n• search('auth') or search('login') → Find authentication/authorization\n• search('config') or search('environment') → Find configuration management\n• search('test') or search('spec') → Find test files and testing patterns\n\n🔍 CODE QUALITY & PATTERNS:\n• search('console.log') or search('print(') → Find debugging statements\n• search('try {') or search('except:') → Find error handling patterns\n• search('if __name__') → Find Python entry points\n• search('module.exports') → Find Node.js module exports\n\n⚠️ IMPORTANT: The 'id' field in results is the file path - use it exactly in fetch()!\n\n🎯 BEST PRACTICES FOR CODEBASE ANALYSIS:\n• Start with README, package.json, or similar config files for project overview\n• Use specific technical terms rather than generic words\n• Search for common patterns in the target language (imports, classes, functions)\n• Look for configuration files to understand the tech stack\n• Search for test files to understand expected behavior\n• Use fetch() immediately after finding relevant files to get complete context",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search term to find files in any codebase. ANALYSIS STRATEGIES:\n\n🎯 PROJECT DISCOVERY:\n• Use exact filenames: 'README', 'package.json', 'requirements.txt', 'Dockerfile'\n• Find config files: 'config', '.env', 'settings', 'webpack', 'babel'\n• Locate build files: 'Makefile', 'pom.xml', 'build.gradle', 'CMakeLists'\n\n🔧 TECHNOLOGY PATTERNS:\n• JavaScript/Node: 'require(', 'import {', 'module.exports', 'async function'\n• Python: 'def ', 'class ', 'import ', 'from ', 'if __name__'\n• Java: 'public class', 'import java', '@Override', 'public static void main'\n• TypeScript: 'interface ', 'type ', 'export type', 'implements'\n• React: 'useState', 'useEffect', 'jsx', 'props'\n• C/C++: '#include', 'int main', 'class ', 'namespace'\n\n💼 ARCHITECTURE ANALYSIS:\n• Find entry points: 'main(', 'index.', 'app.', 'server.'\n• Database patterns: 'SELECT', 'INSERT', 'mongoose', 'sequelize', 'prisma'\n• API patterns: 'router', 'endpoint', 'route', 'controller', 'middleware'\n• Testing: 'test(', 'describe(', 'it(', 'assert', 'expect'\n\n💡 TIPS: Use specific code patterns, language keywords, or unique identifiers rather than generic terms.",
                  },
                },
                required: ["query"],
              },
              outputSchema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: {
                          type: "string",
                          description: "ID of the resource.",
                        },
                        title: {
                          type: "string",
                          description: "Title or headline of the resource.",
                        },
                        text: {
                          type: "string",
                          description:
                            "Text snippet or summary from the resource.",
                        },
                        url: {
                          type: ["string", "null"],
                          description:
                            "URL of the resource. Optional but needed for citations to work.",
                        },
                      },
                      required: ["id", "title", "text"],
                    },
                  },
                },
                required: ["results"],
              },
            },
            {
              name: "fetch",
              description:
                "STEP 2: Get the complete content of any file using its file path.\n\nUse this IMMEDIATELY AFTER search() to get full file content for analysis. The 'id' parameter must be the exact file path from search results.\n\n🔄 WORKFLOW: search → fetch\n1. search() returns results with 'id' fields (file paths)\n2. fetch() gets complete content using that exact 'id'\n\n📋 CODEBASE ANALYSIS WORKFLOW:\n\n🏗️ PROJECT UNDERSTANDING:\nAfter search('README') → fetch('README.md')\n→ Understand project purpose, setup instructions, and architecture overview\n\nAfter search('package.json') → fetch('package.json')\n→ Analyze dependencies, scripts, project metadata, and technology stack\n\nAfter search('requirements.txt') → fetch('requirements.txt')\n→ Understand Python dependencies and environment setup\n\n💼 CODE ARCHITECTURE ANALYSIS:\nAfter search('class ') → fetch('src/models/User.js')\n→ Analyze class structure, methods, inheritance, and design patterns\n\nAfter search('function ') → fetch('utils/helpers.py')\n→ Examine function implementations, parameters, and logic\n\nAfter search('interface ') → fetch('types/api.ts')\n→ Review TypeScript interfaces and type definitions\n\n🎯 FUNCTIONALITY DEEP-DIVE:\nAfter search('API') → fetch('routes/api.js')\n→ Analyze API endpoints, request/response patterns, and routing logic\n\nAfter search('database') → fetch('config/database.js')\n→ Understand database configuration, connections, and queries\n\nAfter search('test') → fetch('tests/user.test.js')\n→ Examine test cases, expected behavior, and testing patterns\n\n🔧 CONFIGURATION & SETUP:\nAfter search('Dockerfile') → fetch('Dockerfile')\n→ Understand containerization setup and deployment configuration\n\nAfter search('config') → fetch('config/app.js')\n→ Analyze application configuration and environment variables\n\n⚠️ CRITICAL: Always copy the 'id' field exactly - don't modify the path!\n\n✅ Correct: fetch('README.md'), fetch('src/components/App.js'), fetch('tests/integration/api.test.py')\n❌ Wrong: fetch('README'), fetch('App.js'), fetch('api.test')\n\n🎯 ANALYSIS BEST PRACTICES:\n• Fetch configuration files first to understand the tech stack\n• Examine main entry points (index.js, main.py, App.java) for application structure\n• Review test files to understand expected functionality and usage patterns\n• Check documentation files for architecture decisions and design rationale\n• Analyze utility/helper files to understand common patterns and conventions\n• Look at error handling and logging implementations for debugging insights\n\nThe response includes the complete file text plus metadata (size, modified date, file extension) for comprehensive analysis.",
              inputSchema: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "File path relative to the repository root (e.g., 'README.md', 'src/index.js', 'package.json'). This should be the exact 'id' value returned from search results.",
                  },
                },
                required: ["id"],
              },
              outputSchema: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "ID of the resource.",
                  },
                  title: {
                    type: "string",
                    description: "Title or headline of the fetched resource.",
                  },
                  text: {
                    type: "string",
                    description: "Complete textual content of the resource.",
                  },
                  url: {
                    type: ["string", "null"],
                    description:
                      "URL of the resource. Optional but needed for citations to work.",
                  },
                  metadata: {
                    type: ["object", "null"],
                    additionalProperties: {
                      type: "string",
                    },
                    description:
                      "Optional metadata providing additional context.",
                  },
                },
                required: ["id", "title", "text"],
              },
            },
          ],
        },
      };
    } else if (method === "notifications/initialized") {
      console.log("🎉 === INITIALIZED NOTIFICATION ===");
      console.log(
        "Client has completed initialization and is ready for normal operations"
      );
      // Notifications don't expect a JSON-RPC response, just HTTP 200
      res.status(200).send();
      return;
    } else if (method === "tools/call") {
      console.log("⚡ === TOOLS/CALL METHOD ===");
      const { name, arguments: args } = params;
      console.log(`🎯 Tool: ${name}`);
      console.log(`📦 Arguments:`, JSON.stringify(args, null, 2));

      try {
        if (name === "fetch") {
          const result = await handleFileRead(args);
          response = {
            jsonrpc: "2.0",
            id,
            result,
          };
        } else if (name === "search") {
          const result = await handleFileSearch(args);
          response = {
            jsonrpc: "2.0",
            id,
            result,
          };
        } else {
          response = {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Tool not found: ${name}`,
            },
          };
        }
      } catch (toolError) {
        console.error(`❌ Tool execution error for ${name}:`, toolError.message);
        response = {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: toolError.message,
            data: {
              tool: name,
              arguments: args
            }
          },
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
          message: "Method not found",
        },
      };
    }

    console.log("📤 === OUTGOING MCP RESPONSE ===");
    console.log(`Response:`, JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error("❌ Error handling MCP request:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error",
        data: error.message,
      },
      id: req.body ? req.body.id : null,
    });
  }
});

// Handle GET requests (optional SSE endpoint)
app.get("/mcp", (req, res) => {
  console.log(
    "📡 GET request to /mcp - Server-to-client communication not implemented"
  );
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message:
        "Method not allowed. Use POST for client-to-server communication.",
    },
    id: null,
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "MCP Git Gateway",
    version: "1.0.0",
    repo: REPO_PATH,
  });
});

// Start the server
async function main() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("🎉 MCP Git Gateway Server started successfully");
    console.log(`📡 Server is listening on http://localhost:${PORT}`);
    console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`💊 Health check: http://localhost:${PORT}/health`);
  });
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down MCP server...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("💥 Failed to start server:", error);
  process.exit(1);
});