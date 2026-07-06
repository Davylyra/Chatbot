import { useEffect } from 'react';

export const useAutoCloseError = (
  error: string | null,
  onClear: () => void,
  delayMs: number = 5000
): void => {
  useEffect(() => {
    if (!error) return;

    const timeoutId = setTimeout(() => {
      onClear();
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [error, onClear, delayMs]);
};
