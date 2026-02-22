/**
 * Utility: Validation
 * Description: Comprehensive form validation utilities
 * Features: Email, phone, password, required field validation
 */

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateField = (value: any, rules: ValidationRule, fieldName: string): string | null => {
  // Required validation
  if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
    return `${fieldName} is required`;
  }

  // Skip other validations if value is empty and not required
  if (!value || (typeof value === 'string' && !value.trim())) {
    return null;
  }

  // Min length validation
  if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
    return `${fieldName} must be at least ${rules.minLength} characters`;
  }

  // Max length validation
  if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
    return `${fieldName} must be no more than ${rules.maxLength} characters`;
  }

  // Pattern validation
  if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
    return `${fieldName} format is invalid`;
  }

  // Custom validation
  if (rules.custom) {
    return rules.custom(value);
  }

  return null;
};

export const validateForm = (data: Record<string, any>, rules: Record<string, ValidationRule>): ValidationResult => {
  const errors: Record<string, string> = {};

  Object.keys(rules).forEach(fieldName => {
    const fieldValue = data[fieldName];
    const fieldRules = rules[fieldName];
    const error = validateField(fieldValue, fieldRules, fieldName);
    
    if (error) {
      errors[fieldName] = error;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Common validation rules
export const validationRules = {
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    custom: (value: string) => {
      if (!value.includes('@')) {
        return 'Email must contain @ symbol';
      }
      if (!value.includes('.')) {
        return 'Email must contain a domain';
      }
      return null;
    }
  },
  
  password: {
    required: true,
    minLength: 8,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    custom: (value: string) => {
      if (!/(?=.*[a-z])/.test(value)) {
        return 'Password must contain at least one lowercase letter';
      }
      if (!/(?=.*[A-Z])/.test(value)) {
        return 'Password must contain at least one uppercase letter';
      }
      if (!/(?=.*\d)/.test(value)) {
        return 'Password must contain at least one number';
      }
      return null;
    }
  },
  
  phone: {
    required: true,
    pattern: /^\+?[1-9]\d{1,14}$/,
    custom: (value: string) => {
      const cleanValue = value.replace(/\s+/g, '');
      if (!/^\+?[1-9]\d{1,14}$/.test(cleanValue)) {
        return 'Phone number must be valid (e.g., +233123456789)';
      }
      return null;
    }
  },
  
  name: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s]+$/,
    custom: (value: string) => {
      if (!/^[a-zA-Z\s]+$/.test(value)) {
        return 'Name can only contain letters and spaces';
      }
      return null;
    }
  },
  
  required: {
    required: true
  }
};

// Ghana-specific phone number validation
export const validateGhanaPhone = (phone: string): string | null => {
  const cleanPhone = phone.replace(/\s+/g, '');
  
  // Ghana phone number patterns
  const patterns = [
    /^\+233[0-9]{9}$/, // +233XXXXXXXXX
    /^0[0-9]{9}$/, // 0XXXXXXXXX
    /^233[0-9]{9}$/ // 233XXXXXXXXX
  ];
  
  const isValid = patterns.some(pattern => pattern.test(cleanPhone));
  
  if (!isValid) {
    return 'Please enter a valid Ghana phone number (e.g., +233123456789 or 0123456789)';
  }
  
  return null;
};

// University form validation
export const validateUniversityForm = (data: {
  fullName: string;
  email: string;
  phone: string;
  university: string;
}): ValidationResult => {
  const rules = {
    fullName: validationRules.name,
    email: validationRules.email,
    phone: {
      required: true,
      custom: validateGhanaPhone
    },
    university: validationRules.required
  };
  
  return validateForm(data, rules);
};
