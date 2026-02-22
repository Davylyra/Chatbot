import rateLimit from 'express-rate-limit';

export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(res.getHeader('Retry-After') / 60) + ' minutes'
    });
  }
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(res.getHeader('Retry-After') / 60) + ' minutes'
    });
  }
});

export const chatRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many messages, please slow down.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many payment attempts, please try again later.',
      retryAfter: Math.ceil(res.getHeader('Retry-After') / 3600) + ' hours'
    });
  }
});

export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many file uploads, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Webhook rate limit exceeded'
  },
  standardHeaders: false,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
  skipSuccessfulRequests: true // Don't count successful requests
});

export default {
  generalRateLimit,
  authRateLimit,
  chatRateLimit,
  paymentRateLimit,
  uploadRateLimit,
  webhookRateLimit
};

export const rateLimiters = {
  generalRateLimit,
  authRateLimit,
  chatRateLimit,
  paymentRateLimit,
  uploadRateLimit,
  webhookRateLimit
};
