# DigitalTP – Agent Execution Plan (PRD)

> **Atomic Tasks, Multi-Tenancy Isolation & SaaS-First Design**

---

## Global Execution Principles (For the Agent)

- Treat each phase as an isolated concern
- Do not leak assumptions across phases
- Every task must:
  - Have a clear input
  - Produce a verifiable output
- All database queries must include:
  - `institution_id`
  - `user_id`
- Prefer reusable engines over feature-specific logic
- Assume:
  - Multi-institution SaaS
  - Future mobile apps
  - External integrations (payments, reporting, government systems)
- System architecture must mirror JEI Management Portal patterns
  - **Exception**: repository structure uses `/frontend` + `/backend`

---

## Phase 1 — Foundation & Core Architecture

> **Goal:** Establish DigitalTP backbone, governance, and multi-tenancy isolation

### 1.1 System Bootstrap

**Tasks:**
- Initialize backend project structure
- Initialize frontend admin shell
- Enforce folder split:
  ```
  digitaltp/
  ├── frontend/
  └── backend/
  ```
- Configure environment variables & secrets
- Set up logging, error handling, request tracing
- Base API health endpoint

**Output:**
- ✅ Running backend API
- ✅ Accessible admin frontend shell
- ✅ Environment-aware deployment readiness

---

### 1.2 Authentication & Authorization (RBAC)

**Tasks:**
- Implement authentication:
  - **Staff:** email/password
  - **Student:** registration number + PIN
- Implement RBAC middleware
- Define roles:
  | Role | Description |
  |------|-------------|
  | Super Admin | Full system access |
  | Head of Teaching Practice | Institution-level oversight |
  | Supervisor | Student supervision & scoring |
  | Lead Monitor | Monitoring coordination |
  | Field Monitor | On-site monitoring |
  | Student | Self-service portal access |
- Permission matrix per role
- Institution-scoped session handling

**Output:**
- ✅ RBAC-enforced authentication system
- ✅ Zero cross-institution access

---

### 1.3 Multi-Tenancy & SaaS Governance

**Tasks:**
- Institution entity & isolation rules
- Institution branding configuration
- Institution feature flags engine
- Enforce `institution_id` on all queries
- Guard against data leakage

**Output:**
- ✅ Multi-tenant safe SaaS foundation
- ✅ Institution-level configuration working

---

### 1.4 Feature Toggle Engine

**Tasks:**
- Feature toggle schema
- Runtime feature checks (backend & frontend)
- Toggle UI for Super Admin
- Module-level enable/disable support

**Output:**
- ✅ Dynamic module activation per institution

---

## Phase 2 — Academic & Human Data Core

> **Goal:** Build immutable academic and human resource primitives

### 2.1 Academic Structure Engine

**Tasks:**
- Faculties CRUD
- Departments CRUD (faculty-scoped)
- Programs CRUD (department-scoped)
- Institution-specific program codes

**Output:**
- ✅ Academic hierarchy usable across the system

---

### 2.2 Student Ingestion & Program Detection Engine

**Tasks:**
- Excel upload parser
- Required fields:
  - Full name
  - Registration number
- Program auto-detection logic based on reg number patterns
- Pre-upload validation summary:
  - Total rows
  - Detected programs
  - Errors & duplicates
- Generate PINs automatically

**Output:**
- ✅ Clean, validated student dataset
- ✅ Program mapping without manual assignment

---

### 2.3 Staff & Rank Management

**Tasks:**
- Rank CRUD:
  - Rank name
  - Code
  - Allowance components:
    - Local running
    - Transport (per KM)
    - DSA
    - DTA
    - TETFUND
    - Others
- Staff CRUD:
  - Roles
  - Rank binding
  - Bulk & single upload
- Supervisor eligibility rules

**Output:**
- ✅ Staff + allowance computation backbone

---

## Phase 3 — Schools, Routes & Sessions Engine

> **Goal:** Define teaching practice environment & constraints

### 3.1 School Management Engine

**Tasks:**
- School CRUD with:
  | Field | Description |
  |-------|-------------|
  | Name | School name |
  | Type | School type |
  | Category | Classification |
  | Route | Assigned route |
  | State / LGA / Town | Location |
  | Address | Physical address |
  | Distance (KM) | From institution |
  | Student capacity | Max students |
  | Principal name | Contact person |
  | Principal phone | Contact number |
- Bulk upload (Super Admin only)
- Validation against capacity rules

**Output:**
- ✅ Canonical school dataset usable for posting, letters, monitoring

---

### 3.2 Route Management

**Tasks:**
- Route CRUD (e.g., North Route, East Route)
- Route-school linkage
- Route-based posting logic support

**Output:**
- ✅ Route-aware posting infrastructure

---

### 3.3 Session Configuration Engine

**Tasks:**
- Academic session creation
- Configure:
  | Setting | Description |
  |---------|-------------|
  | Max posting per supervisor | Limit per session |
  | Max students per school per program | Capacity control |
  | Local running distance | Threshold for allowance |
  | Grouping enable/disable | Toggle grouping |
  | Max students per group | Group size limit |
  | Posting letter availability date | Release date |
  | Session locking | Lock after activation |

**Output:**
- ✅ Session-scoped operational rules enforced globally

---

## Phase 4 — Student Portal & Acceptance Workflow

> **Goal:** Secure student self-service with strict gatekeeping

### 4.1 Student Portal Access Control

**Tasks:**
- Portal access window enforcement
- Payment gate enforcement
- Program-based partial payment logic

**Output:**
- ✅ Students blocked unless requirements are met

---

### 4.2 Payment Engine (Reuse JEI Pattern)

**Tasks:**
- Paystack inline integration
- Per-student vs per-session logic
- No payment by student (per session)
- Webhook verification
- Immutable transaction logs

**Output:**
- ✅ Verified, auditable payment system

---

### 4.3 Acceptance Form Engine

**Tasks:**
- Acceptance form fields:
  | Field | Required |
  |-------|----------|
  | Phone | Yes |
  | Email | Optional |
  | School selection | Yes |
  | Signed & stamped image | Yes |
- File validation (type, size)
- Submission window enforcement
- Submission summary generation

**Output:**
- ✅ Acceptance forms ready for posting logic

---

### 4.4 Student Grouping Engine

**Tasks:**
- Dynamic grouping per school
- Respect max students per group it enabled
- Group allocation during acceptance submission
- If grouping not enabled, default 1

**Output:**
- ✅ Deterministic group allocation engine

---

## Phase 5 — Posting, Allowances & Documents

> **Goal:** Automate posting and official documentation

### 5.1 Supervisor Posting Engine

**Tasks:**
- Automated posting:
  - Routes
  - Supervisor limits
  - Visit count
- Manual multi-posting UI
- Duplicate detection per session
- Posting validation rules

**Output:**
- ✅ Accurate, fair supervisor postings

---

### 5.2 Allowance Calculation Engine

**Tasks:**
- Calculate allowances on posting
- Snapshot allowance values
- Breakdown by:
  - Supervisor
  - Visit
  - Session

**Output:**
- ✅ Immutable allowance computation records

---

### 5.3 Posting Letter Engine (Core Artifact)

**Tasks:**
- Generate institution-branded PDF posting letters
- Include:
  | Field | Description |
  |-------|-------------|
  | Student details | Name, reg number |
  | Program & department | Academic info |
  | School details | Assigned school |
  | Principal name & phone | Contact info |
  | Supervisor | Assigned supervisor |
  | Route | Assigned route |
- Enforce availability date
- Log downloads

**Output:**
- ✅ Controlled, auditable posting letters

---

## Phase 6 — Monitoring, Scoring & Reporting

> **Goal:** Oversight, accountability, and performance insight

### 6.1 Supervisor Scoring Module

**Tasks:**
- Supervisor-student allocation enforcement
- Score upload
- Score locking per session

**Output:**
- ✅ Valid supervision scoring records

---

### 6.2 Monitoring Engine

**Tasks:**
- Lead Monitor dashboards
- Field Monitor assignments
- School & supervisor evaluation reports

**Output:**
- ✅ Monitoring visibility across institutions

---

### 6.3 Reporting & Analytics

**Tasks:**
- Allowance summaries
- Posting statistics
- Exportable reports

**Output:**
- ✅ Decision-ready institutional reports

---

## Phase 7 — System Hardening & SaaS Readiness

> **Goal:** Production-grade DigitalTP

### 7.1 Security Hardening

**Tasks:**
- Request sanitization
- Rate limiting
- Secure file access
- RBAC audit logging
- Security headers

**Output:**
- ✅ Hardened, attack-resistant platform

---

### 7.2 Operational Readiness

**Tasks:**
- Backup strategy
- Disaster recovery plan
- Health checks
- Performance monitoring hooks

**Output:**
- ✅ Scalable SaaS-ready system

---

## Agent Execution Notes (Critical)

> ⚠️ **Important Guidelines**

| Rule | Description |
|------|-------------|
| Sequential Execution | Phases must be executed sequentially |
| No Hardcoding | Posting & grouping engines must not be hardcoded |
| Non-Negotiable | Posting Letter Engine is a core requirement |
| Extend, Don't Hack | Avoid one-off logic — extend core engines only |