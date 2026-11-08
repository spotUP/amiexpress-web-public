/**
 * File access a door makes through BBSApi (like DOS.library): read, write, list, and the Amiga .info tooltype files. Paths are relative to the board's dataDir unless absolute. None of it needs the session.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import * as path from 'path';
import * as amigafs from '../utils/amigafs';


/**
 * Read text file and return contents
 * Equivalent to DOS Open()/Read()/Close()
 *
 * @param filename Path relative to BBS root or absolute
 * @returns File contents as string, or null if error
 */
export async function doorReadFile(filename: string): Promise<string | null> {
  try {
    // Resolve path relative to BBS data directory
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(bbsRoot, filename);

    const content = amigafs.readFileSync(fullPath, 'utf8');
    return content.toString();
  } catch (error) {
console.error(`[BBSApi] Error reading file ${filename}:`, error);
    return null;
  }
}

/**
 * Write text to file
 * Equivalent to DOS Open()/Write()/Close()
 */
export async function doorWriteFile(filename: string, content: string): Promise<boolean> {
  try {
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(bbsRoot, filename);

    amigafs.writeFileSync(fullPath, content, 'utf8');
    return true;
  } catch (error) {
console.error(`[BBSApi] Error writing file ${filename}:`, error);
    return false;
  }
}

/**
 * Check if file exists
 */
export async function doorFileExists(filename: string): Promise<boolean> {
  try {
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(bbsRoot, filename);

    return amigafs.existsSync(fullPath);
  } catch (error) {
    return false;
  }
}

/**
 * Read and parse Amiga .info file (tooltypes)
 * Returns array of key/value pairs extracted from the binary .info file
 *
 * @param filename Path to .info file relative to BBS root or absolute
 * @returns Array of tooltype entries, or null if error
 */
export async function doorReadInfoFile(filename: string): Promise<Array<{ key: string; value: string; commented: boolean }> | null> {
  try {
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(bbsRoot, filename);

    // Use the proper .info file parser that handles binary format
    const { parseInfoFile } = require('../utils/info-file.util');
    const infoFile = parseInfoFile(fullPath);

    // Return tooltypes in a simplified format
    return infoFile.tooltypes.map((tt: any) => ({
      key: tt.key,
      value: tt.value,
      commented: tt.commented
    }));
  } catch (error) {
console.error(`[BBSApi] Error reading .info file ${filename}:`, error);
    return null;
  }
}

/**
 * Write/update Amiga .info file tooltypes
 * Preserves binary header and icon data, only updates tooltypes
 *
 * @param filename Path to .info file relative to BBS root or absolute
 * @param tooltypes Array of tooltype entries to write
 * @returns true if successful, false on error
 */
export async function doorWriteInfoFile(filename: string, tooltypes: Array<{ key: string; value: string; commented?: boolean }>): Promise<boolean> {
  try {
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(bbsRoot, filename);

    // Use the proper .info file parser and writer
    const { parseInfoFile, writeInfoFile } = require('../utils/info-file.util');

    // Parse existing file to preserve header and icon data
    const infoFile = parseInfoFile(fullPath);

    // Update tooltypes
    infoFile.tooltypes = tooltypes.map((tt: any) => ({
      key: tt.key.toUpperCase(),
      value: tt.value,
      commented: tt.commented || false,
      originalLine: `${tt.commented ? '!' : ''}${tt.key.toUpperCase()}=${tt.value}`
    }));

    // Write back to file
    writeInfoFile(infoFile);
console.log(`[BBSApi] writeInfoFile OK: ${fullPath} (${tooltypes.length} tooltypes)`);
    return true;
  } catch (error) {
console.error(`[BBSApi] writeInfoFile FAILED: ${filename}:`, error);
    return false;
  }
}

/**
 * List files in directory
 * Equivalent to DOS ExAll()
 */
export async function doorListFiles(directory: string, pattern?: string): Promise<string[]> {
  try {
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const fullPath = path.isAbsolute(directory)
      ? directory
      : path.join(bbsRoot, directory);

    const files = amigafs.readdirSync(fullPath);

    // Apply pattern filter if provided (simple glob matching)
    if (pattern) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        'i'
      );
      return files.filter(f => regex.test(f));
    }

    return files;
  } catch (error) {
console.error(`[BBSApi] Error listing directory ${directory}:`, error);
    return [];
  }
}
