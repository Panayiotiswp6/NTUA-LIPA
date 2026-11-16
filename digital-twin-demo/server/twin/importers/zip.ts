import yauzl from 'yauzl';
import type { InputFile } from '../types';

export const ZIP_LIMITS = {
  maxEntries: 5000,
  maxTotalBytes: 200 * 1024 * 1024,
  maxEntryBytes: 100 * 1024 * 1024,
  /** Compressed → uncompressed ratio above which an entry is treated as a zip bomb. */
  maxRatio: 200,
  maxDepth: 3,
};

/** Only these are read; media and unknown files in exports are skipped without being decompressed. */
const READABLE = /\.(txt|json|mbox|md|markdown|zip)$/i;

export class UnsafeArchiveError extends Error {}

export const isZip = (data: Buffer) => data.length > 4 && data.readUInt32LE(0) === 0x04034b50;

function open(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => (error ? reject(error) : resolve(zip!)));
  });
}

function read(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error);
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // Declared sizes can lie; count what is actually inflated.
        if (size > limit) { stream.destroy(); reject(new UnsafeArchiveError('Αρχείο μέσα στο zip ξεπερνά το επιτρεπτό μέγεθος.')); return; }
        chunks.push(chunk);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

interface Budget { entries: number; bytes: number }

/** Unpack an archive (and archives inside it) into in-memory files. Nothing is written to disk. */
export async function extractZip(buffer: Buffer, prefix = '', depth = 0, budget: Budget = { entries: 0, bytes: 0 }): Promise<{ files: InputFile[]; skipped: string[] }> {
  if (depth >= ZIP_LIMITS.maxDepth) throw new UnsafeArchiveError('Υπερβολικά πολλά zip μέσα σε zip.');
  let zip: yauzl.ZipFile;
  try {
    zip = await open(buffer);
  } catch (error) {
    const message = (error as Error).message;
    if (/relative path|absolute path|invalid characters/i.test(message)) throw new UnsafeArchiveError(`Μη ασφαλής διαδρομή αρχείου στο zip (${message}).`);
    throw new UnsafeArchiveError(`Το zip δεν διαβάζεται (${message}).`);
  }
  const files: InputFile[] = [];
  const skipped: string[] = [];
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => { zip.close(); reject(error); };
    zip.on('error', error => fail(/relative path|absolute path|invalid characters/i.test(error.message) ? new UnsafeArchiveError(`Μη ασφαλής διαδρομή αρχείου στο zip (${error.message}).`) : error));
    zip.on('end', () => resolve({ files, skipped }));
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        const name = entry.fileName;
        // Defence in depth: yauzl already rejects these with strictFileNames.
        if (name.startsWith('/') || name.split(/[\\/]/).includes('..')) throw new UnsafeArchiveError(`Μη ασφαλής διαδρομή αρχείου στο zip: ${name}`);
        if (++budget.entries > ZIP_LIMITS.maxEntries) throw new UnsafeArchiveError('Το zip έχει υπερβολικά πολλά αρχεία.');
        if (/\/$/.test(name) || /(^|\/)(__MACOSX|\.DS_Store)/.test(name)) { zip.readEntry(); return; }
        if (!READABLE.test(name)) { skipped.push(prefix + name); zip.readEntry(); return; }
        const ratio = entry.compressedSize ? entry.uncompressedSize / entry.compressedSize : 0;
        if (entry.uncompressedSize > ZIP_LIMITS.maxEntryBytes || ratio > ZIP_LIMITS.maxRatio) throw new UnsafeArchiveError(`Ύποπτα μεγάλη συμπίεση (πιθανό zip bomb): ${name}`);
        if (budget.bytes + entry.uncompressedSize > ZIP_LIMITS.maxTotalBytes) throw new UnsafeArchiveError('Το συνολικό μέγεθος του zip ξεπερνά το όριο.');
        const data = await read(zip, entry, Math.min(ZIP_LIMITS.maxEntryBytes, ZIP_LIMITS.maxTotalBytes - budget.bytes));
        budget.bytes += data.length;
        if (/\.zip$/i.test(name) && isZip(data)) {
          const inner = await extractZip(data, `${prefix}${name}/`, depth + 1, budget);
          files.push(...inner.files);
          skipped.push(...inner.skipped);
        } else {
          files.push({ name: prefix + name, data });
        }
        zip.readEntry();
      } catch (error) {
        fail(error as Error);
      }
    });
    zip.readEntry();
  });
}
