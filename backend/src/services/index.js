/**
 * Services Index
 * Central export for all services
 * 
 * NOTE: After MedeePay pattern migration, most services that used the old
 * repository/model pattern have been deprecated. Controllers now use direct SQL.
 * This index only exports services that don't depend on old models.
 */

// Services that work with the new pattern (no model dependencies)
const healthService = require('./healthService');
const encryptionService = require('./encryptionService');
const cloudinaryService = require('./cloudinaryService');
const emailService = require('./emailService');
const emailQueueService = require('./emailQueueService');
const paystackService = require('./paystackService');
const documentService = require('./documentService');

// Export only services that are compatible with MedeePay pattern
module.exports = {
  healthService,
  encryptionService,
  cloudinaryService,
  emailService,
  emailQueueService,
  paystackService,
  documentService,
};
