/**
 * The notification rules (sdk/formats/notify.ts): when an item may go out, how
 * many may go out, and which preferences are real. Pure functions - no board.
 */
import {
  capAllows, deliverAfter, DEFAULT_SETTINGS, doorEventCommand, inQuietHours, isDoorEventId, modeFor, normalizePrefs,
  NOTIFY_EVENTS, notifyRef,
} from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifySettings } from '@amiexpress/bbs-door-sdk/formats/notify';

const utc = (y: number, mo: number, d: number, h = 0, mi = 0): number => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const item = { event: 'msg.reply' };
const settings = (over: Partial<NotifySettings>): NotifySettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('deliverAfter - instant', () => {
  it('goes out now when no quiet hours are set', () => {
    const now = utc(2026, 7, 1, 12);
    expect(deliverAfter(item, 'instant', settings({}), now, 'UTC')).toBe(now);
  });

  it('quiet hours spanning midnight hold an evening item until the next morning', () => {
    const s = settings({ quietFrom: '22:00', quietTo: '07:00' });
    expect(deliverAfter(item, 'instant', s, utc(2026, 7, 1, 23, 30), 'UTC')).toBe(utc(2026, 7, 2, 7));
  });

  it('quiet hours spanning midnight hold a small-hours item until the same morning', () => {
    const s = settings({ quietFrom: '22:00', quietTo: '07:00' });
    expect(deliverAfter(item, 'instant', s, utc(2026, 7, 1, 3), 'UTC')).toBe(utc(2026, 7, 1, 7));
  });

  it('an item outside quiet hours still goes out now', () => {
    const s = settings({ quietFrom: '22:00', quietTo: '07:00' });
    const now = utc(2026, 7, 1, 12);
    expect(deliverAfter(item, 'instant', s, now, 'UTC')).toBe(now);
  });

  it('equal from and to means no quiet hours', () => {
    const s = settings({ quietFrom: '08:00', quietTo: '08:00' });
    expect(inQuietHours(s, utc(2026, 7, 1, 8), 'UTC')).toBe(false);
  });

  it('quiet hours are read in the caller zone, not the board zone', () => {
    // 02:00Z on 1 July is 22:00 on 30 June in New York (EDT, UTC-4): quiet there, not in UTC.
    const s = settings({ quietFrom: '22:00', quietTo: '07:00', timeZone: 'America/New_York' });
    const now = utc(2026, 7, 1, 2);
    expect(deliverAfter(item, 'instant', s, now, 'UTC')).toBe(utc(2026, 7, 1, 11)); // 07:00 EDT
    expect(deliverAfter(item, 'instant', settings({ quietFrom: '22:00', quietTo: '07:00' }), now, 'UTC')).toBe(utc(2026, 7, 1, 7));
  });

  it('an unknown time zone falls back to the board zone instead of throwing', () => {
    const s = settings({ quietFrom: '22:00', quietTo: '07:00', timeZone: 'Not/AZone' });
    expect(deliverAfter(item, 'instant', s, utc(2026, 7, 1, 23), 'UTC')).toBe(utc(2026, 7, 2, 7));
  });
});

describe('deliverAfter - digest', () => {
  it('daily: before the hour it is today, after the hour it is tomorrow', () => {
    const s = settings({ digestHour: 8 });
    expect(deliverAfter(item, 'digest', s, utc(2026, 7, 1, 6), 'UTC')).toBe(utc(2026, 7, 1, 8));
    expect(deliverAfter(item, 'digest', s, utc(2026, 7, 1, 9), 'UTC')).toBe(utc(2026, 7, 2, 8));
  });

  it('daily: exactly on the slot rolls to the next one (strictly after now)', () => {
    expect(deliverAfter(item, 'digest', settings({ digestHour: 8 }), utc(2026, 7, 1, 8), 'UTC')).toBe(utc(2026, 7, 2, 8));
  });

  it('weekly: the next chosen weekday at the hour, in a non-board zone', () => {
    // Wed 1 July 2026 09:00 in Tokyo (UTC+9). Next Monday 08:00 JST = Sun 5 July 23:00Z.
    const s = settings({ digestKind: 'weekly', digestWeekday: 1, digestHour: 8, timeZone: 'Asia/Tokyo' });
    expect(deliverAfter(item, 'digest', s, utc(2026, 7, 1, 0), 'UTC')).toBe(utc(2026, 7, 5, 23));
  });

  it('weekly: the same weekday earlier in the day is today', () => {
    // Monday 6 July 2026 05:00Z, digest Monday 08:00 UTC.
    const s = settings({ digestKind: 'weekly', digestWeekday: 1, digestHour: 8 });
    expect(deliverAfter(item, 'digest', s, utc(2026, 7, 6, 5), 'UTC')).toBe(utc(2026, 7, 6, 8));
  });

  it('daily across the spring DST change lands on 08:00 local, not 08:00 of the old offset', () => {
    // New York springs forward on 8 March 2026 at 02:00. 08:00 that morning is EDT (UTC-4) = 12:00Z.
    const s = settings({ digestHour: 8, timeZone: 'America/New_York' });
    expect(deliverAfter(item, 'digest', s, utc(2026, 3, 7, 20), 'UTC')).toBe(utc(2026, 3, 8, 12));
  });

  it('uses the board zone when the caller has none', () => {
    expect(deliverAfter(item, 'digest', settings({ digestHour: 8 }), utc(2026, 7, 1, 0), 'Asia/Tokyo')).toBe(utc(2026, 7, 1, 23)); // 09:00 JST now, so 08:00 JST tomorrow
  });
});

describe('capAllows', () => {
  const now = 1_800_000_000;

  it('allows up to 5 emails in the hour and refuses the 7th (cap 6)', () => {
    const five = Array.from({ length: 5 }, (_, i) => now - 60 * (i + 1));
    expect(capAllows(five, 'email', now)).toBe(true);
    expect(capAllows([...five, now - 10], 'email', now)).toBe(false);
  });

  it('pushes are capped at 20, not 6', () => {
    const times = Array.from({ length: 19 }, (_, i) => now - 10 * (i + 1));
    expect(capAllows(times, 'push', now)).toBe(true);
    expect(capAllows([...times, now - 1], 'push', now)).toBe(false);
  });

  it('sends older than the rolling hour do not count', () => {
    const old = Array.from({ length: 10 }, () => now - 3601);
    expect(capAllows(old, 'email', now)).toBe(true);
  });

  it('the board channel is never capped', () => {
    const many = Array.from({ length: 500 }, () => now - 1);
    expect(capAllows(many, 'board', now)).toBe(true);
  });
});

describe('normalizePrefs', () => {
  it('drops unknown events and unknown channels but keeps real cells', () => {
    const out = normalizePrefs({
      'msg.reply': { email: 'instant', fax: 'instant', push: 'digest' },
      'no.such.event': { email: 'instant' },
    });
    expect(out).toEqual({ 'msg.reply': { email: 'instant', push: 'digest' } });
  });

  it('private mail offers no Board channel (sysop decision 3)', () => {
    expect(normalizePrefs({ 'mail.private': { board: 'instant', email: 'instant' } })).toEqual({ 'mail.private': { email: 'instant' } });
  });

  it('drops invalid modes and non-object input', () => {
    expect(normalizePrefs({ 'msg.reply': { email: 'sometimes' } })).toEqual({});
    expect(normalizePrefs(null)).toEqual({});
    expect(normalizePrefs('x')).toEqual({});
  });

  it('accepts a door-declared event in the door.<command>.<slug> namespace only', () => {
    expect(normalizePrefs({ 'door.tetris.your-turn': { push: 'instant' }, 'door.x': { push: 'instant' } }))
      .toEqual({ 'door.tetris.your-turn': { push: 'instant' } });
    expect(isDoorEventId('door.tetris.your-turn')).toBe(true);
    expect(isDoorEventId('door.tetris')).toBe(false);
    expect(doorEventCommand('door.tetris.your-turn')).toBe('TETRIS');
  });

  it('an unset cell is off (pure opt-in)', () => {
    expect(modeFor({}, 'msg.reply', 'email')).toBe('off');
  });
});

describe('catalogue', () => {
  it('carries the six board events with the flags the plan names', () => {
    const byId = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e.id, e]));
    expect(Object.keys(byId).sort()).toEqual(['ach.unlock', 'file.new', 'mag.story', 'mail.private', 'msg.reply', 'page.sysop']);
    expect(byId['page.sysop'].sysopOnly).toBe(true);
    expect(byId['file.new'].followsConference).toBe(true);
    expect(byId['mail.private'].channels).toEqual(['email', 'push']);
  });

  it('the outbox ref is event:object:user:channel', () => {
    expect(notifyRef('msg.reply', '42', 'u1', 'email')).toBe('msg.reply:42:u1:email');
  });
});
