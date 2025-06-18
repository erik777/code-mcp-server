// Hydra Client Initialization Module
// Automatically registers MCP client with Hydra if it doesn't exist

const axios = require('axios');

/**
 * Utility function for timestamped logging (matches main app style)
 */
function logWithTimestamp(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelEmoji = {
        'DEBUG': '🔍',
        'INFO': 'ℹ️',
        'WARN': '⚠️',
        'ERROR': '❌',
        'SUCCESS': '✅'
    };
    console.log(`[${timestamp}] ${levelEmoji[level] || '📝'} [HYDRA-INIT] ${message}`, ...args);
}

/**
 * Initialize Hydra client registration
 * Checks if client exists, creates it if needed
 */
async function initHydra() {
    // Check if Hydra is the selected OAuth provider
    const oauthProvider = (process.env.OAUTH_PROVIDER || 'hydra').toLowerCase();
    if (oauthProvider !== 'hydra') {
        logWithTimestamp('DEBUG', `OAuth provider is '${oauthProvider}', skipping Hydra initialization`);
        return;
    }

    logWithTimestamp('INFO', 'Initializing Hydra client registration...');

    // Validate required environment variables
    const requiredVars = {
        HYDRA_ADMIN_URL: process.env.HYDRA_ADMIN_URL,
        OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
        OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET
    };

    const missingVars = Object.entries(requiredVars)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables for Hydra initialization: ${missingVars.join(', ')}`);
    }

    // Determine redirect URIs (same logic as main app)
    const BASE_URL = process.env.BASE_URL;
    const MCP_INTERNAL_URL = process.env.MCP_INTERNAL_URL || "http://localhost:3131";
    const EFFECTIVE_BASE_URL = BASE_URL || MCP_INTERNAL_URL;
    const REDIRECT_URI = `${EFFECTIVE_BASE_URL}/oauth/callback`;

    // Build redirect URIs array with support for REDIRECT_URI2
    const BASE_REDIRECTS = [REDIRECT_URI];
    if (process.env.REDIRECT_URI2) {
        logWithTimestamp('DEBUG', `Adding additional redirect URI: ${process.env.REDIRECT_URI2}`);
        BASE_REDIRECTS.push(process.env.REDIRECT_URI2);
    }

    const hydraAdminUrl = requiredVars.HYDRA_ADMIN_URL;
    const clientId = requiredVars.OAUTH_CLIENT_ID;
    const clientSecret = requiredVars.OAUTH_CLIENT_SECRET;

    try {
        // Step 1: Check if client already exists
        logWithTimestamp('DEBUG', `Checking if client '${clientId}' exists...`);

        try {
            const existingClientResponse = await axios.get(`${hydraAdminUrl}/clients/${clientId}`, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Client exists
            logWithTimestamp('SUCCESS', `Hydra client '${clientId}' already exists`);
            logWithTimestamp('DEBUG', 'Existing client details:', {
                client_id: existingClientResponse.data.client_id,
                grant_types: existingClientResponse.data.grant_types,
                redirect_uris: existingClientResponse.data.redirect_uris,
                scope: existingClientResponse.data.scope
            });

            // Check if REDIRECT_URI2 needs to be added to existing client
            const client = existingClientResponse.data;
            let needsUpdate = false;

            if (process.env.REDIRECT_URI2) {
                if (!client.redirect_uris.includes(process.env.REDIRECT_URI2)) {
                    logWithTimestamp('INFO', `Adding REDIRECT_URI2 to existing client: ${process.env.REDIRECT_URI2}`);
                    client.redirect_uris.push(process.env.REDIRECT_URI2);
                    needsUpdate = true;
                } else {
                    logWithTimestamp('DEBUG', 'REDIRECT_URI2 already present in client configuration');
                }
            }

            if (needsUpdate) {
                try {
                    logWithTimestamp('DEBUG', 'Updating client with new redirect URI');
                    await axios.put(`${hydraAdminUrl}/clients/${clientId}`, client, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    logWithTimestamp('SUCCESS', `Client '${clientId}' updated with REDIRECT_URI2`);
                    logWithTimestamp('INFO', `🔗 Updated redirect URIs: ${client.redirect_uris.join(', ')}`);
                } catch (updateError) {
                    logWithTimestamp('ERROR', `Failed to update client with REDIRECT_URI2: ${updateError.message}`);
                    // Don't throw - continue with existing client
                }
            }

            return;

        } catch (error) {
            if (error.response && error.response.status === 404) {
                // Client doesn't exist, proceed to create it
                logWithTimestamp('INFO', `Client '${clientId}' not found, creating new client...`);
            } else {
                // Other error (network, auth, etc.)
                throw new Error(`Failed to check client existence: ${error.message}`);
            }
        }

        // Step 2: Register new client
        const clientConfig = {
            client_id: clientId,
            client_secret: clientSecret,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: "openid profile email",
            redirect_uris: BASE_REDIRECTS,
            token_endpoint_auth_method: "client_secret_post"
        };

        // Ensure redirect URIs are unique
        clientConfig.redirect_uris = [...new Set(clientConfig.redirect_uris)];

        logWithTimestamp('DEBUG', 'Registering new client with config:', {
            client_id: clientConfig.client_id,
            grant_types: clientConfig.grant_types,
            response_types: clientConfig.response_types,
            scope: clientConfig.scope,
            redirect_uris: clientConfig.redirect_uris,
            token_endpoint_auth_method: clientConfig.token_endpoint_auth_method
        });

        const createResponse = await axios.post(`${hydraAdminUrl}/clients`, clientConfig, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        logWithTimestamp('SUCCESS', `✨ Hydra client '${clientId}' created successfully!`);
        logWithTimestamp('INFO', `🔗 Client redirect URIs: ${clientConfig.redirect_uris.join(', ')}`);
        logWithTimestamp('INFO', `🔧 Client configuration complete`);

    } catch (error) {
        // Enhanced error handling
        if (error.response) {
            // HTTP error response from Hydra
            const status = error.response.status;
            const data = error.response.data;

            logWithTimestamp('ERROR', `Hydra API error (${status}):`, data);

            if (status === 400) {
                logWithTimestamp('ERROR', 'Bad request - check client configuration');
            } else if (status === 401) {
                logWithTimestamp('ERROR', 'Unauthorized - check Hydra Admin API access');
            } else if (status === 409) {
                logWithTimestamp('WARN', 'Client already exists with conflicting configuration');
            }
        } else if (error.request) {
            // Network error
            logWithTimestamp('ERROR', `Network error connecting to Hydra Admin API at ${hydraAdminUrl}`);
            logWithTimestamp('ERROR', 'Make sure Hydra is running and accessible');
        } else {
            // Other error
            logWithTimestamp('ERROR', `Unexpected error: ${error.message}`);
        }

        throw new Error(`Hydra client initialization failed: ${error.message}`);
    }
}

module.exports = {
    initHydra
};