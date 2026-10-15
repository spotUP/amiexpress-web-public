/**
 * LZX Archive Extractor — WASM-backed
 *
 * Uses the Rust/wasm-pack compiled lzx_wasm module to pack and extract
 * LZX archives without spawning external processes.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

let wasmModule: any = null;

function getWasm(): any {
  if (!wasmModule) {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'wasm', 'lzx', 'pkg', 'lzx_wasm');
    wasmModule = require(pkgPath);
  }
  return wasmModule;
}

export class LzxWasmExtractor extends BaseArchiveExtractor {
  constructor() {
    super('LZX');
  }

  async listFiles(filepath: string): Promise<string[]> {
    const wasm = getWasm();
    const bytes = await fs.readFile(filepath);
    const json = wasm.lzx_list_files(new Uint8Array(bytes)) as string;
    return JSON.parse(json) as string[];
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const wasm = getWasm();
    const bytes = await fs.readFile(filepath);
    const json = wasm.lzx_extract_all(new Uint8Array(bytes)) as string;
    const entries = JSON.parse(json) as Array<{ name: string; data: number[] }>;
    return entries.map(e => ({
      name: e.name,
      size: e.data.length,
      data: Buffer.from(e.data),
    }));
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    const entries = await this.getEntries(filepath);
    const lower = filename.toLowerCase();
    const match = entries.find(e => e.name.toLowerCase() === lower);
    if (!match || !match.data) return null;
    return match.data as Buffer;
  }

  async packFiles(
    entries: Array<{ name: string; data: Buffer }>,
    outputPath: string,
  ): Promise<void> {
    const wasm = getWasm();
    const json = JSON.stringify(
      entries.map(e => ({ name: e.name, data: Array.from(e.data) })),
    );
    const result = wasm.lzx_pack(json) as Uint8Array;
    await fs.writeFile(outputPath, Buffer.from(result));
  }
}
