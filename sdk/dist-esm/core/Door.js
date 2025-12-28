/**
 * Door - Base Class for BBS Doors
 *
 * Professional door framework with lifecycle hooks and type safety
 */
import { Output } from './Output';
import { Input } from './Input';
import { Storage } from './Storage';
import { Video } from './Video';
import { Audio } from './Audio';
export class Door {
    constructor(config) {
        this.startHandlers = [];
        this.inputHandlers = [];
        this.closeHandlers = [];
        this.errorHandlers = [];
        this.isRunning = false;
        this.inputLoopResolve = null;
        this.config = config;
    }
    // ===== Lifecycle Registration =====
    /**
     * Register a handler to run when the door starts
     */
    onStart(handler) {
        this.startHandlers.push(handler);
        return this;
    }
    /**
     * Register a handler to run on user input
     */
    onInput(handler) {
        this.inputHandlers.push(handler);
        return this;
    }
    /**
     * Register a handler to run when the door closes
     */
    onClose(handler) {
        this.closeHandlers.push(handler);
        return this;
    }
    /**
     * Register an error handler
     */
    onError(handler) {
        this.errorHandlers.push(handler);
        return this;
    }
    // ===== Door Execution =====
    /**
     * Execute the door
     *
     * This is called by the BBS backend when a user runs the door
     */
    async execute(rawSession) {
        if (this.isRunning) {
            throw new Error('Door is already running');
        }
        this.isRunning = true;
        const { socket, bbsSession, user, params = [], bbs } = rawSession;
        // Enable game mode for smooth keyboard input (bypasses OS key repeat delay)
        // This tells the frontend to send raw keydown/keyup events
        if (bbs?.enableGameMode) {
            bbs.enableGameMode();
        }
        // Create context
        const context = this.createContext(socket, bbsSession, user, params, bbs);
        try {
            // Call start handlers
            for (const handler of this.startHandlers) {
                await handler(context);
            }
            // Set up input loop
            if (this.inputHandlers.length > 0) {
                await this.runInputLoop(socket, bbsSession, context);
            }
            // Call close handlers
            for (const handler of this.closeHandlers) {
                await handler(context);
            }
        }
        catch (error) {
            // Call error handlers
            for (const handler of this.errorHandlers) {
                await handler(context, error);
            }
            // Re-throw if no error handlers
            if (this.errorHandlers.length === 0) {
                throw error;
            }
        }
        finally {
            this.isRunning = false;
        }
    }
    /**
     * Exit the door
     *
     * Can be called from within handlers to immediately close the door
     */
    async exit() {
        this.isRunning = false;
    }
    // ===== Internal Methods =====
    createContext(socket, bbsSession, user, params, bbs) {
        const output = new Output(socket);
        const input = new Input(bbsSession, output);
        const storage = new Storage({
            doorName: this.config.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            userId: user.id,
        });
        const video = new Video(socket, user.id);
        const audio = new Audio(socket, user.id);
        return {
            user,
            nodeId: bbsSession.nodeId || 1,
            output,
            input,
            storage,
            video,
            audio,
            params,
            bbs,
            socket,
            bbsSession,
            close: () => {
                this.isRunning = false;
                // Cleanup video streams
                if (video) {
                    video.cleanup();
                }
                // Cleanup audio streams
                if (audio) {
                    audio.cleanup();
                }
                // Immediately clean up input handler to unblock the input loop
                if (bbsSession.doorInputHandler) {
                    bbsSession.doorInputHandler = null;
                }
                // Resolve the input loop promise to exit the door
                if (this.inputLoopResolve) {
                    this.inputLoopResolve();
                    this.inputLoopResolve = null;
                }
            },
        };
    }
    async runInputLoop(socket, bbsSession, context) {
        return new Promise((resolve) => {
            // Store resolve function so close() can call it
            this.inputLoopResolve = resolve;
            const handler = async (data) => {
                if (!this.isRunning) {
                    bbsSession.doorInputHandler = null;
                    resolve();
                    return;
                }
                try {
                    // Parse key press
                    const keyPress = {
                        key: data,
                        raw: data,
                        ctrl: false,
                        alt: false,
                        shift: false,
                        meta: false,
                    };
                    // Call input handlers
                    for (const inputHandler of this.inputHandlers) {
                        await inputHandler(context, keyPress);
                    }
                }
                catch (error) {
                    // Call error handlers
                    for (const errorHandler of this.errorHandlers) {
                        await errorHandler(context, error);
                    }
                    // Re-throw if no error handlers
                    if (this.errorHandlers.length === 0) {
                        throw error;
                    }
                }
            };
            bbsSession.doorInputHandler = handler;
            // Handle disconnection
            socket.once('disconnect', () => {
                bbsSession.doorInputHandler = null;
                this.isRunning = false;
                this.inputLoopResolve = null;
                resolve();
            });
            // Handle door:close event
            socket.once('door:close', () => {
                bbsSession.doorInputHandler = null;
                this.isRunning = false;
                this.inputLoopResolve = null;
                resolve();
            });
        });
    }
    // ===== Getters =====
    getConfig() {
        return { ...this.config };
    }
    isActive() {
        return this.isRunning;
    }
}
