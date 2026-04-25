/**
 * Regression: rebuild-door admin flow must register a door's Commands/BBSCmd/.info
 * in-process, without spawning a dev-only ts-node script.
 *
 * Before this fix, DoorManager.hotReloadDoor() shelled out to
 *   `npx ts-node ... dev/scripts/install-sdk-doors.ts --door <name>`
 * but `dev/` is excluded from the Docker image (Dockerfile only copies sdk/dist),
 * so the spawn failed on the live site for any sysop "rebuild" attempt.
 *
 * `registerDoor()` is the in-process replacement: pure file IO, no spawn,
 * no projectRoot resolution, no dev-script dependency.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerDoor } from '../../src/services/door-install.service';

describe('registerDoor (door-install.service)', () => {
  let tmpRoot: string;
  let doorPath: string;
  let bbsCommandsDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-install-'));
    doorPath = path.join(tmpRoot, 'Doors', 'livechat');
    bbsCommandsDir = path.join(tmpRoot, 'Commands', 'BBSCmd');
    fs.mkdirSync(path.join(doorPath, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(doorPath, 'dist', 'index.js'), 'module.exports = {};');
    fs.writeFileSync(
      path.join(doorPath, 'package.json'),
      JSON.stringify({
        name: 'livechat',
        bbsCommand: 'LIVECHAT',
        doorType: 'TS',
        description: 'Real-time chat',
        accessLevel: 0,
        main: 'dist/index.js',
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('writes a fresh .info file from package.json metadata', () => {
    const result = registerDoor({ doorPath, bbsCommandsDir });

    expect(result.status).toBe('created');
    expect(result.bbsCommand).toBe('LIVECHAT');
    expect(result.doorType).toBe('TS');
    expect(result.infoPath).toBe(path.join(bbsCommandsDir, 'LIVECHAT.info'));

    const content = fs.readFileSync(result.infoPath!, 'utf8');
    expect(content).toContain('BBSCMD=LIVECHAT');
    expect(content).toContain('TYPE=TS');
    expect(content).toContain('LOCATION=Doors/livechat');
    expect(content).toContain('DESCRIPTION=Real-time chat');
    expect(content).toContain('ACCESS=0');
    expect(content).toContain('MULTINODE=YES');
    expect(content).toContain('PRIORITY=SAME');
  });

  test('creates Commands/BBSCmd parent directory if missing', () => {
    expect(fs.existsSync(bbsCommandsDir)).toBe(false);
    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('created');
    expect(fs.existsSync(bbsCommandsDir)).toBe(true);
  });

  test('skips existing .info by default (matches install-sdk-doors.ts contract)', () => {
    fs.mkdirSync(bbsCommandsDir, { recursive: true });
    fs.writeFileSync(path.join(bbsCommandsDir, 'LIVECHAT.info'), 'existing');

    const result = registerDoor({ doorPath, bbsCommandsDir });

    expect(result.status).toBe('skipped-existing');
    expect(fs.readFileSync(path.join(bbsCommandsDir, 'LIVECHAT.info'), 'utf8')).toBe('existing');
  });

  test('overwrites .info when force=true (sysop rebuild path)', () => {
    fs.mkdirSync(bbsCommandsDir, { recursive: true });
    fs.writeFileSync(path.join(bbsCommandsDir, 'LIVECHAT.info'), 'stale-content');

    const result = registerDoor({ doorPath, bbsCommandsDir, force: true });

    expect(result.status).toBe('overwritten');
    const content = fs.readFileSync(result.infoPath!, 'utf8');
    expect(content).toContain('BBSCMD=LIVECHAT');
    expect(content).not.toContain('stale-content');
  });

  test('returns no-package for 68K doors without package.json', () => {
    fs.unlinkSync(path.join(doorPath, 'package.json'));
    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('no-package');
    expect(fs.existsSync(path.join(bbsCommandsDir, 'LIVECHAT.info'))).toBe(false);
  });

  test('returns invalid-package for malformed package.json', () => {
    fs.writeFileSync(path.join(doorPath, 'package.json'), '{ this is not json');
    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('invalid-package');
  });

  test('returns missing-entrypoint when dist/index.js is missing', () => {
    fs.unlinkSync(path.join(doorPath, 'dist', 'index.js'));
    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('missing-entrypoint');
  });

  test('returns unsupported-type for invalid doorType', () => {
    fs.writeFileSync(
      path.join(doorPath, 'package.json'),
      JSON.stringify({ name: 'livechat', doorType: 'COBOL', main: 'dist/index.js' }),
    );
    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('unsupported-type');
    expect(result.doorType).toBe('COBOL');
  });

  test('falls back to derived bbsCommand and default ACCESS=0 when fields are missing', () => {
    fs.writeFileSync(
      path.join(doorPath, 'package.json'),
      JSON.stringify({ name: 'multi-word-door', main: 'dist/index.js' }),
    );
    const sourceDoor = path.join(tmpRoot, 'Doors', 'multi-word-door');
    fs.renameSync(doorPath, sourceDoor);

    const result = registerDoor({ doorPath: sourceDoor, bbsCommandsDir });

    expect(result.status).toBe('created');
    expect(result.bbsCommand).toBe('MULTIWORDDOOR');
    expect(result.doorType).toBe('TS');
    const content = fs.readFileSync(result.infoPath!, 'utf8');
    expect(content).toContain('ACCESS=0');
    expect(content).toContain('LOCATION=Doors/multi-word-door');
  });

  test('respects pkg.main override for the entry-point check', () => {
    fs.writeFileSync(
      path.join(doorPath, 'package.json'),
      JSON.stringify({
        name: 'livechat',
        bbsCommand: 'LIVECHAT',
        doorType: 'TS',
        main: 'build/server.js',
      }),
    );
    fs.mkdirSync(path.join(doorPath, 'build'), { recursive: true });
    fs.writeFileSync(path.join(doorPath, 'build', 'server.js'), '// stub');

    const result = registerDoor({ doorPath, bbsCommandsDir });
    expect(result.status).toBe('created');
  });
});
