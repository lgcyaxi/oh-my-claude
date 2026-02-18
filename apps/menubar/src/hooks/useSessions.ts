import { useEffect, useState, useCallback } from "react";
import { listSessions, type SessionInfo } from "../lib/api";

/** Poll active sessions every `intervalMs` milliseconds */
export function useSessions(intervalMs: number = 2000) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listSessions();
      setSessions(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { sessions, loading, error, refresh };
}
