import { MemberQueries } from './members-query';
/** Channel members repository */
export declare class MemberRepository extends MemberQueries {
    add(channelId: string, userId: number, role?: string): Promise<void>;
    remove(channelId: string, userId: number): Promise<void>;
    setRole(channelId: string, userId: number, role: string): Promise<void>;
    ban(channelId: string, userId: number, reason: string): Promise<void>;
    unban(channelId: string, userId: number): Promise<void>;
}
