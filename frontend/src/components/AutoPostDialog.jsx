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

import { useState, useEffect, useMemo } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { MultiSelectPicker } from './ui/MultiSelectPicker';
import { Switch } from './forms/InstitutionFormSections';
import { autoPostingApi } from '../api';
import { useToast } from '../context/ToastContext';
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
  IconFilter,
} from '@tabler/icons-react';

const POSTING_TYPES = [
  {
    value: 'random',
    label: 'Any Location',
    description: 'Schools are assigned wherever they fall - no geographic grouping',
    icon: IconUsers,
  },
  {
    value: 'route_based',
    label: 'Route Based',
    description: 'Each supervisor works a single route per visit, so one trip covers all their schools',
    icon: IconRoute,
  },
  {
    value: 'lga_based',
    label: 'LGA Based',
    description: 'Each supervisor works a single LGA per visit, so one trip covers all their schools',
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
  const [avoidRepeatSchools, setAvoidRepeatSchools] = useState(true);

  // Scope-narrowing state - all empty means institution-wide, matching today's behavior
  const [scopeOptions, setScopeOptions] = useState(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState([]);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedLgas, setSelectedLgas] = useState([]); // [{state, lga}]
  const [selectedRouteIds, setSelectedRouteIds] = useState([]);
  const [selectedVisitNumbers, setSelectedVisitNumbers] = useState([]);

  // UI state
  const [step, setStep] = useState('scope'); // 'scope' | 'configure' | 'preview' | 'success'
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData] = useState(null);

  // Fetch scope-picker data whenever the dialog opens for a session
  useEffect(() => {
    if (!open || !sessionId) return;
    setScopeLoading(true);
    autoPostingApi
      .getOptions({ session_id: sessionId, faculty_id: facultyId })
      .then((response) => {
        setScopeOptions(response.data?.data || response.data);
      })
      .catch((error) => {
        showToast('error', error.response?.data?.message || 'Failed to load scope options');
      })
      .finally(() => setScopeLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, facultyId]);

  // Dean context: lock the faculty filter to the dean's own faculty, never editable
  useEffect(() => {
    if (facultyId) setSelectedFacultyIds([facultyId]);
  }, [facultyId]);

  // Reset state when dialog closes
  const handleClose = () => {
    setStep('scope');
    setPreviewData(null);
    setResultData(null);
    setNumberOfPostings(1);
    setPostingType('random');
    setPriorityEnabled(true);
    setAvoidRepeatSchools(true);
    setScopeOptions(null);
    setSelectedSupervisorIds([]);
    setSelectedFacultyIds(facultyId ? [facultyId] : []);
    setSelectedStates([]);
    setSelectedLgas([]);
    setSelectedRouteIds([]);
    setSelectedVisitNumbers([]);
    onClose();
  };

  const handleClearScope = () => {
    setSelectedSupervisorIds([]);
    if (!facultyId) setSelectedFacultyIds([]);
    setSelectedStates([]);
    setSelectedLgas([]);
    setSelectedRouteIds([]);
    setSelectedVisitNumbers([]);
  };

  // LGA choices depend on the selected states - matched as (state, lga) pairs since
  // LGA names repeat across different states
  const lgaOptions = useMemo(() => {
    const locations = scopeOptions?.locations || [];
    const relevant =
      selectedStates.length > 0 ? locations.filter((l) => selectedStates.includes(l.state)) : locations;
    return relevant.flatMap((l) => l.lgas.map((lga) => ({ state: l.state, lga: lga.lga, slot_count: lga.slot_count })));
  }, [scopeOptions, selectedStates]);

  const lgaKey = ({ state, lga }) => `${state}::${lga}`;

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
        avoid_repeat_schools: avoidRepeatSchools,
        faculty_id: facultyId,
        supervisor_ids: selectedSupervisorIds,
        faculty_ids: facultyId ? [facultyId] : selectedFacultyIds,
        states: selectedStates,
        lgas: selectedLgas,
        route_ids: selectedRouteIds,
        visit_numbers: selectedVisitNumbers,
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
        avoid_repeat_schools: avoidRepeatSchools,
        faculty_id: facultyId,
        supervisor_ids: selectedSupervisorIds,
        faculty_ids: facultyId ? [facultyId] : selectedFacultyIds,
        states: selectedStates,
        lgas: selectedLgas,
        route_ids: selectedRouteIds,
        visit_numbers: selectedVisitNumbers,
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

  // Supervisors that had to be sent back to a school they already cover
  const renderRepeatSchoolsNotice = (statistics) => {
    if (!statistics?.repeat_school_assignments) return null;

    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
          <IconAlertTriangle className="h-4 w-4" />
          {statistics.repeat_school_assignments} posting(s) reuse a school for the same supervisor
        </div>
        <p className="text-sm text-amber-700 mb-2">
          No other supervisor had capacity for these slots, so the school had to be repeated.
        </p>
        <ul className="text-sm text-amber-700 list-disc list-inside max-h-32 overflow-y-auto">
          {(statistics.repeat_school_details || []).map((r) => (
            <li key={`${r.supervisor_id}-${r.school_id}`}>
              {r.supervisor_name} - {r.school_name}
              {r.visit_numbers?.length > 0 && ` (Visit ${r.visit_numbers.join(', ')})`}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Inputs that would silently produce financially wrong postings
  const renderDataQualityNotice = (dataQuality) => {
    if (!dataQuality) return null;
    const { supervisors_without_rank_count: noRank, schools_without_distance_count: noDistance } = dataQuality;
    if (!noRank && !noDistance) return null;

    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
          <IconAlertTriangle className="h-4 w-4" />
          Data quality
        </div>

        {noRank > 0 && (
          <div className="mb-2">
            <p className="text-sm text-amber-700">
              <span className="font-medium">{noRank} supervisor(s) have no rank</span> - their
              postings will calculate every allowance as zero.
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dataQuality.supervisors_without_rank.map((s) => s.name).join(', ')}
              {noRank > dataQuality.supervisors_without_rank.length && ' …'}
            </p>
          </div>
        )}

        {noDistance > 0 && (
          <div>
            <p className="text-sm text-amber-700">
              <span className="font-medium">{noDistance} school(s) have no distance set</span> -
              they are treated as inside the threshold and pay local running only.
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dataQuality.schools_without_distance.map((s) => s.school_name).join(', ')}
              {noDistance > dataQuality.schools_without_distance.length && ' …'}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Objective read on how well-formed the distribution is
  const renderQualityPanel = (statistics) => {
    if (!statistics) return null;

    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="font-medium text-gray-900 mb-3">Distribution Quality</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-gray-500 text-xs">Postings per supervisor</div>
            <div className="font-medium text-gray-900">
              {statistics.load?.min ?? 0}–{statistics.load?.max ?? 0}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Distance per supervisor</div>
            <div className="font-medium text-gray-900">
              {statistics.travel_km?.min ?? 0}–{statistics.travel_km?.max ?? 0} km
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">
              {postingType === 'random' ? 'Schools covered' : 'Out-of-area trips'}
            </div>
            <div className="font-medium text-gray-900">
              {postingType === 'random'
                ? statistics.total_schools ?? 0
                : statistics.affinity_breaks ?? 0}
            </div>
          </div>
        </div>

        {/* Seniority is honoured when the mean journey falls as rank number rises */}
        {priorityEnabled && statistics.distance_by_rank?.length > 1 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h5 className="text-sm font-medium text-gray-700 mb-2">
              Average journey by rank priority
            </h5>
            <div className="flex flex-wrap gap-2">
              {statistics.distance_by_rank.map((band) => (
                <div
                  key={band.priority_number}
                  className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm"
                  title={`${band.postings} posting(s)`}
                >
                  P{band.priority_number}: <span className="font-medium">{band.mean_km} km</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Senior ranks (lower number) should show longer average journeys.
            </p>

            <p className="text-xs text-gray-500 mt-2">
              Priority accuracy: {Math.round((statistics.priority_correlation ?? 0) * 100)}%
            </p>
          </div>
        )}
      </div>
    );
  };

  // Dean quota, when the acting user has one
  const renderDeanAllocation = (allocation, quotaSkipped) => {
    if (!allocation) return null;

    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <span className="font-medium">Your posting allocation:</span>{' '}
        {allocation.used} of {allocation.allocated} used, {allocation.remaining} remaining.
        {quotaSkipped > 0 && (
          <span className="block mt-1 text-blue-700">
            {quotaSkipped} slot(s) were skipped because your allocation does not cover them.
          </span>
        )}
      </div>
    );
  };

  // Render scope-narrowing step - everything here is optional; leaving it all
  // empty reproduces today's institution-wide behavior exactly
  const renderScopeStep = () => {
    if (scopeLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500">
          <IconLoader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading scope options...</span>
        </div>
      );
    }

    if (!scopeOptions) {
      return (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <IconAlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-700 mb-3">
            Couldn&apos;t load scope options. You can still continue with an institution-wide run.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setScopeLoading(true);
              autoPostingApi
                .getOptions({ session_id: sessionId, faculty_id: facultyId })
                .then((response) => setScopeOptions(response.data?.data || response.data))
                .catch((error) => showToast('error', error.response?.data?.message || 'Failed to load scope options'))
                .finally(() => setScopeLoading(false));
            }}
          >
            <IconRefresh className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          Narrow this run to specific faculties, supervisors, locations, routes or visits - or leave
          everything below empty to run across the whole institution as usual.
        </div>

        <MultiSelectPicker
          label="Faculty"
          options={scopeOptions.faculties}
          value={selectedFacultyIds}
          onChange={setSelectedFacultyIds}
          getOptionValue={(f) => f.id}
          getOptionLabel={(f) => f.name}
          getOptionCount={(f) => f.supervisor_count}
          placeholder="All faculties"
          searchPlaceholder="Search faculties..."
          disabled={!!facultyId}
        />
        {facultyId && (
          <p className="-mt-4 text-xs text-gray-500">Locked to your faculty.</p>
        )}

        <MultiSelectPicker
          label="Supervisors"
          options={scopeOptions.supervisors}
          value={selectedSupervisorIds}
          onChange={setSelectedSupervisorIds}
          getOptionValue={(s) => s.id}
          getOptionLabel={(s) => s.name}
          getOptionCount={(s) => `${s.remaining_slots} left`}
          placeholder="All eligible supervisors"
          searchPlaceholder="Search supervisors..."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MultiSelectPicker
            label="States"
            options={scopeOptions.locations}
            value={selectedStates}
            onChange={(next) => {
              setSelectedStates(next);
              // Drop any LGA selections that no longer belong to a selected state
              setSelectedLgas((prev) => prev.filter((l) => next.length === 0 || next.includes(l.state)));
            }}
            getOptionValue={(l) => l.state}
            getOptionLabel={(l) => l.state}
            getOptionCount={(l) => `${l.slot_count} slots`}
            placeholder="All states"
            searchPlaceholder="Search states..."
          />

          <MultiSelectPicker
            label="LGAs"
            options={lgaOptions}
            value={selectedLgas.map(lgaKey)}
            onChange={(nextKeys) => {
              const keySet = new Set(nextKeys);
              setSelectedLgas(lgaOptions.filter((l) => keySet.has(lgaKey(l))).map(({ state, lga }) => ({ state, lga })));
            }}
            getOptionValue={lgaKey}
            getOptionLabel={(l) => `${l.lga} (${l.state})`}
            getOptionCount={(l) => `${l.slot_count} slots`}
            placeholder="All LGAs"
            searchPlaceholder="Search LGAs..."
          />
        </div>

        <MultiSelectPicker
          label="Routes"
          options={scopeOptions.routes}
          value={selectedRouteIds}
          onChange={setSelectedRouteIds}
          getOptionValue={(r) => r.id}
          getOptionLabel={(r) => r.name}
          getOptionCount={(r) => `${r.slot_count} slots`}
          placeholder="All routes"
          searchPlaceholder="Search routes..."
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Specific Visits (optional)</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxVisits }, (_, i) => i + 1).map((n) => {
              const isSelected = selectedVisitNumbers.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setSelectedVisitNumbers((prev) =>
                      isSelected ? prev.filter((v) => v !== n) : [...prev, n]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    isSelected
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Visit {n}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">
            Leave empty to use the Visits-to-Include setting on the next step. Selecting any visit(s)
            here (even non-consecutive ones) overrides that setting.
          </p>
        </div>

        <Button variant="outline" onClick={handleClearScope}>
          Clear scope
        </Button>
      </div>
    );
  };

  // Render configuration step
  const renderConfigureStep = () => (
    <div className="space-y-6">
      {/* Visits to Include */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Visits to Include
        </label>
        {selectedVisitNumbers.length > 0 ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
            <span>
              Using explicit visits: <span className="font-medium text-gray-900">{[...selectedVisitNumbers].sort((a, b) => a - b).join(', ')}</span>
            </span>
            <button
              type="button"
              onClick={() => setStep('scope')}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Change in Scope step
            </button>
          </div>
        ) : (
          <>
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
          </>
        )}
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

      {/* Avoid Repeat Schools Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-900">
            Avoid Repeating Schools
          </label>
          <p className="text-sm text-gray-500 mt-0.5">
            A supervisor won&apos;t be sent to the same school for more than one visit unless no other
            supervisor is available. Schools they are already posted to this session are counted too.
          </p>
        </div>
        <Switch
          checked={avoidRepeatSchools}
          onCheckedChange={setAvoidRepeatSchools}
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
              <li>Postings are shared evenly - counts stay within one of each other</li>
              <li>A supervisor is not sent back to a school they already cover unless unavoidable</li>
              <li>With priority on, senior supervisors take the longer journeys (same workload, more distance)</li>
              <li>Only schools with students (in groups) are considered</li>
              <li>Existing postings are preserved - only available slots are used</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Scope recap - only rendered once a run has actually been narrowed
  const renderScopeRecap = (filtersApplied) => {
    if (!filtersApplied?.is_scoped) return null;

    const parts = [];
    if (filtersApplied.supervisor_count > 0) parts.push(`${filtersApplied.supervisor_count} supervisor(s)`);
    if (filtersApplied.faculty_count > 0) parts.push(`Faculty: ${filtersApplied.faculty_names.join(', ')}`);
    if (filtersApplied.states?.length > 0) parts.push(`States: ${filtersApplied.states.join(', ')}`);
    if (filtersApplied.lgas?.length > 0) {
      parts.push(`LGAs: ${filtersApplied.lgas.map((l) => `${l.lga} (${l.state})`).join(', ')}`);
    }
    if (filtersApplied.route_count > 0) parts.push(`Routes: ${filtersApplied.route_names.join(', ')}`);
    if (filtersApplied.visit_numbers?.length > 0) parts.push(`Visits: ${filtersApplied.visit_numbers.join(', ')}`);

    return (
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <IconFilter className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Scoped to: {parts.join(' · ')}</span>
        </div>
        <button
          type="button"
          onClick={() => setStep('scope')}
          className="flex-shrink-0 text-purple-700 hover:text-purple-900 font-medium underline"
        >
          Change scope
        </button>
      </div>
    );
  };

  // Render preview step
  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* Scope recap */}
      {renderScopeRecap(previewData?.filters_applied)}

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

      {/* Dean allocation */}
      {renderDeanAllocation(previewData?.dean_allocation, previewData?.statistics?.quota_skipped)}

      {/* Distribution quality */}
      {renderQualityPanel(previewData?.statistics)}

      {/* Data quality */}
      {renderDataQualityNotice(previewData?.data_quality)}

      {/* Repeated schools */}
      {renderRepeatSchoolsNotice(previewData?.statistics)}

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
                  {a.repeat_school && (
                    <Badge variant="warning" title="Supervisor already covers this school">
                      Repeat
                    </Badge>
                  )}
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
      {/* Scope recap */}
      {renderScopeRecap(resultData?.filters_applied)}

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

      {/* Dean allocation */}
      {renderDeanAllocation(resultData?.dean_allocation, resultData?.statistics?.quota_skipped)}

      {/* Distribution quality */}
      {renderQualityPanel(resultData?.statistics)}

      {/* Data quality */}
      {renderDataQualityNotice(resultData?.data_quality)}

      {/* Repeated schools */}
      {renderRepeatSchoolsNotice(resultData?.statistics)}

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

    if (step === 'scope') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => setStep('configure')}>
            Next
          </Button>
        </div>
      );
    }

    return (
      <div className="flex justify-between gap-3 w-full">
        <Button variant="outline" onClick={() => setStep('scope')} disabled={loading}>
          <IconArrowLeft className="h-4 w-4 mr-2" />
          Back to Scope
        </Button>
        <div className="flex gap-3">
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
      width="4xl"
      footer={renderFooter()}
    >
      {step === 'scope' && renderScopeStep()}
      {step === 'configure' && renderConfigureStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'success' && renderSuccessStep()}
    </Dialog>
  );
}

export default AutoPostDialog;
