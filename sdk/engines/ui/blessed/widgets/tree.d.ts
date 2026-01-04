/**
 * Tree Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/tree.js
 * Hierarchical tree view with expand/collapse functionality
 */
import { Box } from './box';
import { List } from './list';
import type { ElementOptions } from '../core/types';
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
export declare class Tree extends Box {
    options: TreeOptions;
    data: TreeNode;
    nodeLines: TreeNode[];
    lineNbr: number;
    rows: List;
    constructor(options?: TreeOptions);
    walk(node: TreeNode, treeDepth: string): string[];
    focus(): void;
    emit(event: string, ...args: any[]): boolean;
    render(): any;
    setData(nodes: TreeNode): void;
    get type(): string;
}
/**
 * Factory function
 */
export declare function tree(options?: TreeOptions): Tree;
