import { useEffect } from 'react';
import { KeyboardShortcut } from '../types';

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[], enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
};

// Pre-defined keyboard shortcuts
export const defaultShortcuts = {
  screenshot: { key: 's', ctrl: true, description: 'Take screenshot' },
  record: { key: 'r', ctrl: true, description: 'Start/stop recording' },
  save: { key: 's', ctrl: true, shift: true, description: 'Save file' },
  build: { key: 'b', ctrl: true, description: 'Build door' },
  toggleTheme: { key: 't', ctrl: true, shift: true, description: 'Toggle theme' },
  toggleConsole: { key: '`', ctrl: true, description: 'Toggle debug console' },
  search: { key: 'f', ctrl: true, description: 'Search files' },
  openSettings: { key: ',', ctrl: true, description: 'Open settings' },
};
