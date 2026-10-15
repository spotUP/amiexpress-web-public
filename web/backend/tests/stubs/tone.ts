/**
 * Tone.js, absent.
 *
 * A test that imports a DOOR's entry point gets the SDK's package root, and
 * that root reaches the server bundle's audio engine, which imports Tone.
 * Tone ships as ESM and jest parses it as CommonJS, so the import dies with
 * `Unexpected token 'export'` before a line of the door has run.
 *
 * Nothing under test here makes a sound. The module is mapped to this stub in
 * `dev-scripts/jest.config.ts`, beside the other mappings that keep the SDK
 * out of a test's way - a door that DOES use audio should mock what it calls
 * rather than lean on this.
 */
export class Synth {}
export class PolySynth {}
export class Player {}
export class Gain {}
export class Transport {}
export const context = {};
export const Destination = {};
export function start(): Promise<void> { return Promise.resolve(); }
export function now(): number { return 0; }
