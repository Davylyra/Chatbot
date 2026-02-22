// Winston logger setup
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logObject = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };
    return JSON.stringify(logObject);
  })
);

// Create logger
const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  defaultMeta: { service: 'glinax-backend' },
  transports: [
    // Console transport (all environments)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      )
    }),

    // Error log file (production only)
    ...(process.env.NODE_ENV === 'production' ? [
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxDays: '30d',
        level: 'error',
        format: customFormat
      })
    ] : []),

    // All logs file (production only)
    ...(process.env.NODE_ENV === 'production' ? [
      new DailyRotateFile({
        filename: 'logs/app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '50m',
        maxDays: '14d',
        format: customFormat
      })
    ] : [])
  ]
});

// Export logger with methods
export default {
  info: (message, meta) => logger.info(message, meta || {}),
  error: (message, error, meta) => logger.error(message, { error: error?.message || error, stack: error?.stack, ...meta }),
  warn: (message, meta) => logger.warn(message, meta || {}),
  debug: (message, meta) => logger.debug(message, meta || {}),
  http: (message, meta) => logger.info(`HTTP: ${message}`, meta || {}),
  
  // Structured logging for specific events
  payment: (action, data) => logger.info(`Payment: ${action}`, { action, ...data }),
  chat: (action, data) => logger.info(`Chat: ${action}`, { action, ...data }),
  auth: (action, data) => logger.info(`Auth: ${action}`, { action, ...data }),
  notification: (action, data) => logger.info(`Notification: ${action}`, { action, ...data }),
  
  // Security logging
  security: (event, details) => logger.warn(`SECURITY: ${event}`, { event, ...details })
};
