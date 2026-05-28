#!/usr/bin/env python3
"""
Extract AmiExpress door archives into Doors/ and add them to corpus.json.

For each LHA/LZX/LZH archive in Archives/AmiExpress/ that isn't already
represented by a Doors/ subdirectory, this script:
  1. Extracts the archive with unar to a temp dir
  2. Finds all Amiga HUNK executables (magic 0x000003F3)
  3. Copies the best binary + any supporting files to Doors/<name>/
  4. Skips archives that produce no usable binary

Run add-missing-doors.ts afterwards to update corpus.json.
"""

import os, sys, shutil, tempfile, subprocess, json, struct
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ARCHIVES_DIR = '~/Code/amiexpress_doors/Archives/AmiExpress'
DOORS_DIR    = os.path.join(REPO_ROOT, 'Doors')
UNAR         = shutil.which('unar') or '/opt/homebrew/bin/unar'

SKIP_EXTS = {'.txt', '.doc', '.readme', '.guide', '.diz', '.nfo', '.info',
             '.c', '.h', '.s', '.asm', '.o', '.bbs', '.cfg', '.dat',
             '.zip', '.lha', '.lzh', '.lzx', '.arc', '.dms'}

def is_hunk(path: str) -> bool:
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
        return magic == b'\x00\x00\x03\xf3'
    except:
        return False

def safe_name(base: str) -> str:
    """Normalize archive basename to a safe directory name."""
    return base.replace(' ', '_').replace('/', '_').replace('\\', '_')

def extract_one(base: str, archive_path: str) -> tuple[str, str]:
    """Returns (base, status) where status is 'ok', 'no-binary', or 'error'."""
    dest_dir = os.path.join(DOORS_DIR, safe_name(base))
    if os.path.exists(dest_dir):
        return base, 'already-exists'

    with tempfile.TemporaryDirectory() as tmp:
        try:
            r = subprocess.run(
                [UNAR, '-D', '-o', tmp, archive_path],
                capture_output=True, timeout=30
            )
        except Exception as e:
            return base, f'error: {e}'

        # Find all HUNK binaries in the extracted tree
        hunks = []
        all_files = []
        for root, dirs, files in os.walk(tmp):
            for f in files:
                fp = os.path.join(root, f)
                ext = os.path.splitext(f)[1].lower()
                if ext in SKIP_EXTS:
                    continue
                all_files.append(fp)
                if is_hunk(fp):
                    hunks.append(fp)

        if not hunks:
            return base, 'no-binary'

        # Pick the largest HUNK binary as the primary executable
        primary = max(hunks, key=lambda p: os.path.getsize(p))

        os.makedirs(dest_dir, exist_ok=True)
        # Copy primary binary
        shutil.copy2(primary, os.path.join(dest_dir, os.path.basename(primary)))
        # Copy any small support files (CFG, TXT, DAT under 64KB)
        for fp in all_files:
            if fp == primary:
                continue
            size = os.path.getsize(fp)
            ext = os.path.splitext(fp)[1].lower()
            if size < 65536 and ext in ('', '.cfg', '.txt', '.dat', '.data', '.config'):
                try:
                    shutil.copy2(fp, os.path.join(dest_dir, os.path.basename(fp)))
                except:
                    pass

        return base, 'ok'

def main():
    # Build set of unique archives (prefer .lha over .lzx/.lzh)
    all_archives = {}
    for f in sorted(os.listdir(ARCHIVES_DIR)):
        base = os.path.splitext(f)[0].upper()
        ext  = os.path.splitext(f)[1].lower()
        if ext not in ('.lha', '.lzx', '.lzh'):
            continue
        if base not in all_archives or ext == '.lha':
            all_archives[base] = os.path.join(ARCHIVES_DIR, f)

    # Find which ones aren't already in Doors/
    existing = set(d.upper() for d in os.listdir(DOORS_DIR)
                   if os.path.isdir(os.path.join(DOORS_DIR, d)))
    todo = {b: p for b, p in all_archives.items()
            if not any(e.startswith(b) for e in existing)}

    total = len(todo)
    print(f'Archives to extract: {total}')
    if total == 0:
        print('Nothing to do.')
        return

    counts = {'ok': 0, 'no-binary': 0, 'error': 0, 'already-exists': 0}
    done = 0

    # Use threads for I/O-bound extraction; unar itself is single-threaded
    workers = min(6, os.cpu_count() or 2)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(extract_one, b, p): b for b, p in todo.items()}
        for fut in as_completed(futs):
            base, status = fut.result()
            counts[status] = counts.get(status, 0) + 1
            done += 1
            pct = int(done / total * 40)
            bar = '=' * pct + '>' + ' ' * (39 - pct)
            sys.stdout.write(f'\r[{bar}] {done}/{total}  ok:{counts["ok"]} no-bin:{counts["no-binary"]} err:{counts.get("error",0)}  ')
            sys.stdout.flush()

    print(f'\n\nDone. ok={counts["ok"]} no-binary={counts["no-binary"]} errors={counts.get("error",0)}')
    print(f'\nNow run:  cd web/backend && npx tsx ../../dev/scripts/door-corpus/add-missing-doors.ts')

if __name__ == '__main__':
    main()
