import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';

interface RoleGuardProps {
  /** userType values allowed to access this route group. */
  allowedUserTypes: string[];
  /** Where to redirect an authenticated-but-unauthorized user (default: /dashboard). */
  redirectTo?: string;
}

/**
 * Route-level userType guard.
 *
 * Usage (inside a PrivateRoute wrapper):
 *   <Route element={<RoleGuard allowedUserTypes={['ADMIN']} />}>
 *     <Route path="/admin" element={<AdminDashboard />} />
 *   </Route>
 *
 * If the authenticated user's userType is NOT in allowedUserTypes they are
 * redirected to `redirectTo` (default: /dashboard) rather than seeing the page.
 *
 * Note: auth-check (unauthenticated → /login) is handled by the outer
 * PrivateRoute — this component only handles role enforcement.
 */
const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedUserTypes,
  redirectTo = '/dashboard',
}) => {
  const { userData, isAuthenticated } = useSelector(
    (state: RootState) => state.auth,
  );

  // Should already be caught by PrivateRoute, but guard defensively.
  if (!isAuthenticated || !userData) {
    return <Navigate to="/login" replace />;
  }

  // userData is stored as a plain object (not a JSON string).
  const userType =
    typeof userData === 'object' ? (userData as any).userType : null;

  if (!userType || !allowedUserTypes.includes(userType)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
};

export default RoleGuard;
