/**
 * Email Queue Service
 * 
 * Asynchronous email sending with:
 * - In-memory queue (can be upgraded to Redis/BullMQ for production)
 * - Retry with exponential backoff
 * - Dead-letter queue for permanently failed emails
 * - Queue health monitoring
 * 
 * USAGE:
 * const { emailQueueService } = require('./services');
 * await emailQueueService.enqueue(institutionId, {
 *   to: 'user@example.com',
 *   template: 'passwordReset',
 *   data: { name: 'John', resetUrl: '...' }
 * });
 */

const EventEmitter = require('events');
const emailService = require('./emailService');

// Queue configuration
const CONFIG = {
  // Maximum retry attempts before moving to dead-letter queue
  maxRetries: 3,
  
  // Base delay for exponential backoff (in ms)
  baseDelay: 1000,
  
  // Maximum delay between retries (in ms)
  maxDelay: 30000,
  
  // How often to process the queue (in ms)
  processInterval: 1000,
  
  // Maximum concurrent email sends
  concurrency: 5,
  
  // Dead-letter queue size limit (oldest items removed when exceeded)
  deadLetterLimit: 1000,
};

// Queue state
const queue = [];
const processing = new Set();
const deadLetterQueue = [];
let isProcessing = false;
let processInterval = null;

// Event emitter for queue events
const events = new EventEmitter();

/**
 * Calculate delay with exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt) {
  const delay = CONFIG.baseDelay * Math.pow(2, attempt);
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, CONFIG.maxDelay);
}

/**
 * Add email to queue
 * @param {number} institutionId
 * @param {Object} emailOptions - { to, template, data }
 * @param {Object} options - { priority: 'high' | 'normal' | 'low' }
 * @returns {string} Job ID
 */
function enqueue(institutionId, emailOptions, options = {}) {
  const jobId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const job = {
    id: jobId,
    institutionId,
    emailOptions,
    priority: options.priority || 'normal',
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    status: 'pending',
    lastError: null,
  };

  // Insert by priority (high first)
  if (options.priority === 'high') {
    // Find first non-high priority item
    const insertIndex = queue.findIndex(j => j.priority !== 'high');
    if (insertIndex === -1) {
      queue.push(job);
    } else {
      queue.splice(insertIndex, 0, job);
    }
  } else if (options.priority === 'low') {
    queue.push(job);
  } else {
    // Normal priority: insert after high, before low
    const insertIndex = queue.findIndex(j => j.priority === 'low');
    if (insertIndex === -1) {
      queue.push(job);
    } else {
      queue.splice(insertIndex, 0, job);
    }
  }

  events.emit('enqueued', job);
  console.log(`[EMAIL QUEUE] Enqueued ${emailOptions.template} email to ${emailOptions.to} (${jobId})`);

  // Start processing if not already running
  startProcessing();

  return jobId;
}

/**
 * Process a single job
 * @param {Object} job
 */
async function processJob(job) {
  if (processing.has(job.id)) {
    return;
  }

  processing.add(job.id);
  job.status = 'processing';

  try {
    const result = await emailService.sendEmail(job.institutionId, job.emailOptions);

    if (result.success) {
      // Remove from queue
      const index = queue.indexOf(job);
      if (index > -1) {
        queue.splice(index, 1);
      }

      job.status = 'completed';
      job.completedAt = Date.now();
      
      events.emit('completed', job, result);
      console.log(`[EMAIL QUEUE] Completed ${job.emailOptions.template} email (${job.id})`);
    } else {
      throw new Error(result.error || 'Email send failed');
    }
  } catch (error) {
    job.attempts++;
    job.lastError = error.message;

    if (job.attempts >= CONFIG.maxRetries) {
      // Move to dead-letter queue
      const index = queue.indexOf(job);
      if (index > -1) {
        queue.splice(index, 1);
      }

      job.status = 'dead-letter';
      job.failedAt = Date.now();
      
      // Add to dead-letter queue (limit size)
      deadLetterQueue.push(job);
      if (deadLetterQueue.length > CONFIG.deadLetterLimit) {
        deadLetterQueue.shift();
      }

      events.emit('dead-letter', job, error);
      console.error(`[EMAIL QUEUE] Moved to dead-letter: ${job.id} after ${job.attempts} attempts - ${error.message}`);
    } else {
      // Schedule retry with exponential backoff
      const delay = calculateDelay(job.attempts);
      job.nextAttemptAt = Date.now() + delay;
      job.status = 'pending';

      events.emit('retry', job, error, delay);
      console.warn(`[EMAIL QUEUE] Retry ${job.attempts}/${CONFIG.maxRetries} for ${job.id} in ${Math.round(delay / 1000)}s - ${error.message}`);
    }
  } finally {
    processing.delete(job.id);
  }
}

/**
 * Process queue
 */
async function processQueue() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const now = Date.now();
    
    // Get ready jobs (pending and past nextAttemptAt)
    const readyJobs = queue.filter(job => 
      job.status === 'pending' && 
      job.nextAttemptAt <= now &&
      !processing.has(job.id)
    );

    // Process up to concurrency limit
    const jobsToProcess = readyJobs.slice(0, CONFIG.concurrency - processing.size);

    if (jobsToProcess.length > 0) {
      await Promise.all(jobsToProcess.map(job => processJob(job)));
    }
  } catch (error) {
    console.error('[EMAIL QUEUE] Error processing queue:', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start queue processing
 */
function startProcessing() {
  if (processInterval) {
    return;
  }

  processInterval = setInterval(processQueue, CONFIG.processInterval);
  console.log('[EMAIL QUEUE] Started queue processing');
  
  // Process immediately
  processQueue();
}

/**
 * Stop queue processing
 */
function stopProcessing() {
  if (processInterval) {
    clearInterval(processInterval);
    processInterval = null;
    console.log('[EMAIL QUEUE] Stopped queue processing');
  }
}

/**
 * Get queue health status
 * @returns {Object}
 */
function getHealth() {
  const now = Date.now();
  
  const pending = queue.filter(j => j.status === 'pending').length;
  const retrying = queue.filter(j => j.status === 'pending' && j.attempts > 0).length;
  const processingCount = processing.size;
  const deadLetter = deadLetterQueue.length;

  // Calculate average wait time for pending jobs
  const pendingJobs = queue.filter(j => j.status === 'pending');
  const avgWaitTime = pendingJobs.length > 0
    ? pendingJobs.reduce((sum, j) => sum + (now - j.createdAt), 0) / pendingJobs.length
    : 0;

  // Oldest job in queue
  const oldestJob = queue[0];
  const oldestJobAge = oldestJob ? now - oldestJob.createdAt : 0;

  return {
    isRunning: processInterval !== null,
    queueSize: queue.length,
    pending,
    retrying,
    processing: processingCount,
    deadLetter,
    avgWaitTimeMs: Math.round(avgWaitTime),
    oldestJobAgeMs: oldestJobAge,
    config: {
      maxRetries: CONFIG.maxRetries,
      concurrency: CONFIG.concurrency,
      processIntervalMs: CONFIG.processInterval,
    },
  };
}

/**
 * Get dead-letter queue contents
 * @param {number} limit
 * @returns {Array}
 */
function getDeadLetterQueue(limit = 50) {
  return deadLetterQueue.slice(-limit).map(job => ({
    id: job.id,
    institutionId: job.institutionId,
    template: job.emailOptions.template,
    to: job.emailOptions.to,
    attempts: job.attempts,
    lastError: job.lastError,
    createdAt: new Date(job.createdAt).toISOString(),
    failedAt: new Date(job.failedAt).toISOString(),
  }));
}

/**
 * Retry a dead-letter job
 * @param {string} jobId
 * @returns {boolean}
 */
function retryDeadLetter(jobId) {
  const index = deadLetterQueue.findIndex(j => j.id === jobId);
  if (index === -1) {
    return false;
  }

  const job = deadLetterQueue.splice(index, 1)[0];
  
  // Reset job for retry
  job.attempts = 0;
  job.status = 'pending';
  job.nextAttemptAt = Date.now();
  job.lastError = null;
  delete job.failedAt;

  queue.push(job);
  
  events.emit('retry-dead-letter', job);
  console.log(`[EMAIL QUEUE] Retrying dead-letter job ${jobId}`);

  startProcessing();
  return true;
}

/**
 * Clear dead-letter queue
 * @returns {number} Number of items cleared
 */
function clearDeadLetterQueue() {
  const count = deadLetterQueue.length;
  deadLetterQueue.length = 0;
  console.log(`[EMAIL QUEUE] Cleared ${count} dead-letter jobs`);
  return count;
}

/**
 * Get job status
 * @param {string} jobId
 * @returns {Object|null}
 */
function getJobStatus(jobId) {
  // Check active queue
  const activeJob = queue.find(j => j.id === jobId);
  if (activeJob) {
    return {
      id: activeJob.id,
      status: activeJob.status,
      attempts: activeJob.attempts,
      lastError: activeJob.lastError,
      createdAt: new Date(activeJob.createdAt).toISOString(),
      nextAttemptAt: activeJob.nextAttemptAt ? new Date(activeJob.nextAttemptAt).toISOString() : null,
    };
  }

  // Check dead-letter queue
  const deadJob = deadLetterQueue.find(j => j.id === jobId);
  if (deadJob) {
    return {
      id: deadJob.id,
      status: 'dead-letter',
      attempts: deadJob.attempts,
      lastError: deadJob.lastError,
      createdAt: new Date(deadJob.createdAt).toISOString(),
      failedAt: new Date(deadJob.failedAt).toISOString(),
    };
  }

  return null;
}

/**
 * Convenience: Queue email and return immediately
 * @param {number} institutionId
 * @param {Object} emailOptions
 * @param {Object} options
 * @returns {string} Job ID
 */
function queueEmail(institutionId, emailOptions, options = {}) {
  return enqueue(institutionId, emailOptions, options);
}

/**
 * Convenience: Send email with high priority (e.g., password resets)
 * @param {number} institutionId
 * @param {Object} emailOptions
 * @returns {string} Job ID
 */
function queueHighPriority(institutionId, emailOptions) {
  return enqueue(institutionId, emailOptions, { priority: 'high' });
}

// Auto-start processing when module is loaded
startProcessing();

module.exports = {
  // Core functions
  enqueue,
  queueEmail,
  queueHighPriority,
  
  // Queue management
  startProcessing,
  stopProcessing,
  getHealth,
  
  // Dead-letter management
  getDeadLetterQueue,
  retryDeadLetter,
  clearDeadLetterQueue,
  
  // Job status
  getJobStatus,
  
  // Events
  events,
  
  // Configuration (read-only)
  config: { ...CONFIG },
};
