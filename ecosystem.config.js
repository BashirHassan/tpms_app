// PM2 Ecosystem Configuration for DigitalTP
// Start with: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'digitaltp-backend',
      script: './src/server.js',
      cwd: '/var/www/digitaltp/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5007,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5007,
        FRONTEND_URL: 'https://app.sitpms.com',
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/www/digitaltp/logs/pm2-error.log',
      out_file: '/var/www/digitaltp/logs/pm2-out.log',
      merge_logs: true,
      // Restart strategy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
