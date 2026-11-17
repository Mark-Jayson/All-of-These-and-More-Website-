// Postgres storage (Neon on Vercel). Each article is one JSONB row, so the shape
// matches the local file store exactly. Settings and the login live in a small kv table.

/** @param {(text: string, params?: unknown[]) => Promise<any[]>} query */
export function createPgDriver(query) {
  let schema = null;

  return {
    name: 'postgres',
    ready() {
      schema ||= (async () => {
        await query(`CREATE TABLE IF NOT EXISTS articles (id text PRIMARY KEY, data jsonb NOT NULL)`);
        await query(`CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL)`);
      })().catch((e) => {
        schema = null; // retry on the next request instead of caching the failure
        throw e;
      });
      return schema;
    },
    async all() {
      return (await query(`SELECT data FROM articles`)).map((r) => r.data);
    },
    async get(id) {
      return (await query(`SELECT data FROM articles WHERE id = $1`, [id]))[0]?.data || null;
    },
    async put(article) {
      await query(
        `INSERT INTO articles (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data || jsonb_build_object('views', COALESCE(articles.data->'views', '0'::jsonb))`,
        [article.id, JSON.stringify(article)]
      );
    },
    async remove(id) {
      return (await query(`DELETE FROM articles WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
    async addView(id) {
      await query(
        `UPDATE articles SET data = jsonb_set(data, '{views}', to_jsonb(COALESCE((data->>'views')::int, 0) + 1)) WHERE id = $1`,
        [id]
      );
    },
    async replaceAll(articles) {
      await query(`DELETE FROM articles`);
      for (const a of articles) {
        await query(`INSERT INTO articles (id, data) VALUES ($1, $2::jsonb)`, [a.id, JSON.stringify(a)]);
      }
    },
    async getKV(key) {
      return (await query(`SELECT value FROM kv WHERE key = $1`, [key]))[0]?.value ?? null;
    },
    async setKV(key, value) {
      await query(
        `INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)]
      );
    },
    async addKVIfMissing(key, value) {
      const rows = await query(
        `INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key`,
        [key, JSON.stringify(value)]
      );
      return rows.length > 0;
    },
    async deleteKV(key) {
      await query(`DELETE FROM kv WHERE key = $1`, [key]);
    },
  };
}

export async function neonDriver(url) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return createPgDriver((text, params = []) => sql.query(text, params));
}
