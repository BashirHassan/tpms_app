# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`cd backend`)

```bash
npm run dev          # Start dev server with hot reload (port 5000)
npm start            # Start production server
npm test             # Run Jest test suite with coverage
npm run migrate      # Run database migrations
npm run seed         # Seed base reference data
npm run seed:students # Seed sample student and acceptance data
```

### Frontend (`cd frontend`)

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Build production bundle
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint issues
```

### Running a single test

```bash
cd backend && npx jest path/to/test.file.js --coverage=false
```

### Local development with institution context

Access the frontend at `http://{slug}.localhost:5173` (e.g., `http://demo.localhost:5173`) or use the `?subdomain=fuk` query param fallback. The Vite proxy extracts the subdomain and forwards it as `X-Subdomain` to the backend.

## Architecture

### Multi-Tenancy — Core Rule

Shared-schema model: all tenants share the same MySQL database. Every tenant-scoped table has an `institution_id` column. **Every query must include `WHERE institution_id = ?`** — omitting it is a data leak.

```javascript
// ✅ Correct
const { institutionId } = req.params;  // from URL: /api/:institutionId/students
const students = await query(
  'SELECT * FROM students WHERE institution_id = ?',
  [parseInt(institutionId)]
);

// ❌ Wrong — no institution_id filter
await query('SELECT * FROM students WHERE status = ?', ['active']);
```

The legacy Repository pattern has been fully removed. Use direct SQL with the `database.js` helpers only.

### API Design (MedeePay Pattern)

Institution ID is an explicit URL segment, not derived from the token alone:

```text
GET  /api/:institutionId/students
POST /api/:institutionId/postings
```

Route namespaces in [backend/src/routes/index.js](backend/src/routes/index.js):

| Path | Auth | Purpose |
| --- | --- | --- |
| `/api/public/*` | None | Institution lookup, public forms |
| `/api/auth/*` | Mixed | Login, logout, password reset |
| `/api/global/*` | `super_admin` only | Cross-institution operations |
| `/api/:institutionId/*` | Staff JWT | All institution-scoped CRUD |
| `/api/portal/*` | Student JWT | Student self-service portal |

**Route ordering matters**: `/api/portal/*` must be registered before `/:institutionId/*` to avoid `institutionId = 'portal'` path collisions.

### Middleware Stack (order matters)

```javascript
router.post('/:institutionId/students',
  authenticate,                // 1. JWT validation → req.user
  requireInstitutionAccess(),  // 2. Validates user can access this institution
  isHeadOfTP,                  // 3. Role check (head_of_teaching_practice+)
  validate(schemas.create),    // 4. Zod schema validation
  controller.create
);
```

Role hierarchy (ascending permissions):
`student` < `field_monitor` < `supervisor` < `head_of_teaching_practice` < `super_admin`

Pre-configured role middlewares in [backend/src/middleware/auth.js](backend/src/middleware/auth.js): `staffOnly`, `isFieldMonitor`, `isSupervisor`, `isHeadOfTP`, `isSuperAdmin`.

### Authentication

Two distinct auth flows, both return JWTs:

- **Staff**: email + password → `POST /api/auth/login`
- **Student**: registration number + 10-digit PIN → `POST /api/auth/student-login`

JWT payload: `{ userId, institutionId, role, authType, sessionId }`. Sessions are stored in `user_sessions` for per-session revocation. Multiple simultaneous sessions are supported (tab isolation via `sessionStorage`).

### Backend Controller Pattern

```javascript
const { query, transaction } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');

const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;  // always from URL
    const { name, email } = req.body;

    if (!name) throw new ValidationError('Name is required');

    const result = await query(
      'INSERT INTO students (institution_id, name, email) VALUES (?, ?, ?)',
      [parseInt(institutionId), name, email]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    next(error);  // always pass errors to next()
  }
};
```

**Error classes** (from `backend/src/utils/errors.js`):

- `ValidationError` → 400
- `NotFoundError` → 404
- `AuthorizationError` → 403
- `ConflictError` → 409

### Database Layer

Direct SQL via [backend/src/db/database.js](backend/src/db/database.js):

- `query(sql, params)` — execute and return all rows
- `queryOne(sql, params)` — return first row or null
- `transaction(async (conn) => { ... })` — auto commit/rollback
- `findById(table, id, institutionId)` — institution-scoped lookup
- `insert(table, data)`, `updateById(table, id, institutionId, data)`, `deleteById(table, id, institutionId)`

All queries use `?` placeholders — never string interpolation.

Migrations live in `backend/database/migrations/` numbered sequentially (e.g., `035_feature_name.sql`). Run with `npm run migrate` from `/backend`.

### Frontend State & Context

Provider hierarchy (outermost → innermost):

```text
AuthProvider → InstitutionSelectionProvider → InstitutionProvider → ToastProvider → Routes
```

- `AuthContext` — JWT/user management, tab-scoped via `sessionStorage` (`tabStorage` utils), enabling multi-account per-browser
- `InstitutionSelectionContext` — active institution resolved from subdomain (separate from auth)
- `InstitutionContext` — institution branding, config, feature flags
- `ToastContext` — global notification toasts

### Frontend API Calls

Prefer the `useInstitutionApi` hook inside components — it auto-prefixes with `/:institutionId`:

```jsx
import { useInstitutionApi } from '../hooks/useInstitutionApi';

function StudentsPage() {
  const { get, post } = useInstitutionApi();

  const loadStudents = async () => {
    const data = await get('/students');  // → /api/:institutionId/students
    return data.data;
  };
}
```

For non-hook contexts (utilities, outside React), use the API factory functions:

```javascript
import { createStudentsApi } from '../api';
const api = createStudentsApi(institutionId);
const students = await api.getAll();
```

The raw Axios client at `frontend/src/api/client.js` auto-attaches `Authorization`, `X-Subdomain`, and `X-Tab-Id` headers. API response shape: `response.data.data` for the payload, `response.data.pagination` for pagination — the interceptor does **not** unwrap `data.data`.

### Frontend Routing

All pages are lazy-loaded via `React.lazy`. Route guards in `frontend/src/components/auth/ProtectedRoute.jsx`: `StaffRoute`, `AdminRoute`, `HeadOfTPRoute`, `SupervisorRoute`, `SuperAdminRoute`, `StudentRoute`, `AdminOrDeanRoute`.

Layouts: `AdminLayout` (staff), `StudentLayout` (student portal), `PublicLayout` (landing/auth pages).

Path alias `@` resolves to `frontend/src/`.

### Icons

Use **Tabler Icons only**:

```jsx
import { IconUsers, IconCheck } from '@tabler/icons-react';
```

See `frontend/ICON_GUIDELINES.md` for the full icon reference.

### Key Backend Services

| Service | Purpose |
| --- | --- |
| `emailService` | Direct send — for critical emails (password reset, time-sensitive) |
| `emailQueueService` | Async with retry — for bulk/non-urgent emails |
| `encryptionService` | AES-256-GCM — student PINs and sensitive API keys |
| `cloudinaryService` | Image/document uploads for acceptances and results |
| `paystackService` | Payment gateway integration |
| `documentService` | PDF generation (PDFKit + QR codes) |

#### Email usage

```javascript
// Direct send (password resets, critical notifications)
await emailService.sendEmail(institutionId, {
  to: 'user@example.com',
  template: 'passwordReset',
  data: { name: 'John', resetUrl: 'https://...' }
});

// Queued send (bulk, non-urgent)
await emailQueueService.enqueue(institutionId, {
  to: 'user@example.com',
  template: 'welcomeEmail',
  data: { name: 'Jane' }
}, { priority: 'normal' }); // 'high' | 'normal' | 'low'
```

Institution SMTP settings are stored encrypted in the `institutions` table. System-level emails use `.env` SMTP credentials.

#### File uploads

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype)),
  limits: { fileSize: 1 * 1024 * 1024 }  // 1MB
});

// Upload to Cloudinary
const result = await cloudinaryService.uploadImage(req.file, {
  institutionCode: 'FUKASHERE',
  sessionName: '2024-2025',
  type: 'acceptances',  // folder: digitaltp/FUKASHERE/2024-2025/acceptances/
  studentId: student.registration_number
});
```

## Common Gotchas

1. **`super_admin` has no institution** — must select one via the institution switcher or use `/api/global/*` routes
2. **Students authenticate differently** — registration number + PIN, not email + password
3. **Institution context ≠ authentication** — a user can be authenticated but have no institution selected
4. **Feature toggles are per-institution** — check with `isFeatureEnabled('feature_key')` before using
5. **Legacy Repository pattern is gone** — use direct SQL with `database.js` helpers

## Key Architecture Docs

- `docs/MEDEEPAY_PATTERN_MIGRATION.md` — URL-path tenancy pattern details
- `docs/PRD.md` — Feature requirements by phase
- `docs/DOCUMENT_TEMPLATE_SYSTEM.md` — Template placeholder reference

## Environment

Copy `backend/.env.example` to `backend/.env`. Required vars: `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `SMTP_*`, `CLOUDINARY_*`. `ENCRYPTION_KEY` is a Base64-encoded 32-byte key required in production.
