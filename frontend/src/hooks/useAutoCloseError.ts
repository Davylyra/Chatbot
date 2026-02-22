import { useEffect } from 'react';

/**
 * Custom hook to automatically clear an error message after a specified delay.
 * Useful for showing temporary error messages that auto-dismiss.
 * 
 * @param error - The error message to monitor
 * @param onClear - Callback function to clear/hide the error
 * @param delayMs - Delay in milliseconds before clearing (default: 5000ms = 5 seconds)
 */
export const useAutoCloseError = (
  error: string | null,
  onClear: () => void,
  delayMs: number = 5000
): void => {
  useEffect(() => {
    // Only set timer if there's an error
    if (!error) return;

    // Set timeout to clear error after specified delay
    const timeoutId = setTimeout(() => {
      onClear();
    }, delayMs);

    // Cleanup: clear timeout if error changes or component unmounts
    return () => clearTimeout(timeoutId);
  }, [error, onClear, delayMs]);
};
