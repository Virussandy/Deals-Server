// utils/logger.js

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Set the current log level for the application.
// In a real production environment, this would likely come from an environment variable.
const currentLogLevel = 'info';

/**
 * Logs a message with a specific level and associated data.
 * @param {string} level - The log level (e.g., 'info', 'error').
 * @param {string} message - The main log message.
 * @param {object} [data={}] - Optional structured data to include with the log.
 */
function log(level, message, data = {}) {
  if (LOG_LEVELS[level] <= LOG_LEVELS[currentLogLevel]) {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };
    // In a production app, you might send this to a logging service.
    // For now, we'll just print it to the console in a structured way.
    console.log(JSON.stringify(logObject));
  }
}

export default {
  error: (message, data) => log('error', message, data),
  warn: (message, data) => log('warn', message, data),
  info: (message, data) => log('info', message, data),
  debug: (message, data) => log('debug', message, data),
};
