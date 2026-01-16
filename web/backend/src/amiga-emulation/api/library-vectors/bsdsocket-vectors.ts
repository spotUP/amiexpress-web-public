/**
 * bsdsocket.library function vectors
 *
 * Reference: AmiTCP SDK, Miami SDK
 * LVO = Library Vector Offset (in bytes from library base)
 *
 * Note: bsdsocket.library is not part of standard AmigaOS.
 * It's provided by AmiTCP, Miami, Roadshow, or similar TCP/IP stacks.
 */

import { LibraryVector } from "./types";
import { BsdSocketLibrary } from "../BsdSocketLibrary";

export const BSDSOCKET_VECTORS: LibraryVector[] = [
  // socket() - Create a socket
  // LVO: -30
  {
    offset: -30,
    name: "socket",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.socket();
    },
  },

  // bind() - Bind a socket to an address
  // LVO: -36
  {
    offset: -36,
    name: "bind",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] bind() - stub, returning 0`);
      return 0;
    },
  },

  // listen() - Listen for connections
  // LVO: -42
  {
    offset: -42,
    name: "listen",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] listen() - stub, returning 0`);
      return 0;
    },
  },

  // accept() - Accept a connection
  // LVO: -48
  {
    offset: -48,
    name: "accept",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] accept() - stub, returning -1`);
      return -1;
    },
  },

  // connect() - Connect to a server
  // LVO: -54
  {
    offset: -54,
    name: "connect",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.connect();
    },
  },

  // sendto() - Send data to a specific address
  // LVO: -60
  {
    offset: -60,
    name: "sendto",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] sendto() - using send()`);
      return lib.send();
    },
  },

  // send() - Send data on a connected socket
  // LVO: -66
  {
    offset: -66,
    name: "send",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.send();
    },
  },

  // recvfrom() - Receive data with address info
  // LVO: -72
  {
    offset: -72,
    name: "recvfrom",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] recvfrom() - using recv()`);
      return lib.recv();
    },
  },

  // recv() - Receive data from a connected socket
  // LVO: -78
  {
    offset: -78,
    name: "recv",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.recv();
    },
  },

  // shutdown() - Shut down part of a full-duplex connection
  // LVO: -84
  {
    offset: -84,
    name: "shutdown",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] shutdown() - stub, returning 0`);
      return 0;
    },
  },

  // setsockopt() - Set socket options
  // LVO: -90
  {
    offset: -90,
    name: "setsockopt",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] setsockopt() - stub, returning 0`);
      return 0;
    },
  },

  // getsockopt() - Get socket options
  // LVO: -96
  {
    offset: -96,
    name: "getsockopt",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getsockopt() - stub, returning 0`);
      return 0;
    },
  },

  // getsockname() - Get socket name
  // LVO: -102
  {
    offset: -102,
    name: "getsockname",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getsockname() - stub, returning 0`);
      return 0;
    },
  },

  // getpeername() - Get peer name
  // LVO: -108
  {
    offset: -108,
    name: "getpeername",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getpeername() - stub, returning 0`);
      return 0;
    },
  },

  // IoctlSocket() - I/O control on socket
  // LVO: -114
  {
    offset: -114,
    name: "IoctlSocket",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] IoctlSocket() - stub, returning 0`);
      return 0;
    },
  },

  // CloseSocket() - Close a socket
  // LVO: -120
  {
    offset: -120,
    name: "CloseSocket",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.closeSocket();
    },
  },

  // WaitSelect() - Wait for socket activity
  // LVO: -126
  {
    offset: -126,
    name: "WaitSelect",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] WaitSelect() - stub, returning 0`);
      return 0;
    },
  },

  // SetSocketSignals() - Set socket signals
  // LVO: -132
  {
    offset: -132,
    name: "SetSocketSignals",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] SetSocketSignals() - stub`);
      return 0;
    },
  },

  // getdtablesize() - Get descriptor table size
  // LVO: -138
  {
    offset: -138,
    name: "getdtablesize",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getdtablesize() - returning 256`);
      return 256;
    },
  },

  // ObtainSocket() - Obtain a socket from another process
  // LVO: -144
  {
    offset: -144,
    name: "ObtainSocket",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] ObtainSocket() - stub, returning -1`);
      return -1;
    },
  },

  // ReleaseSocket() - Release a socket to another process
  // LVO: -150
  {
    offset: -150,
    name: "ReleaseSocket",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] ReleaseSocket() - stub, returning -1`);
      return -1;
    },
  },

  // ReleaseCopyOfSocket() - Release a copy of a socket
  // LVO: -156
  {
    offset: -156,
    name: "ReleaseCopyOfSocket",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] ReleaseCopyOfSocket() - stub, returning -1`);
      return -1;
    },
  },

  // Errno() - Get errno value
  // LVO: -162
  {
    offset: -162,
    name: "Errno",
    handler: (emu, lib: BsdSocketLibrary) => {
      const errno = lib.getErrno();
      console.log(`[BsdSocketLibrary] Errno() = ${errno}`);
      return errno;
    },
  },

  // SetErrnoPtr() - Set errno pointer
  // LVO: -168
  {
    offset: -168,
    name: "SetErrnoPtr",
    handler: (emu, lib: BsdSocketLibrary) => {
      const ptr = emu.getRegister(8); // A0
      const size = emu.getRegister(0); // D0
      console.log(`[BsdSocketLibrary] SetErrnoPtr(ptr=0x${ptr.toString(16)}, size=${size})`);
      lib.setErrnoPtr(ptr);
      return 0;
    },
  },

  // Inet_NtoA() - Convert network address to string
  // LVO: -174
  {
    offset: -174,
    name: "Inet_NtoA",
    handler: (emu, lib: BsdSocketLibrary) => {
      const addr = emu.getRegister(0); // D0 = IP address in network byte order
      const ip = `${(addr >> 24) & 0xFF}.${(addr >> 16) & 0xFF}.${(addr >> 8) & 0xFF}.${addr & 0xFF}`;
      console.log(`[BsdSocketLibrary] Inet_NtoA(0x${addr.toString(16)}) = "${ip}"`);
      // Write to a static buffer and return pointer
      const bufAddr = 0x300100;
      emu.writeString(bufAddr, ip);
      return bufAddr;
    },
  },

  // inet_addr() - Convert string to network address
  // LVO: -180
  {
    offset: -180,
    name: "inet_addr",
    handler: (emu, lib: BsdSocketLibrary) => {
      const strPtr = emu.getRegister(8); // A0
      const str = emu.readString(strPtr);
      console.log(`[BsdSocketLibrary] inet_addr("${str}")`);
      const parts = str.split('.').map(p => parseInt(p, 10));
      if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return 0xFFFFFFFF; // INADDR_NONE
      }
      const addr = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
      return addr >>> 0;
    },
  },

  // Inet_LnaOf() - Get local network address
  // LVO: -186
  {
    offset: -186,
    name: "Inet_LnaOf",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] Inet_LnaOf() - stub, returning 0`);
      return 0;
    },
  },

  // Inet_NetOf() - Get network number
  // LVO: -192
  {
    offset: -192,
    name: "Inet_NetOf",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] Inet_NetOf() - stub, returning 0`);
      return 0;
    },
  },

  // Inet_MakeAddr() - Make internet address
  // LVO: -198
  {
    offset: -198,
    name: "Inet_MakeAddr",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] Inet_MakeAddr() - stub, returning 0`);
      return 0;
    },
  },

  // inet_network() - Convert string to network number
  // LVO: -204
  {
    offset: -204,
    name: "inet_network",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] inet_network() - stub, returning 0`);
      return 0;
    },
  },

  // gethostbyname() - Get host by name
  // LVO: -210
  {
    offset: -210,
    name: "gethostbyname",
    handler: (emu, lib: BsdSocketLibrary) => {
      return lib.gethostbyname();
    },
  },

  // gethostbyaddr() - Get host by address
  // LVO: -216
  {
    offset: -216,
    name: "gethostbyaddr",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] gethostbyaddr() - stub, returning NULL`);
      return 0;
    },
  },

  // getnetbyname() - Get network by name
  // LVO: -222
  {
    offset: -222,
    name: "getnetbyname",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getnetbyname() - stub, returning NULL`);
      return 0;
    },
  },

  // getnetbyaddr() - Get network by address
  // LVO: -228
  {
    offset: -228,
    name: "getnetbyaddr",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getnetbyaddr() - stub, returning NULL`);
      return 0;
    },
  },

  // getservbyname() - Get service by name
  // LVO: -234
  {
    offset: -234,
    name: "getservbyname",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getservbyname() - stub, returning NULL`);
      return 0;
    },
  },

  // getservbyport() - Get service by port
  // LVO: -240
  {
    offset: -240,
    name: "getservbyport",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getservbyport() - stub, returning NULL`);
      return 0;
    },
  },

  // getprotobyname() - Get protocol by name
  // LVO: -246
  {
    offset: -246,
    name: "getprotobyname",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getprotobyname() - stub, returning NULL`);
      return 0;
    },
  },

  // getprotobynumber() - Get protocol by number
  // LVO: -252
  {
    offset: -252,
    name: "getprotobynumber",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] getprotobynumber() - stub, returning NULL`);
      return 0;
    },
  },

  // vsyslog() - System log (vararg)
  // LVO: -258
  {
    offset: -258,
    name: "vsyslog",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] vsyslog() - stub`);
      return 0;
    },
  },

  // Dup2Socket() - Duplicate socket descriptor
  // LVO: -264
  {
    offset: -264,
    name: "Dup2Socket",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] Dup2Socket() - stub, returning -1`);
      return -1;
    },
  },

  // sendmsg() - Send message
  // LVO: -270
  {
    offset: -270,
    name: "sendmsg",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] sendmsg() - using send()`);
      return lib.send();
    },
  },

  // recvmsg() - Receive message
  // LVO: -276
  {
    offset: -276,
    name: "recvmsg",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] recvmsg() - using recv()`);
      return lib.recv();
    },
  },

  // gethostname() - Get host name
  // LVO: -282
  {
    offset: -282,
    name: "gethostname",
    handler: (emu, lib: BsdSocketLibrary) => {
      const bufPtr = emu.getRegister(8); // A0
      const len = emu.getRegister(0);    // D0
      const hostname = "amiga";
      console.log(`[BsdSocketLibrary] gethostname() = "${hostname}"`);
      emu.writeString(bufPtr, hostname);
      return 0;
    },
  },

  // gethostid() - Get host ID
  // LVO: -288
  {
    offset: -288,
    name: "gethostid",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] gethostid() - returning 0x7F000001 (127.0.0.1)`);
      return 0x7F000001;
    },
  },

  // SocketBaseTagList() - Configure socket library
  // LVO: -294
  {
    offset: -294,
    name: "SocketBaseTagList",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] SocketBaseTagList() - stub, returning 0`);
      return 0;
    },
  },

  // GetSocketEvents() - Get socket events
  // LVO: -300
  {
    offset: -300,
    name: "GetSocketEvents",
    handler: (emu, lib: BsdSocketLibrary) => {
      console.log(`[BsdSocketLibrary] GetSocketEvents() - stub, returning 0`);
      return 0;
    },
  },
];
