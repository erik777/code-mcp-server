// Bearer-Only Authentication Module
// For Mode 2: Simple + OAuth (ChatGPT compatible, no sessions)
// Validates Bearer tokens only - no OAuth flows or session management

const axios = require("axios");

/**
 * OAuth validation function for bearer tokens
 * @param {string} token - OAuth access token
 * @param {Object} config - OAuth configuration
 * @returns {Promise<boolean>} Whether the user is authorized
 */
async function validateUser(token, config) {
    try {
        console.log(`[BEARER-AUTH] Validating OAuth token for provider: ${config.provider}...`);

        // Get user info from the configured OAuth provider
        const response = await axios.get(config.userInfoUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const userInfo = response.data;
        const email = userInfo.email;
        const name = userInfo.name || userInfo.preferred_username || userInfo.sub || "Unknown User";

        console.log(`[BEARER-AUTH] OAuth user: ${name} (${email}) via ${config.provider}`);

        // Check if email ends with allowed domain
        if (email && email.endsWith(config.allowedDomain)) {
            console.log(`[BEARER-AUTH] User ${email} authorized (allowed domain: ${config.allowedDomain})`);
            return true;
        } else {
            console.log(`[BEARER-AUTH] User ${email} not authorized (required domain: ${config.allowedDomain})`);
            return false;
        }
    } catch (error) {
        console.error(`[BEARER-AUTH] Error validating OAuth token for ${config.provider}:`, error.message);
        return false;
    }
}

/**
 * Create bearer-only authentication middleware
 * Only validates Authorization: Bearer tokens - no sessions
 * @param {Object} config - OAuth configuration
 * @returns {Function} Express middleware
 */
function createBearerAuth(config) {
    return async(req, res, next) => {
        console.log("[BEARER-AUTH] Authorization check initiated (bearer-only)");

        // 1. Extract Bearer token from Authorization header only
        const bearerHeader = req.headers.authorization || req.headers.Authorization;
        const bearerMatch = bearerHeader && bearerHeader.match(/^Bearer\s+(.+)$/i);
        const bearerToken = bearerMatch ? bearerMatch[1] : null;

        console.log(`[BEARER-AUTH] Bearer token present: ${!!bearerToken}`);

        // 2. No Bearer token → 401 (no session fallback in Mode 2)
        if (!bearerToken) {
            return res.status(401).json({
                jsonrpc: "2.0",
                error: {
                    code: -32001,
                    message: "Authentication required",
                    data: "Supply an Authorization: Bearer <token> header. OAuth flows not available in Simple+Auth mode."
                },
                id: null
            });
        }

        try {
            // 3. Validate Bearer token
            const isAuthorized = await validateUser(bearerToken, config);
            if (!isAuthorized) {
                return res.status(403).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32002,
                        message: "User not authorized",
                        data: `Only users with ${config.allowedDomain} email addresses are allowed.`
                    },
                    id: null
                });
            }

            // 4. Store validated token for downstream handlers
            req.mcpUserToken = bearerToken;
            console.log("[BEARER-AUTH] Bearer token validated successfully");
            next();
        } catch (err) {
            console.error("[BEARER-AUTH] Authorization error:", err.message);
            return res.status(500).json({
                jsonrpc: "2.0",
                error: {
                    code: -32003,
                    message: "Authorization check failed",
                    data: err.message
                },
                id: null
            });
        }
    };
}

module.exports = {
    createBearerAuth,
    validateUser
};