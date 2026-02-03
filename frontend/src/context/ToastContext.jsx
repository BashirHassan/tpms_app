/**
 * Toast Context
 * Provides toast notifications throughout the app
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IconX, IconCircleCheck, IconAlertCircle, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '../components/ui';

const ToastContext = createContext(null);

const toastTypes = {
  success: {
    icon: IconCircleCheck,
    className: 'bg-green-50 border-green-200 text-green-800',
    iconClassName: 'text-green-500',
  },
  error: {
    icon: IconAlertCircle,
    className: 'bg-red-50 border-red-200 text-red-800',
    iconClassName: 'text-red-500',
  },
  warning: {
    icon: IconAlertTriangle,
    className: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    iconClassName: 'text-yellow-500',
  },
  info: {
    icon: IconInfoCircle,
    className: 'bg-blue-50 border-blue-200 text-blue-800',
    iconClassName: 'text-blue-500',
  },
};

// Counter to ensure unique IDs even when multiple toasts created in same millisecond
let toastCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = `${Date.now()}-${++toastCounter}`;

    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  };

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      {children}

      {/* Toast Container - z-[200] ensures it's above dialogs (z-[100]) */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const config = toastTypes[t.type];
            const Icon = config.icon;

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] max-w-[400px] ${config.className}`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${config.iconClassName}`} />
                <p className="flex-1 text-sm">{t.message}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeToast(t.id)}
                  className="flex-shrink-0 h-6 w-6 hover:opacity-70"
                >
                  <IconX className="w-4 h-4" />
                </Button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastContext;
