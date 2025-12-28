/**
 * Chat Routes Component
 *
 * Renders the ChatTerminal which provides:
 * - xterm.js terminal interface
 * - BBS-style login prompts
 * - Auto-launch of LiveChat door after login
 *
 * This is a 1:1 copy of the BBS LiveChat door experience,
 * just accessed directly at /chat instead of through the BBS menu.
 */

import ChatTerminal from './ChatTerminal';
import './chat.css';

export default function ChatRoutes() {
  return <ChatTerminal />;
}
