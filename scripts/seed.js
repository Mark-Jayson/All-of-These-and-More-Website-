// Seeds sample articles + generated abstract cover art so the site has something to show.
//   npm run seed            → only if the catalog is empty
//   npm run seed -- --force → replace every article (keeps your settings and login)
// It writes wherever the site does: local files, or Postgres + Vercel Blob when
// DATABASE_URL / BLOB_READ_WRITE_TOKEN are set (see `npm run seed:prod`).
import crypto from 'node:crypto';
import * as store from '../lib/store.js';
import { saveImage, usesBlob } from '../lib/media.js';

const force = process.argv.includes('--force');

await store.ready();
if ((await store.articles()).length && !force) {
  console.log('Catalog already has articles — run the seed with `-- --force` to replace them.');
  process.exit(0);
}

/* ------------------------------------------------------------ generative covers */
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const W = 1600, H = 1000;

const PALETTES = [
  ['#0e1a2b', '#f25f3a', '#ffc46b', '#f6efe4', '#1f3b5c'],
  ['#0b1410', '#3fb68b', '#c9f2a4', '#f4f1de', '#1e3a2f'],
  ['#14101f', '#9d8cff', '#ff8fb1', '#ffe8d6', '#2c2245'],
  ['#1b120c', '#d98e04', '#f2d0a4', '#efe7da', '#5c3d2e'],
  ['#0a0f14', '#4cc9f0', '#f72585', '#e9ecef', '#1d3557'],
  ['#11110f', '#e63946', '#f1faee', '#a8dadc', '#2b2d42'],
  ['#0f1512', '#d7ff3a', '#6b8f71', '#eef0e5', '#243b2f'],
  ['#18100f', '#ff6b35', '#f7c59f', '#efefd0', '#004e89'],
];

const grain = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .35 0"/></filter>`;
const wrap = (p, inner, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${grain}${defs}</defs><rect width="100%" height="100%" fill="${p[0]}"/>${inner}<rect width="100%" height="100%" filter="url(#g)" opacity=".55"/></svg>`;

const ART = {
  horizon(p) {
    const sun = `<circle cx="${400 + rnd() * 800}" cy="${300 + rnd() * 200}" r="${150 + rnd() * 120}" fill="${p[2]}"/>`;
    let hills = '';
    for (let l = 0; l < 4; l++) {
      let d = `M0 ${H}`;
      const base = 520 + l * 110;
      for (let x = 0; x <= W; x += 80) d += ` L${x} ${base - Math.sin(x / (180 + l * 40) + l) * (60 - l * 8) - rnd() * 30}`;
      hills += `<path d="${d} L${W} ${H}Z" fill="${[p[4], p[1], p[4], p[0]][l]}" opacity="${0.95 - l * 0.05}"/>`;
    }
    return wrap(p, `<rect width="100%" height="65%" fill="url(#sky)"/>${sun}${hills}`,
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>`);
  },
  waves(p) {
    let s = '';
    for (let i = 0; i < 38; i++) {
      let d = `M-20 ${120 + i * 24}`;
      for (let x = 0; x <= W + 40; x += 40) d += ` L${x} ${120 + i * 24 + Math.sin(x / 140 + i * 0.35) * (30 + i * 2)}`;
      s += `<path d="${d}" fill="none" stroke="${i % 7 === 0 ? p[1] : p[3]}" stroke-opacity="${i % 7 === 0 ? 1 : 0.35}" stroke-width="${i % 7 === 0 ? 4 : 1.5}"/>`;
    }
    return wrap(p, s);
  },
  orbits(p) {
    const cx = W * (0.3 + rnd() * 0.4), cy = H * 0.5;
    let s = `<circle cx="${cx}" cy="${cy}" r="120" fill="${p[1]}"/>`;
    for (let r = 170; r < 1100; r += 46) {
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p[3]}" stroke-opacity=".22"/>`;
      const a = rnd() * Math.PI * 2;
      s += `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" r="${4 + rnd() * 14}" fill="${pick([p[2], p[3], p[1]])}"/>`;
    }
    return wrap(p, s);
  },
  blocks(p) {
    const s = 90, h = s * 0.866;
    let out = '';
    for (let r = -2; r < 16; r++) {
      for (let c = -2; c < 14; c++) {
        if (rnd() < 0.45) continue;
        const x = c * 2 * h + (r % 2 ? h : 0), y = r * s * 1.5 - 100;
        const top = `M${x} ${y - s}L${x + h} ${y - s / 2}L${x} ${y}L${x - h} ${y - s / 2}Z`;
        const left = `M${x - h} ${y - s / 2}L${x} ${y}L${x} ${y + s}L${x - h} ${y + s / 2}Z`;
        const right = `M${x + h} ${y - s / 2}L${x} ${y}L${x} ${y + s}L${x + h} ${y + s / 2}Z`;
        const accent = rnd() < 0.12;
        out += `<path d="${top}" fill="${accent ? p[2] : p[3]}"/><path d="${left}" fill="${accent ? p[1] : p[4]}"/><path d="${right}" fill="${p[0]}" stroke="${p[4]}"/>`;
      }
    }
    return wrap(p, out);
  },
  bands(p) {
    let s = '', x = 0;
    while (x < W) {
      const w = 20 + rnd() * 160;
      s += `<rect x="${x}" y="0" width="${w}" height="${H}" fill="${pick(p)}" opacity="${0.6 + rnd() * 0.4}"/>`;
      x += w;
    }
    return wrap(p, `${s}<rect x="0" y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="${p[0]}" opacity=".7"/>`);
  },
  bloom(p) {
    let s = '';
    for (let i = 0; i < 7; i++)
      s += `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${200 + rnd() * 380}" fill="${pick(p.slice(1))}" opacity=".85"/>`;
    return wrap(p, `<g filter="url(#b)">${s}</g>`, `<filter id="b"><feGaussianBlur stdDeviation="110"/></filter>`);
  },
  city(p) {
    let s = '';
    for (let layer = 0; layer < 3; layer++) {
      let x = -20;
      while (x < W) {
        const w = 50 + rnd() * 120, h = 160 + rnd() * (420 - layer * 90) + layer * 60;
        const y = H - h;
        s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${[p[4], p[0], '#000'][layer]}" opacity="${0.75 + layer * 0.1}"/>`;
        if (layer === 2)
          for (let wy = y + 20; wy < H - 20; wy += 26)
            for (let wx = x + 10; wx < x + w - 14; wx += 18)
              if (rnd() < 0.3) s += `<rect x="${wx}" y="${wy}" width="8" height="12" fill="${p[2]}" opacity="${0.5 + rnd() * 0.5}"/>`;
        x += w + rnd() * 10;
      }
    }
    return wrap(p, `<rect width="100%" height="100%" fill="url(#dusk)"/>${s}`,
      `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset=".7" stop-color="${p[1]}"/></linearGradient>`);
  },
  rays(p) {
    const ox = rnd() * W, oy = H + 100;
    let s = '';
    for (let i = 0; i < 70; i++) {
      const a = Math.PI + (i / 70) * Math.PI;
      s += `<line x1="${ox}" y1="${oy}" x2="${ox + Math.cos(a) * 2400}" y2="${oy + Math.sin(a) * 2400}" stroke="${i % 9 === 0 ? p[1] : p[3]}" stroke-opacity="${i % 9 === 0 ? 0.9 : 0.18}" stroke-width="${i % 9 === 0 ? 5 : 1.5}"/>`;
    }
    return wrap(p, `${s}<circle cx="${ox}" cy="${oy}" r="260" fill="${p[2]}"/>`);
  },
};

const images = []; // [placeholder, svg] — saved after the articles are built
function art(name, kind, paletteIdx, s) {
  seed = s;
  const ref = `@@seed/${name}.svg@@`;
  images.push([ref, ART[kind](PALETTES[paletteIdx % PALETTES.length])]);
  return ref;
}

/* ------------------------------------------------------------ sample writing */
const pieces = [
  {
    title: 'The Weight of Small Rooms', category: 'Essay', featured: true, art: ['horizon', 0], date: '2026-11-02',
    dek: 'On rented spaces, borrowed time, and how a room can hold more of you than you meant to leave behind.',
    tags: ['home', 'memory'],
    body: `Every apartment I have lived in has been slightly too small for the life I was trying to live in it. This is not a complaint. It is, I think, the most honest thing a room can tell you.

The first one had a window that faced a wall. At noon, for about forty minutes, the sun found a gap between two buildings and laid a yellow rectangle across my desk. I arranged my days around it the way other people arrange their days around meals.

## The geometry of staying

A small room makes you a curator. You cannot keep everything, so you keep what argues for itself: one good chair, the books you will actually reread, a plant that forgives you.

> A room is a sentence you keep editing until it finally says who you are.

What surprised me was how much a room remembers. Move the bed and the floor still holds the shape of where it was. Paint the walls and the nail holes come back through.

![Late light](${'{cover2}'} "The window that faced a wall, at the one hour it mattered.")

## Leaving

When I moved out, I swept the floor and stood in the doorway longer than I needed to. The room looked enormous without me in it. That is the trick small rooms play: they only feel small while they are full of your life.

---

I still measure new places by that rectangle of light. Not how big, but how long the sun stays.`,
  },
  {
    title: 'Notes on Walking Home at 2 A.M.', category: 'Notes', art: ['city', 4], date: '2026-10-21',
    dek: 'A city rewrites itself after midnight. A few things I wrote down on the way back.',
    tags: ['city', 'night'],
    body: `- The convenience store is the last lighthouse.
- Every tricycle driver is a philosopher if you ask the right question.
- Streetlights hum in a key that daytime drowns out.

The streets at this hour belong to people finishing things: shifts, arguments, songs. Nobody is starting anything. There is a dignity to that.

## What the dark keeps

You notice the architecture more when there is nothing else to look at. Balconies with laundry like flags of tiny nations. A staircase that leads to a door that was bricked up years ago.

> At 2 A.M., the city stops performing and simply exists.

I got home, made tea I did not drink, and wrote this before I forgot the hum.`,
  },
  {
    title: 'Everything I Know About Rain I Learned in Manila', category: 'Essay', art: ['waves', 4], date: '2026-09-30',
    dek: 'Monsoon season as a teacher of patience, improvisation, and the art of the plastic bag.',
    tags: ['manila', 'weather', 'memory'],
    body: `There are people who say they love the rain. They have never waded knee-deep through España Boulevard holding their shoes above their head like a trophy.

And yet. I love the rain.

## Improvisation

Manila rain teaches you to carry a plastic bag for your phone, a spare shirt for your dignity, and enough patience for a jeepney that may or may not arrive. It teaches you that plans are suggestions.

> The rain doesn't ruin your plans. It reveals which ones were ever really yours.

## Shelter

The best conversations I have had with strangers happened under the awning of a sari-sari store, waiting for the downpour to ease. The rain makes neighbours of everybody for twenty minutes.

![Monsoon lines](${'{cover2}'} "Rain, drawn the only way I can remember it — as lines.")

When it stops, the city steams and smells like hot asphalt and wet leaves, and everyone goes back to being strangers. But slower, I think. A little slower.`,
  },
  {
    title: 'A Field Guide to Empty Malls', category: 'Photo story', art: ['blocks', 2], date: '2026-09-12',
    dek: 'Monday mornings in the cathedrals of air-conditioning, photographed before the shutters go up.',
    tags: ['photography', 'architecture'],
    body: `I started photographing malls before they open because it is the only time they look like what they are: enormous, hopeful machines waiting for a reason to run.

## Species you will encounter

1. **The escalator that runs for no one.** Patient, faithful, slightly sad.
2. **The fountain.** Always louder when the building is empty.
3. **The security guard.** The only person who has seen this place both full and empty, and therefore the only one who truly knows it.

![Atrium](${'{cover2}'} "Atrium, 8:12 A.M. The light arrives before the shoppers do.")

> Emptiness is not the absence of a place. It is the place, finally speaking.

---

I will keep going back. There is something tender about a building that is built for crowds and briefly gets to be alone.`,
  },
  {
    title: 'Why I Stopped Finishing Books', category: 'Blog', art: ['bands', 3], date: '2026-08-25',
    dek: 'A defence of the abandoned novel, the half-read essay, and reading like nobody is grading you.',
    tags: ['reading', 'habits'],
    body: `For most of my life, I finished every book I started. It felt like a promise. Then one year I counted, and realised a third of my reading time went to books I did not like.

## Permission

Quitting a book is not a failure. It is a decision about what your attention is worth. The book will be fine. Somebody else will love it.

> Your reading list is not a contract. It is a conversation, and you are allowed to change the subject.

Since then I read more, not less. I start generously and leave without guilt. The books I do finish, I finish because I can't stop.`,
  },
  {
    title: 'The Jeepney as a Moving Archive', category: 'Essay', art: ['rays', 7], date: '2026-08-03',
    dek: 'Chrome horses, hand-painted saints, and the history we ride to work every morning.',
    tags: ['manila', 'design', 'history'],
    body: `A jeepney is never only a vehicle. Read one from front to back and you get a family history: names of children painted on the side, a saint on the dashboard, a hometown in careful cursive above the windshield.

## Typography in motion

The lettering on jeepneys is one of the great vernacular type traditions of the world. Nobody taught it in school. It was passed hand to hand, shop to shop.

![Chrome and paint](${'{cover2}'} "Hood ornaments: a herd of chrome horses, none of them alike.")

> Every jeepney is a museum that charges thirteen pesos and stops wherever you knock.

## What we lose

As the old jeepneys are phased out, I find myself photographing them like an anthropologist. Not out of nostalgia exactly. Out of the feeling that something which held a lot of people's stories is about to be quietly put away.`,
  },
  {
    title: 'On Keeping a Commonplace Book', category: 'Notes', art: ['orbits', 6], date: '2026-07-14',
    dek: 'A notebook of other people’s sentences turned out to be the most personal thing I own.',
    tags: ['writing', 'habits'],
    body: `A commonplace book is a notebook where you copy passages that struck you. That's it. That's the whole practice.

## Why bother

Copying a sentence by hand slows you down enough to see how it was built. You notice the comma that makes it work. You notice the word that should not be there, and is.

> Reading tells you what someone said. Copying tells you how.

Years later, flipping through, you see a portrait of yourself made entirely out of other people's words.`,
  },
  {
    title: 'Ten Thousand Hours of Static', category: 'Blog', art: ['bloom', 5], date: '2026-06-28',
    dek: 'Notes from a year of making things nobody asked for.',
    tags: ['craft', 'creativity'],
    body: `The ten-thousand-hour rule makes mastery sound like a staircase. In practice it is mostly static: long stretches where nothing seems to change, punctured by a week where suddenly everything does.

## The plateau

Most of the work is done on the plateau. It doesn't feel like progress. It feels like repeating yourself. That is because it is.

> You don't climb out of the plateau. One day you look down and notice you are already somewhere else.

So I keep making small things. A paragraph a day. A photo a day. Most of it is static. I've stopped minding.`,
  },
  {
    title: 'Learning My Grandmother’s Adobo From Memory', category: 'Essay', art: ['horizon', 3], date: '2026-05-19',
    dek: 'There was never a recipe. There was a kitchen, a voice, and a smell I am still trying to get right.',
    tags: ['food', 'family', 'memory'],
    body: `My grandmother never measured anything. "Until it looks right," she'd say, which is not an instruction so much as a test.

## Soy, vinegar, garlic, time

The ingredients are simple. The difficulty is the order, the heat, the patience. Her adobo was dark, almost glossy, and sharp enough to make you blink.

![Kitchen](${'{cover2}'} "Her kitchen window, as I remember it — a sunset that smelled of garlic.")

> A recipe is a set of instructions. A dish is a memory you can eat.

## Getting close

I have made it maybe forty times. Twice, it was close. Both times I sat at the table and didn't say anything for a while.`,
  },
  {
    title: 'Light, Measured in Afternoons', category: 'Photo story', art: ['rays', 1], date: '2026-04-06',
    dek: 'A season of photographing the same corner of the same street at four o’clock.',
    tags: ['photography', 'light'],
    body: `Every day for three months I photographed the same corner at 4 P.M. Same lens, same spot, same height.

## What changed

Not much, and everything. The light moved a few centimetres every day. A shop changed its awning. A dog appeared, then a second dog, then the first dog stopped appearing.

![Four o’clock](${'{cover2}'} "Day 61. The light finally reaches the doorway.")

> Pay attention to one place long enough and it stops being scenery. It becomes a story.`,
  },
  {
    title: 'What the Ferry Taught Me About Waiting', category: 'Essay', art: ['waves', 0], date: '2026-02-17',
    dek: 'Eight hours, one bench, no signal — and the most productive boredom of my life.',
    tags: ['travel', 'slowness'],
    body: `The ferry was delayed by six hours, then by two more. There was no signal, no café, one bench, and a lot of sea.

## The first hour

I was furious. I checked my phone like a reflex, out of habit, as if the signal might arrive out of sympathy.

## The fifth hour

Something loosened. I watched the water change colour. I wrote four pages in a notebook I had been carrying around, empty, for a year.

> Waiting is only wasted time if you insist on being somewhere else.

---

We arrived after dark. I remember the trip better than any I've taken since.`,
  },
  {
    title: 'In Praise of the Second Draft', category: 'Blog', art: ['blocks', 6], date: '2025-12-09',
    dek: 'The first draft is for finding out what you think. The second is for the reader.',
    tags: ['writing', 'craft'],
    body: `Nobody reads your first draft. That is its gift. It can be messy, repetitive and wrong, because its only job is to exist.

## The real work

The second draft is where writing happens. You cut the throat-clearing opening. You find the sentence you buried in paragraph six and realise it was the point all along.

> Write the first draft to find the essay. Write the second to find the reader.

Every piece on this site has had at least two. Most have had five.`,
  },
  {
    title: 'Untitled Thoughts on Cubes', category: 'Notes', art: ['blocks', 1], date: '2026-11-10', status: 'draft',
    dek: 'Why this site looks the way it does. (Draft — not visible to readers.)',
    tags: ['design'],
    body: `This is a draft. Only you can see it, in the editor.

A cube is the simplest object that has an inside. That felt right for a collection of essays.`,
  },
  {
    title: 'A Year, Folded Into Cubes', category: 'Essay', art: ['bloom', 2], date: '2026-12-31', status: 'published',
    dek: 'A scheduled piece — it goes live on New Year’s Eve by itself.',
    tags: ['year-in-review'],
    body: `This piece is scheduled. It won't appear on the site until its publish date.`,
  },
];

const now = new Date().toISOString();
const list = pieces.map((p, i) => {
  const slug = p.title.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cover = art(`${slug}`, p.art[0], p.art[1], 1000 + i * 77);
  const kinds = Object.keys(ART);
  const second = art(`${slug}-2`, kinds[(kinds.indexOf(p.art[0]) + 3) % kinds.length], p.art[1] + 1, 5000 + i * 31);
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    views: Math.floor(40 + ((i * 7919) % 600)),
    title: p.title,
    dek: p.dek,
    slug,
    category: p.category,
    tags: p.tags,
    cover,
    coverAlt: `Abstract illustration for “${p.title}”`,
    body: p.body.replaceAll('{cover2}', second),
    featured: !!p.featured,
    status: p.status || 'published',
    publishedAt: new Date(`${p.date}T09:00:00`).toISOString(),
    updatedAt: now,
  };
});

console.log(`Saving ${images.length} cover images ${usesBlob() ? 'to Vercel Blob' : 'to disk'}…`);
let json = JSON.stringify(list);
for (const [ref, svg] of images) {
  const url = await saveImage(svg, 'image/svg+xml', ref.slice(2, -2));
  json = json.replaceAll(ref, url);
}
await store.replaceArticles(JSON.parse(json));
console.log(`Seeded ${list.length} articles into ${store.backend()} storage.`);
