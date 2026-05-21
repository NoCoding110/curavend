import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ListColumnDef<K extends string = string> {
  key: K;
  label: string;
  /** Column is always visible and cannot be hidden (e.g. "Actions"). */
  alwaysVisible?: boolean;
  /** Column is pinned to the end regardless of user-defined order (e.g. "Actions"). */
  pinEnd?: boolean;
}

export interface UseListColumnsOptions<K extends string> {
  /** Stable localStorage key prefix for this entity, e.g. "curavend_invoices_columns_v1". */
  storageKey: string;
  /** Every column the page might ever show. */
  allColumns: ListColumnDef<K>[];
  /** Keys visible by default on a fresh install. */
  defaultVisible: K[];
  /** Default display order of all non-pinned columns. If omitted, derived from `allColumns`. */
  defaultOrder?: K[];
}

export interface UseListColumnsResult<K extends string> {
  visibleKeys: K[];
  orderedKeys: K[];
  /** Final key sequence to render (order applied, pinned keys at end, invisible filtered out). */
  finalKeys: K[];
  setVisible: (next: K[]) => void;
  toggle: (key: K, next: boolean) => void;
  setOrder: (next: K[]) => void;
  resetDefaults: () => void;
  showAll: () => void;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Generic per-page column visibility + order, persisted to localStorage.
 * Two keys are written: `${storageKey}_visible` and `${storageKey}_order`.
 */
export function useListColumns<K extends string>(
  options: UseListColumnsOptions<K>,
): UseListColumnsResult<K> {
  const { storageKey, allColumns, defaultVisible } = options;

  const computedDefaultOrder = useMemo<K[]>(
    () =>
      options.defaultOrder ??
      (allColumns.filter((c) => !c.pinEnd).map((c) => c.key) as K[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allColumns, options.defaultOrder],
  );

  const visibleLSKey = `${storageKey}_visible`;
  const orderLSKey = `${storageKey}_order`;

  const [visibleKeys, setVisibleState] = useState<K[]>(() =>
    readLS<K[]>(visibleLSKey, defaultVisible),
  );
  const [orderedKeys, setOrderState] = useState<K[]>(() => {
    const saved = readLS<K[] | null>(orderLSKey, null);
    if (!saved) return computedDefaultOrder;
    // Merge any newly-added columns the user hasn't seen yet
    const known = new Set(saved);
    const missing = computedDefaultOrder.filter((k) => !known.has(k));
    return [...saved.filter((k) => computedDefaultOrder.includes(k)), ...missing];
  });

  useEffect(() => {
    writeLS(visibleLSKey, visibleKeys);
  }, [visibleLSKey, visibleKeys]);

  useEffect(() => {
    writeLS(orderLSKey, orderedKeys);
  }, [orderLSKey, orderedKeys]);

  const setVisible = useCallback((next: K[]) => {
    // Enforce alwaysVisible columns stay in
    const always = allColumns.filter((c) => c.alwaysVisible).map((c) => c.key as K);
    const merged = Array.from(new Set<K>([...next, ...always]));
    setVisibleState(merged);
  }, [allColumns]);

  const toggle = useCallback(
    (key: K, next: boolean) => {
      setVisibleState((prev) => {
        if (next) return Array.from(new Set<K>([...prev, key]));
        const def = allColumns.find((c) => c.key === key);
        if (def?.alwaysVisible) return prev;
        return prev.filter((k) => k !== key);
      });
    },
    [allColumns],
  );

  const setOrder = useCallback((next: K[]) => {
    setOrderState(next);
  }, []);

  const resetDefaults = useCallback(() => {
    setVisibleState(defaultVisible);
    setOrderState(computedDefaultOrder);
  }, [defaultVisible, computedDefaultOrder]);

  const showAll = useCallback(() => {
    setVisibleState(allColumns.map((c) => c.key as K));
  }, [allColumns]);

  const finalKeys = useMemo<K[]>(() => {
    const pinned = allColumns.filter((c) => c.pinEnd).map((c) => c.key as K);
    const pinnedSet = new Set(pinned);
    const visibleSet = new Set(visibleKeys);
    const ordered = orderedKeys.filter((k) => visibleSet.has(k) && !pinnedSet.has(k));
    const pinnedVisible = pinned.filter((k) => visibleSet.has(k));
    return [...ordered, ...pinnedVisible];
  }, [allColumns, visibleKeys, orderedKeys]);

  return {
    visibleKeys,
    orderedKeys,
    finalKeys,
    setVisible,
    toggle,
    setOrder,
    resetDefaults,
    showAll,
  };
}
