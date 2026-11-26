import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LFH = 0x04034b50;

export class ZipFormatError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ZipFormatError';
    this.code = code;
  }
}

/**
 * Checks whether a ZIP entry path attempts path traversal or absolute path escape.
 * @param {string} entryName
 */
export function isUnsafeZipPath(entryName) {
  if (!entryName || entryName.includes('\0')) return true;
  if (entryName.startsWith('/') || entryName.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(entryName)) return true;
  const parts = entryName.split(/[\\/]+/);
  return parts.some((p) => p === '..');
}

/**
 * Pure-Node ZIP / .vsix parser verifying EOCD, Central Directory, Local File Headers,
 * deflate/stored payloads, and zlib.crc32 integrity.
 * @param {Buffer} buf
 * @param {{ rejectPathTraversal?: boolean }} [opts]
 */
export function parseZipBuffer(buf, opts = {}) {
  const { rejectPathTraversal = true } = opts;
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new ZipFormatError('ZIP_TRUNCATED', 'Buffer is too small to be a valid ZIP archive.');
  }

  // Locate EOCD scanning backwards within max comment window (65535 + 22)
  const minOffset = Math.max(0, buf.length - 65557);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buf.length) {
        eocdOffset = i;
        break;
      }
    }
  }
  if (eocdOffset === -1) {
    throw new ZipFormatError('ZIP_EOCD_MISSING', 'End of Central Directory record (0x06054b50) not found.');
  }

  const diskNumber = buf.readUInt16LE(eocdOffset + 4);
  const cdDisk = buf.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buf.readUInt16LE(eocdOffset + 8);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new ZipFormatError('ZIP_MULTIDISK_UNSUPPORTED', 'Multi-disk ZIP archives are not supported.');
  }
  if (cdOffset + cdSize > eocdOffset) {
    throw new ZipFormatError('ZIP_TRUNCATED', 'Central Directory extends beyond EOCD boundary.');
  }

  const entries = [];
  const byName = new Map();
  let cursor = cdOffset;

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (cursor + 46 > cdOffset + cdSize) {
      throw new ZipFormatError('ZIP_TRUNCATED', `Central Directory truncated at entry ${idx}.`);
    }
    if (buf.readUInt32LE(cursor) !== SIG_CD) {
      throw new ZipFormatError('ZIP_BAD_CD_SIG', `Invalid Central Directory signature at offset ${cursor}.`);
    }

    const flags = buf.readUInt16LE(cursor + 8);
    const compressionMethod = buf.readUInt16LE(cursor + 10);
    const expectedCrc = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const headerEnd = cursor + 46 + nameLen + extraLen + commentLen;
    if (headerEnd > cdOffset + cdSize) {
      throw new ZipFormatError('ZIP_TRUNCATED', `Central Directory metadata truncated at entry ${idx}.`);
    }

    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor = headerEnd;

    if (rejectPathTraversal && isUnsafeZipPath(name)) {
      throw new ZipFormatError('ZIP_PATH_TRAVERSAL', `Unsafe path traversal entry detected: ${name}`);
    }

    if (localHeaderOffset + 30 > cdOffset) {
      throw new ZipFormatError('ZIP_TRUNCATED', `Local File Header out of bounds for ${name}.`);
    }
    if (buf.readUInt32LE(localHeaderOffset) !== SIG_LFH) {
      throw new ZipFormatError('ZIP_BAD_LFH_SIG', `Invalid Local File Header signature for ${name}.`);
    }

    const lfhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset) {
      throw new ZipFormatError('ZIP_TRUNCATED', `Compressed payload truncated for ${name}.`);
    }

    const compressedSlice = buf.subarray(dataStart, dataEnd);
    let data;
    if (compressionMethod === 0) {
      data = Buffer.from(compressedSlice);
    } else if (compressionMethod === 8) {
      try {
        data = zlib.inflateRawSync(compressedSlice);
      } catch (err) {
        throw new ZipFormatError('ZIP_INFLATE_ERROR', `Inflate failed for ${name}: ${err.message}`);
      }
    } else {
      throw new ZipFormatError('ZIP_UNSUPPORTED_METHOD', `Unsupported compression method ${compressionMethod} for ${name}.`);
    }

    if (data.length !== uncompressedSize) {
      throw new ZipFormatError(
        'ZIP_SIZE_MISMATCH',
        `Uncompressed size mismatch for ${name}: expected ${uncompressedSize}, got ${data.length}.`,
      );
    }

    const actualCrc = zlib.crc32(data) >>> 0;
    if (actualCrc !== expectedCrc) {
      throw new ZipFormatError(
        'ZIP_CRC_MISMATCH',
        `CRC32 mismatch for ${name}: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}.`,
      );
    }

    const entry = {
      name,
      flags,
      compressionMethod,
      crc32: actualCrc,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith('/'),
      data,
    };
    entries.push(entry);
    byName.set(name, entry);
  }

  return {
    entries,
    byName,
    has(name) {
      return byName.has(name);
    },
    readText(name) {
      const entry = byName.get(name);
      return entry ? entry.data.toString('utf8') : null;
    },
    readBuffer(name) {
      const entry = byName.get(name);
      return entry ? entry.data : null;
    },
  };
}

/**
 * Pure-Node synthetic ZIP builder for self-checks and negative tests.
 * @param {Array<{ name: string; content: string | Buffer; deflate?: boolean; corruptCrc?: boolean }>} items
 */
export function createSyntheticZip(items) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const item of items) {
    const raw = Buffer.isBuffer(item.content) ? item.content : Buffer.from(String(item.content), 'utf8');
    const nameBuf = Buffer.from(item.name, 'utf8');
    const useDeflate = item.deflate !== false;
    const compressed = useDeflate ? zlib.deflateRawSync(raw) : raw;
    const method = useDeflate ? 8 : 0;
    let crc = zlib.crc32(raw) >>> 0;
    if (item.corruptCrc) {
      crc = (crc ^ 0xffffffff) >>> 0;
    }

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(SIG_LFH, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0x0800, 6); // UTF-8
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(SIG_CD, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    localParts.push(lfh, nameBuf, compressed);
    cdParts.push(cd, nameBuf);
    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}
