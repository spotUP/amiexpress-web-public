/**
 * Row density, persisted per browser under `admin.density`.
 *
 * The value is written to `data-density` on the document element; tokens.css
 * turns it into --row-height and --control-height, so nothing needs to read
 * this hook to be affected by it.
 */

import { useCallback, useEffect, useState } from 'react';

export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'admin.density';

function readStoredDensity(): Density {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    // Private browsing and blocked site data both throw here.
    return 'comfortable';
  }
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(readStoredDensity);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      // Not being able to remember the choice is not a reason to fail.
    }
  }, [density]);

  const toggleDensity = useCallback(() => {
    setDensity((current) => (current === 'compact' ? 'comfortable' : 'compact'));
  }, []);

  return { density, setDensity, toggleDensity };
}
