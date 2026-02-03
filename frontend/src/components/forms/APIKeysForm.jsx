/**
 * API Keys Form Component
 *
 * Manages SSO partner credentials for third-party integration.
 * Used in EditInstitutionPage as a tab.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createSettingsApi } from '../../api/settings';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  IconKey,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconExternalLink,
  IconAlertTriangle,
  IconHistory,
  IconChartBar,
  IconPlus,
} from '@tabler/icons-react';

export default function APIKeysForm({ institutionId, onToast }) {
  // Create API instance bound to the institution
  const api = useMemo(() => {
    if (!institutionId) return null;
    return createSettingsApi(institutionId);
  }, [institutionId]);

  // Get base URL for docs (strip subdomain for main domain)
  const docsUrl = useMemo(() => {
    const { protocol, hostname, port } = window.location;
    // Remove subdomain - get the main domain
    const parts = hostname.split('.');
    // Handle localhost with subdomain (e.g., admin.localhost) or production subdomains
    let mainDomain;
    if (hostname.includes('localhost')) {
      mainDomain = 'localhost';
    } else if (parts.length > 2) {
      // Production: admin.example.com -> example.com
      mainDomain = parts.slice(-2).join('.');
    } else {
      mainDomain = hostname;
    }
    const portPart = port ? `:${port}` : '';
    return `${protocol}//${mainDomain}${portPart}/docs`;
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [institutionCode, setInstitutionCode] = useState('');
  const [ssoEndpoint, setSsoEndpoint] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [newSecretKey, setNewSecretKey] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingSSO, setIsTogglingSSO] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    if (!institutionId || !api) return;

    try {
      setIsLoading(true);
      const res = await api.getApiKeys();
      const data = res?.data?.data || res?.data;

      setSsoEnabled(data.ssoEnabled || false);
      setInstitutionCode(data.institutionCode || '');
      setSsoEndpoint(data.ssoEndpoint || '');
      // Store partner data, using secretKey from backend
      if (data.partner) {
        setApiKeys({
          ...data.partner,
          secretKey: data.partner.secretKey || '',
        });
      } else {
        setApiKeys(null);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      onToast?.('Failed to load API keys', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [institutionId, api, onToast]);

  const fetchLogs = useCallback(async () => {
    if (!institutionId || !api) return;

    try {
      setLogsLoading(true);
      const [logsRes, statsRes] = await Promise.all([
        api.getSSOLogs({ limit: 20 }),
        api.getSSOStats(),
      ]);

      setLogs(logsRes?.data?.data || []);
      setStats(statsRes?.data?.data?.summary || null);
    } catch (error) {
      console.error('Failed to fetch SSO logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [institutionId, api]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  useEffect(() => {
    if (showLogs) {
      fetchLogs();
    }
  }, [showLogs, fetchLogs]);

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      onToast?.('Copied to clipboard', 'success');
    } catch {
      onToast?.('Failed to copy', 'error');
    }
  };

  const handleCreate = async () => {
    if (!api) {
      onToast?.('Institution not selected', 'error');
      return;
    }
    try {
      setIsCreating(true);
      const res = await api.createApiKeys({
        name: `${institutionCode} SSO Integration`,
      });

      const data = res?.data?.data || res?.data;
      setNewSecretKey(data.secretKey);
      setApiKeys({
        partnerId: data.partnerId,
        secretKey: data.secretKey,
        isEnabled: true,
      });
      setSsoEnabled(true);

      onToast?.('API credentials created successfully', 'success');
    } catch (error) {
      console.error('Failed to create API keys:', error);
      onToast?.(error.response?.data?.message || 'Failed to create API credentials', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!api) return;
    try {
      setIsRegenerating(true);
      const res = await api.regenerateSecretKey();

      const data = res?.data?.data || res?.data;
      setNewSecretKey(data.secretKey);
      setApiKeys((prev) => ({
        ...prev,
        secretKey: data.secretKey,
      }));

      setShowRegenerateConfirm(false);
      onToast?.('Secret key regenerated successfully', 'success');
    } catch (error) {
      console.error('Failed to regenerate secret key:', error);
      onToast?.(error.response?.data?.message || 'Failed to regenerate secret key', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleToggleSSO = async () => {
    if (!api) return;
    try {
      setIsTogglingSSO(true);
      const newValue = !ssoEnabled;
      await api.toggleSSO(newValue);

      setSsoEnabled(newValue);
      setApiKeys((prev) => (prev ? { ...prev, isEnabled: newValue } : null));

      onToast?.(`SSO ${newValue ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch (error) {
      console.error('Failed to toggle SSO:', error);
      onToast?.(error.response?.data?.message || 'Failed to toggle SSO', 'error');
    } finally {
      setIsTogglingSSO(false);
    }
  };

  const handleDelete = async () => {
    if (!api) return;
    try {
      setIsDeleting(true);
      await api.deleteApiKeys();

      setApiKeys(null);
      setSsoEnabled(false);
      setNewSecretKey(null);
      setShowDeleteConfirm(false);

      onToast?.('API credentials deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete API keys:', error);
      onToast?.(error.response?.data?.message || 'Failed to delete API credentials', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Secret Key Alert */}
      {newSecretKey && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <IconAlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800">Save Your Secret Key</h4>
                <div className="flex items-center gap-2 bg-white rounded-lg p-3 border border-amber-200">
                  <code className="flex-1 text-sm font-mono break-all">{newSecretKey}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(newSecretKey, 'newSecret')}
                  >
                    {copiedField === 'newSecret' ? (
                      <IconCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setNewSecretKey(null)}
                >
                  I've saved the key
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <IconKey className="h-5 w-5" />
            API Keys / SSO Integration
          </CardTitle>
          <div className="flex items-center gap-2">
            {apiKeys && (
              <Badge variant={ssoEnabled ? 'success' : 'secondary'}>
                {ssoEnabled ? 'SSO Enabled' : 'SSO Disabled'}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(docsUrl, '_blank')}
            >
              <IconExternalLink className="h-4 w-4 mr-1" />
              View Documentation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!apiKeys ? (
            // No credentials yet
            <div className="text-center py-8">
              <IconKey className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No API Credentials
              </h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Create API credentials to enable SSO integration with your existing Student
                Management System.
              </p>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Creating...
                  </>
                ) : (
                  <>
                    <IconPlus className="h-4 w-4 mr-2" />
                    Create API Credentials
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Show credentials
            <div className="space-y-4">
              {/* SSO Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">SSO Integration Status</h4>
                  <p className="text-sm text-gray-500">
                    {ssoEnabled
                      ? 'SSO is enabled. Users can log in via partner systems.'
                      : 'SSO is disabled. Only normal login is available.'}
                  </p>
                </div>
                <Button
                  variant={ssoEnabled ? 'outline' : 'primary'}
                  onClick={handleToggleSSO}
                  disabled={isTogglingSSO}
                >
                  {isTogglingSSO ? 'Updating...' : ssoEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>

              {/* Partner ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Partner ID
                </label>
                <div className="flex items-center gap-2">
                  <Input value={apiKeys.partnerId || ''} readOnly className="font-mono" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(apiKeys.partnerId, 'partnerId')}
                  >
                    {copiedField === 'partnerId' ? (
                      <IconCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Secret Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Key
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={
                      showSecretKey
                        ? (newSecretKey || apiKeys.secretKey || '')
                        : '•'.repeat(64)
                    }
                    readOnly
                    className="font-mono"
                    type="text"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    title={showSecretKey ? 'Hide secret key' : 'Show secret key'}
                  >
                    {showSecretKey ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(
                      newSecretKey || apiKeys.secretKey || '',
                      'secretKey'
                    )}
                    title="Copy secret key"
                  >
                    {copiedField === 'secretKey' ? (
                      <IconCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Institution Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution Code
                </label>
                <div className="flex items-center gap-2">
                  <Input value={institutionCode} readOnly className="font-mono" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(institutionCode, 'code')}
                  >
                    {copiedField === 'code' ? (
                      <IconCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* SSO Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SSO Endpoint
                </label>
                <div className="flex items-center gap-2">
                  <Input value={ssoEndpoint} readOnly className="font-mono text-sm" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(ssoEndpoint, 'endpoint')}
                  >
                    {copiedField === 'endpoint' ? (
                      <IconCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowRegenerateConfirm(true)}
                  disabled={isRegenerating}
                >
                  <IconRefresh className="h-4 w-4 mr-2" />
                  Regenerate Secret Key
                </Button>
                <Button variant="outline" onClick={() => setShowLogs(!showLogs)}>
                  <IconHistory className="h-4 w-4 mr-2" />
                  {showLogs ? 'Hide Logs' : 'View SSO Logs'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <IconTrash className="h-4 w-4 mr-2" />
                  Delete Credentials
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SSO Logs */}
      {showLogs && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <IconHistory className="h-5 w-5" />
              SSO Login Logs
            </CardTitle>
            {stats && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <IconChartBar className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Last 30 days:</span>
                </div>
                <Badge variant="success">{stats.successful || 0} successful</Badge>
                <Badge variant="danger">{stats.failed || 0} failed</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="text-center py-4">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No SSO login attempts yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        IP Address
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                          {log.identifier}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant={log.user_type === 'student' ? 'info' : 'secondary'}>
                            {log.user_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant={log.status === 'success' ? 'success' : 'danger'}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                          {log.ip_address || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600">
                          {log.error_code || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Regenerate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        onConfirm={handleRegenerate}
        title="Regenerate Secret Key?"
        message="This will invalidate all existing SSO tokens. Partner systems will need to be updated with the new secret key."
        confirmText={isRegenerating ? 'Regenerating...' : 'Regenerate'}
        variant="warning"
        loading={isRegenerating}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete API Credentials?"
        message="This will permanently delete the API credentials and disable SSO for this institution. Partner systems will no longer be able to authenticate users."
        confirmText={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
