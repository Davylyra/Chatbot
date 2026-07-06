import { SmartApiService } from './api';
import {
  getDefaultConfig as fetchDefaultConfig,
  getDefaultConfigCategory as fetchDefaultConfigCategory,
} from '../mocks/defaultConfig';

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
  private readonly CACHE_DURATION = 10 * 60 * 1000;

  async getConfig(key: string): Promise<string | null> {
    const cached = this.configCache.get(key);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached.value;
    }

    try {
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
          lastUpdated: new Date().toISOString(),
        };

        this.configCache.set(key, config);
        return config.value;
      }

      return this.getDefaultConfig(key);
    } catch (fetchError) {
      console.error('Failed to fetch config:', fetchError);
      return this.getDefaultConfig(key);
    }
  }

  async getConfigCategory(category: string): Promise<ConfigCategory> {
    const cached = this.categoryCache.get(category);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    try {
      const response = await SmartApiService.getConfigCategory(category);

      if (response.success && response.data) {
        const configCategory: ConfigCategory = {
          category,
          configs: response.data.configs || [],
          lastUpdated: new Date().toISOString(),
        };

        configCategory.configs.forEach((config) => {
          this.configCache.set(config.key, config);
        });

        this.categoryCache.set(category, configCategory);
        return configCategory;
      }

      return this.getDefaultConfigCategory(category);
    } catch (fetchError) {
      console.error('Failed to fetch config category:', fetchError);
      return this.getDefaultConfigCategory(category);
    }
  }

  async updateConfig(key: string, value: string, type: string = 'string'): Promise<boolean> {
    try {
      const response = await SmartApiService.updateConfig(key, { value, type });

      if (response.success) {
        const existing = this.configCache.get(key);
        const config: AppConfig = {
          id: existing?.id || key,
          key,
          value,
          type: type as any,
          category: existing?.category || 'ui',
          description: existing?.description,
          isSensitive: existing?.isSensitive || false,
          lastUpdated: new Date().toISOString(),
        };
        this.configCache.set(key, config);
        return true;
      }

      return false;
    } catch (updateError) {
      console.error('Failed to update config:', updateError);
      return false;
    }
  }

  clearCache(): void {
    this.configCache.clear();
    this.categoryCache.clear();
  }

  private isCacheValid(lastUpdated: string): boolean {
    const now = new Date().getTime();
    const updated = new Date(lastUpdated).getTime();
    return now - updated < this.CACHE_DURATION;
  }

  private getDefaultConfig(key: string): string | null {
    return fetchDefaultConfig(key);
  }

  private getDefaultConfigCategory(category: string): ConfigCategory {
    return fetchDefaultConfigCategory(category);
  }
}

export const configService = new ConfigService();
