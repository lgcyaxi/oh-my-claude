import { useState, useCallback } from "react";
import { switchModel, revertModel, type SwitchResponse } from "../lib/api";

/** Hook for switch/revert actions with loading state */
export function useSwitch(onSuccess?: () => void) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSwitch = useCallback(
    async (
      controlPort: number,
      sessionId: string,
      provider: string,
      model: string
    ): Promise<SwitchResponse | null> => {
      setSwitching(true);
      setError(null);
      try {
        const result = await switchModel(controlPort, sessionId, provider, model);
        onSuccess?.();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setSwitching(false);
      }
    },
    [onSuccess]
  );

  const doRevert = useCallback(
    async (controlPort: number, sessionId: string): Promise<SwitchResponse | null> => {
      setSwitching(true);
      setError(null);
      try {
        const result = await revertModel(controlPort, sessionId);
        onSuccess?.();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setSwitching(false);
      }
    },
    [onSuccess]
  );

  return { doSwitch, doRevert, switching, error };
}
