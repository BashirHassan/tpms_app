/**
 * Auto-Post Dialog Component
 * 
 * Dialog for configuring and executing automated supervisor posting
 * with preview functionality and configurable criteria:
 * - Number of postings per supervisor
 * - Posting type (random, route-based, LGA-based)
 * - Priority-based distribution
 * 
 * Round-Robin Distribution:
 * - Visits are exhausted in order (all Visit 1s before Visit 2s, etc.)
 * - Schools are distributed serially within each visit round
 * - Supervisors are assigned round-robin across all slots
 * 
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */

import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { Switch } from './forms/InstitutionFormSections';
import { autoPostingApi } from '../api';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/helpers';
import {
  IconWand,
  IconLoader2,
  IconAlertTriangle,
  IconCheck,
  IconArrowLeft,
  IconRefresh,
  IconUsers,
  IconBuildingBank as IconSchool,
  IconRoute,
} from '@tabler/icons-react';

const POSTING_TYPES = [
  { 
    value: 'random', 
    label: 'Random Locations', 
    description: 'Distribute supervisors to any available schools regardless of location',
    icon: IconUsers,
  },
  { 
    value: 'route_based', 
    label: 'Route Based', 
    description: 'Each visit stays within one route (e.g., all Visit 1 schools in same route)',
    icon: IconRoute,
  },
  { 
    value: 'lga_based', 
    label: 'LGA Based', 
    description: 'Each visit stays within one LGA (e.g., all Visit 1 schools in same LGA)',
    icon: IconSchool,
  },
];

/**
 * Auto-Post Dialog for configuring and executing automated supervisor posting
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {function} props.onClose - Function to close the dialog
 * @param {number} props.sessionId - Selected session ID
 * @param {number} props.maxVisits - Maximum supervision visits from session
 * @param {function} props.onComplete - Callback when auto-posting completes successfully
 * @param {number} [props.facultyId] - Optional faculty ID for dean filtering
 */
function AutoPostDialog({ 
  open, 
  onClose, 
  sessionId, 
  maxVisits = 3, 
  onComplete,
  facultyId = null,
}) {
  const { showToast } = useToast();

  // Form state
  const [numberOfPostings, setNumberOfPostings] = useState(1);
  const [postingType, setPostingType] = useState('random');
  const [priorityEnabled, setPriorityEnabled] = useState(true);
  
  // UI state
  const [step, setStep] = useState('configure'); // 'configure' | 'preview' | 'success'
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData] = useState(null);

  // Reset state when dialog closes
  const handleClose = () => {
    setStep('configure');
    setPreviewData(null);
    setResultData(null);
    setNumberOfPostings(1);
    setPostingType('random');
    setPriorityEnabled(true);
    onClose();
  };

  // Generate preview
  const handlePreview = async () => {
    if (!sessionId) {
      showToast('error', 'Please select a session first');
      return;
    }

    setLoading(true);
    try {
      const response = await autoPostingApi.preview({
        session_id: sessionId,
        number_of_postings: numberOfPostings,
        posting_type: postingType,
        priority_enabled: priorityEnabled,
        faculty_id: facultyId,
      });

      setPreviewData(response.data?.data || response.data);
      setStep('preview');
    } catch (error) {
      showToast('error', error.response?.data?.message || error.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  // Execute auto-posting
  const handleExecute = async () => {
    setLoading(true);
    try {
      const response = await autoPostingApi.execute({
        session_id: sessionId,
        number_of_postings: numberOfPostings,
        posting_type: postingType,
        priority_enabled: priorityEnabled,
        faculty_id: facultyId,
      });

      const data = response.data?.data || response.data;
      setResultData(data);
      setStep('success');
      showToast('success', `Created ${data.total_postings_created} postings for ${data.total_supervisors} supervisors`);
      onComplete?.(data);
    } catch (error) {
      showToast('error', error.response?.data?.message || error.message || 'Failed to execute auto-posting');
    } finally {
      setLoading(false);
    }
  };

  // Render configuration step
  const renderConfigureStep = () => (
    <div className="space-y-6">
      {/* Visits to Include */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Visits to Include
        </label>
        <Select
          value={numberOfPostings}
          onChange={(e) => setNumberOfPostings(parseInt(e.target.value))}
          className="w-full"
        >
          {Array.from({ length: maxVisits }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>
              {n === 1 ? 'Visit 1 only' : `Visits 1 through ${n}`}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-500">
          Maximum visits per session: {maxVisits}. All available slots for selected visits will be distributed fairly among supervisors.
        </p>
      </div>

      {/* Posting Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Posting Distribution Type
        </label>
        <div className="grid gap-3">
          {POSTING_TYPES.map(type => {
            const Icon = type.icon;
            return (
              <label
                key={type.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  postingType === type.value 
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' 
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="postingType"
                  value={type.value}
                  checked={postingType === type.value}
                  onChange={(e) => setPostingType(e.target.value)}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-900">{type.label}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{type.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Priority Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-900">
            Enable Priority Posting
          </label>
          <p className="text-sm text-gray-500 mt-0.5">
            Higher ranked supervisors (Chief Lecturers, etc.) get posted first and assigned to schools with longest distances
          </p>
        </div>
        <Switch
          checked={priorityEnabled}
          onCheckedChange={setPriorityEnabled}
        />
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <IconWand className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Auto-Posting Works</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>All Visit 1 slots are filled first, then Visit 2, and so on (round-robin by visit)</li>
              <li>Schools are distributed serially within each visit round</li>
              <li>Supervisors are assigned round-robin - each gets 1 posting before any gets 2</li>
              <li>Only schools with students (in groups) are considered</li>
              <li>Existing postings are preserved - only available slots are used</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Render preview step
  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* Visits info banner */}
      {previewData?.visits_included && (
        <div className="px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700">
          Showing results for: <span className="font-medium">
            {previewData.visits_included === 1 ? 'Visit 1 only' : `Visits 1 through ${previewData.visits_included}`}
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg text-center border border-blue-100">
          <div className="text-2xl font-bold text-blue-700">
            {previewData?.total_supervisors || 0}
          </div>
          <div className="text-sm text-blue-600">Eligible Supervisors</div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg text-center border border-green-100">
          <div className="text-2xl font-bold text-green-700">
            {previewData?.assignments?.length || 0}
          </div>
          <div className="text-sm text-green-600">Postings to Create</div>
        </div>
        <div className="p-4 bg-orange-50 rounded-lg text-center border border-orange-100">
          <div className="text-2xl font-bold text-orange-700">
            {previewData?.total_available_slots || 0}
          </div>
          <div className="text-sm text-orange-600">
            Available Slots
            {previewData?.visits_included && previewData.visits_included > 1 && (
              <span className="text-xs block text-orange-500">
                (Visit 1-{previewData.visits_included})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      {previewData?.statistics && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Distribution Summary</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="success">{previewData.statistics.supervisors_full}</Badge>
              <span className="text-gray-700">Will receive postings</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">{previewData.statistics.avg_postings_per_supervisor || Math.round((previewData.assignments?.length || 0) / (previewData.statistics.supervisors_full || 1))}</Badge>
              <span className="text-gray-700">Avg per supervisor</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="error">{previewData.statistics.supervisors_none}</Badge>
              <span className="text-gray-700">No postings</span>
            </div>
          </div>

          {/* By visit breakdown */}
          {previewData.statistics.by_visit && Object.keys(previewData.statistics.by_visit).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Postings by Visit</h5>
              <div className="flex flex-wrap gap-2">
                {Object.entries(previewData.statistics.by_visit).map(([visitKey, count]) => {
                  // Extract visit number from key like "visit_1" -> "1"
                  const visitNum = visitKey.replace('visit_', '');
                  return (
                    <div key={visitKey} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm">
                      Visit {visitNum}: <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {previewData?.warnings?.length > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
            <IconAlertTriangle className="h-4 w-4" />
            Warnings ({previewData.warnings.length})
          </div>
          <ul className="text-sm text-yellow-600 list-disc list-inside max-h-32 overflow-y-auto">
            {previewData.warnings.slice(0, 10).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {previewData.warnings.length > 10 && (
              <li className="text-yellow-500 italic">...and {previewData.warnings.length - 10} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Sample assignments */}
      {previewData?.assignments?.length > 0 && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">
            Sample Assignments (showing first 5)
          </h4>
          <div className="space-y-2 text-sm">
            {previewData.assignments.slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.supervisor_name}</span>
                  {a.rank_code && (
                    <Badge variant="primary">{a.rank_code}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="truncate max-w-[180px]" title={a.school_name}>{a.school_name}</span>
                  <Badge variant="secondary">G{a.group_number}</Badge>
                  <Badge variant="default">V{a.visit_number}</Badge>
                  <span className="text-gray-400">{a.distance_km?.toFixed(1)} km</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No assignments warning */}
      {(!previewData?.assignments || previewData.assignments.length === 0) && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
          <IconAlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h4 className="font-medium text-red-800 mb-1">No Assignments Possible</h4>
          <p className="text-sm text-red-600">
            There are no valid assignments that can be made. This could be because:
          </p>
          <ul className="text-sm text-red-600 mt-2 list-disc list-inside">
            <li>No available school slots (all visits assigned)</li>
            <li>No eligible supervisors (all at max postings)</li>
            <li>No schools with student groups</li>
          </ul>
        </div>
      )}

      {/* Back button */}
      <Button variant="outline" onClick={() => setStep('configure')} className="mt-2">
        <IconArrowLeft className="h-4 w-4 mr-2" />
        Back to Settings
      </Button>
    </div>
  );

  // Render success step
  const renderSuccessStep = () => (
    <div className="space-y-4">
      {/* Success message */}
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <IconCheck className="h-6 w-6 text-green-600" />
        </div>
        <h4 className="text-lg font-medium text-green-800 mb-1">Auto-Posting Complete!</h4>
        <p className="text-green-600">
          Successfully created {resultData?.total_postings_created || 0} postings 
          for {resultData?.total_supervisors || 0} supervisors
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-500">Batch ID</div>
          <div className="text-lg font-semibold text-gray-900">#{resultData?.batch_id}</div>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-500">Total Postings</div>
          <div className="text-lg font-semibold text-gray-900">{resultData?.total_postings_created}</div>
        </div>
      </div>

      {/* Statistics */}
      {resultData?.statistics && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Final Distribution</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="success">{resultData.statistics.supervisors_full}</Badge>
              <span className="text-gray-700">Supervisors posted</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">{resultData.statistics.avg_postings_per_supervisor || Math.round((resultData?.total_postings_created || 0) / (resultData.statistics.supervisors_full || 1))}</Badge>
              <span className="text-gray-700">Avg per supervisor</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="error">{resultData.statistics.supervisors_none}</Badge>
              <span className="text-gray-700">Not posted</span>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {resultData?.warnings?.length > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
            <IconAlertTriangle className="h-4 w-4" />
            Notes
          </div>
          <ul className="text-sm text-yellow-600 list-disc list-inside">
            {resultData.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Info about rollback */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <strong>Tip:</strong> You can undo this operation by rolling back Batch #{resultData?.batch_id} from the auto-posting history.
      </div>
    </div>
  );

  // Footer buttons based on step
  const renderFooter = () => {
    if (step === 'success') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button 
            onClick={() => {
              setStep('configure');
              setPreviewData(null);
              setResultData(null);
            }}
          >
            <IconRefresh className="h-4 w-4 mr-2" />
            Create More
          </Button>
        </div>
      );
    }

    if (step === 'preview') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleExecute} 
            disabled={loading || !previewData?.assignments?.length}
            variant="primary"
          >
            {loading ? (
              <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <IconCheck className="h-4 w-4 mr-2" />
            )}
            Create {previewData?.assignments?.length || 0} Postings
          </Button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handlePreview} disabled={loading || !sessionId}>
          {loading ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <IconWand className="h-4 w-4 mr-2" />
          )}
          Preview Assignments
        </Button>
      </div>
    );
  };

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <IconWand className="h-5 w-5 text-primary-600" />
          {step === 'success' ? 'Auto-Posting Complete' : 'Auto-Post Supervisors'}
        </div>
      }
      width="2xl"
      footer={renderFooter()}
    >
      {step === 'configure' && renderConfigureStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'success' && renderSuccessStep()}
    </Dialog>
  );
}

export default AutoPostDialog;
