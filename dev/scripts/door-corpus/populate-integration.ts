#!/usr/bin/env node
/**
 * populate-integration.ts — fill in `integration:` blocks for every
 * corpus entry that has a captured integration.txt golden but no
 * `integration` field in corpus.json yet.
 *
 * Heuristic for mustContain: pick up to two stable signature lines.
 *   1. The longest non-blank line in the captured output (typically
 *      the banner / heading) — strong content fingerprint.
 *   2. The first line containing the door's name (case-insensitive)
 *      — author-identifying string, robust to color/layout changes.
 *
 * Defaults applied to every populated entry:
 *   - timeoutMs: 15000
 *   - mustNotContain: ["TRAP", "PANIC", "Guru", "Software failure"]
 *     — catches crash-with-banner false positives directly.
 *
 * Run after `corpus-integration-runner.ts --capture-all`.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const GOLDENS = path.join(REPO_ROOT, "dev/scripts/door-corpus/goldens");

interface IntegrationBlock {
  timeoutMs?: number;
  assertions?: {
    mustContain?: string[];
    mustNotContain?: string[];
    expectedSubState?: string;
  };
}

interface CorpusEntry {
  id: string;
  name: string;
  integration?: IntegrationBlock;
}

const STABLE_DEFAULTS = {
  mustNotContain: ["TRAP", "PANIC", "Guru", "Software failure"],
};

function pickSignatureLines(raw: string, doorName: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 6); // skip short noise

  const sigs: string[] = [];

  // 1) longest non-blank line — banner / heading
  let longest = "";
  for (const l of lines) {
    if (l.length > longest.length) longest = l;
  }
  if (longest) sigs.push(longest);

  // 2) first line containing the door's name (case-insensitive)
  const nameLower = doorName.toLowerCase();
  for (const l of lines) {
    if (l.toLowerCase().includes(nameLower) && !sigs.includes(l)) {
      sigs.push(l);
      break;
    }
  }

  // Trim to reasonable assertion size (banners can have repeated chars).
  return sigs.map((s) => s.slice(0, 80)).slice(0, 2);
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force"); // overwrite existing integration blocks

  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };

  let populated = 0;
  let skipped = 0;
  let noGolden = 0;

  for (const entry of corpus.doors) {
    if (entry.integration && !force) {
      skipped++;
      continue;
    }
    const goldenPath = path.join(GOLDENS, entry.id, "integration.txt");
    if (!fs.existsSync(goldenPath)) {
      noGolden++;
      continue;
    }
    const raw = fs.readFileSync(goldenPath, "utf8");
    if (raw.trim().length === 0) {
      // Door ran but emitted nothing meaningful — skip to avoid empty
      // mustContain. Still record so the corpus tracks coverage.
      entry.integration = {
        timeoutMs: 15000,
        assertions: {
          mustNotContain: STABLE_DEFAULTS.mustNotContain,
        },
      };
      populated++;
      continue;
    }
    const sigs = pickSignatureLines(raw, entry.name);
    entry.integration = {
      timeoutMs: 15000,
      assertions: {
        ...(sigs.length > 0 ? { mustContain: sigs } : {}),
        mustNotContain: STABLE_DEFAULTS.mustNotContain,
      },
    };
    populated++;
  }

  // Preserve original key ordering — write the field through if it
  // already existed, append at end if new.
  fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + "\n");
  process.stdout.write(
    `[populate] populated=${populated} skipped=${skipped} no-golden=${noGolden}\n`,
  );
}

main();
