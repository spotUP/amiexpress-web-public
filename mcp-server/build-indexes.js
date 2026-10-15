#!/usr/bin/env node

/**
 * Build compact search indexes from amiga-reversing knowledge bases.
 * 
 * Source: Documentation/7-Reference Sources/amiga-reversing/
 * Output: mcp-server/data/
 * 
 * Run: node mcp-server/build-indexes.js
 * 
 * Downloads source files from GitHub if missing, then generates:
 *   ndk-structs-index.json  - NDK structs + constants + library functions
 *   hw-registers-index.json - Amiga custom chip registers
 *   m68k-isa-index.json     - M68K instruction set
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const KB_DIR = path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'amiga-reversing');
const OUT_DIR = path.join(__dirname, 'data');

const BASE_URL = 'https://raw.githubusercontent.com/rmtew/amiga-reversing/master/knowledge';
const REQUIRED_FILES = [
  'amiga_ndk_includes_parsed.json',
  'amiga_hw_registers.json',
  'm68k_instructions.json',
];

async function ensureSourceFiles() {
  await fs.mkdir(KB_DIR, { recursive: true });
  for (const file of REQUIRED_FILES) {
    const filepath = path.join(KB_DIR, file);
    try {
      await fs.access(filepath);
    } catch {
      console.log(`  Downloading ${file}...`);
      const resp = await fetch(`${BASE_URL}/${file}`);
      if (!resp.ok) throw new Error(`Failed to download ${file}: ${resp.status}`);
      await fs.writeFile(filepath, await resp.text());
    }
  }
}

async function loadJSON(filename) {
  const filepath = path.join(KB_DIR, filename);
  const raw = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(raw);
}

// NDK structs, constants, and library functions index
async function buildNdkIndex() {
  console.log('Building NDK structs index...');
  const data = await loadJSON('amiga_ndk_includes_parsed.json');
  const index = { structs: {}, constants: {}, libraries: {} };

  // Structs: name -> { fields, size, include }
  for (const [name, s] of Object.entries(data.structs || {})) {
    index.structs[name.toLowerCase()] = {
      name,
      include: s.owner?.canonical_include_path || s.owner?.assembler_include_path || '',
      size: s.total_size || null,
      since: s.available_since || '',
      fields: (s.fields || []).map(f => ({
        name: f.name,
        offset: f.offset,
        size: f.size,
        type: f.type,
      })),
    };
  }

  // Constants: name -> { value, include }
  for (const [name, c] of Object.entries(data.constants || {})) {
    index.constants[name.toLowerCase()] = {
      name,
      value: c.value,
      raw: c.raw || '',
      include: c.owner?.canonical_include_path || '',
      since: c.available_since || '',
    };
  }

  // Library functions: lib.func -> { lvo, inputs, include }
  for (const [libName, lib] of Object.entries(data.libraries || {})) {
    const funcs = {};
    for (const [fnName, fn] of Object.entries(lib.functions || {})) {
      funcs[fnName.toLowerCase()] = {
        name: fnName,
        lvo: fn.lvo,
        inputs: (fn.inputs || []).map(i => ({
          name: i.name,
          type: i.type,
          regs: i.regs,
        })),
        outputs: fn.outputs || null,
        version: fn.fd_version || '',
      };
    }
    index.libraries[libName.toLowerCase()] = {
      name: libName,
      base: lib.base || '',
      functionCount: Object.keys(funcs).length,
      functions: funcs,
    };
  }

  const outPath = path.join(OUT_DIR, 'ndk-structs-index.json');
  await fs.writeFile(outPath, JSON.stringify(index));
  const stats = await fs.stat(outPath);
  console.log(`  ${Object.keys(index.structs).length} structs, ${Object.keys(index.constants).length} constants, ${Object.keys(index.libraries).length} libraries`);
  console.log(`  Written: ${outPath} (${(stats.size / 1024).toFixed(0)}KB)`);
}

// Hardware registers index
async function buildHwRegistersIndex() {
  console.log('Building HW registers index...');
  const data = await loadJSON('amiga_hw_registers.json');
  const regs = data.registers || [];

  const index = {
    base_address: data.base_address || '0xDFF000',
    registers: regs.map(r => ({
      name: r.name,
      address: r.address_68k || r.address,
      offset: r.address,
      access: r.access || '',
      chip: r.chip || '',
      function: r.function || '',
      bits: (r.bits || []).map(b => ({
        bit: b.bit,
        name: b.name,
        desc: b.description || '',
      })),
    })),
  };

  const outPath = path.join(OUT_DIR, 'hw-registers-index.json');
  await fs.writeFile(outPath, JSON.stringify(index));
  const stats = await fs.stat(outPath);
  console.log(`  ${index.registers.length} registers`);
  console.log(`  Written: ${outPath} (${(stats.size / 1024).toFixed(0)}KB)`);
}

// M68K instruction set index
async function buildM68kIndex() {
  console.log('Building M68K ISA index...');
  const data = await loadJSON('m68k_instructions.json');
  const instructions = data.instructions || [];

  const index = {
    meta: {
      condition_codes: data._meta?.condition_codes || {},
      size_byte_count: data._meta?.size_byte_count || {},
    },
    instructions: instructions.map(i => ({
      mnemonic: i.mnemonic,
      title: i.title || '',
      operation: i.operation || '',
      syntax: i.syntax || [],
      sizes: i.attributes || '',
      description: (i.description || '').substring(0, 300),
      cc: i.condition_codes || {},
      processors: i.processors || '',
    })),
  };

  const outPath = path.join(OUT_DIR, 'm68k-isa-index.json');
  await fs.writeFile(outPath, JSON.stringify(index));
  const stats = await fs.stat(outPath);
  console.log(`  ${index.instructions.length} instructions`);
  console.log(`  Written: ${outPath} (${(stats.size / 1024).toFixed(0)}KB)`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`Source: ${KB_DIR}`);
  console.log(`Output: ${OUT_DIR}\n`);

  console.log('Checking source files...');
  await ensureSourceFiles();

  await buildNdkIndex();
  await buildHwRegistersIndex();
  await buildM68kIndex();

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
