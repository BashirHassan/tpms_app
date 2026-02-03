/**
 * Models Index
 * 
 * Exports kept models after MedeePay pattern migration.
 * Only User and Institution models remain - other entities
 * are accessed via direct SQL queries in controllers.
 */

const User = require('./User');
const Institution = require('./Institution');

module.exports = {
  User,
  Institution,
};
