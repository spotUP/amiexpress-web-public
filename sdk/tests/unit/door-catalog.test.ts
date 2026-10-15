/**
 * SDK door catalog: one registry reader, binary-safe, dependency-free.
 *
 * Fixtures are inline because the shapes under test ARE the formats:
 * a text .info, a binary Amiga icon with a 0x08-led TYPE (live
 * 2026-09-11: linkwall.info), and a mid-word key that must not match.
 */
import {
  parseTooltypes,
  joinCatalog,
  loadDoorCatalog,
  type CatalogIO,
} from '../../core/door-catalog';

function memIO(files: Record<string, Uint8Array | string>): CatalogIO {
  const enc = new TextEncoder();
  const asBytes = (v: Uint8Array | string): Uint8Array =>
    typeof v === 'string' ? enc.encode(v) : v;
  return {
    readDir: (dir: string) => {
      if (dir.endsWith('BBSCmd')) {
        return Object.keys(files)
          .filter((k) => k.startsWith('Commands/BBSCmd/'))
          .map((k) => k.split('/').pop() as string);
      }
      if (dir.endsWith('Doors')) {
        return Object.keys(files)
          .filter((k) => k.startsWith('Doors/') && k.endsWith('/package.json'))
          .map((k) => k.split('/')[1]);
      }
      throw new Error(`no such dir: ${dir}`);
    },
    readFile: (p: string) => {
      const k = Object.keys(files).find((k) => p.endsWith(k)) ?? null;
      return k ? asBytes(files[k]) : null;
    },
    readText: (p: string) => {
      const k = Object.keys(files).find((k) => p.endsWith(k)) ?? null;
      const v = k ? files[k] : null;
      if (v === null || v === undefined) return null;
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    },
  };
}

const TEXT_INFO = 'BBSCMD=WHIP\nTYPE=TS\nLOCATION=Doors/whip\nDESCRIPTION=x\nACCESS=0\n';

function binaryIcon(entries: Array<[string, string]>): Uint8Array {
  const parts: number[] = [0x00, 0x10, 0x08];
  for (const [k, v] of entries) {
    parts.push(0x1b);
    for (const c of `${k}=${v}`) parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x00, 0x00);
  }
  return new Uint8Array(parts);
}

describe('parseTooltypes', () => {
  test('reads a text .info', () => {
    expect(parseTooltypes(new TextEncoder().encode(TEXT_INFO))).toMatchObject({
      TYPE: 'TS',
      LOCATION: 'Doors/whip',
    });
  });

  test('reads a binary icon with a 0x08-led key', () => {
    const t = parseTooltypes(
      binaryIcon([['BBSCMD', 'LINKWALL'], ['TYPE', 'TS'], ['LOCATION', 'Doors/bbslinkwall']]),
    );
    expect(t.TYPE).toBe('TS');
    expect(t.LOCATION).toBe('Doors/bbslinkwall');
  });

  test('a key never matches mid-word', () => {
    const t = parseTooltypes(new TextEncoder().encode('XTYPES=TS\0LOCATION=Doors/nowhere\0'));
    expect(t.TYPE).toBeUndefined();
    expect(t.LOCATION).toBe('Doors/nowhere');
  });

  test('first wins, like FindToolType', () => {
    const t = parseTooltypes(new TextEncoder().encode('TYPE=XIM\nTYPE=TS\n'));
    expect(t.TYPE).toBe('XIM');
  });
});

describe('loadDoorCatalog', () => {
  const files = {
    'Commands/BBSCmd/WHIP.info': TEXT_INFO,
    'Commands/BBSCmd/LINKWALL.info': binaryIcon([
      ['BBSCMD', 'LINKWALL'],
      ['TYPE', 'TS'],
      ['LOCATION', 'Doors/bbslinkwall'],
    ]),
    'Commands/BBSCmd/OLD.info': 'BBSCMD=OLD\nTYPE=XIM\nLOCATION=OldDoor\n',
    'Doors/whip/package.json': JSON.stringify({ description: 'Demo-scene projects', author: 'AmiExpress Team' }),
    'Doors/bbslinkwall/package.json': JSON.stringify({ description: 'BBSLink Wall', author: 'AmiExpress Team' }),
  };

  test('installed TS doors only, in-house first', () => {
    const cat = loadDoorCatalog('/board', memIO(files), { types: ['TS'] });
    expect(cat.map((d) => d.command)).toEqual(['WHIP', 'LINKWALL']);
    expect(cat[0].inHouse).toBe(true);
    expect(cat[1].inHouse).toBe(false);
  });

  test('missing root and missing manifests degrade, never throw', () => {
    expect(loadDoorCatalog(null, memIO(files))).toEqual([]);
    expect(loadDoorCatalog('/nope', memIO({}))).toEqual([]);
    const cat = loadDoorCatalog(
      '/board',
      memIO({ 'Commands/BBSCmd/BARE.info': 'TYPE=TS\nLOCATION=Doors/bare\n' }),
      { types: ['TS'] },
    );
    expect(cat).toHaveLength(1);
    expect(cat[0].description).toBe('');
  });

  test('joinCatalog skips non-Doors locations', () => {
    const cat = joinCatalog(
      '/board',
      [{ command: 'OLD', tooltypes: { TYPE: 'XIM', LOCATION: 'OldDoor:' } }],
      memIO(files),
    );
    expect(cat).toEqual([]);
  });
});
