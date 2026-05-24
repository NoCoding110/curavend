import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import type { BreadcrumbCrumb } from '../components/PageBreadcrumb';

interface BreadcrumbContextValue {
  override: BreadcrumbCrumb[] | null;
  setOverride: (items: BreadcrumbCrumb[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  override: null,
  setOverride: () => {},
});

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [override, setOverride] = useState<BreadcrumbCrumb[] | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
};

/**
 * Page-level hook to override the auto-derived breadcrumb. Pass an array
 * (or null to clear). Items are reset to null on unmount automatically.
 *
 * Usage:
 *   useBreadcrumbOverride([
 *     { title: 'Orders', to: '/provider-orders' },
 *     { title: `Order ${order.identifier}` },
 *   ]);
 */
export function useBreadcrumbOverride(items: BreadcrumbCrumb[] | null): void {
  const { setOverride } = useContext(BreadcrumbContext);
  // Stable identity for items via JSON.stringify so we don't re-set on every render
  const serialized = items === null ? null : JSON.stringify(items);
  useEffect(() => {
    setOverride(items);
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}

export function useBreadcrumbContext() {
  return useContext(BreadcrumbContext);
}
