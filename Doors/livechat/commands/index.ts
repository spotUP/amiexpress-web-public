export * from './types';
import { CommandRegistry } from './types';
import { joinCmd, leaveCmd, createCmd, topicCmd, deleteCmd } from './channel';
import { msgCmd, meCmd, replyCmd, threadCmd, editCmd } from './messaging';
import { whoCmd, whoisCmd, awayCmd, backCmd, statusCmd, nickCmd } from './user';
import { kickCmd, banCmd, unbanCmd, muteCmd, opCmd } from './moderation';
import { helpCmd, quitCmd, clearCmd, searchCmd, pinCmd, pinsCmd } from './utility';
import { soundsCmd, compactCmd, timestampsCmd } from './prefs';
import { reactCmd, unreactCmd, reactionsCmd, thumbsUpCmd, heartCmd } from './reactions';
import { voiceCmd, deafenCmd, undeafenCmd } from './voice';
import { motdCmd, inviteCmd, uninviteCmd, modeCmd } from './mode';

/** Create command registry with all commands */
export function createCommandRegistry(): CommandRegistry {
  const r = new CommandRegistry();
  // Channel
  [joinCmd, leaveCmd, createCmd, topicCmd, deleteCmd].forEach(c => r.register(c));
  // Messaging
  [msgCmd, meCmd, replyCmd, threadCmd, editCmd].forEach(c => r.register(c));
  // User
  [whoCmd, whoisCmd, awayCmd, backCmd, statusCmd, nickCmd].forEach(c => r.register(c));
  // Moderation
  [kickCmd, banCmd, unbanCmd, muteCmd, opCmd].forEach(c => r.register(c));
  // Utility
  [quitCmd, clearCmd, searchCmd, pinCmd, pinsCmd].forEach(c => r.register(c));
  r.register(helpCmd(r));
  // Prefs
  [soundsCmd, compactCmd, timestampsCmd].forEach(c => r.register(c));
  // Note: eventsCmd is registered in app.ts after dependencies are available
  // Reactions
  [reactCmd, unreactCmd, reactionsCmd, thumbsUpCmd, heartCmd].forEach(c => r.register(c));
  // Voice
  [voiceCmd, deafenCmd, undeafenCmd].forEach(c => r.register(c));
  // Channel mode / MOTD / invites
  [motdCmd, inviteCmd, uninviteCmd, modeCmd].forEach(c => r.register(c));
  return r;
}
