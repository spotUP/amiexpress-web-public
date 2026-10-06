/**
 * XIM EDITOR_STRUCT (546): the full-screen editor's `editor` object, handed to
 * and taken back from a FULLEDIT door.
 *
 * express.e:3929-3934
 *
 *     CASE EDITOR_STRUCT
 *       IF(msg.data) THEN CopyMem(msg.filler1,editor,SIZEOF editor)   -> door to board
 *       ELSE CopyMem(editor,msg.filler1,SIZEOF editor)                -> board to door
 *
 * The object (axobjects.e:260), 26 bytes, 68K layout (a LONG on an even
 * offset, so one pad byte after the three CHARs):
 *
 *     +0  maxFileLength       INT
 *     +2  maxScrLength        CHAR
 *     +3  editorTop           CHAR
 *     +4  editorMaxWidth      CHAR
 *     +6  editorFlags         LONG   (ED_*, axconsts.e:66-72)
 *     +10 editorFile          PTR TO CHAR
 *     +14 editorIncludeFile   PTR TO CHAR
 *     +18 editorPrependFile   PTR TO CHAR
 *     +22 editorPostPendFile  PTR TO CHAR
 *
 * The board's copy is session.editor (message-full-editor fills it before
 * FULLEDIT runs, express.e:10106-10123). A door that sets ED_BATCH_REQUESTED
 * and copies the object back asks for the message's batch upload
 * (express.e:10133 rzmsg:=1).
 *
 * Both XIM dispatchers (xim/data-query and session/DoorMessageHandler) answer
 * through here.
 */
import type { MoiraEmulator } from '../cpu/MoiraEmulator';
import type { ExecLibrary } from '../api/ExecLibrary';
import { DoorConstants } from '../DoorTypes';

export const EDITOR_STRUCT_SIZE = 26;
const PATH_CAPACITY = 256;

export interface EditorState {
  maxFileLength: number;
  maxScrLength: number;
  editorTop: number;
  editorMaxWidth: number;
  editorFlags: number;
  editorFile: string | null;
  editorIncludeFile: string | null;
  editorPrependFile: string | null;
  editorPostPendFile: string | null;
}

const PATH_FIELDS = ['editorFile', 'editorIncludeFile', 'editorPrependFile', 'editorPostPendFile'] as const;
type PathField = typeof PATH_FIELDS[number];
const PATH_OFFSET: Record<PathField, number> = {
  editorFile: 10, editorIncludeFile: 14, editorPrependFile: 18, editorPostPendFile: 22,
};

/** The 26 bytes for `state`, its four strings at `pointers` (0 = none). */
export function encodeEditorStruct(state: EditorState, pointers: Record<PathField, number>): Buffer {
  const buf = Buffer.alloc(EDITOR_STRUCT_SIZE);
  buf.writeInt16BE((state.maxFileLength << 16) >> 16, 0);
  buf.writeUInt8(state.maxScrLength & 0xff, 2);
  buf.writeUInt8(state.editorTop & 0xff, 3);
  buf.writeUInt8(state.editorMaxWidth & 0xff, 4);
  buf.writeUInt32BE(state.editorFlags >>> 0, 6);
  for (const f of PATH_FIELDS) buf.writeUInt32BE(state[f] === null ? 0 : pointers[f] >>> 0, PATH_OFFSET[f]);
  return buf;
}

/** The numbers and the four pointers of a 26-byte object. */
export function decodeEditorStruct(buf: Buffer): Omit<EditorState, PathField> & { pointers: Record<PathField, number> } {
  const pointers = {} as Record<PathField, number>;
  for (const f of PATH_FIELDS) pointers[f] = buf.readUInt32BE(PATH_OFFSET[f]);
  return {
    maxFileLength: buf.readInt16BE(0),
    maxScrLength: buf.readUInt8(2),
    editorTop: buf.readUInt8(3),
    editorMaxWidth: buf.readUInt8(4),
    editorFlags: buf.readUInt32BE(6),
    pointers,
  };
}

/** Where a door session keeps the board's copies of the four strings. */
export interface EditorStringPool { addrs?: Record<PathField, number> }

function readCString(emulator: MoiraEmulator, addr: number): string {
  let s = '';
  for (let i = 0; i < PATH_CAPACITY; i++) {
    const b = emulator.readMemory(addr + i);
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

/** express.e:3933 - the board's object into the door's buffer at `dest`. */
export function editorStructToDoor(
  emulator: MoiraEmulator,
  execLibrary: ExecLibrary,
  state: EditorState | undefined,
  dest: number,
  pool: EditorStringPool,
): void {
  if (!dest) return;
  if (!state) {
    emulator.writeMemoryBuffer(dest, Buffer.alloc(EDITOR_STRUCT_SIZE));
    return;
  }
  if (!pool.addrs) {
    const base = execLibrary.allocMem(PATH_CAPACITY * PATH_FIELDS.length, DoorConstants.MEMF_PUBLIC_CLEAR);
    pool.addrs = {} as Record<PathField, number>;
    PATH_FIELDS.forEach((f, i) => { pool.addrs![f] = base ? base + i * PATH_CAPACITY : 0; });
  }
  for (const f of PATH_FIELDS) {
    const value = state[f];
    const addr = pool.addrs[f];
    if (value === null || !addr) continue;
    const bytes = Buffer.from(value.slice(0, PATH_CAPACITY - 1), 'latin1');
    emulator.writeMemoryBuffer(addr, Buffer.concat([bytes, Buffer.from([0])]));
  }
  emulator.writeMemoryBuffer(dest, encodeEditorStruct(state, pool.addrs));
}

/** express.e:3931 - the door's object at `src` becomes the board's. */
export function editorStructFromDoor(emulator: MoiraEmulator, src: number): EditorState | undefined {
  if (!src) return undefined;
  const bytes = Buffer.alloc(EDITOR_STRUCT_SIZE);
  for (let i = 0; i < EDITOR_STRUCT_SIZE; i++) bytes[i] = emulator.readMemory(src + i);
  const { pointers, ...numbers } = decodeEditorStruct(bytes);
  const state = { ...numbers } as EditorState;
  for (const f of PATH_FIELDS) state[f] = pointers[f] ? readCString(emulator, pointers[f]) : null;
  return state;
}
