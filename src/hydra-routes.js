// Hydra OAuth Integration Routes
// Integrates with Ory Hydra for OAuth 2.0 authentication flows

const express = require('express');
const axios = require('axios');
const router = express.Router();

// Hydra Configuration from environment
const HYDRA_ADMIN_URL = process.env.HYDRA_ADMIN_URL || 'http://localhost:4445';
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || '@example.com';

// Utility function for timestamped logging (consistent with main app)
function logWithTimestamp(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelEmoji = {
        'DEBUG': '🔍',
        'INFO': 'ℹ️',
        'WARN': '⚠️',
        'ERROR': '❌',
        'SUCCESS': '✅'
    };
    console.log(`[${timestamp}] ${levelEmoji[level] || '📝'} [HYDRA] ${message}`, ...args);
}

// Helper function to set CSRF cookie with proper security settings
function setCsrfCookie(res, name, value) {
    const secure = process.env.NODE_ENV !== 'development'; // secure=true except on localhost dev
    logWithTimestamp('DEBUG', `Setting CSRF cookie: ${name} (secure: ${secure})`);

    res.cookie(name, value, {
        httpOnly: true,
        sameSite: 'None',
        secure: secure
    });
}

// Helper function to get human-readable scope descriptions
function getScopeDescription(scope) {
    const descriptions = {
        'openid': 'Access to your identity',
        'profile': 'Access to your basic profile information',
        'email': 'Access to your email address',
        'offline_access': 'Access to refresh tokens'
    };
    return descriptions[scope] || 'Access to additional information';
}

/**
 * Login Challenge Handler - presents login form
 * GET /hydra/login?login_challenge=<challenge>
 */
router.get('/login', async(req, res) => {
    const challenge = req.query.login_challenge;

    if (!challenge) {
        logWithTimestamp('ERROR', 'Missing login_challenge parameter');
        return res.status(400).send('Missing login_challenge parameter');
    }

    logWithTimestamp('INFO', `Handling login challenge: ${challenge}`);

    try {
        // 🔑 1) Set CSRF cookie before any other processing
        setCsrfCookie(res, 'hydra_login_csrf', challenge);

        // Get login request information from Hydra
        const loginRequest = await axios.get(
            `${HYDRA_ADMIN_URL}/oauth2/auth/requests/login?login_challenge=${challenge}`
        );

        logWithTimestamp('DEBUG', 'Login request details:', loginRequest.data);

        // Simple login form
        const loginForm = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Login - MCP Git Gateway</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
                input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
                button { background: #007cba; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
                button:hover { background: #005a87; }
                .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>🔐 MCP Git Gateway Login</h2>
            <div class="info">
                Please enter your email address to continue.
                <br><strong>Note:</strong> Only emails ending with <code>${ALLOWED_EMAIL_DOMAIN}</code> are allowed.
            </div>
            <form method="post" action="/hydra/login?login_challenge=${challenge}">
                <input name="email" type="email" placeholder="Enter your email address" required />
                <button type="submit">Login</button>
            </form>
        </body>
        </html>
        `;

        res.send(loginForm);
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to get login request from Hydra:', error.message);
        res.status(500).send('Authentication system error');
    }
});

/**
 * Login Form Submission Handler
 * POST /hydra/login
 */
router.post('/login', async(req, res) => {
    const login_challenge = req.query.login_challenge;
    const { email } = req.body;

    if (!login_challenge || !email) {
        logWithTimestamp('ERROR', 'Missing login_challenge or email in login submission');
        return res.status(400).send('Missing required parameters');
    }

    logWithTimestamp('INFO', `Login attempt for email: ${email} with challenge: ${login_challenge}`);

    // Validate email domain
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
        logWithTimestamp('WARN', `Access denied for email: ${email} (not in allowed domain: ${ALLOWED_EMAIL_DOMAIN})`);
        return res.status(403).send(`
            <h2>Access Denied</h2>
            <p>Only email addresses ending with <strong>${ALLOWED_EMAIL_DOMAIN}</strong> are allowed access.</p>
            <p>Your email: <strong>${email}</strong></p>
            <a href="/hydra/login?login_challenge=${login_challenge}">← Go back</a>
        `);
    }

    try {
        // Accept the login request with Hydra Admin API
        logWithTimestamp('DEBUG', `Accepting login challenge: ${login_challenge} for user: ${email}`);
        const { data } = await axios.put(
            `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/login/accept?login_challenge=${login_challenge}`, {
                subject: email,
                remember: false
            }
        );

        logWithTimestamp('SUCCESS', `Login accepted for user: ${email}`);
        logWithTimestamp('DEBUG', `Redirecting to: ${data.redirect_to}`);

        // Redirect to the URL provided by Hydra
        return res.redirect(302, data.redirect_to);
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to accept login with Hydra:', error.message);
        if (error.response) {
            logWithTimestamp('ERROR', 'Hydra Admin API error response:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).send('Authentication system error');
    }
});

/**
 * Consent Challenge Handler - shows consent form for user approval
 * GET /hydra/consent?consent_challenge=<challenge>
 */
router.get('/consent', async(req, res) => {
            const challenge = req.query.consent_challenge;

            if (!challenge) {
                logWithTimestamp('ERROR', 'Missing consent_challenge parameter');
                return res.status(400).send('Missing consent_challenge parameter');
            }

            logWithTimestamp('INFO', `Handling consent challenge: ${challenge}`);

            try {
                // 🔑 Set consent CSRF cookie before any other processing
                setCsrfCookie(res, 'hydra_consent_csrf', challenge);

                // Get consent request information from Hydra
                const consentRequest = await axios.get(
                    `${HYDRA_ADMIN_URL}/oauth2/auth/requests/consent?consent_challenge=${challenge}`
                );

                const { requested_scope, subject, client } = consentRequest.data;
                logWithTimestamp('DEBUG', `Consent request for user: ${subject}, scopes: ${requested_scope?.join(', ')}`);

                // Show consent form
                const consentForm = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Grant Access - MCP Git Gateway</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
                button { padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
                .accept { background: #28a745; color: white; }
                .accept:hover { background: #218838; }
                .deny { background: #dc3545; color: white; }
                .deny:hover { background: #c82333; }
                .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
                .scopes { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <h2>🔐 Grant Access</h2>
            <div class="info">
                <strong>${client?.client_name || 'Application'}</strong> is requesting access to your account.
                <br><strong>User:</strong> ${subject}
            </div>
            <div class="scopes">
                <strong>Requested permissions:</strong>
                <ul>
                    ${requested_scope?.map(scope => 
                        `<li><strong>${scope}</strong>: ${getScopeDescription(scope)}</li>`
                    ).join('') || '<li>Basic access</li>'}
                </ul>
            </div>
            <form method="post" action="/hydra/consent?consent_challenge=${challenge}">
                <button name="submit" value="accept" type="submit" class="accept">Allow Access</button>
                <button name="submit" value="deny" type="submit" class="deny">Deny</button>
            </form>
        </body>
        </html>
        `;

        res.send(consentForm);
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to get consent request from Hydra:', error.message);
        if (error.response) {
            logWithTimestamp('ERROR', 'Hydra Admin API error response:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).send('Authentication system error');
    }
});

/**
 * Consent Form Submission Handler
 * POST /hydra/consent
 */
router.post('/consent', async(req, res) => {
    const consent_challenge = req.query.consent_challenge;
    const { submit } = req.body;

    if (!consent_challenge) {
        logWithTimestamp('ERROR', 'Missing consent_challenge in consent submission');
        return res.status(400).send('Missing consent_challenge parameter');
    }

    logWithTimestamp('INFO', `Consent ${submit} for challenge: ${consent_challenge}`);

    try {
        if (submit === 'accept') {
            // 1. Fetch consent details so we get subject & requested scopes
            const { data: consentInfo } = await axios.get(
                `${HYDRA_ADMIN_URL}/oauth2/auth/requests/consent?consent_challenge=${consent_challenge}`
            );
            const { subject, requested_scope = [] } = consentInfo;

            // 2. Build payload with dynamic scopes and ID/Access-token claims
            const acceptPayload = {
                grant_scope: requested_scope,
                remember: false,
                session: {
                    id_token: {
                        email: subject,
                        email_verified: true
                    },
                    access_token: {
                        email: subject
                    }
                }
            };

            // 3. Accept consent
            const { data } = await axios.put(
                `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/consent/accept?consent_challenge=${consent_challenge}`,
                acceptPayload
            );

            logWithTimestamp('SUCCESS', `Consent granted for challenge: ${consent_challenge}`);
            logWithTimestamp('DEBUG', `Redirecting to: ${data.redirect_to}`);
            return res.redirect(302, data.redirect_to);
        } else {
            // Deny consent
            logWithTimestamp('WARN', `Consent denied for challenge: ${consent_challenge}`);
            const { data } = await axios.put(
                `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/consent/reject?consent_challenge=${consent_challenge}`, {
                    error: 'access_denied',
                    error_description: 'User denied access'
                }
            );

            return res.redirect(302, data.redirect_to);
        }
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to handle consent with Hydra:', error.message);
        if (error.response) {
            logWithTimestamp('ERROR', 'Hydra Admin API error response:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).send('Authentication system error');
    }
});

/**
 * Hydra Health Check
 * GET /hydra/health
 */
router.get('/health', async(req, res) => {
    try {
        const response = await axios.get(`${HYDRA_ADMIN_URL}/health/ready`);
        logWithTimestamp('SUCCESS', 'Hydra health check passed');
        res.json({
            status: 'healthy',
            hydra_admin_url: HYDRA_ADMIN_URL,
            hydra_status: response.status
        });
    } catch (error) {
        logWithTimestamp('ERROR', 'Hydra health check failed:', error.message);
        res.status(503).json({
            status: 'unhealthy',
            hydra_admin_url: HYDRA_ADMIN_URL,
            error: error.message
        });
    }
});

module.exports = router;