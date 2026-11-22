/**
 * Assign School Capture Dialog
 *
 * Head of TP assigns supervisors to schools that still lack a verified location or
 * principal details. Two modes, chosen with a toggle at the top:
 *
 *  - Auto:   Scope -> Options -> Preview -> Done. The server builds a plan (LGA-grouped or
 *            an even split); the full plan is reviewable before it is executed. Execution
 *            carries the preview's plan_hash so a stale plan is rejected (409) instead of
 *            silently assigning something different from what was reviewed.
 *  - Manual: Pick schools -> Pick supervisor -> Confirm. Only schools with no live
 *            supervisor assignment are offered.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {function} props.onClose
 * @param {number|string} props.sessionId
 * @param {string} [props.sessionName]
 * @param {'auto'|'manual'} [props.initialMode]
 * @param {function} [props.onComplete] - called after anything was assigned
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import { StatsCard } from '../ui/StatsCard';
import { RadioGroup } from '../ui/RadioGroup';
import { MultiSelectList } from '../ui/MultiSelectList';
import { Stepper, Step } from '../ui/Stepper';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/helpers';
import {
  IconWand,
  IconLoader2,
  IconAlertTriangle,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
  IconArrowsShuffle,
  IconUsers,
  IconMapPin,
  IconSearch,
  IconChevronDown,
  IconChevronRight,
  IconHandClick,
  IconBuildingBank as IconSchool,
} from '@tabler/icons-react';

const AUTO_STEPS = [
  { key: 'scope', title: 'Scope' },
  { key: 'options', title: 'Options' },
  { key: 'preview', title: 'Preview' },
];

const SCOPES = [
  { value: 'missing_any', label: 'Missing verified location or principal' },
  { value: 'missing_location', label: 'Missing verified location' },
  { value: 'missing_principal', label: 'Missing principal details' },
  { value: 'all', label: 'All active schools' },
];

const DISTRIBUTION_MODES = [
  {
    value: 'lga',
    label: 'LGA-based',
    description: "Keeps each supervisor's schools together (recommended)",
  },
  { value: 'random', label: 'Even split', description: 'Schools are shared evenly with no geographic grouping' },
];

const lgaKey = (state, lga) => `${state}::${lga}`;
const parseLgaKey = (key) => {
  const [state, ...rest] = key.split('::');
  return { state, lga: rest.join('::') };
};

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const matches = (term, ...values) => values.some((v) => v && String(v).toLowerCase().includes(term));

function NeedBadges({ school }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {school.needs_location && <Badge variant="info">Needs location</Badge>}
      {school.needs_principal && <Badge variant="warning">Needs principal</Badge>}
      {!school.needs_location && !school.needs_principal && <Badge variant="default">Complete</Badge>}
    </span>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <IconSearch className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      />
    </div>
  );
}

export default function AssignSchoolCaptureDialog({
  open,
  onClose,
  sessionId,
  sessionName,
  initialMode = 'auto',
  onComplete,
}) {
  const { toast } = useToast();

  const [mode, setMode] = useState(initialMode);

  // ---- Shared options (counts, supervisors, states, LGAs) ----
  const [scope, setScope] = useState('missing_any');
  const [options, setOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // ---- Auto ----
  const [step, setStep] = useState('scope');
  const [selectedSupervisors, setSelectedSupervisors] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedLgas, setSelectedLgas] = useState([]);
  const [distribution, setDistribution] = useState('lga');
  const [maxPerSupervisor, setMaxPerSupervisor] = useState('');
  const [shuffleSalt, setShuffleSalt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [planSearch, setPlanSearch] = useState('');
  const [expandedSupervisors, setExpandedSupervisors] = useState(() => new Set());

  // ---- Manual ----
  const [manualStep, setManualStep] = useState('pick');
  const [eligible, setEligible] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [manualSupervisorId, setManualSupervisorId] = useState('');
  const [manualResult, setManualResult] = useState(null);

  // Fresh state each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setStep('scope');
    setManualStep('pick');
    setPreview(null);
    setResult(null);
    setManualResult(null);
    setSelectedSchoolIds(new Set());
    setManualSupervisorId('');
    setShuffleSalt(0);
    setPlanSearch('');
    setManualSearch('');
  }, [open, initialMode]);

  // Options depend on the scope, since counts and the offered states/LGAs follow it
  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    setLoadingOptions(true);
    schoolCaptureApi
      .getOptions({ session_id: sessionId, scope })
      .then((response) => {
        if (!cancelled) setOptions(response.data?.data || null);
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorMessage(error, 'Failed to load options'));
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, scope, toast]);

  // Eligible (unassigned) schools for manual mode
  const loadEligible = useCallback(async () => {
    if (!sessionId) return;
    setLoadingEligible(true);
    try {
      const response = await schoolCaptureApi.getEligibleSchools({ session_id: sessionId, scope });
      setEligible(response.data?.data || []);
      setSelectedSchoolIds(new Set());
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load schools'));
    } finally {
      setLoadingEligible(false);
    }
  }, [sessionId, scope, toast]);

  useEffect(() => {
    if (open && mode === 'manual') loadEligible();
  }, [open, mode, loadEligible]);

  const supervisors = useMemo(() => options?.supervisors || [], [options]);
  const allStates = useMemo(() => options?.states || [], [options]);

  const lgaOptions = useMemo(() => {
    const states = new Set(selectedStates);
    return (options?.lgas || [])
      .filter((l) => states.size === 0 || states.has(l.state))
      .map((l) => ({ ...l, key: lgaKey(l.state, l.lga) }));
  }, [options, selectedStates]);

  // Dropping a state must drop its LGAs, and a changed scope may remove options
  useEffect(() => {
    setSelectedLgas((current) => {
      const offered = new Set(lgaOptions.map((l) => l.key));
      const kept = current.filter((k) => offered.has(k));
      return kept.length === current.length ? current : kept;
    });
  }, [lgaOptions]);

  useEffect(() => {
    setSelectedSupervisors((current) => {
      const offered = new Set(supervisors.map((s) => s.id));
      const kept = current.filter((id) => offered.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [supervisors]);

  const planBody = useCallback(
    (salt = shuffleSalt) => {
      const max = parseInt(maxPerSupervisor, 10);
      return {
        session_id: Number(sessionId),
        mode: distribution,
        scope,
        supervisor_ids: selectedSupervisors,
        states: selectedStates,
        lgas: selectedLgas.map(parseLgaKey),
        max_per_supervisor: Number.isFinite(max) && max > 0 ? max : null,
        shuffle_salt: salt,
      };
    },
    [sessionId, distribution, scope, selectedSupervisors, selectedStates, selectedLgas, maxPerSupervisor, shuffleSalt]
  );

  const handleClose = () => {
    if (loading) return;
    onClose?.();
  };

  // ==========================================================================
  // AUTO handlers
  // ==========================================================================

  const runPreview = async (salt = shuffleSalt) => {
    setLoading(true);
    try {
      const response = await schoolCaptureApi.preview(planBody(salt));
      setPreview(response.data?.data || null);
      setPlanSearch('');
      setExpandedSupervisors(new Set());
      setStep('preview');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to build the assignment plan'));
    } finally {
      setLoading(false);
    }
  };

  const handleReshuffle = () => {
    const next = shuffleSalt + 1;
    setShuffleSalt(next);
    runPreview(next);
  };

  const handleExecute = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const response = await schoolCaptureApi.execute({ ...planBody(), expected_plan_hash: preview.plan_hash });
      setResult(response.data?.data || null);
      setStep('success');
      toast.success('Supervisors assigned');
      onComplete?.();
    } catch (error) {
      if (error?.response?.status === 409) {
        toast.error(errorMessage(error, 'The plan changed since the preview. Please review it again.'));
        setStep('preview');
        await runPreview();
        return;
      }
      toast.error(errorMessage(error, 'Failed to assign supervisors'));
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // MANUAL handlers
  // ==========================================================================

  const visibleEligible = useMemo(() => {
    const term = manualSearch.trim().toLowerCase();
    if (!term) return eligible;
    return eligible.filter((s) => matches(term, s.name, s.code, s.lga, s.state, s.ward));
  }, [eligible, manualSearch]);

  const manualGroups = useMemo(() => {
    const groups = new Map();
    visibleEligible.forEach((s) => {
      const key = lgaKey(s.state || '', s.lga || '');
      if (!groups.has(key)) {
        groups.set(key, { key, state: s.state, lga: s.lga, schools: [] });
      }
      groups.get(key).schools.push(s);
    });
    return [...groups.values()].sort(
      (a, b) => (a.state || '').localeCompare(b.state || '') || (a.lga || '').localeCompare(b.lga || '')
    );
  }, [visibleEligible]);

  const toggleSchool = (id) =>
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (group) =>
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      const allOn = group.schools.every((s) => next.has(s.id));
      group.schools.forEach((s) => (allOn ? next.delete(s.id) : next.add(s.id)));
      return next;
    });

  const toggleExpanded = (setter, key) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleBulkAssign = async () => {
    setLoading(true);
    try {
      const response = await schoolCaptureApi.bulkAssign({
        session_id: Number(sessionId),
        supervisor_id: Number(manualSupervisorId),
        school_ids: [...selectedSchoolIds],
      });
      setManualResult(response.data?.data || {});
      setManualStep('done');
      toast.success('Schools assigned');
      onComplete?.();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to assign schools'));
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // Shared scope picker
  // ==========================================================================

  const scopeRadioOptions = SCOPES.map((s) => ({
    ...s,
    count: options?.counts?.[s.value],
  }));

  const renderScopeRadio = () => (
    <RadioGroup
      name="captureScope"
      label="Which schools"
      value={scope}
      onChange={setScope}
      options={scopeRadioOptions}
      renderOption={(s) => (
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="font-medium text-gray-900">{s.label}</span>
          <Badge variant="primary">{loadingOptions ? '…' : (s.count ?? 0).toLocaleString()}</Badge>
        </div>
      )}
    />
  );

  // ==========================================================================
  // AUTO steps
  // ==========================================================================

  const renderScopeStep = () => (
    <div className="space-y-6">
      {renderScopeRadio()}

      <div className="space-y-4 pt-2 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 pt-4">
          <IconMapPin className="h-4 w-4 text-gray-500" />
          Where (optional)
        </h4>
        <div className="grid sm:grid-cols-2 gap-4">
          <MultiSelectList
            label="States"
            options={allStates}
            value={selectedStates}
            onChange={setSelectedStates}
            allSelectedMessage="All states"
            getOptionValue={(s) => s.state}
            getOptionLabel={(s) => s.state}
            getOptionMeta={(s) => `${s.count} schools`}
            emptyMessage="No states for this scope"
            maxHeight="max-h-40"
          />
          <MultiSelectList
            label="LGAs"
            options={lgaOptions}
            value={selectedLgas}
            onChange={setSelectedLgas}
            allSelectedMessage={selectedStates.length > 0 ? 'All LGAs in the selected states' : 'All LGAs'}
            groupBy={(l) => l.state}
            getOptionValue={(l) => l.key}
            getOptionLabel={(l) => l.lga}
            getOptionMeta={(l) => `${l.count} schools`}
            searchPlaceholder="Search LGAs…"
            emptyMessage="No LGAs available"
            maxHeight="max-h-40"
          />
        </div>
      </div>

      <div className="space-y-4 pt-2 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 pt-4">
          <IconUsers className="h-4 w-4 text-gray-500" />
          Who captures
        </h4>
        <MultiSelectList
          label="Supervisors"
          options={supervisors}
          value={selectedSupervisors}
          onChange={setSelectedSupervisors}
          allSelectedMessage="All active supervisors"
          searchPlaceholder="Search supervisors…"
          emptyMessage="No active supervisors"
          getOptionValue={(s) => s.id}
          getOptionLabel={(s) => s.name}
          getOptionMeta={(s) => `${s.current_assignments || 0} assigned`}
          renderOption={(s) => <span className="block text-xs text-gray-500 truncate">{s.email}</span>}
        />
      </div>
    </div>
  );

  const renderOptionsStep = () => (
    <div className="space-y-6">
      <RadioGroup
        name="captureDistribution"
        label="Distribution"
        value={distribution}
        onChange={setDistribution}
        options={DISTRIBUTION_MODES}
        renderOption={(m) => (
          <div>
            <span className="font-medium text-gray-900">{m.label}</span>
            <div className="text-sm text-gray-500 mt-0.5">{m.description}</div>
          </div>
        )}
      />

      <div className="space-y-2">
        <label htmlFor="capture-max" className="block text-sm font-medium text-gray-700">
          Maximum schools per supervisor (optional)
        </label>
        <input
          id="capture-max"
          type="number"
          min="1"
          inputMode="numeric"
          value={maxPerSupervisor}
          onChange={(e) => setMaxPerSupervisor(e.target.value)}
          placeholder="No limit"
          className="w-full sm:w-48 h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500">Schools beyond every supervisor&apos;s limit are left unassigned.</p>
      </div>

      <div className="flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600">
          Plan variation <span className="font-medium text-gray-900">#{shuffleSalt}</span>. Reshuffle draws a
          different plan with the same settings.
        </div>
        <Button variant="outline" size="sm" onClick={() => setShuffleSalt((s) => s + 1)}>
          <IconArrowsShuffle className="h-4 w-4 mr-2" />
          Reshuffle
        </Button>
      </div>
    </div>
  );

  // The full plan, grouped supervisor -> LGA
  const planGroups = useMemo(() => {
    if (!preview) return [];
    const term = planSearch.trim().toLowerCase();
    const bySupervisor = new Map();
    (preview.assignments || []).forEach((a) => {
      if (!bySupervisor.has(a.supervisor_id)) {
        bySupervisor.set(a.supervisor_id, { id: a.supervisor_id, name: a.supervisor_name, total: 0, lgas: new Map() });
      }
      const sup = bySupervisor.get(a.supervisor_id);
      sup.total += 1;
      const supMatch = term && matches(term, a.supervisor_name);
      const school = a.school;
      if (term && !supMatch && !matches(term, school.name, school.code, school.lga, school.state, school.ward)) return;
      const key = lgaKey(school.state || '', school.lga || '');
      if (!sup.lgas.has(key)) sup.lgas.set(key, { key, state: school.state, lga: school.lga, schools: [] });
      sup.lgas.get(key).schools.push(school);
    });
    return [...bySupervisor.values()]
      .map((s) => ({ ...s, lgas: [...s.lgas.values()], shown: [...s.lgas.values()].reduce((n, l) => n + l.schools.length, 0) }))
      .filter((s) => !term || s.shown > 0)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [preview, planSearch]);

  const unassignedShown = useMemo(() => {
    const term = planSearch.trim().toLowerCase();
    const list = preview?.unassigned || [];
    return term ? list.filter((s) => matches(term, s.name, s.code, s.lga, s.state, s.ward)) : list;
  }, [preview, planSearch]);

  const renderPreviewStep = () => {
    const assigned = preview?.assigned_count ?? preview?.assignments?.length ?? 0;
    const searching = planSearch.trim() !== '';
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard title="Schools in scope" value={preview?.total_schools} icon={IconSchool} tone="primary" />
          <StatsCard title="Will be assigned" value={assigned} icon={IconCheck} tone="green" />
          <StatsCard title="Unassigned" value={preview?.unassigned_count ?? 0} icon={IconAlertTriangle} tone="orange" />
          <StatsCard title="Supervisors" value={preview?.total_supervisors} icon={IconUsers} tone="primary" />
        </div>

        {preview?.warnings?.length > 0 && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
              <IconAlertTriangle className="h-4 w-4" />
              Warnings ({preview.warnings.length})
            </div>
            <ul className="text-sm text-yellow-700 list-disc list-inside max-h-32 overflow-y-auto">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {preview?.per_supervisor?.length > 0 && (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="font-medium text-gray-900 mb-3">Per supervisor</h4>
            <div className="grid sm:grid-cols-2 gap-2 text-sm max-h-48 overflow-y-auto">
              {preview.per_supervisor.map((s) => (
                <div key={s.supervisor_id} className="flex items-center justify-between gap-2 p-2 bg-white border border-gray-200 rounded">
                  <span className="font-medium text-gray-900 truncate">{s.name}</span>
                  <span className="flex items-center gap-2 flex-shrink-0 text-gray-600">
                    <Badge variant="primary">{s.count}</Badge>
                    <span className="text-xs">{s.clusters} {s.clusters === 1 ? 'cluster' : 'clusters'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {assigned === 0 && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
            <IconAlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <h4 className="font-medium text-red-800 mb-1">No assignments possible</h4>
            <p className="text-sm text-red-600">No schools match this scope, or they are already assigned.</p>
          </div>
        )}

        {(assigned > 0 || unassignedShown.length > 0) && (
          <div className="border border-gray-200 rounded-lg">
            <div className="p-3 border-b border-gray-200 bg-gray-50 space-y-2">
              <h4 className="font-medium text-gray-900">Full plan</h4>
              <SearchBox value={planSearch} onChange={setPlanSearch} placeholder="Search school, code, LGA, supervisor…" />
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {planGroups.map((sup) => {
                const isOpen = searching || expandedSupervisors.has(sup.id);
                return (
                  <div key={sup.id}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(setExpandedSupervisors, sup.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      {isOpen ? <IconChevronDown className="h-4 w-4 text-gray-400" /> : <IconChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-medium text-gray-900 flex-1 truncate">{sup.name}</span>
                      <Badge variant="primary">{searching ? `${sup.shown} of ${sup.total}` : sup.total}</Badge>
                    </button>
                    {isOpen && (
                      <div className="pb-2">
                        {sup.lgas.map((group) => (
                          <div key={group.key}>
                            <div className="px-4 sm:px-8 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                              {[group.lga || 'No LGA', group.state].filter(Boolean).join(', ')} ({group.schools.length})
                            </div>
                            {group.schools.map((school) => (
                              <div key={school.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-8 py-1.5 text-sm">
                                <span className="min-w-0 text-gray-800">
                                  {school.name}
                                  {school.code && <span className="text-gray-400"> · {school.code}</span>}
                                </span>
                                <NeedBadges school={school} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {unassignedShown.length > 0 && (
                <div>
                  <div className="px-3 py-2.5 flex items-center gap-2 bg-amber-50">
                    <IconAlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-medium text-amber-800 flex-1">Unassigned schools</span>
                    <Badge variant="warning">{unassignedShown.length}</Badge>
                  </div>
                  {unassignedShown.map((school) => (
                    <div key={school.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-8 py-1.5 text-sm">
                      <span className="min-w-0 text-gray-800">
                        {school.name}
                        <span className="text-gray-400"> · {[school.lga, school.state].filter(Boolean).join(', ')}</span>
                      </span>
                      <NeedBadges school={school} />
                    </div>
                  ))}
                </div>
              )}

              {searching && planGroups.length === 0 && unassignedShown.length === 0 && (
                <p className="p-6 text-center text-sm text-gray-500">No schools match your search.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAutoSuccess = () => (
    <div className="space-y-4">
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <IconCheck className="h-6 w-6 text-green-600" />
        </div>
        <h4 className="text-lg font-medium text-green-800 mb-1">Assignments created</h4>
        <p className="text-green-600">
          {result?.assigned_count || 0} schools assigned to {result?.supervisor_count || 0} supervisors
        </p>
      </div>
      {result?.unassigned_count > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {result.unassigned_count} schools could not be assigned and remain available for another run.
        </div>
      )}
      {result?.warnings?.length > 0 && (
        <ul className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 list-disc list-inside">
          {result.warnings.slice(0, 5).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <strong>Tip:</strong> You can undo this run by rolling back Batch #{result?.batch_id} from Batch history.
      </div>
    </div>
  );

  // ==========================================================================
  // MANUAL steps
  // ==========================================================================

  const renderManualPick = () => {
    const searching = manualSearch.trim() !== '';
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="capture-manual-scope" className="block text-sm font-medium text-gray-700 mb-1">
            Which schools
          </label>
          <Select id="capture-manual-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} ({(options?.counts?.[s.value] ?? 0).toLocaleString()})
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 mt-1">Schools that already have a supervisor assigned are not listed.</p>
        </div>

        <SearchBox value={manualSearch} onChange={setManualSearch} placeholder="Search school, code, LGA, state…" />

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            <span className="font-medium text-gray-900">{selectedSchoolIds.size}</span> selected of{' '}
            {visibleEligible.length.toLocaleString()} shown
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              className="text-primary-600 hover:underline"
              onClick={() => setSelectedSchoolIds(new Set(visibleEligible.map((s) => s.id)))}
              disabled={visibleEligible.length === 0}
            >
              Select all shown
            </button>
            <button
              type="button"
              className="text-gray-500 hover:underline"
              onClick={() => setSelectedSchoolIds(new Set())}
              disabled={selectedSchoolIds.size === 0}
            >
              Clear
            </button>
          </span>
        </div>

        <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto divide-y divide-gray-100">
          {loadingEligible ? (
            <div className="py-12 text-center text-gray-500">
              <IconLoader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading schools…
            </div>
          ) : manualGroups.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              {searching ? 'No schools match your search.' : 'No unassigned schools in this scope.'}
            </p>
          ) : (
            manualGroups.map((group) => {
              const isOpen = searching || expandedGroups.has(group.key);
              const selectedCount = group.schools.filter((s) => selectedSchoolIds.has(s.id)).length;
              const allOn = selectedCount === group.schools.length;
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                    <input
                      type="checkbox"
                      aria-label={`Select all in ${group.lga || 'No LGA'}`}
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedCount > 0 && !allOn;
                      }}
                      onChange={() => toggleGroup(group)}
                      className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(setExpandedGroups, group.key)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      {isOpen ? <IconChevronDown className="h-4 w-4 text-gray-400" /> : <IconChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-medium text-gray-900 truncate">
                        {[group.lga || 'No LGA', group.state].filter(Boolean).join(', ')}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {selectedCount}/{group.schools.length}
                      </span>
                    </button>
                  </div>
                  {isOpen &&
                    group.schools.map((school) => {
                      const checked = selectedSchoolIds.has(school.id);
                      return (
                        <label
                          key={school.id}
                          className={cn(
                            'flex items-start gap-3 px-3 py-2 cursor-pointer',
                            checked ? 'bg-primary-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSchool(school.id)}
                            className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-gray-900">
                              {school.name}
                              {school.code && <span className="text-gray-400"> · {school.code}</span>}
                            </span>
                            {school.ward && <span className="block text-xs text-gray-500">{school.ward}</span>}
                          </span>
                          <NeedBadges school={school} />
                        </label>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderManualSupervisor = () => {
    const chosen = supervisors.find((s) => String(s.id) === String(manualSupervisorId));
    return (
      <div className="space-y-4">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Assigning <span className="font-medium">{selectedSchoolIds.size}</span> school
          {selectedSchoolIds.size === 1 ? '' : 's'}
          {sessionName ? <> for {sessionName}</> : null}.
        </div>
        <div>
          <label htmlFor="capture-manual-supervisor" className="block text-sm font-medium text-gray-700 mb-1">
            Supervisor
          </label>
          <Select
            id="capture-manual-supervisor"
            value={manualSupervisorId}
            onChange={(e) => setManualSupervisorId(e.target.value)}
          >
            <option value="">Select a supervisor…</option>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.current_assignments || 0} assigned)
              </option>
            ))}
          </Select>
        </div>
        {chosen && (
          <p className="text-sm text-gray-600">
            {chosen.name} will have {(chosen.current_assignments || 0) + selectedSchoolIds.size} schools after this
            assignment.
          </p>
        )}
      </div>
    );
  };

  const renderManualDone = () => (
    <div className="space-y-4">
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <IconCheck className="h-6 w-6 text-green-600" />
        </div>
        <h4 className="text-lg font-medium text-green-800 mb-1">Assignment complete</h4>
        <p className="text-green-700">
          {manualResult?.assigned_count ?? 0} assigned
          {manualResult?.skipped_count > 0 && <>, {manualResult.skipped_count} skipped</>}
        </p>
      </div>
      {manualResult?.skipped_count > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Skipped schools already had a supervisor assigned or are no longer eligible.
        </div>
      )}
    </div>
  );

  // ==========================================================================
  // Chrome
  // ==========================================================================

  const renderModeToggle = () => {
    const locked = loading || step === 'success' || manualStep === 'done';
    const items = [
      { value: 'auto', label: 'Auto', icon: IconWand },
      { value: 'manual', label: 'Manual', icon: IconHandClick },
    ];
    return (
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 mb-4" role="tablist">
        {items.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            disabled={locked}
            onClick={() => setMode(value)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              mode === value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              locked && 'opacity-60 cursor-not-allowed'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    );
  };

  const renderAutoStepper = () => {
    if (step === 'success') return null;
    const currentIndex = AUTO_STEPS.findIndex((s) => s.key === step);
    return (
      <div className="mb-6">
        <Stepper>
          {AUTO_STEPS.map((s, index) => (
            <Step
              key={s.key}
              step={index + 1}
              title={s.title}
              status={index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'}
              isLast={index === AUTO_STEPS.length - 1}
              onClick={index < currentIndex ? () => setStep(s.key) : undefined}
            />
          ))}
        </Stepper>
      </div>
    );
  };

  const spinner = <IconLoader2 className="h-4 w-4 animate-spin mr-2" />;

  const renderAutoFooter = () => {
    if (step === 'success') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button
            onClick={() => {
              setStep('scope');
              setPreview(null);
              setResult(null);
            }}
          >
            <IconRefresh className="h-4 w-4 mr-2" />
            Assign More
          </Button>
        </div>
      );
    }
    if (step === 'preview') {
      const count = preview?.assigned_count ?? preview?.assignments?.length ?? 0;
      return (
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="outline" onClick={() => setStep('options')} disabled={loading}>
            <IconArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleReshuffle} disabled={loading || count === 0}>
              <IconArrowsShuffle className="h-4 w-4 mr-2" />
              Reshuffle
            </Button>
            <Button onClick={handleExecute} disabled={loading || count === 0}>
              {loading ? spinner : <IconCheck className="h-4 w-4 mr-2" />}
              Assign {count} Schools
            </Button>
          </div>
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
          <Button onClick={() => runPreview()} disabled={loading || !sessionId}>
            {loading ? spinner : <IconWand className="h-4 w-4 mr-2" />}
            Preview Plan
          </Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose}>Cancel</Button>
        <Button onClick={() => setStep('options')} disabled={loadingOptions || !sessionId}>
          Next: Options
          <IconArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  };

  const renderManualFooter = () => {
    if (manualStep === 'done') {
      return (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button
            onClick={() => {
              setManualStep('pick');
              setManualResult(null);
              setManualSupervisorId('');
              loadEligible();
            }}
          >
            <IconRefresh className="h-4 w-4 mr-2" />
            Assign More
          </Button>
        </div>
      );
    }
    if (manualStep === 'supervisor') {
      return (
        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={() => setManualStep('pick')} disabled={loading}>
            <IconArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleBulkAssign} disabled={loading || !manualSupervisorId || selectedSchoolIds.size === 0}>
            {loading ? spinner : <IconCheck className="h-4 w-4 mr-2" />}
            Assign {selectedSchoolIds.size} Schools
          </Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose}>Cancel</Button>
        <Button onClick={() => setManualStep('supervisor')} disabled={selectedSchoolIds.size === 0}>
          Next: Supervisor
          <IconArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  };

  const title =
    mode === 'auto'
      ? step === 'success' ? 'Auto Assignment Complete' : 'Auto Assign School Capture'
      : manualStep === 'done' ? 'Assignment Complete' : 'Manual Assign School Capture';

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <IconMapPin className="h-5 w-5 text-primary-600" />
          {title}
        </div>
      }
      description={sessionName ? `Session: ${sessionName}` : undefined}
      width="4xl"
      footer={mode === 'auto' ? renderAutoFooter() : renderManualFooter()}
    >
      {renderModeToggle()}
      {mode === 'auto' ? (
        <>
          {renderAutoStepper()}
          {step === 'scope' && renderScopeStep()}
          {step === 'options' && renderOptionsStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'success' && renderAutoSuccess()}
        </>
      ) : (
        <>
          {manualStep === 'pick' && renderManualPick()}
          {manualStep === 'supervisor' && renderManualSupervisor()}
          {manualStep === 'done' && renderManualDone()}
        </>
      )}
    </Dialog>
  );
}
