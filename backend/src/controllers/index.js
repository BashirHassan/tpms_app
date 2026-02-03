/**
 * Controllers Index
 * Central export for all controllers
 */

const authController = require('./authController');
const institutionController = require('./institutionController');
const featureToggleController = require('./featureToggleController');
const academicController = require('./academicController');
const rankController = require('./rankController');
const studentController = require('./studentController');
const routeController = require('./routeController');
const schoolController = require('./schoolController');
const sessionController = require('./sessionController');
const paymentController = require('./paymentController');
const acceptanceController = require('./acceptanceController');
const portalController = require('./portalController');
const postingController = require('./postingController');
const allowanceController = require('./allowanceController');
const letterController = require('./letterController');

// Phase 6: Monitoring
const monitoringController = require('./monitoringController');

// Phase 7: Student Results
const resultController = require('./resultController');

// SSO Integration
const ssoController = require('./ssoController');
const apiKeysController = require('./apiKeysController');

module.exports = {
  authController,
  institutionController,
  featureToggleController,
  academicController,
  rankController,
  studentController,
  routeController,
  schoolController,
  sessionController,
  paymentController,
  acceptanceController,
  portalController,
  postingController,
  allowanceController,
  letterController,
  // Phase 6
  monitoringController,
  // Phase 7
  resultController,
  // SSO Integration
  ssoController,
  apiKeysController,
};
