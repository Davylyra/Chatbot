/**
 * Toast Container Component
 * Description: Manages and displays toast notifications
 * Integration: Provides centralized toast notification system
 */

import React, { memo } from 'react';
import { AnimatePresence } from 'framer-motion';
import Toast, { type ToastProps } from './Toast';

interface ToastContainerProps {
  toasts: ToastProps[];
  onRemoveToast: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = memo(({ toasts, onRemoveToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            {...toast}
            onClose={onRemoveToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

ToastContainer.displayName = 'ToastContainer';

export default ToastContainer;
