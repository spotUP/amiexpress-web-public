import type { Message } from '../types';
import { MessageQueries } from './messages-query';
/** Message repository */
export declare class MessageRepository extends MessageQueries {
    create(msg: Partial<Message>): Promise<Message>;
    delete(id: string, deletedBy: number): Promise<void>;
    updateReplyCount(threadId: string): Promise<void>;
}
