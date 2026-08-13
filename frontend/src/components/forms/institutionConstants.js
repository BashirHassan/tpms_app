/**
 * Shared constants for the institution forms.
 *
 * Kept out of InstitutionFormSections.jsx so that file only exports components,
 * which is what React Fast Refresh needs to hot-reload it without a full reload.
 */

export const INSTITUTION_TYPES = [
  { value: 'college_of_education', label: 'College of Education' },
  { value: 'university', label: 'University' },
  { value: 'polytechnic', label: 'Polytechnic' },
  { value: 'other', label: 'Other' },
];
