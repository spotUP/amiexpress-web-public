import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when value changes
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function like useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error saving localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

// Hook for managing multiple localStorage keys
export function useLocalStorageMultiple<T extends Record<string, any>>(
  keys: Record<keyof T, any>
): [T, (key: keyof T, value: any) => void] {
  const [values, setValues] = useState<T>(() => {
    const initial = {} as T;
    for (const [key, defaultValue] of Object.entries(keys)) {
      try {
        const item = window.localStorage.getItem(key);
        initial[key as keyof T] = item ? JSON.parse(item) : defaultValue;
      } catch (error) {
        console.error(`Error loading localStorage key "${key}":`, error);
        initial[key as keyof T] = defaultValue;
      }
    }
    return initial;
  });

  const setValue = (key: keyof T, value: any) => {
    try {
      setValues((prev) => ({ ...prev, [key]: value }));
      window.localStorage.setItem(key as string, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving localStorage key "${key as string}":`, error);
    }
  };

  return [values, setValue];
}
