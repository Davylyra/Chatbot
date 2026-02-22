/**
 * Performance Monitoring Hook
 * Description: Monitors and optimizes app performance
 * Integration: Provides performance metrics and optimization suggestions
 */

import { useEffect, useState, useCallback } from 'react';

interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  memoryUsage: number;
  isLowEndDevice: boolean;
  connectionSpeed: string;
}

interface UsePerformanceReturn {
  metrics: PerformanceMetrics;
  isLowEndDevice: boolean;
  shouldReduceAnimations: boolean;
  shouldLazyLoad: boolean;
  optimizeForPerformance: () => void;
}

export const usePerformance = (): UsePerformanceReturn => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    isLowEndDevice: false,
    connectionSpeed: 'unknown'
  });

  const [isLowEndDevice, setIsLowEndDevice] = useState(false);
  const [shouldReduceAnimations, setShouldReduceAnimations] = useState(false);
  const [shouldLazyLoad, setShouldLazyLoad] = useState(false);

  // Detect device capabilities
  const detectDeviceCapabilities = useCallback(() => {
    const startTime = performance.now();
    
    // Check hardware concurrency (CPU cores)
    const cores = navigator.hardwareConcurrency || 2;
    
    // Check memory (if available)
    const memory = (navigator as any).deviceMemory || 4;
    
    // Check connection speed
    const connection = (navigator as any).connection;
    const connectionSpeed = connection ? connection.effectiveType : 'unknown';
    
    // Check if device is low-end
    const isLowEnd = cores <= 2 || memory <= 2 || connectionSpeed === 'slow-2g' || connectionSpeed === '2g';
    
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    setMetrics({
      loadTime: performance.timing ? performance.timing.loadEventEnd - performance.timing.navigationStart : 0,
      renderTime,
      memoryUsage: memory,
      isLowEndDevice: isLowEnd,
      connectionSpeed
    });
    
    setIsLowEndDevice(isLowEnd);
    setShouldReduceAnimations(prefersReducedMotion || isLowEnd);
    setShouldLazyLoad(isLowEnd || connectionSpeed === 'slow-2g' || connectionSpeed === '2g');
  }, []);

  // Optimize for performance
  const optimizeForPerformance = useCallback(() => {
    if (isLowEndDevice) {
      // Reduce animation complexity
      document.documentElement.style.setProperty('--animation-duration', '0.1s');
      
      // Enable lazy loading
      const images = document.querySelectorAll('img[data-src]');
      images.forEach(img => {
        (img as HTMLImageElement).src = (img as HTMLImageElement).dataset.src || '';
      });
      
      // Reduce motion for low-end devices
      if (shouldReduceAnimations) {
        document.documentElement.classList.add('reduce-motion');
      }
    }
  }, [isLowEndDevice, shouldReduceAnimations]);

  // Monitor performance
  useEffect(() => {
    detectDeviceCapabilities();
    
    // Monitor memory usage
    const monitorMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMetrics(prev => ({
          ...prev,
          memoryUsage: memory.usedJSHeapSize / 1024 / 1024 // Convert to MB
        }));
      }
    };
    
    // Monitor performance periodically
    const interval = setInterval(monitorMemory, 5000);
    
    // Listen for visibility changes to pause/resume monitoring
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        detectDeviceCapabilities();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [detectDeviceCapabilities]);

  // Apply optimizations when device is detected as low-end
  useEffect(() => {
    if (isLowEndDevice) {
      optimizeForPerformance();
    }
  }, [isLowEndDevice, optimizeForPerformance]);

  return {
    metrics,
    isLowEndDevice,
    shouldReduceAnimations,
    shouldLazyLoad,
    optimizeForPerformance
  };
};

export default usePerformance;
