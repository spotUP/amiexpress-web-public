/**
 * Data Store Module
 *
 * Centralized global state for BBS data
 * Loaded from database on server startup and cached in memory
 */

import { Door, ChatState, DoorSession } from '../types';
import { Conference, MessageBase } from '../bbs/session';

// Global data caches (loaded from database)
export let conferences: Conference[] = [];
export let messageBases: MessageBase[] = [];
export let fileAreas: any[] = [];
export let fileEntries: any[] = [];
export let doors: Door[] = [];
export let doorSessions: DoorSession[] = [];
export let messages: any[] = [];

// Chat system state (mirrors AmiExpress chatFlag, sysopAvail, pagedFlag)
export let chatState: ChatState = {
  sysopAvailable: true, // Like AmiExpress sysopAvail - F7 toggle
  activeSessions: [],
  pagingUsers: [],
  chatToggle: true // Like AmiExpress F7 chat toggle
};

// Setters to update global state
export function setConferences(data: Conference[]) {
  conferences = data;
}

export function setMessageBases(data: MessageBase[]) {
  messageBases = data;
}

export function setFileAreas(data: any[]) {
  fileAreas = data;
}

export function setFileEntries(data: any[]) {
  fileEntries = data;
}

export function setDoors(data: Door[]) {
  doors = data;
}

export function setDoorSessions(data: DoorSession[]) {
  doorSessions = data;
}

export function setMessages(data: any[]) {
  messages = data;
}

export function setChatState(data: ChatState) {
  chatState = data;
}
