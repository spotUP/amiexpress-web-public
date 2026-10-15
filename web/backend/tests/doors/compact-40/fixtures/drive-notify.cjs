/**
 * Drives the REAL NOTIFY bundle (Doors/notify/dist/index.js, against sdk/dist)
 * and prints every byte it wrote, as JSON, on stdout. The seam is shared:
 * see drive-door.cjs.
 *
 *   BBS_DATA_DIR=<board> node drive-notify.cjs \
 *     '{"cols":40,"rows":25,"petscii":true,"steps":[{"key":"c","wait":300}]}'
 */
const driveDoor = require('./drive-door.cjs');

const sets = [];
let storedPrefs = { 'msg.reply': { email: 'instant' } };
const SETTINGS = { quietFrom: null, quietTo: null, timeZone: null, digestKind: 'daily', digestHour: 8, digestWeekday: null, paused: false };

driveDoor({
  dist: 'Doors/notify/dist/index.js',
  callerId: 'notify-caller',
  extra: () => ({ sets }),
  makeBbs: (spec) => ({
    getUser: () => ({ username: 'READER', securityLevel: 255 }),
    setUserEmail: async () => true,
    notifications: () => ({
      catalogue: async () => ({
        events: [
          { id: 'mail.private', label: 'Private mail', channels: ['email', 'push'] },
          { id: 'msg.reply', label: 'Reply to my message', channels: ['email', 'push', 'board'] },
        ],
        deliverable: { email: true, push: spec.push === true, board: true }, conferences: [], boardZone: 'UTC',
      }),
      get: async () => ({
        prefs: storedPrefs, settings: SETTINGS,
        follows: [], email: { address: 'a@b.c', verified: true },
      }),
      // Records what the door saves and keeps it, like the board does.
      set: async (prefs, settings) => {
        sets.push(JSON.parse(JSON.stringify(prefs)));
        storedPrefs = prefs;
        return { ok: true, state: { prefs, settings, follows: [], email: { address: 'a@b.c', verified: true } } };
      },
      follow: async () => ({ ok: true, follows: [] }),
      startEmailVerification: async () => ({ ok: false, reason: 'send-failed' }),
      confirmEmail: async () => ({ ok: false, reason: 'none' }),
      test: async () => ({ ok: true, detail: 'ok' }),
    }),
  }),
});
