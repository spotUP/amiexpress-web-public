/**
 * Mail Notification Service
 * 1:1 port from AmiExpress express.e:6689-6745, 24196-24201, 29155-29172
 *
 * Handles MAIL_ON_* email notifications to sysop
 * Config from bbsConfig.info tooltypes:
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_SSL
 *   SYSOP_EMAIL, BBS_EMAIL
 *   MAIL_ON_UPLOAD, MAIL_ON_SYSOP_COMMENT, MAIL_ON_LOGON, MAIL_ON_NEW_USER,
 *   MAIL_ON_LOGOFF, MAIL_ON_SYSOP_PAGE, MAIL_ON_PWD_FAIL
 */

import nodemailer from 'nodemailer';
import { db } from '../database';

export interface MailOptions {
  smtpHost: string;
  smtpPort: number;
  username?: string;
  password?: string;
  ssl: boolean;
  sysopEmail: string;
  bbsEmail: string;
}

export type MailEvent =
  | 'UPLOAD'
  | 'SYSOP_COMMENT'
  | 'LOGON'
  | 'NEW_USER'
  | 'LOGOFF'
  | 'SYSOP_PAGE'
  | 'PWD_FAIL';

// Cache mail options to avoid repeated DB lookups
let cachedMailOptions: MailOptions | null = null;
let cachedMailOnFlags: Map<MailEvent, boolean> = new Map();
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Check if SMTP is configured (for password reset availability check)
 */
export async function isSmtpConfigured(): Promise<boolean> {
  const options = await getMailOptions();
  return options !== null && !!options.smtpHost;
}

/**
 * Get mail configuration from database
 * express.e:31807-31815 - Read mail tooltypes
 */
async function getMailOptions(): Promise<MailOptions | null> {
  const now = Date.now();
  if (cachedMailOptions && (now - cacheTime) < CACHE_TTL) {
    return cachedMailOptions;
  }

  try {
    const configRepo = db.getConfigRepository();
    const sysConfig = configRepo.getSystemConfig();

    if (!sysConfig?.smtp_server) {
      cachedMailOptions = null;
      return null;
    }

    cachedMailOptions = {
      smtpHost: sysConfig.smtp_server,
      smtpPort: sysConfig.smtp_port || 25,
      username: sysConfig.smtp_username,
      password: sysConfig.smtp_password,
      ssl: sysConfig.smtp_ssl || false,
      sysopEmail: sysConfig.sysop_email || '',
      bbsEmail: sysConfig.bbs_email || sysConfig.smtp_from_email || ''
    };

    cacheTime = now;
    return cachedMailOptions;
  } catch (error) {
console.error('[MailService] Error getting mail options:', error);
    return null;
  }
}

/**
 * Check if MAIL_ON_* event is enabled
 * express.e:6694, 6705, 6716, 6728, 6739, 24197, 29155
 */
export async function isMailEventEnabled(event: MailEvent): Promise<boolean> {
  const now = Date.now();
  if ((now - cacheTime) < CACHE_TTL && cachedMailOnFlags.has(event)) {
    return cachedMailOnFlags.get(event) || false;
  }

  try {
    const configRepo = db.getConfigRepository();
    const tooltypeKey = `mail_on_${event.toLowerCase()}` as keyof ReturnType<typeof configRepo.getSystemConfig>;

    const sysConfig = configRepo.getSystemConfig();
    // Check for mail_on_* config key (stored as boolean, string 'true', or integer 1)
    const value = (sysConfig as any)?.[tooltypeKey];
    const enabled = value === true || value === 'true' || value === 1;

    cachedMailOnFlags.set(event, enabled);
    cacheTime = Date.now(); // Update cache time
    return enabled;
  } catch {
    return false;
  }
}

/**
 * Get BBS name for email subjects
 */
async function getBbsName(): Promise<string> {
  try {
    const configRepo = db.getConfigRepository();
    const sysConfig = configRepo.getSystemConfig();
    return sysConfig?.bbs_name || 'AmiExpress BBS';
  } catch {
    return 'AmiExpress BBS';
  }
}

/**
 * Send email using configured SMTP
 * express.e mailssl.e - sendMail()
 */
async function sendMail(
  to: string,
  subject: string,
  body: string,
  options: MailOptions
): Promise<boolean> {
  try {
    const transportConfig: nodemailer.TransportOptions = {
      host: options.smtpHost,
      port: options.smtpPort,
      secure: options.ssl,
      auth: options.username ? {
        user: options.username,
        pass: options.password
      } : undefined
    } as nodemailer.TransportOptions;

    const transporter = nodemailer.createTransport(transportConfig);

    await transporter.sendMail({
      from: options.bbsEmail || `noreply@${options.smtpHost}`,
      to,
      subject,
      text: body
    });

console.log(`[MailService] Email sent to ${to}: ${subject}`);
    return true;
  } catch (error: any) {
console.error(`[MailService] Failed to send email: ${error.message}`);
    return false;
  }
}

/**
 * MAIL_ON_UPLOAD - express.e:6693-6698
 * Send upload notification to sysop
 */
export async function mailOnUpload(username: string, location: string): Promise<void> {
  if (!await isMailEventEnabled('UPLOAD')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express upload notification`;
  const body = `This is a notification that ${username} from ${location} has uploaded\n\n`;

  await sendMail(options.sysopEmail, subject, body, options);
}

/**
 * MAIL_ON_SYSOP_COMMENT - express.e:6705-6709
 * Send sysop message notification
 */
export async function mailOnSysopComment(
  fromName: string,
  subject: string,
  messageBody?: string
): Promise<void> {
  if (!await isMailEventEnabled('SYSOP_COMMENT')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const emailSubject = `${bbsName}: Ami-Express sysop message notification`;
  let body = `This is a notification that ${fromName} has sent you a message.\n\nSubject: ${subject}\n\n`;

  if (messageBody) {
    body += messageBody;
  }

  await sendMail(options.sysopEmail, emailSubject, body, options);
}

/**
 * MAIL_ON_LOGON - express.e:6716-6720
 * Send logon notification to sysop
 */
export async function mailOnLogon(username: string, location: string): Promise<void> {
  if (!await isMailEventEnabled('LOGON')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express logon notification`;
  const body = `This is a notification that ${username} from ${location} has logged on\n\n`;

  await sendMail(options.sysopEmail, subject, body, options);
}

/**
 * MAIL_ON_NEW_USER - express.e:6728-6732
 * Send new user notification to sysop
 */
export async function mailOnNewUser(username: string, location: string): Promise<void> {
  if (!await isMailEventEnabled('NEW_USER')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express new user notification`;
  const body = `This is a notification that a new user called ${username} from ${location} has registered.`;

  await sendMail(options.sysopEmail, subject, body, options);
}

/**
 * MAIL_ON_LOGOFF - express.e:6739-6743
 * Send logoff notification to sysop
 */
export async function mailOnLogoff(username: string, location: string): Promise<void> {
  if (!await isMailEventEnabled('LOGOFF')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express logoff notification`;
  const body = `This is a notification that ${username} from ${location} has logged off\n\n`;

  await sendMail(options.sysopEmail, subject, body, options);
}

/**
 * MAIL_ON_SYSOP_PAGE - express.e:24197-24201
 * Send page notification to sysop
 */
export async function mailOnSysopPage(username: string): Promise<void> {
  if (!await isMailEventEnabled('SYSOP_PAGE')) return;

  const options = await getMailOptions();
  if (!options?.sysopEmail) return;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express page notification`;
  const body = `This is a notification that you were paged by ${username}.`;

  await sendMail(options.sysopEmail, subject, body, options);
}

/**
 * MAIL_ON_PWD_FAIL - express.e:29155-29172
 * Send password reset code to user's email
 * This is different from other MAIL_ON_* - sends to USER, not sysop
 */
export async function mailOnPwdFail(
  userEmail: string,
  resetCode: string
): Promise<boolean> {
  if (!await isMailEventEnabled('PWD_FAIL')) return false;

  const options = await getMailOptions();
  if (!options?.smtpHost) return false;

  const bbsName = await getBbsName();
  const subject = `${bbsName}: Ami-Express password failure notification`;
  const body = `You have forgotten your password and requested a reset code. If you did not request the reset code then please ignore this email

The reset code is : ${resetCode}

You can use this code to reset your password and gain access to the system
`;

  return await sendMail(userEmail, subject, body, options);
}

/**
 * Clear cached mail options (call when config changes)
 */
export function clearMailCache(): void {
  cachedMailOptions = null;
  cachedMailOnFlags.clear();
  cacheTime = 0;
}

/**
 * Test SMTP connection by sending a test email to sysop
 * Returns success/failure status with error details
 */
export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const options = await getMailOptions();
    if (!options?.smtpHost) {
      return { success: false, error: 'SMTP server not configured' };
    }
    if (!options.sysopEmail) {
      return { success: false, error: 'Sysop email not configured' };
    }

    const transportConfig: nodemailer.TransportOptions = {
      host: options.smtpHost,
      port: options.smtpPort,
      secure: options.ssl,
      auth: options.username ? {
        user: options.username,
        pass: options.password
      } : undefined
    } as nodemailer.TransportOptions;

    const transporter = nodemailer.createTransport(transportConfig);

    // First verify the connection
    await transporter.verify();

    // Then send a test email
    const bbsName = await getBbsName();
    const now = new Date().toLocaleString();
    await transporter.sendMail({
      from: options.bbsEmail || `noreply@${options.smtpHost}`,
      to: options.sysopEmail,
      subject: `${bbsName}: SMTP Test`,
      text: `This is a test email from your AmiExpress BBS SMTP configuration.\n\nSent at: ${now}\n\nIf you received this email, your SMTP settings are working correctly.`
    });

console.log(`[MailService] SMTP test successful - email sent to ${options.sysopEmail}`);
    return { success: true };
  } catch (error: any) {
console.error(`[MailService] SMTP test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
