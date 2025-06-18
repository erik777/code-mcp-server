// MCP Git Gateway using original JSON-RPC implementation
// MODE 1: Simple (No Auth) - Original No_Auth implementation
// Stack: Node.js + Express + simple-git (no MCP SDK, no OAuth)

function start({ enableAuth = false }) {
    // Mode 1 always ignores enableAuth - this mode never has authentication
    console.log(`[SIMPLE] Starting simple MCP server (no auth)`);

    const express = require("express");

    // Load environment files in priority order: .env.local > .env > defaults
    require("dotenv").config({ path: ".env.local" });
    require("dotenv").config({ path: ".env" });

    const fs = require("fs");
    const path = require("path");
    const simpleGit = require("simple-git");

    // Configuration - adjust path for new directory structure
    const PORT = process.env.PORT || 3131;
    const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, "../../repo");
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

    console.log(`🔍 Search query: "${query}"`);

    const allFiles = walkDirectory(REPO_PATH);
    const results = [];
    const maxResults = 20;
    const maxContentLength = 500;

    /**
     * Creates a standardized result object for search matches
     * @param {string} file - File path relative to repository root
     * @param {string[]} matchingLines - Array of content lines that matched the query
     * @param {number} priority - Search priority (0=highest, higher number=lower priority)
     * @returns {Object} Formatted search result
     */
    function createResult(file, matchingLines, priority = 0) {
      const fileName = path.basename(file);
      const fileExt = path.extname(file);
      
      let text;
      if (matchingLines.length > 0) {
        // Content match - show relevant excerpts
        text = matchingLines.slice(0, 3).join("\n");
        if (text.length > maxContentLength) {
          text = text.substring(0, maxContentLength) + "...";
        }
      } else {
        // Filename match - show file info
        text = `File: ${fileName}${fileExt ? ` (${fileExt.substring(1).toUpperCase()})` : ""}`;
      }

      const title = `${fileName}${fileExt ? ` (${fileExt.substring(1).toUpperCase()} file)` : ""}`;

      return {
        id: file,
        title: title,
        text: text,
        url: null,
        priority: priority,
        matchType: matchingLines.length > 0 ? "content" : "filename"
      };
    }

    // Strategy 1: Exact filename matches (highest priority)
    const exactMatches = allFiles.filter(file => {
      const fileName = path.basename(file).toLowerCase();
      return fileName === query.toLowerCase();
    });

    exactMatches.forEach(file => {
      results.push(createResult(file, [], 0));
    });

    // Strategy 2: Partial filename matches (medium priority)
    const partialMatches = allFiles.filter(file => {
      const fileName = path.basename(file).toLowerCase();
      return fileName.includes(query.toLowerCase()) && !exactMatches.includes(file);
    });

    partialMatches.forEach(file => {
      results.push(createResult(file, [], 1));
    });

    // Strategy 3: Content matches (content-based priority)
    const contentMatches = [];
    const remainingFiles = allFiles.filter(file => 
      !exactMatches.includes(file) && !partialMatches.includes(file)
    );

    for (const file of remainingFiles.slice(0, 100)) { // Limit content search for performance
      try {
        const fullPath = path.join(REPO_PATH, file);
        const stats = fs.statSync(fullPath);
        
        // Skip large files and binary files for performance
        if (stats.size > 1024 * 1024) continue; // Skip files larger than 1MB
        
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        const matchingLines = lines.filter(line => 
          line.toLowerCase().includes(query.toLowerCase())
        );

        if (matchingLines.length > 0) {
          // Priority based on number of matches and match density
          const priority = 2 + Math.max(0, 10 - matchingLines.length);
          contentMatches.push(createResult(file, matchingLines, priority));
        }
      } catch (error) {
        // Skip files that can't be read (binary files, permission issues, etc.)
        continue;
      }
    }

    results.push(...contentMatches);

    // Sort by priority (lower number = higher priority) and limit results
    results.sort((a, b) => a.priority - b.priority);
    const limitedResults = results.slice(0, maxResults);

    // Remove priority field from final results (internal use only)
    const finalResults = limitedResults.map(({ priority, matchType, ...result }) => result);

    console.log(`📋 Found ${finalResults.length} results for "${query}"`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              results: finalResults,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json({ limit: "10mb" }));

  // CORS middleware for cross-origin requests
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // MCP endpoint - handle JSON-RPC requests
  app.post("/mcp", async (req, res) => {
    try {
      console.log("📨 === INCOMING MCP REQUEST ===");
      console.log(`Method: ${req.method}`);
      console.log(`Content-Type: ${req.headers["content-type"]}`);
      console.log(`Body:`, JSON.stringify(req.body, null, 2));

      const { jsonrpc, id, method, params } = req.body;
      let response;

      if (method === "initialize") {
        console.log("🚀 === INITIALIZATION METHOD ===");
        console.log("Client requesting server capabilities");
        response = {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "mcp-git-gateway",
              version: "1.0.0",
            },
            instructions: "You are a helpful assistant with access to a Git repository.",
          },
        };
      } else if (method === "tools/list") {
        console.log("🛠️ === TOOLS/LIST METHOD ===");
        console.log("Client requesting available tools");
        response = {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "search",
                description: "STEP 1: Search for files in the Git repository by filename or content.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Search query for filenames or file content",
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
                            description: "Text snippet or summary from the resource.",
                          },
                          url: {
                            type: ["string", "null"],
                            description: "URL of the resource. Optional but needed for citations to work.",
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
                description: "STEP 2: Get the complete content of any file using its file path.",
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
                      description: "URL of the resource. Optional but needed for citations to work.",
                    },
                    metadata: {
                      type: ["object", "null"],
                      additionalProperties: {
                        type: "string",
                      },
                      description: "Optional metadata providing additional context.",
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
        console.log("Client has completed initialization and is ready for normal operations");
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
    console.log("📡 GET request to /mcp - Server-to-client communication not implemented");
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for client-to-server communication.",
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log("🎉 MCP Git Gateway Server started successfully");
    console.log(`📡 Server is listening on http://localhost:${PORT}`);
    console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`💊 Health check: http://localhost:${PORT}/health`);
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down MCP server...");
    process.exit(0);
  });
}

module.exports = { start };