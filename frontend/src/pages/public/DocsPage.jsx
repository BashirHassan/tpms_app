import { useState } from 'react';
import {
  IconBook,
  IconKey,
  IconLink,
  IconCode,
  IconShieldCheck,
  IconAlertCircle,
  IconChevronRight,
  IconCopy,
  IconCheck,
  IconBrandJavascript,
  IconBrandPhp,
  IconBrandPython,
  IconHash,
  IconCoffee,
  IconArrowLeft,
  IconQuestionMark,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';

const NAV_SECTIONS = [
  { id: 'introduction', label: 'Introduction', icon: IconBook },
  { id: 'authentication', label: 'Authentication', icon: IconKey },
  { id: 'endpoints', label: 'SSO Endpoints', icon: IconLink },
  { id: 'token', label: 'Token Structure', icon: IconCode },
  { id: 'errors', label: 'Error Handling', icon: IconAlertCircle },
  { id: 'examples', label: 'Code Examples', icon: IconCode },
  { id: 'security', label: 'Security', icon: IconShieldCheck },
  { id: 'faq', label: 'FAQ', icon: IconQuestionMark },
];

const CODE_LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', icon: IconBrandJavascript },
  { id: 'php', label: 'PHP', icon: IconBrandPhp },
  { id: 'python', label: 'Python', icon: IconBrandPython },
  { id: 'csharp', label: 'C#', icon: IconHash },
  { id: 'java', label: 'Java', icon: IconCoffee },
];

function CodeBlock({ code, language = 'javascript' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy code"
      >
        {copied ? (
          <IconCheck size={16} className="text-green-400" />
        ) : (
          <IconCopy size={16} className="text-gray-300" />
        )}
      </button>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CODE_EXAMPLES = {
  javascript: `const crypto = require('crypto');

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
  
  return \`\${payloadBase64}.\${signature}\`;
}

function buildSSOUrl(subdomain, userType, token) {
  return \`https://\${subdomain}.digitaltipi.com/sso/\${userType}?token=\${encodeURIComponent(token)}\`;
}

// Usage
const token = generateDigitalTPToken(
  'ptn_fukashere_001',
  'your_secret_key_here',
  'student',
  'UG/2024/EDU/0123',
  'FUKASHERE'
);
const url = buildSSOUrl('fukashere', 'student', token);`,

  php: `<?php
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

function buildSSOUrl($subdomain, $userType, $token) {
    return "https://{$subdomain}.digitaltipi.com/sso/{$userType}?token=" . urlencode($token);
}

// Usage
$token = generateDigitalTPToken(
    'ptn_fukashere_001',
    'your_secret_key_here',
    'student',
    'UG/2024/EDU/0123',
    'FUKASHERE'
);
$url = buildSSOUrl('fukashere', 'student', $token);
?>`,

  python: `import hmac
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
    
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_base64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    
    signature = hmac.new(
        secret_key.encode(),
        payload_base64.encode(),
        hashlib.sha256
    ).digest()
    signature_base64 = base64.urlsafe_b64encode(signature).decode().rstrip('=')
    
    return f"{payload_base64}.{signature_base64}"

def build_sso_url(subdomain, user_type, token):
    return f"https://{subdomain}.digitaltipi.com/sso/{user_type}?token={token}"

# Usage
token = generate_digitaltp_token(
    'ptn_fukashere_001',
    'your_secret_key_here',
    'student',
    'UG/2024/EDU/0123',
    'FUKASHERE'
)
url = build_sso_url('fukashere', 'student', token)`,

  csharp: `using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class DigitalTPSSO
{
    public static string GenerateToken(string partnerId, string secretKey, 
                                        string userType, string identifier, 
                                        string institutionCode)
    {
        var payload = new
        {
            partner_id = partnerId,
            user_type = userType,
            identifier = identifier,
            institution_code = institutionCode,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            expires = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeMilliseconds()
        };

        string payloadJson = JsonSerializer.Serialize(payload);
        string payloadBase64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
        byte[] signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadBase64));
        string signatureBase64 = Base64UrlEncode(signatureBytes);

        return $"{payloadBase64}.{signatureBase64}";
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }
}`,

  java: `import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import com.google.gson.Gson;

public class DigitalTPSSO {
    private static final Gson gson = new Gson();

    public static String generateToken(String partnerId, String secretKey,
                                        String userType, String identifier,
                                        String institutionCode) throws Exception {
        Map<String, Object> payload = Map.of(
            "partner_id", partnerId,
            "user_type", userType,
            "identifier", identifier,
            "institution_code", institutionCode,
            "timestamp", System.currentTimeMillis(),
            "expires", System.currentTimeMillis() + (5 * 60 * 1000)
        );

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

    private static String base64UrlEncode(byte[] input) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(input);
    }
}`
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const [activeLanguage, setActiveLanguage] = useState('javascript');

  const scrollToSection = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <IconArrowLeft size={20} />
                <span className="hidden sm:inline">Back to Home</span>
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <IconBook size={24} className="text-blue-600" />
                <span className="font-bold text-xl text-gray-900">DigitalTP Docs</span>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              SSO API v1.0
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Documentation
              </h3>
              <ul className="space-y-1">
                {NAV_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <li key={section.id}>
                      <button
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                          activeSection === section.id
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={18} />
                        {section.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Hero */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-8 mb-8 text-white">
              <h1 className="text-3xl font-bold mb-2">DigitalTP SSO API</h1>
              <p className="text-blue-100 text-lg">
                Integrate single sign-on for seamless Teaching Practice access
              </p>
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-white/10 rounded-lg px-4 py-2">
                  <span className="text-blue-200 text-sm">Base URL</span>
                  <p className="font-mono text-sm">https://{'{subdomain}'}.digitaltipi.com</p>
                </div>
                <div className="bg-white/10 rounded-lg px-4 py-2">
                  <span className="text-blue-200 text-sm">Version</span>
                  <p className="font-mono text-sm">1.0</p>
                </div>
              </div>
            </div>

            {/* Introduction */}
            <Section id="introduction" title="Introduction">
              <p className="text-gray-600 mb-4">
                DigitalTP provides a simple SSO (Single Sign-On) API that allows partner systems to authenticate 
                users seamlessly. Users log in once to your system and can access DigitalTP without entering 
                credentials again.
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-blue-900 mb-2">How It Works</h4>
                <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
                  <li>User clicks "Teaching Practice" in your system</li>
                  <li>Your server generates a signed token</li>
                  <li>User is redirected to DigitalTP with the token</li>
                  <li>DigitalTP validates the token and looks up the user</li>
                  <li>User is logged in automatically</li>
                </ol>
              </div>

              <h4 className="font-semibold text-gray-900 mb-3">Prerequisites</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                    <IconKey size={20} className="text-blue-600" />
                  </div>
                  <h5 className="font-medium text-gray-900">Partner Credentials</h5>
                  <p className="text-sm text-gray-500 mt-1">Obtain Partner ID and Secret Key from DigitalTP</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                    <IconCheck size={20} className="text-green-600" />
                  </div>
                  <h5 className="font-medium text-gray-900">Users Must Exist</h5>
                  <p className="text-sm text-gray-500 mt-1">Import users via bulk upload before SSO</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                    <IconShieldCheck size={20} className="text-purple-600" />
                  </div>
                  <h5 className="font-medium text-gray-900">HTTPS Required</h5>
                  <p className="text-sm text-gray-500 mt-1">All SSO redirects must use HTTPS</p>
                </div>
              </div>
            </Section>

            {/* Authentication */}
            <Section id="authentication" title="Authentication">
              <p className="text-gray-600 mb-4">
                SSO uses HMAC-SHA256 signed tokens. The token consists of a base64url-encoded payload 
                and signature separated by a period.
              </p>

              <h4 className="font-semibold text-gray-900 mb-3">Credentials</h4>
              <Table
                headers={['Credential', 'Format', 'Example']}
                rows={[
                  ['Partner ID', 'ptn_{institution}_{number}', 'ptn_fukashere_001'],
                  ['Secret Key', '64-character hex string', 'a1b2c3d4e5f6...'],
                  ['Institution Code', 'Uppercase alphanumeric', 'FUKASHERE'],
                ]}
              />

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <p className="text-amber-800 text-sm">
                  <strong>Important:</strong> The secret key is used to sign the token but is NOT included 
                  in the payload. Never expose the secret key in client-side code.
                </p>
              </div>
            </Section>

            {/* Endpoints */}
            <Section id="endpoints" title="SSO Endpoints">
              <div className="space-y-6">
                {/* Student SSO */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">GET</span>
                      <code className="text-sm font-mono">/sso/student</code>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-gray-600 text-sm mb-3">Authenticate a student via SSO</p>
                    <h5 className="font-medium text-gray-900 text-sm mb-2">Query Parameters</h5>
                    <Table
                      headers={['Parameter', 'Type', 'Required', 'Description']}
                      rows={[
                        ['token', 'string', 'Yes', 'Signed SSO token'],
                      ]}
                    />
                    <div className="mt-3">
                      <h5 className="font-medium text-gray-900 text-sm mb-2">Example</h5>
                      <code className="text-xs bg-gray-100 p-2 rounded block overflow-x-auto">
                        https://fukashere.digitaltipi.com/sso/student?token=eyJwYXJ0bmVyX2lkIj...
                      </code>
                    </div>
                  </div>
                </div>

                {/* Staff SSO */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">GET</span>
                      <code className="text-sm font-mono">/sso/staff</code>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-gray-600 text-sm mb-3">Authenticate a staff member via SSO</p>
                    <h5 className="font-medium text-gray-900 text-sm mb-2">Query Parameters</h5>
                    <Table
                      headers={['Parameter', 'Type', 'Required', 'Description']}
                      rows={[
                        ['token', 'string', 'Yes', 'Signed SSO token'],
                      ]}
                    />
                    <div className="mt-3">
                      <h5 className="font-medium text-gray-900 text-sm mb-2">Example</h5>
                      <code className="text-xs bg-gray-100 p-2 rounded block overflow-x-auto">
                        https://fukashere.digitaltipi.com/sso/staff?token=eyJwYXJ0bmVyX2lkIj...
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Token Structure */}
            <Section id="token" title="Token Structure">
              <h4 className="font-semibold text-gray-900 mb-3">Payload Fields</h4>
              <Table
                headers={['Field', 'Type', 'Required', 'Description']}
                rows={[
                  ['partner_id', 'string', 'Yes', 'Your Partner ID'],
                  ['user_type', 'string', 'Yes', '"student" or "staff"'],
                  ['identifier', 'string', 'Yes', 'Registration number (student) or email (staff)'],
                  ['institution_code', 'string', 'Yes', 'Institution code (e.g., FUKASHERE)'],
                  ['timestamp', 'number', 'Yes', 'Token creation time (Unix milliseconds)'],
                  ['expires', 'number', 'Yes', 'Token expiry time (Unix milliseconds)'],
                ]}
              />

              <h4 className="font-semibold text-gray-900 mt-6 mb-3">Example Payloads</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Student</h5>
                  <CodeBlock
                    code={`{
  "partner_id": "ptn_fukashere_001",
  "user_type": "student",
  "identifier": "UG/2024/EDU/0123",
  "institution_code": "FUKASHERE",
  "timestamp": 1737885600000,
  "expires": 1737885900000
}`}
                  />
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Staff</h5>
                  <CodeBlock
                    code={`{
  "partner_id": "ptn_fukashere_001",
  "user_type": "staff",
  "identifier": "john.doe@university.edu",
  "institution_code": "FUKASHERE",
  "timestamp": 1737885600000,
  "expires": 1737885900000
}`}
                  />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                <h5 className="font-medium text-gray-900 mb-2">Token Generation Algorithm</h5>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 text-sm">
                  <li>Create payload as JSON object</li>
                  <li>Base64URL encode payload → payload_base64</li>
                  <li>HMAC-SHA256(payload_base64, secret_key) → signature_bytes</li>
                  <li>Base64URL encode signature_bytes → signature_base64</li>
                  <li>Token = payload_base64 + "." + signature_base64</li>
                </ol>
              </div>
            </Section>

            {/* Error Handling */}
            <Section id="errors" title="Error Handling">
              <h4 className="font-semibold text-gray-900 mb-3">Error Codes</h4>
              <Table
                headers={['Error Code', 'HTTP', 'Description', 'Solution']}
                rows={[
                  ['SSO_INVALID_TOKEN', '401', 'Token signature failed', 'Check secret key'],
                  ['SSO_TOKEN_EXPIRED', '401', 'Token has expired', 'Generate fresh token'],
                  ['SSO_INVALID_PARTNER', '401', 'Partner ID not found', 'Verify credentials'],
                  ['SSO_INSTITUTION_MISMATCH', '403', 'Wrong institution', 'Check institution code'],
                  ['SSO_USER_NOT_FOUND', '404', 'User not in DigitalTP', 'Register user first'],
                  ['SSO_USER_INACTIVE', '403', 'Account deactivated', 'Reactivate in admin'],
                  ['SSO_DISABLED', '403', 'SSO is disabled', 'Enable in API Keys tab'],
                ]}
              />

              <h4 className="font-semibold text-gray-900 mt-6 mb-3">Error Response Format</h4>
              <CodeBlock
                code={`{
  "success": false,
  "error": "SSO_INVALID_TOKEN",
  "message": "Invalid token signature"
}`}
              />
            </Section>

            {/* Code Examples */}
            <Section id="examples" title="Code Examples">
              <p className="text-gray-600 mb-4">
                Choose your programming language to see the complete SSO token generation code:
              </p>

              {/* Language Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {CODE_LANGUAGES.map((lang) => {
                  const Icon = lang.icon;
                  return (
                    <button
                      key={lang.id}
                      onClick={() => setActiveLanguage(lang.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeLanguage === lang.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Icon size={18} />
                      {lang.label}
                    </button>
                  );
                })}
              </div>

              <CodeBlock code={CODE_EXAMPLES[activeLanguage]} language={activeLanguage} />
            </Section>

            {/* Security */}
            <Section id="security" title="Security Best Practices">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <IconCheck size={20} />
                    DO
                  </h4>
                  <ul className="space-y-2">
                    {[
                      'Generate tokens server-side only',
                      'Use HTTPS for all SSO redirects',
                      'Generate fresh tokens on each request',
                      'Store secret key in environment variables',
                      'Authenticate users before generating tokens',
                      'Keep audit logs of SSO attempts',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <IconCheck size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <IconAlertCircle size={20} />
                    DON'T
                  </h4>
                  <ul className="space-y-2">
                    {[
                      'Expose secret key in client-side code',
                      'Pre-generate or cache tokens',
                      'Send secret key to browser',
                      'Skip HTTPS for SSO redirects',
                      'Trust role/permissions from token',
                      'Use weak or predictable partner IDs',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <IconAlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>

            {/* FAQ */}
            <Section id="faq" title="Frequently Asked Questions">
              <div className="space-y-4">
                {[
                  {
                    q: 'Do users need a DigitalTP account?',
                    a: 'Yes, users must be registered in DigitalTP before SSO works. Use bulk import to upload users.'
                  },
                  {
                    q: 'Can users still log in normally?',
                    a: 'Yes, SSO is optional. Users can always use the standard login page with their credentials.'
                  },
                  {
                    q: 'What roles are supported for staff?',
                    a: 'Supervisor, Head of Teaching Practice, Field Monitor. Role is determined by DigitalTP database, not the token.'
                  },
                  {
                    q: 'Why is my token signature invalid?',
                    a: 'Check that you\'re using the correct secret key, the payload is JSON-encoded before base64, you\'re using base64url encoding (not standard base64), and the signature is HMAC-SHA256.'
                  },
                  {
                    q: 'How long do sessions last?',
                    a: 'DigitalTP sessions last 24 hours. Users will need to re-authenticate via SSO after session expiry.'
                  },
                  {
                    q: 'Is there a rate limit?',
                    a: 'Yes, 100 SSO requests per minute per partner. Contact support if you need higher limits.'
                  },
                ].map((faq, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 mb-2">{faq.q}</h5>
                    <p className="text-sm text-gray-600">{faq.a}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Support Footer */}
            <div className="bg-gray-100 rounded-lg p-6 mt-8">
              <h3 className="font-semibold text-gray-900 mb-4">Need Help?</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-500">Technical Support</p>
                  <p className="text-gray-900">integration@digitaltipi.com</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Partner Portal</p>
                  <p className="text-gray-900">partners.digitaltipi.com</p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} DigitalTP. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
