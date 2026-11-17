# All of These and More

A dark, minimalist publishing site for essays and blogs, with an isometric cube catalog.

```bash
npm install
npm run seed     # optional: sample articles + generated cover art
npm run dev      # http://localhost:3000  ·  editor at /admin
```

Locally it needs no database: everything is saved as files in `data/` and `public/uploads/`. The first time it starts, the server creates the editor login from `ADMIN_PASSWORD` in `.env`. You can change the password later in **Editor → Settings**.

## Hosting it free on Vercel

On your computer the site keeps everything in local files: articles in `data/` and images in `public/uploads/`. On Vercel it runs as a serverless function, which can't keep files. Instead, it uses two free services that you connect from the Vercel dashboard:

| What | Service | Free allowance |
| --- | --- | --- |
| Articles, settings, login | **Neon** Postgres | 1 GB of data and 100 compute-hours a month |
| Images | **Vercel Blob** | 1 GB stored and 10 GB of downloads a month |

The site picks these up automatically from the `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` environment variables. No code changes are needed.

1. **Import the repo.** In Vercel, choose **Add New → Project**, pick this GitHub repo and deploy. Vercel detects Express, so you can leave every build setting empty.
2. **Add the database.** In the project, open **Storage → Create Database** and choose **Neon** (free plan). Connect it to the project for all environments. This sets `DATABASE_URL`.
3. **Add image storage.** Still under **Storage**, choose **Create → Blob**, set access to **Public**, and connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Set your password.** Open **Settings → Environment Variables** and add `ADMIN_PASSWORD`, using at least 8 characters.
5. **Redeploy.** Open **Deployments**, click **⋯** on the latest deployment, then **Redeploy**, so it picks up the new variables. Your editor is at `https://<your-project>.vercel.app/admin`.

The database tables and your login are created on the first visit.

**Optional: load the sample articles into production.** In Vercel, copy the values of `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` from **Settings → Environment Variables** into a local file called `.env.production` (it's gitignored). Then run:

```bash
npm run seed:prod
```

### Good to know

- **Photos are shrunk in the browser before upload.** The editor resizes them to 2400 px on the long edge and saves them as WebP, about 300–600 KB each. That keeps uploads under Vercel's 4.5 MB request limit and fits roughly 2,000 photos in the free 1 GB. GIFs are uploaded unchanged, up to 4 MB.
- **The first visit after a quiet spell is slower.** Neon pauses the database when nobody is visiting, so that first page takes about a second longer.
- **Free limits pause the service; they don't bill you.** If you ever go over a limit, uploads (Blob) or new writes (Neon) stop until the month resets. Vercel emails you as you get close.
- **You stay signed in across deploys.** Sessions are signed cookies, so a deploy doesn't log you out. Changing your password signs out every other device.
- **`ADMIN_PASSWORD` is only read on the very first start.** After that, change the password in **Editor → Settings**.

The server still runs on any host with a persistent disk, such as Railway or Render. Leave the two variables unset and point `DATA_DIR` at the disk.

## Where things live

| Path | What |
| --- | --- |
| `server.js` | Express server, API, page rendering, RSS |
| `lib/store.js` | Articles, settings, login and sessions; picks the storage backend |
| `lib/drivers/` | `file.js` (local JSON in `data/`) and `postgres.js` (Neon) |
| `lib/media.js` | Image storage: Vercel Blob or local `public/uploads/` |
| `lib/markdown.js` | Markdown → article HTML (figures, captions, contents, cube dividers) |
| `views/` | Page templates (home, article, 404) |
| `public/js/home.js` | Cube field, hover preview, filters, index |
| `public/js/article.js` | Reading progress, contents, lightbox, share |
| `public/admin/` | The editor app |
| `public/uploads/` | Images you upload while running locally |

## Writing tips (Markdown)

- `## Heading` creates a numbered section and adds it to the contents list.
- `> quote` becomes a large pull quote.
- `![alt](/uploads/x.jpg "Caption")` becomes a wide figure with a caption. Readers can click it to zoom.
- `---` inserts a three-cube section break.
- A future publish date schedules the piece. **Featured** puts it at the centre of the cube field.
