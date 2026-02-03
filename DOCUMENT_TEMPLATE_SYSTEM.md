# Document Template Management System

## Architecture Overview

This document describes the design and implementation of a robust, institution-scoped document template management system for Teaching Practice documents.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT TEMPLATE SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   Template      │    │    Rendering    │    │    Preview &    │        │
│  │   Management    │───▶│    Engine       │───▶│    Export       │        │
│  │   (CRUD)        │    │    (Server)     │    │    (PDF/HTML)   │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│          │                      │                      │                   │
│          ▼                      ▼                      ▼                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   Versioning    │    │   Placeholder   │    │   Security      │        │
│  │   & Rollback    │    │   Resolver      │    │   (Sanitize)    │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

1. **Template Management** - WYSIWYG editor for creating/editing templates
2. **Versioning System** - Track changes, drafts, published versions
3. **Placeholder System** - Define and validate dynamic content placeholders
4. **Rendering Engine** - Server-side placeholder resolution
5. **Preview System** - Real-time, sample data, and A4 print preview
6. **Security Layer** - HTML sanitization, XSS prevention

---

## 2. Data Models

### 2.1 Document Template Types

```sql
-- Supported document types
ENUM document_type:
  - 'introduction_letter'
  - 'acceptance_form'  
  - 'posting_letter'
  - 'supervisor_invitation_letter'     -- Future
  - 'completion_certificate' -- Future
```

### 2.2 Core Tables

#### `document_templates`
Primary template storage with versioning and publishing workflow.

```sql
CREATE TABLE document_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  institution_id INT NOT NULL,
  
  -- Template identification
  document_type ENUM('introduction_letter', 'acceptance_form', 'posting_letter', 
                     'supervisor_invitation_letter', 'completion_certificate'),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Template content
  content LONGTEXT NOT NULL,           -- HTML content with placeholders
  css_styles LONGTEXT,                 -- Custom CSS for this template
  page_size ENUM('A4', 'LETTER', 'LEGAL') DEFAULT 'A4',
  page_orientation ENUM('portrait', 'landscape') DEFAULT 'portrait',
  page_margins JSON,                   -- {"top": 40, "bottom": 40, "left": 40, "right": 40}
  
  -- Publishing workflow
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  version INT DEFAULT 1,
  published_at TIMESTAMP NULL,
  published_by INT,
  
  -- Conditional rules
  applicable_institution_types JSON,   -- ["college_of_education", "university"]
  applicable_programs JSON,            -- Specific program IDs or null for all
  session_specific BOOLEAN DEFAULT FALSE,
  session_id INT,                      -- If session-specific
  
  -- Metadata
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  UNIQUE KEY unique_active_template (institution_id, document_type, status, session_id)
);
```

#### `document_template_versions`
Full version history for rollback support.

```sql
CREATE TABLE document_template_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  template_id INT NOT NULL,
  version INT NOT NULL,
  
  -- Snapshot of template at this version
  content LONGTEXT NOT NULL,
  css_styles LONGTEXT,
  page_size ENUM('A4', 'LETTER', 'LEGAL'),
  page_orientation ENUM('portrait', 'landscape'),
  page_margins JSON,
  
  -- Change metadata
  change_summary TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
  UNIQUE KEY unique_version (template_id, version)
);
```

#### `document_placeholders`
Registry of available placeholders per document type.

```sql
CREATE TABLE document_placeholders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- Placeholder definition
  placeholder_key VARCHAR(100) NOT NULL,     -- e.g., 'student_name'
  display_name VARCHAR(255) NOT NULL,        -- e.g., 'Student Full Name'
  description TEXT,
  category VARCHAR(50),                      -- 'student', 'institution', 'session', 'school'
  
  -- Data source
  data_source VARCHAR(100),                  -- Table/model to fetch from
  data_field VARCHAR(100),                   -- Field name or computed
  
  -- Formatting
  format_type ENUM('text', 'date', 'currency', 'phone', 'uppercase', 'titlecase'),
  format_options JSON,                       -- {"date_format": "MMMM D, YYYY"}
  
  -- Validation
  is_required BOOLEAN DEFAULT TRUE,
  default_value VARCHAR(500),
  sample_value VARCHAR(500),                 -- For preview mode
  
  -- Document type associations
  applicable_document_types JSON,            -- ["introduction_letter", "posting_letter"]
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_placeholder (placeholder_key)
);
```

#### `document_conditional_blocks`
Store conditional content logic.

```sql
CREATE TABLE document_conditional_blocks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  template_id INT NOT NULL,
  
  -- Block identification
  block_id VARCHAR(100) NOT NULL,            -- Unique ID within template
  block_name VARCHAR(255),
  
  -- Condition
  condition_type ENUM('institution_type', 'program', 'award_type', 'custom'),
  condition_field VARCHAR(100),              -- e.g., 'institution.type'
  condition_operator ENUM('equals', 'not_equals', 'contains', 'in', 'not_in'),
  condition_value JSON,                      -- Value(s) to compare against
  
  -- Content variants
  content_if_true LONGTEXT,
  content_if_false LONGTEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE CASCADE
);
```

---

## 3. Placeholder System

### 3.1 Placeholder Syntax

```
{placeholder_name}              -- Simple placeholder
{placeholder_name:format}       -- With format modifier
{placeholder_name|default}      -- With fallback value
{placeholder_name:uppercase}    -- With transformation
```

### 3.2 Available Placeholders

#### Student Placeholders
| Key | Description | Sample Value |
|-----|-------------|--------------|
| `{student_name}` | Full name | Musa Adam |
| `{student_fullname}` | Full name (alias) | Musa Adam |
| `{student_firstname}` | First name only | Musa |
| `{student_lastname}` | Last name only | Adam |
| `{student_title}` | Mr/Mrs/Miss | Mr. |
| `{student_regno}` | Registration number | NCE/2024/ENG/001 |
| `{matric_number}` | Matric number (alias) | NCE/2024/ENG/001 |
| `{student_program}` | Program name | English Education |
| `{student_department}` | Department name | Arts Education |
| `{student_faculty}` | Faculty name | Faculty of Education |
| `{student_level}` | Current level | 300 Level |

#### Institution Placeholders
| Key | Description | Sample Value |
|-----|-------------|--------------|
| `{institution_name}` | Institution name | Federal College of Education (T) Gombe |
| `{institution_short_name}` | Short code | FCE(T) Gombe |
| `{institution_type}` | Type | College of Education |
| `{institution_address}` | Full address | PMB 060, Gombe, Gombe State |
| `{institution_email}` | Email | info@fcetgombe.edu.ng |
| `{institution_phone}` | Phone | 08012345678 |
| `{institution_logo}` | Logo URL | /uploads/logo.png |
| `{award_type}` | Award granted | National Certificate in Education |

#### Session Placeholders
| Key | Description | Sample Value | Available In |
|-----|-------------|--------------|--------------|
| `{current_session}` | Academic session | 2024/2025 | All |
| `{session_name}` | Session name (alias) | 2024/2025 | All |
| `{tp_start_date}` | TP start date (from student institution session) | January 15, 2025 | All |
| `{tp_end_date}` | TP end date (from student institution session) | April 15, 2025 | All |
| `{tp_duration}` | Duration text (from student institution session) | 12 weeks | All |
| `{tp_duration_weeks}` | Duration number (from student institution session) | 12 | All |

#### Coordinator Placeholders
| Key | Description | Sample Value |
|-----|-------------|--------------|
| `{coordinator_name}` | Coordinator name | Dr. Adamu Ibrahim |
| `{coordinator_phone}` | Coordinator phone | 08029118221 |
| `{coordinator_email}` | Coordinator email | tp@fcetgombe.edu.ng |
| `{coordinator_signature}` | Signature image | <img src="..." /> |

#### School Placeholders
| Key | Description | Sample Value |
|-----|-------------|--------------|
| `{school_name}` | School name | Government Day Secondary School |
| `{school_address}` | School address | Tudun Wada, Gombe |
| `{school_type}` | School type | Secondary |
| `{principal_name}` | Principal name | Alhaji Musa Mohammed |
| `{principal_phone}` | Principal phone | 07012345678 |

#### Date Placeholders
| Key | Description | Sample Value |
|-----|-------------|--------------|
| `{today}` | Today's date | December 30, 2025 |
| `{today_date}` | Today's date (alias) | December 30, 2025 |
| `{posting_date}` | Posting letter date | December 15, 2025 |
| `{current_year}` | Current year | 2025 |

---

## 4. Conditional Content Blocks

### 4.1 Syntax

```html
<!-- Condition based on institution type -->
{{#if institution_type == 'university'}}
  <p>...set by the National Universities Commission (NUC) for the award of a Bachelor's Degree in Education.</p>
{{else}}
  <p>...for the award of a National Certificate in Education.</p>
{{/if}}

<!-- Condition based on award type -->
{{#if award_type == 'NCE'}}
  <p>National Certificate in Education</p>
{{else if award_type == 'B.Ed'}}
  <p>Bachelor of Education</p>
{{/if}}

<!-- Condition for discipline display style -->
{{#if discipline_display == 'checkbox'}}
  <table><!-- Checkbox table layout --></table>
{{else}}
  <p><strong>Discipline:</strong> {student_program}</p>
{{/if}}
```

### 4.2 Condition Types

1. **Institution Type** - `college_of_education`, `university`, `polytechnic`
2. **Award Type** - `NCE`, `B.Ed`, `B.Sc.Ed`, `HND`
3. **Session Rules** - Assessment intervals, supervision counts
4. **Custom Flags** - Institution-specific toggles

---

## 5. Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUMENT RENDERING FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LOAD TEMPLATE                                               │
│     └──▶ Get published template for document type               │
│          └──▶ Check session-specific override                   │
│                                                                 │
│  2. GATHER CONTEXT DATA                                         │
│     └──▶ Student data from students table                       │
│     └──▶ Institution data from institutions table               │
│     └──▶ Session data from academic_sessions table              │
│     └──▶ School data (if posting/acceptance)                    │
│     └──▶ Coordinator data from session                          │
│                                                                 │
│  3. PROCESS CONDITIONALS                                        │
│     └──▶ Evaluate all {{#if}} blocks                            │
│     └──▶ Replace with appropriate content                       │
│                                                                 │
│  4. RESOLVE PLACEHOLDERS                                        │
│     └──▶ Find all {placeholder} patterns                        │
│     └──▶ Apply formatters (uppercase, date, etc.)               │
│     └──▶ Apply fallbacks for missing values                     │
│     └──▶ Validate required placeholders                         │
│                                                                 │
│  5. SANITIZE OUTPUT                                             │
│     └──▶ DOMPurify for XSS prevention                           │
│     └──▶ Validate allowed HTML tags                             │
│                                                                 │
│  6. OUTPUT                                                      │
│     └──▶ HTML for preview                                       │
│     └──▶ PDF for download                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. UI Flow

### 6.1 Template Management Page

```
┌─────────────────────────────────────────────────────────────────┐
│  Document Templates                                    + Create │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── Tabs ────────────────────────────────────────────────┐   │
│  │ Introduction Letter │ Acceptance Form │ Posting Letter │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Template List ─────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  📄 Default Introduction Letter       v3    Published   │   │
│  │     Last updated: Dec 28, 2025        ├─ Edit           │   │
│  │                                       ├─ Preview        │   │
│  │                                       ├─ Versions       │   │
│  │                                       └─ Archive        │   │
│  │                                                         │   │
│  │  📄 2024/2025 Session Letter         v1    Draft        │   │
│  │     Session-specific override         ├─ Edit           │   │
│  │                                       ├─ Publish        │   │
│  │                                       └─ Delete         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Template Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Template: Introduction Letter                    💾 Save  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Template Name: [Introduction Letter - Default           ]      │
│  Description:   [Standard introduction letter for TP     ]      │
│                                                                 │
│  ┌─── Toolbar ──────────────────────────────────────────────┐  │
│  │ B I U │ H1 H2 │ • 1. │ Table │ Image │ {⋯} Placeholder  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Editor ────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  [WYSIWYG Content with placeholders highlighted]          │  │
│  │                                                           │  │
│  │  The bearer of this letter, {student_title}               │  │
│  │  {student_fullname} with Registration Number              │  │
│  │  {student_regno} is a student...                          │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Sidebar ───────────────────────────────────────────────┐  │
│  │ Available Placeholders                                    │  │
│  │ ├─ Student                                                │  │
│  │ │  └─ {student_name}                                      │  │
│  │ │  └─ {student_regno}                                     │  │
│  │ │  └─ {student_program}                                   │  │
│  │ ├─ Institution                                            │  │
│  │ │  └─ {institution_name}                                  │  │
│  │ │  └─ {coordinator_name}                                  │  │
│  │ ├─ Session                                                │  │
│  │ │  └─ {current_session}                                   │  │
│  │ │  └─ {tp_start_date}                                     │  │
│  │ └─ Dates                                                  │  │
│  │    └─ {today}                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Actions ───────────────────────────────────────────────┐  │
│  │ [Preview] [Preview with Sample] [A4 Print Preview]        │  │
│  │ [Save as Draft] [Publish] [Save & Publish]                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Preview Modes

1. **Raw Preview** - Shows template with placeholder tags visible
2. **Sample Preview** - Renders with sample data from placeholder definitions
3. **Live Preview** - Select a real student to see actual rendering
4. **A4 Print Preview** - Shows exactly as it will print with margins

---

## 7. Security Strategy

### 7.1 HTML Sanitization

```javascript
const DOMPurify = require('isomorphic-dompurify');

const ALLOWED_TAGS = [
  'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'ul', 'ol', 'li',
  'img',
  'a'
];

const ALLOWED_ATTRS = {
  '*': ['class', 'style'],
  'img': ['src', 'alt', 'height', 'width'],
  'a': ['href', 'target'],
  'td': ['colspan', 'rowspan'],
  'th': ['colspan', 'rowspan']
};

const sanitizeHTML = (dirty) => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: Object.values(ALLOWED_ATTRS).flat(),
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
};
```

### 7.2 Placeholder Injection Prevention

- Only allow registered placeholders
- Escape output by default
- Validate placeholder values match expected types

### 7.3 Access Control

- Template management: `admin`, `head_of_teaching_practice`
- Template preview: All authenticated staff
- Document generation: Based on document type and role

---

## 8. WYSIWYG Editor Recommendation

### Primary: TinyMCE

**Why TinyMCE:**
- Rich table support (critical for acceptance forms with discipline checkboxes)
- Custom plugin API for placeholder insertion
- Print preview mode
- Strong HTML output control
- Self-hosted option (no cloud dependency)

**Alternative: Quill.js**
- Lighter weight
- Good for simpler templates
- Requires more customization for tables

### Editor Configuration

```javascript
// TinyMCE configuration for document templates
const editorConfig = {
  plugins: [
    'table', 'lists', 'image', 'pagebreak', 'print',
    'preview', 'code', 'fullscreen', 'wordcount'
  ],
  toolbar: [
    'undo redo | formatselect | bold italic underline',
    'alignleft aligncenter alignright alignjustify',
    'bullist numlist | table | image | placeholder',
    'preview print | code fullscreen'
  ],
  content_style: `
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Times New Roman', serif; font-size: 14px; }
  `,
  table_default_styles: {
    'border-collapse': 'collapse',
    'width': '100%'
  },
  // Custom placeholder button
  setup: (editor) => {
    editor.ui.registry.addButton('placeholder', {
      text: '{x}',
      tooltip: 'Insert Placeholder',
      onAction: () => openPlaceholderModal(editor)
    });
  }
};
```

---

## 9. API Endpoints

### Template Management

```
GET    /api/document-templates
GET    /api/document-templates/:id
POST   /api/document-templates
PUT    /api/document-templates/:id
DELETE /api/document-templates/:id

POST   /api/document-templates/:id/publish
POST   /api/document-templates/:id/archive
POST   /api/document-templates/:id/duplicate

GET    /api/document-templates/:id/versions
POST   /api/document-templates/:id/rollback/:version
```

### Placeholders

```
GET    /api/document-placeholders
GET    /api/document-placeholders/by-type/:documentType
```

### Preview & Render

```
POST   /api/document-templates/:id/preview
POST   /api/document-templates/:id/preview-sample
POST   /api/document-templates/:id/render/:studentId
GET    /api/documents/generate/:documentType/:studentId
```

---

## 10. File Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── documentTemplateController.js
│   ├── models/
│   │   ├── DocumentTemplate.js
│   │   ├── DocumentTemplateVersion.js
│   │   └── DocumentPlaceholder.js
│   ├── services/
│   │   ├── documentTemplateService.js      # Template CRUD
│   │   ├── documentRenderService.js        # Rendering engine
│   │   └── documentSanitizationService.js  # Security
│   └── routes/
│       └── documentTemplates.js

frontend/
├── src/
│   ├── pages/
│   │   └── admin/
│   │       └── DocumentTemplatesPage.jsx
│   ├── components/
│   │   └── documents/
│   │       ├── TemplateEditor.jsx          # WYSIWYG wrapper
│   │       ├── PlaceholderPicker.jsx       # Placeholder sidebar
│   │       ├── TemplatePreview.jsx         # Preview component
│   │       ├── VersionHistory.jsx          # Version management
│   │       └── PrintPreview.jsx            # A4 preview
│   └── api/
│       └── documentTemplates.js
```

---

## 11. Migration Path

### Phase 1: Foundation
1. Create database tables
2. Seed default placeholders
3. Implement basic CRUD API

### Phase 2: Editor
1. Integrate TinyMCE
2. Build placeholder picker
3. Implement preview modes

### Phase 3: Rendering
1. Build placeholder resolver
2. Implement conditional blocks
3. Add PDF generation

### Phase 4: Migration
1. Convert existing hardcoded templates to database
2. Create default templates per institution type
3. Allow institutions to customize

---

## 12. Extension Points

### Adding New Document Types
1. Add to `document_type` enum
2. Register applicable placeholders
3. Create default template

### Adding New Placeholders
1. Insert into `document_placeholders` table
2. Update `DocumentRenderService.gatherContext()`
3. Add to placeholder picker categories

### Adding New Condition Types
1. Add to `condition_type` enum
2. Implement evaluation logic in renderer
3. Update conditional block UI

---

## 13. Sample Default Templates

See [Document_Contents_Samples.md](./Document_Contents_Samples.md) for existing template variations that will be converted to the new system.

---

*Last Updated: December 30, 2025*
