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
                    if (!["node_modules", ".git", "target", "build", "dist"].includes(
                            entry.name
                        )) {
                        walk(fullPath);
                    }
                } else {
                    results.push(relativePath);
                }
            }
        } catch (error) {
            console.warn(
                `⚠️  Could not read directory ${currentDir}: ${error.message}`
            );
        }
    }

    walk(dir);
    return results;
}

// Tool implementations
async function handleFileRead(args) {
    const { id } = args;

    if (!id) {
        throw new Error("Resource ID is required");
    }

    // Treat the ID as a file path for our repository use case
    const filePath = id;
    const fullPath = path.join(REPO_PATH, filePath);

    // Security check
    if (!fullPath.startsWith(REPO_PATH)) {
        throw new Error("Invalid resource ID - outside repository");
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error("Resource not found");
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
        throw new Error("Resource is not a file");
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

async function handleFileSearch(args) {
  const { query } = args;

  if (!query) {
    throw new Error("Search query is required");
  }

  console.log(`🔍 Enhanced search for: "${query}"`);

  const results = [];
  const files = walkDirectory(REPO_PATH);
  const queryLower = query.toLowerCase();

  // Strategy 1: Exact filename matching (highest priority)
  const exactFilenameMatches = files.filter(file => {
    const fileName = path.basename(file).toLowerCase();
    return fileName === queryLower || fileName === queryLower + '.md' || fileName === queryLower + '.json';
  });

  console.log(`📁 Found ${exactFilenameMatches.length} exact filename matches`);

  // Strategy 2: Partial filename matching
  const partialFilenameMatches = files.filter(file => {
    const fileName = path.basename(file).toLowerCase();
    return fileName.includes(queryLower) && !exactFilenameMatches.includes(file);
  });

  console.log(`📂 Found ${partialFilenameMatches.length} partial filename matches`);

  // Strategy 3: Content search (existing functionality)
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
  function createResult(file, matchingLines, priority = 0) {
    const fileName = path.basename(file);
    const fileExt = path.extname(file);
    const title = `${fileName}${fileExt ? ` (${fileExt.substring(1).toUpperCase()} file)` : ""}`;

    let snippetText = "";
    if (matchingLines && matchingLines.length > 0) {
      const snippetLines = matchingLines.slice(0, 3);
      snippetText = snippetLines
        .map((match) => `Line ${match.lineNumber}: ${match.content}`)
        .join("\n");
    } else {
      // For filename matches, show first few lines of file
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
      id: file,
      title: title,
      text: snippetText,
      url: null,
      _priority: priority // Internal field for sorting
    };
  }

  // Process matches with priority scoring
  // Priority 1: Exact filename matches (highest)
  exactFilenameMatches.forEach(file => {
    results.push(createResult(file, null, 100));
  });

  // Priority 2: Partial filename matches
  partialFilenameMatches.forEach(file => {
    results.push(createResult(file, null, 50));
  });

  // Priority 3: Content matches (existing behavior)
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
                "STEP 1: Find files in this Git repository by searching through their text content.\n\nThis tool searches inside files (not filenames) and returns matches with file paths as 'id' values. Always use the 'fetch' tool next to get complete file content.\n\n🔄 WORKFLOW: search → fetch\n1. Use 'search' to find files containing your target content\n2. Use 'fetch' with the 'id' from search results to get full file content\n\n📋 EXAMPLES:\nTo get README.md:\n• search('# ') → finds files with markdown headers → fetch('README.md')\n• search('Getting Started') → finds README → fetch('README.md')\n• search('installation') → finds README → fetch('README.md')\n\nTo get package.json:\n• search('\"name\"') → finds package files → fetch('package.json')\n• search('dependencies') → finds package files → fetch('package.json')\n\nTo get main code files:\n• search('function') → finds JS/Python files → fetch('src/index.js')\n• search('class') → finds code files → fetch('lib/main.py')\n\n⚠️ IMPORTANT: The 'id' field in results is the file path - use it exactly in fetch()!\n\n🎯 BEST PRACTICES:\n• Search for content that would be IN the file you want\n• Use fetch() immediately after finding relevant files\n• For README: search for common terms like 'installation', 'features', '#'\n• For config: search for specific keys like 'name', 'version', 'dependencies'",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search term to find files. STRATEGIES:\n\n🎯 FILENAME SEARCH: Use exact filenames (e.g., 'README', 'package.json', 'index.js')\n📄 CONTENT SEARCH: Use text that appears inside files:\n  • For README: 'installation', 'getting started', '# ', '## '\n  • For package files: '\"name\"', 'dependencies', '\"version\"'\n  • For code: 'function', 'class', 'import', 'const'\n  • For config: specific keys or values you expect\n\n💡 TIPS: Short, specific terms work best. Avoid complex queries.",
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
                "STEP 2: Get the complete content of a file using its file path.\n\nUse this IMMEDIATELY AFTER search() to get full file content. The 'id' parameter must be the exact file path from search results.\n\n🔄 WORKFLOW: search → fetch\n1. search() returns results with 'id' fields (file paths)\n2. fetch() gets complete content using that exact 'id'\n\n📋 EXAMPLES:\nAfter search('# ') returns: {\"id\": \"README.md\", \"title\": \"README.md\", ...}\n→ fetch('README.md') gets the complete README content\n\nAfter search('dependencies') returns: {\"id\": \"package.json\", \"title\": \"package.json\", ...}\n→ fetch('package.json') gets the complete package.json\n\nAfter search('function') returns: {\"id\": \"src/index.js\", \"title\": \"index.js\", ...}\n→ fetch('src/index.js') gets the complete source code\n\n⚠️ CRITICAL: Always copy the 'id' field exactly - don't modify the path!\n\n✅ Correct: fetch('README.md'), fetch('src/components/App.js')\n❌ Wrong: fetch('README'), fetch('App.js')\n\nThe response includes the complete file text plus metadata (size, modified date, etc.).",
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