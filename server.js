import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './lib/store.js';
import { UPLOAD_DIR } from './lib/paths.js';
import { renderMarkdown, readingMinutes, excerptOf } from './lib/markdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const VIEWS = path.join(__dirname, 'views');

const app = express();
app.set('trust proxy', 1); // behind Render/Railway's proxy: real client IPs + HTTPS detection
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

/* ------------------------------------------------------------------ helpers */

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const isLive = (a) => a.status === 'published' && new Date(a.publishedAt).getTime() <= Date.now();

function summary(a) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    dek: a.dek,
    category: a.category,
    tags: a.tags,
    cover: a.cover,
    coverAlt: a.coverAlt,
    featured: a.featured,
    publishedAt: a.publishedAt,
    readingMinutes: readingMinutes(a.body),
    excerpt: a.dek || excerptOf(a.body),
  };
}

function liveArticles() {
  return db
    .articles()
    .filter(isLive)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function template(name, vars) {
  const html = fs.readFileSync(path.join(VIEWS, name), 'utf8');
  return html.replace(/\{\{\{?(\w+)\}?\}\}/g, (m, key) => {
    const raw = m.startsWith('{{{');
    const v = vars[key] ?? '';
    return raw ? v : esc(v);
  });
}

function siteVars() {
  const s = db.settings();
  return { siteTitle: s.title, tagline: s.tagline, accent: s.accent, author: s.author, about: s.about };
}

/* --------------------------------------------------------------------- auth */

const sessions = new Map(); // token -> expiry
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const attempts = new Map(); // ip -> {count, until}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAdmin(req) {
  const t = readCookie(req, 'aotam_session');
  if (!t || !sessions.has(t)) return false;
  if (sessions.get(t) < Date.now()) {
    sessions.delete(t);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });

  if (!db.checkPassword(String(req.body?.password || ''))) {
    const count = (a?.count || 0) + 1;
    attempts.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    return res.status(401).json({ error: 'Wrong password' });
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.setHeader(
    'Set-Cookie',
    `aotam_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${req.secure ? '; Secure' : ''}`
  );
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sessions.delete(readCookie(req, 'aotam_session'));
  res.setHeader('Set-Cookie', 'aotam_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => res.json({ signedIn: isAdmin(req) }));

/* -------------------------------------------------------------- public api */

app.get('/api/site', (req, res) => res.json(db.settings()));

app.get('/api/articles', (req, res) => res.json(liveArticles().map(summary)));

/* --------------------------------------------------------------- admin api */

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP, GIF or AVIF image (max 15 MB).' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/admin/articles', requireAdmin, (req, res) => {
  const list = db
    .articles()
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((a) => ({ ...summary(a), status: a.status, views: a.views, updatedAt: a.updatedAt, live: isLive(a) }));
  res.json(list);
});

app.get('/api/admin/articles/:id', requireAdmin, (req, res) => {
  const a = db.getArticle(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(a);
});

app.post('/api/admin/articles', requireAdmin, (req, res) => {
  try {
    res.status(201).json(db.saveArticle(null, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/articles/:id', requireAdmin, (req, res) => {
  try {
    const a = db.saveArticle(req.params.id, req.body || {});
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json(a);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/articles/:id', requireAdmin, (req, res) => {
  res.json({ ok: db.deleteArticle(req.params.id) });
});

app.post('/api/admin/preview', requireAdmin, (req, res) => {
  res.json({ html: renderMarkdown(String(req.body?.body || '')).html });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(db.saveSettings(req.body || {}));
});

app.put('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next } = req.body || {};
  if (!db.checkPassword(String(current || ''))) return res.status(400).json({ error: 'Current password is wrong' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Use at least 8 characters' });
  db.setPassword(String(next));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- pages */

app.get('/', (req, res) => {
  const s = db.settings();
  res.type('html').send(
    template('index.html', {
      ...siteVars(),
      count: String(liveArticles().length).padStart(2, '0'),
      year: new Date().getFullYear(),
      description: s.tagline,
    })
  );
});

app.get('/article/:slug', (req, res) => {
  const list = liveArticles();
  const i = list.findIndex((a) => a.slug === req.params.slug);
  const a = list[i];
  if (!a) return res.status(404).type('html').send(template('404.html', siteVars()));

  if (!isAdmin(req)) db.bumpViews(a.id);

  const { html, toc } = renderMarkdown(a.body);
  const date = new Date(a.publishedAt);
  const newer = list[i - 1];
  const older = list[i + 1];

  const tocHtml = toc.length
    ? `<ol>${toc.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol>`
    : '';
  const tagsHtml = (a.tags || []).map((t) => `<li>#${esc(t)}</li>`).join('');
  const navCard = (x, label) =>
    x
      ? `<a class="next-card" href="/article/${esc(x.slug)}">
          <span class="next-card__cube" aria-hidden="true"><span class="f t"></span><span class="f l" style="background-image:url('${esc(x.cover)}')"></span><span class="f r"></span></span>
          <span class="next-card__text"><span class="meta">${label} · ${esc(x.category)}</span><span class="next-card__title">${esc(x.title)}</span></span>
        </a>`
      : '';

  res.type('html').send(
    template('article.html', {
      ...siteVars(),
      title: a.title,
      dek: a.dek,
      category: a.category,
      cover: a.cover,
      coverAlt: a.coverAlt || '',
      slug: a.slug,
      description: a.dek || excerptOf(a.body),
      dateIso: date.toISOString(),
      dateHuman: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      minutes: readingMinutes(a.body),
      number: String(list.length - i).padStart(2, '0'),
      bodyHtml: html,
      tocHtml,
      tagsHtml,
      nextHtml: navCard(older, 'Older') + navCard(newer, 'Newer'),
    })
  );
});

app.get('/rss.xml', (req, res) => {
  const s = db.settings();
  const base = `${req.protocol}://${req.get('host')}`;
  const items = liveArticles()
    .slice(0, 30)
    .map(
      (a) => `<item><title>${esc(a.title)}</title><link>${base}/article/${esc(a.slug)}</link><guid>${base}/article/${esc(
        a.slug
      )}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><category>${esc(
        a.category
      )}</category><description>${esc(a.dek || excerptOf(a.body))}</description></item>`
    )
    .join('');
  res
    .type('application/rss+xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(s.title)}</title><link>${base}</link><description>${esc(
        s.tagline
      )}</description>${items}</channel></rss>`
    );
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((req, res) => res.status(404).type('html').send(template('404.html', siteVars())));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const firstBoot = db.init();
app.listen(PORT, () => {
  console.log(`\n  All of These and More → http://localhost:${PORT}`);
  console.log(`  Editor               → http://localhost:${PORT}/admin`);
  if (firstBoot) console.log(`\n  ${firstBoot}`);
  console.log('');
});
