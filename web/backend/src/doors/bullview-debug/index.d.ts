import { Socket as SocketIOSocket } from 'socket.io';

export declare function runBullViewDebugDoor(socket: SocketIOSocket, session: any): Promise<void>;

declare const _default: {
  name: string;
  alias: string;
  description: string;
  entry: typeof runBullViewDebugDoor;
};

export default _default;

export declare function runDoor(doorSession: {
  socket: SocketIOSocket;
  bbsSession: any;
}): Promise<void>;
