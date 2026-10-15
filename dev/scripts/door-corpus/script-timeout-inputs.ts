#!/usr/bin/env node
/**
 * script-timeout-inputs.ts — for each timeout-bucket door, inspect
 * the golden output and add `integration.inputs` to drive the door
 * past whatever prompt left it idling.
 *
 * Heuristics (last 300 chars of golden):
 *   - "(y/n)" or "(Y/N)" or "[y/n]" → send "n\r"
 *   - "press <return>" / "press any key" / "hit a key" → send "\r"
 *   - menu line "[Q]" / "[X]" / "[EX!]" or BBS main menu present
 *     → send "g\r" (LogOff command) then "\r"
 *   - empty golden → blast 3 spaced RETURNs (door may be waiting
 *     for input before rendering)
 *   - otherwise → send RETURN, then "q\r", then RETURN
 *
 * Every door also gets timeoutMs: 14000 to give the inputs time
 * to fire (timers up to 9 s) without exceeding the runner's
 * 15 s wall-clock guard.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const GOLDENS = path.join(REPO_ROOT, "dev/scripts/door-corpus/goldens");

interface IntegrationInput {
  delayMs: number;
  data: string;
}
interface IntegrationBlock {
  timeoutMs?: number;
  inputs?: IntegrationInput[];
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

const YN_RE = /[(\[]y\s*\/\s*n[)\]]/i;
const RETURN_RE =
  /press\s*(<\s*return\s*>|any\s+key|a\s+key|enter|return|the\s+return\s+key)/i;
const MAIN_MENU_RE = /\[U\]\s*-\s*UPLOAD|\[J\]\s*-\s*JOIN/i;

function pickInputs(raw: string): IntegrationInput[] {
  if (raw.trim().length === 0) {
    return [
      { delayMs: 1500, data: "\r" },
      { delayMs: 4000, data: "\r" },
      { delayMs: 8000, data: "q\r" },
    ];
  }
  const tail = raw.slice(-400);
  if (YN_RE.test(tail)) {
    return [
      { delayMs: 1500, data: "n\r" },
      { delayMs: 3500, data: "\r" },
    ];
  }
  if (RETURN_RE.test(tail)) {
    return [
      { delayMs: 1500, data: "\r" },
      { delayMs: 3500, data: "\r" },
      { delayMs: 6000, data: "q\r" },
    ];
  }
  if (MAIN_MENU_RE.test(raw)) {
    return [
      { delayMs: 1500, data: "g\r" },
      { delayMs: 3500, data: "y\r" },
      { delayMs: 6000, data: "\r" },
    ];
  }
  return [
    { delayMs: 1500, data: "\r" },
    { delayMs: 4000, data: "q\r" },
    { delayMs: 7000, data: "\r" },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlySet = onlyArg
    ? new Set(onlyArg.slice("--only=".length).split(","))
    : null;
  if (!onlySet) {
    process.stderr.write("--only=<comma-separated ids> required\n");
    process.exit(2);
  }

  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };

  let updated = 0;
  for (const entry of corpus.doors) {
    if (!onlySet.has(entry.id)) continue;
    const goldenPath = path.join(GOLDENS, entry.id, "integration.txt");
    const raw = fs.existsSync(goldenPath)
      ? fs.readFileSync(goldenPath, "utf8")
      : "";
    const inputs = pickInputs(raw);
    entry.integration = {
      ...(entry.integration ?? {}),
      timeoutMs: 14000,
      inputs,
    };
    updated++;
    if (dryRun) {
      process.stdout.write(
        `${entry.id}: inputs=${JSON.stringify(inputs)}\n`,
      );
    }
  }
  if (!dryRun) {
    fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + "\n");
  }
  process.stdout.write(
    `[script-inputs] updated=${updated}${dryRun ? " (dry-run)" : ""}\n`,
  );
}

main();
