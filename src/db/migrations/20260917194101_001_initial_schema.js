/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Tenants Table
  await knex.schema.createTable('tenants', table => {
    table.string('id').primary(); // e.g. tenant_001
    table.string('brand_name').notNullable();
    table.string('domain').notNullable().unique();
    table.string('promotion_path').notNullable().defaultTo('/promotion');
    table.string('currency').notNullable().defaultTo('USD');
    table.string('timezone').notNullable().defaultTo('UTC');
    
    // Configs stored as JSONB for flexibility
    table.jsonb('shopify_config').defaultTo('{}');
    table.jsonb('meta_config').defaultTo('{}');
    table.jsonb('tracking_config').defaultTo('{}');
    
    table.timestamps(true, true);
  });

  // 2. Sessions (Attribution Data)
  await knex.schema.createTable('sessions', table => {
    table.string('id').primary(); // session UUID
    table.string('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    
    // Attribution Data
    table.string('utm_source');
    table.string('utm_medium');
    table.string('utm_campaign');
    table.string('utm_content');
    table.string('utm_term');
    table.string('fbclid');
    table.string('gclid');
    
    table.string('landing_page');
    table.string('referrer');
    table.string('ip_address');
    table.string('user_agent');
    
    table.timestamps(true, true);
    
    table.index(['tenant_id']);
  });

  // 3. Tracking Events
  await knex.schema.createTable('tracking_events', table => {
    table.string('id').primary(); // event_id (uuid)
    table.string('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('session_id').references('id').inTable('sessions').onDelete('SET NULL');
    
    table.string('event_name').notNullable(); // ViewContent, AddToCart, etc.
    table.string('product_id');
    table.string('variant_id');
    table.string('page');
    table.jsonb('event_data').defaultTo('{}');
    
    table.timestamps(true, true);
    
    table.index(['tenant_id', 'event_name']);
    table.index(['session_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('tracking_events');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('tenants');
};
