import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

/**
 * An edit that saves itself.
 *
 * "i want no save buttons at all in the admin ui everything should auto save"
 * (sysop, 2026-09-14). This is the one place that knows how: debounce the
 * edits, write once they stop, say so, and surface a refusal rather than
 * letting it pass for success.
 *
 * THE DEBOUNCE IS NOT POLITENESS. Every write to a screen file invalidates
 * the board's screen index, and rebuilding it is ~340ms of SYNCHRONOUS
 * filesystem work on the single backend thread that also answers telnet
 * (measured 2026-09-14). A save per click while reordering a list of five
 * would freeze the whole board five times.
 */
const DEFAULT_DELAY_MS = 700;

export interface AutosaveOptions<T> {
  /** Write the value. Rejecting is how the board refuses; the message is shown. */
  save: (value: T, key?: string) => Promise<unknown>;
  /** What the toast says. Omit for a plain "Saved". */
  label?: (value: T, key?: string) => string;
  delayMs?: number;
}

export interface Autosave<T> {
  /** An edit happened. The write follows once they stop. */
  schedule: (value: T, key?: string) => void;
  /** Write now, cancelling the pending timer. For a control that means "now". */
  flush: (key?: string) => Promise<void>;
  saving: boolean;
  /** The board's last refusal, or null. */
  error: string | null;
}

export function useAutosave<T>({ save, label, delayMs = DEFAULT_DELAY_MS }: AutosaveOptions<T>): Autosave<T> {
  const { showSuccess, showError } = useNotification();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One timer and one pending value PER KEY, so two subjects cannot cancel
   * each other - the login sequence edits a list per screen, and a change to
   * one must not swallow the write queued for another.
   */
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pending = useRef<Map<string, T>>(new Map());

  /*
   * The callbacks are read through refs, because a debounced write fires
   * AFTER a render: closing over them would write with the handler the timer
   * was scheduled with rather than the current one.
   */
  const saveRef = useRef(save);
  const labelRef = useRef(label);
  useEffect(() => { saveRef.current = save; labelRef.current = label; });

  const write = useCallback(async (slot: string, value: T, key?: string) => {
    pending.current.delete(slot);
    setSaving(true);
    setError(null);
    try {
      await saveRef.current(value, key);
      showSuccess(labelRef.current ? labelRef.current(value, key) : 'Saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }, [showSuccess, showError]);

  const schedule = useCallback((value: T, key?: string) => {
    const slot = key ?? '';
    clearTimeout(timers.current.get(slot));
    pending.current.set(slot, value);
    timers.current.set(slot, setTimeout(() => {
      timers.current.delete(slot);
      void write(slot, value, key);
    }, delayMs));
  }, [delayMs, write]);

  const flush = useCallback(async (key?: string) => {
    const slot = key ?? '';
    const value = pending.current.get(slot);
    clearTimeout(timers.current.get(slot));
    timers.current.delete(slot);
    if (value === undefined) return;
    await write(slot, value, key);
  }, [write]);

  /*
   * NOTHING HALF-WRITTEN ON THE WAY OUT. An edit made a moment before the
   * page goes away is still an edit; dropping it silently is the failure this
   * hook exists to remove. The toast may not survive the unmount, but the
   * write does.
   */
  useEffect(() => {
    const scheduled = timers.current;
    const outstanding = pending.current;
    return () => {
      for (const [slot, id] of scheduled) {
        clearTimeout(id);
        const value = outstanding.get(slot);
        if (value !== undefined) void saveRef.current(value, slot === '' ? undefined : slot);
      }
      scheduled.clear();
      outstanding.clear();
    };
  }, []);

  return { schedule, flush, saving, error };
}
