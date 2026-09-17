#!/usr/bin/env tsx
/**
 * Import a published teletext archive into a service pack on this board.
 *
 * Teletext survives because enthusiasts recovered it off home VHS tapes,
 * frame by frame, and published the result. This turns one of those
 * publications into something the TELETEXT door can browse.
 *
 * The download lives here and nowhere else: sdk/teletext/import.ts takes a
 * local directory or zip, so everything except the transfer is testable
 * without a network.
 *
 *   npx tsx dev/scripts/teletext/import-archive.ts <source> --id <service-id> [options]
 *
 * <source> may also be a GitHub folder URL, which is how the restoration
 * project actually publishes its restored pages - a directory of individual
 * .t42 files, no archive at all:
 *
 *   https://github.com/teletext-restoration/teletext-restoration/tree/master/1997/1997-03-17/CH4
 *
 * Files are fetched from raw.githubusercontent.com. That matters: the
 * GitHub API's base64 content path hands back UTF-8-mangled bytes for a
 * binary file (1544 bytes where the file is 1050), and a .t42 whose length
 * is no longer a multiple of 42 parses as nothing at all.
 *
 * <source> is otherwise an http(s) URL, a local archive, or a local directory. The
 * published archives are mostly .7z (teletext-restoration's recoveries live
 * at temp.zxnet.co.uk as .7z), so that is handled too - by shelling out to
 * the 7-Zip binary, which is why it lives in this script and not in the SDK.
 *
 * Options:
 *   --id <id>          pack directory and service id           (required)
 *   --title "..."      what a caller sees in the service list
 *   --source <url>     where it came from, for the manifest    (defaults to <source>)
 *   --credit "..."     who recovered it
 *   --licence "..."    the terms it is published under
 *   --home 100         the page a caller lands on
 *   --subset english   the G0 national option sub-set
 *   --notes "..."      anything worth knowing about the recovery
 *   --root <dir>       the Teletext directory, if not this board's
 *   --force            add to a pack that already exists
 *
 * Example:
 *   npx tsx dev/scripts/teletext/import-archive.ts \
 *     https://example.invalid/ceefax-1988.zip \
 *     --id ceefax-1988 --title "Ceefax 1988" \
 *     --credit "recovered by ..." --licence "..."
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { importIntoPack, type ImportOptions } from '../../../sdk/teletext/import';
import { teletextRoot } from '../../../sdk/teletext/library';
import type { NationalSubset } from '../../../sdk/teletext/marco/model/types';

/** A download that stalls mid-stream is caught by the same signal. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const source = argv.find(arg => !arg.startsWith('--'));
  if (!source || argv.includes('--help')) return usage();

  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };

  const id = flag('id');
  if (!id) return usage('--id is required');

  const options: ImportOptions = {
    id,
    title: flag('title'),
    source: flag('source') ?? (isUrl(source) ? source : undefined),
    credit: flag('credit'),
    licence: flag('licence'),
    homePage: flag('home'),
    subset: flag('subset') as NationalSubset | undefined,
    notes: flag('notes'),
    root: flag('root'),
    force: argv.includes('--force'),
  };

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-import-'));
  try {
    const downloaded = isGitHubFolder(source)
      ? await downloadGitHubFolder(source, scratch)
      : isUrl(source)
        ? await download(source, scratch)
        : source;
    const local = is7z(downloaded) ? unpack7z(downloaded, scratch) : downloaded;
    const result = importIntoPack(local, options);

    console.log(`pack:     ${result.dir}`);
    console.log(`manifest: ${result.manifestPath}`);
    console.log(`imported: ${result.imported.length} page files`);
    if (result.uncertain.length > 0) {
      // The restoration team's own confidence, kept rather than flattened:
      // -maybe is a page they are not sure about, -nocrc one the broadcast
      // carried no checksum for.
      console.log(`uncertain: ${result.uncertain.length} marked -maybe or -nocrc by the recovery`);
    }
    if (result.notesFile) console.log(`notes:    ${result.notesFile} (recovery credit kept with the pack)`);
    if (result.skipped.length > 0) {
      console.log(`skipped:  ${result.skipped.length}`);
      // Every skip is named. An archive quietly losing half its pages to a
      // parser is exactly the thing this should not do silently.
      for (const { file, reason } of result.skipped.slice(0, 20)) {
        console.log(`          ${file}: ${reason}`);
      }
      if (result.skipped.length > 20) {
        console.log(`          ... and ${result.skipped.length - 20} more`);
      }
    }
    if (!options.root) console.log(`\nthe door reads packs from ${teletextRoot()}`);
    if (result.imported.length === 0) process.exitCode = 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

const GITHUB_FOLDER = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/i;

function isGitHubFolder(source: string): boolean {
  return GITHUB_FOLDER.test(source);
}

/**
 * Fetch a folder of individual files out of a GitHub repository.
 *
 * The restoration project publishes restored pages as one .t42 per page in
 * a directory, so there is no archive to download - just several hundred
 * small files. The listing comes from the contents API (metadata, which is
 * safe to read as JSON) and every file comes from raw.githubusercontent.com
 * (bytes, which is not).
 *
 * The recovery's notes files sit in the parent directory rather than beside
 * the pages, and they carry the credit, so they are collected too.
 */
async function downloadGitHubFolder(source: string, scratch: string): Promise<string> {
  const match = GITHUB_FOLDER.exec(source);
  if (!match) throw new Error(`${source} is not a GitHub folder URL`);
  const [, owner, repo, ref, folder] = match;

  const into = path.join(scratch, 'folder');
  fs.mkdirSync(into, { recursive: true });

  const wanted = await listGitHubFiles(owner, repo, ref, folder);
  // The notes live one level up, beside the raw recording rather than with
  // the restored pages.
  const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
  const notes = parent
    ? (await listGitHubFiles(owner, repo, ref, parent)).filter(name => /notes|readme/i.test(name))
    : [];

  console.log(`${wanted.length} files in ${folder}${notes.length ? ` (+${notes.length} notes)` : ''}`);

  let done = 0;
  const fetchOne = async (folderPath: string, name: string): Promise<void> => {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodeURI(folderPath)}/${encodeURIComponent(name)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { 'User-Agent': 'amiexpress-web teletext importer' },
    });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    // arrayBuffer, never text(): decoding a .t42 as a string is exactly the
    // mangling this whole function exists to avoid.
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(into, name), bytes);
    done++;
    if (done % 100 === 0) console.log(`  ${done} files`);
  };

  // A handful at a time: polite to the host, and fast enough that several
  // hundred small files take seconds.
  const queue = [
    ...wanted.map(name => [folder, name] as const),
    ...notes.map(name => [parent, name] as const),
  ];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await fetchOne(next[0], next[1]);
    }
  });
  await Promise.all(workers);

  console.log(`fetched ${done} files`);
  return into;
}

async function listGitHubFiles(
  owner: string,
  repo: string,
  ref: string,
  folder: string,
): Promise<string[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(folder)}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: {
      'User-Agent': 'amiexpress-web teletext importer',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) throw new Error(`listing ${folder}: HTTP ${response.status}`);
  const entries = (await response.json()) as { type: string; name: string }[];
  return entries.filter(entry => entry.type === 'file').map(entry => entry.name);
}

function is7z(source: string): boolean {
  return path.extname(source).toLowerCase() === '.7z';
}

/**
 * Unpack a .7z, because that is what the recoveries are published as.
 *
 * Shelled out rather than done in process: there is no 7-Zip reader in this
 * repo's dependencies, and adding one to the SDK - which every door loads -
 * to serve a sysop-run import script would be the wrong place to pay for
 * it. A missing binary is reported by name rather than as a spawn error.
 */
function unpack7z(archive: string, scratch: string): string {
  const into = path.join(scratch, 'unpacked');
  fs.mkdirSync(into, { recursive: true });

  const candidates = ['7zz', '7z', '7za'];
  for (const binary of candidates) {
    try {
      execFileSync(binary, ['x', '-y', `-o${into}`, archive], { stdio: 'pipe' });
      console.log(`unpacked ${path.basename(archive)} with ${binary}`);
      return into;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      throw new Error(`${binary} could not unpack ${archive}: ${(error as Error).message}`);
    }
  }

  throw new Error(
    `${path.basename(archive)} is a .7z and no 7-Zip binary was found. ` +
      `Install one (brew install sevenzip, or apt install p7zip-full) and run this again, ` +
      `or unpack it yourself and point this script at the folder.`,
  );
}

/**
 * Fetch to a file in the scratch directory.
 *
 * Streams while hashing rather than buffering an archive in memory, and
 * writes to a temporary name first so an interrupted download can never be
 * mistaken for a complete one - the same discipline as the door repo
 * client (Doors/door-manager/repo-client.ts).
 */
async function download(url: string, into: string): Promise<string> {
  const name = path.basename(new URL(url).pathname) || 'archive.zip';
  const partial = path.join(into, `${name}.part`);
  const target = path.join(into, name);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { 'User-Agent': 'amiexpress-web teletext importer' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  const hash = crypto.createHash('sha256');
  const body = Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream);
  body.on('data', chunk => hash.update(chunk));
  await pipeline(body, fs.createWriteStream(partial));
  fs.renameSync(partial, target);

  const size = fs.statSync(target).size;
  console.log(`downloaded ${name}: ${size} bytes, sha256 ${hash.digest('hex').slice(0, 16)}...`);
  return target;
}

function usage(problem?: string): void {
  if (problem) console.error(`error: ${problem}\n`);
  console.error(
    'usage: npx tsx dev/scripts/teletext/import-archive.ts <source> --id <service-id> [--title ...]\n' +
      '       <source> is an http(s) URL to a .zip or page file, a local .zip, or a local directory.\n' +
      '       See the header of this file for every option.',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
