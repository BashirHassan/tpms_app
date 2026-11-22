/**
 * Supervisor School Data Capture
 * Every school the Head of TP allocated to this supervisor, grouped by LGA,
 * with a capture panel to record GPS location and principal details.
 * Submissions land in School Update Requests as pending.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatsCard, StatsGrid } from '../../components/ui/StatsCard';
import { Skeleton } from '../../components/ui/Skeleton';
import SchoolCaptureRow from '../../components/schoolCapture/SchoolCaptureRow';
import SchoolCapturePanel from '../../components/schoolCapture/SchoolCapturePanel';
import { errorMessage } from '../../components/schoolCapture/captureConstants';
import { cn } from '../../utils/helpers';
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCircleX,
  IconPlayerPlay,
  IconRefresh,
  IconSchool,
  IconSearch,
  IconTarget,
} from '@tabler/icons-react';

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'todo', label: 'To do', match: (p) => p === 'not_started' || p === 'in_progress' },
  { key: 'pending', label: 'Pending review', match: (p) => p === 'pending' },
  { key: 'rejected', label: 'Rejected', match: (p) => p === 'rejected' },
  { key: 'completed', label: 'Completed', match: (p) => p === 'completed' },
];

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
    </div>
  );
}

function StateCard({ icon: Icon, title, children }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Icon className="h-7 w-7 text-gray-500" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-600">{children}</div>
      </CardContent>
    </Card>
  );
}

function SupervisorSchoolCapturePage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [payload, setPayload] = useState(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      setError(null);
      if (silent) setRefreshing(true);
      const res = await schoolCaptureApi.getMySchools();
      setPayload(res.data);
      setFeatureDisabled(false);
    } catch (err) {
      if (err?.response?.status === 403 && err.response.data?.errorCode === 'FEATURE_DISABLED') {
        setFeatureDisabled(true);
      } else if (silent && payload) {
        toast.error(errorMessage(err, 'Failed to refresh your schools'));
      } else {
        setError(errorMessage(err, 'Failed to load your allocated schools'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const schools = useMemo(() => payload?.data || [], [payload]);
  const summary = payload?.summary || {};

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    return schools.filter((s) => {
      if (!active.match(s.progress)) return false;
      if (!q) return true;
      return [s.school_name, s.school_code, s.lga].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [schools, search, filter]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((s) => {
      const key = s.lga || 'Unknown LGA';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const filterCounts = useMemo(() => {
    const counts = {};
    FILTERS.forEach((f) => { counts[f.key] = schools.filter((s) => f.match(s.progress)).length; });
    return counts;
  }, [schools]);

  const toggleGroup = (name) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const openSchool = useMemo(() => schools.find((s) => s.id === openId) || null, [schools, openId]);
  const searching = search.trim().length > 0;

  if (loading) return <PageSkeleton />;

  if (featureDisabled) {
    return (
      <StateCard icon={IconAlertCircle} title="School data capture is not enabled">
        This feature is not enabled for your institution. Please contact the Head of Teaching Practice.
      </StateCard>
    );
  }

  if (error) {
    return (
      <StateCard icon={IconAlertCircle} title="Could not load your schools">
        <p className="mb-4">{error}</p>
        <Button variant="outline" onClick={() => { setLoading(true); load(); }}>
          <IconRefresh className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </StateCard>
    );
  }

  const total = summary.total ?? schools.length;
  const done = summary.completed ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">School Data Capture</h1>
          <p className="mt-1 text-sm text-gray-500">
            Record the GPS location and principal details of the schools allocated to you.
            {payload?.session?.name && ` Session: ${payload.session.name}.`}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh"
          onClick={() => load({ silent: true })}
          disabled={refreshing}
          className="shrink-0"
        >
          <IconRefresh className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {schools.length === 0 ? (
        <StateCard icon={IconSchool} title="No schools assigned yet">
          No schools have been assigned to you yet. Check back after the Head of TP allocates schools.
        </StateCard>
      ) : (
        <>
          <StatsGrid columns={4} className="!grid-cols-2">
            <StatsCard label="To do" value={(summary.not_started ?? 0) + (summary.in_progress ?? 0)} icon={IconPlayerPlay} tone="amber" subValue={`${summary.in_progress ?? 0} in progress`} />
            <StatsCard label="Pending review" value={summary.pending ?? 0} icon={IconClock} tone="blue" />
            <StatsCard label="Rejected" value={summary.rejected ?? 0} icon={IconCircleX} tone="red" />
            <StatsCard label="Completed" value={done} icon={IconCheck} tone="green" subValue={`of ${total}`} />
          </StatsGrid>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5"><IconTarget className="h-4 w-4" />Overall progress</span>
                <span>{done} / {total} ({pct}%)</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Input
              type="search"
              placeholder="Search school, code or LGA"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<IconSearch className="h-4 w-4" />}
            />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors',
                    filter === f.key
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {f.label} <span className="opacity-70">({filterCounts[f.key]})</span>
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <StateCard icon={IconSearch} title="No matching schools">
              Try a different search or filter.
            </StateCard>
          ) : (
            <div className="space-y-3">
              {groups.map(([lga, items]) => {
                const isCollapsed = collapsed.has(lga) && !searching;
                const doneInGroup = items.filter((s) => s.progress === 'completed').length;
                return (
                  <Card key={lga} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(lga)}
                      aria-expanded={!isCollapsed}
                      className="flex min-h-[52px] w-full items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-left"
                    >
                      <span className="min-w-0 break-words text-sm font-semibold text-gray-900">{lga}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                        {doneInGroup}/{items.length} done
                        <IconChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                      </span>
                    </button>
                    {!isCollapsed && (
                      <ul className="divide-y divide-gray-100">
                        {items.map((s) => (
                          <SchoolCaptureRow key={s.id} school={s} onOpen={setOpenId} />
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {openSchool && (
        <SchoolCapturePanel
          school={openSchool}
          session={payload?.session}
          minDistance={payload?.min_correction_distance_m}
          onClose={() => setOpenId(null)}
          onSubmitted={() => load({ silent: true })}
        />
      )}
    </div>
  );
}

export default SupervisorSchoolCapturePage;
