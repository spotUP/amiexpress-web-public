/**
 * Door themes: tokens, ready-made blessed styles, and the optional glitches.
 *
 * `classic` is the default and reproduces the board exactly as it is, so
 * nothing here changes anyone's screen until they choose otherwise.
 *
 * The `.js` extensions are REQUIRED, not decoration. Node's ESM loader does
 * not guess them, so an extensionless re-export here resolves under CJS and
 * throws ERR_MODULE_NOT_FOUND under ESM - which is how BUGS, an
 * esbuild/ESM door with the SDK external, failed with "does not provide an
 * export named 'themeById'". TypeScript keeps the specifier as written and
 * the file is .js in both builds, so this is correct for CJS too.
 */
export * from './tokens.js';
export * from './styles.js';
export * from './glitch.js';
export * from './glitch-runner.js';
export * from './chrome.js';
