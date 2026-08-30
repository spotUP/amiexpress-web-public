/**
 * A lookup entry lives in its own .info file, so nothing here can erase a
 * sibling. What these writers could do - and did - is throw away the parts of
 * a file they do not own, and write keys the reader never looked at.
 *
 * File checkers: the writer built the tooltype map from nothing, so anything
 * else in a checker's icon went with the save. The reader itself knows the
 * file can carry SOPTIONS and the '&' prefix AmiExpress writes, which is
 * proof there is more in there than the five fields the form edits.
 *
 * Languages: the writer wrote CODE, PATH and ENABLED, and the reader read
 * none of them - the code came from the first two letters of the filename,
 * the path was the .info file itself, and enabled was always true. Editing
 * any of the three saved a value the form then showed the old version of.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InfoFileParser } from '../../src/services/info-file-parser';
import { FileCheckerConfigService } from '../../src/services/config-services/file-checker-config.service';
import { LanguageConfigService } from '../../src/services/config-services/language-config.service';
import { config as appConfig } from '../../src/config';

function writeInfo(filePath: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, new InfoFileParser().write(new Map(Object.entries(entries))));
}

function readInfo(filePath: string): Map<string, string> {
  const parsed = new InfoFileParser().parse(fs.readFileSync(filePath));
  const out = new Map<string, string>();
  for (const [key, value] of parsed.toolTypes.entries()) {
    out.set(key.startsWith('&') ? key.substring(1).toUpperCase() : key.toUpperCase(), value);
  }
  return out;
}

function repoStub(overrides: Record<string, unknown> = {}) {
  return {
    getAllFileCheckers: () => [],
    getFileCheckerById: () => null,
    createFileChecker: () => 1,
    updateFileChecker: () => true,
    deleteFileChecker: () => true,
    getLanguages: () => [],
    getLanguage: () => null,
    getLanguageByCode: () => null,
    createLanguage: (l: unknown) => ({ id: 1, ...(l as object) }),
    updateLanguage: () => ({ id: 1 }),
    deleteLanguage: () => true,
    logConfigChange: () => undefined,
    ...overrides,
  };
}

const CONTEXT = { userId: '1', username: 'sysop' } as never;

describe('lookup table writers', () => {
  let root: string;
  let originalDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lookup-'));
    originalDataDir = appConfig.get('dataDir');
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', root);
  });

  afterEach(() => {
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', originalDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps a file checker tooltype the form does not own', async () => {
    const infoPath = path.join(root, 'Fcheck', 'LhA.info');
    writeInfo(infoPath, { CHECKER: 'C:LhA', STACK: '8192', SOPTIONS: '-x -q', RESIDENT: '1' });

    const repo = repoStub({
      getFileCheckerById: () => ({
        id: 1,
        checker_name: 'LhA',
        checker_path: 'C:LhA',
        options: '-t',
        stack_size: 8192,
        priority: 0,
        script_path: '',
        enabled: true,
      }),
    });
    const service = new FileCheckerConfigService({ getConfigRepository: () => repo } as never);

    await service.updateFileChecker(1, { options: '-t' }, CONTEXT);

    const written = readInfo(infoPath);
    expect(written.get('OPTIONS')).toBe('-t');
    expect(written.get('SOPTIONS')).toBe('-x -q');
    expect(written.get('RESIDENT')).toBe('1');
    expect(written.get('CHECKER')).toBe('C:LhA');
  });

  it('reads a language back the way it was saved', async () => {
    const repo = repoStub();
    const service = new LanguageConfigService({ getConfigRepository: () => repo } as never);

    await service.createLanguage(
      {
        language_number: 1,
        title: 'Swedish',
        language_code: 'sv-SE',
        file_path: 'BBS:Languages/Swedish',
        enabled: true,
      } as never,
      CONTEXT
    );

    const [language] = await service.getLanguages();
    // Derived from the filename this would be 'sw' and the .info path.
    expect(language.language_code).toBe('sv-SE');
    expect(language.file_path).toBe('BBS:Languages/Swedish');
    expect(language.enabled).toBe(true);
  });

  it('reads a disabled language as disabled', async () => {
    writeInfo(path.join(root, 'Languages', 'German.info'), { CODE: 'de', ENABLED: '0' });

    const service = new LanguageConfigService({ getConfigRepository: () => repoStub() } as never);
    const [language] = await service.getLanguages();

    expect(language.enabled).toBe(false);
    expect(language.language_code).toBe('de');
  });

  it('falls back to the filename for a language that was never edited', async () => {
    // No CODE tooltype: the old derivation still applies, so a board that has
    // never touched a language reads exactly as it did before.
    writeInfo(path.join(root, 'Languages', 'English.info'), { SOMETHING: 'else' });

    const service = new LanguageConfigService({ getConfigRepository: () => repoStub() } as never);
    const [language] = await service.getLanguages();

    expect(language.language_code).toBe('en');
    expect(language.enabled).toBe(true);
  });
});
