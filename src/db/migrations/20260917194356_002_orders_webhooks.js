/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Orders
  await knex.schema.createTable('orders', table => {
    table.string('id').primary(); // Shopify order ID
    table.string('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('session_id').references('id').inTable('sessions').onDelete('SET NULL');
    
    table.decimal('total_price', 14, 2);
    table.string('currency');
    table.string('financial_status');
    
    table.timestamps(true, true);
    
    table.index(['tenant_id']);
  });

  // 2. Webhook Events (Idempotency)
  await knex.schema.createTable('webhook_events', table => {
    table.string('id').primary(); // Shopify webhook ID (X-Shopify-Webhook-Id)
    table.string('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('topic').notNullable(); // e.g. orders/create
    table.string('status').defaultTo('processing');
    
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('orders');
};
