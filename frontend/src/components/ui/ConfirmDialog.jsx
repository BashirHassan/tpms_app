/**
 * Reusable Confirmation Dialog Component
 * Supports simple confirm, danger confirm with text input, and custom content
 */

import { useState, useEffect } from 'react';
import { Button } from './Button';
import { IconX, IconAlertTriangle, IconTrash, IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';

const VARIANTS = {
  danger: {
    icon: IconTrash,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonVariant: 'destructive',
  },
  warning: {
    icon: IconAlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    buttonVariant: 'warning',
  },
  info: {
    icon: IconAlertCircle,
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
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  requireText = null, // If set, user must type this text to confirm
  loading = false,
}) {
  const [inputValue, setInputValue] = useState('');
  const variantConfig = VARIANTS[variant] || VARIANTS.warning;
  const IconComponent = variantConfig.icon;

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = requireText ? inputValue === requireText : true;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canConfirm && !loading) {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full ${variantConfig.iconBg} flex items-center justify-center flex-shrink-0`}>
            <IconComponent className={`w-6 h-6 ${variantConfig.iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{message}</p>
          </div>
          <Button 
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <IconX className="w-5 h-5" />
          </Button>
        </div>

        {/* Require Text Input */}
        {requireText && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">
              Type <span className="font-mono font-bold text-red-600">{requireText}</span> to confirm:
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={requireText}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variantConfig.buttonVariant}
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Hook for easier usage
export function useConfirmDialog() {
  const [state, setState] = useState({
    isOpen: false,
    config: {},
    resolve: null,
  });

  const confirm = (config) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        config,
        resolve,
      });
    });
  };

  const handleConfirm = () => {
    state.resolve?.(true);
    setState({ isOpen: false, config: {}, resolve: null });
  };

  const handleClose = () => {
    state.resolve?.(false);
    setState({ isOpen: false, config: {}, resolve: null });
  };

  const DialogComponent = (
    <ConfirmDialog
      isOpen={state.isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      {...state.config}
    />
  );

  return { confirm, DialogComponent };
}

export default ConfirmDialog;
