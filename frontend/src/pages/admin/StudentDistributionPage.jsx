/**
 * Students Distribution Page
 * Where the session's students are placed, broken down by state and LGA.
 *
 * State/LGA come from the school's master_schools record, matching the acceptances
 * list filters, so a state's count here reconciles with filtering that list to the
 * same state.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { acceptancesApi, sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { StatsCard, StatsGrid } from '../../components/ui/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { exportToExcel } from '../../components/ui/DataTable';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatNumber } from '../../utils/helpers';
import {
  IconChevronRight,
  IconDownload,
  IconMap2,
  IconMapPin,
  IconRefresh,
  IconRoute,
  IconSchool,
  IconSearch,
  IconUserCheck,
  IconUserX,
} from '@tabler/icons-react';

const EXPORT_COLUMNS = [
  { accessor: 'state', header: 'STATE' },
  { accessor: 'lga', header: 'LGA' },
  { accessor: 'student_count', header: 'STUDENTS' },
  { accessor: 'school_count', header: 'SCHOOLS' },
  { accessor: 'share_of_total', header: 'SHARE_OF_TOTAL_%' },
];

const percentOf = (value, total) => (total > 0 ? (value / total) * 100 : 0);

function ShareBar({ percent, tone = 'primary' }) {
  const toneClass = tone === 'primary' ? 'bg-primary-500' : 'bg-teal-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-[3rem] overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${toneClass}`}
          style={{ width: `${Math.min(100, Math.max(percent, percent > 0 ? 2 : 0))}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-gray-600">
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

function StudentDistributionPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [distribution, setDistribution] = useState(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const fetchSessions = useCallback(async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((session) => session.is_current) || sessionsData[0];
        setSelectedSession(String(current.id));
      }
    } catch (error) {
      toast.error('Failed to load sessions');
    }
  }, [toast]);

  const fetchDistribution = useCallback(async () => {
    setLoading(true);
    try {
      const response = await acceptancesApi.getDistribution({ session_id: selectedSession });
      setDistribution(response.data.data || null);
    } catch (error) {
      toast.error('Failed to load students distribution');
      setDistribution(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSession, toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (selectedSession) fetchDistribution();
  }, [selectedSession, fetchDistribution]);

  const summary = distribution?.summary;
  const states = useMemo(() => distribution?.states || [], [distribution]);
  const placedStudents = summary?.placed_students || 0;

  // Matching a state keeps all its LGAs; matching only an LGA narrows to those LGAs
  // and auto-expands the parent so the hit is visible without another click.
  const { visibleStates, autoExpanded } = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return { visibleStates: states, autoExpanded: null };

    const matched = [];
    const toExpand = new Set();

    for (const state of states) {
      if (state.state.toLowerCase().includes(term)) {
        matched.push(state);
        continue;
      }
      const lgas = state.lgas.filter((entry) => entry.lga.toLowerCase().includes(term));
      if (lgas.length > 0) {
        matched.push({ ...state, lgas });
        toExpand.add(state.state);
      }
    }

    return { visibleStates: matched, autoExpanded: toExpand };
  }, [states, search]);

  const isExpanded = (stateName) => autoExpanded?.has(stateName) || expanded.has(stateName);

  const toggleState = (stateName) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stateName)) next.delete(stateName);
      else next.add(stateName);
      return next;
    });
  };

  const concentration = useMemo(() => {
    if (states.length === 0 || placedStudents === 0) return null;
    const top = states.slice(0, 3);
    const share = percentOf(
      top.reduce((sum, state) => sum + state.student_count, 0),
      placedStudents
    );
    return {
      names: top.map((state) => state.state).join(', '),
      count: top.length,
      share,
    };
  }, [states, placedStudents]);

  const handleExport = async () => {
    const rows = states.flatMap((state) =>
      state.lgas.length > 0
        ? state.lgas.map((entry) => ({
            state: state.state,
            lga: entry.lga,
            student_count: entry.student_count,
            school_count: entry.school_count,
            share_of_total: percentOf(entry.student_count, placedStudents).toFixed(1),
          }))
        : [{
            state: state.state,
            lga: '-',
            student_count: state.student_count,
            school_count: state.school_count,
            share_of_total: percentOf(state.student_count, placedStudents).toFixed(1),
          }]
    );

    if (rows.length === 0) {
      toast.error('Nothing to export for this session');
      return;
    }

    try {
      await exportToExcel(rows, EXPORT_COLUMNS, 'students_distribution');
    } catch (error) {
      toast.error('Failed to export distribution');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students Distribution</h1>
          <p className="text-sm text-gray-500">
            Where students are placed across states and LGAs for the selected teaching practice session
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedSession}
            onChange={(event) => {
              setSelectedSession(event.target.value);
              setExpanded(new Set());
              setSearch('');
            }}
            className="text-sm sm:w-48"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current ? '(Current)' : ''}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" onClick={fetchDistribution} className="gap-2 shrink-0">
            <IconRefresh className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <StatsGrid columns={5}>
        <StatsCard title="Placed Students" value={summary?.placed_students} icon={IconUserCheck} index={0} />
        <StatsCard title="States Covered" value={summary?.states_covered} icon={IconMapPin} tone="green" index={1} />
        <StatsCard title="LGAs Covered" value={summary?.lgas_covered} icon={IconRoute} tone="amber" index={2} />
        <StatsCard title="Schools" value={summary?.schools_covered} icon={IconSchool} tone="purple" index={3} />
        <StatsCard title="Not Placed" value={summary?.unplaced_students} icon={IconUserX} tone="red" index={4} />
      </StatsGrid>

      {concentration && (
        <p className="text-sm text-gray-600">
          Top {concentration.count} {concentration.count === 1 ? 'state' : 'states'} (
          <span className="font-medium text-gray-900">{concentration.names}</span>) hold{' '}
          <span className="font-semibold text-gray-900">{concentration.share.toFixed(1)}%</span> of all placements.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Breakdown by State</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search state or LGA..."
                className="pl-9 text-sm sm:w-56"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded(new Set(states.map((state) => state.state)))}
                disabled={states.length === 0}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded(new Set())}
                disabled={states.length === 0}
              >
                Collapse all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={states.length === 0}
                className="gap-2"
              >
                <IconDownload className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : visibleStates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <IconMap2 className="h-10 w-10 text-gray-300" />
              <p className="font-medium text-gray-900">
                {states.length === 0 ? 'No placements recorded for this session yet' : 'No matching state or LGA'}
              </p>
              <p className="text-sm text-gray-500">
                {states.length === 0
                  ? 'Once students submit acceptance forms, their spread appears here'
                  : 'Try a different search term'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="w-12 px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Students</th>
                    <th className="w-56 px-3 py-2 font-medium">Share</th>
                    <th className="w-20 px-3 py-2 text-right font-medium">LGAs</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Schools</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStates.map((state, index) => {
                    const open = isExpanded(state.state);
                    return (
                      <Fragment key={state.state}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => toggleState(state.state)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleState(state.state);
                            }
                          }}
                          className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        >
                          <td className="px-3 py-2.5 text-gray-500 tabular-nums">{index + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <IconChevronRight
                                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                              />
                              <span className="font-medium text-gray-900">{state.state}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                            {formatNumber(state.student_count)}
                          </td>
                          <td className="px-3 py-2.5">
                            <ShareBar percent={percentOf(state.student_count, placedStudents)} />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{state.lga_count}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                            {formatNumber(state.school_count)}
                          </td>
                        </tr>

                        {open &&
                          state.lgas.map((entry) => (
                            <tr key={`${state.state}-${entry.lga}`} className="border-b border-gray-100 bg-gray-50/70">
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 pl-10 text-gray-700">{entry.lga}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {formatNumber(entry.student_count)}
                              </td>
                              <td className="px-3 py-2">
                                <ShareBar
                                  percent={percentOf(entry.student_count, state.student_count)}
                                  tone="secondary"
                                />
                              </td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                {formatNumber(entry.school_count)}
                              </td>
                            </tr>
                          ))}

                        {open && state.lgas.length === 0 && (
                          <tr key={`${state.state}-empty`} className="border-b border-gray-100 bg-gray-50/70">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 pl-10 text-sm text-gray-500" colSpan={5}>
                              No LGA recorded for these schools
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default StudentDistributionPage;
