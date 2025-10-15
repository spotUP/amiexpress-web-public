// Enhanced AREXX Scripting Engine for AmiExpress-Web
// Implements a subset of AREXX suitable for web-based BBS automation

import { db } from './database';
import { AREXXContext, AREXXScript, AREXXTrigger } from './types';

/**
 * AREXX Variable Storage
 */
class AREXXVariables {
  private vars: Map<string, any> = new Map();

  set(name: string, value: any): void {
    this.vars.set(name.toUpperCase(), value);
  }

  get(name: string): any {
    return this.vars.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.vars.has(name.toUpperCase());
  }

  delete(name: string): void {
    this.vars.delete(name.toUpperCase());
  }

  clear(): void {
    this.vars.clear();
  }

  getAll(): Map<string, any> {
    return new Map(this.vars);
  }
}

/**
 * AREXX Built-in Functions
 */
class AREXXFunctions {
  /**
   * String functions
   */
  static UPPER(str: string): string {
    return str.toUpperCase();
  }

  static LOWER(str: string): string {
    return str.toLowerCase();
  }

  static LEFT(str: string, n: number): string {
    return str.substring(0, n);
  }

  static RIGHT(str: string, n: number): string {
    return str.substring(str.length - n);
  }

  static SUBSTR(str: string, start: number, length?: number): string {
    return length !== undefined ? str.substring(start - 1, start - 1 + length) : str.substring(start - 1);
  }

  static LENGTH(str: string): number {
    return str.length;
  }

  static POS(needle: string, haystack: string): number {
    const pos = haystack.indexOf(needle);
    return pos === -1 ? 0 : pos + 1; // AREXX uses 1-based indexing
  }

  static WORD(str: string, n: number): string {
    const words = str.trim().split(/\s+/);
    return words[n - 1] || ''; // AREXX uses 1-based indexing
  }

  static WORDS(str: string): number {
    return str.trim().split(/\s+/).length;
  }

  /**
   * Conversion functions
   */
  static D2C(num: number): string {
    return String.fromCharCode(num);
  }

  static C2D(char: string): number {
    return char.charCodeAt(0);
  }

  static D2X(num: number): string {
    return num.toString(16).toUpperCase();
  }

  static X2D(hex: string): number {
    return parseInt(hex, 16);
  }

  /**
   * Numeric functions
   */
  static ABS(num: number): number {
    return Math.abs(num);
  }

  static MAX(...args: number[]): number {
    return Math.max(...args);
  }

  static MIN(...args: number[]): number {
    return Math.min(...args);
  }

  static RANDOM(min?: number, max?: number): number {
    if (min === undefined) return Math.random();
    if (max === undefined) return Math.floor(Math.random() * min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Time/Date functions
   */
  static TIME(format?: string): string {
    const now = new Date();
    switch (format?.toUpperCase()) {
      case 'H':
      case 'HOURS':
        return String(now.getHours());
      case 'M':
      case 'MINUTES':
        return String(now.getHours() * 60 + now.getMinutes());
      case 'S':
      case 'SECONDS':
        return String(Math.floor(now.getTime() / 1000));
      default:
        return now.toTimeString().split(' ')[0]; // HH:MM:SS
    }
  }

  static DATE(format?: string): string {
    const now = new Date();
    switch (format?.toUpperCase()) {
      case 'D':
      case 'DAYS':
        return String(Math.floor(now.getTime() / (1000 * 60 * 60 * 24)));
      case 'W':
      case 'WEEKDAY':
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
      case 'M':
      case 'MONTH':
        return ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()];
      default:
        return now.toDateString();
    }
  }
}

/**
 * BBS-Specific AREXX Functions
 */
class BBSFunctions {
  private context: any;

  constructor(context: any) {
    this.context = context;
  }

  /**
   * Send text to user
   */
  async BBSWRITE(text: string): Promise<void> {
    if (this.context.output) {
      this.context.output.push(text);
    }
    if (this.context.socket) {
      this.context.socket.emit('ansi-output', text + '\r\n');
    }
  }

  /**
   * Get user input
   */
  async BBSREAD(): Promise<string> {
    // In real implementation, this would wait for user input
    return this.context.lastInput || '';
  }

  /**
   * Get user name
   */
  BBSGETUSERNAME(): string {
    return this.context.user?.username || 'Unknown';
  }

  /**
   * Get user security level
   */
  BBSGETUSERLEVEL(): number {
    return this.context.user?.secLevel || 0;
  }

  /**
   * Get current conference
   */
  BBSGETCONF(): number {
    return this.context.session?.currentConf || 0;
  }

  /**
   * Join conference
   */
  async BBSJOINCONF(confId: number): Promise<boolean> {
    if (this.context.session) {
      this.context.session.currentConf = confId;
      return true;
    }
    return false;
  }

  /**
   * Post message
   */
  async BBSPOSTMSG(subject: string, body: string, isPrivate: boolean = false, toUser?: string): Promise<number> {
    try {
      const messageId = await db.createMessage({
        subject,
        body,
        author: this.context.user?.username || 'System',
        timestamp: new Date(),
        conferenceId: this.context.session?.currentConf || 1,
        messageBaseId: this.context.session?.currentMsgBase || 1,
        isPrivate,
        toUser
      });
      return messageId;
    } catch (error) {
      console.error('AREXX BBSPOSTMSG error:', error);
      return 0;
    }
  }

  /**
   * Get message count
   */
  async BBSGETMSGCOUNT(confId?: number, baseId?: number): Promise<number> {
    try {
      const messages = await db.getMessages(
        confId || this.context.session?.currentConf || 1,
        baseId || this.context.session?.currentMsgBase || 1
      );
      return messages.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Log event
   */
  async BBSLOG(level: string, message: string): Promise<void> {
    const logLevel = ['info', 'warning', 'error'].includes(level.toLowerCase())
      ? level.toLowerCase() as 'info' | 'warning' | 'error'
      : 'info';

    await db.logSystemEvent(logLevel, message, {
      userId: this.context.user?.id,
      conferenceId: this.context.session?.currentConf
    });
  }
}

/**
 * AREXX Interpreter
 */
export class AREXXInterpreter {
  private variables: AREXXVariables;
  private bbsFunctions: BBSFunctions;
  private context: any;
  private output: string[] = [];

  constructor(context: any) {
    this.context = context;
    this.variables = new AREXXVariables();
    this.bbsFunctions = new BBSFunctions(context);

    // Set initial variables from context
    if (context.user) {
      this.variables.set('USERNAME', context.user.username);
      this.variables.set('USERLEVEL', context.user.secLevel);
      this.variables.set('USERID', context.user.id);
    }
    if (context.session) {
      this.variables.set('CONFERENCE', context.session.currentConf);
      this.variables.set('MSGBASE', context.session.currentMsgBase);
    }
    this.variables.set('BBSNAME', 'AmiExpress Web');
    this.variables.set('VERSION', '1.0');
  }

  /**
   * Execute AREXX script
   */
  async execute(script: string): Promise<{ success: boolean, output: string[], error?: string }> {
    this.output = [];

    try {
      const lines = script.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('/*'));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments
        if (line.startsWith('/*') || line.startsWith('//')) continue;

        // Process line
        await this.executeLine(line);
      }

      return { success: true, output: this.output };
    } catch (error) {
      return {
        success: false,
        output: this.output,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute single AREXX line
   */
  private async executeLine(line: string): Promise<void> {
    // Assignment: VAR = value
    if (line.includes('=') && !line.includes('==')) {
      const [varName, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      const evaluated = await this.evaluateExpression(value);
      this.variables.set(varName.trim(), evaluated);
      return;
    }

    // SAY command
    if (line.toUpperCase().startsWith('SAY ')) {
      const text = await this.evaluateExpression(line.substring(4));
      this.output.push(String(text));
      await this.bbsFunctions.BBSWRITE(String(text));
      return;
    }

    // CALL command
    if (line.toUpperCase().startsWith('CALL ')) {
      const parts = line.substring(5).trim().split(/\s+/);
      const funcName = parts[0].toUpperCase();
      const args = parts.slice(1);
      await this.callFunction(funcName, args);
      return;
    }

    // IF statement (simple)
    if (line.toUpperCase().startsWith('IF ')) {
      await this.executeIf(line);
      return;
    }

    // Function call (standalone)
    if (line.includes('(') && line.includes(')')) {
      await this.evaluateExpression(line);
      return;
    }
  }

  /**
   * Execute IF statement
   */
  private async executeIf(line: string): Promise<void> {
    // Simple IF condition THEN action parsing
    const match = line.match(/IF\s+(.+?)\s+THEN\s+(.+)/i);
    if (!match) throw new Error('Invalid IF statement');

    const [, condition, action] = match;
    const result = await this.evaluateCondition(condition);

    if (result) {
      await this.executeLine(action);
    }
  }

  /**
   * Evaluate condition
   */
  private async evaluateCondition(condition: string): Promise<boolean> {
    // Simple comparison operators
    if (condition.includes('==')) {
      const [left, right] = condition.split('==');
      return await this.evaluateExpression(left.trim()) == await this.evaluateExpression(right.trim());
    }
    if (condition.includes('=')) {
      const [left, right] = condition.split('=');
      return await this.evaluateExpression(left.trim()) == await this.evaluateExpression(right.trim());
    }
    if (condition.includes('>')) {
      const [left, right] = condition.split('>');
      return Number(await this.evaluateExpression(left.trim())) > Number(await this.evaluateExpression(right.trim()));
    }
    if (condition.includes('<')) {
      const [left, right] = condition.split('<');
      return Number(await this.evaluateExpression(left.trim())) < Number(await this.evaluateExpression(right.trim()));
    }

    // Boolean value
    const value = await this.evaluateExpression(condition);
    return Boolean(value);
  }

  /**
   * Evaluate expression
   */
  private async evaluateExpression(expr: string): Promise<any> {
    expr = expr.trim();

    // String literal
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.substring(1, expr.length - 1);
    }

    // Number literal
    if (!isNaN(Number(expr))) {
      return Number(expr);
    }

    // Variable
    if (this.variables.has(expr)) {
      return this.variables.get(expr);
    }

    // Function call
    if (expr.includes('(') && expr.endsWith(')')) {
      return await this.evaluateFunction(expr);
    }

    // Concatenation
    if (expr.includes('||')) {
      const parts = expr.split('||');
      const evaluated = await Promise.all(parts.map(p => this.evaluateExpression(p.trim())));
      return evaluated.join('');
    }

    // Default: return as string
    return expr;
  }

  /**
   * Evaluate function call
   */
  private async evaluateFunction(expr: string): Promise<any> {
    const match = expr.match(/^(\w+)\((.*)\)$/);
    if (!match) throw new Error(`Invalid function call: ${expr}`);

    const [, funcName, argsStr] = match;
    const args = argsStr ? await this.parseArguments(argsStr) : [];

    return await this.callFunction(funcName.toUpperCase(), args);
  }

  /**
   * Parse function arguments
   */
  private async parseArguments(argsStr: string): Promise<any[]> {
    const args: any[] = [];
    let current = '';
    let inQuotes = false;
    let depth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === '(' && !inQuotes) {
        depth++;
        current += char;
      } else if (char === ')' && !inQuotes) {
        depth--;
        current += char;
      } else if (char === ',' && !inQuotes && depth === 0) {
        args.push(await this.evaluateExpression(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(await this.evaluateExpression(current.trim()));
    }

    return args;
  }

  /**
   * Call function
   */
  private async callFunction(funcName: string, args: any[]): Promise<any> {
    // BBS Functions
    if (funcName === 'BBSWRITE') {
      await this.bbsFunctions.BBSWRITE(String(args[0] || ''));
      return;
    }
    if (funcName === 'BBSREAD') {
      return await this.bbsFunctions.BBSREAD();
    }
    if (funcName === 'BBSGETUSERNAME') {
      return this.bbsFunctions.BBSGETUSERNAME();
    }
    if (funcName === 'BBSGETUSERLEVEL') {
      return this.bbsFunctions.BBSGETUSERLEVEL();
    }
    if (funcName === 'BBSGETCONF') {
      return this.bbsFunctions.BBSGETCONF();
    }
    if (funcName === 'BBSJOINCONF') {
      return await this.bbsFunctions.BBSJOINCONF(Number(args[0]));
    }
    if (funcName === 'BBSPOSTMSG') {
      return await this.bbsFunctions.BBSPOSTMSG(
        String(args[0]),
        String(args[1]),
        Boolean(args[2]),
        args[3] ? String(args[3]) : undefined
      );
    }
    if (funcName === 'BBSGETMSGCOUNT') {
      return await this.bbsFunctions.BBSGETMSGCOUNT(
        args[0] ? Number(args[0]) : undefined,
        args[1] ? Number(args[1]) : undefined
      );
    }
    if (funcName === 'BBSLOG') {
      await this.bbsFunctions.BBSLOG(String(args[0]), String(args[1]));
      return;
    }

    // Standard AREXX Functions
    if (funcName in AREXXFunctions) {
      const func = (AREXXFunctions as any)[funcName];
      return func(...args);
    }

    throw new Error(`Unknown function: ${funcName}`);
  }

  /**
   * Get output
   */
  getOutput(): string[] {
    return this.output;
  }

  /**
   * Get variables
   */
  getVariables(): Map<string, any> {
    return this.variables.getAll();
  }
}

/**
 * Enhanced AREXX Engine
 */
export class EnhancedAREXXEngine {
  private scripts: Map<string, AREXXScript> = new Map();

  constructor() {
    this.loadScripts();
  }

  /**
   * Load AREXX scripts from database
   */
  private async loadScripts(): Promise<void> {
    try {
      const scripts = await db.getAREXXScripts();
      for (const script of scripts) {
        this.scripts.set(script.id, script);
      }
      console.log(`Loaded ${scripts.length} AREXX scripts`);
    } catch (error) {
      console.error('Error loading AREXX scripts:', error);
    }
  }

  /**
   * Execute script by trigger event
   */
  async executeTrigger(event: string, context: any): Promise<any[]> {
    const results: any[] = [];

    for (const [id, script] of this.scripts) {
      if (!script.enabled) continue;

      const triggers = script.triggers || [];
      const matchingTrigger = triggers.find((t: AREXXTrigger) => t.event === event);

      if (matchingTrigger) {
        // Check condition if specified
        if (matchingTrigger.condition) {
          const interpreter = new AREXXInterpreter(context);
          const condResult = await interpreter.execute(`IF ${matchingTrigger.condition} THEN SAY "TRUE"`);
          if (!condResult.success || condResult.output.length === 0) {
            continue;
          }
        }

        const result = await this.executeScript(script, context);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Execute script by name
   */
  async executeScriptByName(name: string, context: any): Promise<any> {
    const script = Array.from(this.scripts.values()).find(s => s.name === name);
    if (!script) {
      throw new Error(`AREXX script '${name}' not found`);
    }

    return await this.executeScript(script, context);
  }

  /**
   * Execute script by ID
   */
  async executeScriptById(id: string, context: any): Promise<any> {
    const script = this.scripts.get(id);
    if (!script) {
      throw new Error(`AREXX script with ID '${id}' not found`);
    }

    return await this.executeScript(script, context);
  }

  /**
   * Execute specific script
   */
  async executeScript(script: AREXXScript, context: any): Promise<any> {
    try {
      console.log(`Executing AREXX script: ${script.name}`);

      // Create interpreter with context
      const interpreter = new AREXXInterpreter({
        ...context,
        output: []
      });

      // Execute script code
      const result = await interpreter.execute(script.code);

      // Log execution
      await db.executeAREXXScript(script.id, {
        user: context.user,
        session: context.session,
        command: undefined,
        parameters: context.parameters || [],
        variables: Object.fromEntries(interpreter.getVariables())
      });

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        variables: Object.fromEntries(interpreter.getVariables())
      };
    } catch (error) {
      console.error(`AREXX script ${script.id} execution error:`, error);
      throw error;
    }
  }

  /**
   * Add or update script
   */
  async addScript(script: AREXXScript): Promise<void> {
    this.scripts.set(script.id, script);
    console.log(`AREXX script ${script.name} added/updated`);
  }

  /**
   * Remove script
   */
  async removeScript(id: string): Promise<void> {
    this.scripts.delete(id);
    console.log(`AREXX script ${id} removed`);
  }

  /**
   * Reload scripts from database
   */
  async reloadScripts(): Promise<void> {
    this.scripts.clear();
    await this.loadScripts();
  }

  /**
   * Get all scripts
   */
  getScripts(): AREXXScript[] {
    return Array.from(this.scripts.values());
  }

  /**
   * Get scripts by trigger
   */
  getScriptsByTrigger(event: string): AREXXScript[] {
    return Array.from(this.scripts.values()).filter(script =>
      script.triggers?.some((t: AREXXTrigger) => t.event === event)
    );
  }
}

// Export singleton instance
export const arexxEngine = new EnhancedAREXXEngine();
