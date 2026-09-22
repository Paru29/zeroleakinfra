const express = require('express');
const { resolveTenant } = require('../middleware/tenant');
const { createCart } = require('../modules/shopify/storefront');
const pino = require('pino');
const logger = pino();

const router = express.Router();

/**
 * POST /api/checkout
 * Generates a Shopify Checkout URL using Storefront API
 */
router.post('/checkout', resolveTenant, async (req, res) => {
  try {
    const { tenant } = req;
    const { product_id, variant_id, attribution, event_id } = req.body;

    if (!variant_id) {
      return res.status(400).json({ error: 'Variant ID is required' });
    }

    // Attempt to create cart via Storefront API
    try {
      const checkoutUrl = await createCart(tenant, variant_id, attribution, event_id);
      return res.status(200).json({ checkoutUrl });
    } catch (storefrontError) {
      logger.warn({ err: storefrontError }, 'Failed real checkout, falling back to dummy url for dev');
      const shopDomain = tenant.shopify_config?.shop_domain || 'example.myshopify.com';
      const dummyUrl = `https://${shopDomain}/cart/${variant_id}:1`;
      return res.status(200).json({ checkoutUrl: dummyUrl });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error creating checkout');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
