# DigitalTP Third-Party Integration Guide

> **Simple SSO Integration: One Login, Full DigitalTP Access**

---

## Overview

DigitalTP can be accessed directly from any existing Student Management System (SMS), Student Record Management System (SRMS), or Learning Management System (LMS) through **Single Sign-On (SSO)**. 

Users authenticate once in their existing system and are seamlessly redirected to DigitalTP with full access to all features - no second login required.

---

## How It Works

```
┌─────────────────────────┐         ┌─────────────────────────┐
│                         │         │                         │
│   Partner System        │         │      DigitalTP          │
│   (SMS/SRMS/LMS)        │         │                         │
│                         │         │                         │
│  1. User logs in        │         │                         │
│     normally            │         │                         │
│         ↓               │         │                         │
│  2. Clicks "Teaching    │  ────►  │  3. DigitalTP receives  │
│     Practice" link      │  Token  │     token, validates,   │
│                         │         │     creates session     │
│                         │         │         ↓               │
│                         │         │  4. User has full       │
│                         │         │     access to DigitalTP │
│                         │         │                         │
└─────────────────────────┘         └─────────────────────────┘
```

**Key Benefits:**
- ✅ No separate DigitalTP login required (but normal login still works)
- ✅ Users access DigitalTP from their familiar system
- ✅ Full DigitalTP functionality available
- ✅ 10-minute setup for IT administrators
- ✅ Works with any system (SaaS or in-house)
- ✅ No role/data mismatches - users must exist in DigitalTP first
- ✅ Minimal token data required (just identifier + credentials)

> 💡 **Note:** SSO is optional. Students and staff can always use the normal DigitalTP login page with their credentials (registration number + PIN for students, email + password for staff).

---

## Prerequisites

**Before SSO works, users must exist in DigitalTP:**

| User Type | Must Be Registered In DigitalTP With |
|-----------|--------------------------------------|
| Students | Registration number, program, session |
| Staff | Email, role, rank (if supervisor) |

**Why?** This ensures:
- ✅ Correct roles and permissions
- ✅ Proper program/department assignments
- ✅ Accurate allowance calculations for supervisors
- ✅ No orphan records or data mismatches

> 💡 **Tip:** Use DigitalTP's bulk import feature to upload students and staff from Excel before enabling SSO.

---

## Integration Steps (For IT Administrators)

### Step 1: Register Your Institution

Contact DigitalTP support or use the admin panel to register as an integration partner.

**You will receive:**
| Credential | Description |
|------------|-------------|
| `Partner ID` | Your unique identifier (e.g., `ptn_fukashere_001`) |
| `Secret Key` | Used to sign tokens (keep secure!) |
| `Institution Code` | Your institution's DigitalTP code (e.g., `FUKASHERE`) |

---

### Step 2: Add a Link in Your System

Add a "Teaching Practice" link/button in your existing system that users can click.

**Where to add it:**
- Student portal dashboard
- Staff dashboard
- Academic services menu
- Quick links section

**Example button:**
```
┌─────────────────────────────┐
│  📚 Teaching Practice       │
│  Access DigitalTP Portal    │
└─────────────────────────────┘
```

---

### Step 3: Generate SSO Token (When User Clicks)

When a user clicks the Teaching Practice link, your system generates a secure token and redirects them to DigitalTP.

#### For Students:

```javascript
// Your backend generates this token
const token = generateToken({
  partner_id: 'ptn_fukashere_001',
  secret_key: 'your-secret-key',
  user_type: 'student',
  registration_number: 'UG/2024/EDU/0123',  // Student's reg number
  institution_code: 'FUKASHERE'
});

// Redirect student to DigitalTP
redirect(`https://fukashere.sitpms.com/sso/student?token=${token}`);
```

#### For Staff:

```javascript
// Your backend generates this token
const token = generateToken({
  partner_id: 'ptn_fukashere_001',
  secret_key: 'your-secret-key',
  user_type: 'staff',
  email: 'john.doe@university.edu',  // Staff email (identifier)
  institution_code: 'FUKASHERE'
});

// Redirect staff to DigitalTP
redirect(`https://fukashere.sitpms.com/sso/staff?token=${token}`);
```

> **Note:** Role is NOT included in the token. DigitalTP looks up the staff member and determines their role from the database before granting access.
```

---

### Step 4: Token Generation Code

Copy-paste this code into your system:

#### Option A: JavaScript/Node.js
```javascript
const crypto = require('crypto');

function generateDigitalTPToken(partnerId, secretKey, userType, identifier, institutionCode) {
  // Create minimal payload
  const payload = {
    partner_id: partnerId,
    user_type: userType,
    identifier: identifier,  // registration_number for students, email for staff
    institution_code: institutionCode,
    timestamp: Date.now(),
    expires: Date.now() + (5 * 60 * 1000)  // 5 minutes
  };
  
  // Convert to base64
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Create signature using secret key
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadBase64)
    .digest('base64url');
  
  // Return token
  return `${payloadBase64}.${signature}`;
}

// Usage for student
const studentToken = generateDigitalTPToken(
  'ptn_fukashere_001',           // Partner ID
  'your-secret-key',             // Secret Key
  'student',                     // User type
  'UG/2024/EDU/0123',            // Registration number
  'FUKASHERE'                    // Institution code
);

// Usage for staff
const staffToken = generateDigitalTPToken(
  'ptn_fukashere_001',
  'your-secret-key',
  'staff',
  'john.doe@university.edu',     // Email
  'FUKASHERE'
);

// Redirect URL
const redirectUrl = `https://fukashere.sitpms.com/sso/${userType}?token=${token}`;
```

#### Option B: PHP
```php
<?php
function generateDigitalTPToken($partnerId, $secretKey, $userType, $identifier, $institutionCode) {
    $payload = [
        'partner_id' => $partnerId,
        'user_type' => $userType,
        'identifier' => $identifier,
        'institution_code' => $institutionCode,
        'timestamp' => time() * 1000,
        'expires' => (time() + 300) * 1000
    ];
    
    $payloadBase64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $payloadBase64, $secretKey, true)), '+/', '-_'), '=');
    
    return $payloadBase64 . '.' . $signature;
}

// Usage for student
$token = generateDigitalTPToken(
    'ptn_fukashere_001',
    'your-secret-key',
    'student',
    'UG/2024/EDU/0123',
    'FUKASHERE'
);

// Redirect
header("Location: https://fukashere.sitpms.com/sso/student?token=" . $token);
?>
```

#### Option C: Python
```python
import hmac
import hashlib
import base64
import json
import time

def generate_digitaltp_token(partner_id, secret_key, user_type, identifier, institution_code):
    payload = {
        'partner_id': partner_id,
        'user_type': user_type,
        'identifier': identifier,
        'institution_code': institution_code,
        'timestamp': int(time.time() * 1000),
        'expires': int((time.time() + 300) * 1000)
    }
    
    payload_json = json.dumps(payload)
    payload_base64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    
    signature = hmac.new(
        secret_key.encode(),
        payload_base64.encode(),
        hashlib.sha256
    ).digest()
    signature_base64 = base64.urlsafe_b64encode(signature).decode().rstrip('=')
    
    return f"{payload_base64}.{signature_base64}"

# Usage for student
token = generate_digitaltp_token(
    'ptn_fukashere_001',
    'your-secret-key',
    'student',
    'UG/2024/EDU/0123',
    'FUKASHERE'
)

# Redirect URL
redirect_url = f"https://fukashere.sitpms.com/sso/student?token={token}"
```

#### Option D: C# / .NET
```csharp
using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static string GenerateDigitalTPToken(
    string partnerId, string secretKey, string userType, 
    string identifier, string institutionCode)
{
    var payload = new Dictionary<string, object>
    {
        ["partner_id"] = partnerId,
        ["user_type"] = userType,
        ["identifier"] = identifier,
        ["institution_code"] = institutionCode,
        ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        ["expires"] = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeMilliseconds()
    };
    
    string payloadJson = JsonSerializer.Serialize(payload);
    string payloadBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(payloadJson))
        .Replace("+", "-").Replace("/", "_").TrimEnd('=');
    
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
    byte[] signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadBase64));
    string signature = Convert.ToBase64String(signatureBytes)
        .Replace("+", "-").Replace("/", "_").TrimEnd('=');
    
    return $"{payloadBase64}.{signature}";
}

// Usage for student
var token = GenerateDigitalTPToken(
    "ptn_fukashere_001",
    "your-secret-key",
    "student",
    "UG/2024/EDU/0123",
    "FUKASHERE"
);
```

---

## Token Parameters Reference

**Only 5 parameters needed - keep it simple!**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `partner_id` | ✅ | Your Partner ID (from API Keys tab) |
| `secret_key` | ✅ | Your Secret Key (used for signature, NOT included in payload) |
| `user_type` | ✅ | Either `"student"` or `"staff"` |
| `identifier` | ✅ | **Students:** Registration number<br>**Staff:** Email address |
| `institution_code` | ✅ | Your institution code (e.g., `FUKASHERE`) |

> **Why so minimal?** All other user data (name, role, program, etc.) comes from DigitalTP's database. This:
> - ✅ Prevents data mismatches between systems
> - ✅ Ensures correct roles and permissions
> - ✅ Makes integration simpler for partners
> - ✅ Prevents privilege escalation attacks

---

## What Happens After Redirect

### Validation Flow (All Requests)

```
1. Validate token signature using secret_key
   └─ Invalid? → Error: "Invalid token signature"

2. Check token expiry (5 minute max)
   └─ Expired? → Error: "Token expired"

3. Validate partner_id exists and is active
   └─ Invalid? → Error: "Invalid partner credentials"

4. Validate institution_code matches partner's allowed institutions
   └─ Mismatch? → Error: "Institution not authorized"

5. Look up user in DigitalTP database
   └─ Not found? → Error: "User not found"
   └─ Inactive? → Error: "User account inactive"

6. Create session with user's ACTUAL role from database
   └─ Success → Redirect to appropriate dashboard
```

### For Students
After validation, student is redirected to **Student Portal** where they can:
- View posting details
- Download posting letter
- Submit acceptance form
- View results
- Make payments

### For Staff
After validation, staff is redirected to **Staff Dashboard** based on their role:
- **Supervisors:** View assigned students, submit scores
- **Head of TP:** Manage postings, view reports
- **Field Monitors:** Monitor schools, submit reports

> ⚠️ **Security:** Role is NEVER taken from the token. It's always looked up from DigitalTP's database to prevent privilege escalation.

---

## Security

### Token Security
- Tokens expire after **5 minutes** (prevent replay attacks)
- HMAC-SHA256 signature prevents tampering
- Tokens are single-use (consumed on validation)

### Best Practices
| Do | Don't |
|----|-------|
| ✅ Keep secret key server-side only | ❌ Expose secret key in frontend code |
| ✅ Generate tokens on user click | ❌ Pre-generate tokens |
| ✅ Use HTTPS for all redirects | ❌ Use HTTP |
| ✅ Validate user is logged in first | ❌ Allow unauthenticated token generation |

---

## Testing Your Integration

### Step 1: Test Token Generation
Generate a test token and decode it to verify the payload:

```javascript
// Decode token (for testing only)
const [payloadBase64, signature] = token.split('.');
const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
console.log(payload);
```

### Step 2: Test Redirect
Use the DigitalTP sandbox environment:
```
https://sandbox.sitpms.com/sso/student?token=YOUR_TOKEN
```

### Step 3: Verify User Session
After redirect, check that:
- User lands on correct dashboard
- User details match token data
- User can access all features

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid token signature` | Secret key mismatch | Verify you're using the correct secret key |
| `Token expired` | Token older than 5 minutes | Generate token at click time, not beforehand |
| `Student not found` | Registration number doesn't exist in DigitalTP | Register the student in DigitalTP first (via admin panel or bulk import) |
| `Staff not found` | Email doesn't exist in DigitalTP | Register the staff member in DigitalTP first |
| `Invalid institution` | Wrong institution code | Check institution code matches DigitalTP records |
| `User inactive` | User exists but is deactivated | Reactivate the user in DigitalTP admin panel |

---

## Complete Example: Adding TP Link to Your Portal

### Student Portal Example (HTML + JavaScript)

```html
<!-- In your student dashboard -->
<div class="quick-links">
  <h3>Academic Services</h3>
  
  <a href="#" onclick="openDigitalTP()" class="service-link">
    <span class="icon">📚</span>
    <span class="title">Teaching Practice</span>
    <span class="description">View postings, letters, and results</span>
  </a>
</div>

<script>
async function openDigitalTP() {
  // Call your backend to generate token
  const response = await fetch('/api/sso/digitaltp-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  const { redirectUrl } = await response.json();
  
  // Open DigitalTP in new tab or same window
  window.open(redirectUrl, '_blank');
}
</script>
```

### Your Backend Endpoint (Node.js/Express)

```javascript
app.post('/api/sso/digitaltp-token', authenticate, (req, res) => {
  // Get current logged-in user from session
  const user = req.session.user;
  
  // Determine user type and identifier
  const userType = user.type === 'student' ? 'student' : 'staff';
  const identifier = user.type === 'student' ? user.matricNumber : user.email;
  
  // Generate token (minimal data - just identifier)
  const token = generateDigitalTPToken(
    process.env.DIGITALTP_PARTNER_ID,
    process.env.DIGITALTP_SECRET_KEY,
    userType,
    identifier,
    process.env.DIGITALTP_INSTITUTION_CODE
  );
  
  res.json({
    redirectUrl: `https://${process.env.DIGITALTP_SUBDOMAIN}.sitpms.com/sso/${userType}?token=${token}`
  });
});
```

---

## Environment Variables

Add these to your application configuration:

```env
# DigitalTP Integration
DIGITALTP_PARTNER_ID=ptn_fukashere_001
DIGITALTP_SECRET_KEY=your-secret-key-here
DIGITALTP_INSTITUTION_CODE=FUKASHERE
DIGITALTP_SUBDOMAIN=fukashere
```

---

## Managing API Keys (Institution Admin)

API Keys are managed from the **Institution Settings** in DigitalTP.

### Accessing API Keys

1. Log in to DigitalTP as **Head of Teaching Practice** or **Super Admin**
2. Go to **Settings** → **API Keys** tab
3. View, generate, or revoke API credentials

### API Keys Tab Features

| Feature | Description |
|---------|-------------|
| **View Partner ID** | Your unique partner identifier |
| **View/Copy Secret Key** | Secret key for signing tokens (shown once on creation) |
| **Regenerate Secret** | Create new secret key (invalidates old tokens) |
| **View Allowed Origins** | Domains allowed to redirect to DigitalTP |
| **Enable/Disable SSO** | Turn SSO integration on or off |
| **View SSO Logs** | See recent SSO login attempts and errors |
| **API Documentation** | Link to full integration guide with code samples |

> 📚 **Full Documentation:** Access the complete API documentation at `https://sitpms.com/docs` or click the "View Documentation" link in the API Keys tab.

### API Keys UI

```
┌─────────────────────────────────────────────────────────────┐
│  Settings > API Keys                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SSO Integration Status: ● Enabled  [Disable]               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Partner ID                                         │    │
│  │  ptn_fukashere_001                      [📋 Copy]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Secret Key                                         │    │
│  │  ••••••••••••••••••••••••••  [👁 Show] [📋 Copy]    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Institution Code                                   │    │
│  │  FUKASHERE                              [📋 Copy]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  SSO Endpoint                                       │    │
│  │  https://fukashere.sitpms.com/sso  [📋 Copy]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [🔄 Regenerate Secret Key]    [📊 View SSO Logs]           │
│                                                             │
│  [📚 View Documentation]                                    │
│                                                             │
│  ⚠️ Regenerating secret key will invalidate all existing    │
│     tokens. Partners will need the new key.                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### SSO Logs

The SSO Logs show recent authentication attempts:

| Time | User | Type | Status | IP Address |
|------|------|------|--------|------------|
| 2 min ago | UG/2024/001 | Student | ✅ Success | 192.168.1.10 |
| 5 min ago | john@uni.edu | Staff | ✅ Success | 192.168.1.15 |
| 10 min ago | unknown | - | ❌ Invalid signature | 41.58.12.88 |
| 15 min ago | UG/2024/999 | Student | ❌ User not found | 192.168.1.10 |

---

## Alternative: Normal Login

SSO is optional. Users can always log in directly to DigitalTP:

| User Type | Login URL | Credentials |
|-----------|-----------|-------------|
| Students | `https://fukashere.sitpms.com/student/login` | Registration Number + PIN |
| Staff | `https://fukashere.sitpms.com/login` | Email + Password |

---

## Support

| Need Help? | Contact |
|------------|---------|
| Technical Integration | integration@sitpms.com |
| Partner Registration | partners@sitpms.com |
| General Support | support@sitpms.com |

---

## Summary

| Step | Action | Time |
|------|--------|------|
| 1 | Register as partner, get credentials | 1 day |
| 2 | Import students/staff into DigitalTP | 1-2 hours |
| 3 | Add "Teaching Practice" link to your portal | 30 mins |
| 4 | Implement token generation (copy-paste code) | 1-2 hours |
| 5 | Test with sandbox environment | 30 mins |
| 6 | Go live! | Immediate |

**Total Setup Time: Less than 1 day**

**Remember:** Users must exist in DigitalTP before they can use SSO. Use DigitalTP's bulk import to upload your students and staff from Excel.

---

Users click a link in their existing system → They're instantly in DigitalTP with full access.

**That's it. Simple.**
