// Where uploaded images go.
// With BLOB_READ_WRITE_TOKEN set (Vercel Blob) they're stored in the cloud and served from its CDN.
// Without it they're written to public/uploads (or DATA_DIR/uploads) and served by this server.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './paths.js';

export const usesBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

export const randomName = (type) =>
  `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${EXT[type] || '.bin'}`;

/**
 * Saves an image and returns the URL to put in articles.
 * @param {Buffer|string} data
 * @param {string} type  MIME type
 * @param {string} [name] path under uploads/, e.g. "seed/cover.svg" (default: random)
 */
export async function saveImage(data, type, name = randomName(type)) {
  if (usesBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`uploads/${name}`, data, {
      access: 'public',
      contentType: type,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return blob.url;
  }
  const file = path.join(UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return `/uploads/${name}`;
}
