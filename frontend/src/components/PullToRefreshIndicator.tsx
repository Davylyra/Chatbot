/**
 * Pull to Refresh Indicator Component
 * Description: Visual indicator for pull-to-refresh functionality
 * Integration: Used with usePullToRefresh hook
 */

import React from 'react';
import { motion } from 'framer-motion';
import { FiRefreshCw } from 'react-icons/fi';

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
  threshold: number;
  theme?: 'light' | 'dark';
}

const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  isRefreshing,
  pullDistance,
  canRefresh,
  threshold,
  theme = 'light'
}) => {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;

  if (pullDistance === 0 && !isRefreshing) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ 
        opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
        y: pullDistance > 0 || isRefreshing ? 0 : -50
      }}
      className={`fixed top-0 left-1/2 transform -translate-x-1/2 z-50 ${
        theme === 'dark' 
          ? 'bg-gray-800/90 backdrop-blur-md border-b border-gray-700' 
          : 'bg-white/90 backdrop-blur-md border-b border-gray-200'
      }`}
      style={{
        width: '100%',
        maxWidth: '400px',
        paddingTop: 'env(safe-area-inset-top)'
      }}
    >
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center space-x-3">
          <motion.div
            animate={{ 
              rotate: isRefreshing ? 360 : rotation,
              scale: canRefresh ? 1.1 : 1
            }}
            transition={{ 
              duration: isRefreshing ? 1 : 0.2,
              repeat: isRefreshing ? Infinity : 0,
              ease: "linear"
            }}
            className={`p-2 rounded-full ${
              canRefresh 
                ? 'bg-primary-100 dark:bg-primary-900/30' 
                : 'bg-gray-100 dark:bg-gray-700'
            }`}
          >
            <FiRefreshCw className={`w-5 h-5 ${
              canRefresh 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`} />
          </motion.div>
          
          <div className="text-center">
            <p className={`text-sm font-medium ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
            }`}>
              {isRefreshing 
                ? 'Refreshing...' 
                : canRefresh 
                  ? 'Release to refresh' 
                  : 'Pull to refresh'
              }
            </p>
            {!isRefreshing && (
              <div className={`w-20 h-1 rounded-full mt-1 ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
                <motion.div
                  className={`h-full rounded-full ${
                    canRefresh 
                      ? 'bg-primary-600' 
                      : 'bg-gray-400'
                  }`}
                  style={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PullToRefreshIndicator;
