/**
 * Textarea Component
 * Reusable textarea field with label and error handling.
 */

import { forwardRef, useId } from 'react';
import { cn } from '../../utils/helpers';

const Textarea = forwardRef(({ className, label, leftIcon, error, helperText, rows = 4, id, ...props }, ref) => {
  const generatedId = useId();
  const textareaId = id || generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className={cn(leftIcon && 'relative')}>
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-3 text-gray-400">
            {leftIcon}
          </span>
        )}
        <textarea
          id={textareaId}
          rows={rows}
          className={cn(
            'flex min-h-[96px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-y',
            error && 'border-red-500 focus:ring-red-500',
            leftIcon && 'pl-10',
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export { Textarea };
