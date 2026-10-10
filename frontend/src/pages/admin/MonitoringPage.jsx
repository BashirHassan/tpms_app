/**
 * Monitoring Management Page (Admin)
 * Simplified monitoring with assignments and reports
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { monitoringApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { DataTable } from '../../components/ui/DataTable';
import { AssignMonitoringDialog } from '../../components/monitoring/AssignMonitoringDialog';
import {
  IconMapPin,
  IconUsers,
  IconClipboardList,
  IconPlus,
  IconTrash,
  IconEye,
  IconFileDescription,
  IconSchool,
  IconEdit,
  IconRefresh,
  IconPrinter,
} from '@tabler/icons-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { formatDate, formatDateTime, escapeHtml } from '../../utils/helpers';

const monitoringTypeLabel = (type) =>
  (type === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation');

// Everything a table cell shows, joined so the table search can match any of it
const searchText = (...parts) => parts.filter(Boolean).join(' ');
// The list endpoints default to 100 rows; the tables page, search and total
// client-side, so ask for the whole session.
const LIST_FETCH_LIMIT = 10000;
const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const uniqueCount = (rows, key) => new Set(rows.map(key).filter(Boolean)).size;
const totalsCell = (value) => <span className="font-bold text-primary-700">{value}</span>;
const schoolSearchText = (row) => searchText(
  row.school_name, row.school_code, row.route_name, row.lga, row.ward, row.school_address
);

function MonitoringPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isTPHead = ['super_admin', 'head_of_teaching_practice'].includes(user?.role);

  // State
  const [activeTab, setActiveTab] = useState(isTPHead ? 'assignments' : 'my-assignments');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  // Data
  const [statistics, setStatistics] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [reports, setReports] = useState([]);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showViewReportModal, setShowViewReportModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Forms
  const [reportForm, setReportForm] = useState({
    observations: '',
    recommendations: '',
    additional_notes: '',
  });

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null,
    data: null,
    loading: false,
  });

  // Effects live below the callbacks they depend on - a dep array is evaluated
  // during render, so referencing a `const` declared later would throw.


  const fetchSessions = useCallback(async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      const current = sessionsData.find(s => s.is_current) || sessionsData[0];
      if (current) setSelectedSession(current.id.toString());
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isTPHead) {
        // TP Head can see everything - always fetch stats
        if (activeTab === 'assignments') {
          const [statsRes, assignmentsRes] = await Promise.all([
            monitoringApi.getDashboard(selectedSession),
            monitoringApi.getAssignments({ session_id: selectedSession, limit: LIST_FETCH_LIMIT }),
          ]);
          setStatistics(statsRes.data.data);
          setAssignments(assignmentsRes.data.data);
        } else if (activeTab === 'reports') {
          const [statsRes, reportsRes] = await Promise.all([
            monitoringApi.getDashboard(selectedSession),
            monitoringApi.getReports({ session_id: selectedSession, limit: LIST_FETCH_LIMIT }),
          ]);
          setStatistics(statsRes.data.data);
          setReports(reportsRes.data.data);
        } else if (activeTab === 'my-assignments') {
          const [statsRes, myAssignRes] = await Promise.all([
            monitoringApi.getDashboard(selectedSession),
            monitoringApi.getMyAssignments(selectedSession),
          ]);
          setStatistics(statsRes.data.data);
          setMyAssignments(myAssignRes.data.data || []);
        }
      } else {
        // Monitor only sees their assignments and reports
        if (activeTab === 'my-assignments') {
          const myAssignRes = await monitoringApi.getMyAssignments(selectedSession);
          setMyAssignments(myAssignRes.data.data || []);
        } else if (activeTab === 'reports') {
          const reportsRes = await monitoringApi.getReports({ session_id: selectedSession, limit: LIST_FETCH_LIMIT });
          setReports(reportsRes.data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, [isTPHead, activeTab, selectedSession, toast]);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Fetch data when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchData();
    }
  }, [selectedSession, fetchData]);

  // Handle delete assignment
  const handleDeleteAssignment = (id) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete-assignment',
      data: { id },
      loading: false,
    });
  };

  // Confirm delete assignment
  const confirmDeleteAssignment = async () => {
    setConfirmDialog(prev => ({ ...prev, loading: true }));
    try {
      await monitoringApi.deleteAssignment(confirmDialog.data.id);
      toast.success('Assignment deleted');
      setConfirmDialog({ isOpen: false, type: null, data: null, loading: false });
      fetchData();
    } catch (err) {
      console.error('Delete assignment error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete assignment');
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Handle create report
  const handleCreateReport = async () => {
    if (!reportForm.observations && !reportForm.recommendations) {
      toast.error('Please provide observations or recommendations');
      return;
    }

    setProcessing(true);
    try {
      await monitoringApi.createReport({
        session_id: selectedSession,
        assignment_id: selectedAssignment.id,
        ...reportForm,
      });

      toast.success('Report created successfully');
      setShowReportModal(false);
      setReportForm({ observations: '', recommendations: '', additional_notes: '' });
      setSelectedAssignment(null);
      fetchData();
    } catch (err) {
      console.error('Create report error:', err);
      // If report already exists, offer to edit instead
      if (err.response?.data?.existing_report_id) {
        toast.warning('A report already exists for this school. Opening it for editing.');
        const reportId = err.response.data.existing_report_id;
        try {
          const reportRes = await monitoringApi.getReportById(reportId);
          openViewReportModal(reportRes.data.data);
        } catch {
          toast.error('Failed to load existing report');
        }
        setShowReportModal(false);
      } else {
        toast.error(err.response?.data?.message || 'Failed to create report');
      }
    } finally {
      setProcessing(false);
    }
  };

  // Handle update report
  const handleUpdateReport = async () => {
    setProcessing(true);
    try {
      await monitoringApi.updateReport(selectedReport.id, reportForm);
      toast.success('Report updated successfully');
      setShowViewReportModal(false);
      setReportForm({ observations: '', recommendations: '', additional_notes: '' });
      setSelectedReport(null);
      fetchData();
    } catch (err) {
      console.error('Update report error:', err);
      toast.error(err.response?.data?.message || 'Failed to update report');
    } finally {
      setProcessing(false);
    }
  };

  // Handle delete report
  const handleDeleteReport = (id) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete-report',
      data: { id },
      loading: false,
    });
  };

  // Confirm delete report
  const confirmDeleteReport = async () => {
    setConfirmDialog(prev => ({ ...prev, loading: true }));
    try {
      await monitoringApi.deleteReport(confirmDialog.data.id);
      toast.success('Report deleted');
      setConfirmDialog({ isOpen: false, type: null, data: null, loading: false });
      fetchData();
    } catch (err) {
      console.error('Delete report error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete report');
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Open report modal for assignment (handles edit vs create)
  const openReportModal = useCallback((assignment) => {
    // Check if assignment already has a report
    if (assignment.report_count > 0) {
      // Fetch and open the existing report for editing
      monitoringApi.getReports({ session_id: selectedSession, assignment_id: assignment.id })
        .then(res => {
          if (res.data.data && res.data.data.length > 0) {
            openViewReportModal(res.data.data[0]);
          }
        })
        .catch(() => {
          toast.error('Failed to load existing report');
        });
    } else {
      setSelectedAssignment(assignment);
      setReportForm({ observations: '', recommendations: '', additional_notes: '' });
      setShowReportModal(true);
    }
  }, [selectedSession, toast]);

  // Open view report modal
  const openViewReportModal = (report) => {
    setSelectedReport(report);
    setReportForm({
      observations: report.observations || '',
      recommendations: report.recommendations || '',
      additional_notes: report.additional_notes || '',
    });
    setShowViewReportModal(true);
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const variants = {
      active: 'success',
      completed: 'primary',
      cancelled: 'error',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  // Assignment table columns
  const assignmentColumns = useMemo(() => [
    {
      accessor: 'sn',
      header: 'S/N',
      sortable: false,
      searchable: false,
      render: (val, row, index) => row._isTotalsRow ? totalsCell(val) : index + 1,
    },
    {
      accessor: 'monitor_name',
      header: 'Monitor',
      searchValue: (row) => searchText(row.monitor_name, row.monitor_email),
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : (
        <div>
          <div className="font-medium text-gray-900">{row.monitor_name}</div>
          <div className="text-sm text-gray-500">{row.monitor_email}</div>
        </div>
      ),
    },
    {
      accessor: 'school_name',
      header: 'School',
      searchValue: schoolSearchText,
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : (
        <div>
          <div className="font-medium text-gray-900">{row.school_name}</div>
          {row.route_name && (
            <div className="text-sm text-gray-500">{row.route_name}</div>
          )}
        </div>
      ),
    },
    {
      accessor: 'monitoring_type',
      header: 'Type',
      searchValue: (row) => monitoringTypeLabel(row.monitoring_type),
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : (
        <Badge variant="info">
          {val === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation'}
        </Badge>
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (val, row) => row._isTotalsRow ? '' : getStatusBadge(val),
    },
    {
      accessor: 'report_count',
      header: 'Reports',
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : (
        <span className={val > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
          {val || 0}
        </span>
      ),
    },
    ...(isTPHead ? [{
      accessor: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      exportable: false,
      render: (_, row) => row._isTotalsRow ? null : (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(row.id); }}
            className="text-gray-400 hover:text-red-600"
            title="Delete assignment"
          >
            <IconTrash className="w-4 h-4" />
          </Button>
        </div>
      ),
    }] : []),
  ], [isTPHead]);

  // Totals footer for the assignments table
  const assignmentsFooter = useMemo(() => {
    if (!assignments.length) return null;
    return {
      id: 'totals-row',
      _isTotalsRow: true,
      sn: 'Total',
      monitor_name: countLabel(uniqueCount(assignments, (a) => a.monitor_email || a.monitor_name), 'monitor'),
      school_name: countLabel(uniqueCount(assignments, (a) => a.school_id ?? a.school_name), 'school'),
      monitoring_type: countLabel(assignments.length, 'assignment'),
      status: '',
      report_count: assignments.reduce((sum, a) => sum + (Number(a.report_count) || 0), 0),
    };
  }, [assignments]);

  // My assignments columns (for monitors)
  const myAssignmentColumns = useMemo(() => [
    {
      accessor: 'sn',
      header: 'S/N',
      sortable: false,
      searchable: false,
      render: (_, __, index) => index + 1,
    },
    {
      accessor: 'school_name',
      header: 'School',
      searchValue: schoolSearchText,
      render: (_, row) => (
        <div>
          <div className="font-medium text-gray-900">{row.school_name}</div>
          {row.school_code && (
            <div className="text-sm text-gray-500 font-mono">{row.school_code}</div>
          )}
          {row.route_name && (
            <div className="text-sm text-gray-500">{row.route_name}</div>
          )}
          {row.school_address && (
            <div className="text-xs text-gray-400">{row.school_address}</div>
          )}
        </div>
      ),
    },
    {
      accessor: 'principal_name',
      header: 'Principal',
    },
    {
      accessor: 'monitoring_type',
      header: 'Type',
      searchValue: (row) => monitoringTypeLabel(row.monitoring_type),
      render: (val) => (
        <Badge variant="info">
          {val === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation'}
        </Badge>
      ),
    },
    {
      accessor: 'report_count',
      header: 'Report Status',
      render: (val) => (
        val > 0 ? (
          <Badge variant="success">Submitted</Badge>
        ) : (
          <Badge variant="warning">Pending</Badge>
        )
      ),
    },
    {
      accessor: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      exportable: false,
      render: (_, row) => (
        <div className="flex items-center justify-end gap-2">
          {row.report_count > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); openReportModal(row); }}
            >
              <IconEdit className="w-4 h-4 mr-1" />
              Edit Report
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => { e.stopPropagation(); openReportModal(row); }}
            >
              <IconPlus className="w-4 h-4 mr-1" />
              Add Report
            </Button>
          )}
        </div>
      ),
    },
  ], [openReportModal]);

  // Get selected session name for export filename
  const selectedSessionName = useMemo(() => {
    const session = sessions.find(s => s.id.toString() === selectedSession);
    return session?.name || 'Session';
  }, [sessions, selectedSession]);

  // Professional print function for reports
  const handlePrintReport = useCallback(() => {
    if (!selectedReport) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print the report');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Monitoring Report - ${escapeHtml(selectedReport.school_name)}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            padding: 0.5in;
            max-width: 8.5in;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h1 {
            font-size: 16pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header h2 {
            font-size: 14pt;
            font-weight: normal;
          }
          .header p {
            font-size: 12pt;
            color: #333;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 5px;
            border: 1px solid #ccc;
            padding: 15px;
            background: #f9f9f9;
          }
          .meta-item {
            margin-bottom: 0px;
          }
          .meta-label {
            font-weight: bold;
            font-size: 12pt;
            color: #1b1b1b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .meta-value {
            font-size: 12pt;
          }
          .section {
            margin-bottom: 15px;
            page-break-inside: avoid;
          }
          .section-header {
            color: #1b1b1b;
            padding-top: 2px;
            font-weight: bold;
            font-size: 13pt;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .section-content {
            border: 1px solid #ccc;
            padding: 15px;
            min-height: 80px;
            white-space: pre-wrap;
            text-align: justify;
          }
          .footer {
            padding-top: 10px;
            border-top: 1px solid #ccc;
            display: flex;
            justify-content: space-between;
          }
          .signature-block {
            width: 45%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000;
            margin-top: 50px;
            padding-top: 5px;
            font-size: 10pt;
          }
          @media print {
            body { padding: 0; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Field Monitoring Report</h1>
          <h2>${escapeHtml(selectedSessionName)} Academic Session</h2>
          <p>Teaching Practice Supervision & Evaluation</p>
          <h4>${escapeHtml(selectedReport.school_name || '-')} (${escapeHtml(selectedReport.school_code || '-')})</h4>
          <h5>${escapeHtml(selectedReport.route_name || '-')} (${escapeHtml(selectedReport.ward || '-')})</h5>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <div class="meta-label">Field Monitor</div>
            <div class="meta-value">${escapeHtml(selectedReport.monitor_name || '-')}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Date of Visit</div>
            <div class="meta-value">${selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">Observations</div>
          <div class="section-content">${escapeHtml(selectedReport.observations || 'No observations recorded.')}</div>
        </div>

        <div class="section">
          <div class="section-header">Recommendations</div>
          <div class="section-content">${escapeHtml(selectedReport.recommendations || 'No recommendations recorded.')}</div>
        </div>

        ${selectedReport.additional_notes ? `
        <div class="section">
          <div class="section-header">Additional Notes</div>
          <div class="section-content">${escapeHtml(selectedReport.additional_notes)}</div>
        </div>
        ` : ''}
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, [selectedReport, selectedSessionName, toast]);

  // Reports columns
  const reportColumns = useMemo(() => [
    {
      accessor: 'sn',
      header: 'S/N',
      sortable: false,
      searchable: false,
      render: (val, row, index) => row._isTotalsRow ? totalsCell(val) : index + 1,
    },
    {
      accessor: 'school_name',
      header: 'School',
      searchValue: schoolSearchText,
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : (
        <div>
          <div className="font-medium text-gray-900">{row.school_name}</div>
          <div className="text-sm text-gray-500">
            {row.school_code && <span className="font-mono">{row.school_code}</span>}
            {row.school_code && row.route_name && ' • '}
            {row.route_name}
          </div>
        </div>
      ),
    },
    {
      accessor: 'monitor_name',
      header: 'Monitor',
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : val,
    },
    {
      accessor: 'observations',
      header: 'Observations',
      render: (val, row) => row._isTotalsRow ? '' : (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'recommendations',
      header: 'Recommendations',
      render: (val, row) => row._isTotalsRow ? '' : (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'additional_notes',
      header: 'Additional Notes',
      render: (val, row) => row._isTotalsRow ? '' : (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'created_at',
      header: 'Date',
      searchValue: (row) => formatDate(row.created_at),
      render: (val, row) => row._isTotalsRow ? totalsCell(val) : formatDate(val),
    },
    {
      accessor: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      exportable: false,
      render: (_, row) => row._isTotalsRow ? null : (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); openViewReportModal(row); }}
            className="text-gray-400 hover:text-primary-600"
            title="View report"
          >
            <IconEye className="w-4 h-4" />
          </Button>
          {isTPHead && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleDeleteReport(row.id); }}
              className="text-gray-400 hover:text-red-600"
              title="Delete report"
            >
              <IconTrash className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ], [isTPHead]);

  // Totals footer for the reports table
  const reportsFooter = useMemo(() => {
    if (!reports.length) return null;
    return {
      id: 'totals-row',
      _isTotalsRow: true,
      sn: 'Total',
      school_name: countLabel(uniqueCount(reports, (r) => r.school_id ?? r.school_name), 'school'),
      monitor_name: countLabel(uniqueCount(reports, (r) => r.monitor_id ?? r.monitor_name), 'monitor'),
      observations: '',
      recommendations: '',
      additional_notes: '',
      created_at: countLabel(reports.length, 'report'),
    };
  }, [reports]);

  // Tabs configuration
  const tabs = isTPHead
    ? [
        { id: 'assignments', label: 'Assignments', icon: IconClipboardList },
        { id: 'my-assignments', label: 'My Schools', icon: IconSchool },
        { id: 'reports', label: 'Reports', icon: IconFileDescription },
      ]
    : [
        { id: 'my-assignments', label: 'My Schools', icon: IconSchool },
        { id: 'reports', label: 'My Reports', icon: IconFileDescription },
      ];

  return (
    <div className="space-y-4 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Field Monitoring</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage school monitoring assignments and reports</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={fetchData} title="Refresh" className="active:scale-95">
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="flex-1 sm:flex-none sm:w-48"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current ? '(Current)' : ''}
              </option>
            ))}
          </Select>
          {isTPHead && (
            <Button onClick={() => setShowAssignModal(true)} className="active:scale-95 flex-shrink-0">
              <IconPlus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Assign</span>
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard Stats - Always visible for TP Head */}
      {isTPHead && statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-3 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <IconClipboardList className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-2xl font-bold">{statistics.total_assignments || 0}</div>
                  <div className="text-[10px] sm:text-sm text-gray-500 truncate">Total Assignments</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <IconUsers className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-2xl font-bold">{statistics.total_monitors || 0}</div>
                  <div className="text-[10px] sm:text-sm text-gray-500 truncate">Active Monitors</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-purple-100 rounded-lg flex-shrink-0">
                  <IconMapPin className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-2xl font-bold">{statistics.total_schools || 0}</div>
                  <div className="text-[10px] sm:text-sm text-gray-500 truncate">Schools Assigned</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-orange-100 rounded-lg flex-shrink-0">
                  <IconFileDescription className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-2xl font-bold">{statistics.total_reports || 0}</div>
                  <div className="text-[10px] sm:text-sm text-gray-500 truncate">Reports Submitted</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap rounded-none ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* Assignments Tab */}
          {activeTab === 'assignments' && isTPHead && (
            <Card>
              <CardHeader>
                <CardTitle>All Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={assignments}
                  columns={assignmentColumns}
                  footerData={assignmentsFooter}
                  clientPagination
                  keyField="id"
                  sortable
                  searchable
                  searchPlaceholder="Search monitor, school, type..."
                  exportable
                  exportFilename="monitoring_assignments"
                  emptyIcon={IconClipboardList}
                  emptyTitle="No assignments found"
                  emptyDescription="Create assignments to assign monitors to schools"
                />
              </CardContent>
            </Card>
          )}

          {/* My Assignments Tab */}
          {activeTab === 'my-assignments' && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {isTPHead ? 'My Assigned Schools' : 'Schools Assigned to Me'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={myAssignments}
                  columns={myAssignmentColumns}
                  keyField="id"
                  sortable
                  searchable
                  searchPlaceholder="Search school, code, route..."
                  emptyIcon={IconSchool}
                  emptyTitle="No schools assigned"
                  emptyDescription="You have no schools assigned to you for monitoring"
                />
              </CardContent>
            </Card>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <Card>
              <CardHeader>
                <CardTitle>{isTPHead ? 'All Reports' : 'My Reports'}</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={reports}
                  columns={reportColumns}
                  footerData={reportsFooter}
                  clientPagination
                  keyField="id"
                  sortable
                  searchable
                  searchPlaceholder="Search school, monitor, text..."
                  exportable
                  exportFilename={`Monitoring Reports for ${selectedSessionName} Session`}
                  emptyIcon={IconFileDescription}
                  emptyTitle="No reports found"
                  emptyDescription="No monitoring reports have been submitted yet"
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Assign Monitoring Dialog */}
      {isTPHead && (
        <AssignMonitoringDialog
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          sessionId={selectedSession}
          sessionName={selectedSessionName}
          onAssigned={fetchData}
        />
      )}

      {/* Add Report Dialog */}
      <Dialog
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title={`Add Report - ${selectedAssignment?.school_name || ''}`}
        width="xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observations
            </label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[100px]"
              value={reportForm.observations}
              onChange={(e) => setReportForm({ ...reportForm, observations: e.target.value })}
              placeholder="Enter your observations about the school..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recommendations
            </label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[100px]"
              value={reportForm.recommendations}
              onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })}
              placeholder="Enter your recommendations..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[80px]"
              value={reportForm.additional_notes}
              onChange={(e) => setReportForm({ ...reportForm, additional_notes: e.target.value })}
              placeholder="Any additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowReportModal(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateReport}
              loading={processing}
            >
              Submit Report
            </Button>
          </div>
        </div>
      </Dialog>

      {/* View/Edit Report Dialog */}
      <Dialog
        isOpen={showViewReportModal}
        onClose={() => setShowViewReportModal(false)}
        title={`Report - ${selectedReport?.school_name || ''}`}
        width="3xl"
      >
        {/* Only the report creator can edit */}
        {selectedReport?.monitor_id === user?.id ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Monitor:</span>
                  <span className="ml-2 font-medium">{selectedReport?.monitor_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2 font-medium">
                    {formatDateTime(selectedReport?.created_at)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observations
              </label>
              <textarea
                className="w-full border rounded-lg p-3 min-h-[100px]"
                value={reportForm.observations}
                onChange={(e) => setReportForm({ ...reportForm, observations: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recommendations
              </label>
              <textarea
                className="w-full border rounded-lg p-3 min-h-[100px]"
                value={reportForm.recommendations}
                onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Notes
              </label>
              <textarea
                className="w-full border rounded-lg p-3 min-h-[80px]"
                value={reportForm.additional_notes}
                onChange={(e) => setReportForm({ ...reportForm, additional_notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowViewReportModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateReport}
                loading={processing}
              >
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          /* View-only printable report for non-owners */
          <div id="printable-report" className="space-y-4">
            {/* Report Header */}
            <div className="border-b-2 border-gray-300 pb-4 mb-4">
              <h2 className="text-xl font-bold text-center text-gray-800 mb-2">
                Field Monitoring Report
              </h2>
              <p className="text-center text-gray-600 text-sm">
                {selectedSessionName} Academic Session
              </p>
            </div>

            {/* Report Details Grid */}
            <div className="bg-gray-50 rounded-lg p-4 print:bg-white print:border print:border-gray-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 font-medium">School:</span>
                  <div className="font-semibold text-gray-900">{selectedReport?.school_name}</div>
                  {selectedReport?.school_code && (
                    <div className="text-xs text-gray-500 font-mono">{selectedReport?.school_code}</div>
                  )}
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Route/Zone:</span>
                  <div className="font-semibold text-gray-900">{selectedReport?.route_name || '-'}</div>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Monitor:</span>
                  <div className="font-semibold text-gray-900">{selectedReport?.monitor_name}</div>
                  {selectedReport?.monitor_email && (
                    <div className="text-xs text-gray-500">{selectedReport?.monitor_email}</div>
                  )}
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Date Submitted:</span>
                  <div className="font-semibold text-gray-900">{formatDateTime(selectedReport?.created_at)}</div>
                </div>
              </div>
            </div>

            {/* Observations Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden print:break-inside-avoid">
              <div className="bg-blue-50 px-4 py-2 border-b border-gray-200 print:bg-gray-100">
                <h3 className="font-semibold text-blue-800 print:text-gray-800">Observations</h3>
              </div>
              <div className="p-4 min-h-[80px]">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedReport?.observations || 'No observations recorded.'}</p>
              </div>
            </div>

            {/* Recommendations Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden print:break-inside-avoid">
              <div className="bg-green-50 px-4 py-2 border-b border-gray-200 print:bg-gray-100">
                <h3 className="font-semibold text-green-800 print:text-gray-800">Recommendations</h3>
              </div>
              <div className="p-4 min-h-[80px]">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedReport?.recommendations || 'No recommendations recorded.'}</p>
              </div>
            </div>

            {/* Additional Notes Section */}
            {selectedReport?.additional_notes && (
              <div className="border border-gray-200 rounded-lg overflow-hidden print:break-inside-avoid">
                <div className="bg-orange-50 px-4 py-2 border-b border-gray-200 print:bg-gray-100">
                  <h3 className="font-semibold text-orange-800 print:text-gray-800">Additional Notes</h3>
                </div>
                <div className="p-4">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedReport?.additional_notes}</p>
                </div>
              </div>
            )}

            {/* Action Buttons - Hidden when printing */}
            <div className="flex justify-end gap-3 pt-4 border-t print:hidden">
              <Button
                variant="outline"
                onClick={() => setShowViewReportModal(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={handlePrintReport}
              >
                <IconPrinter className="w-4 h-4 mr-2" />
                Print Report
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, data: null, loading: false })}
        onConfirm={confirmDialog.type === 'delete-assignment' ? confirmDeleteAssignment : confirmDeleteReport}
        title={confirmDialog.type === 'delete-assignment' ? 'Delete Assignment' : 'Delete Report'}
        message={confirmDialog.type === 'delete-assignment'
          ? 'Are you sure you want to delete this assignment? This action cannot be undone.'
          : 'Are you sure you want to delete this report? This action cannot be undone.'
        }
        confirmText="Delete"
        variant="danger"
        loading={confirmDialog.loading}
      />
    </div>
  );
}

export default MonitoringPage;
