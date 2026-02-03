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
import { SearchableSelect } from '../../components/ui/SearchableSelect';
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
import { formatDate, formatDateTime } from '../../utils/helpers';

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
  const [unassignedSchools, setUnassignedSchools] = useState([]);
  const [monitors, setMonitors] = useState([]);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showViewReportModal, setShowViewReportModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Forms
  const [assignForm, setAssignForm] = useState({
    monitor_id: '',
    school_ids: [],
    monitoring_type: 'supervision_evaluation',
  });

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

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch data when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchData();
    }
  }, [selectedSession, activeTab]);

  // Fetch unassigned schools when monitoring_type changes in the assign form
  const fetchUnassignedSchools = useCallback(async (monitoringType) => {
    if (!selectedSession) return;
    setLoadingSchools(true);
    try {
      const res = await monitoringApi.getUnassignedSchools(selectedSession, monitoringType);
      setUnassignedSchools(res.data.data || []);
      // Clear selected schools when type changes since available schools changed
      setAssignForm(prev => ({ ...prev, school_ids: [] }));
      setSchoolSearch('');
    } catch (err) {
      console.error('Failed to fetch unassigned schools:', err);
      toast.error('Failed to load available schools');
    } finally {
      setLoadingSchools(false);
    }
  }, [selectedSession, toast]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      const current = sessionsData.find(s => s.is_current) || sessionsData[0];
      if (current) setSelectedSession(current.id.toString());
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (isTPHead) {
        // TP Head can see everything - always fetch stats
        if (activeTab === 'assignments') {
          const [statsRes, assignmentsRes, monitorsRes, schoolsRes] = await Promise.all([
            monitoringApi.getDashboard(selectedSession),
            monitoringApi.getAssignments({ session_id: selectedSession }),
            monitoringApi.getAvailableMonitors(selectedSession),
            monitoringApi.getUnassignedSchools(selectedSession, assignForm.monitoring_type),
          ]);
          setStatistics(statsRes.data.data);
          setAssignments(assignmentsRes.data.data);
          setMonitors(monitorsRes.data.data || []);
          setUnassignedSchools(schoolsRes.data.data || []);
        } else if (activeTab === 'reports') {
          const [statsRes, reportsRes] = await Promise.all([
            monitoringApi.getDashboard(selectedSession),
            monitoringApi.getReports({ session_id: selectedSession }),
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
          const reportsRes = await monitoringApi.getReports({ session_id: selectedSession });
          setReports(reportsRes.data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  // Handle create assignment
  const handleCreateAssignment = async () => {
    if (!assignForm.monitor_id || assignForm.school_ids.length === 0) {
      toast.error('Please select a monitor and at least one school');
      return;
    }

    setProcessing(true);
    try {
      const response = await monitoringApi.createAssignments({
        session_id: selectedSession,
        monitor_id: assignForm.monitor_id,
        school_ids: assignForm.school_ids,
        monitoring_type: assignForm.monitoring_type,
      });

      const responseData = response.data.data || response.data || {};
      const { successful, failed } = responseData;
      
      if (successful.length > 0) {
        toast.success(`Created ${successful.length} assignment(s)`);
      }
      if (failed.length > 0) {
        toast.warning(`${failed.length} assignment(s) failed: ${failed.map(f => f.reason).join(', ')}`);
      }

      setShowAssignModal(false);
      setAssignForm({ monitor_id: '', school_ids: [], monitoring_type: 'supervision_evaluation' });
      setSchoolSearch('');
      fetchData();
    } catch (err) {
      console.error('Create assignment error:', err);
      toast.error(err.response?.data?.message || 'Failed to create assignment');
    } finally {
      setProcessing(false);
    }
  };

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
      toast.error('Failed to delete assignment');
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
      toast.error('Failed to update report');
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
      toast.error('Failed to delete report');
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
      accessor: 'monitor_name',
      header: 'Monitor',
      render: (_, row) => (
        <div>
          <div className="font-medium text-gray-900">{row.monitor_name}</div>
          <div className="text-sm text-gray-500">{row.monitor_email}</div>
        </div>
      ),
    },
    {
      accessor: 'school_name',
      header: 'School',
      render: (_, row) => (
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
      render: (val) => (
        <Badge variant="info">
          {val === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation'}
        </Badge>
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (val) => getStatusBadge(val),
    },
    {
      accessor: 'report_count',
      header: 'Reports',
      render: (val) => (
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
      render: (_, row) => (
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

  // My assignments columns (for monitors)
  const myAssignmentColumns = useMemo(() => [
    {
      accessor: 'school_name',
      header: 'School',
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
        <title>Monitoring Report - ${selectedReport.school_name}</title>
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
          <h2>${selectedSessionName} Academic Session</h2>
          <p>Teaching Practice Supervision & Evaluation</p>
          <h4>${selectedReport.school_name || '-'} (${selectedReport.school_code || '-'})</h4>
          <h5>${selectedReport.route_name || '-'} (${selectedReport.ward || '-'})</h5>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <div class="meta-label">Field Monitor</div>
            <div class="meta-value">${selectedReport.monitor_name || '-'}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Date of Visit</div>
            <div class="meta-value">${selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">Observations</div>
          <div class="section-content">${selectedReport.observations || 'No observations recorded.'}</div>
        </div>

        <div class="section">
          <div class="section-header">Recommendations</div>
          <div class="section-content">${selectedReport.recommendations || 'No recommendations recorded.'}</div>
        </div>

        ${selectedReport.additional_notes ? `
        <div class="section">
          <div class="section-header">Additional Notes</div>
          <div class="section-content">${selectedReport.additional_notes}</div>
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
      accessor: 'school_name',
      header: 'School',
      render: (_, row) => (
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
    },
    {
      accessor: 'observations',
      header: 'Observations',
      render: (val) => (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'recommendations',
      header: 'Recommendations',
      render: (val) => (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'additional_notes',
      header: 'Additional Notes',
      render: (val) => (
        <div className="max-w-xs truncate" title={val}>
          {val || '-'}
        </div>
      ),
    },
    {
      accessor: 'created_at',
      header: 'Date',
      render: (val) => formatDate(val),
    },
    {
      accessor: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      exportable: false,
      render: (_, row) => (
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

  // Filter schools for assignment modal
  const filteredSchools = useMemo(() => {
    const search = schoolSearch.toLowerCase();
    return unassignedSchools.filter(s => 
      s.name?.toLowerCase().includes(search) ||
      s.code?.toLowerCase().includes(search) ||
      s.route_name?.toLowerCase().includes(search) ||
      s.lga?.toLowerCase().includes(search)
    ).slice(0, 50);
  }, [unassignedSchools, schoolSearch]);

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
                  keyField="id"
                  sortable
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
                  keyField="id"
                  sortable
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
      <Dialog
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Monitoring"
        width="xl"
      >
        <div className="space-y-4">
          {/* Monitoring Type - First, to filter available schools */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monitoring Type *
            </label>
            <Select
              value={assignForm.monitoring_type}
              onChange={(e) => {
                const newType = e.target.value;
                setAssignForm({ ...assignForm, monitoring_type: newType, school_ids: [] });
                fetchUnassignedSchools(newType);
              }}
            >
              <option value="school_evaluation">School Evaluation</option>
              <option value="supervision_evaluation">Supervision Evaluation</option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Schools can have one assignment per monitoring type. Changing this will update available schools.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Monitor *
            </label>
            <SearchableSelect
              options={monitors}
              value={assignForm.monitor_id}
              onChange={(val) => setAssignForm({ ...assignForm, monitor_id: val })}
              placeholder="Select a monitor..."
              searchPlaceholder="Search monitors..."
              getOptionValue={(opt) => opt.id.toString()}
              getOptionLabel={(opt) => opt.name}
              renderOption={(opt, { isSelected }) => (
                <div>
                  <div className={`font-medium ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
                    {opt.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {opt.rank_name || 'No rank'} • {opt.current_assignments || 0} assignments
                  </div>
                </div>
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Schools * ({assignForm.school_ids.length} selected)
            </label>
            {loadingSchools ? (
              <div className="border rounded-lg p-6 text-center bg-gray-50">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading available schools...</p>
              </div>
            ) : unassignedSchools.length === 0 ? (
              <div className="border rounded-lg p-6 text-center bg-gray-50">
                <IconSchool className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 font-medium">All schools are assigned</p>
                <p className="text-sm text-gray-500">
                  Every school has already been assigned for {assignForm.monitoring_type === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation'} this session.
                </p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 mb-2"
                  placeholder="Search schools..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                />
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {filteredSchools.map(school => (
                    <label
                      key={school.id}
                      className={`flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                        assignForm.school_ids.includes(school.id.toString()) ? 'bg-primary-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={assignForm.school_ids.includes(school.id.toString())}
                        onChange={(e) => {
                          const id = school.id.toString();
                          if (e.target.checked) {
                            setAssignForm({ ...assignForm, school_ids: [...assignForm.school_ids, id] });
                          } else {
                            setAssignForm({ ...assignForm, school_ids: assignForm.school_ids.filter(s => s !== id) });
                          }
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{school.name}</div>
                        <div className="text-xs text-gray-500">
                          {school.code && <span className="font-semibold text-primary-800">{school.code}</span>}
                          {school.code && ' • '}
                          {school.route_name || 'No route'}
                          {(school.lga || school.state) && ' • '}
                          {school.lga}{school.lga && school.state && ', '}{school.state}
                          <br />
                          {school.address || 'No address'}
                        </div>
                      </div>
                    </label>
                  ))}
                  {filteredSchools.length === 0 && schoolSearch && (
                    <div className="p-4 text-center text-gray-500">No schools found matching your search</div>
                  )}
                </div>
                {assignForm.school_ids.length > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-500">
                      {assignForm.school_ids.length} school(s) selected
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-sm text-red-500 hover:text-red-700"
                      onClick={() => setAssignForm({ ...assignForm, school_ids: [] })}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowAssignModal(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAssignment}
              loading={processing}
              disabled={unassignedSchools.length === 0 || loadingSchools}
            >
              Create Assignments
            </Button>
          </div>
        </div>
      </Dialog>

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
