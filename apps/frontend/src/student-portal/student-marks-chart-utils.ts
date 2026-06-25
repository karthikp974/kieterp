import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

/** Tap or long-press (~450ms) selects a chart bar; second tap on same bar clears. */
export function useChartBarSelection<T>(keyOf: (row: T) => string) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const toggle = useCallback(
    (row: T, setSelectedKey: Dispatch<SetStateAction<string | null>>) => {
      const key = keyOf(row);
      setSelectedKey((prev) => (prev === key ? null : key));
    },
    [keyOf]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const markTouchHandled = useCallback(() => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 400);
  }, []);

  const onBarPointerDown = useCallback(
    (row: T, setSelectedKey: Dispatch<SetStateAction<string | null>>, clientX: number, clientY: number) => {
      longPressFiredRef.current = false;
      pointerRef.current = { x: clientX, y: clientY };
      clearLongPressTimer();
      longPressRef.current = setTimeout(() => {
        toggle(row, setSelectedKey);
        longPressFiredRef.current = true;
        longPressRef.current = null;
        markTouchHandled();
      }, 450);
    },
    [clearLongPressTimer, markTouchHandled, toggle]
  );

  const onBarPointerUp = useCallback(
    (row: T, setSelectedKey: Dispatch<SetStateAction<string | null>>, clientX: number, clientY: number) => {
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        pointerRef.current = null;
        clearLongPressTimer();
        return;
      }
      const hadTimer = longPressRef.current !== null;
      clearLongPressTimer();
      const start = pointerRef.current;
      pointerRef.current = null;
      if (!hadTimer || !start) return;
      const moved = Math.hypot(clientX - start.x, clientY - start.y);
      if (moved > 12) return;
      toggle(row, setSelectedKey);
      markTouchHandled();
    },
    [clearLongPressTimer, markTouchHandled, toggle]
  );

  const onBarPointerCancel = useCallback(() => {
    clearLongPressTimer();
    longPressFiredRef.current = false;
    pointerRef.current = null;
  }, [clearLongPressTimer]);

  const onBarClick = useCallback(
    (row: T, setSelectedKey: Dispatch<SetStateAction<string | null>>) => {
      if (suppressClickRef.current) return;
      toggle(row, setSelectedKey);
    },
    [toggle]
  );

  return { onBarClick, onBarPointerDown, onBarPointerUp, onBarPointerCancel };
}

export type MarksChartRow = {
  semesterLabel: string;
  semesterNumber: number;
  sgpa: number | null;
  cgpa: number | null;
  subjects: number;
};

export function marksChartHasGpa(chart: MarksChartRow[]) {
  return chart.some((row) => row.sgpa != null || row.cgpa != null);
}

export function chartMetricValue(row: MarksChartRow, metric: "sgpa" | "cgpa") {
  const raw = metric === "sgpa" ? row.sgpa : row.cgpa;
  return raw == null ? null : raw;
}
