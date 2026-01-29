import * as esbuild from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [resolve(__dirname, 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(__dirname, 'dist/index.js'),
  sourcemap: true,
  external: [
    '@amiexpress/bbs-door-sdk',
    'neo-blessed',
    'fs',
    'path',
    'events',
    'util',
    'stream',
    'net',
    'tty',
    'child_process',
    'os',
    'crypto',
    'http',
    'https',
    'url',
    'zlib'
  ],
  banner: {
    js: '// Bug Tracker Door - AmiExpress BBS\n'
  },
  logLevel: 'info'
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete!');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
