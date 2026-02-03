/**
 * DigitalTP Backend Server
 * Teaching Practice Management System - Multi-tenant SaaS Platform
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const {
  errorHandler,
  addRequestId,
  sanitizeRequest,
  requestSizeLimit,
  preventPathTraversal,
  securityHeaders,
  blockSuspiciousUserAgents,
  apiRateLimiter,
  resolveSubdomain,
} = require('./middleware');
// Import healthService directly to avoid loading all services (some still use deprecated models)
const healthService = require('./services/healthService');

const app = express();

// ============ Security Middleware ============

// Add request ID for tracing
app.use(addRequestId);

// Security headers
app.use(
  securityHeaders({
    hsts: config.isProduction,
    contentSecurityPolicy: config.isProduction,
  })
);

// Block suspicious user agents in production
if (config.isProduction) {
  app.use(blockSuspiciousUserAgents({ blockEmpty: false }));
}

// Prevent path traversal attacks
app.use(preventPathTraversal);

// Request size limits
app.use(
  requestSizeLimit({
    maxBodySize: 50 * 1024 * 1024, // 50MB for file uploads
    maxJsonSize: 5 * 1024 * 1024, // 5MB for JSON
  })
);

// Response time tracking
app.use(healthService.responseTimeMiddleware);

// ============ Standard Middleware ============

// CORS configuration
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  })
);

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request sanitization (after body parsing)
app.use(sanitizeRequest);

// ============ Subdomain Resolution ============

// Resolve institution from subdomain for multi-tenant SaaS
app.use(resolveSubdomain);

// ============ Static Files ============

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============ Request Logging ============

if (config.isDevelopment) {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} [${req.requestId?.slice(0, 8)}]`);
    next();
  });
}

// ============ Health Check Endpoints ============

// Quick health check (for load balancers)
app.get('/health', async (req, res) => {
  const health = await healthService.getQuickHealth();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Detailed health check (for monitoring)
app.get('/health/detailed', healthService.healthCheckMiddleware);

// ============ API Routes ============

app.use('/api', routes);

// ============ 404 Handler ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    errorCode: 'NOT_FOUND',
    path: req.path,
  });
});

// ============ Error Handler ============

app.use(errorHandler);

// ============ Start Server ============

const startServer = async () => {
  try {
    // Listen on 0.0.0.0 to allow access from other devices on the network
    app.listen(config.port, '0.0.0.0', () => {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║                  DigitalTP Backend                     ║');
      console.log('║          Teaching Practice Management System           ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  🚀 Server running on port ${config.port}                        ║`);
      console.log(`║  🌍 Environment: ${config.nodeEnv.padEnd(36)}  ║`);
      console.log(`║  📊 API: http://localhost:${config.port}/api                    ║`);
      console.log(`║  📱 Network: http://0.0.0.0:${config.port}/api                   ║`);
      console.log(`║  ❤️  Health: http://localhost:${config.port}/health               ║`);
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
