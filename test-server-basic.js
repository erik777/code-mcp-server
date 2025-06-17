// Basic MCP Server functionality test
// Tests the core setup without OAuth dependencies

const fs = require("fs");
const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");

console.log("🔧 Testing Basic MCP Server Setup...");

// Test repository setup
const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, "repo");
console.log("\n📂 Repository Configuration:");
console.log(`  📁 REPO_PATH: ${REPO_PATH}`);

try {
    if (fs.existsSync(REPO_PATH)) {
        console.log("  ✅ Repository path exists");
        const stats = fs.statSync(REPO_PATH);
        if (stats.isDirectory()) {
            console.log("  ✅ Path is a directory");
            const items = fs.readdirSync(REPO_PATH);
            console.log(`  📄 Contains ${items.length} items`);

            if (items.length > 0) {
                console.log("  📋 Sample items:");
                items.slice(0, 5).forEach(item => {
                    console.log(`    - ${item}`);
                });
                if (items.length > 5) {
                    console.log(`    ... and ${items.length - 5} more`);
                }
            }
        } else {
            console.log("  ❌ Path exists but is not a directory");
            process.exit(1);
        }
    } else {
        console.log("  ❌ Repository path does not exist");
        console.log("  💡 Create a 'repo' directory or set REPO_PATH environment variable");
        process.exit(1);
    }
} catch (error) {
    console.log(`  ❌ Error accessing repository: ${error.message}`);
    process.exit(1);
}

// Test MCP Server creation
console.log("\n🔧 Testing MCP Server Creation:");

try {
    // Create MCP Server
    const server = new McpServer({
        name: "test-mcp-server",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    console.log("  ✅ MCP Server instance created successfully");

    // Register a test tool
    try {
        server.tool(
            'test-search',
            'A test search tool', {
                query: z.string().describe('Test query parameter'),
            },
            async({ query }) => {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            results: [{
                                id: "test-file.txt",
                                title: "Test File",
                                text: `Test result for query: ${query}`,
                                url: null
                            }]
                        }, null, 2)
                    }]
                };
            }
        );
        console.log("  ✅ Test tool registered successfully");
    } catch (error) {
        console.log(`  ❌ Error registering test tool: ${error.message}`);
    }

    // Test tool registration
    try {
        server.tool(
            'test-fetch',
            'A test fetch tool', {
                id: z.string().describe('Test ID parameter'),
            },
            async({ id }) => {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            id: id,
                            title: "Test Resource",
                            text: `Test content for resource: ${id}`,
                            url: null,
                            metadata: {
                                test: "true"
                            }
                        }, null, 2)
                    }]
                };
            }
        );
        console.log("  ✅ Test fetch tool registered successfully");
    } catch (error) {
        console.log(`  ❌ Error registering test fetch tool: ${error.message}`);
    }

} catch (error) {
    console.log(`  ❌ Error creating MCP server: ${error.message}`);
    process.exit(1);
}

// Test dependencies
console.log("\n📦 Dependencies Check:");
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const requiredDeps = [
    "@modelcontextprotocol/sdk",
    "express",
    "simple-git",
    "dotenv",
    "express-session",
    "axios"
];

requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
        console.log(`  ✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
        console.log(`  ❌ Missing dependency: ${dep}`);
    }
});

console.log("\n🔧 Basic Setup Status:");
console.log("  ✅ Ready for basic MCP testing");
console.log("  💡 Run 'npm start' to start the server with OAuth");
console.log("  💡 Configure OAuth credentials in .env for full functionality");