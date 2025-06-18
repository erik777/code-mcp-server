// OAuth Configuration Helper
// Parses environment variables and creates configuration objects for authentication modules

const crypto = require("crypto");
const logger = require("../logger");

/**
 * Parse OAuth configuration from environment variables
 * @param {string} effectiveBaseUrl - Base URL for the server
 * @returns {Object} OAuth configuration object
 */
function parseOAuthConfig(effectiveBaseUrl) {
    // Basic configuration
    const provider = (process.env.OAUTH_PROVIDER || "hydra").toLowerCase();
    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "@example.com";
    const scopes = (process.env.OAUTH_SCOPES || "openid profile email").split(" ");
    const redirectUri = `${effectiveBaseUrl}/oauth/callback`;
    const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex");

    // Provider-specific configuration
    let config = {
        provider,
        allowedDomain,
        scopes,
        redirectUri,
        sessionSecret,
        baseUrl: effectiveBaseUrl
    };

    switch (provider) {
        case "hydra":
            const hydraBrowserUrl = process.env.HYDRA_BROWSER_URL || "http://localhost:4444";
            config = {
                ...config,
                authUrl: `${hydraBrowserUrl}/oauth2/auth`,
                tokenUrl: `${hydraBrowserUrl}/oauth2/token`,
                userInfoUrl: `${hydraBrowserUrl}/userinfo`,
                jwksUrl: `${hydraBrowserUrl}/.well-known/jwks.json`,
                clientId: process.env.OAUTH_CLIENT_ID || "mcp-client",
                clientSecret: process.env.OAUTH_CLIENT_SECRET || "mcp-secret"
            };
            break;

        case "google":
            config = {
                ...config,
                authUrl: process.env.OAUTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
                tokenUrl: process.env.OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token",
                userInfoUrl: process.env.OAUTH_USERINFO_URL || "https://www.googleapis.com/oauth2/v3/userinfo",
                jwksUrl: process.env.OAUTH_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
                clientId: process.env.OAUTH_CLIENT_ID || "your-google-client-id",
                clientSecret: process.env.OAUTH_CLIENT_SECRET || "your-google-client-secret"
            };
            break;

        case "custom":
            config = {
                ...config,
                authUrl: process.env.OAUTH_AUTH_URL,
                tokenUrl: process.env.OAUTH_TOKEN_URL,
                userInfoUrl: process.env.OAUTH_USERINFO_URL,
                jwksUrl: process.env.OAUTH_JWKS_URL,
                clientId: process.env.OAUTH_CLIENT_ID || "your-client-id",
                clientSecret: process.env.OAUTH_CLIENT_SECRET || "your-client-secret"
            };

            // Validate required custom config
            if (!config.authUrl || !config.tokenUrl || !config.userInfoUrl) {
                throw new Error("Custom OAuth provider requires OAUTH_AUTH_URL, OAUTH_TOKEN_URL, and OAUTH_USERINFO_URL to be set");
            }
            break;

        default:
            throw new Error(`Unsupported OAuth provider: ${provider}. Supported providers: hydra, google, custom`);
    }

    return config;
}

/**
 * Validate OAuth configuration
 * @param {Object} config - OAuth configuration object
 * @throws {Error} If configuration is invalid
 */
function validateOAuthConfig(config) {
    const required = ['provider', 'authUrl', 'tokenUrl', 'userInfoUrl', 'clientId', 'clientSecret'];

    for (const field of required) {
        if (!config[field]) {
            throw new Error(`OAuth configuration missing required field: ${field}`);
        }
    }

    logger.info(`[OAUTH-CONFIG] Configuration validated for provider: ${config.provider}`);
}

/**
 * Log OAuth configuration (sanitized)
 * @param {Object} config - OAuth configuration object
 */
function logOAuthConfig(config) {
    logger.info("🔧 OAuth Configuration:");
    logger.info(`  Provider: ${config.provider}`);
    logger.info(`  Allowed Domain: ${config.allowedDomain}`);
    logger.info(`  Scopes: ${config.scopes.join(" ")}`);
    logger.info(`  Client ID: ${config.clientId}`);
    logger.info(`  Redirect URI: ${config.redirectUri}`);
    logger.info(`  Auth URL: ${config.authUrl}`);
    logger.info(`  Token URL: ${config.tokenUrl}`);
    logger.info(`  UserInfo URL: ${config.userInfoUrl}`);
}

module.exports = {
    parseOAuthConfig,
    validateOAuthConfig,
    logOAuthConfig
};