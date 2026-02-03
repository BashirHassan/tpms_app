# Super Admin Subdomain-Aligned Architecture Refactor

## Objective

Refactor the entire super admin implementation to strictly align super-admin behavior with the institution subdomain used at login. This refactor simplifies logic, eliminates implicit institution selection, and enforces subdomain-first tenancy.

---

## 🔹 Domain Architecture

| Subdomain | Purpose | Users |
|-----------|---------|-------|
| `digitaltipi.com` | Landing page only | Public |
| `admin.digitaltipi.com` | Global admin dashboard, institution management, global user management | super_admin only |
| `{institution}.digitaltipi.com` | Institution-scoped operations | All roles (institution staff + super_admin) |

### Development Environment

| URL | Purpose |
|-----|---------|
| `localhost:5173` | Landing page |
| `admin.localhost:5173` | Global admin dashboard |
| `fuk.localhost:5173` | FUK institution |
| `gsu.localhost:5173` | GSU institution |

---

## 🔹 Core Principles (Must Not Be Violated)

| Principle | Description |
|-----------|-------------|
| **Subdomain determines context** | The subdomain used at login is the source of truth for institution context. No automatic institution selection outside of subdomain resolution. No hidden or implicit tenant switching. |
| **Super admin is still tenant-aware** | Super admin is not "outside" tenancy. Super admin behaves like a normal institution user when logged in via an institution subdomain. |
| **Global access is explicit** | Global dashboard is accessed via `admin.` subdomain only. Super admin must intentionally navigate to global context. |

---

## 🔹 Current State Analysis

### Files to Modify

| Category | File | Current Issue |
|----------|------|---------------|
| **Auth Context** | `frontend/src/context/AuthContext.jsx` | Contains `switchedInstitution`, `switchInstitution()`, `returnToHomeInstitution()` - allows in-tab switching |
| **Institution Selection** | `frontend/src/context/InstitutionSelectionContext.jsx` | Maintains separate institution state, allows explicit selection |
| **Institution Switcher** | `frontend/src/components/ui/InstitutionSwitcher.jsx` | Dropdown for switching institutions in same tab |
| **Protected Route** | `frontend/src/components/auth/ProtectedRoute.jsx` | Special handling for super admin without institution |
| **Dashboard Page** | `frontend/src/pages/admin/DashboardPage.jsx` | Auto-routes to GlobalAdminDashboard when no institution |
| **Admin Layout** | `frontend/src/layouts/AdminLayout.jsx` | Renders InstitutionSwitcher in header |
| **API Client** | `frontend/src/api/client.js` | `X-Institution-Id` header for institution switching |
| **Backend RBAC** | `backend/src/middleware/rbac.js` | Already enforces institution from URL - OK |
| **Subdomain Resolver** | `backend/src/middleware/subdomainResolver.js` | Resolves institution from subdomain - OK |

---

## 📋 Implementation Phases

---

## Phase 1: Backend Enforcement

**Goal:** Ensure backend enforces subdomain-based context and recognizes `admin` subdomain for global operations.

### 1.1 Update Subdomain Resolver

**File:** `backend/src/middleware/subdomainResolver.js`

- [ ] Remove `X-Institution-Id` header override for super_admin
- [ ] Institution context MUST come from subdomain only
- [ ] If subdomain is `admin`, institution is NULL (global context for super_admin)
- [ ] If no subdomain, this is landing page (no auth context needed)

```javascript
// REMOVE this logic:
// const institutionIdHeader = req.headers['x-institution-id'];
// if (institutionIdHeader && user?.role === 'super_admin') { ... }

// ADD this logic:
const subdomain = extractSubdomain(host, req.query);

// Reserved subdomain for global admin
if (subdomain === 'admin') {
  req.subdomain = 'admin';
  req.institution = null; // Global context
  req.isGlobalContext = true;
  return next();
}
```

### 1.2 Update RBAC Middleware

**File:** `backend/src/middleware/rbac.js`

- [ ] `requireInstitutionAccess()` already validates access correctly ✅
- [ ] Add explicit check: even super_admin must have matching subdomain context
- [ ] Log attempts to access via header override as security events

### 1.3 Update Auth Controller

**File:** `backend/src/controllers/authController.js`

- [ ] On login, return institution resolved from subdomain
- [ ] Do NOT return `home_institution_id` for switching purposes
- [ ] Super admin login on institution subdomain = that institution only

---

## Phase 2: Remove Institution Switcher

**Goal:** Completely remove the ability to switch institutions in the same browser tab.

### 2.1 Delete Institution Switcher Component

**File:** `frontend/src/components/ui/InstitutionSwitcher.jsx`

- [ ] Delete the entire file

### 2.2 Remove from Admin Layout

**File:** `frontend/src/layouts/AdminLayout.jsx`

- [ ] Remove `import InstitutionSwitcher`
- [ ] Remove `<InstitutionSwitcher />` from header

### 2.3 Clean Up Auth Context

**File:** `frontend/src/context/AuthContext.jsx`

- [ ] Remove `switchedInstitution` state
- [ ] Remove `switchInstitution()` function
- [ ] Remove `returnToHomeInstitution()` function
- [ ] Remove `isSwitched` computed property
- [ ] Remove `isPlatformSuperAdmin` (no longer relevant)
- [ ] Simplify `effectiveInstitution` to just `institution`

### 2.4 Clean Up API Client

**File:** `frontend/src/api/client.js`

- [ ] Remove `getSwitchedInstitutionId()` function
- [ ] Remove `setSwitchedInstitutionId()` function
- [ ] Remove `clearSwitchedInstitution()` function
- [ ] Remove `X-Institution-Id` header injection
- [ ] Keep `X-Subdomain` header (still needed for backend)

### 2.5 Clean Up Institution Selection Context

**File:** `frontend/src/context/InstitutionSelectionContext.jsx`

- [ ] Remove `selectInstitution()` for super_admin switching
- [ ] Institution comes from subdomain via auth context only
- [ ] Simplify to just manage features and branding

---

## Phase 3: Subdomain-First Auth Flow

**Goal:** Super admin login on subdomain behaves exactly like regular admin.

### 3.1 Update Login Flow

**File:** `frontend/src/pages/auth/LoginPage.jsx`

- [ ] On successful login, institution is already resolved from subdomain
- [ ] No special handling for super_admin role
- [ ] Navigate to `/admin/dashboard` (institution dashboard)

### 3.2 Update Auth Context Initialization

**File:** `frontend/src/context/AuthContext.jsx`

- [ ] Remove check for `getSwitchedInstitutionId()`
- [ ] Institution comes from profile response (already resolved from subdomain)
- [ ] Super admin without institution = logged in via main domain (no subdomain)

```javascript
// NEW simplified logic:
const { user, institution } = profileResponse;
setUser(user);
setInstitution(institution); // null if no subdomain, otherwise resolved
```

### 3.3 Update Protected Route

**File:** `frontend/src/components/auth/ProtectedRoute.jsx`

- [ ] Remove `needsInstitutionSelection` handling
- [ ] Remove special "Select Institution" prompt for super admin
- [ ] If route requires institution and user has none → redirect to main domain

---

## Phase 4: Global Dashboard Access

**Goal:** Global dashboard is opt-in, accessed via explicit navigation.

### 4.1 Add Global Overview Nav Item

**File:** `frontend/src/layouts/AdminLayout.jsx`

- [ ] Add "Global Overview" link in sidebar (super_admin only)
- [ ] Link redirects to `admin.digitaltipi.com` (or `admin.localhost:5173` in dev)
- [ ] Style with `IconExternalLink` indicator

```javascript
// Helper to get admin domain based on environment
const getAdminDomain = () => {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return 'http://admin.localhost:5173';
  }
  return 'https://admin.digitaltipi.com';
};

// In navigationGroups, add:
{
  name: 'Platform',
  items: [
    { 
      name: 'Global Overview', 
      href: getAdminDomain() + '/admin/dashboard', 
      icon: IconBuildingSkyscraper, 
      roles: ROLE_GROUPS.SUPER_ADMIN_ONLY,
      external: true, // Opens in new tab
      newTab: true,
    },
  ],
}
```

### 4.2 Update Dashboard Page

**File:** `frontend/src/pages/admin/DashboardPage.jsx`

- [ ] Remove auto-redirect to GlobalAdminDashboard
- [ ] If super_admin is on institution subdomain → show InstitutionDashboard
- [ ] GlobalAdminDashboard only shows when on `admin.` subdomain

```javascript
// NEW logic:
const getDashboardComponent = () => {
  // admin.* subdomain = global view (super_admin only)
  const subdomain = getSubdomain();
  const isAdminSubdomain = subdomain === 'admin';
  
  if (isAdminSubdomain && isSuperAdmin) {
    return <GlobalAdminDashboard />;
  }
  
  // Institution subdomain = institution view
  if (user?.role === 'head_of_teaching_practice' || isSuperAdmin) {
    return <InstitutionDashboard />;
  }
  
  // ... rest unchanged
};
```

### 4.3 Update Global Dashboard

**File:** `frontend/src/pages/admin/dashboards/GlobalAdminDashboard.jsx`

- [ ] Add institution cards with "Open" buttons
- [ ] "Open" button opens `https://{subdomain}.digitaltipi.com/admin` in new tab
- [ ] Uses SSO (same token works across subdomains)

```javascript
// Helper to get institution URL based on environment
const getInstitutionUrl = (subdomain) => {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return `http://${subdomain}.localhost:5173/admin`;
  }
  return `https://${subdomain}.digitaltipi.com/admin`;
};

// Add to each institution card:
<a 
  href={getInstitutionUrl(inst.subdomain)}
  target="_blank"
  rel="noopener noreferrer"
  className="btn-primary"
>
  Open <IconExternalLink size={16} />
</a>
```

---

## Phase 5: Route Updates

**Goal:** Routes enforce subdomain context properly.

### 5.1 Update Main App Routes

**File:** `frontend/src/App.jsx`

- [ ] `/admin/global/*` routes require NO institution (main domain only)
- [ ] All other `/admin/*` routes require institution (subdomain)
- [ ] Add route guard for global routes: if has institution, redirect to institution dashboard

### 5.2 Add Subdomain Detection Hook

**File:** `frontend/src/hooks/useSubdomain.js`

- [ ] Already exists ✅
- [ ] Ensure `isAdminSubdomain()` helper is available
- [ ] Add `getAdminDomain()` helper for environment-aware redirects
- [ ] Add `getInstitutionUrl(subdomain)` helper for institution links

```javascript
// Add these helpers to useSubdomain.js or create utils/domainHelpers.js

/**
 * Check if current subdomain is the admin subdomain
 */
export function isAdminSubdomain() {
  const subdomain = getSubdomain();
  return subdomain === 'admin';
}

/**
 * Get the admin domain URL based on environment
 */
export function getAdminDomain() {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return 'http://admin.localhost:5173';
  }
  return 'https://admin.digitaltipi.com';
}

/**
 * Get institution URL based on environment
 * @param {string} subdomain - Institution subdomain
 */
export function getInstitutionUrl(subdomain) {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return `http://${subdomain}.localhost:5173`;
  }
  return `https://${subdomain}.digitaltipi.com`;
}

/**
 * Check if we're on landing page (no subdomain)
 */
export function isLandingPage() {
  const subdomain = getSubdomain();
  return !subdomain;
}
```

### 5.3 Update Route Guards

**File:** `frontend/src/components/auth/ProtectedRoute.jsx`

- [ ] Add `GlobalRoute` guard: requires super_admin AND `admin.` subdomain
- [ ] Add `InstitutionRoute` guard: requires institution subdomain OR redirect to admin subdomain

```javascript
export function GlobalRoute({ children }) {
  const { isSuperAdmin } = useAuth();
  const subdomain = getSubdomain();
  const isAdminSubdomain = subdomain === 'admin';
  
  if (!isSuperAdmin) return <UnauthorizedPage />;
  if (!isAdminSubdomain) {
    // On institution subdomain, redirect to admin subdomain
    const adminUrl = getAdminDomain() + '/admin/dashboard';
    window.location.href = adminUrl;
    return null;
  }
  
  return children;
}

// Helper for environment-aware admin domain
function getAdminDomain() {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return 'http://admin.localhost:5173';
  }
  return 'https://admin.digitaltipi.com';
}
```

---

## Phase 6: Cleanup & Testing

**Goal:** Remove all dead code and verify behavior.

### 6.1 Remove Dead Code

- [ ] Delete `SWITCHED_INSTITUTION_KEY` from localStorage usage
- [ ] Delete `switched_institution_id` storage key references
- [ ] Remove unused imports across all modified files
- [ ] Run ESLint to catch unused variables

### 6.2 Verify SSO Across Subdomains

- [ ] Login on `fuk.localhost:5173` (or `fuk.digitaltipi.com`)
- [ ] Open `http://gsu.localhost:5173/admin` (or `https://gsu.digitaltipi.com/admin`) in new tab
- [ ] Should be authenticated (same token)
- [ ] Should see GSU institution context (from subdomain)

### 6.3 Test Matrix

| Scenario | Expected Behavior |
|----------|-------------------|
| Super admin login on `fuk.digitaltipi.com` | Institution = FUK, InstitutionDashboard |
| Super admin login on `admin.digitaltipi.com` | Institution = null, GlobalAdminDashboard |
| Click "Global Overview" from FUK dashboard | Redirects to `admin.digitaltipi.com`, authenticated |
| Click "Open" on GSU from global dashboard | New tab opens `gsu.digitaltipi.com`, authenticated |
| Regular admin login on `fuk.digitaltipi.com` | Institution = FUK, InstitutionDashboard |
| Regular admin tries to access `admin.digitaltipi.com` | 403 Unauthorized |
| Super admin on subdomain accesses `/admin/students` | Works, scoped to subdomain institution |
| **Dev:** Super admin login on `admin.localhost:5173` | Institution = null, GlobalAdminDashboard |
| **Dev:** Click "Global Overview" from `fuk.localhost:5173` | Redirects to `admin.localhost:5173` |

---

## 🔹 Success Criteria (Non-Negotiable)

| Criteria | Status |
|----------|--------|
| Super admin behavior always matches login subdomain | ⬜ |
| No automatic institution selection anywhere | ⬜ |
| No InstitutionSwitcher component in UI | ⬜ |
| Global dashboard is opt-in (navigate to admin subdomain) | ⬜ |
| Institution selection always opens a new tab | ⬜ |
| Codebase is simpler than before | ⬜ |

---

## 🔹 Code Deletion Checklist

### Files to DELETE

| File | Reason |
|------|--------|
| `frontend/src/components/ui/InstitutionSwitcher.jsx` | Institution switching removed |

### Code to REMOVE

| File | Code to Remove |
|------|----------------|
| `frontend/src/api/client.js` | `getSwitchedInstitutionId()`, `setSwitchedInstitutionId()`, `clearSwitchedInstitution()`, `X-Institution-Id` header |
| `frontend/src/context/AuthContext.jsx` | `switchedInstitution`, `switchInstitution()`, `returnToHomeInstitution()`, `isSwitched`, `isPlatformSuperAdmin` |
| `frontend/src/layouts/AdminLayout.jsx` | `<InstitutionSwitcher />` component usage |
| `frontend/src/components/auth/ProtectedRoute.jsx` | "Institution Selection Required" prompt |

### Storage Keys to REMOVE

| Key | Usage |
|-----|-------|
| `switched_institution_id` | No longer used for switching |

---

## 🔹 Domain-Driven Design Alignment

### Bounded Context: Institution

| Property | Value |
|----------|-------|
| Accessed via | `https://{institution}.digitaltipi.com` |
| All data is | Tenant-scoped |
| Super admin behaves as | Tenant user with elevated permissions |
| Cross-tenant awareness | ❌ None |

### DDD Properties Enforced

- **Strong invariants** - Institution context determined by subdomain, immutable within session
- **No leakage of global state** - Each tab is isolated by subdomain
- **Single Aggregate Root** - Institution is the root for all tenant data

### Why This is Correct

DDD forbids entities from implicitly switching aggregates. The new design enforces this by:
- Removing institution switcher
- Binding tenant context to subdomain
- Each tab = one bounded context

---

## 📌 Reference

- Evans, *Domain-Driven Design* — Bounded Contexts
- https://martinfowler.com/bliki/BoundedContext.html
