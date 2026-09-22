const db = require('../db');
const pino = require('pino');
const logger = pino();

/**
 * Middleware to resolve the tenant from the request.
 * Resolves by hostname first (for promotion pages), 
 * or by X-Tenant-Domain header (for API calls),
 * or by API keys (to be implemented).
 */
const resolveTenant = async (req, res, next) => {
  try {
    let domain = req.hostname;
    
    // Prioritize session tenant_id for authenticated dashboard users
    if (req.session && req.session.role === 'master_admin') {
      req.tenant = {
        id: 'master_admin',
        username: 'admin',
        brand_name: 'Master Admin',
        domain: 'track.zeroleakinfra.tech',
        shopify_config: {},
        meta_config: {},
        tracking_config: {}
      };
      return next();
    }

    if (req.session && req.session.tenant_id) {
      domain = req.session.tenant_id;
    } else if (req.headers['x-tenant-domain']) {
      // Fallback for tracker API calls from the client's store
      domain = req.headers['x-tenant-domain'];
    }

    // Check id column (explicit), domain column (legacy), or inside shopify_config JSONB (app install)
    const tenant = await db('tenants')
      .where({ id: domain }) // When 'domain' variable actually holds the explicit tenant ID
      .orWhere({ domain })
      .orWhereRaw("shopify_config->>'shop' = ?", [domain])
      .first();

    if (!tenant) {
      logger.warn(`Tenant not found for domain: ${domain}`);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Attach tenant to the request object for downstream use
    req.tenant = tenant;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error resolving tenant');
    res.status(500).json({ error: 'Internal server error during tenant resolution' });
  }
};

module.exports = { resolveTenant };
