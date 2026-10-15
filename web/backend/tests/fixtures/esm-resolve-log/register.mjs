// Loaded with `node --import` (through NODE_OPTIONS) by
// tests/a-68k-checker-run-makes-no-esm-loader-round-trip.test.ts: registers
// hooks.mjs, which appends every ESM-loader resolve to ESM_RESOLVE_LOG.
import { register } from 'node:module';

register(new URL('./hooks.mjs', import.meta.url).href, { data: { log: process.env.ESM_RESOLVE_LOG } });
