/**
 * Regression test for E-15: post-upload completion banner / stats / time bonus.
 *
 * express.e:19053 — aePuts('\b\n\b\nFile Uploading Complete...\b\n')
 * express.e:19072 — StringF(' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.', ...)
 * express.e:19127 — StringF('Time increased by \d mins.\b\n\b\n', Div(peff,60))
 *
 * The three emits MUST land in that order, in the runPostUpload()
 * pipeline (services/post-upload.service.ts) — the shared post-receive
 * code that web (handleUploadBatchComplete), telnet, and SSH all call.
 *
 * Pinning shape catches regressions where someone removes the banner,
 * drops the stats line, or skips the time-bonus credit emit (which
 * silently denies users the time award). Lives in the shared service
 * so a single break here surfaces on every transport.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Post-upload banner + stats + time bonus (E-15, express.e:19053/19072/19127)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'post-upload.service.ts'),
    'utf8'
  );

  test('runPostUpload emits "File Uploading Complete..."', () => {
    expect(src).toMatch(
      /runPostUpload[\s\S]*?File Uploading Complete\.\.\./
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
    // Skip past the JSDoc header so "Time increased by" mentioned in
    // the function-level documentation doesn't out-position the actual
    // emit in the function body.
    const bodyStart = src.indexOf('export async function runPostUpload');
    expect(bodyStart).toBeGreaterThan(-1);
    const body = src.slice(bodyStart);
    const completeIdx = body.indexOf('File Uploading Complete...');
    const statsIdx = body.search(/file\(s\),[^"`'\n]*?bytes,/);
    const timeIdx = body.search(/Time increased by/);
    expect(completeIdx).toBeGreaterThan(-1);
    expect(statsIdx).toBeGreaterThan(-1);
    expect(timeIdx).toBeGreaterThan(-1);
    expect(statsIdx).toBeGreaterThan(completeIdx);
    expect(timeIdx).toBeGreaterThan(statsIdx);
  });

  test('cites express.e line numbers (18850/18857/19053/19072/19127)', () => {
    // Express.e has two upload paths that share these strings; either citation
    // form proves the dev knew the source location.
    const cites19053 = /express\.e:19053|express\.e:18850/.test(src);
    const cites19072 = /express\.e:19072|express\.e:18857/.test(src);
    const cites19127 = /express\.e:19127/.test(src);
    expect(cites19053).toBe(true);
    expect(cites19072).toBe(true);
    expect(cites19127).toBe(true);
  });

  test('callersLog fires only when at least one file was received (express.e:19094)', () => {
    // express.e:19094-19101 — success line on ulFileCount>0, failure line otherwise.
    expect(src).toMatch(/uploadedFiles\s*>\s*0[\s\S]*?Upload Failed/);
  });

  test('doUploadNotify gated on uploadedFiles > 0', () => {
    expect(src).toMatch(/uploadedFiles\s*>\s*0[\s\S]*?doUploadNotify/);
  });

  test('time credit formula is (ulTTTM * 3 / 2) + 60 seconds (express.e:19109)', () => {
    // peff = (ulTTTM * 3 / 2) + 60 when files > 0 and time > 0, else 0.
    expect(src).toMatch(/Math\.floor\(\(ulTTTM\s*\*\s*3\)\s*\/\s*2\)\s*\+\s*60/);
  });

  test('timeLimit += peff applied to session (express.e:19130)', () => {
    expect(src).toMatch(/timeLimit\s*\+=\s*peff/);
  });

  test('goodbye-after-transfer branches to handleGoodbyeCommand (express.e:25657)', () => {
    expect(src).toMatch(/goodbyeAfter[\s\S]*?handleGoodbyeCommand/);
  });
});

describe('Web handleUploadBatchComplete delegates to runPostUpload (no duplication)', () => {
  const handlersSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  test('handleUploadBatchComplete calls runPostUpload (single source of truth)', () => {
    expect(handlersSrc).toMatch(/handleUploadBatchComplete[\s\S]*?runPostUpload/);
  });

  test('handleUploadBatchComplete does NOT contain the inline banner string anymore', () => {
    // If this line ever reappears here it means someone re-duplicated the
    // post-upload stats logic and the shared service is no longer single
    // source of truth. Move it back into runPostUpload.
    const handler = handlersSrc.slice(
      handlersSrc.indexOf('export async function handleUploadBatchComplete'),
      handlersSrc.indexOf('export async function handleUploadBatchComplete') + 2000
    );
    expect(handler).not.toMatch(/File Uploading Complete/);
  });
});

describe('Telnet/SSH lrzsz onComplete routes through web pipeline (no duplication)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'commands', 'transfer-misc-commands.handler.ts'),
    'utf8'
  );

  test('lrzsz onComplete calls processBatchFile per received file', () => {
    expect(src).toMatch(/onComplete[\s\S]*?processBatchFile/);
  });

  test('lrzsz onComplete calls handleUploadBatchComplete (or relies on its auto-call)', () => {
    expect(src).toMatch(/handleUploadBatchComplete/);
  });

  test('does not re-implement the stats line inline (would double-duplicate)', () => {
    // The earlier session-stats version of this onComplete inlined the
    // "X file(s), Yk bytes" formatting. The unified version delegates;
    // if this string ever reappears here, someone re-forked the path.
    expect(src).not.toMatch(/file\(s\),[^"`'\n]*?bytes,[^"`'\n]*?minute\(s\)\.[^"`'\n]*?second\(s\),[^"`'\n]*?cps,[^"`'\n]*?efficiency\./);
  });

  test('pre-populates uploadBatch with one entry per received file (prevents auto-complete-on-first-file bug)', () => {
    // processBatchFile uses uploadBatch.length to know when it's the
    // LAST file (auto-calls handleUploadBatchComplete + clears tempData
    // when so). If we leave uploadBatch empty, isLastFile is true on
    // every iteration and the second file bails with "Upload session
    // lost". The placeholder loop guards against that.
    expect(src).toMatch(/uploadBatch[\s\S]*?received\.map/);
  });
});
