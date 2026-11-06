/** Door metadata interface */
export interface DoorMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
  minSecurityLevel: number;
  command: string;
  category: string;
}

/** Door metadata */
export const metadata: DoorMetadata = {
  name: 'LiveChat',
  version: '2.0.0',
  author: 'AmiExpress Team',
  description: 'Advanced multi-user chat with real-time typing',
  minSecurityLevel: 10,
  command: 'LIVECHAT',
  category: 'Communication'
};

/** UI dimensions */
export const layout = {
  sidebarWidth: 16,
  headerHeight: 1,
  inputHeight: 3,
  typingHeight: 3
};

/** Timing config */
export const timing = {
  typingTimeout: 5000,
  typingCleanup: 1000,
  reconnectDelay: 3000
};
