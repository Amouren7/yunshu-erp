import { useCallback, useEffect, useRef, useState } from 'react';

export interface RequestState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setData: (v: T) => void;
}

/**
 * 轻量请求 Hook
 * const { data, loading, refresh } = useRequest(() => api.get('/api/xxx', params), [params]);
 */
export function useRequest<T = any>(fetcher: () => Promise<T>, deps: any[] = [], options: { immediate?: boolean } = {}): RequestState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(options.immediate !== false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((res) => { if (alive.current) setData(res); })
      .catch((e) => { if (alive.current) setError(e?.message || '加载失败'); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh, setData };
}
