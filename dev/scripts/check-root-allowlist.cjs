#!/usr/bin/env node
/**
 * THE REPOSITORY ROOT HOLDS ONLY THE BOARD TREE AND A FIXED LIST OF PROJECT
 * ENTRIES.
 *
 * This repository is also the live AmiExpress board: express reads `Node*`,
 * `Conf*`, `Screens/`, the root `*.info` icons and friends from disk at their
 * Amiga names, so those entries live at the root and never move. Everything
 * else at the root is a project entry, and each one has an owner below.
 *
 * Before the 2026-11-05 cleanup the root had collected ad-hoc test scripts,
 * run output, backups, tool caches and dead deploy configs, and nobody could
 * tell board data from litter. This list is the gate that keeps it tidy: a
 * new root entry that is neither board data nor a listed project entry fails
 * the pre-push hook and `web/backend/tests/repo/root-allowlist.test.ts`, which
 * both use this file, so the two can never disagree.
 *
 * Adding a root entry on purpose: add it to PROJECT_ENTRIES with its owner and
 * update the "Repository layout" section of RULES.md. Anything else belongs in
 * `dev/`, `Documentation/`, `thoughts/` or the package it serves.
 *
 * Usage:
 *   node dev/scripts/check-root-allowlist.cjs            # check HEAD's tree
 *   node dev/scripts/check-root-allowlist.cjs --quiet    # exit code only
 */
'use strict';

const { execFileSync } = require('child_process');

/**
 * Board data the AmiExpress tree reads at these exact names (the hard
 * constraint list of thoughts/shared/plans/2026-11-05-repo-cleanup.md).
 */
const BOARD_ENTRIES = new Set([
  '!ASCII-Art', 'ACP', 'Access', 'AmiXnet', 'BBSHelp.txt', 'BBSHelp.txt.gr',
  'Beeb', 'Bulletins', 'C', 'Commands', 'Conf.DB', 'Devs', 'Doors', 'FCheck',
  'HELP', 'L', 'Languages', 'Libs', 'Partdownload', 'Prompts', 'Protocols',
  'RIPgraphics', 'Resources', 'S', 'Screens', 'Storage', 'SysLogs',
  'SysopStats', 'System', 'SystemStats', 'Teletext', 'Themes', 'Utils', 'Zoom',
  'acp.dat', 'acpConnections.dat', 'cplistan1000.dat', 'debug', 'express',
  'history',
]);

/** Board entries that come in numbered or iconified families. */
const BOARD_PATTERNS = [
  /^Node\d+$/, // per-node directories
  /^Conf\d+$/, // conference directories
  /^batch\d+$/, // node start scripts
  /\.info$/, // Workbench icons and the tooltypes they carry
];

/** Project entries, each with the owner a reader needs to find its rules. */
const PROJECT_ENTRIES = {
  '.claude': 'Claude Code project settings and agent state',
  '.dockerignore': 'Docker build context filter',
  '.env.example': 'environment template for local setup',
  '.gitattributes': 'git line-ending and binary rules',
  '.github': 'GitHub workflows and Copilot config',
  '.gitignore': 'git ignore rules',
  '.mcp.json': 'MCP server registration (servers live in dev/mcp)',
  '.nvmrc': 'Node version pin',
  '.vscode': 'shared editor settings',
  'CLAUDE.md': 'agent entry point; points at RULES.md',
  'Dockerfile': 'the board image',
  'Documentation': 'living guides',
  'README.md': 'first-time setup',
  'RULES.md': 'project rules, single source of truth',
  'bots': 'chat bridge bots (WHIP Discord mirror)',
  'configs': '68K door corpus fixtures (Daydream:Configs/ fallback)',
  'data': 'Amiga ROMs for the emulators',
  'deploy': 'Hetzner host scripts',
  'dev': 'dev scripts, hooks, MCP servers',
  'docker': 'scripts that run inside the image',
  'docker-compose.yml': 'local and live compose file',
  'docker-entrypoint.sh': 'image entrypoint and volume seeding',
  'examples': 'door examples',
  'handoff.md': 'current session handoff (RULES.md requires it)',
  'package-lock.json': 'root npm lockfile',
  'package.json': 'root npm workspace',
  'packages': 'shared npm packages (terminal and friends)',
  'sdk': 'door SDK',
  'thoughts': 'plans, research and handoffs',
  'tools': 'local lha binary for the door packer fallback',
  'vamos-config.yaml': 'vamos 68K emulator settings (owner unconfirmed)',
  'vendor': 'third-party code: jsbeeb, NDK3.2R4',
  'web': 'backend, frontend and admin apps',
};

function isAllowed(name) {
  if (BOARD_ENTRIES.has(name)) return true;
  if (Object.prototype.hasOwnProperty.call(PROJECT_ENTRIES, name)) return true;
  return BOARD_PATTERNS.some((pattern) => pattern.test(name));
}

/** Root entries git tracks at `ref`. */
function rootEntries(repoRoot, ref = 'HEAD') {
  return execFileSync('git', ['ls-tree', '--name-only', '-z', ref], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

/** The root entries that are neither board data nor a listed project entry. */
function findStrays(entries) {
  return entries.filter((name) => !isAllowed(name)).sort();
}

function describe(strays) {
  return [
    `Not allowed at the repository root: ${strays.join(', ')}`,
    'Move it into dev/, Documentation/, thoughts/ or the package it serves.',
    'A new root entry on purpose: add it with its owner to PROJECT_ENTRIES in',
    'dev/scripts/check-root-allowlist.cjs and to "Repository layout" in RULES.md.',
  ].join('\n');
}

module.exports = { BOARD_ENTRIES, BOARD_PATTERNS, PROJECT_ENTRIES, isAllowed, rootEntries, findStrays, describe };

if (require.main === module) {
  const quiet = process.argv.includes('--quiet');
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const strays = findStrays(rootEntries(repoRoot));
  if (strays.length > 0) {
    if (!quiet) console.error(describe(strays));
    process.exit(1);
  }
  if (!quiet) console.log('[OK] repository root holds only board data and listed project entries');
}
