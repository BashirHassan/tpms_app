/**
 * Shared validation invariants for auto-posting engine tests (spec §46).
 *
 * Re-derives everything from `assignments` alone - never trusts the engine's own
 * `statistics` bookkeeping - then cross-checks the reported statistics agree.
 */
function assertValidSolution(assignments, supervisors, slots, numberOfPostings, maxAssignments, statistics) {
  const slotIndex = new Set(slots.map((s) => `${s.school_id}-${s.group_number}-${s.visit_number}`));
  const supervisorIndex = new Map(supervisors.map((s) => [s.id, s]));

  const seenSlots = new Set();
  const perSupervisor = new Map();

  for (const a of assignments) {
    const slotKey = `${a.school_id}-${a.group_number}-${a.visit_number}`;

    if (!slotIndex.has(slotKey)) {
      throw new Error(`Assignment references a slot that was not supplied: ${slotKey}`);
    }
    if (seenSlots.has(slotKey)) {
      throw new Error(`Slot assigned more than once: ${slotKey}`);
    }
    seenSlots.add(slotKey);

    if (!supervisorIndex.has(a.supervisor_id)) {
      throw new Error(`Assignment references a supervisor that was not supplied: ${a.supervisor_id}`);
    }

    if (a.visit_number > numberOfPostings) {
      throw new Error(`visit_number ${a.visit_number} exceeds numberOfPostings ${numberOfPostings}`);
    }

    perSupervisor.set(a.supervisor_id, (perSupervisor.get(a.supervisor_id) || 0) + 1);
  }

  for (const [id, count] of perSupervisor) {
    const supervisor = supervisorIndex.get(id);
    if (count > supervisor.remaining_slots) {
      throw new Error(
        `Supervisor ${id} received ${count} assignments, exceeding remaining_slots ${supervisor.remaining_slots}`
      );
    }
  }

  if (Number.isFinite(maxAssignments) && assignments.length > maxAssignments) {
    throw new Error(`${assignments.length} assignments exceed maxAssignments ${maxAssignments}`);
  }

  if (statistics) {
    if (statistics.total_assignments !== assignments.length) {
      throw new Error(
        `statistics.total_assignments (${statistics.total_assignments}) does not match actual assignment count (${assignments.length})`
      );
    }
    const actualRepeats = assignments.filter((a) => a.repeat_school).length;
    if (statistics.repeat_school_assignments !== actualRepeats) {
      throw new Error(
        `statistics.repeat_school_assignments (${statistics.repeat_school_assignments}) does not match actual repeat count (${actualRepeats})`
      );
    }
  }

  return true;
}

module.exports = { assertValidSolution };
