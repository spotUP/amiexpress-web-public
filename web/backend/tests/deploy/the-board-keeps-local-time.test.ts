/**
 * The board runs on the sysop's local time, summer and winter.
 *
 * AmiExpress is a local-time program: the T command, the callers log, last
 * callers and every MM-DD-YY date. With TZ unset the container was UTC, and a
 * caller comparing T with his own clock found it two hours behind - "It is
 * 09-27-26 13:04:08" at 15:04 (2026-09-27). The zone is set on the services
 * in docker-compose.yml; this reads it the way compose does and proves it is
 * a zone NAME whose rules carry DST, not a fixed offset.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const REPO = path.resolve(__dirname, '../../../..');
const compose = yaml.load(fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8')) as {
  services: Record<string, { environment?: string[] }>;
};

/** `${BBS_TIMEZONE:-Europe/Stockholm}` resolves to its default when the variable is unset. */
function zoneOf(service: string): string | undefined {
  const entry = compose.services[service]?.environment?.find((line) => line.startsWith('TZ='));
  if (!entry) return undefined;
  return entry.slice(3).replace(/^\$\{[A-Z_]+:-(.*)\}$/, '$1');
}

const hourIn = (zone: string, iso: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));

describe.each(['bbs', 'whip-bot'])('the %s service', (service) => {
  it('sets a time zone', () => {
    expect(zoneOf(service)).toBeDefined();
  });

  it('names a zone whose clocks change for summer', () => {
    const zone = zoneOf(service)!;
    // The friend's instant: 13:04 UTC is 15:04 in a Swedish summer...
    expect(hourIn(zone, '2026-09-27T13:04:08Z')).toBe(15);
    // ...and 13:04 UTC in January is 14:04.
    expect(hourIn(zone, '2026-01-15T13:04:08Z')).toBe(14);
  });
});

it('ships the zone data in the image, for everything that is not Node', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  expect(dockerfile).toMatch(/\btzdata\b/);
});
