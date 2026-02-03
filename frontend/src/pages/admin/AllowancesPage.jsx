/**
 * Allowances Management Page
 * View supervisor allowances with summary stats and tabs
 * All calculations use primary postings only
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { allowancesApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconCash,
  IconUsers,
  IconCalendarEvent,
  IconArrowRight,
  IconArrowLeft,
  IconRefresh,
  IconReportMoney,
  IconCar,
  IconWalk,
} from '@tabler/icons-react';
import { getOrdinal, formatCurrency } from '../../utils/helpers';

function AllowancesPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState('by-supervisor');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  // Data
  const [summaryStats, setSummaryStats] = useState(null);
  const [bySupervisor, setBySupervisor] = useState([]);
  const [byVisit, setByVisit] = useState([]);
  const [bySupervisorVisit, setBySupervisorVisit] = useState([]);

  // Filters for supervisor-visit tab
  const [selectedVisit, setSelectedVisit] = useState('');



  // Calculate totals for by supervisor data
  const bySupervisorWithTotals = useMemo(() => {
    if (bySupervisor.length === 0) return [];
    
    const totals = bySupervisor.reduce(
      (acc, row) => ({
        total_postings: acc.total_postings + (parseInt(row.total_postings) || 0),
        inside_count: acc.inside_count + (parseInt(row.inside_count) || 0),
        outside_count: acc.outside_count + (parseInt(row.outside_count) || 0),
        local_running: acc.local_running + (parseFloat(row.local_running) || 0),
        transport: acc.transport + (parseFloat(row.transport) || 0),
        dsa: acc.dsa + (parseFloat(row.dsa) || 0),
        dta: acc.dta + (parseFloat(row.dta) || 0),
        subtotal: acc.subtotal + (parseFloat(row.subtotal) || 0),
        tetfund: acc.tetfund + (parseFloat(row.tetfund) || 0),
      }),
      {
        total_postings: 0,
        inside_count: 0,
        outside_count: 0,
        local_running: 0,
        transport: 0,
        dsa: 0,
        dta: 0,
        subtotal: 0,
        tetfund: 0,
      }
    );

    // Add balance calculation
    totals.balance = totals.subtotal - totals.tetfund;

    const totalsRow = {
      id: 'totals-row',
      supervisor_name: 'TOTAL',
      file_number: '',
      rank_code: '',
      rank_name: '',
      faculty_code: '',
      faculty_name: '',
      _isTotalsRow: true,
      ...totals,
    };

    return [...bySupervisor, totalsRow];
  }, [bySupervisor]);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch data when session or tab changes
  useEffect(() => {
    if (selectedSession) {
      fetchSummaryStats();
      fetchTabData();
    }
  }, [selectedSession, activeTab, selectedVisit]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      toast.error('Failed to load sessions');
    }
  };

  const fetchSummaryStats = async () => {
    try {
      const response = await allowancesApi.getSummaryStats(selectedSession);
      setSummaryStats(response.data.data || response.data || {});
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  };

  const fetchTabData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'by-supervisor':
          await fetchBySupervisor();
          break;
        case 'by-visit':
          await fetchByVisit();
          break;
        case 'by-supervisor-visit':
          await fetchBySupervisorVisit();
          break;
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchBySupervisor = async () => {
    const response = await allowancesApi.getAllowancesBySupervisor(selectedSession);
    setBySupervisor(response.data.data || response.data || []);
  };

  const fetchByVisit = async () => {
    const response = await allowancesApi.getAllowancesByVisit(selectedSession);
    setByVisit(response.data.data || response.data || []);
  };

  const fetchBySupervisorVisit = async () => {
    const response = await allowancesApi.getAllowancesBySupervisorAndVisit(
      selectedSession,
      selectedVisit || undefined
    );
    setBySupervisorVisit(response.data.data || response.data || []);
  };

  const handleRefresh = () => {
    fetchSummaryStats();
    fetchTabData();
  };

  // Column definitions for By Supervisor tab
  const bySupervisorColumns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, row, index) => row._isTotalsRow ? '' : index + 1,
        exportFormatter: (_, row) => row._isTotalsRow ? '' : '',
      },
      {
        accessor: 'supervisor_name',
        header: 'Supervisor Name',
        render: (value, row) => (
          <span className={`font-medium ${row._isTotalsRow ? 'text-primary-700 font-bold text-base' : 'text-gray-900'}`}>
            {value}
          </span>
        ),
      },
      {
        accessor: 'file_number',
        header: 'File Number',
        render: (value, row) => row._isTotalsRow ? '' : (value || 'N/A'),
        exportFormatter: (value, row) => row._isTotalsRow ? '' : (value || 'N/A'),
      },
      {
        accessor: 'rank_code',
        header: 'Rank',
        render: (value, row) => row._isTotalsRow ? '' : (
          <span title={row.rank_name || ''}>{value || 'N/A'}</span>
        ),
        exportFormatter: (value, row) => row._isTotalsRow ? '' : (value || 'N/A'),
      },
      {
        accessor: 'faculty_code',
        header: 'Faculty',
        render: (value, row) => row._isTotalsRow ? '' : (
          <span title={row.faculty_name || ''}>{value || 'N/A'}</span>
        ),
        exportFormatter: (value, row) => row._isTotalsRow ? '' : (value || 'N/A'),
      },
      {
        accessor: 'total_postings',
        header: 'Total Postings',
        render: (value, row) => (
          <div className="flex items-center justify-center gap-1">
            <span className="font-semibold">{value}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600">{'('}{row.inside_count} In</span>
              <span className="text-orange-600">{row.outside_count} Out{')'}</span>
            </div>
          </div>
        ),
        exportFormatter: (value, row) => `${value} (${row.inside_count} In / ${row.outside_count} Out)`,
      },
      {
        accessor: 'local_running',
        header: 'Local Running',
        align: 'right',
        render: (value, row) => (
          <span className={row._isTotalsRow ? 'font-bold text-primary-700' : ''}>
            {formatCurrency(value)}
          </span>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'transport',
        header: 'Transport',
        align: 'right',
        render: (value, row) => (
          <span className={row._isTotalsRow ? 'font-bold text-primary-700' : ''}>
            {formatCurrency(value)}
          </span>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'dsa',
        header: 'DSA',
        align: 'right',
        render: (value, row) => (
          <span className={row._isTotalsRow ? 'font-bold text-primary-700' : ''}>
            {formatCurrency(value)}
          </span>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'dta',
        header: 'DTA',
        align: 'right',
        render: (value, row) => (
          <span className={row._isTotalsRow ? 'font-bold text-primary-700' : ''}>
            {formatCurrency(value)}
          </span>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'subtotal',
        header: 'Subtotal',
        align: 'right',
        render: (value, row) => (
          <span className={`font-medium ${row._isTotalsRow ? 'font-bold text-primary-700' : ''}`}>
            {formatCurrency(value)}
          </span>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'tetfund',
        header: 'TETFund',
        align: 'right',
        render: (value, row) => (
          <Badge variant={row._isTotalsRow ? 'primary' : 'info'} className={`font-mono ${row._isTotalsRow ? 'font-bold' : ''}`}>
            {formatCurrency(value)}
          </Badge>
        ),
        exportFormatter: (value) => (parseFloat(value) || 0).toLocaleString(),
      },
      {
        accessor: 'total',
        header: 'Total',
        align: 'right',
        render: (_, row) => (
          <span className={`font-bold ${row._isTotalsRow ? 'text-primary-800 text-base' : 'text-green-600'}`}>
            {formatCurrency((parseFloat(row.subtotal) || 0) + (parseFloat(row.tetfund) || 0))}
          </span>
        ),
        exportFormatter: (_, row) => ((parseFloat(row.subtotal) || 0) + (parseFloat(row.tetfund) || 0)).toLocaleString(),
      },
      {
        accessor: 'balance',
        header: 'Balance',
        align: 'right',
        render: (value, row) => (
          <span className={`font-bold ${row._isTotalsRow ? 'text-primary-800 text-base' : 'text-primary-600'}`}>
            {formatCurrency(row.subtotal - row.tetfund)}
          </span>
        ),
        exportFormatter: (_, row) => ((parseFloat(row.subtotal) || 0) - (parseFloat(row.tetfund) || 0)).toLocaleString(),
      },
    ],
    [formatCurrency]
  );

  // Column definitions for By Visit tab
  const byVisitColumns = useMemo(
    () => [
      {
        accessor: 'visit_number',
        header: 'Visit',
        render: (value) => (
          <Badge variant="outline" className="font-semibold">
            {getOrdinal(value)} Visit
          </Badge>
        ),
      },
      {
        accessor: 'total_postings',
        header: 'Total Postings',
        render: (value, row) => (
          <div className="text-center">
            <span className="font-semibold text-lg">{value}</span>
            <div className="text-xs text-gray-500">
              <span className="text-green-600">{row.inside_count} Inside</span>
              {' / '}
              <span className="text-orange-600">{row.outside_count} Outside</span>
            </div>
          </div>
        ),
      },
      {
        accessor: 'local_running',
        header: 'Local Running',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'transport',
        header: 'Transport',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'dsa',
        header: 'DSA',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'dta',
        header: 'DTA',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'total',
        header: 'Total',
        align: 'right',
        render: (value) => (
          <span className="font-bold text-primary-600 text-lg">{formatCurrency(value)}</span>
        ),
      },
    ],
    [formatCurrency]
  );

  // Column definitions for By Supervisor & Visit tab
  const bySupervisorVisitColumns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, __, index) => index + 1,
      },
      {
        accessor: 'supervisor_name',
        header: 'Supervisor Name',
        render: (value) => <span className="font-medium text-gray-900">{value}</span>,
      },
      {
        accessor: 'file_number',
        header: 'File Number',
        render: (value) => value || 'N/A',
      },
      {
        accessor: 'rank_code',
        header: 'Rank',
        render: (value, row) => (
          <span title={row.rank_name || ''}>{value || 'N/A'}</span>
        ),
      },
      {
        accessor: 'faculty_code',
        header: 'Faculty',
        render: (value, row) => (
          <span title={row.faculty_name || ''}>{value || 'N/A'}</span>
        ),
      },
      {
        accessor: 'visit_number',
        header: 'Visit',
        render: (value) => <Badge variant="outline">{getOrdinal(value)} Visit</Badge>,
      },
      {
        accessor: 'total_postings',
        header: 'Total Postings',
        render: (value, row) => (
          <div className="text-center">
            <span className="font-semibold">{value}</span>
            <div className="text-xs text-gray-500">
              <span className="text-green-600">{row.inside_count} In</span>
              {' / '}
              <span className="text-orange-600">{row.outside_count} Out</span>
            </div>
          </div>
        ),
      },
      {
        accessor: 'local_running',
        header: 'Local Running',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'transport',
        header: 'Transport',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'dsa',
        header: 'DSA',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'dta',
        header: 'DTA',
        align: 'right',
        render: (value) => formatCurrency(value),
      },
      {
        accessor: 'total',
        header: 'Total',
        align: 'right',
        render: (value) => (
          <span className="font-bold text-primary-600">{formatCurrency(value)}</span>
        ),
      },
    ],
    [formatCurrency]
  );

  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'by-supervisor':
        return bySupervisorWithTotals;
      case 'by-visit':
        return byVisit;
      case 'by-supervisor-visit':
        return bySupervisorVisit;
      default:
        return [];
    }
  };

  // Get current columns based on active tab
  const getCurrentColumns = () => {
    switch (activeTab) {
      case 'by-supervisor':
        return bySupervisorColumns;
      case 'by-visit':
        return byVisitColumns;
      case 'by-supervisor-visit':
        return bySupervisorVisitColumns;
      default:
        return [];
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Supervisor Allowances</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
            View and analyze allowance allocations (Primary postings only)
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleRefresh} className="active:scale-95">
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => {
              setSelectedSession(e.target.value);
            }}
            className="flex-1 sm:flex-none sm:w-auto text-sm"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current && '(Current)'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Postings */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <IconReportMoney className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.total_postings || 0}</p>
                  <p className="text-sm text-gray-500">Primary Postings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unique Supervisors */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <IconUsers className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.unique_supervisors || 0}</p>
                  <p className="text-sm text-gray-500">Supervisors</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inside Count */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <IconWalk className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.inside_count || 0}</p>
                  <p className="text-sm text-gray-500">Inside Postings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Outside Count */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <IconCar className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.outside_count || 0}</p>
                  <p className="text-sm text-gray-500">Outside Postings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grand Total */}
          <Card className="bg-primary-50 border-primary-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <IconCash className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-primary-700">
                    {formatCurrency(summaryStats.grand_total)}
                  </p>
                  <p className="text-sm text-primary-600">Total Allowances</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          <Button
            variant="ghost"
            onClick={() => {
              setActiveTab('by-supervisor');
            }}
            className={`py-2 px-1 border-b-2 rounded-none font-medium text-sm whitespace-nowrap ${
              activeTab === 'by-supervisor'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconUsers className="inline w-4 h-4 mr-1" />
            Allowance by Supervisor
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('by-visit')}
            className={`py-2 px-1 border-b-2 rounded-none font-medium text-sm whitespace-nowrap ${
              activeTab === 'by-visit'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconCalendarEvent className="inline w-4 h-4 mr-1" />
            Allowance by Visit
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('by-supervisor-visit')}
            className={`py-2 px-1 border-b-2 rounded-none font-medium text-sm whitespace-nowrap ${
              activeTab === 'by-supervisor-visit'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconReportMoney className="inline w-4 h-4 mr-1" />
            Allowance by Supervisor & Visit
          </Button>
        </nav>
      </div>

      {/* Visit Filter for Supervisor & Visit tab */}
      {activeTab === 'by-supervisor-visit' && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Filter by Visit:</label>
              <Select
                value={selectedVisit}
                onChange={(e) => setSelectedVisit(e.target.value)}
                className="w-auto"
              >
                <option value="">All Visits</option>
                <option value="1">1st Visit</option>
                <option value="2">2nd Visit</option>
                <option value="3">3rd Visit</option>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={getCurrentData()}
            columns={getCurrentColumns()}
            loading={loading}
            sortable
            exportable
            exportFilename={`allowances-${activeTab}-${new Date().toISOString().split('T')[0]}`}
            rowClassName={(row) => row._isTotalsRow ? 'bg-primary-50 border-t-2 border-primary-300' : ''}
            emptyMessage={
              activeTab === 'by-supervisor'
                ? 'No supervisor allowances found for this session'
                : activeTab === 'by-visit'
                  ? 'No visit data found for this session'
                  : 'No data found for this session'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default AllowancesPage;
