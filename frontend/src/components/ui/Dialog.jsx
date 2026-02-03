/**
 * Reusable Dialog Component
 * 
 * A flexible, accessible modal dialog component with:
 * - Customizable width via props
 * - Scrollable content when long
 * - Static or custom header (via slot)
 * - Allow/disable outside click to close
 * - Keyboard navigation (Escape to close)
 * - Animation support
 * - Prevent body scroll when open
 */

import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';
import { cn } from '../../utils/helpers';
import { Button } from './Button';

// Width presets
const WIDTH_PRESETS = {
  xs: 'max-w-xs',      // 320px
  sm: 'max-w-sm',      // 384px
  md: 'max-w-md',      // 448px
  lg: 'max-w-lg',      // 512px
  xl: 'max-w-xl',      // 576px
  '2xl': 'max-w-2xl',  // 672px
  '3xl': 'max-w-3xl',  // 768px
  '4xl': 'max-w-4xl',  // 896px
  '5xl': 'max-w-5xl',  // 1024px
  full: 'max-w-full',
};

/**
 * Dialog Component
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is open
 * @param {function} props.onClose - Function to call when dialog should close
 * @param {string} [props.title] - Dialog title (optional if using custom header)
 * @param {string} [props.description] - Dialog description (optional)
 * @param {React.ReactNode} [props.header] - Custom header slot (replaces default header)
 * @param {React.ReactNode} props.children - Dialog body content
 * @param {React.ReactNode} [props.footer] - Footer content (usually action buttons) with default styling
 * @param {React.ReactNode} [props.customFooter] - Custom footer slot (replaces default footer styling)
 * @param {boolean} [props.showFooterBorder=true] - Whether to show border above footer
 * @param {string} [props.width='md'] - Width preset (xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, full) or custom class
 * @param {boolean} [props.closeOnOutsideClick=true] - Whether clicking outside closes dialog
 * @param {boolean} [props.closeOnEscape=true] - Whether pressing Escape closes dialog
 * @param {boolean} [props.showCloseButton=true] - Whether to show the close button
 * @param {string} [props.className] - Additional classes for the dialog container
 * @param {string} [props.contentClassName] - Additional classes for the content area
 * @param {string} [props.overlayClassName] - Additional classes for the overlay
 * @param {boolean} [props.preventBodyScroll=true] - Whether to prevent body scroll when open
 * @param {string} [props.maxHeight] - Max height for dialog content (default: 95vh)
 */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  header,
  children,
  footer,
  customFooter,
  showFooterBorder = true,
  width = 'md',
  closeOnOutsideClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className,
  contentClassName,
  overlayClassName,
  preventBodyScroll = true,
  maxHeight = '95vh',
}) {
  const dialogRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Handle escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      onClose?.();
    }
  }, [closeOnEscape, onClose]);

  // Handle outside click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && closeOnOutsideClick) {
      onClose?.();
    }
  }, [closeOnOutsideClick, onClose]);

  // Manage body scroll and focus
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      
      if (preventBodyScroll) {
        const originalOverflow = document.body.style.overflow;
        const originalPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        
        return () => {
          document.body.style.overflow = originalOverflow;
          document.body.style.paddingRight = originalPaddingRight;
        };
      }
    }
  }, [isOpen, preventBodyScroll]);

  // Focus management
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
    
    return () => {
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  // Add keyboard event listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Determine width class
  const widthClass = WIDTH_PRESETS[width] || width;

  const dialogContent = (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-4',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-200',
        overlayClassName
      )}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        aria-describedby={description ? 'dialog-description' : undefined}
        tabIndex={-1}
        className={cn(
          'bg-white rounded-xl shadow-2xl w-full flex flex-col',
          'animate-in fade-in zoom-in-95 duration-200',
          widthClass,
          className
        )}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {header ? (
          header
        ) : (title || showCloseButton) ? (
          <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 pr-4">
              {title && (
                <h2 
                  id="dialog-title" 
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p 
                  id="dialog-description" 
                  className="mt-1 text-sm text-gray-500"
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="-m-1 text-gray-400 hover:text-gray-600"
                aria-label="Close dialog"
              >
                <IconX className="w-5 h-5" />
              </Button>
            )}
          </div>
        ) : null}

        {/* Content */}
        <div 
          className={cn(
            'flex-1 overflow-y-auto p-4 sm:p-6',
            contentClassName
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {customFooter ? (
          customFooter
        ) : footer ? (
          <div className={cn(
            'flex items-center justify-end gap-3 px-4 py-2 sm:px-6 sm:py-4 flex-shrink-0',
            showFooterBorder && 'border-t border-gray-100'
          )}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  // Render using portal to ensure proper stacking
  return createPortal(dialogContent, document.body);
}

/**
 * Dialog Header Component
 * For custom headers using the header slot
 */
export function DialogHeader({ children, className }) {
  return (
    <div className={cn('p-4 sm:p-6 border-b border-gray-100 flex-shrink-0', className)}>
      {children}
    </div>
  );
}

/**
 * Dialog Title Component
 */
export function DialogTitle({ children, className }) {
  return (
    <h2 className={cn('text-lg font-semibold text-gray-900', className)}>
      {children}
    </h2>
  );
}

/**
 * Dialog Description Component
 */
export function DialogDescription({ children, className }) {
  return (
    <p className={cn('mt-1 text-sm text-gray-500', className)}>
      {children}
    </p>
  );
}

/**
 * Dialog Body Component
 * For structured content
 */
export function DialogBody({ children, className }) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  );
}

/**
 * Dialog Footer Component
 * For custom footers - typically used for action buttons
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Footer content
 * @param {string} [props.className] - Additional classes
 * @param {'start'|'center'|'end'|'between'|'around'} [props.align='end'] - Content alignment
 * @param {boolean} [props.showBorder=true] - Whether to show top border
 */
export function DialogFooter({ children, className, align = 'end', showBorder = true }) {
  const alignmentClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
  };

  return (
    <div className={cn(
      'flex items-center gap-3 p-4 sm:p-6 flex-shrink-0',
      alignmentClasses[align] || 'justify-end',
      showBorder && 'border-t border-gray-100',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * useDialog Hook
 * Helper hook for managing dialog state
 */
export function useDialog(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState(null);

  const open = useCallback((dialogData = null) => {
    setData(dialogData);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
    setData,
  };
}

// Need to import useState for the hook
import { useState } from 'react';

export default Dialog;
