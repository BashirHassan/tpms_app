/**
 * Utility Functions
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format date
 * @param {string|Date} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @param {string} fallback - Value to return if date is null/undefined
 */
export function formatDate(date, fallback = '') {
  if (!date) return fallback;

  const d = new Date(date);
  if (isNaN(d)) return fallback;

  const day = d.getDate();
  const suffix =
    day > 3 && day < 21
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][day % 10] || 'th';

  const formatted = new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    year: 'numeric',
  }).format(d);

  return `${day}${suffix} ${formatted}`;
}


/**
 * Format date with time
 * @param {string|Date} date - Date to format
 * @param {string} fallback - Value to return if date is null/undefined (defaults to 'N/A')
 */
export function formatDateTime(date, fallback = 'N/A') {
  if (!date) return fallback;

  const d = new Date(date);
  return d.toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format currency
 */
export function formatCurrency(amount, currency = 'NGN') {
  if (amount === null || amount === undefined) return '';

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Truncate text
 */
export function truncate(text, length = 50) {
  if (!text || text.length <= length) return text;
  return text.slice(0, length) + '...';
}

/**
 * Generate initials from name
 */
export function getInitials(name) {
  if (!name) return '';

  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Role display names
 */
export const roleNames = {
  super_admin: 'Super Admin',
  head_of_teaching_practice: 'Head of Teaching Practice',
  supervisor: 'Supervisor',
  field_monitor: 'Field Monitor',
  student: 'Student',
};

/**
 * Get role display name
 */
export function getRoleName(role) {
  return roleNames[role] || role;
}

/**
 * Status badge colors
 */
export const statusColors = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  deleted: 'bg-red-100 text-red-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
};

/**
 * Get status color classes
 */
export function getStatusColor(status) {
  return statusColors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Convert a number to ordinal (1st, 2nd, 3rd, etc.)
 */
export function getOrdinal(n) {
  if (n === null || n === undefined) return '';
  
  const num = parseInt(n, 10);
  if (isNaN(num)) return n;
  
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Format number with locale-aware thousand separators
 */
export function formatNumber(value, options = {}) {
  if (value === null || value === undefined) return '-';
  
  const num = Number(value);
  if (isNaN(num)) return '-';
  
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    ...options,
  }).format(num);
}

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format score/percentage with consistent decimal places
 */
export function formatScore(value, maxDecimals = 2) {
  if (value === null || value === undefined) return '-';
  
  const num = Number(value);
  if (isNaN(num)) return '-';
  
  return num.toFixed(maxDecimals);
}

/**
 * Format coordinate (latitude/longitude) with appropriate precision
 */
export function formatCoordinate(value, decimals = 6) {
  if (value === null || value === undefined) return '';
  
  const num = Number(value);
  if (isNaN(num)) return '';
  
  return num.toFixed(decimals);
}

/**
 * Format distance - converts meters to km if >= 1000m
 * @param {number} meters - Distance in meters
 * @param {object} options - Formatting options
 * @param {number} options.decimals - Decimal places for km (default: 1)
 * @param {boolean} options.includeUnit - Whether to include unit suffix (default: true)
 * @returns {string} Formatted distance string
 */
export function formatDistance(meters, options = {}) {
  const { decimals = 1, includeUnit = true } = options;
  
  if (meters === null || meters === undefined) return includeUnit ? '-' : '';
  
  const num = Number(meters);
  if (isNaN(num)) return includeUnit ? '-' : '';
  
  if (num >= 1000) {
    const km = num / 1000;
    return includeUnit ? `${km.toFixed(decimals)}km` : km.toFixed(decimals);
  }
  
  return includeUnit ? `${Math.round(num)}m` : Math.round(num).toString();
}


const TITLES = ['dr', 'dr.', 'prof', 'prof.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'];

export function formatGreetingName(fullName = '') {
  if (!fullName) return '';

  const parts = fullName.trim().split(/\s+/);
  if (!parts.length) return '';

  const firstPart = parts[0].toLowerCase();

  // Has title
  if (TITLES.includes(firstPart) && parts.length > 1) {
    const normalizedTitle = parts[0].replace(/\.$/, '.');
    return `${normalizedTitle} ${parts[1]}`;
  }

  // No title → first name only
  return parts[0];
}

/**
 * Generate Google Maps URL to view a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Google Maps URL
 */
export function getMapViewUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Generate Google Maps URL for directions from current location to destination
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @returns {string} Google Maps directions URL
 */
export function getDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
