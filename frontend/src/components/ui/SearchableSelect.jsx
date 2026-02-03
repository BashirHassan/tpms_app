/**
 * SearchableSelect Component
 * A beautiful, performant searchable select for large datasets
 * Supports custom rendering with multi-line options
 */

import * as React from 'react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/utils/helpers';
import {
  IconSearch,
  IconChevronDown,
  IconX,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';

/**
 * SearchableSelect - A searchable dropdown for large option lists
 * 
 * @example
 * // Basic usage
 * <SearchableSelect
 *   options={schools}
 *   value={selectedSchool}
 *   onChange={setSelectedSchool}
 *   placeholder="Select a school..."
 *   searchPlaceholder="Search schools..."
 *   getOptionValue={(opt) => opt.id}
 *   getOptionLabel={(opt) => opt.name}
 * />
 * 
 * @example
 * // With custom rendering (multi-line)
 * <SearchableSelect
 *   options={schools}
 *   value={selectedSchool}
 *   onChange={setSelectedSchool}
 *   renderOption={(school, { isSelected, isHighlighted }) => (
 *     <div>
 *       <div className="font-medium">{school.name}</div>
 *       <div className="text-xs text-gray-500">
 *         {school.category} • {school.student_count} students
 *       </div>
 *     </div>
 *   )}
 * />
 */

// Debounce hook for search
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

const SearchableSelect = React.forwardRef(
  (
    {
      // Core props
      options = [],
      value,
      onChange,
      
      // Labels and placeholders
      label,
      placeholder = 'Select an option...',
      searchPlaceholder = 'Type to search...',
      emptyMessage = 'No results found',
      loadingMessage = 'Loading...',
      
      // Option accessors
      getOptionValue = (opt) => opt?.id ?? opt?.value ?? opt,
      getOptionLabel = (opt) => opt?.name ?? opt?.label ?? String(opt),
      
      // Custom rendering
      renderOption,
      renderSelected,
      
      // State
      loading = false,
      disabled = false,
      error,
      required = false,
      clearable = true,
      
      // Behavior
      maxDisplayed = 100, // Limit displayed options for performance
      debounceMs = 150,
      filterFn, // Custom filter function
      
      // Styling
      className,
      dropdownClassName,
      optionClassName,
      
      // Events
      onSearchChange,
      onOpen,
      onClose,
      
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const optionRefs = useRef([]);

    const debouncedSearch = useDebounce(searchTerm, debounceMs);

    // Find selected option
    const selectedOption = useMemo(() => {
      if (value === null || value === undefined || value === '') return null;
      return options.find((opt) => getOptionValue(opt) === value) || null;
    }, [options, value, getOptionValue]);

    // Filter options based on search
    const filteredOptions = useMemo(() => {
      if (!debouncedSearch.trim()) {
        return options.slice(0, maxDisplayed);
      }

      const searchLower = debouncedSearch.toLowerCase().trim();

      const filtered = filterFn
        ? filterFn(options, debouncedSearch)
        : options.filter((opt) => {
            const label = getOptionLabel(opt);
            return label?.toLowerCase().includes(searchLower);
          });

      return filtered.slice(0, maxDisplayed);
    }, [options, debouncedSearch, maxDisplayed, filterFn, getOptionLabel]);

    // Notify parent of search changes
    useEffect(() => {
      onSearchChange?.(debouncedSearch);
    }, [debouncedSearch, onSearchChange]);

    // Handle click outside to close
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
    }, [isOpen]);

    // Scroll highlighted option into view
    useEffect(() => {
      if (isOpen && optionRefs.current[highlightedIndex]) {
        optionRefs.current[highlightedIndex].scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }, [highlightedIndex, isOpen]);

    // Reset highlight when options change
    useEffect(() => {
      setHighlightedIndex(0);
    }, [filteredOptions.length]);

    const handleOpen = useCallback(() => {
      if (disabled) return;
      setIsOpen(true);
      setSearchTerm('');
      setHighlightedIndex(0);
      onOpen?.();
      // Focus search input after dropdown opens
      setTimeout(() => inputRef.current?.focus(), 10);
    }, [disabled, onOpen]);

    const handleClose = useCallback(() => {
      setIsOpen(false);
      setSearchTerm('');
      onClose?.();
    }, [onClose]);

    const handleSelect = useCallback(
      (option) => {
        const optionValue = getOptionValue(option);
        onChange?.(optionValue, option);
        handleClose();
      },
      [onChange, getOptionValue, handleClose]
    );

    const handleClear = useCallback(
      (e) => {
        e.stopPropagation();
        onChange?.(null, null);
      },
      [onChange]
    );

    const handleKeyDown = useCallback(
      (e) => {
        if (!isOpen) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            handleOpen();
          }
          return;
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setHighlightedIndex((prev) =>
              prev < filteredOptions.length - 1 ? prev + 1 : prev
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
            break;
          case 'Enter':
            e.preventDefault();
            if (filteredOptions[highlightedIndex]) {
              handleSelect(filteredOptions[highlightedIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            handleClose();
            break;
          case 'Tab':
            handleClose();
            break;
          default:
            break;
        }
      },
      [isOpen, highlightedIndex, filteredOptions, handleOpen, handleSelect, handleClose]
    );

    // Default option renderer
    const defaultRenderOption = (option, { isSelected, isHighlighted }) => (
      <span className="truncate">{getOptionLabel(option)}</span>
    );

    // Default selected value renderer
    const defaultRenderSelected = (option) => (
      <span className="truncate">{getOptionLabel(option)}</span>
    );

    const renderFn = renderOption || defaultRenderOption;
    const renderSelectedFn = renderSelected || defaultRenderSelected;

    return (
      <div className="w-full" ref={containerRef}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative z-20" ref={ref}>
          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => (isOpen ? handleClose() : handleOpen())}
            onKeyDown={handleKeyDown}
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
              error && 'border-red-500 focus:ring-red-500',
              className
            )}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            {...props}
          >
            <div className="flex-1 min-w-0">
              {selectedOption ? (
                <div className="text-gray-900">
                  {renderSelectedFn(selectedOption)}
                </div>
              ) : (
                <span className="text-gray-400">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {clearable && selectedOption && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClear(e);
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
                className={cn(
                  'text-gray-400 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div
              className={cn(
                'absolute z-[100] w-full mt-1',
                'bg-white rounded-lg border border-gray-200',
                'shadow-lg shadow-gray-200/50',
                'animate-in fade-in-0 zoom-in-95 duration-150',
                dropdownClassName
              )}
            >
              {/* Search Input */}
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <IconSearch
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
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

              {/* Options List */}
              <div
                ref={listRef}
                className="max-h-64 overflow-y-auto overscroll-contain py-1"
                role="listbox"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                    <IconLoader2 size={18} className="animate-spin" />
                    <span className="text-sm">{loadingMessage}</span>
                  </div>
                ) : filteredOptions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    {emptyMessage}
                  </div>
                ) : (
                  <>
                    {filteredOptions.map((option, index) => {
                      const optionValue = getOptionValue(option);
                      const isSelected = value === optionValue;
                      const isHighlighted = index === highlightedIndex;

                      return (
                        <div
                          key={optionValue}
                          ref={(el) => (optionRefs.current[index] = el)}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect(option)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={cn(
                            'flex items-start gap-2 px-3 py-2 cursor-pointer',
                            'transition-colors duration-100',
                            isHighlighted && 'bg-gray-100',
                            isSelected && 'bg-gray-100',
                            !isHighlighted && !isSelected && 'hover:bg-gray-100',
                            optionClassName
                          )}
                        >
                          {/* Selection indicator */}
                          <div
                            className={cn(
                              'flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2',
                              'flex items-center justify-center transition-colors',
                              isSelected
                                ? 'bg-primary-600 border-primary-600'
                                : 'border-gray-300'
                            )}
                          >
                            {isSelected && (
                              <IconCheck size={12} className="text-white" strokeWidth={3} />
                            )}
                          </div>

                          {/* Option content */}
                          <div className="flex-1 min-w-0">
                            {renderFn(option, { isSelected, isHighlighted })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Show count if there are more options */}
                    {options.length > maxDisplayed && (
                      <div className="px-3 py-2 text-xs text-center text-gray-400 border-t border-gray-100">
                        Showing {Math.min(filteredOptions.length, maxDisplayed)} of{' '}
                        {options.length} options. Type to search for more.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';

// Pre-built school option renderer
export const SchoolOptionRenderer = (school, { isSelected, isHighlighted }) => (
  <div className="min-w-0">
    <div className={cn(
      'font-medium truncate',
      isSelected ? 'text-primary-700' : 'text-gray-900'
    )}>
      {school.name}
    </div>
    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
      <span className={cn(
        'px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide',
        school.category === 'primary' && 'bg-blue-100 text-blue-700',
        school.category === 'secondary' && 'bg-purple-100 text-purple-700',
        school.category === 'both' && 'bg-amber-100 text-amber-700',
        !['primary', 'secondary', 'both'].includes(school.category) && 'bg-gray-100 text-gray-600'
      )}>
        {school.category || 'N/A'}
      </span>
      <span className="text-gray-400">•</span>
      <span>
        {school.student_count ?? school.students_count ?? 0} student
        {(school.student_count ?? school.students_count ?? 0) !== 1 ? 's' : ''}
      </span>
    </div>
  </div>
);

// Pre-built school selected renderer
export const SchoolSelectedRenderer = (school) => (
  <div className="min-w-0">
    <div className="font-medium truncate text-gray-900">{school.name}</div>
    <div className="text-xs text-gray-500">
      {school.category} • {school.student_count ?? school.students_count ?? 0} students
    </div>
  </div>
);

// Custom filter for schools (searches name and category)
export const schoolFilterFn = (options, searchTerm) => {
  const search = searchTerm.toLowerCase().trim();
  return options.filter((school) => {
    const name = (school.name || '').toLowerCase();
    const category = (school.category || '').toLowerCase();
    return name.includes(search) || category.includes(search);
  });
};

export { SearchableSelect };
