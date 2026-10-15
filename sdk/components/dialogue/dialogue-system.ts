/**
 * Dialogue System - Branching Conversations
 *
 * Handles NPC conversations, branching dialogue trees, and player choices.
 *
 * Features:
 * - Branching dialogue trees
 * - Conditional responses (based on flags, inventory, stats)
 * - Player choice tracking
 * - Typing animation effects
 * - Portrait/speaker display
 * - Quest integration
 * - Save/load dialogue state
 *
 * @example Basic Dialogue
 * ```typescript
 * const dialogue = new DialogueSystem();
 *
 * dialogue.createTree('merchant', {
 *   id: 'merchant_greeting',
 *   speaker: 'Merchant',
 *   text: 'Welcome to my shop! What can I do for you?',
 *   choices: [
 *     { text: 'Show me your wares', next: 'shop_menu' },
 *     { text: 'Got any quests?', next: 'quest_offer' },
 *     { text: 'Goodbye', next: null }
 *   ]
 * });
 *
 * dialogue.startConversation('merchant');
 * ```
 *
 * @example Conditional Dialogue
 * ```typescript
 * dialogue.createTree('guard', {
 *   id: 'guard_gate',
 *   speaker: 'Guard',
 *   text: 'Halt! What business do you have here?',
 *   choices: [
 *     {
 *       text: 'I have a pass from the king',
 *       next: 'guard_allow',
 *       condition: (ctx) => ctx.hasItem('royal_pass')
 *     },
 *     {
 *       text: 'Just passing through',
 *       next: 'guard_deny'
 *     }
 *   ]
 * });
 * ```
 */

import { EventEmitter } from 'events';

/**
 * Dialogue context (game state for conditions)
 */
export interface DialogueContext {
  /** Player flags/variables */
  flags: Map<string, any>;
  /** Check if has item */
  hasItem: (itemId: string) => boolean;
  /** Check stat value */
  getStat: (statName: string) => number;
  /** Custom context data */
  data: Record<string, any>;
}

/**
 * Dialogue choice
 */
export interface DialogueChoice {
  /** Choice text */
  text: string;
  /** Next node ID (null = end conversation) */
  next: string | null;
  /** Condition to show this choice */
  condition?: (ctx: DialogueContext) => boolean;
  /** Action to execute when chosen */
  action?: (ctx: DialogueContext) => void;
  /** Flag to set when chosen */
  setFlag?: string;
  /** Flag value */
  flagValue?: any;
}

/**
 * Dialogue node
 */
export interface DialogueNode {
  /** Node ID */
  id: string;
  /** Speaker name */
  speaker: string;
  /** Dialogue text */
  text: string;
  /** Player choices */
  choices?: DialogueChoice[];
  /** Auto-advance to next node (no choice) */
  autoNext?: string;
  /** Delay before auto-advance (ms) */
  autoDelay?: number;
  /** Condition to show this node */
  condition?: (ctx: DialogueContext) => boolean;
  /** Action when node is shown */
  onEnter?: (ctx: DialogueContext) => void;
  /** Portrait/avatar ID */
  portrait?: string;
  /** Voice/sound effect */
  sound?: string;
}

/**
 * Dialogue tree (conversation)
 */
export interface DialogueTree {
  /** Tree ID */
  id: string;
  /** Tree name */
  name: string;
  /** Root node ID */
  root: string;
  /** All nodes */
  nodes: Map<string, DialogueNode>;
}

/**
 * Active conversation state
 */
export interface ConversationState {
  /** Current tree ID */
  treeId: string;
  /** Current node ID */
  nodeId: string;
  /** Conversation history */
  history: string[];
  /** Start time */
  startTime: Date;
}

/**
 * Typing animation config
 */
export interface TypingConfig {
  /** Enable typing animation */
  enabled: boolean;
  /** Characters per second */
  speed: number;
  /** Sound effect per character */
  sound?: string;
}

/**
 * Dialogue System
 * Manages branching conversations and player choices
 */
export class DialogueSystem extends EventEmitter {
  private trees: Map<string, DialogueTree> = new Map();
  private context: DialogueContext;
  private currentConversation?: ConversationState;
  private typingConfig: TypingConfig;

  constructor() {
    super();

    this.context = {
      flags: new Map(),
      hasItem: () => false,
      getStat: () => 0,
      data: {}
    };

    this.typingConfig = {
      enabled: true,
      speed: 50 // characters per second
    };
  }

  /**
   * Set dialogue context (game state)
   */
  setContext(context: Partial<DialogueContext>): void {
    this.context = {
      ...this.context,
      ...context
    };
  }

  /**
   * Create dialogue tree
   */
  createTree(id: string, name: string, rootNode: DialogueNode): DialogueTree {
    const tree: DialogueTree = {
      id,
      name,
      root: rootNode.id,
      nodes: new Map([[rootNode.id, rootNode]])
    };

    this.trees.set(id, tree);
    this.emit('tree-created', tree);

    return tree;
  }

  /**
   * Add node to tree
   */
  addNode(treeId: string, node: DialogueNode): void {
    const tree = this.trees.get(treeId);
    if (!tree) throw new Error(`Tree ${treeId} not found`);

    tree.nodes.set(node.id, node);
    this.emit('node-added', treeId, node);
  }

  /**
   * Get dialogue tree
   */
  getTree(id: string): DialogueTree | undefined {
    return this.trees.get(id);
  }

  /**
   * Start conversation
   */
  startConversation(treeId: string): DialogueNode | null {
    const tree = this.trees.get(treeId);
    if (!tree) throw new Error(`Tree ${treeId} not found`);

    const rootNode = tree.nodes.get(tree.root);
    if (!rootNode) throw new Error(`Root node ${tree.root} not found`);

    this.currentConversation = {
      treeId,
      nodeId: tree.root,
      history: [],
      startTime: new Date()
    };

    this.emit('conversation-started', treeId);
    return this.showNode(rootNode);
  }

  /**
   * Make choice and advance dialogue
   */
  makeChoice(choiceIndex: number): DialogueNode | null {
    if (!this.currentConversation) {
      throw new Error('No active conversation');
    }

    const tree = this.trees.get(this.currentConversation.treeId);
    if (!tree) return null;

    const currentNode = tree.nodes.get(this.currentConversation.nodeId);
    if (!currentNode || !currentNode.choices) return null;

    const choice = currentNode.choices[choiceIndex];
    if (!choice) throw new Error(`Invalid choice index: ${choiceIndex}`);

    // Check condition
    if (choice.condition && !choice.condition(this.context)) {
      this.emit('choice-denied', choice);
      return null;
    }

    // Execute action
    if (choice.action) {
      choice.action(this.context);
    }

    // Set flag
    if (choice.setFlag) {
      this.context.flags.set(choice.setFlag, choice.flagValue ?? true);
    }

    // Record choice
    this.currentConversation.history.push(currentNode.id);
    this.emit('choice-made', choice, choiceIndex);

    // Advance to next node
    if (choice.next === null) {
      this.endConversation();
      return null;
    }

    const nextNode = tree.nodes.get(choice.next);
    if (!nextNode) {
      this.endConversation();
      return null;
    }

    this.currentConversation.nodeId = choice.next;
    return this.showNode(nextNode);
  }

  /**
   * Show dialogue node
   */
  private showNode(node: DialogueNode): DialogueNode | null {
    // Check condition
    if (node.condition && !node.condition(this.context)) {
      // Skip to auto-next if available
      if (node.autoNext) {
        const tree = this.trees.get(this.currentConversation!.treeId);
        const nextNode = tree?.nodes.get(node.autoNext);
        if (nextNode) return this.showNode(nextNode);
      }
      return null;
    }

    // Execute on-enter action
    if (node.onEnter) {
      node.onEnter(this.context);
    }

    this.emit('node-shown', node);

    // Auto-advance if configured
    if (node.autoNext && !node.choices) {
      const delay = node.autoDelay || 0;
      setTimeout(() => {
        if (this.currentConversation) {
          const tree = this.trees.get(this.currentConversation.treeId);
          const nextNode = tree?.nodes.get(node.autoNext!);
          if (nextNode) {
            this.currentConversation.nodeId = node.autoNext!;
            this.showNode(nextNode);
          }
        }
      }, delay);
    }

    return node;
  }

  /**
   * Get current dialogue node
   */
  getCurrentNode(): DialogueNode | null {
    if (!this.currentConversation) return null;

    const tree = this.trees.get(this.currentConversation.treeId);
    if (!tree) return null;

    return tree.nodes.get(this.currentConversation.nodeId) || null;
  }

  /**
   * Get available choices (filtered by conditions)
   */
  getAvailableChoices(): DialogueChoice[] {
    const node = this.getCurrentNode();
    if (!node || !node.choices) return [];

    return node.choices.filter(choice => {
      if (!choice.condition) return true;
      return choice.condition(this.context);
    });
  }

  /**
   * End conversation
   */
  endConversation(): void {
    if (!this.currentConversation) return;

    this.emit('conversation-ended', this.currentConversation);
    this.currentConversation = undefined;
  }

  /**
   * Check if in conversation
   */
  isInConversation(): boolean {
    return this.currentConversation !== undefined;
  }

  /**
   * Get conversation history
   */
  getHistory(): string[] {
    return this.currentConversation?.history || [];
  }

  /**
   * Set flag
   */
  setFlag(key: string, value: any): void {
    this.context.flags.set(key, value);
    this.emit('flag-set', key, value);
  }

  /**
   * Get flag
   */
  getFlag(key: string): any {
    return this.context.flags.get(key);
  }

  /**
   * Has flag
   */
  hasFlag(key: string): boolean {
    return this.context.flags.has(key);
  }

  /**
   * Clear flag
   */
  clearFlag(key: string): void {
    this.context.flags.delete(key);
    this.emit('flag-cleared', key);
  }

  /**
   * Set typing animation config
   */
  setTypingConfig(config: Partial<TypingConfig>): void {
    this.typingConfig = {
      ...this.typingConfig,
      ...config
    };
  }

  /**
   * Get typing animation config
   */
  getTypingConfig(): TypingConfig {
    return { ...this.typingConfig };
  }

  /**
   * Render text with typing animation
   * Returns array of partial strings to display frame by frame
   */
  renderTypingAnimation(text: string): string[] {
    if (!this.typingConfig.enabled) {
      return [text];
    }

    const frames: string[] = [];
    const charsPerFrame = Math.max(1, Math.floor(this.typingConfig.speed / 20));

    for (let i = 0; i < text.length; i += charsPerFrame) {
      frames.push(text.substring(0, i + charsPerFrame));
    }

    // Ensure final frame shows complete text
    if (frames[frames.length - 1] !== text) {
      frames.push(text);
    }

    return frames;
  }

  /**
   * Import dialogue tree from JSON
   */
  importTreeFromJSON(json: string): DialogueTree {
    const data = JSON.parse(json);

    const tree: DialogueTree = {
      id: data.id,
      name: data.name,
      root: data.root,
      nodes: new Map()
    };

    for (const nodeData of data.nodes) {
      tree.nodes.set(nodeData.id, nodeData);
    }

    this.trees.set(tree.id, tree);
    this.emit('tree-imported', tree);

    return tree;
  }

  /**
   * Export dialogue tree to JSON
   */
  exportTreeToJSON(treeId: string): string {
    const tree = this.trees.get(treeId);
    if (!tree) throw new Error(`Tree ${treeId} not found`);

    return JSON.stringify({
      id: tree.id,
      name: tree.name,
      root: tree.root,
      nodes: Array.from(tree.nodes.values())
    }, null, 2);
  }

  /**
   * Save dialogue state to JSON
   */
  saveState(): string {
    return JSON.stringify({
      flags: Array.from(this.context.flags.entries()),
      conversation: this.currentConversation
    });
  }

  /**
   * Load dialogue state from JSON
   */
  loadState(json: string): void {
    const data = JSON.parse(json);

    this.context.flags = new Map(data.flags);
    this.currentConversation = data.conversation;

    this.emit('state-loaded');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.trees.clear();
    this.context.flags.clear();
    this.currentConversation = undefined;
    this.removeAllListeners();
  }
}
