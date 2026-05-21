import { useCallback, useEffect, useState } from 'react';
import { filterPresetsApi, type FilterPreset } from '../api/filterPresets';

export interface UseFilterPresetsResult {
  presets: FilterPreset[];
  activePresetId: string | null;
  loading: boolean;
  defaultApplied: boolean;
  setActivePresetId: (id: string | null) => void;
  refresh: () => Promise<void>;
  saveAs: (name: string, filters: Record<string, any>, isDefault?: boolean) => Promise<FilterPreset>;
  toggleDefault: (preset: FilterPreset) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Wraps filterPresetsApi for a given entity. Auto-loads presets on mount.
 * The component decides when to apply the default preset (via `presets.find(p => p.isDefault)`).
 */
export function useFilterPresets(entity: string, autoLoad = true): UseFilterPresetsResult {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [defaultApplied, setDefaultApplied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await filterPresetsApi.list(entity);
      setPresets(list);
    } catch {
      setPresets([]);
    } finally {
      setLoading(false);
      setDefaultApplied(true);
    }
  }, [entity]);

  useEffect(() => {
    if (autoLoad) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const saveAs = useCallback(
    async (name: string, filters: Record<string, any>, isDefault?: boolean) => {
      const preset = await filterPresetsApi.create({ entity, name, filters, isDefault });
      const list = await filterPresetsApi.list(entity);
      setPresets(list);
      setActivePresetId(preset.id);
      return preset;
    },
    [entity],
  );

  const toggleDefault = useCallback(
    async (preset: FilterPreset) => {
      await filterPresetsApi.update(preset.id, { isDefault: !preset.isDefault });
      const list = await filterPresetsApi.list(entity);
      setPresets(list);
    },
    [entity],
  );

  const remove = useCallback(
    async (id: string) => {
      await filterPresetsApi.remove(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      setActivePresetId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  return {
    presets,
    activePresetId,
    loading,
    defaultApplied,
    setActivePresetId,
    refresh,
    saveAs,
    toggleDefault,
    remove,
  };
}
