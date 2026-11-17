# All of These and More

A dark, minimalist publishing site for essays and blogs, with an isometric cube catalog.

```bash
npm install
npm run seed     # optional: sample articles + generated cover art
npm run dev      # http://localhost:3000  ·  editor at /admin
```

The first time it starts, the server creates the editor login from `ADMIN_PASSWORD` in `.env`. You can change the password later in **Editor → Settings**.

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
