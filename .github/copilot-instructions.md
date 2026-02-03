# DigitalTP - AI Coding Agent Instructions

## Project Overview

DigitalTP is a **multi-tenant SaaS platform** for managing Teaching Practice programs at educational institutions. It uses subdomain-based tenancy (e.g., `fuk.digitaltipi.com`, `gsu.digitaltipi.com`) with strict data isolation.

## Architecture Summary

```
digitaltp/
├── backend/     # Express.js API (Node.js 18+, MySQL)
├── frontend/    # React + Vite + Tailwind CSS
└── *.md         # Architecture docs (read these for deep context)
```

## Critical Multi-Tenancy Rules

**Every database query MUST include `institution_id`** - this is the core isolation mechanism.

### NEW PATTERN (MedeePay Style) - Use for all new code

Institution ID is extracted from URL path, not headers:

```javascript
// ✅ Correct - Direct SQL with institution_id from route params
const { query } = require('../db/database');

// In controller
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;  // From URL: /api/:institutionId/students
    
    const students = await query(
      `SELECT * FROM students WHERE institution_id = ? AND status = ?`,
      [parseInt(institutionId), 'active']
    );
    
    res.json({ success: true, data: students });
  } catch (error) {
    next(error);
  }
};

// ❌ Wrong - query without institution_id filter
const [rows] = await query('SELECT * FROM students WHERE status = ?', ['active']);
```

> **Note:** The legacy Repository pattern has been fully removed. All code now uses direct SQL with the `database.js` utility.

See [MEDEEPAY_PATTERN_MIGRATION.md](../MEDEEPAY_PATTERN_MIGRATION.md) for architectural documentation.

## Backend Patterns

### Route Pattern (MedeePay Style)

Institution ID is now in the URL path for explicit scoping:

| Path | Auth | Use Case |
|------|------|----------|
| `/api/public/*` | No | Public endpoints (institution lookup) |
| `/api/auth/*` | Mixed | Login/logout/password reset |
| `/api/global/*` | super_admin | Cross-institution operations |
| `/api/:institutionId/*` | Yes | All institution-scoped CRUD |

### Middleware Stack

1. `authenticate` - JWT validation, loads `req.user`
2. `requireInstitutionAccess()` - Validates user has access to the institution
3. Role middleware: `staffOnly`, `isHeadOfTP`, `isSupervisor`, etc.

### Role Hierarchy (Used for Authorization)

`student` < `field_monitor` < `supervisor` < `head_of_teaching_practice` < `super_admin`

**Pre-configured role middlewares:**
- `staffOnly` - Excludes students
- `isFieldMonitor` - field_monitor and above
- `isSupervisor` - supervisor and above
- `isHeadOfTP` - head_of_teaching_practice and super_admin
- `isSuperAdmin` - super_admin only

```javascript
// Example route with role-based access
router.post('/:institutionId/students', 
  authenticate, 
  requireInstitutionAccess(), 
  isHeadOfTP,  // Only head_of_teaching_practice or super_admin
  validate(schemas.create), 
  controller.create
);
```

### Controller Pattern (MedeePay Style)

```javascript
const { query, transaction } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Direct SQL with institutionId from route params
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { name, email } = req.body;
    
    if (!name) throw new ValidationError('Name is required');
    
    const result = await query(
      'INSERT INTO students (institution_id, name, email) VALUES (?, ?, ?)',
      [parseInt(institutionId), name, email]
    );
    
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
};
```

## Frontend Patterns

### Context Hierarchy ([App.jsx](frontend/src/App.jsx))

```
AuthProvider → InstitutionSelectionProvider → InstitutionProvider → ToastProvider → Routes
```

- `AuthContext` - JWT/user management ONLY
- `InstitutionSelectionContext` - Active institution selection (separate from auth!)
- Feature toggles loaded per-institution

### API Client ([api/client.js](frontend/src/api/client.js))

Axios automatically adds:
- `Authorization: Bearer <token>`
- `X-Subdomain` header (from URL subdomain)
- `X-Institution-Id` header (for super_admin switching)

### Icons - Tabler Only

**Use `@tabler/icons-react` exclusively** - see [ICON_GUIDELINES.md](frontend/ICON_GUIDELINES.md)

```jsx
import { IconUsers, IconCheck } from '@tabler/icons-react';
```

## Development Commands

```bash
# Backend (from /backend)
npm run dev          # Start with nodemon
npm run migrate      # Run database migrations

# Frontend (from /frontend)
npm run dev          # Vite dev server on :5173
npm run build        # Production build

# Test subdomain locally
http://localhost:5173/?subdomain=fuk
```

## Database

- MySQL with `mysql2` driver
- Migrations in `backend/database/migrations/` (numbered sequentially)
- All tables have `institution_id` foreign key (except `institutions` itself)

## Key Architecture Docs

- [MEDEEPAY_PATTERN_MIGRATION.md](MEDEEPAY_PATTERN_MIGRATION.md) - **NEW: MedeePay pattern migration guide**
- [MULTI_TENANT_ARCHITECTURE_V2.md](MULTI_TENANT_ARCHITECTURE_V2.md) - Tenant context design
- [SUBDOMAIN_MULTITENANT_ARCHITECTURE.md](SUBDOMAIN_MULTITENANT_ARCHITECTURE.md) - Subdomain routing
- [PRD.md](PRD.md) - Feature requirements by phase

## Database Migrations

**Location:** `backend/database/migrations/`

**Naming convention:** `{NNN}_{descriptive_name}.sql` where NNN is zero-padded sequence number.

```sql
-- Example: 019_add_user_preferences.sql

-- Always include comment header
-- Migration: Add User Preferences Table
-- Description of what this migration does

-- Include institution_id for institution isolation
CREATE TABLE IF NOT EXISTS user_preferences (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    -- ... columns
    CONSTRAINT fk_user_prefs_institution 
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);
```

Run migrations: `npm run migrate` (from `/backend`)

## Data Access Pattern (MedeePay Style)

**Use direct SQL with `query()` helper** - explicit institution_id in every query.

```javascript
// ✅ NEW: Direct SQL with explicit institution_id (MedeePay style)
const { query, transaction } = require('../db/database');

// In controller - get institutionId from route params
const { institutionId } = req.params;

// Read operations
const students = await query(
  `SELECT s.*, p.name as program_name 
   FROM students s 
   LEFT JOIN programs p ON s.program_id = p.id
   WHERE s.institution_id = ? AND s.status = ?
   ORDER BY s.created_at DESC LIMIT ?`,
  [parseInt(institutionId), 'active', 50]
);

// Write operations
const result = await query(
  'INSERT INTO students (institution_id, full_name, registration_number) VALUES (?, ?, ?)',
  [parseInt(institutionId), 'John Doe', 'REG001']
);

// Transactions for multi-step operations
await transaction(async (conn) => {
  const [result] = await conn.execute(
    'INSERT INTO postings (institution_id, ...) VALUES (?, ...)',
    [institutionId, ...]
  );
  await conn.execute(
    'UPDATE students SET posting_id = ? WHERE id = ? AND institution_id = ?',
    [result.insertId, studentId, institutionId]
  );
});
```

## Email System

**Two services available:**

1. **`emailService`** - Direct send (blocking)
2. **`emailQueueService`** - Async with retry (preferred for non-critical emails)

```javascript
const { emailService, emailQueueService } = require('./services');

// Direct send (use for password resets, critical notifications)
await emailService.sendEmail(institutionId, {
  to: 'user@example.com',
  template: 'passwordReset',
  data: { name: 'John', resetUrl: 'https://...' }
});

// Queue send (use for bulk, non-urgent emails)
await emailQueueService.enqueue(institutionId, {
  to: 'user@example.com',
  template: 'welcomeEmail',
  data: { name: 'Jane' }
}, { priority: 'normal' }); // 'high' | 'normal' | 'low'
```

- Institution SMTP settings stored encrypted in `institutions` table
- System emails (super_admin) use `.env` SMTP credentials
- Email templates are in `emailService.js` - add new templates there

## File Uploads

**Pattern:** Multer → Cloudinary (for images) or local disk (for Excel imports)

```javascript
// In route file - configure multer
const multer = require('multer');

// For Cloudinary uploads (images)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 1 * 1024 * 1024 } // 1MB
});

// Route with upload
router.post('/upload', upload.single('file'), controller.handleUpload);

// In controller - upload to Cloudinary
const { cloudinaryService } = require('../services');
const result = await cloudinaryService.uploadImage(req.file, {
  institutionCode: 'FUKASHERE',
  sessionName: '2024-2025',
  type: 'acceptances', // Folder: digitaltp/FUKASHERE/2024-2025/acceptances/
  studentId: student.registration_number
});
```

**Folder structure in Cloudinary:** `digitaltp/{institution_code}/{session}/{type}/{filename}`

## Common Gotchas

1. **super_admin has NO institution** - must select an institution via switcher or use global routes
2. **Students authenticate differently** - registration_number + PIN (not email/password)
3. **Institution context ≠ Authentication** - user can be authenticated but have no institution selected
4. **Feature toggles are per-institution** - check with `isFeatureEnabled('feature_key')`
5. **Use direct SQL with institution_id filter** - the legacy Repository pattern has been fully removed
