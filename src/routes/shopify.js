const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = 'read_orders,read_products,read_script_tags,write_script_tags,read_analytics';
const HOST = process.env.BASE_URL || 'https://track.zeroleakinfra.tech';

router.get('/install', (req, res) => {
    const shop = req.query.shop;
    if (!shop) {
        return res.status(400).send('Missing shop parameter. Please add ?shop=your-store.myshopify.com');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${HOST}/api/shopify/callback`;
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

    // Store state in session for validation in callback
    if (req.session) {
        req.session.shopify_oauth_state = state;
    }

    res.redirect(installUrl);
});

router.get('/callback', async (req, res) => {
    const { shop, hmac, code, state } = req.query;

    if (!shop || !hmac || !code) {
        return res.status(400).send('Required parameters missing');
    }

    // Verify State
    if (req.session && req.session.shopify_oauth_state !== state) {
        // Warning: State doesn't match. (In production, enforce this strictly)
        console.warn('Shopify OAuth state mismatch');
    }

    // Verify HMAC (Security check)
    const map = Object.assign({}, req.query);
    delete map['signature'];
    delete map['hmac'];
    const message = Object.keys(map).sort().map(key => `${key}=${map[key]}`).join('&');
    const generatedHash = crypto
        .createHmac('sha256', SHOPIFY_API_SECRET)
        .update(message)
        .digest('hex');

    if (generatedHash !== hmac) {
        return res.status(400).send('HMAC validation failed');
    }

    // Exchange code for Access Token
    try {
        const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
            client_id: SHOPIFY_API_KEY,
            client_secret: SHOPIFY_API_SECRET,
            code,
        });

        const accessToken = tokenResponse.data.access_token;

        const shopifyConfig = {
            shop,
            access_token: accessToken,
            connected_at: new Date().toISOString()
        };

        const tenantId = req.session ? req.session.tenant_id : 'tenant_001';

        if (!tenantId) {
             console.error('No tenant ID in session during Shopify OAuth callback');
             return res.status(400).send('Session expired or unauthorized');
        }

        await db('tenants').where('id', tenantId).update({
            shopify_config: JSON.stringify(shopifyConfig)
        });

        // Register webhooks automatically on OAuth install
        await registerShopifyWebhooks(shop, accessToken);

        // Fetch 30 days data in background for ROI Calculator
        fetchLast30DaysData(shop, accessToken, tenantId);

        res.redirect('/dashboard/settings.html?shopify_connected=true');

    } catch (err) {
        console.error('Error exchanging shopify token', err.response?.data || err.message);
        res.status(500).send('Error connecting to Shopify');
    }
});

async function registerShopifyWebhooks(shop, accessToken) {
    const webhooks = [
        { topic: 'orders/create', path: '/api/webhooks/shopify/orders' },
        { topic: 'orders/updated', path: '/api/webhooks/shopify/orders' }
    ];

    for (const hook of webhooks) {
        try {
            const webhookData = {
                webhook: {
                    topic: hook.topic,
                    address: `${HOST}${hook.path}`,
                    format: "json"
                }
            };

            await axios.post(`https://${shop}/admin/api/2024-01/webhooks.json`, webhookData, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`Successfully registered ${hook.topic} webhook for ${shop}`);
        } catch (err) {
            // 422 means it's already registered
            if (err.response && err.response.status === 422) {
                console.log(`Webhook ${hook.topic} already registered for ${shop}`);
            } else {
                console.error(`Failed to register ${hook.topic} for ${shop}:`, err.response?.data || err.message);
            }
        }
    }
}

// Manual Installation Endpoint
router.post('/manual-install', express.urlencoded({ extended: true }), async (req, res) => {
    const { shop, access_token } = req.body;
    
    if (!shop || !access_token) {
        return res.status(400).send('Missing shop or access token');
    }

    try {
        const cleanShop = shop.replace('https://', '').replace('/', '');
        const shopifyConfig = {
            shop: cleanShop,
            access_token,
            connected_at: new Date().toISOString(),
            install_type: 'manual'
        };

        const tenantId = req.session ? req.session.tenant_id : 'tenant_001';

        await db('tenants').where('id', tenantId).update({
            shopify_config: JSON.stringify(shopifyConfig)
        });

        // Register Webhooks Automatically
        await registerShopifyWebhooks(cleanShop, access_token);

        // Fetch 30 days data in background for ROI Calculator
        fetchLast30DaysData(cleanShop, access_token, tenantId);

        res.redirect('/dashboard/settings.html?shopify_connected=true');
    } catch (err) {
        console.error('Error saving manual shopify token', err);
        res.status(500).send('Database Error');
    }
});

module.exports = router;

async function fetchLast30DaysData(shop, accessToken, tenantId) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        let hasNextPage = true;
        let url = `https://${shop}/admin/api/2024-01/orders.json?status=any&financial_status=paid&created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;
        
        let totalRevenue = 0;
        let totalOrders = 0;
        
        while (hasNextPage && url) {
            const response = await axios.get(url, {
                headers: { 'X-Shopify-Access-Token': accessToken }
            });
            
            const orders = response.data.orders || [];
            totalOrders += orders.length;
            
            for (let order of orders) {
                totalRevenue += parseFloat(order.total_price);
            }
            
            // Extract next page link from headers
            const linkHeader = response.headers['link'];
            url = null;
            if (linkHeader) {
                const links = linkHeader.split(',');
                const nextLink = links.find(link => link.includes('rel="next"'));
                if (nextLink) {
                    const match = nextLink.match(/<([^>]+)>/);
                    url = match ? match[1] : null;
                }
            }
        }
        
        const aov = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
        const adBlockerPercentage = 0.30;
        const untrackedLoss = totalRevenue * adBlockerPercentage;
        
        const analyticsData = {
            total_orders_30d: totalOrders,
            total_revenue_30d: totalRevenue,
            aov_30d: aov,
            untracked_loss_30d: untrackedLoss,
            calculated_at: new Date().toISOString()
        };
        
        const tenant = await db('tenants').where('id', tenantId).first();
        if (tenant) {
            let config = {};
            try { config = JSON.parse(tenant.shopify_config); } catch (e) {}
            config.analytics = analyticsData;
            
            await db('tenants').where('id', tenantId).update({
                shopify_config: JSON.stringify(config)
            });
            console.log(`ROI Calculator Data saved for ${shop}: Loss = ₹${untrackedLoss}`);
        }
    } catch (err) {
        console.error('Error fetching 30 days data:', err.response?.data || err.message);
    }
}
