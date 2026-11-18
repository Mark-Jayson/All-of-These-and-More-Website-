/* Home — builds the isometric cube field, hover previews, filters and the index. */
(async () => {
  const { esc, getArticles } = window.AOTAM;
  const $ = (s, r = document) => r.querySelector(s);
  const SQ3 = Math.sqrt(3);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none)').matches;
  const PATTERNS = ['stripes', 'dots', 'diag', 'grid', 'rings', 'check', 'hlines', 'fan'];

  const field = $('#field');
  const wrap = $('#fieldWrap');
  const gridLayer = $('#fieldGrid');
  const preview = $('#preview');

  // deterministic noise so the layout doesn't reshuffle on every visit
  const rand = (a, b) => {
    let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

  splitTitle();

  const all = await getArticles();
  // featured pieces sit at the heart of the cluster, then newest outward
  const ordered = [...all].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const numberOf = new Map(all.map((a, i) => [a.id, String(all.length - i).padStart(2, '0')]));
  const categories = [...new Set(all.map((a) => a.category))];
  const patternOf = (cat) => PATTERNS[hashStr(cat) % PATTERNS.length];
  let filter = null;


  /* ================================================================ title */
  function splitTitle() {
    const h = $('[data-split]');
    const words = h.textContent.trim().split(/\s+/);
    const andAt = words.findIndex((w, i) => i > 0 && w.toLowerCase() === 'and');
    h.setAttribute('aria-label', h.textContent.trim());
    h.innerHTML = words
      .map((w, i) => {
        const br = i === andAt ? '<br>' : '';
        const it = andAt > 0 && i >= andAt ? ' is-italic' : '';
        return `${br}<span class="split-word${it}" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`;
      })
      .join(' ');
    document.querySelectorAll('.stage__kicker, .stage__tagline, .stage__count, .filters, .scroll-cue, .stage__side').forEach((el, i) => {
      el.classList.add('fade-in');
      el.style.setProperty('--d', `${450 + i * 90}ms`);
      // drop the one-off entrance so later transitions (title ⇄ preview) can move it
      el.addEventListener('animationend', () => el.classList.remove('fade-in'), { once: true });
    });
    const spans = h.querySelectorAll('.split-word > span');
    const done = () => h.classList.add('is-ready');
    if (reduced || !spans.length) done();
    else spans[spans.length - 1].addEventListener('animationend', done, { once: true });
  }

  // split a title into words that can rise in one by one
  const splitWords = (text) =>
    text
      .trim()
      .split(/\s+/)
      .map((w, i) => `<span class="split-word"><span style="--i:${i}">${esc(w)}</span></span>`)
      .join(' ');

  /* ================================================================ layout */
  function cubeSize() {
    const w = wrap.clientWidth;
    if (innerWidth < 600) return 50;
    if (innerWidth < 1000) return 64;
    // fit the cluster into roughly the visible area
    const h = innerHeight - 170;
    const total = all.length * 1.55 + 6;
    const s = Math.sqrt(((Math.PI / 4) * w * h) / (total * 2.598));
    return Math.max(52, Math.min(112, s));
  }

  function layout(animate, sizeOverride, pass = 0) {
    const s = sizeOverride || cubeSize();
    const W = s * SQ3;
    const rowH = s * 1.5;
    const N = ordered.length;
    const maxW = wrap.clientWidth;
    const tail = Math.max(8, Math.round(N * 0.55));
    const total = N + Math.round(N * 0.2) + tail;

    // ellipse that holds the cluster
    const area = total * W * rowH;
    const k = innerWidth < 1000 ? 0.9 : Math.max(0.8, Math.min(1.6, maxW / (innerHeight - 170)));
    let a = Math.sqrt((area * k) / Math.PI);
    let b = a / k;
    if (a > maxW / 2 - W / 2) {
      a = Math.max(W, maxW / 2 - W / 2);
      b = area / (Math.PI * a);
    }

    const R = Math.ceil(b / rowH) + 4;
    const C = Math.ceil(a / W) + 4;
    const cells = [];
    for (let r = -R; r <= R; r++) {
      for (let c = -C; c <= C; c++) {
        const x = W * (c + ((r & 1) ? 0.5 : 0));
        const y = rowH * r;
        if (Math.abs(x) + W / 2 > maxW / 2 + 1) continue;
        const d = (x / a) ** 2 + (y / b) ** 2 + rand(r + 99, c + 99) * 0.55;
        cells.push({ r, c, x, y, d });
      }
    }
    cells.sort((p, q) => p.d - q.d);

    // assign roles: articles with a few decorative blocks mixed in, then a ghost fringe
    const slots = [];
    let ai = 0;
    for (const cell of cells) {
      if (slots.length >= total) break;
      const roll = rand(cell.r, cell.c);
      if (ai < N) {
        if (slots.length > 0 && roll < 0.17) slots.push({ ...cell, kind: roll < 0.025 ? 'accent' : 'deco' });
        else slots.push({ ...cell, kind: 'article', article: ordered[ai++] });
      } else {
        slots.push({ ...cell, kind: roll < 0.22 ? 'deco' : roll < 0.24 ? 'accent' : 'ghost' });
      }
    }

    const minX = Math.min(...slots.map((p) => p.x)) - W / 2;
    const maxX = Math.max(...slots.map((p) => p.x)) + W / 2;
    const minY = Math.min(...slots.map((p) => p.y)) - s;
    const maxY = Math.max(...slots.map((p) => p.y)) + s;

    // desktop: shrink until the whole cluster fits on one screen
    const maxH = innerHeight - 150;
    if (innerWidth >= 1000 && pass < 3 && maxY - minY > maxH && s > 46) {
      return layout(animate, Math.max(46, s * (maxH / (maxY - minY)) * 0.98), pass + 1);
    }

    field.style.setProperty('--s', `${s}px`);
    field.style.width = `${maxX - minX}px`;
    field.style.height = `${maxY - minY}px`;

    const order = [...slots].sort((p, q) => Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y));
    field.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const p of slots) {
      const el = cubeEl(p);
      el.style.left = `${p.x - W / 2 - minX}px`;
      el.style.top = `${p.y - s - minY}px`;
      if (animate && !reduced) {
        el.classList.add('is-entering');
        setTimeout(() => el.classList.remove('is-entering'), 350 + order.indexOf(p) * 26);
      }
      frag.appendChild(el);
    }
    field.appendChild(frag);

    applyFilter();
    drawGrid(s, minX, minY);
  }

  const hexPoly = (s) => {
    const W = s * SQ3;
    return `${W / 2},0 ${W},${s / 2} ${W},${s * 1.5} ${W / 2},${s * 2} 0,${s * 1.5} 0,${s / 2}`;
  };
  const hexLines = (s, cx = (s * SQ3) / 2, cy = s) => {
    const h = (s * SQ3) / 2;
    const P = [[cx, cy - s], [cx + h, cy - s / 2], [cx + h, cy + s / 2], [cx, cy + s], [cx - h, cy + s / 2], [cx - h, cy - s / 2]];
    const ring = `M${P.map((q) => q.join(',')).join('L')}Z`;
    return `${ring} M${cx},${cy}L${P[5].join(',')} M${cx},${cy}L${P[1].join(',')} M${cx},${cy}L${P[3].join(',')}`;
  };

  function cubeEl(p) {
    const s = parseFloat(field.style.getPropertyValue('--s')) || 84;
    const W = s * SQ3;
    const socket = `<svg class="cube__socket" viewBox="0 0 ${W} ${2 * s}" aria-hidden="true"><path pathLength="1" d="${hexLines(s)}"/><polygon points="${hexPoly(s)}"/></svg>`;

    if (p.kind === 'ghost') {
      const el = document.createElement('div');
      el.className = 'cube is-ghost';
      el.innerHTML = socket;
      return el;
    }
    if (p.kind !== 'article') {
      const el = document.createElement('div');
      el.className = `cube is-deco${p.kind === 'accent' ? ' is-accent' : ''}`;
      const pat = PATTERNS[Math.floor(rand(p.c, p.r) * PATTERNS.length)];
      const pat2 = PATTERNS[Math.floor(rand(p.r, p.c + 7) * PATTERNS.length)];
      el.innerHTML = `${socket}<div class="cube__body">
        <div class="f f--top">${rand(p.r, p.c + 3) < 0.4 ? `<i class="pat pat--${pat2}"></i>` : ''}</div>
        <div class="f f--left"><i class="pat pat--${pat}"></i></div>
        <div class="f f--right">${rand(p.r + 3, p.c) < 0.5 ? `<i class="pat pat--${pat2}"></i>` : ''}</div></div>`;
      return el;
    }

    const a = p.article;
    const el = document.createElement('a');
    el.className = 'cube is-article';
    el.href = `/article/${a.slug}`;
    el.dataset.id = a.id;
    el.dataset.cat = a.category;
    el.setAttribute('aria-label', `${a.title} — ${a.category}, ${a.readingMinutes} minute read`);
    el.innerHTML = `${socket}<div class="cube__body">
      <div class="f f--top"><b>${numberOf.get(a.id)}</b><small>${a.featured ? '★' : ''}</small></div>
      <div class="f f--left"><img src="${esc(a.cover)}" alt="" loading="lazy" decoding="async" draggable="false"></div>
      <div class="f f--right"><i class="pat pat--${patternOf(a.category)}"></i><span>${esc(a.category)}</span></div>
    </div>`;
    return el;
  }

  // faint isometric lattice behind the cluster, aligned with the cubes
  function drawGrid(s, minX, minY) {
    const W = s * SQ3;
    const h = 3 * s;
    const centers = [[W / 2, s], [0, 2.5 * s], [W, 2.5 * s], [0, -0.5 * s], [W, -0.5 * s], [W / 2, 4 * s]];
    const d = centers.map(([x, y]) => hexLines(s, x, y)).join(' ');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${h}'><path d='${d}' fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='1'/></svg>`;
    gridLayer.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    gridLayer.style.backgroundSize = `${W}px ${h}px`;
    requestAnimationFrame(() => {
      const fr = field.getBoundingClientRect();
      const gr = gridLayer.getBoundingClientRect();
      const ox = fr.left - gr.left - minX - W / 2;
      const oy = fr.top - gr.top - minY - s;
      gridLayer.style.backgroundPosition = `${ox}px ${oy}px`;
    });
  }

  /* ================================================================ hover + preview */
  // Pointer: hovering a cube for DWELL ms turns the hero title into a preview card
  //          (the cube's outline traces itself meanwhile). Once open, other cubes swap in at once.
  // Keyboard: focusing a cube opens the card straight away.
  // Touch: first tap shows a bottom sheet, second tap opens the piece.
  const DWELL = 1000;
  const intro = $('#intro');
  const card = $('#introCard');
  let hot = null;
  let clearT, dwellT, closeT, backT;
  let shown = null; // id of the article in the card

  function setHot(cube, { instant = false } = {}) {
    clearTimeout(clearT);
    if (cube === hot) return;
    hot?.classList.remove('is-hot');
    hot = cube;
    field.classList.toggle('has-hot', !!cube);
    if (!cube) {
      clearTimeout(dwellT);
      if (touch) preview.classList.remove('is-on');
      else scheduleClose();
      return;
    }
    cube.classList.add('is-hot');
    if (touch) return showSheet(cube);
    clearTimeout(closeT);
    clearTimeout(dwellT);
    if (shown || instant) openCard(cube);
    else dwellT = setTimeout(() => openCard(cube), DWELL);
  }
  const clearHot = () => {
    clearTimeout(clearT);
    clearT = setTimeout(() => setHot(null), 70);
  };
  function scheduleClose() {
    clearTimeout(closeT);
    closeT = setTimeout(closeCard, 450);
  }

  const articleOf = (cube) => all.find((x) => x.id === cube.dataset.id);
  const metaOf = (a) => `<b>№ ${numberOf.get(a.id)}</b> · ${esc(a.category)} · ${fmtDate(a.publishedAt)} · ${a.readingMinutes} min`;

  function openCard(cube) {
    const a = articleOf(cube);
    if (!a || a.id === shown) return;
    const first = !shown;
    shown = a.id;
    card.href = `/article/${a.slug}`;
    $('img', card).src = a.cover;
    $('img', card).alt = a.coverAlt || '';
    $('.intro__meta', card).innerHTML = metaOf(a);
    $('.intro__title', card).innerHTML = splitWords(a.title);
    $('.intro__dek', card).textContent = a.excerpt;
    card.setAttribute('aria-hidden', 'false');
    card.tabIndex = 0;
    // restart the entrance animations for the new content
    card.classList.remove('is-swap');
    void card.offsetWidth;
    card.classList.add('is-swap');
    if (first) {
      clearTimeout(backT);
      intro.classList.remove('is-back');
      intro.classList.add('is-previewing');
      field.classList.add('is-previewing');
    }
  }

  function closeCard() {
    if (!shown) return;
    shown = null;
    card.setAttribute('aria-hidden', 'true');
    card.tabIndex = -1;
    intro.classList.remove('is-previewing');
    field.classList.remove('is-previewing');
    if (reduced) return;
    // words rise back in, like on first load
    intro.classList.add('is-back');
    clearTimeout(backT);
    backT = setTimeout(() => intro.classList.remove('is-back'), 2000);
  }

  // touch-only bottom sheet
  function showSheet(cube) {
    const a = articleOf(cube);
    if (!a) return;
    $('img', preview).src = a.cover;
    $('img', preview).alt = a.coverAlt || '';
    $('.preview__meta', preview).innerHTML = metaOf(a);
    $('.preview__title', preview).textContent = a.title;
    $('.preview__dek', preview).textContent = a.excerpt;
    preview.classList.remove('is-swap');
    void preview.offsetWidth;
    preview.classList.add('is-swap');
    requestAnimationFrame(() => preview.classList.add('is-on'));
    preview.dataset.href = `/article/${a.slug}`;
  }

  field.addEventListener('pointerover', (e) => {
    if (touch) return;
    const c = e.target.closest('.cube.is-article:not(.is-out)');
    c ? setHot(c) : clearHot();
  });
  field.addEventListener('pointerleave', () => !touch && clearHot());
  field.addEventListener('focusin', (e) => {
    const c = e.target.closest('.cube.is-article');
    // keyboard focus only: a tap also focuses the link, and must not count as "already selected"
    if (c && c.matches(':focus-visible')) setHot(c, { instant: true });
  });
  field.addEventListener('focusout', () => clearHot());

  // moving onto the card keeps it open (and its cube lit) so it can be clicked
  card.addEventListener('pointerenter', () => {
    clearTimeout(closeT);
    clearTimeout(clearT);
    const c = shown && field.querySelector(`.cube.is-article[data-id="${shown}"]`);
    if (c && c !== hot) setHot(c);
  });
  card.addEventListener('pointerleave', () => clearHot());
  card.addEventListener('focusout', () => clearHot());
  card.addEventListener('click', () => {
    $('.intro__title', card).style.viewTransitionName = 'title';
  });

  addEventListener('scroll', () => hot && !touch && scrollY > innerHeight * 0.5 && setHot(null), { passive: true });

  field.addEventListener('click', (e) => {
    const c = e.target.closest('.cube.is-article');
    if (!c) return;
    if (touch && c !== hot) {
      e.preventDefault();
      setHot(c);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    // hand the cover + title over to the article page (cross-document view transition)
    $('.f--left img', c).style.viewTransitionName = 'cover';
    if (shown === c.dataset.id) $('.intro__title', card).style.viewTransitionName = 'title';
  });
  preview.addEventListener('click', () => preview.dataset.href && (location.href = preview.dataset.href));
  document.addEventListener('click', (e) => {
    if (touch && hot && !e.target.closest('.cube, .preview')) setHot(null);
  });

  // coming back via the back button: reset the hand-off names and hover state
  addEventListener('pageshow', () => {
    document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => (el.style.viewTransitionName = ''));
    setHot(null);
    clearTimeout(closeT);
    shown = null;
    card.setAttribute('aria-hidden', 'true');
    card.tabIndex = -1;
    intro.classList.remove('is-previewing', 'is-back');
    field.classList.remove('is-previewing');
  });

  /* ================================================================ parallax + idle life */
  if (!touch && !reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    const stage = $('#stage');
    stage.addEventListener('pointermove', (e) => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
      if (!running) { running = true; requestAnimationFrame(tick); }
    });
    stage.addEventListener('pointerleave', () => { tx = ty = 0; });
    function tick() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      field.style.transform = `translate3d(${cx * -9}px, ${cy * -7}px, 0)`;
      gridLayer.style.transform = `translate3d(${cx * -22}px, ${cy * -16}px, 0)`;
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001) requestAnimationFrame(tick);
      else running = false;
    }
  }
  if (!reduced) {
    setInterval(() => {
      if (document.hidden || scrollY > innerHeight) return;
      const ghosts = field.querySelectorAll('.cube.is-ghost:not(.is-flash)');
      const g = ghosts[Math.floor(Math.random() * ghosts.length)];
      if (!g) return;
      g.classList.add('is-flash');
      setTimeout(() => g.classList.remove('is-flash'), 1400);
    }, 1500);
  }

  /* ================================================================ filters */
  function buildFilters() {
    const box = $('#filters');
    if (categories.length < 2) return;
    const count = (c) => all.filter((a) => a.category === c).length;
    box.innerHTML =
      `<button class="chip is-on" data-cat="">All<sup>${all.length}</sup></button>` +
      categories.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}<sup>${count(c)}</sup></button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      filter = b.dataset.cat || null;
      box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x === b));
      applyFilter();
    });
  }
  function applyFilter() {
    field.querySelectorAll('.cube.is-article').forEach((c) => c.classList.toggle('is-out', !!filter && c.dataset.cat !== filter));
    document.querySelectorAll('.row').forEach((r) => r.classList.toggle('is-out', !!filter && r.dataset.cat !== filter));
    if (hot?.classList.contains('is-out')) setHot(null);
  }

  /* ================================================================ index */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildIndex() {
    const list = $('#indexList');
    if (!all.length) {
      list.innerHTML = '<li class="row"><a href="/admin"><span class="row__n meta">00</span><span class="row__t">Nothing published yet — open the editor.</span></a></li>';
      return;
    }
    list.innerHTML = all
      .map(
        (a) => `<li class="row reveal" data-cat="${esc(a.category)}" data-id="${a.id}">
        <a href="/article/${esc(a.slug)}">
          <span class="row__n meta">${numberOf.get(a.id)}</span>
          <span class="row__t">${esc(a.title)}</span>
          <span class="row__c meta">${esc(a.category)}</span>
          <span class="row__d meta">${fmtDate(a.publishedAt)}</span>
          <span class="row__r meta">${a.readingMinutes} min</span>
          <span class="row__panel" aria-hidden="true"><span class="row__panel-in">
            <span class="row__img"><img alt="" data-src="${esc(a.cover)}" decoding="async"></span>
            <span class="row__ex">${esc(a.excerpt)}</span>
          </span></span>
        </a></li>`
      )
      .join('');

    // Hovering a row opens a panel under it: the picture on top, then the excerpt.
    let openRow = null, intentT, shutT;
    const load = (row) => {
      const img = $('.row__img img', row);
      if (img && !img.src) img.src = img.dataset.src;
    };
    const open = (row) => {
      clearTimeout(intentT);
      clearTimeout(shutT);
      if (row === openRow) return;
      openRow?.classList.remove('is-open');
      openRow = row;
      load(row);
      row.classList.add('is-open');
      list.classList.add('has-hot');
    };
    const shut = () => {
      clearTimeout(intentT);
      openRow?.classList.remove('is-open');
      openRow = null;
      list.classList.remove('has-hot');
    };
    if (!touch) {
      list.addEventListener('pointerover', (e) => {
        // No hover-intent delay: every row the cursor crosses starts opening at once, and the
        // one it left starts closing. CSS transitions reverse from wherever they are, so a fast
        // sweep leaves a trail of rows that only part-opened before gliding shut again.
        const row = e.target.closest('.row[data-id]');
        if (row) open(row);
      });
      // Fetch and decode every row picture once the index nears the viewport, so no
      // image decode lands in the middle of an open animation.
      const pre = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        pre.disconnect();
        const warm = () => list.querySelectorAll('.row[data-id]').forEach((row) => {
          load(row);
          $('.row__img img', row)?.decode?.().catch(() => {});
        });
        'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 1500 }) : setTimeout(warm, 200);
      }, { rootMargin: '600px 0px' });
      pre.observe(list);
      list.addEventListener('pointerleave', () => {
        clearTimeout(intentT);
        shutT = setTimeout(shut, 250);
      });
    }
    list.addEventListener('focusin', (e) => {
      const row = e.target.closest('.row[data-id]');
      if (row) open(row);
    });
    list.addEventListener('focusout', (e) => {
      if (!list.contains(e.relatedTarget)) shut();
    });

    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
        setTimeout(() => (en.target.style.transitionDelay = ''), 1200);
      }),
      { rootMargin: '0px 0px -8% 0px' }
    );
    [...list.children].forEach((li, i) => {
      li.style.transitionDelay = `${(i % 8) * 50}ms`;
      io.observe(li);
    });
    document.querySelectorAll('.about > *').forEach((el) => { el.classList.add('reveal'); io.observe(el); });
  }

  /* ================================================================ boot */
  buildFilters();
  buildIndex();
  layout(true);

  let lastW = innerWidth;
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (Math.abs(innerWidth - lastW) < 40) return; // ignore mobile URL-bar jiggle
      lastW = innerWidth;
      layout(false);
    }, 160);
  });
})();
