/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('tenants', table => {
    table.string('razorpay_customer_id').nullable();
    table.string('razorpay_subscription_id').nullable();
    table.string('subscription_status').defaultTo('trialing');
    table.string('subscription_plan').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('tenants', table => {
    table.dropColumn('razorpay_customer_id');
    table.dropColumn('razorpay_subscription_id');
    table.dropColumn('subscription_status');
    table.dropColumn('subscription_plan');
  });
};
