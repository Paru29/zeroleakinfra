exports.up = async function(knex) {
  await knex.schema.alterTable('tenants', table => {
    table.string('username').unique();
    table.string('password_hash');
  });
};
exports.down = async function(knex) {
  await knex.schema.alterTable('tenants', table => {
    table.dropColumn('username');
    table.dropColumn('password_hash');
  });
};
