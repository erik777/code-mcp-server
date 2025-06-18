// OAuth Session Authentication Module  
// For Mode 3: Standard (full OAuth flows with session management)
// Includes OAuth login/callback/logout routes and session-based auth

const axios = require("axios");
const crypto = require("crypto");
const session = require("express-session");

/**
 * OAuth validation function
 * @param {string} token - OAuth access token
 * @param {Object} config - OAuth configuration
 * @returns {Promise<boolean>} Whether the user is authorized
 */
async function validateUser(token, config) {
    try {
        console.log(`[OAUTH-SESSION] Validating OAuth token for provider: ${config.provider}...`);

        // Get user info from the configured OAuth provider
        const response = await axios.get(config.userInfoUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const userInfo = response.data;
        const email = userInfo.email;
        const name = userInfo.name || userInfo.preferred_username || userInfo.sub || "Unknown User";

        console.log(`[OAUTH-SESSION] OAuth user: ${name} (${email}) via ${config.provider}`);

        // Check if email ends with allowed domain
        if (email && email.endsWith(config.allowedDomain)) {
            console.log(`[OAUTH-SESSION] User ${email} authorized (allowed domain: ${config.allowedDomain})`);
            return true;
        } else {
            console.log(`[OAUTH-SESSION] User ${email} not authorized (required domain: ${config.allowedDomain})`);
            return false;
        }
    } catch (error) {
        console.error(`[OAUTH-SESSION] Error validating OAuth token for ${config.provider}:`, error.message);
        return false;
    }
}

/**
 * Create session-based authentication middleware
 * Supports both Bearer tokens and session-based authentication
 * @param {Object} config - OAuth configuration
 * @returns {Function} Express middleware
 */
function createSessionAuth(config) {
    return async(req, res, next) => {
        console.log("[OAUTH-SESSION] Authorization check initiated");

        // 1. Detect token sources
        const bearerHeader = req.headers.authorization || req.headers.Authorization;
        const bearerMatch = bearerHeader && bearerHeader.match(/^Bearer\s+(.+)$/i);
        const bearerToken = bearerMatch ? bearerMatch[1] : null;
        const sessionToken = req.session && req.session.accessToken;
        const token = bearerToken || sessionToken; // prefer explicit Bearer

        console.log(`[OAUTH-SESSION] Auth sources → bearer=${!!bearerToken}, session=${!!sessionToken}`);

        // 2. No token at all → 401
        if (!token) {
            return res.status(401).json({
                error: "Authentication required",
                message: `Supply an Authorization: Bearer <token> header or login via ${config.baseUrl}/oauth/login`,
            });
        }

        try {
            // 3. Validate token
            const isAuthorized = await validateUser(token, config);
            if (!isAuthorized) {
                return res.status(403).json({
                    error: "User not authorized",
                    message: `Only users with ${config.allowedDomain} email addresses are allowed.`,
                });
            }

            // 4. Store validated token for downstream handlers
            req.mcpUserToken = token;
            next();
        } catch (err) {
            console.error("[OAUTH-SESSION] Authorization error:", err.message);
            return res.status(500).json({
                error: "Authorization check failed",
                message: err.message,
            });
        }
    };
}

/**
 * Create session middleware configuration
 * @param {string} sessionSecret - Session secret key
 * @returns {Function} Express session middleware
 */
function createSessionMiddleware(sessionSecret) {
    return session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false, // Set to true in production with HTTPS
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
    });
}

/**
 * Setup OAuth routes on Express app
 * @param {Object} app - Express app instance  
 * @param {Object} config - OAuth configuration
 */
function setupOAuthRoutes(app, config) {
    console.log("[OAUTH-SESSION] Setting up OAuth routes...");

    // OAuth initiation endpoint
    app.get("/oauth/login", (req, res) => {
        console.log(`[OAUTH-SESSION] OAuth login initiated with provider: ${config.provider}`);

        // Generate state parameter for CSRF protection
        const state = crypto.randomBytes(32).toString("hex");
        req.session.oauthState = state;

        const authUrl = new URL(config.authUrl);
        authUrl.searchParams.set("client_id", config.clientId);
        authUrl.searchParams.set("redirect_uri", config.redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", config.scopes.join(" "));
        authUrl.searchParams.set("state", state);

        console.log(`[OAUTH-SESSION] Redirecting to ${config.provider} OAuth: ${authUrl.toString()}`);
        res.redirect(authUrl.toString());
    });

    // OAuth callback endpoint
    app.get("/oauth/callback", async(req, res) => {
        console.log("[OAUTH-SESSION] Processing OAuth callback");
        console.log("[OAUTH-SESSION] OAuth callback query params:", req.query);

        const { code, state, error } = req.query;

        if (error) {
            console.error("[OAUTH-SESSION] OAuth error:", error);
            return res.status(400).json({ error: `OAuth error: ${error}` });
        }

        if (!code) {
            console.error("[OAUTH-SESSION] No authorization code received in OAuth callback");
            return res.status(400).json({ error: "No authorization code received" });
        }

        if (state !== req.session.oauthState) {
            console.error(`[OAUTH-SESSION] Invalid OAuth state parameter. Expected: ${req.session.oauthState}, Got: ${state}`);
            return res.status(400).json({ error: "Invalid state parameter" });
        }

        try {
            // Exchange code for token
            console.log(`[OAUTH-SESSION] Exchanging authorization code for access token with ${config.provider}`);
            const tokenResponse = await axios.post(config.tokenUrl, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: config.redirectUri,
            });

            const { access_token } = tokenResponse.data;
            console.log("[OAUTH-SESSION] Successfully obtained access token");

            // Validate user
            const isAuthorized = await validateUser(access_token, config);

            if (isAuthorized) {
                // Store token in session
                req.session.accessToken = access_token;
                console.log("[OAUTH-SESSION] OAuth authentication successful and user authorized");
                res.json({
                    success: true,
                    message: "Authentication successful! You can now access the MCP endpoint.",
                    redirect: "/mcp",
                });
            } else {
                console.log("[OAUTH-SESSION] User not authorized for this service");
                res.status(403).json({
                    error: `Access denied. Only users with ${config.allowedDomain} email addresses are allowed.`,
                });
            }
        } catch (error) {
            console.error("[OAUTH-SESSION] Error during OAuth callback:", error.message);
            if (error.response) {
                console.error("[OAUTH-SESSION] OAuth API response error:", {
                    status: error.response.status,
                    data: error.response.data,
                });
            }
            res.status(500).json({ error: "Authentication failed" });
        }
    });

    // OAuth logout endpoint
    app.get("/oauth/logout", (req, res) => {
        console.log("[OAUTH-SESSION] User logging out");
        req.session.destroy();
        res.json({ success: true, message: "Logged out successfully" });
    });

    // OAuth status endpoint
    app.get("/oauth/status", async(req, res) => {
        console.log("[OAUTH-SESSION] OAuth status check requested");

        if (req.session.accessToken) {
            try {
                const isValid = await validateUser(req.session.accessToken, config);
                if (isValid) {
                    console.log("[OAUTH-SESSION] User authentication status: valid");
                    res.json({ authenticated: true, message: "User is authenticated" });
                } else {
                    console.log("[OAUTH-SESSION] User authentication status: invalid, destroying session");
                    req.session.destroy();
                    res.json({
                        authenticated: false,
                        message: "Token invalid or user not authorized",
                    });
                }
            } catch (error) {
                console.error("[OAUTH-SESSION] Authentication check failed:", error.message);
                req.session.destroy();
                res.json({
                    authenticated: false,
                    message: "Authentication check failed",
                });
            }
        } else {
            console.log("[OAUTH-SESSION] User authentication status: not authenticated");
            res.json({ authenticated: false, message: "User not authenticated" });
        }
    });

    // OAuth registration endpoint for dynamic client registration
    app.post("/oauth/register", (req, res) => {
        console.log("[OAUTH-SESSION] Dynamic client registration requested");

        if (config.provider !== "hydra") {
            return res.status(400).json({
                error: `Dynamic registration not supported for provider: ${config.provider}`
            });
        }

        const registrationResponse = {
            provider: config.provider,
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            authUrl: config.authUrl,
            scopes: config.scopes,
        };

        console.log("[OAUTH-SESSION] Dynamic registration response:", registrationResponse);
        return res.json(registrationResponse);
    });

    console.log("[OAUTH-SESSION] OAuth routes configured successfully");
}

module.exports = {
    validateUser,
    createSessionAuth,
    createSessionMiddleware,
    setupOAuthRoutes
};