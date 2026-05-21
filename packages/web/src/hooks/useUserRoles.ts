import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';

export function useUserRoles() {
  const userData = useSelector((state: RootState) => state.auth.userData);

  return useMemo(() => {
    const role = userData?.role || '';
    const userType = userData?.userType || '';

    return {
      // User type checks
      isAdmin: userType === 'ADMIN',
      isHospital: userType === 'HOSPITAL',
      isVendor: userType === 'VENDOR',
      isLab: userType === 'LAB',

      // Role checks
      isAccountManager: role === 'ACCOUNT_MANAGER',
      isAccountManagerUser: role === 'ACCOUNT_MANAGER_USER',
      isFacilityAccountManager: role === 'FACILITY_ACCOUNT_MANAGER',
      isFacilityUser: role === 'FACILITY_USER',
      isVendorAccountManager: role === 'VENDOR_ACCOUNT_MANAGER',
      isVendorUser: role === 'VENDOR_USER',
      isProviderExecutiveAdmin: role === 'PROVIDER_EXECUTIVE_ADMIN',
      isProviderUser: role === 'PROVIDER_USER',
      isSuperVendor: role === 'SUPER_VENDOR',
      isPhysician: role === 'PHYSICIAN',

      // Composite checks
      isProvider:
        role === 'PROVIDER_EXECUTIVE_ADMIN' || role === 'PROVIDER_USER',
      isClinician: role === 'FACILITY_USER',
      isHospitalAdmin: role === 'FACILITY_ACCOUNT_MANAGER',
      isVendorAdmin: role === 'VENDOR_ACCOUNT_MANAGER',

      // Track type checks
      isHospitalWithPO: userType === 'HOSPITAL', // can be refined with track data
      isHospitalWithIO: userType === 'HOSPITAL',
      isVendorWithIO: userType === 'VENDOR',

      // Raw values
      role,
      userType,
      userData,
    };
  }, [userData]);
}
