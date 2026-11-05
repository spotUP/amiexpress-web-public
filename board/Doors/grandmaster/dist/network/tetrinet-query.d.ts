/**
 * TetriNET Query Protocol Client
 *
 * Supports playerquery, listchan, listuser, and version commands.
 * Commands are sent over TCP with 0xFF terminator; responses end with LF.
 */
export type TetriNetQueryCommand = 'playerquery' | 'listchan' | 'listuser' | 'version';
export interface TetriNetQueryResult {
    command: TetriNetQueryCommand;
    lines: string[];
}
export declare function queryTetriNetServer(host: string, command: TetriNetQueryCommand, port?: number, timeoutMs?: number): Promise<TetriNetQueryResult>;
//# sourceMappingURL=tetrinet-query.d.ts.map