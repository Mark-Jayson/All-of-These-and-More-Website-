import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './lib/store.js';
import { UPLOAD_DIR } from './lib/paths.js';
import { saveImage, usesBlob } from './lib/media.js';
import { renderMarkdown, readingMinutes, excerptOf } from './lib/markdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// Read once at startup with literal paths, so Vercel bundles them with the function.
const VIEWS = {
  'index.html': fs.readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8'),
  'article.html': fs.readFileSync(path.join(__dirname, 'views', 'article.html'), 'utf8'),
  '404.html': fs.readFileSync(path.join(__dirname, 'views', '404.html'), 'utf8'),
};
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, 'public', 'admin', 'index.html'), 'utf8');

const app = express();
app.set('trust proxy', 1); // behind Vercel's proxy: real client IPs + HTTPS detection
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

// Connect to storage (and create tables / the login) before handling anything.
app.use(async (req, res, next) => {
  await db.ready();
  next();
});

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

async function liveArticles() {
  return (await db.articles())
    .filter(isLive)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function template(name, vars) {
  return VIEWS[name].replace(/\{\{\{?(\w+)\}?\}\}/g, (m, key) => {
    const raw = m.startsWith('{{{');
    const v = vars[key] ?? '';
    return raw ? v : esc(v);
  });
}

async function siteVars() {
  const s = await db.settings();
  return { siteTitle: s.title, tagline: s.tagline, accent: s.accent, author: s.author, about: s.about };
}

/* --------------------------------------------------------------------- auth */

const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

function setSessionCookie(req, res, token) {
  res.setHeader(
    'Set-Cookie',
    `aotam_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${req.secure ? '; Secure' : ''}`
  );
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const isAdmin = (req) => db.verifySession(readCookie(req, 'aotam_session'));

async function requireAdmin(req, res, next) {
  if (await isAdmin(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

app.post('/api/admin/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (await db.loginBlocked(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });

  if (!(await db.checkPassword(String(req.body?.password || '')))) {
    await db.loginFailed(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  await db.loginOk(ip);
  setSessionCookie(req, res, await db.createSession(SESSION_MS));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'aotam_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', async (req, res) => res.json({ signedIn: await isAdmin(req) }));

/* -------------------------------------------------------------- public api */

app.get('/api/site', async (req, res) => res.json(await db.settings()));

app.get('/api/articles', async (req, res) => res.json((await liveArticles()).map(summary)));

/* --------------------------------------------------------------- admin api */

// Vercel caps request bodies at 4.5 MB; the editor shrinks photos before uploading, so this is plenty.
const MAX_MB = usesBlob() ? 4 : 15;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: `Upload a JPG, PNG, WebP, GIF or AVIF image (max ${MAX_MB} MB).` });
  res.json({ url: await saveImage(req.file.buffer, req.file.mimetype) });
});

app.get('/api/admin/articles', requireAdmin, async (req, res) => {
  const list = (await db.articles())
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((a) => ({ ...summary(a), status: a.status, views: a.views, updatedAt: a.updatedAt, live: isLive(a) }));
  res.json(list);
});

app.get('/api/admin/articles/:id', requireAdmin, async (req, res) => {
  const a = await db.getArticle(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(a);
});

app.post('/api/admin/articles', requireAdmin, async (req, res) => {
  try {
    res.status(201).json(await db.saveArticle(null, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/articles/:id', requireAdmin, async (req, res) => {
  try {
    const a = await db.saveArticle(req.params.id, req.body || {});
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json(a);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/articles/:id', requireAdmin, async (req, res) => {
  res.json({ ok: await db.deleteArticle(req.params.id) });
});

app.post('/api/admin/preview', requireAdmin, (req, res) => {
  res.json({ html: renderMarkdown(String(req.body?.body || '')).html });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  res.json(await db.saveSettings(req.body || {}));
});

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  const { current, next } = req.body || {};
  if (!(await db.checkPassword(String(current || '')))) return res.status(400).json({ error: 'Current password is wrong' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Use at least 8 characters' });
  await db.setPassword(String(next));
  // a new password rotates the signing key (signing out other devices), so re-issue this browser's session
  setSessionCookie(req, res, await db.createSession(SESSION_MS));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- pages */

app.get('/', async (req, res) => {
  const s = await db.settings();
  res.type('html').send(
    template('index.html', {
      ...(await siteVars()),
      count: String((await liveArticles()).length).padStart(2, '0'),
      year: new Date().getFullYear(),
      description: s.tagline,
    })
  );
});

app.get('/article/:slug', async (req, res) => {
  const list = await liveArticles();
  const i = list.findIndex((a) => a.slug === req.params.slug);
  const a = list[i];
  if (!a) return res.status(404).type('html').send(template('404.html', await siteVars()));

  if (!(await isAdmin(req))) await db.bumpViews(a.id);

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
      ...(await siteVars()),
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

app.get('/rss.xml', async (req, res) => {
  const s = await db.settings();
  const base = `${req.protocol}://${req.get('host')}`;
  const items = (await liveArticles())
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

app.get('/admin', (req, res) => res.type('html').send(ADMIN_HTML));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use(async (req, res) => res.status(404).type('html').send(template('404.html', await siteVars())));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

export default app; // Vercel runs the exported app as a function

if (!process.env.VERCEL) {
  await db.ready();
  app.listen(PORT, () => {
    console.log(`\n  All of These and More → http://localhost:${PORT}`);
    console.log(`  Editor               → http://localhost:${PORT}/admin`);
    console.log(`  Storage              → ${db.backend()} · images ${usesBlob() ? 'on Vercel Blob' : 'on disk'}`);
    if (db.firstBootMessage()) console.log(`\n  ${db.firstBootMessage()}`);
    console.log('');
  });
}
