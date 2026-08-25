#!/usr/bin/env node
'use strict';

/**
 * DCITC STATIC SITE BUILDER  —  scripts/build.js
 * ==============================================
 * WHAT THIS FILE CONTROLS:
 *   This is the entire build pipeline of the website. Running
 *   `node scripts/build.js` reads every source file and writes the
 *   finished site into /public. Nothing else in the repo executes at
 *   build time — this one script does all of it:
 *
 *     1. Loads all content from src/data/*.json and enriches each item
 *        with computed fields (codes like "PROJ.01", urls, formatted
 *        dates, featured subsets, counts).
 *     2. Renders every page template in src/pages/*.html through the
 *        template engine below, producing directory-style output:
 *        public/<page>/index.html.
 *     3. Renders per-item pages (one per project/event/article) into
 *        public/projects|events|blog/<slug>/index.html.
 *     4. Generates deterministic SVG artwork (project covers, gallery
 *        plates, team avatars, logo/favicon) into public/img/gen/.
 *     5. Concatenates static/css/01..09 → public/css/main.css and
 *        static/js/theme…main → public/js/app.js (order matters: see
 *        CSS_FILES / JS_FILES near the bottom), then copies vendored
 *        libraries (anime.min.js) into public/ verbatim.
 *
 * WHY HUGO-COMPATIBLE:
 *   The output in /public is plain static HTML + CSS + JS, laid out in
 *   a Hugo-compatible way so the site can later move to Hugo without
 *   redesigning the interface:
 *
 *     src/data/     ->  becomes Hugo content/ + data/ collections
 *     src/partials/ ->  becomes Hugo layouts/partials/
 *     src/pages/    ->  becomes Hugo layouts/_default/ + layouts/<type>/
 *     static/       ->  maps 1:1 to Hugo static/
 *     public/       ->  build output (Hugo "public")
 *
 * THE TEMPLATE LANGUAGE (a tiny Hugo-flavoured subset):
 *   {{ .path }}                    variable output (raw)
 *   {{ each .collection }}..{{ end }}   loop (inside, . is the item)
 *   {{ if .cond }}..{{ else }}..{{ end }}
 *   {{ if not .cond }}..{{ end }}
 *   {{ if or (eq .a "x") (eq .b "y") }}   boolean groups in parens
 *   {{ include "partials/x.html" }}
 *   {{ fmtDate .date }}            helper calls (see `helpers` object)
 *   {{ $.rootField }}              escape to root scope
 *
 * REGRESSION GUARDS (bugs that were fixed here — do not reintroduce):
 *   - `or`/`and` arguments must be evaluated as CONDITIONS. condVal()
 *     strips wrapping parens and routes condition-looking args to
 *     evalCond(); bare paths are checked for truthiness instead.
 *   - splitArgs() must group (...) segments via paren-depth tracking
 *     AND preserve quotes inside paren groups. If it didn't,
 *     `(eq .role "X")` would split into `(eq`, `.role`, `X)` and the
 *     stray `(eq` string would make every `or` condition true.
 *   - Hard guards: template depth > 60 or > 1M render iterations throw.
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked'); // Markdown → HTML (GFM tables etc.)
const yaml = require('js-yaml'); // blog frontmatter parsing

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const STATIC = path.join(ROOT, 'static');
const OUT = path.join(ROOT, 'public');

/* ------------------------------------------------------------------ */
/* small utilities                                                     */
/* ------------------------------------------------------------------ */

// read a file as utf-8 text
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
// write text, creating parent directories on demand (used everywhere)
function write(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
}
// read + parse a JSON data file from src/data/
function readJSON(p) {
  return JSON.parse(read(p));
}

// FNV-1a string hash → uint32. Turns any seed string ("nodhini",
// "tanvir", …) into a number we can feed the PRNG below. Deterministic:
// same seed → same artwork, every build.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — tiny seeded PRNG. Paired with hashStr it gives every
// generated SVG reproducible "randomness" without storing anything.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_L = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// "2026-09-18" → { y: 2026, m: 9, d: 18 } or null if malformed.
// Used by the date helpers; deliberately avoids Date() timezone issues.
function parseISO(s) {
  const [y, m, d] = String(s || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/* ------------------------------------------------------------------ */
/* template engine                                                     */
/* ------------------------------------------------------------------ */

// One-argument output helpers callable from templates as {{ name path }}.
// Each receives the resolved value of the path (see renderTokens' helper
// branch). Only helpers actually referenced by templates live here.
const helpers = {
  fmtDate(s) {
    // "2026-09-18" → "18 Sep 2026"
    const dt = parseISO(s);
    if (!dt) return s;
    return `${dt.d} ${MONTHS[dt.m - 1]} ${dt.y}`;
  },
  fmtDateLong(s) {
    // "2026-09-18" → "September 18, 2026"
    const dt = parseISO(s);
    if (!dt) return s;
    return `${MONTHS_L[dt.m - 1]} ${dt.d}, ${dt.y}`;
  },
  fmtYear(s) {
    // "2026-01-01" → "2026" (footer © year)
    const dt = parseISO(s);
    if (!dt) return s;
    return String(dt.y);
  },
  upper(v) {
    return String(v == null ? '' : v).toUpperCase();
  },
  readingTime(words) {
    // word count → "N min read" (~200 wpm)
    const n = Number(words) || 0;
    return `${Math.max(1, Math.round(n / 200))} min read`;
  },
  len(v) {
    return Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : 0;
  },
};

// Truthiness for conditions. Empty string/array/object, null, undefined,
// false and NaN are falsy; everything else truthy. Mirrors Hugo semantics
// closely enough for this site's templates.
function truthy(v) {
  if (v === null || v === undefined || v === false || v === '') return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

// Resolve a dotted path against the current scope.
//   "."      → the scope itself (current each-item)
//   ".a.b"   → scope.a.b
//   "$.a.b"  → ROOT.a.b (escape back to page root inside an each loop)
// Returns '' for missing values so raw output never prints "undefined".
function resolve(expr, scope, root) {
  let p = expr.trim();
  if (!p) return '';
  if (p === '.') return scope;
  if (p.startsWith('$.')) {
    scope = root;
    p = p.slice(1);
  } else if (p.startsWith('.')) p = p.slice(1);
  else if (p.startsWith('$')) {
    scope = root;
    p = p.slice(1);
  }
  let val = scope;
  const parts = p.split('.');
  for (const part of parts) {
    if (val === null || val === undefined) return '';
    val = val[part];
  }
  return val === undefined || val === null ? '' : val;
}

// Split an argument list into tokens:  .a "b c"  -> ['.a', 'b c']
// CRITICAL: paren-aware. `(eq .role "X")` stays ONE argument because we
// track depth: whitespace inside (...) does not split, and quotes inside
// (...) are kept literally instead of toggling quote state. Getting this
// wrong is the historical bug that made every `or` condition true — see
// REGRESSION GUARDS in the header.
function splitArgs(s) {
  const out = [];
  let cur = '',
    inQ = false,
    started = false,
    depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (depth > 0) {
          cur += ch;
        } else {
          inQ = false;
        }
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) {
        cur += ch;
        started = true;
      } else {
        inQ = true;
        started = true;
      }
      continue;
    }
    if (ch === '(') {
      depth++;
      cur += ch;
      started = true;
      continue;
    }
    if (ch === ')') {
      depth--;
      cur += ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (depth === 0) {
        if (started) {
          out.push(cur);
          cur = '';
          started = false;
        }
        continue;
      }
      cur += ch;
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

// Binary comparison operators usable in {{ if }} expressions.
// eq/ne use loose equality so `"5" eq 5` works with JSON data;
// lt/gt/le/ge coerce to Number.
function compare(op, a, b) {
  if (op === 'eq') return a == b;
  if (op === 'ne') return a != b;
  if (op === 'lt') return Number(a) < Number(b);
  if (op === 'gt') return Number(a) > Number(b);
  if (op === 'le') return Number(a) <= Number(b);
  if (op === 'ge') return Number(a) >= Number(b);
  return false;
}

function isVarPath(x) {
  return x.startsWith('.') || x.startsWith('$');
}
// An argument is either a variable path (resolve it) or a literal string.
function evalVal(x, scope, root) {
  return isVarPath(x) ? resolve(x, scope, root) : x;
}

// Evaluate one full condition expression, e.g:
//   eq .status "active"          not .featured
//   or (eq .role "VP") (eq .role "GS")
//   and .members (eq .group "primary")
function evalCond(expr, scope, root) {
  expr = expr.trim();
  if (expr.startsWith('not ')) return !evalCond(expr.slice(4).trim(), scope, root);
  if (expr.startsWith('or ')) {
    // every arg must be evaluated AS A CONDITION (condVal), not as a value
    return splitArgs(expr.slice(3).trim()).some((a) => condVal(a, scope, root));
  }
  if (expr.startsWith('and ')) {
    return splitArgs(expr.slice(4).trim()).every((a) => condVal(a, scope, root));
  }
  const cmp = expr.match(/^(eq|ne|lt|gt|le|ge)\s+(.+)$/);
  if (cmp) {
    const args = splitArgs(cmp[2]);
    return compare(cmp[1], evalVal(args[0], scope, root), evalVal(args[1], scope, root));
  }
  // bare path: truthy check on the resolved value
  return truthy(resolve(expr, scope, root));
}

// Evaluate ONE argument of or/and as a condition.
// Strips one layer of wrapping parens first, then: if it looks like a
// comparison/logical op route to evalCond, otherwise treat as a bare
// path and check truthiness. This routing is what keeps
// `or (eq .role "X") .flag` from mis-evaluating either side.
function condVal(a, scope, root) {
  let t = a.trim();
  if (t[0] === '(' && t[t.length - 1] === ')') t = t.slice(1, -1).trim();
  if (/^(eq|ne|lt|gt|le|ge|not|or|and)\b/.test(t)) return evalCond(t, scope, root);
  return truthy(evalVal(t, scope, root));
}

// Pass 1: turn template text into a flat token list.
// Text between {{ … }} markers becomes {t:'text'} tokens; the inner
// expression becomes a single {t:'x'} token. Block structure (each/if/
// else/end) is resolved later by findBlock, not here.
function tokenize(tpl) {
  const tokens = [];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0,
    m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) tokens.push({ t: 'text', v: tpl.slice(last, m.index) });
    tokens.push({ t: 'x', v: m[1].trim() });
    last = re.lastIndex;
  }
  if (last < tpl.length) tokens.push({ t: 'text', v: tpl.slice(last) });
  return tokens;
}

// Pass 2 helper: given the token index just after an `each`/`if` opener,
// walk forward and return the body tokens up to the MATCHING `end`
// (nesting-aware), plus any `else` body at depth 0.
//   { body: tokens[], elseBody: tokens[], next: indexAfterEnd }
function findBlock(tokens, start) {
  let depth = 0,
    endIdx = -1;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === 'x') {
      const e = t.v;
      if (e.startsWith('each ') || e.startsWith('if ')) depth++;
      else if (e === 'end') {
        if (depth === 0) {
          endIdx = i;
          break;
        }
        depth--;
      }
    }
  }
  if (endIdx === -1) return { body: [], elseBody: [], next: tokens.length };

  // second scan: locate an `else` that belongs to THIS block (depth 0)
  let elseIdx = -1,
    d2 = 0;
  for (let j = start; j < endIdx; j++) {
    const t = tokens[j];
    if (t.t === 'x') {
      const e = t.v;
      if (e.startsWith('each ') || e.startsWith('if ')) d2++;
      else if (e === 'end') d2--;
      else if (e.startsWith('else') && d2 === 0) {
        elseIdx = j;
        break;
      }
    }
  }
  const body = tokens.slice(start, elseIdx === -1 ? endIdx : elseIdx);
  const elseBody = elseIdx === -1 ? [] : tokens.slice(elseIdx + 1, endIdx);
  return { body, elseBody, next: endIdx + 1 };
}

// Pass 2: walk the token list and emit output. `scope` is the current
// each-item (or the page scope at top level); `root` always points at
// the page scope so `$.field` can escape a loop. Depth/guard counters
// throw on runaway recursion or infinite loops instead of hanging.
function renderTokens(tokens, scope, root, depth = 0) {
  let out = '';
  let i = 0;
  let guard = 0;
  if (depth > 60) throw new Error('template include depth exceeded');
  while (i < tokens.length) {
    if (++guard > 1000000) throw new Error('template iteration guard exceeded');
    const t = tokens[i];
    // plain text: pass through untouched
    if (t.t === 'text') {
      out += t.v;
      i++;
      continue;
    }
    const e = t.v;

    // {{ each .arr }}BODY{{ end }} — render BODY once per item with the
    // item as the new scope ("." inside the loop is the item).
    if (e.startsWith('each ')) {
      const arr = resolve(e.slice(5).trim(), scope, root);
      const block = findBlock(tokens, i + 1);
      if (Array.isArray(arr)) {
        for (const item of arr) out += renderTokens(block.body, item, root, depth + 1);
      }
      i = block.next;
      continue;
    }

    // {{ if COND }}A{{ else }}B{{ end }} — pick branch by condition
    if (e.startsWith('if ')) {
      const cond = evalCond(e.slice(3).trim(), scope, root);
      const block = findBlock(tokens, i + 1);
      out += renderTokens(cond ? block.body : block.elseBody, scope, root, depth + 1);
      i = block.next;
      continue;
    }

    // {{ include "partials/x.html" }} — splice another template in,
    // rendered with the CURRENT scope (partials see .page/.site/.nav…)
    if (e.startsWith('include ')) {
      let p = e
        .slice(8)
        .trim()
        .replace(/^"(.*)"$/, '$1');
      const inc = path.join(SRC, p);
      out += renderTokens(tokenize(read(inc)), scope, root, depth + 1);
      i++;
      continue;
    }

    // {{ helper path }} — one-arg output helpers (fmtDate, upper, …)
    const hm = e.match(/^([A-Za-z]+)\s+(.+)$/);
    if (hm && helpers[hm[1]]) {
      const arg = hm[2].trim();
      const val = resolve(arg, scope, root);
      out += String(
        helpers[hm[1]](val, scope, root) == null ? '' : helpers[hm[1]](val, scope, root),
      );
      i++;
      continue;
    }

    // fallback: {{ .some.path }} — raw variable output ('' when missing)
    out += String(resolve(e, scope, root) == null ? '' : resolve(e, scope, root));
    i++;
  }
  return out;
}

// Convenience wrapper used by buildPage/makeItem below.
function renderTemplate(tpl, scope, root) {
  return renderTokens(tokenize(tpl), scope, root);
}

/* ------------------------------------------------------------------ */
/* data loading + enrichment                                           */
/* ------------------------------------------------------------------ */
// Every content collection lives in src/data/*.json. Below, each is
// mapped once to add DERIVED fields the templates rely on:
//   code      — display index like "PROJ.01" / "EVENT.03"
//   url       — canonical directory-style link ("/projects/<slug>/")
//   thumb/src — generated SVG artwork path (see SVG section)
// plus per-type extras (status booleans, formatted dates, reading time).

const site = readJSON(path.join(SRC, 'data', 'site.json')); // global identity: name, socials, facts…
const navDef = readJSON(path.join(SRC, 'data', 'nav.json')); // nav items + active-match rules
let projects = readJSON(path.join(SRC, 'data', 'projects.json'));
let achievements = readJSON(path.join(SRC, 'data', 'achievements.json'));
let resources = readJSON(path.join(SRC, 'data', 'resources.json'));
let team = readJSON(path.join(SRC, 'data', 'team.json'));
let gallery = readJSON(path.join(SRC, 'data', 'gallery.json'));

// Resource filter chips (resources page "Browse" section). Order here
// is the order the buttons render in.
const CATEGORIES = [
  'Programming',
  'Linux',
  'Systems',
  'Web',
  'AI / ML',
  'Security',
  'Algorithms',
  'Electronics',
  'Open Source',
  'Dev Tools',
];

projects = projects.map((p, i) => ({
  ...p,
  code: `PROJ.${String(i + 1).padStart(2, '0')}`,
  url: `/projects/${p.slug}/`,
  stackList: p.stack ? p.stack.join(' · ') : '',
  teamList: p.team ? p.team.map((m) => m.name).join(', ') : '',
  thumb: p.thumb || `/img/gen/${p.slug}.svg`, // falls back to generated art
  approach: (p.approach || []).map((a, j) => ({ ...a, n: String(j + 1).padStart(2, '0') })),
}));

/* ------------------------------------------------------------------ */
/* markdown pipeline (blog + events share this setup)                  */
/* ------------------------------------------------------------------ */

// escape raw text going inside <code> in fenced blocks
function escHtml(x) {
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// marked configured once. gfm gives tables/strikethrough/task lists;
// breaks:false keeps standard CommonMark line semantics. The code
// renderer routes fences to the site's pre.code style (terminal look,
// 07-components.css) instead of a bare <pre>.
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(token) {
      return `<pre class="code"><code>${escHtml(token.text)}</code></pre>`;
    },
  },
});

// parse one .md file → { frontmatter fields, body(md), html }
function loadMarkdownPost(file) {
  const raw = read(file);
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)} has no ---frontmatter--- block`);
  let fm;
  try {
    fm = yaml.load(m[1]);
  } catch (e) {
    throw new Error(`${path.basename(file)} has invalid frontmatter YAML: ${e.message}`);
  }
  return { fm, body: m[2] };
}

/* ------------------------------------------------------------------ */
/* markdown events (content/events/*.md)                               */
/* ------------------------------------------------------------------ */
// Same authoring model as the blog: one file per event, filename IS
// the slug (/events/<slug>/). Frontmatter carries the STRUCTURED data
// the deck/timeline render as components; the optional markdown BODY
// is the long-form writeup shown on the event page (falls back to the
// short `description` when absent).
//
//   ---
//   title: "Linux Fundamentals Workshop"  (required)
//   date: "2026-09-18"                    (required)
//   status: "upcoming" | "ongoing" | "past"   (required — drives badges)
//   subtitle: "…"                         (deck/archive card text)
//   description: "…"                      (short brief + body fallback)
//   location / duration / level           (meta row on the event page)
//   speaker: { name, role }
//   program: [{ time, title }]            (timeline rows)
//   resources: [track names]
//   register: "how to join"
//   draft: true                           (skipped entirely)
//   ---
//
// Sorted date-desc (tie: slug asc) — EVENT.xx codes are assigned AFTER
// sorting, so EVENT.01 is the most recent event. The build wipes
// public/ wholesale, so deleting a .md removes its page next run.

const EVENTS_DIR = path.join(ROOT, 'content', 'events');

function loadEvents() {
  if (!fs.existsSync(EVENTS_DIR)) return [];
  const files = fs
    .readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();

  const evs = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`event filename "${f}" must be lowercase-hyphenated (it becomes the URL)`);
    }
    const { fm, body } = loadMarkdownPost(path.join(EVENTS_DIR, f));
    if (fm.draft) continue;

    for (const key of ['title', 'date', 'status']) {
      if (!fm[key]) throw new Error(`event "${f}" is missing required frontmatter "${key}"`);
    }
    if (!parseISO(fm.date)) throw new Error(`event "${f}" has an unparsable date ("${fm.date}")`);
    if (!['upcoming', 'ongoing', 'past'].includes(fm.status)) {
      throw new Error(`event "${f}" status must be upcoming|ongoing|past (got "${fm.status}")`);
    }

    evs.push({
      ...fm,
      slug,
      url: `/events/${slug}/`,
      contentHtml: body.trim() ? marked.parse(body) : '',
    });
  }

  // newest first; display codes assigned AFTER sorting (01 = newest)
  evs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  const mapped = evs.map((ev, i) => ({
    ...ev,
    code: `EVENT.${String(i + 1).padStart(2, '0')}`,
    past: ev.status === 'past',
    ongoing: ev.status === 'ongoing',
    upcoming: ev.status === 'upcoming', // booleans drive status badges
    dateFmt: helpers.fmtDate(ev.date),
  }));

  // Flag the FIRST upcoming event so the collapsing deck on the events
  // page can ship with data-active="true" pre-rendered (no-JS default).
  const firstUpcoming = mapped.find((ev) => ev.upcoming);
  if (firstUpcoming) firstUpcoming.first = true;
  return mapped;
}

const events = loadEvents();

achievements = achievements.map((a, i) => ({
  ...a,
  code: `MIL.${String(i + 1).padStart(2, '0')}`,
}));

/* ------------------------------------------------------------------ */
/* markdown blog (content/blog/*.md)                                   */
/* ------------------------------------------------------------------ */
// The Tech Journal's single source of truth is one Markdown file per
// post in content/blog/. YAML frontmatter carries the metadata:
//
//   ---
//   title: "Post title"        (required)
//   date: "2026-08-24"         (required — drives sorting, newest first)
//   description: "…"           (card + article subtitle; recommended)
//   author: "Name"             (default "DCITC")
//   role: "Study group lead"   (byline detail; default "Contributor")
//   category: "Systems"        (chip; defaults to first tag)
//   tags: [a, b]               (end-of-article chips)
//   featured: true             (home teaser + blog Featured section)
//   image: /img/blog/x.png     (cover; falls back to generated plate)
//   draft: true                (skipped entirely — never published)
//   ---
//
// The filename (minus .md) IS the slug → /blog/<slug>/. Drafts are
// dropped before anything downstream runs; the build wipes public/
// wholesale at start, so deleting a .md removes its page next build.

const BLOG_DIR = path.join(ROOT, 'content', 'blog');

function loadBlogPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();

  const posts = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`blog filename "${f}" must be lowercase-hyphenated (it becomes the URL)`);
    }
    const { fm, body } = loadMarkdownPost(path.join(BLOG_DIR, f));
    if (fm.draft) continue; // drafts never reach any output

    // required fields — fail the build loudly rather than shipping junk
    for (const key of ['title', 'date']) {
      if (!fm[key]) throw new Error(`blog post "${f}" is missing required frontmatter "${key}"`);
    }
    if (!parseISO(fm.date)) throw new Error(`blog post "${f}" has an unparsable date ("${fm.date}")`);

    // reading time ≈ word count of the markdown source / 200 wpm
    const words = body.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;

    posts.push({
      ...fm,
      slug,
      url: `/blog/${slug}/`,
      subtitle: fm.description || '', // cards print .subtitle
      category: fm.category || (Array.isArray(fm.tags) && fm.tags[0]) || 'Journal',
      author: fm.author || 'DCITC',
      role: fm.role || 'Contributor',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      cover: fm.image || `/img/gen/${slug}.svg`, // custom image or generated plate
      readingTime: helpers.readingTime(words),
      dateFmt: helpers.fmtDate(fm.date),
      contentHtml: marked.parse(body),
    });
  }

  // newest first (ties broken alphabetically by slug for determinism);
  // display codes are assigned AFTER sorting so ART.01 is the newest
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return posts.map((p, i) => ({ ...p, code: `ART.${String(i + 1).padStart(2, '0')}` }));
}

const posts = loadBlogPosts();

resources = resources.map((r, i) => ({
  ...r,
  code: `RES.${String(i + 1).padStart(2, '0')}`,
}));

team = team.map((g, i) => ({
  ...g,
  code: `TEAM.${String(i + 1).padStart(2, '0')}`,
}));

gallery = gallery.map((g, i) => ({
  ...g,
  code: `GAL.${String(i + 1).padStart(2, '0')}`,
  src: `/img/gen/${g.seed}.svg`, // generated photo-plate
}));

// Pre-computed subsets & counts consumed by page templates:
const upcomingEvents = events.filter((e) => e.upcoming); // home + events page
const pastEvents = events.filter((e) => e.past || e.ongoing); // events page archive/series
const featuredProjects = projects.filter((p) => p.featured).slice(0, 3); // home + projects-page deck cards
if (featuredProjects[0]) featuredProjects[0].first = true; // ships data-active pre-rendered
const featuredPosts = posts.filter((p) => p.featured).slice(0, 3); // home + blog
const resourceCats = CATEGORIES; // filter buttons
const featuredResources = resources.filter((r) => r.featured).slice(0, 4); // home picks
const activeProjectsCount = projects.filter((p) => p.status === 'active').length; // projects intro

/* FUNKYSTUFF — self-contained web toys/games library -----------------
   <root>/funkystuff/ holds standalone .html files (games, demos, toys).
   src/data/funkystuff.json is the listing manifest: one entry per file
   you want on /funkystuff/, with the display fields YOU assign —
   `file` (required, must exist in the folder), `title`, `dept`
   (drives the filter chips) and optional `by` (author byline). List
   order in the JSON = row order on the page. The build still scans
   the folder itself so every .html gets copied verbatim to
   public/funkystuff/<file> (opened from a list row in a new tab) and
   URL-unsafe filenames fail loudly. A scanned file with no manifest
   entry is copied but not listed (warned); a manifest entry whose
   file is missing is a hard error. Unique dept values (JSON order)
   ship as `funkyDepts` for the doc-style filter bar. */
const FUNKY_DIR = path.join(ROOT, 'funkystuff');
const funkyFiles = fs.existsSync(FUNKY_DIR)
  ? fs
      .readdirSync(FUNKY_DIR)
      .filter((f) => /\.html?$/i.test(f))
      .sort((a, b) => a.localeCompare(b))
  : [];
for (const f of funkyFiles) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(f)) {
    throw new Error(`funkystuff: URL-unsafe filename "${f}" (letters/digits/dash/underscore/dot only)`);
  }
}
const funkyMeta = fs.existsSync(path.join(SRC, 'data', 'funkystuff.json'))
  ? JSON.parse(read(path.join(SRC, 'data', 'funkystuff.json')))
  : [];
const funky = funkyMeta.map((m, i) => {
  if (!m.file || !funkyFiles.includes(m.file)) {
    throw new Error(`funkystuff: manifest entry ${i + 1} references "${m.file}" but no such file exists in funkystuff/`);
  }
  if (!String(m.title || '').trim() || !String(m.dept || '').trim()) {
    throw new Error(`funkystuff: "${m.file}" needs non-empty "title" and "dept" in src/data/funkystuff.json`);
  }
  return {
    n: String(i + 1).padStart(2, '0'), // row index for the divided list
    file: m.file,
    url: `/funkystuff/${m.file}`,
    title: m.title,
    dept: m.dept,
    by: m.by || '',
  };
});
const funkyDepts = [...new Set(funky.map((f) => f.dept))];
for (const f of funkyFiles) {
  if (!funky.some((x) => x.file === f)) {
    console.warn(`funkystuff: "${f}" is not listed in src/data/funkystuff.json — copied but not carded`);
  }
}

/* ------------------------------------------------------------------ */
/* SVG asset generation                                                */
/* ------------------------------------------------------------------ */
// The site ships zero binary images. All "photos", covers and avatars
// are deterministic technical-looking SVG plates generated here from a
// seed string. Same seed → same image on every build/machine.

// XML-escape text going into SVG <text> nodes.
function esc(x) {
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Shared palette for every generated plate (matches the dark theme).
const PLATE_COLORS = {
  bg: '#0d1117',
  line: '#d7dce3',
  faint: '#2c3540',
  faint2: '#3a4655',
  accent: '#4fd1a5',
  accent2: '#e0b26a',
  blue: '#7ba4d9',
};

// genPlate(seed, variant) → 1200×800 SVG "photo" for gallery/projects/posts.
// Variant picks the drawing style; the seed drives all randomness so the
// output is stable. Variants are assigned per-seed in main() below.
function genPlate(seed, variant) {
  const rnd = mulberry32(hashStr(seed));
  const W = 1200,
    H = 800;
  const C = PLATE_COLORS;
  const el = [];
  const rect = (x, y, w, h, fill, stroke, sw) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
  const line = (x1, y1, x2, y2, stroke, sw) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
  const circle = (cx, cy, r, fill, stroke, sw) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${sw || 1}"/>`;
  const text = (x, y, s, size, fill, anchor, ff) =>
    `<text x="${x}" y="${y}" font-family="${ff || 'monospace'}" font-size="${size}" fill="${fill}" text-anchor="${anchor || 'start'}" letter-spacing="1">${esc(s)}</text>`;

  const baseGrid = () => {
    let g = '';
    for (let x = 0; x <= W; x += 80) g += line(x, 0, x, H, C.faint, 0.5);
    for (let y = 0; y <= H; y += 80) g += line(0, y, W, y, C.faint, 0.5);
    return g;
  };

  if (variant === 'grid') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const y = 200 + rnd() * 300;
    el.push(line(80, y, W - 80, y, C.line, 2));
    el.push(circle(80, y, 6, C.accent, 'none'));
    el.push(circle(W - 200, y, 6, C.line, 'none'));
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const x = 80 + (i / steps) * (W - 280);
      const hh = 40 + rnd() * 160 * (i % 2 ? 1 : 0.4);
      el.push(line(x, y, x, y - hh, C.faint2, 1));
      el.push(line(x, y - hh, x + 30, y - hh, C.faint2, 1));
      el.push(text(x + 36, y - hh + 4, `t+${i}`, 14, C.faint2));
    }
    el.push(text(80, 60, 'FIELD PLOT // 001', 15, C.faint2));
    el.push(
      text(
        W - 80,
        H - 40,
        `x=${String(rnd()).slice(2, 5)} y=${String(rnd()).slice(2, 5)}`,
        14,
        C.faint2,
        'end',
      ),
    );
  } else if (variant === 'rings') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const cx = W / 2 + (rnd() - 0.5) * 200,
      cy = H / 2 + (rnd() - 0.5) * 100;
    const rings = [60, 120, 200, 300];
    rings.forEach((r, i) => {
      el.push(circle(cx, cy, r, 'none', i === 0 ? C.accent : C.faint2, i === 0 ? 2 : 1));
      el.push(circle(cx, cy, r, 'none', 'none', 1));
    });
    el.push(line(cx - 340, cy, cx + 340, cy, C.faint, 0.5));
    el.push(line(cx, cy - 340, cx, cy + 340, C.faint, 0.5));
    el.push(circle(cx, cy, 5, C.accent, 'none'));
    const ang = rnd() * Math.PI * 2;
    const px = cx + Math.cos(ang) * 300,
      py = cy + Math.sin(ang) * 300;
    el.push(line(cx, cy, px, py, C.accent, 1.5));
    el.push(circle(px, py, 5, C.line, 'none'));
    el.push(text(cx + 320, cy - 12, 'φ 0.62 rad', 14, C.faint2, 'end'));
    el.push(text(80, 60, 'VECTOR FIELD // 002', 15, C.faint2));
  } else if (variant === 'bars') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const n = 24;
    const bw = (W - 160) / n;
    const baseline = H - 140;
    let bars = '';
    for (let i = 0; i < n; i++) {
      const hh = 30 + rnd() * (H - 260);
      const c = i % 5 === 0 ? C.accent : i % 7 === 0 ? C.accent2 : C.faint2;
      bars += rect(
        80 + i * bw + 3,
        baseline - hh,
        bw - 6,
        hh,
        c === C.faint2 ? '#141a22' : 'none',
        c,
        1.5,
      );
    }
    el.push(bars);
    el.push(line(80, baseline, W - 80, baseline, C.line, 1.5));
    el.push(text(80, 60, 'SPECTRUM // 003', 15, C.faint2));
    el.push(text(W - 80, H - 40, 'sample/48kHz', 14, C.faint2, 'end'));
  } else if (variant === 'lines') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const ys = [];
    for (let i = 0; i < 8; i++) ys.push(120 + i * 80 + rnd() * 20);
    ys.forEach((y, i) => {
      el.push(line(80, y, W - 80, y, i === 3 ? C.accent : C.faint2, i === 3 ? 2 : 1));
      el.push(text(84, y - 6, `${String(i + 1).padStart(2, '0')}.0`, 13, C.faint2));
      el.push(circle(W - 80, y, 4, i === 3 ? C.accent : C.line, 'none'));
    });
    el.push(text(80, 60, 'TRACE MATRIX // 004', 15, C.faint2));
    el.push(text(W - 80, H - 40, 'ls -l /dev/tty*', 14, C.faint2, 'end'));
  } else if (variant === 'dots') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const nodes = [];
    for (let i = 0; i < 9; i++) {
      nodes.push({ x: 120 + rnd() * (W - 240), y: 120 + rnd() * (H - 240), r: 5 + rnd() * 6 });
    }
    const edges = [
      [0, 1],
      [1, 2],
      [1, 4],
      [2, 5],
      [3, 4],
      [4, 5],
      [5, 8],
      [6, 7],
      [7, 4],
    ];
    edges.forEach(([a, b]) => {
      el.push(line(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, C.faint2, 1));
    });
    nodes.forEach((n, i) => {
      el.push(
        circle(n.x, n.y, n.r, i === 4 ? C.accent : '#141a22', i === 4 ? C.accent : C.faint2, 1.5),
      );
    });
    el.push(text(nodes[4].x + 14, nodes[4].y - 10, 'core', 14, C.accent));
    el.push(text(80, 60, 'NODE GRAPH // 005', 15, C.faint2));
  } else if (variant === 'circuit') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const seg = (x1, y1, x2, y2) => {
      const mx = x1 + (x2 - x1) / 2;
      return (
        line(x1, y1, mx, y1, C.faint2, 1.5) +
        line(mx, y1, mx, y2, C.faint2, 1.5) +
        line(mx, y2, x2, y2, C.faint2, 1.5)
      );
    };
    el.push(seg(120, 600, 360, 200));
    el.push(seg(360, 200, 640, 520));
    el.push(seg(640, 520, 900, 220));
    el.push(seg(900, 220, 1080, 560));
    el.push(circle(120, 600, 7, C.accent, 'none'));
    el.push(circle(360, 200, 7, C.line, 'none'));
    el.push(circle(640, 520, 7, C.accent2, 'none'));
    el.push(circle(900, 220, 7, C.line, 'none'));
    el.push(circle(1080, 560, 7, C.accent, 'none'));
    const traces = '';
    el.push(traces);
    el.push(text(80, 60, 'PCB TRACE // 006', 15, C.faint2));
    el.push(text(1120, 600, 'GND', 13, C.faint2, 'end'));
  } else {
    // plot (default variant — growth curve with area fill)
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const x = 120 + (i / 20) * (W - 200);
      const y = H - 120 - (50 + rnd() * (H - 300)) * (i / 20 + 0.3);
      pts.push([x, y]);
    }
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      const my = (pts[i - 1][1] + pts[i][1]) / 2;
      d += ` C ${mx} ${pts[i - 1][1]}, ${mx} ${pts[i][1]}, ${pts[i][0]} ${pts[i][1]}`;
    }
    el.push(`<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="2"/>`);
    const area = `${d} L ${pts[pts.length - 1][0]} ${H - 120} L ${pts[0][0]} ${H - 120} Z`;
    el.push(`<path d="${area}" fill="${C.accent}" opacity="0.08"/>`);
    pts.forEach((p, i) => {
      if (i % 3 === 0) el.push(circle(p[0], p[1], 3, '#141a22', C.line, 1));
    });
    el.push(line(120, H - 120, W - 80, H - 120, C.line, 1.5));
    el.push(line(120, 60, 120, H - 120, C.line, 1.5));
    el.push(text(80, 60, 'GROWTH CURVE // 007', 15, C.faint2));
    el.push(text(W - 80, H - 90, 't →', 14, C.faint2, 'end'));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(seed)}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${el.join('\n')}
  </svg>`;
}

// genAvatar(seed, name) → 480×480 initials avatar for team members.
// Tinted background + big initials + "ID:" strip. Used by team.html and
// the about-page carousel via /img/gen/av-<seed>.svg.
function genAvatar(seed, name) {
  const rnd = mulberry32(hashStr(seed));
  const tints = ['#17332b', '#2b2a1c', '#1f2a3a'];
  const bg = tints[Math.floor(rnd() * tints.length)];
  const initials = String(name || 'DC')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const W = 480,
    H = 480;
  const C = PLATE_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <g opacity="0.35">
    <path d="M0 ${H / 2} H${W}" stroke="${C.line}" stroke-width="1"/>
    <path d="M${W / 2} 0 V${H}" stroke="${C.line}" stroke-width="1"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="150" fill="none" stroke="${C.accent}" stroke-width="1" opacity="0.5"/>
  </g>
  <text x="${W / 2}" y="${H / 2 + 8}" text-anchor="middle" font-family="sans-serif" font-size="150" font-weight="600" fill="${C.line}" letter-spacing="4">${esc(initials)}</text>
  <text x="26" y="${H - 22}" font-family="monospace" font-size="15" fill="${C.faint2}">ID: ${esc(seed.slice(0, 6))}</text>
  </svg>`;
}

// genLogo() → 96×96 node-graph monogram. Rendered twice: as the nav
// brand mark (/img/logo.svg, uses currentColor so it themes) and as
// /img/favicon.svg.
function genLogo() {
  const C = PLATE_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect x="4" y="4" width="88" height="88" rx="18" fill="none" stroke="currentColor" stroke-width="3"/>
  <path d="M 14 66 L 34 30" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M 34 30 L 62 58" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M 62 58 L 82 22" stroke="currentColor" stroke-width="3" fill="none"/>
  <circle cx="34" cy="30" r="7" fill="currentColor"/>
  <circle cx="14" cy="66" r="5" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="62" cy="58" r="7" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="82" cy="22" r="6" fill="${C.accent}"/>
  <text x="48" y="88" text-anchor="middle" font-family="monospace" font-size="9" fill="currentColor" opacity="0.55" letter-spacing="1">CURATE · BUILD · UNDERSTAND</text>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* CSS / JS concat                                                     */
/* ------------------------------------------------------------------ */
// Bundling is plain concatenation — ORDER IS SIGNIFICANCE:
//   CSS: tokens → reset → type → layout → nav → horizontal →
//        components → pages → animation (later files may override
//        earlier ones; 08-pages.css tunes what earlier files set).
//   JS:  theme → horizontal → reveal → transitions → pages →
//        fluid-triangle → main.
//        Each file registers itself on window.DCITC.*; main.js (last)
//        calls every .init() in that same order.
const CSS_FILES = [
  '01-vars.css',
  '02-reset.css',
  '03-type.css',
  '04-layout.css',
  '05-nav.css',
  '06-horizontal.css',
  '07-components.css',
  '08-pages.css',
  '09-anim.css',
];

const JS_FILES = [
  'theme.js',
  'horizontal.js',
  'reveal.js',
  'transitions.js',
  'pages.js',
  'fluid-triangle.js',
  'main.js',
];

function concat(dir, files) {
  return files.map((f) => read(path.join(dir, f))).join('\n');
}

/* ------------------------------------------------------------------ */
/* page assembly                                                       */
/* ------------------------------------------------------------------ */

const NAV = navDef.items;

// navFor(page) → nav items with `isActive` computed for THIS page.
// Match rules come from nav.json: "/" exact, "/foo*" prefix, otherwise
// exact-or-subpage ("/events" matches "/events/<slug>/"). The header
// partial uses .isActive to set the accent + aria-current.
function navFor(page) {
  return NAV.map((item) => {
    let active = false;
    if (item.match === '/') active = page.url === '/';
    else if (item.match.endsWith('*')) active = page.url.startsWith(item.match.slice(0, -1));
    else active = page.url === item.match || page.url.startsWith(item.match + '/');
    return { ...item, isActive: active };
  });
}

// Render one top-level page template and write it to public/.
// The scope exposed to templates: site, page, nav, all collections,
// featured subsets, counts. `root` == scope so $.field works anywhere.
function buildPage(page) {
  const scope = {
    site,
    page,
    nav: navFor(page),
    projects,
    events,
    upcomingEvents,
    pastEvents,
    featuredProjects,
    featuredPosts,
    featuredResources,
    achievements,
    resources,
    resourceCats,
    posts,
    team,
    gallery,
    funky,
    funkyDepts,
    CATEGORIES,
    activeProjectsCount,
  };
  const tpl = read(path.join(SRC, 'pages', page.template || page.file));
  const html = renderTemplate(tpl, scope, scope);
  write(path.join(OUT, page.out), html);
  console.log(`  ✓ ${page.out}`);
}

/* ------------------------------------------------------------------ */
/* main — build entry point                                            */
/* ------------------------------------------------------------------ */
// Pipeline order: wipe public/ → generate SVG assets → write CSS/JS
// bundles → render top-level pages → render per-item pages → extras.

function main() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });

  console.log('DCITC site builder');

  // 1. generated SVG assets -----------------------------------------
  // One plate per unique seed (gallery seeds + project/post slugs);
  // variant chosen by hash so the mix of styles is stable per seed.
  console.log('assets');
  const genDir = path.join(OUT, 'img', 'gen');
  fs.mkdirSync(genDir, { recursive: true });
  const variants = ['grid', 'rings', 'bars', 'lines', 'dots', 'circuit', 'plot'];
  const seeds = new Set();
  gallery.forEach((g) => seeds.add(g.seed));
  projects.forEach((p) => seeds.add(p.slug));
  posts.forEach((p) => seeds.add(p.slug));
  seeds.forEach((s, i) => {
    const v = variants[hashStr(s) % variants.length];
    write(path.join(genDir, `${s}.svg`), genPlate(s, v));
  });
  write(path.join(OUT, 'img', 'logo.svg'), genLogo());
  write(path.join(OUT, 'img', 'favicon.svg'), genLogo().replace('<svg ', '<svg role="img" '));
  team.forEach((g) =>
    g.members.forEach((m) => {
      write(path.join(genDir, `av-${m.seed}.svg`), genAvatar(m.seed, m.name));
    }),
  );

  // 2. CSS / JS bundles (see CSS_FILES/JS_FILES for order rules) ----
  console.log('bundles');
  write(path.join(OUT, 'css', 'main.css'), concat(path.join(STATIC, 'css'), CSS_FILES));
  write(path.join(OUT, 'js', 'app.js'), concat(path.join(STATIC, 'js'), JS_FILES));
  // vendored lib (anime.min.js, used by reveal.js) is copied verbatim —
  // never concatenated, it loads as-is before the bundle.
  fs.cpSync(path.join(STATIC, 'js', 'vendor'), path.join(OUT, 'js', 'vendor'), { recursive: true });

  // 2b. funkystuff library files -------------------------------------
  // copied verbatim so /funkystuff/<file> URLs work; the launcher page
  // (/funkystuff/) opens each one in a new tab.
  console.log('funkystuff');
  fs.mkdirSync(path.join(OUT, 'funkystuff'), { recursive: true });
  for (const it of funky) {
    write(path.join(OUT, 'funkystuff', it.file), read(path.join(FUNKY_DIR, it.file)));
  }

  // 3. top-level pages from src/data/pages.json ---------------------
  // Each def maps a template file → output path + metadata (title,
  // desc, url) that head.html and navFor() consume.
  console.log('pages');
  const pageDefs = JSON.parse(read(path.join(SRC, 'data', 'pages.json')));
  for (const p of pageDefs) {
    buildPage({ ...p, url: p.url || `/${p.out}` });
  }

  // 4. per-item pages (project/event/article singles) ---------------
  // makeItem renders one template once per collection item. It injects
  // `item` plus prev/next neighbours (wrap-around) for the pager, and
  // synthesizes a `page` object so head/nav/footer behave like any
  // other page. Output is directory-style: <type>/<slug>/index.html.
  console.log('item pages');
  const makeItem = (template, outFn, coll, getCtx) => {
    for (const item of coll) {
      const idx = coll.indexOf(item);
      const prev = coll[(idx - 1 + coll.length) % coll.length];
      const next = coll[(idx + 1) % coll.length];
      const scope = {
        site,
        item,
        prev,
        next,
        page: {
          code: item.code,
          section: item.section || 'item',
          horizontal: item.horizontal !== false,
          isSingle: true,
          title: item.title,
          desc: item.summary || item.subtitle || '',
          path: item.url,
        },
        nav: navFor({ url: item.url }),
        projects,
        events,
        upcomingEvents,
        pastEvents,
        featuredProjects,
        featuredPosts,
        featuredResources,
        achievements,
        resources,
        resourceCats,
        posts,
        team,
        gallery,
        funky,
        funkyDepts,
        CATEGORIES,
        activeProjectsCount,
      };
      write(
        path.join(OUT, outFn(item)),
        renderTemplate(read(path.join(SRC, 'pages', template)), scope, scope),
      );
      console.log(`  ✓ ${outFn(item)}`);
    }
  };
  makeItem(
    'project.html',
    (p) => `projects/${p.slug}/index.html`,
    projects,
    (p) => p,
  );
  makeItem(
    'event.html',
    (e) => `events/${e.slug}/index.html`,
    events,
    (e) => e,
  );
  makeItem(
    'article.html',
    (p) => `blog/${p.slug}/index.html`,
    posts,
    (p) => p,
  );

  // 5. site extras ---------------------------------------------------
  write(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');

  console.log(`done in ${Date.now() - t0}ms → public/`);
}

main();
