import type { ConfigCategory } from '../services/configService';

export function getDefaultConfig(key: string): string | null {
  const defaultConfigs: Record<string, string> = {
    // API Configuration - from environment variables
    'api.base_url': import.meta.env.VITE_API_BASE_URL,
    'api.timeout': import.meta.env.VITE_API_TIMEOUT,

    'contact.support_email': import.meta.env.VITE_CONTACT_EMAIL,
    'contact.support_phone': import.meta.env.VITE_CONTACT_PHONE,
    'contact.website': import.meta.env.VITE_CONTACT_WEBSITE,

    'social.twitter': import.meta.env.VITE_SOCIAL_TWITTER,
    'social.facebook': import.meta.env.VITE_SOCIAL_FACEBOOK,
    'social.instagram': import.meta.env.VITE_SOCIAL_INSTAGRAM,

    // App Information
    'app.name': 'CERKYL',
    'app.version': '2.1.0',
    'app.description': 'AI-powered university admission assistant for Ghana',

    // Feature Flags
    'features.analytics_enabled': 'false',
    'features.debug_mode': 'true',
    'features.email_verification': 'true',
    'features.service_worker': 'true',

    // UI Configuration
    'ui.primary_color': '#3b82f6',
    'ui.secondary_color': '#10b981',
    'ui.accent_color': '#f59e0b',
    'ui.error_color': '#ef4444',
    'ui.success_color': '#10b981',
    'ui.warning_color': '#f59e0b',
    'ui.info_color': '#3b82f6',

    // Security
    'security.jwt_secret': 'your-jwt-secret-key',
    'security.refresh_token_expiry': '7d',
    'security.max_login_attempts': '5',

    'performance.cache_duration': '3600000',
    'performance.max_file_size': '5242880',
    'performance.allowed_file_types': 'image/jpeg,image/png,image/gif,application/pdf',

    // Chat Configuration
    'chat.timeout': '30000',
    'chat.max_message_length': '1000',
    'chat.max_conversation_history': '50',
  };

  return defaultConfigs[key] || null;
}

export function getDefaultConfigCategory(category: string): ConfigCategory {
  const defaultCategories: Record<string, ConfigCategory> = {
    api: {
      category: 'api',
      configs: [
        {
          id: 'api-base-url',
          key: 'api.base_url',
          value: 'http://localhost:3000/api/v1',
          type: 'string',
          category: 'api',
          description: 'Base URL for API endpoints',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'api-timeout',
          key: 'api.timeout',
          value: '10000',
          type: 'number',
          category: 'api',
          description: 'API request timeout in milliseconds',
          lastUpdated: new Date().toISOString(),
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    contact: {
      category: 'contact',
      configs: [
        {
          id: 'contact-support-email',
          key: 'contact.support_email',
          value: 'glinaxtechinnovations@gmail.com',
          type: 'string',
          category: 'contact',
          description: 'Support email address',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'contact-support-phone',
          key: 'contact.support_phone',
          value: '+233 24 123 4567',
          type: 'string',
          category: 'contact',
          description: 'Support phone number',
          lastUpdated: new Date().toISOString(),
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    social: {
      category: 'social',
      configs: [
        {
          id: 'social-twitter',
          key: 'social.twitter',
          value: '@glinax_gh',
          type: 'string',
          category: 'social',
          description: 'Twitter handle',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'social-facebook',
          key: 'social.facebook',
          value: 'Glinax Ghana',
          type: 'string',
          category: 'social',
          description: 'Facebook page name',
          lastUpdated: new Date().toISOString(),
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
  };

  return (
    defaultCategories[category] || {
      category,
      configs: [],
      lastUpdated: new Date().toISOString(),
    }
  );
}
