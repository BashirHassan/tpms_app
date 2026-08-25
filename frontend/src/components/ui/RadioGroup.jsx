/**
 * RadioGroup Component
 * Reusable controlled radio option list.
 */

import { useId } from 'react';
import { cn } from '@/utils/helpers';

function RadioGroup({
  name,
  value,
  onChange,
  options = [],
  label,
  error,
  helperText,
  className,
  optionClassName,
  getOptionValue = (option) => option.value,
  getOptionLabel = (option) => option.label,
  renderOption,
  disabled = false,
}) {
  const generatedName = useId();
  const groupName = name || generatedName;

  return (
    <div className="w-full">
      {label && <p className="block text-sm font-medium text-gray-700 mb-2">{label}</p>}
      <div className={cn('grid gap-3', className)} role="radiogroup">
        {options.map((option) => {
          const optionValue = getOptionValue(option);
          const optionLabel = getOptionLabel(option);
          const isChecked = value === optionValue;
          const isDisabled = disabled || option.disabled;
          const optionId = `${groupName}-${String(optionValue)}`;

          return (
            <label
              key={optionValue}
              htmlFor={optionId}
              className={cn(
                'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                isChecked
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:bg-gray-50',
                isDisabled && 'cursor-not-allowed opacity-60',
                optionClassName
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={groupName}
                value={optionValue}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => onChange?.(optionValue, option)}
                className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1 min-w-0">
                {renderOption ? renderOption(option, { isChecked }) : (
                  <span className="font-medium text-gray-900">{optionLabel}</span>
                )}
              </div>
            </label>
          );
        })}
      </div>
      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

export { RadioGroup };
