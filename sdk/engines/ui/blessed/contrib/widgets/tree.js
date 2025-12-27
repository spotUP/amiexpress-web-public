"use strict";
/**
 * Tree Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/tree.js
 * Hierarchical tree view with expand/collapse functionality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tree = void 0;
exports.tree = tree;
const box_1 = require("../../widgets/box");
const list_1 = require("../../widgets/list");
/**
 * Tree Widget
 * Displays hierarchical data with expand/collapse
 */
class Tree extends box_1.Box {
    constructor(options = {}) {
        options.bold = true;
        options.clickable = options.clickable !== false;
        options.focusable = options.focusable !== false;
        super(options);
        this.data = {};
        this.nodeLines = [];
        this.lineNbr = 0;
        this.options.extended = this.options.extended || false;
        this.options.keys = this.options.keys || ['+', 'space', 'enter'];
        this.options.template = this.options.template || {};
        this.options.template.extend = this.options.template.extend || ' [+]';
        this.options.template.retract = this.options.template.retract || ' [-]';
        this.options.template.lines = this.options.template.lines || false;
        // Create list widget - fill the tree's content area
        this.rows = new list_1.List({
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
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
        });
        this.append(this.rows);
        // Set up key handlers for toggle (space, enter, +)
        const keys = this.options.keys;
        if (keys && Array.isArray(keys)) {
            for (const key of keys) {
                this.rows.key(key, () => {
                    const selectedNode = this.nodeLines[this.rows.selected];
                    if (selectedNode && selectedNode.children) {
                        selectedNode.extended = !selectedNode.extended;
                        this.setData(this.data);
                        this.screen?.render();
                    }
                    this.emit('select', selectedNode, this.rows.selected);
                });
            }
        }
        // Left arrow: collapse current node (or go to parent if already collapsed)
        this.rows.key(['left'], () => {
            const selectedNode = this.nodeLines[this.rows.selected];
            if (selectedNode) {
                if (selectedNode.extended && selectedNode.children) {
                    // Collapse current node
                    selectedNode.extended = false;
                    this.setData(this.data);
                    this.screen?.render();
                }
                else if (selectedNode.parent) {
                    // Move to parent node
                    const parentIndex = this.nodeLines.indexOf(selectedNode.parent);
                    if (parentIndex >= 0) {
                        this.rows.select(parentIndex);
                        this.screen?.render();
                    }
                }
            }
        });
        // Right arrow: expand current node (or move to first child if already expanded)
        this.rows.key(['right'], () => {
            const selectedNode = this.nodeLines[this.rows.selected];
            if (selectedNode && selectedNode.children) {
                if (!selectedNode.extended) {
                    // Expand current node
                    selectedNode.extended = true;
                    this.setData(this.data);
                    this.screen?.render();
                }
                else {
                    // Move to first child (it will be the next item in the list)
                    const currentIndex = this.rows.selected;
                    if (currentIndex < this.nodeLines.length - 1) {
                        this.rows.select(currentIndex + 1);
                        this.screen?.render();
                    }
                }
            }
        });
    }
    walk(node, treeDepth) {
        const lines = [];
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
            }
            else if (!node.childrenContent) {
                node.childrenContent = node.children;
            }
            // Convert to array if it's an object
            const childrenArray = Array.isArray(node.childrenContent)
                ? node.childrenContent
                : node.childrenContent
                    ? Object.entries(node.childrenContent).map(([key, value]) => {
                        if (!value.name)
                            value.name = key;
                        return value;
                    })
                    : [];
            for (let child of childrenArray) {
                if (!child.name && typeof child === 'string') {
                    // Handle case where children is a record
                    const key = child;
                    child = node.childrenContent[key];
                    if (!child.name)
                        child.name = key;
                }
                child.parent = node;
                child.position = i++;
                if (typeof child.extended === 'undefined') {
                    child.extended = this.options.extended;
                }
                if (typeof child.children === 'function') {
                    child.childrenContent = child.children(child);
                }
                else {
                    child.childrenContent = child.children;
                }
                const isLastChild = child.position === childrenArray.length - 1;
                let treePrefix;
                let suffix = '';
                if (isLastChild) {
                    treePrefix = '└';
                }
                else {
                    treePrefix = '├';
                }
                if (!child.childrenContent ||
                    (Array.isArray(child.childrenContent) && child.childrenContent.length === 0) ||
                    (!Array.isArray(child.childrenContent) &&
                        Object.keys(child.childrenContent).length === 0)) {
                    treePrefix += '─';
                }
                else if (child.extended) {
                    treePrefix += '┬';
                    suffix = this.options.template.retract;
                }
                else {
                    treePrefix += '─';
                    suffix = this.options.template.extend;
                }
                if (!this.options.template.lines)
                    treePrefix = '|-';
                if (this.options.template.spaces)
                    treePrefix = ' ';
                lines.push(treeDepth + treePrefix + child.name + suffix);
                this.nodeLines[this.lineNbr++] = child;
                let parentTree;
                if (isLastChild || !this.options.template.lines) {
                    parentTree = treeDepth + ' ';
                }
                else {
                    parentTree = treeDepth + '│';
                }
                lines.push(...this.walk(child, parentTree));
            }
        }
        return lines;
    }
    focus() {
        this.rows.focus();
    }
    // Forward keypress events to internal rows list
    emit(event, ...args) {
        // Forward keypress events to rows for navigation
        if (event === 'keypress' || event.startsWith('keypress ')) {
            this.rows.emit(event, ...args);
        }
        return super.emit(event, ...args);
    }
    render() {
        if (this.screen && this.screen.getFocused() === this.rows) {
            this.rows.focus();
        }
        return super.render();
    }
    setData(nodes) {
        this.data = nodes;
        this.rows.setItems(this.walk(nodes, ''));
    }
    get type() {
        return 'tree';
    }
}
exports.Tree = Tree;
/**
 * Factory function
 */
function tree(options = {}) {
    return new Tree(options);
}
