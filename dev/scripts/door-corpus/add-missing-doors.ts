#!/usr/bin/env node
/**
 * add-missing-doors.ts — scan `Doors/` for sub-directories with
 * an executable that isn't yet in `corpus.json`, generate a
 * minimal corpus entry for each, and write the updated corpus.
 *
 * Heuristic per door:
 *   - id      = lowercase dir name with non-alnum → underscore
 *   - name    = first executable file's name
 *   - binary  = `Doors/<dir>/<executable>`
 *   - doorType = XIM (most common; can be retyped per-door later)
 *   - command = derived from binary name, uppercased; multi-word
 *               binaries get truncated to first 16 chars
 *   - notes  = "auto-added from Doors/<dir>; needs capture +
 *              triage". Tags as 'auto-generated' so we can find
 *              them later.
 *
 * Goldens / inputs come later via per-door capture + v2 populator
 * + script-timeout-inputs. This script ONLY adds corpus entries.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const DOORS_DIR = path.join(REPO_ROOT, "Doors");

function makeId(dirName: string): string {
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isAmigaHunk(p: string): boolean {
  // Amiga AmigaOS executable starts with HUNK_HEADER = 0x000003F3
  // in big-endian. First 4 bytes must be 00 00 03 F3.
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return (
      buf[0] === 0x00 &&
      buf[1] === 0x00 &&
      buf[2] === 0x03 &&
      buf[3] === 0xf3
    );
  } catch {
    return false;
  }
}

function pickExecutable(dir: string): string | null {
  const dirPath = path.join(DOORS_DIR, dir);
  const files = fs.readdirSync(dirPath);
  // Try files with the Amiga HUNK_HEADER magic first — these are
  // real AmigaOS executables. Skip hidden/.info/build artifacts.
  const candidates = files.filter(
    (f) =>
      !f.startsWith(".") &&
      !f.match(/^(Makefile|core|Count|Text|README|FILE_ID|.*\.bbs|.*\.info|.*\.txt|.*\.cfg|.*\.dat|.*\.data|.*\.o|.*\.c|.*\.h|.*\.s|.*\.asm|.*\.ts|.*\.js|.*\.md)$/i),
  );
  for (const f of candidates) {
    const full = path.join(dirPath, f);
    if (fs.statSync(full).isFile() && isAmigaHunk(full)) return f;
  }
  return null;
}

function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: Array<{ id: string; binary?: string }>;
  };

  const existingIds = new Set(corpus.doors.map((d) => d.id));
  const existingBins = new Set(
    corpus.doors.map((d) => d.binary).filter(Boolean) as string[],
  );

  const allDirs = fs
    .readdirSync(DOORS_DIR)
    .filter((d) => {
      const p = path.join(DOORS_DIR, d);
      return fs.statSync(p).isDirectory() && !d.startsWith(".");
    });

  let added = 0;
  let skipped = 0;

  for (const dir of allDirs) {
    const exec = pickExecutable(dir);
    if (!exec) {
      skipped++;
      continue;
    }
    const binary = `Doors/${dir}/${exec}`;
    if (existingBins.has(binary)) {
      skipped++;
      continue;
    }
    let id = makeId(dir);
    // Disambiguate against existing IDs
    let dedupSuffix = 2;
    while (existingIds.has(id)) {
      id = `${makeId(dir)}_${dedupSuffix++}`;
    }
    existingIds.add(id);

    const command = exec.toUpperCase().slice(0, 16);
    corpus.doors.push({
      id,
      name: exec,
      // @ts-expect-error — fields beyond {id, binary} are loose
      category: "auto-added",
      binary,
      doorType: "XIM",
      command,
      timeoutMs: 30000,
      notes: `auto-added from Doors/${dir}; needs capture + triage`,
      integration: {
        timeoutMs: 14000,
        inputs: [
          { delayMs: 1500, data: "\r" },
          { delayMs: 4000, data: "q\r" },
          { delayMs: 7000, data: "\r" },
        ],
        assertions: {
          mustNotContain: ["TRAP", "PANIC", "Guru", "Software failure"],
        },
      },
    });
    added++;
  }

  fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + "\n");
  process.stdout.write(
    `[add-missing] added=${added} skipped=${skipped} total-corpus=${corpus.doors.length}\n`,
  );
}

main();
