/**
 * Academic Sessions Management Page
 * Manage teaching practice sessions with configurations
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, getOrdinal } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconCalendar,
  IconPlus,
  IconPencil,
  IconTrash,
  IconLock,
  IconLockOpen,
  IconStar,
  IconSettings,
  IconClock,
  IconUsers,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

function SessionsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);
  const isSuperAdmin = hasRole(['super_admin']);

  // State
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);

  // Compute windows status from current session dates
  const windowsStatus = useMemo(() => {
    if (!currentSession) return null;
    
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Check if acceptance window is open
    const acceptanceStart = currentSession.acceptance_form_start_date;
    const acceptanceEnd = currentSession.acceptance_form_end_date;
    const acceptanceWindowOpen = acceptanceStart && acceptanceEnd 
      ? today >= acceptanceStart && today <= acceptanceEnd
      : false;
    
    // Check if posting letters are available
    const postingLetterDate = currentSession.posting_letter_available_date;
    const postingLettersAvailable = postingLetterDate ? today >= postingLetterDate : false;
    
    return {
      acceptanceWindowOpen,
      postingLettersAvailable,
    };
  }, [currentSession]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editSession, setEditSession] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Supervision timelines state
  const [supervisionTimelines, setSupervisionTimelines] = useState([]);
  const [loadingTimelines, setLoadingTimelines] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null, // 'delete' or 'setCurrent'
    sessionId: null,
    loading: false,
  });

  // Fetch data
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await sessionsApi.getAll();
      setSessions(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSession = async () => {
    try {
      const response = await sessionsApi.getCurrent();
      setCurrentSession(response.data.data || response.data || null);
    } catch (err) {
      // No current session is fine
      setCurrentSession(null);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchCurrentSession();
  }, []);

  // Modal handlers
  const getDefaultFormData = () => ({
    name: '',
    code: '',
    start_date: '',
    end_date: '',
    max_posting_per_supervisor: 15,
    max_students_per_school_per_program: 20,
    local_running_distance_km: 10,
    enable_grouping: true,
    max_students_per_group: 10,
    max_students_per_merged_group: 6,
    posting_letter_available_date: '',
    acceptance_form_start_date: '',
    acceptance_form_end_date: '',
    tp_start_date: '',
    tp_end_date: '',
    // Coordinator info
    coordinator_name: '',
    coordinator_phone: '',
    coordinator_email: '',
    tp_duration_weeks: 24,
    // Distance thresholds
    inside_distance_threshold_km: 10,
    max_supervision_visits: 3,
    // Scoring settings
    scoring_type: 'basic',
    // DSA settings
    dsa_enabled: false,
    dsa_min_distance_km: 11,
    dsa_max_distance_km: 30,
    dsa_percentage: 30,
    status: 'active',
  });

  const openCreateModal = () => {
    setEditSession(null);
    setFormData(getDefaultFormData());
    setSupervisionTimelines([]);
    setShowModal(true);
  };

  // Fetch supervision timelines for a session
  const fetchSupervisionTimelines = async (sessionId) => {
    setLoadingTimelines(true);
    try {
      const response = await sessionsApi.getSupervisionTimelines(sessionId);
      const data = response.data.data || response.data;
      const maxVisits = data.max_supervision_visits || 6;
      const existingTimelines = data.timelines || [];
      
      // Initialize with existing or default timelines
      const timelines = [];
      for (let i = 1; i <= maxVisits; i++) {
        const existing = existingTimelines.find(t => t.visit_number === i);
        timelines.push(existing || {
          visit_number: i,
          title: `${getOrdinal(i)} Visit`,
          start_date: '',
          end_date: '',
          description: '',
        });
      }
      setSupervisionTimelines(timelines);
    } catch (err) {
      console.error('Failed to load supervision timelines:', err);
      toast.error('Failed to load supervision timelines');
    } finally {
      setLoadingTimelines(false);
    }
  };

  const openEditModal = useCallback((session) => {
    setEditSession(session);
    // Format dates for input fields - with dateStrings:true in backend, dates come as "YYYY-MM-DD"
    const formatDateForInput = (dateStr) => {
      if (!dateStr) return '';
      // If it contains time component, extract just the date part
      return dateStr.includes(' ') ? dateStr.split(' ')[0] : dateStr;
    };
    setFormData({
      ...session,
      // Format dates for input fields
      start_date: formatDateForInput(session.start_date),
      end_date: formatDateForInput(session.end_date),
      posting_letter_available_date: formatDateForInput(session.posting_letter_available_date),
      acceptance_form_start_date: formatDateForInput(session.acceptance_form_start_date),
      acceptance_form_end_date: formatDateForInput(session.acceptance_form_end_date),
      tp_start_date: formatDateForInput(session.tp_start_date),
      tp_end_date: formatDateForInput(session.tp_end_date),
      // Convert MySQL tinyint (0/1) to boolean for checkboxes
      enable_grouping: session.enable_grouping === 1 || session.enable_grouping === true,
      dsa_enabled: session.dsa_enabled === 1 || session.dsa_enabled === true,
      is_current: session.is_current === 1 || session.is_current === true,
      is_locked: session.is_locked === 1 || session.is_locked === true,
    });
    // Fetch supervision timelines for this session
    if (session.id) {
      fetchSupervisionTimelines(session.id);
    }
    setShowModal(true);
  }, [toast]);

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Session name is required');
      return;
    }

    // Generate code from name if not provided (e.g., "2024/2025 First Semester" -> "2024-2025-1")
    const code = formData.code || formData.name.replace(/[\s\/]+/g, '-').toUpperCase().substring(0, 20);

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        code,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        max_posting_per_supervisor: parseInt(formData.max_posting_per_supervisor) || 15,
        max_students_per_school_per_program: parseInt(formData.max_students_per_school_per_program) || 20,
        local_running_distance_km: parseFloat(formData.local_running_distance_km) || 10,
        max_students_per_group: parseInt(formData.max_students_per_group) || 10,
        max_students_per_merged_group: parseInt(formData.max_students_per_merged_group) || 6,
        enable_grouping: formData.enable_grouping === true || formData.enable_grouping === 1,
        posting_letter_available_date: formData.posting_letter_available_date || null,
        acceptance_form_start_date: formData.acceptance_form_start_date || null,
        acceptance_form_end_date: formData.acceptance_form_end_date || null,
        tp_start_date: formData.tp_start_date || null,
        tp_end_date: formData.tp_end_date || null,
        // Coordinator info
        coordinator_name: formData.coordinator_name || null,
        coordinator_phone: formData.coordinator_phone || null,
        coordinator_email: formData.coordinator_email || null,
        tp_duration_weeks: parseInt(formData.tp_duration_weeks) || 24,
        // Distance thresholds
        inside_distance_threshold_km: parseFloat(formData.inside_distance_threshold_km) || 10,
        max_supervision_visits: parseInt(formData.max_supervision_visits) || 3,
        // Scoring settings
        scoring_type: formData.scoring_type || 'basic',
        // DSA settings - convert to proper booleans
        dsa_enabled: formData.dsa_enabled === true || formData.dsa_enabled === 1,
        dsa_min_distance_km: parseFloat(formData.dsa_min_distance_km) || 11,
        dsa_max_distance_km: parseFloat(formData.dsa_max_distance_km) || 30,
        dsa_percentage: parseFloat(formData.dsa_percentage) || 30,
        status: formData.status || 'active',
      };

      let sessionId = editSession?.id;
      if (editSession) {
        await sessionsApi.update(editSession.id, payload);
        toast.success('Session updated successfully');
      } else {
        const response = await sessionsApi.create(payload);
        sessionId = response.data.data?.id || response.data?.id;
        toast.success('Session created successfully');
      }

      // Save supervision timelines if session exists and timelines have data
      const validTimelines = supervisionTimelines.filter(t => t.start_date && t.end_date);
      if (sessionId && validTimelines.length > 0) {
        try {
          await sessionsApi.saveSupervisionTimelines(sessionId, validTimelines);
        } catch (err) {
          toast.error('Session saved but failed to save supervision timelines');
        }
      }

      setShowModal(false);
      fetchSessions();
      fetchCurrentSession();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async (id) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete',
      sessionId: id,
      loading: false,
    });
  }, []);

  const handleSetCurrent = useCallback(async (id) => {
    setConfirmDialog({
      isOpen: true,
      type: 'setCurrent',
      sessionId: id,
      loading: false,
    });
  }, []);

  const handleConfirmAction = async () => {
    const { type, sessionId } = confirmDialog;
    setConfirmDialog(prev => ({ ...prev, loading: true }));

    try {
      if (type === 'delete') {
        await sessionsApi.delete(sessionId);
        toast.success('Session deleted successfully');
        fetchSessions();
      } else if (type === 'setCurrent') {
        await sessionsApi.setCurrent(sessionId);
        toast.success('Current session updated');
        fetchSessions();
        fetchCurrentSession();
      }
      setConfirmDialog({ isOpen: false, type: null, sessionId: null, loading: false });
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${type === 'delete' ? 'delete session' : 'set current session'}`);
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const handleLock = useCallback(async (id) => {
    try {
      await sessionsApi.lock(id);
      toast.success('Session locked');
      fetchSessions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to lock session');
    }
  }, [toast]);

  const handleUnlock = useCallback(async (id) => {
    try {
      await sessionsApi.unlock(id);
      toast.success('Session unlocked');
      fetchSessions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unlock session');
    }
  }, [toast]);

  const getStatusBadge = (session) => {
    if (session.is_locked) {
      return <Badge variant="destructive">Locked</Badge>;
    }
    if (session.is_current) {
      return <Badge variant="success">Current</Badge>;
    }
    if (session.status === 'active') {
      return <Badge variant="secondary">Active</Badge>;
    }
    return <Badge variant="outline">{session.status}</Badge>;
  };

  const sessionsColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Session',
      sortable: true,
      render: (value, row) => {
        if (!row) return null;
        return (
          <div className="flex items-center gap-2">
            {row.is_current ? <IconStar className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : null}
            <div>
              <div className="font-medium text-gray-900">{row.name}</div>
              <div className="text-sm text-gray-500">{row.code}</div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (value, row) => {
        if (!row) return null;
        return (
          <div className="text-sm">
            <div>{formatDate(row.start_date)}</div>
            <div className="text-gray-500">to {formatDate(row.end_date)}</div>
          </div>
        );
      }
    },
    {
      key: 'settings',
      header: 'Settings',
      render: (value, row) => {
        if (!row) return null;
        return (
          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex items-center gap-2"><IconUsers className="w-3 h-3" />{row.max_students_per_school_per_program} per school</div>
            <div className="flex items-center gap-2"><IconSettings className="w-3 h-3" />{row.local_running_distance_km} km local</div>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (value, row) => row ? getStatusBadge(row) : null
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (value, row) => {
        if (!row || !canEdit) return null;
        return (
          <div className="flex items-center justify-end gap-1">
          {!row.is_current && (
            <Button variant="ghost" size="icon" onClick={() => handleSetCurrent(row.id)} title="Set as current">
              <IconStar className="w-4 h-4" />
            </Button>
          )}
          {isSuperAdmin && (
            row.is_locked ? (
              <Button variant="ghost" size="icon" onClick={() => handleUnlock(row.id)} title="Unlock">
                <IconLockOpen className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => handleLock(row.id)} title="Lock">
                <IconLock className="w-4 h-4" />
              </Button>
            )
          )}
          <Button variant="ghost" size="icon" onClick={() => openEditModal(row)} disabled={row.is_locked && !isSuperAdmin} title="Edit">
            <IconPencil className="w-4 h-4" />
          </Button>
          {isSuperAdmin && !row.is_current && (
            <Button variant="ghost" size="icon" onClick={() => handleDelete(row.id)} title="Delete">
              <IconTrash className="w-4 h-4" />
            </Button>
          )}
        </div>
        );
      }
    }
  ], [canEdit, isSuperAdmin, handleSetCurrent, handleUnlock, handleLock, openEditModal, handleDelete]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Academic Sessions</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage teaching practice sessions and configurations</p>
        </div>
        {canEdit && (
          <Button onClick={openCreateModal} size="sm" className="active:scale-95 flex-shrink-0">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Session</span>
          </Button>
        )}
      </div>

      {/* Current Session Status */}
      {currentSession && windowsStatus && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 pt-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <IconStar className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-sm text-gray-500">Current Session</p>
                  <p className="font-semibold text-xs sm:text-base truncate">{currentSession.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 pt-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  windowsStatus.acceptanceWindowOpen ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <IconCheck className={`w-4 h-4 sm:w-5 sm:h-5 ${
                    windowsStatus.acceptanceWindowOpen ? 'text-green-600' : 'text-gray-400'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Acceptance</p>
                  <p className="font-semibold text-xs sm:text-base">
                    {windowsStatus.acceptanceWindowOpen ? 'Open' : 'Closed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2 lg:col-span-1">
            <CardContent className="p-3 pt-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  windowsStatus.postingLettersAvailable ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <IconClock className={`w-4 h-4 sm:w-5 sm:h-5 ${
                    windowsStatus.postingLettersAvailable ? 'text-blue-600' : 'text-gray-400'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Posting Letters</p>
                  <p className="font-semibold text-xs sm:text-base">
                    {windowsStatus.postingLettersAvailable ? 'Available' : 'Not Available'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sessions List */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={sessions}
            columns={sessionsColumns}
            keyField="id"
            loading={loading}
            sortable
            exportable
            exportFilename="sessions"
            emptyIcon={IconCalendar}
            emptyTitle="No sessions found. Create your first session to get started."
          />
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editSession ? 'Edit Session' : 'New Session'}
        width="3xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editSession ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Session Name *
                  </label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., 2024/2025 First Semester"
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Session Code</label>
                  <Input
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g., 2024-2025-1"
                    className="text-sm"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Leave empty to auto-generate</p>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <Input
                    type="date"
                    value={formData.start_date || ''}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <Input
                    type="date"
                    value={formData.end_date || ''}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Posting Settings */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-sm sm:text-base mb-3 sm:mb-4 flex items-center gap-2">
                  <IconSettings className="w-4 h-4" />
                  Posting Settings
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Max Postings/Supervisor
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.max_posting_per_supervisor || 5}
                      onChange={(e) =>
                        setFormData({ ...formData, max_posting_per_supervisor: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Max Students/School/Program
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.max_students_per_school_per_program || 10}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_students_per_school_per_program: e.target.value,
                        })
                      }
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Local Distance (km)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.local_running_distance_km || 30}
                      onChange={(e) =>
                        setFormData({ ...formData, local_running_distance_km: e.target.value })
                      }
                      className="text-sm"
                    />
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                      Threshold for local schools
                    </p>
                  </div>
                </div>
              </div>

              {/* Grouping Settings */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <IconUsers className="w-4 h-4" />
                  Student Grouping
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="enable_grouping"
                    checked={formData.enable_grouping === true || formData.enable_grouping === 1}
                    onChange={(e) =>
                      setFormData({ ...formData, enable_grouping: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="enable_grouping" className="text-sm text-gray-700">
                    Enable student grouping
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(formData.enable_grouping === true || formData.enable_grouping === 1) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Students per Group
                      </label>
                      <Input
                        type="number"
                        min="2"
                        value={formData.max_students_per_group || 10}
                        onChange={(e) =>
                          setFormData({ ...formData, max_students_per_group: e.target.value })
                        }
                      />
                    </div>
                  )}

                  {(formData.enable_grouping === true || formData.enable_grouping === 1) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Students per Merged Group
                      </label>
                      <Input
                        type="number"
                        min="2"
                        max="15"
                        value={formData.max_students_per_merged_group || 6}
                        onChange={(e) =>
                          setFormData({ ...formData, max_students_per_merged_group: e.target.value })
                        }
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Maximum students when merging routes
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Date Windows */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <IconClock className="w-4 h-4" />
                  Important Dates
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Acceptance Start Date
                    </label>
                    <Input
                      type="date"
                      value={formData.acceptance_form_start_date || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, acceptance_form_start_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Acceptance End Date
                    </label>
                    <Input
                      type="date"
                      value={formData.acceptance_form_end_date || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, acceptance_form_end_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TP Start Date
                    </label>
                    <Input
                      type="date"
                      value={formData.tp_start_date || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, tp_start_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TP End Date
                    </label>
                    <Input
                      type="date"
                      value={formData.tp_end_date || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, tp_end_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Posting Letters Available From
                    </label>
                    <Input
                      type="date"
                      value={formData.posting_letter_available_date || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, posting_letter_available_date: e.target.value })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Date when students can download their posting letters
                    </p>
                  </div>
                </div>
              </div>

              {/* Coordinator Information */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <IconUsers className="w-4 h-4" />
                  TP Coordinator Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coordinator Name
                    </label>
                    <Input
                      value={formData.coordinator_name || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, coordinator_name: e.target.value })
                      }
                      placeholder="Dr. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coordinator Phone
                    </label>
                    <Input
                      value={formData.coordinator_phone || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, coordinator_phone: e.target.value })
                      }
                      placeholder="+234..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coordinator Email
                    </label>
                    <Input
                      type="email"
                      value={formData.coordinator_email || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, coordinator_email: e.target.value })
                      }
                      placeholder="coordinator@university.edu.ng"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TP Duration (Weeks)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="52"
                      value={formData.tp_duration_weeks || 12}
                      onChange={(e) =>
                        setFormData({ ...formData, tp_duration_weeks: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Supervision Visits
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={formData.max_supervision_visits || 3}
                      onChange={(e) =>
                        setFormData({ ...formData, max_supervision_visits: e.target.value })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">Per student</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Scoring Mode
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      value={formData.scoring_type || 'basic'}
                      onChange={(e) =>
                        setFormData({ ...formData, scoring_type: e.target.value })
                      }
                    >
                      <option value="basic">Basic (Single Score)</option>
                      <option value="advanced">Advanced (Criteria-based)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">How supervisors enter scores</p>
                  </div>
                </div>
              </div>

              {/* Supervision Visit Timelines */}
              {editSession && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <IconCalendar className="w-4 h-4" />
                    Supervision Visit Timelines
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Set the start and end dates for each supervision visit based on the Max Supervision Visits ({formData.max_supervision_visits || 3}).
                  </p>
                  
                  {loadingTimelines ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Array.from({ length: parseInt(formData.max_supervision_visits) || 6 }).map((_, idx) => {
                        const visitNum = idx + 1;
                        const timeline = supervisionTimelines.find(t => t.visit_number === visitNum) || {
                          visit_number: visitNum,
                          title: `${getOrdinal(visitNum)} Visit`,
                          start_date: '',
                          end_date: '',
                          description: '',
                        };
                        
                        return (
                          <div key={visitNum} className="border rounded-lg p-3 bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  {getOrdinal(visitNum)} Visit Title
                                </label>
                                <Input
                                  value={timeline.title || `${getOrdinal(visitNum)} Visit`}
                                  onChange={(e) => {
                                    const updated = [...supervisionTimelines];
                                    const idx = updated.findIndex(t => t.visit_number === visitNum);
                                    if (idx >= 0) {
                                      updated[idx] = { ...updated[idx], title: e.target.value };
                                    } else {
                                      updated.push({ ...timeline, title: e.target.value });
                                    }
                                    setSupervisionTimelines(updated);
                                  }}
                                  placeholder={`${getOrdinal(visitNum)} Visit`}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Start Date
                                </label>
                                <Input
                                  type="date"
                                  value={timeline.start_date || ''}
                                  onChange={(e) => {
                                    const updated = [...supervisionTimelines];
                                    const idx = updated.findIndex(t => t.visit_number === visitNum);
                                    if (idx >= 0) {
                                      updated[idx] = { ...updated[idx], start_date: e.target.value };
                                    } else {
                                      updated.push({ ...timeline, start_date: e.target.value });
                                    }
                                    setSupervisionTimelines(updated);
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  End Date
                                </label>
                                <Input
                                  type="date"
                                  value={timeline.end_date || ''}
                                  onChange={(e) => {
                                    const updated = [...supervisionTimelines];
                                    const idx = updated.findIndex(t => t.visit_number === visitNum);
                                    if (idx >= 0) {
                                      updated[idx] = { ...updated[idx], end_date: e.target.value };
                                    } else {
                                      updated.push({ ...timeline, end_date: e.target.value });
                                    }
                                    setSupervisionTimelines(updated);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Distance & Allowance Settings */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <IconSettings className="w-4 h-4" />
                  Distance & Allowance Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inside Distance Threshold (km)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.inside_distance_threshold_km || 10}
                      onChange={(e) =>
                        setFormData({ ...formData, inside_distance_threshold_km: e.target.value })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">Schools within this distance are &quot;Inside&quot;</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 my-3">
                      <input
                        type="checkbox"
                        id="dsa_enabled"
                        checked={formData.dsa_enabled === true || formData.dsa_enabled === 1}
                        onChange={(e) =>
                          setFormData({ ...formData, dsa_enabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <label htmlFor="dsa_enabled" className="text-sm text-gray-700">
                        Enable DSA (Daily Subsistence Allowance) for mid-range distances
                      </label>
                    </div>
                  </div>

                  {(formData.dsa_enabled === true || formData.dsa_enabled === 1) && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DSA Min Distance (km)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.dsa_min_distance_km || 11}
                          onChange={(e) =>
                            setFormData({ ...formData, dsa_min_distance_km: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DSA Max Distance (km)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.dsa_max_distance_km || 30}
                          onChange={(e) =>
                            setFormData({ ...formData, dsa_max_distance_km: e.target.value })
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">Beyond this, full DTA applies</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DSA Percentage of DTA
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.dsa_percentage || 50}
                          onChange={(e) =>
                            setFormData({ ...formData, dsa_percentage: e.target.value })
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">e.g., 50% of DTA</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
        </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, sessionId: null, loading: false })}
        onConfirm={handleConfirmAction}
        title={confirmDialog.type === 'delete' ? 'Delete Session' : 'Set Current Session'}
        message={
          confirmDialog.type === 'delete'
            ? 'Are you sure you want to delete this session? This action cannot be undone.'
            : 'Set this as the current active session? All operations will use this session by default.'
        }
        confirmText={confirmDialog.type === 'delete' ? 'Delete' : 'Set Current'}
        variant={confirmDialog.type === 'delete' ? 'danger' : 'warning'}
        loading={confirmDialog.loading}
      />
    </div>
  );
}

export default SessionsPage;
