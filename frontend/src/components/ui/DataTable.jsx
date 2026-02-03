/**
 * DataTable Component
 * A reusable, optimized table component with:
 * - Sticky headers and scroll support (x/y)
 * - Row click handling
 * - Custom cell rendering (status, actions, etc.)
 * - Excel/CSV export functionality
 * - Loading and empty states
 * - Pagination support
 * - Sorting support
 */

import { useState, useMemo, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { cva } from 'class-variance-authority';
import { cn, formatCurrency } from '../../utils/helpers';
import { Button } from './Button';
import { Badge } from './Badge';
import { Dialog } from './Dialog';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  IconChevronUp,
  IconChevronDown,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLoader2,
  IconSearch,
  IconCheck,
  IconMinus,
} from '@tabler/icons-react';

// Status badge variants mapping
const STATUS_VARIANTS = {
  // Generic statuses
  active: 'success',
  inactive: 'default',
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'error',
  completed: 'success',
  draft: 'default',
  published: 'success',
  archived: 'default',
  
  // Payment statuses
  paid: 'success',
  unpaid: 'warning',
  failed: 'error',
  refunded: 'info',
  
  // Custom statuses
  locked: 'error',
  submitted: 'info',
  generated: 'info',
  available: 'success',
  downloaded: 'success',
  revoked: 'error',
};

// Table container styles
const tableContainerVariants = cva(
  'overflow-auto border border-gray-200 rounded-lg',
  {
    variants: {
      size: {
        default: 'max-h-[70vh]',
        sm: 'max-h-[50vh]',
        lg: 'max-h-[80vh]',
        full: 'max-h-full',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

/**
 * Checkbox component for row selection
 */
const Checkbox = ({ checked, indeterminate, onChange, className, ...props }) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn(
        'w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
        checked || indeterminate
          ? 'bg-primary-600 border-primary-600 text-white'
          : 'border-gray-300 bg-white hover:border-gray-400',
        className
      )}
      {...props}
    >
      {indeterminate ? (
        <IconMinus className="w-3 h-3" />
      ) : checked ? (
        <IconCheck className="w-3 h-3" />
      ) : null}
    </button>
  );
};

/**
 * Export Column Selection Modal using Dialog component
 */
const ExportModal = ({ isOpen, onClose, columns, onExport, exportType }) => {
  const exportableColumns = useMemo(() => 
    columns.filter((col) => col.exportable !== false && (col.accessor || col.key) !== 'actions'),
    [columns]
  );
  const [selectedColumns, setSelectedColumns] = useState([]);

  // Get unique identifier for a column
  const getColumnId = (col) => col.accessor || col.key;

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedColumns(exportableColumns.map((col) => getColumnId(col)));
    }
  }, [isOpen, exportableColumns]);

  const handleToggleColumn = (columnId) => {
    setSelectedColumns((prev) =>
      prev.includes(columnId)
        ? prev.filter((a) => a !== columnId)
        : [...prev, columnId]
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(exportableColumns.map((col) => getColumnId(col)));
  };

  const handleDeselectAll = () => {
    setSelectedColumns([]);
  };

  const handleExport = () => {
    const columnsToExport = exportableColumns.filter((col) =>
      selectedColumns.includes(getColumnId(col))
    );
    onExport(columnsToExport);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Export to ${exportType === 'excel' ? 'Excel' : 'PDF'}`}
      description="Select the columns you want to include in the export"
      width="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={selectedColumns.length === 0}
          >
            {exportType === 'excel' ? (
              <IconFileSpreadsheet className="w-4 h-4 mr-2" />
            ) : (
              <IconFileTypePdf className="w-4 h-4 mr-2" />
            )}
            Export {exportType === 'excel' ? 'Excel' : 'PDF'}
          </Button>
        </>
      }
    >
      {/* Quick actions */}
      <div className="flex gap-2 mb-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          Select All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDeselectAll}
        >
          Deselect All
        </Button>
      </div>

      {/* Column list */}
      <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-2">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {exportableColumns.map((col) => {
            const columnId = getColumnId(col);
            return (
              <label
                key={columnId}
                className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <Checkbox
                  checked={selectedColumns.includes(columnId)}
                  onChange={() => handleToggleColumn(columnId)}
                />
                <span className="text-sm text-gray-700">
                  {col.header || columnId}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {selectedColumns.length === 0 && (
        <p className="text-sm text-amber-600 mt-2">
          Please select at least one column to export.
        </p>
      )}
    </Dialog>
  );
};

/**
 * Export data to Excel format using xlsx library
 */
const exportToExcel = (data, columns, filename = 'export') => {
  if (!data || data.length === 0) return;

  // Get visible columns for export
  const exportColumns = columns.filter((col) => col.exportable !== false && col.accessor !== 'actions');
  
  // Build worksheet data
  const headers = exportColumns.map((col) => col.header || col.accessor);
  
  const rows = data.map((row) => {
    return exportColumns.map((col) => {
      let value = col.accessor ? getNestedValue(row, col.accessor) : '';
      
      // Use export formatter if provided, otherwise use regular formatter
      if (col.exportFormatter) {
        value = col.exportFormatter(value, row);
      } else if (col.formatter && typeof col.formatter(value, row) !== 'object') {
        value = col.formatter(value, row);
      }
      
      return value ?? '';
    });
  });

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  
  // Set column widths
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(
      String(h).length,
      ...rows.map(r => String(r[i] || '').length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  
  // Download
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Export data to PDF format using jsPDF and autoTable
 */
const exportToPdf = (data, columns, filename = 'export', options = {}) => {
  if (!data || data.length === 0) return;

  // Get visible columns for export
  const exportColumns = columns.filter((col) => col.exportable !== false && col.accessor !== 'actions');
  
  // Build table data
  const headers = exportColumns.map((col) => col.header || col.accessor);
  
  const rows = data.map((row) => {
    return exportColumns.map((col) => {
      let value = col.accessor ? getNestedValue(row, col.accessor) : '';
      
      // Use export formatter if provided
      if (col.exportFormatter) {
        value = col.exportFormatter(value, row);
      } else if (col.formatter && typeof col.formatter(value, row) !== 'object') {
        value = col.formatter(value, row);
      }
      
      return String(value ?? '');
    });
  });

  // Create PDF - use landscape for better table fit
  const doc = new jsPDF({
    orientation: options.orientation || 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Add title if provided
  if (options.title) {
    doc.setFontSize(16);
    doc.text(options.title, 14, 15);
  }

  // Add table using autoTable function
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: options.title ? 25 : 15,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
  });

  // Download
  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Get nested value from object using dot notation
 */
const getNestedValue = (obj, path) => {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

/**
 * DataTable Component
 */
const DataTable = forwardRef(function DataTable(
  {
    // Data
    data = [],
    columns = [],
    keyField = 'id',
    
    // Features
    loading = false,
    sortable = true,
    exportable = true,
    exportFilename = 'export',
    searchable = false,
    searchPlaceholder = 'Search...',
    
    // Multiselect
    selectable = false,
    selectedRows = [],
    onSelectionChange,
    selectionMode = 'multiple', // 'single' | 'multiple'
    isRowSelectable, // (row) => boolean - optional function to disable selection for specific rows
    
    // Pagination
    pagination = null, // { page, limit, total, onPageChange }
    
    // Callbacks
    onRowClick,
    onSort,
    
    // Styling
    size = 'default',
    className,
    tableClassName,
    headerClassName,
    rowClassName,
    
    // Empty & Loading states
    emptyIcon: EmptyIcon,
    emptyTitle = 'No data found',
    emptyDescription,
    
    // Toolbar
    toolbar,
    toolbarPosition = 'top', // 'top' | 'bottom' | 'both'
    
    // Header actions (buttons near export)
    headerActionsLeft,
    headerActionsRight,
    
    ...props
  },
  ref
) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSelectedRows, setInternalSelectedRows] = useState([]);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState(null); // 'excel' | 'pdf'

  // Use controlled or uncontrolled selection
  const isControlled = onSelectionChange !== undefined;
  const currentSelectedRows = isControlled ? selectedRows : internalSelectedRows;
  
  const setSelectedRows = useCallback((newSelection) => {
    if (isControlled) {
      onSelectionChange?.(newSelection);
    } else {
      setInternalSelectedRows(newSelection);
    }
  }, [isControlled, onSelectionChange]);

  // Reset selection when data changes (for uncontrolled mode)
  useEffect(() => {
    if (!isControlled) {
      setInternalSelectedRows([]);
    }
  }, [data, isControlled]);

  // Get selectable rows
  const selectableRows = useMemo(() => {
    if (!selectable) return [];
    return data.filter((row) => !isRowSelectable || isRowSelectable(row));
  }, [data, selectable, isRowSelectable]);

  // Check if row is selected
  const isRowSelected = useCallback((row) => {
    const rowKey = row[keyField];
    return currentSelectedRows.some((selected) => 
      typeof selected === 'object' ? selected[keyField] === rowKey : selected === rowKey
    );
  }, [currentSelectedRows, keyField]);

  // Check if all selectable rows are selected
  const allSelected = useMemo(() => {
    if (selectableRows.length === 0) return false;
    return selectableRows.every((row) => isRowSelected(row));
  }, [selectableRows, isRowSelected]);

  // Check if some but not all rows are selected
  const someSelected = useMemo(() => {
    if (selectableRows.length === 0) return false;
    const selectedCount = selectableRows.filter((row) => isRowSelected(row)).length;
    return selectedCount > 0 && selectedCount < selectableRows.length;
  }, [selectableRows, isRowSelected]);

  // Handle row selection
  const handleRowSelect = useCallback((row, checked) => {
    if (selectionMode === 'single') {
      setSelectedRows(checked ? [row] : []);
    } else {
      if (checked) {
        setSelectedRows([...currentSelectedRows, row]);
      } else {
        const rowKey = row[keyField];
        setSelectedRows(currentSelectedRows.filter((selected) => 
          typeof selected === 'object' ? selected[keyField] !== rowKey : selected !== rowKey
        ));
      }
    }
  }, [selectionMode, currentSelectedRows, keyField, setSelectedRows]);

  // Handle select all
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      setSelectedRows([...selectableRows]);
    } else {
      setSelectedRows([]);
    }
  }, [selectableRows, setSelectedRows]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    exportData: () => exportToExcel(filteredData, columns, exportFilename),
    getFilteredData: () => filteredData,
    getSortConfig: () => sortConfig,
    getSelectedRows: () => currentSelectedRows,
    clearSelection: () => setSelectedRows([]),
    selectAll: () => setSelectedRows([...selectableRows]),
  }));

  // Handle sorting
  const handleSort = useCallback(
    (columnKey) => {
      if (!sortable) return;
      
      const column = columns.find((c) => c.accessor === columnKey);
      if (column?.sortable === false) return;

      let direction = 'asc';
      if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
        direction = 'desc';
      }

      setSortConfig({ key: columnKey, direction });
      onSort?.({ key: columnKey, direction });
    },
    [sortable, sortConfig, columns, onSort]
  );

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((row) => {
      return columns.some((col) => {
        if (col.searchable === false) return false;
        const value = col.accessor ? getNestedValue(row, col.accessor) : '';
        return String(value).toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, searchable, columns]);

  // Sort data locally (if not server-side)
  const sortedData = useMemo(() => {
    if (!sortConfig.key || onSort) return filteredData; // Skip if server-side sorting
    
    const column = columns.find((c) => c.accessor === sortConfig.key);
    if (!column) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);

      // Use custom sort function if provided
      if (column.sortFn) {
        return column.sortFn(a, b, sortConfig.direction);
      }

      // Default sorting
      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig, columns, onSort]);

  // Render cell content
  const renderCell = useCallback((column, row, rowIndex) => {
    const value = column.accessor ? getNestedValue(row, column.accessor) : null;

    // Custom render function
    if (column.render) {
      return column.render(value, row, rowIndex);
    }

    // Built-in cell types
    switch (column.type) {
      case 'status':
        return (
          <Badge variant={STATUS_VARIANTS[value?.toLowerCase()] || 'default'}>
            {value}
          </Badge>
        );

      case 'badge':
        return (
          <Badge variant={column.badgeVariant || 'default'}>
            {column.formatter ? column.formatter(value, row) : value}
          </Badge>
        );

      case 'date':
        return value ? new Date(value).toLocaleDateString() : '-';

      case 'datetime':
        return value ? new Date(value).toLocaleString() : '-';

      case 'currency':
        return value != null ? formatCurrency(value, column.currency) : '-';

      case 'number':
        return value != null ? value.toLocaleString() : '-';

      case 'boolean':
        return value ? 'Yes' : 'No';

      case 'actions':
        // Actions should use render function
        return column.render ? column.render(value, row, rowIndex) : null;

      default:
        // Use formatter if provided
        if (column.formatter) {
          return column.formatter(value, row);
        }
        return value ?? '-';
    }
  }, []);

  // Render sort indicator
  const renderSortIndicator = (column) => {
    if (!sortable || column.sortable === false) return null;

    const isActive = sortConfig.key === column.accessor;
    
    return (
      <span className="ml-1 inline-flex flex-col">
        <IconChevronUp
          className={cn(
            'w-3 h-3 -mb-1',
            isActive && sortConfig.direction === 'asc' ? 'text-primary-600' : 'text-gray-300'
          )}
        />
        <IconChevronDown
          className={cn(
            'w-3 h-3',
            isActive && sortConfig.direction === 'desc' ? 'text-primary-600' : 'text-gray-300'
          )}
        />
      </span>
    );
  };

  // Render toolbar
  const renderToolbar = () => {
    const hasToolbar = searchable || exportable || toolbar || headerActionsLeft || headerActionsRight;
    if (!hasToolbar) return null;

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 border-b bg-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
          {searchable && (
            <div className="relative flex-shrink-0">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-full sm:w-64"
              />
            </div>
          )}
          {selectable && currentSelectedRows.length > 0 && (
            <span className="text-sm text-gray-600 flex-shrink-0">
              {currentSelectedRows.length} selected
            </span>
          )}
          <div className="flex-1 min-w-0">{toolbar}</div>
          {headerActionsLeft}
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
          {headerActionsRight}
          {exportable && data.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExportType('excel');
                  setExportModalOpen(true);
                }}
                className="active:scale-95"
              >
                <IconFileSpreadsheet className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExportType('pdf');
                  setExportModalOpen(true);
                }}
                className="active:scale-95"
              >
                <IconFileTypePdf className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Render pagination
  const renderPagination = () => {
    if (!pagination) return null;

    const { page, limit, total, onPageChange } = pagination;
    const totalPages = Math.ceil(total / limit);
    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3 border-t bg-gray-50">
        <p className="text-xs sm:text-sm text-gray-500 order-2 sm:order-1">
          Showing {startItem}-{endItem} of {total}
        </p>
        <div className="flex items-center gap-1 order-1 sm:order-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="active:scale-95"
          >
            <IconChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="active:scale-95"
          >
            <IconChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2 sm:px-3 py-1 text-xs sm:text-sm whitespace-nowrap">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="active:scale-95"
          >
            <IconChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="active:scale-95"
          >
            <IconChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      {EmptyIcon && <EmptyIcon className="w-12 h-12 mb-4 text-gray-300" />}
      <p className="font-medium">{emptyTitle}</p>
      {emptyDescription && <p className="text-sm mt-1">{emptyDescription}</p>}
    </div>
  );

  // Render loading state
  const renderLoadingState = () => (
    <div className="flex items-center justify-center py-12">
      <IconLoader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  return (
    <div className={cn('bg-white rounded-lg shadow-sm', className)}>
      {(toolbarPosition === 'top' || toolbarPosition === 'both') && renderToolbar()}
      
      <div className={cn(tableContainerVariants({ size }))}>
        <table className={cn('w-full min-w-max', tableClassName)}>
          <thead className={cn('bg-gray-50 sticky top-0 z-10', headerClassName)}>
            <tr>
              {selectable && selectionMode === 'multiple' && (
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {selectable && selectionMode === 'single' && (
                <th className="px-4 py-3 w-10" />
              )}
              {columns.map((column, index) => (
                <th
                  key={column.accessor || index}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap',
                    column.headerClassName,
                    sortable && column.sortable !== false && 'cursor-pointer hover:bg-gray-100',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right'
                  )}
                  style={{ width: column.width, minWidth: column.minWidth }}
                  onClick={() => column.accessor && handleSort(column.accessor)}
                >
                  <span className="inline-flex items-center">
                    {column.header}
                    {column.accessor && renderSortIndicator(column)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>{renderLoadingState()}</td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>{renderEmptyState()}</td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => {
                const rowSelectable = !isRowSelectable || isRowSelectable(row);
                const selected = isRowSelected(row);
                
                return (
                  <tr
                    key={row[keyField] || rowIndex}
                    className={cn(
                      'hover:bg-gray-50 transition-colors',
                      onRowClick && 'cursor-pointer',
                      selected && 'bg-primary-50 hover:bg-primary-100',
                      typeof rowClassName === 'function' ? rowClassName(row, rowIndex) : rowClassName
                    )}
                    onClick={() => onRowClick?.(row, rowIndex)}
                  >
                    {selectable && (
                      <td className="px-4 py-3 w-10">
                        <Checkbox
                          checked={selected}
                          onChange={(checked) => handleRowSelect(row, checked)}
                          disabled={!rowSelectable}
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                      </td>
                    )}
                    {columns.map((column, colIndex) => (
                      <td
                        key={column.accessor || colIndex}
                        className={cn(
                          'px-4 py-2 whitespace-nowrap text-sm text-gray-900',
                          column.cellClassName,
                          column.align === 'center' && 'text-center',
                          column.align === 'right' && 'text-right'
                        )}
                      >
                        {renderCell(column, row, rowIndex)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(toolbarPosition === 'bottom' || toolbarPosition === 'both') && renderToolbar()}
      {renderPagination()}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => {
          setExportModalOpen(false);
          setExportType(null);
        }}
        columns={columns}
        exportType={exportType}
        onExport={(selectedColumns) => {
          if (exportType === 'excel') {
            exportToExcel(sortedData, selectedColumns, exportFilename);
          } else if (exportType === 'pdf') {
            exportToPdf(sortedData, selectedColumns, exportFilename);
          }
        }}
      />
    </div>
  );
});

/**
 * Pre-built column helpers
 */
export const columnHelpers = {
  // Status column
  status: (accessor = 'status', header = 'Status', options = {}) => ({
    accessor,
    header,
    type: 'status',
    ...options,
  }),

  // Date column
  date: (accessor, header, options = {}) => ({
    accessor,
    header,
    type: 'date',
    ...options,
  }),

  // DateTime column
  datetime: (accessor, header, options = {}) => ({
    accessor,
    header,
    type: 'datetime',
    ...options,
  }),

  // Currency column
  currency: (accessor, header, currency = 'NGN', options = {}) => ({
    accessor,
    header,
    type: 'currency',
    currency,
    align: 'right',
    ...options,
  }),

  // Actions column (usually last)
  actions: (render, options = {}) => ({
    accessor: 'actions',
    header: 'Actions',
    sortable: false,
    exportable: false,
    type: 'actions',
    align: 'right',
    render,
    ...options,
  }),

  // Index column (row number)
  index: (header = '#', options = {}) => ({
    accessor: null,
    header,
    sortable: false,
    exportable: false,
    render: (_, __, index) => index + 1,
    width: 50,
    ...options,
  }),
};

export { DataTable, exportToExcel, exportToPdf, STATUS_VARIANTS };
