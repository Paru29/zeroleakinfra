const pino = require('pino');
const logger = pino();

/**
 * Creates a checkout using the Shopify Storefront API
 */
async function createCart(tenant, variantId, attribution, eventId) {
  const shopDomain = tenant.shopify_config?.shop_domain;
  const storefrontAccessToken = tenant.shopify_config?.storefront_access_token;
  
  if (!shopDomain || !storefrontAccessToken) {
    throw new Error('Shopify Storefront configuration missing for tenant');
  }

  const endpoint = `https://${shopDomain}/api/2024-04/graphql.json`;

  const cartCreateQuery = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Attach tracking parameters as cart attributes for attribution matching downstream (webhooks)
  const attributes = [
    { key: 'zl_event_id', value: eventId },
    { key: 'zl_tenant_id', value: tenant.id }
  ];

  if (attribution) {
    if (attribution.utm_source) attributes.push({ key: 'utm_source', value: attribution.utm_source });
    if (attribution.utm_medium) attributes.push({ key: 'utm_medium', value: attribution.utm_medium });
    if (attribution.utm_campaign) attributes.push({ key: 'utm_campaign', value: attribution.utm_campaign });
    if (attribution.fbclid) attributes.push({ key: 'fbclid', value: attribution.fbclid });
    if (attribution.gclid) attributes.push({ key: 'gclid', value: attribution.gclid });
  }

  const variables = {
    input: {
      lines: [
        {
          merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
          quantity: 1
        }
      ],
      attributes
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontAccessToken
    },
    body: JSON.stringify({ query: cartCreateQuery, variables })
  });

  const { data, errors } = await response.json();

  if (errors) {
    logger.error({ err: errors }, 'GraphQL errors from Shopify');
    throw new Error('Failed to create cart in Shopify');
  }

  const userErrors = data?.cartCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    logger.error({ err: userErrors }, 'User errors from Shopify cartCreate');
    throw new Error(userErrors[0].message);
  }

  return data.cartCreate.cart.checkoutUrl;
}

module.exports = {
  createCart
};
