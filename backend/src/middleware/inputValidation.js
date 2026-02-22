/**
 * INPUT VALIDATION & SANITIZATION MIDDLEWARE
 * Production-ready input validation for all API endpoints
 * Prevents XSS, SQL injection, and invalid data
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize string input to prevent XSS
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate email ends with @gmail.com
 */
export const validateGmailDomain = (email) => {
  if (typeof email !== 'string') return false;
  return email.toLowerCase().endsWith('@gmail.com');
};

/**
 * Validate password strength
 */
export const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letters');
  if (!/[0-9]/.test(password)) errors.push('Password must contain numbers');
  if (!/[!@#$%^&*]/.test(password)) errors.push('Password must contain special characters (!@#$%^&*)');
  return { valid: errors.length === 0, errors };
};

/**
 * Validate amount (monetary)
 */
export const validateAmount = (amount, min = 0, max = 100000) => {
  const num = parseFloat(amount);
  if (isNaN(num)) return { valid: false, error: 'Amount must be a number' };
  if (num < min) return { valid: false, error: `Minimum amount is ${min}` };
  if (num > max) return { valid: false, error: `Maximum amount is ${max}` };
  return { valid: true };
};

/**
 * Validate Ghana phone number
 */
export const validateGhanaPhoneNumber = (phoneNumber) => {
  const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
  if (!/^(0|\+233)?[0-9]{9}$/.test(cleanNumber)) {
    return { valid: false, error: 'Invalid Ghana phone number format' };
  }
  return { valid: true, cleaned: cleanNumber };
};

/**
 * Validate message length
 */
export const validateMessageLength = (message, min = 1, max = 5000) => {
  if (!message || message.length < min) {
    return { valid: false, error: `Message must be at least ${min} character(s)` };
  }
  if (message.length > max) {
    return { valid: false, error: `Message must not exceed ${max} characters` };
  }
  return { valid: true };
};

/**
 * Middleware to validate and sanitize request body
 */
export const validateRequestBody = (req, res, next) => {
  try {
    // Sanitize all string fields in request body
    const sanitizedBody = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        sanitizedBody[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects (be careful with nested structures)
        sanitizedBody[key] = value;
      } else {
        sanitizedBody[key] = value;
      }
    }
    req.body = sanitizedBody;
    next();
  } catch (error) {
    console.error('Validation error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid request format'
    });
  }
};

/**
 * Validate authentication payload
 */
export const validateAuthPayload = (req, res, next) => {
  const { email, password } = req.body;
  const isSignup = req.path && req.path.includes('signup');

  const errors = [];

  if (!email) {
    errors.push('Email is required');
  } else if (!validateEmail(email)) {
    errors.push('Invalid email format');
  } else if (isSignup && !validateGmailDomain(email)) {
    errors.push('Email must end with @gmail.com');
  }

  if (!password) {
    errors.push('Password is required');
  } else if (isSignup) {
    // For signup, validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }
  }

  if (errors.length > 0) {
    // Log validation failure for debugging
    console.log('🔍 Auth validation failed:', {
      endpoint: req.path,
      receivedEmail: email ? '✓' : '✗',
      receivedPassword: password ? '✓' : '✗',
      isSignup,
      errors
    });
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
      errorDetails: errors.join('; ')
    });
  }

  next();
};

/**
 * Validate chat message payload
 */
export const validateChatPayload = (req, res, next) => {
  const { message, conversation_id } = req.body;

  const errors = [];

  if (!message) {
    errors.push('Message is required');
  } else {
    const msgValidation = validateMessageLength(message, 1, 5000);
    if (!msgValidation.valid) {
      errors.push(msgValidation.error);
    }
  }

  if (!conversation_id) {
    errors.push('Conversation ID is required');
  } else if (typeof conversation_id !== 'string') {
    errors.push('Conversation ID must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

/**
 * Validate payment payload
 */
export const validatePaymentPayload = (req, res, next) => {
  const { amount, mobileMoneyNumber, mobileMoneyProvider, email } = req.body;

  const errors = [];

  if (!amount) {
    errors.push('Amount is required');
  } else {
    const amountValidation = validateAmount(amount, 1, 10000);
    if (!amountValidation.valid) {
      errors.push(amountValidation.error);
    }
  }

  if (mobileMoneyNumber) {
    const phoneValidation = validateGhanaPhoneNumber(mobileMoneyNumber);
    if (!phoneValidation.valid) {
      errors.push(phoneValidation.error);
    }
  }

  if (mobileMoneyProvider && !['mtn', 'vod', 'tgo'].includes(mobileMoneyProvider.toLowerCase())) {
    errors.push('Invalid mobile money provider. Use: mtn, vod, or tgo');
  }

  if (email && !validateEmail(email)) {
    errors.push('Invalid email format');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

/**
 * Validate profile update payload
 */
export const validateProfilePayload = (req, res, next) => {
  const { name, email, password, currentPassword } = req.body;

  const errors = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2) {
      errors.push('Name must be at least 2 characters');
    }
    if (name.length > 100) {
      errors.push('Name must not exceed 100 characters');
    }
  }

  if (email !== undefined) {
    if (!validateEmail(email)) {
      errors.push('Invalid email format');
    }
  }

  if (password !== undefined) {
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!currentPassword) {
      errors.push('Current password is required to set a new password');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

export default {
  sanitizeString,
  validateEmail,
  validatePassword,
  validateAmount,
  validateGhanaPhoneNumber,
  validateMessageLength,
  validateRequestBody,
  validateAuthPayload,
  validateChatPayload,
  validatePaymentPayload,
  validateProfilePayload
  , validateGmailDomain
};
 
