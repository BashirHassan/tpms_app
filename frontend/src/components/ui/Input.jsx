/**
 * Input Component
 * Reusable input field with label and error handling
 */

import { forwardRef, useId, useState, useEffect } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { cn } from '../../utils/helpers';

const Input = forwardRef(({ className, type = 'text', label, error, helperText, id, disablePasswordToggle = false, onChange, value, onFocus, onBlur, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [showPassword, setShowPassword] = useState(false);

  // Number inputs: keep a local string buffer so the user can fully clear the field.
  // External value syncs in only when the field is not focused, preventing the parent's
  // parseInt/parseFloat-or-fallback pattern from snapping the display back to a non-empty value.
  const isControlledNumber = type === 'number' && value !== undefined;
  const toStr = (v) => (v !== undefined && v !== null ? String(v) : '');
  const [localNumber, setLocalNumber] = useState(() => isControlledNumber ? toStr(value) : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isControlledNumber && !isFocused) {
      setLocalNumber(toStr(value));
    }
  }, [value, isFocused, isControlledNumber]);

  const isPassword = type === 'password' && !disablePasswordToggle;
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const numberHandlers = isControlledNumber ? {
    value: localNumber,
    onChange: (e) => {
      setLocalNumber(e.target.value);
      onChange?.(e);
    },
    onFocus: (e) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    onBlur: (e) => {
      setIsFocused(false);
      onBlur?.(e);
    },
  } : { value, onChange, onFocus, onBlur };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className={cn('relative', isPassword && 'flex items-center')}>
        <input
          id={inputId}
          type={resolvedType}
          className={cn(
            'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus:ring-red-500',
            isPassword && 'pr-10',
            className
          )}
          ref={ref}
          {...props}
          {...numberHandlers}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 text-gray-400 hover:text-gray-600 focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
