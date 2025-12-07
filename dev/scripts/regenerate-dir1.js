#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INDENT_33 = ' '.repeat(33);

function formatFileSize(bytes) {
  const kb = Math.ceil(bytes / 1024);
  return `${kb}K`.padStart(6, ' ');
}

function formatUploadDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTHS[date.getMonth()] || 'Jan';
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function buildDirEntryLine(filename, fileSize, uploadDate, description, statusMarker, isLCFile = false) {
  const filenamePadded = filename.padEnd(13, ' ');
  const sizeStr = formatFileSize(fileSize);
  const dateStr = formatUploadDate(uploadDate);
  let line = `${filenamePadded}${sizeStr}  ${dateStr}  ${description}`;

  if (line.length > 0 && line[line.length - 1] !== '\r' && line[line.length - 1] !== '\n') {
    line += '\n';
  }

  if (filename.length < 13) {
    const chars = Array.from(line);
    chars[13] = statusMarker;
    line = chars.join('');
  }

  return line;
}

function buildDescriptionLines(lines) {
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => `${INDENT_33}${line}\n`)
    .join('');
}

function buildSentByLine(username) {
  const name = username || 'sysop';
  return `${INDENT_33}Sent by: ${name}\n`;
}

function parseDirLine(line) {
  if (!line || line.trim().length === 0) return null;
  const parts = line.split('|');
  if (parts.length < 6) return null;

  const filename = parts[0].trim().toUpperCase();
  if (!filename) return null;

  const fileSize = Number(parts[1]) || 0;
  const uploader = parts[2] || 'sysop';
  const timestamp = Number(parts[3]) || 0;
  const descriptionRaw = parts.slice(5).join('|');

  let description = descriptionRaw.replace(/\r/g, '').replace(/\n/g, '\n').replace(/¦/g, '|');
  description = description.replace(/\\n/g, '\n');

  const uploadDate = new Date(timestamp * 1000);

  return { filename, fileSize, uploader, uploadDate, description };
}

function buildDirEntry(entry) {
  const descLines = entry.description.split('\n');
  const firstLine = descLines.shift() || '';
  const additionalLines = descLines.map(line => line.replace(/\r$/, ''));

  let text = buildDirEntryLine(entry.filename, entry.fileSize, entry.uploadDate, firstLine, 'P', false);
  if (additionalLines.length > 0) {
    text += buildDescriptionLines(additionalLines);
  }
  text += buildSentByLine(entry.uploader);
  return text;
}

function gatherEntriesFromFilesDir(filesDir) {
  if (!fs.existsSync(filesDir)) return [];
  const entries = [];
  const items = fs.readdirSync(filesDir);
  for (const item of items) {
    if (!item.toLowerCase().endsWith('.dir')) continue;
    const lines = fs.readFileSync(path.join(filesDir, item), 'latin1').split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseDirLine(line);
      if (parsed) {
        entries.push(parsed);
      }
    }
  }
  return entries;
}

function regenerateDir1(confNumber) {
  const confPath = path.join(process.cwd(), `Conf${confNumber}`);
  const filesDir = path.join(confPath, 'Files');
  const dirPath = path.join(confPath, 'DIR1');

  if (!fs.existsSync(confPath)) {
    console.warn(`[DirBuilder] Conference directory not found: ${confPath}`);
    return;
  }

  const entries = gatherEntriesFromFilesDir(filesDir);
  if (entries.length === 0) {
    console.info(`[DirBuilder] No .dir entries for Conf${confNumber}. Skipping DIR1 generation.`);
    return;
  }

  fs.writeFileSync(dirPath, '', 'utf8');
  for (const entry of entries) {
    const block = buildDirEntry(entry);
    fs.appendFileSync(dirPath, block, 'utf8');
  }
  console.log(`[DirBuilder] Wrote ${entries.length} entries to ${path.relative(process.cwd(), dirPath)}`);
}

function listConferences() {
  const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && /^Conf\d+$/.test(e.name))
    .map(e => Number(e.name.replace('Conf', '')))
    .sort((a, b) => a - b);
}

const args = process.argv.slice(2).map(arg => Number(arg)).filter(n => !Number.isNaN(n));
const conferences = args.length > 0 ? args : listConferences();
for (const conf of conferences) {
  regenerateDir1(conf);
}
