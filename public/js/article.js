/* Article page — reading progress, contents, reveals, lightbox, share. */
(() => {
  document.documentElement.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const prose = $('#prose');
  const bar = $('#progress');
  const timeLeft = $('#timeLeft');
  const cover = $('#cover img');
  const minutes = parseInt(timeLeft?.textContent, 10) || 1;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // progress bar + minutes left + cover drift
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const r = prose.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.35 - r.top) / r.height));
      bar.style.transform = `scaleX(${p})`;
      if (timeLeft) {
        const left = Math.ceil(minutes * (1 - p));
        timeLeft.textContent = p <= 0.01 ? `${minutes} min read` : left > 0 ? `${left} min left` : 'Finished ✓';
      }
      if (!reduced && cover) {
        const cr = cover.getBoundingClientRect();
        if (cr.bottom > 0 && cr.top < innerHeight) {
          const t = (innerHeight - cr.top) / (innerHeight + cr.height);
          cover.style.objectPosition = `50% ${30 + t * 40}%`;
        }
      }
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // reveal figures, quotes and headings as they arrive
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('is-in'), io.unobserve(e.target))),
    { rootMargin: '0px 0px -10% 0px' }
  );
  prose.querySelectorAll('.fig, blockquote, h2').forEach((el) => io.observe(el));

  // contents: highlight the section you're in
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length) {
    const heads = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
    const spy = () => {
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h;
      links.forEach((a) => a.classList.toggle('is-on', a.hash.slice(1) === cur?.id));
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // lightbox
  const lb = $('#lightbox');
  prose.addEventListener('click', (e) => {
    const img = e.target.closest('.fig img');
    if (!img) return;
    $('img', lb).src = img.currentSrc || img.src;
    $('img', lb).alt = img.alt;
    $('p', lb).textContent = img.closest('figure').querySelector('figcaption')?.textContent || '';
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
  });
  const closeLb = () => { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); };
  lb.addEventListener('click', closeLb);
  addEventListener('keydown', (e) => e.key === 'Escape' && closeLb());

  // share
  const copy = $('#copyLink');
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0]);
      copy.classList.add('is-done');
      copy.firstElementChild.textContent = 'Copied ✓';
      setTimeout(() => { copy.classList.remove('is-done'); copy.firstElementChild.textContent = 'Copy link'; }, 1800);
    } catch { /* clipboard blocked — ignore */ }
  });
  const share = $('#share');
  if (navigator.share && share) {
    share.hidden = false;
    share.addEventListener('click', () => navigator.share({ title: document.title, url: location.href }).catch(() => {}));
  }
})();
