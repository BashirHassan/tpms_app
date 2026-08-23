# Complete Rewrite of the Auto-Posting Optimization Engine

You are working on the backend of a production Teaching Practice / SIWES-style posting management system.

I need you to **entirely redesign and rewrite the auto-posting algorithm**, especially the `lga_based + priority_enabled` case.

Do **not** merely tune the existing weights, add more penalties, or patch a few lines.

The current engine has evolved through several iterations of greedy assignment, tiering, spillover, and local search. It is now too heuristic and has structural weaknesses. I want a cleaner, deterministic, mathematically sound allocation engine that produces the **best practical posting result possible under the available constraints**, while preserving the existing controller/frontend contract.

You have access to the existing posting frontend, controller, and current engine in the repository. Study them first and understand the existing data model, API expectations, posting semantics, and current behavior before changing anything.

---

# 1. BUSINESS CONTEXT

This is a supervisor auto-posting system for Teaching Practice supervision.

The engine receives:

## Supervisors

Each supervisor has information conceptually equivalent to:

```js
{
  id,
  name,
  email,
  faculty_id,
  rank_id,
  rank_name,
  rank_code,
  priority_number,
  current_postings,
  remaining_slots
}
```

`priority_number` represents seniority/priority.

Lower `priority_number` means higher priority/seniority.

Example:

```text
Priority 1 = most senior
Priority 2 = next
Priority 3 = next
...
99 = unknown/unranked
```

The controller currently calculates `remaining_slots` from the session's maximum primary postings per supervisor less the supervisor's existing primary postings. Preserve this meaning.

The supervisor's **remaining capacity is a hard constraint**.

---

## Slots

A slot represents one assignable primary supervision posting:

```text
school + group + visit
```

Conceptually:

```js
{
  id,
  school_id,
  school_name,
  group_number,
  visit_number,
  route_id,
  route_name,
  lga,
  distance_km,
  location_category
}
```

The current controller builds available slots from approved students/groups and excludes already assigned school/group/visit combinations.

Do not change that responsibility unless there is a clear correctness problem requiring a controller change.

The algorithm should assume that each slot is independently assignable.

---

# 2. EXISTING FRONTEND BEHAVIOUR YOU MUST PRESERVE

The current posting frontend supports:

```text
Posting Type:
- random
- route_based
- lga_based

Priority:
- enabled
- disabled

Avoid Repeat Schools:
- enabled
- disabled

Number of Postings / Visits:
- 1 through the session maximum
```

The frontend launches `AutoPostDialog` and passes:

```js
sessionId
maxVisits
facultyId
```

The backend executes the algorithm using:

```js
runAutoPostingAlgorithm(
  supervisors,
  slots,
  number_of_postings,
  posting_type,
  priority_enabled,
  options
)
```

with options conceptually including:

```js
{
  avoidRepeatSchools,
  schoolHistory,
  maxAssignments
}
```

The rewritten engine must therefore remain compatible with the existing controller unless you identify a necessary contract improvement.

Do not redesign the frontend just because the algorithm is changing.

---

# 3. THE MAIN GOAL

The objective is:

> Produce the highest-quality feasible assignment of supervisors to school/group/visit slots, respecting all hard constraints and optimizing operational quality, with special attention to LGA-based posting and supervisor priority.

"Best result" does NOT simply mean:

* highest correlation,
* lowest total kilometres,
* perfectly equal workload,
* or lowest weighted cost.

It means respecting the **true hierarchy of institutional rules**.

The algorithm must explicitly separate:

## HARD CONSTRAINTS

These must never be violated.

## STRONG OBJECTIVES

These should be optimized before weaker objectives.

## SOFT OBJECTIVES

These should be optimized only after the more important requirements have been satisfied.

Do not collapse everything into arbitrary numeric weights.

---

# 4. HARD CONSTRAINTS

The following are mandatory.

## 4.1 Slot uniqueness

Every:

```text
school_id + group_number + visit_number
```

may be assigned to at most one primary supervisor.

Never produce duplicate assignments.

---

## 4.2 Supervisor capacity

A supervisor may never receive more primary postings than:

```js
remaining_slots
```

Never exceed capacity.

---

## 4.3 Dean allocation

When `maxAssignments` is supplied, total generated primary assignments may not exceed it.

This is a hard global ceiling.

---

## 4.4 Only eligible supervisors

Use only supervisors supplied to the engine.

Never invent or select supervisors outside the supplied list.

---

## 4.5 Only eligible slots

Never create a slot that wasn't supplied.

Never mutate school/group/visit identities.

---

## 4.6 Valid visits

Only slots whose:

```js
visit_number <= numberOfPostings
```

are eligible.

---

## 4.7 Priority rule when priority is enabled

This is extremely important.

Priority must not be treated merely as another penalty in a weighted objective.

When priority is enabled, the engine must make a **deliberate and explainable allocation of geographical difficulty to priority ranks**.

Senior supervisors should receive the more difficult/farther work.

Do not rely on Pearson correlation alone.

Do not say the priority requirement is satisfied merely because the average distance for senior staff is somewhat higher.

The engine must explicitly measure and prevent priority inversions where feasible.

---

# 5. CRITICAL REQUIREMENT FOR LGA-BASED POSTING

This is the most important part of the rewrite.

When:

```js
postingType === 'lga_based'
```

the algorithm should treat an LGA as a **geographical allocation unit**, not merely as a cost term.

The conceptual hierarchy must become:

```text
Priority
    ↓
LGA allocation
    ↓
Supervisor allocation within LGA
    ↓
School/group slot allocation
```

Do NOT do this:

```text
LGA
→ assign slots greedily
→ penalize changing LGA
→ repair with swaps
```

Instead do this:

```text
Build LGA demand
→ measure LGA difficulty
→ allocate LGA demand to priority bands
→ allocate supervisors/capacity to LGAs
→ assign actual school/group/visit slots within each LGA
→ constrained improvement
```

This is a structural optimization problem, not just a slot-scoring problem.

---

# 6. LGA DEMAND MODEL

For every visit, build an LGA representation.

For each LGA calculate at least:

```js
{
  key,
  lga,
  slots,
  schools,
  groups,
  distanceValues,
  maxDistance,
  averageDistance,
  p75Distance,
  totalDistance,
  demand
}
```

Where:

```text
demand = number of primary slots needing assignment
```

Do NOT use:

```js
sum(distance_km)
```

as the sole measure of LGA difficulty.

That incorrectly makes an LGA with many schools look automatically more difficult simply because it has more slots.

---

# 7. LGA TRAVEL DIFFICULTY

Define a deterministic geographical difficulty score.

Use a robust metric based on the distribution of school distances in the LGA.

Prefer something equivalent to:

```text
LGA difficulty =
    0.60 × maximum school distance
  + 0.25 × 75th percentile distance
  + 0.15 × average distance
```

You may improve this formula if you have a stronger mathematical approach, but preserve these principles:

1. Farther schools matter.
2. The worst travel burden matters strongly.
3. An LGA with many schools must not automatically become "farther" solely because it has more schools.
4. Distance must reflect geographical difficulty, not workload volume.
5. The metric must be deterministic and explainable.

Store the components separately so the preview/reporting layer can explain why an LGA ranked where it did.

---

# 8. PRIORITY TIER ALLOCATION

When priority is enabled, group supervisors by `priority_number`.

For each priority tier calculate:

```js
{
  priority_number,
  supervisors,
  supervisorCount,
  totalCapacity,
  currentLoad,
  remainingCapacity
}
```

Do not simply divide the number of LGAs equally among ranks.

Do not simply divide by number of supervisors.

Do not blindly use the current heuristic:

```text
tier share = capacity / total capacity
```

without considering the actual LGA demand.

The allocation must account for:

```text
supervisor capacity
+
LGA demand
+
LGA difficulty
+
number of available LGAs
+
number of visits
```

A small senior tier must not be allocated ten different LGAs if it only has capacity for six postings.

A large junior tier must not be given difficult LGAs merely because a simplistic proportional splitter ran out of seats.

---

# 9. PRIORITY MUST BE MONOTONIC WHEN FEASIBLE

Consider priority tiers:

```text
Priority 1
Priority 2
Priority 3
```

and geographical difficulty:

```text
100 km
90 km
80 km
70 km
60 km
...
```

The desired result is structurally:

```text
Priority 1 → hardest work
Priority 2 → next hardest
Priority 3 → easier work
```

This does NOT necessarily mean every individual Priority 1 assignment must be farther than every Priority 2 assignment, because real LGA demand and capacity may make perfect separation impossible.

Therefore implement a hierarchy:

### Level A

Perfect separation when feasible.

### Level B

Minimum number of priority inversions.

### Level C

Minimum severity of those inversions.

### Level D

Only then optimize workload/repetition/travel.

The algorithm should measure all four.

---

# 10. DO NOT USE CORRELATION AS THE PRIMARY PRIORITY OBJECTIVE

The current system reports a rank-distance correlation.

Keep correlation if useful for diagnostics, but it must not be the optimization criterion.

Add explicit metrics:

```js
{
  priorityInversions,
  priorityInversionSeverity,
  tierOverlap,
  tierDistanceRanges,
  seniorityMonotonicity,
  priorityCompliance
}
```

For each tier report:

```js
{
  priority_number,
  postings,
  min_km,
  p25_km,
  median_km,
  mean_km,
  p75_km,
  max_km
}
```

Then report whether higher priority actually received harder work.

---

# 11. LGA COHESION

For `lga_based` posting:

A supervisor assigned to multiple schools for the same visit should preferably remain in one LGA.

In fact, treat:

```text
supervisor + visit
```

as having a preferred/assigned LGA.

Do NOT let the local search randomly swap individual schools between supervisors in a way that destroys LGA cohesion.

The current local-search approach can swap assignments between supervisors of the same priority tier even when that moves schools across LGAs.

That is not acceptable for `lga_based`.

The new engine must model LGA ownership explicitly.

---

# 12. HARD VS SOFT LGA COHESION

Use this principle:

If one supervisor is assigned multiple slots in the same visit, assign those slots to one LGA whenever feasible.

Only split an individual supervisor across LGAs when unavoidable because of:

* insufficient capacity,
* impossible demand/capacity geometry,
* dean quota,
* insufficient supervisors in a required priority tier,
* or another genuine hard constraint.

When an LGA split is unavoidable, report it explicitly.

Do not hide it behind a generic "affinity penalty."

---

# 13. VISITS MUST BE HANDLED CORRECTLY

This is very important.

`numberOfPostings` represents the maximum visit number included.

For example:

```text
numberOfPostings = 3
```

means:

```text
Visit 1
Visit 2
Visit 3
```

The supervisor's total remaining capacity is shared across these visits.

Do not independently pretend every visit starts with a fresh supervisor capacity.

Capacity must be tracked globally across the entire run.

At the same time, LGA planning is visit-specific because a supervisor can reasonably have:

```text
Visit 1 → LGA A
Visit 2 → LGA B
Visit 3 → LGA A
```

Therefore model:

```text
supervisor
+ visit
+ LGA
```

explicitly.

---

# 14. EXISTING SCHOOL HISTORY

The engine receives:

```js
schoolHistory
```

which represents schools the supervisor has already covered.

This must be considered.

When:

```js
avoidRepeatSchools === true
```

prefer assigning a supervisor to schools they have not previously covered.

However:

> avoiding a repeat school must NOT override priority or an explicit LGA allocation.

Use this hierarchy:

```text
Hard rules
→ priority/geographical allocation
→ LGA coherence
→ repeat-school avoidance
→ workload balancing
→ travel balancing
```

Only violate repeat avoidance when there is no feasible alternative.

Report such unavoidable repeats.

---

# 15. CURRENT POSTING LOAD MATTERS

Supervisors already have:

```js
current_postings
```

and:

```js
remaining_slots
```

The engine must consider existing workload.

When two supervisors are equally suitable for an assignment, prefer the one who has the lighter existing/current burden.

But do NOT simply sort supervisors by current postings once and assign greedily.

The assignment must remain globally optimized.

---

# 16. MAXIMIZE UTILIZATION

When enough eligible slots exist, the engine should assign as many valid slots as possible subject to:

```text
supervisor capacity
dean allocation
slot availability
```

Do not leave a slot unassigned simply because the first greedy pass could not fit it.

Use a second-stage feasibility/repair process.

If not all slots can be assigned, report exactly why.

---

# 17. DO NOT RELY ON ARBITRARY WEIGHTS

The current engine uses values similar to:

```js
repeat: 2000
affinity: 300
load: 200
travel: 1
```

Do NOT build another system where the quality of the result depends primarily on hand-tuned constants.

Instead implement a **lexicographic objective**.

Conceptually:

```text
Objective 1:
Maximize feasible assignments.

Objective 2:
Minimize hard-rule violations.
There should normally be zero.

Objective 3:
Minimize priority inversions.

Objective 4:
Minimize priority inversion severity.

Objective 5:
Minimize LGA fragmentation / cross-LGA assignments.

Objective 6:
Minimize repeat-school assignments.

Objective 7:
Balance workload.

Objective 8:
Balance travel within equivalent priority groups.

Objective 9:
Use deterministic tie-breaking.
```

Only use numerical costs where needed inside an objective.

Do not let a tiny improvement in travel compensate for breaking a much more important priority rule.

---

# 18. RECOMMENDED OPTIMIZATION APPROACH

You are free to choose the implementation, but I expect something substantially better than the current greedy-plus-swap architecture.

A good approach is a hybrid optimization pipeline.

## Phase 1 — Normalize

Validate and normalize:

```text
supervisors
slots
priority numbers
capacities
distance values
LGA values
visit numbers
school history
```

Handle null/invalid values safely.

---

## Phase 2 — Build demand graph

Create:

```text
visit
→ LGA
→ school
→ group
→ slot
```

and calculate demand and geographical difficulty.

---

## Phase 3 — Build supervisor capacity model

For every supervisor track:

```text
priority
capacity
current load
remaining capacity
existing school history
```

---

## Phase 4 — Solve geographical allocation

For `lga_based`:

Allocate supervisor capacity to LGA demand while respecting:

```text
priority
capacity
visit
LGA demand
```

Prefer whole-LGA allocation where feasible.

If an LGA requires multiple supervisors, distribute it intelligently.

If necessary, model individual "supervisor capacity units" rather than treating a supervisor as an indivisible object.

---

## Phase 5 — Assign actual school/group slots

Once the LGA/supervisor structure exists, assign individual slots within that structure.

Within an LGA, optimize:

```text
repeat avoidance
workload
distance
determinism
```

Do not allow this stage to undo the priority/LGA decisions.

---

# 19. FOR ROUTE-BASED POSTING

Preserve the concept of route clustering.

`route_based` should follow the same general architecture:

```text
route difficulty/demand
→ supervisor allocation
→ slot allocation
```

but the clustering key becomes route rather than LGA.

Do not force LGA-specific rules onto route-based posting.

---

# 20. FOR RANDOM POSTING

`random` does not need geographical clustering.

However, it should still optimize:

```text
capacity
priority
repeat avoidance
workload
travel
determinism
```

If priority is enabled in random mode, use individual slots as geographical units.

---

# 21. PRIORITY OFF

When:

```js
priority_enabled === false
```

do NOT apply seniority-based distance allocation.

Instead optimize for:

```text
max assignments
→ LGA/route cohesion depending on posting type
→ repeat avoidance
→ workload balance
→ travel balance
→ deterministic result
```

Priority should have zero influence on the result when disabled.

---

# 22. LOCAL IMPROVEMENT

After producing an initial feasible solution, perform constrained improvement.

Do NOT simply swap any two assignments.

Each possible move must be validated against the complete constraint hierarchy.

For `lga_based`, legal moves could include:

### Move A

Move a school/group slot to another supervisor who is already assigned to the same LGA and visit.

### Move B

Swap two supervisors' allocations within the same LGA.

### Move C

Exchange complete LGA ownership between supervisors of the same priority tier if it improves the solution.

### Move D

Perform a controlled cross-tier move only if it reduces an unavoidable priority inversion and remains lexicographically better.

Never perform a move that improves workload by creating a worse priority/LGA structure.

---

# 23. USE MULTIPLE INITIAL SOLUTIONS

Do not assume a single greedy order produces the best result.

Generate several deterministic candidate solutions using different sensible orderings.

For example:

```text
Strategy A:
hardest LGA first

Strategy B:
largest LGA demand first

Strategy C:
hardest-to-fit LGA first

Strategy D:
highest priority tier first

Strategy E:
visit-balanced construction
```

Then compare the solutions using the lexicographic objective and select the best.

Do not introduce random nondeterminism unless a seeded random mode is explicitly implemented.

The same input should normally produce the same output.

---

# 24. HARD-TO-FIT FIRST

For allocation planning, prioritize units with the fewest feasible placement options.

For example:

```text
LGA with demand 6 but only 2 feasible senior supervisors
```

should be considered before an easy LGA that can be served by everyone.

This is standard constraint-solving logic and should reduce greedy dead ends.

---

# 25. CAPACITY AWARENESS ACROSS ALL VISITS

Do not calculate tier capacity independently for each visit.

Example:

```text
Senior A capacity = 3
Senior B capacity = 3
```

Total senior capacity:

```text
6
```

If Visit 1 consumes:

```text
A = 2
B = 2
```

then only:

```text
2 senior capacity
```

remain for later visits.

The planner must see this.

Do not rebuild an independent six-slot senior tier for every visit.

---

# 26. DO NOT DOUBLE-COUNT LGA DISTANCE

For an LGA with:

```text
10 schools
```

do not let:

```text
totalDistance = 700 km
```

make it automatically harder than another LGA with:

```text
2 schools
```

at:

```text
maximum distance = 100 km
```

Use:

```text
distribution-based geographical difficulty
```

separately from:

```text
assignment demand
```

This distinction is mandatory.

---

# 27. HANDLE LARGE DEMAND LGAS CORRECTLY

If an LGA contains many groups, it may require multiple supervisors.

Calculate:

```text
required supervisor capacity
```

based on available posting slots and the practical per-supervisor workload.

Do not use the current approximation:

```js
targetPerSupervisor =
  ceil(totalVisitSlots / totalSupervisors)
```

followed by:

```js
ceil(cluster.slots / targetPerSupervisor)
```

unless you can prove it is appropriate.

The new design should allocate actual capacity to actual demand.

---

# 28. FAIR WORKLOAD

After the priority and geography constraints have been satisfied, aim for fair supervisor utilization.

Consider:

```text
existing current_postings
+
new assignments
```

not just the number of new assignments.

For example:

```text
Supervisor A already has 2 postings
Supervisor B already has 0 postings
```

with both having one remaining slot should not automatically be treated equally if the institutional objective is overall workload fairness.

Use final total workload as a secondary balancing criterion.

---

# 29. TRAVEL BALANCING

Travel balancing should be used only where it does not conflict with:

```text
priority
LGA ownership
repeat avoidance
capacity
```

For example, within the same priority tier and same LGA:

```text
prefer the supervisor with lower cumulative travel
```

but never move a senior assignment to a junior simply because it improves average kilometres.

---

# 30. REPEAT SCHOOL LOGIC

The same supervisor can legitimately have multiple visits to the same school if there is no alternative.

Therefore:

```text
repeat_school = true
```

is not a hard error.

However, when avoid-repeat is enabled:

```text
prefer new school to existing school
```

and report unavoidable repeats.

Do not treat multiple groups at the same school incorrectly as separate schools.

School identity is:

```text
school_id
```

not:

```text
school + group
```

---

# 31. FINAL VALIDATION PASS

After optimization, run a complete authoritative validation pass.

The output must not be considered valid until it passes checks for:

```text
duplicate slots
supervisor capacity
dean ceiling
invalid slot references
invalid supervisor references
visit range
priority compliance
LGA coherence
repeat-school reporting
assignment count
```

If the optimizer produces an invalid solution, reject/repair it rather than returning it.

---

# 32. OUTPUT CONTRACT

Preserve the existing assignment fields expected by the controller/frontend.

Each assignment should contain at least:

```js
{
  supervisor_id,
  supervisor_name,
  rank_code,
  priority_number,

  school_id,
  school_name,
  group_number,
  visit_number,

  distance_km,

  route_id,
  route_name,
  lga,

  repeat_school,
  cluster_break
}
```

You may add useful fields, especially:

```js
{
  allocation_reason,
  priority_tier,
  lga_score,
  lga_rank,
  priority_inversion,
  assignment_cost,
  previous_school,
  existing_load,
  final_load
}
```

but do not remove fields expected by the existing controller.

---

# 33. STATISTICS MUST BE MUCH RICHER

The preview already exposes:

```text
assignments
statistics
warnings
data_quality
```

The new algorithm should make `statistics` highly useful.

Include something similar to:

```js
{
  total_slots,
  total_assigned,
  total_unassigned,

  supervisors_total,
  supervisors_used,

  utilization_rate,

  assignments_by_visit,

  assignments_by_supervisor,

  workload: {
    min,
    max,
    mean,
    median,
    standard_deviation
  },

  travel: {
    total_km,
    min_supervisor_km,
    max_supervisor_km,
    mean_km,
    standard_deviation
  },

  repeats: {
    count,
    rate,
    unavoidable_count
  },

  geography: {
    lgAs,
    fragmented_assignments,
    cross_lga_assignments,
    cross_route_assignments
  },

  priority: {
    enabled,
    inversion_count,
    inversion_severity,
    tier_overlap,
    monotonicity_score,
    distance_by_rank
  },

  optimization: {
    strategy,
    candidate_solutions,
    improvement_passes,
    objective_before,
    objective_after
  }
}
```

Do not invent meaningless values.

---

# 34. WARNINGS MUST EXPLAIN TRADE-OFFS

Warnings should tell the administrator exactly why the algorithm could not achieve the ideal.

Examples:

```text
"3 postings could not avoid repeat schools because all non-repeat supervisors had exhausted capacity."

"2 priority inversions remain because the senior priority tier had insufficient remaining capacity."

"4 slots required cross-LGA allocation because the LGA demand exceeded the available supervisor capacity assigned to that area."

"1 supervisor covered two LGAs during Visit 2 because no feasible single-LGA allocation remained."
```

Avoid generic messages such as:

```text
"Could not find best assignment."
```

---

# 35. PRIORITY REPORTING EXAMPLE

A good final result should allow us to explain something like:

```text
Priority 1
12 postings
Mean distance: 87.4 km
Min: 72 km
Max: 114 km

Priority 2
18 postings
Mean distance: 61.2 km
Min: 45 km
Max: 70 km

Priority 3
24 postings
Mean distance: 32.1 km
Min: 11 km
Max: 44 km

Priority inversions: 0
```

That is far more meaningful than saying:

```text
correlation = 0.78
```

---

# 36. PERFORMANCE

This is production code.

The algorithm must handle realistic institutional datasets.

Do not implement an exponential brute-force search over every possible assignment.

Use an intelligent hybrid approach:

```text
structured allocation
+
candidate pruning
+
multiple deterministic initial solutions
+
constrained local improvement
```

For very large datasets, use:

```text
O(n log n)
```

or approximately polynomial behaviour where possible.

If you introduce a more expensive optimization phase, enforce configurable limits and graceful fallback.

The engine must never hang indefinitely.

---

# 37. DETERMINISM

For identical input:

```text
same supervisors
same slots
same capacities
same history
same options
```

the result should be identical.

Use stable deterministic tie-breakers:

```text
priority_number
distance/difficulty
demand
current load
supervisor id
school id
group number
visit number
```

Do not use uncontrolled `Math.random()`.

---

# 38. DATA QUALITY

The controller already identifies:

```text
supervisors without rank
schools without distance
```

The engine should gracefully handle:

```text
null LGA
null route
null distance
null priority
```

Suggested defaults:

```text
unknown priority → 99
unknown distance → 0, but mark as unknown
unknown LGA → "unknown"
unknown route → "unassigned"
```

Unknown geography must not silently masquerade as a genuinely nearby school.

Track unknown-data quality explicitly.

---

# 39. FACULTY FILTERING

The controller may supply a faculty filter for dean users.

The algorithm itself should simply operate on the supervisor list it receives.

Do not add unrelated faculty-selection logic inside the optimization engine.

---

# 40. DEAN ALLOCATION

The controller can pass:

```js
maxAssignments
```

This is a hard ceiling on generated primary postings.

Do not treat it as supervisor capacity.

It is a separate global limit.

If:

```text
available slots = 100
supervisor capacity = 100
dean allocation = 30
```

the engine should assign at most 30.

Optimize the best 30, not an arbitrary first 30.

This is important.

---

# 41. MOST IMPORTANT DESIGN RULE

Do not optimize the wrong problem.

For:

```text
lga_based + priority_enabled
```

the problem is not:

> "Which supervisor is cheapest for this slot?"

The real problem is:

> "How should available supervisor capacity and priority tiers be allocated across geographically distinct LGA demand, across all requested visits, and then how should individual slots be assigned within that structure?"

Model that directly.

---

# 42. DO NOT PRESERVE BAD LEGACY DESIGN JUST FOR COMPATIBILITY

You are explicitly authorized to replace:

```text
computePriorityTiers
assignUnitsToTiers
planPriorityAllocation
marginalCost
solutionCost
localSearch
swapDelta
performSwap
```

and any other internal helper that no longer makes sense.

Do not preserve an old helper merely because it already exists.

Keep public exports/tests compatible where practical.

---

# 43. PREFERRED INTERNAL MODULE STRUCTURE

You may structure the engine roughly as:

```text
autoPostingEngine.js

normalizeInput()
buildDemandModel()
buildSupervisorModel()

buildLgaModel()
buildRouteModel()

calculateGeographyDifficulty()

buildPriorityTiers()

generateInitialSolutions()

solveLgaAllocation()
solveRouteAllocation()
solveRandomAllocation()

assignSlotsWithinClusters()

improveSolution()

validateSolution()

calculateStatistics()

buildWarnings()

finishResult()
```

This is only a recommendation.

Choose a cleaner architecture if you have one.

---

# 44. ADD TESTABLE PURE FUNCTIONS

Keep the engine free of database access.

The controller should remain responsible for:

```text
fetching supervisors
fetching slots
fetching school history
checking dean allocation
persisting postings
```

The engine should remain a pure optimization component.

This is important for unit testing.

---

# 45. REQUIRED TEST SCENARIOS

Create comprehensive tests.

At minimum test:

## Case 1

One priority tier, one LGA.

Expected:
all feasible slots allocated, no unnecessary fragmentation.

## Case 2

Three priority tiers, distances clearly separated.

Expected:
senior tier receives hardest LGAs.

## Case 3

Senior tier has insufficient capacity.

Expected:
minimum possible priority inversion, with explicit warning.

## Case 4

Large LGA with many schools.

Expected:
large demand does not automatically make the LGA appear geographically farther.

## Case 5

Small LGA with very distant schools.

Expected:
it can outrank a large nearby LGA.

## Case 6

Multiple visits.

Expected:
supervisor capacity is consumed globally across all visits.

## Case 7

Repeat-school avoidance.

Expected:
new schools preferred when feasible.

## Case 8

All alternative supervisors already cover the school.

Expected:
repeat occurs but is reported as unavoidable.

## Case 9

LGA requires multiple supervisors.

Expected:
multiple supervisors can share the LGA while preserving locality.

## Case 10

Cross-LGA assignment is unavoidable.

Expected:
it is reported clearly.

## Case 11

Dean allocation smaller than total capacity.

Expected:
best feasible subset is selected.

## Case 12

Priority disabled.

Expected:
rank has no influence.

## Case 13

Random posting.

Expected:
no artificial LGA/route clustering.

## Case 14

Route-based.

Expected:
route locality dominates over LGA locality.

## Case 15

Null/missing distances.

Expected:
no crash, explicit data-quality warning.

## Case 16

Supervisor with one remaining slot and another with three.

Expected:
capacity honoured and workload intelligently balanced.

## Case 17

Two solutions with equal primary objective.

Expected:
deterministic tie-breaking.

## Case 18

No available capacity.

Expected:
clean warning and zero assignments.

## Case 19

More slots than capacity.

Expected:
maximum feasible number assigned.

## Case 20

Duplicate input slots.

Expected:
defensive deduplication or explicit validation.

---

# 46. VALIDATION INVARIANTS

Write assertions/tests for:

```js
every assignment corresponds to a supplied slot

no slot assigned more than once

every supervisor assignment count <= remaining_slots

assignments.length <= maxAssignments

every visit_number <= numberOfPostings

priority constraints respected as far as mathematically feasible

reported statistics match actual assignments
```

Do not trust the algorithm's own bookkeeping to prove correctness.

Recompute final metrics from the final assignments.

---

# 47. IMPORTANT: ACTUALLY COMPARE CANDIDATE SOLUTIONS

For every candidate solution, calculate a lexicographic objective vector similar to:

```js
[
  unassignedCount,
  hardViolationCount,
  priorityInversionCount,
  priorityInversionSeverity,
  crossLgaAssignmentCount,
  lgaFragmentation,
  repeatCount,
  workloadImbalance,
  travelImbalance
]
```

Compare lexicographically.

Lower is better.

This is preferable to:

```js
total =
  repeat * 2000 +
  affinity * 300 +
  load * 200 +
  travel
```

because the institutional priorities are explicit.

You can internally use additional fine-grained scores as tie-breakers, but they must not override higher-level objectives.

---

# 48. DO NOT HIDE IMPOSSIBILITY

Sometimes the mathematically ideal result is impossible.

Do not pretend otherwise.

Return the best feasible solution and explain:

```text
what was impossible
why it was impossible
what compromise was made
how many assignments were affected
```

This makes the engine auditable.

---

# 49. KEEP THE CONTROLLER WORKING

The existing controller uses:

```js
result.assignments
result.statistics
result.warnings
```

and persists each assignment.

Do not require the controller to understand an optimization graph or solver object.

The engine must return the final assignment list in the expected format.

If controller changes are absolutely necessary, make the smallest possible changes and clearly explain them.

Do not unnecessarily rewrite the controller.

---

# 50. KEEP THE FRONTEND WORKING

The existing frontend already expects the auto-posting feature to work from the Auto-Post dialog and then refresh the multiposting page after completion.

Do not redesign the UI as part of this task.

The algorithm rewrite should be backend-compatible.

The frontend should be able to display:

```text
assignments
statistics
warnings
```

without needing a major change.

---

# 51. OUTPUT FORMAT I EXPECT FROM YOU

Do not just provide a discussion of what should be done.

Actually implement the rewrite in the repository.

Your response should include:

## A. What you changed

Explain the new architecture briefly.

## B. Files changed

List every modified/new file.

## C. Full implementation

Provide the actual code changes.

## D. Tests

Add/update automated tests for the cases above.

## E. Verification

Run the test suite and relevant lint/type checks if available.

## F. Compatibility notes

Explicitly state whether the existing controller and frontend contracts remain compatible.

## G. Algorithm quality report

Explain:

```text
how LGA difficulty is calculated
how priority tiers are allocated
how capacity is shared across visits
how repeat schools are handled
how LGA coherence is protected
how improvement works
how impossibility is reported
```

---

# 52. VERY IMPORTANT — DO NOT PATCH THE CURRENT ALGORITHM

I do not want a sixth iteration of:

```text
greedy algorithm
+
another priority penalty
+
another weight
+
another swap rule
```

The current design already demonstrates that approach.

The rewrite should change the **optimization model itself**.

Think of the problem as a constrained allocation / scheduling problem, not a sequence of independent supervisor-slot decisions.

---

# 53. SUCCESS CRITERIA

I will consider the rewrite successful when the following are true:

### Priority

When priority is enabled:

```text
higher-priority supervisors systematically receive harder/farther geographical work
```

and priority inversions are explicitly minimized and reported.

### LGA

When `lga_based` is selected:

```text
supervisors are kept geographically coherent by LGA
```

and the same supervisor should not be scattered across unrelated LGAs during a visit unless unavoidable.

### Capacity

```text
no supervisor exceeds capacity
```

and overall capacity is used efficiently.

### Visits

```text
capacity is shared correctly across Visit 1..N
```

rather than recalculated independently per visit.

### Repeats

When avoidance is enabled:

```text
repeat schools are minimized
```

without overriding more important geographical/priority constraints.

### Fairness

Workload is reasonably balanced after satisfying the more important constraints.

### Determinism

Same input → same result.

### Explainability

The engine can tell us why it made the allocation.

### Safety

No duplicate slots, no over-capacity supervisors, no invalid assignments.

---

# 54. FINAL INSTRUCTION TO CLAUDE

Before coding:

1. Read the existing `autoPostingEngine.js`.
2. Read the auto-posting controller.
3. Read the posting frontend and Auto-Post dialog.
4. Read the relevant posting models/schema/queries/tests.
5. Understand how merged/dependent postings are handled.
6. Understand how existing school history and supervisor capacity are calculated.
7. Identify all assumptions made by the existing engine.
8. Then replace the optimization engine with the new architecture.

Do not assume the current comments describe correct behaviour; use the actual code and data flow.

Do not make the system more complicated merely for the sake of complexity.

The target is:

> **A deterministic, auditable, capacity-aware, priority-aware, geography-aware optimizer that produces the best practical supervisor posting allocation, with LGA + Priority as the strongest and most carefully solved scenario.**

Most importantly:

> **Do not optimize the current heuristic. Replace it with a better allocation model.**
