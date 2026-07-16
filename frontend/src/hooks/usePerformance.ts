import { useEffect, useState, useCallback } from "react";

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
    connectionSpeed: "unknown",
  });

  const [isLowEndDevice, setIsLowEndDevice] = useState(false);
  const [shouldReduceAnimations, setShouldReduceAnimations] = useState(false);
  const [shouldLazyLoad, setShouldLazyLoad] = useState(false);

  const detectDeviceCapabilities = useCallback(() => {
    const startTime = performance.now();

    const cores = navigator.hardwareConcurrency || 2;

    const memory = (navigator as any).deviceMemory || 4;

    const connection = (navigator as any).connection;
    const connectionSpeed = connection ? connection.effectiveType : "unknown";

    const isLowEnd =
      cores <= 2 ||
      memory <= 2 ||
      connectionSpeed === "slow-2g" ||
      connectionSpeed === "2g";

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    setMetrics({
      loadTime: performance.timing
        ? performance.timing.loadEventEnd - performance.timing.navigationStart
        : 0,
      renderTime,
      memoryUsage: memory,
      isLowEndDevice: isLowEnd,
      connectionSpeed,
    });

    setIsLowEndDevice(isLowEnd);
    setShouldReduceAnimations(prefersReducedMotion || isLowEnd);
    setShouldLazyLoad(
      isLowEnd || connectionSpeed === "slow-2g" || connectionSpeed === "2g",
    );
  }, []);

  const optimizeForPerformance = useCallback(() => {
    if (isLowEndDevice) {
      document.documentElement.style.setProperty(
        "--animation-duration",
        "0.1s",
      );

      const images = document.querySelectorAll("img[data-src]");
      images.forEach((img) => {
        (img as HTMLImageElement).src =
          (img as HTMLImageElement).dataset.src || "";
      });

      if (shouldReduceAnimations) {
        document.documentElement.classList.add("reduce-motion");
      }
    }
  }, [isLowEndDevice, shouldReduceAnimations]);

  useEffect(() => {
    detectDeviceCapabilities();

    const monitorMemory = () => {
      if ("memory" in performance) {
        const heapInfo = (performance as any).memory;
        setMetrics((prev) => ({
          ...prev,
          memoryUsage: heapInfo.usedJSHeapSize / 1024 / 1024,
        }));
      }
    };

    const interval = setInterval(monitorMemory, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        detectDeviceCapabilities();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [detectDeviceCapabilities]);

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
    optimizeForPerformance,
  };
};

export default usePerformance;
