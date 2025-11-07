/**
 * Dependency Injection
 * Centralized dependency management for command handler
 */

// Dependencies (injected)
let db: any;
let config: any;
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let processOlmMessageQueue: any;
let checkSecurity: any;
let setEnvStat: any;
let getRecentCallerActivity: any;
let doors: any[] = [];

// Constants (injected)
let SCREEN_MENU: string;

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

export function setConfig(cfg: any) {
  config = cfg;
}

export function setConferences(confs: any[]) {
  conferences = confs;
}

export function setMessageBases(bases: any[]) {
  messageBases = bases;
}

export function setFileAreas(areas: any[]) {
  fileAreas = areas;
}

export function setProcessOlmMessageQueue(fn: any) {
  console.log('🔧 setProcessOlmMessageQueue called, fn type:', typeof fn);
  processOlmMessageQueue = fn;
  console.log('🔧 processOlmMessageQueue set, now type:', typeof processOlmMessageQueue);
}

export function setCheckSecurity(fn: any) {
  checkSecurity = fn;
}

export function setSetEnvStat(fn: any) {
  setEnvStat = fn;
}

export function setGetRecentCallerActivity(fn: any) {
  getRecentCallerActivity = fn;
}

export function setDoors(doorsList: any[]) {
  doors = doorsList;
}

export function setConstants(constants: any) {
  SCREEN_MENU = constants.SCREEN_MENU;
}

// Getters for internal use
export function getDatabase() { return db; }
export function getConfig() { return config; }
export function getConferences() { return conferences; }
export function getMessageBases() { return messageBases; }
export function getFileAreas() { return fileAreas; }
export function getProcessOlmMessageQueue() { return processOlmMessageQueue; }
export function getCheckSecurity() { return checkSecurity; }
export function getSetEnvStat() { return setEnvStat; }
export function getGetRecentCallerActivity() { return getRecentCallerActivity; }
export function getDoors() { return doors; }
export function getScreenMenu() { return SCREEN_MENU; }
