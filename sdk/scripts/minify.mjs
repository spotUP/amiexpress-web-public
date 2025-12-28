#!/usr/bin/env node
/**
 * Minification script for SDK production builds
 * Minifies CJS and ESM builds using Terser
 */

import { minify } from 'terser';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function minifyFile(filePath) {
  const code = readFileSync(filePath, 'utf-8');

  try {
    const result = await minify(code, {
      compress: {
        dead_code: true,
        drop_console: false, // Keep console for debugging
        drop_debugger: true,
        pure_funcs: [],
      },
      mangle: {
        // Don't mangle top-level names to preserve API
        toplevel: false,
      },
      format: {
        comments: false, // Remove comments
      },
      sourceMap: false,
    });

    if (result.code) {
      writeFileSync(filePath, result.code, 'utf-8');
      return true;
    }
  } catch (error) {
    console.error(`[Minify] Error minifying ${filePath}:`, error.message);
    return false;
  }
  return false;
}

async function minifyDirectory(dir) {
  const files = readdirSync(dir);
  let minified = 0;

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      minified += await minifyDirectory(filePath);
    } else if (extname(file) === '.js') {
      const success = await minifyFile(filePath);
      if (success) minified++;
    }
  }

  return minified;
}

async function main() {
  console.log('[Minify] Starting minification...');

  const distCjs = join(rootDir, 'dist');
  const distEsm = join(rootDir, 'dist-esm');

  let totalMinified = 0;

  // Minify CJS build
  if (statSync(distCjs).isDirectory()) {
    console.log('[Minify] Minifying CJS build (dist/)...');
    totalMinified += await minifyDirectory(distCjs);
  }

  // Minify ESM build
  if (statSync(distEsm).isDirectory()) {
    console.log('[Minify] Minifying ESM build (dist-esm/)...');
    totalMinified += await minifyDirectory(distEsm);
  }

  console.log(`[Minify] ✓ Minified ${totalMinified} files`);
}

main().catch(error => {
  console.error('[Minify] Fatal error:', error);
  process.exit(1);
});
