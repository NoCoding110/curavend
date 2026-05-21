import { useCallback, useEffect, useState } from 'react';
import { get } from '../../../api/client';

export interface CoverageFacility {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface CoverageVendorRef {
  id: string;
  name: string | null;
}

export interface CoverageCellSummary {
  branchesTotal: number;
  branchesServing: number;
  bestSlaHours: number | null;
  capabilityUnion: string[];
}

export interface CoverageMatrix {
  facilities: CoverageFacility[];
  vendors: CoverageVendorRef[];
  cells: Record<string, Record<string, CoverageCellSummary>>;
  /** Phase A: present when ?byCategory=1. */
  categories?: ItemCategory[];
  categoryCoverage?: Record<string, Record<string, CategoryCell>>;
}

// ─────────────── Phase A: per-category types ───────────────

export type ItemCategory =
  | 'WOUND_CARE'
  | 'ORTHOTICS'
  | 'PROSTHETICS'
  | 'BIOLOGICS'
  | 'DME'
  | 'IMPLANTS'
  | 'CONSUMABLES'
  | 'GENERAL';

export interface RankedServingLocation {
  id: string;
  name: string;
  locationType: string;
  city: string | null;
  state: string | null;
  capabilities: string[];
  maxDeliveryHours: number | null;
  isPrimary: boolean;
}

export interface RankedVendorCell {
  vendorId: string;
  vendorName: string | null;
  priority: number;
  branchesTotal: number;
  branchesServing: number;
  bestSlaHours: number | null;
  capabilityUnion: string[];
  isFacilityScoped: boolean;
  servingLocations: RankedServingLocation[];
}

export interface CategoryCell {
  rankedVendors: RankedVendorCell[];
  gapReason?: 'no-vendor-for-category' | 'no-location-serves-state';
}

export interface CoverageLocationDetail {
  id: string;
  name: string;
  locationType: string;
  city: string | null;
  state: string | null;
  capabilities: string[];
  serviceStates: string[];
  maxDeliveryHours: number | null;
  isPrimary: boolean;
  servesFacility: boolean;
  reason: string;
}

export interface CoverageVendorDetail {
  vendorId: string;
  vendorName: string | null;
  locations: CoverageLocationDetail[];
  summary: CoverageCellSummary;
}

export function useVendorCoverageMatrix(
  activeOnly = true,
  byCategory = false,
) {
  const [data, setData] = useState<CoverageMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        activeOnly: activeOnly ? 1 : 0,
      };
      if (byCategory) params.byCategory = 1;
      const res = await get<CoverageMatrix>('/vendor-coverage', params);
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load coverage');
    } finally {
      setLoading(false);
    }
  }, [activeOnly, byCategory]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  return { data, loading, error, refetch: fetchMatrix };
}

/**
 * Fetch detailed coverage for one (facility, vendor) pair — used by the
 * matrix drill-down panel.
 */
export async function fetchCoverageForPair(
  facilityId: string,
  vendorId: string,
): Promise<CoverageVendorDetail | null> {
  const data = await get<CoverageVendorDetail[]>('/vendor-coverage', {
    facilityId,
    vendorId,
  });
  return Array.isArray(data) ? data[0] ?? null : null;
}
