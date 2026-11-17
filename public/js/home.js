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
    });
  }

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
    const socket = `<svg class="cube__socket" viewBox="0 0 ${W} ${2 * s}" aria-hidden="true"><path d="${hexLines(s)}"/><polygon points="${hexPoly(s)}"/></svg>`;

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
  let hot = null;
  let clearT;

  function setHot(cube) {
    clearTimeout(clearT);
    if (cube === hot) return;
    hot?.classList.remove('is-hot');
    hot = cube;
    field.classList.toggle('has-hot', !!cube);
    if (!cube) {
      preview.classList.remove('is-on');
      return;
    }
    cube.classList.add('is-hot');
    showPreview(cube);
  }
  const clearHot = () => {
    clearTimeout(clearT);
    clearT = setTimeout(() => setHot(null), 70);
  };

  function showPreview(cube) {
    const a = all.find((x) => x.id === cube.dataset.id);
    if (!a) return;
    const wasOn = preview.classList.contains('is-on');
    $('img', preview).src = a.cover;
    $('img', preview).alt = a.coverAlt || '';
    $('.preview__meta', preview).innerHTML = `<b>№ ${numberOf.get(a.id)}</b> · ${esc(a.category)} · ${fmtDate(a.publishedAt)} · ${a.readingMinutes} min`;
    $('.preview__title', preview).textContent = a.title;
    $('.preview__dek', preview).textContent = a.excerpt;
    preview.classList.remove('is-swap');
    void preview.offsetWidth;
    preview.classList.add('is-swap');

    if (!touch) {
      const r = cube.getBoundingClientRect();
      const pw = preview.offsetWidth;
      const ph = preview.offsetHeight;
      let x = r.right + 12;
      if (x + pw > innerWidth - 16) x = r.left - pw - 12;
      x = Math.max(16, x);
      const lift = parseFloat(getComputedStyle(field).getPropertyValue('--s')) * 0.26;
      const y = Math.min(innerHeight - ph - 16, Math.max(76, r.top + r.height / 2 - ph / 2 - lift));
      preview.classList.toggle('no-glide', !wasOn);
      preview.style.setProperty('--x', `${x}px`);
      preview.style.setProperty('--y', `${y}px`);
    }
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
    if (c) setHot(c);
  });
  field.addEventListener('focusout', () => clearHot());
  addEventListener('scroll', () => hot && !touch && setHot(null), { passive: true });

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
    if (preview.classList.contains('is-on') && !touch) $('.preview__title', preview).style.viewTransitionName = 'title';
  });
  preview.addEventListener('click', () => preview.dataset.href && (location.href = preview.dataset.href));
  document.addEventListener('click', (e) => {
    if (touch && hot && !e.target.closest('.cube, .preview')) setHot(null);
  });

  // coming back via the back button: reset the hand-off names and hover state
  addEventListener('pageshow', () => {
    document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => (el.style.viewTransitionName = ''));
    setHot(null);
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
          <span class="row__t">${esc(a.title)}<em>${esc(a.excerpt)}</em></span>
          <span class="row__c meta">${esc(a.category)}</span>
          <span class="row__d meta">${fmtDate(a.publishedAt)}</span>
          <span class="row__r meta">${a.readingMinutes} min</span>
        </a></li>`
      )
      .join('');

    // image that trails the cursor over the list
    const float = $('#indexFloat');
    const img = $('img', float);
    let x = 0, y = 0, fx = 0, fy = 0, raf = 0, hotRow = null;
    const loop = () => {
      const vx = x - fx;
      fx += vx * 0.14;
      fy += (y - fy) * 0.14;
      float.style.setProperty('--x', `${fx + 28}px`);
      float.style.setProperty('--y', `${fy - 170}px`);
      float.style.setProperty('--r', `${Math.max(-8, Math.min(8, vx * 0.06))}deg`);
      raf = Math.abs(x - fx) + Math.abs(y - fy) > 0.3 ? requestAnimationFrame(loop) : 0;
    };
    list.addEventListener('pointermove', (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!float.classList.contains('is-on')) { fx = x; fy = y; }
      if (!raf) raf = requestAnimationFrame(loop);
      const row = e.target.closest('.row');
      if (row && row !== hotRow) {
        hotRow?.classList.remove('is-hot');
        hotRow = row;
        row.classList.add('is-hot');
        list.classList.add('has-hot');
        const a = all.find((q) => q.id === row.dataset.id);
        if (a) img.src = a.cover;
        float.classList.add('is-on');
      }
    });
    list.addEventListener('pointerleave', () => {
      hotRow?.classList.remove('is-hot');
      hotRow = null;
      list.classList.remove('has-hot');
      float.classList.remove('is-on');
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
