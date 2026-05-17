/**
 * LoginEmitter — the structural interface shared by socket.io's `Socket`
 * and the telnet/SSH wrapper built at `web/backend/src/index.ts:1018`.
 *
 * The login + post-auth pipeline takes a `LoginEmitter` rather than a
 * concrete `Socket` so the same code runs across all three transports.
 * `Socket` satisfies this structurally (no cast required); the telnet/
 * SSH wrapper already exposes the same surface (`emit` / `on` / `off` /
 * `id` / `connected` / `disconnect` / `end` / `destroy`), so no changes
 * needed there either.
 *
 * Frontend-only events (`prompt-login`, `prompt-forced-pwd-change`,
 * `modem-speed`, `mask-input`, `login-success`, etc.) the telnet wrapper
 * silently drops — that's the intended behaviour. Telnet/SSH gets a
 * line-buffered equivalent for the UI flows where dropping isn't OK
 * (forced password change, password reset, GDPR backfill); see
 * `services/login-prompt.service.ts`.
 */

import type { Socket } from "socket.io";

export interface LoginEmitter {
  readonly id: string;
  readonly connected: boolean;
  emit(event: string, ...args: unknown[]): boolean | void;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  off(event: string, handler: (...args: unknown[]) => void): unknown;
  disconnect(close?: boolean): unknown;
  handshake?: {
    query?: Record<string, string | string[] | undefined>;
    address?: string;
  };
}

/**
 * Convenience union for call sites that want to accept either a real
 * socket.io `Socket` or a transport wrapper.
 */
export type AsSocketOrEmitter = Socket | LoginEmitter;
