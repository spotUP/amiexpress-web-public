/**
 * IFF (Interchange File Format) Parser
 *
 * Implements EA IFF 85 specification for parsing and writing IFF files
 * Used for Amiga .info files (icon files with tooltypes)
 *
 * Based on: https://wiki.amigaos.net/wiki/IFFParse_Library
 */

import * as fs from 'fs';

export interface IFFChunk {
  id: string;          // 4-character chunk ID
  size: number;        // Size of chunk data (not including header)
  offset: number;      // Offset in file where chunk data starts
  data?: Buffer;       // Chunk data (optional, loaded on demand)
}

export interface IFFFile {
  chunks: IFFChunk[];
  buffer: Buffer;
}

/**
 * Read a 32-bit big-endian integer from buffer
 */
function readBE32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

/**
 * Write a 32-bit big-endian integer to buffer
 */
function writeBE32(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt32BE(value, offset);
}

/**
 * Read a 16-bit big-endian integer from buffer
 */
function readBE16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16BE(offset);
}

/**
 * Write a 16-bit big-endian integer to buffer
 */
function writeBE16(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt16BE(value, offset);
}

/**
 * Parse IFF file structure
 *
 * IFF files consist of chunks with format:
 * - 4 bytes: chunk ID (ASCII)
 * - 4 bytes: chunk size (big-endian)
 * - N bytes: chunk data
 * - Padding byte if size is odd (for word alignment)
 */
export function parseIFFFile(filePath: string): IFFFile {
  const buffer = fs.readFileSync(filePath);
  const chunks: IFFChunk[] = [];

  let offset = 0;

  while (offset <= buffer.length - 8) {
    // Read chunk header
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = readBE32(buffer, offset + 4);

    // Calculate padded size (word-aligned)
    const paddedSize = (size % 2 === 0) ? size : size + 1;

    chunks.push({
      id,
      size,
      offset: offset + 8,
      data: undefined  // Don't load data yet, do it on demand
    });

    // Move to next chunk (header + data + padding)
    offset += 8 + paddedSize;
  }

  return { chunks, buffer };
}

/**
 * Get chunk data from IFF file
 */
export function getChunkData(iff: IFFFile, chunkId: string): Buffer | null {
  const chunk = iff.chunks.find(c => c.id === chunkId);
  if (!chunk) {
    return null;
  }

  return iff.buffer.slice(chunk.offset, chunk.offset + chunk.size);
}

/**
 * Get all chunks with a specific ID
 */
export function getChunks(iff: IFFFile, chunkId: string): IFFChunk[] {
  return iff.chunks.filter(c => c.id === chunkId);
}

/**
 * Write IFF file back to disk
 * Reconstructs file with updated chunks
 */
export function writeIFFFile(filePath: string, iff: IFFFile): void {
  const buffer = iff.buffer;
  fs.writeFileSync(filePath, buffer);
}

/**
 * Create a new IFF chunk
 */
export function createChunk(id: string, data: Buffer): Buffer {
  const size = data.length;
  const paddedSize = (size % 2 === 0) ? size : size + 1;
  const chunk = Buffer.alloc(8 + paddedSize);

  // Write header
  chunk.write(id, 0, 4, 'ascii');
  writeBE32(chunk, 4, size);

  // Write data
  data.copy(chunk, 8);

  // Add padding byte if needed
  if (size % 2 !== 0) {
    chunk.writeUInt8(0, 8 + size);
  }

  return chunk;
}

export { readBE32, writeBE32, readBE16, writeBE16 };
