/**
 * Client Door Bundler
 * Bundles TypeScript/JavaScript doors for browser execution using esbuild
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getSystemTime } from '../utils/date-time.util';

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
  private static readonly CACHE_VERSION = 'process-widget-shim-v5';
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

      // Get BBS root (use BBS_ROOT env var or default to project root)
      const bbsRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');
      const sdkPath = path.join(bbsRoot, 'sdk');

      const resolveSdkPath = (subpath: string): string => {
        const candidates = [
          path.join(bbsRoot, 'sdk'),
          path.join(bbsRoot, 'node_modules', '@amiexpress', 'bbs-door-sdk'),
          path.join(process.cwd(), '../../sdk')
        ];

        for (const base of candidates) {
          const full = path.join(base, subpath);
          if (fs.existsSync(full)) {
            return full;
          }
        }

        try {
          const pkgPath = require.resolve('@amiexpress/bbs-door-sdk/package.json', {
            paths: [bbsRoot, process.cwd()]
          });
          const pkgDir = path.dirname(pkgPath);
          const candidate = path.join(pkgDir, subpath);
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        } catch {
          // ignore
        }

        // Final fallback to expected sdk path
        return path.join(bbsRoot, 'sdk', subpath);
      };

      const sdkClient = resolveSdkPath('dist/client/index.js');
      const sdkServer = resolveSdkPath('dist/server/index.js');
      const sdkCommon = resolveSdkPath('dist/common/index.js');
      const sdkNodeModules = path.join(bbsRoot, 'node_modules');

console.log(`[ClientDoorBundler] BBS root: ${bbsRoot}`);
console.log(`[ClientDoorBundler] SDK path: ${sdkPath}`);
console.log(`[ClientDoorBundler] SDK client: ${sdkClient}`);

      // Create shim files for Node.js modules
      const fsShimPath = this.createFsShim();
      const pathShimPath = this.createPathShim();
      const eventsShimPath = this.createEventsShim();
      const osShimPath = this.createOsShim();
      const netShimPath = this.createNetShim();
      const childProcessShimPath = this.createChildProcessShim();
      const utilShimPath = this.createUtilShim();
      const assertShimPath = this.createAssertShim();
      const zlibShimPath = this.createZlibShim();
      const termJsShimPath = this.createTermJsShim();
      const ptyShimPath = this.createPtyShim();
      const blessedColorsShimPath = this.createBlessedColorsShim();
      const processShimPath = this.createProcessShim();
      const widgetNodeShimPath = this.createWidgetNodeShim();

      const aliasMap: Record<string, string> = {
        '@amiexpress/bbs-door-sdk': sdkClient,
        '@amiexpress/bbs-door-sdk/client': sdkClient,
        '@amiexpress/bbs-door-sdk/server': sdkServer,
        '@amiexpress/bbs-door-sdk/common': sdkCommon,
        fs: fsShimPath,
        path: pathShimPath,
        events: eventsShimPath,
        os: osShimPath,
        net: netShimPath,
        child_process: childProcessShimPath,
        util: utilShimPath,
        assert: assertShimPath,
        zlib: zlibShimPath,
        'term.js': termJsShimPath,
        'pty.js': ptyShimPath,
        'blessed/lib/colors': blessedColorsShimPath,
        process: processShimPath,
        './widgets/node': widgetNodeShimPath,
      };

      const aliasPlugin: esbuild.Plugin = {
        name: 'client-door-alias',
        setup(build) {
          build.onResolve({ filter: /^(fs|path|events|os|net|child_process|util|assert|zlib|term\.js|pty\.js|blessed\/lib\/colors|process|@amiexpress\/bbs-door-sdk(?:\/(client|server|common))?)$/ }, (args) => {
            const replacement = aliasMap[args.path];
            if (replacement) {
              return { path: replacement };
            }
            if (args.path.endsWith('/widgets/node')) {
              return { path: widgetNodeShimPath };
            }
            return null;
          });

          build.onResolve({ filter: /^\.\/widgets\/node$/ }, () => {
            return { path: widgetNodeShimPath };
          });

          build.onResolve({ filter: /^\.\/widgets\/node\.js$/ }, () => {
            return { path: widgetNodeShimPath };
          });
        }
      };

      const processBanner = `
        var process = (typeof process !== 'undefined') ? process : {
          env: {},
          cwd: () => '/',
          platform: 'browser',
          nextTick: (fn) => {
            if (typeof queueMicrotask === 'function') {
              queueMicrotask(fn);
            } else {
              setTimeout(fn, 0);
            }
          },
          argv: [],
          version: '0.0.0-browser',
          versions: {}
        };
      `;

      const widgetFixPlugin: esbuild.Plugin = {
        name: 'neo-blessed-widget-fix',
        setup(build) {
          build.onLoad({ filter: /neo-blessed\/lib\/widget\.js$/ }, async (args) => {
            const source = await fs.promises.readFile(args.path, 'utf8');
            let patched = source.replace(/globRequire_widgets\(\s*["']\.\/widgets\/["'] \+ file\s*\)/g, 'globRequire_widgets("./widgets/" + file + ".js")');

            patched = patched.replace(
              /widget\[name\]\s*=\s*widget\[file\]\s*=\s*globRequire_widgets\(["']\.\/widgets\/["'] \+ file \+ ["']\.js["']\);\s*/g,
              `try {
        widget[name] = widget[file] = globRequire_widgets("./widgets/" + file + ".js");
      } catch (err) {
        if (file === 'node') {
          try {
            widget[name] = widget[file] = globRequire_widgets("./widgets/node.js");
          } catch (err3) {
            widget[name] = widget[file] = () => ({});
          }
        } else if (file === 'node.js') {
          try {
            widget[name] = widget[file] = globRequire_widgets("./widgets/node.js");
          } catch (err2) {
            widget[name] = widget[file] = () => ({});
          }
        } else {
          if (typeof console !== 'undefined' && console.warn) {
console.warn('[neo-blessed] missing widget module', file, err);
          }
          widget[name] = widget[file] = () => ({});
        }
      }
      `
            );
            return {
              contents: patched,
              loader: 'js',
            };
          });
        }
      };

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

        // Resolve SDK imports and Node.js built-ins to shims
        alias: {
          // Use client-only bundle to avoid server dependencies
          '@amiexpress/bbs-door-sdk': sdkClient,
          '@amiexpress/bbs-door-sdk/client': sdkClient,
          '@amiexpress/bbs-door-sdk/server': sdkServer,
          '@amiexpress/bbs-door-sdk/common': sdkCommon,
          // Node.js built-in shims for browser
          'fs': fsShimPath,
          'path': pathShimPath,
          'events': eventsShimPath,
          'os': osShimPath,
          'net': netShimPath,
          'child_process': childProcessShimPath,
          'util': utilShimPath,
          'assert': assertShimPath,
        },

        // Additional resolve paths
        nodePaths: [
          path.dirname(sdkClient),
          path.dirname(sdkServer),
          path.dirname(sdkCommon),
          sdkPath,
          path.join(sdkPath, 'node_modules'),
          sdkNodeModules
        ],

        // Don't mark as external - let alias handle them
        external: [],

        // Define globals for Node.js compatibility
        define: {
          'process.env.NODE_ENV': '"production"',
          'global': 'window',
          '__dirname': '"/bbs/doors"',
          '__filename': '"/bbs/doors/index.js"',
        },

        banner: {
          js: processBanner,
        },

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
        logLevel: 'info',

        plugins: [aliasPlugin, widgetFixPlugin],
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
   * Create fs module shim for browser
   */
  private createFsShim(): string {
    const shimPath = path.join(this.cacheDir, 'fs-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// Filesystem shim for browser (uses localStorage)
export default {
  existsSync: (path) => {
    try {
      return localStorage.getItem(\`fs:\${path}\`) !== null;
    } catch {
      return false;
    }
  },
  readFileSync: (path, encoding) => {
    try {
      const data = localStorage.getItem(\`fs:\${path}\`);
      return data || '';
    } catch {
      return '';
    }
  },
  writeFileSync: (path, data, encoding) => {
    try {
      localStorage.setItem(\`fs:\${path}\`, String(data));
    } catch (err) {
console.warn('writeFileSync failed:', err);
    }
  },
  mkdirSync: (path, options) => {
    // No-op in browser
  },
  readdirSync: (path) => {
    return [];
  },
  statSync: (path) => {
    return {
      isDirectory: () => false,
      isFile: () => true,
      size: 0,
      mtime: getSystemTime(),
    };
  },
};
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create net module shim for browser
   */
  private createNetShim(): string {
    const shimPath = path.join(this.cacheDir, 'net-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// net shim for browser
const createConnection = (..._args) => {
  throw new Error('net module is not available in the browser');
};
const connect = createConnection;

export { createConnection, connect };
export default { createConnection, connect };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create child_process shim for browser
   */
  private createChildProcessShim(): string {
    const shimPath = path.join(this.cacheDir, 'child-process-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// child_process shim for browser
const notAvailable = (fn = 'child_process') => {
  throw new Error(fn + ' is not available in the browser');
};

const spawn = (..._args) => {
  notAvailable('spawn');
  return null;
};

const spawnSync = (..._args) => {
  return { pid: 0, output: [], stdout: '', stderr: '', status: 1, signal: null, error: new Error('spawnSync is not available in the browser') };
};

const exec = (..._args) => {
  notAvailable('exec');
  return null;
};

const execSync = (..._args) => {
  notAvailable('execSync');
  return '';
};

export { spawn, spawnSync, exec, execSync };
export default { spawn, spawnSync, exec, execSync };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create util shim for browser
   */
  private createUtilShim(): string {
    const shimPath = path.join(this.cacheDir, 'util-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// util shim for browser
function inherits(ctor, superCtor) {
  if (!superCtor) return;
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, writable: true, configurable: true }
  });
}

function format(...args) {
  try {
    return args.map((a) => String(a)).join(' ');
  } catch {
    return '';
  }
}

function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => {
    try {
      fn(...args, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function callbackify(fn) {
  return (...args) => {
    const cb = args.pop();
    Promise.resolve(fn(...args)).then((res) => cb(null, res)).catch((err) => cb(err));
  };
}

function inspect(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const util = { inherits, format, promisify, callbackify, inspect, types: {} };

export { inherits, format, promisify, callbackify, inspect };
export default util;
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create assert shim for browser
   */
  private createAssertShim(): string {
    const shimPath = path.join(this.cacheDir, 'assert-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// assert shim for browser
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

assert.ok = assert;
assert.strictEqual = (a, b, message) => {
  if (a !== b) {
    throw new Error(message || \`\${a} !== \${b}\`);
  }
};
assert.equal = assert.strictEqual;
assert.fail = (message) => { throw new Error(message || 'Assertion failed'); };

export default assert;
export { assert };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create zlib shim for browser
   */
  private createZlibShim(): string {
    const shimPath = path.join(this.cacheDir, 'zlib-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// zlib shim for browser
const notAvailable = (fn = 'zlib') => {
  throw new Error(fn + ' is not available in the browser');
};

const inflate = (..._args) => notAvailable('inflate');
const deflate = (..._args) => notAvailable('deflate');
const inflateSync = (..._args) => notAvailable('inflateSync');
const deflateSync = (..._args) => notAvailable('deflateSync');

export { inflate, deflate, inflateSync, deflateSync };
export default { inflate, deflate, inflateSync, deflateSync };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create term.js shim for browser
   */
  private createTermJsShim(): string {
    const shimPath = path.join(this.cacheDir, 'termjs-shim.js');

    if (fs.existsSync(shimPath)) {
      const existing = fs.readFileSync(shimPath, 'utf8');
      if (!existing.includes('module.exports')) {
        return shimPath;
      }
    }

    const shimCode = `
// term.js shim for browser
const termFactory = (_opts = {}) => {
  return {
    write: () => {},
    destroy: () => {},
    on: () => {},
    once: () => {},
    off: () => {},
    resize: () => {},
  };
};

export default termFactory;
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create pty.js shim for browser
   */
  private createPtyShim(): string {
    const shimPath = path.join(this.cacheDir, 'pty-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// pty.js shim for browser
const fork = (_cmd, _args, _opts) => {
  return {
    on: () => {},
    write: () => {},
    destroy: () => {},
    resize: () => {},
    kill: () => {},
  };
};

export { fork };
export default { fork };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create blessed colors shim for browser
   */
  private createBlessedColorsShim(): string {
    const shimPath = path.join(this.cacheDir, 'blessed-colors-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// blessed colors shim for browser
const colors = {
  match: () => 0,
  convert: () => 0,
};

export default colors;
export { colors };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create process shim for browser
   */
  private createProcessShim(): string {
    const shimPath = path.join(this.cacheDir, 'process-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// Minimal process shim for browser
const process = {
  env: {},
  cwd: () => '/',
  platform: 'browser',
  nextTick: (fn) => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      setTimeout(fn, 0);
    }
  },
  argv: [],
  version: '0.0.0-browser',
  versions: {},
};

export default process;
export { process };
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create widget node shim for neo-blessed
   */
  private createWidgetNodeShim(): string {
    const shimPath = path.join(this.cacheDir, 'widget-node-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// neo-blessed widget node shim for browser
export default {};
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create path module shim for browser
   */
  private createPathShim(): string {
    const shimPath = path.join(this.cacheDir, 'path-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// Path module shim for browser
export default {
  join: (...parts) => {
    const joined = parts.join('/').replace(/\\/\\/+/g, '/');
    return joined.replace(/\\\\\\\\/g, '/');
  },
  resolve: (...parts) => {
    const joined = parts.join('/').replace(/\\/\\/+/g, '/');
    return joined.startsWith('/') ? joined : '/' + joined;
  },
  dirname: (p) => {
    const lastSlash = p.lastIndexOf('/');
    return lastSlash > 0 ? p.substring(0, lastSlash) : p.substring(0, lastSlash + 1);
  },
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
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create events module shim for browser
   */
  private createEventsShim(): string {
    const shimPath = path.join(this.cacheDir, 'events-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// EventEmitter shim for browser
class EventEmitter {
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

export { EventEmitter };
export default EventEmitter;
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Create os module shim for browser
   */
  private createOsShim(): string {
    const shimPath = path.join(this.cacheDir, 'os-shim.js');

    if (fs.existsSync(shimPath)) {
      return shimPath;
    }

    const shimCode = `
// OS module shim for browser
export default {
  cpus: () => {
    // Return mock CPU info
    const count = navigator.hardwareConcurrency || 4;
    return Array.from({ length: count }, (_, i) => ({
      model: 'Browser CPU',
      speed: 2400,
      times: {
        user: 0,
        nice: 0,
        sys: 0,
        idle: 0,
        irq: 0,
      },
    }));
  },
  totalmem: () => {
    // Return 8GB as default
    if (performance && performance.memory) {
      return performance.memory.jsHeapSizeLimit || 8 * 1024 * 1024 * 1024;
    }
    return 8 * 1024 * 1024 * 1024;
  },
  freemem: () => {
    // Return available memory if possible
    if (performance && performance.memory) {
      return performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize;
    }
    return 4 * 1024 * 1024 * 1024;
  },
  platform: () => 'browser',
  arch: () => 'x64',
  hostname: () => location.hostname || 'localhost',
  tmpdir: () => '/tmp',
  homedir: () => '/home/user',
  EOL: '\\n',
};
`;

    fs.writeFileSync(shimPath, shimCode, 'utf8');
    return shimPath;
  }

  /**
   * Get cache key for a bundle
   */
  private getCacheKey(doorPath: string, minify: boolean, sourcemap: boolean): string {
    return `${ClientDoorBundler.CACHE_VERSION}:${doorPath}:${minify}:${sourcemap}`;
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
