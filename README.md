# DigitalTP — Teaching Practice Management System

A multi-tenant SaaS platform that digitalises the full teaching practice lifecycle for colleges of education and universities. DigitalTP handles everything from student enrollment and school placements to supervisor postings, allowance calculations, payment processing, and official letter generation — all from a single, institution-branded web application.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Architecture](#architecture)
  - [Multi-Tenancy](#multi-tenancy)
  - [Authentication & Authorization](#authentication--authorization)
  - [API Design](#api-design)
- [User Roles](#user-roles)
- [Core Modules](#core-modules)
- [Third-Party Integrations](#third-party-integrations)
- [Deployment](#deployment)
- [Database](#database)
- [Security](#security)
- [Scripts Reference](#scripts-reference)

---

## Overview

DigitalTP replaces manual, paper-based teaching practice workflows with an integrated platform that serves multiple institutions simultaneously. Each institution operates on its own subdomain (e.g., `institution.sitpms.com`) with full data isolation while sharing the same application infrastructure.

**Who uses it:**

| User | Role |
|------|------|
| Platform operators | Super admin — manage all institutions and global settings |
| TP coordinators | Head of Teaching Practice — oversee postings, students, and staff |
| Academic staff | Supervisors — receive postings, score students, log visits |
| Field officers | Field/Lead Monitors — conduct on-site assessments |
| Students | Self-service portal — pay fees, submit acceptance forms, download posting letters |

---

## Key Features

- **Multi-tenant architecture** — each institution gets an isolated workspace on its own subdomain with custom branding
- **Student management** — bulk import via Excel with automatic program detection from registration numbers
- **Posting engine** — automated and manual assignment of students to supervisors and practice schools
- **Allowance calculation** — dynamic computation based on supervisor rank, distance, and visit count
- **Payment processing** — Paystack integration for per-student fee collection with receipt generation
- **Student portal** — PIN-based login for students to pay fees, submit acceptance forms, and download posting letters
- **Acceptance forms** — digital student-school acceptance with photo/document upload to cloud storage
- **PDF posting letters** — institution-branded letters with embedded QR codes for verification
- **Supervisor location tracking** — geofencing-based check-in for on-site school visits
- **Monitoring & assessment** — structured evaluations by field monitors
- **Results & scoring** — performance scores recorded by supervisors per student
- **Document templates** — customisable letter and document templates per institution
- **Single Sign-On (SSO)** — seamless cross-subdomain navigation without re-authentication
- **Feature toggles** — per-institution feature flags for phased rollouts
- **Email notifications** — tenant-aware email dispatch with per-institution SMTP configuration

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| React 18 + React Router 6 | UI framework and client-side routing |
| Vite 5 | Build tool and dev server |
| TailwindCSS 3 | Utility-first styling |
| Radix UI | Accessible, unstyled component primitives |
| Tabler Icons | Icon library |
| TipTap | Rich text editor (document templates) |
| Axios | HTTP client with auth interceptors |
| React Hook Form + Zod | Form handling and validation |
| jsPDF + jsPDF-AutoTable | Client-side PDF generation |
| XLSX | Excel file parsing and export |
| Framer Motion | Animations |
| Paystack Inline JS | Payment modal |
| date-fns | Date formatting |
| DOMPurify | XSS sanitization |

### Backend

| Technology | Purpose |
|-----------|---------|
| Node.js 18+ / Express 4 | API server |
| MySQL 8 (mysql2/promise) | Primary database |
| JSON Web Tokens | Authentication |
| bcrypt (12 rounds) | Password hashing |
| Zod | Request validation |
| Multer | File upload handling |
| PDFKit | Server-side PDF generation |
| QRCode | QR code generation for letters |
| Nodemailer | Email delivery |
| Cloudinary | Cloud file storage |
| ExcelJS / XLSX | Excel import/export |
| DOMPurify + jsdom | Server-side HTML sanitization |
| Jest + Supertest | Testing |
| Nodemon | Development hot reload |
| PM2 | Production process management |

---

## Project Structure

```
digitaltp/
├── backend/
│   ├── src/
│   │   ├── server.js                   # Express app entry point
│   │   ├── config/
│   │   │   └── index.js                # Centralised config (DB, JWT, SMTP, etc.)
│   │   ├── db/
│   │   │   ├── connection.js           # MySQL connection pool
│   │   │   └── database.js             # Query helpers (query, transaction, findById)
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT verification
│   │   │   ├── rbac.js                 # Role-based access control
│   │   │   ├── featureToggle.js        # Feature flag enforcement
│   │   │   ├── subdomainResolver.js    # Multi-tenant institution resolution
│   │   │   ├── rateLimiter.js          # Request rate limiting
│   │   │   ├── security.js             # Security headers (HSTS, CSP, etc.)
│   │   │   ├── validate.js             # Zod schema validation
│   │   │   └── errorHandler.js         # Global error handling
│   │   ├── controllers/                # 30+ request handlers
│   │   │   ├── authController.js
│   │   │   ├── studentController.js
│   │   │   ├── postingController.js
│   │   │   ├── paymentController.js
│   │   │   ├── acceptanceController.js
│   │   │   ├── allowanceController.js
│   │   │   ├── letterController.js
│   │   │   ├── portalController.js
│   │   │   ├── schoolController.js
│   │   │   ├── dashboardController.js
│   │   │   ├── locationTrackingController.js
│   │   │   ├── monitoringController.js
│   │   │   ├── resultController.js
│   │   │   └── ...
│   │   ├── routes/
│   │   │   ├── index.js                # Route aggregator
│   │   │   ├── auth.js                 # /api/auth/*
│   │   │   ├── public.js               # /api/public/*
│   │   │   ├── global.js               # /api/global/* (super admin)
│   │   │   ├── portal.js               # /api/portal/* (student portal)
│   │   │   ├── students.js             # /api/:institutionId/students
│   │   │   ├── postings.js             # /api/:institutionId/postings
│   │   │   ├── payments.js             # /api/:institutionId/payments
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── emailService.js         # Tenant-aware email dispatch
│   │   │   ├── emailQueueService.js    # Async email queue
│   │   │   ├── encryptionService.js    # AES-256-GCM encryption
│   │   │   ├── paystackService.js      # Payment gateway
│   │   │   ├── cloudinaryService.js    # Cloud file storage
│   │   │   ├── documentService.js      # PDF generation logic
│   │   │   └── institutionProvisioningService.js
│   │   ├── models/
│   │   │   ├── Institution.js
│   │   │   └── User.js
│   │   └── utils/
│   │       └── errors.js               # Custom error classes
│   ├── scripts/                        # DB migrations and seed scripts
│   ├── tests/
│   ├── .env.example
│   ├── jest.config.js
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                    # React entry point
│   │   ├── App.jsx                     # Root router and layout
│   │   ├── api/                        # API client modules (one per resource)
│   │   │   ├── client.js               # Axios instance with interceptors
│   │   │   └── students.js, postings.js, payments.js, ...
│   │   ├── context/
│   │   │   ├── AuthContext.jsx         # Auth state (tab-scoped via sessionStorage)
│   │   │   ├── InstitutionContext.jsx  # Current institution data
│   │   │   └── ToastContext.jsx        # Notification toasts
│   │   ├── pages/
│   │   │   ├── admin/                  # Admin dashboard pages (20+)
│   │   │   ├── student/                # Student portal pages
│   │   │   ├── supervisor/             # Supervisor pages
│   │   │   ├── auth/                   # Login, forgot/reset password
│   │   │   └── public/                 # Landing page
│   │   ├── components/
│   │   │   ├── ui/                     # Reusable UI primitives
│   │   │   ├── auth/                   # ProtectedRoute, role guards
│   │   │   ├── forms/                  # Shared form components
│   │   │   └── postings/, documents/   # Feature-specific components
│   │   ├── layouts/
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── StudentLayout.jsx
│   │   │   └── PublicLayout.jsx
│   │   ├── hooks/                      # Custom hooks
│   │   ├── utils/                      # Helpers (roles, tabStorage, colorGenerator)
│   │   └── data/nigeria/               # Static data (states, LGAs)
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── docs/                               # Architecture and feature documentation
├── nginx/                              # Nginx config for production
├── ecosystem.config.js                 # PM2 process config
├── deploy.sh                           # Deployment automation script
├── setup.sh                            # First-time server setup script
└── DEPLOYMENT.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **MySQL** 8.0 or later
- **npm** 9 or later
- A **Cloudinary** account (for acceptance form uploads)
- A **Paystack** account (for payment processing)
- An SMTP provider (for email notifications)

### Installation

Clone the repository and install dependencies for both workspaces:

```bash
git clone <repository-url>
cd digitaltp

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Environment Variables

Copy the backend example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `development` or `production` | Yes |
| `PORT` | Backend server port (default `5000`) | Yes |
| `FRONTEND_URL` | Frontend origin for CORS and email links | Yes |
| `PRODUCTION_DOMAIN` | Base domain for subdomain URLs | Production |
| `DB_HOST` | MySQL host | Yes |
| `DB_PORT` | MySQL port (default `3306`) | Yes |
| `DB_USER` | MySQL username | Yes |
| `DB_PASSWORD` | MySQL password | Yes |
| `DB_NAME` | MySQL database name | Yes |
| `JWT_SECRET` | Secret key for signing JWTs | Yes |
| `JWT_EXPIRES_IN` | Token expiry (e.g. `7d`) | Yes |
| `ENCRYPTION_KEY` | Base64-encoded 32-byte key for AES-256-GCM | Production |
| `CORS_ORIGIN` | Allowed CORS origin(s) | Yes |
| `SMTP_HOST` | SMTP server hostname | Yes |
| `SMTP_PORT` | SMTP port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `SMTP_FROM_EMAIL` | Sender email address | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |

Generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Running Locally

**Backend** (runs on `http://localhost:5000`):

```bash
cd backend
npm run dev
```

**Frontend** (runs on `http://localhost:5173`):

```bash
cd frontend
npm run dev
```

The Vite dev server is pre-configured to proxy all `/api` requests to the backend. The frontend resolves the current institution via the `X-Subdomain` request header, which can be set via a query parameter in development: `http://localhost:5173?subdomain=demo`.

**Run tests:**

```bash
cd backend
npm test
```

---

## Architecture

### Multi-Tenancy

DigitalTP uses a **shared-schema, subdomain-per-tenant** model:

- All institutions share the same MySQL database and tables
- Every tenant-scoped table has an `institution_id` column
- Every query includes `WHERE institution_id = ?` to guarantee isolation
- Each institution is accessed via a unique subdomain: `{slug}.sitpms.com`
- The backend `subdomainResolver` middleware resolves the subdomain to an `institution_id` on every request
- Institutions can configure their own branding (colours, logo) and SMTP credentials

### Authentication & Authorization

**Staff login** (`POST /api/auth/login`)
- Email and password
- Returns a JWT containing `userId`, `role`, `institutionId`, and `sessionId`
- Session is recorded in `user_sessions` for revocation support
- Multiple simultaneous sessions allowed (tab/device isolation)

**Student login** (`POST /api/auth/student-login`)
- Registration number and 10-digit PIN
- PINs are auto-generated at import and stored encrypted (AES-256-GCM)
- Returns a short-lived JWT for the student portal

**Single Sign-On** (`POST /api/auth/sso/generate` → `/api/auth/sso/exchange`)
- Generates a 30-second, single-use SSO token
- Enables seamless cross-subdomain navigation without re-login

**RBAC** is enforced by middleware on every route:
- `authenticate` — verifies JWT
- `requireInstitutionAccess()` — checks the user belongs to the institution in the URL
- `authorize(...roles)` — checks the user's role against an allowlist
- `staffOnly()` / `studentOnly()` — role category guards
- `requireFeature(name)` — enforces per-institution feature flag

### API Design

The API follows the **MedeePay Pattern** — institution ID is an explicit URL segment rather than derived from the token alone:

```
GET  /api/:institutionId/students
POST /api/:institutionId/students
GET  /api/:institutionId/postings
POST /api/:institutionId/postings
...
```

This makes authorization decisions visible, auditable, and easy to test. All parameterised queries use `?` placeholders — no string interpolation.

**Route namespaces:**

| Prefix | Auth | Purpose |
|--------|------|---------|
| `/api/public/*` | None | Institution lookup, public status |
| `/api/auth/*` | Mixed | Login, logout, password recovery |
| `/api/global/*` | Super admin only | Platform management |
| `/api/:institutionId/*` | Staff JWT | All institution-scoped operations |
| `/api/portal/*` | Student JWT | Student self-service portal |

---

## User Roles

| Role | Access Scope |
|------|-------------|
| `super_admin` | Full platform access; manage institutions, global features, and all users |
| `head_of_teaching_practice` | Full institution access; manage students, staff, postings, and reports |
| `supervisor` | View own postings; score students; log visits and location check-ins |
| `field_monitor` | Submit monitoring assessments for assigned schools |
| `lead_monitor` | Oversee field monitor assignments and monitoring reports |
| `student` | Student portal only — payments, acceptance forms, posting letters |

---

## Core Modules

### Student Management
Bulk import students from Excel (.xlsx / .xls) with automatic program detection from registration number patterns. Supports single-student creation, edit, delete, PIN reset, and export. Students are scoped to an academic session.

### Posting Engine
Assigns students to supervisors and practice schools. Supports both automated bulk posting and manual per-student assignment. Tracks posting status, generates posting statistics, and produces PDF posting letters with QR verification codes.

### Allowance Calculation
Dynamically computes supervisor allowances based on configured rank rates, travel distance, number of students supervised, and visit frequency. Produces allowance summaries and individual breakdowns.

### Payment Processing
Integrates with Paystack to collect per-student fees. Generates payment references, handles webhook verification, and issues receipts. The student portal displays payment status and allows retries.

### Acceptance Forms
Students submit digital acceptance forms signed by their host school. Photo and document uploads are stored in Cloudinary. Admins review and approve/reject submissions.

### Supervisor Location Tracking
Supervisors check in at practice schools via geofence-aware location logging. Admins can view visit history, confirm on-site presence, and generate attendance reports.

### Monitoring & Results
Field monitors submit structured assessments per student/school visit. Supervisors upload student performance scores. Both feed into the institutional dashboard analytics.

### Document Templates
Institutions can create and edit reusable document templates (letters, memos) using a rich text editor. Templates support dynamic variables (student name, school, supervisor, etc.).

---

## Third-Party Integrations

| Service | SDK / Library | Purpose |
|---------|--------------|---------|
| **Paystack** | `@paystack/inline-js` | Student fee payment processing |
| **Cloudinary** | `cloudinary` v2 | Acceptance form document/image storage |
| **Nodemailer** | `nodemailer` | Transactional email (with per-institution SMTP) |
| **Cloudflare** | DNS / CDN | Wildcard subdomain routing, DDoS protection, SSL |

---

## Deployment

DigitalTP is deployed on Ubuntu 22.04 with Nginx as a reverse proxy and PM2 as the Node.js process manager.

### First-Time Server Setup

```bash
chmod +x setup.sh
./setup.sh
```

This script installs Node.js, MySQL, Nginx, PM2, and configures the server environment.

### Deploying Updates

```bash
# Full deployment (backend + frontend)
./deploy.sh full

# Backend only
./deploy.sh backend

# Frontend only
./deploy.sh frontend
```

### PM2 Process Management

```bash
# Start all processes
pm2 start ecosystem.config.js --env production

# View status
pm2 status

# View logs
pm2 logs digitaltp-backend

# Restart
pm2 restart digitaltp-backend
```

### Nginx Configuration

Nginx handles:
- Wildcard subdomain routing (`*.sitpms.com`) to the backend API
- Serving the built React SPA for all non-API routes
- SSL termination via Cloudflare origin certificates
- Gzip compression and static asset caching

Configuration files are in the `nginx/` directory.

### DNS

Cloudflare is configured with:
- `A` record: `sitpms.com` → server IP
- Wildcard `A` record: `*.sitpms.com` → server IP
- Universal SSL with Full (Strict) mode

---

## Database

**Engine:** MySQL 8.0+  
**Driver:** `mysql2/promise`  
**Connection:** Pooled via `backend/src/db/connection.js`

### Key Tables

| Table | Description |
|-------|-------------|
| `institutions` | Tenant records with branding, SMTP, payment config |
| `users` | Staff accounts (all roles except students) |
| `user_sessions` | Active JWT sessions for revocation |
| `students` | Student records per institution and academic session |
| `academic_sessions` | Teaching practice sessions (semesters/years) |
| `faculties`, `departments`, `programs` | Academic hierarchy |
| `schools` | Practice school registry |
| `routes` | Supervision routes with geographic data |
| `supervisor_postings` | Student-to-supervisor-to-school assignments |
| `allowances` | Allowance computation records |
| `payments` | Payment records and Paystack references |
| `acceptances` | Student acceptance form submissions |
| `results` | Student performance scores |
| `document_templates` | Institution-specific document templates |
| `feature_toggles` | Per-institution feature flag state |
| `location_logs` | Supervisor geofence check-in records |
| `monitoring_logs` | Field monitor assessment entries |

### Migrations and Seeding

```bash
# Run database migrations
cd backend && npm run migrate

# Seed base data
npm run seed

# Seed sample students
npm run seed:students
```

---

## Security

| Control | Implementation |
|---------|---------------|
| Transport security | HTTPS enforced via Cloudflare + HSTS header |
| Authentication | JWT (HS256), 7-day expiry, session-based revocation |
| Password storage | bcrypt, 12 rounds |
| Sensitive data encryption | AES-256-GCM (PINs, API keys) |
| SQL injection | Parameterised queries throughout (no string interpolation) |
| XSS | DOMPurify sanitisation on both client and server |
| CSRF | Stateless JWT — no cookie-based sessions |
| CORS | Configured allowed origins per environment |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Rate limiting | Per-IP request throttling on all API routes |
| Input validation | Zod schemas on all request bodies and query params |
| Multi-tenant isolation | Every query scoped to `institution_id` |
| Privilege escalation | RBAC middleware enforced at route level |

---

## Scripts Reference

### Backend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm test` | Run Jest test suite with coverage |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed base reference data |
| `npm run seed:students` | Seed sample student and acceptance data |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
