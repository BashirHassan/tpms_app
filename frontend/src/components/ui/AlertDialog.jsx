/**
 * Alert Dialog System
 * 
 * A replacement for native alert() and confirm() dialogs.
 * Provides a context-based alert system that can be used throughout the app.
 * 
 * Usage:
 * 1. Wrap your app with <AlertProvider>
 * 2. Use the useAlert() hook to show alerts
 * 
 * Example:
 * const { alert, confirm } = useAlert();
 * 
 * // Simple alert
 * await alert('Something happened');
 * 
 * // Confirm dialog
 * const confirmed = await confirm('Are you sure?');
 * if (confirmed) { ... }
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { 
  IconAlertCircle, 
  IconAlertTriangle, 
  IconCircleCheck, 
  IconInfoCircle,
  IconX 
} from '@tabler/icons-react';

// Alert variants configuration
const ALERT_VARIANTS = {
  info: {
    icon: IconInfoCircle,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    buttonVariant: 'primary',
  },
  success: {
    icon: IconCircleCheck,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    buttonVariant: 'success',
  },
  warning: {
    icon: IconAlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    buttonVariant: 'warning',
  },
  error: {
    icon: IconAlertCircle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonVariant: 'destructive',
  },
  danger: {
    icon: IconAlertTriangle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonVariant: 'destructive',
  },
};

// Context
const AlertContext = createContext(null);

/**
 * Alert Provider Component
 * Wrap your app with this to enable the alert system
 */
export function AlertProvider({ children }) {
  const [alertState, setAlertState] = useState({
    isOpen: false,
    type: 'alert', // 'alert' or 'confirm'
    title: '',
    message: '',
    variant: 'info',
    confirmText: 'OK',
    cancelText: 'Cancel',
    resolve: null,
  });

  // Show an alert (like native alert())
  const alert = useCallback((messageOrConfig, title) => {
    return new Promise((resolve) => {
      const config = typeof messageOrConfig === 'string' 
        ? { message: messageOrConfig, title }
        : messageOrConfig;
      
      setAlertState({
        isOpen: true,
        type: 'alert',
        title: config.title || '',
        message: config.message || '',
        variant: config.variant || 'info',
        confirmText: config.confirmText || 'OK',
        cancelText: 'Cancel',
        resolve,
      });
    });
  }, []);

  // Show a confirmation dialog (like native confirm())
  const confirm = useCallback((messageOrConfig, title) => {
    return new Promise((resolve) => {
      const config = typeof messageOrConfig === 'string' 
        ? { message: messageOrConfig, title }
        : messageOrConfig;
      
      setAlertState({
        isOpen: true,
        type: 'confirm',
        title: config.title || 'Confirm',
        message: config.message || '',
        variant: config.variant || 'warning',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        resolve,
      });
    });
  }, []);

  // Handle confirm action
  const handleConfirm = useCallback(() => {
    alertState.resolve?.(true);
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, [alertState.resolve]);

  // Handle cancel/close action
  const handleClose = useCallback(() => {
    alertState.resolve?.(alertState.type === 'alert' ? undefined : false);
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, [alertState.resolve, alertState.type]);

  const variantConfig = ALERT_VARIANTS[alertState.variant] || ALERT_VARIANTS.info;
  const IconComponent = variantConfig.icon;

  return (
    <AlertContext.Provider value={{ alert, confirm }}>
      {children}
      
      <Dialog
        isOpen={alertState.isOpen}
        onClose={handleClose}
        width="sm"
        closeOnOutsideClick={alertState.type === 'alert'}
        closeOnEscape={true}
        showCloseButton={false}
      >
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${variantConfig.iconBg} flex items-center justify-center mb-4`}>
            <IconComponent className={`w-6 h-6 ${variantConfig.iconColor}`} />
          </div>
          
          {/* Title */}
          {alertState.title && (
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {alertState.title}
            </h3>
          )}
          
          {/* Message */}
          <p className="text-gray-600">
            {alertState.message}
          </p>
          
          {/* Actions */}
          <div className="flex items-center justify-center gap-3 mt-6 w-full">
            {alertState.type === 'confirm' && (
              <Button 
                variant="outline" 
                onClick={handleClose}
                className="min-w-[100px]"
              >
                {alertState.cancelText}
              </Button>
            )}
            <Button
              variant={variantConfig.buttonVariant}
              onClick={handleConfirm}
              className="min-w-[100px]"
            >
              {alertState.confirmText}
            </Button>
          </div>
        </div>
      </Dialog>
    </AlertContext.Provider>
  );
}

/**
 * useAlert Hook
 * Returns alert and confirm functions
 */
export function useAlert() {
  const context = useContext(AlertContext);
  
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  
  return context;
}

/**
 * Standalone Alert Component
 * For cases where you need a simple inline alert dialog
 */
export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  variant = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  showCancel = false,
}) {
  const variantConfig = ALERT_VARIANTS[variant] || ALERT_VARIANTS.info;
  const IconComponent = variantConfig.icon;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="sm"
      closeOnOutsideClick={!showCancel}
      showCloseButton={false}
    >
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-full ${variantConfig.iconBg} flex items-center justify-center mb-4`}>
          <IconComponent className={`w-6 h-6 ${variantConfig.iconColor}`} />
        </div>
        
        {/* Title */}
        {title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {title}
          </h3>
        )}
        
        {/* Message */}
        <p className="text-gray-600">
          {message}
        </p>
        
        {/* Actions */}
        <div className="flex items-center justify-center gap-3 mt-6 w-full">
          {showCancel && (
            <Button 
              variant="outline" 
              onClick={onClose}
              className="min-w-[100px]"
            >
              {cancelText}
            </Button>
          )}
          <Button
            variant={variantConfig.buttonVariant}
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
            className="min-w-[100px]"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default AlertProvider;
