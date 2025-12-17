import type { SlashCommand } from './types';

/** /events - Toggle event notifications */
export const eventsCmd: SlashCommand = {
  name: 'events',
  description: 'Toggle event notifications',
  usage: '/events [on|off|logins|files|doors|messages]',
  handler: (ctx, args) => {
    const opt = args[0]?.toLowerCase();
    if (!opt) {
      return { handled: true, message: 'Usage: /events on|off|logins|files|doors|messages' };
    }
    switch (opt) {
      case 'on':
        return { handled: true, message: 'All events enabled', data: { muteAll: false } };
      case 'off':
        return { handled: true, message: 'All events muted', data: { muteAll: true } };
      case 'logins':
        return { handled: true, message: 'Login events toggled', data: { toggle: 'showLogins' } };
      case 'files':
        return { handled: true, message: 'File events toggled', data: { toggle: 'showFileActivity' } };
      case 'doors':
        return { handled: true, message: 'Door events toggled', data: { toggle: 'showDoorActivity' } };
      case 'messages':
        return { handled: true, message: 'Message events toggled', data: { toggle: 'showMessages' } };
      default:
        return { handled: true, error: 'Unknown option' };
    }
  }
};
