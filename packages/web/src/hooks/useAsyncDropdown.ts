import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAsyncDropdownOptions<T> {
  /** Async fetch; receives the user's search text (may be empty). */
  fetcher: (query: string) => Promise<T[]>;
  /** Debounce delay in ms. Default 300. */
  debounceMs?: number;
  /** Minimum chars before firing a search; 0 to allow empty-string browse. Default 2. */
  minChars?: number;
  /** Prefetch with empty query on mount. Default false. */
  prefetch?: boolean;
}

export interface UseAsyncDropdownResult<T> {
  options: T[];
  loading: boolean;
  onSearch: (text: string) => void;
  /** Refetch with a specific query immediately (no debounce). Useful for cascading dropdowns. */
  refetch: (query?: string) => Promise<void>;
  reset: () => void;
}

/**
 * Debounced async option loader for AntD `<Select showSearch filterOption={false}>`.
 */
export function useAsyncDropdown<T>(options: UseAsyncDropdownOptions<T>): UseAsyncDropdownResult<T> {
  const { fetcher, debounceMs = 300, minChars = 2, prefetch = false } = options;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest fetcher without re-creating onSearch (prevents debounce thrashing).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const data = await fetcherRef.current(query);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async (query: string = '') => {
    if (timer.current) clearTimeout(timer.current);
    await run(query);
  }, [run]);

  const onSearch = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      if (text.length < minChars) {
        setItems([]);
        return;
      }
      setLoading(true);
      timer.current = setTimeout(() => run(text), debounceMs);
    },
    [debounceMs, minChars, run],
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setItems([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (prefetch) {
      run('');
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { options: items, loading, onSearch, refetch, reset };
}
