import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single-click / double-submit protection state machine for any action button.
 *
 * Lifecycle: idle -> loading -> (success briefly -> idle) | (error -> idle immediately).
 * While loading, repeat clicks are ignored (prevents duplicate API calls — e.g. double
 * payment submits). Long-running actions surface reassurance messages so the UI never
 * looks frozen. Timers are cleaned up on unmount.
 */
export type ActionStatus = "idle" | "loading" | "success" | "error";

export const STILL_WORKING_MS = 5_000;
export const TAKING_LONGER_MS = 20_000;
export const SUCCESS_HOLD_MS = 1_500;

export type UseActionButtonOptions = {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
  successHoldMs?: number;
};

export type UseActionButtonResult = {
  status: ActionStatus;
  /** True while the action is in flight. */
  isBusy: boolean;
  /** True while the button must stay disabled (loading or the brief success hold). */
  isLocked: boolean;
  /** Reassurance text after 5s / 20s, else null. */
  progressMessage: string | null;
  run: () => void;
};

export function useActionButton(
  action: () => Promise<unknown> | unknown,
  options: UseActionButtonOptions = {}
): UseActionButtonResult {
  const { onError, onSuccess, successHoldMs = SUCCESS_HOLD_MS } = options;
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const statusRef = useRef<ActionStatus>("idle");
  statusRef.current = status;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, []);

  const run = useCallback(() => {
    // Ignore repeat clicks while in flight or during the success hold.
    if (statusRef.current === "loading" || statusRef.current === "success") return;
    setStatus("loading");
    setProgressMessage(null);
    clearTimers();
    timers.current.push(
      setTimeout(() => {
        if (mounted.current) setProgressMessage("Still working...");
      }, STILL_WORKING_MS),
      setTimeout(() => {
        if (mounted.current) setProgressMessage("This is taking longer than usual — please wait");
      }, TAKING_LONGER_MS)
    );

    void (async () => {
      try {
        await action();
        if (!mounted.current) return;
        clearTimers();
        setProgressMessage(null);
        setStatus("success");
        onSuccess?.();
        timers.current.push(
          setTimeout(() => {
            if (mounted.current) setStatus("idle");
          }, successHoldMs)
        );
      } catch (error) {
        if (!mounted.current) return;
        clearTimers();
        setProgressMessage(null);
        setStatus("idle"); // reset immediately so the user can retry
        onError?.(error);
      }
    })();
  }, [action, onError, onSuccess, successHoldMs]);

  return {
    status,
    isBusy: status === "loading",
    isLocked: status === "loading" || status === "success",
    progressMessage,
    run
  };
}
