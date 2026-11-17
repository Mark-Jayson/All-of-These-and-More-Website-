// Storage for articles, settings and the editor login.
// With DATABASE_URL (or POSTGRES_URL) set it uses Postgres — that's how it runs on Vercel.
// Without one it falls back to JSON files in ./data, so local development needs no setup.
import crypto from 'node:crypto';
import fileDriver from './drivers/file.js';
import { neonDriver } from './drivers/postgres.js';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let driver = null;
/** Swap the backend (used by tests). */
export function useDriver(d) {
  driver = d;
  booted = null;
}

const DEFAULT_SETTINGS = {
  title: 'All of These and More',
  tagline: 'Essays, notes and long looks at small things.',
  author: 'Mark Jayson Agao',
  about:
    'A personal publication. Blogs, essays and the occasional photo story — collected here, one cube at a time.',
  accent: '#d7ff3a',
};

/* -------------------------------------------------------------------- boot */

let booted = null;
let bootMessage = null;

/** Connects and creates tables/login on first use. Safe to call on every request. */
export function ready() {
  booted ||= (async () => {
    driver ||= DB_URL ? await neonDriver(DB_URL) : fileDriver;
    await driver.ready();
    bootMessage = await ensureLogin();
  })().catch((e) => {
    booted = null;
    throw e;
  });
  return booted;
}

export const backend = () => driver?.name;
export const firstBootMessage = () => bootMessage;

/* ---------------------------------------------------------------- password */

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const newAuth = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hash(pw, salt), secret: crypto.randomBytes(32).toString('hex') };
};

async function ensureLogin() {
  const existing = await driver.getKV('auth');
  if (existing) {
    if (!existing.secret) await driver.setKV('auth', { ...existing, secret: crypto.randomBytes(32).toString('hex') });
    return null;
  }
  const fromEnv = process.env.ADMIN_PASSWORD;
  const pw = fromEnv || crypto.randomBytes(9).toString('base64url');
  const created = await driver.addKVIfMissing('auth', newAuth(pw)); // two cold starts can race; first one wins
  if (!created) return null;
  return fromEnv
    ? 'Admin password set from ADMIN_PASSWORD (change it in Editor → Settings).'
    : `No ADMIN_PASSWORD set — generated one for you: ${pw}`;
}

export async function setPassword(pw) {
  await driver.setKV('auth', newAuth(pw)); // new secret too, so every old session is signed out
}

export async function checkPassword(pw) {
  const auth = await driver.getKV('auth');
  if (!auth) return false;
  const a = Buffer.from(hash(pw, auth.salt), 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------- sessions */
// Stateless signed tokens: "<expiry>.<hmac>". Works across serverless instances
// with no session table; changing the password rotates the key and ends them all.

async function sessionKey() {
  const auth = await driver.getKV('auth');
  return auth ? auth.secret + auth.hash : null;
}

const sign = (key, exp) => crypto.createHmac('sha256', key).update(String(exp)).digest('hex');

export async function createSession(ms) {
  const exp = Date.now() + ms;
  return `${exp}.${sign(await sessionKey(), exp)}`;
}

export async function verifySession(token) {
  const [exp, mac] = String(token || '').split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const key = await sessionKey();
  if (!key) return false;
  const a = Buffer.from(sign(key, exp), 'hex');
  const b = Buffer.from(mac, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ----------------------------------------------------------- login throttle */

export async function loginBlocked(ip) {
  const a = await driver.getKV(`login:${ip}`);
  return !!a && a.until > Date.now();
}

export async function loginFailed(ip) {
  const a = (await driver.getKV(`login:${ip}`)) || { count: 0, until: 0 };
  const count = a.until && a.until < Date.now() ? 1 : a.count + 1;
  await driver.setKV(`login:${ip}`, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
}

export const loginOk = (ip) => driver.deleteKV(`login:${ip}`);

/* ---------------------------------------------------------------- settings */

export async function settings() {
  return { ...DEFAULT_SETTINGS, ...(await driver.getKV('settings')) };
}

export async function saveSettings(input) {
  const s = await settings();
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof input[k] === 'string') s[k] = input[k].trim();
  }
  if (!/^#[0-9a-f]{6}$/i.test(s.accent)) s.accent = DEFAULT_SETTINGS.accent;
  await driver.setKV('settings', s);
  return s;
}

/* ---------------------------------------------------------------- articles */

export const articles = () => driver.all();
export const getArticle = (id) => driver.get(id);

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled'
  );
}

function uniqueSlug(list, base, id) {
  let slug = base;
  let n = 2;
  while (list.some((a) => a.slug === slug && a.id !== id)) slug = `${base}-${n++}`;
  return slug;
}

export async function saveArticle(id, input) {
  const list = await driver.all();
  const now = new Date().toISOString();
  let a = id ? list.find((x) => x.id === id) : null;
  if (id && !a) return null;

  const title = String(input.title ?? a?.title ?? '').trim();
  if (!title) throw new Error('Give it a title first');

  a ||= { id: crypto.randomUUID(), createdAt: now, views: 0 };

  const status = input.status === 'published' ? 'published' : 'draft';
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  Object.assign(a, {
    title,
    dek: String(input.dek ?? '').trim(),
    slug: uniqueSlug(list, slugify(input.slug || title), a.id),
    category: String(input.category ?? '').trim() || 'Essay',
    tags: [...new Set(tags.map((t) => t.replace(/^#/, '').toLowerCase()))],
    cover: String(input.cover ?? ''),
    coverAlt: String(input.coverAlt ?? ''),
    body: String(input.body ?? ''),
    featured: Boolean(input.featured),
    status,
    publishedAt:
      input.publishedAt && !isNaN(new Date(input.publishedAt))
        ? new Date(input.publishedAt).toISOString()
        : a.publishedAt || now,
    updatedAt: now,
  });

  await driver.put(a);
  return a;
}

export const deleteArticle = (id) => driver.remove(id);
export const bumpViews = (id) => driver.addView(id);
export const replaceArticles = (list) => driver.replaceAll(list);
