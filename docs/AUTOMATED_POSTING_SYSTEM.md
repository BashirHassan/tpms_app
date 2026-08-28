# Automated Supervisor Posting System

> **Feature:** One-click automated posting of supervisors to schools with configurable criteria
> **Status:** Proposed
> **Created:** February 3, 2026

---

## Executive Summary

This document outlines the implementation of an **automated posting system** that allows administrators to bulk-assign supervisors to schools with a single click. Instead of manually selecting each supervisor and school in the multiposting page, the system will intelligently distribute postings based on configurable criteria.

### Key Features

1. **Number of Postings** - How many primary postings each supervisor receives, or an exact set of visits via `visit_numbers`
2. **Posting Type** - Random, Route-based, or LGA-based distribution
3. **Priority System** - Higher-ranked supervisors systematically receive the harder/farther geographical work
4. **Deterministic, lexicographically-optimized allocation** - not round-robin: the engine builds several candidate solutions and refines the best one with bounded local search (see "The Allocation Engine" below)
5. **Scoped Runs** - Narrow a run to some supervisors and some places, so a posting round can be worked in pieces instead of one institution-wide batch

### Scoped Runs

A posting round rarely arrives all at once: acceptances come in state by state, and one
faculty's supervisors are ready before the rest. A run can therefore be narrowed on any
combination of:

| Scope | Effect |
|-------|--------|
| **Supervisors** | Only the named supervisors are considered |
| **Faculty** | Narrows the supervisor pool |
| **States** | Only schools in those states |
| **LGAs** | Only those LGAs, each identified together with its state |
| **Routes** | Only schools on those routes |
| **Visits** | Exact visits to fill (e.g. Visit 2 alone, or a non-contiguous set like [1, 3]), overriding "visits 1 through N" |

**Every list is optional, and an empty list means "no narrowing"** - a run with nothing
selected behaves exactly as it did before scoping existed. `GET /auto-posting/options`
reports every picker's counts from the currently eligible, unscoped pool, so the wizard
never offers an area with nothing left to fill.

Two properties matter:

- **LGAs are matched as `(state, lga)` pairs**, never as a bare list of names. Several
  Nigerian states share LGA names, so `ms.lga IN (...)` alone would drag in schools from
  a state the admin never selected.
- **A selection that resolves to nothing is an error, not a widening.** Silently ignoring
  an unresolvable `supervisor_ids` would post the whole institution when the admin asked
  for three people, so `resolveAutoPostFilters()` throws `ValidationError` instead, naming
  the offending id(s).

The full scope is persisted into `auto_posting_batches.criteria`, so a disputed or
rolled-back batch can be read back without guessing what it covered.

### Posting Type Behavior

| Type | Behavior |
|------|----------|
| **Random** | Supervisor can be posted to any available school regardless of location |
| **Route-based** | Within the **same visit**, all postings stay in the same route. Different visits can be in different routes. |
| **LGA-based** | Within the **same visit**, all postings stay in the same LGA. Different visits can be in different LGAs. |

> **Example:** If Dr. Aminu has Visit 1 postings to schools in Route A, all his Visit 1 assignments will be in Route A. His Visit 2 postings can be in Route B. This allows supervisors to focus on a single geographic area per trip.

### The Allocation Engine

The allocation strategy lives in `backend/src/services/autoPostingEngine.js` as pure functions - no database access - so it can be reasoned about and unit tested in isolation. The controller only fetches data, applies the dean allocation, and persists the result. This is the same staged pipeline used by the sibling MedeePay-pattern institution, ported onto this project's school/route/LGA data model.

**Constraint hierarchy - lexicographic, not a weighted sum.** Earlier revisions of this engine scored a solution with a weighted cost sum (see history below). The current engine instead compares candidate solutions field-by-field, in this fixed priority order, and the *first* field that differs decides the winner - a tiny travel improvement can never buy back a broken priority ordering or a worse repeat count:

1. **HARD** unassigned slot count
2. **HARD** hard-constraint violations (slot uniqueness, supervisor capacity, dean ceiling, eligible inputs, valid visits)
3. **STRONG** priority inversions - count, then severity (a senior tier averaging a *shorter* journey than a junior tier)
4. **STRONG** cross-LGA/route assignments, then LGA/route fragmentation
5. **SOFT** repeat-school count
6. **SOFT** workload imbalance (stddev of per-supervisor posting counts)
7. **SOFT** travel imbalance (stddev of per-supervisor distance, only compared within an equivalent priority/area group)

**Multiple deterministic candidates.** Rather than one greedy pass, the engine builds five differently-ordered initial solutions (hardest-difficulty-first, largest-demand-first, hardest-to-fit-first, highest-priority-tier-first, visit-balanced) and keeps whichever scores best on the hierarchy above. Priority tiers (grouped by `ranks.priority_number`) get first claim on the geographically hardest work, in proportion to their share of total capacity - so a small senior tier isn't skipped just because a unit doesn't fit it whole; it's given as much as it can take, with the genuine leftover spilling to the next most-senior tier before ever reaching a junior one.

**Constrained local improvement.** The winning candidate is then refined by four named, hierarchy-validated moves - reassign one slot within a unit (Move A), swap two supervisors' full allocations within a unit (Move B), exchange whole-unit ownership between two same-tier supervisors (Move C), and a bounded cross-tier exchange that only ever shrinks an existing priority inversion (Move D). Every move is accepted only when it is not lexicographically worse than what it replaces, and A-C never cross a priority tier boundary.

**Dedicated equalization passes.** Two further passes run after local search: `equalizeTravel` narrows the spread of cumulative distance per supervisor by peeling a busy supervisor's costliest assignment onto the least-loaded compatible peer without ever creating a new out-of-area trip; `equalizeWorkload` narrows the posting-count spread to at most 3, preferring a same-tier donor/receiver pair and falling back to a short cross-tier top-up only when necessary.

**Authoritative validation.** A final pass re-derives every hard constraint from the assignments alone - never trusting the optimizer's own running counters - and deterministically repairs (drops the minimum offending assignments) if anything still fails.

**Visit selection.** `visit_numbers` (an exact, possibly non-contiguous set of visits, e.g. `[1, 3]`) is understood natively by the engine via `options.visitNumbers`, and supersedes the `number_of_postings` "visits 1 through N" shorthand when given. `statistics.visits_included` mirrors back whichever form was used (a number for the shorthand, the array for an explicit selection) so the dialog can render either.

### Reported Statistics

Both preview and execute return, alongside the legacy counts kept for the dialog (`affinity_breaks`, `repeat_school_assignments` / `repeat_school_details`, `load { min, max, stddev }`, `travel_km { min, max, mean }`, `distance_by_rank`, `local_search { swaps_applied, passes, cost_before, cost_after }`, `quota_skipped`, `data_quality`), a richer set of fields from the engine:

- `workload` / `travel` - full distribution (`min`, `max`, `mean`, `median`, `standard_deviation`)
- `repeats` - `{ count, rate, unavoidable_count }`
- `geography` - `{ cross_lga_assignments, cross_route_assignments, fragmented_assignments, unplaced_units }`
- `priority` - `{ enabled, inversion_count, inversion_severity, tier_overlap, monotonicity_score, tiers }`
- `optimization` - `{ strategy, candidate_solutions, improvement_passes, moves_applied: { A, B, C, D }, travel_equalization_moves, budget_exhausted }`

`local_search.cost_before` / `cost_after` remain for display continuity - they are a diagnostic scalarization of the objective vector (huge, strictly descending coefficients per field, so it can never mask a regression in a higher-priority field) and are never what the engine itself decides on.

### Dean Posting Allocation

Auto-posting is bound by the same quota as manual multiposting. When the acting user is a dean (not admin-level), the engine is capped at `allocated_postings - used_postings`, and `used_postings` is advanced **inside the same transaction** that creates the postings, so a rollback cannot leave the counter ahead of reality.

### School Variety Constraint

A supervisor is posted to a given school **at most once per session** - across all visits *and* all groups. Sending the same person back to the same school for Visit 1, 2 and 3 defeats the purpose of multiple supervision visits.

How it is enforced in `runAutoPostingAlgorithm`:

1. **History is seeded from the database.** `getSupervisorSchoolHistory()` builds `Map<supervisor_id, Set<institution_school_id>>` from every non-cancelled posting in the session - manual postings, earlier auto-posting batches, and merged/dependent postings all count. An existing posting therefore counts as the first visit to that school.
2. **Repeats are a soft objective term, not blocked.** `repeatCount` sits above workload and travel balance in the lexicographic hierarchy, so the engine exhausts every alternative supervisor with capacity before it accepts a solution with a higher repeat count. The slot is still filled rather than dropped.
3. **Slot assignment avoids them up front.** Within a unit, whichever seated supervisor has the lowest repeat cost for a given school is preferred when the slots are handed out.
4. **Local search removes the leftovers.** Any assignment still flagged as a repeat is a candidate for Move A/B/C; a reassignment or swap is applied whenever it is not lexicographically worse.
5. **Reporting.** `statistics.repeat_school_assignments` and `statistics.repeat_school_details` are returned by both preview and execute, and surfaced in the Auto-Post dialog alongside a warning. Only genuinely unavoidable repeats survive - where no other supervisor had capacity.

**Flag:** `avoid_repeat_schools` (boolean, default `true`) on both `/auto-posting/preview` and `/auto-posting/execute`, exposed as the **Avoid Repeating Schools** switch in the dialog. Setting it to `false` passes `avoidRepeatSchools: false` to the engine, so repeats stop being penalised in the objective *and* stop being reported.

### Access Control

Auto-posting creates postings in bulk across a whole institution, so all five endpoints (`options`, `preview`, `execute`, `history`, `rollback`) are restricted to **`super_admin`**. Heads of TP and deans post manually through the multiposting page instead; the Auto-Post button is hidden for them to match.

---

## Current System Analysis

### Current Multiposting Flow

**Location:** `frontend/src/pages/admin/MultipostingPage.jsx`

1. Admin selects session
2. Admin manually selects supervisor from dropdown
3. Admin manually selects school from dropdown
4. Admin selects group number and visit number
5. Clicks "Post" for each assignment
6. Repeat for every posting needed

**Pain Points:**
- Time-consuming for large institutions (100+ supervisors)
- Human error in distribution (some supervisors get harder schools, some easier)
- Inconsistent priority handling
- No systematic distance-based allocation

### Current Data Model

**Supervisors (users table):**
```sql
SELECT u.id, u.name, u.rank_id, r.name as rank_name
FROM users u
LEFT JOIN ranks r ON u.rank_id = r.id
WHERE u.role NOT IN ('super_admin', 'student') AND u.status = 'active';
```

**Schools (institution_schools + master_schools):**
```sql
SELECT isv.id, ms.name, ms.lga, isv.route_id, isv.distance_km, isv.location_category
FROM institution_schools isv
JOIN master_schools ms ON isv.master_school_id = ms.id
WHERE isv.institution_id = ? AND isv.status = 'active';
```

**Ranks Table (current):**
```sql
CREATE TABLE `ranks` (
  `id` bigint(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(20) NOT NULL,
  `local_running_allowance` decimal(10,2),
  `transport_per_km` decimal(10,2),
  `dsa` decimal(10,2),
  `dta` decimal(10,2),
  `tetfund` decimal(10,2),
  -- MISSING: priority_number for auto-posting order
);
```

---

## Database Changes

### 1. Add Priority Number to Ranks Table

```sql
-- Migration: 037_add_rank_priority.sql

-- Add priority_number column to ranks table
-- Lower number = higher priority (1 = highest priority)
-- Supervisors with higher priority get posted first and assigned longest distances
ALTER TABLE `ranks` 
ADD COLUMN `priority_number` int(11) NOT NULL DEFAULT 99 
COMMENT 'Priority for auto-posting: 1=highest, larger=lower priority. Higher priority supervisors get assigned first and receive longest distance schools' 
AFTER `tetfund`;

-- Update existing ranks with default priorities based on typical hierarchy
-- Chief Lecturer = 1 (highest), Principal Lecturer = 2, etc.
UPDATE ranks SET priority_number = 1 WHERE code = 'CL';
UPDATE ranks SET priority_number = 2 WHERE code = 'PL';
UPDATE ranks SET priority_number = 3 WHERE code = 'SL';
UPDATE ranks SET priority_number = 4 WHERE code = 'LI';
UPDATE ranks SET priority_number = 5 WHERE code = 'LII';
UPDATE ranks SET priority_number = 6 WHERE code = 'LIII';
UPDATE ranks SET priority_number = 7 WHERE code = 'AL';

-- Index for efficient ordering
CREATE INDEX idx_ranks_priority ON ranks(institution_id, priority_number);
```

### 2. Add Auto-Posting Log Table (Optional - for audit)

```sql
-- Track auto-posting batches for audit purposes
CREATE TABLE `auto_posting_batches` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `session_id` bigint(20) NOT NULL,
  `initiated_by` bigint(20) NOT NULL,
  `criteria` longtext NOT NULL COMMENT 'JSON: posting criteria used',
  `total_postings_created` int(11) DEFAULT 0,
  `total_supervisors_posted` int(11) DEFAULT 0,
  `status` enum('pending', 'processing', 'completed', 'failed', 'rolled_back') DEFAULT 'pending',
  `error_message` text DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_institution_session` (`institution_id`, `session_id`),
  FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`session_id`) REFERENCES `academic_sessions`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;
```

---

## Auto-Posting Algorithm

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTO-POSTING FLOW                                 │
├─────────────────────────────────────────────────────────────────────┤
│  1. COLLECT INPUTS                                                   │
│     ├─ Number of postings per supervisor (N)                        │
│     ├─ Posting type (random / route / lga)                          │
│     └─ Priority enabled (true/false)                                │
│                                                                      │
│  2. PREPARE DATA                                                     │
│     ├─ Get all eligible supervisors                                 │
│     │   └─ Sort by priority (if enabled) then by existing postings │
│     ├─ Get all available school slots                               │
│     │   └─ Sort by VISIT NUMBER FIRST (all Visit 1s before Visit 2s)│
│     │   └─ Then by posting_type criteria (route/lga/distance)       │
│     └─ Schools distributed serially within each visit               │
│                                                                      │
│  3. ASSIGN SLOTS                                                     │
│     ├─ Iterate through sorted slots (Visit 1 first, then Visit 2...)│
│     ├─ Assign each slot to next available supervisor (round-robin)  │
│     └─ Each supervisor gets 1 posting before any gets 2             │
│                                                                      │
│  4. CREATE POSTINGS                                                  │
│     └─ Bulk insert all assignments                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Algorithm

```
ALGORITHM: AutoPostSupervisors(institutionId, sessionId, criteria)

INPUT:
  - numberOfPostings: int (1 to max_supervision_visits)
  - postingType: enum('random', 'route_based', 'lga_based')
  - priorityEnabled: boolean

OUTPUT:
  - List of created posting assignments

STEPS:

1. VALIDATE INPUTS
   - Ensure numberOfPostings <= session.max_supervision_visits
   - Ensure session is active and not locked

2. FETCH SUPERVISORS
   supervisors = SELECT * FROM users WHERE eligible for posting
   
   IF priorityEnabled:
     ORDER BY rank.priority_number ASC, current_postings ASC, name ASC
   ELSE:
     ORDER BY current_postings ASC, name ASC

3. FETCH AVAILABLE SLOTS
   slots = SELECT schools with available group slots
   
   PRIMARY SORT: visit_number ASC (all Visit 1s first, then Visit 2s, etc.)
   
   SECONDARY SORT based on postingType:
   IF postingType == 'route_based':
     SORT BY route_id, then distance_km DESC (if priority enabled)
   ELSE IF postingType == 'lga_based':
     SORT BY lga, then distance_km DESC (if priority enabled)
   ELSE (random):
     SORT BY distance_km DESC (if priority enabled), then school_id

   This ensures:
   - All Visit 1 slots are processed before any Visit 2 slots
   - Within each visit, schools are distributed in a consistent order
   - Higher priority supervisors get longer distance schools

4. INITIALIZE TRACKING
   assignments = []
   supervisorPostingCount = Map<supervisor_id, count>
   usedSlots = Set<slot_id>

5. ITERATE THROUGH SORTED SLOTS (Visit-First Round-Robin)
   supervisorIndex = 0
   
   FOR each slot IN sortedSlots:  // All Visit 1s come before Visit 2s
     // Find next supervisor with capacity (round-robin)
     attempts = 0
     WHILE attempts < supervisors.length:
       supervisor = supervisors[supervisorIndex]
       currentCount = supervisorPostingCount[supervisor.id]
       
       IF currentCount < numberOfPostings AND currentCount < supervisor.remaining_slots:
         // Assign this slot to this supervisor
         assignments.ADD({
           supervisor_id: supervisor.id,
           school_id: slot.school_id,
           group_number: slot.group_number,
           visit_number: slot.visit_number,  // From the slot itself
           distance_km: slot.distance_km
         })
         
         usedSlots.ADD(slot.id)
         supervisorPostingCount[supervisor.id]++
         BREAK  // Move to next slot
       
       // Move to next supervisor (round-robin)
       supervisorIndex = (supervisorIndex + 1) MOD supervisors.length
       attempts++
     
     IF attempts >= supervisors.length:
       LOG warning: "No supervisor available for slot"

6. CREATE POSTINGS
   Bulk insert all assignments with calculated allowances

7. RETURN RESULT
   Return summary: total postings, per-supervisor counts, any skipped supervisors
```

### Slot Selection Logic

```
FUNCTION: FindNextAvailableSlot(supervisor, postingType, usedSlots, priorityEnabled, visitNumber, supervisorVisitAssignments)

// supervisorVisitAssignments tracks: Map<supervisor_id, Map<visit_number, route_id|lga>>
// This ensures same-visit postings stay in same route/LGA

IF postingType == 'route_based':
  // Check if supervisor already has a route assigned for this visit
  existingRoute = supervisorVisitAssignments[supervisor.id]?.[visitNumber]
  
  IF existingRoute:
    // Must stay in same route for this visit
    slots = GetAvailableSlots(route_id = existingRoute, visit = visitNumber, exclude = usedSlots)
  ELSE:
    // First posting for this visit - assign best available route
    slots = GetAvailableSlots(visit = visitNumber, exclude = usedSlots)
    // When slot is selected, record: supervisorVisitAssignments[supervisor.id][visitNumber] = slot.route_id
  
ELSE IF postingType == 'lga_based':
  // Check if supervisor already has an LGA assigned for this visit
  existingLGA = supervisorVisitAssignments[supervisor.id]?.[visitNumber]
  
  IF existingLGA:
    // Must stay in same LGA for this visit
    slots = GetAvailableSlots(lga = existingLGA, visit = visitNumber, exclude = usedSlots)
  ELSE:
    // First posting for this visit - assign best available LGA
    slots = GetAvailableSlots(visit = visitNumber, exclude = usedSlots)
    // When slot is selected, record: supervisorVisitAssignments[supervisor.id][visitNumber] = slot.lga
  
ELSE:  // random
  slots = GetAllAvailableSlots(exclude = usedSlots)

// Sort slots by distance
IF priorityEnabled:
  // Higher priority supervisors get longest distances
  SORT slots BY distance_km DESC
ELSE:
  // Random order for fairness
  SHUFFLE slots

RETURN slots[0] OR NULL if empty
```

> **Key Constraint:** Once a supervisor receives their first posting for a visit (e.g., Visit 1), all subsequent Visit 1 postings must be in the same route/LGA. This allows Visit 2 to be in a completely different location.

### Route/LGA Assignment Strategy (Per-Visit)

> **Note:** the pseudocode below is legacy and does not reflect the current
> engine - see "The Allocation Engine" near the top of this document for the
> actual design. It's kept here pending a full rewrite of this section; the
> gist below (rank areas by distance, hand the farthest to the most senior
> supervisors) is directionally right but the real implementation buckets by
> each priority tier's *capacity share* (not a 1:1 per-supervisor walk) and
> seats within a tier using repeat-avoidance, not a plain "best available"
> pick - see `planPriorityAllocation`/`assignUnitsToTiers` in
> `autoPostingEngine.js`.

For route-based and LGA-based posting, assignments are tracked **per visit**:

```
FUNCTION: AssignSupervisorsToGroupsPerVisit(supervisors, slots, groupType, priorityEnabled, visitNumber)

// Get available groups for this specific visit
IF groupType == 'route':
  groups = GetRoutesWithSlotsForVisit(slots, visitNumber)
ELSE:
  groups = GetLGAsWithSlotsForVisit(slots, visitNumber)

// Sort groups by total distance capacity for this visit
SORT groups BY totalDistanceCapacityForVisit DESC

// For first-time assignment in this visit:
// Higher priority supervisors get groups with longest distances
FOR each supervisor IN supervisors (sorted by priority):
  IF supervisor has no assignment for visitNumber:
    // Assign to group with most remaining capacity and longest distances
    bestGroup = FindBestAvailableGroup(groups, supervisor)
    supervisor.visitAssignments[visitNumber] = bestGroup.id

RETURN supervisorVisitAssignments
```

**Example Distribution:**

| Supervisor | Rank Priority | Visit 1 Route | Visit 2 Route | Visit 3 Route |
|------------|--------------|---------------|---------------|---------------|
| Dr. Aminu  | 1 (Chief)    | Route A (80km) | Route C (75km) | Route B (70km) |
| Dr. Bello  | 2 (Principal)| Route B (70km) | Route A (65km) | Route D (60km) |
| Dr. Chika  | 3 (Senior)   | Route C (60km) | Route B (55km) | Route A (50km) |

> Each supervisor focuses on **one geographic area per visit trip**, making supervision logistics simpler.

---

## Backend Implementation

### 1. Auto-Posting Controller

```javascript
// backend/src/controllers/autoPostingController.js

const { query, transaction } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Validation schema
const autoPostSchema = z.object({
  body: z.object({
    session_id: z.number().int().positive(),
    number_of_postings: z.number().int().min(1).max(10),
    posting_type: z.enum(['random', 'route_based', 'lga_based']),
    priority_enabled: z.boolean().default(true),
    faculty_id: z.number().int().positive().optional(), // For dean filtering
    dry_run: z.boolean().default(false), // Preview without creating
  }),
});

/**
 * Preview auto-posting results without creating
 * POST /:institutionId/auto-posting/preview
 */
const previewAutoPosting = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = autoPostSchema.safeParse({ body: req.body });
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, number_of_postings, posting_type, priority_enabled, faculty_id } = validation.data.body;

    // Get session
    const session = await getSession(institutionId, session_id);
    if (!session) throw new NotFoundError('Session not found');

    // Validate number_of_postings
    if (number_of_postings > session.max_supervision_visits) {
      throw new ValidationError(
        `Number of postings cannot exceed session limit of ${session.max_supervision_visits}`
      );
    }

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id);
    const slots = await getAvailableSlots(institutionId, session_id, posting_type);

    // Run algorithm (dry run)
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled
    );

    res.json({
      success: true,
      data: {
        preview: true,
        total_supervisors: supervisors.length,
        total_available_slots: slots.length,
        assignments: result.assignments,
        statistics: result.statistics,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Execute auto-posting
 * POST /:institutionId/auto-posting/execute
 */
const executeAutoPosting = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;
    const validation = autoPostSchema.safeParse({ body: req.body });
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, number_of_postings, posting_type, priority_enabled, faculty_id } = validation.data.body;

    // Get session
    const session = await getSession(institutionId, session_id);
    if (!session) throw new NotFoundError('Session not found');

    if (number_of_postings > session.max_supervision_visits) {
      throw new ValidationError(
        `Number of postings cannot exceed session limit of ${session.max_supervision_visits}`
      );
    }

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id);
    const slots = await getAvailableSlots(institutionId, session_id, posting_type);

    // Run algorithm
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled
    );

    if (result.assignments.length === 0) {
      throw new ValidationError('No valid assignments could be made. Check available slots and supervisor eligibility.');
    }

    // Create batch record
    const batch = await query(
      `INSERT INTO auto_posting_batches 
       (institution_id, session_id, initiated_by, criteria, status, started_at)
       VALUES (?, ?, ?, ?, 'processing', NOW())`,
      [
        parseInt(institutionId),
        parseInt(session_id),
        userId,
        JSON.stringify({ number_of_postings, posting_type, priority_enabled, faculty_id }),
      ]
    );

    const batchId = batch.insertId;

    // Create postings in transaction
    try {
      const created = await createPostingsFromAssignments(
        institutionId,
        session_id,
        session,
        result.assignments,
        userId,
        batchId
      );

      // Update batch as completed
      await query(
        `UPDATE auto_posting_batches 
         SET status = 'completed', 
             total_postings_created = ?,
             total_supervisors_posted = ?,
             completed_at = NOW()
         WHERE id = ?`,
        [created.total, created.supervisorCount, batchId]
      );

      res.json({
        success: true,
        data: {
          batch_id: batchId,
          total_postings_created: created.total,
          total_supervisors: created.supervisorCount,
          assignments: created.details,
          statistics: result.statistics,
        },
      });
    } catch (error) {
      // Mark batch as failed
      await query(
        `UPDATE auto_posting_batches SET status = 'failed', error_message = ? WHERE id = ?`,
        [error.message, batchId]
      );
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get eligible supervisors for auto-posting
 */
async function getEligibleSupervisors(institutionId, sessionId, priorityEnabled, facultyId = null) {
  const maxPostings = await getMaxPostings(institutionId, sessionId);

  let sql = `
    SELECT 
      u.id, u.name, u.email, u.faculty_id,
      r.id as rank_id, r.name as rank_name, r.code as rank_code,
      r.priority_number,
      r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund,
      f.name as faculty_name,
      COALESCE(ps.posting_count, 0) as current_postings,
      ? - COALESCE(ps.posting_count, 0) as remaining_slots
    FROM users u
    LEFT JOIN ranks r ON u.rank_id = r.id
    LEFT JOIN faculties f ON u.faculty_id = f.id
    LEFT JOIN (
      SELECT supervisor_id, COUNT(*) as posting_count
      FROM supervisor_postings
      WHERE institution_id = ? AND session_id = ? 
            AND status != 'cancelled' AND is_primary_posting = 1
      GROUP BY supervisor_id
    ) ps ON u.id = ps.supervisor_id
    WHERE u.institution_id = ?
          AND u.role NOT IN ('super_admin', 'student')
          AND u.status = 'active'
          AND (? - COALESCE(ps.posting_count, 0)) > 0
  `;

  const params = [maxPostings, parseInt(institutionId), parseInt(sessionId), parseInt(institutionId), maxPostings];

  if (facultyId) {
    sql += ' AND u.faculty_id = ?';
    params.push(parseInt(facultyId));
  }

  // Order by priority if enabled, then by fewest existing postings
  if (priorityEnabled) {
    sql += ' ORDER BY COALESCE(r.priority_number, 99) ASC, COALESCE(ps.posting_count, 0) ASC, u.name ASC';
  } else {
    sql += ' ORDER BY COALESCE(ps.posting_count, 0) ASC, u.name ASC';
  }

  return await query(sql, params);
}

/**
 * Get available school slots for auto-posting
 */
async function getAvailableSlots(institutionId, sessionId, postingType) {
  // Get session settings
  const [session] = await query(
    'SELECT max_supervision_visits FROM academic_sessions WHERE id = ?',
    [sessionId]
  );
  const maxVisits = session?.max_supervision_visits || 3;

  // Get all schools with their groups
  const schools = await query(
    `SELECT 
      isv.id as school_id,
      ms.name as school_name,
      ms.lga,
      ms.state,
      isv.route_id,
      r.name as route_name,
      isv.distance_km,
      isv.location_category,
      sg.group_number,
      sg.id as student_group_id
    FROM institution_schools isv
    JOIN master_schools ms ON isv.master_school_id = ms.id
    LEFT JOIN routes r ON isv.route_id = r.id
    JOIN student_groups sg ON sg.institution_school_id = isv.id AND sg.session_id = ?
    WHERE isv.institution_id = ? AND isv.status = 'active' AND sg.student_count > 0`,
    [parseInt(sessionId), parseInt(institutionId)]
  );

  // Get existing postings to find available slots
  const existingPostings = await query(
    `SELECT institution_school_id, group_number, visit_number
     FROM supervisor_postings
     WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'`,
    [parseInt(institutionId), parseInt(sessionId)]
  );

  // Create a set of taken slots
  const takenSlots = new Set(
    existingPostings.map(p => `${p.institution_school_id}-${p.group_number}-${p.visit_number}`)
  );

  // Generate available slots (school + group + visit combinations)
  const availableSlots = [];
  for (const school of schools) {
    for (let visit = 1; visit <= maxVisits; visit++) {
      const slotKey = `${school.school_id}-${school.group_number}-${visit}`;
      if (!takenSlots.has(slotKey)) {
        availableSlots.push({
          id: slotKey,
          school_id: school.school_id,
          school_name: school.school_name,
          group_number: school.group_number,
          visit_number: visit,
          route_id: school.route_id,
          route_name: school.route_name,
          lga: school.lga,
          distance_km: parseFloat(school.distance_km) || 0,
          location_category: school.location_category,
        });
      }
    }
  }

  // Sort by distance DESC (longest first for priority assignment)
  availableSlots.sort((a, b) => b.distance_km - a.distance_km);

  return availableSlots;
}

/**
 * Core auto-posting algorithm
 */
function runAutoPostingAlgorithm(supervisors, slots, numberOfPostings, postingType, priorityEnabled) {
  const assignments = [];
  const warnings = [];
  const supervisorPostings = new Map(); // supervisor_id -> count
  const usedSlots = new Set();
  
  // Track route/LGA assignments per supervisor per visit
  // Map<supervisor_id, { visit_number: route_id | lga }>
  const supervisorVisitAssignments = new Map();

  // Group slots if needed
  let slotGroups;
  if (postingType === 'route_based') {
    slotGroups = groupSlotsByRoute(slots);
  } else if (postingType === 'lga_based') {
    slotGroups = groupSlotsByLGA(slots);
  } else {
    slotGroups = { all: slots };
  }

  // For route/LGA-based: supervisors are NOT pre-assigned to groups
  // Instead, assignment happens per-visit during slot selection
  const supervisorGroups = slotGroups;

  // Execute rounds
  for (let round = 1; round <= numberOfPostings; round++) {
    let assignmentsMadeThisRound = 0;

    for (const supervisor of supervisors) {
      // Skip if supervisor already has enough postings for this round
      const currentCount = supervisorPostings.get(supervisor.id) || 0;
      if (currentCount >= round) continue;

      // Check remaining slots for this supervisor
      if (currentCount >= supervisor.remaining_slots) {
        continue; // Supervisor reached their max
      }

      // Find available slot for this supervisor
      // For route/LGA-based: ensures same-visit stays in same route/LGA
      const slot = findSlotForSupervisor(
        supervisor,
        supervisorGroups,
        usedSlots,
        postingType,
        priorityEnabled,
        round,
        supervisorVisitAssignments  // Tracks per-visit route/LGA assignments
      );

      if (!slot) {
        if (round === 1) {
          warnings.push(`No available slot for ${supervisor.name} (${supervisor.rank_code || 'No rank'})`);
        }
        continue;
      }

      // Create assignment
      assignments.push({
        supervisor_id: supervisor.id,
        supervisor_name: supervisor.name,
        rank_code: supervisor.rank_code,
        priority_number: supervisor.priority_number,
        school_id: slot.school_id,
        school_name: slot.school_name,
        group_number: slot.group_number,
        visit_number: slot.visit_number,
        distance_km: slot.distance_km,
        route_name: slot.route_name,
        lga: slot.lga,
        round: round,
      });

      usedSlots.add(slot.id);
      supervisorPostings.set(supervisor.id, currentCount + 1);
      assignmentsMadeThisRound++;
    }

    // If no assignments were made this round, stop
    if (assignmentsMadeThisRound === 0) {
      warnings.push(`Stopped at round ${round}: No more available slots`);
      break;
    }
  }

  // Calculate statistics
  const statistics = calculateStatistics(assignments, supervisors, numberOfPostings);

  return { assignments, warnings, statistics };
}

/**
 * Group slots by route
 */
function groupSlotsByRoute(slots) {
  const groups = {};
  for (const slot of slots) {
    const key = slot.route_id || 'unassigned';
    if (!groups[key]) {
      groups[key] = {
        id: slot.route_id,
        name: slot.route_name || 'Unassigned Route',
        slots: [],
        totalDistance: 0,
        supervisors: [],
      };
    }
    groups[key].slots.push(slot);
    groups[key].totalDistance += slot.distance_km;
  }
  return groups;
}

/**
 * Group slots by LGA
 */
function groupSlotsByLGA(slots) {
  const groups = {};
  for (const slot of slots) {
    const key = slot.lga || 'Unknown';
    if (!groups[key]) {
      groups[key] = {
        id: key,
        name: key,
        slots: [],
        totalDistance: 0,
        supervisors: [],
      };
    }
    groups[key].slots.push(slot);
    groups[key].totalDistance += slot.distance_km;
  }
  return groups;
}

/**
 * Assign supervisors to route/LGA groups
 */
function assignSupervisorsToGroups(supervisors, slotGroups, priorityEnabled) {
  const groupKeys = Object.keys(slotGroups);
  
  // Sort groups by total distance (highest first for priority)
  groupKeys.sort((a, b) => slotGroups[b].totalDistance - slotGroups[a].totalDistance);

  // Round-robin assignment
  let groupIndex = 0;
  for (const supervisor of supervisors) {
    const groupKey = groupKeys[groupIndex % groupKeys.length];
    slotGroups[groupKey].supervisors.push(supervisor);
    groupIndex++;
  }

  return slotGroups;
}

/**
 * Find available slot for a supervisor based on posting type
 * For route/LGA-based: ensures same-visit postings stay in same route/LGA
 */
function findSlotForSupervisor(supervisor, supervisorGroups, usedSlots, postingType, priorityEnabled, round, supervisorVisitAssignments) {
  let candidateSlots = [];

  if (postingType === 'route_based' || postingType === 'lga_based') {
    const groupKey = postingType === 'route_based' ? 'route_id' : 'lga';
    
    // Check if supervisor already has a group assigned for this visit
    const existingAssignment = supervisorVisitAssignments.get(supervisor.id)?.[round];
    
    if (existingAssignment) {
      // Must stay in same route/LGA for this visit number
      const group = Object.values(supervisorGroups).find(g => 
        g.id === existingAssignment || g.name === existingAssignment
      );
      if (group) {
        candidateSlots = group.slots.filter(s => 
          !usedSlots.has(s.id) && s.visit_number === round
        );
      }
    } else {
      // First posting for this visit - find best available group
      // Collect all slots for this visit across all groups
      for (const group of Object.values(supervisorGroups)) {
        const groupSlots = group.slots.filter(s => 
          !usedSlots.has(s.id) && s.visit_number === round
        );
        candidateSlots.push(...groupSlots.map(s => ({ ...s, groupId: group.id, groupName: group.name })));
      }
      
      // Sort by distance (priority supervisors get longest)
      if (priorityEnabled) {
        candidateSlots.sort((a, b) => b.distance_km - a.distance_km);
      }
    }
  } else {
    // Random: all unused slots for this visit are candidates
    candidateSlots = supervisorGroups.all?.slots?.filter(s => 
      !usedSlots.has(s.id) && s.visit_number === round
    ) || [];
  }

  if (candidateSlots.length === 0) return null;

  // For priority posting, slots are already sorted by distance DESC
  const selectedSlot = candidateSlots[0];
  
  // Record the group assignment for this visit (for route/LGA-based)
  if ((postingType === 'route_based' || postingType === 'lga_based') && selectedSlot) {
    if (!supervisorVisitAssignments.has(supervisor.id)) {
      supervisorVisitAssignments.set(supervisor.id, {});
    }
    const assignment = postingType === 'route_based' ? selectedSlot.route_id : selectedSlot.lga;
    supervisorVisitAssignments.get(supervisor.id)[round] = assignment;
  }

  return selectedSlot;
}

/**
 * Calculate statistics for the posting result
 */
function calculateStatistics(assignments, supervisors, targetPostings) {
  const byRound = {};
  const bySupervisor = {};
  
  for (const a of assignments) {
    // By round
    byRound[a.round] = (byRound[a.round] || 0) + 1;
    
    // By supervisor
    if (!bySupervisor[a.supervisor_id]) {
      bySupervisor[a.supervisor_id] = { count: 0, name: a.supervisor_name };
    }
    bySupervisor[a.supervisor_id].count++;
  }

  const supervisorsWithFullPostings = Object.values(bySupervisor)
    .filter(s => s.count >= targetPostings).length;

  const supervisorsWithPartialPostings = Object.values(bySupervisor)
    .filter(s => s.count > 0 && s.count < targetPostings).length;

  const supervisorsWithNoPostings = supervisors.length - Object.keys(bySupervisor).length;

  return {
    total_assignments: assignments.length,
    by_round: byRound,
    supervisors_full: supervisorsWithFullPostings,
    supervisors_partial: supervisorsWithPartialPostings,
    supervisors_none: supervisorsWithNoPostings,
    target_postings_per_supervisor: targetPostings,
  };
}

/**
 * Create postings from assignments
 */
async function createPostingsFromAssignments(institutionId, sessionId, session, assignments, userId, batchId) {
  const results = { total: 0, supervisorCount: 0, details: [] };
  const supervisorIds = new Set();

  return await transaction(async (conn) => {
    for (const assignment of assignments) {
      // Get supervisor with rank for allowance calculation
      const [supervisorRows] = await conn.execute(
        `SELECT u.*, r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund
         FROM users u
         LEFT JOIN ranks r ON u.rank_id = r.id
         WHERE u.id = ?`,
        [assignment.supervisor_id]
      );
      const supervisor = supervisorRows[0];

      // Get school
      const [schoolRows] = await conn.execute(
        `SELECT isv.*, ms.name as school_name, r.name as route_name
         FROM institution_schools isv
         JOIN master_schools ms ON isv.master_school_id = ms.id
         LEFT JOIN routes r ON isv.route_id = r.id
         WHERE isv.id = ?`,
        [assignment.school_id]
      );
      const school = schoolRows[0];

      // Calculate allowances
      const allowances = calculateAllowances(supervisor, school, session, false);

      // Insert posting
      const [result] = await conn.execute(
        `INSERT INTO supervisor_postings 
         (institution_id, session_id, supervisor_id, institution_school_id, route_id,
          group_number, visit_number, distance_km, transport, dsa, dta, local_running,
          tetfund, is_primary_posting, rank_id, posting_type, posted_by, auto_posting_batch_id,
          posted_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'auto', ?, ?, NOW(), 'active')`,
        [
          parseInt(institutionId),
          parseInt(sessionId),
          assignment.supervisor_id,
          assignment.school_id,
          school.route_id,
          assignment.group_number,
          assignment.visit_number,
          allowances.distance_km,
          allowances.transport,
          allowances.dsa,
          allowances.dta,
          allowances.local_running,
          allowances.tetfund,
          supervisor.rank_id || null,
          userId,
          batchId,
        ]
      );

      supervisorIds.add(assignment.supervisor_id);
      results.total++;
      results.details.push({
        posting_id: result.insertId,
        ...assignment,
        allowances,
      });
    }

    results.supervisorCount = supervisorIds.size;
    return results;
  });
}

module.exports = {
  previewAutoPosting,
  executeAutoPosting,
  schemas: { autoPost: autoPostSchema },
};
```

### 2. API Routes

```javascript
// backend/src/routes/autoPosting.js

const router = require('express').Router({ mergeParams: true });
const { authenticate, requireInstitutionAccess, isHeadOfTP } = require('../middleware');
const controller = require('../controllers/autoPostingController');

// Preview auto-posting without creating
router.post(
  '/:institutionId/auto-posting/preview',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,  // Only admin-level can auto-post
  controller.previewAutoPosting
);

// Execute auto-posting
router.post(
  '/:institutionId/auto-posting/execute',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  controller.executeAutoPosting
);

module.exports = router;
```

---

## Frontend Implementation

### 1. Auto-Post Dialog Component

```jsx
// frontend/src/components/AutoPostDialog.jsx

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/Dialog';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';
import { Label } from './ui/Label';
import { Badge } from './ui/Badge';
import { IconWand, IconLoader2, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useInstitutionApi } from '../hooks/useInstitutionApi';
import { useToast } from '../context/ToastContext';

const POSTING_TYPES = [
  { value: 'random', label: 'Random Locations', description: 'Distribute supervisors to any available schools regardless of location' },
  { value: 'route_based', label: 'Route Based', description: 'Each visit stays within one route (e.g., all Visit 1 schools in same route)' },
  { value: 'lga_based', label: 'LGA Based', description: 'Each visit stays within one LGA (e.g., all Visit 1 schools in same LGA)' },
];

function AutoPostDialog({ open, onClose, sessionId, maxVisits, onComplete }) {
  const { post } = useInstitutionApi();
  const { showToast } = useToast();

  const [numberOfPostings, setNumberOfPostings] = useState(1);
  const [postingType, setPostingType] = useState('random');
  const [priorityEnabled, setPriorityEnabled] = useState(true);
  const [isPreview, setIsPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const response = await post('/auto-posting/preview', {
        session_id: sessionId,
        number_of_postings: numberOfPostings,
        posting_type: postingType,
        priority_enabled: priorityEnabled,
      });

      setPreviewData(response.data);
      setIsPreview(false);
    } catch (error) {
      showToast('error', error.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      const response = await post('/auto-posting/execute', {
        session_id: sessionId,
        number_of_postings: numberOfPostings,
        posting_type: postingType,
        priority_enabled: priorityEnabled,
      });

      showToast('success', `Created ${response.data.total_postings_created} postings for ${response.data.total_supervisors} supervisors`);
      onComplete?.(response.data);
      onClose();
    } catch (error) {
      showToast('error', error.message || 'Failed to execute auto-posting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconWand className="h-5 w-5 text-primary-600" />
            Auto-Post Supervisors
          </DialogTitle>
        </DialogHeader>

        {isPreview ? (
          <div className="space-y-6">
            {/* Number of Postings */}
            <div className="space-y-2">
              <Label>Number of Postings per Supervisor</Label>
              <Select
                value={numberOfPostings}
                onChange={(e) => setNumberOfPostings(parseInt(e.target.value))}
              >
                {Array.from({ length: maxVisits }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} posting{n > 1 ? 's' : ''}</option>
                ))}
              </Select>
              <p className="text-xs text-gray-500">
                Maximum allowed by session: {maxVisits}
              </p>
            </div>

            {/* Posting Type */}
            <div className="space-y-2">
              <Label>Posting Type</Label>
              <div className="grid gap-3">
                {POSTING_TYPES.map(type => (
                  <label
                    key={type.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      postingType === type.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="postingType"
                      value={type.value}
                      checked={postingType === type.value}
                      onChange={(e) => setPostingType(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-sm text-gray-500">{type.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label>Enable Priority Posting</Label>
                <p className="text-sm text-gray-500">
                  Higher ranked supervisors get posted first and assigned to schools with longest distances
                </p>
              </div>
              <Switch
                checked={priorityEnabled}
                onCheckedChange={setPriorityEnabled}
              />
            </div>
          </div>
        ) : (
          /* Preview Results */
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {previewData?.total_supervisors || 0}
                </div>
                <div className="text-sm text-blue-600">Supervisors</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-700">
                  {previewData?.assignments?.length || 0}
                </div>
                <div className="text-sm text-green-600">Postings to Create</div>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-orange-700">
                  {previewData?.total_available_slots || 0}
                </div>
                <div className="text-sm text-orange-600">Available Slots</div>
              </div>
            </div>

            {/* Statistics */}
            {previewData?.statistics && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Distribution Summary</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <Badge variant="success">{previewData.statistics.supervisors_full}</Badge>
                    <span className="ml-2">Full postings ({numberOfPostings})</span>
                  </div>
                  <div>
                    <Badge variant="warning">{previewData.statistics.supervisors_partial}</Badge>
                    <span className="ml-2">Partial postings</span>
                  </div>
                  <div>
                    <Badge variant="error">{previewData.statistics.supervisors_none}</Badge>
                    <span className="ml-2">No postings</span>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings */}
            {previewData?.warnings?.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
                  <IconAlertTriangle className="h-4 w-4" />
                  Warnings
                </div>
                <ul className="text-sm text-yellow-600 list-disc list-inside">
                  {previewData.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {previewData.warnings.length > 5 && (
                    <li>...and {previewData.warnings.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <Button variant="outline" onClick={() => setIsPreview(true)}>
              ← Back to Settings
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          
          {isPreview ? (
            <Button onClick={handlePreview} disabled={loading}>
              {loading ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Preview Assignments
            </Button>
          ) : (
            <Button onClick={handleExecute} disabled={loading} variant="primary">
              {loading ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : <IconCheck className="h-4 w-4 mr-2" />}
              Create {previewData?.assignments?.length || 0} Postings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AutoPostDialog;
```

### 2. Integration with MultipostingPage

```jsx
// Add to frontend/src/pages/admin/MultipostingPage.jsx

import AutoPostDialog from '../../components/AutoPostDialog';

// Inside the component:
const [showAutoPostDialog, setShowAutoPostDialog] = useState(false);

// Add button to the page header:
<Button
  variant="outline"
  onClick={() => setShowAutoPostDialog(true)}
  disabled={!selectedSessionId}
>
  <IconWand className="h-4 w-4 mr-2" />
  Auto-Post
</Button>

// Add dialog:
<AutoPostDialog
  open={showAutoPostDialog}
  onClose={() => setShowAutoPostDialog(false)}
  sessionId={selectedSessionId}
  maxVisits={session?.max_supervision_visits || 3}
  onComplete={() => {
    loadSupervisors();
    loadSchools();
  }}
/>
```

---

## Migration Steps

### Step 1: Database Migration

```bash
# Create migration file
# backend/database/migrations/037_add_rank_priority_and_auto_posting.sql

# Run migration
cd backend && npm run migrate
```

### Step 2: Backend Implementation

1. Create `autoPostingController.js`
2. Create routes in `routes/autoPosting.js`
3. Register routes in `routes/index.js`
4. Add tests for the algorithm

### Step 3: Frontend Implementation

1. Create `AutoPostDialog.jsx` component
2. Add API functions in `api/autoPosting.js`
3. Integrate into `MultipostingPage.jsx`
4. Test with different scenarios

### Step 4: Testing & Rollout

1. Test with small dataset
2. Test edge cases (no slots, no supervisors, etc.)
3. Test performance with large datasets
4. Deploy to staging
5. User acceptance testing
6. Production rollout

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| No eligible supervisors | Show error message |
| No available slots | Show error, suggest checking student groups |
| Partial assignments | Complete what's possible, show warning |
| Session locked | Block auto-posting |
| Dean access | Filter supervisors by faculty |
| Duplicate detection | Skip slots already assigned |
| Transaction failure | Rollback all, mark batch as failed |

---

## Performance Considerations

1. **Large Institutions** - For 500+ supervisors:
   - Use batch inserts (100 at a time)
   - Consider async processing with job queue
   - Add progress indicator

2. **Slot Calculation** - Cache available slots:
   - Pre-compute on session load
   - Invalidate on posting changes

3. **Preview Performance**:
   - Limit preview to first 100 assignments
   - Show summary statistics only

---

## Future Enhancements

1. **Rollback Feature** - Undo an auto-posting batch
2. **Custom Rules** - Define supervisor-school preferences
3. **Faculty Distribution** - Ensure each faculty gets fair distribution
4. **Scheduling** - Schedule auto-posting for a future date
5. **Smart Distance** - Consider supervisor home location
6. **History View** - View all auto-posting batches
