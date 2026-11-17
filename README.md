# All of These and More

A dark, minimalist publishing site for essays and blogs, with an isometric cube catalog.

```bash
npm install
npm run seed     # optional: sample articles + generated cover art
npm run dev      # http://localhost:3000  ·  editor at /admin
```

The first time it starts, the server creates the editor login from `ADMIN_PASSWORD` in `.env`. You can change the password later in **Editor → Settings**.

## Hosting it

The site is a Node server that saves articles, the login and uploaded images to disk. It needs a host that keeps the server running **and** gives it a persistent disk. Render and Railway both work. Vercel and Netlify don't: their servers are short-lived and can't keep files.

In production, set `DATA_DIR` to the persistent disk's path. Everything (the database in `db.json`, the login in `auth.json` and images in `uploads/`) then lives there and survives redeploys.

### Railway

1. **New Project → Deploy from GitHub repo**, then pick this repo. Railway detects Node and runs `npm start`.
2. In the service, open **Settings → Volumes → Add volume** and set the mount path to `/data`.
3. In **Variables**, set `DATA_DIR=/data` and `ADMIN_PASSWORD=<your password>`.
4. In **Settings → Networking**, click **Generate domain**. Your editor is at `https://<domain>/admin`.

### Render

1. **New → Blueprint**, then pick this repo. Render reads `render.yaml`, which sets up a web service with a 1 GB disk at `/var/data`.
2. Enter `ADMIN_PASSWORD` when Render asks for it.

Disks require a paid instance (Starter).

### Notes

- The site starts empty. Write your first piece at `/admin`. If you'd rather start with the sample articles, run `npm run seed` once in the host's shell; both hosts offer one.
- `ADMIN_PASSWORD` is only read on the very first start. After that, change the password in **Editor → Settings**.
- Each deploy restarts the server, so you'll need to sign in to the editor again.
- To move your local articles to the host, copy the contents of `data/` and `public/uploads/` into the volume.

## Where things live

| Path | What |
| --- | --- |
| `server.js` | Express server, API, page rendering, RSS |
| `lib/store.js` | JSON-file storage (`data/db.json`) and password hashing (`data/auth.json`) |
| `lib/markdown.js` | Markdown → article HTML (figures, captions, contents, cube dividers) |
| `views/` | Page templates (home, article, 404) |
| `public/js/home.js` | Cube field, hover preview, filters, index |
| `public/js/article.js` | Reading progress, contents, lightbox, share |
| `public/admin/` | The editor app |
| `public/uploads/` | Images you upload |

## Writing tips (Markdown)

- `## Heading` creates a numbered section and adds it to the contents list.
- `> quote` becomes a large pull quote.
- `![alt](/uploads/x.jpg "Caption")` becomes a wide figure with a caption. Readers can click it to zoom.
- `---` inserts a three-cube section break.
- A future publish date schedules the piece. **Featured** puts it at the centre of the cube field.
