/**
 * Health Service
 * System health monitoring and diagnostics
 */

const pool = require('../db/connection');
const config = require('../config');
const os = require('os');

// Track server start time
const startTime = Date.now();

// Response time tracking
const responseTimes = [];
const MAX_RESPONSE_TIMES = 1000;

// Health check results cache
let lastHealthCheck = null;
let lastHealthCheckTime = 0;
const HEALTH_CHECK_CACHE_TTL = 5000; // 5 seconds

/**
 * Check database connectivity
 */
const checkDatabase = async () => {
  const startTime = Date.now();

  try {
    const [rows] = await pool.query('SELECT 1 as health_check');
    const connectionTime = Date.now() - startTime;

    return {
      healthy: true,
      connectionTimeMs: connectionTime,
      message: 'Database connection successful',
    };
  } catch (error) {
    return {
      healthy: false,
      connectionTimeMs: Date.now() - startTime,
      message: error.message,
    };
  }
};

/**
 * Get system metrics
 */
const getSystemMetrics = () => {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  // Calculate CPU usage (simple approximation)
  const cpuUsage = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return acc + ((total - idle) / total) * 100;
  }, 0) / cpus.length;

  return {
    uptime: Math.floor((Date.now() - startTime) / 1000),
    uptimeFormatted: formatUptime(Date.now() - startTime),
    memory: {
      total: formatBytes(totalMemory),
      used: formatBytes(usedMemory),
      free: formatBytes(freeMemory),
      usagePercent: Math.round((usedMemory / totalMemory) * 100),
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      usagePercent: Math.round(cpuUsage),
    },
    platform: os.platform(),
    nodeVersion: process.version,
  };
};

/**
 * Get response time statistics
 */
const getResponseTimeStats = () => {
  if (responseTimes.length === 0) {
    return { avg: 0, min: 0, max: 0, count: 0 };
  }

  const sorted = [...responseTimes].sort((a, b) => a - b);
  const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  return {
    avg: Math.round(avg),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    count: responseTimes.length,
  };
};

/**
 * Record response time
 */
const recordResponseTime = (timeMs) => {
  responseTimes.push(timeMs);
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    responseTimes.shift();
  }
};

/**
 * Response time tracking middleware
 */
const responseTimeMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    recordResponseTime(duration);
  });

  next();
};

/**
 * Quick health check for load balancers
 */
const getQuickHealth = async () => {
  const dbHealth = await checkDatabase();

  return {
    status: dbHealth.healthy ? 'ok' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbHealth.healthy,
  };
};

/**
 * Detailed health check
 */
const getDetailedHealth = async () => {
  const now = Date.now();

  // Use cached result if recent
  if (lastHealthCheck && now - lastHealthCheckTime < HEALTH_CHECK_CACHE_TTL) {
    return lastHealthCheck;
  }

  const [dbHealth, systemMetrics, responseStats] = await Promise.all([
    checkDatabase(),
    getSystemMetrics(),
    getResponseTimeStats(),
  ]);

  const healthCheck = {
    status: dbHealth.healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv,
    checks: {
      database: dbHealth,
    },
    system: systemMetrics,
    performance: responseStats,
  };

  // Cache result
  lastHealthCheck = healthCheck;
  lastHealthCheckTime = now;

  return healthCheck;
};

/**
 * Health check endpoint middleware
 */
const healthCheckMiddleware = async (req, res) => {
  const health = await getDetailedHealth();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
};

// Utility functions
const formatBytes = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
};

const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

module.exports = {
  checkDatabase,
  getSystemMetrics,
  getResponseTimeStats,
  recordResponseTime,
  responseTimeMiddleware,
  getQuickHealth,
  getDetailedHealth,
  healthCheckMiddleware,
};
