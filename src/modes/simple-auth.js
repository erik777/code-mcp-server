// MCP Git Gateway with minimal OAuth for ChatGPT compatibility
// MODE 2: Simple + OAuth (Experimental) - Primary refactor objective
// Stack: Node.js + Express + simple-git + minimal OAuth

function start({ enableAuth = true }) {
    // Mode 2: Experimental OAuth mode
    console.log(`[SIMPLE-AUTH] Starting simple OAuth MCP server (auth: ${enableAuth})`);

    // Placeholder for Mode 2 implementation
    console.log("🚧 [SIMPLE-AUTH] Mode 2 implementation coming in later phases");
    console.log("🎯 [SIMPLE-AUTH] Primary objective: Enable ChatGPT Deep Research with OAuth");
    console.log("💡 [SIMPLE-AUTH] Will implement minimal OAuth just for ChatGPT compatibility");
    console.log("🔄 [SIMPLE-AUTH] Fallback to Mode 1 if this breaks ChatGPT compatibility");

    // For now, fall back to simple mode without auth to prevent startup errors
    console.log("📝 [SIMPLE-AUTH] Temporarily falling back to simple mode logic");

    // Import simple mode and run without auth
    const { start: startSimple } = require('./simple.js');
    startSimple({ enableAuth: false });
}

module.exports = { start };