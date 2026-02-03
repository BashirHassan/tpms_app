# DigitalTP SSO API Documentation

> **Version:** 1.0  
> **Base URL:** `https://{subdomain}.digitaltipi.com`  
> **Documentation URL:** `https://docs.digitaltipi.com`

---

## Table of Contents

1. [Introduction](#introduction)
2. [Authentication](#authentication)
3. [SSO Endpoints](#sso-endpoints)
4. [Token Structure](#token-structure)
5. [Error Handling](#error-handling)
6. [Code Examples](#code-examples)
7. [Testing](#testing)
8. [Security Best Practices](#security-best-practices)
9. [FAQ](#faq)

---

## Introduction

DigitalTP provides a simple SSO (Single Sign-On) API that allows partner systems to authenticate users seamlessly. Users log in once to your system and can access DigitalTP without entering credentials again.

### How It Works

```
Partner System                              DigitalTP
     │                                          │
     │  1. User clicks "Teaching Practice"      │
     │                                          │
     │  2. Generate signed token                │
     │                                          │
     │  3. Redirect with token ─────────────────►
     │                                          │
     │                          4. Validate token
     │                          5. Look up user
     │                          6. Create session
     │                                          │
     │  ◄───────────────────── 7. User logged in
     │                                          │
```

### Prerequisites

1. **Partner credentials** - Obtain from DigitalTP (Partner ID + Secret Key)
2. **Users must exist in DigitalTP** - Import via bulk upload before SSO
3. **HTTPS required** - All redirects must use HTTPS

---

## Authentication

### Credentials

| Credential | Format | Example |
|------------|--------|---------|
| Partner ID | `ptn_{institution}_{number}` | `ptn_fukashere_001` |
| Secret Key | 64-character hex string | `a1b2c3d4...` |
| Institution Code | Uppercase alphanumeric | `FUKASHERE` |

### Token Authentication

SSO uses HMAC-SHA256 signed tokens. The token consists of:

```
{base64url_payload}.{base64url_signature}
```

**Important:** The secret key is used to sign the token but is NOT included in the payload.

---

## SSO Endpoints

### Student SSO

**Endpoint:** `GET /sso/student`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Signed SSO token |

**Example:**
```
https://fukashere.digitaltipi.com/sso/student?token=eyJwYXJ0bmVyX2lkIj...
```

**Success Response:**
- Redirects to Student Portal (`/student/dashboard`)
- Sets session cookie

**Error Response:**
```json
{
  "success": false,
  "error": "SSO_INVALID_TOKEN",
  "message": "Invalid token signature"
}
```

---

### Staff SSO

**Endpoint:** `GET /sso/staff`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Signed SSO token |

**Example:**
```
https://fukashere.digitaltipi.com/sso/staff?token=eyJwYXJ0bmVyX2lkIj...
```

**Success Response:**
- Redirects to Staff Dashboard (`/dashboard`)
- Sets session cookie
- Role determined from DigitalTP database

**Error Response:**
```json
{
  "success": false,
  "error": "SSO_USER_NOT_FOUND",
  "message": "Staff member not found in DigitalTP"
}
```

---

## Token Structure

### Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `partner_id` | string | Yes | Your Partner ID |
| `user_type` | string | Yes | `"student"` or `"staff"` |
| `identifier` | string | Yes | Student: registration number<br>Staff: email address |
| `institution_code` | string | Yes | Institution code |
| `timestamp` | number | Yes | Token creation time (Unix ms) |
| `expires` | number | Yes | Token expiry time (Unix ms) |

### Example Payload

**For Student:**
```json
{
  "partner_id": "ptn_fukashere_001",
  "user_type": "student",
  "identifier": "UG/2024/EDU/0123",
  "institution_code": "FUKASHERE",
  "timestamp": 1737885600000,
  "expires": 1737885900000
}
```

**For Staff:**
```json
{
  "partner_id": "ptn_fukashere_001",
  "user_type": "staff",
  "identifier": "john.doe@university.edu",
  "institution_code": "FUKASHERE",
  "timestamp": 1737885600000,
  "expires": 1737885900000
}
```

### Token Generation Algorithm

```
1. Create payload JSON
2. Base64URL encode payload → payload_base64
3. HMAC-SHA256(payload_base64, secret_key) → signature_bytes
4. Base64URL encode signature_bytes → signature_base64
5. Token = payload_base64 + "." + signature_base64
```

### Token Expiry

- Tokens expire **5 minutes** after creation
- Generate tokens on-demand when user clicks SSO link
- Do NOT pre-generate or cache tokens

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {}
}
```

### Error Codes

| Error Code | HTTP Status | Description | Solution |
|------------|-------------|-------------|----------|
| `SSO_INVALID_TOKEN` | 401 | Token signature validation failed | Check secret key |
| `SSO_TOKEN_EXPIRED` | 401 | Token has expired | Generate fresh token |
| `SSO_INVALID_PARTNER` | 401 | Partner ID not found or inactive | Verify partner credentials |
| `SSO_INSTITUTION_MISMATCH` | 403 | Institution not authorized for partner | Check institution code |
| `SSO_USER_NOT_FOUND` | 404 | User not found in DigitalTP | Register user first |
| `SSO_USER_INACTIVE` | 403 | User account is deactivated | Reactivate in admin panel |
| `SSO_DISABLED` | 403 | SSO is disabled for institution | Enable in API Keys tab |
| `SSO_INVALID_USER_TYPE` | 400 | Invalid user_type value | Use "student" or "staff" |

### Handling Errors

```javascript
// In partner system - handle SSO errors
app.get('/digitaltp-callback', (req, res) => {
  const { error, message } = req.query;
  
  if (error) {
    switch (error) {
      case 'SSO_USER_NOT_FOUND':
        return res.render('error', { 
          message: 'Your account is not yet registered in Teaching Practice system. Please contact your department.' 
        });
      case 'SSO_TOKEN_EXPIRED':
        // Retry with fresh token
        return res.redirect('/api/sso/digitaltp-token');
      default:
        return res.render('error', { message });
    }
  }
});
```

---

## Code Examples

### JavaScript / Node.js

```javascript
const crypto = require('crypto');

/**
 * Generate DigitalTP SSO token
 * @param {string} partnerId - Partner ID from API Keys
 * @param {string} secretKey - Secret Key from API Keys
 * @param {string} userType - "student" or "staff"
 * @param {string} identifier - Registration number (student) or email (staff)
 * @param {string} institutionCode - Institution code
 * @returns {string} Signed SSO token
 */
function generateDigitalTPToken(partnerId, secretKey, userType, identifier, institutionCode) {
  const payload = {
    partner_id: partnerId,
    user_type: userType,
    identifier: identifier,
    institution_code: institutionCode,
    timestamp: Date.now(),
    expires: Date.now() + (5 * 60 * 1000)
  };
  
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadBase64)
    .digest('base64url');
  
  return `${payloadBase64}.${signature}`;
}

/**
 * Build SSO redirect URL
 * @param {string} subdomain - Institution subdomain
 * @param {string} userType - "student" or "staff"
 * @param {string} token - Generated SSO token
 * @returns {string} Full redirect URL
 */
function buildSSOUrl(subdomain, userType, token) {
  return `https://${subdomain}.digitaltipi.com/sso/${userType}?token=${encodeURIComponent(token)}`;
}

// Express.js endpoint example
const express = require('express');
const app = express();

app.post('/api/sso/digitaltp', authenticate, (req, res) => {
  const user = req.session.user;
  
  const userType = user.role === 'student' ? 'student' : 'staff';
  const identifier = userType === 'student' ? user.matricNumber : user.email;
  
  const token = generateDigitalTPToken(
    process.env.DIGITALTP_PARTNER_ID,
    process.env.DIGITALTP_SECRET_KEY,
    userType,
    identifier,
    process.env.DIGITALTP_INSTITUTION_CODE
  );
  
  const redirectUrl = buildSSOUrl(
    process.env.DIGITALTP_SUBDOMAIN,
    userType,
    token
  );
  
  res.json({ success: true, redirectUrl });
});
```

---

### PHP

```php
<?php
/**
 * Generate DigitalTP SSO token
 */
function generateDigitalTPToken($partnerId, $secretKey, $userType, $identifier, $institutionCode) {
    $payload = [
        'partner_id' => $partnerId,
        'user_type' => $userType,
        'identifier' => $identifier,
        'institution_code' => $institutionCode,
        'timestamp' => round(microtime(true) * 1000),
        'expires' => round(microtime(true) * 1000) + (5 * 60 * 1000)
    ];
    
    $payloadJson = json_encode($payload);
    $payloadBase64 = rtrim(strtr(base64_encode($payloadJson), '+/', '-_'), '=');
    
    $signatureRaw = hash_hmac('sha256', $payloadBase64, $secretKey, true);
    $signatureBase64 = rtrim(strtr(base64_encode($signatureRaw), '+/', '-_'), '=');
    
    return $payloadBase64 . '.' . $signatureBase64;
}

/**
 * Build SSO redirect URL
 */
function buildSSOUrl($subdomain, $userType, $token) {
    return "https://{$subdomain}.digitaltipi.com/sso/{$userType}?token=" . urlencode($token);
}

// Usage in controller
session_start();

if (!isset($_SESSION['user'])) {
    header('Location: /login');
    exit;
}

$user = $_SESSION['user'];
$userType = $user['role'] === 'student' ? 'student' : 'staff';
$identifier = $userType === 'student' ? $user['matric_number'] : $user['email'];

$token = generateDigitalTPToken(
    getenv('DIGITALTP_PARTNER_ID'),
    getenv('DIGITALTP_SECRET_KEY'),
    $userType,
    $identifier,
    getenv('DIGITALTP_INSTITUTION_CODE')
);

$redirectUrl = buildSSOUrl(getenv('DIGITALTP_SUBDOMAIN'), $userType, $token);
header("Location: $redirectUrl");
exit;
?>
```

---

### Python

```python
import hmac
import hashlib
import base64
import json
import time
from urllib.parse import urlencode

def generate_digitaltp_token(partner_id: str, secret_key: str, user_type: str, 
                              identifier: str, institution_code: str) -> str:
    """Generate DigitalTP SSO token."""
    payload = {
        'partner_id': partner_id,
        'user_type': user_type,
        'identifier': identifier,
        'institution_code': institution_code,
        'timestamp': int(time.time() * 1000),
        'expires': int((time.time() + 300) * 1000)  # 5 minutes
    }
    
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_base64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    
    signature = hmac.new(
        secret_key.encode(),
        payload_base64.encode(),
        hashlib.sha256
    ).digest()
    signature_base64 = base64.urlsafe_b64encode(signature).decode().rstrip('=')
    
    return f"{payload_base64}.{signature_base64}"


def build_sso_url(subdomain: str, user_type: str, token: str) -> str:
    """Build SSO redirect URL."""
    return f"https://{subdomain}.digitaltipi.com/sso/{user_type}?token={token}"


# Flask example
from flask import Flask, session, redirect, jsonify
import os

app = Flask(__name__)

@app.route('/api/sso/digitaltp', methods=['POST'])
def digitaltp_sso():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user = session['user']
    user_type = 'student' if user['role'] == 'student' else 'staff'
    identifier = user['matric_number'] if user_type == 'student' else user['email']
    
    token = generate_digitaltp_token(
        os.environ['DIGITALTP_PARTNER_ID'],
        os.environ['DIGITALTP_SECRET_KEY'],
        user_type,
        identifier,
        os.environ['DIGITALTP_INSTITUTION_CODE']
    )
    
    redirect_url = build_sso_url(os.environ['DIGITALTP_SUBDOMAIN'], user_type, token)
    
    return jsonify({'success': True, 'redirectUrl': redirect_url})


# Django example
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required

@login_required
def digitaltp_sso(request):
    user = request.user
    user_type = 'student' if hasattr(user, 'student_profile') else 'staff'
    identifier = user.student_profile.matric_number if user_type == 'student' else user.email
    
    token = generate_digitaltp_token(
        settings.DIGITALTP_PARTNER_ID,
        settings.DIGITALTP_SECRET_KEY,
        user_type,
        identifier,
        settings.DIGITALTP_INSTITUTION_CODE
    )
    
    redirect_url = build_sso_url(settings.DIGITALTP_SUBDOMAIN, user_type, token)
    
    return JsonResponse({'success': True, 'redirectUrl': redirect_url})
```

---

### C# / .NET

```csharp
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Web;

public class DigitalTPSSOService
{
    private readonly string _partnerId;
    private readonly string _secretKey;
    private readonly string _institutionCode;
    private readonly string _subdomain;

    public DigitalTPSSOService(string partnerId, string secretKey, 
                                string institutionCode, string subdomain)
    {
        _partnerId = partnerId;
        _secretKey = secretKey;
        _institutionCode = institutionCode;
        _subdomain = subdomain;
    }

    public string GenerateToken(string userType, string identifier)
    {
        var payload = new Dictionary<string, object>
        {
            ["partner_id"] = _partnerId,
            ["user_type"] = userType,
            ["identifier"] = identifier,
            ["institution_code"] = _institutionCode,
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["expires"] = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeMilliseconds()
        };

        string payloadJson = JsonSerializer.Serialize(payload);
        string payloadBase64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_secretKey));
        byte[] signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadBase64));
        string signatureBase64 = Base64UrlEncode(signatureBytes);

        return $"{payloadBase64}.{signatureBase64}";
    }

    public string BuildSSOUrl(string userType, string token)
    {
        return $"https://{_subdomain}.digitaltipi.com/sso/{userType}?token={HttpUtility.UrlEncode(token)}";
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }
}

// ASP.NET Core Controller example
[ApiController]
[Route("api/sso")]
public class SSOController : ControllerBase
{
    private readonly DigitalTPSSOService _ssoService;

    public SSOController(IConfiguration config)
    {
        _ssoService = new DigitalTPSSOService(
            config["DigitalTP:PartnerId"],
            config["DigitalTP:SecretKey"],
            config["DigitalTP:InstitutionCode"],
            config["DigitalTP:Subdomain"]
        );
    }

    [HttpPost("digitaltp")]
    [Authorize]
    public IActionResult GenerateSSOToken()
    {
        var user = HttpContext.User;
        var userType = user.IsInRole("Student") ? "student" : "staff";
        var identifier = userType == "student" 
            ? user.FindFirst("MatricNumber")?.Value 
            : user.FindFirst("Email")?.Value;

        var token = _ssoService.GenerateToken(userType, identifier);
        var redirectUrl = _ssoService.BuildSSOUrl(userType, token);

        return Ok(new { success = true, redirectUrl });
    }
}
```

---

### Java

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import com.google.gson.Gson;

public class DigitalTPSSOService {
    
    private final String partnerId;
    private final String secretKey;
    private final String institutionCode;
    private final String subdomain;
    private final Gson gson = new Gson();

    public DigitalTPSSOService(String partnerId, String secretKey, 
                                String institutionCode, String subdomain) {
        this.partnerId = partnerId;
        this.secretKey = secretKey;
        this.institutionCode = institutionCode;
        this.subdomain = subdomain;
    }

    public String generateToken(String userType, String identifier) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("partner_id", partnerId);
        payload.put("user_type", userType);
        payload.put("identifier", identifier);
        payload.put("institution_code", institutionCode);
        payload.put("timestamp", System.currentTimeMillis());
        payload.put("expires", System.currentTimeMillis() + (5 * 60 * 1000));

        String payloadJson = gson.toJson(payload);
        String payloadBase64 = base64UrlEncode(payloadJson.getBytes(StandardCharsets.UTF_8));

        Mac hmac = Mac.getInstance("HmacSHA256");
        SecretKeySpec keySpec = new SecretKeySpec(
            secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"
        );
        hmac.init(keySpec);
        byte[] signatureBytes = hmac.doFinal(payloadBase64.getBytes(StandardCharsets.UTF_8));
        String signatureBase64 = base64UrlEncode(signatureBytes);

        return payloadBase64 + "." + signatureBase64;
    }

    public String buildSSOUrl(String userType, String token) {
        return String.format("https://%s.digitaltipi.com/sso/%s?token=%s",
            subdomain, userType, java.net.URLEncoder.encode(token, StandardCharsets.UTF_8));
    }

    private String base64UrlEncode(byte[] input) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(input);
    }
}

// Spring Boot Controller example
@RestController
@RequestMapping("/api/sso")
public class SSOController {

    @Autowired
    private DigitalTPSSOService ssoService;

    @PostMapping("/digitaltp")
    public ResponseEntity<?> generateSSOToken(@AuthenticationPrincipal UserDetails user) {
        try {
            String userType = user.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_STUDENT")) ? "student" : "staff";
            
            String identifier = userType.equals("student") 
                ? ((StudentUser) user).getMatricNumber()
                : user.getUsername();

            String token = ssoService.generateToken(userType, identifier);
            String redirectUrl = ssoService.buildSSOUrl(userType, token);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("redirectUrl", redirectUrl);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }
}
```

---

## Testing

### Sandbox Environment

Use the sandbox environment for testing:

| Environment | Base URL |
|-------------|----------|
| Sandbox | `https://sandbox.digitaltipi.com` |
| Production | `https://{subdomain}.digitaltipi.com` |

### Test Credentials

Contact DigitalTP support for sandbox credentials:
- Sandbox Partner ID
- Sandbox Secret Key
- Test user accounts

### Token Validation Test

Decode your token to verify the payload:

```javascript
function decodeToken(token) {
  const [payloadBase64, signature] = token.split('.');
  const payload = JSON.parse(
    Buffer.from(payloadBase64, 'base64url').toString()
  );
  console.log('Payload:', payload);
  console.log('Expires in:', (payload.expires - Date.now()) / 1000, 'seconds');
  return payload;
}
```

### Testing Checklist

- [ ] Token generates without errors
- [ ] Token signature is valid
- [ ] Token expiry is 5 minutes in future
- [ ] Redirect URL is correct
- [ ] Student SSO works for existing student
- [ ] Staff SSO works for existing staff
- [ ] Correct role assigned to staff
- [ ] Error handling for non-existent users
- [ ] Error handling for expired tokens

---

## Security Best Practices

### DO ✅

| Practice | Description |
|----------|-------------|
| **Server-side token generation** | Always generate tokens on your backend |
| **HTTPS everywhere** | Use HTTPS for all SSO redirects |
| **Fresh tokens** | Generate tokens when user clicks, not beforehand |
| **Secure key storage** | Store secret key in environment variables |
| **Authenticate first** | Only generate tokens for authenticated users |
| **Log SSO attempts** | Keep audit logs of SSO requests |

### DON'T ❌

| Practice | Risk |
|----------|------|
| **Expose secret key** | Attackers can forge tokens |
| **Pre-generate tokens** | Tokens may expire before use |
| **Cache tokens** | Stale tokens are security risk |
| **Send key to frontend** | Visible in browser dev tools |
| **Skip HTTPS** | Man-in-the-middle attacks |
| **Trust token data** | Role/permissions must come from database |

### Rotating Secret Keys

When you regenerate your secret key:

1. All existing tokens become invalid immediately
2. Update the key in your application's environment
3. Deploy the change to production
4. Test SSO flow with new key

---

## FAQ

### General

**Q: Do users need a DigitalTP account?**  
A: Yes, users must be registered in DigitalTP before SSO works. Use bulk import to upload users.

**Q: Can users still log in normally?**  
A: Yes, SSO is optional. Users can always use the standard login page with their credentials.

**Q: What roles are supported for staff?**  
A: Supervisor, Head of Teaching Practice, Field Monitor. Role is determined by DigitalTP database, not the token.

### Technical

**Q: Why is my token signature invalid?**  
A: Check that:
- You're using the correct secret key
- The payload is JSON-encoded before base64
- You're using base64url encoding (not standard base64)
- The signature is HMAC-SHA256

**Q: Why do I get "User not found"?**  
A: The identifier (registration number or email) must match exactly what's in DigitalTP. Check for typos or case sensitivity.

**Q: How long do sessions last?**  
A: DigitalTP sessions last 24 hours. Users will need to re-authenticate via SSO after session expiry.

**Q: Can I customize the redirect after login?**  
A: Currently, students go to Student Portal and staff go to Staff Dashboard. Custom redirects may be added in future versions.

### Integration

**Q: Can I use SSO for multiple institutions?**  
A: Each institution has its own Partner ID and Secret Key. You'll need separate credentials for each.

**Q: Is there a rate limit?**  
A: Yes, 100 SSO requests per minute per partner. Contact support if you need higher limits.

**Q: Can I test without affecting production?**  
A: Yes, use the sandbox environment (`sandbox.digitaltipi.com`) for testing.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-26 | Initial release |

---

## Support

| Resource | Link/Contact |
|----------|--------------|
| Documentation | https://docs.digitaltipi.com |
| Technical Support | integration@digitaltipi.com |
| Status Page | https://status.digitaltipi.com |
| Partner Portal | https://partners.digitaltipi.com |

---

**© 2026 DigitalTP. All rights reserved.**
