const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('pino')();
const axios = require('axios');

// These should be added to your .env file
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'; // e.g. https://zeroleakinfra.tech
const REDIRECT_URI = `${BASE_URL}/api/meta/callback`;

/**
 * GET /api/meta/auth
 * Client clicks "Connect Meta" in dashboard. We redirect them to Meta.
 * We pass the tenant_id in the 'state' parameter so we remember who they are.
 */
router.get('/auth', (req, res) => {
    // In a real app, you get tenant_id from the authenticated user's session.
    // For now, we'll pass it in the query string or default to 'tenant_001'
    const tenantId = req.query.tenant_id || 'tenant_001'; 
    
    if (!META_APP_ID) {
        return res.status(500).send('META_APP_ID is not configured in .env');
    }

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${tenantId}&scope=ads_read,business_management&response_type=code`;
    
    res.redirect(authUrl);
});

/**
 * GET /api/meta/callback
 * Meta redirects the user back to this URL with a ?code=XYZ parameter.
 */
router.get('/callback', async (req, res) => {
    const { code, state: tenantId, error, error_description } = req.query;

    if (error) {
        logger.error({ error, error_description }, 'Meta OAuth Error');
        return res.status(400).send(`Authentication failed: ${error_description}`);
    }

    if (!code) {
        return res.status(400).send('No code provided by Meta');
    }

    try {
        // Step 1: Exchange the 'code' for a short-lived Access Token
        const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: {
                client_id: META_APP_ID,
                redirect_uri: REDIRECT_URI,
                client_secret: META_APP_SECRET,
                code: code
            }
        });

        const shortLivedToken = tokenResponse.data.access_token;

        // Step 2: (Optional but Recommended) Exchange for a Long-Lived Token
        const longLivedResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: META_APP_ID,
                client_secret: META_APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });

        const longLivedToken = longLivedResponse.data.access_token;

        // Step 3: Save the Access Token in the database for this Tenant
        // Note: In a full flow, you would also use this token to fetch their Business Manager ID, 
        // Ad Account ID, and Pixel ID, or have them select it in the UI.
        
        await db('tenants')
            .where({ id: tenantId })
            .update({
                meta_config: {
                    access_token: longLivedToken,
                    // The client will need to select these via the UI, or we fetch their defaults
                    ad_account_id: null, 
                    pixel_id: null
                },
                updated_at: db.fn.now()
            });

        logger.info(`Successfully connected Meta for tenant: ${tenantId}`);
        
        // Redirect back to the dashboard with a success message
        res.redirect('/dashboard?meta_connected=true');

    } catch (err) {
        logger.error({ err: err.response ? err.response.data : err.message }, 'Failed to exchange Meta code for token');
        res.status(500).send('Failed to connect to Meta. Please check server logs.');
    }
});

module.exports = router;
