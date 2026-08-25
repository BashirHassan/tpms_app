/**
 * MultiSelectList Component
 *
 * A searchable checkbox list for picking many items out of a long list.
 *
 * SearchableSelect covers the single-value case, but a scope picker needs the whole
 * selection visible at once - an admin choosing twelve supervisors out of forty has to
 * see which twelve, not a collapsed summary. So this renders an inline scrollable list
 * rather than a dropdown, with select-all/clear and a live count.
 *
 * @example
 * <MultiSelectList
 *   label="Supervisors"
 *   options={supervisors}
 *   value={selectedIds}
 *   onChange={setSelectedIds}
 *   getOptionValue={(s) => s.id}
 *   getOptionLabel={(s) => s.name}
 *   getOptionDisabled={(s) => s.remaining_slots <= 0}
 *   renderOption={(s) => <span className="text-xs text-gray-500">{s.rank_code}</span>}
 * />
 *
 * @example
 * // Grouped (state -> LGA)
 * <MultiSelectList options={lgas} groupBy={(l) => l.state} ... />
 */

import { useMemo, useState } from 'react';
import { cn } from '@/utils/helpers';
import { IconSearch, IconSelectAll, IconX } from '@tabler/icons-react';

function MultiSelectList({
  options = [],
  value = [],
  onChange,

  label,
  hint,
  searchPlaceholder = 'Search...',
  emptyMessage = 'Nothing to choose from',
  // Shown under the count when nothing is ticked. A scope picker treats an empty
  // selection as "no narrowing", which is the opposite of "nothing selected", so the
  // caller has to be able to say which one it means.
  allSelectedMessage = 'All included',

  getOptionValue = (option) => option.id,
  getOptionLabel = (option) => option.name,
  getOptionDisabled = () => false,
  getOptionMeta,
  renderOption,
  groupBy,

  searchable = true,
  maxHeight = 'max-h-56',
  className,
  disabled = false,
}) {
  const [search, setSearch] = useState('');

  const selected = useMemo(() => new Set(value), [value]);

  const selectable = useMemo(
    () => options.filter((option) => !getOptionDisabled(option)),
    [options, getOptionDisabled]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => {
      const haystack = `${getOptionLabel(option)} ${groupBy ? groupBy(option) : ''} ${
        getOptionMeta ? getOptionMeta(option) : ''
      }`;
      return haystack.toLowerCase().includes(term);
    });
  }, [options, search, getOptionLabel, getOptionMeta, groupBy]);

  // Preserve list order within each group so the headings stay contiguous
  const groups = useMemo(() => {
    if (!groupBy) return [{ key: null, options: visible }];

    const byKey = new Map();
    for (const option of visible) {
      const key = groupBy(option) ?? '';
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(option);
    }
    return [...byKey.entries()].map(([key, groupOptions]) => ({ key, options: groupOptions }));
  }, [visible, groupBy]);

  const toggle = (option) => {
    if (disabled || getOptionDisabled(option)) return;
    const optionValue = getOptionValue(option);
    onChange(
      selected.has(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue]
    );
  };

  const selectAll = () => onChange(selectable.map(getOptionValue));
  const clear = () => onChange([]);

  // Only the group's own rows toggle, so a search that hides part of a group cannot
  // silently select the hidden rows too
  const toggleGroup = (groupOptions) => {
    const values = groupOptions.filter((o) => !getOptionDisabled(o)).map(getOptionValue);
    const allOn = values.every((v) => selected.has(v));
    onChange(
      allOn
        ? value.filter((v) => !values.includes(v))
        : [...new Set([...value, ...values])]
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
          <p className="text-xs text-gray-500">
            {value.length > 0
              ? `${value.length} of ${options.length} selected`
              : `${allSelectedMessage} (${options.length})`}
            {hint && <span className="text-gray-400"> · {hint}</span>}
          </p>
        </div>

        {options.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={selectAll}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50 rounded disabled:opacity-50"
            >
              <IconSelectAll className="h-3.5 w-3.5" />
              Select all
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={disabled || value.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40"
            >
              <IconX className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {searchable && options.length > 8 && (
          <div className="relative border-b border-gray-200">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              disabled={disabled}
              className="w-full pl-9 pr-3 py-2 text-sm border-0 focus:ring-0 focus:outline-none disabled:bg-gray-50"
            />
          </div>
        )}

        <div className={cn('overflow-y-auto divide-y divide-gray-100', maxHeight)}>
          {options.length === 0 && (
            <p className="px-3 py-6 text-sm text-gray-500 text-center">{emptyMessage}</p>
          )}

          {options.length > 0 && visible.length === 0 && (
            <p className="px-3 py-6 text-sm text-gray-500 text-center">No matches for &ldquo;{search}&rdquo;</p>
          )}

          {groups.map((group) => (
            <div key={group.key ?? '_'}>
              {group.key !== null && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.options)}
                  disabled={disabled}
                  className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <span className="truncate">{group.key}</span>
                  <span className="text-gray-400">
                    {group.options.filter((o) => selected.has(getOptionValue(o))).length}/
                    {group.options.length}
                  </span>
                </button>
              )}

              {group.options.map((option) => {
                const optionValue = getOptionValue(option);
                const isDisabled = disabled || getOptionDisabled(option);
                const isSelected = selected.has(optionValue);

                return (
                  <label
                    key={optionValue}
                    className={cn(
                      'flex items-start gap-2.5 px-3 py-2 text-sm',
                      isDisabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:bg-gray-50',
                      isSelected && !isDisabled && 'bg-primary-50/60'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(option)}
                      disabled={isDisabled}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-gray-900 truncate">
                        {getOptionLabel(option)}
                      </span>
                      {renderOption && renderOption(option, { isSelected })}
                    </span>
                    {getOptionMeta && (
                      <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                        {getOptionMeta(option)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { MultiSelectList };
