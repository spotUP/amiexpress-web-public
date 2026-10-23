/** Builds fake Kickstart images in memory. Real ROMs are copyrighted and never enter the repo. */
export function syntheticKickstart(opts: {
  execVersion: number;
  idString?: string;
  size?: number;
  magic?: number;
  swapped?: boolean;
}): Buffer {
  const size = opts.size ?? 512 * 1024;
  const buf = Buffer.alloc(size);
  const base = 0xf80000;
  buf.writeUInt16BE(opts.magic ?? 0x1111, 0);
  buf.writeUInt16BE(0x4ef9, 2);
  const tagOff = 0x100;
  const tag = base + tagOff;
  buf.writeUInt16BE(0x4afc, tagOff);
  buf.writeUInt32BE(tag, tagOff + 2);
  buf.writeUInt32BE(tag + 0x40, tagOff + 6);
  buf.writeUInt8(0, tagOff + 10);
  buf.writeUInt8(opts.execVersion, tagOff + 11);
  buf.writeUInt32BE(base + 0x200, tagOff + 14);
  buf.writeUInt32BE(base + 0x220, tagOff + 18);
  buf.write('exec.library\0', 0x200, 'latin1');
  buf.write(`${opts.idString ?? `exec ${opts.execVersion}.10 (15.7.93)`}\0`, 0x220, 'latin1');
  if (opts.swapped) buf.swap16();
  return buf;
}
