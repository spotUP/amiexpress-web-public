import { useEffect } from 'react';
import { setTextEntryActive } from '../state/text-entry-lock.js';

/**
 * Call from a page with `active` = "I am in a mode App/Sidebar's global
 * hotkeys must not steal keys from" (a text field, a multi-field form, a
 * confirmation dialog - anything past the page's idle list/browse state).
 *
 * The effect's cleanup always releases the lock, including on unmount, so
 * switching pages (or an error boundary, or anything else that tears the
 * component down) can never leave the console permanently unable to quit or
 * navigate.
 */
export function useTextEntryLock(active: boolean): void {
  useEffect(() => {
    setTextEntryActive(active);
    return () => setTextEntryActive(false);
  }, [active]);
}
