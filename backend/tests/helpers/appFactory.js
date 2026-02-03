/**
 * App Factory for Testing
 * Creates an Express app instance for supertest
 */

const express = require('express');
const cors = require('cors');

/**
 * Create a test app instance with all routes
 * @returns {Express.Application} Express app
 */
function createTestApp() {
  const app = express();
  
  // Basic middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Add request ID
  app.use((req, res, next) => {
    req.requestId = `test-${Date.now()}`;
    next();
  });
  
  // Load routes
  const routes = require('../../src/routes');
  app.use('/api', routes);
  
  // Error handler
  const { errorHandler } = require('../../src/middleware');
  app.use(errorHandler);
  
  return app;
}

/**
 * Create a minimal test app for unit testing specific routes
 * @param {Function} routeLoader - Function that returns router
 * @returns {Express.Application} Express app
 */
function createMinimalApp(routeLoader) {
  const app = express();
  
  app.use(express.json());
  app.use((req, res, next) => {
    req.requestId = `test-${Date.now()}`;
    next();
  });
  
  app.use('/api', routeLoader());
  
  // Error handler
  app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Internal Server Error',
      errorCode: err.errorCode || 'INTERNAL_ERROR',
    });
  });
  
  return app;
}

module.exports = {
  createTestApp,
  createMinimalApp,
};
