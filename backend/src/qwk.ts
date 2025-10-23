// QWK Network Message Support Implementation
// Implements QWK offline mail format for BBS networking

import * as fs from 'fs';
import * as path from 'path';
import { db } from './database';
import { QWKPacket, QWKMessage, FTNMessage } from './types';

export class QWKManager {
  private qwkPath: string;
  private bbsId: string;

  constructor(qwkPath: string = './qwk_packets', bbsId: string = 'AMIWEB') {
    this.qwkPath = qwkPath;
    this.bbsId = bbsId;

    // Ensure QWK directory exists
    if (!fs.existsSync(qwkPath)) {
      fs.mkdirSync(qwkPath, { recursive: true });
    }
  }

  // Process incoming QWK packet
  async processIncomingPacket(filename: string): Promise<void> {
    const packetPath = path.join(this.qwkPath, filename);

    try {
      // Create packet record
      const packet: Omit<QWKPacket, 'id'> = {
        filename,
        size: fs.statSync(packetPath).size,
        created: new Date(),
        fromBBS: 'UNKNOWN', // Will be determined from packet
        toBBS: this.bbsId,
        status: 'processing',
        messages: []
      };

      const packetId = await db.createQWKPacket(packet);

      // Parse QWK packet (simplified implementation)
      const messages = await this.parseQWKPacket(packetPath);

      // Store messages in database
      for (const message of messages) {
        await db.createQWKMessage({ ...message, packetId });
      }

      // Update packet status
      await db.updateQWKPacket(packetId, {
        status: 'completed',
        fromBBS: messages[0]?.from || 'UNKNOWN'
      });

      console.log(`Processed QWK packet ${filename} with ${messages.length} messages`);
    } catch (error) {
      console.error(`Error processing QWK packet ${filename}:`, error);
      // Update packet status to error
      const packetId = await db.createQWKPacket({
        filename,
        size: fs.statSync(packetPath).size,
        created: new Date(),
        fromBBS: 'UNKNOWN',
        toBBS: this.bbsId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        messages: []
      });
    }
  }

  // Parse QWK packet file (proper QWK format implementation)
  private async parseQWKPacket(filePath: string): Promise<Omit<QWKMessage, 'id'>[]> {
    const fs = require('fs');
    const messages: Omit<QWKMessage, 'id'>[] = [];

    try {
      const buffer = fs.readFileSync(filePath);

      // QWK packet structure:
      // - Header (128 bytes)
      // - Index records (variable)
      // - Messages (variable)

      if (buffer.length < 128) {
        throw new Error('Invalid QWK packet: too small');
      }

      // Parse header
      const header = this.parseQWKHeader(buffer.slice(0, 128));

      // Find message index (starts after header)
      let offset = 128;
      const indexRecords: any[] = [];

      // Read index records until we find the message area
      while (offset < buffer.length) {
        const record = buffer.slice(offset, offset + 5);
        if (record.length < 5) break;

        // Check for end of index marker (0xE1)
        if (record[0] === 0xE1) {
          offset += 5;
          break;
        }

        // Parse index record
        const msgNum = record.readUInt32LE(0);
        const confNum = record[4];

        indexRecords.push({ msgNum, confNum });
        offset += 5;
      }

      // Parse messages
      for (const indexRecord of indexRecords) {
        if (offset >= buffer.length) break;

        const message = this.parseQWKMessage(buffer, offset, header);
        if (message) {
          messages.push({
            conference: indexRecord.confNum,
            subject: message.subject,
            from: message.from,
            to: message.to,
            date: message.date,
            body: message.body,
            isPrivate: message.isPrivate,
            isReply: message.isReply
          });

          // Move offset past this message
          offset += message.totalLength;
        }
      }

    } catch (error) {
      console.error('Error parsing QWK packet:', error);
      // Return empty array on parse error
    }

    return messages;
  }

  // Parse QWK header (128 bytes)
  private parseQWKHeader(buffer: Buffer): any {
    // QWK header format:
    // 0-5: "QWK" signature
    // 6-7: Spaces
    // 8-11: BBS name (null padded)
    // 12-19: Creation time
    // 20-27: BBS ID
    // etc.

    const header = {
      signature: buffer.slice(0, 6).toString('ascii').trim(),
      bbsName: buffer.slice(8, 12).toString('ascii').trim(),
      bbsId: buffer.slice(20, 28).toString('ascii').trim(),
      // Add more header fields as needed
    };

    if (header.signature !== 'QWK') {
      throw new Error('Invalid QWK packet signature');
    }

    return header;
  }

  // Parse individual QWK message
  private parseQWKMessage(buffer: Buffer, offset: number, header: any): any | null {
    try {
      // QWK message format:
      // - Status byte
      // - Message number (LE u32)
      // - Date (MM-DD-YY)
      // - Time (HH:MM)
      // - To (25 chars, null padded)
      // - From (25 chars, null padded)
      // - Subject (25 chars, null padded)
      // - Password (12 chars, null padded)
      // - Reference number (LE u16)
      // - Number of blocks (LE u16)
      // - Active flag
      // - Conference number
      // - Logical message number (LE u16)
      // - Tag line (null padded)

      const status = buffer[offset];
      const msgNum = buffer.readUInt32LE(offset + 1);
      const dateStr = buffer.slice(offset + 5, offset + 13).toString('ascii').trim();
      const timeStr = buffer.slice(offset + 13, offset + 18).toString('ascii').trim();
      const to = buffer.slice(offset + 18, offset + 43).toString('ascii').replace(/\0/g, '').trim();
      const from = buffer.slice(offset + 43, offset + 68).toString('ascii').replace(/\0/g, '').trim();
      const subject = buffer.slice(offset + 68, offset + 93).toString('ascii').replace(/\0/g, '').trim();

      // Parse date (MM-DD-YY format)
      let date: Date;
      if (dateStr.length === 8) {
        const month = parseInt(dateStr.substring(0, 2)) - 1;
        const day = parseInt(dateStr.substring(3, 5));
        const year = 2000 + parseInt(dateStr.substring(6, 8));
        date = new Date(year, month, day);

        // Add time if available
        if (timeStr.length === 5) {
          const hours = parseInt(timeStr.substring(0, 2));
          const minutes = parseInt(timeStr.substring(3, 5));
          date.setHours(hours, minutes);
        }
      } else {
        date = new Date();
      }

      // Read message body (starts after header)
      const bodyStart = offset + 128; // QWK messages are 128-byte aligned
      const numBlocks = buffer.readUInt16LE(offset + 116);
      const bodyLength = (numBlocks - 1) * 128; // First block is header

      let body = '';
      if (bodyStart + bodyLength <= buffer.length) {
        const bodyBuffer = buffer.slice(bodyStart, bodyStart + bodyLength);
        body = bodyBuffer.toString('ascii').replace(/\0/g, '').replace(/\r/g, '\n').trim();
      }

      return {
        subject,
        from,
        to,
        date,
        body,
        isPrivate: (status & 0x01) !== 0, // Private flag
        isReply: (status & 0x02) !== 0,   // Reply flag
        totalLength: numBlocks * 128
      };

    } catch (error) {
      console.error('Error parsing QWK message:', error);
      return null;
    }
  }

  // Generate outgoing QWK packet for user
  async generateOutgoingPacket(userId: string, conferences: number[]): Promise<string> {
    // Get messages for user from specified conferences
    const messages: QWKMessage[] = [];

    for (const confId of conferences) {
      // Get unread messages for this conference
      const confMessages = await db.getMessages(confId, 1, {
        userId,
        limit: 100
      });

      // Convert Message[] to QWKMessage[]
      const qwkMessages: QWKMessage[] = confMessages.map(msg => ({
        id: parseInt(msg.id.toString()),
        conference: msg.conferenceId,
        subject: msg.subject,
        from: msg.author,
        to: msg.toUser || '',
        date: msg.timestamp,
        body: msg.body,
        isPrivate: msg.isPrivate,
        isReply: msg.parentId ? true : false,
        parentId: msg.parentId,
        attachments: msg.attachments
      }));

      messages.push(...qwkMessages);
    }

    if (messages.length === 0) {
      throw new Error('No messages to pack');
    }

    // Create QWK packet filename
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${this.bbsId}${timestamp}.QWK`;

    // Generate QWK packet (simplified)
    const packetPath = path.join(this.qwkPath, filename);
    await this.writeQWKPacket(packetPath, messages);

    // Create packet record
    const packetId = await db.createQWKPacket({
      filename,
      size: fs.statSync(packetPath).size,
      created: new Date(),
      fromBBS: this.bbsId,
      toBBS: 'USER', // Will be set when downloaded
      status: 'completed',
      messages
    });

    return filename;
  }

  // Write QWK packet file (proper QWK format implementation)
  private async writeQWKPacket(filePath: string, messages: QWKMessage[]): Promise<void> {
    const fs = require('fs');
    const buffers: Buffer[] = [];

    // Create QWK header (128 bytes)
    const header = this.createQWKHeader();
    buffers.push(header);

    // Create message index
    const indexBuffers: Buffer[] = [];
    let messageOffset = 128 + (messages.length * 5) + 5; // Header + index + end marker

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const indexRecord = Buffer.alloc(5);
      indexRecord.writeUInt32LE(i + 1, 0); // Message number (1-based)
      indexRecord.writeUInt8(msg.conference, 4); // Conference number
      indexBuffers.push(indexRecord);
    }

    // Add end of index marker
    const endMarker = Buffer.alloc(5);
    endMarker[0] = 0xE1;
    indexBuffers.push(endMarker);

    buffers.push(Buffer.concat(indexBuffers));

    // Create message data
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const messageBuffer = this.createQWKMessage(msg, i + 1);
      buffers.push(messageBuffer);
    }

    // Write complete packet
    const packetBuffer = Buffer.concat(buffers);
    fs.writeFileSync(filePath, packetBuffer);
  }

  // Create QWK header buffer
  private createQWKHeader(): Buffer {
    const header = Buffer.alloc(128);

    // QWK signature
    header.write('QWK', 0, 3, 'ascii');

    // BBS name (padded to 12 chars)
    const bbsName = this.bbsId.padEnd(12, '\0').substring(0, 12);
    header.write(bbsName, 8, 12, 'ascii');

    // BBS ID (padded to 8 chars)
    const bbsId = this.bbsId.padEnd(8, '\0').substring(0, 8);
    header.write(bbsId, 20, 8, 'ascii');

    // Creation time (current time)
    const now = new Date();
    const timeStr = now.toISOString().slice(0, 19).replace(/[:-]/g, '');
    header.write(timeStr, 12, 8, 'ascii');

    // Additional header fields can be added here

    return header;
  }

  // Create QWK message buffer
  private createQWKMessage(message: QWKMessage, msgNum: number): Buffer {
    // Calculate number of 128-byte blocks needed
    const headerSize = 128;
    const bodySize = Buffer.byteLength(message.body, 'ascii');
    const totalSize = headerSize + bodySize;
    const numBlocks = Math.ceil(totalSize / 128);

    const buffer = Buffer.alloc(numBlocks * 128);

    // Status byte
    let status = 0;
    if (message.isPrivate) status |= 0x01;
    if (message.isReply) status |= 0x02;
    buffer[0] = status;

    // Message number
    buffer.writeUInt32LE(msgNum, 1);

    // Date (MM-DD-YY format)
    const date = message.date;
    const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}-${(date.getFullYear() % 100).toString().padStart(2, '0')}`;
    buffer.write(dateStr, 5, 8, 'ascii');

    // Time (HH:MM format)
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    buffer.write(timeStr, 13, 5, 'ascii');

    // To field (25 chars, null padded)
    const toField = (message.to || '').padEnd(25, '\0').substring(0, 25);
    buffer.write(toField, 18, 25, 'ascii');

    // From field (25 chars, null padded)
    const fromField = message.from.padEnd(25, '\0').substring(0, 25);
    buffer.write(fromField, 43, 25, 'ascii');

    // Subject field (25 chars, null padded)
    const subjectField = message.subject.padEnd(25, '\0').substring(0, 25);
    buffer.write(subjectField, 68, 25, 'ascii');

    // Password field (12 chars, null padded) - empty for now
    buffer.write('\0'.repeat(12), 93, 12, 'ascii');

    // Reference number (0 for new messages)
    buffer.writeUInt16LE(0, 105);

    // Number of blocks
    buffer.writeUInt16LE(numBlocks, 107);

    // Active flag (1 = active)
    buffer[109] = 1;

    // Conference number
    buffer[110] = message.conference;

    // Logical message number
    buffer.writeUInt16LE(msgNum, 111);

    // Tag line (empty)
    buffer.write('\0'.repeat(16), 113, 16, 'ascii');

    // Message body (starts at offset 128)
    const bodyBuffer = Buffer.from(message.body, 'ascii');
    bodyBuffer.copy(buffer, 128, 0, Math.min(bodyBuffer.length, (numBlocks - 1) * 128));

    return buffer;
  }

  // Get available QWK packets for download
  async getAvailablePackets(userId: string): Promise<QWKPacket[]> {
    // Query database for completed packets ready for download
    // In a real implementation, this would filter by user permissions
    const packets = await db.getQWKPacket({ status: 'completed' });
    return packets;
  }

  // Mark packet as downloaded
  async markPacketDownloaded(packetId: string): Promise<void> {
    // Update packet status and add download timestamp
    await db.updateQWKPacket(packetId, {
      status: 'downloaded',
      processedAt: new Date()
    });
  }

  // Process incoming QWK packets from directory
  async processIncomingPackets(): Promise<void> {
    const fs = require('fs');
    const path = require('path');

    try {
      // Ensure QWK directory exists
      if (!fs.existsSync(this.qwkPath)) {
        fs.mkdirSync(this.qwkPath, { recursive: true });
        return;
      }

      // Find all .QWK files
      const files = fs.readdirSync(this.qwkPath)
        .filter((file: string) => file.toUpperCase().endsWith('.QWK'))
        .map((file: string) => path.join(this.qwkPath, file));

      for (const filePath of files) {
        try {
          await this.processIncomingPacket(path.basename(filePath));
        } catch (error) {
          console.error(`Failed to process QWK packet ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing incoming QWK packets:', error);
    }
  }

  // Clean up old processed packets
  async cleanupOldPackets(maxAgeDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // Get packets older than cutoff
    const oldPackets = await db.getQWKPacket({
      createdBefore: cutoffDate,
      status: 'downloaded'
    });

    const fs = require('fs');
    const path = require('path');

    for (const packet of oldPackets) {
      try {
        // Delete file if it exists
        const filePath = path.join(this.qwkPath, packet.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // Delete database record
        await db.deleteQWKPacket(packet.id);
      } catch (error) {
        console.error(`Failed to cleanup QWK packet ${packet.id}:`, error);
      }
    }
  }
}

// FTN Network Message Support Implementation
export class FTNManager {
  private inboundPath: string;
  private outboundPath: string;
  private address: string;

  constructor(inboundPath: string = './ftn_inbound', outboundPath: string = './ftn_outbound', address: string = '1:1/1.0@fidonet.org') {
    this.inboundPath = inboundPath;
    this.outboundPath = outboundPath;
    this.address = address;

    // Ensure directories exist
    [inboundPath, outboundPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Process incoming FTN messages
  async processIncomingMessages(): Promise<void> {
    const files = fs.readdirSync(this.inboundPath).filter(f => f.endsWith('.pkt'));

    for (const file of files) {
      try {
        await this.processFTNPacket(path.join(this.inboundPath, file));
        // Move processed file to archive
        fs.renameSync(
          path.join(this.inboundPath, file),
          path.join(this.inboundPath, 'processed', file)
        );
      } catch (error) {
        console.error(`Error processing FTN packet ${file}:`, error);
      }
    }
  }

  // Process FTN packet file (proper FTS-0001 implementation)
  private async processFTNPacket(filePath: string): Promise<void> {
    const fs = require('fs');

    try {
      const buffer = fs.readFileSync(filePath);

      // Parse FTS-0001 packet format
      const messages = await this.parseFTNPacket(buffer);

      for (const message of messages) {
        await db.createFTNMessage(message);
      }

      console.log(`Processed FTN packet with ${messages.length} messages`);
    } catch (error) {
      console.error('Error processing FTN packet:', error);
      throw error;
    }
  }

  // Parse FTN packet (FTS-0001 format)
  private async parseFTNPacket(buffer: Buffer): Promise<Omit<FTNMessage, 'id'>[]> {
    const messages: Omit<FTNMessage, 'id'>[] = [];

    try {
      let offset = 0;

      // Skip packet header (58 bytes in FTS-0001)
      if (buffer.length < 58) {
        throw new Error('Invalid FTN packet: too small');
      }

      // Verify packet type (should be 0x02 for packet)
      if (buffer[2] !== 0x02) {
        throw new Error('Invalid FTN packet type');
      }

      offset = 58; // Skip header

      // Parse messages until end of packet
      while (offset < buffer.length - 1) {
        const message = this.parseFTNMessage(buffer, offset);
        if (!message) break;

        messages.push(message);
        offset += message.totalLength;
      }

    } catch (error) {
      console.error('Error parsing FTN packet:', error);
      // Return empty array on parse error
    }

    return messages;
  }

  // Parse individual FTN message
  private parseFTNMessage(buffer: Buffer, offset: number): Omit<FTNMessage, 'id'> & { totalLength: number } | null {
    try {
      // FTN message structure:
      // - Message header (variable)
      // - Kludges (control lines starting with \x01)
      // - Body text
      // - Null terminator

      let currentOffset = offset;

      // Skip message header (34 bytes minimum)
      if (buffer.length < currentOffset + 34) return null;

      // Read message type (should be 0x02 for message)
      const msgType = buffer[currentOffset + 2];
      if (msgType !== 0x02) return null;

      // Read destination and origin addresses
      const destZone = buffer.readUInt16LE(currentOffset + 8);
      const destNet = buffer.readUInt16LE(currentOffset + 10);
      const destNode = buffer.readUInt16LE(currentOffset + 12);
      const destPoint = buffer.readUInt16LE(currentOffset + 14);

      const origZone = buffer.readUInt16LE(currentOffset + 16);
      const origNet = buffer.readUInt16LE(currentOffset + 18);
      const origNode = buffer.readUInt16LE(currentOffset + 20);
      const origPoint = buffer.readUInt16LE(currentOffset + 22);

      // Read date/time
      const dateStr = buffer.slice(currentOffset + 24, currentOffset + 34).toString('ascii').trim();
      const date = this.parseFTNDateTime(dateStr);

      currentOffset += 34;

      // Parse kludges and body
      let msgid = '';
      let replyTo = '';
      let subject = '';
      let body = '';
      let inBody = false;

      while (currentOffset < buffer.length) {
        const lineEnd = buffer.indexOf(0x0D, currentOffset);
        if (lineEnd === -1) break;

        const line = buffer.slice(currentOffset, lineEnd).toString('ascii');
        currentOffset = lineEnd + 1;

        // Skip LF if present
        if (buffer[currentOffset] === 0x0A) currentOffset++;

        if (line.startsWith('\x01MSGID:')) {
          msgid = line.substring(7);
        } else if (line.startsWith('\x01REPLY:')) {
          replyTo = line.substring(7);
        } else if (!inBody && !line.startsWith('\x01')) {
          // First non-kludge line is subject
          subject = line;
          inBody = true;
        } else if (inBody) {
          // Body lines
          if (line.trim() === '') {
            body += '\r\n';
          } else {
            body += line + '\r\n';
          }
        }

        // Check for end of message (null terminator)
        if (buffer[currentOffset] === 0x00) {
          currentOffset++;
          break;
        }
      }

      const fromAddress = `${origZone}:${origNet}/${origNode}${origPoint ? '.' + origPoint : ''}@fidonet.org`;
      const toAddress = `${destZone}:${destNet}/${destNode}${destPoint ? '.' + destPoint : ''}@fidonet.org`;

      return {
        fromAddress,
        toAddress,
        subject: subject.trim(),
        body: body.trim(),
        date,
        area: 'GENERAL', // Would be determined from kludges in full implementation
        msgid,
        replyTo,
        attributes: 0, // Would parse from message attributes
        status: 'received',
        totalLength: currentOffset - offset
      };

    } catch (error) {
      console.error('Error parsing FTN message:', error);
      return null;
    }
  }

  // Parse FTN date/time format (DD MMM YY HH:MM:SS)
  private parseFTNDateTime(dateStr: string): Date {
    try {
      // FTN format: DD MMM YY HH:MM:SS (e.g., "15 Oct 24 14:30:25")
      const parts = dateStr.trim().split(/\s+/);
      if (parts.length !== 4) throw new Error('Invalid date format');

      const [day, month, year, time] = parts;
      const [hours, minutes, seconds] = time.split(':');

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = monthNames.indexOf(month);

      if (monthIndex === -1) throw new Error('Invalid month');

      const fullYear = 2000 + parseInt(year);
      return new Date(fullYear, monthIndex, parseInt(day),
                     parseInt(hours), parseInt(minutes), parseInt(seconds));
    } catch (error) {
      console.error('Error parsing FTN date:', dateStr, error);
      return new Date();
    }
  }

  // Send FTN message
  async sendFTNMessage(message: Omit<FTNMessage, 'id'>): Promise<void> {
    const messageId = await db.createFTNMessage(message);

    // Get the created message with ID
    // Note: In real implementation, createFTNMessage would return the full message
    const fullMessage: FTNMessage = { ...message, id: messageId };

    // Create outbound packet
    const packetPath = path.join(this.outboundPath, `outbound_${Date.now()}.pkt`);
    await this.writeFTNPacket(packetPath, [fullMessage]);

    // Update message status
    await db.updateFTNMessage(messageId, { status: 'sent' });
  }

  // Write FTN packet (proper FTS-0001 implementation)
  private async writeFTNPacket(filePath: string, messages: FTNMessage[]): Promise<void> {
    const fs = require('fs');
    const buffers: Buffer[] = [];

    // Create FTN packet header (58 bytes)
    const header = this.createFTNPacketHeader();
    buffers.push(header);

    // Create message data
    for (const message of messages) {
      const messageBuffer = this.createFTNMessage(message);
      buffers.push(messageBuffer);
    }

    // Write complete packet
    const packetBuffer = Buffer.concat(buffers);
    fs.writeFileSync(filePath, packetBuffer);
  }

  // Create FTN packet header buffer
  private createFTNPacketHeader(): Buffer {
    const header = Buffer.alloc(58);

    // Packet type (0x02 = packet)
    header[2] = 0x02;

    // Parse our address for header
    const addressMatch = this.address.match(/^(\d+):(\d+)\/(\d+)(\.(\d+))?/);
    if (addressMatch) {
      const [, origZone, origNet, origNode, , origPoint] = addressMatch;

      // Originating address
      header.writeUInt16LE(parseInt(origZone), 16);
      header.writeUInt16LE(parseInt(origNet), 18);
      header.writeUInt16LE(parseInt(origNode), 20);
      header.writeUInt16LE(parseInt(origPoint || '0'), 22);

      // Destination address (same as origin for outbound packets)
      header.writeUInt16LE(parseInt(origZone), 8);
      header.writeUInt16LE(parseInt(origNet), 10);
      header.writeUInt16LE(parseInt(origNode), 12);
      header.writeUInt16LE(parseInt(origPoint || '0'), 14);
    }

    // Packet password (empty)
    // Creation time
    const now = new Date();
    const timeStr = now.toISOString().slice(0, 19).replace(/[:-]/g, '');
    header.write(timeStr, 24, 8, 'ascii');

    // Additional header fields can be set here

    return header;
  }

  // Create FTN message buffer
  private createFTNMessage(message: FTNMessage): Buffer {
    const buffers: Buffer[] = [];

    // Message header (34 bytes)
    const header = Buffer.alloc(34);

    // Message type (0x02 = message)
    header[2] = 0x02;

    // Parse addresses
    const fromMatch = message.fromAddress.match(/^(\d+):(\d+)\/(\d+)(\.(\d+))?/);
    const toMatch = message.toAddress.match(/^(\d+):(\d+)\/(\d+)(\.(\d+))?/);

    if (fromMatch && toMatch) {
      const [, fromZone, fromNet, fromNode, , fromPoint] = fromMatch;
      const [, toZone, toNet, toNode, , toPoint] = toMatch;

      // Destination address
      header.writeUInt16LE(parseInt(toZone), 8);
      header.writeUInt16LE(parseInt(toNet), 10);
      header.writeUInt16LE(parseInt(toNode), 12);
      header.writeUInt16LE(parseInt(toPoint || '0'), 14);

      // Originating address
      header.writeUInt16LE(parseInt(fromZone), 16);
      header.writeUInt16LE(parseInt(fromNet), 18);
      header.writeUInt16LE(parseInt(fromNode), 20);
      header.writeUInt16LE(parseInt(fromPoint || '0'), 22);
    }

    // Date/time
    const dateStr = this.formatFTNDateTime(message.date);
    header.write(dateStr, 24, 10, 'ascii');

    buffers.push(header);

    // Kludges
    const kludges: string[] = [];

    if (message.msgid) {
      kludges.push(`\x01MSGID: ${message.msgid}`);
    }

    if (message.replyTo) {
      kludges.push(`\x01REPLY: ${message.replyTo}`);
    }

    // Add area kludge if not GENERAL
    if (message.area && message.area !== 'GENERAL') {
      kludges.push(`\x01AREA: ${message.area}`);
    }

    // Subject and body
    const contentLines = [
      ...kludges,
      message.subject,
      '',
      message.body
    ];

    // Convert to buffer with CRLF line endings
    const contentBuffer = Buffer.from(contentLines.join('\r\n'), 'ascii');
    buffers.push(contentBuffer);

    // Null terminator
    buffers.push(Buffer.from([0x00]));

    return Buffer.concat(buffers);
  }

  // Format date/time for FTN (DD MMM YY  HH:MM:SS)
  private formatFTNDateTime(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = (date.getFullYear() % 100).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${day} ${month} ${year}  ${hours}:${minutes}:${seconds}`;
  }

  // Get pending outbound messages
  async getPendingMessages(): Promise<FTNMessage[]> {
    // Query database for pending messages
    return await db.getFTNMessages({ status: 'pending' });
  }

  // Process incoming FTN packets from directory
  async processIncomingPackets(): Promise<void> {
    const fs = require('fs');
    const path = require('path');

    try {
      // Ensure inbound directory exists
      if (!fs.existsSync(this.inboundPath)) {
        fs.mkdirSync(this.inboundPath, { recursive: true });
        return;
      }

      // Create processed subdirectory if it doesn't exist
      const processedDir = path.join(this.inboundPath, 'processed');
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
      }

      // Find all .pkt files
      const files = fs.readdirSync(this.inboundPath)
        .filter((file: string) => file.toLowerCase().endsWith('.pkt') && !file.startsWith('processed'))
        .map((file: string) => path.join(this.inboundPath, file));

      for (const filePath of files) {
        try {
          await this.processFTNPacket(filePath);
          // Move processed file to archive
          const filename = path.basename(filePath);
          fs.renameSync(filePath, path.join(processedDir, filename));
        } catch (error) {
          console.error(`Failed to process FTN packet ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing incoming FTN packets:', error);
    }
  }

  // Clean up old processed packets
  async cleanupOldPackets(maxAgeDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // Get messages older than cutoff
    const oldMessages = await db.getFTNMessages({
      status: 'sent'
    });

    // Filter by date (since we don't have a direct query for this)
    const messagesToDelete = oldMessages.filter(msg => msg.date < cutoffDate);

    for (const message of messagesToDelete) {
      try {
        await db.updateFTNMessage(message.id, { status: 'archived' });
      } catch (error) {
        console.error(`Failed to archive FTN message ${message.id}:`, error);
      }
    }
  }
}

// Export singleton instances
export const qwkManager = new QWKManager();
export const ftnManager = new FTNManager();