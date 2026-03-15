/**
 * Development Logger Utility
 * 
 * Provides conditional logging that only runs in development mode.
 * In production, all logs are suppressed to improve performance and security.
 */

const isDevelopment = import.meta.env.MODE === 'development';

class Logger {
  /**
   * Log informational messages (development only)
   */
  info(...args: any[]): void {
    if (isDevelopment) {
      console.log(...args);
    }
  }

  /**
   * Log warning messages (development only)
   */
  warn(...args: any[]): void {
    if (isDevelopment) {
      console.warn(...args);
    }
  }

  /**
   * Log error messages (always logged, even in production)
   * Use this for critical errors that need to be tracked
   */
  error(...args: any[]): void {
    console.error(...args);
  }

  /**
   * Log debug messages with context (development only)
   */
  debug(context: string, ...args: any[]): void {
    if (isDevelopment) {
      console.log(`[${context}]`, ...args);
    }
  }
}

export const logger = new Logger();
