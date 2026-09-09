/**
 * WEB_BOT_DATA registry - every domain the chatbot API covers, one place.
 *
 * Chat tools and HTTP routes both build on these functions; nothing here
 * knows about either transport. Domains: users, messages, files,
 * conferences, WHIP, door data, activity, board.
 */
export * from './types';
export * from './caps';
export * as BOTUsers from './users';
export * as BOTMessages from './messages';
export * as BOTFiles from './files';
export * as BOTWhip from './whip';
export * as BOTDoors from './doors';
export * as BOTActivity from './activity';
export * as BOTBoard from './board';
