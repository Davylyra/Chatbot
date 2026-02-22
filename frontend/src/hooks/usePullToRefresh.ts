/**
 * Pull to Refresh Hook
 * Description: Provides pull-to-refresh functionality for mobile devices
 * Integration: Used on pages that need data refresh capability
 */

import { useEffect, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  resistance?: number;
  enabled?: boolean;
}

interface UsePullToRefreshReturn {
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
  refresh: () => Promise<void>;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  resistance = 0.5,
  enabled = true
}: UsePullToRefreshOptions): UsePullToRefreshReturn => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [canRefresh, setCanRefresh] = useState(false);
  
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);
  const elementRef = useRef<HTMLElement | null>(null);

  const refresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const element = elementRef.current || document.documentElement;
      if (element.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = Math.max(0, currentY.current - startY.current);
      const resistanceDistance = distance * resistance;
      
      setPullDistance(resistanceDistance);
      setCanRefresh(resistanceDistance >= threshold);

      // Prevent default scrolling when pulling
      if (distance > 0) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      
      isPulling.current = false;
      
      if (canRefresh && !isRefreshing) {
        refresh();
      }
      
      setPullDistance(0);
      setCanRefresh(false);
    };

    // Add event listeners to document
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isRefreshing, canRefresh, threshold, resistance, refresh]);

  return {
    isRefreshing,
    pullDistance,
    canRefresh,
    refresh
  };
};
