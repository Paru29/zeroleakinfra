const crypto = require('crypto');
const db = require('../db');
const pino = require('pino');
const logger = pino();

/**
 * Validates Shopify Webhook HMAC
 * Requires req.rawBody to be populated (e.g. using express.raw or a custom body parser)
 */
const verifyShopifyWebhook = async (req, res, next) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const topic = req.headers['x-shopify-topic'];
    const webhookId = req.headers['x-shopify-webhook-id'];

    if (!hmac || !shopDomain || !webhookId) {
      return res.status(401).json({ error: 'Missing Shopify headers' });
    }

    // Resolve tenant by shopDomain
    // Store in a JSONB query
    const tenant = await db('tenants')
      .whereRaw("shopify_config->>'shop_domain' = ?", [shopDomain])
      .first();

    if (!tenant || !tenant.shopify_config?.client_secret) {
      logger.warn(`Webhook rejected: Tenant not found or missing secret for shop ${shopDomain}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify HMAC
    const generatedHash = crypto
      .createHmac('sha256', tenant.shopify_config.client_secret)
      .update(req.rawBody, 'utf8')
      .digest('base64');

    if (generatedHash !== hmac) {
      logger.warn(`Webhook HMAC mismatch for tenant ${tenant.id}`);
      return res.status(401).json({ error: 'Invalid HMAC' });
    }

    req.tenant = tenant;
    req.webhookId = webhookId;
    req.topic = topic;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error verifying Shopify webhook');
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { verifyShopifyWebhook };
