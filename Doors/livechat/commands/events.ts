/**
 * Event Filtering Commands
 * /events - Manage BBS event display preferences
 */

import type { SlashCommand } from './types';
import type { AppState } from '../core/state';

/**
 * /events [on|off|logins|files|doors|messages|announcements] - Manage event filtering
 */
export function createEventsCommand(
  state: AppState,
  addSystemMessage: (msg: string) => void,
  updateStatusBar: () => void
): SlashCommand {
  return {
    name: 'events',
    description: 'Manage BBS event display preferences',
    usage: '/events [on|off|logins|files|doors|messages|announcements]',
    handler: (ctx, args) => {
      const subcommand = args[0]?.toLowerCase();

      if (!subcommand) {
        // Show current settings
        addSystemMessage('{cyan-fg}BBS Event Display Settings:{/cyan-fg}');
        addSystemMessage('');
        addSystemMessage(`  User Logins/Logouts:     ${formatStatus(state.prefs.showLogins)}`);
        addSystemMessage(`  File Uploads/Downloads:  ${formatStatus(state.prefs.showFileActivity)}`);
        addSystemMessage(`  Door Activity:           ${formatStatus(state.prefs.showDoorActivity)}`);
        addSystemMessage(`  New Messages:            ${formatStatus(state.prefs.showMessages)}`);
        addSystemMessage(`  System Announcements:    ${formatStatus(state.prefs.showSystemAnnouncements)}`);
        addSystemMessage('');
        addSystemMessage('Use /events <type> to toggle a specific event type:');
        addSystemMessage('  /events logins       - Toggle login/logout events');
        addSystemMessage('  /events files        - Toggle file upload/download events');
        addSystemMessage('  /events doors        - Toggle door activity events');
        addSystemMessage('  /events messages     - Toggle new message events');
        addSystemMessage('  /events announcements - Toggle system announcements');
        addSystemMessage('  /events on           - Enable all event types');
        addSystemMessage('  /events off          - Disable all event types');
        return { handled: true };
      }

      switch (subcommand) {
        case 'on':
        case 'enable':
          state.prefs.showLogins = true;
          state.prefs.showFileActivity = true;
          state.prefs.showDoorActivity = true;
          state.prefs.showMessages = true;
          state.prefs.showSystemAnnouncements = true;
          state.prefs.muteAllEvents = false;
          addSystemMessage('{green-fg}All BBS events enabled{/green-fg}');
          updateStatusBar();
          break;

        case 'off':
        case 'disable':
          state.prefs.showLogins = false;
          state.prefs.showFileActivity = false;
          state.prefs.showDoorActivity = false;
          state.prefs.showMessages = false;
          state.prefs.showSystemAnnouncements = false;
          state.prefs.muteAllEvents = true;
          addSystemMessage('{red-fg}All BBS events disabled{/red-fg}');
          updateStatusBar();
          break;

        case 'logins':
        case 'login':
          state.prefs.showLogins = !state.prefs.showLogins;
          addSystemMessage(`Login/logout events: ${formatStatus(state.prefs.showLogins)}`);
          updateMuteAllEvents(state);
          updateStatusBar();
          break;

        case 'files':
        case 'file':
        case 'uploads':
        case 'downloads':
          state.prefs.showFileActivity = !state.prefs.showFileActivity;
          addSystemMessage(`File upload/download events: ${formatStatus(state.prefs.showFileActivity)}`);
          updateMuteAllEvents(state);
          updateStatusBar();
          break;

        case 'doors':
        case 'door':
          state.prefs.showDoorActivity = !state.prefs.showDoorActivity;
          addSystemMessage(`Door activity events: ${formatStatus(state.prefs.showDoorActivity)}`);
          updateMuteAllEvents(state);
          updateStatusBar();
          break;

        case 'messages':
        case 'message':
        case 'msg':
          state.prefs.showMessages = !state.prefs.showMessages;
          addSystemMessage(`New message events: ${formatStatus(state.prefs.showMessages)}`);
          updateMuteAllEvents(state);
          updateStatusBar();
          break;

        case 'announcements':
        case 'announcement':
        case 'system':
          state.prefs.showSystemAnnouncements = !state.prefs.showSystemAnnouncements;
          addSystemMessage(`System announcements: ${formatStatus(state.prefs.showSystemAnnouncements)}`);
          updateMuteAllEvents(state);
          updateStatusBar();
          break;

        default:
          addSystemMessage(`Unknown event type: ${subcommand}`);
          addSystemMessage('Valid types: logins, files, doors, messages, announcements, on, off');
          break;
      }

      return { handled: true };
    },
  };
}

/** Format boolean status for display */
function formatStatus(enabled: boolean): string {
  return enabled ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
}

/** Update muteAllEvents based on individual preferences */
function updateMuteAllEvents(state: AppState): void {
  state.prefs.muteAllEvents = !(
    state.prefs.showLogins ||
    state.prefs.showFileActivity ||
    state.prefs.showDoorActivity ||
    state.prefs.showMessages ||
    state.prefs.showSystemAnnouncements
  );
}
