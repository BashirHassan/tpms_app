/**
 * SecureSensitiveInput Component
 * 
 * A security-hardened input component for sensitive data like passwords and API keys.
 * Following JEI pattern for secure input handling.
 * 
 * Security features:
 * - Masked by default (type="password")
 * - Disables autofill and autocomplete
 * - Reveals only temporarily with confirmation
 * - Auto-hides after timeout
 * - No copy/paste of revealed values (optional)
 * - Clears on unmount
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from './Input';
import { Button } from './Button';
import { IconEye, IconEyeOff, IconShieldLock } from '@tabler/icons-react';
import { cn } from '../../utils/helpers';

const REVEAL_TIMEOUT = 30000; // Auto-hide after 30 seconds

export function SecureSensitiveInput({
  value,
  onChange,
  placeholder = '••••••••',
  disabled = false,
  className,
  preventCopy = true,
  showSecurityBadge = true,
  autoHideTimeout = REVEAL_TIMEOUT,
  onReveal,
  ...props
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const timeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto-hide after timeout
  useEffect(() => {
    if (isRevealed && autoHideTimeout > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsRevealed(false);
      }, autoHideTimeout);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [isRevealed, autoHideTimeout]);

  const handleToggleReveal = useCallback(() => {
    if (isRevealed) {
      setIsRevealed(false);
    } else {
      // First click shows confirmation
      if (!showConfirm) {
        setShowConfirm(true);
        // Auto-hide confirmation after 3 seconds
        setTimeout(() => setShowConfirm(false), 3000);
      } else {
        // Second click within 3 seconds reveals
        setIsRevealed(true);
        setShowConfirm(false);
        onReveal?.();
      }
    }
  }, [isRevealed, showConfirm, onReveal]);

  const handleCopy = useCallback((e) => {
    if (preventCopy && isRevealed) {
      e.preventDefault();
      return false;
    }
  }, [preventCopy, isRevealed]);

  // Check if value is masked placeholder from server (fully masked or partially masked)
  const isFullyMasked = value === '••••••••' || value === '********';
  const isPartiallyMasked = value && typeof value === 'string' && value.endsWith('••••••••') && value.length > 8;
  const isMaskedValue = isFullyMasked || isPartiallyMasked;
  
  // Extract the visible prefix from partially masked values (e.g., "pk_test_abc••••••••" -> "pk_test_abc")
  const visiblePrefix = isPartiallyMasked ? value.replace('••••••••', '') : '';
  
  // Track if user has started typing a new value
  const [hasUserInput, setHasUserInput] = useState(false);
  
  // Reset user input tracking when value changes externally
  useEffect(() => {
    if (isMaskedValue) {
      setHasUserInput(false);
    }
  }, [isMaskedValue]);

  // Handle change event and extract value for parent
  const handleChange = useCallback((e) => {
    const newValue = e.target ? e.target.value : e;
    setHasUserInput(true);
    onChange(newValue);
  }, [onChange]);
  
  // For masked values, show the visible prefix or empty with placeholder
  const displayValue = isMaskedValue && !hasUserInput ? '' : value;
  const displayPlaceholder = isMaskedValue && !hasUserInput 
    ? (isPartiallyMasked ? `${visiblePrefix}•••• (enter new value to change)` : '••• Configured (enter new value to change)') 
    : placeholder;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type={isRevealed ? 'text' : 'password'}
        value={displayValue}
        onChange={handleChange}
        placeholder={displayPlaceholder}
        disabled={disabled}
        className={cn(
          'pr-20', // Extra padding for buttons
          isMaskedValue && !hasUserInput && 'border-primary-200 bg-primary-50/30',
          className
        )}
        // Security attributes to prevent autofill
        autoComplete="new-password"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        data-lpignore="true" // LastPass
        data-1p-ignore="true" // 1Password
        data-form-type="other" // Generic password manager hint
        onCopy={handleCopy}
        {...props}
      />
      
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {showSecurityBadge && isMaskedValue && !hasUserInput && (
          <span className="text-primary-600" title="Value configured and encrypted at rest">
            <IconShieldLock className="w-4 h-4" />
          </span>
        )}
        
        {/* Only show reveal button if there's actual user-entered content to reveal */}
        {hasUserInput && displayValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7',
              showConfirm && 'text-amber-600 bg-amber-50 hover:bg-amber-100'
            )}
            onClick={handleToggleReveal}
            title={
              showConfirm
                ? 'Click again to reveal'
                : isRevealed
                ? 'Hide value'
                : 'Reveal value'
            }
          >
            {isRevealed ? (
              <IconEyeOff className="w-4 h-4" />
            ) : (
              <IconEye className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
      
      {showConfirm && (
        <div className="absolute right-0 top-full mt-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 text-xs text-amber-800 shadow-sm z-10">
          Click again to reveal
        </div>
      )}
    </div>
  );
}

export default SecureSensitiveInput;
