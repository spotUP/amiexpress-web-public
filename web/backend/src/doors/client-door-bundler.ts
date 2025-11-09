/**
 * Client Door Bundler
 * Bundles TypeScript/JavaScript doors for browser execution using esbuild
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface BundleOptions {
  doorPath: string;
  doorId: string;
  outputDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
}

export interface BundleResult {
  bundlePath: string;
  bundleCode: string;
  sourceMap?: string;
  hash: string;
  size: number;
}

/**
 * Client Door Bundler
 * Handles bundling of doors for browser execution
 */
export class ClientDoorBundler {
  private cacheDir: string;
  private bundleCache: Map<string, BundleResult> = new Map();

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(process.cwd(), '.cache', 'door-bundles');
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Bundle a door for browser execution
   *
   * @param options Bundle options
   * @returns Bundle result with code and metadata
   */
  async bundle(options: BundleOptions): Promise<BundleResult> {
    const { doorPath, doorId, minify = true, sourcemap = false } = options;

    // Check if already cached
    const cacheKey = this.getCacheKey(doorPath, minify, sourcemap);
    const cached = this.bundleCache.get(cacheKey);
    if (cached && this.isCacheValid(cached, doorPath)) {
      console.log(`[ClientDoorBundler] Using cached bundle for ${doorId}`);
      return cached;
    }

    console.log(`[ClientDoorBundler] Bundling door: ${doorId} from ${doorPath}`);

    try {
      // Resolve absolute path
      const absolutePath = path.isAbsolute(doorPath)
        ? doorPath
        : path.resolve(process.cwd(), doorPath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Door file not found: ${absolutePath}`);
      }

      // Output file path
      const outputPath = path.join(this.cacheDir, `${doorId}.bundle.js`);

      // Bundle with esbuild
      const result = await esbuild.build({
        entryPoints: [absolutePath],
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        format: 'iife',
        globalName: `Door_${doorId.replace(/[^a-zA-Z0-9]/g, '_')}`,
        outfile: outputPath,
        minify,
        sourcemap: sourcemap ? 'external' : false,

        // External Node.js modules (provide browser shims)
        external: [],

        // Define globals for Node.js compatibility
        define: {
          'process.env.NODE_ENV': '"production"',
          'global': 'window',
        },

        // Inject browser shims for Node.js modules
        inject: [this.createNodeShimsFile()],

        // Enable JSX if needed
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
          '.js': 'js',
          '.jsx': 'jsx',
        },

        // Write to file system
        write: true,

        // Log level
        logLevel: 'warning',
      });

      // Read bundled code
      const bundleCode = fs.readFileSync(outputPath, 'utf8');

      // Read source map if generated
      let sourceMap: string | undefined;
      if (sourcemap) {
        const sourceMapPath = `${outputPath}.map`;
        if (fs.existsSync(sourceMapPath)) {
          sourceMap = fs.readFileSync(sourceMapPath, 'utf8');
        }
      }

      // Calculate hash for cache validation
      const hash = crypto.createHash('sha256').update(bundleCode).digest('hex');

      // Get bundle size
      const stats = fs.statSync(outputPath);
      const size = stats.size;

      const bundleResult: BundleResult = {
        bundlePath: outputPath,
        bundleCode,
        sourceMap,
        hash,
        size,
      };

      // Cache the result
      this.bundleCache.set(cacheKey, bundleResult);

      console.log(`[ClientDoorBundler] Bundle complete: ${doorId} (${(size / 1024).toFixed(2)} KB)`);

      if (result.warnings.length > 0) {
        console.warn(`[ClientDoorBundler] Warnings:`, result.warnings);
      }

      return bundleResult;

    } catch (error) {
      console.error(`[ClientDoorBundler] Failed to bundle ${doorId}:`, error);
      throw new Error(`Failed to bundle door: ${(error as Error).message}`);
    }
  }

  /**
   * Create Node.js shims file for browser
   * Provides minimal implementations of Node.js modules
   */
  private createNodeShimsFile(): string {
    const shimsPath = path.join(this.cacheDir, 'node-shims.js');

    if (fs.existsSync(shimsPath)) {
      return shimsPath;
    }

    const shimsCode = `
// Node.js shims for browser environment

// EventEmitter shim
export class EventEmitter {
  constructor() {
    this._events = new Map();
  }

  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(listener);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event, listener) {
    const listeners = this._events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  emit(event, ...args) {
    const listeners = this._events.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }
    for (const listener of listeners) {
      try {
        listener(...args);
      } catch (err) {
        console.error(\`Error in event listener for \${event}:\`, err);
      }
    }
    return true;
  }

  removeAllListeners(event) {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }

  listenerCount(event) {
    const listeners = this._events.get(event);
    return listeners ? listeners.length : 0;
  }
}

// Path shim
export const path = {
  join: (...parts) => parts.join('/').replace(/\\/\\/+/g, '/'),
  resolve: (...parts) => path.join('/', ...parts),
  dirname: (p) => p.substring(0, p.lastIndexOf('/')),
  basename: (p, ext) => {
    const base = p.substring(p.lastIndexOf('/') + 1);
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
  extname: (p) => {
    const index = p.lastIndexOf('.');
    return index > 0 ? p.substring(index) : '';
  },
  isAbsolute: (p) => p.startsWith('/'),
  sep: '/',
  delimiter: ':',
};

// Process shim
export const process = {
  env: { NODE_ENV: 'production' },
  cwd: () => '/',
  platform: 'browser',
  version: 'v18.0.0',
  versions: { node: '18.0.0' },
  stdin: { isTTY: false },
  stdout: { isTTY: false },
  stderr: { isTTY: false },
};

// Buffer shim (minimal)
export class Buffer extends Uint8Array {
  static from(data, encoding) {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      return new Buffer(encoder.encode(data));
    }
    return new Buffer(data);
  }

  toString(encoding) {
    const decoder = new TextDecoder(encoding || 'utf-8');
    return decoder.decode(this);
  }
}

// Export for use in bundled code
if (typeof window !== 'undefined') {
  window.events = { EventEmitter };
  window.path = path;
  window.process = process;
  window.Buffer = Buffer;
}
`;

    fs.writeFileSync(shimsPath, shimsCode, 'utf8');
    return shimsPath;
  }

  /**
   * Get cache key for a bundle
   */
  private getCacheKey(doorPath: string, minify: boolean, sourcemap: boolean): string {
    return `${doorPath}:${minify}:${sourcemap}`;
  }

  /**
   * Check if cached bundle is still valid
   */
  private isCacheValid(cached: BundleResult, doorPath: string): boolean {
    try {
      // Check if bundle file exists
      if (!fs.existsSync(cached.bundlePath)) {
        return false;
      }

      // Check if source file has been modified
      const sourceStats = fs.statSync(doorPath);
      const bundleStats = fs.statSync(cached.bundlePath);

      return bundleStats.mtime >= sourceStats.mtime;
    } catch {
      return false;
    }
  }

  /**
   * Clear bundle cache
   */
  clearCache(): void {
    this.bundleCache.clear();

    // Delete cache directory contents
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }

    console.log('[ClientDoorBundler] Cache cleared');
  }

  /**
   * Get bundle from cache
   */
  getCached(doorPath: string, minify: boolean = true, sourcemap: boolean = false): BundleResult | undefined {
    const cacheKey = this.getCacheKey(doorPath, minify, sourcemap);
    const cached = this.bundleCache.get(cacheKey);

    if (cached && this.isCacheValid(cached, doorPath)) {
      return cached;
    }

    return undefined;
  }
}

/**
 * Global bundler instance
 */
let globalBundler: ClientDoorBundler | null = null;

/**
 * Get or create global bundler instance
 */
export function getClientDoorBundler(): ClientDoorBundler {
  if (!globalBundler) {
    globalBundler = new ClientDoorBundler();
  }
  return globalBundler;
}
