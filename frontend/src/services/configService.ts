/**
 * Configuration Service
 * Description: Centralized service for managing all app configuration, credentials, and dynamic settings
 * Integration: Replaces all hardcoded configuration with AI-managed dynamic settings
 */

import { SmartApiService } from './api';

export interface AppConfig {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  category: 'api' | 'contact' | 'social' | 'feature' | 'ui' | 'security';
  description?: string;
  isSensitive?: boolean;
  lastUpdated: string;
}

export interface ConfigCategory {
  category: string;
  configs: AppConfig[];
  lastUpdated: string;
}

class ConfigService {
  private configCache: Map<string, AppConfig> = new Map();
  private categoryCache: Map<string, ConfigCategory> = new Map();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Get configuration value by key
   */
  async getConfig(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.configCache.get(key);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached.value;
    }

    try {
      // Fetch from AI service
      const response = await SmartApiService.getConfig(key);
      
      if (response.success && response.data) {
        const config: AppConfig = {
          id: response.data.id || key,
          key,
          value: response.data.value,
          type: response.data.type || 'string',
          category: response.data.category || 'ui',
          description: response.data.description,
          isSensitive: response.data.isSensitive || false,
          lastUpdated: new Date().toISOString()
        };
        
        // Cache the config
        this.configCache.set(key, config);
        return config.value;
      }
      
      // Fallback to default config
      return this.getDefaultConfig(key);
    } catch (error) {
      console.error('Failed to fetch config:', error);
      return this.getDefaultConfig(key);
    }
  }

  /**
   * Get all configurations for a category
   */
  async getConfigCategory(category: string): Promise<ConfigCategory> {
    // Check cache first
    const cached = this.categoryCache.get(category);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    try {
      // Fetch from AI service
      const response = await SmartApiService.getConfigCategory(category);
      
      if (response.success && response.data) {
        const configCategory: ConfigCategory = {
          category,
          configs: response.data.configs || [],
          lastUpdated: new Date().toISOString()
        };
        
        // Cache individual configs
        configCategory.configs.forEach(config => {
          this.configCache.set(config.key, config);
        });
        
        // Cache the category
        this.categoryCache.set(category, configCategory);
        return configCategory;
      }
      
      // Fallback to default category
      return this.getDefaultConfigCategory(category);
    } catch (error) {
      console.error('Failed to fetch config category:', error);
      return this.getDefaultConfigCategory(category);
    }
  }

  /**
   * Update configuration (for admin use)
   */
  async updateConfig(key: string, value: string, type: string = 'string'): Promise<boolean> {
    try {
      const response = await SmartApiService.updateConfig(key, { value, type });
      
      if (response.success) {
        // Update cache
        const existing = this.configCache.get(key);
        const config: AppConfig = {
          id: existing?.id || key,
          key,
          value,
          type: type as any,
          category: existing?.category || 'ui',
          description: existing?.description,
          isSensitive: existing?.isSensitive || false,
          lastUpdated: new Date().toISOString()
        };
        this.configCache.set(key, config);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to update config:', error);
      return false;
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.categoryCache.clear();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(lastUpdated: string): boolean {
    const now = new Date().getTime();
    const updated = new Date(lastUpdated).getTime();
    return (now - updated) < this.CACHE_DURATION;
  }

  /**
   * Get default configuration as fallback
   */
  private getDefaultConfig(key: string): string | null {
    const defaultConfigs: Record<string, string> = {
      // API Configuration
      'api.base_url': 'http://localhost:3000/api/v1',
      'api.timeout': '10000',
      'api.chat_url': 'https://api.chat.glinax.com',
      'api.universities_url': 'https://api.universities.gh',
      'api.forms_url': 'https://api.forms.gh',
      'api.payment_gateway_url': 'https://api.paymentgateway.com',
      'api.email_service_url': 'https://api.emailservice.com',
      
      // Contact Information
      'contact.support_email': 'support@glinax.com',
      'contact.support_phone': '+233 24 123 4567',
      'contact.website': 'https://glinax.com',
      
      // Social Media
      'social.twitter': '@glinax_gh',
      'social.facebook': 'Glinax Ghana',
      'social.instagram': '@glinax_gh',
      
      // App Information
      'app.name': 'Glinax Chatbot',
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
      
      // Performance
      'performance.cache_duration': '3600000',
      'performance.max_file_size': '5242880',
      'performance.allowed_file_types': 'image/jpeg,image/png,image/gif,application/pdf',
      
      // Chat Configuration
      'chat.timeout': '30000',
      'chat.max_message_length': '1000',
      'chat.max_conversation_history': '50'
    };

    return defaultConfigs[key] || null;
  }

  /**
   * Get default configuration category as fallback
   */
  private getDefaultConfigCategory(category: string): ConfigCategory {
    const defaultCategories: Record<string, ConfigCategory> = {
      'api': {
        category: 'api',
        configs: [
          {
            id: 'api-base-url',
            key: 'api.base_url',
            value: 'http://localhost:3000/api/v1',
            type: 'string',
            category: 'api',
            description: 'Base URL for API endpoints',
            lastUpdated: new Date().toISOString()
          },
          {
            id: 'api-timeout',
            key: 'api.timeout',
            value: '10000',
            type: 'number',
            category: 'api',
            description: 'API request timeout in milliseconds',
            lastUpdated: new Date().toISOString()
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'contact': {
        category: 'contact',
        configs: [
          {
            id: 'contact-support-email',
            key: 'contact.support_email',
            value: 'support@glinax.com',
            type: 'string',
            category: 'contact',
            description: 'Support email address',
            lastUpdated: new Date().toISOString()
          },
          {
            id: 'contact-support-phone',
            key: 'contact.support_phone',
            value: '+233 24 123 4567',
            type: 'string',
            category: 'contact',
            description: 'Support phone number',
            lastUpdated: new Date().toISOString()
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'social': {
        category: 'social',
        configs: [
          {
            id: 'social-twitter',
            key: 'social.twitter',
            value: '@glinax_gh',
            type: 'string',
            category: 'social',
            description: 'Twitter handle',
            lastUpdated: new Date().toISOString()
          },
          {
            id: 'social-facebook',
            key: 'social.facebook',
            value: 'Glinax Ghana',
            type: 'string',
            category: 'social',
            description: 'Facebook page name',
            lastUpdated: new Date().toISOString()
          }
        ],
        lastUpdated: new Date().toISOString()
      }
    };

    return defaultCategories[category] || {
      category,
      configs: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

export const configService = new ConfigService();
