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

const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['http://localhost:5173'];

const isLocalDevelopmentOrigin = (origin) => {
  if (!origin || nodeEnv !== 'development') return false;

  try {
    const { hostname } = new URL(origin);
    const isPrivateNetwork =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.sitpms.local') ||
      isPrivateNetwork
    );
  } catch (error) {
    return false;
  }
};

// Allow any subdomain of the production base domain (multi-tenancy)
const isInstitutionSubdomain = (origin) => {
  if (!origin) return false;
  const baseDomain = process.env.BASE_DOMAIN || 'sitpms.com';
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === 'https:' || nodeEnv !== 'production') &&
      hostname.endsWith('.' + baseDomain);
  } catch {
    return false;
  }
};

module.exports = {
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',

  db: (() => {
    if (nodeEnv === 'production') {
      if (!process.env.DB_PASSWORD) {
        throw new Error('DB_PASSWORD must be set in production');
      }
      if (!process.env.DB_USER || process.env.DB_USER === 'root') {
        console.warn('⚠️  WARNING: Running as DB root user in production. Use a dedicated database user.');
      }
    }
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'digitaltp',
    };
  })(),

  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret.length < 32) {
        if (nodeEnv === 'production') {
          throw new Error('JWT_SECRET must be set and at least 32 characters in production');
        }
        console.warn('⚠️  WARNING: JWT_SECRET is missing or too short. Set a strong secret before going to production!');
        return secret || 'default-secret-change-me-not-for-production';
      }
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origin(origin, callback) {
      if (!origin || configuredCorsOrigins.includes(origin) || isLocalDevelopmentOrigin(origin) || isInstitutionSubdomain(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
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
      email: process.env.SMTP_FROM_EMAIL || 'noreply@sitpms.com',
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
    localDomains: ['localhost', '127.0.0.1', 'sitpms.local'],
    // Allow subdomain via query param in dev
    allowQuerySubdomain: nodeEnv !== 'production',
  },

  // Multi-tenant settings
  multiTenant: {
    baseDomain: process.env.BASE_DOMAIN || 'sitpms.com',
    adminSubdomain: 'admin',
    apiSubdomain: 'api',
  },
};
