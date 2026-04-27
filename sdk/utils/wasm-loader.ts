import * as path from 'path';
import * as fs from 'fs';

export interface WasmCallbacks {
  onEvent:    (userdata: number, code: number, json: string) => void;
  onQuestion: (userdata: number, code: number, json: string) => void;
}

export interface WasmModule {
  ccall:        (name: string, ret: string, argTypes: string[], args: any[]) => any;
  cwrap:        (name: string, ret: string | null, argTypes: string[]) => (...args: any[]) => any;
  addFunction:  (fn: Function, sig: string) => number;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, outPtr: number, maxBytesToWrite: number) => void;
}

/**
 * Load a pre-compiled WASM module from a door's own directory.
 * @param doorDir  Absolute path to the door directory (use __dirname from the door's dist/)
 * @param jsGlue   Filename of the Emscripten JS glue (defaults to <basename>.js)
 */
export async function loadDoorWasm(
  doorDir: string,
  jsGlue?: string
): Promise<WasmModule> {
  const glueName = jsGlue ?? path.basename(doorDir) + '.js';
  const gluePath = path.join(doorDir, glueName);

  if (!fs.existsSync(gluePath)) {
    throw new Error(`WASM glue not found: ${gluePath}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const factory = require(gluePath);
  const module: WasmModule = await factory();
  return module;
}
