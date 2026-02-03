/**
 * Central Email Service
 * 
 * Tenant-aware email dispatch service that:
 * - Uses institution SMTP settings from database
 * - Enforces consistent branded email layouts
 * - Supports async email sending via queue
 * - Provides email audit logging (without sensitive data)
 * - Handles encryption/decryption of SMTP credentials
 * 
 * USAGE:
 * const { emailService } = require('./services');
 * await emailService.sendEmail(institutionId, {
 *   to: 'user@example.com',
 *   template: 'passwordReset',
 *   data: { name: 'John', resetUrl: '...' }
 * });
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pool = require('../db/connection');
const encryptionService = require('./encryptionService');

// SMTP transporter cache (per institution)
const transporterCache = new Map();
const TRANSPORTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// System transporter (uses .env SMTP credentials for superadmin/system emails)
let systemTransporter = null;
let systemTransporterTimestamp = 0;

// Branding cache (per institution)
const brandingCache = new Map();
const BRANDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * SMTP port/SSL validation rules
 */
const SMTP_PORT_RULES = {
  465: { secure: true, description: 'SMTPS (Implicit TLS)' },
  587: { secure: false, description: 'Submission (STARTTLS)' },
  25: { secure: false, description: 'Standard SMTP (not recommended)' },
  2525: { secure: false, description: 'Alternative SMTP' },
};

/**
 * Validate SMTP port vs SSL/TLS settings
 * @param {number} port
 * @param {boolean} secure
 * @returns {{ valid: boolean, warning?: string }}
 */
function validateSmtpPortConfig(port, secure) {
  const portNum = parseInt(port);
  const rule = SMTP_PORT_RULES[portNum];

  if (!rule) {
    return {
      valid: true,
      warning: `Non-standard SMTP port ${portNum}. Ensure your mail server supports it.`,
    };
  }

  if (rule.secure !== secure) {
    return {
      valid: false,
      warning: `Port ${portNum} (${rule.description}) ${rule.secure ? 'requires' : 'should not use'} SSL/TLS. ` +
        `You have SSL ${secure ? 'enabled' : 'disabled'}.`,
    };
  }

  if (portNum === 25) {
    return {
      valid: true,
      warning: 'Port 25 is often blocked by ISPs and not recommended for production email sending.',
    };
  }

  return { valid: true };
}

/**
 * Get SMTP configuration for an institution
 * @param {number} institutionId
 * @returns {Promise<Object|null>}
 */
async function getSmtpConfig(institutionId) {
  const [rows] = await pool.query(
    `SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password,
            smtp_from_name, smtp_from_email, name as institution_name
     FROM institutions WHERE id = ?`,
    [institutionId]
  );

  if (!rows[0] || !rows[0].smtp_host || !rows[0].smtp_user) {
    return null;
  }

  const config = rows[0];

  // Decrypt SMTP password
  let decryptedPassword = null;
  if (config.smtp_password) {
    try {
      decryptedPassword = encryptionService.decrypt(config.smtp_password);
    } catch (error) {
      console.error(`[EMAIL] Failed to decrypt SMTP password for institution ${institutionId}:`, error.message);
      return null;
    }
  }

  return {
    host: config.smtp_host,
    port: parseInt(config.smtp_port) || 465,
    secure: Boolean(config.smtp_secure),
    user: config.smtp_user,
    password: decryptedPassword,
    fromName: config.smtp_from_name || config.institution_name,
    fromEmail: config.smtp_from_email || config.smtp_user,
    institutionName: config.institution_name,
  };
}

/**
 * Get system SMTP configuration from environment variables
 * Used for superadmin emails and system-level notifications
 * @returns {Object|null}
 */
function getSystemSmtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[EMAIL] System SMTP not configured in environment variables');
    return null;
  }

  return {
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 465,
    secure: SMTP_SECURE === 'true' || SMTP_SECURE === true,
    user: SMTP_USER,
    password: SMTP_PASS.replace(/^["']|["']$/g, ''), // Remove quotes if present
    fromName: 'DigitalTP System',
    fromEmail: SMTP_USER,
    institutionName: 'DigitalTP',
  };
}

/**
 * Get or create system SMTP transporter (for superadmin/system emails)
 * @returns {{ transporter: nodemailer.Transporter, config: Object }|null}
 */
function getSystemTransporter() {
  // Check cache
  if (systemTransporter && Date.now() - systemTransporterTimestamp < TRANSPORTER_CACHE_TTL) {
    return { transporter: systemTransporter, config: getSystemSmtpConfig() };
  }

  const config = getSystemSmtpConfig();
  if (!config) {
    return null;
  }

  // Validate port configuration
  const portValidation = validateSmtpPortConfig(config.port, config.secure);
  if (!portValidation.valid) {
    console.error(`[EMAIL] System SMTP configuration error: ${portValidation.warning}`);
    return null;
  }
  if (portValidation.warning) {
    console.warn(`[EMAIL] System SMTP warning: ${portValidation.warning}`);
  }

  try {
    systemTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    systemTransporterTimestamp = Date.now();
    console.log('[EMAIL] System transporter created successfully');

    return { transporter: systemTransporter, config };
  } catch (error) {
    console.error('[EMAIL] Failed to create system transporter:', error.message);
    return null;
  }
}

/**
 * Get or create SMTP transporter for institution
 * @param {number} institutionId
 * @returns {Promise<{ transporter: nodemailer.Transporter, config: Object }|null>}
 */
async function getTransporter(institutionId) {
  const cacheKey = `transporter_${institutionId}`;
  const cached = transporterCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < TRANSPORTER_CACHE_TTL) {
    return { transporter: cached.transporter, config: cached.config };
  }

  const config = await getSmtpConfig(institutionId);
  if (!config) {
    console.warn(`[EMAIL] No valid SMTP configuration for institution ${institutionId}`);
    return null;
  }

  // Validate port configuration
  const portValidation = validateSmtpPortConfig(config.port, config.secure);
  if (!portValidation.valid) {
    console.error(`[EMAIL] SMTP configuration error for institution ${institutionId}: ${portValidation.warning}`);
    return null;
  }
  if (portValidation.warning) {
    console.warn(`[EMAIL] SMTP warning for institution ${institutionId}: ${portValidation.warning}`);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      // Connection pooling for better performance
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Timeouts
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    // Cache the transporter
    transporterCache.set(cacheKey, {
      transporter,
      config,
      timestamp: Date.now(),
    });

    return { transporter, config };
  } catch (error) {
    console.error(`[EMAIL] Failed to create transporter for institution ${institutionId}:`, error.message);
    return null;
  }
}

/**
 * Invalidate transporter cache for an institution
 * Call this when SMTP settings are updated
 * @param {number} institutionId
 */
function invalidateTransporterCache(institutionId) {
  transporterCache.delete(`transporter_${institutionId}`);
  console.log(`[EMAIL] Transporter cache invalidated for institution ${institutionId}`);
}

/**
 * Invalidate branding cache for an institution
 * Call this when branding settings are updated
 * @param {number} institutionId
 */
function invalidateBrandingCache(institutionId) {
  brandingCache.delete(`branding_${institutionId}`);
  console.log(`[EMAIL] Branding cache invalidated for institution ${institutionId}`);
}

/**
 * Get institution branding for emails
 * @param {number} institutionId
 * @returns {Promise<Object>}
 */
async function getInstitutionBranding(institutionId) {
  const cacheKey = `branding_${institutionId}`;
  const cached = brandingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < BRANDING_CACHE_TTL) {
    return cached.branding;
  }

  const [rows] = await pool.query(
    `SELECT name, code, logo_url, primary_color, secondary_color, email, phone, address, state, tp_unit_name
     FROM institutions WHERE id = ?`,
    [institutionId]
  );

  const institution = rows[0];
  
  // Default/fallback branding
  const branding = {
    name: institution?.name || 'DigitalTP',
    code: institution?.code || 'DTP',
    logoUrl: institution?.logo_url || null,
    primaryColor: institution?.primary_color || '#1a5f2a',
    secondaryColor: institution?.secondary_color || '#8b4513',
    email: institution?.email || null,
    phone: institution?.phone || null,
    address: institution?.address || null,
    state: institution?.state || null,
    tpUnitName: institution?.tp_unit_name || 'Teaching Practice Coordination Unit',
  };

  // Cache the branding
  brandingCache.set(cacheKey, {
    branding,
    timestamp: Date.now(),
  });

  return branding;
}

/**
 * Get frontend URL for reset links
 * @param {number} institutionId
 * @returns {Promise<string>}
 */
async function getFrontendUrl(institutionId) {
  const [rows] = await pool.query(
    `SELECT subdomain FROM institutions WHERE id = ?`,
    [institutionId]
  );

  const subdomain = rows[0]?.subdomain;
  
  // If institution has a subdomain, use subdomain-based URL
  if (subdomain) {
    if (process.env.NODE_ENV === 'production') {
      // Production: https://subdomain.digitaltp.com (or custom domain from env)
      const baseDomain = process.env.PRODUCTION_DOMAIN || 'digitaltp.com';
      return `https://${subdomain}.${baseDomain}`;
    } else {
      // Development: http://subdomain.localhost:5173
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const urlMatch = baseUrl.match(/:(\d+)$/);
      const port = urlMatch ? urlMatch[1] : '5173';
      return `http://${subdomain}.localhost:${port}`;
    }
  }

  // Fallback to base URL (no subdomain)
  return process.env.FRONTEND_URL || 'https://digitaltp.com';
}

/**
 * Get frontend URL for super admin / system emails (no institution context)
 * @returns {string}
 */
function getSuperAdminFrontendUrl() {
  if (process.env.NODE_ENV === 'production') {
    // Production: https://admin.digitaltp.com or base domain
    const baseDomain = process.env.PRODUCTION_DOMAIN || 'digitaltp.com';
    return `https://admin.${baseDomain}`;
  } else {
    // Development: http://localhost:5173 (no subdomain for super admin)
    return process.env.FRONTEND_URL || 'http://localhost:5173';
  }
}

/**
 * Generate lighter shade of a color
 * @param {string} hexColor
 * @param {number} factor (0-1, higher = lighter)
 * @returns {string}
 */
function getLighterShade(hexColor, factor = 0.15) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  if (!result) return '#f5f5f5';

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  const mix = (c) => Math.round(c + (255 - c) * factor);

  return `#${[mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Generate darker shade of a color
 * @param {string} hexColor
 * @param {number} factor (0-1, higher = darker)
 * @returns {string}
 */
function getDarkerShade(hexColor, factor = 0.15) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  if (!result) return '#333333';

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  const mix = (c) => Math.round(c * (1 - factor));

  return `#${[mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Generate branded email HTML with modern fintech/SaaS styling
 * @param {Object} branding - Institution branding data
 * @param {Object} content - Email content
 * @returns {{ html: string, text: string }}
 */
function generateEmailHtml(branding, content) {
  const {
    title,
    greeting,
    message,
    ctaText,
    ctaUrl,
    supportNote,
    additionalContent,
  } = content;

  const primaryColor = branding.primaryColor || '#1a5f2a';
  const secondaryColor = branding.secondaryColor || '#0d3d1a';
  const gradientEnd = getDarkerShade(primaryColor, 0.25);
  const accentLight = getLighterShade(primaryColor, 0.92);
  const buttonHover = getDarkerShade(primaryColor, 0.1);
  const year = new Date().getFullYear();

  // Build HTML email with modern card + gradient accent style
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse:collapse;border-spacing:0;margin:0;}
    div, td {padding:0;}
    div {margin:0 !important;}
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body { margin: 0; padding: 0; width: 100%; background-color: #f0f2f5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    table { border-collapse: collapse; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
    a { color: ${primaryColor}; text-decoration: none; }
    .email-container { max-width: 560px; margin: 0 auto; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding-left: 24px !important; padding-right: 24px !important; }
      .header-padding { padding: 18px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f2f5;">
  
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${title} - ${branding.name}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f0f2f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        
        <!-- Main Card Container -->
        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);">
          
          <!-- Gradient Header -->
          <tr>
            <td class="header-padding" style="background: linear-gradient(135deg, ${primaryColor} 0%, ${gradientEnd} 100%); padding: 26px 38px; text-align: center;">
              <!-- Logo/Brand Circle -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <h1 style="margin: 0 0 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">
                      ${branding.name}
                    </h1>
                    <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: rgba(255, 255, 255, 0.8); letter-spacing: 0.5px; text-transform: uppercase;">
                      Teaching Practice Portal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Title Section with Accent -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height: 4px; background: linear-gradient(90deg, ${primaryColor} 0%, ${getLighterShade(primaryColor, 0.4)} 50%, ${primaryColor} 100%);"></td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td class="mobile-padding" style="padding: 10px 48px 0;">
                    <h2 style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; font-weight: 600; color: #1a1a2e; text-align: center; letter-spacing: -0.2px;">
                      ${title}
                    </h2>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td class="mobile-padding" style="padding: 24px 48px 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; color: #1a1a2e; line-height: 1.6; font-weight: 500;">
                ${greeting}
              </p>
              
              <!-- Message -->
              <div style="margin: 0 0 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; color: #4a4a68; line-height: 1.75;">
                ${message}
              </div>
              
              ${additionalContent ? `
              <div style="margin: 0 0 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #4a4a68; line-height: 1.75;">
                ${additionalContent}
              </div>
              ` : ''}
              
              <!-- CTA Button -->
              ${ctaText && ctaUrl ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${primaryColor}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">${ctaText}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, ${primaryColor} 0%, ${buttonHover} 100%); color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08); letter-spacing: 0.2px;">
                      ${ctaText}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <!-- Support Note Card -->
              ${supportNote ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color: ${accentLight}; border-radius: 12px; padding: 20px 24px; border-left: 4px solid ${primaryColor};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="width: 24px; vertical-align: top; padding-right: 12px;">
                          <div style="width: 20px; height: 20px; background-color: ${primaryColor}; border-radius: 50%; text-align: center; line-height: 20px;">
                            <span style="color: #ffffff; font-size: 12px; font-weight: 700;">i</span>
                          </div>
                        </td>
                        <td>
                          <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #4a4a68; line-height: 1.6;">
                            ${supportNote}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, #e8e8f0 20%, #e8e8f0 80%, transparent 100%);"></div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="padding: 10px 48px 14px;">
              <!-- Contact Info -->
              ${branding.email || branding.phone ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 4px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #6b6b80;">
                      ${branding.email ? `<a href="mailto:${branding.email}" style="color: ${primaryColor}; font-weight: 500;">${branding.email}</a>` : ''}
                      ${branding.email && branding.phone ? `<span style="color: #d0d0d8; margin: 0 12px;">•</span>` : ''}
                      ${branding.phone ? `<a href="tel:${branding.phone}" style="color: ${primaryColor}; font-weight: 500;">${branding.phone}</a>` : ''}
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <!-- Copyright -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9090a0;">
                      © ${year} ${branding.name}. All rights reserved.
                    </p>
                    <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: #b0b0c0;">
                      Powered by <a href="https://sitsng.com" target="_blank" style="color: ${primaryColor}; font-weight: 500;">SI Solutions</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
        <!-- Bottom Branding Strip -->
        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="margin-top: 24px;">
          <tr>
            <td align="center">
              <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: #9090a0;">
                This email was sent by ${branding.name}
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Build plain text version
  const text = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${branding.name.toUpperCase()}
Teaching Practice Portal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${title}

${greeting}

${message.replace(/<br\s*\/?>/gi, '\n').replace(/<strong>/gi, '').replace(/<\/strong>/gi, '').replace(/<[^>]*>/g, '')}

${additionalContent ? additionalContent.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '') + '\n' : ''}
${ctaText && ctaUrl ? `\n▶ ${ctaText}\n  ${ctaUrl}\n` : ''}
${supportNote ? `\n💡 Note: ${supportNote.replace(/<[^>]*>/g, '')}\n` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

© ${year} ${branding.name}
${branding.email ? `📧 ${branding.email}` : ''}
${branding.phone ? `📞 ${branding.phone}` : ''}

Powered by SI Solutions • https://sitsng.com
`.trim();

  return { html, text };
}

/**
 * Email templates configuration
 */
const EMAIL_TEMPLATES = {
  passwordReset: {
    subject: (data) => `Password Reset Request - ${data.institutionName}`,
    content: (data) => ({
      title: 'Password Reset Request',
      greeting: `Hello ${data.name},`,
      message: `You requested to reset your password for your ${data.institutionName} account.
        <br><br>
        Click the button below to create a new password. This link will expire in <strong>30 minutes</strong>.`,
      ctaText: 'Reset Password',
      ctaUrl: data.resetUrl,
      supportNote: `If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.`,
    }),
  },

  passwordResetSuccess: {
    subject: (data) => `Password Reset Successful - ${data.institutionName}`,
    content: (data) => ({
      title: 'Password Reset Successful',
      greeting: `Hello ${data.name},`,
      message: `Your password has been successfully reset for your ${data.institutionName} account.
        <br><br>
        You can now log in with your new password.`,
      ctaText: 'Log In Now',
      ctaUrl: data.loginUrl,
      supportNote: `If you didn't make this change, please contact your administrator immediately as your account may be compromised.`,
    }),
  },

  welcome: {
    subject: (data) => `Welcome to ${data.institutionName}!`,
    content: (data) => ({
      title: 'Welcome!',
      greeting: `Hello ${data.name},`,
      message: `Your account has been created successfully at ${data.institutionName}.
        <br><br>
        You can now log in to access the Teaching Practice Management System.`,
      ctaText: 'Log In to Your Account',
      ctaUrl: data.loginUrl,
      supportNote: `If you need any assistance, please contact your institution's administrator.`,
    }),
  },

  accountCreated: {
    subject: (data) => `Your Account Has Been Created - ${data.institutionName}`,
    content: (data) => ({
      title: 'Account Created',
      greeting: `Hello ${data.name},`,
      message: `An administrator has created an account for you at ${data.institutionName}.
        <br><br>
        <strong>Role:</strong> ${data.role}<br>
        <strong>Email:</strong> ${data.email}
        <br><br>
        A temporary password has been set for your account. For security reasons, you will be required to change it on first login.`,
      ctaText: 'Log In to Your Account',
      ctaUrl: data.loginUrl,
      supportNote: `If you didn't expect this email or have any questions, please contact your institution's administrator.`,
    }),
  },

 userCredentials: {
  subject: (data) =>
    `Welcome to ${data.institutionName} – Your Account Details`,

    content: (data) => ({
      title: 'Your Account Has Been Successfully Created',

      greeting: `Hello ${data.name},`,

      message: `
        We are pleased to inform you that your account has been created on ${data.institutionName !== 'DigitalTP' ? `<strong>DigitalTP for ${data.institutionName}</strong>` : 'DigitalTP'}.
        <br><br>

        You may now access the system using the login details below:
        <br><br>

        <strong>Login Credentials</strong>

        <div style="
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 16px;
          margin: 12px 0;
        ">
          <strong>Email:</strong> ${data.email}<br>
          <strong>Temporary Password:</strong>
          <code style="
            background: #e9ecef;
            padding: 4px 10px;
            border-radius: 4px;
            font-family: monospace;
            display: inline-block;
            margin-top: 4px;
            font-weight: 800;
            font-size: 18px;
            letter-spacing: 1px;
          ">
            ${data.password}
          </code>
        </div>

        <strong>Assigned Role:</strong> ${data.role}
        <br><br>

        <span style="color: #dc3545; font-weight: 600;">
          ⚠️ For security reasons, please change your password immediately after your first login.
        </span>
      `,

      ctaText: 'Log In to Your Account',

      ctaUrl: data.loginUrl,

      supportNote: `
        This email contains sensitive information. Please keep it confidential.
        If you did not expect this account or believe it was created in error,
        contact your system administrator immediately.
      `,
    }),
  },

  passwordResetByAdmin: {
    subject: (data) =>
      `Your Password Has Been Reset - ${data.institutionName || 'DigitalTP'}`,

    content: (data) => ({
      title: 'Your Password Has Been Reset',

      greeting: `Hello ${data.name},`,

      message: `
        Your password has been reset by a system administrator${data.resetBy ? ` (${data.resetBy})` : ''}.
        <br><br>

        Please use the new credentials below to log in:
        <br><br>

        <strong>New Login Credentials</strong>

        <div style="
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 16px;
          margin: 12px 0;
        ">
          <strong>Email:</strong> ${data.email}<br>
          <strong>New Password:</strong>
          <code style="
            background: #e9ecef;
            padding: 4px 10px;
            border-radius: 4px;
            font-family: monospace;
            display: inline-block;
            margin-top: 4px;
            font-weight: 800;
            font-size: 18px;
            letter-spacing: 1px;
          ">
            ${data.password}
          </code>
        </div>

        <span style="color: #dc3545; font-weight: 600;">
          ⚠️ For security reasons, please change your password immediately after logging in.
        </span>
        <br><br>

        If you did not request this password reset, please contact your administrator immediately.
      `,

      ctaText: 'Log In Now',

      ctaUrl: data.loginUrl,

      supportNote: `
        This email contains sensitive information. Please keep it confidential.
        If you did not request this password reset or have any concerns,
        contact your system administrator immediately.
      `,
    }),
  },

  postingNotification: {
    subject: (data) => `Teaching Practice Posting - ${data.institutionName}`,
    content: (data) => ({
      title: 'You Have Been Posted!',
      greeting: `Hello ${data.name},`,
      message: `You have been posted for Teaching Practice at <strong>${data.schoolName}</strong>.
        <br><br>
        <strong>Session:</strong> ${data.sessionName}<br>
        <strong>Start Date:</strong> ${data.startDate}<br>
        <strong>Duration:</strong> ${data.duration}`,
      ctaText: 'View Your Posting',
      ctaUrl: data.portalUrl,
      supportNote: `Please log in to your student portal to view full details and download your posting letter.`,
    }),
  },

  monitorAssignment: {
    subject: (data) => `Field Monitoring Assignment - ${data.institutionName}`,
    content: (data) => ({
      title: 'New Monitoring Assignment',
      greeting: `Hello ${data.name},`,
      message: `You have been assigned to monitor ${data.schoolCount > 1 ? `<strong>${data.schoolCount} schools</strong>` : `<strong>${data.schoolName}</strong>`} for the ${data.sessionName} academic session.
        <br><br>
        <strong>Monitoring Type:</strong> ${data.monitoringType === 'supervision_evaluation' ? 'Supervision Evaluation' : 'School Evaluation'}<br>
        <strong>Session:</strong> ${data.sessionName}<br>
        ${data.schoolCount === 1 ? `<strong>School:</strong> ${data.schoolName}<br>` : ''}
        ${data.schoolList ? `<strong>Assigned Schools:</strong><br>${data.schoolList}` : ''}`,
      ctaText: 'View My Assignments',
      ctaUrl: data.dashboardUrl,
      supportNote: `Please log in to the system to view full details of your assignments and submit monitoring reports.`,
    }),
  },

  paymentConfirmation: {
    subject: (data) => `Payment Confirmed - ${data.institutionName}`,
    content: (data) => ({
      title: 'Payment Confirmed',
      greeting: `Hello ${data.name},`,
      message: `Your payment of <strong>₦${data.amount.toLocaleString()}</strong> has been confirmed.
        <br><br>
        <strong>Reference:</strong> ${data.reference}<br>
        <strong>Date:</strong> ${data.date}<br>
        <strong>Purpose:</strong> ${data.purpose}`,
      ctaText: 'View Payment Details',
      ctaUrl: data.portalUrl,
      supportNote: `Keep this email as your payment receipt.`,
    }),
  },

  testEmail: {
    subject: (data) => `Test Email - ${data.institutionName} SMTP Configuration`,
    content: (data) => ({
      title: 'SMTP Test Successful',
      greeting: `Hello,`,
      message: `This is a test email to verify that your SMTP configuration is working correctly.
        <br><br>
        <strong>SMTP Host:</strong> ${data.smtpHost}<br>
        <strong>Port:</strong> ${data.smtpPort}<br>
        <strong>Secure:</strong> ${data.smtpSecure ? 'Yes (SSL/TLS)' : 'No (STARTTLS)'}
        <br><br>
        If you received this email, your email configuration is working properly.`,
      ctaText: null,
      ctaUrl: null,
      supportNote: `This is an automated test email. No action is required.`,
    }),
  },
};

/**
 * Log email sending (audit log without sensitive data)
 * @param {Object} logData
 */
async function logEmailSend(logData) {
  try {
    await pool.query(
      `INSERT INTO email_logs (institution_id, email_type, recipient_email_hash, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        logData.institutionId,
        logData.emailType,
        crypto.createHash('sha256').update(logData.recipient).digest('hex'),
        logData.status,
        logData.error || null,
      ]
    );
  } catch (error) {
    // Don't fail the email send if logging fails
    console.error('[EMAIL] Failed to log email send:', error.message);
  }
}

/**
 * Send email using institution SMTP
 * @param {number} institutionId
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.template - Template name
 * @param {Object} options.data - Template data
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendEmail(institutionId, { to, template, data }) {
  // Validate template exists
  const templateConfig = EMAIL_TEMPLATES[template];
  if (!templateConfig) {
    throw new Error(`Email template '${template}' not found`);
  }

  // Get transporter and branding
  // Use system transporter if no institutionId (superadmin/system emails)
  let transporterResult;
  let branding;

  if (!institutionId) {
    // System email - use env SMTP credentials
    transporterResult = getSystemTransporter();
    branding = {
      name: 'DigitalTP',
      primary_color: '#1a5f2a',
      secondary_color: '#8b4513',
      logo_url: null,
    };
  } else {
    // Institution email - use institution SMTP
    transporterResult = await getTransporter(institutionId);
    branding = await getInstitutionBranding(institutionId);
  }

  if (!transporterResult) {
    const error = institutionId 
      ? 'SMTP not configured or invalid configuration for institution'
      : 'System SMTP not configured in environment variables';
    await logEmailSend({
      institutionId: institutionId || null,
      emailType: template,
      recipient: to,
      status: 'failed',
      error,
    });
    return { success: false, error };
  }

  const { transporter, config } = transporterResult;

  // Add institution name to data
  const enrichedData = {
    ...data,
    institutionName: branding.name,
  };

  // Generate email content
  const subject = templateConfig.subject(enrichedData);
  const content = templateConfig.content(enrichedData);
  const { html, text } = generateEmailHtml(branding, content);

  try {
    const result = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
      text,
    });

    // Log success
    await logEmailSend({
      institutionId: institutionId || null,
      emailType: template,
      recipient: to,
      status: 'sent',
    });

    console.log(`[EMAIL] Sent ${template} email to ${to}${institutionId ? ` for institution ${institutionId}` : ' (system)'}, messageId: ${result.messageId}`);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    // Log failure
    await logEmailSend({
      institutionId: institutionId || null,
      emailType: template,
      recipient: to,
      status: 'failed',
      error: error.message,
    });

    console.error(`[EMAIL] Failed to send ${template} email to ${to}:`, error.message);

    return { success: false, error: error.message };
  }
}

/**
 * Send custom email (for advanced use cases)
 * @param {number} institutionId
 * @param {Object} options
 */
async function sendCustomEmail(institutionId, { to, subject, content }) {
  const transporterResult = await getTransporter(institutionId);
  if (!transporterResult) {
    throw new Error('SMTP not configured or invalid configuration');
  }

  const { transporter, config } = transporterResult;
  const branding = await getInstitutionBranding(institutionId);

  const { html, text } = generateEmailHtml(branding, content);

  const result = await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject,
    html,
    text,
  });

  await logEmailSend({
    institutionId,
    emailType: 'custom',
    recipient: to,
    status: 'sent',
  });

  return { success: true, messageId: result.messageId };
}

/**
 * Test SMTP connection with enhanced validation
 * @param {number} institutionId
 * @param {string} testRecipient - Optional test recipient email
 * @returns {Promise<{ success: boolean, message: string, warnings?: string[] }>}
 */
async function testSmtpConnection(institutionId, testRecipient = null) {
  const warnings = [];

  // Get SMTP config
  const config = await getSmtpConfig(institutionId);
  if (!config) {
    return {
      success: false,
      message: 'SMTP not configured. Please configure SMTP settings first.',
    };
  }

  // Validate port/SSL configuration
  const portValidation = validateSmtpPortConfig(config.port, config.secure);
  if (!portValidation.valid) {
    return {
      success: false,
      message: portValidation.warning,
    };
  }
  if (portValidation.warning) {
    warnings.push(portValidation.warning);
  }

  // Validate sender domain matches SMTP user domain (if possible)
  const smtpDomain = config.user.split('@')[1];
  const fromDomain = config.fromEmail.split('@')[1];
  if (smtpDomain && fromDomain && smtpDomain !== fromDomain) {
    warnings.push(`Sender email domain (${fromDomain}) differs from SMTP user domain (${smtpDomain}). This may cause deliverability issues.`);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
    });

    // Verify connection
    await transporter.verify();

    // Clear cache to use new settings
    invalidateTransporterCache(institutionId);

    // Send test email if recipient provided
    if (testRecipient) {
      const branding = await getInstitutionBranding(institutionId);

      await sendEmail(institutionId, {
        to: testRecipient,
        template: 'testEmail',
        data: {
          smtpHost: config.host,
          smtpPort: config.port,
          smtpSecure: config.secure,
        },
      });

      return {
        success: true,
        message: `SMTP connection verified and test email sent to ${testRecipient}.`,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    return {
      success: true,
      message: 'SMTP connection verified successfully.',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    // Provide actionable error messages
    let message = error.message;

    if (error.code === 'ECONNREFUSED') {
      message = `Connection refused. Check that SMTP host (${config.host}) and port (${config.port}) are correct.`;
    } else if (error.code === 'ETIMEDOUT') {
      message = `Connection timed out. The SMTP server may be unreachable or blocked by a firewall.`;
    } else if (error.code === 'EAUTH' || error.message.includes('auth')) {
      message = `Authentication failed. Check your SMTP username and password.`;
    } else if (error.code === 'ESOCKET' || error.message.includes('SSL') || error.message.includes('TLS')) {
      message = `SSL/TLS error. Check that the secure setting matches your SMTP server configuration.`;
    }

    return {
      success: false,
      message,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Check if SMTP is configured for an institution
 * @param {number} institutionId
 * @returns {Promise<boolean>}
 */
async function isSmtpConfigured(institutionId) {
  const config = await getSmtpConfig(institutionId);
  return config !== null;
}

module.exports = {
  // Core functions
  sendEmail,
  sendCustomEmail,
  testSmtpConnection,
  isSmtpConfigured,
  
  // System email (superadmin/no institution)
  getSystemTransporter,
  getSystemSmtpConfig,
  
  // Cache invalidation
  invalidateTransporterCache,
  invalidateBrandingCache,
  
  // Utilities
  getInstitutionBranding,
  getFrontendUrl,
  getSuperAdminFrontendUrl,
  validateSmtpPortConfig,
  
  // Template names for reference
  TEMPLATES: Object.keys(EMAIL_TEMPLATES),
};
