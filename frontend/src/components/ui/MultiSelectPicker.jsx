/**
 * MultiSelectPicker Component
 * A searchable, checkbox-driven multi-select dropdown for large option lists.
 *
 * Sibling to SearchableSelect (same visual chrome), but array-valued: the
 * dropdown stays open across picks, options show a checkbox instead of a
 * radio-style indicator, and each option can carry a trailing count badge
 * (e.g. "12 slots"). SearchableSelect's value/onChange contract is strictly
 * single-scalar and used by ~10 other pages, so this is a new component
 * rather than an added "multiple" mode on it.
 */

import * as React from 'react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/utils/helpers';
import { IconSearch, IconChevronDown, IconX, IconCheck } from '@tabler/icons-react';

const MultiSelectPicker = React.forwardRef(
  (
    {
      options = [],
      value = [],
      onChange,

      label,
      placeholder = 'Select options...',
      searchPlaceholder = 'Type to search...',
      emptyMessage = 'No results found',

      getOptionValue = (opt) => opt?.id ?? opt?.value ?? opt,
      getOptionLabel = (opt) => opt?.name ?? opt?.label ?? String(opt),
      getOptionCount, // optional (opt) => number, rendered as a trailing badge

      disabled = false,
      className,

      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const selectedSet = useMemo(() => new Set(value), [value]);

    const filteredOptions = useMemo(() => {
      if (!searchTerm.trim()) return options;
      const searchLower = searchTerm.toLowerCase().trim();
      return options.filter((opt) => getOptionLabel(opt)?.toLowerCase().includes(searchLower));
    }, [options, searchTerm, getOptionLabel]);

    const handleOpen = useCallback(() => {
      if (disabled) return;
      setIsOpen(true);
      setSearchTerm('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }, [disabled]);

    const handleClose = useCallback(() => {
      setIsOpen(false);
      setSearchTerm('');
    }, []);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (containerRef.current && !containerRef.current.contains(event.target)) {
          handleClose();
        }
      };
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen, handleClose]);

    const toggleOption = useCallback(
      (option) => {
        const optionValue = getOptionValue(option);
        const next = selectedSet.has(optionValue)
          ? value.filter((v) => v !== optionValue)
          : [...value, optionValue];
        onChange?.(next);
      },
      [value, selectedSet, getOptionValue, onChange]
    );

    const handleClearAll = useCallback(
      (e) => {
        e.stopPropagation();
        onChange?.([]);
      },
      [onChange]
    );

    const triggerLabel =
      value.length === 0 ? placeholder : `${value.length} selected`;

    return (
      <div className="w-full" ref={containerRef}>
        {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}

        <div className="relative z-20" ref={ref}>
          <button
            type="button"
            onClick={() => (isOpen ? handleClose() : handleOpen())}
            disabled={disabled}
            className={cn(
              'flex items-center justify-between w-full min-h-[2.5rem] px-3 py-2',
              'rounded-lg border bg-white text-left text-sm',
              'transition-all duration-200 ease-in-out',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
              isOpen
                ? 'border-primary-500 ring-2 ring-primary-500/20'
                : 'border-gray-300 hover:border-gray-400',
              className
            )}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            {...props}
          >
            <span className={cn('flex-1 min-w-0 truncate', value.length === 0 ? 'text-gray-400' : 'text-gray-900')}>
              {triggerLabel}
            </span>

            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {value.length > 0 && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClearAll}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClearAll(e);
                    }
                  }}
                  className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  aria-label="Clear selection"
                >
                  <IconX size={14} />
                </span>
              )}
              <IconChevronDown
                size={18}
                className={cn('text-gray-400 transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </div>
          </button>

          {isOpen && (
            <div
              className={cn(
                'absolute z-[100] w-full mt-1',
                'bg-white rounded-lg border border-gray-200',
                'shadow-lg shadow-gray-200/50',
                'animate-in fade-in-0 zoom-in-95 duration-150'
              )}
            >
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={cn(
                      'w-full pl-9 pr-3 py-2 text-sm',
                      'rounded-md border border-gray-200 bg-gray-50',
                      'placeholder:text-gray-400',
                      'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white',
                      'transition-colors duration-150'
                    )}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto overscroll-contain py-1" role="listbox">
                {filteredOptions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">{emptyMessage}</div>
                ) : (
                  filteredOptions.map((option) => {
                    const optionValue = getOptionValue(option);
                    const isSelected = selectedSet.has(optionValue);
                    const count = getOptionCount?.(option);

                    return (
                      <div
                        key={optionValue}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => toggleOption(option)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 cursor-pointer',
                          'transition-colors duration-100',
                          isSelected ? 'bg-primary-50' : 'hover:bg-gray-100'
                        )}
                      >
                        <div
                          className={cn(
                            'flex-shrink-0 w-4 h-4 rounded border-2',
                            'flex items-center justify-center transition-colors',
                            isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300'
                          )}
                        >
                          {isSelected && <IconCheck size={11} className="text-white" strokeWidth={3} />}
                        </div>

                        <span className="flex-1 min-w-0 truncate text-sm text-gray-900">
                          {getOptionLabel(option)}
                        </span>

                        {count !== undefined && count !== null && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-medium">
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

MultiSelectPicker.displayName = 'MultiSelectPicker';

export { MultiSelectPicker };
