import { Socket } from "socket.io";
import { AmigaDoorSession } from "./AmigaDoorSession";
import * as path from "path";
import { config } from "../config";
import * as fs from "fs";

/**
 * Door Handler - Manages door session lifecycle via Socket.io
 */

// Active door sessions by socket ID
const activeSessions = new Map<string, AmigaDoorSession>();

/**
 * Set up door-related Socket.io event handlers
 */
export function setupDoorHandlers(socket: Socket): void {
  console.log(`[DoorHandler] Setting up handlers for socket ${socket.id}`);

  /**
   * Launch a door
   * Payload: { doorId: string, doorPath?: string }
   */
  socket.on(
    "door:launch",
    async (payload: { doorId: string; doorPath?: string }) => {
      try {
        console.log(`[DoorHandler] Launch request for door: ${payload.doorId}`);

        // Check if session already exists
        if (activeSessions.has(socket.id)) {
          console.warn(
            `[DoorHandler] Session already active for socket ${socket.id}`
          );
          socket.emit("door:error", { message: "Door session already active" });
          return;
        }

        // Determine executable path
        let executablePath: string;

        if (payload.doorPath) {
          // Use provided path (for testing)
          executablePath = payload.doorPath;
        } else {
          // Look up door by ID using Commands/BBSCmd and default Doors path
          const doorsDir = path.join(config.get("dataDir"), "Doors");
          const resolved = resolveDoorPath(payload.doorId, doorsDir);
          if (!resolved) {
            socket.emit("door:error", {
              message: `Door ${payload.doorId} not found (expected ${doorsDir}/${payload.doorId})`,
            });
            return;
          }
          executablePath = resolved;
        }

        console.log(`[DoorHandler] Executable path: ${executablePath}`);

        // Create session
        const session = new AmigaDoorSession(socket, {
          executablePath,
          doorType: "XIM",
          timeout: 600, // 10 minutes
        });

        activeSessions.set(socket.id, session);

        // Start the door
        await session.start();
      } catch (error) {
        console.error("[DoorHandler] Error launching door:", error);
        socket.emit("door:error", {
          message:
            error instanceof Error ? error.message : "Failed to launch door",
        });

        // Clean up failed session
        const session = activeSessions.get(socket.id);
        if (session) {
          session.terminate();
          activeSessions.delete(socket.id);
        }
      }
    }
  );

  /**
   * Get door status
   */
  socket.on("door:status-request", () => {
    const session = activeSessions.get(socket.id);
    socket.emit("door:status", {
      status: session ? "running" : "inactive",
    });
  });

  /**
   * Cleanup on disconnect
   */
  socket.on("disconnect", () => {
    console.log(`[DoorHandler] Socket ${socket.id} disconnected`);
    const session = activeSessions.get(socket.id);
    if (session) {
      console.log(`[DoorHandler] Terminating session for ${socket.id}`);
      session.terminate();
      activeSessions.delete(socket.id);
    }
  });
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Terminate all sessions (for shutdown)
 */
export function terminateAllSessions(): void {
  console.log(
    `[DoorHandler] Terminating ${activeSessions.size} active sessions`
  );
  for (const [socketId, session] of activeSessions) {
    session.terminate();
  }
  activeSessions.clear();
}

/**
 * Resolve a door executable path by ID.
 * Mirrors AmiExpress behavior of looking under Doors/ and preferring a binary
 * matching the door ID inside its directory if present.
 */
function resolveDoorPath(doorId: string, doorsDir: string): string | null {
  const directPath = path.join(doorsDir, doorId);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return directPath;
  }

  const dirPath = path.join(doorsDir, doorId);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    const candidate = path.join(dirPath, doorId);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }

    // Fallback: any file in the directory
    const entries = fs.readdirSync(dirPath);
    const file = entries.find((f) => fs.statSync(path.join(dirPath, f)).isFile());
    if (file) return path.join(dirPath, file);
  }

  return null;
}
