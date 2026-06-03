import { useState, useEffect } from 'react';
import { get } from '../api/client';

export interface HospitalOption {
  id: string;
  name: string;
}

/**
 * For ADMIN users: fetches the hospital list and returns the selected hospitalId
 * plus a list of options to render in a Select.
 * Non-admin users should not use this hook.
 */
export function useAdminHospitalSelect() {
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    get<any>('/hospitals', { limit: 100 })
      .then((data) => {
        const items: HospitalOption[] = (Array.isArray(data) ? data : data?.items ?? []).map(
          (h: any) => ({ id: h.id, name: h.name }),
        );
        setHospitals(items);
        // Auto-select the only hospital if there is exactly one
        if (items.length === 1) setSelectedId(items[0].id);
      })
      .catch(() => {/* swallow — admin just sees empty picker */})
      .finally(() => setLoading(false));
  }, []);

  return { hospitals, selectedId, setSelectedId, loading };
}
