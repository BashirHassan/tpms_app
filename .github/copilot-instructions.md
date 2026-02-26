# DigitalTP - AI Coding Agent Instructions

## Project Overview

DigitalTP is a **multi-tenant SaaS platform** for managing Teaching Practice programs at educational institutions. Uses subdomain-based tenancy (`fuk.sitpms.com`, `gsu.sitpms.com`) with strict data isolation.

**Stack:** Express.js (Node 18+) + MySQL | React + Vite + Tailwind CSS

## Critical Multi-Tenancy Rule

**Every database query MUST include `institution_id`** - this is the core data isolation mechanism.

Institution ID comes from URL path (`/api/:institutionId/resource`), not headers:

```javascript
// ✅ Correct - Direct SQL with institution_id from route params
const { query } = require('../db/database');

const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;  // From URL: /api/:institutionId/students
    const students = await query(
      `SELECT * FROM students WHERE institution_id = ?`,
      [parseInt(institutionId)]
    );
    res.json({ success: true, data: students });
  } catch (error) {
    next(error);
  }
};

// ❌ WRONG - missing institution_id filter (data leak!)
await query('SELECT * FROM students WHERE status = ?', ['active']);
```

## Route Architecture

| Path Pattern | Auth | Use Case |
|--------------|------|----------|
| `/api/public/*` | No | Institution lookup, public forms |
| `/api/auth/*` | Mixed | Login, logout, password reset |
| `/api/global/*` | super_admin | Cross-institution operations |
| `/api/:institutionId/*` | Yes | **All institution-scoped CRUD** |

### Middleware Stack (order matters)
```javascript
router.post('/:institutionId/students',
  authenticate,                    // 1. JWT validation → req.user
  requireInstitutionAccess(),      // 2. Validates user can access this institution
  isHeadOfTP,                      // 3. Role check (head_of_teaching_practice+)
  validate(schemas.create),        // 4. Zod schema validation
  controller.create
);
```

### Role Hierarchy
`student` < `field_monitor` < `supervisor` < `head_of_teaching_practice` < `super_admin`

**Pre-configured middlewares:** `staffOnly`, `isFieldMonitor`, `isSupervisor`, `isHeadOfTP`, `isSuperAdmin`

## Backend Controller Pattern

```javascript
const { query, transaction } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');

const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;  // Always from URL
    const { name, email } = req.body;
    
    if (!name) throw new ValidationError('Name is required');
    
    const result = await query(
      'INSERT INTO students (institution_id, name, email) VALUES (?, ?, ?)',
      [parseInt(institutionId), name, email]
    );
    
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    next(error);  // Always pass errors to next()
  }
};
```

**Error classes:** `ValidationError` (400), `NotFoundError` (404), `AuthorizationError` (403), `ConflictError` (409)

## Frontend Patterns

### Context Hierarchy
```
AuthProvider → InstitutionSelectionProvider → InstitutionProvider → ToastProvider → Routes
```

- **AuthContext** - JWT/user management only
- **InstitutionSelectionContext** - Active institution from subdomain (separate from auth!)

### API Calls (use `useInstitutionApi` hook)

```jsx
import { useInstitutionApi } from '../hooks/useInstitutionApi';

function StudentsPage() {
  const { get, post } = useInstitutionApi();  // Auto-prefixes with /:institutionId
  
  const loadStudents = async () => {
    const data = await get('/students');  // → /api/:institutionId/students
    return data.data;
  };
}
```

**For non-hook contexts:** Use API factory functions:
```javascript
import { createStudentsApi } from '../api';
const api = createStudentsApi(institutionId);
const students = await api.getAll();
```

### Icons - Tabler Only

```jsx
import { IconUsers, IconCheck } from '@tabler/icons-react';  // ✅ Only use this library
```

See `frontend/ICON_GUIDELINES.md` for full icon reference.

## Database

- MySQL with `mysql2` driver
- Migrations in `backend/database/migrations/` (numbered sequentially, e.g., `035_feature_name.sql`)
- All tables have `institution_id` foreign key (except `institutions` itself)
- Run migrations: `npm run migrate` (from `/backend`)

## Key Services

| Service | Purpose |
|---------|---------|
| `emailService` | Direct send (for critical emails like password reset) |
| `emailQueueService` | Async with retry (for bulk, non-urgent emails) |
| `cloudinaryService` | Image uploads (acceptances, results) |
| `paystackService` | Payment processing |
| `encryptionService` | Student PIN encryption/decryption |

## Key Architecture Docs

- `docs/MEDEEPAY_PATTERN_MIGRATION.md` - Architecture patterns
- `docs/PRD.md` - Feature requirements by phase
- `docs/DOCUMENT_TEMPLATE_SYSTEM.md` - Template placeholders

## Development Commands

```bash
# Backend (from /backend)
npm run dev          # Start with nodemon on :3000
npm run migrate      # Run database migrations
npm test             # Jest tests with coverage

# Frontend (from /frontend)
npm run dev          # Vite dev server on :5173
npm run build        # Production build

# Test subdomain locally
http://localhost:5173/?subdomain=fuk
```

## Email System

```javascript
const { emailService, emailQueueService } = require('./services');

// Direct send (for password resets, critical notifications)
await emailService.sendEmail(institutionId, {
  to: 'user@example.com',
  template: 'passwordReset',
  data: { name: 'John', resetUrl: 'https://...' }
});

// Queue send (for bulk, non-urgent emails)
await emailQueueService.enqueue(institutionId, {
  to: 'user@example.com',
  template: 'welcomeEmail',
  data: { name: 'Jane' }
}, { priority: 'normal' }); // 'high' | 'normal' | 'low'
```

Institution SMTP settings are stored encrypted in `institutions` table. System emails use `.env` SMTP credentials.

## File Uploads

```javascript
// Multer for upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype)),
  limits: { fileSize: 1 * 1024 * 1024 } // 1MB
});

// Controller - upload to Cloudinary
const { cloudinaryService } = require('../services');
const result = await cloudinaryService.uploadImage(req.file, {
  institutionCode: 'FUKASHERE',
  sessionName: '2024-2025',
  type: 'acceptances', // Folder: digitaltp/FUKASHERE/2024-2025/acceptances/
  studentId: student.registration_number
});
```

## Common Gotchas

1. **super_admin has NO institution** - must select an institution via switcher or use global routes
2. **Students authenticate differently** - registration_number + PIN (not email/password)
3. **Institution context ≠ Authentication** - user can be authenticated but have no institution selected
4. **Feature toggles are per-institution** - check with `isFeatureEnabled('feature_key')`
5. **Use direct SQL with institution_id filter** - the legacy Repository pattern has been fully removed
