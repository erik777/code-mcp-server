// MCP Server Three-Mode Bootstrap
// Selects between Mode 1 (simple), Mode 2 (simple-auth), and Mode 3 (standard)

// Load environment files in priority order: .env.local > .env > defaults
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

// Initialize Winston logger
const logger = require('./logger');

// Load environment configuration
const MCP_MODE = process.env.MCP_MODE || 'simple';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

// Boot mode logging
logger.info('🚀 MCP Server Three-Mode Bootstrap');
logger.info(`[BOOT MODE] MCP Server mode: ${MCP_MODE.toUpperCase()} | AUTH: ${ENABLE_AUTH ? 'ENABLED' : 'DISABLED'}`);

// Load appropriate mode implementation
switch (MCP_MODE) {
    case 'simple':
        logger.info(`[BOOT] Loading Mode 1: Simple (No Auth) - Proven ChatGPT compatibility`);
        const { start: startSimple } = require('./modes/simple.js');
        startSimple({ enableAuth: false }); // Mode 1: Always no auth
        break;

    case 'simple-auth':
        logger.info(`[BOOT] Loading Mode 2: Simple + OAuth (Experimental) - ChatGPT auth experiment`);
        const { start: startSimpleAuth } = require('./modes/simple-auth.js');
        startSimpleAuth({ enableAuth: true }); // Mode 2: Experimental OAuth
        break;

    case 'standard':
        logger.info(`[BOOT] Loading Mode 3: Standard (Full SDK) - Future/non-ChatGPT use`);
        const { start: startStandard } = require('./modes/standard.js');
        startStandard({ enableAuth: ENABLE_AUTH }); // Mode 3: Configurable
        break;

    default:
        logger.error(`❌ Invalid MCP_MODE: ${MCP_MODE}`);
        logger.error(`   Valid options: simple, simple-auth, standard`);
        logger.error(`   Example: MCP_MODE=simple npm start`);
        process.exit(1);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
    logger.info("\n🛑 Shutting down MCP server bootstrap...");
    process.exit(0);
});