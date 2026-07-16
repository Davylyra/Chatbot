import type { ConfigCategory } from "../services/configService";

export function getDefaultConfig(key: string): string | null {
  const defaultConfigs: Record<string, string> = {
    "api.base_url": import.meta.env.VITE_API_BASE_URL,
    "api.timeout": import.meta.env.VITE_API_TIMEOUT,

    "contact.support_email": import.meta.env.VITE_CONTACT_EMAIL,
    "contact.support_phone": import.meta.env.VITE_CONTACT_PHONE,

    // App Information
    "app.name": import.meta.env.VITE_APP_NAME as string,
    "app.version": import.meta.env.VITE_APP_VERSION as string,
    "app.description": import.meta.env.VITE_APP_DESCRIPTION as string,

    // Feature Flags
    "features.analytics_enabled": "false",
    "features.debug_mode": "true",
    "features.email_verification": "true",
    "features.service_worker": "true",

    // UI Configuration
    "ui.primary_color": "#3b82f6",
    "ui.secondary_color": "#10b981",
    "ui.accent_color": "#f59e0b",
    "ui.error_color": "#ef4444",
    "ui.success_color": "#10b981",
    "ui.warning_color": "#f59e0b",
    "ui.info_color": "#3b82f6",

    // Security
    "security.jwt_secret": "your-jwt-secret-key",
    "security.refresh_token_expiry": "7d",
    "security.max_login_attempts": "5",

    "performance.cache_duration": "3600000",
    "performance.max_file_size": "5242880",
    "performance.allowed_file_types":
      "image/jpeg,image/png,image/gif,application/pdf",

    // Chat Configuration
    "chat.timeout": "30000",
    "chat.max_message_length": "1000",
    "chat.max_conversation_history": "50",
  };

  return defaultConfigs[key] || null;
}

export function getDefaultConfigCategory(category: string): ConfigCategory {
  const defaultCategories: Record<string, ConfigCategory> = {
    api: {
      category: "api",
      configs: [
        {
          id: "api-base-url",
          key: "api.base_url",
          value: import.meta.env.VITE_API_BASE_URL as string,
          type: "string",
          category: "api",
          description: "Base URL for API endpoints",
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "api-timeout",
          key: "api.timeout",
          value: "10000",
          type: "number",
          category: "api",
          description: "API request timeout in milliseconds",
          lastUpdated: new Date().toISOString(),
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    contact: {
      category: "contact",
      configs: [
        {
          id: "contact-support-email",
          key: "contact.support_email",
          value: import.meta.env.VITE_CONTACT_EMAIL as string,
          type: "string",
          category: "contact",
          description: "Support email address",
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "contact-support-phone",
          key: "contact.support_phone",
          value: import.meta.env.VITE_CONTACT_PHONE as string,
          type: "string",
          category: "contact",
          description: "Support phone number",
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
