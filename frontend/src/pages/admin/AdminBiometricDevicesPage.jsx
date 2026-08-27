/**
 * Admin Biometric Devices Page
 *
 * Head of TP+ only. Lists supervisors' enrolled fingerprint/face devices
 * (WebAuthn platform authenticators) used to gate location check-ins, and
 * lets an admin revoke a device (lost/compromised phone, offboarding).
 * Device management is intentionally centralized here rather than
 * self-service - supervisors can only enroll, not revoke, their own device.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { biometricApi, usersApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import {
  IconFingerprint,
  IconFingerprintOff,
  IconRefresh,
  IconUser,
  IconTrash,
  IconLoader2,
  IconShieldX,
  IconDeviceMobile,
  IconDeviceMobileOff,
} from '@tabler/icons-react';
import { formatDate } from '../../utils/helpers';

function AdminBiometricDevicesPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [includeRevoked, setIncludeRevoked] = useState(false);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [revoking, setRevoking] = useState(false);

  // Exemptions - for supervisors with no WebAuthn-capable device
  const [exemptions, setExemptions] = useState([]);
  const [exemptionsLoading, setExemptionsLoading] = useState(true);
  const [exemptDialogOpen, setExemptDialogOpen] = useState(false);
  const [selectedSupervisorForExemption, setSelectedSupervisorForExemption] = useState(null);
  const [exemptReason, setExemptReason] = useState('');
  const [savingExemption, setSavingExemption] = useState(false);

  const fetchSupervisors = useCallback(async () => {
    try {
      const response = await usersApi.getAll({ role: 'supervisor', limit: 500 });
      setSupervisors(response.data.data || []);
    } catch (err) {
      console.error('Failed to load supervisors:', err);
    }
  }, []);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const params = { include_revoked: includeRevoked ? 'true' : 'false' };
      if (selectedSupervisor) params.supervisor_id = selectedSupervisor;

      const response = await biometricApi.adminListCredentials(params);
      setCredentials(response.data.data || []);
    } catch (err) {
      console.error('Failed to load biometric devices:', err);
      toast.error(err.response?.data?.message || 'Failed to load biometric devices');
    } finally {
      setLoading(false);
    }
  }, [selectedSupervisor, includeRevoked, toast]);

  const fetchExemptions = useCallback(async () => {
    setExemptionsLoading(true);
    try {
      const response = await biometricApi.adminListExemptions();
      setExemptions(response.data.data || []);
    } catch (err) {
      console.error('Failed to load exemptions:', err);
      toast.error(err.response?.data?.message || 'Failed to load exemptions');
    } finally {
      setExemptionsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSupervisors();
  }, [fetchSupervisors]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  useEffect(() => {
    fetchExemptions();
  }, [fetchExemptions]);

  const handleRefresh = () => {
    fetchCredentials();
    fetchExemptions();
  };

  const handleOpenRevoke = (credential) => {
    setSelectedCredential(credential);
    setRevokeDialogOpen(true);
  };

  const handleRevoke = async () => {
    if (!selectedCredential) return;

    setRevoking(true);
    try {
      await biometricApi.adminRevokeCredential(selectedCredential.id);
      toast.success('Biometric device revoked. The supervisor must re-enroll before their next check-in.');
      setRevokeDialogOpen(false);
      fetchCredentials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revoke device');
    } finally {
      setRevoking(false);
    }
  };

  const handleOpenExempt = (supervisor) => {
    setSelectedSupervisorForExemption(supervisor);
    setExemptReason('');
    setExemptDialogOpen(true);
  };

  const handleGrantExemption = async () => {
    if (!selectedSupervisorForExemption || exemptReason.length < 10) {
      toast.error('Please provide a reason (at least 10 characters)');
      return;
    }

    setSavingExemption(true);
    try {
      await biometricApi.adminSetExemption(selectedSupervisorForExemption.supervisor_id, {
        exempt: true,
        reason: exemptReason,
      });
      toast.success('Supervisor exempted from biometric verification.');
      setExemptDialogOpen(false);
      fetchExemptions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to grant exemption');
    } finally {
      setSavingExemption(false);
    }
  };

  const handleRemoveExemption = async (supervisor) => {
    try {
      await biometricApi.adminSetExemption(supervisor.supervisor_id, { exempt: false });
      toast.success('Exemption removed.');
      fetchExemptions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove exemption');
    }
  };

  const stats = useMemo(
    () => ({
      total: credentials.length,
      active: credentials.filter((c) => !c.revoked_at).length,
      revoked: credentials.filter((c) => c.revoked_at).length,
    }),
    [credentials]
  );

  const columns = useMemo(
    () => [
      {
        accessor: 'supervisor_name',
        header: 'Supervisor',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            <IconUser className="h-4 w-4 text-gray-400" />
            <div>
              <p className="font-medium">{value}</p>
              <p className="text-xs text-gray-500">{row.supervisor_email}</p>
            </div>
          </div>
        ),
      },
      {
        accessor: 'device_label',
        header: 'Device',
        render: (value) => (
          <div className="flex items-center gap-2">
            <IconDeviceMobile className="h-4 w-4 text-gray-400" />
            <span>{value || 'Unlabeled device'}</span>
          </div>
        ),
      },
      {
        accessor: 'created_at',
        header: 'Enrolled',
        render: (value) => <span className="text-sm text-gray-500">{formatDate(value, 'datetime')}</span>,
      },
      {
        accessor: 'last_used_at',
        header: 'Last Used',
        render: (value) =>
          value ? (
            <span className="text-sm text-gray-500">{formatDate(value, 'datetime')}</span>
          ) : (
            <span className="text-sm text-gray-400">Never</span>
          ),
      },
      {
        accessor: 'revoked_at',
        header: 'Status',
        render: (value, row) =>
          value ? (
            <div>
              <Badge variant="danger" className="flex items-center gap-1 w-fit">
                <IconShieldX className="h-3 w-3" />
                Revoked
              </Badge>
              {row.revoked_by_name && (
                <p className="mt-1 text-xs text-gray-500">by {row.revoked_by_name}</p>
              )}
            </div>
          ) : (
            <Badge variant="success" className="flex items-center gap-1 w-fit">
              <IconFingerprint className="h-3 w-3" />
              Active
            </Badge>
          ),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        sortable: false,
        exportable: false,
        render: (_, row) =>
          !row.revoked_at && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenRevoke(row)}
              title="Revoke device"
            >
              <IconTrash className="h-4 w-4 text-red-600" />
            </Button>
          ),
      },
    ],
    []
  );

  const exemptionColumns = useMemo(
    () => [
      {
        accessor: 'supervisor_name',
        header: 'Supervisor',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            <IconUser className="h-4 w-4 text-gray-400" />
            <div>
              <p className="font-medium">{value}</p>
              <p className="text-xs text-gray-500">{row.supervisor_email}</p>
            </div>
          </div>
        ),
      },
      {
        accessor: 'biometric_exempt',
        header: 'Status',
        render: (value) =>
          value ? (
            <Badge variant="warning" className="flex items-center gap-1 w-fit">
              <IconFingerprintOff className="h-3 w-3" />
              Exempt
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1 w-fit">
              Not Exempt
            </Badge>
          ),
      },
      {
        accessor: 'biometric_exempt_reason',
        header: 'Reason',
        render: (value, row) =>
          row.biometric_exempt ? (
            <span className="text-sm text-gray-600">{value || '—'}</span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          ),
      },
      {
        accessor: 'biometric_exempt_set_at',
        header: 'Set',
        render: (value, row) =>
          row.biometric_exempt && value ? (
            <div className="text-sm text-gray-500">
              <p>{formatDate(value, 'datetime')}</p>
              {row.biometric_exempt_set_by_name && <p className="text-xs">by {row.biometric_exempt_set_by_name}</p>}
            </div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          ),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        sortable: false,
        exportable: false,
        render: (_, row) =>
          row.biometric_exempt ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleRemoveExemption(row)}
              title="Remove exemption"
            >
              <IconDeviceMobileOff className="h-4 w-4 text-gray-500" />
              <span className="ml-1 text-xs">Remove</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenExempt(row)}
              title="Exempt from biometric verification"
            >
              <IconFingerprintOff className="h-4 w-4 text-amber-600" />
              <span className="ml-1 text-xs">Exempt</span>
            </Button>
          ),
      },
    ],
    []
  );

  const supervisorOptions = supervisors.map((s) => ({
    value: s.id.toString(),
    label: s.name,
  }));

  const tableToolbar = (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="w-48">
        <SearchableSelect
          options={[{ value: 'all', label: 'All Supervisors' }, ...supervisorOptions]}
          value={selectedSupervisor || 'all'}
          onChange={(val) => setSelectedSupervisor(val === 'all' ? '' : val)}
          placeholder="Select Supervisor"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={includeRevoked}
          onChange={(e) => setIncludeRevoked(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm text-gray-700 whitespace-nowrap">Include revoked</span>
      </label>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biometric Devices</h1>
          <p className="mt-1 text-sm text-gray-500">
            Supervisors&apos; enrolled fingerprint/face devices used to confirm location check-ins
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
          <IconRefresh className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <IconFingerprint className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <IconFingerprint className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <IconShieldX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.revoked}</p>
                <p className="text-xs text-gray-500">Revoked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Devices Table */}
      <DataTable
        columns={columns}
        data={credentials}
        loading={loading}
        toolbar={tableToolbar}
        emptyMessage="No enrolled biometric devices found"
      />

      {/* Exemptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconFingerprintOff className="h-5 w-5 text-amber-600" />
            Biometric Exemptions
          </CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Supervisors with no fingerprint/face-capable device - their check-ins fall back to
            location and device-fingerprint checks only.
          </p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={exemptionColumns}
            data={exemptions}
            loading={exemptionsLoading}
            emptyMessage="No supervisors found"
          />
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        isOpen={revokeDialogOpen}
        onClose={() => setRevokeDialogOpen(false)}
        title="Revoke Biometric Device"
        width="md"
      >
        {selectedCredential && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="font-medium text-gray-900">{selectedCredential.supervisor_name}</p>
              <p className="text-sm text-gray-500">
                {selectedCredential.device_label || 'Unlabeled device'}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                This supervisor will not be able to verify their location until they enroll a new
                device with a fresh fingerprint or face scan.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setRevokeDialogOpen(false)} disabled={revoking}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRevoke} disabled={revoking}>
                {revoking ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Revoke Device
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Grant Exemption Dialog */}
      <Dialog
        isOpen={exemptDialogOpen}
        onClose={() => setExemptDialogOpen(false)}
        title="Exempt from Biometric Verification"
        width="md"
      >
        {selectedSupervisorForExemption && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="font-medium text-gray-900">
                {selectedSupervisorForExemption.supervisor_name}
              </p>
              <p className="text-sm text-gray-500">
                {selectedSupervisorForExemption.supervisor_email}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                This supervisor&apos;s check-ins will fall back to location and device-fingerprint
                checks only, without a fingerprint/face confirmation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="e.g. Supervisor has no smartphone (min 10 characters)..."
              />
              <p className="mt-1 text-xs text-gray-500">{exemptReason.length}/10 characters minimum</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setExemptDialogOpen(false)}
                disabled={savingExemption}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleGrantExemption}
                disabled={savingExemption || exemptReason.length < 10}
              >
                {savingExemption ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Grant Exemption
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default AdminBiometricDevicesPage;
