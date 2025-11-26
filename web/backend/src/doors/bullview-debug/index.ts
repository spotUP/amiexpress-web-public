/**
 * BullView Debug Door (TypeScript)
 *
 * Minimal 1:1 port of BullView’s XIM flow to debug the AEDoor handshake.
 * Implements:
 *  - DoorStart(node): FindPort AEDoorPort<n>, create DoorReplyPort<n>,
 *    seed msg (Command=JH_REGISTER, Data=0, String=""), Transfer().
 *  - Transfer(): PutMsg -> WaitPort -> GetMsg, dumping jhMessage before/after.
 *  - Simple bulletin prompt using JH_LI/JH_HK equivalents to exercise IO.
 *
 * Heavy logging of all jhMessage fields on both outbound and inbound paths.
 */

import { Socket as SocketIOSocket } from 'socket.io';
import { XIMCommand } from '../../amiga-emulation/xim/types';
import { XIMHostService } from '../../amiga-emulation/xim/host-service';

type MsgStruct = {
  addr: number;
  replyPort: number;
  command: number;
  data: number;
  nodeId: number;
  lineNum: number;
  signal: number;
  task: number;
  str: string;
};

function dumpMsg(prefix: string, parsed: any): MsgStruct {
  const { msgAddr, replyPort, command, data, nodeId, lineNumber, signal, task, string } = parsed;
  console.log(
    `[bullview-debug] ${prefix} msg=0x${msgAddr.toString(16)} cmd=${command} data=${data} node=${nodeId} line=${lineNumber} sig=${signal} task=0x${task.toString(
      16
    )} str="${string}"`
  );
  return {
    addr: msgAddr,
    replyPort,
    command,
    data,
    nodeId,
    lineNum: lineNumber,
    signal,
    task,
    str: string,
  };
}

export async function runBullViewDebugDoor(socket: SocketIOSocket, session: any): Promise<void> {
  console.log('[bullview-debug] starting TS BullView debug door');

  const node = session?.nodeId ?? (session as any)?.nodeNumber ?? 1;
  const hostService = await XIMHostService.create(socket as any, session, { nodeId: node });

  // Allocate message handle in the same emulator the host service uses.
  const handle = hostService.createHandle(node);

  // Seed message like bull.h DoorStart
  hostService.setCommand(handle, XIMCommand.JH_REGISTER);
  hostService.setData(handle, 0);
  hostService.setString(handle, '');

  const transfer = () => {
    dumpMsg('OUT', hostService.parse(handle));
    hostService.transfer(handle);
    dumpMsg('IN', hostService.parse(handle));
  };

  // Register (host-side: will bounce off harness; no BBS reply handler yet)
  transfer();

  // Simple prompt loop: ask for a bulletin number and echo back
  socket.emit('ansi-output', '\r\n[bullview-debug] Enter bulletin number (0-9) or ENTER to quit: ');
  const inputBuf: string[] = [];
  const onData = (data: string) => {
    inputBuf.push(data);
  };
  socket.on('door:input', onData);

  const waitForLine = async (): Promise<string> =>
    new Promise((resolve) => {
      const check = () => {
        const buf = inputBuf.join('');
        if (buf.includes('\r') || buf.includes('\n')) {
          socket.off('door:input', onData);
          resolve(buf.replace(/[\r\n]/g, ''));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

  const line = await waitForLine();
  // write string with explicit cap
  hostService.setString(handle, line);
  hostService.setCommand(handle, XIMCommand.JH_LI);
  hostService.setData(handle, 3);
  transfer();

  socket.emit('ansi-output', `\r\n[bullview-debug] you entered "${line}"\r\n`);
  hostService.setCommand(handle, XIMCommand.JH_SHUTDOWN);
  transfer();
  socket.emit('ansi-output', '\r\n[bullview-debug] done\r\n');
}

export default {
  name: 'BULLVIEW-DEBUG',
  alias: 'BVDBG',
  description: 'Debug BullView XIM handshake',
  entry: runBullViewDebugDoor,
};

// DoorManager expects a runDoor(sessionObj) signature.
export async function runDoor(doorSession: {
  socket: SocketIOSocket;
  bbsSession: any;
}): Promise<void> {
  return runBullViewDebugDoor(doorSession.socket, doorSession.bbsSession);
}
