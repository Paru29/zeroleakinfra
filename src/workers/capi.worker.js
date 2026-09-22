const { Worker } = require('bullmq');
const { connection } = require('../config/queue');
const db = require('../db');
const pino = require('pino');
const logger = pino();
const crypto = require('crypto');

/**
 * Normalizes and hashes user data for Meta CAPI
 */
function hashData(data) {
  if (!data) return undefined;
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

/**
 * Worker to process Meta CAPI events
 */
const capiWorker = new Worker('meta-capi-events', async job => {
  const { tenant_id, event_id, event_name, timestamp, attribution, eventData, client_ip, user_agent } = job.data;
  
  // 1. Fetch tenant config to get Meta Pixel ID and Access Token
  const tenant = await db('tenants').where({ id: tenant_id }).first();
  if (!tenant || !tenant.meta_config || !tenant.meta_config.pixel_id || !tenant.meta_config.access_token) {
    logger.warn(`Skipping CAPI for tenant ${tenant_id}: Missing Meta configuration`);
    return;
  }

  const { pixel_id, access_token } = tenant.meta_config;

  // 2. Map event to Meta standard event names (e.g. AddToCart, ViewContent)
  // Our frontend sends standard names, so we can use event_name directly or map it if needed.
  
  // 3. Construct user_data
  const userData = {
    client_ip_address: client_ip,
    client_user_agent: user_agent,
  };

  // If we have fbclid, send it
  if (attribution && attribution.fbclid) {
    userData.fbc = `fb.1.${timestamp * 1000}.${attribution.fbclid}`;
  }
  
  // Custom data
  const customData = {
    currency: tenant.currency,
    // Add value if it's a purchase or ATC and we have the price in eventData
  };

  // 4. Construct payload
  const payload = {
    data: [
      {
        event_name: event_name,
        event_time: timestamp,
        action_source: 'website',
        event_id: event_id, // Deduplication key!
        user_data: userData,
        custom_data: customData,
        event_source_url: eventData?.page || `https://${tenant.domain}/promotion`
      }
    ],
    // Optional: test_event_code: 'TEST20224'
  };

  // 5. Send to Meta
  const url = `https://graph.facebook.com/v19.0/${pixel_id}/events?access_token=${access_token}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  
  if (result.error) {
    logger.error({ err: result.error, event_id }, 'Meta CAPI Error');
    throw new Error(result.error.message);
  }

  logger.info({ event_id }, 'Successfully sent event to Meta CAPI');
  
}, { connection });

capiWorker.on('failed', (job, err) => {
  logger.error({ job_id: job.id, err }, 'CAPI job failed');
});

module.exports = capiWorker;
