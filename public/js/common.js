/* Shared: top bar state + ⌘K command palette. */
(() => {
  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let articlesPromise = null;
  const getArticles = () => (articlesPromise ??= fetch('/api/articles').then((r) => r.json()));
  window.AOTAM = { esc, getArticles };

  // top bar background once you scroll
  const bar = document.querySelector('.topbar');
  if (bar) {
    const onScroll = () => bar.classList.toggle('is-scrolled', scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------------------- palette */
  const el = document.createElement('div');
  el.className = 'palette';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Search articles');
  el.innerHTML = `
    <div class="palette__box">
      <input class="palette__input" type="search" placeholder="Search the catalog…" autocomplete="off" spellcheck="false" aria-label="Search">
      <ul class="palette__list" role="listbox"></ul>
      <div class="palette__foot meta"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div>
    </div>`;
  document.body.appendChild(el);
  const input = el.querySelector('input');
  const list = el.querySelector('ul');
  let items = [];
  let active = 0;
  let lastFocus = null;

  const score = (a, q) => {
    if (!q) return 1;
    const hay = [a.title, a.dek, a.category, ...(a.tags || [])].join(' ').toLowerCase();
    let s = 0;
    for (const w of q.split(/\s+/)) {
      if (!w) continue;
      const i = hay.indexOf(w);
      if (i < 0) return 0;
      s += a.title.toLowerCase().includes(w) ? 3 : 1;
    }
    return s;
  };

  const highlight = (text, q) => {
    let out = esc(text);
    for (const w of q.split(/\s+/).filter((w) => w.length > 1)) {
      out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
    }
    return out;
  };

  async function render() {
    const q = input.value.trim().toLowerCase();
    const all = await getArticles();
    items = all
      .map((a) => [a, score(a, q)])
      .filter(([, s]) => s > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([a]) => a);
    active = Math.min(active, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items
          .map(
            (a, i) => `<li class="palette__item${i === active ? ' is-active' : ''}" role="option" aria-selected="${i === active}">
          <a href="/article/${esc(a.slug)}">
            <img src="${esc(a.cover)}" alt="">
            <span><span class="meta">${esc(a.category)}</span><br><span class="palette__title">${highlight(a.title, q)}</span></span>
            <span class="meta">${a.readingMinutes} min</span>
          </a></li>`
          )
          .join('')
      : `<li class="palette__empty">Nothing matches “${esc(input.value)}”.</li>`;
  }

  function open() {
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    input.value = '';
    active = 0;
    render();
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    el.classList.remove('is-open');
    lastFocus?.focus?.();
  }
  const move = (d) => {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    [...list.children].forEach((li, i) => {
      li.classList.toggle('is-active', i === active);
      li.setAttribute('aria-selected', i === active);
    });
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    if (e.key === 'Enter' && items[active]) location.href = `/article/${items[active].slug}`;
  });
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('.palette__item');
    if (!li) return;
    const i = [...list.children].indexOf(li);
    if (i !== active) move(i - active);
  });

  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      el.classList.contains('is-open') ? close() : open();
    } else if (e.key === 'Escape' && el.classList.contains('is-open')) close();
  });
  document.querySelectorAll('[data-open-palette]').forEach((b) => b.addEventListener('click', open));
})();
