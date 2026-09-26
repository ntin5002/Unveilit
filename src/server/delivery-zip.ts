import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { once } from "node:events";

export interface ZipSourceFile {
  path: string;
  name: string;
  modifiedAt?: Date;
}

interface CentralEntry {
  name: Buffer;
  crc32: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function updateCrc(crc: number, chunk: Uint8Array) {
  let value = crc ^ 0xffffffff;
  for (const byte of chunk) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function crc32File(path: string) {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = updateCrc(crc, chunk as Buffer);
  return crc >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function localHeader(entry: CentralEntry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8
  header.writeUInt16LE(0, 8); // stored, no compression
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry: CentralEntry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

async function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: Buffer) {
  if (!stream.write(chunk)) await once(stream, "drain");
}

export async function createStoredZip(outputPath: string, files: ZipSourceFile[]) {
  if (!files.length) throw new Error("Cannot create an empty delivery package.");
  const stream = createWriteStream(outputPath, { flags: "w" });
  const central: CentralEntry[] = [];
  let offset = 0;

  try {
    for (const file of files) {
      const info = await stat(file.path);
      if (info.size > 0xffffffff) throw new Error(`File is too large for ZIP32: ${file.name}`);
      const name = Buffer.from(file.name.replaceAll("\\", "/"), "utf8");
      const crc32 = await crc32File(file.path);
      const { dosTime, dosDate } = dosDateTime(file.modifiedAt || info.mtime || new Date());
      const entry: CentralEntry = { name, crc32, size: info.size, offset, dosTime, dosDate };
      const header = localHeader(entry);
      await writeChunk(stream, header);
      await writeChunk(stream, name);
      offset += header.length + name.length;
      for await (const chunk of createReadStream(file.path)) {
        const buffer = Buffer.from(chunk as Buffer);
        await writeChunk(stream, buffer);
        offset += buffer.length;
      }
      central.push(entry);
    }

    const centralOffset = offset;
    for (const entry of central) {
      const header = centralHeader(entry);
      await writeChunk(stream, header);
      await writeChunk(stream, entry.name);
      offset += header.length + entry.name.length;
    }
    const centralSize = offset - centralOffset;
    if (central.length > 0xffff || centralOffset > 0xffffffff || centralSize > 0xffffffff) {
      throw new Error("Delivery package exceeds ZIP32 limits.");
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20);
    await writeChunk(stream, end);
  } finally {
    stream.end();
    await once(stream, "close");
  }

  const info = await stat(outputPath);
  return { size: info.size, entries: central.length };
}
