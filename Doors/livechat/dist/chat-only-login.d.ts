import { LoginCredentials } from './ui/login-modal';
/**
 * Verify credentials using dynamic require (we're running inside the backend)
 */
export declare function verifyCredentials(credentials: LoginCredentials): Promise<{
    success: boolean;
    user?: any;
    error?: string;
}>;
export declare function runChatOnlyLogin(session: any): Promise<boolean>;
