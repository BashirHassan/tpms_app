/**
 * Reusable Posting Card Component (Mobile-First)
 * Displays a posting with school metadata, students table, and merged schools
 * 
 * Structure:
 * [ PRIMARY SCHOOL CARD ]
 *   ├─ School metadata (route, visit, group)
 *   ├─ Students table (Primary)
 *   ├─ ───────────────
 *   ├─ Merged Schools Section
 *       ├─ [ Secondary School A ] (same component, secondary variant)
 *       │     └─ Students table
 *       └─ [ Secondary School B ]
 *             └─ Students table
 */

import PropTypes from 'prop-types';
import { Badge } from '../ui/Badge';
import { getOrdinal, getMapViewUrl, getDirectionsUrl, formatNumber } from '../../utils/helpers';
import {
  IconSchool,
  IconUsers,
  IconMapPin,
  IconRoute,
  IconPhone,
  IconMap2,
  IconExternalLink,
  IconNavigation,
} from '@tabler/icons-react';

// ============================================
// Student Table Component (Mobile-First)
// ============================================
function StudentsTable({ students, className = '' }) {
  if (!students || students.length === 0) {
    return (
      <p className="text-xs sm:text-sm text-gray-500 italic">
        No students assigned to this group
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <table className={`w-full text-xs sm:text-sm border-collapse min-w-[400px] ${className}`}>
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-1.5 sm:px-2 py-0.5 text-left font-semibold w-8 sm:w-12">
              S/N
            </th>
            <th className="border border-gray-300 px-1.5 sm:px-2 py-0.5 text-left font-semibold">
              Reg. Number
            </th>
            <th className="border border-gray-300 px-1.5 sm:px-2 py-0.5 text-left font-semibold">
              Student Name
            </th>
            <th className="border border-gray-300 px-1.5 sm:px-2 py-0.5 text-left font-semibold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, idx) => (
            <tr
              key={student.student_id}
              className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              <td className="border border-gray-300 px-1.5 sm:px-2 py-0.5 text-center">
                {idx + 1}
              </td>
              <td className="border border-gray-300 px-1.5 sm:px-2 py-0.5 whitespace-nowrap">
                {student.registration_number}
              </td>
              <td className="border border-gray-300 px-1.5 sm:px-2 py-0.5 whitespace-nowrap">
                {student.full_name}
              </td>
              <td className="border border-gray-300 px-1.5 sm:px-2 py-0.5">
                
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

StudentsTable.propTypes = {
  students: PropTypes.arrayOf(
    PropTypes.shape({
      student_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      registration_number: PropTypes.string,
      full_name: PropTypes.string,
      program_name: PropTypes.string,
    })
  ),
  className: PropTypes.string,
};

// ============================================
// School Card Component (Unified for Primary & Secondary)
// ============================================
const postingPropType = PropTypes.shape({
  posting_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  school_name: PropTypes.string,
  school_address: PropTypes.string,
  school_state: PropTypes.string,
  school_lga: PropTypes.string,
  school_ward: PropTypes.string,
  school_latitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  school_longitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  school_distance_km: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  principal_name: PropTypes.string,
  principal_phone: PropTypes.string,
  location_category: PropTypes.oneOf(['inside', 'outside']),
  group_number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  visit_number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  route_name: PropTypes.string,
  is_primary: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
  merged_with_posting_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  student_count: PropTypes.number,
  students: PropTypes.array,
  merged_groups: PropTypes.array, // Nested merged postings
  orphan: PropTypes.bool, // Flag for orphaned merged postings
});

function SchoolCard({ 
  posting, 
  variant = 'primary', 
  showVisit = true,
  showMergedBadge = false,
  mergedCount = 0,
  children,
  className = '' 
}) {
  const isPrimary = variant === 'primary';
  
  // Styling based on variant (mobile-first)
  const containerStyles = isPrimary
    ? 'border border-gray-300 rounded-lg'
    : 'border-2 border-purple-300 rounded-lg bg-white';
  
  const headerStyles = isPrimary
    ? 'bg-gray-100 border-b border-gray-200 px-2 sm:px-4 py-2'
    : 'bg-purple-50 border-b border-purple-200 px-2 sm:px-4 py-2';
  
  const iconStyles = isPrimary
    ? 'text-primary-600'
    : 'text-purple-600';
  
  const titleStyles = isPrimary
    ? 'font-bold text-gray-900 text-base'
    : 'font-bold text-gray-900 text-sm';
  
  const iconSize = isPrimary ? 'w-5 h-5' : 'w-4 h-4';
  const addressTextSize = isPrimary ? 'text-sm' : 'text-xs';

  // Check if school has GPS coordinates
  const hasCoordinates = posting.school_latitude && posting.school_longitude;

  // Build full location string
  const locationParts = [
    posting.school_ward,
    posting.school_lga && `${posting.school_lga} LGA`,
    posting.school_state && `${posting.school_state} State`,
  ].filter(Boolean);
  const fullLocation = locationParts.join(', ');

  return (
    <div className={`posting-card overflow-hidden ${containerStyles} ${className}`}>
      {/* School Header */}
      <div className={headerStyles}>
        {/* School Name Row with Distance & Location Category */}
        <div className="flex flex-col sm:flex-row sm:items-start md:items-center gap-1 sm:justify-between">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <IconSchool className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <h4 className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight break-words">
              {posting.school_name} 
            </h4>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {posting.school_distance_km && (
              <>
                <span className="text-xs uppercase">{posting.location_category}</span> 
                <span className="text-xs">
                  ({formatNumber(posting.school_distance_km)} km)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Address & Location Details */}
        <div className="mt-1 space-y-0.5 sm:ml-0">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {posting.school_address && (
              <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconMapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                <span className="break-words">{posting.school_address}</span>
              </div>
            )}
            {/* Map Links - Only show if coordinates exist */}
            {hasCoordinates && (
              <div className="flex items-center md:justify-end gap-3 text-[10px] sm:text-xs print:hidden">
                <a
                  href={getMapViewUrl(posting.school_latitude, posting.school_longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
                  title="View school location on Google Maps"
                >
                  <IconExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>View on Map</span>
                </a>
                <a
                  href={getDirectionsUrl(posting.school_latitude, posting.school_longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                  title="Get directions to this school"
                >
                  <IconNavigation className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Get Directions</span>
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {fullLocation && (
              <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconMap2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                <span className="break-words">{fullLocation}</span>
              </div>
            )}
            {posting.principal_phone && (
              <div className="flex items-center md:justify-end gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconPhone className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-gray-300" />
                <span>
                  {posting.principal_name ? `${posting.principal_name}: ` : 'Principal: '}
                  <a href={`tel:${posting.principal_phone}`} className="text-primary-600 hover:underline print:text-black print:no-underline">
                    {posting.principal_phone}
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Meta Badges – Stack on mobile */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between gap-1 mt-1 pt-0.5 border-t border-gray-300">
          <div className="flex flex-wrap items-center font-semibold text-[11px] leading-tight text-gray-800 print:text-black gap-x-1 sm:gap-x-0">
            <span>
              Group {posting.group_number}
            </span>

            {showVisit && posting.visit_number && (
              <>
                <span className="mx-1 sm:mx-2 print:mx-1">|</span>
                <span>
                  {getOrdinal(posting.visit_number)} Visit
                </span>
              </>
            )}

            {posting.route_name && (
              <>
                <span className="mx-1 sm:mx-2 print:mx-1">|</span>
                <span className="break-words">
                  {posting.route_name}
                </span>
              </>
            )}
          </div>

          <div className="flex-shrink-0">
            {showMergedBadge && mergedCount > 0 && (
              <Badge variant="info" className="text-[10px] sm:text-xs">
                Merged ({mergedCount} schools)
              </Badge>
            )}
          </div>
        </div>
      </div>


      {/* Students Table */}
      <div className="p-3">
        <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
          <IconUsers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Students ({posting.student_count || posting.students?.length || 0})
        </div>
        <StudentsTable students={posting.students} />
      </div>

      {/* Children (for nested secondary postings) */}
      {children}
    </div>
  );
}

SchoolCard.propTypes = {
  posting: postingPropType.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary']),
  showVisit: PropTypes.bool,
  showMergedBadge: PropTypes.bool,
  mergedCount: PropTypes.number,
  children: PropTypes.node,
  className: PropTypes.string,
};

// ============================================
// Main Posting Card Component
// ============================================
function PostingCard({ 
  posting,
  showMergedBadge = true,
  showSupervisor = false,
  className = '' 
}) {
  // Support both new nested structure (merged_groups) and legacy prop-based structure
  const mergedGroups = posting.merged_groups || [];
  const isMergedGroup = mergedGroups.length > 0 || posting.is_merged;
  const totalSchools = 1 + mergedGroups.length;

  return (
    <div className={className}>
      {/* Supervisor Name when showing flat list */}
      {showSupervisor && posting.supervisor_name && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 mb-1 px-1">
          <IconUsers className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Supervisor: {posting.supervisor_name}</span>
        </div>
      )}
      <SchoolCard
        posting={posting}
        variant="primary"
        showVisit={true}
        showMergedBadge={showMergedBadge && isMergedGroup}
        mergedCount={totalSchools}
      >
        {/* Merged Schools Section - Nested inside primary card */}
        {mergedGroups.length > 0 && (
          <div className="px-2 sm:px-3 pb-2 sm:pb-3 space-y-1">
            {/* Divider with label */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-purple-600 font-semibold pt-1.5 sm:pt-2 border-t border-gray-200">
              <IconRoute className="w-3 h-3 flex-shrink-0" />
              <span>MERGED SCHOOLS ({mergedGroups.length})</span>
            </div>
            
            {/* Secondary School Cards - Same component with secondary variant */}
            {mergedGroups.map((mergedPosting) => (
              <SchoolCard
                key={mergedPosting.posting_id}
                posting={mergedPosting}
                variant="secondary"
                showVisit={false}
              />
            ))}
          </div>
        )}
      </SchoolCard>
    </div>
  );
}

PostingCard.propTypes = {
  posting: postingPropType.isRequired,
  showMergedBadge: PropTypes.bool,
  showSupervisor: PropTypes.bool,
  className: PropTypes.string,
};

// ============================================
// Posting List Component (Mobile-First)
// ============================================
function PostingList({ postings, showSupervisor = false, className = '' }) {
  if (!postings || postings.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      {postings.map((posting, index) => (
        <PostingCard
          key={posting.posting_id || index}
          posting={posting}
          showSupervisor={showSupervisor}
        />
      ))}
    </div>
  );
}

PostingList.propTypes = {
  postings: PropTypes.arrayOf(postingPropType),
  showSupervisor: PropTypes.bool,
  className: PropTypes.string,
};

export { PostingCard, PostingList, StudentsTable, SchoolCard };
export default PostingCard;
