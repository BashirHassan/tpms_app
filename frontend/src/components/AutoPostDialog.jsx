/**
 * Auto-Post Dialog Component
 *
 * Three steps: Scope → Options → Preview.
 *
 * SCOPE narrows the run - which supervisors, which states/LGAs, which routes, which
 * visits. Every list is optional and leaving one empty means "no narrowing", so an
 * admin who skips this step gets the institution-wide run auto-posting has always
 * done. Scoping exists because a real posting round arrives in pieces: acceptances
 * come in state by state, and a faculty's supervisors are ready before the rest.
 *
 * OPTIONS is the allocation configuration - visits to include, distribution type,
 * priority posting, school variety.
 *
 * PREVIEW reports how *good* the resulting distribution is, not just how big: load and
 * travel spread, out-of-area trips, mean journey per rank band, and the data-quality
 * problems that would silently produce financially wrong postings.
 *
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { StatsCard } from './ui/StatsCard';
import { Switch } from './forms/InstitutionFormSections';
import { RadioGroup } from './ui/RadioGroup';
import { MultiSelectList } from './ui/MultiSelectList';
import { Stepper, Step } from './ui/Stepper';
import { autoPostingApi } from '../api';
import { useToast } from '../context/ToastContext';
import {
  IconWand,
  IconLoader2,
  IconAlertTriangle,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
  IconUsers,
  IconBuildingBank as IconSchool,
  IconRoute,
  IconMapPin,
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

const STEPS = [
  { key: 'scope', title: 'Scope' },
  { key: 'options', title: 'Options' },
  { key: 'preview', title: 'Preview' },
];

/** An LGA is only identified by its state as well - the names repeat across states. */
const lgaKey = (state, lga) => `${state}::${lga}`;
const parseLgaKey = (key) => {
  const [state, ...rest] = key.split('::');
  return { state, lga: rest.join('::') };
};

/** `visits_included` is a number for a 1..N run and an array for an explicit selection. */
const describeVisits = (visits) => {
  if (Array.isArray(visits)) {
    return visits.length === 1 ? `Visit ${visits[0]}` : `Visits ${visits.join(', ')}`;
  }
  return visits > 1 ? `Visits 1 through ${visits}` : 'Visit 1';
};

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

  // Allocation options
  const [numberOfPostings, setNumberOfPostings] = useState(1);
  const [postingType, setPostingType] = useState('random');
  const [priorityEnabled, setPriorityEnabled] = useState(true);
  const [avoidRepeatSchools, setAvoidRepeatSchools] = useState(true);

  // Scope. Every list empty = run across everything, which is the pre-scoping behaviour.
  const [scopeOptions, setScopeOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedSupervisors, setSelectedSupervisors] = useState([]);
  const [selectedFaculties, setSelectedFaculties] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedLgas, setSelectedLgas] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedVisits, setSelectedVisits] = useState([]);

  // UI state
  const [step, setStep] = useState('scope');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData] = useState(null);

  const resetScope = useCallback(() => {
    setSelectedSupervisors([]);
    setSelectedFaculties([]);
    setSelectedStates([]);
    setSelectedLgas([]);
    setSelectedRoutes([]);
    setSelectedVisits([]);
  }, []);

  // Load what can be scoped to. Counts come from the slots that are still open, so the
  // pickers never offer an area with nothing left to fill. A dean's faculty_id narrows
  // the returned supervisors/faculties server-side, so no separate lock/disable is needed.
  useEffect(() => {
    if (!open || !sessionId) return;

    let cancelled = false;
    setLoadingOptions(true);

    autoPostingApi
      .getOptions({ session_id: sessionId, ...(facultyId ? { faculty_id: facultyId } : {}) })
      .then((response) => {
        if (cancelled) return;
        setScopeOptions(response.data?.data || response.data);
      })
      .catch((error) => {
        if (cancelled) return;
        showToast(
          'error',
          error.response?.data?.message || error.message || 'Failed to load scope options'
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, facultyId, showToast]);

  // ==========================================================================
  // DERIVED SCOPE
  // ==========================================================================

  const allSupervisors = useMemo(() => scopeOptions?.supervisors || [], [scopeOptions]);
  const allLocations = useMemo(() => scopeOptions?.locations || [], [scopeOptions]);

  // Faculty narrows which supervisors are even offered, so the two mechanisms compose -
  // ticking a faculty and then three names means "these three", not a conflict
  const supervisorOptions = useMemo(() => {
    const faculties = new Set(selectedFaculties);
    return allSupervisors.filter((s) => faculties.size === 0 || faculties.has(s.faculty_id));
  }, [allSupervisors, selectedFaculties]);

  // A supervisor hidden by a faculty change must not stay silently selected
  useEffect(() => {
    setSelectedSupervisors((current) => {
      if (current.length === 0) return current;
      const offered = new Set(supervisorOptions.map((s) => s.id));
      const kept = current.filter((id) => offered.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [supervisorOptions]);

  const lgaOptions = useMemo(() => {
    const states = new Set(selectedStates);
    return allLocations
      .filter((location) => states.size === 0 || states.has(location.state))
      .flatMap((location) =>
        location.lgas.map((entry) => ({
          key: lgaKey(location.state, entry.lga),
          state: location.state,
          lga: entry.lga,
          slot_count: entry.slot_count,
          school_count: entry.school_count,
        }))
      );
  }, [allLocations, selectedStates]);

  // Dropping a state must drop its LGAs too, or the scope would still carry them
  useEffect(() => {
    setSelectedLgas((current) => {
      if (current.length === 0) return current;
      const offered = new Set(lgaOptions.map((l) => l.key));
      const kept = current.filter((key) => offered.has(key));
      return kept.length === current.length ? current : kept;
    });
  }, [lgaOptions]);

  const scopeSummary = useMemo(() => {
    const pool = selectedSupervisors.length > 0
      ? supervisorOptions.filter((s) => selectedSupervisors.includes(s.id))
      : supervisorOptions;

    const capacity = pool.reduce((sum, s) => sum + (s.remaining_slots || 0), 0);

    // Slots in the selected areas. Route and visit filters narrow this further, and the
    // aggregate payload cannot express that intersection - the preview gives the exact
    // figure, so this is deliberately labelled as an estimate.
    let areaSlots;
    if (selectedLgas.length > 0) {
      const chosen = new Set(selectedLgas);
      areaSlots = lgaOptions
        .filter((l) => chosen.has(l.key))
        .reduce((sum, l) => sum + l.slot_count, 0);
    } else if (selectedStates.length > 0) {
      const chosen = new Set(selectedStates);
      areaSlots = allLocations
        .filter((location) => chosen.has(location.state))
        .reduce((sum, location) => sum + location.slot_count, 0);
    } else {
      areaSlots = scopeOptions?.total_available_slots ?? 0;
    }

    const isNarrowed =
      selectedSupervisors.length > 0 ||
      selectedFaculties.length > 0 ||
      selectedStates.length > 0 ||
      selectedLgas.length > 0 ||
      selectedRoutes.length > 0 ||
      selectedVisits.length > 0;

    const isNarrowedByAreaOnly = selectedRoutes.length === 0 && selectedVisits.length === 0;

    return { supervisorCount: pool.length, capacity, areaSlots, isNarrowed, isNarrowedByAreaOnly };
  }, [
    supervisorOptions, selectedSupervisors, selectedFaculties,
    selectedStates, selectedLgas, selectedRoutes, selectedVisits, lgaOptions,
    allLocations, scopeOptions,
  ]);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const buildCriteria = useCallback(
    () => ({
      session_id: sessionId,
      number_of_postings: numberOfPostings,
      posting_type: postingType,
      priority_enabled: priorityEnabled,
      avoid_repeat_schools: avoidRepeatSchools,
      faculty_id: facultyId,

      supervisor_ids: selectedSupervisors,
      faculty_ids: selectedFaculties,
      states: selectedStates,
      lgas: selectedLgas.map(parseLgaKey),
      route_ids: selectedRoutes,
      visit_numbers: selectedVisits,
    }),
    [
      sessionId, numberOfPostings, postingType, priorityEnabled, avoidRepeatSchools,
      facultyId, selectedSupervisors, selectedFaculties,
      selectedStates, selectedLgas, selectedRoutes, selectedVisits,
    ]
  );

  const handleClose = () => {
    setStep('scope');
    setPreviewData(null);
    setResultData(null);
    setNumberOfPostings(1);
    setPostingType('random');
    setPriorityEnabled(true);
    setAvoidRepeatSchools(true);
    resetScope();
    onClose();
  };

  const handlePreview = async () => {
    if (!sessionId) {
      showToast('error', 'Please select a session first');
      return;
    }

    setLoading(true);
    try {
      const response = await autoPostingApi.preview(buildCriteria());
      setPreviewData(response.data?.data || response.data);
      setStep('preview');
    } catch (error) {
      showToast('error', error.response?.data?.message || error.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      const response = await autoPostingApi.execute(buildCriteria());

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

  // ==========================================================================
  // SHARED PANELS
  // ==========================================================================

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

  // What the run was narrowed to, so nobody confirms a batch they cannot read
  const renderScopeBanner = (filters) => {
    if (!filters?.is_scoped) return null;

    const parts = [];
    if (filters.supervisor_count > 0) {
      parts.push({
        label: `${filters.supervisor_count} supervisor(s)`,
        detail: filters.supervisor_names?.join(', '),
      });
    }
    if (filters.faculty_count > 0) {
      parts.push({ label: 'Faculty', detail: filters.faculty_names?.join(', ') });
    }
    if (filters.states?.length > 0) {
      parts.push({ label: 'States', detail: filters.states.join(', ') });
    }
    if (filters.lgas?.length > 0) {
      parts.push({
        label: 'LGAs',
        detail: filters.lgas.map((l) => `${l.lga} (${l.state})`).join(', '),
      });
    }
    if (filters.route_count > 0) {
      parts.push({ label: 'Routes', detail: filters.route_names?.join(', ') });
    }
    if (filters.visit_numbers?.length > 0) {
      parts.push({ label: 'Visits', detail: filters.visit_numbers.join(', ') });
    }

    return (
      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
        <div className="flex items-center gap-2 text-indigo-800 font-medium text-sm mb-1.5">
          <IconFilter className="h-4 w-4" />
          Scoped run
        </div>
        <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {parts.map((part) => (
            <div key={part.label} className="min-w-0">
              <dt className="text-indigo-700 font-medium">{part.label}</dt>
              <dd className="text-indigo-600 truncate" title={part.detail}>
                {part.detail || '—'}
              </dd>
            </div>
          ))}
        </dl>
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

  // ==========================================================================
  // STEP 1 - SCOPE
  // ==========================================================================

  const renderScopeStep = () => {
    if (loadingOptions) {
      return (
        <div className="py-16 text-center text-gray-500">
          <IconLoader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
          Loading supervisors and locations…
        </div>
      );
    }

    if (!scopeOptions) {
      return (
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-600">
          Scope options could not be loaded. You can still continue - the run will cover
          every eligible supervisor and every open slot.
        </div>
      );
    }

    const visits = scopeOptions.visits || [];

    return (
      <div className="space-y-6">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Leave a list untouched to include everything in it. Narrow only what you want to
          post right now - the rest stays available for a later run.
        </div>

        {/* Who */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <IconUsers className="h-4 w-4 text-gray-500" />
            Who gets posted
          </h4>

          <MultiSelectList
            label="Faculty"
            options={scopeOptions.faculties || []}
            value={selectedFaculties}
            onChange={setSelectedFaculties}
            allSelectedMessage="All faculties"
            getOptionMeta={(f) => `${f.supervisor_count} available`}
            emptyMessage="No faculties on the eligible supervisors"
            maxHeight="max-h-40"
          />

          <MultiSelectList
            label="Supervisors"
            options={supervisorOptions}
            value={selectedSupervisors}
            onChange={setSelectedSupervisors}
            allSelectedMessage="All supervisors"
            hint={`max ${scopeOptions.max_postings_per_supervisor} posting(s) each`}
            searchPlaceholder="Search supervisors…"
            emptyMessage="No supervisor has remaining capacity this session"
            getOptionLabel={(s) => s.name}
            getOptionMeta={(s) =>
              `${s.current_postings}/${scopeOptions.max_postings_per_supervisor} used`
            }
            renderOption={(s) => (
              <span className="block text-xs text-gray-500 truncate">
                {[s.rank_code, s.faculty_name].filter(Boolean).join(' · ')}
              </span>
            )}
          />
        </div>

        {/* Where */}
        <div className="space-y-4 pt-2 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 pt-4">
            <IconMapPin className="h-4 w-4 text-gray-500" />
            Where they get posted
          </h4>

          <div className="grid sm:grid-cols-2 gap-4">
            <MultiSelectList
              label="States"
              options={allLocations}
              value={selectedStates}
              onChange={setSelectedStates}
              allSelectedMessage="All states"
              getOptionValue={(location) => location.state}
              getOptionLabel={(location) => location.state}
              getOptionMeta={(location) => `${location.slot_count} slots`}
              emptyMessage="No open slots this session"
              maxHeight="max-h-40"
            />
            <MultiSelectList
              label="LGAs"
              options={lgaOptions}
              value={selectedLgas}
              onChange={setSelectedLgas}
              allSelectedMessage={
                selectedStates.length > 0 ? 'All LGAs in the selected states' : 'All LGAs'
              }
              groupBy={(l) => l.state}
              getOptionValue={(l) => l.key}
              getOptionLabel={(l) => l.lga}
              getOptionMeta={(l) => `${l.slot_count} slots`}
              searchPlaceholder="Search LGAs…"
              emptyMessage="No LGAs available"
              maxHeight="max-h-40"
            />
          </div>

          <MultiSelectList
            label="Routes"
            options={scopeOptions.routes || []}
            value={selectedRoutes}
            onChange={setSelectedRoutes}
            allSelectedMessage="All routes"
            getOptionMeta={(r) => `${r.slot_count} slots`}
            emptyMessage="No routes on the open slots"
            maxHeight="max-h-40"
          />
        </div>

        {/* Which visits */}
        <div className="space-y-2 pt-2 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 pt-4">Which visits</h4>
          <p className="text-xs text-gray-500">
            Pick exact visits to fill - useful once Visit 1 is already posted. Leave empty to
            use the &ldquo;visits to include&rdquo; setting on the next step.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {visits.length === 0 && (
              <span className="text-sm text-gray-500">No open slots to choose from</span>
            )}
            {visits.map(({ visit_number: visit, slot_count: slotCount }) => {
              const isSelected = selectedVisits.includes(visit);
              return (
                <button
                  key={visit}
                  type="button"
                  onClick={() =>
                    setSelectedVisits(
                      isSelected
                        ? selectedVisits.filter((v) => v !== visit)
                        : [...selectedVisits, visit].sort((a, b) => a - b)
                    )
                  }
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Visit {visit}
                  <span className={isSelected ? 'text-primary-100' : 'text-gray-400'}>
                    {' '}· {slotCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live read on whether the scope is workable */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-gray-700">
              <span className="font-medium text-gray-900">{scopeSummary.supervisorCount}</span>{' '}
              supervisor(s) in scope
            </span>
            <span className="text-gray-700">
              <span className="font-medium text-gray-900">{scopeSummary.capacity}</span>{' '}
              posting(s) of capacity
            </span>
            <span className="text-gray-700">
              <span className="font-medium text-gray-900">{scopeSummary.areaSlots}</span>{' '}
              slot(s) in the selected areas
            </span>
          </div>
          {!scopeSummary.isNarrowedByAreaOnly && (
            <p className="text-xs text-gray-500 mt-1">
              Route and visit filters narrow the slot count further - the preview shows the
              exact figure.
            </p>
          )}
          {scopeSummary.capacity < scopeSummary.areaSlots && scopeSummary.isNarrowedByAreaOnly && (
            <p className="text-xs text-amber-700 mt-1">
              Capacity is below the number of slots in scope, so some slots will be left for a
              later run.
            </p>
          )}
        </div>
      </div>
    );
  };

  // ==========================================================================
  // STEP 2 - OPTIONS
  // ==========================================================================

  const renderOptionsStep = () => (
    <div className="space-y-6">
      {/* Read-only recap of what was scoped, so the settings are read in context */}
      {scopeSummary.isNarrowed && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800 flex items-start gap-2">
          <IconFilter className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Scoped to <span className="font-medium">{scopeSummary.supervisorCount}</span>{' '}
            supervisor(s)
            {selectedStates.length > 0 && <> in {selectedStates.join(', ')}</>}
            {selectedLgas.length > 0 && <> ({selectedLgas.length} LGA(s))</>}
            {selectedRoutes.length > 0 && <> · {selectedRoutes.length} route(s)</>}
            {selectedVisits.length > 0 && <> · {describeVisits(selectedVisits)}</>}.
            <button
              type="button"
              onClick={() => setStep('scope')}
              className="ml-2 underline hover:no-underline"
            >
              Change
            </button>
          </span>
        </div>
      )}

      {/* Visits to Include */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Visits to Include
        </label>
        <Select
          value={numberOfPostings}
          onChange={(e) => setNumberOfPostings(parseInt(e.target.value))}
          className="w-full"
          disabled={selectedVisits.length > 0}
        >
          {Array.from({ length: maxVisits }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>
              {n === 1 ? 'Visit 1 only' : `Visits 1 through ${n}`}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-500">
          {selectedVisits.length > 0 ? (
            <>
              Overridden by the visit selection on the previous step:{' '}
              <span className="font-medium">{describeVisits(selectedVisits)}</span>.
            </>
          ) : (
            <>
              Maximum visits per session: {maxVisits}. All available slots for selected visits
              will be distributed fairly among supervisors.
            </>
          )}
        </p>
      </div>

      {/* Posting Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Posting Distribution Type
        </label>
        <RadioGroup
          name="postingType"
          value={postingType}
          onChange={setPostingType}
          options={POSTING_TYPES}
          renderOption={(type) => {
            const Icon = type.icon;
            return (
              <>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-900">{type.label}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{type.description}</div>
              </>
            );
          }}
        />
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
            A supervisor won&apos;t be sent to the same school for more than one visit unless no
            other supervisor is available. Schools they are already posted to this session are
            counted too.
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
              <li>Only the supervisors and locations you scoped to are considered</li>
              <li>All Visit 1 slots are filled first, then Visit 2, and so on (round-robin by visit)</li>
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

  // ==========================================================================
  // STEP 3 - PREVIEW
  // ==========================================================================

  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* Visits info banner */}
      {previewData?.visits_included && (
        <div className="px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700">
          Showing results for: <span className="font-medium">
            {describeVisits(previewData.visits_included)}
          </span>
        </div>
      )}

      {/* What the run was narrowed to */}
      {renderScopeBanner(previewData?.filters_applied)}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard title="Eligible Supervisors" value={previewData?.total_supervisors} icon={IconUsers} valueClassName="text-blue-700" labelClassName="text-blue-600" />
        <StatsCard title="Postings to Create" value={previewData?.assignments?.length} icon={IconCheck} tone="green" valueClassName="text-green-700" labelClassName="text-green-600" />
        <StatsCard
          title="Available Slots"
          value={previewData?.total_available_slots}
          icon={IconSchool}
          tone="orange"
          valueClassName="text-orange-700"
          labelClassName="text-orange-600"
          subValue={previewData?.visits_included ? describeVisits(previewData.visits_included) : null}
        />
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
                  {a.repeat_school && (
                    <Badge variant="warning" title="Supervisor already covers this school">
                      Repeat
                    </Badge>
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
            <li>The scope is too narrow - no open slots match it</li>
            <li>No available school slots (all visits assigned)</li>
            <li>No eligible supervisors (all at max postings)</li>
            <li>No schools with student groups</li>
          </ul>
        </div>
      )}

      {/* Back button */}
      <Button variant="outline" onClick={() => setStep('options')} className="mt-2">
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

      {/* What the run was narrowed to */}
      {renderScopeBanner(resultData?.filters_applied)}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatsCard title="Batch ID" value={`#${resultData?.batch_id}`} icon={IconWand} tone="primary" valueClassName="text-lg" />
        <StatsCard title="Total Postings" value={resultData?.total_postings_created} icon={IconCheck} tone="green" valueClassName="text-lg" />
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

  // ==========================================================================
  // CHROME
  // ==========================================================================

  const renderStepper = () => {
    if (step === 'success') return null;
    const currentIndex = STEPS.findIndex((s) => s.key === step);

    return (
      <div className="mb-6">
        <Stepper>
          {STEPS.map((s, index) => (
            <Step
              key={s.key}
              step={index + 1}
              title={s.title}
              status={
                index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'
              }
              isLast={index === STEPS.length - 1}
              onClick={index < currentIndex ? () => setStep(s.key) : undefined}
            />
          ))}
        </Stepper>
      </div>
    );
  };

  const renderFooter = () => {
    if (step === 'success') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              setStep('scope');
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

    if (step === 'options') {
      return (
        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={() => setStep('scope')} disabled={loading}>
            <IconArrowLeft className="h-4 w-4 mr-2" />
            Back
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
    }

    return (
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => setStep('options')} disabled={loadingOptions || !sessionId}>
          Next: Options
          <IconArrowRight className="h-4 w-4 ml-2" />
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
      width="4xl"
      footer={renderFooter()}
    >
      {renderStepper()}
      {step === 'scope' && renderScopeStep()}
      {step === 'options' && renderOptionsStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'success' && renderSuccessStep()}
    </Dialog>
  );
}

export default AutoPostDialog;
