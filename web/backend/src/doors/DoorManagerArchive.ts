/**
 * Door Manager Archive Browser Module
 *
 * Handles archive browsing, file listing, and file viewing
 * for the Door Manager door.
 */

import * as path from 'path';
import { Socket } from 'socket.io';
import { getAmigaDoorManager } from './amigaDoorManager';

export interface ArchiveFileEntry {
  name: string;           // File/directory name
  fullPath: string;       // Full path in archive
  isDirectory: boolean;
  size: number;
  extension: string;
}

export interface ViewingFile {
  name: string;
  content: string;
  type: 'text' | 'amigaguide';
}

export interface ArchiveBrowserState {
  archiveFiles?: ArchiveFileEntry[];
  currentPath?: string;
  selectedFileIndex?: number;
  scrollOffset: number;
  viewingFile?: ViewingFile;
}

/**
 * Extract file and directory list from archive
 */
export async function extractArchiveFileList(archivePath: string): Promise<ArchiveFileEntry[]> {
  const entries: ArchiveFileEntry[] = [];
  const ext = path.extname(archivePath).toLowerCase();

  if (ext === '.zip') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(archivePath);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      const name = entry.entryName;
      // Skip macOS metadata files
      if (name.includes('__MACOSX') || name.endsWith('.DS_Store')) continue;

      entries.push({
        name: path.basename(name),
        fullPath: name,
        isDirectory: entry.isDirectory,
        size: entry.header.size,
        extension: path.extname(name).toLowerCase()
      });
    }
  } else if (ext === '.lha' || ext === '.lzh') {
    const amigaDoorMgr = getAmigaDoorManager();
    const analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);

    if (analysis && analysis.files) {
      for (const file of analysis.files) {
        if (file.includes('__MACOSX') || file.endsWith('.DS_Store')) continue;

        const isDir = file.endsWith('/');
        const cleanPath = isDir ? file.slice(0, -1) : file;

        entries.push({
          name: path.basename(cleanPath),
          fullPath: file,
          isDirectory: isDir,
          size: 0,
          extension: path.extname(cleanPath).toLowerCase()
        });
      }
    }
  } else if (ext === '.lzx') {
    const amigaDoorMgr = getAmigaDoorManager();
    const analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);

    if (analysis && analysis.files) {
      for (const file of analysis.files) {
        if (file.includes('__MACOSX') || file.endsWith('.DS_Store')) continue;

        const isDir = file.endsWith('/');
        const cleanPath = isDir ? file.slice(0, -1) : file;

        entries.push({
          name: path.basename(cleanPath),
          fullPath: file,
          isDirectory: isDir,
          size: 0,
          extension: path.extname(cleanPath).toLowerCase()
        });
      }
    }
  }

  return entries;
}

/**
 * Get files in current directory path
 */
export function getFilesInCurrentPath(
  archiveFiles: ArchiveFileEntry[] | undefined,
  currentPath: string
): ArchiveFileEntry[] {
  if (!archiveFiles) return [];

  const result: ArchiveFileEntry[] = [];
  const seen = new Set<string>();

  for (const file of archiveFiles) {
    let relativePath = file.fullPath;

    // Remove current path prefix
    if (currentPath && relativePath.startsWith(currentPath + '/')) {
      relativePath = relativePath.substring(currentPath.length + 1);
    } else if (currentPath && currentPath !== '') {
      continue;
    }

    // If in root and file is nested, extract first directory
    if (!currentPath && relativePath.includes('/')) {
      const firstDir = relativePath.split('/')[0];
      if (!seen.has(firstDir)) {
        seen.add(firstDir);
        result.push({
          name: firstDir,
          fullPath: currentPath ? currentPath + '/' + firstDir : firstDir,
          isDirectory: true,
          size: 0,
          extension: ''
        });
      }
      continue;
    }

    // If has more subdirectories, show as directory
    if (relativePath.includes('/')) {
      const nextDir = relativePath.split('/')[0];
      if (!seen.has(nextDir)) {
        seen.add(nextDir);
        result.push({
          name: nextDir,
          fullPath: currentPath ? currentPath + '/' + nextDir : nextDir,
          isDirectory: true,
          size: 0,
          extension: ''
        });
      }
    } else if (!file.isDirectory) {
      result.push(file);
    }
  }

  // Sort: directories first, then files
  return result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Extract file content from archive for viewing
 */
export async function extractFileContent(
  archivePath: string,
  file: ArchiveFileEntry
): Promise<string> {
  const ext = path.extname(archivePath).toLowerCase();
  let content = '';

  if (ext === '.zip') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(archivePath);
    const entry = zip.getEntry(file.fullPath);

    if (entry) {
      content = entry.getData().toString('utf8');
    }
  } else if (ext === '.lha' || ext === '.lzh' || ext === '.lzx') {
    content = '[LHA/LZX file viewing requires extraction - not yet implemented]\r\n\r\n';
    content += `File: ${file.name}\r\n`;
    content += `Path: ${file.fullPath}\r\n`;
  }

  return content;
}

/**
 * Render archive browser display
 */
export function renderArchiveBrowser(
  socket: Socket,
  state: ArchiveBrowserState,
  archiveFiles: ArchiveFileEntry[] | undefined,
  formatSize: (bytes: number) => string,
  pad: (str: string, width: number) => string
): void {
  if (!archiveFiles) return;

  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

  const currentPath = state.currentPath || '/';
  socket.emit('ansi-output', '\x1b[0;37;44m' + pad(' ARCHIVE BROWSER ', 80) + '\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `\x1b[36mPath:\x1b[0m ${currentPath}\r\n`);
  socket.emit('ansi-output', '\x1b[0;37m' + '\u2500'.repeat(80) + '\x1b[0m\r\n');

  const currentFiles = getFilesInCurrentPath(archiveFiles, state.currentPath || '');

  if (currentFiles.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[33mEmpty directory\x1b[0m\r\n');
  } else {
    const pageSize = 15;
    const start = state.scrollOffset || 0;
    const end = Math.min(start + pageSize, currentFiles.length);

    for (let i = start; i < end; i++) {
      const file = currentFiles[i];
      const isSelected = i === (state.selectedFileIndex || 0);

      let icon = file.isDirectory ? '\x1b[36m[DIR]\x1b[0m' : '     ';
      if (!file.isDirectory) {
        if (file.extension === '.guide') icon = '\x1b[35m[GDE]\x1b[0m';
        else if (file.extension === '.txt' || file.extension === '.doc') icon = '\x1b[37m[TXT]\x1b[0m';
        else if (file.extension === '.info') icon = '\x1b[33m[NFO]\x1b[0m';
        else icon = '     ';
      }

      const name = file.name.substring(0, 50).padEnd(50);
      const size = file.isDirectory ? '     ' : formatSize(file.size).padStart(8);

      if (isSelected) {
        socket.emit('ansi-output', `\x1b[0;37;44m ${icon} ${name} ${size} \x1b[0m\r\n`);
      } else {
        socket.emit('ansi-output', ` ${icon} ${name} ${size}\r\n`);
      }
    }

    if (currentFiles.length > pageSize) {
      const current = Math.floor((state.selectedFileIndex || 0) / pageSize) + 1;
      const total = Math.ceil(currentFiles.length / pageSize);
      socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total}\x1b[0m\r\n`);
    }
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[0;37m' + '\u2500'.repeat(80) + '\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m\u2191/\u2193\x1b[0m Navigate  ');
  socket.emit('ansi-output', '\x1b[33mENTER\x1b[0m Open  ');
  if (state.currentPath && state.currentPath !== '') {
    socket.emit('ansi-output', '\x1b[33mBACKSPACE\x1b[0m Up  ');
  }
  socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back to Info  ');
  socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
}

/**
 * Render file viewer display
 */
export function renderFileViewer(
  socket: Socket,
  viewingFile: ViewingFile,
  scrollOffset: number,
  pad: (str: string, width: number) => string
): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

  socket.emit('ansi-output', '\x1b[0;37;44m' + pad(` ${viewingFile.name.toUpperCase()} `, 80) + '\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  const pageSize = 20;

  if (viewingFile.type === 'amigaguide') {
    renderAmigaGuideContent(socket, viewingFile.content, scrollOffset, pageSize);
  } else {
    const lines = viewingFile.content.split('\n');
    const start = scrollOffset || 0;
    const end = Math.min(start + pageSize, lines.length);

    for (let i = start; i < end; i++) {
      socket.emit('ansi-output', `${lines[i]}\r\n`);
    }

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '\x1b[0;37m' + '\u2500'.repeat(80) + '\x1b[0m\r\n');
    socket.emit('ansi-output', `\x1b[90mLine ${start + 1}-${end} of ${lines.length}\x1b[0m\r\n`);
  }

  socket.emit('ansi-output', '\x1b[33m\u2191/\u2193\x1b[0m Scroll  ');
  socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back to Browser  ');
  socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
}

/**
 * Render AmigaGuide content (simplified)
 */
function renderAmigaGuideContent(
  socket: Socket,
  content: string,
  scrollOffset: number,
  pageSize: number
): void {
  const lines = content.split('\n');
  const start = scrollOffset || 0;
  const end = Math.min(start + pageSize, lines.length);

  for (let i = start; i < end; i++) {
    let line = lines[i];

    // Simple AmigaGuide tag processing
    line = line.replace(/@\{[^}]*\}/g, '');
    line = line.replace(/@node .*/i, '');
    line = line.replace(/@title .*/i, '');

    socket.emit('ansi-output', `${line}\r\n`);
  }
}
