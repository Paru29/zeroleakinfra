const express = require('express');
const { verifyShopifyWebhook } = require('../middleware/shopify');
const { capiQueue } = require('../config/queue');
const db = require('../db');
const pino = require('pino');
const logger = pino();

const router = express.Router();

/**
 * POST /api/webhooks/shopify/orders
 * Handles both orders/create and orders/updated
 */
router.post('/shopify/orders', verifyShopifyWebhook, async (req, res) => {
  const { tenant, webhookId, topic } = req;
  const order = req.body;

  try {
    // 1. Idempotency Check
    const existingWebhook = await db('webhook_events').where({ id: webhookId }).first();
    if (existingWebhook) {
      logger.info({ webhookId }, 'Webhook already processed, skipping');
      return res.status(200).send('OK');
    }

    // 2. Database Transaction
    await db.transaction(async (trx) => {
      // Mark webhook as processed
      await trx('webhook_events').insert({
        id: webhookId,
        tenant_id: tenant.id,
        topic,
        status: 'processed'
      });

      // Extract our custom tracking attributes if present
      let eventId = null;
      let sessionId = null;
      
      const customAttributes = order.note_attributes || [];
      const zlEventIdAttr = customAttributes.find(attr => attr.name === 'zl_event_id');
      
      if (zlEventIdAttr) {
        eventId = zlEventIdAttr.value;
        // lookup session from the ATC event
        const atcEvent = await trx('tracking_events').where({ id: eventId }).first();
        if (atcEvent) {
          sessionId = atcEvent.session_id;
        }
      }

      // Store Order
      await trx('orders').insert({
        id: order.id.toString(),
        tenant_id: tenant.id,
        session_id: sessionId,
        total_price: order.total_price,
        currency: order.currency,
        financial_status: order.financial_status,
      }).onConflict(['id', 'tenant_id']).merge(); // Handle partial overlaps just in case
      
      // If we got the attribution, queue the Purchase event for CAPI
      if (sessionId) {
        const session = await trx('sessions').where({ id: sessionId }).first();
        
        await capiQueue.add('send-capi', {
          tenant_id: tenant.id,
          event_id: `purchase_${order.id}`, // Unique deduplication ID for purchase
          event_name: 'Purchase',
          timestamp: Math.floor(new Date(order.created_at).getTime() / 1000),
          attribution: session, // Reconstruct attribution from session
          eventData: {
            value: order.total_price,
            currency: order.currency
          },
          client_ip: order.browser_ip,
          user_agent: null // Shopify webhooks don't usually send the exact buyer UA on the webhook payload itself easily
        });
      }
    });

    const { publishDashboardUpdate } = require('../config/pubsub');
    publishDashboardUpdate(tenant.id).catch(err => logger.error(err, 'PubSub error'));

    res.status(200).send('OK');
  } catch (error) {
    logger.error({ err: error, webhookId }, 'Error processing webhook');
    // Important: we return 500 so Shopify retries if it was a transient error (e.g. DB down)
    res.status(500).send('Internal Server Error'); 
  }
});

module.exports = router;
