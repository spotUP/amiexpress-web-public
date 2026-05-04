/**
 * Regression test for E-15: post-upload completion banner / stats / time bonus.
 *
 * express.e:19053 — aePuts('\b\n\b\nFile Uploading Complete...\b\n')
 * express.e:19072 — StringF(' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.', ...)
 * express.e:19127 — StringF('Time increased by \d mins.\b\n\b\n', Div(peff,60))
 *
 * The three emits MUST land in that order, in the
 * handleUploadBatchComplete() path. Pinning shape catches regressions
 * where someone removes the banner, drops the stats line, or skips the
 * time bonus credit emit (which silently denies users the time award).
 *
 * Same grep-style structural test as the other audit closures —
 * file-socket-handlers.ts pulls in the entire upload + DB stack and
 * can't be unit-loaded cleanly under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Post-upload banner + stats + time bonus (E-15, express.e:19053/19072/19127)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  test('handleUploadBatchComplete emits "File Uploading Complete..."', () => {
    expect(src).toMatch(
      /handleUploadBatchComplete[\s\S]*?File Uploading Complete\.\.\./
    );
  });

  test('emits stats line with file count, kbytes, minutes, seconds, cps, efficiency', () => {
    // express.e:19072 ' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.'
    expect(src).toMatch(/file\(s\),[^"`'\n]*?bytes,[^"`'\n]*?minute\(s\)\.[^"`'\n]*?second\(s\),[^"`'\n]*?cps,[^"`'\n]*?efficiency\./);
  });

  test('emits "Time increased by N mins."', () => {
    expect(src).toMatch(/Time increased by\s*\$\{[^}]+\}\s*mins\./);
  });

  test('three emits land in order: complete -> stats -> time bonus', () => {
    const completeIdx = src.indexOf('File Uploading Complete...');
    const statsIdx = src.search(/file\(s\),[^"`'\n]*?bytes,/);
    const timeIdx = src.search(/Time increased by/);
    expect(completeIdx).toBeGreaterThan(-1);
    expect(statsIdx).toBeGreaterThan(-1);
    expect(timeIdx).toBeGreaterThan(-1);
    expect(statsIdx).toBeGreaterThan(completeIdx);
    expect(timeIdx).toBeGreaterThan(statsIdx);
  });

  test('cites express.e line numbers 19053/19072/19127 (or 18850/18857 — both upload paths share the strings)', () => {
    // Either set is acceptable evidence the dev knew the source location.
    const cites19053 = /express\.e:19053|express\.e:18850/.test(src);
    const cites19072 = /express\.e:19072|express\.e:18857/.test(src);
    const cites19127 = /express\.e:19127/.test(src);
    expect(cites19053).toBe(true);
    expect(cites19072).toBe(true);
    expect(cites19127).toBe(true);
  });
});
