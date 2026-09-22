const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { resolveTenant } = require('../middleware/tenant');
const pino = require('pino');
const logger = pino();


/**
 * Helper to get or create a session based on attribution data
 */
async function getOrCreateSession(tenant_id, attribution) {
  // If we have an existing way to map a browser cookie to a session, we'd do it here.
  // For simplicity, if fbclid or gclid exists, we try to find a session, else create.
  // In a real app, we'd use a robust fingerprint or HTTP-only session cookie.
  
  // Here we just create a new session record to store the attribution for the funnel.
  const sessionId = crypto.randomUUID();
  
  await db('sessions').insert({
    id: sessionId,
    tenant_id,
    utm_source: attribution.utm_source || null,
    utm_medium: attribution.utm_medium || null,
    utm_campaign: attribution.utm_campaign || null,
    utm_content: attribution.utm_content || null,
    utm_term: attribution.utm_term || null,
    fbclid: attribution.fbclid || null,
    gclid: attribution.gclid || null,
    landing_page: attribution.landing_page || null,
    referrer: attribution.referrer || null,
  });

  return sessionId;
}

/**
 * POST /api/track
 * Receives tracking events from the frontend
 */
router.post('/track', resolveTenant, async (req, res) => {
  try {
    const { tenant } = req;
    const { event_id, event_name, page, timestamp, attribution, telemetry, product_id, variant_id } = req.body;

    if (!event_id || !event_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Process session/attribution
    let session_id = null;
    if (attribution && Object.keys(attribution).length > 0) {
      session_id = await getOrCreateSession(tenant.id, attribution);
    }

    // Construct event data JSONB
    const eventData = {};
    if (telemetry) eventData.telemetry = telemetry;
    if (attribution) eventData.attribution = attribution;

    const { capiQueue } = require('../config/queue');
    const { publishDashboardUpdate } = require('../config/pubsub');
    
    // Store Event in DB
    await db('tracking_events').insert({
      id: event_id,
      tenant_id: tenant.id,
      session_id,
      event_name,
      product_id: product_id || null,
      variant_id: variant_id || null,
      page: page || null,
      event_data: eventData
    });

    // Notify Dashboard
    publishDashboardUpdate(tenant.id).catch(err => logger.error(err, 'PubSub error'));

    // Enqueue for Meta CAPI processing
    await capiQueue.add('send-capi', {
      tenant_id: tenant.id,
      event_id,
      event_name,
      timestamp,
      attribution,
      eventData,
      client_ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      user_agent: req.headers['user-agent']
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    res.status(200).json({ success: true, event_id });
  } catch (error) {
    logger.error({ err: error, body: req.body }, 'Error processing tracking event');
    // Return 200 even on error to avoid noisy frontend errors for analytics
    res.status(200).json({ success: false }); 
  }
});

module.exports = router;
