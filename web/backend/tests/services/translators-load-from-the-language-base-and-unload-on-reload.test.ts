/**
 * express.e loadTranslators (2586-2649) and unloadTranslators (2650-2668).
 *
 * loadTranslators drops what is loaded (unloadTranslators, 2595), then loads
 * dictionaries only when bbsConfig has a LANGUAGE_BASE tooltype (2597); for each
 * LANGUAGE.n other than the host language it reads <host><lang>.TRN and
 * <lang><host>.TRN from that folder (2610-2640). The Amiga ignores file case;
 * the live board's volume does not, so the lowercase .trn files and
 * Languages.info must still be found.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let dir: string;

function freshService(): any {
  let svc: any;
  jest.isolateModules(() => {
    jest.doMock('../../src/config', () => ({ config: { get: () => dir } }));
    svc = require('../../src/services/TranslationService').translationService;
  });
  return svc;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trn-'));
  fs.mkdirSync(path.join(dir, 'Languages'));
  fs.writeFileSync(path.join(dir, 'Languages.info'), 'HOSTLANGUAGE=English\nLANGUAGE.1=English\nLANGUAGE.2=French\n');
  fs.writeFileSync(path.join(dir, 'Languages', 'EnglishFrench.trn'), 'speak=parlez\n');
  fs.writeFileSync(path.join(dir, 'Languages', 'FrenchEnglish.trn'), 'parlez=speak\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('loadTranslators', () => {
  it('loads the host-lang and lang-host dictionaries from LANGUAGE_BASE, finding lowercase .trn', async () => {
    fs.writeFileSync(path.join(dir, 'bbsConfig.info'), 'LANGUAGE_BASE=Languages\n');
    const svc = freshService();
    await svc.initialize();
    expect([...svc.translators.keys()].sort()).toEqual(['EnglishFrench', 'FrenchEnglish']);
    expect(svc.hasTranslator('French')).toBe(true);
  });

  it('loads nothing when bbsConfig has no LANGUAGE_BASE (no default folder)', async () => {
    fs.writeFileSync(path.join(dir, 'bbsConfig.info'), 'SOMETHING=else\n');
    const svc = freshService();
    await svc.initialize();
    expect(svc.translators.size).toBe(0);
  });
});

describe('unloadTranslators', () => {
  it('a reload first drops dictionaries that are no longer on disk', async () => {
    fs.writeFileSync(path.join(dir, 'bbsConfig.info'), 'LANGUAGE_BASE=Languages\n');
    const svc = freshService();
    await svc.initialize();
    expect(svc.translators.size).toBe(2);
    fs.rmSync(path.join(dir, 'Languages', 'FrenchEnglish.trn'));
    await svc.loadTranslators();
    expect([...svc.translators.keys()]).toEqual(['EnglishFrench']);
    svc.unloadTranslators();
    expect(svc.translators.size).toBe(0);
  });
});
