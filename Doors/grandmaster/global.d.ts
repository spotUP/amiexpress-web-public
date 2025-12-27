/**
 * Global type definitions for Node.js compatibility
 *
 * The SDK's NetworkEngine includes browser-specific modules (replay, social)
 * that use DOM APIs. These stub definitions allow compilation in Node.js.
 */

// LocalStorage API stub
declare global {
  interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
    readonly length: number;
    key(index: number): string | null;
  }

  var localStorage: Storage;

  // WebRTC API stubs
  interface RTCPeerConnection {
    createOffer(): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    addTrack(track: any, stream: MediaStream): any;
    getReceivers(): any[];
    close(): void;
    onicecandidate: ((event: any) => void) | null;
    ontrack: ((event: any) => void) | null;
  }

  var RTCPeerConnection: {
    new(config?: any): RTCPeerConnection;
  };

  interface RTCSessionDescriptionInit {
    type: 'offer' | 'answer';
    sdp: string;
  }

  interface RTCIceCandidateInit {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }

  interface MediaStream {
    getTracks(): any[];
    getAudioTracks(): any[];
  }

  var MediaStream: {
    new(): MediaStream;
  };

  interface Audio {
    play(): Promise<void>;
    pause(): void;
    currentTime: number;
    volume: number;
    srcObject: MediaStream | null;
  }

  var Audio: {
    new(url?: string): Audio;
  };

  interface Navigator {
    mediaDevices: {
      getUserMedia(constraints: any): Promise<MediaStream>;
    };
  }

  var navigator: Navigator;
}

export {};
