/**
 * Configuration Module
 * Centralized configuration with smart environment detection
 */

const path = require('path');
const fs = require('fs');

/**
 * Smart Environment Detection
 * Automatically detects environment without requiring NODE_ENV to be set.
 * Production: Running from /var/www, /home, /srv, /opt paths or has .production marker
 * Development: Default for Windows or local development
 */
function detectEnvironment() {
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV;
  }

  const cwd = process.cwd();

  // Production indicators (Linux server paths)
  const productionPaths = ['/var/www', '/home/', '/srv/', '/opt/'];

  const isProductionPath = productionPaths.some((p) => cwd.includes(p));
  const hasProductionMarker = fs.existsSync(path.join(cwd, '.production'));
  const isWindows = process.platform === 'win32';

  if (hasProductionMarker) return 'production';
  if (isWindows) return 'development';
  if (isProductionPath) return 'production';

  return 'development';
}

// Load environment-specific .env file
const detectedEnv = detectEnvironment();
const envFile = detectedEnv === 'production' ? '.env.production' : '.env';
const envPath = path.join(__dirname, '../../', fs.existsSync(path.join(__dirname, '../../', envFile)) ? envFile : '.env');

require('dotenv').config({ path: envPath });

const nodeEnv = detectedEnv;

module.exports = {
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digitaltp',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5173', 'http://192.168.0.151:5173'],
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: {
      name: process.env.SMTP_FROM_NAME || 'DigitalTP',
      email: process.env.SMTP_FROM_EMAIL || 'noreply@digitaltp.com',
    },
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    path: process.env.UPLOAD_PATH || 'uploads',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  // Local development settings for subdomain testing
  localDev: {
    enabled: nodeEnv !== 'production',
    // Domains considered "local" for subdomain extraction
    localDomains: ['localhost', '127.0.0.1', 'digitaltipi.local'],
    // Allow subdomain via query param in dev
    allowQuerySubdomain: nodeEnv !== 'production',
  },

  // Multi-tenant settings
  multiTenant: {
    baseDomain: process.env.BASE_DOMAIN || 'digitaltipi.com',
    adminSubdomain: 'admin',
    apiSubdomain: 'api',
  },
};
