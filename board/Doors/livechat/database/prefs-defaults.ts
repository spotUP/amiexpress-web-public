import type { EventPrefs } from '../types';

/** Default event preferences */
export function getDefaultPrefs(): EventPrefs {
  return {
    showLogins: true,
    showFileActivity: true,
    showDoorActivity: true,
    showMessages: true,
    showSystemAnnouncements: true,
    muteAllEvents: false,
    compactMode: false,
    showTimestamps: true,
    notificationSound: true,
    mentionSound: true
  };
}

/** Parse DB row to EventPrefs */
export function rowToPrefs(row: any): EventPrefs {
  if (!row) return getDefaultPrefs();
  return {
    showLogins: !!row.show_logins,
    showFileActivity: !!row.show_file_activity,
    showDoorActivity: !!row.show_door_activity,
    showMessages: !!row.show_messages,
    showSystemAnnouncements: !!row.show_system,
    muteAllEvents: !!row.mute_all,
    compactMode: !!row.compact_mode,
    showTimestamps: !!row.show_timestamps,
    notificationSound: !!row.notification_sound,
    mentionSound: !!row.mention_sound
  };
}
