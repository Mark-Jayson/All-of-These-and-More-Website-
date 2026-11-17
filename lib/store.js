// Tiny JSON-file store. Good for a personal publication with hundreds of pieces;
// swap for SQLite/Postgres if it ever grows past that.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const AUTH_FILE = path.join(DATA, 'auth.json');

const DEFAULT_SETTINGS = {
  title: 'All of These and More',
  tagline: 'Essays, notes and long looks at small things.',
  author: 'Mark Jayson Agao',
  about:
    'A personal publication. Blogs, essays and the occasional photo story — collected here, one cube at a time.',
  accent: '#d7ff3a',
};

let state = null;

function load() {
  if (state) return state;
  fs.mkdirSync(DATA, { recursive: true });
  state = fs.existsSync(DB_FILE)
    ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    : { settings: { ...DEFAULT_SETTINGS }, articles: [] };
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  return state;
}

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

let viewTimer = null;
function persistSoon() {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(persist, 2000);
}

/* ---------------------------------------------------------------- password */

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

export function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash: hash(pw, salt) }));
}

export function checkPassword(pw) {
  if (!fs.existsSync(AUTH_FILE)) return false;
  const { salt, hash: h } = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const a = Buffer.from(hash(pw, salt), 'hex');
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Returns a message to print on first boot, or null. */
export function init() {
  load();
  if (fs.existsSync(AUTH_FILE)) return null;
  const fromEnv = process.env.ADMIN_PASSWORD;
  const pw = fromEnv || crypto.randomBytes(9).toString('base64url');
  setPassword(pw);
  return fromEnv
    ? 'Admin password set from ADMIN_PASSWORD in .env (change it in Editor → Settings).'
    : `No ADMIN_PASSWORD set — generated one for you: ${pw}`;
}

/* ---------------------------------------------------------------- settings */

export const settings = () => load().settings;

export function saveSettings(input) {
  const s = load().settings;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof input[k] === 'string') s[k] = input[k].trim();
  }
  if (!/^#[0-9a-f]{6}$/i.test(s.accent)) s.accent = DEFAULT_SETTINGS.accent;
  persist();
  return s;
}

/* ---------------------------------------------------------------- articles */

export const articles = () => load().articles;
export const getArticle = (id) => load().articles.find((a) => a.id === id);

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

function uniqueSlug(base, id) {
  let slug = base;
  let n = 2;
  while (load().articles.some((a) => a.slug === slug && a.id !== id)) slug = `${base}-${n++}`;
  return slug;
}

export function saveArticle(id, input) {
  const list = load().articles;
  const now = new Date().toISOString();
  let a = id ? list.find((x) => x.id === id) : null;
  if (id && !a) return null;

  const title = String(input.title ?? a?.title ?? '').trim();
  if (!title) throw new Error('Give it a title first');

  if (!a) {
    a = { id: crypto.randomUUID(), createdAt: now, views: 0 };
    list.push(a);
  }

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
    slug: uniqueSlug(slugify(input.slug || title), a.id),
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

  persist();
  return a;
}

export function deleteArticle(id) {
  const list = load().articles;
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  persist();
  return true;
}

export function bumpViews(id) {
  const a = getArticle(id);
  if (!a) return;
  a.views = (a.views || 0) + 1;
  persistSoon();
}

export function replaceAll(next) {
  state = next;
  persist();
}
