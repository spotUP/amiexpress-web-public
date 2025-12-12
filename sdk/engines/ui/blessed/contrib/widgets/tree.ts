/**
 * Tree Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/tree.js
 * Hierarchical tree view with expand/collapse functionality
 */

import { Box } from '../../widgets/box';
import { List } from '../../widgets/list';
import type { ElementOptions } from '../../core/types';

export interface TreeNode {
  name?: string;
  extended?: boolean;
  children?: TreeNode[] | Record<string, TreeNode> | ((node: TreeNode) => TreeNode[] | Record<string, TreeNode>);
  childrenContent?: TreeNode[] | Record<string, TreeNode>;
  parent?: TreeNode | null;
  position?: number;
  depth?: number;
}

export interface TreeTemplate {
  extend?: string;
  retract?: string;
  lines?: boolean;
  spaces?: boolean;
}

export interface TreeOptions extends ElementOptions {
  extended?: boolean;
  keys?: string[] | boolean;
  vi?: boolean;
  mouse?: boolean;
  scrollable?: boolean;
  ignoreKeys?: string[];
  template?: TreeTemplate;
  selectedBg?: string | number | number[];
  selectedFg?: string | number | number[];
  bold?: boolean;
}

/**
 * Tree Widget
 * Displays hierarchical data with expand/collapse
 */
export class Tree extends Box {
  declare options: TreeOptions;
  data: TreeNode = {};
  nodeLines: TreeNode[] = [];
  lineNbr = 0;
  rows: List;

  constructor(options: TreeOptions = {}) {
    options.bold = true;
    super(options);

    this.options.extended = this.options.extended || false;
    this.options.keys = this.options.keys || ['+', 'space', 'enter'];

    this.options.template = this.options.template || {};
    this.options.template.extend = this.options.template.extend || ' [+]';
    this.options.template.retract = this.options.template.retract || ' [-]';
    this.options.template.lines = this.options.template.lines || false;

    // Create list widget
    this.rows = new List({
      top: 1,
      width: 0,
      left: 1,
      style: this.options.style,
      padding: this.options.padding,
      keys: true,
      tags: this.options.tags,
      vi: this.options.vi,
      ignoreKeys: this.options.ignoreKeys,
      scrollable: this.options.scrollable,
      mouse: this.options.mouse,
      selectedBg: this.options.selectedBg || 'blue',
      selectedFg: this.options.selectedFg || 'black',
      screen: this.screen
    } as any);

    this.append(this.rows);

    // Set up key handlers
    const keys = this.options.keys;
    if (keys && Array.isArray(keys)) {
      for (const key of keys) {
        this.rows.key(key, () => {
          const selectedNode = this.nodeLines[this.rows.selected];
          if (selectedNode && selectedNode.children) {
            selectedNode.extended = !selectedNode.extended;
            this.setData(this.data);
            this.screen.render();
          }

          this.emit('select', selectedNode, this.rows.selected);
        });
      }
    }
  }

  walk(node: TreeNode, treeDepth: string): string[] {
    const lines: string[] = [];

    if (!node.parent) {
      // root level
      this.lineNbr = 0;
      this.nodeLines.length = 0;
      node.parent = null;
    }

    if (treeDepth === '' && node.name) {
      this.lineNbr = 0;
      this.nodeLines[this.lineNbr++] = node;
      lines.push(node.name);
      treeDepth = ' ';
    }

    node.depth = treeDepth.length - 1;

    if (node.children && node.extended) {
      let i = 0;

      if (typeof node.children === 'function') {
        node.childrenContent = node.children(node);
      } else if (!node.childrenContent) {
        node.childrenContent = node.children;
      }

      // Convert to array if it's an object
      const childrenArray = Array.isArray(node.childrenContent)
        ? node.childrenContent
        : node.childrenContent
        ? Object.entries(node.childrenContent).map(([key, value]) => {
            if (!value.name) value.name = key;
            return value;
          })
        : [];

      for (let child of childrenArray) {
        if (!child.name && typeof child === 'string') {
          // Handle case where children is a record
          const key = child;
          child = (node.childrenContent as Record<string, TreeNode>)[key];
          if (!child.name) child.name = key;
        }

        child.parent = node;
        child.position = i++;

        if (typeof child.extended === 'undefined') {
          child.extended = this.options.extended;
        }

        if (typeof child.children === 'function') {
          child.childrenContent = child.children(child);
        } else {
          child.childrenContent = child.children;
        }

        const isLastChild = child.position === childrenArray.length - 1;
        let treePrefix: string;
        let suffix = '';

        if (isLastChild) {
          treePrefix = '└';
        } else {
          treePrefix = '├';
        }

        if (
          !child.childrenContent ||
          (Array.isArray(child.childrenContent) && child.childrenContent.length === 0) ||
          (!Array.isArray(child.childrenContent) &&
            Object.keys(child.childrenContent).length === 0)
        ) {
          treePrefix += '─';
        } else if (child.extended) {
          treePrefix += '┬';
          suffix = this.options.template!.retract!;
        } else {
          treePrefix += '─';
          suffix = this.options.template!.extend!;
        }

        if (!this.options.template!.lines) treePrefix = '|-';
        if (this.options.template!.spaces) treePrefix = ' ';

        lines.push(treeDepth + treePrefix + child.name + suffix);

        this.nodeLines[this.lineNbr++] = child;

        let parentTree: string;
        if (isLastChild || !this.options.template!.lines) {
          parentTree = treeDepth + ' ';
        } else {
          parentTree = treeDepth + '│';
        }

        lines.push(...this.walk(child, parentTree));
      }
    }
    return lines;
  }

  focus(): void {
    this.rows.focus();
  }

  render(): any {
    if (this.screen.focused === this.rows) {
      this.rows.focus();
    }

    // Update dimensions using type assertion for internal access
    (this.rows as any).width = (this.width as number) - 3;
    (this.rows as any).height = (this.height as number) - 3;
    return super.render();
  }

  setData(nodes: TreeNode): void {
    this.data = nodes;
    this.rows.setItems(this.walk(nodes, ''));
  }

  get type(): string {
    return 'tree';
  }
}

/**
 * Factory function
 */
export function tree(options: TreeOptions = {}): Tree {
  return new Tree(options);
}
