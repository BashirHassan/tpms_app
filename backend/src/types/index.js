/**
 * Type Definitions for DigitalTP Multi-Tenant Architecture
 * 
 * These JSDoc types provide IDE intellisense and help enforce contracts
 * across the codebase. They serve as documentation and lightweight type checking.
 */

/**
 * @typedef {Object} User
 * @property {number} id - User ID
 * @property {string} name - Full name
 * @property {string} email - Email address
 * @property {string} role - User role (super_admin, head_of_teaching_practice, etc.)
 * @property {number|null} institution_id - Home institution ID (null for platform super_admin)
 * @property {string} status - Account status (active, inactive)
 * @property {'staff'|'student'} authType - Authentication type
 * @property {string} [phone] - Phone number
 * @property {Date} [last_login] - Last login timestamp
 */

/**
 * @typedef {Object} Student
 * @property {number} id - Student ID
 * @property {number} institution_id - Institution ID
 * @property {string} registration_number - Registration/matric number
 * @property {string} full_name - Full name
 * @property {string} [email] - Email address
 * @property {string} [phone] - Phone number
 * @property {number} [program_id] - Program ID
 * @property {number} [session_id] - Academic session ID
 * @property {string} status - Account status
 * @property {string} payment_status - Payment status
 */

/**
 * @typedef {Object} Tenant
 * @property {number} id - Institution/tenant ID
 * @property {string} name - Institution name
 * @property {string} code - Institution code
 * @property {string} [subdomain] - Subdomain for multi-tenant access
 * @property {string} status - Status (active, inactive)
 * @property {string} [primary_color] - Primary brand color
 * @property {string} [secondary_color] - Secondary brand color
 * @property {string} [logo_url] - Logo URL
 */

/**
 * @typedef {'NOT_SELECTED'|'LOADING'|'SELECTED'|'ERROR'} TenantStatus
 */

/**
 * @typedef {'subdomain'|'header'|'user'|'none'} TenantSource
 * How the tenant was resolved
 */

/**
 * @typedef {Object} TenantContext
 * @property {number|null} tenantId - Active tenant ID
 * @property {string|null} tenantCode - Tenant code/subdomain
 * @property {string|null} tenantName - Tenant display name
 * @property {Tenant|null} tenant - Full tenant object
 * @property {number|null} homeTenantId - User's home tenant ID
 * @property {boolean} isSwitched - Whether viewing different tenant
 * @property {boolean} isGlobalContext - Super admin without tenant scope
 * @property {TenantSource} source - How tenant was resolved
 */

/**
 * @typedef {Object} AuthenticatedRequest
 * @property {User} user - Authenticated user
 * @property {'staff'|'student'} authType - Auth type
 * @property {TenantContext} tenantContext - Tenant context
 * @property {Tenant|null} institution - Legacy: Current institution
 * @property {Object} repos - Attached repositories
 * @property {number|null} scopedTenantId - Tenant ID for scoped operations
 */

/**
 * @typedef {Object} ApiErrorResponse
 * @property {false} success - Always false for errors
 * @property {string} message - Human-readable error message
 * @property {string} errorCode - Machine-readable error code
 * @property {Object} [details] - Additional error details
 */

/**
 * @typedef {Object} ApiSuccessResponse
 * @property {true} success - Always true for success
 * @property {*} data - Response data
 * @property {string} [message] - Optional success message
 */

/**
 * @typedef {Object} PaginatedResponse
 * @property {true} success - Always true
 * @property {Array} data - Array of items
 * @property {Object} pagination - Pagination info
 * @property {number} pagination.total - Total count
 * @property {number|null} pagination.limit - Page size
 * @property {number} pagination.offset - Current offset
 * @property {boolean} pagination.hasMore - Whether more items exist
 */

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * @typedef {'NO_TOKEN'|'INVALID_TOKEN'|'TOKEN_EXPIRED'|'USER_NOT_FOUND'|'ACCOUNT_INACTIVE'} AuthErrorCode
 */

/**
 * @typedef {'TENANT_REQUIRED'|'TENANT_NOT_FOUND'|'TENANT_ACCESS_DENIED'|'TENANT_MISMATCH'|'HOME_TENANT_INVALID'} TenantErrorCode
 */

/**
 * @typedef {'SUPER_ADMIN_REQUIRED'|'INSUFFICIENT_PERMISSIONS'|'SWITCH_NOT_ALLOWED'} AuthorizationErrorCode
 */

/**
 * @typedef {AuthErrorCode|TenantErrorCode|AuthorizationErrorCode} ErrorCode
 */

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

/**
 * @typedef {'super_admin'|'head_of_teaching_practice'|'supervisor'|'field_monitor'|'student'} UserRole
 */

/**
 * Role hierarchy from lowest to highest permissions
 * @type {UserRole[]}
 */
const ROLE_HIERARCHY = [
  'student',
  'field_monitor',
  'supervisor',
  'head_of_teaching_practice',
  'super_admin',
];

module.exports = {
  ROLE_HIERARCHY,
};
