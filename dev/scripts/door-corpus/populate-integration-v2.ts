#!/usr/bin/env node
/**
 * populate-integration-v2.ts — smarter signature-line picker for
 * integration goldens.
 *
 * v1 picked "longest non-blank line" as `mustContain`. For ~85
 * doors that line was non-deterministic (session-id dumps, dates,
 * block-graphic ANSI art, wide rule lines) — the resulting
 * assertion was fragile and the corpus integration runner failed
 * 149/324.
 *
 * v2 filters out unstable line shapes and scores the rest by how
 * likely the content is to fingerprint the door (name match,
 * version, credit string, banner brackets).
 *
 * Rejected line shapes (do NOT consider as candidates):
 *   - length < 12 or > 100
 *   - unique-char count < 8           (wide rule lines `____`, `░░░`)
 *   - any single char >= 60% of line  (rule lines / padding)
 *   - >50% bytes outside ASCII printable 0x20..0x7E
 *                                     (block-graphic ANSI art)
 *   - shannon entropy > 4.8 bits/char (looks like a random dump)
 *   - matches a date pattern (MM-DD-YY, MM/DD/YY, YYYY-MM-DD)
 *   - matches "Scanning dir N for", "Today", "Last call"
 *     (per-run dynamic content)
 *
 * Score on remaining:
 *   +10 if contains door's name (after trimming version suffix)
 *   +5  if contains a version token (v0.0, V1.2, etc.)
 *   +5  if contains a credit token (\bBy\b, \bby\b, (c), Copyright)
 *   +3  if contains brackets `[...]`
 *   +1  per length/30
 *
 * Pick top 2 distinct lines. If none score above 0, fall back to
 * mustNotContain-only.
 *
 * Defaults applied to every populated entry:
 *   - timeoutMs: 15000
 *   - mustNotContain: ["TRAP", "PANIC", "Guru", "Software failure"]
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

const DATE_RE =
  /\b(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(:\d{2})?\b)/;
const DYNAMIC_RE = /\b(Scanning dir|Today|Last call|Time used|Time left)\b/i;
// Shaded block / half-block Unicode graphics. Stable banners use
// ASCII (`-`, `[`, `]`) or box-drawing (`│`, `─`) — never these.
// Any occurrence is a strong signal of layout-sensitive ANSI art.
const SHADED_BLOCK_RE = /[░▒▓█▌▐■□▪▫▀▄]/;
// BBS chrome menu rows: short `[X]` token followed by ` - WORD`,
// e.g. " [U] - UPLOAD FILE(S)   [D] - DOWNLOAD". Two or more such
// segments on one line == command-prompt chrome (overlaid /
// re-rendered by doors with shifted spacing → drift). Reject.
// Banners using `[ AquaScan v1.0 ... ]` (content has spaces) are
// not matched because the inside-bracket class excludes spaces.
const CHROME_MENU_SEG_RE = /\[[A-Z0-9<>!?]{1,5}\][^A-Z]*[A-Z]/g;
function isChromeMenuLine(line: string): boolean {
  const matches = line.match(CHROME_MENU_SEG_RE);
  return !!matches && matches.length >= 2;
}
// Mirror runner's ANSI_STRIP exactly — the integration runner
// substring-matches against ANSI-stripped raw output, so our
// stored `mustContain` must be ANSI-stripped too. Single-char
// ESC sequences (e.g. ESC c = RIS) are NOT stripped by the
// runner, but the golden retains them — substring match still
// works after we drop them from the needle.
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ANSI_SINGLE_RE = /\x1b[^\[]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_CSI_RE, "").replace(ANSI_SINGLE_RE, "");
}

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const len = s.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
}

function dominantCharRatio(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  return max / s.length;
}

function asciiPrintableRatio(s: string): number {
  let n = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) n++;
  }
  return n / s.length;
}

function trimNameStem(name: string): string {
  // "5D-AutoFree V0.01" -> "5D-AutoFree"
  // "WHO v2.0"          -> "WHO"
  // Strip trailing version token if present.
  return name
    .replace(/\s+[vV]\d+(\.\d+)*\s*$/, "")
    .replace(/\s+\d+(\.\d+)+\s*$/, "")
    .trim();
}

function isRejectedShape(line: string): boolean {
  if (line.length < 12 || line.length > 100) return true;
  const uniq = new Set(line).size;
  if (uniq < 8) return true;
  if (dominantCharRatio(line) >= 0.6) return true;
  if (asciiPrintableRatio(line) < 0.85) return true;
  if (SHADED_BLOCK_RE.test(line)) return true;
  if (isChromeMenuLine(line)) return true;
  if (shannonEntropy(line) > 4.8) return true;
  if (DATE_RE.test(line)) return true;
  if (DYNAMIC_RE.test(line)) return true;
  return false;
}

function scoreLine(line: string, nameStem: string): number {
  let score = 0;
  const lower = line.toLowerCase();
  const stem = nameStem.toLowerCase();
  if (stem.length >= 3 && lower.includes(stem)) score += 10;
  if (/\b[vV]\d+\.\d+/.test(line)) score += 5;
  if (/\bby\b|\(c\)|copyright/i.test(line)) score += 5;
  if (/\[[^\]]{2,}\]/.test(line)) score += 3;
  score += Math.min(3, Math.floor(line.length / 30));
  return score;
}

function pickSignatureLines(raw: string, doorName: string): string[] {
  const stem = trimNameStem(doorName);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => stripAnsi(l).trimEnd())
    .filter((l) => l.length > 0);

  const scored: { line: string; score: number }[] = [];
  for (const l of lines) {
    if (isRejectedShape(l)) continue;
    const s = scoreLine(l, stem);
    if (s > 0) scored.push({ line: l, score: s });
  }

  scored.sort((a, b) => b.score - a.score);

  // Keep only the top-1 line by default. A second line is only
  // added if it scores >= 10 (i.e. it independently contains the
  // door's name) — otherwise a moderately-scored second line
  // (chrome menu, dynamic stats row) just adds drift risk
  // without fingerprint value.
  // Require the top line to score >= 6. A line that only earns
  // length+brackets bonus (no name/version/credit) is BBS chrome
  // or accidental ASCII art — not a fingerprint. Better to fall
  // back to mustNotContain-only than codify drift bait.
  const TOP_THRESHOLD = 6;
  const picked: string[] = [];
  for (const { line, score } of scored) {
    if (score < TOP_THRESHOLD) break;
    const trimmed = line.replace(/^\s+/, "");
    if (picked.includes(trimmed)) continue;
    if (picked.length === 0) {
      picked.push(trimmed);
      continue;
    }
    if (score >= 10) {
      picked.push(trimmed);
      break;
    }
    break;
  }
  return picked.map((s) => s.slice(0, 80));
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlySet = onlyArg
    ? new Set(onlyArg.slice("--only=".length).split(","))
    : null;

  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };

  let populated = 0;
  let skipped = 0;
  let noGolden = 0;
  let noCandidate = 0;
  const changes: { id: string; before?: string[]; after: string[] }[] = [];

  for (const entry of corpus.doors) {
    if (onlySet && !onlySet.has(entry.id)) {
      skipped++;
      continue;
    }
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
    const before = entry.integration?.assertions?.mustContain;
    // Preserve siblings of `assertions` (inputs, expectedSubState,
    // any timeoutMs the caller set). v2 only owns the assertion
    // block — `script-timeout-inputs.ts` owns inputs+timeoutMs.
    const prev = entry.integration ?? {};
    if (raw.trim().length === 0) {
      entry.integration = {
        ...prev,
        timeoutMs: prev.timeoutMs ?? 15000,
        assertions: {
          mustNotContain: STABLE_DEFAULTS.mustNotContain,
        },
      };
      populated++;
      changes.push({ id: entry.id, before, after: [] });
      continue;
    }
    const sigs = pickSignatureLines(raw, entry.name);
    if (sigs.length === 0) noCandidate++;
    entry.integration = {
      ...prev,
      timeoutMs: prev.timeoutMs ?? 15000,
      assertions: {
        ...(sigs.length > 0 ? { mustContain: sigs } : {}),
        mustNotContain: STABLE_DEFAULTS.mustNotContain,
      },
    };
    populated++;
    changes.push({ id: entry.id, before, after: sigs });
  }

  if (!dryRun) {
    fs.writeFileSync(
      CORPUS,
      JSON.stringify(corpus, null, 2) + "\n",
    );
  }
  process.stdout.write(
    `[populate-v2] populated=${populated} skipped=${skipped} no-golden=${noGolden} no-candidate=${noCandidate}${dryRun ? " (dry-run)" : ""}\n`,
  );

  if (dryRun) {
    for (const c of changes.slice(0, 20)) {
      process.stdout.write(
        `--- ${c.id}\n  before: ${JSON.stringify(c.before)}\n  after:  ${JSON.stringify(c.after)}\n`,
      );
    }
  }
}

main();
