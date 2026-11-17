/* The Editor — a small hash-routed app: #/articles, #/new, #/edit/:id, #/settings */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const view = $('#view');
  let site = null;
  let leaveGuard = null; // returns true if it's OK to leave the current view

  /* ------------------------------------------------------------ api */
  async function api(path, opts = {}) {
    const init = { ...opts, headers: { ...(opts.headers || {}) } };
    if (opts.body && !(opts.body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith('/login')) {
      showLogin();
      throw new Error('Signed out');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    return (await api('/api/admin/upload', { method: 'POST', body: fd })).url;
  }

  function toast(msg, kind = 'ok') {
    const t = document.createElement('div');
    t.className = `toast toast--${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function confirmBox(title, text, okLabel = 'Delete') {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'confirm';
      d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row-btns">
        <button class="btn btn--ghost" value="no">Cancel</button><button class="btn btn--danger" value="yes">${esc(okLabel)}</button></div>`;
      document.body.appendChild(d);
      d.addEventListener('click', (e) => {
        const v = e.target.closest('button')?.value;
        if (v || e.target === d) { d.close(); d.remove(); resolve(v === 'yes'); }
      });
      d.showModal();
    });
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const toLocalInput = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };

  /* ------------------------------------------------------------ auth */
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    setTimeout(() => $('#pw').focus(), 50);
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      $('#pw').value = '';
      start();
    } catch (err) {
      $('#loginErr').textContent = err.message;
      const box = $('#loginForm');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    }
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  async function start() {
    site = await api('/api/site');
    document.documentElement.style.setProperty('--accent', site.accent);
    $('#login').hidden = true;
    $('#app').hidden = false;
    route();
  }

  /* ------------------------------------------------------------ router */
  let currentHash = location.hash;
  addEventListener('hashchange', () => {
    if (leaveGuard && !leaveGuard()) {
      history.replaceState(null, '', currentHash);
      return;
    }
    route();
  });
  addEventListener('beforeunload', (e) => {
    if (leaveGuard && !leaveGuard(true)) e.preventDefault();
  });

  function route() {
    currentHash = location.hash || '#/articles';
    leaveGuard = null;
    const [, page, id] = currentHash.split('/');
    $$('.side__nav a').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === (page === 'edit' ? 'articles' : page || 'articles')));
    view.style.animation = 'none';
    void view.offsetWidth;
    view.style.animation = '';
    scrollTo(0, 0);
    if (page === 'new') return editor(null);
    if (page === 'edit' && id) return editor(id);
    if (page === 'settings') return settingsView();
    return articlesView();
  }

  /* ------------------------------------------------------------ articles */
  async function articlesView() {
    document.title = 'Articles — Editor';
    view.innerHTML = '<p class="meta">Loading…</p>';
    const list = await api('/api/admin/articles');
    const now = Date.now();
    const statusOf = (a) => (a.status !== 'published' ? 'draft' : new Date(a.publishedAt) > now ? 'scheduled' : 'live');
    const counts = { live: 0, draft: 0, scheduled: 0 };
    list.forEach((a) => counts[statusOf(a)]++);
    const views = list.reduce((n, a) => n + (a.views || 0), 0);
    let filter = 'all';
    let q = '';

    view.innerHTML = `
      <header class="page-head">
        <h1>Articles</h1>
        <a class="btn btn--accent" href="#/new">+ New article</a>
      </header>
      <div class="stats">
        <div class="stat"><span class="meta">Published</span><b>${counts.live}</b></div>
        <div class="stat"><span class="meta">Drafts</span><b>${counts.draft}</b></div>
        <div class="stat"><span class="meta">Scheduled</span><b>${counts.scheduled}</b></div>
        <div class="stat"><span class="meta">Total reads</span><b>${views.toLocaleString()}</b></div>
      </div>
      <div class="toolbar-row">
        <input type="search" placeholder="Search titles, categories…" id="q">
        <div class="seg" id="seg">
          <button class="is-on" data-f="all">All</button><button data-f="live">Published</button>
          <button data-f="draft">Drafts</button><button data-f="scheduled">Scheduled</button>
        </div>
      </div>
      <ul class="alist" id="alist"></ul>`;

    const paint = () => {
      const rows = list.filter(
        (a) => (filter === 'all' || statusOf(a) === filter) && (!q || `${a.title} ${a.category} ${a.tags.join(' ')}`.toLowerCase().includes(q))
      );
      $('#alist').innerHTML = rows.length
        ? rows
            .map((a) => {
              const st = statusOf(a);
              return `<li class="aitem" data-id="${a.id}">
                ${a.cover ? `<img class="aitem__thumb" src="${esc(a.cover)}" alt="">` : '<span class="aitem__thumb"></span>'}
                <div style="min-width:0"><a class="aitem__title" href="#/edit/${a.id}">${esc(a.title)}</a><span class="aitem__slug">/${esc(a.slug)}</span></div>
                <span class="meta c-cat">${esc(a.category)}</span>
                <span class="pill pill--${st} c-status">${st === 'live' ? 'Published' : st}</span>
                <span class="meta c-date">${fmtDate(st === 'draft' ? a.updatedAt : a.publishedAt)}</span>
                <span class="meta c-views" title="Reads">${a.views || 0}</span>
                <div class="aitem__actions">
                  <a class="btn btn--ghost btn--sm" href="#/edit/${a.id}">Edit</a>
                  ${a.live ? `<a class="btn btn--ghost btn--sm" href="/article/${esc(a.slug)}" target="_blank" rel="noopener">View ↗</a>` : ''}
                  <button class="btn btn--ghost btn--sm" data-del="${a.id}" aria-label="Delete">✕</button>
                </div></li>`;
            })
            .join('')
        : list.length
          ? '<li class="empty">Nothing matches.</li>'
          : '<li class="empty"><h2>A blank catalog.</h2><p>Write your first piece — it becomes the first cube on the home page.</p><p><a class="btn btn--accent" href="#/new">Start writing</a></p></li>';
    };
    paint();

    $('#q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); paint(); });
    $('#seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      filter = b.dataset.f;
      $$('#seg button').forEach((x) => x.classList.toggle('is-on', x === b));
      paint();
    });
    $('#alist').addEventListener('click', async (e) => {
      const id = e.target.closest('[data-del]')?.dataset.del;
      if (!id) return;
      const a = list.find((x) => x.id === id);
      if (!(await confirmBox('Delete this piece?', `“${a.title}” will be removed for good. Its uploaded images stay in /uploads.`))) return;
      await api(`/api/admin/articles/${id}`, { method: 'DELETE' });
      list.splice(list.indexOf(a), 1);
      toast('Deleted');
      paint();
    });
  }

  /* ------------------------------------------------------------ editor */
  async function editor(id) {
    document.title = `${id ? 'Edit' : 'New'} — Editor`;
    view.innerHTML = '<p class="meta">Loading…</p>';
    const [art, all] = await Promise.all([id ? api(`/api/admin/articles/${id}`) : null, api('/api/admin/articles')]);
    const cats = [...new Set(['Essay', 'Blog', 'Notes', 'Photo story', ...all.map((a) => a.category)])];
    const a = art || { title: '', dek: '', body: '', category: 'Essay', tags: [], cover: '', coverAlt: '', featured: false, status: 'draft', slug: '', publishedAt: null };
    const draftKey = `aotam-draft-${id || 'new'}`;
    let mode = localStorage.getItem('aotam-mode') || 'split';
    let dirty = false;
    let savedAt = art ? new Date(art.updatedAt) : null;

    view.innerHTML = `
      <div class="ed-bar">
        <a class="btn btn--ghost btn--sm" href="#/articles">← Articles</a>
        <span class="ed-state" id="state"></span>
        <span class="spacer"></span>
        ${art?.status === 'published' ? `<a class="btn btn--ghost btn--sm" href="/article/${esc(a.slug)}" target="_blank" rel="noopener">View ↗</a>` : ''}
        <button class="btn btn--sm" id="saveDraft"></button>
        <button class="btn btn--accent btn--sm" id="publish"></button>
      </div>
      <div id="restoreSlot"></div>
      <div class="ed">
        <div>
          <textarea class="ed__title" id="title" rows="1" placeholder="Title">${esc(a.title)}</textarea>
          <textarea class="ed__dek" id="dek" rows="1" placeholder="A one-line standfirst (shows in previews)">${esc(a.dek)}</textarea>

          <div class="mdbar" id="mdbar">
            <button data-md="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button data-md="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <span class="sep"></span>
            <button data-md="h2" title="Section heading">H2</button>
            <button data-md="h3" title="Sub-heading">H3</button>
            <button data-md="quote" title="Pull quote">❝</button>
            <button data-md="list" title="List">•</button>
            <button data-md="link" title="Link">↗</button>
            <button data-md="code" title="Code">{ }</button>
            <button data-md="hr" title="Section break (cubes)">◆◆◆</button>
            <span class="sep"></span>
            <button data-md="image" title="Insert image (or drop/paste one)">▣ Image</button>
            <div class="seg" id="mode">
              <button data-mode="write">Write</button><button data-mode="split">Split</button><button data-mode="preview">Preview</button>
            </div>
          </div>
          <div class="panes" id="panes">
            <div class="pane-write" id="paneWrite"><textarea id="body" spellcheck="true" placeholder="Write in Markdown. Drop or paste images right here.&#10;&#10;## A section&#10;&#10;> A line worth pulling out.&#10;&#10;![alt text](/uploads/photo.jpg &quot;A caption under the photo&quot;)">${esc(a.body)}</textarea></div>
            <div class="pane-preview"><div class="prose" id="preview"></div></div>
          </div>
          <div class="ed__counts meta"><span id="words"></span><span id="mins"></span></div>
        </div>

        <aside class="ed__side">
          <div class="card">
            <h3>Cover</h3>
            <div class="drop" id="cover" tabindex="0" role="button" aria-label="Upload cover image"></div>
            <label class="field"><span>Alt text</span><input id="coverAlt" value="${esc(a.coverAlt)}" placeholder="Describe the picture"></label>
          </div>
          <div class="card">
            <h3>Details</h3>
            <label class="field"><span>Category</span><input id="category" list="cats" value="${esc(a.category)}"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
            <label class="field"><span>Tags</span><input id="tags" value="${esc(a.tags.join(', '))}" placeholder="memory, cities, film"></label>
            <label class="field"><span>URL slug</span><input id="slug" value="${esc(a.slug)}" placeholder="auto from title"></label>
            <label class="field"><span>Publish date</span><input id="publishedAt" type="datetime-local" value="${toLocalInput(a.publishedAt)}"><span class="hint" id="schedHint"></span></label>
            <label class="toggle"><span>Featured — sits at the heart of the cube field</span><input type="checkbox" id="featured" ${a.featured ? 'checked' : ''}><i></i></label>
          </div>
          ${art ? `<div class="card"><h3>Danger zone</h3>
            ${art.status === 'published' ? '<button class="btn btn--sm" id="unpublish">Unpublish (back to draft)</button>' : ''}
            <button class="btn btn--danger btn--sm" id="delete">Delete article</button></div>` : ''}
        </aside>
      </div>`;

    const f = {
      title: $('#title'), dek: $('#dek'), body: $('#body'), category: $('#category'), tags: $('#tags'),
      slug: $('#slug'), publishedAt: $('#publishedAt'), featured: $('#featured'), coverAlt: $('#coverAlt'),
    };
    let cover = a.cover;
    let status = a.status;

    const collect = () => ({
      title: f.title.value, dek: f.dek.value, body: f.body.value, category: f.category.value, tags: f.tags.value,
      slug: f.slug.value, publishedAt: new Date(f.publishedAt.value).toISOString(), featured: f.featured.checked,
      cover, coverAlt: f.coverAlt.value,
    });

    /* state + buttons */
    const paintState = () => {
      const st = $('#state');
      st.classList.toggle('is-dirty', dirty);
      st.textContent = dirty ? '● Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'New draft';
      const future = new Date(f.publishedAt.value) > new Date();
      $('#saveDraft').textContent = status === 'published' ? 'Save' : 'Save draft';
      $('#publish').textContent = status === 'published' ? 'Update' : future ? 'Schedule' : 'Publish';
      $('#schedHint').textContent = future ? 'In the future — it will go live then.' : '';
    };
    const markDirty = () => {
      dirty = true;
      paintState();
      try { localStorage.setItem(draftKey, JSON.stringify({ ...collect(), at: Date.now() })); } catch {}
    };
    leaveGuard = (silent) => !dirty || (silent ? false : confirm('You have unsaved changes. Leave anyway?'));

    /* cover */
    const paintCover = () => {
      $('#cover').innerHTML = cover
        ? `<img src="${esc(cover)}" alt=""><button class="drop__x" type="button" aria-label="Remove cover">✕</button>`
        : '<span>Drop a cover image<br>or click to choose</span>';
    };
    paintCover();
    const setCoverFile = async (file) => {
      const d = $('#cover');
      d.classList.add('is-busy');
      try { cover = await uploadImage(file); paintCover(); markDirty(); renderPreview(); }
      catch (err) { toast(err.message, 'err'); }
      finally { d.classList.remove('is-busy'); }
    };
    $('#cover').addEventListener('click', (e) => {
      if (e.target.closest('.drop__x')) { cover = ''; paintCover(); markDirty(); renderPreview(); return; }
      pickFile(setCoverFile);
    });
    $('#cover').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickFile(setCoverFile)));
    dropZone($('#cover'), setCoverFile);

    /* text inputs */
    [f.title, f.dek].forEach((t) => { autosize(t); t.addEventListener('input', () => autosize(t)); });
    f.title.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), f.dek.focus()));
    f.dek.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), f.body.focus()));
    Object.values(f).forEach((el) => el.addEventListener('input', markDirty));
    f.featured.addEventListener('change', markDirty);
    f.publishedAt.addEventListener('change', paintState);

    /* preview */
    let pt;
    async function renderPreview() {
      clearTimeout(pt);
      pt = setTimeout(async () => {
        if (mode === 'write') return;
        const { html } = await api('/api/admin/preview', { method: 'POST', body: { body: f.body.value } });
        $('#preview').innerHTML = html || '<p style="color:var(--dim)">Nothing to preview yet.</p>';
      }, 250);
      const words = f.body.value.split(/\s+/).filter(Boolean).length;
      $('#words').textContent = `${words.toLocaleString()} words`;
      $('#mins').textContent = `${Math.max(1, Math.round(words / 230))} min read`;
    }
    f.body.addEventListener('input', renderPreview);

    const setMode = (m) => {
      mode = m;
      localStorage.setItem('aotam-mode', m);
      $('#panes').className = `panes is-${m}`;
      $$('#mode button').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === m));
      renderPreview();
    };
    $('#mode').addEventListener('click', (e) => e.target.dataset.mode && setMode(e.target.dataset.mode));
    setMode(innerWidth < 900 && mode === 'split' ? 'write' : mode);

    /* markdown helpers */
    const ta = f.body;
    function wrapSel(before, after = before, placeholder = '') {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || placeholder;
      ta.setRangeText(before + sel + after, s, e, 'end');
      if (!value.slice(s, e)) ta.setSelectionRange(s + before.length, s + before.length + sel.length);
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    }
    function linePrefix(prefix) {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(ls, e).split('\n').map((l) => prefix + l.replace(/^(#{1,6} |> |- )/, '')).join('\n');
      ta.setRangeText(block, ls, e, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    }
    function insertBlock(text) {
      const { selectionStart: s, value } = ta;
      const pre = s > 0 && value[s - 1] !== '\n' ? '\n\n' : s > 1 && value[s - 2] !== '\n' ? '\n' : '';
      ta.setRangeText(`${pre}${text}\n\n`, s, ta.selectionEnd, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    }
    async function insertImage(file) {
      const token = `![Uploading ${file.name}…]()`;
      insertBlock(token);
      try {
        const url = await uploadImage(file);
        ta.value = ta.value.replace(token, `![${file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')}](${url} "Caption")`);
      } catch (err) {
        ta.value = ta.value.replace(token, '');
        toast(err.message, 'err');
      }
      ta.dispatchEvent(new Event('input'));
    }
    const actions = {
      bold: () => wrapSel('**', '**', 'bold'),
      italic: () => wrapSel('*', '*', 'italic'),
      h2: () => linePrefix('## '),
      h3: () => linePrefix('### '),
      quote: () => linePrefix('> '),
      list: () => linePrefix('- '),
      link: () => wrapSel('[', '](https://)', 'link text'),
      code: () => wrapSel('`', '`', 'code'),
      hr: () => insertBlock('---'),
      image: () => pickFile(insertImage),
    };
    $('#mdbar').addEventListener('click', (e) => {
      const k = e.target.closest('[data-md]')?.dataset.md;
      if (k) actions[k]();
    });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); actions.bold(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); actions.italic(); }
    });
    ta.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (file) { e.preventDefault(); insertImage(file); }
    });
    dropZone($('#paneWrite'), insertImage);

    /* save */
    async function save(nextStatus) {
      const data = { ...collect(), status: nextStatus };
      if (!data.title.trim()) { toast('Give it a title first', 'err'); f.title.focus(); return; }
      $('#publish').disabled = $('#saveDraft').disabled = true;
      try {
        const saved = await api(id ? `/api/admin/articles/${id}` : '/api/admin/articles', { method: id ? 'PUT' : 'POST', body: data });
        dirty = false;
        status = saved.status;
        savedAt = new Date(saved.updatedAt);
        f.slug.value = saved.slug;
        localStorage.removeItem(draftKey);
        const future = new Date(saved.publishedAt) > new Date();
        toast(saved.status === 'published' ? (future ? 'Scheduled ✓' : 'Published ✓ — it’s on the home page') : 'Draft saved');
        if (!id) { leaveGuard = null; location.hash = `#/edit/${saved.id}`; return; }
        paintState();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        $('#publish').disabled = $('#saveDraft').disabled = false;
      }
    }
    $('#saveDraft').addEventListener('click', () => save(status === 'published' ? 'published' : 'draft'));
    $('#publish').addEventListener('click', () => save('published'));
    view.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(status); }
    });
    $('#unpublish')?.addEventListener('click', () => save('draft'));
    $('#delete')?.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this piece?', `“${a.title}” will be removed for good.`))) return;
      await api(`/api/admin/articles/${id}`, { method: 'DELETE' });
      dirty = false;
      localStorage.removeItem(draftKey);
      toast('Deleted');
      location.hash = '#/articles';
    });

    /* offer to restore an unsaved local draft */
    try {
      const local = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (local && (!art || local.at > new Date(art.updatedAt).getTime()) && (local.body !== a.body || local.title !== a.title)) {
        $('#restoreSlot').innerHTML = `<div class="restore"><span>There’s an unsaved version of this from ${new Date(local.at).toLocaleString()}.</span>
          <button class="btn btn--sm" id="rs">Restore it</button><button class="btn btn--ghost btn--sm" id="rd">Discard</button></div>`;
        $('#rs').onclick = () => {
          for (const k of ['title', 'dek', 'body', 'category', 'tags', 'slug', 'coverAlt']) f[k].value = local[k] ?? '';
          f.featured.checked = !!local.featured;
          if (local.publishedAt) f.publishedAt.value = toLocalInput(local.publishedAt);
          cover = local.cover || '';
          paintCover();
          [f.title, f.dek].forEach(autosize);
          $('#restoreSlot').innerHTML = '';
          markDirty();
          renderPreview();
        };
        $('#rd').onclick = () => { localStorage.removeItem(draftKey); $('#restoreSlot').innerHTML = ''; };
      }
    } catch {}

    paintState();
    renderPreview();
    if (!id) f.title.focus();
  }

  /* ------------------------------------------------------------ settings */
  function settingsView() {
    document.title = 'Settings — Editor';
    const swatches = ['#d7ff3a', '#ff5c39', '#7cf2c8', '#9d8cff', '#ffd23f', '#f2f0ea'];
    view.innerHTML = `
      <header class="page-head"><h1>Settings</h1></header>
      <form class="settings" id="sForm">
        <div class="card">
          <h3>Publication</h3>
          <label class="field"><span>Title</span><input name="title" value="${esc(site.title)}"></label>
          <label class="field"><span>Tagline</span><input name="tagline" value="${esc(site.tagline)}"></label>
          <label class="field"><span>Author</span><input name="author" value="${esc(site.author)}"></label>
          <label class="field"><span>About (home page)</span><textarea name="about" rows="4">${esc(site.about)}</textarea></label>
          <label class="field"><span>Accent colour</span>
            <div class="color-row"><input type="color" name="accent" value="${esc(site.accent)}">
              <div class="swatches">${swatches.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
          </label>
          <div><button class="btn btn--accent" type="submit">Save settings</button></div>
        </div>
      </form>
      <form class="settings" id="pForm" style="margin-top:24px">
        <div class="card">
          <h3>Password</h3>
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
          <div><button class="btn" type="submit">Change password</button></div>
        </div>
      </form>`;

    const form = $('#sForm');
    const accent = form.elements.accent;
    const live = () => document.documentElement.style.setProperty('--accent', accent.value);
    accent.addEventListener('input', live);
    $('.swatches', form).addEventListener('click', (e) => { if (e.target.dataset.c) { accent.value = e.target.dataset.c; live(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        site = await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
        toast('Settings saved');
      } catch (err) { toast(err.message, 'err'); }
    });
    $('#pForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
        e.target.reset();
        toast('Password changed');
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ------------------------------------------------------------ files */
  function pickFile(cb) {
    const input = $('#filePick');
    input.value = '';
    input.onchange = () => input.files[0] && cb(input.files[0]);
    input.click();
  }
  function dropZone(el, cb) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('is-drop');
      const file = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
      if (file) cb(file);
    });
  }

  /* ------------------------------------------------------------ boot */
  api('/api/admin/me').then((r) => (r.signedIn ? start() : showLogin()));
})();
