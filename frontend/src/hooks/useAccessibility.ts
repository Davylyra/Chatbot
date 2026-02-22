/**
 * Hook: useAccessibility
 * Description: Accessibility utilities and keyboard navigation
 * Features: Focus management, keyboard shortcuts, screen reader support
 */

import { useEffect, useCallback } from 'react';

interface UseAccessibilityOptions {
  enableKeyboardNavigation?: boolean;
  enableFocusManagement?: boolean;
  enableScreenReader?: boolean;
}

export const useAccessibility = (options: UseAccessibilityOptions = {}) => {
  const {
    enableKeyboardNavigation = true,
    enableScreenReader = true
  } = options;

  // Focus management
  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, []);

  // Keyboard shortcuts
  const setupKeyboardShortcuts = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key to close modals/dropdowns
      if (e.key === 'Escape') {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement?.closest('[role="dialog"]') || activeElement?.closest('[role="menu"]')) {
          const closeButton = document.querySelector('[aria-label="Close"], [data-close]') as HTMLElement;
          closeButton?.click();
        }
      }

      // Alt + M for menu
      if (e.altKey && e.key === 'm') {
        e.preventDefault();
        const menuButton = document.querySelector('[aria-label="Menu"], [data-menu]') as HTMLElement;
        menuButton?.click();
      }

      // Alt + H for home
      if (e.altKey && e.key === 'h') {
        e.preventDefault();
        window.location.href = '/';
      }

      // Alt + C for chat
      if (e.altKey && e.key === 'c') {
        e.preventDefault();
        window.location.href = '/chat';
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Screen reader announcements
  const announceToScreenReader = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, []);

  // Skip to content link
  const createSkipLink = useCallback(() => {
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg z-50';
    skipLink.setAttribute('tabindex', '1');
    
    document.body.insertBefore(skipLink, document.body.firstChild);
  }, []);

  // Setup accessibility features
  useEffect(() => {
    if (enableKeyboardNavigation) {
      const cleanup = setupKeyboardShortcuts();
      return cleanup;
    }
  }, [enableKeyboardNavigation, setupKeyboardShortcuts]);

  useEffect(() => {
    if (enableScreenReader) {
      createSkipLink();
    }
  }, [enableScreenReader, createSkipLink]);

  return {
    trapFocus,
    announceToScreenReader,
    createSkipLink
  };
};
