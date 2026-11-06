/**
 * Settings save handler
 * Applies settings and updates state
 */
import type { AppState } from '../core/state';
import type { EventPrefs } from '../types';

export function saveSettings(
  state: AppState,
  checkboxes: {
    showLogins: any;
    showFileActivity: any;
    showDoorActivity: any;
    showMessages: any;
    showAnnouncements: any;
    muteSounds: any;
    timestamps: any;
    compact?: any;
  },
  updateStatusBar: () => void,
  sendPrefs?: (prefs: EventPrefs) => void
): void {
  state.prefs.showLogins = checkboxes.showLogins.isChecked();
  state.prefs.showFileActivity = checkboxes.showFileActivity.isChecked();
  state.prefs.showDoorActivity = checkboxes.showDoorActivity.isChecked();
  state.prefs.showMessages = checkboxes.showMessages.isChecked();
  state.prefs.showSystemAnnouncements = checkboxes.showAnnouncements.isChecked();
  state.prefs.notificationSound = !checkboxes.muteSounds.isChecked();
  state.prefs.mentionSound = !checkboxes.muteSounds.isChecked();
  state.prefs.showTimestamps = checkboxes.timestamps.isChecked();
  if (checkboxes.compact) state.prefs.compactMode = checkboxes.compact.isChecked();
  state.prefs.muteAllEvents = !(
    state.prefs.showLogins ||
    state.prefs.showFileActivity ||
    state.prefs.showDoorActivity ||
    state.prefs.showMessages ||
    state.prefs.showSystemAnnouncements
  );
  updateStatusBar();
  sendPrefs?.(state.prefs);
}

/**
 * The same checkboxes, read back from the saved prefs with one overridden:
 * how a slash command (/sounds, /compact, /timestamps) goes through
 * saveSettings instead of writing prefs a second way.
 */
export function prefsAsCheckboxes(state: AppState, override: Partial<Record<'muteSounds' | 'timestamps' | 'compact', boolean>> = {}) {
  const p = state.prefs;
  const box = (v: boolean) => ({ isChecked: () => v });
  return {
    showLogins: box(p.showLogins),
    showFileActivity: box(p.showFileActivity),
    showDoorActivity: box(p.showDoorActivity),
    showMessages: box(p.showMessages),
    showAnnouncements: box(p.showSystemAnnouncements),
    muteSounds: box(override.muteSounds ?? !p.notificationSound),
    timestamps: box(override.timestamps ?? p.showTimestamps),
    compact: box(override.compact ?? p.compactMode),
  };
}
