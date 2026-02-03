/**
 * DataTable Usage Examples
 * 
 * This file demonstrates how to use the DataTable component
 * across different scenarios in the application.
 */

// ============================================
// BASIC IMPORT
// ============================================

import { DataTable, columnHelpers } from '../components/ui';
import { Button } from '../components/ui';
import { IconPencil, IconTrash, IconEye, IconDownload, IconDotsVertical } from '@tabler/icons-react';

// ============================================
// EXAMPLE 1: Simple Table
// ============================================

function SimpleTableExample() {
  const data = [
    { id: 1, name: 'John Doe', email: 'john@example.com', status: 'active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'inactive' },
  ];

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'email', header: 'Email' },
    { accessor: 'status', header: 'Status', type: 'status' }, // Auto-styled status badge
  ];

  return <DataTable data={data} columns={columns} />;
}

// ============================================
// EXAMPLE 2: Table with Row Click
// ============================================

function RowClickExample() {
  const handleRowClick = (row, index) => {
    console.log('Clicked row:', row);
    // Navigate, open modal, etc.
  };

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'department', header: 'Department' },
  ];

  return (
    <DataTable
      data={[]}
      columns={columns}
      onRowClick={handleRowClick}
    />
  );
}

// ============================================
// EXAMPLE 3: Table with Custom Actions Column
// ============================================

function ActionsExample() {
  const handleEdit = (row) => console.log('Edit:', row);
  const handleDelete = (row) => console.log('Delete:', row);
  const handleView = (row) => console.log('View:', row);

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'email', header: 'Email' },
    
    // Using columnHelpers.actions for the actions column
    columnHelpers.actions((value, row) => (
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); handleView(row); }}
          className="text-gray-400 hover:text-primary-600"
          title="View"
        >
          <IconEye className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
          className="text-gray-400 hover:text-blue-600"
          title="Edit"
        >
          <IconPencil className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row); }}
          className="text-gray-400 hover:text-red-600"
          title="Delete"
        >
          <IconTrash className="w-4 h-4" />
        </button>
      </div>
    )),
  ];

  return <DataTable data={[]} columns={columns} />;
}

// ============================================
// EXAMPLE 4: Table with Custom Cell Rendering
// ============================================

function CustomRenderExample() {
  const columns = [
    // Row number column
    columnHelpers.index('#'),
    
    // Custom render for user with avatar
    {
      accessor: 'name',
      header: 'User',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={row.avatar || '/default-avatar.png'}
            alt={value}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <div className="font-medium text-gray-900">{value}</div>
            <div className="text-sm text-gray-500">{row.email}</div>
          </div>
        </div>
      ),
    },
    
    // Using built-in status type
    columnHelpers.status('status', 'Status'),
    
    // Date column
    columnHelpers.date('created_at', 'Created'),
    
    // Currency column
    columnHelpers.currency('amount', 'Amount', 'NGN'),
  ];

  return <DataTable data={[]} columns={columns} />;
}

// ============================================
// EXAMPLE 5: Table with Search and Export
// ============================================

function SearchExportExample() {
  const columns = [
    { accessor: 'matric_no', header: 'Matric No' },
    { accessor: 'name', header: 'Name' },
    { accessor: 'department', header: 'Department' },
    {
      accessor: 'status',
      header: 'Status',
      type: 'status',
      // Custom export formatter (different from display)
      exportFormatter: (value) => value?.toUpperCase(),
    },
    // Actions column - excluded from export by default
    columnHelpers.actions((_, row) => (
      <Button size="sm" variant="outline">View</Button>
    )),
  ];

  return (
    <DataTable
      data={[]}
      columns={columns}
      searchable={true}
      searchPlaceholder="Search students..."
      exportable={true}
      exportFilename="students_list"
    />
  );
}

// ============================================
// EXAMPLE 6: Table with Pagination
// ============================================

function PaginationExample() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    // Fetch paginated data from API
    fetchData(page, limit);
  }, [page]);

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'email', header: 'Email' },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      pagination={{
        page,
        limit,
        total,
        onPageChange: setPage,
      }}
    />
  );
}

// ============================================
// EXAMPLE 7: Table with Loading State
// ============================================

function LoadingExample() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'email', header: 'Email' },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      emptyTitle="No students found"
      emptyDescription="Try adjusting your search or add new students"
    />
  );
}

// ============================================
// EXAMPLE 8: Table with Custom Toolbar
// ============================================

function CustomToolbarExample() {
  const [filter, setFilter] = useState('all');

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'status', header: 'Status', type: 'status' },
  ];

  return (
    <DataTable
      data={[]}
      columns={columns}
      searchable={true}
      toolbar={
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
          </select>
          <Button variant="primary" size="sm">
            Add New
          </Button>
        </div>
      }
    />
  );
}

// ============================================
// EXAMPLE 9: Table with Custom Row Styling
// ============================================

function CustomRowStylingExample() {
  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'status', header: 'Status', type: 'status' },
  ];

  return (
    <DataTable
      data={[]}
      columns={columns}
      rowClassName={(row, index) => {
        if (row.status === 'rejected') return 'bg-red-50';
        if (row.status === 'approved') return 'bg-green-50';
        return '';
      }}
    />
  );
}

// ============================================
// EXAMPLE 10: Using Ref for Programmatic Export
// ============================================

function RefExportExample() {
  const tableRef = useRef(null);

  const handleExport = () => {
    // Programmatically trigger export
    tableRef.current?.exportData();
  };

  const columns = [
    { accessor: 'name', header: 'Name' },
    { accessor: 'email', header: 'Email' },
  ];

  return (
    <div>
      <Button onClick={handleExport}>Export Selected Data</Button>
      <DataTable
        ref={tableRef}
        data={[]}
        columns={columns}
        exportable={false} // Hide default export button
      />
    </div>
  );
}

// ============================================
// EXAMPLE 11: Full Feature Example
// ============================================

function FullFeatureExample() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const columns = [
    columnHelpers.index('#'),
    
    {
      accessor: 'matric_no',
      header: 'Matric No',
      width: 120,
    },
    
    {
      accessor: 'student_name',
      header: 'Student',
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-xs text-gray-500">{row.department}</div>
        </div>
      ),
    },
    
    {
      accessor: 'school_name',
      header: 'School',
      minWidth: 200,
    },
    
    columnHelpers.status('posting_status', 'Status'),
    
    columnHelpers.date('posting_date', 'Date'),
    
    columnHelpers.actions((_, row) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); handleView(row); }}
        >
          <Eye className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </div>
    )),
  ];

  const handleRowClick = (row) => {
    console.log('View details for:', row);
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      keyField="id"
      
      // Features
      searchable={true}
      searchPlaceholder="Search by matric number or name..."
      exportable={true}
      exportFilename="postings_report"
      
      // Pagination
      pagination={{
        page,
        limit: 20,
        total,
        onPageChange: setPage,
      }}
      
      // Callbacks
      onRowClick={handleRowClick}
      
      // Empty state
      emptyTitle="No postings found"
      emptyDescription="Students haven't been posted yet for this session"
      
      // Custom toolbar items
      toolbar={
        <Button variant="primary" size="sm">
          New Posting
        </Button>
      }
    />
  );
}

// ============================================
// COLUMN CONFIGURATION REFERENCE
// ============================================

/*
Column Properties:
------------------
accessor      - string    - Dot notation path to data (e.g., 'user.name')
header        - string    - Column header text
type          - string    - Built-in type: 'status', 'badge', 'date', 'datetime', 'currency', 'number', 'boolean', 'actions'
render        - function  - Custom render function: (value, row, index) => ReactNode
formatter     - function  - Format value for display: (value, row) => string
exportFormatter - function - Format value for export: (value, row) => string
sortable      - boolean   - Enable/disable sorting (default: true)
searchable    - boolean   - Include in search (default: true)
exportable    - boolean   - Include in export (default: true)
width         - string/number - Column width
minWidth      - string/number - Minimum column width
align         - string    - 'left' | 'center' | 'right'
headerClassName - string  - Additional header cell classes
cellClassName - string    - Additional body cell classes
badgeVariant  - string    - Badge variant for 'badge' type
currency      - string    - Currency code for 'currency' type (default: 'NGN')
sortFn        - function  - Custom sort function: (a, b, direction) => number

Column Helpers:
---------------
columnHelpers.index('#')                    - Row number column
columnHelpers.status('field', 'Header')     - Status badge column
columnHelpers.date('field', 'Header')       - Date column
columnHelpers.datetime('field', 'Header')   - DateTime column
columnHelpers.currency('field', 'Header')   - Currency column
columnHelpers.actions(renderFn)             - Actions column (non-sortable, non-exportable)

Status Variants (auto-mapped):
------------------------------
active, inactive, pending, approved, rejected, cancelled, completed,
draft, published, archived, paid, unpaid, failed, refunded,
locked, submitted, generated, available, downloaded, revoked
*/
