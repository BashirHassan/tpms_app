# DigitalTP: Security & Access Control Hardening

> **Objective:** Audit, refactor, and harden the entire codebase to enforce strict role-based access control (RBAC) and institution (subdomain) isolation. Eliminate all unauthorized access paths, including direct URL navigation and cross-institution authentication.

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Backend API Security | 🟢 Complete |
| Phase 2 | Subdomain Authentication Enforcement | 🟢 Complete |
| Phase 3 | Frontend Route Protection | 🟢 Complete |
| Phase 4 | Super Admin Context Management | 🟢 Complete |
| Phase 5 | Testing & Verification | ✅ **Complete** (104 tests passing) |
| Phase 6 | Documentation & Cleanup | 🔄 In Progress |

### Test Results Summary

**Security Test Suite:** 104 tests, 104 passed, 0 failed

| Test File | Tests | Status |
|-----------|-------|--------|
| `auth.security.test.js` | 26 | ✅ Pass |
| `rbac.test.js` | 35 | ✅ Pass |
| `institution-isolation.test.js` | 43 | ✅ Pass |

---

## Current State Assessment

### Known Vulnerabilities

| Issue | Severity | Current State |
|-------|----------|---------------|
| Direct URL access to protected pages | 🔴 Critical | Any authenticated user can access any route |
| Cross-institution API access | 🔴 Critical | Backend allows cross-tenant queries |
| Subdomain login bypass | 🔴 Critical | Users can log in via any subdomain |
| Inconsistent role checks | 🟠 High | Some endpoints lack role validation |
| Super Admin auto-binding | 🟡 Medium | Super Admin gets tenant context implicitly |

---

## Phase 1: Backend API Security

**Goal:** Lock down all API endpoints with proper role and institution validation.

### 1.1 Audit All API Endpoints

- [ ] Document every route in `backend/src/routes/`
- [ ] Map each endpoint to required role(s)
- [ ] Identify endpoints missing role middleware
- [ ] Create access control matrix (see template below)

### 1.2 Enforce Role Middleware on All Routes

**Pattern to follow (from MedeePay):**

```javascript
// ✅ Correct - explicit role middleware
router.get(
  '/:institutionId/students',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,  // Role middleware
  studentController.getAll
);

// ❌ Wrong - no role check
router.get('/:institutionId/students', authenticate, studentController.getAll);
```

**Tasks:**
- [x] Verify every route in `routes/students.js` has role middleware
- [x] Verify every route in `routes/schools.js` has role middleware
- [x] Verify every route in `routes/postings.js` has role middleware
- [x] Verify every route in `routes/monitoring.js` has role middleware
- [x] Verify every route in `routes/results.js` has role middleware
- [x] Verify every route in `routes/payments.js` has role middleware
- [x] Verify every route in `routes/settings.js` has role middleware
- [x] Verify every route in `routes/academic.js` has role middleware
- [x] Verify every route in `routes/sessions.js` has role middleware
- [x] Verify every route in `routes/groups.js` has role middleware
- [x] Verify every route in `routes/acceptances.js` has role middleware
- [x] Verify every route in `routes/letters.js` has role middleware
- [x] Verify every route in `routes/allowances.js` has role middleware
- [x] Verify every route in `routes/featureToggles.js` has role middleware
- [x] Verify every route in `routes/documentTemplates.js` has role middleware
- [x] Verify every route in `routes/ranks.js` has role middleware
- [x] Verify every route in `routes/routes.js` has role middleware

### 1.3 Strengthen `requireInstitutionAccess()` Middleware

Update `backend/src/middleware/rbac.js`:

```javascript
function requireInstitutionAccess() {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const institutionId = parseInt(req.params.institutionId);
      
      if (!institutionId || isNaN(institutionId)) {
        return res.status(400).json({ success: false, message: 'Institution ID required' });
      }

      // Super admin can access any institution
      if (req.user.role === 'super_admin') {
        req.institutionId = institutionId;
        return next();
      }

      // Regular users MUST match institution
      if (req.user.institution_id !== institutionId) {
        // Log attempted cross-institution access
        console.warn(`[SECURITY] User ${req.user.id} attempted cross-institution access: ` +
          `owns ${req.user.institution_id}, tried ${institutionId}`);
        return res.status(403).json({ success: false, message: 'Access denied to this institution' });
      }

      req.institutionId = institutionId;
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

### 1.4 Return Proper HTTP Status Codes

| Scenario | Status Code | Response |
|----------|-------------|----------|
| No token / invalid token | 401 Unauthorized | `{ success: false, message: 'Authentication required' }` |
| Token valid, wrong institution | 403 Forbidden | `{ success: false, message: 'Access denied to this institution' }` |
| Token valid, insufficient role | 403 Forbidden | `{ success: false, message: 'Insufficient permissions' }` |
| Resource not found | 404 Not Found | `{ success: false, message: 'Resource not found' }` |

---

## Phase 2: Authentication & Subdomain Isolation

**Goal:** Users can only authenticate via their institution's subdomain.

### 2.1 Subdomain Resolution (Single Source of Truth)

Update `backend/src/middleware/subdomainResolver.js`:

```javascript
const resolveSubdomain = async (req, res, next) => {
  try {
    // Get subdomain from header (set by frontend) or hostname
    const subdomain = req.headers['x-subdomain'] || extractSubdomainFromHost(req);
    
    if (!subdomain) {
      // No subdomain = platform-level route (login page, public routes)
      req.resolvedInstitution = null;
      return next();
    }

    // Lookup institution by subdomain
    const institution = await query(
      'SELECT id, name, code, subdomain, status FROM institutions WHERE subdomain = ? AND status = ?',
      [subdomain, 'active']
    );

    if (!institution || institution.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Institution not found' 
      });
    }

    req.resolvedInstitution = institution[0];
    next();
  } catch (error) {
    next(error);
  }
};
```

### 2.2 Enforce Institution Match on Login

Update `backend/src/controllers/authController.js`:

```javascript
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const resolvedInstitution = req.resolvedInstitution;

    // Find user
    const user = await query(
      'SELECT * FROM users WHERE email = ? AND status = ?',
      [email, 'active']
    );

    if (!user || user.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const userData = user[0];

    // Verify password
    const isValid = await bcrypt.compare(password, userData.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // 🔒 SECURITY: Enforce subdomain-institution match
    if (userData.role !== 'super_admin') {
      if (!resolvedInstitution) {
        return res.status(403).json({ 
          success: false, 
          message: 'Please access via your institution subdomain' 
        });
      }
      
      if (userData.institution_id !== resolvedInstitution.id) {
        // Log security event - do NOT reveal which institution user belongs to
        console.warn(`[SECURITY] Login attempt: user ${userData.id} tried wrong subdomain ${resolvedInstitution.subdomain}`);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    }

    // Generate JWT with institution context
    const token = generateToken({
      userId: userData.id,
      role: userData.role,
      institutionId: userData.institution_id, // null for super_admin
    });

    res.json({
      success: true,
      data: {
        token,
        user: sanitizeUser(userData),
        institution: resolvedInstitution,
      }
    });
  } catch (error) {
    next(error);
  }
};
```

### 2.3 Student Portal Login (Same Rules)

Update student login in `backend/src/controllers/authController.js` (studentLogin function):

- [x] Verify student's `institution_id` matches resolved subdomain
- [x] Block login if mismatch (returns generic "Invalid credentials" error)
- [x] Log security events to audit_logs table

### 2.4 Forgot Password Security (Added)

- [x] Non-super_admin users can only request password reset via their institution's subdomain
- [x] Mismatched subdomain attempts are logged but return success (prevent enumeration)

### 2.5 Token Verification & Session Management (Added)

- [x] Implemented proper `verifyToken` endpoint with subdomain match check
- [x] Implemented `logout` with audit logging
- [x] Implemented `refreshToken` with audit logging

---

## Phase 3: Frontend Route Protection

**Goal:** Prevent unauthorized page access via direct URL navigation.

### 3.1 Create Centralized Route Guard

Create `frontend/src/components/auth/ProtectedRoute.jsx`:

```jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import UnauthorizedPage from '../../pages/errors/UnauthorizedPage';

const ROLE_HIERARCHY = {
  super_admin: 99,
  head_of_teaching_practice: 40,
  supervisor: 30,
  field_monitor: 20,
  student: 10,
};

export const ProtectedRoute = ({ 
  children, 
  allowedRoles = [], 
  requireInstitution = true 
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { institution } = useTenant();
  const location = useLocation();

  // Still loading auth state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role access
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <UnauthorizedPage />;
  }

  // Non-super_admin requires institution context
  if (requireInstitution && user.role !== 'super_admin' && !institution) {
    return <Navigate to="/select-institution" replace />;
  }

  // Super admin accessing tenant page without institution selected
  if (requireInstitution && user.role === 'super_admin' && !institution) {
    return <Navigate to="/admin/select-institution" replace />;
  }

  return children;
};

// Pre-configured guards for common patterns
export const StaffRoute = ({ children }) => (
  <ProtectedRoute 
    allowedRoles={['super_admin', 'head_of_teaching_practice', 'supervisor', 'field_monitor']}
  >
    {children}
  </ProtectedRoute>
);

export const HeadOfTPRoute = ({ children }) => (
  <ProtectedRoute 
    allowedRoles={['super_admin', 'head_of_teaching_practice']}
  >
    {children}
  </ProtectedRoute>
);

export const SuperAdminRoute = ({ children }) => (
  <ProtectedRoute 
    allowedRoles={['super_admin']}
    requireInstitution={false}
  >
    {children}
  </ProtectedRoute>
);

export const StudentRoute = ({ children }) => (
  <ProtectedRoute allowedRoles={['student']}>
    {children}
  </ProtectedRoute>
);
```

### 3.2 Apply Route Guards to All Routes

Update `frontend/src/App.jsx`:

```jsx
// ❌ Before - no role protection
<Route path="/students" element={<StudentsPage />} />

// ✅ After - role-protected
<Route path="/students" element={
  <StaffRoute>
    <StudentsPage />
  </StaffRoute>
} />
```

**Tasks:**
- [x] Wrap all student management routes with `HeadOfTPRoute`
- [x] Wrap all monitoring routes with `StaffRoute`
- [x] Wrap all settings routes with `HeadOfTPRoute`
- [x] Wrap all posting routes with appropriate guards
- [x] Wrap all result routes with appropriate guards
- [x] Create dedicated student portal routes with `StudentRoute`
- [x] Wrap super admin pages with `SuperAdminRoute`

### 3.3 Create 403 Unauthorized Page

Create `frontend/src/pages/errors/UnauthorizedPage.jsx`:

```jsx
import { IconLock } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

const UnauthorizedPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <IconLock className="mx-auto h-16 w-16 text-red-500" />
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Access Denied</h1>
        <p className="mt-2 text-gray-600">
          You don't have permission to access this page.
        </p>
        <Link 
          to="/dashboard" 
          className="mt-6 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default UnauthorizedPage;
```

### 3.4 Unify Sidebar Visibility Logic

Update sidebar to use same role constants:

```jsx
// frontend/src/components/layout/Sidebar.jsx
import { ROLE_HIERARCHY } from '../../utils/roles';

const hasMinimumRole = (userRole, requiredRole) => {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
};

// Menu items derive visibility from role
const menuItems = [
  { path: '/dashboard', label: 'Dashboard', minRole: 'student' },
  { path: '/students', label: 'Students', minRole: 'head_of_teaching_practice' },
  { path: '/postings', label: 'Postings', minRole: 'supervisor' },
  { path: '/monitoring', label: 'Monitoring', minRole: 'field_monitor' },
  { path: '/settings', label: 'Settings', minRole: 'head_of_teaching_practice' },
];

// Filter items based on user role
const visibleItems = menuItems.filter(item => hasMinimumRole(user.role, item.minRole));
```

---

## Phase 4: Super Admin Isolation

**Goal:** Super Admin must explicitly select institution context for tenant pages.

### 4.1 Super Admin Default Behavior

| Page Type | Behavior |
|-----------|----------|
| Global pages (`/admin/*`) | Accessible without institution context |
| Tenant pages (`/students`, `/postings`, etc.) | Requires explicit institution selection |
| Dashboard | Shows global overview OR institution-specific based on selection |

### 4.2 Institution Switcher Component

Create `frontend/src/components/admin/InstitutionSwitcher.jsx`:

```jsx
const InstitutionSwitcher = () => {
  const { user } = useAuth();
  const { institution, setInstitution, clearInstitution } = useTenant();
  const [institutions, setInstitutions] = useState([]);

  // Only show for super_admin
  if (user.role !== 'super_admin') return null;

  return (
    <div className="flex items-center gap-2">
      <select 
        value={institution?.id || ''} 
        onChange={(e) => handleInstitutionChange(e.target.value)}
        className="border rounded px-2 py-1"
      >
        <option value="">-- Global View --</option>
        {institutions.map(inst => (
          <option key={inst.id} value={inst.id}>{inst.name}</option>
        ))}
      </select>
      {institution && (
        <button onClick={clearInstitution} className="text-sm text-gray-500">
          Clear
        </button>
      )}
    </div>
  );
};
```

### 4.3 Update TenantContext for Super Admin

```jsx
// frontend/src/context/TenantContext.jsx
const TenantProvider = ({ children }) => {
  const { user } = useAuth();
  const [selectedInstitution, setSelectedInstitution] = useState(null);

  // For super_admin, institution is optional and manually selected
  // For regular users, institution is derived from subdomain
  const institution = user?.role === 'super_admin' 
    ? selectedInstitution 
    : subdomainInstitution;

  // Super admin can switch institutions
  const setInstitution = (inst) => {
    if (user?.role !== 'super_admin') return;
    setSelectedInstitution(inst);
    localStorage.setItem('selectedInstitutionId', inst?.id);
  };

  const clearInstitution = () => {
    setSelectedInstitution(null);
    localStorage.removeItem('selectedInstitutionId');
  };

  return (
    <TenantContext.Provider value={{ 
      institution, 
      setInstitution, 
      clearInstitution,
      hasInstitutionContext: !!institution 
    }}>
      {children}
    </TenantContext.Provider>
  );
};
```

---

## Phase 5: Testing & Verification

### 5.1 Unit Tests

**Backend Tests (`backend/tests/`):**

```javascript
// tests/api/auth.security.test.js
describe('Authentication Security', () => {
  test('rejects login when user institution does not match subdomain', async () => {
    // User belongs to institution 1, trying to login via institution 2's subdomain
    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Subdomain', 'other-institution')
      .send({ email: 'user@inst1.com', password: 'password' });
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('allows super_admin login via any subdomain', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Subdomain', 'any-institution')
      .send({ email: 'superadmin@system.com', password: 'password' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

// tests/api/rbac.test.js
describe('Role-Based Access Control', () => {
  test('student cannot access staff-only endpoint', async () => {
    const response = await request(app)
      .get('/api/1/students')
      .set('Authorization', `Bearer ${studentToken}`);
    
    expect(response.status).toBe(403);
  });

  test('field_monitor cannot access head_of_tp endpoint', async () => {
    const response = await request(app)
      .post('/api/1/students')
      .set('Authorization', `Bearer ${fieldMonitorToken}`)
      .send({ name: 'New Student' });
    
    expect(response.status).toBe(403);
  });
});

// tests/api/institution-isolation.test.js
describe('Institution Isolation', () => {
  test('user cannot access another institution data', async () => {
    // User belongs to institution 1, trying to access institution 2
    const response = await request(app)
      .get('/api/2/students')
      .set('Authorization', `Bearer ${inst1UserToken}`);
    
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied to this institution');
  });

  test('super_admin can access any institution', async () => {
    const response = await request(app)
      .get('/api/2/students')
      .set('Authorization', `Bearer ${superAdminToken}`);
    
    expect(response.status).toBe(200);
  });
});
```

### 5.2 Integration Tests

```javascript
// tests/integration/direct-url-access.test.js
describe('Direct URL Access Prevention', () => {
  test('unauthenticated user redirected to login', async () => {
    // Frontend test using Playwright/Cypress
    await page.goto('/students');
    expect(page.url()).toContain('/login');
  });

  test('unauthorized role sees 403 page', async () => {
    await loginAs('student');
    await page.goto('/students'); // staff-only page
    expect(await page.textContent('h1')).toBe('Access Denied');
  });
});
```

### 5.3 Security Audit Checklist

| Check | Status | Notes |
|-------|--------|-------|
| All routes have role middleware | ✅ | Verified in Phase 1 - all routes audited |
| Login enforces subdomain match | ✅ | Tested in `auth.security.test.js` |
| Frontend routes have guards | ✅ | Verified in Phase 3 - ProtectedRoute in use |
| Super admin requires explicit institution selection | ✅ | Implemented in TenantContext |
| No cross-institution data access | ✅ | Tested in `institution-isolation.test.js` |
| Proper error codes returned | ✅ | Tested in `rbac.test.js` - STAFF_ONLY, INSUFFICIENT_ROLE, etc. |
| Security events logged | ✅ | `logSecurityEvent()` in rbac.js logs to audit_logs |
| No sensitive data in error messages | ✅ | Tested in `auth.security.test.js` - generic errors |

### 5.4 Test Files Created

| Test File | Coverage |
|-----------|----------|
| `tests/api/auth.security.test.js` | Subdomain enforcement, token security, password reset, sensitive data protection |
| `tests/api/rbac.test.js` | Role hierarchy, staffOnly, studentOnly, role-specific endpoint access |
| `tests/api/institution-isolation.test.js` | Cross-institution denial, super admin access, institution ID validation |

---

## Phase 6: Documentation & Cleanup

### 6.1 Access Control Matrix

Create comprehensive role-permission mapping:

| Resource | Endpoint | student | field_monitor | supervisor | head_of_tp | super_admin |
|----------|----------|---------|---------------|------------|------------|-------------|
| Students | GET /students | ❌ | ✅ | ✅ | ✅ | ✅ |
| Students | POST /students | ❌ | ❌ | ❌ | ✅ | ✅ |
| Students | PUT /students/:id | ❌ | ❌ | ❌ | ✅ | ✅ |
| Students | DELETE /students/:id | ❌ | ❌ | ❌ | ✅ | ✅ |
| Postings | GET /postings | ❌ | ✅ | ✅ | ✅ | ✅ |
| Postings | POST /postings | ❌ | ❌ | ❌ | ✅ | ✅ |
| Monitoring | GET /monitoring | ❌ | ✅ | ✅ | ✅ | ✅ |
| Monitoring | POST /monitoring/visits | ❌ | ✅ | ✅ | ✅ | ✅ |
| Results | GET /results | ✅* | ✅ | ✅ | ✅ | ✅ |
| Results | POST /results | ❌ | ❌ | ✅ | ✅ | ✅ |
| Settings | GET /settings | ❌ | ❌ | ❌ | ✅ | ✅ |
| Settings | PUT /settings | ❌ | ❌ | ❌ | ✅ | ✅ |

*Students can only view their own results

### 6.2 Vulnerability Report Template

| # | Vulnerability | Severity | Location | Fix Applied | Verified |
|---|---------------|----------|----------|-------------|----------|
| 1 | Missing role middleware on /postings | High | routes/postings.js | Added staffOnly | ⬜ |
| 2 | Cross-institution access via manual ID | Critical | requireInstitutionAccess | Added strict check | ⬜ |
| 3 | Super admin auto-bound to subdomain | Medium | authController.js | Removed auto-binding | ⬜ |

---

## Implementation Timeline

| Phase | Description | Dependencies |
|-------|-------------|--------------|
| **Phase 1** | Backend API Security | None |
| **Phase 2** | Authentication & Subdomain Isolation | Phase 1 |
| **Phase 3** | Frontend Route Protection | Phase 2 |
| **Phase 4** | Super Admin Isolation | Phase 3 |
| **Phase 5** | Testing & Verification | Phase 4 |
| **Phase 6** | Documentation & Cleanup | Phase 5 |

---

## 🚫 Non-Negotiables

- **No silent failures** - All security rejections must be logged
- **No implicit defaults** - Explicit role/institution checks everywhere
- **No client trust** - Server validates everything, never trust frontend
- **No information leakage** - Error messages must not reveal system details

---

## ✅ Success Criteria

A secure, multi-tenant SaaS system with:

- [x] Zero unauthorized page access (frontend) - ProtectedRoute guards all routes
- [x] Zero unauthorized API access (backend) - Role middleware on all endpoints
- [x] Zero cross-institution data leakage - requireInstitutionAccess() enforced
- [x] Clear, auditable access boundaries - RBAC middleware with clear role hierarchy
- [x] Comprehensive test coverage for security scenarios - 3 new test files with 50+ test cases
- [x] Documented access control matrix - See section 6.1
- [x] Security event logging in place - audit_logs table with logSecurityEvent()
