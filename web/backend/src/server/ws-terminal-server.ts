/**
 * WebSocket Terminal Endpoint
 *
 * Exposes a raw WebSocket terminal at `/ws/terminal`. Third-party
 * clients (web terminals, embed gateways, CLI WS tools) can connect
 * via `wss://bbs.uprough.net/ws/terminal` and get a clean text-mode
 * BBS session — same pipeline web/telnet/SSH already use.
 *
 * Design: WSTerminalConnection mimics the TelnetConnection surface
 * (`on('data'/'close'/'error')`, `write()`, `close()`, `sessionId`,
 * `nodeId`, `session`) so setupTelnetSSHHandler in index.ts can
 * consume it unchanged. No IAC negotiation, no PETSCII, no SSH auth —
 * just raw UTF-8 bytes both ways.
 */

import { EventEmitter } from "events";
import type { Server as HttpServer } from "http";
// @ts-ignore — ws ships untyped here (socket.io's transitive dep, no
// @types/ws in our package.json). Manual typing via `any` below.
import { WebSocketServer } from "ws";

type WSLike = {
  readyState: number;
  readonly OPEN: number;
  send(data: string | Buffer, opts?: { binary?: boolean }): void;
  close(): void;
  on(event: "message", h: (data: Buffer | string) => void): void;
  on(event: "close", h: () => void): void;
  on(event: "error", h: (err: Error) => void): void;
};

import { BBSSession } from "../index";
import { getNextAvailableNodeId } from "./session-manager";

export class WSTerminalConnection extends EventEmitter {
  private ws: WSLike;
  public sessionId: string;
  public nodeId: number;
  public terminalType: string = "modern";
  public session: BBSSession | null = null;

  constructor(ws: WSLike, remoteAddress: string) {
    super();
    this.ws = ws;
    this.nodeId = getNextAvailableNodeId();
    this.sessionId = `wsterm-${this.nodeId}-${Date.now()}`;
    this._remoteAddress = remoteAddress;

    ws.on("message", (chunk: Buffer | string) => {
      // Browsers and CLI WS clients send text frames; tunneled binary
      // is treated as raw bytes too. Coerce to Buffer for consistency
      // with TelnetConnection's 'data' contract.
      const buf =
        typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk;
      this.emit("data", buf);
    });

    ws.on("close", () => {
      this.emit("close");
    });

    ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  private _remoteAddress: string;

  public getRemoteAddress(): string {
    return this._remoteAddress;
  }

  /**
   * Write data back to the client. Strings are sent as text frames;
   * buffers go as binary frames (some terminal renderers care about
   * the type, most don't).
   */
  public write(data: string | Buffer): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    if (typeof data === "string") {
      this.ws.send(data);
    } else {
      this.ws.send(data, { binary: true });
    }
  }

  public close(): void {
    try {
      this.ws.close();
    } catch {
      /* already closing */
    }
  }

  public off(event: string, handler: (...args: any[]) => void): this {
    return super.off(event, handler);
  }
}

/**
 * Attach the WSS terminal server to an existing HTTP server at
 * `/ws/terminal`. Each new connection becomes a WSTerminalConnection;
 * pass it through `connectionHandler` (the same setupTelnetSSHHandler
 * that telnet and SSH use).
 *
 * Why path-based instead of port-based: shares the same TLS cert and
 * the same nginx/Express front. Socket.IO occupies `/socket.io/` so
 * `/ws/terminal/` is free to mount the raw endpoint.
 */
export function attachWSTerminalServer(
  httpServer: HttpServer,
  connectionHandler: (conn: WSTerminalConnection) => void,
): WebSocketServer {
  // `noServer: true` + manual upgrade routing is required when another
  // WebSocket server (Socket.IO) already listens on the same HTTP
  // server. With `{server, path}`, ws registers its own `upgrade`
  // listener and calls `abortHandshake` on every non-matching path —
  // which destroys Socket.IO's upgrades before they finish, surfacing
  // in the browser as "Invalid frame header".
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    } catch {
      return;
    }
    if (url.pathname !== "/ws/terminal") return; // let Socket.IO (or others) handle it
    wss.handleUpgrade(req, socket as any, head, (ws: any) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WSLike, req: any) => {
    const remoteAddress =
      (req?.headers?.["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ||
      req?.socket?.remoteAddress ||
      "unknown";
    const conn = new WSTerminalConnection(ws, remoteAddress);
    console.log(
      `[WS-Terminal] Connection from ${remoteAddress} on node ${conn.nodeId}`,
    );
    connectionHandler(conn);
  });

  wss.on("error", (err: Error) => {
    console.error("[WS-Terminal] Server error:", err);
  });

  console.log("[WS-Terminal] Endpoint ready at /ws/terminal");
  return wss;
}
