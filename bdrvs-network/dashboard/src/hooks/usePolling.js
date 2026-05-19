import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * usePolling — invokes the given async fetcher immediately, then on a fixed
 * interval. Auto-cancels when the component unmounts.
 *
 *   const { data, error, loading, refresh, lastUpdated } =
 *     usePolling(getViolations, [], { intervalMs: 15000 });
 */
export default function usePolling(fetcher, deps = [], { intervalMs } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const mountedRef = useRef(true);
  const interval = intervalMs || Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 15000;

  const run = useCallback(async () => {
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    run();
    const id = setInterval(run, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [run, interval]);

  return { data, error, loading, refresh: run, lastUpdated };
}
