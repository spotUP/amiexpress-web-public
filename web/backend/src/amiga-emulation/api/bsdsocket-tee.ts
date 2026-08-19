/**
 * Byte-exact capture of what a 68K door's socket actually carried.
 *
 * Why this exists: DoorRepo on the live BBS twice computed the same wrong
 * SHA-256 for an archive whose bytes the server was demonstrably serving
 * correctly (curl from inside that very container gets the right digest, and
 * the same door binary against the same server verifies fine under this
 * project's own emulator harness). The failure is therefore somewhere between
 * the socket and the door, and it does not reproduce off the live node -
 * which leaves exactly one honest next step: record the bytes at both ends of
 * the emulator's bsdsocket boundary and compare.
 *
 * Two streams per socket, because they answer different questions:
 *
 *   wire - every Buffer node's socket handed us. Differs from what curl gets
 *          => the problem is the network or the server, not the emulator.
 *   recv - every byte recv() copied into the door's memory. Differs from
 *          `wire` => the emulator lost, duplicated or reordered data.
 *
 * If both match curl and the door STILL hashes something else, the fault is
 * above bsdsocket (http.c, the sink, the hash) and this rules the emulator
 * out rather than leaving it a suspect.
 *
 * OFF unless BSDSOCKET_TEE_DIR names a directory. It writes uncompressed
 * copies of everything a door downloads, so it is a debugging tool that is
 * switched on for one reproduction and switched off again - never a default.
 * Nothing here may throw into the emulator: a diagnostic that can crash the
 * thing it is diagnosing is worse than no diagnostic, so every filesystem
 * call is guarded and failures degrade to "no capture".
 */
import * as fs from 'fs';
import * as path from 'path';

/** Env var naming the capture directory. Unset (or empty) disables capture. */
export const TEE_DIR_ENV = 'BSDSOCKET_TEE_DIR';

export function teeDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env[TEE_DIR_ENV];
  return dir && dir.trim() !== '' ? dir : null;
}

// Sockets are numbered from a small pool and fds are REUSED after
// CloseSocket(), so an fd alone would make two unrelated connections share a
// capture file. A per-process sequence number keeps them apart and preserves
// the order the door opened them in.
let sequence = 0;

export function _resetSequenceForTests(): void {
  sequence = 0;
}

export class SocketTee {
  private constructor(
    readonly wirePath: string,
    readonly recvPath: string
  ) {}

  /**
   * Starts a capture for `fd`, or returns null when capture is off or the
   * directory cannot be used. `label` (the host being connected to) only
   * makes the filenames readable; it is sanitised, never interpreted.
   */
  static create(fd: number, label = '', env: NodeJS.ProcessEnv = process.env): SocketTee | null {
    const dir = teeDir(env);
    if (dir === null) return null;

    const seq = ++sequence;
    const safeLabel = label.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40);
    const stem = `sock${String(seq).padStart(3, '0')}-fd${fd}${safeLabel ? `-${safeLabel}` : ''}`;

    try {
      fs.mkdirSync(dir, { recursive: true });
      const wirePath = path.join(dir, `${stem}.wire.bin`);
      const recvPath = path.join(dir, `${stem}.recv.bin`);
      // Truncate rather than append: a stem is unique per process, so an
      // existing file is a leftover from an earlier run and mixing the two
      // would produce a capture that matches nothing.
      fs.writeFileSync(wirePath, Buffer.alloc(0));
      fs.writeFileSync(recvPath, Buffer.alloc(0));
      return new SocketTee(wirePath, recvPath);
    } catch {
      return null;
    }
  }

  /** Bytes as node's socket delivered them. */
  wire(data: Buffer): void {
    this.append(this.wirePath, data);
  }

  /** Bytes as recv() copied them into the door's memory. */
  recv(data: Buffer): void {
    this.append(this.recvPath, data);
  }

  private append(file: string, data: Buffer): void {
    if (data.length === 0) return;
    try {
      fs.appendFileSync(file, data);
    } catch {
      /* capture is best-effort; never break the door being captured */
    }
  }
}
