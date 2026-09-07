// PM2 Ecosystem Configuration for DigitalTP
// Start with: pm2 start ecosystem.config.js --env production
//
// One committed file serves BOTH deployments. It resolves every path from its
// own location and picks the environment from the directory it is checked out
// into, so /var/www/tpms and /var/www/tpms_staging each get the right process
// name, port and log paths with no local edits.
//
// This used to be production-only, and staging carried an uncommitted local
// copy. Any `git reset --hard` on staging silently reverted it to the
// production values - name tpms-backend, port 5007, cwd /var/www/tpms - which
// would have collided with the live production process.
//
// Override the detection explicitly with TPMS_ENV=staging|production.

const path = require('path');

const ROOT = __dirname;

const ENVIRONMENTS = {
  production: {
    name: 'tpms-backend',
    port: 5007,
    frontendUrl: 'https://app.sitpms.com',
  },
  staging: {
    name: 'tpms-staging-backend',
    port: 5009,
    frontendUrl: 'https://demo.sitpms.com',
  },
};

// Deliberately an exact allowlist rather than a default. An unrecognised
// directory must NOT quietly fall back to production: that would hand a third
// checkout production's name and port 5007 and collide with the live process -
// the very failure mode this file exists to prevent.
const DIRECTORY_ENVIRONMENTS = {
  tpms: 'production',
  tpms_staging: 'staging',
};

const dirName = path.basename(ROOT);
const envName = process.env.TPMS_ENV || DIRECTORY_ENVIRONMENTS[dirName];
const target = ENVIRONMENTS[envName];

if (!target) {
  throw new Error(
    envName
      ? `Unknown TPMS_ENV "${envName}". Expected one of: ${Object.keys(ENVIRONMENTS).join(', ')}`
      : `Cannot tell which environment "${dirName}" is. Expected the checkout to be ` +
        `named one of: ${Object.keys(DIRECTORY_ENVIRONMENTS).join(', ')}. ` +
        `Set TPMS_ENV=${Object.keys(ENVIRONMENTS).join('|')} to say explicitly.`
  );
}

module.exports = {
  apps: [
    {
      name: target.name,
      script: './src/server.js',
      cwd: path.join(ROOT, 'backend'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: target.port,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: target.port,
        FRONTEND_URL: target.frontendUrl,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(ROOT, 'logs', 'pm2-error.log'),
      out_file: path.join(ROOT, 'logs', 'pm2-out.log'),
      merge_logs: true,
      // Restart strategy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
