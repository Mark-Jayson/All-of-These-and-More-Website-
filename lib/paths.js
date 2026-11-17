// Where content lives on disk.
// Locally: ./data for the database and ./public/uploads for images.
// In production set DATA_DIR to a persistent volume (e.g. /data) and everything —
// database, login and uploaded images — goes there, so it survives redeploys.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const custom = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;

export const DATA_DIR = custom || path.join(ROOT, 'data');
export const UPLOAD_DIR = custom ? path.join(custom, 'uploads') : path.join(ROOT, 'public', 'uploads');
