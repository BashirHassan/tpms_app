/**
 * Context Index
 * 
 * Central export for all React contexts.
 * 
 * ARCHITECTURE (v2.0):
 * - AuthContext: Authentication only (login, logout, user, roles)
 * - InstitutionSelectionContext: Institution selection (context, switching, feature toggles)
 * - InstitutionContext: Branding/theming (logo, colors) - subdomain-based
 * - ToastContext: Notifications
 * 
 * USAGE:
 * ```jsx
 * import { useAuth, useInstitutionSelection, useToast, useFeature } from './context';
 * 
 * function MyComponent() {
 *   const { user, isAuthenticated } = useAuth();
 *   const { institution, hasInstitution, selectInstitution, isFeatureEnabled } = useInstitutionSelection();
 *   const { showToast } = useToast();
 *   const isPaymentsEnabled = useFeature('payments');
 * }
 * ```
 */

// Authentication (user, login, logout, roles)
export { AuthProvider, useAuth, useRequiredAuth } from './AuthContext';

// Institution selection (for multi-institution operations)
// Also exports feature toggle hooks
export { 
  InstitutionSelectionProvider, 
  useInstitutionSelection, 
  useRequiredInstitution,
  useFeature,
  useFeatures 
} from './InstitutionSelectionContext';

// Institution branding (logo, colors, theming)
export { InstitutionProvider, useInstitution } from './InstitutionContext';

// Notifications
export { ToastProvider, useToast } from './ToastContext';

// Default exports
export { default as AuthContext } from './AuthContext';
export { default as InstitutionSelectionContext } from './InstitutionSelectionContext';
