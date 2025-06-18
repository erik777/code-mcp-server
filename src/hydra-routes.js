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
            <form method="post">
                <input name="email" type="email" placeholder="Enter your email address" required />
                <input type="hidden" name="challenge" value="${challenge}" />
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
    const { email, challenge } = req.body;

    if (!email || !challenge) {
        logWithTimestamp('ERROR', 'Missing email or challenge in login submission');
        return res.status(400).send('Missing required fields');
    }

    logWithTimestamp('INFO', `Login attempt for email: ${email}`);

    // Validate email domain
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
        logWithTimestamp('WARN', `Access denied for email: ${email} (not in allowed domain: ${ALLOWED_EMAIL_DOMAIN})`);
        return res.status(403).send(`
            <h2>Access Denied</h2>
            <p>Only email addresses ending with <strong>${ALLOWED_EMAIL_DOMAIN}</strong> are allowed access.</p>
            <p>Your email: <strong>${email}</strong></p>
            <a href="/hydra/login?login_challenge=${challenge}">← Go back</a>
        `);
    }

    try {
        // Accept the login request with Hydra
        const acceptResponse = await axios.put(
            `${HYDRA_ADMIN_URL}/oauth2/auth/requests/login/accept?login_challenge=${challenge}`, {
                subject: email,
                remember: false,
                remember_for: 0,
                acr: '1'
            }
        );

        logWithTimestamp('SUCCESS', `Login accepted for user: ${email}`);

        // Redirect to the URL provided by Hydra
        res.redirect(acceptResponse.data.redirect_to);
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to accept login with Hydra:', error.message);
        res.status(500).send('Authentication system error');
    }
});

/**
 * Consent Challenge Handler - auto-accepts for trusted domain
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

        const { requested_scope, subject } = consentRequest.data;
        logWithTimestamp('DEBUG', `Consent request for user: ${subject}, scopes: ${requested_scope?.join(', ')}`);

        // Auto-accept consent for users in our trusted domain
        const acceptResponse = await axios.put(
            `${HYDRA_ADMIN_URL}/oauth2/auth/requests/consent/accept?consent_challenge=${challenge}`, {
                grant_scope: requested_scope,
                remember: false,
                remember_for: 0,
                session: {
                    id_token: {
                        email: subject,
                        email_verified: true
                    },
                    access_token: {
                        email: subject
                    }
                }
            }
        );

        logWithTimestamp('SUCCESS', `Consent granted for user: ${subject}`);

        // Redirect to the URL provided by Hydra
        res.redirect(acceptResponse.data.redirect_to);
    } catch (error) {
        logWithTimestamp('ERROR', 'Failed to handle consent with Hydra:', error.message);
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