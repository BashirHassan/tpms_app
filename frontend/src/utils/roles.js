/**
 * Role Constants and Utilities
 * 
 * Centralized role definitions for consistent access control across the frontend.
 * Must match backend role definitions in backend/src/middleware/rbac.js
 */

// Role names
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HEAD_OF_TEACHING_PRACTICE: 'head_of_teaching_practice',
  SUPERVISOR: 'supervisor',
  FIELD_MONITOR: 'field_monitor',
  STUDENT: 'student',
};

// Role hierarchy - higher value = more access
export const ROLE_HIERARCHY = {
  [ROLES.STUDENT]: 10,
  [ROLES.FIELD_MONITOR]: 20,
  [ROLES.SUPERVISOR]: 30,
  [ROLES.HEAD_OF_TEACHING_PRACTICE]: 40,
  [ROLES.SUPER_ADMIN]: 99,
};

// Role display names
export const ROLE_DISPLAY_NAMES = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.HEAD_OF_TEACHING_PRACTICE]: 'Head of Teaching Practice',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.FIELD_MONITOR]: 'Field Monitor',
  [ROLES.STUDENT]: 'Student',
};

// Pre-defined role groups for common access patterns
export const ROLE_GROUPS = {
  // All staff (excludes students)
  STAFF: [
    ROLES.SUPER_ADMIN,
    ROLES.HEAD_OF_TEACHING_PRACTICE,
    ROLES.SUPERVISOR,
    ROLES.FIELD_MONITOR,
  ],
  
  // Admin-level (can manage settings, users, etc.)
  ADMIN: [
    ROLES.SUPER_ADMIN,
    ROLES.HEAD_OF_TEACHING_PRACTICE,
  ],
  
  // Supervisors and above
  SUPERVISOR_PLUS: [
    ROLES.SUPER_ADMIN,
    ROLES.HEAD_OF_TEACHING_PRACTICE,
    ROLES.SUPERVISOR,
  ],
  
  // Monitors and above (can do field work)
  MONITORS: [
    ROLES.SUPER_ADMIN,
    ROLES.HEAD_OF_TEACHING_PRACTICE,
    ROLES.SUPERVISOR,
    ROLES.FIELD_MONITOR,
  ],
  
  // Super admin only
  SUPER_ADMIN_ONLY: [ROLES.SUPER_ADMIN],
  
  // Students only
  STUDENTS_ONLY: [ROLES.STUDENT],
};

/**
 * Check if user has minimum required role level
 * @param {string} userRole - User's current role
 * @param {string} minRole - Minimum role required
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, minRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Check if user role is in allowed list
 * @param {string} userRole - User's current role
 * @param {string[]} allowedRoles - List of allowed roles
 * @returns {boolean}
 */
export function hasRole(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}

/**
 * Check if user is staff (not student)
 * @param {string} role - User's role
 * @returns {boolean}
 */
export function isStaff(role) {
  return role !== ROLES.STUDENT;
}

/**
 * Check if user is admin level (head_of_teaching_practice or super_admin)
 * @param {string} role - User's role
 * @returns {boolean}
 */
export function isAdmin(role) {
  return ROLE_GROUPS.ADMIN.includes(role);
}

/**
 * Check if user is super admin
 * @param {string} role - User's role
 * @returns {boolean}
 */
export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Get role display name
 * @param {string} role - Role key
 * @returns {string}
 */
export function getRoleDisplayName(role) {
  return ROLE_DISPLAY_NAMES[role] || role;
}
