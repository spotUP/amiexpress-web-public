/**
 * Regression tests for the ZMODEM web unification (commit c67e50385 +
 * follow-ups). Each test pins a discrete invariant in the lrzsz
 * transport / web upload pipeline so a future refactor can't silently
 * regress the live web upload flow.
 *
 * Why grep-style: lrzsz-transfer.service.ts spawns subprocesses and
 * file-socket-handlers.ts pulls in the whole BBS subsystem (database,
 * sessions, post-upload pipeline) — neither loads cleanly under jest
 * without a sprawling mock stack. Pinning the branch shape catches the
 * regressions we actually saw debugging the upload pipeline:
 *   - chunk-split removed → browser Sentry stops detecting ZRINIT
 *   - patchZrinitFlags loop reverted to single-shot → second ZRINIT
 *     escapes unpatched, browser Send session throws TypeError
 *   - MuffinTerm rewrite re-applied to web → ZFILE buffered forever,
 *     rz aborts at code 128
 *   - server handshake fallback timer reintroduced → rz spawns before
 *     user picks file, races the file picker, aborts
 *   - multi-file batch loop reverted to emit show-file-upload → ZMODEM
 *     batch turns into HTTP picker after first file
 */

import * as fs from 'fs';
import * as path from 'path';

const lrzszSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'lrzsz-transfer.service.ts'),
  'utf8'
);

const fileSocketSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
  'utf8'
);

const transferMiscSrc = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    'handlers',
    'commands',
    'transfer-misc-commands.handler.ts'
  ),
  'utf8'
);

const userCommandsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'handlers', 'commands', 'user-commands.handler.ts'),
  'utf8'
);

describe('ZMODEM web unification — lrzsz-transfer.service.ts', () => {
  test('patchZrinitFlags loops to patch ALL occurrences in a chunk', () => {
    // The first incoming stdout chunk from rz contains TWO concatenated
    // ZRINITs (42 B). A single-shot indexOf+copy patches only the first;
    // the second ZRINIT then arrives with CANFC32 still set and the
    // browser Send session throws TypeError reading handlers[ZRINIT].
    const fn = lrzszSrc.match(
      /private patchZrinitFlags\(chunk: Buffer\): Buffer \{[\s\S]+?\n  \}/
    );
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/while \(cursor <= chunk\.length - orig\.length\)/);
    expect(fn![0]).toMatch(/cursor = idx \+ fixed\.length/);
  });

  test('stdout splits at `**\\x18B` boundaries before transport.send', () => {
    // zmodem.js Sentry requires exactly one initial header per consume()
    // for detection (zsentry.js _parse: "this logic depends on the sender
    // only sending one initial header"). lrzsz emits two back-to-back
    // ZRINITs in one stdout chunk on spawn; we must split before passing
    // them to the browser-side Sentry.
    expect(lrzszSrc).toMatch(/HEADER_MARKER\s*=\s*Buffer\.from\(\[0x2a,\s*0x2a,\s*0x18,\s*0x42\]\)/);
    // The split loop calls indexOf(HEADER_MARKER, cursor + HEADER_MARKER.length)
    expect(lrzszSrc).toMatch(/indexOf\(HEADER_MARKER, cursor \+ HEADER_MARKER\.length\)/);
  });

  test('ZRINIT suppression has a state flag that resets on non-ZRINIT', () => {
    // rz keepalive ZRINITs after the first must be suppressed so the
    // browser Send session doesn't choke. But after data flow begins
    // (ZRPOS / ZACK arrive), the NEXT ZRINIT — sent post-EOF as "next
    // file or finish?" — must reach the browser so the Send session
    // can emit ZFIN and rz exits cleanly.
    expect(lrzszSrc).toMatch(/private zrinitForwarded: boolean = false/);
    // Set when first ZRINIT forwarded
    expect(lrzszSrc).toMatch(/this\.zrinitForwarded = true/);
    // Cleared when ANY non-ZRINIT chunk goes through
    expect(lrzszSrc).toMatch(/this\.zrinitForwarded = false/);
  });

  test('isLoneZrinit accepts the 21-byte ZRINIT shape', () => {
    // Bounds check prevents the helper from misclassifying larger
    // chunks (ZDATA frames start with `**\x18C ...` which we MUST
    // forward). The check is `buf.length > 28` rejects anything larger
    // than a single hex-header trailer.
    const fn = lrzszSrc.match(
      /const isLoneZrinit = \(buf: Buffer\): boolean => \{[\s\S]+?\n    \};/
    );
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/buf\.length > 28/);
    expect(fn![0]).toMatch(/buf\[0\] !== 0x2a \|\| buf\[1\] !== 0x2a \|\| buf\[2\] !== 0x18 \|\| buf\[3\] !== 0x42/);
    // Type bytes "0" "1" = ZRINIT
    expect(fn![0]).toMatch(/buf\[4\] === 0x30 && buf\[5\] === 0x31/);
  });

  test('rewriteMuffintermZfile is skipped for transport.type === "web"', () => {
    // zmodem.js correctly uses ZCRCW (0x6b). The MuffinTerm-only
    // rewrite scans for ZCRCE (0x68) and, when absent, buffers the
    // chunk indefinitely. For web, ZFILE bytes never reach rz stdin
    // and the transfer aborts.
    const handleInput = lrzszSrc.match(/handleInput\(data: Buffer\): void \{[\s\S]+?\n  \}/);
    expect(handleInput).not.toBeNull();
    expect(handleInput![0]).toMatch(
      /this\.direction === ['"]upload['"] && this\.transport\.type !== ['"]web['"]/
    );
  });

  test('LrzszTransport type accepts "web"', () => {
    expect(lrzszSrc).toMatch(/type: ['"]telnet['"] \| ['"]ssh['"] \| ['"]web['"]/);
  });

  test('rz spawn args bump per-retry timeout (-t 600)', () => {
    // Default rz timeout is ~1s/tenth which races the post-ZACK file-
    // pick window. -t 600 = 60 s safety margin even though the
    // deferred-pick handshake should make this moot.
    expect(lrzszSrc).toMatch(/return \[['"]-b['"], ['"]-r['"], ['"]-t['"], ['"]600['"], ['"]-vv['"]\]/);
  });
});

describe('ZMODEM web unification — server handshake (transfer-misc-commands)', () => {
  test('web RZ defers lrzManager.start until client emits transfer-raw:start', () => {
    expect(transferMiscSrc).toMatch(
      /socket\.once\(['"]transfer-raw:start['"],\s*\(\)\s*=>\s*fireOnce\(['"]client-start['"]\)\)/
    );
  });

  test('handshake has NO short fallback timer (only long safety cleanup)', () => {
    // Earlier code had setTimeout(spawn, 1500) which raced the file
    // picker. The 120 s timer is a graceful cleanup, not a spawn.
    const block = transferMiscSrc.match(/transportType === ['"]web['"][\s\S]+?socket\.emit\(['"]transfer-raw:init['"]/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/setTimeout\([^)]+,\s*1500\s*\)/);
    expect(block![0]).toMatch(/setTimeout\([\s\S]+?,\s*120000\s*\)/);
  });

  test('onComplete drives handleDizExtractionAndDescription (not processBatchFile)', () => {
    // processBatchFile bypasses the description prompt + DIZ extraction.
    // handleDizExtractionAndDescription is the entry point that prompts
    // the user and routes through the full express.e:17720 flow.
    expect(transferMiscSrc).toMatch(/require\(['"]\.\.\/\.\.\/server\/file-socket-handlers['"]\)/);
    expect(transferMiscSrc).toMatch(/handleDizExtractionAndDescription,/);
    expect(transferMiscSrc).toMatch(/webUploadMode: true/);
    expect(transferMiscSrc).toMatch(/await handleDizExtractionAndDescription\(/);
  });

  test('onComplete queues files 2..N in pendingZmodemFiles', () => {
    // Multi-file ZMODEM batches: first file → handleDiz immediately;
    // remaining files queued and walked one at a time by the post-
    // description hook in processBatchFile.
    expect(transferMiscSrc).toMatch(/pendingZmodemFiles:\s*received\.slice\(1\)/);
  });
});

describe('ZMODEM web unification — Z/D commands (user-commands)', () => {
  test('no `transport.type !== "web"` gate on lrzsz path', () => {
    // Phase 2: web now uses lrzsz too. The previous gate forced web
    // into the JS ZmodemTransferManager fallback.
    expect(userCommandsSrc).not.toMatch(
      /if\s*\(\s*transport\.type !== ['"]web['"]\s*\)\s*\{[\s\S]{0,200}isLrzszAvailable/
    );
  });

  test('both upload + download paths emit transfer-raw:init for web', () => {
    // Two distinct call sites — Z and D — each must arm the browser
    // Sentry before lrzsz writes its first byte.
    const initEmits = userCommandsSrc.match(/socket\.emit\(['"]transfer-raw:init['"]/g) || [];
    expect(initEmits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ZMODEM web unification — multi-file batch (file-socket-handlers)', () => {
  test('processBatchFile pops pendingZmodemFiles after each file in web mode', () => {
    // Without this, a multi-file ZMODEM batch processes only the first
    // file and the rest are orphaned in the playpen.
    expect(fileSocketSrc).toMatch(/uploadContext\.pendingZmodemFiles\.shift\(\)/);
    expect(fileSocketSrc).toMatch(/await handleDizExtractionAndDescription\(/);
  });

  test('end of pendingZmodemFiles queue auto-runs handleUploadBatchComplete', () => {
    // The Array.isArray(pendingZmodemFiles) check distinguishes a
    // finished-ZMODEM-batch from an HTTP-picker batch. The HTTP path
    // emits show-file-upload to request the next file; ZMODEM has no
    // more files to request.
    const block = fileSocketSrc.match(
      /isWebUploadMode &&\s*Array\.isArray\(uploadContext\.pendingZmodemFiles\)\)[\s\S]{0,200}handleUploadBatchComplete/
    );
    expect(block).not.toBeNull();
  });

  test('handleDizExtractionAndDescription is exported', () => {
    // The lrzsz onComplete imports this at runtime via require(); if
    // it becomes un-exported the require returns undefined and the
    // first file's description prompt never appears.
    expect(fileSocketSrc).toMatch(
      /^export async function handleDizExtractionAndDescription\b/m
    );
  });
});
