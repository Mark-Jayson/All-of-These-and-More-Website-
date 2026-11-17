// Local JSON-file storage — used when no database URL is set (your own computer).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../paths.js';

const DB_FILE = path.join(DATA_DIR, 'db.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json'); // kept separate so db.json is safe to share

let state = null;

function load() {
  if (state) return state;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  state = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { kv: {}, articles: [] };
  state.kv ||= {};
  if (state.settings) {
    // older db.json kept settings at the top level
    state.kv.settings = { ...state.settings, ...state.kv.settings };
    delete state.settings;
  }
  if (fs.existsSync(AUTH_FILE)) state.kv.auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  return state;
}

function persist() {
  const { auth, ...kv } = state.kv;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ kv, articles: state.articles }, null, 2));
  fs.renameSync(tmp, DB_FILE);
  if (auth) fs.writeFileSync(AUTH_FILE, JSON.stringify(auth));
}

let viewTimer = null;
const persistSoon = () => {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(persist, 2000);
};

const clone = (x) => (x == null ? x : structuredClone(x));

export default {
  name: 'file',
  async ready() {
    load();
  },
  async all() {
    return clone(load().articles);
  },
  async get(id) {
    return clone(load().articles.find((a) => a.id === id)) || null;
  },
  async put(article) {
    const list = load().articles;
    const i = list.findIndex((a) => a.id === article.id);
    if (i < 0) list.push(clone(article));
    else list[i] = clone(article);
    persist();
  },
  async remove(id) {
    const list = load().articles;
    const i = list.findIndex((a) => a.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    persist();
    return true;
  },
  async addView(id) {
    const a = load().articles.find((x) => x.id === id);
    if (!a) return;
    a.views = (a.views || 0) + 1;
    persistSoon();
  },
  async replaceAll(articles) {
    load().articles = clone(articles);
    persist();
  },
  async getKV(key) {
    return clone(load().kv[key]) ?? null;
  },
  async setKV(key, value) {
    load().kv[key] = clone(value);
    persist();
  },
  async addKVIfMissing(key, value) {
    if (load().kv[key] != null) return false;
    await this.setKV(key, value);
    return true;
  },
  async deleteKV(key) {
    delete load().kv[key];
    persist();
  },
};
