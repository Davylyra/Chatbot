/**
 * Configuration Context
 * Description: Manages dynamic app configuration from API
 * Integration: Provides centralized config management across the app
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SmartApiService } from '../services/api';
import type { AppConfig } from '../services/api';

interface ConfigContextType {
  config: AppConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await SmartApiService.getAppConfig();
      
      if (response.success && response.data) {
        setConfig(response.data);
      } else {
        throw new Error(response.error || 'Failed to load configuration');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load configuration';
      setError(errorMessage);
      // Config loading error - handled gracefully
    } finally {
      setIsLoading(false);
    }
  };

  const refreshConfig = async () => {
    await loadConfig();
  };

  const updateConfig = async (updates: Partial<AppConfig>) => {
    if (!config) return;

    try {
      setError(null);
      const updatedConfig = { ...config, ...updates };
      setConfig(updatedConfig);
      
      // In a real app, you would also update the backend
      // await SmartApiService.updateAppConfig(updates);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update configuration';
      setError(errorMessage);
      // Config update error - handled gracefully
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const value: ConfigContextType = {
    config,
    isLoading,
    error,
    refreshConfig,
    updateConfig,
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export default ConfigContext;
